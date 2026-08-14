import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { authApi } from '@/api/auth'
import { credentials } from '@/api/credentials'
import { useAuth, type AuthContextValue } from '@/auth/AuthContext'
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
const updateName = vi.mocked(authApi.updateName)
/* eslint-enable @typescript-eslint/unbound-method */

const existingUser = {
  id: 'user-1',
  phone: '+380501112233',
  displayName: 'Власник',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <span data-testid="location">{location.pathname + location.search}</span>
  )
}

function renderLogin(
  initialEntry:
    | string
    | {
        pathname: string
        search?: string
        state?: { from?: string }
      } = '/login',
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function reachOtpStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Номер телефону'), '+380 50 111 22 33')
  await user.click(screen.getByRole('button', { name: 'Отримати код' }))
  await screen.findByLabelText('Цифра 1')
}

async function enterOtp(user: ReturnType<typeof userEvent.setup>) {
  const inputs = screen.getAllByLabelText(/Цифра \d/)
  for (const [index, input] of inputs.entries()) {
    await user.type(input, String(index + 1))
  }
}

let auth: AuthContextValue

beforeEach(() => {
  credentials.clear()
  auth = {
    status: 'guest',
    user: null,
    tenant: null,
    tenants: [],
    hydrate: vi.fn().mockResolvedValue(undefined),
    switchTenant: vi.fn(),
    signOut: vi.fn(),
  }
  vi.mocked(useAuth).mockReturnValue(auth)
  otpSend.mockResolvedValue({
    retryAfterSeconds: 60,
    cooldownSeconds: 60,
  })
  otpVerify.mockResolvedValue({
    accessToken: 'access',
    user: existingUser,
    isNewUser: false,
  })
  updateName.mockResolvedValue(existingUser)
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
  credentials.clear()
})

it('disables OTP resend during backend cooldown and applies retryAfterSeconds', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  otpSend.mockRejectedValueOnce({
    kind: 'conflict',
    code: 'OTP_COOLDOWN',
    message: 'backend cooldown',
    retryAfterSeconds: 75,
  })
  const user = userEvent.setup()
  renderLogin()

  await reachOtpStep(user)
  await user.click(screen.getByRole('button', { name: 'Надіслати код ще раз' }))

  expect(
    screen.getByRole('button', { name: /Надіслати код ще раз/ }),
  ).toBeDisabled()
  expect(screen.getByText(/75\sс/)).toBeInTheDocument()
})

it('does not start overlapping resend requests', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  const resend = deferred<{
    cooldownSeconds: number
    retryAfterSeconds: number
  }>()
  otpSend.mockImplementationOnce(() => resend.promise)
  const user = userEvent.setup()
  renderLogin()
  await reachOtpStep(user)

  const resendButton = screen.getByRole('button', {
    name: 'Надіслати код ще раз',
  })
  await user.click(resendButton)
  await user.click(resendButton)

  expect(otpSend).toHaveBeenCalledTimes(2)
  expect(resendButton).toBeDisabled()

  resend.resolve({ cooldownSeconds: 60, retryAfterSeconds: 60 })
  await waitFor(() => expect(resendButton).toBeDisabled())
})

it('shows the mapped expired-code message', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  otpVerify.mockRejectedValue({
    kind: 'validation',
    code: 'OTP_EXPIRED',
    message: 'backend wording that must not be shown',
  })
  const user = userEvent.setup()
  renderLogin()
  await reachOtpStep(user)
  await enterOtp(user)

  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Код вже не дійсний — запитайте новий',
  )
})

it('shows the mapped backend rate-limit message', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  otpVerify.mockRejectedValue({
    kind: 'unknown',
    code: 'OTP_RATE_LIMITED',
    message: 'upstream wording that must not be shown',
  })
  const user = userEvent.setup()
  renderLogin()
  await reachOtpStep(user)
  await enterOtp(user)

  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Забагато спроб. Спробуйте пізніше',
  )
})

it('shows a network fallback without leaking transport details', async () => {
  otpSend.mockRejectedValue(
    Object.assign(new Error('socket hang up at 10.0.0.7:443'), {
      code: 'ERR_NETWORK',
      isAxiosError: true,
      toJSON: () => ({}),
    }),
  )
  const user = userEvent.setup()
  renderLogin()

  await user.type(screen.getByLabelText('Номер телефону'), '+380 50 111 22 33')
  await user.click(screen.getByRole('button', { name: 'Отримати код' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Немає з’єднання з мережею.')
  expect(alert).not.toHaveTextContent('10.0.0.7')
})

it('hydrates before navigating after verify', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  const hydration = deferred<void>()
  vi.mocked(auth.hydrate).mockReturnValue(hydration.promise)
  const user = userEvent.setup()
  renderLogin({ pathname: '/login', state: { from: '/account?section=team' } })
  await reachOtpStep(user)
  await enterOtp(user)

  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(auth.hydrate).toHaveBeenCalledWith('access')
  expect(screen.queryByTestId('location')).not.toBeInTheDocument()
  expect(screen.queryByText('Ви увійшли')).not.toBeInTheDocument()

  vi.useFakeTimers()
  await act(async () => {
    hydration.resolve()
    await hydration.promise
  })
  expect(screen.getByText('Ви увійшли')).toBeInTheDocument()

  await act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })
  expect(screen.getByTestId('location')).toHaveTextContent(
    '/account?section=team',
  )
})

it('asks a new user for a name and stores the rotated access response', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  otpVerify.mockResolvedValue({
    accessToken: 'initial-access',
    user: { ...existingUser, displayName: '' },
    isNewUser: true,
  })
  updateName.mockImplementation(() => {
    credentials.setAccess('rotated-access')
    return Promise.resolve({ ...existingUser, displayName: 'Олена' })
  })
  const user = userEvent.setup()
  renderLogin()
  await reachOtpStep(user)
  await enterOtp(user)
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  const nameInput = await screen.findByLabelText('Ім’я')
  await user.type(nameInput, 'Олена')
  await user.click(screen.getByRole('button', { name: 'Продовжити' }))

  expect(updateName).toHaveBeenCalledWith('Олена')
  expect(credentials.getAccess()).toBe('rotated-access')
  expect(auth.hydrate).toHaveBeenCalledOnce()
})

it('rejects an external fallback and navigates to /account', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  const user = userEvent.setup()
  renderLogin({
    pathname: '/login',
    state: { from: 'https://evil.example/steal-session' },
  })
  await reachOtpStep(user)
  await enterOtp(user)
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(
    await screen.findByRole('link', { name: 'Продовжити' }),
  ).toHaveAttribute('href', '/account')
})

it('preserves invitation before scan and plan intents', async () => {
  otpSend.mockResolvedValueOnce({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  const user = userEvent.setup()
  renderLogin('/login?plan=pro_monthly&scan=QR-123&invite=INVITE_1234')
  await reachOtpStep(user)
  await enterOtp(user)
  await user.click(screen.getByRole('button', { name: 'Підтвердити' }))

  expect(
    await screen.findByRole('link', { name: 'Продовжити' }),
  ).toHaveAttribute('href', '/invite/INVITE_1234')
})

it('starts an authenticated unnamed user at the name step and resumes the invite', async () => {
  auth.status = 'authenticated'
  auth.user = {
    id: 'user-1',
    phone: '+380501112233',
    displayName: ' ',
    role: 'owner',
    isActive: true,
    lastLoginAt: null,
  }
  updateName.mockResolvedValue({ ...existingUser, displayName: 'Олена' })
  const user = userEvent.setup()
  renderLogin('/login?invite=ABCD1234')

  const nameInput = screen.getByLabelText('Ім’я')
  await user.type(nameInput, 'Олена')
  await user.click(screen.getByRole('button', { name: 'Продовжити' }))

  expect(auth.hydrate).toHaveBeenCalledOnce()
  expect(
    await screen.findByRole('link', { name: 'Продовжити' }),
  ).toHaveAttribute('href', '/invite/ABCD1234')
})
