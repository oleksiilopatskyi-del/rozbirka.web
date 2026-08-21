import { accountPathForPlan, readPlanCode } from '@/lib/plan-selection'

const SAFE_PATHS = [
  /^\/account(?:[/?#]|$)/,
  /^\/invite\/[A-Za-z0-9_-]{4,128}(?:[?#]|$)/,
  /^\/scan\/[A-Za-z0-9._~-]{1,256}(?:[?#]|$)/,
  /^\/app\/[A-Za-z0-9_-]+(?:[/?#]|$)/,
]

const hasUnsafeCharacters = (value: string): boolean => {
  try {
    const decoded = decodeURIComponent(value)
    return Array.from(decoded).some((character) => {
      const codePoint = character.codePointAt(0)
      return (
        codePoint !== undefined &&
        (codePoint <= 0x1f || codePoint === 0x7f || character === '\\')
      )
    })
  } catch {
    return true
  }
}

export function isSafeCabinetPath(value: string): boolean {
  return (
    !hasUnsafeCharacters(value) && SAFE_PATHS.some((path) => path.test(value))
  )
}

export function resolvePostLoginDestination(
  search: string,
  fallback: string,
): string {
  const params = new URLSearchParams(search)
  const invite = params.get('invite')
  if (invite) {
    const destination = `/invite/${encodeURIComponent(invite)}`
    if (isSafeCabinetPath(destination)) return destination
  }

  const scan = params.get('scan')
  if (scan) {
    const destination = `/scan/${encodeURIComponent(scan)}`
    if (isSafeCabinetPath(destination)) return destination
  }

  const planCode = readPlanCode(search)
  if (planCode) return accountPathForPlan(planCode)

  return isSafeCabinetPath(fallback) ? fallback : '/account'
}
