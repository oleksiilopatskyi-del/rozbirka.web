import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from '@playwright/test'

const upstreamOrigin = 'http://127.0.0.1:4174'
const appOrigin = 'http://127.0.0.1:4173'
const phone = '501112233'
const otp = '123456'

const namedUser = {
  id: 'user-1',
  phone: '+380501112233',
  displayName: 'Олена Коваль',
  role: 'owner',
  isActive: true,
  lastLoginAt: null,
}

const tenants = [
  {
    id: 'tenant-1',
    name: 'Розбірка Коваль',
    slug: 'koval',
    plan: 'active',
    planTier: 'pro',
    city: 'Львів',
    logoUrl: null,
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    roleName: 'Власник',
  },
  {
    id: 'tenant-2',
    name: 'Розбірка Соболя',
    slug: 'sobol',
    plan: 'active',
    planTier: 'pro',
    city: 'Київ',
    logoUrl: null,
    isActive: true,
    createdAt: '2026-08-02T00:00:00.000Z',
    roleName: 'Менеджер',
  },
]

const subscription = {
  state: 'active',
  planCode: 'pro',
  planName: 'Pro',
  trialEndsAt: null,
  trialDaysRemaining: null,
  currentPeriodEnd: '2026-09-01T00:00:00.000Z',
  nextChargeAt: '2026-09-01T00:00:00.000Z',
  amount: 99000,
  currency: 'UAH',
  cardLast4: '1234',
  cardBrand: 'visa',
  canSubscribe: false,
  canCancel: true,
  canReactivate: false,
  canActivateTrial: false,
  usage: {
    cars: { used: 1, max: 100 },
    intakes: { used: 1, max: 100 },
    parts: { used: 1, max: 1000 },
    users: { used: 1, max: 10 },
    cashRegisters: { used: 1, max: 2 },
  },
  features: [],
}

interface RouteOptions {
  newUser?: boolean
  parallel401?: boolean
}

interface RouteState {
  protectedAttempts: Record<string, number>
  invitationAccepted: boolean
}

async function fulfillData(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, json: status < 400 ? { data } : data })
}

async function installApiBoundary(
  page: Page,
  options: RouteOptions = {},
): Promise<RouteState> {
  const state: RouteState = {
    protectedAttempts: {},
    invitationAccepted: false,
  }

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/auth/phone') {
      await fulfillData(route, { cooldownSeconds: 0, retryAfterSeconds: 0 })
      return
    }
    if (path === '/auth/me' && request.method() === 'GET') {
      await fulfillData(route, {
        ...namedUser,
        displayName: options.newUser
          ? 'Новий Користувач'
          : namedUser.displayName,
      })
      return
    }
    if (path === '/auth/me/name' && request.method() === 'PATCH') {
      await fulfillData(route, {
        user: namedUser,
        accessToken: 'access-name',
        expiresIn: 900,
      })
      return
    }
    if (path === '/api/v1/tenants') {
      await fulfillData(route, tenants)
      return
    }
    if (/^\/api\/v1\/invitations\/[^/]+\/info$/.test(path)) {
      await fulfillData(route, {
        tenantName: 'Розбірка Соболя',
        roleName: 'Менеджер',
        createdByName: 'Олена',
        expiresAt: '2026-09-01T00:00:00.000Z',
        isValid: true,
      })
      return
    }
    if (path === '/api/v1/invitations/accept') {
      state.invitationAccepted = true
      await fulfillData(route, {
        tenantId: 'tenant-2',
        tenantName: 'Розбірка Соболя',
        role: 'manager',
        permissions: ['cars.view'],
      })
      return
    }

    const protectedResponses: Record<string, unknown> = {
      '/api/v1/billing/subscription': subscription,
      '/api/v1/billing/payments': {
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
      '/api/v1/billing/plans': [],
    }
    if (path in protectedResponses) {
      state.protectedAttempts[path] = (state.protectedAttempts[path] ?? 0) + 1
      const authorization = request.headers().authorization ?? ''
      if (options.parallel401 && authorization === 'Bearer access-1') {
        await route.fulfill({
          status: 401,
          json: {
            error: { code: 'ACCESS_EXPIRED', message: 'Access expired' },
          },
        })
        return
      }
      await fulfillData(route, protectedResponses[path])
      return
    }

    await route.continue()
  })

  return state
}

async function resetUpstream(
  request: APIRequestContext,
  options: { newUser?: boolean } = {},
) {
  const response = await request.post(`${upstreamOrigin}/_test/reset`, {
    data: options,
  })
  expect(response.ok()).toBeTruthy()
}

async function upstreamStats(request: APIRequestContext) {
  const response = await request.get(`${upstreamOrigin}/_test/stats`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as {
    verifyRequests: number
    refreshRequests: number
    logoutRequests: number
  }
}

async function completeOtpLogin(page: Page) {
  await page.getByLabel('Номер телефону').fill(phone)
  await page.getByRole('button', { name: 'Отримати код' }).click()
  for (const [index, digit] of [...otp].entries()) {
    await page.getByLabel(`Цифра ${index + 1}`).fill(digit)
  }
  await page.getByRole('button', { name: 'Підтвердити' }).click()
}

async function loginFrom(
  page: Page,
  path = '/login',
  destination: string | RegExp = /\/account$/,
) {
  await page.goto(path)
  await completeOtpLogin(page)
  await expect(page).toHaveURL(destination)
}

test.beforeEach(async ({ request }) => {
  await resetUpstream(request)
})

test('OTP login stores refresh only in HttpOnly cookie and no credentials in storage @auth-smoke', async ({
  context,
  page,
}) => {
  await installApiBoundary(page)
  await loginFrom(page)

  const cookies = await context.cookies(`${appOrigin}/session/refresh`)
  const refreshCookie = cookies.find(
    (cookie) => cookie.name === 'rozbirka_refresh',
  )
  expect(refreshCookie).toMatchObject({
    httpOnly: true,
    sameSite: 'Strict',
    path: '/session',
    secure: false,
  })
  expect(refreshCookie?.value).not.toBe('')

  const storageEntries = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }))
  const storageText = JSON.stringify(storageEntries).toLowerCase()
  expect(storageText).not.toMatch(
    /access.?token|refresh.?token|access-|refresh-/,
  )
})

test('reload restores the account session through one refresh request @auth-smoke', async ({
  page,
  request,
}) => {
  await installApiBoundary(page)
  await loginFrom(page)

  const beforeReload = await upstreamStats(request)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Вийти' })).toBeVisible()
  const afterReload = await upstreamStats(request)
  expect(afterReload.refreshRequests - beforeReload.refreshRequests).toBe(1)
})

test('parallel protected 401 responses trigger one refresh and successful replays', async ({
  page,
  request,
}) => {
  const state = await installApiBoundary(page, { parallel401: true })
  await loginFrom(page)
  await expect(page.getByRole('button', { name: 'Вийти' })).toBeVisible()

  expect(state.protectedAttempts).toMatchObject({
    '/api/v1/billing/subscription': 2,
    '/api/v1/billing/payments': 2,
    '/api/v1/billing/plans': 1,
  })
  expect((await upstreamStats(request)).refreshRequests).toBe(1)
})

test('expired refresh redirects to login and preserves a safe cabinet return @auth-smoke', async ({
  page,
  request,
}) => {
  await installApiBoundary(page)
  await loginFrom(page)

  await resetUpstream(request)
  await page.goto('/account?section=plans')
  await expect(page).toHaveURL(/\/login$/)

  await completeOtpLogin(page)
  await expect(page).toHaveURL('/account?section=plans')
})

test('logout expires the cookie and leaves the user as guest @auth-smoke', async ({
  context,
  page,
  request,
}) => {
  await installApiBoundary(page)
  await loginFrom(page)
  await page.getByRole('button', { name: 'Вийти' }).click()

  await expect(page).toHaveURL('/')
  expect(
    (await context.cookies(`${appOrigin}/session/logout`)).some(
      (cookie) => cookie.name === 'rozbirka_refresh',
    ),
  ).toBe(false)
  expect((await upstreamStats(request)).logoutRequests).toBe(1)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/login$/)
})

test('invitation resumes after OTP and optional name', async ({
  page,
  request,
}) => {
  await resetUpstream(request, { newUser: true })
  const state = await installApiBoundary(page, { newUser: true })
  await page.goto('/invite/INVITE123')
  await expect(
    page.getByRole('heading', { name: 'Розбірка Соболя' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Прийняти запрошення' }).click()

  await completeOtpLogin(page)
  await expect(
    page.getByRole('heading', { name: 'Як вас називати?' }),
  ).toBeVisible()
  await page.getByLabel('Ім’я').fill('Олена Коваль')
  await page.getByRole('button', { name: 'Продовжити' }).click()

  await expect(page).toHaveURL('/invite/INVITE123')
  await page.getByRole('button', { name: 'Прийняти запрошення' }).click()
  await expect(page).toHaveURL('/account')
  expect(state.invitationAccepted).toBe(true)
})

test('scan deep link resumes after OTP without accepting an external return URL', async ({
  page,
}) => {
  await installApiBoundary(page)
  await page.goto(
    '/scan/QR-123~part?returnTo=https%3A%2F%2Fevil.example%2Fsteal',
  )
  await expect(page).toHaveURL(/\/login$/)

  await completeOtpLogin(page)
  await expect(page).toHaveURL('/account?scan=QR-123~part')
  expect(new URL(page.url()).origin).toBe(appOrigin)
})
