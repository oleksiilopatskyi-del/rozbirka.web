# ROZ-40 Responsive Cabinet Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, tenant-scoped authenticated shell whose routes, navigation, controls, and tenant transitions all use the same backend-derived access boundary.

**Architecture:** A typed module registry and pure policy evaluator define cabinet access. A generation-safe tenant transition coordinator rotates the API request scope, clears registered tenant state, bootstraps `/me/permissions` plus permitted billing data, and commits the target tenant only after the new immutable access snapshot is ready. React Router hosts lazy `/app/:tenant/*` children inside a responsive shell; existing onboarding and billing surfaces move into that route model.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Axios, Tailwind CSS 4, Vitest/Testing Library, Playwright, Cloudflare Workers/Wrangler.

## Global Constraints

- Tenant URLs use backend tenant `slug`; API requests use tenant `id` in `X-Tenant-Id`.
- Backend permissions, features, subscription state, and usage are authoritative; frontend role names are never authorization rules.
- Navigation, direct routes, controls, and mutations use the same typed policy evaluator.
- Unreleased modules are hidden from navigation and render an explicit unavailable state on direct visits.
- Tenant switching must abort old core requests and clear permissions, features, subscription, overlays, drafts, queues, and registered tenant caches before target content can render.
- No stale A response may commit after A-to-B, A-to-B-to-C, route-change, or unmount boundaries.
- Desktop is `>=1024px`, tablet is `768-1023px`, and mobile is `<768px`; 320/768/1024/1440 must have no page-level horizontal overflow.
- Interactive targets are at least 44 by 44 px, keyboard accessible, focus-visible, and reduced-motion aware.
- ROZ-40 does not implement ROZ-41 analytics or ROZ-42 through ROZ-51 ERP business behavior.
- Existing secure session, invitation resume, scan resume, billing, onboarding, and logout behavior must remain intact.

---

## Planned File Structure

```text
src/cabinet/
  access-api.ts                 # /me/permissions transport
  access-types.ts               # access DTOs and immutable snapshot
  module-registry.ts            # one typed description per cabinet module
  policy.ts                     # pure route/control/mutation decisions
  AccessGate.tsx                # shared control and mutation gate adapters
  tenant-request-scope.ts       # AbortSignal rotated at tenant boundary
  tenant-reset-registry.ts      # reset hooks for future caches/drafts/queues
  tenant-transition.ts          # generation-safe ordered coordinator
  CabinetContext.tsx            # target resolution, bootstrap, retry, switch API
  CabinetShell.tsx              # responsive shell composition
  CabinetNavigation.tsx         # sidebar, rail, bottom navigation, More drawer
  TenantSwitcher.tsx            # keyboard-safe tenant selection
  ModuleBoundary.tsx            # shared direct-route policy enforcement
  cabinet-paths.ts              # canonical URL and compatibility helpers
  screens/
    cabinet-home.tsx            # minimal ROZ-40 shell home
    module-unavailable.tsx      # unreleased route state
    cabinet-state.tsx           # loading/error/denied/blocked states
    not-found.tsx               # branded cabinet/global 404
    tenant-onboarding.tsx       # existing tenant creation flow
  billing/
    billing-layout.tsx          # billing route outlet/header
    subscription-screen.tsx     # extracted subscription and usage UI
    plans-screen.tsx            # extracted plan selection UI
    payments-screen.tsx         # card and payment history UI
```

Existing files are modified only at their current responsibilities: API client request boundaries, auth tenant commit, route registration, account compatibility redirect, edge SPA routing, and tests.

---

### Task 1: Define Tenant Access Contracts and Transport

**Files:**
- Create: `src/cabinet/access-types.ts`
- Create: `src/cabinet/access-api.ts`
- Test: `src/cabinet/access-api.test.ts`
- Modify: `src/api/types.ts`

**Interfaces:**
- Produces: `Permission`, `MePermissionsDto`, `TenantAccessSnapshot`, `TenantAccessState`, `accessApi.get(options?: RequestOptions): Promise<MePermissionsDto>`.
- Consumes: `apiClient`, `RequestOptions`, and existing `SubscriptionDto`.

- [ ] **Step 1: Write the failing transport and shape tests**

```ts
it('loads effective access through the tenant-scoped core client', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: accessDto } as never)
  await expect(accessApi.get({ signal })).resolves.toEqual(accessDto)
  expect(apiClient.get).toHaveBeenCalledWith('/me/permissions', { signal })
})

it('includes billing permissions in the canonical permission union', () => {
  expect(ALL_PERMISSIONS).toContain('billing.view')
  expect(ALL_PERMISSIONS).toContain('billing.manage')
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run src/cabinet/access-api.test.ts`

Expected: FAIL because `accessApi` and the canonical permission list do not exist.

- [ ] **Step 3: Add exact access types and API wrapper**

```ts
export const ALL_PERMISSIONS = [
  'cars.view', 'cars.manage', 'parts.view', 'parts.manage',
  'orders.view', 'orders.manage', 'customers.view', 'customers.manage',
  'finance.view', 'finance.manage', 'team.view', 'team.manage',
  'intakes.view', 'intakes.manage', 'stickers.manage',
  'reports.view', 'reports.manage', 'billing.view', 'billing.manage',
] as const

export type Permission = (typeof ALL_PERMISSIONS)[number]

export interface MePermissionsDto {
  role: string
  permissions: string[]
  features: string[]
}

export interface TenantAccessSnapshot {
  userId: string
  tenantId: string
  generation: number
  role: string
  permissions: ReadonlySet<string>
  features: ReadonlySet<string>
  subscription: SubscriptionDto | null
}

export type TenantAccessState =
  | { status: 'loading'; snapshot: null; error: null }
  | { status: 'ready'; snapshot: TenantAccessSnapshot; error: null }
  | { status: 'error'; snapshot: null; error: unknown }
```

Implement `accessApi.get` with `GET /me/permissions` and the caller's signal. Keep unknown backend permission strings in the snapshot so new backend permissions remain forward-compatible; use the canonical union only for registry authoring.

- [ ] **Step 4: Run focused tests and static typing**

Run: `npx vitest run src/cabinet/access-api.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the access contract**

```bash
git add -- src/api/types.ts src/cabinet/access-types.ts src/cabinet/access-api.ts src/cabinet/access-api.test.ts
git commit -m "feat(web): add cabinet access contracts"
```

---

### Task 2: Add the Tenant Request and Reset Boundaries

**Files:**
- Create: `src/cabinet/tenant-request-scope.ts`
- Create: `src/cabinet/tenant-request-scope.test.ts`
- Create: `src/cabinet/tenant-reset-registry.ts`
- Create: `src/cabinet/tenant-reset-registry.test.ts`
- Modify: `src/api/client.ts`
- Modify: `src/api/client.test.ts`

**Interfaces:**
- Produces: `tenantRequestScope.signal`, `tenantRequestScope.rotate()`, `tenantResetRegistry.register(reset)`, and `tenantResetRegistry.clear(scope)`.
- Consumes: Axios core request interceptor.

- [ ] **Step 1: Write RED tests for abort and reset behavior**

```ts
it('aborts the former signal and returns a fresh signal', () => {
  const former = tenantRequestScope.signal
  tenantRequestScope.rotate()
  expect(former.aborted).toBe(true)
  expect(tenantRequestScope.signal.aborted).toBe(false)
  expect(tenantRequestScope.signal).not.toBe(former)
})

it('clears every registered tenant layer exactly once', async () => {
  const first = vi.fn()
  const second = vi.fn()
  const remove = tenantResetRegistry.register(first)
  tenantResetRegistry.register(second)
  await tenantResetRegistry.clear({ userId: 'u1', tenantId: 'a' })
  expect(first).toHaveBeenCalledWith({ userId: 'u1', tenantId: 'a' })
  expect(second).toHaveBeenCalledTimes(1)
  remove()
})
```

Add an API-client test proving a configured caller signal and the tenant signal both cancel the same request through `AbortSignal.any`.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run src/cabinet/tenant-request-scope.test.ts src/cabinet/tenant-reset-registry.test.ts src/api/client.test.ts`

Expected: FAIL because the boundary modules and composed signal are absent.

- [ ] **Step 3: Implement the minimal boundaries**

```ts
class TenantRequestScope {
  #controller = new AbortController()
  get signal() { return this.#controller.signal }
  rotate() {
    this.#controller.abort('tenant-scope-changed')
    this.#controller = new AbortController()
  }
}

export const tenantRequestScope = new TenantRequestScope()
```

The core request interceptor must compose `config.signal` and
`tenantRequestScope.signal` with `AbortSignal.any`, leaving identity and public
clients unchanged. The reset registry accepts synchronous or asynchronous
callbacks, returns an unregister function, snapshots callbacks before clearing,
and awaits all registered cleanup before tenant persistence.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run src/cabinet/tenant-request-scope.test.ts src/cabinet/tenant-reset-registry.test.ts src/api/client.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the tenant boundaries**

```bash
git add -- src/api/client.ts src/api/client.test.ts src/cabinet/tenant-request-scope.ts src/cabinet/tenant-request-scope.test.ts src/cabinet/tenant-reset-registry.ts src/cabinet/tenant-reset-registry.test.ts
git commit -m "feat(web): add tenant request boundary"
```

---

### Task 3: Implement the Generation-Safe Tenant Transition Coordinator

**Files:**
- Create: `src/cabinet/tenant-transition.ts`
- Test: `src/cabinet/tenant-transition.test.ts`

**Interfaces:**
- Produces: `createTenantTransition(dependencies)` returning `transition(target): Promise<TenantTransitionResult>` and `invalidate(): void`.
- Consumes: request rotation, reset registry, access API, billing API, tenant preference persistence, and auth tenant commit through injected dependencies.

- [ ] **Step 1: Write RED tests for order, races, and failure**

```ts
it('clears A before persisting or loading B', async () => {
  await transition(tenantB)
  expect(events).toEqual([
    'begin:B', 'rotate:A', 'clear:A', 'persist:B',
    'access:B', 'subscription:B', 'commit:B', 'complete:B',
  ])
})

it('never commits B when a newer C transition wins', async () => {
  const b = transition(tenantB)
  const c = transition(tenantC)
  resolveAccessB(accessB)
  resolveAccessC(accessC)
  await Promise.all([b, c])
  expect(commit).not.toHaveBeenCalledWith(tenantB, expect.anything())
  expect(commit).toHaveBeenCalledWith(tenantC, expect.objectContaining({ tenantId: 'c' }))
})

it('does not restore A content when B bootstrap fails', async () => {
  loadAccess.mockRejectedValue(new Error('offline'))
  await expect(transition(tenantB)).resolves.toMatchObject({ kind: 'error', target: tenantB })
  expect(commit).not.toHaveBeenCalled()
  expect(fail).toHaveBeenCalledWith(tenantB, expect.any(Error))
})
```

Also cover missing `billing.view`, late subscription completion, invalidation on unmount, and same-tenant deduplication.

- [ ] **Step 2: Run the coordinator test and confirm RED**

Run: `npx vitest run src/cabinet/tenant-transition.test.ts`

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement the pure coordinator**

```ts
export type TenantTransitionResult =
  | { kind: 'committed'; target: Tenant; snapshot: TenantAccessSnapshot }
  | { kind: 'superseded'; target: Tenant }
  | { kind: 'error'; target: Tenant; error: unknown }

export interface TenantTransitionDependencies {
  currentScope(): { userId: string; tenantId: string | null }
  begin(target: Tenant, generation: number): void
  rotateRequests(): void
  clear(scope: { userId: string; tenantId: string }): Promise<void>
  persistTenant(tenantId: string): void
  loadAccess(signal: AbortSignal): Promise<MePermissionsDto>
  loadSubscription(signal: AbortSignal): Promise<SubscriptionDto>
  commit(target: Tenant, snapshot: TenantAccessSnapshot): void
  fail(target: Tenant, error: unknown): void
}
```

Use a monotonic generation and check `isCurrent()` after every awaited boundary.
Load subscription only when access includes `billing.view`. Build the immutable
snapshot locally and pass tenant plus snapshot in one commit callback.

- [ ] **Step 4: Run the coordinator suite**

Run: `npx vitest run src/cabinet/tenant-transition.test.ts && npm run typecheck`

Expected: PASS with all deferred race cases.

- [ ] **Step 5: Commit the coordinator**

```bash
git add -- src/cabinet/tenant-transition.ts src/cabinet/tenant-transition.test.ts
git commit -m "feat(web): coordinate atomic tenant transitions"
```

---

### Task 4: Add the Central Module Registry and Policy Evaluator

**Files:**
- Create: `src/cabinet/module-registry.ts`
- Create: `src/cabinet/policy.ts`
- Test: `src/cabinet/policy.test.ts`
- Create: `src/cabinet/AccessGate.tsx`
- Test: `src/cabinet/AccessGate.test.tsx`

**Interfaces:**
- Produces: `CabinetModuleKey`, `CabinetModuleDefinition`, `cabinetModules`, `evaluateModuleAccess(definition, access, operation)`, `AccessGate`, and `requireModuleMutation`.
- Consumes: canonical permissions, feature codes, billing states, and subscription usage.

- [ ] **Step 1: Write a RED policy truth table**

```ts
it.each([
  ['unreleased', unreleasedModule, ready(ownerSnapshot), 'view', 'unreleased'],
  ['missing permission', carsModule, ready(noCarsSnapshot), 'view', 'permission-denied'],
  ['missing feature', reportsModule, ready(noReportsFeature), 'view', 'feature-unavailable'],
  ['blocked plan', carsModule, ready(blockedSnapshot), 'view', 'subscription-blocked'],
  ['full quota read', carsModule, ready(fullCarsSnapshot), 'view', 'allowed'],
  ['full quota create', carsModule, ready(fullCarsSnapshot), 'mutation', 'quota-exhausted'],
])('%s', (_name, module, access, operation, expected) => {
  expect(evaluateModuleAccess(module, access, operation)).toMatchObject({ kind: expected })
})
```

Add a registry test that route segments are unique and every released navigation item has a label, icon, and placement.

- [ ] **Step 2: Run policy tests and confirm RED**

Run: `npx vitest run src/cabinet/policy.test.ts src/cabinet/AccessGate.test.tsx`

Expected: FAIL because the registry and evaluator are absent.

- [ ] **Step 3: Implement the registry and discriminated result**

```ts
export type ModuleAccessDecision =
  | { kind: 'allowed' }
  | { kind: 'unreleased' }
  | { kind: 'permission-denied' }
  | { kind: 'feature-unavailable'; feature: string }
  | { kind: 'subscription-blocked'; state: BillingState }
  | { kind: 'quota-exhausted'; resource: QuotaResource; used: number; max: number }
  | { kind: 'access-loading' }
  | { kind: 'access-error' }
```

Each module definition has separate `viewPermission` and optional
`mutationPermission`; mutation evaluation never treats a view permission as
write authority. `AccessGate` renders controls only for `allowed`, while
`requireModuleMutation` throws a typed local decision before dispatch so the UI
can show the same denial reason. Backend denial remains authoritative.

Release only the minimal dashboard home, billing overview/plans/payments, basic
profile/logout, onboarding, and tenant switching. Register the remaining route
segments as unreleased. Evaluate in the deterministic order: access state,
release, permission, feature, subscription, operation quota.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run src/cabinet/policy.test.ts src/cabinet/AccessGate.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the policy layer**

```bash
git add -- src/cabinet/module-registry.ts src/cabinet/policy.ts src/cabinet/policy.test.ts src/cabinet/AccessGate.tsx src/cabinet/AccessGate.test.tsx
git commit -m "feat(web): centralize cabinet access policy"
```

---

### Task 5: Wire Cabinet Context and Auth Tenant Commit

**Files:**
- Create: `src/cabinet/CabinetContext.tsx`
- Test: `src/cabinet/CabinetContext.test.tsx`
- Modify: `src/auth/AuthContext.tsx`
- Modify: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Produces: `CabinetContextValue` with `status`, `targetTenant`, `snapshot`, `error`, `retry()`, and `switchTenant(tenantId)`.
- Consumes: Task 3 coordinator and authenticated `commitTenant(tenantId)`.

- [ ] **Step 1: Write RED integration tests**

```tsx
it('renders no A children after switching begins and commits B atomically', async () => {
  renderCabinet('/app/a/dashboard')
  expect(await screen.findByText('tenant:a access:a')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Розбірка B' }))
  expect(screen.queryByText('tenant:a access:a')).not.toBeInTheDocument()
  expect(screen.getByText('Перемикаємо розбірку…')).toBeVisible()
  resolveAccessB()
  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
})

it('shows an honest retry state for an access network failure', async () => {
  accessApi.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(accessB)
  renderCabinet('/app/b/dashboard')
  await user.click(await screen.findByRole('button', { name: 'Спробувати ще раз' }))
  expect(await screen.findByText('tenant:b access:b')).toBeVisible()
})
```

Cover unknown slug, inactive tenant, rapid switches, route change while loading, and unmount invalidation.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run src/cabinet/CabinetContext.test.tsx src/auth/AuthContext.test.tsx`

Expected: FAIL because cabinet context and atomic auth commit are absent.

- [ ] **Step 3: Implement cabinet state and narrow auth mutation**

Replace the public synchronous `switchTenant` contract with a synchronous
`commitTenant(tenantId)` used only by the cabinet coordinator after access is
ready. `CabinetProvider` resolves the URL slug without fallback, starts the
coordinator, blocks its outlet unless `{tenant.id === snapshot.tenantId}`, and
invalidates the coordinator on unmount/sign-out.

```ts
export interface CabinetContextValue {
  status: 'loading' | 'ready' | 'switching' | 'error' | 'not-found' | 'inactive'
  targetTenant: Tenant | null
  snapshot: TenantAccessSnapshot | null
  error: unknown
  retry(): Promise<void>
  switchTenant(tenantId: string): Promise<void>
}
```

- [ ] **Step 4: Run integration tests and typecheck**

Run: `npx vitest run src/cabinet/CabinetContext.test.tsx src/auth/AuthContext.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the cabinet context**

```bash
git add -- src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx src/cabinet/CabinetContext.tsx src/cabinet/CabinetContext.test.tsx
git commit -m "feat(web): bind cabinet state to tenant scope"
```

---

### Task 6: Add Canonical Cabinet Paths, Lazy Routes, and Edge Routing

**Files:**
- Create: `src/cabinet/cabinet-paths.ts`
- Create: `src/cabinet/cabinet-paths.test.ts`
- Create: `src/cabinet/ModuleBoundary.tsx`
- Create: `src/cabinet/ModuleBoundary.test.tsx`
- Create: `src/cabinet/screens/module-unavailable.tsx`
- Create: `src/cabinet/screens/cabinet-state.tsx`
- Create: `src/cabinet/screens/not-found.tsx`
- Modify: `src/routes/routes.tsx`
- Modify: `src/routes/routes.test.tsx`
- Modify: `worker/router.ts`
- Modify: `worker/router.test.ts`

**Interfaces:**
- Produces: `cabinetPath(slug, module, suffix?)`, `resolveAccountDestination`, lazy `/app/:tenant/*` route tree, and `ModuleBoundary`.
- Consumes: cabinet registry, policy evaluator, and cabinet context.

- [ ] **Step 1: Write RED route and edge tests**

```ts
it('maps legacy plan selection into tenant billing', () => {
  expect(resolveAccountDestination(tenant, '?section=plans&plan=pro_monthly'))
    .toBe('/app/koval/settings/billing/plans?plan=pro_monthly')
})

it('registers the cabinet parent and lazy children', () => {
  const app = createAppRoutes(false).find((route) => route.path === '/app/:tenant')
  expect(app?.children?.map((route) => route.path)).toContain('dashboard')
  expect(app?.children?.map((route) => route.path)).toContain('settings/billing/plans')
})
```

Worker tests must prove `/app/koval/dashboard` receives `/app.html` with
`X-Robots-Tag: noindex`, while invalid slugs and unrelated unknown paths return
the branded real 404.

- [ ] **Step 2: Run focused route tests and confirm RED**

Run: `npx vitest run src/cabinet/cabinet-paths.test.ts src/cabinet/ModuleBoundary.test.tsx src/routes/routes.test.tsx worker/router.test.ts`

Expected: FAIL because cabinet paths and edge route support do not exist.

- [ ] **Step 3: Implement canonical routing**

Use a slug grammar of `^[a-z0-9](?:[a-z0-9-]{0,62})$`. Add `/app/:tenant`
under `RequireAuth`, lazy-load `CabinetProvider`/shell and every child screen,
and put a cabinet `*` route last. `ModuleBoundary` evaluates the registry entry
and maps decisions to the exact state screens without loading unreleased module
code.

Extend Worker `spaPaths` with the same slug grammar and `/app/<slug>/<child>`;
extend `shouldNoindex` so every `/app` response is private/noindex.

- [ ] **Step 4: Run route and Worker tests**

Run: `npx vitest run src/cabinet/cabinet-paths.test.ts src/cabinet/ModuleBoundary.test.tsx src/routes/routes.test.tsx worker/router.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit routing**

```bash
git add -- src/cabinet/cabinet-paths.ts src/cabinet/cabinet-paths.test.ts src/cabinet/ModuleBoundary.tsx src/cabinet/ModuleBoundary.test.tsx src/cabinet/screens/module-unavailable.tsx src/cabinet/screens/cabinet-state.tsx src/cabinet/screens/not-found.tsx src/routes/routes.tsx src/routes/routes.test.tsx worker/router.ts worker/router.test.ts
git commit -m "feat(web): add tenant cabinet route tree"
```

---

### Task 7: Build the Responsive Shell and Accessible Navigation

**Files:**
- Create: `src/cabinet/CabinetShell.tsx`
- Create: `src/cabinet/CabinetShell.test.tsx`
- Create: `src/cabinet/CabinetNavigation.tsx`
- Create: `src/cabinet/CabinetNavigation.test.tsx`
- Create: `src/cabinet/TenantSwitcher.tsx`
- Create: `src/cabinet/TenantSwitcher.test.tsx`
- Create: `src/cabinet/screens/cabinet-home.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: responsive shell with `<Outlet>`, filtered navigation, tenant switcher, More dialog, and minimal dashboard home.
- Consumes: cabinet context, registry/policy, `BrandLogo`, and `cabinetPath`.

- [ ] **Step 1: Write RED component tests**

```tsx
it('shows only released and allowed links', () => {
  renderShell({ permissions: ['billing.view'], features: [] })
  expect(screen.getByRole('link', { name: 'Головна' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Підписка' })).toBeVisible()
  expect(screen.queryByRole('link', { name: 'Авто' })).not.toBeInTheDocument()
})

it('operates the tenant switcher and More dialog by keyboard', async () => {
  await user.tab()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('dialog', { name: 'Меню кабінету' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ще' })).toHaveFocus()
})
```

Assert `aria-current`, accessible tenant names, 44 px utility classes, and that
switch callbacks are awaited/disabled against double activation.

- [ ] **Step 2: Run component tests and confirm RED**

Run: `npx vitest run src/cabinet/CabinetShell.test.tsx src/cabinet/CabinetNavigation.test.tsx src/cabinet/TenantSwitcher.test.tsx`

Expected: FAIL because shell components are absent.

- [ ] **Step 3: Implement the responsive shell**

Use one semantic link model rendered in three responsive presentations:

```text
desktop: hidden below lg, 280 px labeled sidebar
tablet: hidden below md and at/above lg, 72 px icon rail
mobile: fixed below md, bottom safe-area navigation plus More dialog
```

Do not duplicate access filtering per presentation. The content area uses
`min-w-0`, responsive padding, bottom safe-area compensation, and an overflow
boundary local to data panels rather than the page. Use native dialog semantics
or the installed Radix dialog primitive for focus trap, Escape, and restoration.

- [ ] **Step 4: Run component tests, lint, and typecheck**

Run: `npx vitest run src/cabinet/CabinetShell.test.tsx src/cabinet/CabinetNavigation.test.tsx src/cabinet/TenantSwitcher.test.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit the shell UI**

```bash
git add -- src/cabinet/CabinetShell.tsx src/cabinet/CabinetShell.test.tsx src/cabinet/CabinetNavigation.tsx src/cabinet/CabinetNavigation.test.tsx src/cabinet/TenantSwitcher.tsx src/cabinet/TenantSwitcher.test.tsx src/cabinet/screens/cabinet-home.tsx src/index.css
git commit -m "feat(web): add responsive cabinet navigation"
```

---

### Task 8: Migrate Onboarding, Billing, Account Redirect, and Resume Flows

**Files:**
- Create: `src/cabinet/screens/tenant-onboarding.tsx`
- Create: `src/cabinet/screens/tenant-onboarding.test.tsx`
- Create: `src/cabinet/billing/billing-layout.tsx`
- Create: `src/cabinet/billing/subscription-screen.tsx`
- Create: `src/cabinet/billing/plans-screen.tsx`
- Create: `src/cabinet/billing/payments-screen.tsx`
- Create: `src/cabinet/billing/billing-screens.test.tsx`
- Modify: `src/screens/account.tsx`
- Modify: `src/screens/account.test.tsx`
- Modify: `src/screens/login.tsx`
- Modify: `src/screens/login.test.tsx`
- Modify: `src/auth/post-login.ts`
- Modify: `src/auth/post-login.test.ts`

**Interfaces:**
- Produces: legacy account redirect/onboarding entry, route-based billing screens, and cabinet-aware post-login destinations.
- Consumes: cabinet path helpers, existing billing API, cabinet snapshot, tenant create API, and auth hydrate.

- [ ] **Step 1: Write RED migration tests**

```tsx
it('redirects an authenticated account visit to the selected tenant dashboard', async () => {
  renderAccount('/account')
  expect(await screen.findByLabelText('Поточний маршрут'))
    .toHaveTextContent('/app/koval/dashboard')
})

it('preserves the selected plan in the billing plans route', async () => {
  renderAccount('/account?section=plans&plan=pro_monthly')
  expect(await screen.findByLabelText('Поточний маршрут'))
    .toHaveTextContent('/app/koval/settings/billing/plans?plan=pro_monthly')
})

it('creates the first tenant and enters its dashboard', async () => {
  tenantsApi.create.mockResolvedValue(createdTenant)
  await createTenantWithForm()
  expect(auth.hydrate).toHaveBeenCalled()
  expect(await screen.findByLabelText('Поточний маршрут'))
    .toHaveTextContent('/app/new-yard/dashboard')
})
```

Add tests that invitation resume enters the accepted tenant slug, scan resume
retains its safe route, billing APIs abort on tenant transition, and logout still
navigates to `/` before waiting for the network.

- [ ] **Step 2: Run migration tests and confirm RED**

Run: `npx vitest run src/screens/account.test.tsx src/screens/login.test.tsx src/auth/post-login.test.ts src/cabinet/screens/tenant-onboarding.test.tsx src/cabinet/billing/billing-screens.test.tsx`

Expected: FAIL on old `/account` section behavior and missing cabinet screens.

- [ ] **Step 3: Extract panels and implement compatibility behavior**

Move existing visual/billing logic without changing its business copy or API
semantics. Replace account section buttons with `<Navigate>` compatibility logic
when a tenant exists; retain only first-tenant onboarding when none exists.
Billing screens consume the cabinet snapshot for subscription state and load
plans/payments with tenant-scoped signals. Invitation acceptance/hydration uses
the accepted tenant from the refreshed list and builds its slug route.
Read surfaces require `billing.view`; subscribe, cancel, and checkout controls
use `AccessGate` plus `requireModuleMutation` with `billing.manage` before the
request is dispatched.

- [ ] **Step 4: Run migration and auth regression suites**

Run: `npx vitest run src/screens/account.test.tsx src/screens/login.test.tsx src/auth/post-login.test.ts src/cabinet/screens/tenant-onboarding.test.tsx src/cabinet/billing/billing-screens.test.tsx src/auth/guards.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the migrated flows**

```bash
git add -- src/cabinet/screens/tenant-onboarding.tsx src/cabinet/screens/tenant-onboarding.test.tsx src/cabinet/billing/billing-layout.tsx src/cabinet/billing/subscription-screen.tsx src/cabinet/billing/plans-screen.tsx src/cabinet/billing/payments-screen.tsx src/cabinet/billing/billing-screens.test.tsx src/screens/account.tsx src/screens/account.test.tsx src/screens/login.tsx src/screens/login.test.tsx src/auth/post-login.ts src/auth/post-login.test.ts
git commit -m "refactor(web): move account flows into cabinet"
```

---

### Task 9: Add Browser Coverage for Isolation, Responsive Layout, and Accessibility

**Files:**
- Modify: `e2e/auth-session.spec.ts`
- Create: `e2e/cabinet-shell.spec.ts`

**Interfaces:**
- Produces: deterministic real-browser proof for the cabinet shell and merge-gating `@cabinet-smoke` scenarios.
- Consumes: existing loopback Worker/upstream fixture and API boundary helpers.

- [ ] **Step 1: Extend the fixture and write RED E2E scenarios**

The route fixture must return tenant-specific `/api/v1/me/permissions` and
subscription payloads based on `X-Tenant-Id`, and support a delayed tenant A
response released after B commits.

```ts
test('never renders former tenant access during a delayed switch @cabinet-smoke', async ({ page }) => {
  await loginFrom(page)
  await expect(page).toHaveURL('/app/koval/dashboard')
  await page.getByRole('button', { name: 'Змінити розбірку' }).click()
  await page.getByRole('option', { name: 'Розбірка Соболя' }).click()
  await expect(page).toHaveURL('/app/sobol/dashboard')
  await releaseDelayedKovalResponse()
  await expect(page.getByText('Розбірка Коваль')).not.toBeVisible()
  await expect(page.getByText('Розбірка Соболя')).toBeVisible()
})

for (const width of [320, 768, 1024, 1440]) {
  test(`has no page overflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await loginFrom(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
```

Add keyboard-only More-dialog navigation, focus restoration, direct URL versus
visible navigation parity, unavailable module, denied module, unknown tenant,
and branded cabinet 404 tests.

- [ ] **Step 2: Run Chromium and confirm RED**

Run: `npx playwright test e2e/cabinet-shell.spec.ts --project=chromium --reporter=line`

Expected: FAIL before shell routes and fixture behavior are complete.

- [ ] **Step 3: Make only test-fixture corrections required by real flows**

Keep production controls out of the application. Extend the existing
Playwright route fixture with deterministic permissions, per-tenant delays, and
request stats. Do not add `window.__test` state or production bypass flags.

- [ ] **Step 4: Run focused and cross-browser smoke suites**

Run:

```bash
npx playwright test e2e/cabinet-shell.spec.ts --project=chromium --reporter=line
npx playwright test --grep '@auth-smoke|@cabinet-smoke' --reporter=line
```

Expected: all focused Chromium tests and all configured Chromium, Firefox,
WebKit, Android, and iOS smoke projects pass.

- [ ] **Step 5: Commit browser coverage**

```bash
git add -- e2e/auth-session.spec.ts e2e/cabinet-shell.spec.ts
git commit -m "test(web): cover tenant cabinet boundaries"
```

---

### Task 10: Full Verification, Review, and Delivery

**Files:**
- Create: `.superpowers/sdd/2026-08-14-roz-40-responsive-cabinet-shell/task-report.md`; this path is intentionally gitignored.

**Interfaces:**
- Produces: review-ready branch, clean verification evidence, PR, and QA validation.
- Consumes: every earlier task.

- [ ] **Step 1: Run repository verification**

```bash
npm run check
npm run build:qa
npm run check:artifact:qa
npm run budget:assets
npx wrangler deploy --dry-run --env qa
git diff --check
```

Expected: dependency health, typecheck, lint, format, unit/integration tests, QA
origin gate, asset budget, Worker dry-run, and whitespace validation all pass.

- [ ] **Step 2: Run full browser verification**

Run: `npm run test:e2e`

Expected: zero unexpected failures across all configured projects.

- [ ] **Step 3: Perform a scope and security self-review**

Review every changed file against the design, specifically checking:

- direct URL and navigation use identical policies;
- old tenant signals and registered state clear before new persistence;
- no stale generation commits;
- access network failure is not displayed as denial;
- hidden unreleased modules cannot import business code;
- `/app` is always noindex at the Worker;
- no credentials, access tokens, or tenant data enter localStorage;
- existing user changes in the checkout remain untouched.

- [ ] **Step 4: Request an independent read-only code review and fix findings with RED tests**

Any Critical or Important finding gets a failing regression test, minimal fix,
affected verification, and then the full commands from Steps 1-2 again. Do not
accept a finding without reproducing or disproving it from code and tests. If a
finding exists, append a review-fix task to this plan with its exact files,
test, implementation, verification, and commit command before editing code. If
review finds nothing, record that result in the task report.

- [ ] **Step 5: Publish and validate**

After explicit authorization, push the branch, create one draft PR targeting
`develop`, wait for checks, deploy the verified QA artifact, and run the
authenticated QA smoke flow. Production deployment remains out of scope.

---

### Task 11: Review Fix — Canonical Tenant Root and Serialized Switching

**Files:**
- Modify: `worker/router.ts`
- Modify: `worker/router.test.ts`
- Modify: `src/cabinet/tenant-transition.ts`
- Modify: `src/cabinet/tenant-transition.test.ts`
- Modify: `src/cabinet/CabinetContext.tsx`
- Modify: `src/cabinet/CabinetContext.test.tsx`
- Modify: `e2e/cabinet-shell.spec.ts`

- [ ] **Step 1: Add RED regressions**

Add tests proving `/app/<valid-slug>` and `/app/<valid-slug>/` reach the
noindex SPA and redirect client-side to the tenant dashboard; a delayed B reset
cannot finish after C commits or mutate C-owned state; and tenant switching
preserves the current suffix only when the target snapshot's shared view policy
allows it, otherwise replacing the route with the target dashboard.

- [ ] **Step 2: Implement the minimal architecture fix**

Allow an optional child path in the Worker tenant-route matcher. Serialize
destructive reset work across generations before any newer transition can
persist/load/commit. After a committed tenant transition, resolve the current
registered suffix against the committed target snapshot with the central policy
and apply the allowed-route-or-dashboard fallback without duplicating access
rules.

- [ ] **Step 3: Verify and commit**

Run focused Worker/transition/context tests, focused Chromium cabinet routing,
`npm run check`, QA build/artifact, Worker dry-run, and `git diff --check`.

```bash
git add -- worker/router.ts worker/router.test.ts src/cabinet/tenant-transition.ts src/cabinet/tenant-transition.test.ts src/cabinet/CabinetContext.tsx src/cabinet/CabinetContext.test.tsx e2e/cabinet-shell.spec.ts
git commit -m "fix(web): serialize tenant route transitions"
```

---

### Task 12: Review Fix — Truthful Billing Failures and Mobile Payments

**Files:**
- Modify: `src/cabinet/billing/plans-screen.tsx`
- Modify: `src/cabinet/billing/subscription-screen.tsx`
- Modify: `src/cabinet/billing/payments-screen.tsx`
- Modify: `src/cabinet/billing/billing-screens.test.tsx`
- Modify: `e2e/cabinet-shell.spec.ts`

- [ ] **Step 1: Add RED error and responsive regressions**

Cover plans/payments load network failures, backend 403/409 mutation failures,
subscription cancellation rejection, and scope-rotation aborts. Add populated
pending-payment browser coverage at 320 and 768 pixels that measures document
overflow and every action target.

- [ ] **Step 2: Implement truthful state and layout behavior**

Use discriminated loading/empty/error/mutation-error states; ignore only
recognized scope-cancellation; normalize backend problems into truthful,
retryable or policy-specific feedback. Keep immediate latest-snapshot policy
rechecks. Stack or wrap pending payment content below `sm`, retain `min-w-0`,
and make every released payment action at least 44 by 44 pixels.

- [ ] **Step 3: Verify and commit**

Run focused billing tests, focused Chromium widths/errors, `npm run check`, QA
build/artifact, and `git diff --check`.

```bash
git add -- src/cabinet/billing/plans-screen.tsx src/cabinet/billing/subscription-screen.tsx src/cabinet/billing/payments-screen.tsx src/cabinet/billing/billing-screens.test.tsx e2e/cabinet-shell.spec.ts
git commit -m "fix(web): surface cabinet billing failures"
```

---

### Task 13: Review Fix — Cabinet Recovery Actions and Rail Labels

**Files:**
- Modify: `src/cabinet/CabinetContext.tsx`
- Modify: `src/cabinet/CabinetContext.test.tsx`
- Modify: `src/cabinet/CabinetNavigation.tsx`
- Modify: `src/cabinet/CabinetNavigation.test.tsx`
- Modify: `src/cabinet/screens/module-unavailable.tsx`
- Modify: `src/cabinet/ModuleBoundary.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add RED accessibility/recovery regressions**

Cover dashboard recovery from unreleased modules, usable tenant/home recovery
from unknown and inactive tenant states, and visible tablet-rail labels on both
keyboard focus and pointer hover for navigation, tenant switch, and logout.

- [ ] **Step 2: Implement accessible recovery affordances**

Reuse canonical cabinet paths and active tenant membership; never fall back to
an unauthorized tenant. Add focus/hover tooltips that complement existing
accessible names without duplicating policy or breaking dialog/focus behavior.

- [ ] **Step 3: Verify and commit**

Run focused context/navigation/module tests, accessibility lint, `npm run check`,
build, and `git diff --check`.

```bash
git add -- src/cabinet/CabinetContext.tsx src/cabinet/CabinetContext.test.tsx src/cabinet/CabinetNavigation.tsx src/cabinet/CabinetNavigation.test.tsx src/cabinet/screens/module-unavailable.tsx src/cabinet/ModuleBoundary.test.tsx src/index.css
git commit -m "fix(web): add cabinet recovery affordances"
```

---

### Task 14: Repeat Full Verification, Review, and Authorized Delivery

Re-run every Task 10 repository and browser command after Tasks 11–13, request
a new independent full-branch read-only review, resolve any Critical or
Important findings with RED tests, and update the ignored final report. Push,
draft PR creation, QA deployment, and authenticated QA validation still require
explicit user authorization. Production deployment remains out of scope.

---

### Task 15: Review Fix — Non-Sensitive Member Entitlements

**Core files (isolated `vsobol/roz-40-core-entitlement-summary` worktree):**
- Modify: `src/Rozbirka.Application/Billing/DTOs/SubscriptionDto.cs`
- Modify: `src/Rozbirka.Application/Billing/ISubscriptionService.cs`
- Modify: `src/Rozbirka.Application/Billing/SubscriptionService.cs`
- Modify: `src/Rozbirka.API/Controllers/MeController.cs`
- Modify: `src/Rozbirka.API/Middleware/TenantMiddleware.cs`
- Modify: `tests/Rozbirka.Tests/Auth/MeControllerTests.cs`
- Create: `tests/Rozbirka.Tests/Auth/TenantMiddlewareEntitlementTests.cs`
- Modify: `tests/Rozbirka.Tests/Billing/SubscriptionServiceTests.cs`
- Modify interface fakes required by the new read method.

**Web files:**
- Modify: `src/cabinet/access-types.ts`
- Modify: `src/cabinet/access-api.test.ts`
- Modify: `src/cabinet/tenant-transition.ts`
- Modify: `src/cabinet/tenant-transition.test.ts`
- Modify: `src/cabinet/policy.ts`
- Modify: `src/cabinet/policy.test.ts`
- Modify access fixtures in `src/cabinet/CabinetContext.test.tsx`,
  `e2e/auth-session.spec.ts`, and `e2e/cabinet-shell.spec.ts`.

- [x] **Step 1: Add RED backend contract and scope regressions**

Prove `GET /api/v1/me/permissions` returns an entitlement summary containing
only billing state and quota usage for real built-in Manager/Master permission
sets, without prices, card data, payment data, billing-account IDs, or provider
customer IDs. Prove a blocked active member can reach this endpoint, while an
inactive or non-member tenant remains forbidden. Add a service regression that
the summary is mapped from the backend subscription/limit source of truth.

- [x] **Step 2: Add RED web policy and transport regressions**

Prove an active Manager can view an entitled cars module without
`billing.view`; a blocked entitlement returns `subscription-blocked`; a
quota-full Master retains read access but receives `quota-exhausted` for a
consuming mutation; and a transition without `billing.view` never calls the
detailed `/billing/subscription` loader. Use the exact built-in Manager/Master
permission sets, not role-name authorization.

- [x] **Step 3: Implement the minimal secure contract**

Extend `/me/permissions` additively with `entitlement: { state, usage }` for an
exact authenticated tenant member. Map it through `ISubscriptionService`
without exposing the detailed `SubscriptionDto`; keep the billing controller
and `billing.view` rules unchanged. Permit this one access endpoint through the
blocked-plan middleware gate only, preserving inactive/member checks. On web,
store a separately immutable entitlement snapshot and make shared module policy
consume it; retain the detailed subscription only for billing-authorized UI.
Missing entitlement from an older backend remains fail-closed.

- [x] **Step 4: Verify and commit both repositories**

Run focused core/web regressions, full core tests, `npm run check`, QA build and
artifact verification, asset budget, Worker QA dry-run, affected Playwright in
all five projects, and `git diff --check` in both repositories. Commit the core
and web changes separately; do not push, create a PR, or deploy.

---

### Task 16: Final Review Fix — Serialized Departure and Fixture/A11y Hardening

**Lifecycle files:**
- Create: `src/cabinet/tenant-scope-lifecycle.ts`
- Modify: `src/cabinet/CabinetContext.tsx`
- Modify: `src/cabinet/CabinetContext.test.tsx`
- Modify: `src/cabinet/tenant-transition.ts`

**Fixture/accessibility files:**
- Modify: `src/cabinet/billing/subscription-screen.tsx`
- Modify: `src/cabinet/screens/tenant-onboarding.tsx`
- Modify: `e2e/auth-session.spec.ts`
- Modify: `e2e/cabinet-shell.spec.ts`

- [x] **Step 1: Add RED departure regressions**

Use scope-keyed registered cache resets to prove logout and invite-style
provider replacement clear the captured committed A scope exactly once, never
clear replacement B, and block B access/content until a delayed A clear settles.

- [x] **Step 2: Serialize provider-owned departure**

Track the last committed scope with an immutable lease handle. Start its shared
registry clear synchronously on every invalidation/unmount, reuse the same
promise for duplicate cleanup, and make replacement transitions await the
captured lease rather than reading mutable replacement auth state.

- [ ] **Step 3: Add RED fixture and computed-target regressions**

Probe recognized auth fixture routes with unsupported methods and require 405,
while preserving the real session Worker flow. At 320 and 768 widths, prove the
over-quota upgrade and onboarding logout controls compute to at least 44 by 44
pixels.

- [ ] **Step 4: Implement minimal fixture/a11y hardening**

Dispatch fixture responses by explicit route and method, return 405 for known
unsupported methods, and add `min-h-11 min-w-11` to the two compact controls.

- [ ] **Step 5: Verify and commit without publication**

Run focused unit/browser tests, full `npm run check`, QA build/artifact and asset
budget checks, Wrangler QA dry-run, diff checks, and sequential read-only review.
Commit lifecycle and fixture/a11y changes logically; do not push or deploy.
