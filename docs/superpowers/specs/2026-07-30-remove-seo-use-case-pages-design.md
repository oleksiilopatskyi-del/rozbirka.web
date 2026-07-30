# Remove SEO use-case pages design

## Goal

Remove the homepage use-case section and fully retire these two public pages:

- `/oblik-avtozapchastyn`
- `/oblik-prodazhiv-avtozapchastyn`

After release, neither URL is a valid application or prerendered route.

## User-visible behavior

- The entire homepage section headed `Усе для щоденної роботи авторозбірки`
  is removed.
- Its two cards and links are removed with it.
- Direct requests to either retired URL, with or without a trailing slash,
  return the existing branded 404 page.
- Retired URLs return HTTP 404 and `X-Robots-Tag: noindex`; they do not
  redirect to the homepage.
- All other homepage sections and public/application routes remain unchanged.

## Code and content removal

- Remove `UseCaseLinks` from the homepage and delete its component and tests.
- Delete the two route screen components.
- Delete the shared SEO use-case page component, its tests, and the content
  registry used only by those pages.
- Remove the two paths from the React route table.
- Reduce the product SEO registry to the homepage entry only.
- Simplify server rendering, structured-data generation, and prerender
  expectations so they no longer depend on use-case page content.

## Edge routing and discovery

- Remove both document mappings from the Cloudflare Worker.
- Keep the existing unknown-route behavior: the Worker serves `404.html` with
  HTTP 404, cache revalidation, and `X-Robots-Tag: noindex`.
- Remove both URLs from the static sitemap and generated sitemap.
- Remove both routes from production probes and prerender output checks.
- Do not add redirects, tombstone pages, or replacement content.

## Tests

- Add or update route tests to assert both retired paths are absent.
- Add Worker regression coverage that both retired paths, including trailing
  slash variants, return the branded noindex 404 response.
- Update SSR, prerender, SEO registry, structured-data, production-route, and
  E2E tests to cover the remaining homepage-only product SEO surface.
- Keep the existing homepage visual baselines unless removal of the section
  legitimately changes full-page screenshots; if it does, regenerate only the
  affected baselines and review them visually.
- Run the complete repository checks, QA build, prerender validation, and E2E
  suite before integration.

## Non-goals

- No homepage copy, hero, feature, pricing, FAQ, CTA, footer, favicon, or
  typography changes.
- No changes to privacy, login, account, marketplace, prototype, or asset
  routes.
- No redirect or SEO migration strategy for the retired URLs.
