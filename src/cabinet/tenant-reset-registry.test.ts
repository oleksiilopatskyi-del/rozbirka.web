import { expect, it, vi } from 'vitest'
import { tenantResetRegistry } from './tenant-reset-registry'

it('clears every registered tenant layer exactly once', async () => {
  const first = vi.fn()
  const second = vi.fn()
  const removeFirst = tenantResetRegistry.register(first)
  const removeSecond = tenantResetRegistry.register(second)

  await tenantResetRegistry.clear({ userId: 'u1', tenantId: 'a' })

  expect(first).toHaveBeenCalledWith({ userId: 'u1', tenantId: 'a' })
  expect(second).toHaveBeenCalledTimes(1)
  removeFirst()
  removeSecond()
})

it('awaits asynchronous tenant cleanup', async () => {
  let release!: () => void
  let settled = false
  const remove = tenantResetRegistry.register(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )

  const clearing = tenantResetRegistry
    .clear({ userId: 'u1', tenantId: 'a' })
    .then(() => {
      settled = true
    })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))

  expect(settled).toBe(false)
  release()
  await clearing
  expect(settled).toBe(true)
  remove()
})

it('snapshots reset callbacks and supports unregistering them', async () => {
  const late = vi.fn()
  let removeLate: () => void = () => undefined
  const removeFirst = tenantResetRegistry.register(() => {
    removeLate = tenantResetRegistry.register(late)
  })
  const removed = vi.fn()
  const removeRemoved = tenantResetRegistry.register(removed)
  removeRemoved()

  await tenantResetRegistry.clear({ userId: 'u1', tenantId: 'a' })

  expect(late).not.toHaveBeenCalled()
  expect(removed).not.toHaveBeenCalled()
  removeFirst()
  removeLate()
})

it('waits for remaining cleanup before propagating a cleanup failure', async () => {
  const failure = new Error('cache cleanup failed')
  let release!: () => void
  let settled = false
  let propagated: unknown
  const removeFailure = tenantResetRegistry.register(() =>
    Promise.reject(failure),
  )
  const removeDelayed = tenantResetRegistry.register(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )

  const clearing = tenantResetRegistry
    .clear({ userId: 'u1', tenantId: 'a' })
    .then(
      () => {
        settled = true
      },
      (error: unknown) => {
        settled = true
        propagated = error
      },
    )
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await new Promise((resolve) => setTimeout(resolve, 0))
  const settledBeforeRelease = settled

  release()
  await clearing
  removeFailure()
  removeDelayed()

  expect(settledBeforeRelease).toBe(false)
  expect(propagated).toBe(failure)
})
