import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { useAuth } from '@/auth/AuthContext'
import { LoginScreen } from './login'

vi.mock('@/api/auth', () => ({
  authApi: {
    otpSend: vi.fn(),
    otpVerify: vi.fn(),
    updateName: vi.fn(),
  },
}))

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

/* eslint-disable @typescript-eslint/unbound-method */
const otpSend = vi.mocked(authApi.otpSend)
const otpVerify = vi.mocked(authApi.otpVerify)
/* eslint-enable @typescript-eslint/unbound-method */

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue({
    status: 'guest',
    user: null,
    tenant: null,
    tenants: [],
    hydrate: vi.fn().mockResolvedValue(undefined),
    switchTenant: vi.fn(),
    signOut: vi.fn(),
  })
  otpSend.mockResolvedValue({
    retryAfterSeconds: 60,
    cooldownSeconds: 60,
  })
  otpVerify.mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    user: {
      id: 'user-1',
      phone: '+380501112233',
      displayName: 'Власник',
    },
    isNewUser: false,
  })
})

it('preserves a valid selected plan after OTP login', async () => {
  render(
    <MemoryRouter initialEntries={['/login?plan=pro_monthly']}>
      <LoginScreen />
    </MemoryRouter>,
  )

  fireEvent.change(screen.getByLabelText('Номер телефону'), {
    target: { value: '+380 50 111 22 33' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Отримати код' }))

  const inputs = await screen.findAllByLabelText(/Цифра \d/)
  inputs.forEach((input, index) => {
    fireEvent.change(input, { target: { value: String(index + 1) } })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(
    await screen.findByRole('link', { name: 'Продовжити' }),
  ).toHaveAttribute('href', '/account?section=plans&plan=pro_monthly')
})
