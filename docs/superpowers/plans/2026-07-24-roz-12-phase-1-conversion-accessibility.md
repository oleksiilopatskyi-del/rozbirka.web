# ROZ-12 Phase 1 Conversion and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the landing conversion path, preserve selected plans through authentication, add accessible mobile navigation and disclosures, and make the existing layout responsive without redesigning it.

**Architecture:** A small pure `plan-selection` module owns supported plan codes and URL construction. Landing components consume that contract, while login and account parse the same validated URL state. Existing site components retain their visual system and gain explicit accessible state for mobile navigation, store availability, carousel playback, FAQ panels, and the semantic hero heading.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Tailwind CSS 4, Vite 8, Vitest 4, Testing Library

## Global Constraints

- App Store URL is exactly `https://apps.apple.com/ua/app/rozbirka/id6762130912`.
- Google Play is unavailable and must render as non-interactive "Скоро" content.
- Remove the demo CTA; do not create a replacement destination.
- Never start checkout automatically after login or registration.
- Persist selected plans in the URL only; do not use localStorage or sessionStorage.
- Accept only `lite_monthly`, `pro_monthly`, and `enterprise_monthly`.
- Preserve existing colors, typography, shapes, content hierarchy, and dark visual identity.
- This phase does not change plan limits, prices, feature claims, trial copy, assets, SEO files, prototype routes, or Cloudflare behavior.

---

## File Structure

- `src/lib/plan-selection.ts`: supported plan-code type, validation, and URL builders.
- `src/lib/plan-selection.test.ts`: pure plan parsing and destination contract.
- `src/components/site/store-badges.tsx`: verified App Store link and unavailable Google Play presentation.
- `src/components/site/store-badges.test.tsx`: store destination semantics.
- `src/components/site/hero.tsx`: real registration CTA and stable accessible H1.
- `src/components/site/hero.test.tsx`: hero CTA and heading semantics.
- `src/components/site/pricing.tsx`: auth-aware plan links and responsive grid.
- `src/components/site/pricing.test.tsx`: guest/authenticated destination coverage.
- `src/screens/login.tsx`: validated post-auth plan destination.
- `src/screens/login.test.tsx`: selected-plan preservation through OTP success.
- `src/auth/guards.tsx`: preserves a valid requested plan for already-authenticated users.
- `src/screens/account.tsx`: URL-driven plans section and selected-plan styling.
- `src/screens/account.test.tsx`: account plan-selection coverage.
- `src/components/site/header.tsx`: accessible mobile menu.
- `src/components/site/header.test.tsx`: mobile disclosure behavior.
- `src/components/site/nav-links.tsx`: optional disclosure-close callback.
- `src/components/site/cta-banner.tsx`: responsive store destinations in normal flow.
- `src/components/site/features.tsx`: accessible carousel controls and pause state.
- `src/components/site/features.test.tsx`: manual pause and reduced-motion behavior.
- `src/components/site/faq.tsx`: closed panels removed from the accessibility tree.
- `src/components/site/faq.test.tsx`: disclosure semantics.
- `src/index.css`: two-tone focus indicator.

### Task 1: Plan Selection Contract

**Files:**

- Create: `src/lib/plan-selection.ts`
- Create: `src/lib/plan-selection.test.ts`

**Interfaces:**

- Produces: `PlanCode`, `isPlanCode(value)`, `readPlanCode(search)`, `loginPathForPlan(planCode)`, `accountPathForPlan(planCode)`, and `postAuthPath(search, fallback)`
- Consumes: standard `URLSearchParams`

- [ ] **Step 1: Write the failing pure contract tests**

Create `src/lib/plan-selection.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  accountPathForPlan,
  isPlanCode,
  loginPathForPlan,
  postAuthPath,
  readPlanCode,
} from './plan-selection'

describe('plan selection', () => {
  it.each(['lite_monthly', 'pro_monthly', 'enterprise_monthly'])(
    'accepts supported plan %s',
    (planCode) => {
      expect(isPlanCode(planCode)).toBe(true)
      expect(readPlanCode(`?plan=${planCode}`)).toBe(planCode)
    },
  )

  it('rejects missing and unknown plan codes', () => {
    expect(readPlanCode('')).toBeNull()
    expect(readPlanCode('?plan=unknown')).toBeNull()
  })

  it('builds stable login and account destinations', () => {
    expect(loginPathForPlan('pro_monthly')).toBe(
      '/login?plan=pro_monthly',
    )
    expect(accountPathForPlan('pro_monthly')).toBe(
      '/account?section=plans&plan=pro_monthly',
    )
  })

  it('uses the account plans destination only for a valid requested plan', () => {
    expect(postAuthPath('?plan=lite_monthly', '/account')).toBe(
      '/account?section=plans&plan=lite_monthly',
    )
    expect(postAuthPath('?plan=unknown', '/account')).toBe('/account')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/lib/plan-selection.test.ts
```

Expected: FAIL because `./plan-selection` does not exist.

- [ ] **Step 3: Implement the pure plan-selection module**

Create `src/lib/plan-selection.ts`:

```ts
export const planCodes = [
  'lite_monthly',
  'pro_monthly',
  'enterprise_monthly',
] as const

export type PlanCode = (typeof planCodes)[number]

export function isPlanCode(value: string | null): value is PlanCode {
  return planCodes.includes(value as PlanCode)
}

export function readPlanCode(search: string): PlanCode | null {
  const value = new URLSearchParams(search).get('plan')
  return isPlanCode(value) ? value : null
}

export function loginPathForPlan(planCode: PlanCode): string {
  return `/login?plan=${planCode}`
}

export function accountPathForPlan(planCode: PlanCode): string {
  return `/account?section=plans&plan=${planCode}`
}

export function postAuthPath(search: string, fallback: string): string {
  const planCode = readPlanCode(search)
  return planCode ? accountPathForPlan(planCode) : fallback
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/lib/plan-selection.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit the plan-selection contract**

```bash
git add src/lib/plan-selection.ts src/lib/plan-selection.test.ts
git commit -m "feat: add landing plan selection contract"
```

### Task 2: Store and Landing Conversion Destinations

**Files:**

- Create: `src/components/site/store-badges.test.tsx`
- Create: `src/components/site/hero.test.tsx`
- Create: `src/components/site/pricing.test.tsx`
- Modify: `src/components/site/store-badges.tsx`
- Modify: `src/components/site/hero.tsx`
- Modify: `src/components/site/pricing.tsx`
- Modify: `src/components/site/cta-banner.tsx`

**Interfaces:**

- Consumes: `PlanCode`, `loginPathForPlan`, `accountPathForPlan`, and `useAuth()`
- Produces: verified store destinations, no demo fragment, auth-aware pricing links, and tablet-safe layout classes

- [ ] **Step 1: Write failing store destination tests**

Create `src/components/site/store-badges.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppStoreBadge, GooglePlayBadge } from './store-badges'

describe('store badges', () => {
  it('links App Store to the verified production listing', () => {
    render(<AppStoreBadge />)
    expect(screen.getByRole('link', { name: /app store/i })).toHaveAttribute(
      'href',
      'https://apps.apple.com/ua/app/rozbirka/id6762130912',
    )
  })

  it('renders Google Play as unavailable content instead of a link', () => {
    render(<GooglePlayBadge />)
    expect(screen.queryByRole('link', { name: /google play/i })).toBeNull()
    expect(screen.getByText('Скоро')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Write failing pricing destination tests**

Create `src/components/site/pricing.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/auth/AuthContext'
import { Pricing } from './pricing'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

const mockedUseAuth = vi.mocked(useAuth)

describe('Pricing destinations', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      status: 'guest',
      user: null,
      tenant: null,
      tenants: [],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
  })

  it('sends guests through login with the selected plan', () => {
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /почати 7 днів/i })).toHaveAttribute(
      'href',
      '/login?plan=pro_monthly',
    )
  })

  it('sends authenticated users directly to the selected account plan', () => {
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: null,
      tenant: null,
      tenants: [],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /почати 7 днів/i })).toHaveAttribute(
      'href',
      '/account?section=plans&plan=pro_monthly',
    )
  })
})
```

- [ ] **Step 3: Write the failing hero semantics test**

Create `src/components/site/hero.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Hero } from './hero'

describe('Hero conversion', () => {
  it('exposes a stable heading and a real registration destination', () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Знаєш де кожна деталь і де твої гроші',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Спробувати безкоштовно' }),
    ).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Дивитись демо' })).toBeNull()
  })
})
```

- [ ] **Step 4: Run the three test files and verify RED**

Run:

```bash
npm test -- src/components/site/store-badges.test.tsx src/components/site/pricing.test.tsx src/components/site/hero.test.tsx
```

Expected: store tests FAIL because both badges link to `#`; pricing tests FAIL
because links route to `/login` without a plan.

- [ ] **Step 5: Implement explicit store availability**

Refactor `src/components/site/store-badges.tsx` so the exported components use
the same visual content but different semantics:

```tsx
const APP_STORE_URL =
  'https://apps.apple.com/ua/app/rozbirka/id6762130912'

export function AppStoreBadge() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Завантажити в App Store"
      className="flex min-h-12 items-center gap-2.5 rounded-full bg-black px-4 ring-1 ring-white/10 transition-colors hover:bg-white/[0.08]"
    >
      <AppleLogo className="size-7 text-white" />
      <StoreBadgeText line1="Available on the" line2="App Store" />
    </a>
  )
}

export function GooglePlayBadge() {
  return (
    <div
      aria-label="Google Play — скоро"
      className="flex min-h-12 items-center gap-2.5 rounded-full bg-black/70 px-4 text-white/70 ring-1 ring-white/10"
    >
      <GooglePlayLogo className="size-6 opacity-70" />
      <StoreBadgeText line1="Google Play" line2="Скоро" />
    </div>
  )
}

function StoreBadgeText({ line1, line2 }: { line1: string; line2: string }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="text-[10px] tracking-wide text-neutral-300">{line1}</span>
      <span className="mt-0.5 text-[15px] font-semibold text-white">{line2}</span>
    </div>
  )
}
```

Keep the existing `AppleLogo` and `GooglePlayLogo` SVG functions unchanged.

- [ ] **Step 6: Replace hero fragments with the real registration route**

In `src/components/site/hero.tsx`:

- import `Link` from `react-router`;
- remove `ArrowUpRight`;
- render a stable accessible heading:

```tsx
<h1 className="text-[52px] leading-[1] font-light tracking-[-0.035em] sm:text-[76px] lg:text-[108px]">
  <span className="sr-only">Знаєш де кожна деталь і де твої гроші</span>
  <span aria-hidden>
    <TypewriterHeading lines={heroLines} />
  </span>
</h1>
```

- replace both old CTA anchors with:

```tsx
<Link
  to="/login"
  className="bg-brand hover:bg-brand-hover text-brand-foreground inline-flex min-h-[72px] items-center rounded-full px-12 text-[16px] font-normal transition-all duration-300 hover:scale-[1.03]"
>
  Спробувати безкоштовно
</Link>
```

- [ ] **Step 7: Make pricing links auth-aware and tablet-safe**

In `src/components/site/pricing.tsx`:

- add `code: PlanCode` to `Plan`;
- assign `lite_monthly`, `pro_monthly`, and `enterprise_monthly` to the three
  plan objects;
- call `const { status } = useAuth()` inside `Pricing`;
- compute each destination with:

```ts
const destination =
  status === 'authenticated'
    ? accountPathForPlan(plan.code)
    : loginPathForPlan(plan.code)
```

- pass `destination` into `PlanCard`;
- change the grid to:

```tsx
<ul role="list" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
```

- render the card link as `<Link to={destination}>`.

- [ ] **Step 8: Put CTA store destinations in normal flow**

In `src/components/site/cta-banner.tsx`, remove the dangling
`href="#download-app"` button and the `Download` import. Place the badges after
the paragraph:

```tsx
<div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
  <AppStoreBadge />
  <GooglePlayBadge />
</div>
```

Delete the absolutely positioned store-badge container. Keep the decorative
phone image desktop-only.

- [ ] **Step 9: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/components/site/store-badges.test.tsx src/components/site/pricing.test.tsx src/components/site/hero.test.tsx
```

Expected: 5 tests PASS.

- [ ] **Step 10: Commit conversion destinations**

```bash
git add src/components/site/store-badges.tsx src/components/site/store-badges.test.tsx src/components/site/hero.tsx src/components/site/hero.test.tsx src/components/site/pricing.tsx src/components/site/pricing.test.tsx src/components/site/cta-banner.tsx
git commit -m "feat: fix landing conversion destinations"
```

### Task 3: Preserve Plan Selection Through Authentication

**Files:**

- Modify: `src/screens/login.tsx`
- Create: `src/screens/login.test.tsx`
- Modify: `src/auth/guards.tsx`
- Modify: `src/screens/account.tsx`
- Modify: `src/screens/account.test.tsx`
- Create: `src/auth/guards.test.tsx`

**Interfaces:**

- Consumes: `readPlanCode`, `postAuthPath`, and `PlanCode`
- Produces: plan-aware login redirects and account selected-plan presentation

- [ ] **Step 1: Add failing account URL-selection coverage**

Extend `src/screens/account.test.tsx`:

```tsx
it('opens and marks the plan requested in the URL', async () => {
  getSubscription.mockResolvedValue(subscription)
  getPlans.mockResolvedValue([
    {
      code: 'pro_monthly',
      name: 'Pro',
      amount: 59,
      currency: 'USD',
      interval: '1m',
      trialDays: 7,
      limits: {
        cars: 20,
        intakes: 25,
        parts: 2000,
        users: 5,
        cashRegisters: 2,
        photosPerPart: null,
      },
      features: [],
    },
  ])

  render(
    <MemoryRouter
      initialEntries={['/account?section=plans&plan=pro_monthly']}
    >
      <AccountScreen />
    </MemoryRouter>,
  )

  expect(await screen.findByText('Обрано')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: 'Тарифи' }),
  ).toBeInTheDocument()
})
```

- [ ] **Step 2: Add failing login plan-preservation coverage**

Create `src/screens/login.test.tsx`:

```tsx
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
  vi.mocked(authApi.otpSend).mockResolvedValue({
    retryAfterSeconds: 60,
    cooldownSeconds: 60,
  })
  vi.mocked(authApi.otpVerify).mockResolvedValue({
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
  ).toHaveAttribute(
    'href',
    '/account?section=plans&plan=pro_monthly',
  )
})
```

- [ ] **Step 3: Add failing authenticated guard coverage**

Create `src/auth/guards.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from './AuthContext'
import { RedirectIfAuth } from './guards'

vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }))

function LocationProbe() {
  const location = useLocation()
  return <span>{location.pathname + location.search}</span>
}

it('preserves a valid plan when redirecting an authenticated user', () => {
  vi.mocked(useAuth).mockReturnValue({
    status: 'authenticated',
    user: null,
    tenant: null,
    tenants: [],
    hydrate: vi.fn(),
    switchTenant: vi.fn(),
    signOut: vi.fn(),
  })

  render(
    <MemoryRouter initialEntries={['/login?plan=pro_monthly']}>
      <Routes>
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <span>login</span>
            </RedirectIfAuth>
          }
        />
        <Route
          path="/account"
          element={<LocationProbe />}
        />
      </Routes>
    </MemoryRouter>,
  )

  expect(
    screen.getByText('/account?section=plans&plan=pro_monthly'),
  ).toBeInTheDocument()
})
```

- [ ] **Step 4: Run the account, login, and guard tests and verify RED**

Run:

```bash
npm test -- src/screens/account.test.tsx src/screens/login.test.tsx src/auth/guards.test.tsx
```

Expected: account test FAILS because the subscription section opens; guard test
FAILS because the plan query is dropped; login test FAILS because the success
link still points to `/account`.

- [ ] **Step 5: Preserve the validated plan in login and auth guard**

In `src/screens/login.tsx`:

```ts
const fallbackReturnTo =
  (location.state as { from?: string } | null)?.from ?? '/account'
const returnTo = postAuthPath(location.search, fallbackReturnTo)
```

Import `postAuthPath`. Pass `returnTo` into `SuccessStep`, change its signature
to `function SuccessStep({ returnTo }: { returnTo: string })`, and use
`<Link to={returnTo}>`.

In `src/auth/guards.tsx`, call `useLocation()` inside `RedirectIfAuth` and
replace the authenticated destination with:

```tsx
if (status === 'authenticated') {
  return <Navigate to={postAuthPath(location.search, to)} replace />
}
```

- [ ] **Step 6: Initialize account plan state from validated URL state**

In `src/screens/account.tsx`:

```ts
const [searchParams] = useSearchParams()
const requestedSection = searchParams.get('section')
const selectedPlanCode = readPlanCode(`?${searchParams.toString()}`)
const [section, setSection] = useState<Section>(
  requestedSection === 'plans' ? 'plans' : 'subscription',
)
```

Pass `selectedPlanCode` into `PlansPanel`. Add
`selectedPlanCode: PlanCode | null` to its props. In the card map:

```ts
const isSelected = plan.code === selectedPlanCode
```

Add `ring-2 ring-brand` when `isSelected`, and render:

```tsx
{isSelected && (
  <span className="text-[11px] uppercase tracking-[0.05em] opacity-70">
    Обрано
  </span>
)}
```

Preserve the existing "Поточний" indicator when there is no selected-plan
indicator for that card.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/lib/plan-selection.test.ts src/screens/account.test.tsx src/screens/login.test.tsx src/auth/guards.test.tsx
```

Expected: all plan-selection, account, and guard tests PASS.

- [ ] **Step 8: Commit the authenticated plan flow**

```bash
git add src/screens/login.tsx src/screens/login.test.tsx src/auth/guards.tsx src/auth/guards.test.tsx src/screens/account.tsx src/screens/account.test.tsx
git commit -m "feat: preserve selected landing plan"
```

### Task 4: Accessible Mobile Navigation

**Files:**

- Create: `src/components/site/header.test.tsx`
- Modify: `src/components/site/header.tsx`
- Modify: `src/components/site/nav-links.tsx`

**Interfaces:**

- Consumes: existing `NavLinks`, store badge variants, and `useAuth()`
- Produces: an accessible mobile disclosure with Escape and link-close behavior

- [ ] **Step 1: Write failing mobile menu tests**

Create `src/components/site/header.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '@/auth/AuthContext'
import { SiteHeader } from './header'

vi.mock('@/auth/AuthContext', () => ({ useAuth: vi.fn() }))

describe('SiteHeader mobile menu', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      status: 'guest',
      user: null,
      tenant: null,
      tenants: [],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
  })

  it('opens and closes an accessible navigation disclosure', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('button', { name: 'Відкрити меню' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Мобільна навігація' }))
      .toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes after a landing navigation link is selected', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Відкрити меню' }))
    const mobileNav = screen.getByRole('navigation', {
      name: 'Мобільна навігація',
    })
    await user.click(within(mobileNav).getByRole('link', { name: 'Можливості' }))
    expect(
      screen.getByRole('button', { name: 'Відкрити меню' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/components/site/header.test.tsx
```

Expected: FAIL because there is no menu trigger or mobile navigation.

- [ ] **Step 3: Implement the mobile disclosure**

In `src/components/site/header.tsx`:

- import `useEffect`, `useRef`, `useState`, `Menu`, and `X`;
- add `open` state and `triggerRef`;
- register an Escape listener only while open:

```ts
useEffect(() => {
  if (!open) return
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    setOpen(false)
    triggerRef.current?.focus()
  }
  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}, [open])
```

- replace the mobile login-only link with a menu button:

```tsx
<button
  ref={triggerRef}
  type="button"
  aria-expanded={open}
  aria-controls="mobile-site-menu"
  aria-label={open ? 'Закрити меню' : 'Відкрити меню'}
  onClick={() => setOpen((value) => !value)}
  className="grid size-11 place-items-center rounded-full text-white ring-1 ring-white/15 lg:hidden"
>
  {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
</button>
```

- after the desktop nav row, conditionally render:

```tsx
{open && (
  <nav
    id="mobile-site-menu"
    aria-label="Мобільна навігація"
    className="mt-3 flex flex-col gap-4 rounded-[28px] bg-surface-1 p-5 ring-1 ring-white/[0.06] lg:hidden"
  >
    <NavLinks className="flex-col items-stretch" onNavigate={() => setOpen(false)} />
    <div className="flex flex-col gap-3 sm:flex-row">
      <AppStoreBadge />
      <GooglePlayBadge />
    </div>
    <Link
      to={isAuthed ? '/account' : '/login'}
      onClick={() => setOpen(false)}
      className="bg-brand text-brand-foreground inline-flex min-h-11 items-center justify-center rounded-full px-5"
    >
      {isAuthed ? 'Кабінет' : 'Увійти'}
    </Link>
  </nav>
)}
```

Add optional `onNavigate?: () => void` to `NavLinksProps` and call it from each
anchor's `onClick`.

- [ ] **Step 4: Run the header test and verify GREEN**

Run:

```bash
npm test -- src/components/site/header.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit mobile navigation**

```bash
git add src/components/site/header.tsx src/components/site/header.test.tsx src/components/site/nav-links.tsx
git commit -m "feat: add accessible mobile navigation"
```

### Task 5: Carousel, FAQ, Focus, and Responsive Accessibility

**Files:**

- Create: `src/components/site/features.test.tsx`
- Create: `src/components/site/faq.test.tsx`
- Modify: `src/components/site/features.tsx`
- Modify: `src/components/site/faq.tsx`
- Modify: `src/index.css`
- Modify: `src/components/site/site-footer.tsx`
- Modify: `src/components/site/hero.tsx`
- Modify: `src/components/site/pricing.tsx`

**Interfaces:**

- Produces: keyboard-visible carousel controls, explicit pause state, reduced-motion behavior, inaccessible closed FAQ panels, and a two-tone focus ring

- [ ] **Step 1: Write failing FAQ semantics tests**

Create `src/components/site/faq.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { FAQ } from './faq'

it('removes closed answers from the accessibility tree', async () => {
  const user = userEvent.setup()
  render(<FAQ />)
  const first = screen.getByRole('button', {
    name: 'Чи бачу я прибуток окремо по кожному авто?',
  })
  expect(
    screen.getByRole('region', {
      name: 'Чи бачу я прибуток окремо по кожному авто?',
    }),
  ).toBeInTheDocument()

  await user.click(first)

  expect(
    screen.queryByRole('region', {
      name: 'Чи бачу я прибуток окремо по кожному авто?',
    }),
  ).toBeNull()
})
```

- [ ] **Step 2: Write failing carousel control tests**

Create `src/components/site/features.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Features } from './features'

describe('Features carousel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes previous, next, and persistent pause controls', async () => {
    const user = userEvent.setup()
    render(<Features />)
    expect(screen.getByRole('button', { name: 'Попередня' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Наступна' })).toBeInTheDocument()
    const pause = screen.getByRole('button', { name: 'Зупинити автопрокрутку' })
    await user.click(pause)
    expect(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts paused when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
    render(<Features />)
    expect(
      screen.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
```

- [ ] **Step 3: Run FAQ and carousel tests and verify RED**

Run:

```bash
npm test -- src/components/site/faq.test.tsx src/components/site/features.test.tsx
```

Expected: FAQ test FAILS because the closed region remains mounted; carousel
tests FAIL because controls are hidden on mobile and pause/play does not exist.

- [ ] **Step 4: Remove closed FAQ panels from the accessibility tree**

In `src/components/site/faq.tsx`, mount the panel only while open:

```tsx
{isOpen && (
  <div
    id={panelId}
    role="region"
    aria-label={entry.question}
    className="overflow-hidden"
  >
    <div ref={contentRef}>
      <p className="text-brand-foreground/80 max-w-[640px] pr-12 pb-6 pl-[60px] text-[14px] leading-[1.55] lg:pl-[68px] lg:text-[15px]">
        {entry.answer}
      </p>
    </div>
  </div>
)}
```

Remove the max-height state, resize observer, and unused `useEffect`/`useRef`
imports.

- [ ] **Step 5: Add explicit carousel playback state and visible controls**

In `src/components/site/features.tsx`:

- import `Pause` and `Play`;
- add `const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false`;
- initialize `const [userPaused, setUserPaused] = useState(false)`;
- derive `const autoplayPaused = reducedMotion || userPaused`;
- make the interval effect return early when `userPaused || reducedMotion`;
- retain hover/focus temporary pause listeners;
- include `userPaused` and `reducedMotion` in the interval effect dependencies;
- change the controls wrapper from `hidden ... lg:flex` to `flex flex-wrap gap-2`;
- add:

```tsx
<button
  type="button"
  aria-pressed={autoplayPaused}
  aria-label={
    autoplayPaused ? 'Увімкнути автопрокрутку' : 'Зупинити автопрокрутку'
  }
  disabled={reducedMotion}
  onClick={() => setUserPaused((value) => !value)}
  className="grid size-12 place-items-center rounded-full text-white ring-1 ring-white/15 transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
>
  {autoplayPaused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
</button>
```

- [ ] **Step 6: Add two-tone focus and minimum footer targets**

Replace the focus rule in `src/index.css` with:

```css
*:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px #000000;
  border-radius: 4px;
}
```

In `src/components/site/site-footer.tsx`, give secondary links
`inline-flex min-h-11 items-center` so their touch target is at least 44 CSS
pixels.

Change normal muted landing copy touched in this phase from `text-neutral-500`
to `text-neutral-400` in the hero description, features description, and
non-Pro pricing description. Decorative or disabled copy may remain dimmer.

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/components/site/faq.test.tsx src/components/site/features.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 8: Commit accessibility behavior**

```bash
git add src/components/site/features.tsx src/components/site/features.test.tsx src/components/site/faq.tsx src/components/site/faq.test.tsx src/components/site/hero.tsx src/components/site/pricing.tsx src/components/site/site-footer.tsx src/index.css
git commit -m "fix: improve landing accessibility controls"
```

### Task 6: Full Verification and Responsive QA

**Files:**

- Verify only; do not add production behavior unless a failing check requires a
  scoped fix covered by a failing regression test.

**Interfaces:**

- Consumes: Tasks 1–5
- Produces: verified phase-1 implementation

- [ ] **Step 1: Run all automated tests**

```bash
npm test
```

Expected: all test files PASS with zero failures.

- [ ] **Step 2: Run typecheck, lint, scoped formatting, and production build**

```bash
npm run typecheck
npm run lint
npx prettier --check src docs/superpowers/specs/2026-07-24-roz-12-phase-1-conversion-accessibility-design.md docs/superpowers/plans/2026-07-24-roz-12-phase-1-conversion-accessibility.md
npm run build:prod
```

Expected: every command exits 0. Use scoped Prettier because the repository has
known pre-existing formatting failures in deployment workflow/config files that
are outside phase 1.

- [ ] **Step 3: Run link and fragment audit**

```bash
rg -n 'href="#"|href="#demo"|href="#download-app"' src
```

Expected: no matches.

- [ ] **Step 4: Run local production preview and viewport QA**

Run:

```bash
npm run preview -- --host 127.0.0.1
```

Using browser tooling, inspect 320, 375, 768, 1024, and 1440 CSS pixel widths.
At each width verify:

- `document.documentElement.scrollWidth === window.innerWidth`;
- header/menu, hero CTA, pricing cards, CTA banner, carousel controls, FAQ, and
  footer have no overlap or clipping;
- keyboard focus order follows visual order;
- focus indicator is visible on dark and orange surfaces;
- mobile menu and carousel pause controls work;
- App Store opens the verified URL and Google Play is non-interactive.

- [ ] **Step 5: Verify git scope**

```bash
git diff --check
git status --short
git log --oneline --max-count=8
```

Expected: no whitespace errors; only phase-1 files are changed; Tasks 1–5 are
represented by focused commits.

## Final Verification

- [ ] Re-run `npm test` after the final code change.
- [ ] Re-run `npm run build:prod` after the final code change.
- [ ] Record the known global Prettier baseline separately; do not claim
      `npm run check` passes until the later edge/config phase formats those
      pre-existing files.
