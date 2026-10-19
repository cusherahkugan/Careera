import { PrismaClient } from '@prisma/client'
import { hasContent, isEnglish } from '../src/lib/language'
import { isITCategory } from '../src/lib/it-filter'

const prisma = new PrismaClient()

async function main() {
  // 1) everything that is not from JSearch
  const notJsearch = await prisma.externalJob.updateMany({
    where: { isActive: true, source: { not: 'JSearch' } },
    data: { isActive: false },
  })

  // 2) JSearch rows that are not IT / not English / unreadable
  let cursor: string | undefined
  let checked = 0
  let hidden = notJsearch.count

  for (;;) {
    const rows = await prisma.externalJob.findMany({
      where: { isActive: true, source: 'JSearch' },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, title: true, summary: true, url: true, roleCategory: true },
    })
    if (rows.length === 0) break

    const bad = rows
      .filter(
        (r) =>
          !/^https?:\/\//i.test(r.url) ||
          !hasContent(r.summary) ||
          !isITCategory(r.roleCategory) ||
          !isEnglish(`${r.title}. ${r.summary ?? ''}`)
      )
      .map((r) => r.id)

    if (bad.length) {
      await prisma.externalJob.updateMany({ where: { id: { in: bad } }, data: { isActive: false } })
    }
    checked += rows.length
    hidden += bad.length
    cursor = rows[rows.length - 1].id
  }

  console.log(`Checked ${checked} JSearch jobs, hid ${hidden} jobs in total.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())