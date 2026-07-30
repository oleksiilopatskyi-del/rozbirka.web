# ROZ-13 SEO First Wave

## Status

Approved for specification on 2026-07-28.

## Goal

Deliver the first implementation wave of ROZ-13 in `rozbirka.web`:

- give the public product site a clear keyword-to-page architecture;
- optimize the homepage for the autorozbirka software category;
- add two useful, independently indexable use-case pages;
- make prerendering, metadata, structured data, sitemap entries, and edge
  routing route-aware;
- preserve the existing brand, visual system, accessibility, and performance
  baseline.

This phase does not connect Google Search Console, GA4, or Bing Webmaster
Tools. Search volume, current positions, and conversion baselines remain
explicitly pending until those tools are available.

## Confirmed Decisions

- The canonical public origin is `https://rozbirka.pro`.
- The first wave contains the homepage and two new landing pages.
- The homepage targets the commercial autorozbirka software category.
- Inventory and sales intents receive separate pages to avoid forcing all
  queries onto the homepage.
- The current visual identity and shared site chrome remain unchanged.
- Every page must provide unique user value and must not be a doorway page.
- Product claims must be supported by the current product and public billing
  contract.
- Search Console, analytics instrumentation, Bing setup, and 30/60/90-day
  performance monitoring are deferred to a later ROZ-13 phase.

## Keyword-to-Page Map

| Route | Primary cluster | Supporting queries | Intent | Business relevance | Competition | Cannibalization boundary |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | програма для авторозбірки | CRM для авторозбірки; програма для розборки авто | Commercial product/category | High | Qualitative baseline only | Owns the broad autorozbirka product category and links to the two narrower workflows |
| `/oblik-avtozapchastyn` | облік автозапчастин | програма для складу автозапчастин; складський облік автозапчастин | Commercial solution/use case | High | Qualitative baseline indicates established competitors | Owns inventory, parts, batches, search, stock, reserve, and QR workflows |
| `/oblik-prodazhiv-avtozapchastyn` | облік продажів автозапчастин | програма для магазину автозапчастин; облік замовлень автозапчастин | Commercial solution/use case | High | Qualitative baseline indicates established competitors | Owns orders, customers, payments, cash registers, and sales reporting |

The map must store search volume, difficulty, impressions, clicks, CTR, and
position as pending external baseline fields. The implementation and
documentation must not invent numeric values.

## Information Architecture

### Homepage

The homepage remains the broad product overview. Its title, description, H1,
introductory copy, and supporting sections explain that Rozbirka is software
for autorozbirka businesses and connect that category to the product's
inventory, sales, finance, and team capabilities.

The existing layout is retained. Copy changes must preserve readability and
the current conversion flow.

### Parts inventory page

`/oblik-avtozapchastyn` provides a complete answer for businesses looking to
organize their parts inventory. Its content covers:

- cars and intake batches as the source of parts;
- part records, photos, condition, price, and location;
- search, stock status, reserve state, and inventory visibility;
- QR sticker workflows supported by the product;
- links to the broader product page and the sales workflow.

### Parts sales page

`/oblik-prodazhiv-avtozapchastyn` provides a complete answer for businesses
looking to manage parts sales. Its content covers:

- orders and order status;
- customer records and purchase history;
- payments, currencies, and cash registers;
- sales and cash reporting supported by the product;
- links to the broader product page and the inventory workflow.

### Internal linking

The homepage links contextually to both use-case pages. Each use-case page
contains:

- a breadcrumb back to the homepage;
- a contextual link to the sibling use case;
- a clear registration CTA using the existing login/onboarding flow;
- shared header and footer navigation that remain usable on every route.

Anchors must describe their destination and must not use repetitive
keyword-stuffed text.

## Page Composition

The two use-case pages use shared, focused components:

- site header and footer;
- breadcrumbs;
- use-case hero;
- problem and outcome section;
- supported capability groups;
- short workflow explanation;
- visible FAQ;
- related-use-case links;
- final CTA.

Page-specific content remains separate even when components are shared. The
implementation must not create pages by mechanically substituting keywords
into one generic paragraph set.

## SEO Registry

A typed SEO registry is the single source of truth for the three product SEO
routes in this phase. Each entry contains:

- route and canonical URL;
- page title and meta description;
- primary and supporting query clusters;
- Open Graph and Twitter values;
- structured-data definitions;
- breadcrumb definitions;
- indexability;
- sitemap inclusion.

The registry drives build-time prerendering, route metadata, product-route
sitemap entries, and SEO contract tests. A product SEO route missing a
required field is a build/test failure.

Private routes such as `/login` and `/account` remain outside the indexable
registry and retain `noindex` behavior. Existing legal and marketplace route
policies are preserved in this wave; they are not silently converted into
product landing pages or removed from crawler files.

## Rendering and Metadata Flow

The existing single-route server renderer becomes a route-aware renderer:

1. The prerender script iterates the three product SEO entries.
2. `renderRoute(path)` renders the matching React route.
3. The build injects the route's title, description, canonical, Open Graph,
   Twitter, and JSON-LD into the HTML head.
4. The build writes:
   - `dist/index.html`;
   - `dist/oblik-avtozapchastyn/index.html`;
   - `dist/oblik-prodazhiv-avtozapchastyn/index.html`.
5. The Cloudflare Worker maps each SEO path to its own prerendered document.
6. Direct requests receive complete useful HTML without requiring client-side
   JavaScript.
7. Client-side navigation synchronizes the document head with the same
   registry.

The prerendered route and hydrated browser route must render compatible
content.

## Structured Data

Structured data is generated from typed objects and serialized rather than
assembled as handwritten JSON strings.

- The homepage includes `Organization`, `WebSite`, and
  `SoftwareApplication`.
- Each use-case page includes `WebPage` and `BreadcrumbList`.
- A page may include `FAQPage` only when every question and answer is visible
  on that page and the structured value matches the visible copy.
- Canonical URLs and entity identifiers always use the production apex origin.

Structured data must describe the page and product accurately. It does not
claim ratings, reviews, unsupported platforms, or unsupported capabilities.

## Product Claims and Copy Rules

Copy is written in natural Ukrainian for business owners and operators. The
primary query appears where useful in the title, H1, introduction, and relevant
section headings, without a target density or forced repetition.

Claims are limited to capabilities already supported by the product and its
public billing contract. This phase must not introduce claims about:

- accounting or tax filing;
- PRRO/fiscalization;
- delivery integrations;
- supplier price-list integrations;
- capabilities or limits not present in the current product contract.

Existing product claims that are touched by this work must be checked against
the product implementation and public plan data.

## Sitemap, Robots, and Edge Routing

- The sitemap adds both use-case pages and preserves existing public,
  indexable entries unless a separate crawler-policy decision changes them.
- New SEO pages are served with HTTP 200 and their own canonical metadata.
- Unknown routes keep the branded HTTP 404 response.
- `/login`, `/account`, QA hosts, and workers.dev hosts remain `noindex`.
- `robots.txt` continues to point to the canonical sitemap and disallow
  private routes.
- HTML and sitemap responses retain revalidation rather than immutable
  caching.

## Failure Handling

- A registry entry with incomplete metadata fails contract tests.
- Duplicate primary clusters fail the keyword-map contract.
- A missing product SEO route in the sitemap fails tests.
- A prerendered document without exactly one H1, a canonical URL, a
  description, or useful body content fails tests.
- Invalid structured-data serialization fails the build or focused unit tests.
- Missing static SEO documents at the edge return the branded 404 rather than
  the generic SPA shell.
- Unsupported or uncertain product claims are omitted instead of inferred.

## Testing Strategy

Implementation follows test-driven development.

### Registry and keyword map

- Assert unique routes, canonicals, and primary clusters.
- Assert required metadata and sitemap inclusion for all three product SEO
  entries.
- Assert pending external baseline values remain explicitly unmeasured rather
  than fabricated.

### Components and semantics

- Assert each page has exactly one H1.
- Assert every page exposes substantial route-specific content.
- Assert breadcrumbs and contextual internal links have correct destinations.
- Assert visible FAQ content matches any `FAQPage` data.
- Preserve existing accessibility and component regression coverage.

### Prerender and metadata

- Build all three SEO documents.
- Assert each document has unique title, description, canonical, Open Graph,
  and JSON-LD.
- Assert critical SEO content exists in the generated HTML before JavaScript.
- Assert homepage and use-case schema types are correct.

### Edge and crawler surface

- Test direct requests for both new routes.
- Test trailing-slash behavior consistently with the canonical policy.
- Test sitemap membership and private-route exclusion.
- Retain redirect, cache-header, `noindex`, prototype-route, and real-404
  coverage.

### Release gate

Before completion, run:

- focused SEO and route tests;
- the complete Vitest suite;
- typecheck, lint, and formatting checks;
- production build;
- production route checks;
- relevant Playwright and Lighthouse checks when supported by the local
  environment.

## Delivery Scope

This first wave produces:

- a committed keyword-to-page map with qualitative SERP evidence;
- optimized homepage metadata and category-focused copy;
- two unique use-case pages;
- route-aware SEO registry and client metadata synchronization;
- multi-route prerendering;
- route-aware structured data;
- updated sitemap and Cloudflare routing;
- automated SEO contracts and regression tests.

## Deferred Work

- Google Search Console ownership and sitemap submission;
- Bing Webmaster Tools ownership and sitemap submission;
- GA4 organic landing-page and conversion reporting;
- numeric volume/difficulty validation through approved data sources;
- baseline impressions, clicks, CTR, positions, indexed pages, and
  conversions;
- KPI agreement and monitoring at 7/30/60/90 days;
- additional landing pages or the 8–12 article content backlog;
- backlink outreach execution.

Those items remain part of ROZ-13 but are not prerequisites for implementing
this code-first wave.
