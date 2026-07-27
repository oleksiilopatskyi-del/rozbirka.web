# ROZ-12 Remaining Phases Combined Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining ROZ-12 billing-contract, performance, SEO, routing, caching, and Cloudflare-domain requirements as one reviewed delivery.

**Architecture:** `rozbirka.core` remains the billing source of truth and standardizes the public trial at 14 days. `rozbirka.web` validates the public plan API with an exact fallback, replaces heavy production media with responsive outputs, and moves edge behavior into a typed Cloudflare Worker that distinguishes static assets, known SPA routes, redirects, and real 404s.

**Tech Stack:** .NET 10/xUnit, React 19, TypeScript 6, Vite 8, Vitest, Sharp, WOFF2/fontTools, Cloudflare Workers/Wrangler 4, LHCI.

## Global Constraints

- The canonical URL is exactly `https://rozbirka.pro`.
- `www.rozbirka.pro` and HTTP requests permanently redirect to the HTTPS apex while preserving path and query.
- Trial duration is exactly 14 days in the core catalog, public API, landing, FAQ, onboarding, and Account UI.
- The App Store URL remains exactly `https://apps.apple.com/ua/app/rozbirka/id6762130912`.
- Google Play remains non-interactive “Скоро”.
- Pricing selection never starts checkout automatically.
- Only `lite_monthly`, `pro_monthly`, and `enterprise_monthly` are selectable.
- Plan prices and limits remain unchanged.
- Unsupported API, multi-location, priority-support, analytics, and bulk-export claims are not rendered.
- Existing colors, typography hierarchy, shapes, layout identity, and dark visual concept remain unchanged.
- Email addresses, email DNS/MX, auth infrastructure, and ROZ-11 migration work are out of scope.
- Every production key image is at most 500 KB; mobile initial transfer target is at most 3 MB.
- Prototype routes are development-only and return 404 in production.
- Known SPA deep links return the app shell; unknown paths return HTTP 404.
- Fingerprinted `/assets/*` responses use `Cache-Control: public, max-age=31536000, immutable`.
- No production deploy proceeds after a failing test, build, asset budget, Wrangler dry-run, or route check.

---

## Repository and File Map

### `rozbirka.core`

- `src/Rozbirka.Domain/Billing/BillingPlanCatalog.cs`: canonical 14-day Pro and Trial catalog values.
- `tests/Rozbirka.Tests/Billing/BillingPlanCatalogTests.cs`: exact public catalog contract.
- `tests/Rozbirka.Tests/Billing/SubscriptionServiceTests.cs`: automatic onboarding Trial duration assertion.

### `rozbirka.web`

- `src/lib/landing-plans.ts`: validates API plans, maps supported features, and owns the exact fallback.
- `src/lib/landing-plans.test.ts`: contract, malformed input, order, fallback, and unsupported-claim tests.
- `src/components/site/pricing.tsx`: API-backed pricing presentation.
- `src/components/site/pricing.test.tsx`: loading/fallback/API rendering, 14-day copy, and plan destination coverage.
- `src/components/site/faq.tsx` and `src/components/site/faq.test.tsx`: canonical trial and tier-limit copy.
- `src/screens/account.tsx` and `src/screens/account.test.tsx`: 14-day onboarding and plan UI copy.
- `scripts/optimize-assets.mjs`: reproducible AVIF/WebP generation.
- `scripts/check-asset-budget.mjs`: production output and source-reference budgets.
- `src/assets/optimized/**`: generated responsive production media.
- `public/fonts/*.woff2`: optimized font faces.
- `src/components/site/hero.tsx`, `features.tsx`, and `cta-banner.tsx`: responsive media consumers.
- `src/components/site/media-assets.test.ts`: source references, dimensions, and byte-limit regression checks.
- `index.html`: canonical, OG/Twitter, theme, and JSON-LD metadata.
- `public/robots.txt`, `public/sitemap.xml`, `public/404.html`, and `public/og-cover.webp`: crawler and sharing surface.
- `src/routes/routes.tsx`: testable production/development route factory.
- `src/routes/router.tsx`: browser-router creation only.
- `src/routes/routes.test.tsx`: prototype route exclusion contract.
- `src/seo/seo-files.test.ts`: static SEO/crawler contract.
- `worker/router.ts`: pure edge routing and header policy.
- `worker/index.ts`: typed Cloudflare fetch entrypoint.
- `worker/router.test.ts`: redirects, assets, SPA, prototype, noindex, and 404 behavior.
- `worker-configuration.d.ts`: Wrangler-generated binding types.
- `wrangler.jsonc`: Worker entrypoint, assets binding, environments, observability, and production Custom Domains.
- `lighthouserc.cjs`: repeatable production-preview performance and SEO gates.
- `.github/workflows/deploy-node-static-template.yml`: production/QA verification before artifact upload.
- `package.json` and `package-lock.json`: optimization, budget, Worker, and LHCI toolchain.

---

### Task 1: Lock the 14-Day Core Billing Contract

**Repository:** `/Users/user/Code/rozbirka/rozbirka.core`

**Files:**

- Create: `tests/Rozbirka.Tests/Billing/BillingPlanCatalogTests.cs`
- Modify: `tests/Rozbirka.Tests/Billing/SubscriptionServiceTests.cs`
- Modify: `src/Rozbirka.Domain/Billing/BillingPlanCatalog.cs`

**Interfaces:**

- Consumes: `BillingPlanCatalog`, `BillingFeatures`, `SubscriptionService.CreateTrialForTenantAsync`.
- Produces: public `Pro.TrialDays = 14`, `Trial.TrialDays = 14`, and an exact catalog contract used by the web fallback.

- [ ] **Step 1: Add the failing catalog contract**

Create `BillingPlanCatalogTests.cs`:

```csharp
using Rozbirka.Domain.Billing;

namespace Rozbirka.Tests.Billing;

public class BillingPlanCatalogTests
{
    [Fact]
    public void PublicCatalog_MatchesThePublishedWebContract()
    {
        Assert.Collection(
            BillingPlanCatalog.All,
            lite =>
            {
                Assert.Equal("lite_monthly", lite.Code);
                Assert.Equal(1900, lite.AmountMinor);
                Assert.Equal(14, lite.TrialDays);
                Assert.Equal(new PlanLimits(3, 0, 100, 1, 1, null), lite.Limits);
                Assert.Empty(lite.Features);
            },
            pro =>
            {
                Assert.Equal("pro_monthly", pro.Code);
                Assert.Equal(5900, pro.AmountMinor);
                Assert.Equal(14, pro.TrialDays);
                Assert.Equal(new PlanLimits(20, 25, 2000, 5, 2, null), pro.Limits);
                Assert.Equal(
                    new[]
                    {
                        BillingFeatures.IntakeManagement,
                        BillingFeatures.MultiCashRegisters,
                        BillingFeatures.QrCodes,
                        BillingFeatures.AdvancedReports,
                        BillingFeatures.TeamCollaboration,
                    },
                    pro.Features.Order());
            },
            enterprise =>
            {
                Assert.Equal("enterprise_monthly", enterprise.Code);
                Assert.Equal(29900, enterprise.AmountMinor);
                Assert.Equal(14, enterprise.TrialDays);
                Assert.Equal(new PlanLimits(null, null, null, null, null, null), enterprise.Limits);
                Assert.Equal(BillingPlanCatalog.Pro.Features.Order(), enterprise.Features.Order());
            });

        Assert.Equal(14, BillingPlanCatalog.Trial.TrialDays);
        Assert.Equal(BillingPlanCatalog.Pro.Limits, BillingPlanCatalog.Trial.Limits);
        Assert.Equal(BillingPlanCatalog.Pro.Features, BillingPlanCatalog.Trial.Features);
    }
}
```

- [ ] **Step 2: Add the failing automatic-Trial duration assertion**

In `CreateTrialForTenant_OnboardingWithoutTenantContext_UsesPersistedOwner`,
capture a common `before` value immediately before calling the service, then
assert the persisted end is within the 14-day window:

```csharp
var before = DateTime.UtcNow;
await Sut(db, ctx).CreateTrialForTenantAsync(tenantId);
var after = DateTime.UtcNow;

Assert.InRange(
    trial.CurrentPeriodEnd,
    before.AddDays(14),
    after.AddDays(14));
```

- [ ] **Step 3: Run RED**

Run:

```bash
dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj \
  --filter "FullyQualifiedName~BillingPlanCatalogTests|FullyQualifiedName~CreateTrialForTenant_OnboardingWithoutTenantContext_UsesPersistedOwner"
```

Expected: the public catalog test fails because Lite, Pro, and Enterprise do
not all expose 14 days.

- [ ] **Step 4: Make 14 days canonical**

In `BillingPlanCatalog.cs`, set:

```csharp
TrialDays: 14,
```

for Lite, Pro, Enterprise, and Trial. Update the Lite comment to:

```csharp
// The automatic onboarding trial is global; public plans expose its duration.
```

This changes catalog metadata only. It does not add checkout-side trial
activation or alter limits, prices, features, or payment behavior.

- [ ] **Step 5: Run GREEN and the billing suite**

Run:

```bash
dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj \
  --filter "FullyQualifiedName~Billing"
```

Expected: all billing tests pass.

- [ ] **Step 6: Commit the core contract**

```bash
git add \
  src/Rozbirka.Domain/Billing/BillingPlanCatalog.cs \
  tests/Rozbirka.Tests/Billing/BillingPlanCatalogTests.cs \
  tests/Rozbirka.Tests/Billing/SubscriptionServiceTests.cs
git commit -m "fix: standardize billing trial at 14 days"
```

---

### Task 2: Make Landing Pricing API-Backed and Contract-Safe

**Repository:** `/Users/user/Code/rozbirka/rozbirka.web`

**Files:**

- Create: `src/lib/landing-plans.ts`
- Create: `src/lib/landing-plans.test.ts`
- Modify: `src/api/billing.ts`
- Modify: `src/components/site/pricing.tsx`
- Modify: `src/components/site/pricing.test.tsx`
- Modify: `src/components/site/faq.tsx`
- Modify: `src/components/site/faq.test.tsx`
- Modify: `src/screens/account.tsx`
- Modify: `src/screens/account.test.tsx`

**Interfaces:**

- Consumes: `PublicPlanDto[]` from `GET /api/v1/billing/plans`.
- Produces:
  `resolveLandingPlans(value: unknown): readonly LandingPlan[]`,
  `FALLBACK_LANDING_PLANS`, and API-backed pricing with existing destinations.

- [ ] **Step 1: Write failing plan-adapter tests**

Create `src/lib/landing-plans.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_LANDING_PLANS,
  resolveLandingPlans,
} from './landing-plans'

const apiPlans = [
  {
    code: 'lite_monthly',
    name: 'Lite',
    amount: 19,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 3,
      intakes: 0,
      parts: 100,
      users: 1,
      cashRegisters: 1,
      photosPerPart: null,
    },
    features: [],
  },
  {
    code: 'pro_monthly',
    name: 'Pro',
    amount: 59,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: 20,
      intakes: 25,
      parts: 2000,
      users: 5,
      cashRegisters: 2,
      photosPerPart: null,
    },
    features: [
      'intake_management',
      'reports.advanced',
      'team_collaboration',
      'multi_cash_registers',
      'qr_codes',
    ],
  },
  {
    code: 'enterprise_monthly',
    name: 'Enterprise',
    amount: 299,
    currency: 'USD',
    interval: '1m',
    trialDays: 14,
    limits: {
      cars: null,
      intakes: null,
      parts: null,
      users: null,
      cashRegisters: null,
      photosPerPart: null,
    },
    features: [
      'intake_management',
      'reports.advanced',
      'team_collaboration',
      'multi_cash_registers',
      'qr_codes',
    ],
  },
]

describe('landing plan contract', () => {
  it('maps the complete validated API catalog in canonical order', () => {
    expect(resolveLandingPlans([...apiPlans].reverse())).toEqual([
      expect.objectContaining({
        code: 'lite_monthly',
        price: '$19',
        trialDays: 14,
        perks: ['3 авто', '100 запчастин', '1 користувач, 1 каса'],
      }),
      expect.objectContaining({
        code: 'pro_monthly',
        price: '$59',
        trialDays: 14,
        perks: [
          '20 авто, 2 000 запчастин',
          '5 користувачів, 2 каси',
          'Партії, звіти та QR-коди',
        ],
      }),
      expect.objectContaining({
        code: 'enterprise_monthly',
        price: '$299',
        trialDays: 14,
        perks: [
          'Без лімітів на авто та запчастини',
          'Без лімітів на користувачів і каси',
          'Партії, звіти, команда та QR-коди',
        ],
      }),
    ])
  })

  it('falls back when any required plan is missing or malformed', () => {
    expect(resolveLandingPlans(apiPlans.slice(0, 2))).toEqual(
      FALLBACK_LANDING_PLANS,
    )
    expect(
      resolveLandingPlans([
        ...apiPlans,
        { ...apiPlans[1], trialDays: 7 },
      ]),
    ).toEqual(FALLBACK_LANDING_PLANS)
    expect(resolveLandingPlans(null)).toEqual(FALLBACK_LANDING_PLANS)
  })

  it('never maps unsupported product claims', () => {
    const text = JSON.stringify(resolveLandingPlans(apiPlans))
    expect(text).not.toMatch(
      /api access|multi-location|priority support|analytics|bulk export/i,
    )
  })
})
```

- [ ] **Step 2: Run adapter RED**

Run:

```bash
npm test -- src/lib/landing-plans.test.ts
```

Expected: FAIL because `landing-plans.ts` does not exist.

- [ ] **Step 3: Implement the validated adapter and exact fallback**

Create `src/lib/landing-plans.ts` with:

```ts
import type { PublicPlanDto } from '@/api/types'
import type { PlanCode } from '@/lib/plan-selection'

export interface LandingPlan {
  code: PlanCode
  name: 'Lite' | 'Pro' | 'Enterprise'
  price: string
  period: 'місяць'
  trialDays: 14
  description: string
  perks: string[]
  ctaLabel: string
  variant: 'lite' | 'pro' | 'enterprise'
}

export const FALLBACK_LANDING_PLANS: readonly LandingPlan[] = [
  {
    code: 'lite_monthly',
    name: 'Lite',
    price: '$19',
    period: 'місяць',
    trialDays: 14,
    description: 'Старт для маленької розбірки',
    perks: ['3 авто', '100 запчастин', '1 користувач, 1 каса'],
    ctaLabel: 'Обрати',
    variant: 'lite',
  },
  {
    code: 'pro_monthly',
    name: 'Pro',
    price: '$59',
    period: 'місяць',
    trialDays: 14,
    description: 'Все необхідне, щоб масштабувати продажі',
    perks: [
      '20 авто, 2 000 запчастин',
      '5 користувачів, 2 каси',
      'Партії, звіти та QR-коди',
    ],
    ctaLabel: 'Почати 14 днів безкоштовно',
    variant: 'pro',
  },
  {
    code: 'enterprise_monthly',
    name: 'Enterprise',
    price: '$299',
    period: 'місяць',
    trialDays: 14,
    description: 'Для розбірок без обмежень каталогу',
    perks: [
      'Без лімітів на авто та запчастини',
      'Без лімітів на користувачів і каси',
      'Партії, звіти, команда та QR-коди',
    ],
    ctaLabel: 'Обрати',
    variant: 'enterprise',
  },
] as const

const order: PlanCode[] = [
  'lite_monthly',
  'pro_monthly',
  'enterprise_monthly',
]

const validFeatures = new Set([
  'intake_management',
  'reports.advanced',
  'team_collaboration',
  'multi_cash_registers',
  'qr_codes',
])

const contracts = {
  lite_monthly: {
    amount: 19,
    limits: {
      cars: 3,
      intakes: 0,
      parts: 100,
      users: 1,
      cashRegisters: 1,
      photosPerPart: null,
    },
  },
  pro_monthly: {
    amount: 59,
    limits: {
      cars: 20,
      intakes: 25,
      parts: 2000,
      users: 5,
      cashRegisters: 2,
      photosPerPart: null,
    },
  },
  enterprise_monthly: {
    amount: 299,
    limits: {
      cars: null,
      intakes: null,
      parts: null,
      users: null,
      cashRegisters: null,
      photosPerPart: null,
    },
  },
} as const

function isPublicPlan(value: unknown): value is PublicPlanDto {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<PublicPlanDto>
  return (
    typeof plan.code === 'string' &&
    typeof plan.name === 'string' &&
    typeof plan.amount === 'number' &&
    plan.currency === 'USD' &&
    plan.interval === '1m' &&
    plan.trialDays === 14 &&
    !!plan.limits &&
    Array.isArray(plan.features) &&
    plan.features.every((feature) => validFeatures.has(feature))
  )
}

function mapPlan(plan: PublicPlanDto): LandingPlan | null {
  const fallback = FALLBACK_LANDING_PLANS.find(
    (candidate) => candidate.code === plan.code,
  )
  const contract = contracts[plan.code as keyof typeof contracts]
  const limitsMatch =
    contract !== undefined &&
    Object.entries(contract.limits).every(
      ([key, value]) =>
        plan.limits[key as keyof PublicPlanDto['limits']] === value,
    )
  if (
    !fallback ||
    !contract ||
    plan.amount !== contract.amount ||
    !limitsMatch
  ) {
    return null
  }
  return { ...fallback, price: `$${plan.amount}` }
}

export function resolveLandingPlans(value: unknown): readonly LandingPlan[] {
  if (!Array.isArray(value)) return FALLBACK_LANDING_PLANS
  const mapped = value
    .filter(isPublicPlan)
    .map(mapPlan)
    .filter((plan): plan is LandingPlan => plan !== null)
  if (mapped.length !== order.length) return FALLBACK_LANDING_PLANS
  const byCode = new Map(mapped.map((plan) => [plan.code, plan]))
  if (byCode.size !== order.length) return FALLBACK_LANDING_PLANS
  return order.map((code) => byCode.get(code) ?? FALLBACK_LANDING_PLANS[0]!)
}
```

- [ ] **Step 4: Add failing pricing integration coverage**

Mock `billingApi.getPlans` in `pricing.test.tsx`. Add tests that:

```tsx
it('renders the validated API catalog with canonical trial copy', async () => {
  vi.mocked(billingApi.getPlans).mockResolvedValue(apiPlans)
  render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  )

  expect(
    await screen.findByRole('link', {
      name: 'Почати 14 днів безкоштовно',
    }),
  ).toHaveAttribute('href', '/login?plan=pro_monthly')
  expect(screen.getByText('20 авто, 2 000 запчастин')).toBeInTheDocument()
  expect(screen.queryByText(/API і мульти-локація/i)).toBeNull()
})

it('renders the complete fallback when the public API fails', async () => {
  vi.mocked(billingApi.getPlans).mockRejectedValue(new Error('offline'))
  render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  )
  expect(
    await screen.findByText('3 авто'),
  ).toBeInTheDocument()
  expect(screen.getAllByRole('link')).toHaveLength(3)
})
```

- [ ] **Step 5: Run pricing RED**

Run:

```bash
npm test -- src/lib/landing-plans.test.ts src/components/site/pricing.test.tsx
```

Expected: adapter tests pass; pricing tests fail because pricing is static and
still says 7 days.

- [ ] **Step 6: Wire pricing to the public API**

Change `billingApi.getPlans()` to use `publicApiClient`.

In `Pricing`, initialize with the fallback and fetch once:

```tsx
const [plans, setPlans] = useState(FALLBACK_LANDING_PLANS)

useEffect(() => {
  let cancelled = false
  void billingApi
    .getPlans()
    .then((value) => {
      if (!cancelled) setPlans(resolveLandingPlans(value))
    })
    .catch(() => {
      if (!cancelled) setPlans(FALLBACK_LANDING_PLANS)
    })
  return () => {
    cancelled = true
  }
}, [])
```

Keep the existing authenticated/guest destination calculation and card
variants. Render `14 днів безкоштовно` under Pro price.

- [ ] **Step 7: Add failing FAQ and Account copy tests**

Add assertions:

```tsx
expect(screen.getByText(/14 днів повного доступу/i)).toBeInTheDocument()
expect(screen.getByText(/Lite — 1, Pro — 5/i)).toBeInTheDocument()
expect(screen.queryByText(/Сім днів|7 днів/)).toBeNull()
```

For Account onboarding and plan cards:

```tsx
expect(screen.getByText(/автоматично активуються 14 днів/i)).toBeInTheDocument()
expect(screen.getByText('14 днів безкоштовно')).toBeInTheDocument()
```

- [ ] **Step 8: Run copy RED**

Run:

```bash
npm test -- src/components/site/faq.test.tsx src/screens/account.test.tsx
```

Expected: FAIL on existing 7-day and unlimited-user copy.

- [ ] **Step 9: Make FAQ and Account canonical**

Use these exact FAQ statements:

```ts
{
  question: 'Як працює безкоштовний період?',
  answer:
    'Після створення робочого простору автоматично активуються 14 днів Pro-рівня — без введення картки. Після завершення нічого не списується автоматично.',
},
{
  question: 'Скільки людей з команди можуть працювати одночасно?',
  answer:
    'Ліміт залежить від тарифу: Lite — 1 користувач, Pro — 5, Enterprise — без обмежень. Для кожного можна налаштувати окрему роль і права доступу.',
},
```

Replace Account’s two hard-coded `7 днів` strings with `14 днів`. Dynamic
remaining-day output remains API-driven.

- [ ] **Step 10: Run GREEN and commit**

Run:

```bash
npm test -- \
  src/lib/landing-plans.test.ts \
  src/components/site/pricing.test.tsx \
  src/components/site/faq.test.tsx \
  src/screens/account.test.tsx
npm run typecheck
npm run lint
```

Then:

```bash
git add src/api/billing.ts src/lib/landing-plans.ts \
  src/lib/landing-plans.test.ts src/components/site/pricing.tsx \
  src/components/site/pricing.test.tsx src/components/site/faq.tsx \
  src/components/site/faq.test.tsx src/screens/account.tsx \
  src/screens/account.test.tsx
git commit -m "fix: align landing with billing catalog"
```

---

### Task 3: Replace Heavy Production Media and Fonts

**Repository:** `/Users/user/Code/rozbirka/rozbirka.web`

**Files:**

- Create: `scripts/optimize-assets.mjs`
- Create: `scripts/check-asset-budget.mjs`
- Create: `src/components/site/media-assets.test.ts`
- Create: `src/assets/optimized/hero/hero-{720,1080}.{avif,webp}`
- Create: `src/assets/optimized/cta/cta-{720,1100}.{avif,webp}`
- Create: `src/assets/optimized/features/<name>-{480,720}.{avif,webp}`
- Create: `public/fonts/VisueltPro-{Light,Regular,Medium,Bold}.woff2`
- Modify: `src/components/site/hero.tsx`
- Modify: `src/components/site/features.tsx`
- Modify: `src/components/site/cta-banner.tsx`
- Modify: `src/index.css`
- Modify: `index.html`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: existing source PNG/SVG/TTF artwork.
- Produces: responsive AVIF/WebP imports, WOFF2 fonts, `npm run assets:optimize`,
  and `npm run budget:assets`.

- [ ] **Step 1: Add Sharp and failing media-budget tests**

Run:

```bash
npm install --save-dev sharp
```

Create `media-assets.test.ts` with Node environment:

```ts
// @vitest-environment node
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('production media contract', () => {
  it('does not import the legacy heavy media from production components', async () => {
    const files = [
      'src/components/site/hero.tsx',
      'src/components/site/features.tsx',
      'src/components/site/cta-banner.tsx',
    ]
    const source = (
      await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))
    ).join('\n')
    expect(source).not.toMatch(/phone pc\.png|cta-phones\.png|features\/.+\.svg/)
  })

  it('keeps every optimized key image at or below 500 KB', async () => {
    const base = path.join(root, 'src/assets/optimized')
    const directories = ['hero', 'cta', 'features']
    const files = (
      await Promise.all(
        directories.map(async (directory) =>
          (await readdir(path.join(base, directory))).map((file) =>
            path.join(base, directory, file),
          ),
        ),
      )
    ).flat()
    expect(files.length).toBeGreaterThanOrEqual(24)
    for (const file of files) {
      expect((await stat(file)).size, file).toBeLessThanOrEqual(500 * 1024)
    }
  })
})
```

- [ ] **Step 2: Run media RED**

Run:

```bash
npm test -- src/components/site/media-assets.test.ts
```

Expected: FAIL because legacy imports remain and optimized files do not exist.

- [ ] **Step 3: Create the reproducible image generator**

Create `scripts/optimize-assets.mjs` using Sharp. It must:

- read hero and CTA PNGs;
- rasterize each feature SVG;
- preserve transparency;
- emit the exact sizes listed in the file map;
- use AVIF quality 50 and WebP quality 72;
- use `fit: 'inside'` with `withoutEnlargement: true`;
- create directories recursively;
- fail if any output exceeds 500 KB.

The central generation loop is:

```js
import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const featureNames = [
  'avto',
  'intake',
  'parts',
  'stickers',
  'orders',
  'customers',
  'cash',
  'analytics',
  'reports',
  'team',
]

const targets = [
  {
    name: 'hero',
    input: 'src/assets/phone pc.png',
    output: 'src/assets/optimized/hero',
    widths: [720, 1080],
  },
  {
    name: 'cta',
    input: 'src/assets/cta-phones.png',
    output: 'src/assets/optimized/cta',
    widths: [720, 1100],
  },
  ...featureNames.map((name) => ({
    name,
    input: `src/assets/features/${name}.svg`,
    output: 'src/assets/optimized/features',
    widths: [480, 720],
  })),
]

for (const target of targets) {
  await mkdir(target.output, { recursive: true })
  for (const width of target.widths) {
    const pipeline = sharp(target.input, { density: 192 })
      .resize({ width, fit: 'inside', withoutEnlargement: true })
    const avif = path.join(target.output, `${target.name}-${width}.avif`)
    const webp = path.join(target.output, `${target.name}-${width}.webp`)
    await pipeline
      .clone()
      .avif({ quality: 50, effort: 6 })
      .toFile(avif)
    await pipeline
      .clone()
      .webp({ quality: 72, effort: 5 })
      .toFile(webp)
    for (const file of [avif, webp]) {
      if ((await stat(file)).size > 500 * 1024) {
        throw new Error(`${file} exceeds 500 KB`)
      }
    }
  }
}
```

Add:

```json
"assets:optimize": "node scripts/optimize-assets.mjs",
"budget:assets": "node scripts/check-asset-budget.mjs"
```

- [ ] **Step 4: Generate responsive images**

Run:

```bash
npm run assets:optimize
```

Expected: all AVIF/WebP files are created and every output is at most 500 KB.

- [ ] **Step 5: Generate WOFF2 fonts**

Use a temporary isolated Python environment:

```bash
font_tools_dir="$(mktemp -d)"
python3 -m venv "$font_tools_dir/venv"
"$font_tools_dir/venv/bin/pip" install fonttools brotli
for font in public/fonts/*.ttf; do
  "$font_tools_dir/venv/bin/python" -m fontTools.ttLib.woff2 compress "$font"
done
```

Move the generated `.woff2` files into `public/fonts/`. Do not delete the TTF
source files until the CSS and preload checks pass.

- [ ] **Step 6: Switch components to responsive production media**

For feature media, change `Feature.image` to:

```ts
interface ResponsiveImage {
  avif: string
  avif2x: string
  webp: string
  webp2x: string
}
```

Render:

```tsx
<picture>
  <source
    type="image/avif"
    srcSet={`${feature.image.avif} 480w, ${feature.image.avif2x} 720w`}
    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 85vw"
  />
  <img
    src={feature.image.webp}
    srcSet={`${feature.image.webp} 480w, ${feature.image.webp2x} 720w`}
    sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 85vw"
    width={363}
    height={346}
    alt={`Скриншот фічі ${feature.title}`}
    loading="lazy"
    decoding="async"
    className="absolute inset-0 h-full w-full scale-[1.15] object-contain object-center transition-transform duration-700 ease-out group-hover:scale-[1.22]"
  />
</picture>
```

For the desktop-only hero, use a media-gated `<source>` and an inline transparent
fallback so mobile does not discover a heavy fallback URL:

```tsx
<picture>
  <source
    media="(min-width: 1024px)"
    type="image/avif"
    srcSet={`${hero720Avif} 720w, ${hero1080Avif} 1080w`}
    sizes="680px"
  />
  <source
    media="(min-width: 1024px)"
    type="image/webp"
    srcSet={`${hero720Webp} 720w, ${hero1080Webp} 1080w`}
    sizes="680px"
  />
  <img
    src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
    width={2076}
    height={2220}
    alt="Застосунок rozbirka на телефоні"
    decoding="async"
    fetchPriority="high"
    className="anim-float-slow ml-auto block h-auto w-full max-w-[680px]"
  />
</picture>
```

Apply the same AVIF/WebP pattern to CTA artwork with `loading="lazy"`.

- [ ] **Step 7: Switch font declarations and preload**

Change every `@font-face` to WOFF2:

```css
src: url('/fonts/VisueltPro-Regular.woff2') format('woff2');
```

In `index.html`, preload only Regular and Medium with
`type="font/woff2"`. Remove TTF preloads. After the WOFF2 files render and
preload correctly, delete the four `public/fonts/*.ttf` files so Vite cannot
copy them into `dist`.

- [ ] **Step 8: Implement the build-output budget**

Create `scripts/check-asset-budget.mjs` that:

- recursively scans `dist`;
- fails when any `.avif`, `.webp`, `.png`, `.jpg`, `.jpeg`, or `.svg` is above
  500 KB;
- fails when `dist` includes the legacy filenames or TTF fonts;
- sums HTML, CSS, JS, WOFF2, and the 720-wide hero/CTA sources and fails above
  3 MB;
- prints each checked file and the total in bytes.

Use:

```js
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const dist = path.resolve('dist')
const maxImageBytes = 500 * 1024
const maxCriticalBytes = 3 * 1024 * 1024

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(target) : [target]
      }),
    )
  ).flat()
}

const files = await walk(dist)
const relative = (file) => path.relative(dist, file)
const imagePattern = /\.(?:avif|webp|png|jpe?g|svg)$/i
const legacyPattern = /(?:phone pc|cta-phones|\.ttf$)/i

for (const file of files) {
  const name = relative(file)
  const bytes = (await stat(file)).size
  if (legacyPattern.test(name)) throw new Error(`legacy asset emitted: ${name}`)
  if (imagePattern.test(name) && bytes > maxImageBytes) {
    throw new Error(`${name} exceeds 500 KB: ${bytes}`)
  }
}

const critical = files.filter((file) => {
  const name = relative(file)
  return (
    /\.(?:html|css|js|woff2)$/i.test(name) ||
    /(?:hero|cta)-720[^/]*\.(?:avif|webp)$/i.test(name)
  )
})

let criticalBytes = 0
for (const file of critical) {
  const bytes = (await stat(file)).size
  criticalBytes += bytes
  console.log(`${relative(file)} ${bytes}`)
}
console.log(`critical-total ${criticalBytes}`)
if (criticalBytes > maxCriticalBytes) {
  throw new Error(`critical assets exceed 3 MB: ${criticalBytes}`)
}
```

- [ ] **Step 9: Run GREEN, build, and budget**

Run:

```bash
npm test -- src/components/site/media-assets.test.ts
npm run build:prod
npm run budget:assets
```

Expected: tests and build pass; every image is at most 500 KB; budget passes.

- [ ] **Step 10: Commit optimized delivery**

```bash
git add package.json package-lock.json scripts src/assets/optimized \
  public/fonts src/components/site/hero.tsx \
  src/components/site/features.tsx src/components/site/cta-banner.tsx \
  src/components/site/media-assets.test.ts src/index.css index.html
git commit -m "perf: optimize landing media delivery"
```

---

### Task 4: Add SEO Files and Production Route Boundaries

**Repository:** `/Users/user/Code/rozbirka/rozbirka.web`

**Files:**

- Create: `public/robots.txt`
- Create: `public/sitemap.xml`
- Create: `public/404.html`
- Create: `public/og-cover.webp`
- Create: `src/seo/seo-files.test.ts`
- Create: `src/routes/routes.tsx`
- Create: `src/routes/routes.test.tsx`
- Modify: `index.html`
- Modify: `src/routes/router.tsx`

**Interfaces:**

- Produces:
  `createAppRoutes(includePrototypeRoutes: boolean): RouteObject[]`, canonical
  metadata, crawler files, branded 404, and development-only prototypes.

- [ ] **Step 1: Add failing SEO file tests**

Create `src/seo/seo-files.test.ts`:

```ts
// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('SEO surface', () => {
  it('publishes canonical social and structured metadata', async () => {
    const html = await readFile('index.html', 'utf8')
    expect(html).toContain(
      '<link rel="canonical" href="https://rozbirka.pro/"',
    )
    expect(html).toContain('property="og:url" content="https://rozbirka.pro/"')
    expect(html).toContain('name="twitter:card" content="summary_large_image"')
    expect(html).toContain('application/ld+json')
    expect(html).toContain('"@type": "SoftwareApplication"')
  })

  it('publishes valid robots, sitemap, and branded 404 files', async () => {
    const [robots, sitemap, notFound] = await Promise.all([
      readFile('public/robots.txt', 'utf8'),
      readFile('public/sitemap.xml', 'utf8'),
      readFile('public/404.html', 'utf8'),
    ])
    expect(robots).toBe(
      'User-agent: *\\nAllow: /\\nDisallow: /account\\nDisallow: /login\\nSitemap: https://rozbirka.pro/sitemap.xml\\n',
    )
    expect(sitemap).toContain('<loc>https://rozbirka.pro/</loc>')
    expect(sitemap).toContain('<loc>https://rozbirka.pro/privacy</loc>')
    expect(sitemap).not.toMatch(/screens|account|login/)
    expect(notFound).toContain('<title>Сторінку не знайдено — rozbirka</title>')
    expect(notFound).toContain('href="/"')
  })
})
```

- [ ] **Step 2: Add failing production-route tests**

Extract route creation and test:

```tsx
import { describe, expect, it } from 'vitest'
import { createAppRoutes } from './routes'

describe('production route boundary', () => {
  it('omits prototype routes in production', () => {
    const paths = createAppRoutes(false).map((route) => route.path)
    expect(paths).not.toContain('/screens')
    expect(paths).not.toContain('/screens/header')
  })

  it('keeps prototype routes in development', () => {
    const paths = createAppRoutes(true).map((route) => route.path)
    expect(paths).toContain('/screens')
    expect(paths).toContain('/screens/header')
  })
})
```

- [ ] **Step 3: Run RED**

Run:

```bash
npm test -- src/seo/seo-files.test.ts src/routes/routes.test.tsx
```

Expected: FAIL because files and route factory do not exist.

- [ ] **Step 4: Implement route factory**

Move existing route objects to:

```tsx
import type { RouteObject } from 'react-router'
import App from '@/App'
import { RedirectIfAuth, RequireAuth } from '@/auth/guards'

export function createAppRoutes(
  includePrototypeRoutes: boolean,
): RouteObject[] {
  const routes: RouteObject[] = [
    { path: '/', element: <App /> },
    {
      path: '/privacy',
      lazy: async () => {
        const { PrivacyScreen } = await import('@/screens/privacy')
        return { element: <PrivacyScreen /> }
      },
    },
    {
      path: '/login',
      lazy: async () => {
        const { LoginScreen } = await import('@/screens/login')
        return {
          element: (
            <RedirectIfAuth>
              <LoginScreen />
            </RedirectIfAuth>
          ),
        }
      },
    },
    {
      path: '/account',
      lazy: async () => {
        const { AccountScreen } = await import('@/screens/account')
        return {
          element: (
            <RequireAuth>
              <AccountScreen />
            </RequireAuth>
          ),
        }
      },
    },
    {
      path: '/marketplace',
      lazy: async () => {
        const { MarketplaceApp } =
          await import('@/apps/marketplace/marketplace-app')
        return { element: <MarketplaceApp /> }
      },
    },
    {
      path: '/marketplace/listings/:slugOrId',
      lazy: async () => {
        const { MarketplaceLayout } =
          await import('@/apps/marketplace/marketplace-layout')
        const { ListingDetailScreen } =
          await import('@/features/marketplace/listing-detail-screen')
        return {
          element: (
            <MarketplaceLayout>
              <ListingDetailScreen />
            </MarketplaceLayout>
          ),
        }
      },
    },
    {
      path: '/marketplace/shops/:slug',
      lazy: async () => {
        const { MarketplaceLayout } =
          await import('@/apps/marketplace/marketplace-layout')
        const { ShopProfileScreen } =
          await import('@/features/marketplace/shop-profile-screen')
        return {
          element: (
            <MarketplaceLayout>
              <ShopProfileScreen />
            </MarketplaceLayout>
          ),
        }
      },
    },
  ]
  if (includePrototypeRoutes) {
    routes.push(
      {
        path: '/screens',
        lazy: async () => {
          const { ScreensIndex } = await import('@/screens')
          return { element: <ScreensIndex /> }
        },
      },
      {
        path: '/screens/header',
        lazy: async () => {
          const { HeaderScreen } = await import('@/screens/header')
          return { element: <HeaderScreen /> }
        },
      },
    )
  }
  return routes
}
```

`router.tsx` becomes:

```tsx
import { createBrowserRouter } from 'react-router'
import { createAppRoutes } from './routes'

export const router = createBrowserRouter(createAppRoutes(import.meta.env.DEV))
```

- [ ] **Step 5: Add metadata and public files**

Add canonical, Open Graph, Twitter, theme-color, and JSON-LD metadata to
`index.html`:

```html
<link rel="canonical" href="https://rozbirka.pro/" />
<meta name="theme-color" content="#0b0b0b" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="uk_UA" />
<meta property="og:site_name" content="rozbirka" />
<meta property="og:title" content="rozbirka — облік авторозбірки" />
<meta
  property="og:description"
  content="Авто, запчастини, продажі, каси та команда в одному застосунку."
/>
<meta property="og:url" content="https://rozbirka.pro/" />
<meta property="og:image" content="https://rozbirka.pro/og-cover.webp" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="rozbirka — облік авторозбірки" />
<meta
  name="twitter:description"
  content="Авто, запчастини, продажі, каси та команда в одному застосунку."
/>
<meta name="twitter:image" content="https://rozbirka.pro/og-cover.webp" />
```

JSON-LD uses:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://rozbirka.pro/#organization",
      "name": "rozbirka",
      "url": "https://rozbirka.pro/"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://rozbirka.pro/#software",
      "name": "rozbirka",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "iOS, Web",
      "url": "https://rozbirka.pro/",
      "offers": {
        "@type": "AggregateOffer",
        "lowPrice": "19",
        "highPrice": "299",
        "priceCurrency": "USD"
      },
      "publisher": {
        "@id": "https://rozbirka.pro/#organization"
      }
    }
  ]
}
```

Create exact `robots.txt`:

```text
User-agent: *
Allow: /
Disallow: /account
Disallow: /login
Sitemap: https://rozbirka.pro/sitemap.xml
```

Create `sitemap.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://rozbirka.pro/</loc></url>
  <url><loc>https://rozbirka.pro/privacy</loc></url>
  <url><loc>https://rozbirka.pro/marketplace</loc></url>
</urlset>
```

Create a standalone branded `404.html`:

```html
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Сторінку не знайдено — rozbirka</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b0b0b;
        color: #fff;
        font-family: system-ui, sans-serif;
      }
      main {
        width: min(520px, calc(100% - 48px));
      }
      strong {
        color: #f77425;
        font-size: 72px;
      }
      a {
        display: inline-flex;
        min-height: 44px;
        align-items: center;
        margin-top: 24px;
        padding: 0 24px;
        border-radius: 999px;
        background: #f77425;
        color: #000;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <main>
      <strong>404</strong>
      <h1>Сторінку не знайдено</h1>
      <p>Перевірте адресу або поверніться на головну.</p>
      <a href="/">На головну</a>
    </main>
  </body>
</html>
```

Generate `public/og-cover.webp` from the approved hero/CTA artwork at
1200×630, WebP quality 80, and below 500 KB:

```bash
node --input-type=module -e \
  "import sharp from 'sharp'; await sharp('src/assets/optimized/cta/cta-1100.webp').resize({width:1200,height:630,fit:'contain',background:'#f77425'}).webp({quality:80}).toFile('public/og-cover.webp')"
```

- [ ] **Step 6: Run GREEN and commit**

Run:

```bash
npm test -- src/seo/seo-files.test.ts src/routes/routes.test.tsx
npm run build:prod
```

Then:

```bash
git add index.html public/robots.txt public/sitemap.xml public/404.html \
  public/og-cover.webp src/seo/seo-files.test.ts src/routes/routes.tsx \
  src/routes/routes.test.tsx src/routes/router.tsx
git commit -m "feat: add production SEO and route boundaries"
```

---

### Task 5: Add Typed Cloudflare Edge Routing and Cache Policy

**Repository:** `/Users/user/Code/rozbirka/rozbirka.web`

**Files:**

- Create: `worker/router.ts`
- Create: `worker/index.ts`
- Create: `worker/router.test.ts`
- Create: `worker-configuration.d.ts`
- Modify: `wrangler.jsonc`
- Modify: `tsconfig.node.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: Cloudflare `ASSETS.fetch`.
- Produces:
  `handleRequest(request: Request, env: Env): Promise<Response>` and production
  Custom Domains for apex/www.

- [ ] **Step 1: Add Workers types and failing route tests**

Run:

```bash
npm install --save-dev @cloudflare/workers-types
```

Create `worker/router.test.ts` with Node environment and a deterministic mock:

```ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleRequest, type EdgeEnv } from './router'

function env(): EdgeEnv {
  return {
    ASSETS: {
      fetch: vi.fn(async (request: Request) => {
        const path = new URL(request.url).pathname
        if (path === '/index.html')
          return new Response('<html>app</html>', {
            headers: { 'content-type': 'text/html', etag: '"index"' },
          })
        if (path === '/404.html')
          return new Response('<html>missing</html>', {
            headers: { 'content-type': 'text/html' },
          })
        if (path.startsWith('/assets/'))
          return new Response('asset', {
            headers: {
              'content-type': 'image/avif',
              etag: '"asset"',
            },
          })
        return new Response('missing', { status: 404 })
      }),
    },
  }
}

describe('edge routing', () => {
  it('redirects www and HTTP to the HTTPS apex preserving path and query', async () => {
    const www = await handleRequest(
      new Request('https://www.rozbirka.pro/privacy?from=www'),
      env(),
    )
    expect(www.status).toBe(308)
    expect(www.headers.get('location')).toBe(
      'https://rozbirka.pro/privacy?from=www',
    )

    const http = await handleRequest(
      new Request('http://rozbirka.pro/marketplace?q=part'),
      env(),
    )
    expect(http.status).toBe(308)
    expect(http.headers.get('location')).toBe(
      'https://rozbirka.pro/marketplace?q=part',
    )
  })

  it.each([
    '/',
    '/privacy',
    '/login',
    '/account',
    '/marketplace',
    '/marketplace/listings/fara-1',
    '/marketplace/shops/demo',
  ])('serves the SPA shell for %s', async (path) => {
    const response = await handleRequest(
      new Request(`https://rozbirka.pro${path}`),
      env(),
    )
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('app')
  })

  it('returns immutable assets without losing MIME or ETag', async () => {
    const response = await handleRequest(
      new Request('https://rozbirka.pro/assets/hero-AbCd1234.avif'),
      env(),
    )
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(response.headers.get('content-type')).toBe('image/avif')
    expect(response.headers.get('etag')).toBe('"asset"')
  })

  it.each(['/screens', '/screens/header', '/unknown'])(
    'returns a real 404 for %s',
    async (path) => {
      const response = await handleRequest(
        new Request(`https://rozbirka.pro${path}`),
        env(),
      )
      expect(response.status).toBe(404)
      expect(await response.text()).toContain('missing')
    },
  )
})
```

- [ ] **Step 2: Run Worker RED**

Run:

```bash
npm test -- worker/router.test.ts
```

Expected: FAIL because the edge router does not exist.

- [ ] **Step 3: Implement pure edge routing**

In `worker/router.ts`, define:

```ts
export interface EdgeEnv {
  ASSETS: {
    fetch(request: Request): Promise<Response>
  }
}

const spaPaths = [
  /^\/$/,
  /^\/privacy\/?$/,
  /^\/login\/?$/,
  /^\/account\/?$/,
  /^\/marketplace\/?$/,
  /^\/marketplace\/listings\/[^/]+\/?$/,
  /^\/marketplace\/shops\/[^/]+\/?$/,
]

const prototypePath = /^\/screens(?:\/|$)/
const staticPath =
  /^\/(?:robots\.txt|sitemap\.xml|favicon\.svg|og-cover\.webp|fonts\/[^/]+\.woff2)$/

function withHeaders(response: Response, headers: Record<string, string>) {
  const next = new Headers(response.headers)
  for (const [name, value] of Object.entries(headers)) next.set(name, value)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: next,
  })
}

function assetRequest(request: Request, path: string) {
  const url = new URL(request.url)
  url.pathname = path
  url.search = ''
  return new Request(url, { method: request.method, headers: request.headers })
}

function shouldNoindex(url: URL) {
  return (
    url.hostname.startsWith('qa.') ||
    url.hostname.endsWith('.workers.dev') ||
    /^\/(?:login|account)(?:\/|$)/.test(url.pathname)
  )
}

async function notFound(request: Request, env: EdgeEnv) {
  const page = await env.ASSETS.fetch(assetRequest(request, '/404.html'))
  const headers = new Headers(page.headers)
  headers.set('Cache-Control', 'max-age=0, must-revalidate')
  headers.set('X-Robots-Tag', 'noindex')
  return new Response(page.body, { status: 404, headers })
}

export async function handleRequest(request: Request, env: EdgeEnv) {
  const url = new URL(request.url)

  if (url.protocol === 'http:' || url.hostname === 'www.rozbirka.pro') {
    url.protocol = 'https:'
    url.hostname = 'rozbirka.pro'
    return Response.redirect(url.toString(), 308)
  }

  if (prototypePath.test(url.pathname)) return notFound(request, env)

  if (url.pathname.startsWith('/assets/')) {
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404) return notFound(request, env)
    return withHeaders(response, {
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  }

  if (staticPath.test(url.pathname)) {
    const response = await env.ASSETS.fetch(request)
    if (response.status === 404) return notFound(request, env)
    return withHeaders(response, {
      'Cache-Control': 'max-age=0, must-revalidate',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  if (spaPaths.some((pattern) => pattern.test(url.pathname))) {
    const response = await env.ASSETS.fetch(
      assetRequest(request, '/index.html'),
    )
    return withHeaders(response, {
      'Cache-Control': 'max-age=0, must-revalidate',
      ...(shouldNoindex(url) ? { 'X-Robots-Tag': 'noindex' } : {}),
    })
  }

  return notFound(request, env)
}
```

Do not intercept or proxy `/api/*` in Worker code. Production API routes must
remain higher-precedence Cloudflare routes; the deployment dry-run and
post-deploy API health check guard this boundary.

- [ ] **Step 4: Add the typed Worker entrypoint**

Create `worker/index.ts`:

```ts
import { handleRequest } from './router'

export default {
  fetch(request, env) {
    return handleRequest(request, env)
  },
} satisfies ExportedHandler<Env>
```

- [ ] **Step 5: Configure Wrangler**

Set:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "rozbirka-pro-web",
  "main": "worker/index.ts",
  "account_id": "22a32b350711ff6b9b27d29f8a93eb6d",
  "compatibility_date": "2026-07-24",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "none",
    "run_worker_first": true
  },
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1
  },
  "env": {
    "qa": {
      "name": "qa-rozbirka-pro-web"
    },
    "production": {
      "name": "rozbirka-pro-web",
      "routes": [
        {
          "pattern": "rozbirka.pro",
          "custom_domain": true
        },
        {
          "pattern": "www.rozbirka.pro",
          "custom_domain": true
        }
      ]
    }
  }
}
```

- [ ] **Step 6: Extend the Node/Worker TypeScript project**

Update `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "WebWorker"],
    "module": "esnext",
    "types": ["node", "vitest/globals", "@cloudflare/workers-types"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": [
    "vite.config.ts",
    "worker/**/*.ts",
    "worker-configuration.d.ts"
  ]
}
```

- [ ] **Step 7: Generate types and validate config**

Run:

```bash
npx wrangler types worker-configuration.d.ts
npx wrangler deploy --dry-run --env qa
npx wrangler deploy --dry-run --env production
```

Expected: types generate and both dry-runs exit 0 without deployment.

- [ ] **Step 8: Run Worker GREEN**

Run:

```bash
npm test -- worker/router.test.ts
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 9: Commit edge routing**

```bash
git add worker worker-configuration.d.ts wrangler.jsonc tsconfig.node.json \
  package.json package-lock.json
git commit -m "feat: add production edge routing"
```

---

### Task 6: Add Repeatable Performance and Release Gates

**Repository:** `/Users/user/Code/rozbirka/rozbirka.web`

**Files:**

- Create: `lighthouserc.cjs`
- Create: `playwright.config.ts`
- Create: `e2e/landing.spec.ts`
- Create: `e2e/landing.spec.ts-snapshots/**`
- Create: `scripts/check-production-routes.mjs`
- Create: `scripts/check-production-routes.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/deploy-node-static-template.yml`
- Modify: `.github/workflows/deploy-rozbirka-web.yml`
- Modify: `wrangler.jsonc`

**Interfaces:**

- Produces:
  `npm run verify:prod`, `npm run audit:lhci`, and direct post-deploy route
  verification.

- [ ] **Step 1: Add LHCI and failing route-check tests**

Run:

```bash
npm install --save-dev @axe-core/playwright @lhci/cli @playwright/test
```

Extract direct-request assertions into exported functions and test:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validateProductionResponses } from './check-production-routes.mjs'

it('rejects soft 404s and weak asset caching', () => {
  expect(() =>
    validateProductionResponses({
      home: { status: 200, contentType: 'text/html' },
      unknown: { status: 200, contentType: 'text/html' },
      robots: { status: 200, contentType: 'text/html' },
      sitemap: { status: 200, contentType: 'text/html' },
      asset: { status: 200, cacheControl: 'max-age=0' },
    }),
  ).toThrow()
})
```

- [ ] **Step 2: Run release-gate RED**

Run:

```bash
npm test -- scripts/check-production-routes.test.ts
```

Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement LHCI thresholds**

Create `lighthouserc.cjs`:

```js
module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      numberOfRuns: 1,
      settings: {
        onlyCategories: ['performance', 'accessibility', 'seo'],
      },
    },
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-byte-weight': ['error', { maxNumericValue: 3 * 1024 * 1024 }],
      },
    },
    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
}
```

Omitting `preset` keeps Lighthouse on its mobile/default profile.

- [ ] **Step 4: Add cross-browser, axe, and responsive screenshot coverage**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    port: 4173,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'android', use: { ...devices['Pixel 5'] } },
    { name: 'ios', use: { ...devices['iPhone 13'] } },
  ],
})
```

Create `e2e/landing.spec.ts`:

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('landing interactions work without serious accessibility violations', async ({
  page,
}) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])

  await page.getByRole('button', { name: 'Наступна' }).click()
  await page
    .getByRole('button', { name: 'Зупинити автопрокрутку' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Увімкнути автопрокрутку' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('link', { name: 'Почати 14 днів безкоштовно' }),
  ).toHaveAttribute('href', '/login?plan=pro_monthly')
})

test.describe('responsive matrix', () => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    test(`has no horizontal overflow at ${width}px`, async ({
      page,
      browserName,
    }, testInfo) => {
      test.skip(
        browserName !== 'chromium',
        'The screenshot matrix is captured once in Chromium',
      )
      await page.setViewportSize({ width, height: 1000 })
      await page.goto('/')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth === window.innerWidth,
        ),
      ).toBe(true)
      await expect(page).toHaveScreenshot(`landing-${width}.png`, {
        fullPage: true,
        animations: 'disabled',
      })
      await testInfo.attach(`landing-${width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    })
  }
})
```

Generate and inspect the five baselines:

```bash
npx playwright install chromium firefox webkit
npx playwright test --project=chromium --update-snapshots
npx playwright test
```

- [ ] **Step 5: Implement the direct response checker**

`scripts/check-production-routes.mjs` accepts a base URL and checks:

- `/` → 200 HTML;
- `/privacy` → 200 HTML;
- `/marketplace/listings/qa-probe` → 200 HTML shell;
- `/screens`, `/screens/header`, and `/definitely-missing` → 404;
- `/robots.txt` → 200 `text/plain`;
- `/sitemap.xml` → 200 XML;
- one fingerprinted `/assets/*` URL → immutable one-year browser caching;
- the public `/api/v1/billing/plans` route does not return the SPA shell;
- `http://rozbirka.pro/*` and `https://www.rozbirka.pro/*` redirect to the
  HTTPS apex preserving path/query.

Implement the checker with this pure validation boundary:

```js
import { pathToFileURL } from 'node:url'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateProductionResponses(result) {
  assert(result.home.status === 200, 'home must return 200')
  assert(result.home.contentType.includes('text/html'), 'home must be HTML')
  assert(result.unknown.status === 404, 'unknown route must return 404')
  assert(result.robots.status === 200, 'robots must return 200')
  assert(
    result.robots.contentType.includes('text/plain'),
    'robots must be text/plain',
  )
  assert(result.sitemap.status === 200, 'sitemap must return 200')
  assert(
    /xml/.test(result.sitemap.contentType),
    'sitemap must use an XML MIME type',
  )
  assert(result.asset.status === 200, 'fingerprinted asset must return 200')
  assert(
    result.asset.cacheControl ===
      'public, max-age=31536000, immutable',
    'fingerprinted asset must be immutable',
  )
  assert(result.api.status === 200, 'public billing plans must return 200')
  assert(
    /json/.test(result.api.contentType) && !result.api.body.includes('<html'),
    'public billing plans must return JSON, not the SPA shell',
  )
  for (const [name, response] of Object.entries(result.prototypes)) {
    assert(response.status === 404, `${name} must return 404`)
  }
  if (result.redirects) {
    assert(result.redirects.http.status === 308, 'HTTP must return 308')
    assert(
      result.redirects.http.location ===
        'https://rozbirka.pro/privacy?source=http',
      'HTTP redirect target is wrong',
    )
    assert(result.redirects.www.status === 308, 'www must return 308')
    assert(
      result.redirects.www.location ===
        'https://rozbirka.pro/privacy?source=www',
      'www redirect target is wrong',
    )
  }
}

async function inspect(url, redirect = 'follow') {
  const response = await fetch(url, { redirect })
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    cacheControl: response.headers.get('cache-control') ?? '',
    location: response.headers.get('location') ?? '',
    body: await response.text(),
  }
}

export async function checkProductionRoutes(baseUrl) {
  const base = new URL(baseUrl)
  const home = await inspect(new URL('/', base))
  const assetPath = home.body.match(/\/assets\/[^"' ]+/)?.[0]
  assert(assetPath, 'home did not expose a fingerprinted asset')

  const result = {
    home,
    unknown: await inspect(new URL('/definitely-missing', base)),
    robots: await inspect(new URL('/robots.txt', base)),
    sitemap: await inspect(new URL('/sitemap.xml', base)),
    asset: await inspect(new URL(assetPath, base)),
    api: await inspect(new URL('/api/v1/billing/plans', base)),
    prototypes: {
      screens: await inspect(new URL('/screens', base)),
      header: await inspect(new URL('/screens/header', base)),
    },
    redirects:
      base.hostname === 'rozbirka.pro'
        ? {
            http: await inspect(
              'http://rozbirka.pro/privacy?source=http',
              'manual',
            ),
            www: await inspect(
              'https://www.rozbirka.pro/privacy?source=www',
              'manual',
            ),
          }
        : undefined,
  }
  validateProductionResponses(result)
  return result
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const baseUrl = process.argv[2]
  if (!baseUrl) throw new Error('Usage: npm run check:routes -- <base-url>')
  await checkProductionRoutes(baseUrl)
}
```

- [ ] **Step 6: Add scripts and CI gate**

Add:

```json
"audit:lhci": "lhci autorun",
"test:e2e": "playwright test",
"check:routes": "node scripts/check-production-routes.mjs",
"verify:prod": "npm run check && npm run build:prod && npm run budget:assets && npm run test:e2e && npm run audit:lhci && wrangler deploy --dry-run --env production"
```

In `deploy-node-static-template.yml`, production builds run
`npm run verify:prod`. Before browser checks, CI runs:

```bash
npx playwright install --with-deps chromium firefox webkit
```

QA runs:

```bash
npm run check
npm run build:qa
npm run budget:assets
npm run test:e2e
npx wrangler deploy --dry-run --env qa
```

The deploy job still uses the already built artifact and never rebuilds a
different source state.

- [ ] **Step 7: Format the edge/deployment baseline**

Run:

```bash
npx prettier --write \
  .github/workflows/deploy-node-static-template.yml \
  .github/workflows/deploy-rozbirka-web.yml \
  wrangler.jsonc
```

These are the three known repository-wide Prettier failures and are now
in-scope because this delivery changes edge/deployment configuration.

- [ ] **Step 8: Run GREEN and commit**

Run:

```bash
npm test -- scripts/check-production-routes.test.ts
npm run verify:prod
git diff --check
```

Then:

```bash
git add lighthouserc.cjs scripts/check-production-routes.mjs \
  scripts/check-production-routes.test.ts package.json package-lock.json \
  playwright.config.ts e2e \
  .github/workflows/deploy-node-static-template.yml \
  .github/workflows/deploy-rozbirka-web.yml wrangler.jsonc
git commit -m "ci: enforce landing production budgets"
```

---

### Task 7: Combined Verification, QA Deploy, and Production Domain Activation

**Repositories:** `rozbirka.core` and `rozbirka.web`

**Files:**

- Verify only unless a failing check requires a scoped TDD fix.

**Interfaces:**

- Consumes: Tasks 1–6.
- Produces: reviewed and deployed ROZ-12 remaining scope.

- [ ] **Step 1: Verify core**

Run:

```bash
dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj
git diff --check
git status --short
```

Expected: all tests pass and the worktree is clean.

- [ ] **Step 2: Verify web**

Run:

```bash
npm run verify:prod
git diff --check
git status --short
```

Expected: 0 failures; Lighthouse, asset budgets, production build, and
Wrangler production dry-run pass.

- [ ] **Step 3: Run final whole-delivery review**

Review:

- core base → core feature HEAD;
- web base → web feature HEAD;
- exact fallback parity with `BillingPlanCatalog`;
- route/API precedence and no `/api/*` interception;
- generated-asset source mapping;
- SEO claims and structured data;
- production Custom Domain implications.

Fix every Critical and Important finding with a failing regression test, then
repeat the review.

- [ ] **Step 4: Merge and push core to `develop`**

Fast-forward or merge the core feature branch into current
`origin/develop`, rerun the core suite on the merged result, and push
`develop`.

- [ ] **Step 5: Merge and push web to `develop`**

Fast-forward or merge the web feature branch into current `origin/develop`,
rerun `npm run check`, `npm run build:qa`, `npm run budget:assets`, and the QA
Wrangler dry-run on the merged result, then push `develop`.

Expected: the existing workflow deploys the exact pushed commit to QA.

- [ ] **Step 6: Verify QA**

After the workflow completes, run:

```bash
npm run check:routes -- https://qa.rozbirka.pro
```

Also confirm pricing API values, 14-day copy, mobile hidden-hero behavior, and
the 320/375/768/1024/1440 layout matrix. Exercise navigation, pricing,
carousel, FAQ, and deep links in Safari iOS, Chrome Android, Chrome desktop,
Safari desktop, and Firefox desktop. Record interaction latency; Lighthouse
TBT must stay at or below 200 ms, and observed INP-capable browser interaction
measurements must stay at or below 200 ms.

- [ ] **Step 7: Activate production domains only from a reviewed commit**

Because local Wrangler is unauthenticated, production deploy must use the
repository’s GitHub Actions Cloudflare token. Dispatch the existing production
workflow against the reviewed web commit only after QA passes.

The production deployment may create or attach exact Custom Domains for
`rozbirka.pro` and `www.rozbirka.pro`. Do not create wildcard records or alter
email DNS/MX.

- [ ] **Step 8: Verify production**

Run:

```bash
npm run check:routes -- https://rozbirka.pro
```

Verify:

- `http://rozbirka.pro/privacy?source=http` → 308 to HTTPS apex;
- `https://www.rozbirka.pro/privacy?source=www` → 308 to HTTPS apex;
- public billing API returns JSON and 14-day plan metadata;
- unknown/prototype paths return 404;
- robots/sitemap MIME and content are valid;
- fingerprinted assets are immutable;
- Lighthouse release thresholds pass.

- [ ] **Step 9: Update Linear**

Add a ROZ-12 completion comment containing core/web commit SHAs, QA and
production verification evidence, measured Lighthouse values, and any
Cloudflare domain IDs returned by deployment. Move ROZ-12 to Done only when
every acceptance check above is confirmed.
