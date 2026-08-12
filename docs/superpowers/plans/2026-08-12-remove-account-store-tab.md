# Remove Marketplace from Rozbirka Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete marketplace runtime code, public routes, seller tools, SEO exposure, production probes, and the original feature documents from `rozbirka.web`.

**Architecture:** Remove the feature at every registered boundary instead of hiding it: React Router no longer registers marketplace screens, the Worker returns the existing branded noindex 404 for old URLs, and build/SEO tooling no longer publishes or probes those URLs. Keep the shared `publicApiClient` because public billing-plan reads still consume it.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Cloudflare Workers, Vite prerender scripts

## Global Constraints

- Work only in `rozbirka.web` on `vsobol/remove-account-store-tab`.
- Do not change `rozbirka.core` or the ROZ-35 worktree.
- Former marketplace paths must return the branded `404` response with `X-Robots-Tag: noindex`; do not redirect them.
- Preserve `publicApiClient` because `src/api/billing.ts` uses it.
- Preserve unrelated historical documents that only mention marketplace as context.

---

### Task 1: Remove React Runtime and Feature Files

**Files:**
- Modify: `src/routes/routes.test.tsx`
- Modify: `src/routes/routes.tsx`
- Delete: `src/api/marketplace.ts`
- Delete: `src/api/marketplace.test.ts`
- Delete: `src/apps/marketplace/marketplace-app.tsx`
- Delete: `src/apps/marketplace/marketplace-app.test.tsx`
- Delete: `src/apps/marketplace/marketplace-layout.tsx`
- Delete: `src/features/marketplace/listing-card.tsx`
- Delete: `src/features/marketplace/listing-detail-screen.tsx`
- Delete: `src/features/marketplace/listing-detail-screen.test.tsx`
- Delete: `src/features/marketplace/marketplace-api-types.ts`
- Delete: `src/features/marketplace/marketplace-screen.tsx`
- Delete: `src/features/marketplace/marketplace-screen.test.tsx`
- Delete: `src/features/marketplace/mock-data.ts`
- Delete: `src/features/marketplace/shop-profile-screen.tsx`
- Delete: `src/features/seller-marketplace/seller-marketplace-panel.tsx`
- Delete: `src/features/seller-marketplace/seller-marketplace-panel.test.tsx`

**Interfaces:**
- Consumes: `createAppRoutes(includePrototypeRoutes: boolean): RouteObject[]`.
- Produces: route arrays without `/marketplace`, `/marketplace/listings/:slugOrId`, or `/marketplace/shops/:slug`.

- [ ] **Step 1: Add the failing route regression test**

Add to `src/routes/routes.test.tsx`:

```tsx
it('omits retired marketplace routes in production and development', () => {
  for (const includePrototypeRoutes of [false, true]) {
    const paths = createAppRoutes(includePrototypeRoutes).map(
      (route) => route.path,
    )
    expect(paths).not.toContain('/marketplace')
    expect(paths).not.toContain('/marketplace/listings/:slugOrId')
    expect(paths).not.toContain('/marketplace/shops/:slug')
  }
})
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/routes/routes.test.tsx`.

Expected: FAIL because all three marketplace paths are still registered.

- [ ] **Step 3: Remove the route objects and delete feature files**

Delete the three marketplace route objects from `src/routes/routes.tsx`, then delete every feature/API file listed above. Do not remove `publicApiClient`.

- [ ] **Step 4: Verify GREEN and type safety**

Run `npm test -- src/routes/routes.test.tsx && npm run typecheck`.

Expected: route tests PASS and TypeScript reports no references to deleted modules.

---

### Task 2: Retire Marketplace URLs at the Edge

**Files:**
- Modify: `worker/router.test.ts`
- Modify: `worker/router.ts`

**Interfaces:**
- Consumes: `handleRequest(request: Request, env: EdgeEnv): Promise<Response>`.
- Produces: status `404`, branded 404 HTML, and `X-Robots-Tag: noindex` for former marketplace URLs.

- [ ] **Step 1: Change Worker expectations to the retired-route contract**

Move these paths out of the SPA-shell test and into the branded noindex 404 table:

```ts
'/marketplace',
'/marketplace/',
'/marketplace/listings/fara-1',
'/marketplace/shops/demo',
```

Remove marketplace cases from canonical and route-identity metadata tests. Keep `/privacy` coverage.

- [ ] **Step 2: Verify RED**

Run `npm test -- worker/router.test.ts`.

Expected: marketplace 404 cases FAIL with status `200` because `spaPaths` still serves the app shell.

- [ ] **Step 3: Remove marketplace edge registration**

From `worker/router.ts`, delete:

```ts
/^\/marketplace\/?$/,
/^\/marketplace\/listings\/[^/]+\/?$/,
/^\/marketplace\/shops\/[^/]+\/?$/,
```

Also delete `appShellMetadata.marketplace` and the `/marketplace` metadata-selection branch. Preserve the privacy metadata path.

- [ ] **Step 4: Verify GREEN**

Run `npm test -- worker/router.test.ts`.

Expected: all Worker route tests PASS.

---

### Task 3: Remove Marketplace from SEO, Build Checks, and Documentation

**Files:**
- Modify: `public/sitemap.xml`
- Modify: `src/seo/seo-files.test.ts`
- Modify: `scripts/prerender.mjs`
- Modify: `scripts/check-prerender-output.mjs`
- Modify: `scripts/check-production-routes.mjs`
- Modify: `scripts/check-production-routes.test.ts`
- Delete: `docs/superpowers/specs/2026-06-14-marketplace-design.md`
- Delete: `docs/superpowers/plans/2026-06-14-marketplace-rebuild.md`

**Interfaces:**
- Consumes: committed sitemap, generated sitemap entries, and production-route response validation.
- Produces: no marketplace sitemap entry or production SPA probe; old URLs are covered only as retired Worker routes.

- [ ] **Step 1: Add the failing SEO assertion**

Replace the marketplace sitemap inclusion assertion in `src/seo/seo-files.test.ts` with:

```ts
expect(sitemap).not.toContain('/marketplace')
```

- [ ] **Step 2: Verify RED**

Run `npm test -- src/seo/seo-files.test.ts`.

Expected: FAIL because `public/sitemap.xml` still includes `/marketplace`.

- [ ] **Step 3: Remove marketplace build and SEO registration**

- Delete the marketplace `<url>` from `public/sitemap.xml`.
- Remove the marketplace entry from `scripts/prerender.mjs` sitemap generation.
- Remove marketplace from `scripts/check-prerender-output.mjs` required canonicals.
- Replace the production `listing` SPA probe with a `retiredMarketplace` 404/noindex probe in `scripts/check-production-routes.mjs` and update its tests/fixtures.
- Delete the two original marketplace documents listed above.

- [ ] **Step 4: Verify focused tooling**

Run:

```bash
npm test -- src/seo/seo-files.test.ts scripts/check-production-routes.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 5: Verify no production marketplace surface remains**

Run:

```bash
rg -n -i 'marketplace|seller-marketplace|MarketplaceShop|MarketplaceListing|marketplaceApi' src scripts worker public \
  --glob '!**/*.test.*'
```

Expected: no runtime, route, metadata, sitemap, or production-probe matches. Removal-focused test names may remain outside this command's runtime scope.

- [ ] **Step 6: Run the full verification gate**

Run:

```bash
npm run check
npm run build:prod
npm run check:prerender
```

Expected: typecheck, lint, formatting, all unit tests, production build, and prerender validation PASS.

- [ ] **Step 7: Commit the hard removal**

```bash
git add -A
git commit -m "refactor(web): remove marketplace feature"
```

