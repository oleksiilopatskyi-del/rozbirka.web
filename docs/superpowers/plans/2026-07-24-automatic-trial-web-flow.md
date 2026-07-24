# Automatic Trial Web Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove manual trial activation from the web application and render automatic or legacy billing states using the backend-provided subscription state.

**Architecture:** Keep `AccountScreen` as the billing-state orchestrator and `SubscriptionPanel` as the presenter. Delete the obsolete billing mutation and make the panel derive all labels and actions from `SubscriptionDto.state`; retain `canActivateTrial` only as a response-compatibility field.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Testing Library, Axios

## Global Constraints

- The web app must never invoke `POST /billing/trial`.
- The web UI must not offer manual trial activation, including for legacy `canActivateTrial: true` responses.
- New tenants read and display the Pro trial already created by the backend.
- Keep `SubscriptionDto.canActivateTrial` for backend response compatibility, but do not use it for web behavior.
- Do not change paid subscription, cancellation, reactivation, or payment flows.

---

## File Structure

- `src/api/billing.test.ts`: guards the public billing API against reintroducing the manual activation mutation.
- `src/api/billing.ts`: exposes billing reads and paid-subscription mutations only.
- `src/screens/account.test.tsx`: covers automatic-trial rendering and the legacy blocked state.
- `src/screens/account.tsx`: renders subscription state without an activation branch or activation action.

### Task 1: Remove Manual Trial Activation

**Files:**

- Create: `src/api/billing.test.ts`
- Create: `src/screens/account.test.tsx`
- Modify: `src/api/billing.ts:1-75`
- Modify: `src/screens/account.tsx:495-680`

**Interfaces:**

- Consumes: `billingApi.getSubscription(): Promise<SubscriptionDto>` and `SubscriptionDto.state`
- Produces: a `billingApi` object with no `activateTrial` property and a subscription panel with no manual activation control
- Preserves: `SubscriptionDto.canActivateTrial: boolean` as an ignored compatibility field

- [ ] **Step 1: Add the failing billing API contract test**

Create `src/api/billing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { billingApi } from './billing'

describe('billingApi', () => {
  it('does not expose manual trial activation', () => {
    expect(billingApi).not.toHaveProperty('activateTrial')
  })
})
```

- [ ] **Step 2: Run the billing API test and verify RED**

Run:

```bash
npm test -- src/api/billing.test.ts
```

Expected: FAIL because `billingApi` still has an `activateTrial` property.

- [ ] **Step 3: Add failing account-state coverage**

Create `src/screens/account.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { billingApi } from '@/api/billing'
import type { SubscriptionDto } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { AccountScreen } from './account'

vi.mock('@/api/billing', () => ({
  billingApi: {
    getSubscription: vi.fn(),
    getPayments: vi.fn(),
    getPlans: vi.fn(),
    subscribe: vi.fn(),
    cancel: vi.fn(),
    cancelPayment: vi.fn(),
  },
}))

vi.mock('@/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

/* eslint-disable @typescript-eslint/unbound-method */
const getSubscription = vi.mocked(billingApi.getSubscription)
const getPayments = vi.mocked(billingApi.getPayments)
const getPlans = vi.mocked(billingApi.getPlans)
/* eslint-enable @typescript-eslint/unbound-method */
const mockedUseAuth = vi.mocked(useAuth)

const subscription: SubscriptionDto = {
  state: 'trial',
  planCode: 'pro_monthly',
  planName: 'Pro',
  trialEndsAt: '2026-07-31T00:00:00Z',
  trialDaysRemaining: 7,
  currentPeriodEnd: '2026-07-31T00:00:00Z',
  nextChargeAt: null,
  amount: 0,
  currency: 'USD',
  cardLast4: null,
  cardBrand: null,
  canSubscribe: true,
  canCancel: false,
  canReactivate: false,
  canActivateTrial: false,
  usage: {
    cars: { used: 0, max: 100 },
    intakes: { used: 0, max: 100 },
    parts: { used: 0, max: 1000 },
    users: { used: 1, max: 10 },
    cashRegisters: { used: 0, max: 5 },
  },
  features: [],
}

function renderAccount() {
  return render(
    <MemoryRouter>
      <AccountScreen />
    </MemoryRouter>,
  )
}

describe('AccountScreen subscription state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      status: 'authenticated',
      user: {
        id: 'user-1',
        phone: '+380501112233',
        displayName: 'Власник',
        role: 'owner',
        isActive: true,
        lastLoginAt: null,
      },
      tenant: {
        id: 'tenant-1',
        name: 'Test',
        slug: 'test',
        plan: 'trial',
        planTier: 'pro',
        city: null,
        logoUrl: null,
        isActive: true,
        createdAt: '2026-07-24T00:00:00Z',
        roleName: 'Owner',
      },
      tenants: [
        {
          id: 'tenant-1',
          name: 'Test',
          slug: 'test',
          plan: 'trial',
          planTier: 'pro',
          city: null,
          logoUrl: null,
          isActive: true,
          createdAt: '2026-07-24T00:00:00Z',
          roleName: 'Owner',
        },
      ],
      hydrate: vi.fn(),
      switchTenant: vi.fn(),
      signOut: vi.fn(),
    })
    getPayments.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    })
    getPlans.mockResolvedValue([])
  })

  it('renders the trial already activated by the backend', async () => {
    getSubscription.mockResolvedValue(subscription)

    renderAccount()

    expect(await screen.findByText('Pro')).toBeInTheDocument()
    expect(screen.getByText('7 днів')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /активувати/i }),
    ).not.toBeInTheDocument()
  })

  it('routes a legacy activatable tenant to paid plans', async () => {
    getSubscription.mockResolvedValue({
      ...subscription,
      state: 'blocked',
      planCode: null,
      planName: null,
      trialEndsAt: null,
      trialDaysRemaining: null,
      currentPeriodEnd: null,
      canActivateTrial: true,
    })

    renderAccount()

    expect(
      await screen.findByRole('button', { name: 'Оформити підписку' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /активувати/i }),
    ).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the account test and verify RED**

Run:

```bash
npm test -- src/screens/account.test.tsx
```

Expected: one test FAILS because the legacy response renders the manual
`Активувати 7 днів безкоштовно` button instead of the paid-plan flow. The
automatic-trial test may already pass because that state is already rendered.

- [ ] **Step 5: Delete the obsolete billing API mutation**

In `src/api/billing.ts`, delete:

```ts
  /**
   * Activate the one-time free 7-day trial. Lifts the block on a fresh tenant.
   * Backend: 409 billing.trial_already_used / billing.already_subscribed.
   */
  async activateTrial(): Promise<void> {
    await apiClient.post('/billing/trial')
  },
```

- [ ] **Step 6: Remove activation-derived presentation and actions**

In `SubscriptionPanel` within `src/screens/account.tsx`:

1. Replace the activation-specific state derivation:

```ts
  const accessEnded = subscription.state === 'blocked'
```

2. Replace `badgeLabel` and `planLabel` with:

```ts
  const badgeLabel = stateMeta[subscription.state].label

  const planLabel =
    accessEnded
      ? 'Доступ закрито'
      : subscription.state === 'trial'
        ? (subscription.planName ?? 'Пробний доступ')
        : (subscription.planName ?? 'Без тарифу')
```

3. Replace the activation invitation copy branch with:

```tsx
          {subscription.state === 'trial' ? (
            <p className="text-[15px] opacity-75">7 днів безкоштовно</p>
          ) : (
            !accessEnded &&
            typeof subscription.amount === 'number' && (
              <p className="text-[15px] opacity-75">
                {formatAmount(
                  subscription.amount,
                  subscription.currency ?? 'USD',
                )}{' '}
                / місяць
              </p>
            )
          )}
```

4. Delete `handleActivateTrial`.
5. Delete the `subscription.canActivateTrial` activation button.
6. Change the plans-button class condition from:

```ts
subscription.canActivateTrial ||
  (subscription.canReactivate && subscription.state !== 'blocked')
```

to:

```ts
subscription.canReactivate && subscription.state !== 'blocked'
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/api/billing.test.ts src/screens/account.test.tsx
```

Expected: 3 tests PASS with no errors or warnings.

- [ ] **Step 8: Run the full web quality gate and production build**

Run:

```bash
npm run check
npm run build:prod
```

Expected: typecheck, lint, formatting, all tests, and production build complete
with exit code 0.

- [ ] **Step 9: Verify scope**

Run:

```bash
rg -n "activateTrial|Активувати 7 днів|canActivateTrial" src
git diff --check
git status --short
```

Expected:

- no `activateTrial` or `Активувати 7 днів` references;
- `canActivateTrial` appears only in the compatibility DTO and test fixtures;
- `git diff --check` exits 0;
- only the two new tests and the two intended source files are modified.

- [ ] **Step 10: Commit the implementation**

```bash
git add src/api/billing.ts src/api/billing.test.ts src/screens/account.tsx src/screens/account.test.tsx
git commit -m "fix: remove manual trial activation from web"
```

## Final Verification

- [ ] Run `npm run check` and confirm every check passes.
- [ ] Run `npm run build:prod` and confirm the production bundle succeeds.
- [ ] Inspect `git status --short --branch` and record any remaining unrelated
      changes without modifying them.
