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
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
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
