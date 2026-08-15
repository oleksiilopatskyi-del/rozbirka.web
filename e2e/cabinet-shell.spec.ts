import AxeBuilder from '@axe-core/playwright'
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from '@playwright/test'

const upstreamOrigin = 'http://127.0.0.1:4174'
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
    plan: 'blocked',
    planTier: 'starter',
    city: 'Київ',
    logoUrl: null,
    isActive: true,
    createdAt: '2026-08-02T00:00:00.000Z',
    roleName: 'Менеджер',
  },
  {
    id: 'tenant-3',
    name: 'Архівна розбірка',
    slug: 'archive',
    plan: 'blocked',
    planTier: 'starter',
    city: null,
    logoUrl: null,
    isActive: false,
    createdAt: '2026-08-03T00:00:00.000Z',
    roleName: 'Власник',
  },
]

const activeSubscription = {
  state: 'active',
  planCode: 'pro',
  planName: 'Koval Pro',
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
  features: ['reports.advanced', 'team_collaboration'],
}

const blockedSubscription = {
  ...activeSubscription,
  state: 'blocked',
  planCode: 'starter',
  planName: 'Sobol Starter',
  nextChargeAt: null,
  canCancel: false,
}

const publicPlans = [
  {
    code: 'lite_monthly',
    name: 'Lite',
    amount: 29000,
    currency: 'UAH',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 10,
      intakes: 10,
      parts: 1000,
      users: 2,
      cashRegisters: 1,
      photosPerPart: null,
    },
    features: [],
  },
]

const pendingPaymentPage = {
  items: [
    {
      id: 'payment-1',
      type: 'checkout',
      status: 'pending',
      amount: 29000,
      currency: 'UAH',
      providerInvoiceId: 'invoice-pending-1',
      checkoutUrl: 'https://pay.example/secure-checkout',
      checkoutExpiresAt: '2026-08-15T12:00:00.000Z',
      createdAt: '2026-08-15T10:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
}

interface CabinetFixtureOptions {
  sobolBilling?: boolean
  pendingPayment?: boolean
  subscribeFailureStatus?: 403 | 409
  cancelSubscriptionFailureStatus?: 403 | 409
  cancelPaymentFailureStatus?: 403 | 409
}

interface CabinetRequest {
  method: string
  path: string
  tenantId: string | null
}

type DelayedDeliveryOutcome =
  | { kind: 'fulfilled' }
  | { kind: 'aborted'; error: string }
  | { kind: 'failed'; error: string }

interface CabinetFixtureState {
  requests: CabinetRequest[]
  delayNextPermissions(tenantId: string): void
  waitForDelayedPermissions(): Promise<void>
  releaseDelayedPermissions(): Promise<DelayedDeliveryOutcome>
}

async function fulfillData(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, json: status < 400 ? { data } : data })
}

const isPaymentCancellationPath = (path: string) =>
  /^\/api\/v1\/billing\/payments\/[^/]+\/cancel$/.test(path)

const isRecognizedBillingPath = (path: string) =>
  [
    '/api/v1/billing/subscription',
    '/api/v1/billing/plans',
    '/api/v1/billing/payments',
    '/api/v1/billing/subscribe',
    '/api/v1/billing/cancel',
  ].includes(path) || isPaymentCancellationPath(path)

async function installCabinetApiBoundary(
  page: Page,
  options: CabinetFixtureOptions = {},
): Promise<CabinetFixtureState> {
  const requests: CabinetRequest[] = []
  let delayedTenantId: string | null = null
  let resolveStarted: () => void = () => undefined
  let resolveRelease: () => void = () => undefined
  let resolveDelivery: (outcome: DelayedDeliveryOutcome) => void = () =>
    undefined
  let started = new Promise<void>((resolve) => {
    resolveStarted = resolve
  })
  let release = new Promise<void>((resolve) => {
    resolveRelease = resolve
  })
  let delivery = new Promise<DelayedDeliveryOutcome>((resolve) => {
    resolveDelivery = resolve
  })

  await page.route('**/*', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const tenantId = request.headers()['x-tenant-id'] ?? null

    if (path === '/auth/me' && request.method() === 'GET') {
      await fulfillData(route, namedUser)
      return
    }
    if (path === '/api/v1/tenants' && request.method() === 'GET') {
      await fulfillData(route, tenants)
      return
    }
    if (path.startsWith('/api/v1/')) {
      requests.push({ method: request.method(), path, tenantId })
    }

    const isTenantScoped =
      path === '/api/v1/me/permissions' ||
      path === '/api/v1/billing/subscription' ||
      path === '/api/v1/billing/payments' ||
      path === '/api/v1/billing/subscribe' ||
      path === '/api/v1/billing/cancel' ||
      isPaymentCancellationPath(path)
    if (isTenantScoped) {
      if (tenantId === null) {
        await fulfillData(
          route,
          { error: { code: 'TENANT_REQUIRED', message: 'Tenant required' } },
          400,
        )
        return
      }
      const tenant = tenants.find(({ id }) => id === tenantId)
      if (!tenant) {
        await fulfillData(
          route,
          {
            error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
          },
          404,
        )
        return
      }
      if (!tenant.isActive) {
        await fulfillData(
          route,
          {
            error: { code: 'TENANT_INACTIVE', message: 'Tenant inactive' },
          },
          403,
        )
        return
      }
    }

    if (path === '/api/v1/me/permissions' && request.method() === 'GET') {
      const wasDelayed =
        delayedTenantId !== null && tenantId === delayedTenantId
      if (wasDelayed) {
        delayedTenantId = null
        resolveStarted()
        await release
      }
      const accessByTenant: Record<
        string,
        { role: string; permissions: string[]; features: string[] }
      > = {
        'tenant-1': {
          role: 'owner',
          permissions: [
            'cars.view',
            'cars.manage',
            'billing.view',
            'billing.manage',
          ],
          features: ['reports.advanced', 'team_collaboration'],
        },
        'tenant-2': {
          role: 'manager',
          permissions: options.sobolBilling ? ['billing.view'] : [],
          features: [],
        },
      }
      const access = tenantId ? accessByTenant[tenantId] : undefined
      if (!access) {
        throw new Error(`Missing permission fixture for ${tenantId}`)
      }
      if (wasDelayed) {
        const failure = request.failure()
        if (failure) {
          resolveDelivery({ kind: 'aborted', error: failure.errorText })
          return
        }
      }
      try {
        await fulfillData(route, access)
      } catch (error) {
        if (!wasDelayed) throw error
        const failure = request.failure()
        resolveDelivery(
          failure
            ? { kind: 'aborted', error: failure.errorText }
            : {
                kind: 'failed',
                error: error instanceof Error ? error.message : String(error),
              },
        )
        return
      }
      if (wasDelayed) {
        const failure = request.failure()
        resolveDelivery(
          failure
            ? { kind: 'aborted', error: failure.errorText }
            : { kind: 'fulfilled' },
        )
      }
      return
    }
    if (path === '/api/v1/billing/subscription' && request.method() === 'GET') {
      await fulfillData(
        route,
        tenantId === 'tenant-2' ? blockedSubscription : activeSubscription,
      )
      return
    }
    if (path === '/api/v1/billing/plans' && request.method() === 'GET') {
      await fulfillData(route, publicPlans)
      return
    }
    if (path === '/api/v1/billing/payments' && request.method() === 'GET') {
      await fulfillData(
        route,
        options.pendingPayment
          ? pendingPaymentPage
          : {
              items: [],
              page: 1,
              pageSize: 10,
              total: 0,
              totalPages: 0,
            },
      )
      return
    }
    if (path === '/api/v1/billing/subscribe' && request.method() === 'POST') {
      if (options.subscribeFailureStatus) {
        await fulfillData(
          route,
          {
            error: {
              code: 'BILLING_DENIED',
              message: 'Raw fixture billing denial',
            },
          },
          options.subscribeFailureStatus,
        )
      } else {
        await fulfillData(route, {
          checkoutUrl: 'https://pay.example/new-checkout',
        })
      }
      return
    }
    if (path === '/api/v1/billing/cancel' && request.method() === 'POST') {
      if (options.cancelSubscriptionFailureStatus) {
        await fulfillData(
          route,
          {
            error: {
              code: 'SUBSCRIPTION_STATUS_CHANGED',
              message: 'Raw fixture subscription conflict',
            },
          },
          options.cancelSubscriptionFailureStatus,
        )
      } else {
        await fulfillData(route, null)
      }
      return
    }
    if (isPaymentCancellationPath(path) && request.method() === 'POST') {
      if (options.cancelPaymentFailureStatus) {
        await fulfillData(
          route,
          {
            error: {
              code: 'PAYMENT_STATUS_CHANGED',
              message: 'Raw fixture payment conflict',
            },
          },
          options.cancelPaymentFailureStatus,
        )
      } else {
        await fulfillData(route, null)
      }
      return
    }
    if (isRecognizedBillingPath(path)) {
      await fulfillData(
        route,
        {
          error: {
            code: 'FIXTURE_METHOD_NOT_ALLOWED',
            message: 'Billing fixture method not allowed',
          },
        },
        405,
      )
      return
    }

    await route.continue()
  })

  return {
    requests,
    delayNextPermissions: (tenantId) => {
      delayedTenantId = tenantId
      started = new Promise<void>((resolve) => {
        resolveStarted = resolve
      })
      release = new Promise<void>((resolve) => {
        resolveRelease = resolve
      })
      delivery = new Promise<DelayedDeliveryOutcome>((resolve) => {
        resolveDelivery = resolve
      })
    },
    waitForDelayedPermissions: () => started,
    releaseDelayedPermissions: async () => {
      resolveRelease()
      return delivery
    },
  }
}

async function resetUpstream(request: APIRequestContext) {
  const response = await request.post(`${upstreamOrigin}/_test/reset`, {
    data: {},
  })
  expect(response.ok()).toBeTruthy()
}

async function upstreamStats(request: APIRequestContext) {
  const response = await request.get(`${upstreamOrigin}/_test/stats`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { logoutRequests: number }
}

async function armDelayedLogout(request: APIRequestContext) {
  const response = await request.post(`${upstreamOrigin}/_test/logout/delay`)
  expect(response.ok()).toBeTruthy()
}

async function releaseDelayedLogout(request: APIRequestContext) {
  const response = await request.post(`${upstreamOrigin}/_test/logout/release`)
  expect(response.ok()).toBeTruthy()
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

async function fixtureRequest(
  page: Page,
  {
    path,
    method,
    tenantId,
  }: { path: string; method: string; tenantId?: string },
) {
  return page.evaluate(
    async ({ requestPath, requestMethod, requestedTenant }) => {
      const response = await fetch(requestPath, {
        method: requestMethod,
        headers: requestedTenant
          ? { 'X-Tenant-Id': requestedTenant }
          : undefined,
      })
      const text = await response.text()
      let body: unknown = text
      try {
        body = JSON.parse(text) as unknown
      } catch {
        // Preserve the non-JSON body so an escaped fixture route fails clearly.
      }
      return { status: response.status, body }
    },
    {
      requestPath: path,
      requestMethod: method,
      requestedTenant: tenantId,
    },
  )
}

async function completeOtpLogin(page: Page) {
  await page.getByLabel('Номер телефону').fill(phone)
  await page.getByRole('button', { name: 'Отримати код' }).click()
  for (const [index, digit] of [...otp].entries()) {
    await page.getByLabel(`Цифра ${index + 1}`).fill(digit)
  }
  await page.getByRole('button', { name: 'Підтвердити' }).click()
}

async function loginFrom(page: Page) {
  await page.goto('/login')
  await completeOtpLogin(page)
  await expect(page).toHaveURL('/app/koval/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' }),
  ).toBeVisible()
}

async function selectVisibleTenant(page: Page, tenantId: string) {
  let switcher = page
    .getByRole('combobox', { name: 'Перемкнути розбірку' })
    .filter({ visible: true })
  if ((await switcher.count()) === 0) {
    await page.getByRole('button', { name: 'Ще' }).click()
    switcher = page
      .getByRole('dialog', { name: 'Меню кабінету' })
      .getByRole('combobox', { name: 'Перемкнути розбірку' })
  }
  await switcher.selectOption(tenantId)
}

async function clickVisibleCabinetLink(page: Page, name: string) {
  let link = page.getByRole('link', { name }).filter({ visible: true })
  if ((await link.count()) === 0) {
    await page.getByRole('button', { name: 'Ще' }).click()
    link = page
      .getByRole('dialog', { name: 'Меню кабінету' })
      .getByRole('link', { name })
  }
  await link.click()
}

test.beforeEach(async ({ request }) => {
  await resetUpstream(request)
})

test('tenant fixture rejects missing tenant headers for every scoped endpoint', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await page.goto('/login')

  for (const path of [
    '/api/v1/me/permissions',
    '/api/v1/billing/subscription',
  ]) {
    expect(await fixtureGet(page, path), path).toEqual({
      status: 400,
      body: {
        error: { code: 'TENANT_REQUIRED', message: 'Tenant required' },
      },
    })
  }
})

test('tenant fixture rejects unknown and inactive tenant headers', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await page.goto('/login')

  for (const path of [
    '/api/v1/me/permissions',
    '/api/v1/billing/subscription',
  ]) {
    expect(await fixtureGet(page, path, 'tenant-unknown'), path).toEqual({
      status: 404,
      body: {
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant not found' },
      },
    })
    expect(await fixtureGet(page, path, 'tenant-3'), path).toEqual({
      status: 403,
      body: {
        error: { code: 'TENANT_INACTIVE', message: 'Tenant inactive' },
      },
    })
  }
})

test('billing fixture fails closed for every unsupported recognized method', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await page.goto('/login')

  for (const request of [
    {
      path: '/api/v1/billing/subscription',
      method: 'POST',
      tenantId: 'tenant-1',
    },
    { path: '/api/v1/billing/plans', method: 'POST' },
    {
      path: '/api/v1/billing/payments',
      method: 'POST',
      tenantId: 'tenant-1',
    },
    {
      path: '/api/v1/billing/subscribe',
      method: 'GET',
      tenantId: 'tenant-1',
    },
    {
      path: '/api/v1/billing/cancel',
      method: 'GET',
      tenantId: 'tenant-1',
    },
    {
      path: '/api/v1/billing/payments/payment-1/cancel',
      method: 'GET',
      tenantId: 'tenant-1',
    },
  ]) {
    expect(
      await fixtureRequest(page, request),
      `${request.method} ${request.path}`,
    ).toEqual({
      status: 405,
      body: {
        error: {
          code: 'FIXTURE_METHOD_NOT_ALLOWED',
          message: 'Billing fixture method not allowed',
        },
      },
    })
  }
})

test('billing fixture handles subscription cancellation without route escape', async ({
  page,
}) => {
  await installCabinetApiBoundary(page, {
    cancelSubscriptionFailureStatus: 409,
  })
  await page.goto('/login')

  expect(
    await fixtureRequest(page, {
      path: '/api/v1/billing/cancel',
      method: 'POST',
      tenantId: 'tenant-1',
    }),
  ).toEqual({
    status: 409,
    body: {
      error: {
        code: 'SUBSCRIPTION_STATUS_CHANGED',
        message: 'Raw fixture subscription conflict',
      },
    },
  })
})

test('aborts former tenant access before it can render after B commits @cabinet-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fixture = await installCabinetApiBoundary(page)
  await loginFrom(page)
  await selectVisibleTenant(page, 'tenant-2')
  await expect(page).toHaveURL('/app/sobol/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Соболя' }),
  ).toBeVisible()
  await clickVisibleCabinetLink(page, 'Профіль')
  await expect(page).toHaveURL('/app/sobol/settings/profile')

  fixture.delayNextPermissions('tenant-1')
  const formerAccessRequestFailed = page.waitForEvent('requestfailed', {
    predicate: (request) =>
      new URL(request.url()).pathname === '/api/v1/me/permissions' &&
      request.headers()['x-tenant-id'] === 'tenant-1',
  })
  await selectVisibleTenant(page, 'tenant-1')
  await fixture.waitForDelayedPermissions()
  await page.goBack()
  await expect(page).toHaveURL('/app/sobol/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Соболя' }),
  ).toBeVisible()
  const abortedRequest = await formerAccessRequestFailed
  expect(abortedRequest.failure()?.errorText).toMatch(/aborted|cancelled/i)

  const formerTenantHeadingAppeared = page
    .getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' })
    .waitFor({ state: 'visible', timeout: 1_000 })
    .then(
      () => true,
      () => false,
    )
  const formerTenantAccessAppeared = page
    .getByRole('link', { name: 'Підписка' })
    .filter({ visible: true })
    .waitFor({ state: 'visible', timeout: 1_000 })
    .then(
      () => true,
      () => false,
    )
  const deliveryOutcome: unknown = await fixture.releaseDelayedPermissions()
  expect(deliveryOutcome).toMatchObject({ kind: 'aborted' })
  expect(await formerTenantHeadingAppeared).toBe(false)
  expect(await formerTenantAccessAppeared).toBe(false)
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' }),
  ).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Підписка' })).not.toBeVisible()
  await page.setViewportSize({ width: 320, height: 900 })
  const mobileMore = page.getByRole('button', { name: 'Ще' })
  await expect(mobileMore).toBeVisible()
  await mobileMore.click()
  await expect(
    page
      .getByRole('dialog', { name: 'Меню кабінету' })
      .getByRole('link', { name: 'Підписка' }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  expect(
    fixture.requests.filter(
      ({ path, tenantId }) =>
        path === '/api/v1/me/permissions' && tenantId === 'tenant-2',
    ).length,
  ).toBeGreaterThan(0)
})

test('loads tenant-specific subscription data from tenant-scoped requests @cabinet-smoke', async ({
  page,
}) => {
  const fixture = await installCabinetApiBoundary(page, { sobolBilling: true })
  await loginFrom(page)
  await clickVisibleCabinetLink(page, 'Підписка')
  await expect(page.getByText('Koval Pro')).toBeVisible()

  await selectVisibleTenant(page, 'tenant-2')
  await expect(page).toHaveURL('/app/sobol/settings/billing/overview')
  await expect(page.getByText('Доступ закрито').first()).toBeVisible()
  expect(fixture.requests).toEqual(
    expect.arrayContaining([
      {
        method: 'GET',
        path: '/api/v1/billing/subscription',
        tenantId: 'tenant-1',
      },
      {
        method: 'GET',
        path: '/api/v1/billing/subscription',
        tenantId: 'tenant-2',
      },
    ]),
  )
})

test('falls back to the target dashboard when its policy denies the current module @cabinet-smoke', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  await clickVisibleCabinetLink(page, 'Підписка')
  await expect(page).toHaveURL('/app/koval/settings/billing/overview')

  await selectVisibleTenant(page, 'tenant-2')

  await expect(page).toHaveURL('/app/sobol/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Соболя' }),
  ).toBeVisible()
})

for (const width of [320, 768, 1024, 1440]) {
  test(`has no document overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await installCabinetApiBoundary(page)
    await loginFrom(page)

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('uses mobile, tablet, and desktop cabinet presentations at their breakpoints @cabinet-smoke', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)

  for (const [width, visibleNavigation] of [
    [320, 'Мобільна навігація'],
    [768, 'Навігація планшета'],
    [1024, 'Навігація кабінету'],
    [1440, 'Навігація кабінету'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    if (page.url() === 'about:blank') await loginFrom(page)
    await expect(
      page.getByRole('navigation', { name: visibleNavigation }),
    ).toBeVisible()
  }
})

test('opens More by keyboard, traps focus, and restores it on close @cabinet-smoke', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)

  const more = page.getByRole('button', { name: 'Ще' })
  const tabKey = ['webkit', 'ios'].includes(testInfo.project.name)
    ? 'Alt+Tab'
    : 'Tab'
  let reachedMore = false
  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press(tabKey)
    if (await more.evaluate((node) => node === document.activeElement)) {
      reachedMore = true
      break
    }
  }
  expect(reachedMore).toBe(true)
  await expect(more).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Меню кабінету' })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Закрити меню' }),
  ).toBeFocused()

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab')
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
      `Tab traversal ${index + 1}`,
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(more).toBeFocused()
})

test('direct cabinet URL matches visible navigation state @cabinet-smoke', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  const subscriptionLink = page
    .getByRole('navigation', { name: 'Навігація кабінету' })
    .getByRole('link', { name: 'Підписка' })
  await subscriptionLink.click()
  await expect(page).toHaveURL('/app/koval/settings/billing/overview')
  await expect(page.getByRole('heading', { name: 'Підписка' })).toBeVisible()

  await page.goto('/app/koval/settings/billing/overview')
  await expect(page.getByRole('heading', { name: 'Підписка' })).toBeVisible()
  await expect(subscriptionLink).toHaveAttribute('aria-current', 'page')
})

test('canonical tenant roots reach the private SPA and redirect to the dashboard @cabinet-smoke', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await loginFrom(page)

  for (const path of ['/app/koval', '/app/koval/']) {
    const response = await page.goto(path)

    expect(response?.status(), path).toBe(200)
    expect(response?.headers()['x-robots-tag'], path).toBe('noindex')
    await expect(page, path).toHaveURL('/app/koval/dashboard')
    await expect(
      page.getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' }),
    ).toBeVisible()
  }
})

test('shows a truthful unavailable state for an unreleased module', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  await page.goto('/app/koval/cars')
  await expect(
    page.getByRole('heading', { name: 'Модуль готується до запуску' }),
  ).toBeVisible()
})

test('denies a released module without its tenant permission', async ({
  page,
}) => {
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  await selectVisibleTenant(page, 'tenant-2')
  await page.goto('/app/sobol/settings/billing/overview')
  await expect(
    page.getByRole('heading', { name: 'Недостатньо прав' }),
  ).toBeVisible()
})

test('rejects an unknown tenant before loading tenant access', async ({
  page,
}) => {
  const fixture = await installCabinetApiBoundary(page)
  await loginFrom(page)
  const before = fixture.requests.length
  await page.goto('/app/unknown/dashboard')
  await expect(page.getByRole('alert')).toHaveText('Розбірку не знайдено')
  expect(fixture.requests.slice(before)).not.toContainEqual(
    expect.objectContaining({ path: '/api/v1/me/permissions' }),
  )
})

test('rejects an inactive tenant before loading tenant access', async ({
  page,
}) => {
  const fixture = await installCabinetApiBoundary(page)
  await loginFrom(page)
  const before = fixture.requests.length
  await page.goto('/app/archive/dashboard')
  await expect(page.getByRole('alert')).toHaveText('Розбірка неактивна')
  expect(fixture.requests.slice(before)).not.toContainEqual(
    expect.objectContaining({ path: '/api/v1/me/permissions' }),
  )
})

test('renders an unknown cabinet route inside the branded shell', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  const response = await page.goto('/app/koval/not-a-page')

  expect(response?.status()).toBe(200)
  await expect(
    page.getByRole('heading', { name: 'Сторінку не знайдено' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'rozbirka — на головну' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'До головної' })).toHaveAttribute(
    'href',
    '/app/koval/dashboard',
  )
})

test('cabinet has no serious accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])
})

test('visible mobile cabinet controls meet the 44px target minimum', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  await page.getByRole('button', { name: 'Ще' }).click()

  const controls = page
    .getByRole('navigation', { name: 'Мобільна навігація' })
    .getByRole('button')
    .or(
      page
        .getByRole('navigation', { name: 'Мобільна навігація' })
        .getByRole('link'),
    )
    .or(page.getByRole('dialog').getByRole('button'))
    .or(page.getByRole('dialog').getByRole('link'))
    .or(page.getByRole('dialog').getByRole('combobox'))
  const boxes = await controls.evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = getComputedStyle(element)
        return style.visibility !== 'hidden' && style.display !== 'none'
      })
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
  )
  expect(boxes.length).toBeGreaterThan(0)
  expect(boxes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(
    true,
  )
})

for (const width of [320, 768]) {
  test(`pending payment wraps without overflow and keeps 44px actions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await installCabinetApiBoundary(page, { pendingPayment: true })
    await loginFrom(page)
    await page.goto('/app/koval/settings/billing/payments')

    const checkout = page.getByRole('link', { name: 'Продовжити оплату' })
    const cancel = page.getByRole('button', { name: 'Скасувати' })
    await expect(checkout).toBeVisible()
    await expect(cancel).toBeVisible()
    await expect(checkout).toHaveAttribute(
      'href',
      'https://pay.example/secure-checkout',
    )
    await expect(checkout).toHaveAttribute('target', '_blank')
    await expect(checkout).toHaveAttribute('rel', 'noopener noreferrer')

    const actionBoxes = await checkout.or(cancel).evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
    )
    expect(actionBoxes).toHaveLength(2)
    expect(
      actionBoxes.every(({ width: boxWidth, height }) =>
        Boolean(boxWidth >= 44 && height >= 44),
      ),
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('billing mutation failures stay truthful and handled in Chromium', async ({
  page,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  const fixture = await installCabinetApiBoundary(page, {
    pendingPayment: true,
    subscribeFailureStatus: 403,
    cancelSubscriptionFailureStatus: 409,
    cancelPaymentFailureStatus: 409,
  })
  await loginFrom(page)

  await page.goto('/app/koval/settings/billing/plans')
  await page.getByRole('button', { name: 'Обрати' }).click()
  const checkoutAlert = page.getByRole('alert')
  await expect(checkoutAlert).toContainText(
    'У вас більше немає права змінювати підписку.',
  )
  await expect(checkoutAlert).not.toContainText('Raw fixture billing denial')

  await page.goto('/app/koval/settings/billing/payments')
  await page.getByRole('button', { name: 'Скасувати' }).click()
  const paymentAlert = page.getByRole('alert')
  await expect(paymentAlert).toContainText(
    'Статус платежу вже змінився. Оновіть список платежів.',
  )
  await expect(paymentAlert).not.toContainText('Raw fixture payment conflict')

  await page.goto('/app/koval/settings/billing/overview')
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Скасувати' }).click()
  const subscriptionAlert = page.getByRole('alert')
  await expect(subscriptionAlert).toContainText(
    'Підписка вже змінилася. Оновіть сторінку та спробуйте ще раз.',
  )
  await expect(subscriptionAlert).not.toContainText(
    'Raw fixture subscription conflict',
  )
  expect(
    fixture.requests.filter(({ path }) =>
      [
        '/api/v1/billing/subscribe',
        '/api/v1/billing/payments/payment-1/cancel',
        '/api/v1/billing/cancel',
      ].includes(path),
    ),
  ).toEqual([
    {
      method: 'POST',
      path: '/api/v1/billing/subscribe',
      tenantId: 'tenant-1',
    },
    {
      method: 'POST',
      path: '/api/v1/billing/payments/payment-1/cancel',
      tenantId: 'tenant-1',
    },
    {
      method: 'POST',
      path: '/api/v1/billing/cancel',
      tenantId: 'tenant-1',
    },
  ])
  expect(pageErrors).toEqual([])
})

test('logs out normally from the cabinet shell @cabinet-smoke', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  await armDelayedLogout(request)
  let delayReleased = false
  try {
    let logoutSettled = false
    const logoutResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/session/logout',
    )
    void logoutResponse.then(() => {
      logoutSettled = true
    })
    await page
      .getByRole('navigation', { name: 'Навігація кабінету' })
      .locator('..')
      .getByRole('button', { name: 'Вийти' })
      .click()

    await expect(page).toHaveURL('/')
    await expect
      .poll(async () => (await upstreamStats(request)).logoutRequests)
      .toBe(1)
    expect(logoutSettled).toBe(false)
    await releaseDelayedLogout(request)
    delayReleased = true
    await logoutResponse
    expect((await upstreamStats(request)).logoutRequests).toBe(1)
    await page.goto('/app/koval/dashboard')
    await expect(page).toHaveURL(/\/login$/)
  } finally {
    if (!delayReleased) await releaseDelayedLogout(request)
  }
})
