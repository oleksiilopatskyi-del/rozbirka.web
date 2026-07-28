# ROZ-13 SEO First Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three independently indexable product pages for Rozbirka with unique Ukrainian content, route-aware metadata and structured data, multi-route prerendering, sitemap coverage, and Cloudflare edge routing.

**Architecture:** A typed product SEO registry owns keyword, metadata, canonical, and breadcrumb policy for `/`, `/oblik-avtozapchastyn`, and `/oblik-prodazhiv-avtozapchastyn`. Shared use-case components render two page-specific content definitions, while the browser and prerender pipeline consume the same SEO records. The build emits a complete HTML document per product route, and the Worker serves those documents directly.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vite 8 SSR/prerendering, Vitest, Testing Library, Cloudflare Workers, Playwright.

## Global Constraints

- Canonical origin is exactly `https://rozbirka.pro`.
- Preserve the existing brand, layout identity, shared site chrome, accessibility, and performance baseline.
- Do not add Google Search Console, GA4, Bing Webmaster Tools, or fabricated keyword-volume/position data.
- Do not claim accounting, tax filing, PRRO/fiscalization, delivery integrations, supplier price-list integrations, ratings, reviews, or unsupported product capabilities.
- Keep `/login`, `/account`, QA hosts, and workers.dev hosts `noindex`.
- Preserve real HTTP 404 behavior and current canonical host redirects.
- Every product route must have exactly one H1, unique useful copy, unique metadata, and a unique primary query cluster.
- Use test-driven development: write a focused failing test, observe the expected failure, implement the minimum behavior, rerun the focused test, then commit.
- Do not add an SEO framework dependency; the registry, serializer, and head synchronization remain small local modules.

## File Structure

### New files

- `docs/seo/roz-13-keyword-map.md` — qualitative keyword research, intent, competitor evidence, page ownership, and pending external baseline fields.
- `src/seo/product-seo.ts` — typed product-route registry and lookup helpers; no React imports.
- `src/seo/product-seo.test.ts` — registry uniqueness, completeness, and baseline contracts.
- `src/seo/structured-data.ts` — typed schema.org graph builders and safe JSON serialization.
- `src/seo/structured-data.test.ts` — schema type, canonical entity, breadcrumb, and FAQ parity contracts.
- `src/seo/route-seo.tsx` — client-side document-head synchronization for product routes.
- `src/seo/route-seo.test.tsx` — title/meta/canonical/JSON-LD browser navigation contracts.
- `src/content/use-case-pages.ts` — unique inventory and sales page copy, workflows, capabilities, related links, and visible FAQs.
- `src/components/seo/breadcrumbs.tsx` — accessible product-page breadcrumb navigation.
- `src/components/seo/use-case-page.tsx` — shared visual composition for a page-specific content record.
- `src/components/seo/use-case-page.test.tsx` — semantics, unique copy, internal links, FAQ, and CTA coverage.
- `src/screens/parts-inventory.tsx` — route wrapper for the inventory content record.
- `src/screens/parts-sales.tsx` — route wrapper for the sales content record.
- `scripts/prerender-helpers.mjs` — pure head injection, output-path, and generated-document assertions used by the build.
- `scripts/prerender-helpers.test.ts` — fast prerender helper contracts that do not require a pre-existing `dist`.
- `scripts/check-prerender-output.mjs` — post-build verification of all generated product documents.

### Modified files

- `index.html` — improve the homepage fallback title/description and mark replaceable SEO nodes.
- `src/App.tsx` — mount homepage route SEO and contextual links to both use cases.
- `src/components/site/hero.tsx` — category-focused homepage H1 and introductory copy.
- `src/components/site/hero.test.tsx` — lock the approved homepage category copy.
- `src/components/site/nav-items.ts` — expose route-safe home-section destinations.
- `src/components/site/nav-links.tsx` — keep navigation usable from nested SEO routes.
- `src/components/site/nav-links.test.tsx` — verify nested-route destinations.
- `src/routes/routes.tsx` — register both product landing routes.
- `src/routes/routes.test.tsx` — assert production availability of the routes.
- `src/entry-server.tsx` — expose route-aware rendering and the product SEO manifest.
- `scripts/prerender.mjs` — emit one HTML document per product SEO route and generate the production sitemap.
- `package.json` — expose the deterministic post-build `check:prerender` command.
- `src/seo/seo-files.test.ts` — validate sitemap membership against the registry.
- `public/sitemap.xml` — add both use-case URLs for local/static parity.
- `worker/router.ts` — serve the nested prerendered documents.
- `worker/router.test.ts` — assert direct, trailing-slash, cache, canonical, and missing-document behavior.
- `scripts/check-production-routes.mjs` — probe both product pages after deployment.
- `scripts/check-production-routes.test.ts` — lock the new production probes.
- `e2e/landing.spec.ts` — add lightweight semantic smoke checks for the two pages without adding visual snapshots.

---

### Task 1: Keyword Map and Typed Product SEO Registry

**Files:**

- Create: `docs/seo/roz-13-keyword-map.md`
- Create: `src/seo/product-seo.ts`
- Create: `src/seo/product-seo.test.ts`

**Interfaces:**

- Produces: `ProductSeoPath`, `ProductSeoEntry`, `productSeoEntries`, `productSeoPaths`, and `getProductSeo(pathname)`.
- `getProductSeo(pathname: string): ProductSeoEntry | undefined` normalizes a trailing slash except for `/`.
- Later tasks consume `ProductSeoEntry.faqSchema`, `breadcrumbs`, metadata, and keyword ownership.

- [ ] **Step 1: Write the failing registry tests**

Create `src/seo/product-seo.test.ts` with these contracts:

```ts
import { describe, expect, it } from 'vitest'
import {
  getProductSeo,
  productSeoEntries,
  productSeoPaths,
} from './product-seo'

describe('product SEO registry', () => {
  it('owns exactly three unique product routes and primary clusters', () => {
    expect(productSeoPaths).toEqual([
      '/',
      '/oblik-avtozapchastyn',
      '/oblik-prodazhiv-avtozapchastyn',
    ])
    expect(new Set(productSeoEntries.map((entry) => entry.path)).size).toBe(3)
    expect(
      new Set(productSeoEntries.map((entry) => entry.primaryQuery)).size,
    ).toBe(3)
  })

  it('provides complete canonical and social metadata', () => {
    for (const entry of productSeoEntries) {
      expect(entry.canonical).toBe(
        entry.path === '/'
          ? 'https://rozbirka.pro/'
          : `https://rozbirka.pro${entry.path}`,
      )
      expect(entry.title.length).toBeGreaterThan(20)
      expect(entry.description.length).toBeGreaterThan(80)
      expect(entry.ogImage).toBe('https://rozbirka.pro/og-cover.webp')
      expect(entry.indexable).toBe(true)
      expect(entry.includeInSitemap).toBe(true)
    }
  })

  it('normalizes trailing slashes and keeps external metrics unmeasured', () => {
    expect(getProductSeo('/oblik-avtozapchastyn/')).toBe(
      getProductSeo('/oblik-avtozapchastyn'),
    )
    for (const entry of productSeoEntries) {
      expect(entry.baseline).toEqual({
        status: 'pending-external-tools',
        volume: null,
        difficulty: null,
        impressions: null,
        clicks: null,
        ctr: null,
        position: null,
      })
    }
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run:

```bash
npm test -- src/seo/product-seo.test.ts
```

Expected: FAIL because `src/seo/product-seo.ts` does not exist.

- [ ] **Step 3: Implement the typed registry**

Create `src/seo/product-seo.ts` with exact public interfaces:

```ts
export type ProductSeoPath =
  | '/'
  | '/oblik-avtozapchastyn'
  | '/oblik-prodazhiv-avtozapchastyn'

export interface SeoBaseline {
  status: 'pending-external-tools'
  volume: null
  difficulty: null
  impressions: null
  clicks: null
  ctr: null
  position: null
}

export interface SeoBreadcrumb {
  name: string
  path: ProductSeoPath
}

export interface ProductSeoEntry {
  path: ProductSeoPath
  canonical: string
  title: string
  description: string
  primaryQuery: string
  supportingQueries: readonly string[]
  intent: 'commercial-category' | 'commercial-use-case'
  ogImage: 'https://rozbirka.pro/og-cover.webp'
  breadcrumbs: readonly SeoBreadcrumb[]
  faqSchema: boolean
  indexable: true
  includeInSitemap: true
  baseline: SeoBaseline
}
```

Use these exact metadata values:

```ts
const pendingBaseline: SeoBaseline = {
  status: 'pending-external-tools',
  volume: null,
  difficulty: null,
  impressions: null,
  clicks: null,
  ctr: null,
  position: null,
}

export const productSeoEntries: readonly ProductSeoEntry[] = [
  {
    path: '/',
    canonical: 'https://rozbirka.pro/',
    title: 'Програма для авторозбірки — облік запчастин і продажів | rozbirka',
    description:
      'rozbirka — програма для авторозбірки: облік авто й запчастин, склад, замовлення, каси, клієнти, QR-стікери та робота команди.',
    primaryQuery: 'програма для авторозбірки',
    supportingQueries: [
      'CRM для авторозбірки',
      'програма для розборки авто',
    ],
    intent: 'commercial-category',
    ogImage: 'https://rozbirka.pro/og-cover.webp',
    breadcrumbs: [],
    faqSchema: true,
    indexable: true,
    includeInSitemap: true,
    baseline: pendingBaseline,
  },
  {
    path: '/oblik-avtozapchastyn',
    canonical: 'https://rozbirka.pro/oblik-avtozapchastyn',
    title: 'Облік автозапчастин для авторозбірки | rozbirka',
    description:
      'Ведіть складський облік автозапчастин: картки деталей, фото, місця зберігання, залишки, резерви, пошук і QR-стікери в rozbirka.',
    primaryQuery: 'облік автозапчастин',
    supportingQueries: [
      'програма для складу автозапчастин',
      'складський облік автозапчастин',
    ],
    intent: 'commercial-use-case',
    ogImage: 'https://rozbirka.pro/og-cover.webp',
    breadcrumbs: [
      { name: 'Головна', path: '/' },
      { name: 'Облік автозапчастин', path: '/oblik-avtozapchastyn' },
    ],
    faqSchema: true,
    indexable: true,
    includeInSitemap: true,
    baseline: pendingBaseline,
  },
  {
    path: '/oblik-prodazhiv-avtozapchastyn',
    canonical: 'https://rozbirka.pro/oblik-prodazhiv-avtozapchastyn',
    title: 'Облік продажів автозапчастин і замовлень | rozbirka',
    description:
      'Керуйте продажами автозапчастин: замовленнями, клієнтами, оплатами, касами та звітами в одному мобільному застосунку rozbirka.',
    primaryQuery: 'облік продажів автозапчастин',
    supportingQueries: [
      'програма для магазину автозапчастин',
      'облік замовлень автозапчастин',
    ],
    intent: 'commercial-use-case',
    ogImage: 'https://rozbirka.pro/og-cover.webp',
    breadcrumbs: [
      { name: 'Головна', path: '/' },
      {
        name: 'Облік продажів автозапчастин',
        path: '/oblik-prodazhiv-avtozapchastyn',
      },
    ],
    faqSchema: true,
    indexable: true,
    includeInSitemap: true,
    baseline: pendingBaseline,
  },
]

export const productSeoPaths = productSeoEntries.map((entry) => entry.path)

export function getProductSeo(pathname: string) {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname
  return productSeoEntries.find((entry) => entry.path === normalized)
}
```

Use the explicit return type:

```ts
export function getProductSeo(
  pathname: string,
): ProductSeoEntry | undefined
```

- [ ] **Step 4: Record the qualitative keyword evidence**

Create `docs/seo/roz-13-keyword-map.md`. Include the three registry rows, mark all numeric metrics `pending external tools`, and record these qualitative SERP references:

- ERP FOSS: `https://erp.foss.ua/programa-obliku-avtozapchastin/`
- RemOnline: `https://remonline.ua/autoparts/`
- Vortex: `https://crm-vortex.com/`
- VIN-matrix: `https://vin-matrix.com/`
- Torgsoft: `https://torgsoft.ua/support/videolessons/auto-parts-store-accounting/`

State explicitly that the evidence confirms active commercial competition around parts inventory/store queries but does not establish numeric search volume. Explain that the homepage owns the autorozbirka/CRM category, inventory owns stock and QR intent, and sales owns order/customer/cash intent.

- [ ] **Step 5: Run focused tests and formatting**

Run:

```bash
npm test -- src/seo/product-seo.test.ts
npx prettier --check src/seo/product-seo.ts src/seo/product-seo.test.ts docs/seo/roz-13-keyword-map.md
```

Expected: registry tests PASS and Prettier reports all files formatted.

- [ ] **Step 6: Commit the registry**

```bash
git add docs/seo/roz-13-keyword-map.md src/seo/product-seo.ts src/seo/product-seo.test.ts
git commit -m "feat(web): define ROZ-13 product SEO registry"
```

### Task 2: Unique Use-Case Content, Components, and Routes

**Files:**

- Create: `src/content/use-case-pages.ts`
- Create: `src/components/seo/breadcrumbs.tsx`
- Create: `src/components/seo/use-case-page.tsx`
- Create: `src/components/seo/use-case-page.test.tsx`
- Create: `src/screens/parts-inventory.tsx`
- Create: `src/screens/parts-sales.tsx`
- Create: `src/components/site/nav-links.test.tsx`
- Modify: `src/components/site/nav-items.ts`
- Modify: `src/components/site/nav-links.tsx`
- Modify: `src/routes/routes.tsx`
- Modify: `src/routes/routes.test.tsx`

**Interfaces:**

- Consumes: `ProductSeoPath` and `getProductSeo(pathname)` from Task 1.
- Produces: `FaqItem`, `UseCasePageContent`, `useCasePages`, `getUseCasePage(path)`, `Breadcrumbs`, and `UseCasePage`.
- The structured-data task consumes `UseCasePageContent.faq`.

- [ ] **Step 1: Write failing component and route tests**

In `src/components/seo/use-case-page.test.tsx`, render both screens inside `MemoryRouter` and assert:

```ts
expect(
  screen.getByRole('heading', {
    level: 1,
    name: 'Облік автозапчастин для авторозбірки без таблиць і хаосу',
  }),
).toBeInTheDocument()
expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
expect(screen.getByRole('link', { name: 'Облік продажів' })).toHaveAttribute(
  'href',
  '/oblik-prodazhiv-avtozapchastyn',
)
expect(screen.getByRole('link', { name: 'Спробувати rozbirka' })).toHaveAttribute(
  'href',
  '/login',
)
```

For the sales page assert this H1:

```text
Облік продажів автозапчастин: від замовлення до оплати
```

Assert its related link points to `/oblik-avtozapchastyn`. Assert that the inventory page contains the text `QR-стікер`, while the sales page contains `кілька платежів`; this prevents mechanical duplicate copy.

Extend `src/routes/routes.test.tsx`:

```ts
it('publishes both ROZ-13 product routes in production', () => {
  const paths = createAppRoutes(false).map((route) => route.path)
  expect(paths).toContain('/oblik-avtozapchastyn')
  expect(paths).toContain('/oblik-prodazhiv-avtozapchastyn')
})
```

Create `src/components/site/nav-links.test.tsx` and render at `/oblik-avtozapchastyn`; assert `Можливості`, `Тарифи`, and `FAQ` link to `/#features`, `/#pricing`, and `/#faq`.

- [ ] **Step 2: Run the focused tests and confirm failures**

Run:

```bash
npm test -- src/components/seo/use-case-page.test.tsx src/components/site/nav-links.test.tsx src/routes/routes.test.tsx
```

Expected: FAIL because the new content, screens, components, and routes do not exist.

- [ ] **Step 3: Define the page-content interface and exact copy**

Create `src/content/use-case-pages.ts`:

```ts
import type { ProductSeoPath } from '@/seo/product-seo'

export interface FaqItem {
  question: string
  answer: string
}

export interface UseCasePageContent {
  path: Exclude<ProductSeoPath, '/'>
  eyebrow: string
  h1: string
  intro: string
  outcomes: readonly { title: string; body: string }[]
  capabilities: readonly { title: string; body: string }[]
  workflow: readonly { title: string; body: string }[]
  faq: readonly FaqItem[]
  related: { label: string; path: Exclude<ProductSeoPath, '/'>; body: string }
}
```

Populate the inventory record with these exact values:

```ts
{
  path: '/oblik-avtozapchastyn',
  eyebrow: 'Облік автозапчастин',
  h1: 'Облік автозапчастин для авторозбірки без таблиць і хаосу',
  intro:
    'Зберігайте дані про кожну деталь, швидко знаходьте її на складі та бачте актуальний статус — від розбору авто до резерву або продажу.',
  outcomes: [
    {
      title: 'Знайти деталь за секунди',
      body: 'Шукайте за авто, партією або кодом і відкривайте повну картку потрібної запчастини.',
    },
    {
      title: 'Бачити реальні залишки',
      body: 'Відрізняйте вільні деталі від зарезервованих і тих, що вже додані до замовлення.',
    },
    {
      title: 'Не губити походження',
      body: 'Зберігайте зв’язок запчастини з конкретним авто або партією та переглядайте її історію.',
    },
  ],
  capabilities: [
    {
      title: 'Картка кожної деталі',
      body: 'Назва, стан, фото, ціна, місце зберігання та історія змін зібрані в одному записі.',
    },
    {
      title: 'Склад і пошук',
      body: 'Фільтри за авто, партією та кодом допомагають швидко знайти потрібну позицію.',
    },
    {
      title: 'Резерви та статуси',
      body: 'Актуальний статус показує, чи доступна деталь, зарезервована або вже входить до замовлення.',
    },
    {
      title: 'QR-стікери',
      body: 'Надрукуйте стікер із QR-кодом і назвою, а потім відкрийте картку деталі скануванням із телефона.',
    },
  ],
  workflow: [
    {
      title: 'Додайте авто або партію',
      body: 'Зафіксуйте джерело запчастин, витрати, фото та основні дані.',
    },
    {
      title: 'Створіть картки запчастин',
      body: 'Додайте стан, ціну, місце зберігання та надрукуйте QR-стікер за потреби.',
    },
    {
      title: 'Знайдіть, зарезервуйте або продайте',
      body: 'Використайте пошук, перевірте статус і продовжте роботу з актуальною карткою деталі.',
    },
  ],
  faq: [
    {
      question: 'Чи можна прив’язати запчастину до конкретного авто?',
      answer:
        'Так. Картка запчастини зберігає зв’язок з авто або партією, з яких вона походить.',
    },
    {
      question: 'Як знайти потрібну деталь на складі?',
      answer:
        'Використовуйте пошук за авто, партією або кодом і перевіряйте місце зберігання у картці деталі.',
    },
    {
      question: 'Що містить QR-стікер?',
      answer:
        'Стікер містить QR-код і назву. Після сканування з телефона відкривається відповідна картка запчастини.',
    },
  ],
  related: {
    label: 'Облік продажів',
    path: '/oblik-prodazhiv-avtozapchastyn',
    body: 'Подивіться, як rozbirka допомагає вести замовлення, клієнтів, оплати та каси.',
  },
}
```

Populate the sales record with these exact values:

```ts
{
  path: '/oblik-prodazhiv-avtozapchastyn',
  eyebrow: 'Продажі автозапчастин',
  h1: 'Облік продажів автозапчастин: від замовлення до оплати',
  intro:
    'Збирайте замовлення, зберігайте історію клієнтів, приймайте кілька платежів і контролюйте рух коштів без окремих таблиць.',
  outcomes: [
    {
      title: 'Контролювати кожне замовлення',
      body: 'Бачте склад замовлення та його статус від резерву деталей до завершення продажу.',
    },
    {
      title: 'Знати історію клієнта',
      body: 'Зберігайте контакти й попередні покупки клієнта в одній картці.',
    },
    {
      title: 'Бачити рух коштів',
      body: 'Розподіляйте оплати між потрібними касами та переглядайте звіти про рухи.',
    },
  ],
  capabilities: [
    {
      title: 'Замовлення і статуси',
      body: 'Додавайте клієнта й деталі, фіксуйте ціну та відстежуйте замовлення до завершення.',
    },
    {
      title: 'Клієнтська база',
      body: 'Контакти, історія замовлень і швидкий перехід до нового продажу доступні з картки клієнта.',
    },
    {
      title: 'Оплати й каси',
      body: 'Приймайте кілька платежів у підтримуваних валютах і спрямовуйте їх до відповідних кас.',
    },
    {
      title: 'Звіти про продажі',
      body: 'Переглядайте підтримувані звіти про продажі, фінанси та рухи за вибраний період.',
    },
  ],
  workflow: [
    {
      title: 'Оберіть клієнта й деталі',
      body: 'Створіть замовлення з наявних запчастин і прив’яжіть його до картки клієнта.',
    },
    {
      title: 'Зафіксуйте ціну та оплату',
      body: 'Додайте один або кілька платежів і виберіть відповідні каси.',
    },
    {
      title: 'Завершіть замовлення й перегляньте звіт',
      body: 'Оновіть статус продажу та перевірте його відображення в історії клієнта і звітах.',
    },
  ],
  faq: [
    {
      question: 'Чи можна прийняти оплату кількома платежами?',
      answer:
        'Так. Замовлення підтримує кілька платежів, зокрема в різних підтримуваних валютах і на різні каси.',
    },
    {
      question: 'Чи зберігається історія замовлень клієнта?',
      answer:
        'Так. У картці клієнта доступні його контакти та пов’язана історія замовлень.',
    },
    {
      question: 'Чи можна працювати з кількома касами?',
      answer:
        'Так, кількість доступних кас залежить від тарифного плану. Оплату можна спрямувати до потрібної каси.',
    },
  ],
  related: {
    label: 'Облік автозапчастин',
    path: '/oblik-avtozapchastyn',
    body: 'Подивіться, як організувати картки деталей, залишки, пошук, резерви та QR-стікери.',
  },
}
```

Export both records and a strict lookup:

```ts
export const useCasePages: readonly UseCasePageContent[] = [
  inventoryPage,
  salesPage,
]

export function getUseCasePage(
  path: Exclude<ProductSeoPath, '/'>,
): UseCasePageContent {
  const page = useCasePages.find((entry) => entry.path === path)
  if (!page) throw new Error(`Missing use-case content for ${path}`)
  return page
}
```

- [ ] **Step 4: Implement shared semantic components**

Implement `Breadcrumbs` as a `<nav aria-label="Хлібні крихти">` containing an ordered list and React Router `Link` elements.

Implement `UseCasePage` in this semantic order:

1. shared `SiteHeader`;
2. `<main id="main">`;
3. hero section containing `Breadcrumbs`, eyebrow, the only H1, intro, and
   `/login` CTA;
4. outcomes section mapping every `content.outcomes` item under
   `<h2 id="outcomes-heading">Що змінюється в щоденній роботі</h2>`;
5. capabilities section mapping every `content.capabilities` item under
   `<h2 id="capabilities-heading">Можливості для цього процесу</h2>`;
6. ordered workflow section mapping every `content.workflow` item under
   `<h2 id="workflow-heading">Як почати</h2>`;
7. visible FAQ section mapping every question and answer under
   `<h2 id="faq-heading">Поширені питання</h2>`;
8. related-use-case section containing the exact related body and route link
   under `<h2 id="related-heading">Пов’язаний процес</h2>`;
9. shared `SiteFooter`.

Reuse `PageContainer`, `Section`, brand colors, typography, rounded cards, and minimum 44px interactive targets. Do not import the homepage feature carousel or pricing API into these pages.

- [ ] **Step 5: Add screen wrappers and production routes**

Each screen resolves its exact content and SEO record and throws a descriptive developer error if either is absent:

```tsx
export function PartsInventoryScreen() {
  return <UseCasePage content={getUseCasePage('/oblik-avtozapchastyn')} />
}
```

Add lazy production routes for both paths in `createAppRoutes()`, using the existing `hydrateFallbackElement`.

- [ ] **Step 6: Make shared navigation route-safe**

Extend `NavItem` with a separate `destination`:

```ts
export interface NavItem {
  label: string
  href: string
  destination: string
}

export const navItems: NavItem[] = [
  { label: 'Головна', href: '#top', destination: '/' },
  { label: 'Можливості', href: '#features', destination: '/#features' },
  { label: 'Тарифи', href: '#pricing', destination: '/#pricing' },
  { label: 'FAQ', href: '#faq', destination: '/#faq' },
]
```

Render `item.destination` as the anchor `href`, but keep
`activeHref === item.href` for the existing homepage active-state contract.
This preserves the current `activeHref="#top"` callers while making every
destination valid from a nested route.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/components/seo/use-case-page.test.tsx src/components/site/nav-links.test.tsx src/routes/routes.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 8: Commit the pages and routes**

```bash
git add src/content/use-case-pages.ts src/components/seo src/screens/parts-inventory.tsx src/screens/parts-sales.tsx src/components/site/nav-items.ts src/components/site/nav-links.tsx src/components/site/nav-links.test.tsx src/routes/routes.tsx src/routes/routes.test.tsx
git commit -m "feat(web): add ROZ-13 use-case pages"
```

### Task 3: Homepage Category Copy and Internal Links

**Files:**

- Modify: `src/components/site/hero.tsx`
- Modify: `src/components/site/hero.test.tsx`
- Create: `src/components/site/use-case-links.tsx`
- Create: `src/components/site/use-case-links.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: product paths from Task 1.
- Produces: homepage with one category-focused H1 and contextual links to both use cases.

- [ ] **Step 1: Update tests first**

Change the hero heading assertion to:

```text
Програма для авторозбірки, де кожна деталь і кожна оплата під контролем
```

Assert the visible introduction contains:

```text
Облік авто, запчастин, замовлень, кас і команди в одному застосунку.
```

Create `use-case-links.test.tsx` and assert two descriptive links:

```ts
expect(screen.getByRole('link', { name: /Облік автозапчастин/ })).toHaveAttribute(
  'href',
  '/oblik-avtozapchastyn',
)
expect(
  screen.getByRole('link', { name: /Облік продажів автозапчастин/ }),
).toHaveAttribute('href', '/oblik-prodazhiv-avtozapchastyn')
```

- [ ] **Step 2: Run tests and observe failures**

Run:

```bash
npm test -- src/components/site/hero.test.tsx src/components/site/use-case-links.test.tsx
```

Expected: FAIL on the old hero copy and missing component.

- [ ] **Step 3: Implement the approved homepage copy**

Preserve the animated heading treatment, but split these visible lines:

```ts
[
  'Програма для',
  'авторозбірки,',
  'де кожна деталь',
  'і кожна оплата',
  'під контролем',
]
```

Use the complete accessible H1 from Step 1 in the `sr-only` span. Replace the introduction with the exact sentence from Step 1. Keep the CTA destination `/login`.

- [ ] **Step 4: Add contextual use-case cards**

Create a static `UseCaseLinks` section after `Features` in `App.tsx`. Each card has a unique H2/H3, a two-sentence explanation, and a descriptive route link. Use these headings:

- `Облік автозапчастин на складі`
- `Облік продажів і замовлень`

Do not repeat the full use-case-page copy.

- [ ] **Step 5: Run focused and homepage regression tests**

Run:

```bash
npm test -- src/components/site/hero.test.tsx src/components/site/use-case-links.test.tsx src/App.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 6: Commit the homepage changes**

```bash
git add src/components/site/hero.tsx src/components/site/hero.test.tsx src/components/site/use-case-links.tsx src/components/site/use-case-links.test.tsx src/App.tsx
git commit -m "feat(web): focus homepage on autorozbirka software"
```

### Task 4: Structured Data and Client-Side Head Synchronization

**Files:**

- Create: `src/seo/structured-data.ts`
- Create: `src/seo/structured-data.test.ts`
- Create: `src/seo/route-seo.tsx`
- Create: `src/seo/route-seo.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/seo/use-case-page.tsx`

**Interfaces:**

- Consumes: `ProductSeoEntry`, `UseCasePageContent`, and visible FAQ records.
- Produces:
  - `buildStructuredData(entry, faq): Record<string, unknown>`
  - `serializeStructuredData(value): string`
  - `RouteSeo({ entry, faq })`
- Task 5 reuses both pure functions during prerendering.

- [ ] **Step 1: Write failing structured-data tests**

Cover these exact contracts:

```ts
const homeGraph = buildStructuredData(
  getProductSeo('/')!,
  homepageFaqEntries,
)
expect(JSON.stringify(homeGraph)).toContain('"@type":"Organization"')
expect(JSON.stringify(homeGraph)).toContain('"@type":"WebSite"')
expect(JSON.stringify(homeGraph)).toContain('"@type":"SoftwareApplication"')

const inventoryGraph = buildStructuredData(
  getProductSeo('/oblik-avtozapchastyn')!,
  getUseCasePage('/oblik-avtozapchastyn').faq,
)
expect(JSON.stringify(inventoryGraph)).toContain('"@type":"WebPage"')
expect(JSON.stringify(inventoryGraph)).toContain('"@type":"BreadcrumbList"')
expect(JSON.stringify(inventoryGraph)).toContain('"@type":"FAQPage"')
```

Assert every FAQ question and answer from the content record occurs exactly once in serialized JSON. Assert `serializeStructuredData()` escapes `<` as `\u003c` to prevent script termination.

- [ ] **Step 2: Write the failing browser-head test**

Render `RouteSeo` for the inventory entry and assert:

```ts
expect(document.title).toBe('Облік автозапчастин для авторозбірки | rozbirka')
expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
  'href',
  'https://rozbirka.pro/oblik-avtozapchastyn',
)
expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
  'content',
  expect.stringContaining('складський облік автозапчастин'),
)
expect(document.querySelector('script[data-product-json-ld]')).not.toBeNull()
```

- [ ] **Step 3: Run both tests and confirm failures**

Run:

```bash
npm test -- src/seo/structured-data.test.ts src/seo/route-seo.test.tsx
```

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement pure structured-data builders**

Build:

- homepage `@graph`: `Organization`, `WebSite`, `SoftwareApplication`, and `FAQPage`;
- use-case `@graph`: `WebPage`, `BreadcrumbList`, and `FAQPage`.

Use stable entity IDs:

- `https://rozbirka.pro/#organization`
- `https://rozbirka.pro/#website`
- `https://rozbirka.pro/#software`
- `${entry.canonical}#webpage`
- `${entry.canonical}#breadcrumbs`
- `${entry.canonical}#faq`

Do not include ratings, reviews, availability, or claims absent from the visible page.

- [ ] **Step 5: Implement idempotent head synchronization**

`RouteSeo` runs an effect that updates or creates:

- `title`;
- `meta[name="description"]`;
- `link[rel="canonical"]`;
- `meta[property="og:title"]`;
- `meta[property="og:description"]`;
- `meta[property="og:url"]`;
- `meta[property="og:image"]`;
- `meta[name="twitter:card"]`;
- `meta[name="twitter:title"]`;
- `meta[name="twitter:description"]`;
- `meta[name="twitter:image"]`;
- one `script[type="application/ld+json"][data-product-json-ld]`.

Use helper functions that select by stable attributes and update existing nodes instead of appending duplicates.

- [ ] **Step 6: Mount `RouteSeo` on all three product pages**

Pass the existing homepage FAQ entries to homepage `RouteSeo`. Rename and
export the current array from `src/components/site/faq.tsx` as
`homepageFaqEntries`, and render the same export in `FAQ` so visible copy and
schema share one source. Pass `content.faq` from `UseCasePage`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- src/seo/structured-data.test.ts src/seo/route-seo.test.tsx src/components/site/faq.test.tsx src/components/seo/use-case-page.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 8: Commit metadata and schema**

```bash
git add src/seo/structured-data.ts src/seo/structured-data.test.ts src/seo/route-seo.tsx src/seo/route-seo.test.tsx src/App.tsx src/components/site/faq.tsx src/components/seo/use-case-page.tsx
git commit -m "feat(web): add route-aware metadata and schema"
```

### Task 5: Multi-Route SSR and Prerendered Documents

**Files:**

- Modify: `index.html`
- Modify: `src/entry-server.tsx`
- Create: `scripts/prerender-helpers.mjs`
- Create: `scripts/prerender-helpers.test.ts`
- Create: `scripts/check-prerender-output.mjs`
- Modify: `scripts/prerender.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: `productSeoEntries`, `buildStructuredData()`, `serializeStructuredData()`, and React routes.
- Produces:
  - `renderRoute(pathname: string): string`
  - `prerenderManifest`: serializable product SEO entries
  - `structuredDataForRoute(pathname: string): Record<string, unknown>`
  - build outputs at the three exact document paths.

- [ ] **Step 1: Write failing pure prerender-helper tests**

Create `scripts/prerender-helpers.test.ts` in the node environment. Test these
interfaces before they exist:

```ts
documentPathForRoute('/') === 'dist/index.html'
documentPathForRoute('/oblik-avtozapchastyn') ===
  'dist/oblik-avtozapchastyn/index.html'
```

Pass a small HTML fixture to `injectProductDocument()` and assert it replaces
the title, description, canonical, OG/Twitter values, JSON-LD, and root marker.
Pass malformed output to `assertProductDocument()` and assert descriptive
errors for zero H1s, two H1s, a missing canonical, and an empty root. Because
the tests use strings only, `npm test` remains valid on a clean checkout.

- [ ] **Step 2: Run the helper test and observe failure**

Run:

```bash
npm test -- scripts/prerender-helpers.test.ts
```

Expected: FAIL because `scripts/prerender-helpers.mjs` does not exist.

- [ ] **Step 3: Change the server entry to route-aware rendering**

Replace `renderLanding()` with:

```tsx
function ServerRoutes() {
  return useRoutes(createAppRoutes(false))
}

export function renderRoute(pathname: string): string {
  return renderToString(
    <AuthProvider>
      <MemoryRouter initialEntries={[pathname]}>
        <ServerRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

export const prerenderManifest = productSeoEntries
```

Import `useRoutes` from `react-router` and `createAppRoutes` from the existing
route module. Do not replace the browser data router.

Also export:

```ts
export function structuredDataForRoute(pathname: string) {
  const seo = getProductSeo(pathname)
  if (!seo) throw new Error(`Missing product SEO for ${pathname}`)
  const faq =
    pathname === '/'
      ? homepageFaqEntries
      : getUseCasePage(seo.path as Exclude<ProductSeoPath, '/'>).faq
  return buildStructuredData(seo, faq)
}
```

- [ ] **Step 4: Implement pure prerender helpers**

Create `scripts/prerender-helpers.mjs` with:

```js
import { join } from 'node:path'

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function replaceMeta(html, attribute, key, content) {
  const pattern = new RegExp(
    `<meta data-product-seo ${attribute}="${key}" content="[^"]*"\\s*/?>`,
  )
  return html.replace(
    pattern,
    `<meta data-product-seo ${attribute}="${key}" content="${escapeAttribute(content)}" />`,
  )
}

export function documentPathForRoute(pathname) {
  if (pathname === '/') return join('dist', 'index.html')
  const slug = pathname.replace(/^\/|\/$/g, '')
  return join('dist', slug, 'index.html')
}

export function injectProductDocument({
  template,
  renderedBody,
  seo,
  structuredDataJson,
}) {
  let html = template
    .replace(
      /<title data-product-seo>[\s\S]*?<\/title>/,
      `<title data-product-seo>${seo.title}</title>`,
    )
    .replace(
      /<link data-product-seo rel="canonical" href="[^"]*"\s*\/?>/,
      `<link data-product-seo rel="canonical" href="${escapeAttribute(seo.canonical)}" />`,
    )
    .replace(
      /<script data-product-seo data-product-json-ld type="application\/ld\+json">[\s\S]*?<\/script>/,
      `<script data-product-seo data-product-json-ld type="application/ld+json">${structuredDataJson}</script>`,
    )
    .replace('<div id="root"></div>', `<div id="root">${renderedBody}</div>`)

  html = replaceMeta(html, 'name', 'description', seo.description)
  html = replaceMeta(html, 'property', 'og:title', seo.title)
  html = replaceMeta(html, 'property', 'og:description', seo.description)
  html = replaceMeta(html, 'property', 'og:url', seo.canonical)
  html = replaceMeta(html, 'property', 'og:image', seo.ogImage)
  html = replaceMeta(html, 'name', 'twitter:card', 'summary_large_image')
  html = replaceMeta(html, 'name', 'twitter:title', seo.title)
  html = replaceMeta(html, 'name', 'twitter:description', seo.description)
  html = replaceMeta(html, 'name', 'twitter:image', seo.ogImage)
  return html
}

export function assertProductDocument({ html, seo, expectedH1 }) {
  const h1Count = html.match(/<h1(?:\s|>)/g)?.length ?? 0
  if (h1Count !== 1) {
    throw new Error(`${seo.path} must contain exactly one H1; found ${h1Count}`)
  }
  if (!html.includes(`rel="canonical" href="${seo.canonical}"`)) {
    throw new Error(`${seo.path} is missing canonical ${seo.canonical}`)
  }
  const visibleText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!visibleText.includes(expectedH1)) {
    throw new Error(`${seo.path} is missing expected H1 text`)
  }
  if (!/<div id="root">\s*\S[\s\S]*<\/div>/.test(html)) {
    throw new Error(`${seo.path} has an empty prerender root`)
  }
  const jsonLdCount =
    html.match(/<script[^>]*data-product-json-ld[^>]*>/g)?.length ?? 0
  if (jsonLdCount !== 1) {
    throw new Error(
      `${seo.path} must contain one product JSON-LD script; found ${jsonLdCount}`,
    )
  }
}
```

Use the implementation above, then verify these behaviors:

- `documentPathForRoute('/')` resolves to `dist/index.html`; other paths strip
  leading/trailing slashes and resolve to `dist/<slug>/index.html`.
- `injectProductDocument()` replaces nodes marked `data-product-seo`, injects
  one `script[data-product-json-ld]`, and replaces `<div id="root"></div>`.
- Escape attribute values for `&`, `"`, `<`, and `>`.
- `assertProductDocument()` counts H1 start tags, checks the escaped canonical,
  checks the expected visible H1 text, checks non-empty root markup, and checks
  one JSON-LD script.

Make the helper tests PASS before integrating the module into the build.

- [ ] **Step 5: Mark replaceable head nodes in `index.html`**

Add `data-product-seo` to the title, description, canonical, OG, Twitter, and JSON-LD nodes. Update the base homepage title and description to the Task 1 values. This gives the prerender script stable selectors and preserves valid development fallback metadata.

- [ ] **Step 6: Expand `scripts/prerender.mjs`**

Keep the current critical-CSS and hero-font inlining. Before writing a document:

1. render the route;
2. replace every `data-product-seo` head node with values from the manifest;
3. serialize the route's structured data;
4. inject the rendered body;
5. write `/` to `dist/index.html`;
6. call `mkdir(targetDirectory, { recursive: true })` and write nested routes to `dist/<slug>/index.html`.

Preserve `dist/app.html` as the original non-product SPA shell for privacy, login, account, and marketplace routes.

The script must throw when:

- a manifest route has no matching React render;
- the marker is missing;
- the stylesheet is missing;
- a generated document lacks exactly one H1;
- required metadata remains identical between different product routes.

- [ ] **Step 7: Add deterministic post-build verification**

Create `scripts/check-prerender-output.mjs`. Import `readFile` and the product
manifest exported by `dist-ssr/entry-server.js`. Read all paths returned by
`documentPathForRoute()`, call `assertProductDocument()`, and additionally
assert titles, descriptions, and canonicals are unique across the three files.

Add this package script:

```json
"check:prerender": "node scripts/check-prerender-output.mjs"
```

- [ ] **Step 8: Build and run the artifact contract**

Run:

```bash
npm run build:prod
npm run check:prerender
```

Expected: production build succeeds and all three HTML contracts PASS.

- [ ] **Step 9: Run hydration smoke tests**

Run:

```bash
npm test -- src/App.test.tsx src/routes/routes.test.tsx
```

Expected: PASS without hydration-specific render regressions.

- [ ] **Step 10: Commit multi-route prerendering**

```bash
git add index.html src/entry-server.tsx scripts/prerender.mjs scripts/prerender-helpers.mjs scripts/prerender-helpers.test.ts scripts/check-prerender-output.mjs package.json
git commit -m "feat(web): prerender product SEO routes"
```

### Task 6: Sitemap, Edge Routing, and Production Probes

**Files:**

- Modify: `public/sitemap.xml`
- Modify: `src/seo/seo-files.test.ts`
- Modify: `worker/router.ts`
- Modify: `worker/router.test.ts`
- Modify: `scripts/check-production-routes.mjs`
- Modify: `scripts/check-production-routes.test.ts`

**Interfaces:**

- Consumes: `productSeoEntries` and nested documents from Task 5.
- Produces: direct 200 responses and post-deploy probes for both use-case routes.

- [ ] **Step 1: Write failing sitemap and Worker tests**

Extend the sitemap test to import `productSeoEntries` and assert every `includeInSitemap` canonical appears in `public/sitemap.xml`.

Add Worker cases for:

```ts
[
  ['/oblik-avtozapchastyn', '/oblik-avtozapchastyn/index.html'],
  ['/oblik-avtozapchastyn/', '/oblik-avtozapchastyn/index.html'],
  [
    '/oblik-prodazhiv-avtozapchastyn',
    '/oblik-prodazhiv-avtozapchastyn/index.html',
  ],
]
```

Assert status 200, `content-type: text/html`, `Cache-Control: max-age=0, must-revalidate`, canonical metadata matching the non-trailing canonical, and no `X-Robots-Tag: noindex` on the production apex.

Add a case where the nested document fetch returns 404 and assert the branded 404 response is returned with status 404.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```bash
npm test -- src/seo/seo-files.test.ts worker/router.test.ts scripts/check-production-routes.test.ts
```

Expected: FAIL because the sitemap, edge map, and production probes do not include the new routes.

- [ ] **Step 3: Update crawler files**

Add:

```xml
<url><loc>https://rozbirka.pro/oblik-avtozapchastyn</loc></url>
<url><loc>https://rozbirka.pro/oblik-prodazhiv-avtozapchastyn</loc></url>
```

Preserve the existing homepage, privacy, and marketplace entries. Preserve the current robots policy.

During production prerendering, overwrite `dist/sitemap.xml` from the registry plus the preserved `/privacy` and `/marketplace` canonicals so the deployed artifact is deterministic.

- [ ] **Step 4: Serve nested product documents in the Worker**

Before generic SPA handling, normalize a trailing slash and resolve product SEO paths:

```ts
const productDocumentPath: Record<string, string> = {
  '/': '/index.html',
  '/oblik-avtozapchastyn': '/oblik-avtozapchastyn/index.html',
  '/oblik-prodazhiv-avtozapchastyn':
    '/oblik-prodazhiv-avtozapchastyn/index.html',
}
```

Fetch the mapped asset, return branded 404 when absent, and apply the existing HTML revalidation/noindex policy. Do not run `withCanonicalMetadata()` on already prerendered product documents.

- [ ] **Step 5: Expand production route checks**

Add both URLs to `buildRouteTargets()` and validate:

- status 200;
- `text/html`;
- body includes the expected canonical;
- body includes the expected route-specific H1.

Use keys `partsInventory` and `partsSales` under a new `seoRoutes` response group.

- [ ] **Step 6: Run focused tests and dry routing verification**

Run:

```bash
npm test -- src/seo/seo-files.test.ts worker/router.test.ts scripts/check-production-routes.test.ts
npm run build:prod
npm run check:prerender
```

Expected: all tests and build PASS.

- [ ] **Step 7: Commit crawler and edge support**

```bash
git add public/sitemap.xml src/seo/seo-files.test.ts worker/router.ts worker/router.test.ts scripts/check-production-routes.mjs scripts/check-production-routes.test.ts
git commit -m "feat(web): publish ROZ-13 SEO routes at the edge"
```

### Task 7: End-to-End Semantics and Release Verification

**Files:**

- Modify: `e2e/landing.spec.ts`
- Modify only if verification exposes a scoped defect: files already listed in Tasks 1–6.

**Interfaces:**

- Consumes: complete product SEO implementation.
- Produces: final local verification evidence; no deployment.

- [ ] **Step 1: Add failing semantic E2E checks**

Add a test that visits both routes and asserts:

```ts
await expect(page.locator('h1')).toHaveCount(1)
await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
  'href',
  expectedCanonical,
)
await expect(page.locator('script[data-product-json-ld]')).toHaveCount(1)
await expect(page.getByRole('link', { name: 'Спробувати rozbirka' })).toHaveAttribute(
  'href',
  '/login',
)
```

Also assert inventory and sales pages expose their expected H1 text. Do not add screenshot baselines for these content-first pages in this task.

- [ ] **Step 2: Run the E2E test and confirm it initially detects any missing contract**

Run:

```bash
npm run build:prod
npx playwright test e2e/landing.spec.ts --project=chromium
```

Expected before final fixes: either PASS if Tasks 1–6 fully satisfy the contract, or a focused failure naming the missing semantic/metadata behavior. A PASS is acceptable because this task adds a higher-level regression check over already test-driven behavior.

- [ ] **Step 3: Fix only scoped E2E findings**

If the E2E check fails, change only the product page semantics, head synchronization, prerender output, or edge route behavior responsible for the failure. Do not refresh existing homepage screenshots unless the approved homepage copy causes the expected text-only difference without layout movement; if snapshots change, inspect each diff before accepting it.

- [ ] **Step 4: Run the complete verification gate**

Run in this order:

```bash
npm run check
npm run build:prod
npm run check:prerender
npm run budget:assets
npm run test:e2e
npx wrangler deploy --dry-run --env production
git diff --check
git status --short
```

Expected:

- typecheck, lint, formatting, and all Vitest tests PASS;
- production build emits all three product documents;
- asset budget PASS;
- Playwright PASS;
- Wrangler dry-run PASS;
- no whitespace errors;
- only intentional task files remain modified.

If LHCI can run reliably in the local environment, also run:

```bash
npm run audit:lhci
```

Record the SEO, accessibility, LCP, CLS, and transfer results in the handoff. If LHCI cannot run because its external browser/server dependency is unavailable, report the exact error and keep the deterministic build/test gates.

- [ ] **Step 5: Commit E2E coverage and any scoped final fixes**

```bash
git add e2e/landing.spec.ts
git add src index.html public scripts worker
git commit -m "test(web): verify ROZ-13 SEO user journeys"
```

- [ ] **Step 6: Review the final branch delta**

Run:

```bash
git log --oneline develop..HEAD
git diff --stat develop...HEAD
git status --short --branch
```

Confirm the branch contains the design commit and the focused implementation commits, with a clean working tree. Do not push, deploy, merge, or update Linear without explicit user authorization.
