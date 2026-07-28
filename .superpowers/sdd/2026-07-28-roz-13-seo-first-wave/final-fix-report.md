# ROZ-13 final whole-branch review fix report

## Scope

- Branch:
  `vsobol/roz-13-provesti-seo-optimizaciyu-rozbirkapro-pid-cilovi-poshukovi`
- Base reviewed and modified: `4d332b09c93cd9a4f8bf844ac5bc4366c3693d65`
- Approved references:
  - `docs/superpowers/specs/2026-07-28-roz-13-seo-first-wave-design.md`
  - `docs/superpowers/plans/2026-07-28-roz-13-seo-first-wave.md`
- No push, deployment, merge, or Linear mutation was performed.

## Finding mapping

### IMPORTANT 1 — SPA canonical and `og:url` rewriting

Root cause confirmed:

- `dist/app.html` contains
  `<link data-product-seo rel="canonical" ...>` and
  `<meta data-product-seo property="og:url" ...>`.
- `worker/router.ts` matched only tags beginning with
  `<link rel="canonical"...>` and `<meta property="og:url"...>`.
- The Worker test fixture still used the obsolete untagged shape, so it could
  not catch the production mismatch.
- SPA production probes used an exact string prefix instead of the structural
  canonical matcher already used for product routes.

Files:

- `worker/router.ts`
  - identifies canonical `<link>` and `og:url` `<meta>` tags structurally;
  - replaces the target attribute regardless of attribute order, quote style,
    or extra attributes;
  - preserves the existing response status, status text, MIME/cache headers,
    and transformed-response behavior of removing stale `Content-Length` and
    `ETag`.
- `worker/router.test.ts`
  - updates `/app.html` to the current tagged build shape;
  - verifies both `/privacy` and `/marketplace` receive their own canonical and
    OG URL;
  - retains explicit `ETag` and `Content-Length` removal assertions.
- `scripts/check-production-routes.mjs`
  - reuses structural canonical validation for SPA routes.
- `scripts/check-production-routes.test.ts`
  - uses reordered attributes, extra attributes, and multi-token `rel` values
    for the valid SPA response contract.

TDD evidence:

- RED:
  `npm test -- worker/router.test.ts scripts/check-production-routes.test.ts`
  exited 1 with 3 expected failures:
  - privacy canonical/OG remained `https://rozbirka.pro/`;
  - marketplace canonical/OG remained `https://rozbirka.pro/`;
  - structurally valid reordered SPA canonical was rejected.
- GREEN: the same command exited 0 with 38/38 tests passing.

### IMPORTANT 2 — final registration CTA

Files:

- `src/components/seo/use-case-page.tsx`
  - adds one shared `FinalRegistrationCta`;
  - renders it after the related-process section and before `SiteFooter`;
  - keeps it semantically separate from the sibling use-case link;
  - links `Зареєструватися в rozbirka` to `/login`.
- `src/components/seo/use-case-page.test.tsx`
  - verifies the CTA on both use-case screens;
  - verifies its `/login` destination;
  - verifies document order after the related section.
- `e2e/landing.spec.ts`
  - verifies the final CTA and destination on both product use-case routes.

TDD evidence:

- Component RED:
  `npm test -- src/components/seo/use-case-page.test.tsx` exited 1 with 2
  expected missing-region failures.
- E2E RED:
  `npx playwright test e2e/landing.spec.ts --grep "SEO use-case pages expose" --project=chromium`
  exited 1 because the final CTA link did not exist.
- Component GREEN:
  `npm test -- src/components/seo/use-case-page.test.tsx src/components/site/header.test.tsx src/components/site/nav-links.test.tsx`
  exited 0 with 6/6 passing.
- Build-backed E2E GREEN: the same focused Playwright command exited 0 with
  1/1 passing.

### MINOR 1 — preserve unrelated JSON-LD

Files:

- `src/seo/route-seo.tsx`
  - upserts only
    `script[type="application/ld+json"][data-product-json-ld]`;
  - no longer adopts an unmarked JSON-LD script;
  - no longer removes other JSON-LD producers.
- `src/seo/route-seo.test.tsx`
  - verifies an unmarked unrelated script remains unchanged;
  - verifies it is not tagged as route-owned;
  - verifies exactly one tagged route graph exists alongside it.

TDD evidence:

- RED: `npm test -- src/seo/route-seo.test.tsx` exited 1 because only one
  script remained instead of the expected unrelated plus tagged scripts.
- GREEN: the same command exited 0 with 3/3 passing.

### MINOR 2 — nested shared chrome active state

Files:

- `src/components/site/header.tsx`
- `src/components/site/site-footer.tsx`
  - derive the homepage active state from `useLocation().pathname`;
  - omit `activeHref` outside `/`.
- `src/components/seo/use-case-page.test.tsx`
  - renders the actual `SiteHeader` and `SiteFooter` under
    `/oblik-avtozapchastyn`;
  - verifies neither shared “Головна” link has `aria-current`.

TDD evidence:

- RED: `npm test -- src/components/seo/use-case-page.test.tsx` exited 1 with
  `aria-current="page"` still present on the nested route.
- GREEN:
  `npm test -- src/components/seo/use-case-page.test.tsx src/components/site/header.test.tsx`
  exited 0 with 5/5 passing after the final TypeScript-compatible prop
  omission.

## Focused and release verification

### Focused suites

- `npm test -- worker/router.test.ts scripts/check-production-routes.test.ts src/components/seo/use-case-page.test.tsx src/seo/route-seo.test.tsx src/components/site/header.test.tsx src/components/site/nav-links.test.tsx`
  - PASS: 6 files, 47 tests.
- `npx prettier --write` on all 11 touched source/test files
  - PASS: all already matched formatting.

### Full static/unit gate

- First `npm run check`
  - expected development failure at typecheck:
    `exactOptionalPropertyTypes` rejected explicitly passing
    `activeHref={undefined}`.
  - correction: nested paths now omit the prop entirely.
- `npm run typecheck && npm test -- src/components/seo/use-case-page.test.tsx src/components/site/header.test.tsx`
  - PASS: typecheck and 5/5 focused tests.
- Second `npm run check`
  - development failure at lint:
    `@typescript-eslint/prefer-regexp-exec` in the new Worker attribute parser.
  - correction: switched from `String.match` to `RegExp.exec`.
- Fresh final `npm run check`
  - PASS:
    - TypeScript build/no-emit;
    - ESLint;
    - Prettier check;
    - Vitest: 32 files, 133 tests.

### Production artifacts and routing

- `npm run build:prod`
  - PASS: client build, SSR build, and three-route prerender.
  - Key output:
    - `dist/app.html`: 4.24 kB;
    - main CSS: 58.56 kB;
    - main application JS: 63.25 kB;
    - React chunk: 182.73 kB;
    - router chunk: 95.00 kB.
- `npm run check:prerender`
  - PASS: validated 3 prerendered product documents.
- `npm run budget:assets`
  - PASS: `critical-total 1086157` bytes.
- Focused Chromium use-case E2E
  - PASS: 1/1.
- `npm run test:e2e`
  - PASS: 30 passed, 20 intentionally skipped by the cross-browser snapshot
    matrix, 0 failed.
- `npx wrangler deploy --dry-run --env production`
  - PASS: read 89 asset files, Worker upload 5.60 KiB / gzip 1.77 KiB.
  - Dry-run only; nothing was deployed.

### Lighthouse CI

Command: `npm run audit:lhci`

- PASS: 3/3 configured runs; all assertions processed.
- Thresholds were not modified:
  - accessibility score: 1.00 minimum;
  - SEO score: 0.95 minimum;
  - LCP: 2500 ms maximum;
  - TBT: 200 ms maximum;
  - CLS: 0.1 maximum;
  - total byte weight: 3 MiB maximum.

| Run | Performance | Accessibility | SEO | FCP | LCP | TBT | CLS | Speed Index | Byte weight |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 96 | 100 | 100 | 2104.5 ms | 2404.5 ms | 4 ms | 0.000274 | 2104.5 ms | 343,307 B |
| 2 | 96 | 100 | 100 | 2103.7 ms | 2478.7 ms | 0 ms | 0.000274 | 2103.7 ms | 343,312 B |
| 3 | 96 | 100 | 100 | 2103.1 ms | 2478.1 ms | 0 ms | 0.000274 | 2103.1 ms | 343,305 B |

## Snapshot inspection

- The full Playwright matrix produced no changed or new snapshot files.
- No snapshots were accepted or updated.
- No Lighthouse, Playwright, asset-budget, or SEO threshold was weakened.

## Self-review

- Re-read the approved design’s internal-link, final-CTA, structured-data,
  metadata, edge-routing, accessibility, and release-gate requirements.
- Confirmed the Worker fix changes only canonical/OG tag attribute values and
  leaves the prior header/cache semantics intact.
- Confirmed the production probe still rejects wrong, non-exact canonicals,
  including expected URLs appearing only in unrelated anchors.
- Confirmed the final CTA is a distinct region after the related region and
  before the footer on both use-case pages.
- Confirmed `RouteSeo` owns exactly one tagged route graph without mutating
  unmarked scripts.
- Confirmed nested active-state coverage exercises the real shared header and
  footer rather than a mocked navigation component.
- `git diff --check` passed.
- No unrelated source changes or snapshot changes are present.

## Concerns and deferred external checks

- Lighthouse passed, but runs 2 and 3 placed LCP at 2478.7 ms and 2478.1 ms,
  leaving a narrow margin under the unchanged 2500 ms gate. This wave did not
  add above-the-fold homepage work, but the margin should remain visible in
  future performance reviews.
- Production/QA route probes against deployed hosts were not run because this
  task explicitly prohibited deployment. The equivalent local Worker
  integration contract, build-backed full E2E suite, production build, and
  Wrangler production dry-run all passed.
