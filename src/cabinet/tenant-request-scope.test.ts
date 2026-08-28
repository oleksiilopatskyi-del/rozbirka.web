import { expect, it } from 'vitest'
import { tenantRequestScope } from './tenant-request-scope'

it('aborts the former signal and returns a fresh signal', () => {
  const former = tenantRequestScope.signal

  tenantRequestScope.rotate()

  expect(former.aborted).toBe(true)
  expect(former.reason).toBe('tenant-scope-changed')
  expect(tenantRequestScope.signal.aborted).toBe(false)
  expect(tenantRequestScope.signal).not.toBe(former)
})
