import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Tenant } from '../api/types'
import { TenantSwitcher } from './TenantSwitcher'

const tenant = (id: string, name: string): Tenant => ({
  id,
  name,
  slug: id,
  plan: 'active',
  planTier: 'pro',
  city: 'Київ',
  logoUrl: null,
  isActive: true,
  createdAt: '2026-08-01T10:00:00Z',
  roleName: 'owner',
})

const tenants = [tenant('koval', 'Koval Auto'), tenant('luxe', 'Luxe Parts')]
const activeTenant = tenants[0]!

const deferred = () => {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

it('exposes tenant names and awaits one switch before accepting another', async () => {
  const pending = deferred()
  const onSwitch = vi.fn(() => pending.promise)

  render(
    <TenantSwitcher
      tenant={activeTenant}
      tenants={tenants}
      onSwitch={onSwitch}
    />,
  )

  const switcher = screen.getByRole('combobox', {
    name: 'Перемкнути розбірку',
  })
  expect(switcher).toHaveAccessibleName('Перемкнути розбірку')
  expect(screen.getByRole('option', { name: 'Koval Auto' })).toBeVisible()
  expect(screen.getByRole('option', { name: 'Luxe Parts' })).toBeVisible()
  expect(switcher).toHaveClass('min-h-11', 'min-w-11')

  fireEvent.change(switcher, { target: { value: 'luxe' } })
  fireEvent.change(switcher, { target: { value: 'luxe' } })

  expect(onSwitch).toHaveBeenCalledOnce()
  expect(onSwitch).toHaveBeenCalledWith('luxe')
  expect(switcher).toBeDisabled()

  pending.resolve()

  await waitFor(() => expect(switcher).toBeEnabled())
})

it('settles the guard after a rejected switch without leaking the rejection', async () => {
  const rejected = deferred()
  const onSwitch = vi
    .fn<(tenantId: string) => Promise<void>>()
    .mockReturnValueOnce(rejected.promise)
    .mockResolvedValueOnce()
  const unhandledRejection = vi.fn()
  window.addEventListener('unhandledrejection', unhandledRejection)

  try {
    render(
      <TenantSwitcher
        tenant={activeTenant}
        tenants={tenants}
        onSwitch={onSwitch}
      />,
    )
    const switcher = screen.getByRole('combobox', {
      name: 'Перемкнути розбірку',
    })

    fireEvent.change(switcher, { target: { value: 'luxe' } })
    expect(switcher).toBeDisabled()

    rejected.reject(new Error('switch failed'))

    await waitFor(() => expect(switcher).toBeEnabled())
    fireEvent.change(switcher, { target: { value: 'luxe' } })
    await waitFor(() => expect(onSwitch).toHaveBeenCalledTimes(2))
    await Promise.resolve()

    expect(unhandledRejection).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('unhandledrejection', unhandledRejection)
  }
})
