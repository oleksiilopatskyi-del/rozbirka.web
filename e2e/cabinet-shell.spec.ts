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

interface CabinetFixtureOptions {
  sobolBilling?: boolean
}

interface CabinetRequest {
  path: string
  tenantId: string | null
}

interface CabinetFixtureState {
  requests: CabinetRequest[]
  delayNextPermissions(tenantId: string): void
  waitForDelayedPermissions(): Promise<void>
  releaseDelayedPermissions(): Promise<void>
}

async function fulfillData(route: Route, data: unknown, status = 200) {
  await route.fulfill({ status, json: status < 400 ? { data } : data })
}

async function installCabinetApiBoundary(
  page: Page,
  options: CabinetFixtureOptions = {},
): Promise<CabinetFixtureState> {
  const requests: CabinetRequest[] = []
  let delayedTenantId: string | null = null
  let resolveStarted: () => void = () => undefined
  let resolveRelease: () => void = () => undefined
  let resolveSettled: () => void = () => undefined
  let started = new Promise<void>((resolve) => {
    resolveStarted = resolve
  })
  let release = new Promise<void>((resolve) => {
    resolveRelease = resolve
  })
  let settled = new Promise<void>((resolve) => {
    resolveSettled = resolve
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
    if (path.startsWith('/api/v1/')) requests.push({ path, tenantId })

    if (path === '/api/v1/me/permissions' && request.method() === 'GET') {
      const wasDelayed = tenantId === delayedTenantId
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
        await fulfillData(
          route,
          { error: { code: 'TENANT_REQUIRED', message: 'Tenant required' } },
          400,
        )
        return
      }
      await fulfillData(route, access).catch(() => undefined)
      if (wasDelayed) resolveSettled()
      return
    }
    if (path === '/api/v1/billing/subscription') {
      await fulfillData(
        route,
        tenantId === 'tenant-2' ? blockedSubscription : activeSubscription,
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
      settled = new Promise<void>((resolve) => {
        resolveSettled = resolve
      })
    },
    waitForDelayedPermissions: () => started,
    releaseDelayedPermissions: async () => {
      resolveRelease()
      await settled
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

test('never renders former tenant access after a delayed response is released @cabinet-smoke', async ({
  page,
}) => {
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
  await selectVisibleTenant(page, 'tenant-1')
  await fixture.waitForDelayedPermissions()
  await page.goBack()
  await expect(page).toHaveURL('/app/sobol/dashboard')
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Соболя' }),
  ).toBeVisible()

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
  await fixture.releaseDelayedPermissions()
  expect(await formerTenantHeadingAppeared).toBe(false)
  expect(await formerTenantAccessAppeared).toBe(false)
  await expect(
    page.getByRole('heading', { name: 'Вітаємо в Розбірка Коваль' }),
  ).not.toBeVisible()
  await expect(page.getByRole('link', { name: 'Підписка' })).not.toBeVisible()
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
      { path: '/api/v1/billing/subscription', tenantId: 'tenant-1' },
      { path: '/api/v1/billing/subscription', tenantId: 'tenant-2' },
    ]),
  )
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

  for (let index = 0; index < 12; index += 1) await page.keyboard.press('Tab')
  expect(
    await dialog.evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true)
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

test('logs out normally from the cabinet shell @cabinet-smoke', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installCabinetApiBoundary(page)
  await loginFrom(page)
  const logoutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/session/logout',
  )
  await page
    .getByRole('navigation', { name: 'Навігація кабінету' })
    .locator('..')
    .getByRole('button', { name: 'Вийти' })
    .click()

  await expect(page).toHaveURL('/')
  await logoutResponse
  expect((await upstreamStats(request)).logoutRequests).toBe(1)
  await page.goto('/app/koval/dashboard')
  await expect(page).toHaveURL(/\/login$/)
})
