# ROZ-12 Remaining Scope: Billing Contract, Performance, SEO, and Edge

## Status

Approved for implementation on 2026-07-24.

This specification combines every ROZ-12 requirement left after Phase 1 into
one delivery block. The work spans `rozbirka.web` and one narrowly scoped
billing-catalog change in `rozbirka.core`.

## Goal

Finish ROZ-12 without redesigning the product:

- make 14 days the single canonical trial duration;
- make the public billing API authoritative for landing pricing;
- remove unsupported pricing and FAQ claims;
- reduce mobile transfer and eliminate hidden desktop-image downloads;
- add complete SEO metadata and crawler files;
- serve known SPA routes while returning real 404 responses elsewhere;
- apply production-safe caching and canonical host redirects at the
  Cloudflare edge.

## Confirmed Decisions

- The canonical public URL is `https://rozbirka.pro`.
- `http://rozbirka.pro` redirects permanently to
  `https://rozbirka.pro`.
- `www.rozbirka.pro` is provisioned as a Cloudflare Custom Domain and
  permanently redirects to `https://rozbirka.pro`.
- Trial duration is 14 days everywhere.
- Pricing selection still opens Account → Plans and never starts checkout
  automatically.
- App Store remains
  `https://apps.apple.com/ua/app/rozbirka/id6762130912`.
- Google Play remains non-interactive “Скоро”.
- The visual system, layout identity, typography hierarchy, brand colors, and
  existing product positioning remain unchanged.
- Email addresses, email DNS/MX, auth infrastructure, and unrelated API
  migration work remain outside scope.

## Architecture

### 1. Canonical billing contract

`rozbirka.core` remains authoritative for plan codes, prices, limits, feature
keys, and trial duration.

The core catalog changes only one datum: `Pro.TrialDays` becomes `14`, matching
the existing automatic onboarding `Trial.TrialDays = 14`. A focused catalog
test locks the public values for Lite, Pro, Enterprise, and Trial.

`rozbirka.web` adds a small landing-plan adapter with two responsibilities:

1. validate and map `GET /api/v1/billing/plans` responses into presentation
   data;
2. provide an exact, tested fallback snapshot when the API is temporarily
   unavailable.

The fallback snapshot must match the core catalog:

| Plan | Price | Limits | Supported capabilities |
| --- | ---: | --- | --- |
| Lite | $19/month | 3 cars, 100 parts, 1 user, 1 cash register | Core car and parts inventory |
| Pro | $59/month | 20 cars, 25 intakes, 2,000 parts, 5 users, 2 cash registers | Intakes, advanced reports, team collaboration, multiple cash registers, QR codes |
| Enterprise | $299/month | Unlimited catalog limits | Same capability set as Pro |

The landing must not claim API access, multi-location, priority support,
unlimited users on Lite/Pro, analytics, or export unless those capabilities
exist in the public catalog.

The pricing and onboarding copy says “14 днів безкоштовно”. FAQ explains that
the automatic trial starts after workspace creation, requires no card, and
uses Pro-level capabilities and limits for 14 days. Account UI renders the
API-provided catalog and never silently substitutes unsupported claims.

### 2. Asset and font delivery

The existing source artwork remains the visual reference, but production
components stop importing multi-megabyte PNG and raster-heavy SVG files.

- Hero artwork receives responsive AVIF and WebP outputs. The desktop source is
  only discoverable at `min-width: 1024px`; mobile uses a tiny inert fallback,
  so the hidden hero is not requested.
- CTA artwork receives responsive AVIF/WebP sources with explicit dimensions
  and `sizes`.
- Each feature illustration receives an optimized AVIF/WebP source sized for
  its rendered card. No production import references the old raster-heavy SVG.
- Visuelt Pro fonts are converted to WOFF2. Only actually used weights remain
  declared, and only the critical regular/medium face is preloaded.
- Every key production image is at most 500 KB.
- A build-time asset-budget script fails when a key image exceeds 500 KB, when
  legacy heavy assets are still referenced, or when the mobile critical asset
  set exceeds 3 MB.

The source files may remain in Git for provenance, but they must not enter the
production bundle.

### 3. SEO and crawler surface

`index.html` receives:

- canonical URL;
- complete description;
- Open Graph title, description, URL, type, locale, and image;
- Twitter card metadata;
- theme color;
- JSON-LD for the Rozbirka organization and software application.

Static public files provide:

- `/robots.txt` with plain-text MIME content and the canonical sitemap URL;
- `/sitemap.xml` with canonical public indexable routes only;
- `/404.html` with a branded, accessible return-home action;
- a social preview image under the canonical host.

`/login`, `/account`, QA domains, workers.dev domains, and prototype routes
must not be indexed.

### 4. Production route boundary

Prototype routes `/screens` and `/screens/header` are registered only in
development builds. Production edge routing also rejects `/screens` and every
descendant as 404, providing defense in depth.

Known SPA routes are:

- `/`
- `/privacy`
- `/login`
- `/account`
- `/marketplace`
- `/marketplace/listings/:slugOrId`
- `/marketplace/shops/:slug`

The Cloudflare Worker serves `index.html` for those route shapes so deep links
continue to work. Any other path receives `404.html` with HTTP status 404.

### 5. Cloudflare Worker and caching

The deployment changes from assets-only SPA fallback to a Worker with an
`ASSETS` binding.

Request flow:

1. If the hostname is `www.rozbirka.pro`, return a permanent redirect to the
   HTTPS apex while preserving path and query.
2. If the request scheme is HTTP, return a permanent redirect to the same path
   on HTTPS.
3. Reject production prototype routes.
4. Serve real static assets through `ASSETS`.
5. Serve the SPA shell for known application routes.
6. Return branded 404 HTML for unknown paths.

Response policy:

- fingerprinted `/assets/*` responses:
  `Cache-Control: public, max-age=31536000, immutable`;
- HTML, `robots.txt`, and `sitemap.xml`: revalidation/no-cache policy;
- QA, workers.dev, login, and account responses: `X-Robots-Tag: noindex`;
- preserve asset MIME types and ETags from the assets binding;
- do not buffer unbounded bodies or introduce request-scoped global state.

Production Wrangler configuration owns both exact Custom Domains:
`rozbirka.pro` and `www.rozbirka.pro`. The Worker performs the www redirect.
QA keeps its existing worker name and does not claim production domains.

### 6. Error handling and fallbacks

- Pricing API failure shows the validated static fallback; it must not hide the
  pricing section or expose raw errors.
- Malformed or unknown plans from the API are ignored rather than rendered.
- If fewer than the three required plans validate, the complete fallback is
  used so the comparison remains coherent.
- Worker asset lookup failures become 404 responses, never an accidental 200
  SPA shell.
- Redirects preserve path and query but always remove the `www` host and force
  HTTPS.
- No production deploy occurs if unit tests, the production build, asset
  budgets, Wrangler dry-run, or route tests fail.

## Testing Strategy

### Core contract

- Catalog test asserts exact public plan codes, amounts, currency, limits,
  features, and `TrialDays = 14`.
- Existing subscription tests prove automatic workspace creation still creates
  a 14-day Trial.

### Web contract and UI

- Adapter tests validate all three plans, reject malformed plans, and exercise
  fallback behavior.
- Pricing tests assert API data, exact fallback data, 14-day copy, supported
  capabilities, and existing plan-selection destinations.
- FAQ and Account tests assert canonical trial and user-limit copy.

### Performance

- Asset-budget test checks production outputs and prevents legacy heavy imports.
- Production build inspection proves mobile does not reference the desktop hero
  as its fallback source.
- Lighthouse/LHCI runs against the production preview with mobile settings.
  Targets remain Accessibility 100, SEO at least 95, LCP at most 2.5 seconds,
  CLS at most 0.1, and total mobile transfer at most 3 MB.
- Chrome DevTools performance MCP is not currently available in this Codex
  session, so the repeatable CLI/CI audit is the release gate. A DevTools trace
  can be added later without changing implementation.

### SEO and edge

- Metadata tests inspect `index.html`.
- Static-file tests parse robots and sitemap content.
- Pure Worker routing tests cover HTTPS, www, assets, every known SPA route,
  prototypes, and unknown 404s.
- Wrangler types/config validation and deployment dry-run must pass.
- After QA deploy, HTTP status, content type, cache headers, route behavior, and
  crawler files are verified with direct requests.

## Delivery

The implementation is developed in isolated worktrees:

- one web worktree based on `rozbirka.web/develop`;
- one core worktree based on `rozbirka.core/develop`.

Each repository receives focused commits and its own test gate. The combined
delivery is reviewed as one ROZ-12 block. Web is merged and pushed to
`develop`, which triggers QA deployment. Core is merged and pushed to
`develop`.

Production deployment and Custom Domain provisioning occur only after both
repositories pass final review and the Wrangler production dry-run. Because
the user explicitly approved the production www redirect, the deployment may
create the `www.rozbirka.pro` Custom Domain and its managed DNS/certificate.

ROZ-12 moves to Done only after post-deploy checks confirm the catalog,
performance budget, crawler files, redirects, cache headers, prototype
blocking, known deep links, and unknown-route 404 behavior.

## Out of Scope

- visual redesign or rebranding;
- new billing entitlements or checkout behavior;
- changing prices or resource limits;
- email addresses, email DNS, MX, or Google Workspace;
- ROZ-11 API/auth/domain migrations;
- ROZ-13 search-keyword content strategy;
- replacing React/Vite with SSR or SSG.
