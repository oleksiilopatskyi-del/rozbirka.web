# Remove SEO Use-case Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the homepage use-case section and retire `/oblik-avtozapchastyn` and `/oblik-prodazhiv-avtozapchastyn` as real noindex 404 routes.

**Architecture:** Delete the UI and content that exist only for the two pages, reduce the product SEO/prerender surface to the homepage, and remove the Cloudflare document mappings. Extend unit, edge, production-probe, E2E, and visual-regression coverage so the retired paths cannot silently return as SPA or prerender routes.

**Tech Stack:** React 19, React Router, TypeScript, Vitest, Cloudflare Workers, Vite SSR/prerender, Playwright

## Global Constraints

- Remove the entire homepage section headed `Усе для щоденної роботи авторозбірки`.
- Retire both `/oblik-avtozapchastyn` and `/oblik-prodazhiv-avtozapchastyn`, including trailing-slash variants.
- Retired URLs must return the existing branded HTTP 404 page with `X-Robots-Tag: noindex`.
- Do not redirect retired URLs to the homepage.
- Remove retired URLs from React routes, prerender output, product SEO metadata, sitemap, Cloudflare mappings, and production probes.
- Do not change the hero, features, pricing, FAQ, CTA, footer, favicon, typography, privacy, authentication, marketplace, prototype, or asset routes.

---

### Task 1: Remove the homepage use-case section

**Files:**
- Modify: `src/entry-server.test.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/site/use-case-links.tsx`
- Delete: `src/components/site/use-case-links.test.tsx`

**Interfaces:**
- Consumes: `renderRoute('/')` from `src/entry-server.tsx`
- Produces: homepage HTML without the `UseCaseLinks` section or either retired link

- [ ] **Step 1: Add a failing homepage regression assertion**

Add this test to `src/entry-server.test.tsx`:

```tsx
it('omits the retired use-case section and links from the homepage', () => {
  const html = renderRoute('/')

  expect(html).not.toContain('Усе для щоденної роботи авторозбірки')
  expect(html).not.toContain('/oblik-avtozapchastyn')
  expect(html).not.toContain('/oblik-prodazhiv-avtozapchastyn')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/entry-server.test.tsx
```

Expected: FAIL because the current homepage render still contains the section
heading and both links.

- [ ] **Step 3: Remove the section**

In `src/App.tsx`, remove:

```tsx
import { UseCaseLinks } from '@/components/site/use-case-links'
```

and:

```tsx
<UseCaseLinks />
```

Delete:

```text
src/components/site/use-case-links.tsx
src/components/site/use-case-links.test.tsx
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx vitest run src/entry-server.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit the homepage removal**

```bash
git add src/App.tsx src/entry-server.test.tsx \
  src/components/site/use-case-links.tsx \
  src/components/site/use-case-links.test.tsx
git commit -m "fix(web): remove homepage use-case links"
```

---

### Task 2: Remove React, SEO, structured-data, and prerender ownership

**Files:**
- Modify: `src/routes/routes.test.tsx`
- Modify: `src/routes/routes.tsx`
- Modify: `src/seo/product-seo.test.ts`
- Modify: `src/seo/product-seo.ts`
- Modify: `src/seo/route-seo.test.tsx`
- Modify: `src/seo/structured-data.test.ts`
- Modify: `src/seo/structured-data.ts`
- Modify: `src/entry-server.test.tsx`
- Modify: `src/entry-server.tsx`
- Modify: `src/components/site/nav-links.test.tsx`
- Modify: `scripts/prerender-helpers.test.ts`
- Delete: `src/screens/parts-inventory.tsx`
- Delete: `src/screens/parts-sales.tsx`
- Delete: `src/components/seo/breadcrumbs.tsx`
- Delete: `src/components/seo/use-case-page.tsx`
- Delete: `src/components/seo/use-case-page.test.tsx`
- Delete: `src/content/use-case-pages.ts`

**Interfaces:**
- Consumes: `createAppRoutes`, `productSeoEntries`, `renderRoute`, and `buildStructuredData`
- Produces: a homepage-only product SEO/prerender manifest and no React ownership of either retired path

- [ ] **Step 1: Rewrite route and SEO tests to describe the retired surface**

Replace the two ROZ-13 route tests in `src/routes/routes.test.tsx` with:

```tsx
it('omits retired ROZ-13 product routes in production and development', () => {
  for (const includePrototypeRoutes of [false, true]) {
    const paths = createAppRoutes(includePrototypeRoutes).map(
      (route) => route.path,
    )
    expect(paths).not.toContain('/oblik-avtozapchastyn')
    expect(paths).not.toContain('/oblik-prodazhiv-avtozapchastyn')
  }
})
```

Change the first registry test in `src/seo/product-seo.test.ts` to:

```tsx
it('owns only the homepage product route', () => {
  expect(productSeoPaths).toEqual(['/'])
  expect(productSeoEntries).toHaveLength(1)
  expect(getProductSeo('/')).toBe(productSeoEntries[0])
  expect(getProductSeo('/oblik-avtozapchastyn')).toBeUndefined()
  expect(getProductSeo('/oblik-prodazhiv-avtozapchastyn')).toBeUndefined()
})
```

Change the manifest assertion in `src/entry-server.test.tsx` to:

```tsx
expect(prerenderManifest.map((entry) => entry.path)).toEqual(['/'])
```

Remove use-case rows and assertions from `src/entry-server.test.tsx`, leaving
homepage render, homepage H1, homepage structured data, and missing-record
coverage.

- [ ] **Step 2: Run route/SEO tests and verify RED**

Run:

```bash
npx vitest run \
  src/routes/routes.test.tsx \
  src/seo/product-seo.test.ts \
  src/entry-server.test.tsx
```

Expected: FAIL because both paths still exist in the route table, SEO registry,
and prerender manifest.

- [ ] **Step 3: Remove the React routes and page-only modules**

Remove both screen imports and route objects from `src/routes/routes.tsx`.

Delete:

```text
src/screens/parts-inventory.tsx
src/screens/parts-sales.tsx
src/components/seo/breadcrumbs.tsx
src/components/seo/use-case-page.tsx
src/components/seo/use-case-page.test.tsx
src/content/use-case-pages.ts
```

- [ ] **Step 4: Reduce product SEO to the homepage**

In `src/seo/product-seo.ts`:

- change `ProductSeoPath` to `export type ProductSeoPath = '/'`;
- remove `SeoBreadcrumb`;
- remove `breadcrumbs` from `ProductSeoEntry`;
- change `intent` to the literal type `'commercial-category'`;
- remove both retired entries;
- keep the homepage entry and its metadata unchanged.

- [ ] **Step 5: Simplify SSR and structured data**

In `src/entry-server.tsx`:

- remove `getUseCasePage` and `ProductSeoPath` imports;
- make `expectedH1ForRoute` return the homepage H1 after validating the SEO
  record;
- always pass `homepageFaqEntries` to `buildStructuredData`.

The resulting functions should be:

```tsx
export function expectedH1ForRoute(pathname: string): string {
  const seo = getProductSeo(pathname)
  if (!seo) throw new Error(`Missing product SEO for ${pathname}`)
  return 'Знаєш де кожна деталь і де твої гроші'
}

export function structuredDataForRoute(pathname: string) {
  const seo = getProductSeo(pathname)
  if (!seo) throw new Error(`Missing product SEO for ${pathname}`)
  return buildStructuredData(seo, homepageFaqEntries)
}
```

In `src/seo/structured-data.ts`, keep only the homepage graph branch and return
its `Organization`, `WebSite`, `SoftwareApplication`, and `FAQPage` entities.

- [ ] **Step 6: Keep remaining tests meaningful without retired fixtures**

In `src/seo/structured-data.test.ts`, delete the inventory graph test and
`getUseCasePage` import.

In `src/seo/route-seo.test.tsx`, replace every inventory entry/FAQ fixture with:

```tsx
const entry = getProductSeo('/')!
const faq = homepageFaqEntries
```

Update expected title, canonical, description, and JSON-LD URL to the existing
homepage values.

In `src/components/site/nav-links.test.tsx`, use `/privacy` as the non-home
initial entry and rename the test to `uses homepage destinations from a
non-home route`.

In `scripts/prerender-helpers.test.ts`, replace the retired inventory slug in
the generic helper fixture with `/example-product`; update its canonical,
breadcrumb labels, expected document path, and metadata assertions to the same
generic slug.

- [ ] **Step 7: Run the focused ownership tests**

Run:

```bash
npx vitest run \
  src/routes/routes.test.tsx \
  src/seo/product-seo.test.ts \
  src/seo/route-seo.test.tsx \
  src/seo/structured-data.test.ts \
  src/entry-server.test.tsx \
  src/components/site/nav-links.test.tsx \
  scripts/prerender-helpers.test.ts
```

Expected: PASS.

- [ ] **Step 8: Prove source ownership is gone**

Run:

```bash
rg -n "getUseCasePage|UseCasePage|PartsInventoryScreen|PartsSalesScreen|SeoBreadcrumb" src scripts
```

Expected: no matches.

- [ ] **Step 9: Commit application and SEO removal**

```bash
git add src scripts/prerender-helpers.test.ts
git commit -m "fix(web): retire SEO use-case routes"
```

---

### Task 3: Return branded noindex 404s and remove discovery/probes

**Files:**
- Modify: `worker/router.test.ts`
- Modify: `worker/router.ts`
- Modify: `scripts/check-production-routes.test.ts`
- Modify: `scripts/check-production-routes.mjs`
- Modify: `src/seo/seo-files.test.ts`
- Modify: `public/sitemap.xml`
- Modify: `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `handleRequest`, `buildRouteTargets`, and `validateProductionResponses`
- Produces: edge and live-deployment contracts that require both retired URL families to return branded noindex HTTP 404 responses

- [ ] **Step 1: Add failing Worker coverage for the retired URLs**

Replace the prerendered-product tests in `worker/router.test.ts` with:

```tsx
it.each([
  '/oblik-avtozapchastyn',
  '/oblik-avtozapchastyn/',
  '/oblik-prodazhiv-avtozapchastyn',
  '/oblik-prodazhiv-avtozapchastyn/',
])('returns the branded noindex 404 for retired route %s', async (path) => {
  const response = await handleRequest(
    new Request(`https://rozbirka.pro${path}`),
    env(),
  )

  expect(response.status).toBe(404)
  expect(response.headers.get('x-robots-tag')).toBe('noindex')
  expect(await response.text()).toContain('branded 404')
})
```

Remove the product-document branches and `missingProductDocument` option from
the test `env()` fixture.

- [ ] **Step 2: Add failing browser-level 404 coverage**

Replace the SEO use-case conversion test at the top of `e2e/landing.spec.ts`
with:

```tsx
test('retired SEO use-case URLs return the branded 404 page', async ({
  page,
}) => {
  for (const path of [
    '/oblik-avtozapchastyn',
    '/oblik-avtozapchastyn/',
    '/oblik-prodazhiv-avtozapchastyn',
    '/oblik-prodazhiv-avtozapchastyn/',
  ]) {
    const response = await page.goto(path)

    expect(response?.status(), path).toBe(404)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Сторінку не знайдено' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'На головну' })).toHaveAttribute(
      'href',
      '/',
    )
  }
})
```

- [ ] **Step 3: Run the edge and E2E tests and verify RED**

Run:

```bash
npx vitest run worker/router.test.ts
npx playwright test e2e/landing.spec.ts \
  --project=chromium \
  --grep="retired SEO use-case URLs"
```

Expected: both fail because the Worker still serves prerendered 200 responses.

- [ ] **Step 4: Remove Worker document mappings**

Change `productDocumentPath` in `worker/router.ts` to:

```tsx
const productDocumentPath: Record<string, string> = {
  '/': '/index.html',
}
```

Keep the existing `notFound()` implementation unchanged.

- [ ] **Step 5: Change production probes from SEO success to retirement**

In `scripts/check-production-routes.mjs`:

- add `xRobotsTag: response.headers.get('x-robots-tag') ?? ''` to `inspect()`;
- remove `inspectSeoRoute`;
- rename target keys to `retiredInventory` and `retiredSales`;
- return `retiredRoutes` instead of `seoRoutes`;
- validate each retired response with:

```js
for (const [name, response] of Object.entries(result.retiredRoutes)) {
  assert(response.status === 404, `${name} must return 404`)
  assert(
    response.contentType.includes('text/html'),
    `${name} must return HTML`,
  )
  assert(
    response.xRobotsTag === 'noindex',
    `${name} must return X-Robots-Tag: noindex`,
  )
}
```

Update `scripts/check-production-routes.test.ts` so `validResponses()` contains:

```tsx
retiredRoutes: {
  inventory: {
    status: 404,
    contentType: 'text/html',
    xRobotsTag: 'noindex',
  },
  sales: {
    status: 404,
    contentType: 'text/html',
    xRobotsTag: 'noindex',
  },
},
```

Assert the renamed targets and replace product H1/canonical mutation cases
with `retired route returns 200` and `retired route is indexable` mutations.

- [ ] **Step 6: Remove retired URLs from sitemap**

Delete both retired `<url>` entries from `public/sitemap.xml`.

Add to the sitemap test in `src/seo/seo-files.test.ts`:

```tsx
expect(sitemap).not.toContain('/oblik-avtozapchastyn')
expect(sitemap).not.toContain('/oblik-prodazhiv-avtozapchastyn')
```

- [ ] **Step 7: Run focused edge/discovery tests and verify GREEN**

Run:

```bash
npx vitest run \
  worker/router.test.ts \
  scripts/check-production-routes.test.ts \
  src/seo/seo-files.test.ts
npm run build:qa
npm run check:prerender
npx playwright test e2e/landing.spec.ts \
  --project=chromium \
  --grep="retired SEO use-case URLs"
```

Expected: all commands pass; prerender validation reports exactly one product
document.

- [ ] **Step 8: Commit edge and discovery removal**

```bash
git add worker scripts/check-production-routes.mjs \
  scripts/check-production-routes.test.ts src/seo/seo-files.test.ts \
  public/sitemap.xml e2e/landing.spec.ts
git commit -m "fix(web): return 404 for retired SEO pages"
```

---

### Task 4: Update responsive coverage and visual baselines

**Files:**
- Modify: `e2e/landing.spec.ts`
- Modify: `e2e/landing.spec.ts-snapshots/landing-320-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-375-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-768-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-1024-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-1440-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-320-linux-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-375-linux-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-768-linux-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-1024-linux-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-1440-linux-chromium.png`

**Interfaces:**
- Consumes: the homepage and retired-route behavior from Tasks 1–3
- Produces: responsive and screenshot coverage for the shorter homepage

- [ ] **Step 1: Remove retired routes from shared-footer loops**

Rename `uses identical footer typography on landing and SEO routes` to
`uses the Visuelt Pro footer typography on the landing page` and test only
`/`.

In `shows the complete shared footer wordmark`, remove the nested route loop
and test the homepage footer directly.

- [ ] **Step 2: Add a visible homepage absence assertion**

In `landing interactions work without serious accessibility violations`, add:

```tsx
await expect(
  page.getByRole('heading', {
    name: 'Усе для щоденної роботи авторозбірки',
  }),
).toHaveCount(0)
```

- [ ] **Step 3: Run Chromium screenshots and verify expected failure**

Run:

```bash
npx playwright test e2e/landing.spec.ts --project=chromium
```

Expected: semantic tests pass and the five homepage screenshots fail because
the removed section shortens the page.

- [ ] **Step 4: Regenerate macOS baselines**

Run:

```bash
npx playwright test e2e/landing.spec.ts \
  --project=chromium \
  --update-snapshots
```

- [ ] **Step 5: Regenerate Linux baselines in Playwright 1.61.1**

Run:

```bash
docker run --rm \
  -v "$PWD:/work" \
  -w /work \
  mcr.microsoft.com/playwright:v1.61.1-noble \
  bash -lc "npm ci && npx playwright test e2e/landing.spec.ts --project=chromium --update-snapshots"
```

- [ ] **Step 6: Review every changed visual**

Open all ten changed PNG files and verify:

- the retired section and cards are absent;
- `Features` flows directly into `Pricing`;
- the hero, pricing, FAQ, CTA, footer, and rounded favicon remain unchanged;
- there is no clipping or horizontal overflow at 320, 375, 768, 1024, or
  1440 px.

- [ ] **Step 7: Run full verification**

Run:

```bash
npm run check
npm run build:qa
npm run check:prerender
npm run budget:assets
npm run test:e2e
npx wrangler deploy --dry-run --env production
rg -n "oblik-avtozapchastyn|oblik-prodazhiv-avtozapchastyn|Усе для щоденної роботи авторозбірки" \
  src public scripts worker e2e
```

Expected:

- typecheck, lint, formatting, and all unit tests pass;
- QA client/SSR build and homepage-only prerender pass;
- asset budget passes;
- full Playwright suite passes;
- Worker production dry-run passes;
- the final `rg` command returns no matches except the intentional retired-route
  regression arrays in Worker, E2E, and production-probe tests.

- [ ] **Step 8: Commit responsive coverage**

```bash
git add e2e/landing.spec.ts e2e/landing.spec.ts-snapshots
git commit -m "test(web): refresh landing after SEO page removal"
```
