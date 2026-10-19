import { PrismaClient } from '@prisma/client'
import { hasContent, isEnglish } from '../src/lib/language'

const prisma = new PrismaClient()

async function main() {
  let cursor: string | undefined
  let checked = 0
  let hidden = 0

  for (;;) {
    const rows = await prisma.externalJob.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, title: true, summary: true, url: true },
    })
    if (rows.length === 0) break

    const bad = rows
      .filter(
        (r) =>
          !/^https?:\/\//i.test(r.url) ||
          !hasContent(r.summary) ||
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

  console.log(`Checked ${checked} jobs, hid ${hidden}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())