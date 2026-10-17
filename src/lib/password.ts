// Password strength rules. Shared by the browser (live checklist) and the
// server (zod validation), so both always agree.

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72 // bcrypt only uses the first 72 bytes

export interface PasswordRule {
  id: string
  /** short label for the checklist */
  label: string
  /** message shown when the rule fails */
  message: string
  test: (pw: string) => boolean
}

// compared after lower-casing and stripping symbols, so "Password@123" is caught too
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd',
  '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop', 'qwerty12345',
  'letmein123', 'welcome1', 'welcome123', 'admin123', 'administrator', 'iloveyou1',
  'abc12345', 'abcd1234', 'monkey123', 'dragon123', 'football1', 'baseball1',
  'sunshine1', 'princess1', 'changeme', 'changeme123', 'careera123', 'careera',
])

const isCommon = (pw: string) => COMMON.has(pw.toLowerCase().replace(/[^a-z0-9]/g, ''))

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN} characters`,
    message: `Password must be at least ${PASSWORD_MIN} characters`,
    test: (pw) => pw.length >= PASSWORD_MIN,
  },
  {
    id: 'max',
    label: `No more than ${PASSWORD_MAX} characters`,
    message: `Password must be ${PASSWORD_MAX} characters or fewer`,
    test: (pw) => pw.length <= PASSWORD_MAX,
  },
  {
    id: 'upper',
    label: 'One uppercase letter (A-Z)',
    message: 'Password must include an uppercase letter',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'lower',
    label: 'One lowercase letter (a-z)',
    message: 'Password must include a lowercase letter',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'number',
    label: 'One number (0-9)',
    message: 'Password must include a number',
    test: (pw) => /\d/.test(pw),
  },
  {
    id: 'special',
    label: 'One special character (e.g. ! @ # $ %)',
    message: 'Password must include a special character such as ! @ # $ %',
    test: (pw) => /[^A-Za-z0-9\s]/.test(pw),
  },
  {
    id: 'spaces',
    label: 'No spaces',
    message: 'Password cannot contain spaces',
    test: (pw) => !/\s/.test(pw),
  },
  {
    id: 'repeat',
    label: 'No 3+ identical characters in a row',
    message: 'Password cannot repeat the same character 3 or more times in a row',
    test: (pw) => !/(.)\1\1/.test(pw),
  },
  {
    id: 'common',
    label: 'Not a common password',
    message: 'That password is too common. Choose something harder to guess',
    test: (pw) => !isCommon(pw),
  },
]

/** Messages for every rule the password breaks (empty array = strong enough). */
export function passwordErrors(pw: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.message)
}

export const isStrongPassword = (pw: string) => passwordErrors(pw).length === 0