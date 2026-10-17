'use client'

import { PASSWORD_RULES } from '@/lib/password'

/** Live checklist: each rule turns green as the password satisfies it. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        // before typing anything, show every rule as neutral (not failed)
        const untouched = password.length === 0
        return (
          <li
            key={rule.id}
            className={ok && !untouched ? 'text-green-700' : 'text-zinc-500'}
          >
            <span aria-hidden className="mr-1.5 inline-block w-3">
              {ok && !untouched ? '✓' : '○'}
            </span>
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}