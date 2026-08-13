import { describe, expect, it } from 'vitest'
import { isSafeCabinetPath, resolvePostLoginDestination } from './post-login'

describe('safe post-login destinations', () => {
  it.each([
    'https://evil.example/x',
    '//evil.example/x',
    '/\\evil',
    '/%0aevil',
    '/privacy',
    '/unknown',
  ])('rejects %s', (value) => expect(isSafeCabinetPath(value)).toBe(false))

  it.each([
    '/account',
    '/account?section=plans&plan=pro_monthly',
    '/invite/ABCD1234',
    '/scan/QR-123',
  ])('accepts %s', (value) => expect(isSafeCabinetPath(value)).toBe(true))

  it('prefers invite, then scan, then plan, then fallback', () => {
    expect(
      resolvePostLoginDestination(
        '?plan=pro_monthly&scan=QR-1&invite=ABCD1234',
        '/account',
      ),
    ).toBe('/invite/ABCD1234')
    expect(
      resolvePostLoginDestination('?plan=pro_monthly&scan=QR-1', '/account'),
    ).toBe('/scan/QR-1')
    expect(resolvePostLoginDestination('?plan=pro_monthly', '/account')).toBe(
      '/account?section=plans&plan=pro_monthly',
    )
  })

  it('replaces an unsafe fallback with the account destination', () => {
    expect(resolvePostLoginDestination('', 'https://evil.example/x')).toBe(
      '/account',
    )
  })
})
