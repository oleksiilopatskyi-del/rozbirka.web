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
const fixtureRefreshSecret = 'refresh-1'
const fixtureSendSecret = 'identity-send-internal-secret'
const fixtureOtpErrorSecret = 'identity-otp-internal-secret'
const fixtureArbitrarySecret = 'identity-arbitrary-secret'

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

const subscriptionByTenant = {
  'tenant-1': subscription,
  'tenant-2': {
    ...subscription,
    state: 'blocked',
    planCode: 'starter',
    planName: 'Starter',
    nextChargeAt: null,
    canCancel: false,
  },
} as const

const accessByTenant = {
  'tenant-1': {
    role: 'owner',
    permissions: ['cars.view', 'billing.view', 'billing.manage'],
    features: [],
  },
  'tenant-2': {
    role: 'manager',
    permissions: [],
    features: [],
  },
} as const

interface RouteOptions {
  newUser?: boolean
  parallel401?: boolean
}

interface RouteState {
  protectedAttempts: Record<string, number>
  invitationAccepted: boolean
  tenantRequests: { path: string; tenantId: string | null }[]
}

function containsRefreshCredential(value: unknown): boolean {
  const refreshTokenMarker = /refresh[\s._-]*token/i
  const fixtureSecret = fixtureRefreshSecret.toLowerCase()

  if (Array.isArray(value)) {
    return value.some((entry) => containsRefreshCredential(entry))
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, entry]) =>
        refreshTokenMarker.test(key) || containsRefreshCredential(entry),
    )
  }

  const serialized = (
    typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
  ).toLowerCase()
  return (
    refreshTokenMarker.test(serialized) || serialized.includes(fixtureSecret)
  )
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
    tenantRequests: [],
  }

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === '/auth/me' && request.method() === 'GET') {
      state.protectedAttempts[path] = (state.protectedAttempts[path] ?? 0) + 1
      if (
        options.parallel401 &&
        request.headers().authorization === 'Bearer access-1'
      ) {
        await route.fulfill({
          status: 401,
          json: {
            error: { code: 'ACCESS_EXPIRED', message: 'Access expired' },
          },
        })
        return
      }
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
      state.protectedAttempts[path] = (state.protectedAttempts[path] ?? 0) + 1
      if (
        options.parallel401 &&
        request.headers().authorization === 'Bearer access-1'
      ) {
        await route.fulfill({
          status: 401,
          json: {
            error: { code: 'ACCESS_EXPIRED', message: 'Access expired' },
          },
        })
        return
      }
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

    const tenantId = request.headers()['x-tenant-id'] ?? null
    const tenantScopedPaths = new Set([
      '/api/v1/me/permissions',
      '/api/v1/billing/subscription',
      '/api/v1/billing/payments',
    ])
    if (tenantScopedPaths.has(path)) {
      state.tenantRequests.push({ path, tenantId })
      state.protectedAttempts[path] = (state.protectedAttempts[path] ?? 0) + 1
      if (tenantId === null) {
        await fulfillData(
          route,
          { error: { code: 'TENANT_REQUIRED', message: 'Tenant required' } },
          400,
        )
        return
      }
      if (!(tenantId in accessByTenant)) {
        await fulfillData(
          route,
          {
            error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
          },
          404,
        )
        return
      }
    }

    const protectedResponses: Record<string, unknown> = {
      '/api/v1/me/permissions':
        accessByTenant[tenantId as keyof typeof accessByTenant],
      '/api/v1/billing/subscription':
        subscriptionByTenant[tenantId as keyof typeof subscriptionByTenant],
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
      if (!tenantScopedPaths.has(path)) {
        state.protectedAttempts[path] = (state.protectedAttempts[path] ?? 0) + 1
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
    sendRequests: number
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
  destination: string | RegExp = /\/app\/koval\/dashboard$/,
) {
  await page.goto(path)
  await completeOtpLogin(page)
  await expect(page).toHaveURL(destination)
  if (new URL(page.url()).pathname === '/app/koval/dashboard') {
    await expect(
      page.getByRole('heading', {
        name: 'Вітаємо в Розбірка Коваль',
      }),
    ).toBeVisible()
  }
}

async function logoutFromCabinet(page: Page) {
  let logout = page
    .getByRole('button', { name: 'Вийти' })
    .filter({ visible: true })
  if ((await logout.count()) === 0) {
    await page.getByRole('button', { name: 'Ще' }).click()
    logout = page
      .getByRole('dialog', { name: 'Меню кабінету' })
      .getByRole('button', { name: 'Вийти' })
  }
  await logout.click()
}

async function fixtureGet(page: Page, path: string, tenantId?: string) {
  return page.evaluate(
    async ({ requestPath, requestedTenant }) => {
      const response = await fetch(requestPath, {
        headers: requestedTenant
          ? { 'X-Tenant-Id': requestedTenant }
          : undefined,
      })
      return {
        status: response.status,
        body: await response.json(),
      }
    },
    { requestPath: path, requestedTenant: tenantId },
  )
}

test.beforeEach(async ({ request }) => {
  await resetUpstream(request)
})

test('auth fixture rejects missing and unknown tenant headers on scoped endpoints', async ({
  page,
}) => {
  await installApiBoundary(page)
  await page.goto('/login')

  for (const path of [
    '/api/v1/me/permissions',
    '/api/v1/billing/subscription',
    '/api/v1/billing/payments',
  ]) {
    expect(await fixtureGet(page, path), `${path} missing tenant`).toEqual({
      status: 400,
      body: {
        error: { code: 'TENANT_REQUIRED', message: 'Tenant required' },
      },
    })
    expect(
      await fixtureGet(page, path, 'tenant-unknown'),
      `${path} unknown tenant`,
    ).toEqual({
      status: 404,
      body: {
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      },
    })
  }
})

test('auth fixture returns known tenant data only for the matching header', async ({
  page,
}) => {
  const state = await installApiBoundary(page)
  await page.goto('/login')

  expect(
    await fixtureGet(page, '/api/v1/me/permissions', 'tenant-1'),
  ).toMatchObject({
    status: 200,
    body: {
      data: {
        role: 'owner',
        permissions: expect.arrayContaining(['cars.view']),
      },
    },
  })
  expect(
    await fixtureGet(page, '/api/v1/billing/subscription', 'tenant-2'),
  ).toMatchObject({
    status: 200,
    body: { data: { state: 'blocked', planCode: 'starter' } },
  })
  expect(state.tenantRequests).toEqual(
    expect.arrayContaining([
      { path: '/api/v1/me/permissions', tenantId: 'tenant-1' },
      { path: '/api/v1/billing/subscription', tenantId: 'tenant-2' },
    ]),
  )
})

test('OTP login stores refresh only in HttpOnly cookie and no credentials in storage @auth-smoke', async ({
  context,
  page,
  request,
}) => {
  await installApiBoundary(page)
  const sendResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.origin === appOrigin &&
      url.pathname === '/session/otp/send' &&
      response.request().method() === 'POST'
    )
  })
  const verifyResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.origin === appOrigin &&
      url.pathname === '/session/otp/verify' &&
      response.request().method() === 'POST'
    )
  })
  await loginFrom(page)

  const sendResponse = await sendResponsePromise
  expect(sendResponse.status()).toBe(200)
  expect(sendResponse.headers()['content-type']).toContain('application/json')
  const sendPayload: unknown = await sendResponse.json()
  expect(sendPayload).toEqual({ cooldownSeconds: 0, retryAfterSeconds: 0 })
  expect(JSON.stringify(sendPayload)).not.toContain(fixtureSendSecret)

  const verifyResponse = await verifyResponsePromise
  const verifyUrl = new URL(verifyResponse.url())
  expect(verifyUrl.origin).toBe(appOrigin)
  expect(verifyUrl.pathname).toBe('/session/otp/verify')
  expect(verifyResponse.request().method()).toBe('POST')
  expect(verifyResponse.status()).toBe(200)
  expect(verifyResponse.headers()['content-type']).toContain('application/json')
  const verifyPayload: unknown = await verifyResponse.json()
  expect(verifyPayload).toEqual({
    accessToken: 'access-1',
    user: {
      id: 'user-1',
      phone: '+380501112233',
      displayName: 'Олена Коваль',
    },
    isNewUser: false,
  })
  expect(containsRefreshCredential(verifyPayload)).toBe(false)
  expect(JSON.stringify(verifyPayload)).not.toContain(fixtureArbitrarySecret)
  expect(await upstreamStats(request)).toMatchObject({
    sendRequests: 1,
    verifyRequests: 1,
  })

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
  expect(refreshCookie?.value).toBe(fixtureRefreshSecret)

  const storageEntries = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }))
  const storageText = JSON.stringify(storageEntries).toLowerCase()
  expect(storageText).not.toMatch(
    /access.?token|refresh.?token|access-|refresh-/,
  )
})

test('invalid OTP reaches the Ukrainian login error through the Worker without leaking upstream details @auth-smoke', async ({
  page,
}) => {
  await installApiBoundary(page)
  await page.goto('/login')
  await page.getByLabel('Номер телефону').fill(phone)
  await page.getByRole('button', { name: 'Отримати код' }).click()
  for (const [index, digit] of [...'000000'].entries()) {
    await page.getByLabel(`Цифра ${index + 1}`).fill(digit)
  }

  const verifyResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/session/otp/verify'
  })
  await page.getByRole('button', { name: 'Підтвердити' }).click()

  const verifyResponse = await verifyResponsePromise
  const text = await verifyResponse.text()
  expect(verifyResponse.status()).toBe(400)
  expect(JSON.parse(text)).toEqual({
    error: { code: 'OTP_INVALID', message: 'OTP verification failed' },
  })
  expect(text).not.toContain(fixtureOtpErrorSecret)
  await expect(page.getByRole('alert')).toHaveText('Невірний код')
  await expect(page).toHaveURL('/login')
})

test('reload restores the cabinet session through one refresh request @auth-smoke', async ({
  page,
  request,
}) => {
  await installApiBoundary(page)
  await loginFrom(page)

  const beforeReload = await upstreamStats(request)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' }),
  ).toBeVisible()
  const afterReload = await upstreamStats(request)
  expect(afterReload.refreshRequests - beforeReload.refreshRequests).toBe(1)
})

test('parallel protected 401 responses trigger one refresh and successful replays', async ({
  page,
  request,
}) => {
  const state = await installApiBoundary(page, { parallel401: true })
  await loginFrom(page)
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' }),
  ).toBeVisible()

  expect(state.protectedAttempts).toMatchObject({
    '/auth/me': 2,
    '/api/v1/tenants': 2,
    '/api/v1/me/permissions': 1,
    '/api/v1/billing/subscription': 1,
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
  await expect(page).toHaveURL('/app/koval/settings/billing/plans')
})

test('logout expires the cookie and leaves the user as guest @auth-smoke', async ({
  context,
  page,
  request,
}) => {
  await installApiBoundary(page)
  await loginFrom(page)
  const visitedPaths: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      visitedPaths.push(new URL(frame.url()).pathname)
    }
  })
  const logoutResponse = page.waitForResponse((response) => {
    const request = response.request()
    return (
      request.method() === 'POST' &&
      new URL(response.url()).pathname === '/session/logout'
    )
  })
  await logoutFromCabinet(page)

  await expect(page).toHaveURL('/')
  await logoutResponse
  expect(visitedPaths).toContain('/')
  expect(visitedPaths).not.toContain('/login')
  expect(
    (await context.cookies(`${appOrigin}/session/logout`)).some(
      (cookie) => cookie.name === 'rozbirka_refresh',
    ),
  ).toBe(false)
  expect((await upstreamStats(request)).logoutRequests).toBe(1)

  await page.goto('/account')
  await expect(page).toHaveURL(/\/login$/)
})

test('invitation resumes after OTP and optional name into the accepted tenant', async ({
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
  await expect(page).toHaveURL('/app/sobol/dashboard')
  const staleLoginNavigation = page
    .waitForURL('/invite/INVITE123', { timeout: 1_200 })
    .then(
      () => true,
      () => false,
    )
  expect(await staleLoginNavigation).toBe(false)
  await expect(page).toHaveURL('/app/sobol/dashboard')
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
  await expect(page).toHaveURL('/app/koval/dashboard?scan=QR-123~part')
  expect(new URL(page.url()).origin).toBe(appOrigin)
})
