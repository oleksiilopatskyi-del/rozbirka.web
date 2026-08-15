import { expect, it, vi } from 'vitest'
import { tenantResetRegistry } from './tenant-reset-registry'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

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

it('settles one clear before starting the next without poisoning its caller', async () => {
  const releaseFirst = deferred()
  const firstFailure = new Error('first reset failed')
  const events: string[] = []
  const remove = tenantResetRegistry.register(async ({ tenantId }) => {
    events.push(`start:${tenantId}`)
    if (tenantId === 'a') {
      await releaseFirst.promise
      events.push(`end:${tenantId}`)
      throw firstFailure
    }
    events.push(`end:${tenantId}`)
  })

  const first = tenantResetRegistry.clear({ userId: 'u1', tenantId: 'a' })
  const firstOutcome = first.then(
    () => ({ kind: 'fulfilled' as const }),
    (error: unknown) => ({ kind: 'rejected' as const, error }),
  )
  const second = tenantResetRegistry.clear({ userId: 'u1', tenantId: 'b' })
  await vi.waitFor(() => expect(events).toContain('start:a'))
  await Promise.resolve()
  const eventsBeforeRelease = [...events]

  releaseFirst.resolve()
  const [settledFirst] = await Promise.all([firstOutcome, second])
  remove()

  expect(eventsBeforeRelease).toEqual(['start:a'])
  expect(settledFirst).toEqual({ kind: 'rejected', error: firstFailure })
  expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b'])
})
