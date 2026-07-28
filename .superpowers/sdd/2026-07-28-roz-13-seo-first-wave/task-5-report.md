# Task 5 report: multi-route SSR and prerendered documents

## RED

Created pure string-contract tests before the helper module existed.

```bash
npm test -- scripts/prerender-helpers.test.ts
```

Initial result: failed as expected because
`scripts/prerender-helpers.mjs` did not exist.

Added the SSR server-entry contract before replacing `renderLanding()`.

```bash
npm test -- src/entry-server.test.tsx
```

Initial result: failed because `renderRoute`, `prerenderManifest`, and
`structuredDataForRoute` did not exist. The first implementation also exposed
that client-lazy product routes render no server markup; the final route
configuration provides synchronous elements for the three prerendered product
documents, so browser hydration matches the SSR DOM.

Added a regression for Prettier-formatted multiline head nodes after the full
suite exposed the original one-line marker-regex assumption.

## GREEN

- `renderRoute(pathname)` now produces SSR HTML for the homepage and both
  product pages.
- `prerenderManifest`, route-specific structured data, and deterministic H1
  expectations are exported from the SSR entry.
- The prerender build writes:
  - `dist/index.html`
  - `dist/oblik-avtozapchastyn/index.html`
  - `dist/oblik-prodazhiv-avtozapchastyn/index.html`
- `dist/app.html` preserves the unmodified SPA shell for non-product routes.
- Head nodes use `data-product-seo`; generated documents receive route title,
  description, canonical, OG/Twitter data, one JSON-LD script, SSR root HTML,
  and the existing critical CSS/hero-font treatment.
- `check:prerender` validates all generated files, exactly one H1/root/JSON-LD,
  expected H1 text, and unique titles/descriptions/canonicals.

Focused verification:

```bash
npm test -- scripts/prerender-helpers.test.ts
# 1 file passed, 9 tests passed

npm test -- src/entry-server.test.tsx src/routes/routes.test.tsx
# 2 files passed, 10 tests passed

npm test -- src/App.test.tsx src/routes/routes.test.tsx
# 2 files passed, 4 tests passed
```

Final verification:

```bash
npm run check
# 32 files passed, 116 tests passed; typecheck, lint, and format check passed

npm run build:prod
npm run check:prerender
# build passed; "Validated 3 prerendered product documents"
```

## Files

- Updated `index.html`, `src/entry-server.tsx`, `scripts/prerender.mjs`,
  `package.json`, and the existing SEO surface assertion.
- Added pure helpers and declarations, their unit tests, SSR-entry and template
  contract tests, plus `scripts/check-prerender-output.mjs`.

## Self-review

- Generation fails if the root marker, stylesheet, or any required marked SEO
  node is absent, if a manifest route returns no markup, or if generated route
  metadata is not distinct.
- Attribute values are escaped; canonical validation compares the escaped HTML
  form; JSON-LD remains serialized through the existing safe serializer.
- Marker matching accepts Prettier’s multiline attribute layout while retaining
  the stable `data-product-seo` selectors.
- The production browser data router remains in place. Its two prerendered
  product routes intentionally load synchronously so their first client render
  matches the SSR document instead of rendering a hydration fallback.

## Concerns

The two product route components are intentionally in the initial browser
bundle (the entry gzip size increased by roughly 4 kB) to prevent a React
hydration mismatch on their prerendered documents. Their content is central to
the SEO landing experience, and all other application routes retain lazy
loading.
