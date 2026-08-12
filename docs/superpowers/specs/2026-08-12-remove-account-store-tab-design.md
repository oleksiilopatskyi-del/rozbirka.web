# Remove Marketplace from Rozbirka Web

## Goal

Remove the retired marketplace feature completely from the web application. The
authenticated account page must not expose seller tools, public marketplace URLs
must no longer be application routes, and the production site must stop
advertising or prerendering marketplace content.

## Scope

- Remove the `Магазин` navigation entry from the account sidebar.
- Remove `marketplace` from the account section state.
- Stop importing and rendering `SellerMarketplacePanel` from `AccountScreen`.
- Add an account-screen regression test that verifies there is no `Магазин`
  navigation button after the account finishes loading.
- Delete the public marketplace application shell and screens.
- Delete seller marketplace components.
- Delete the marketplace API client, DTOs, mock data, and their tests.
- Remove all marketplace routes from React Router.
- Remove marketplace paths and metadata from the Cloudflare Worker SPA routing.
- Make former marketplace paths return the branded `404` response with
  `X-Robots-Tag: noindex`.
- Remove marketplace from the sitemap, prerender pipeline, production route
  checks, and their tests.
- Delete the original marketplace design and implementation-plan documents:
  - `docs/superpowers/specs/2026-06-14-marketplace-design.md`
  - `docs/superpowers/plans/2026-06-14-marketplace-rebuild.md`
- Delete `publicApiClient` from the shared API client if marketplace removal
  leaves it unused.

## Out of Scope

- Any `rozbirka.core` changes.
- The ROZ-35 core branch and worktree.
- Unrelated historical documents that mention marketplace only as context.
- The current removal spec and implementation plan, which preserve the reason
  for deleting the feature.

## Implementation Boundary

The change is isolated to `rozbirka.web` on branch
`vsobol/remove-account-store-tab`, based on the current `origin/develop`.

This is a hard removal, not a feature flag or CSS hide. Account integration,
public UI, data-access code, route registration, edge routing, SEO outputs, and
feature-specific tests are removed together. Existing marketplace URLs are not
redirected to the home page because they no longer represent valid content;
they use the site's existing branded `404` behavior instead.

## Verification

- The account unit test confirms that the `Магазин` navigation button is absent.
- Router tests confirm former marketplace paths are absent from React Router.
- Worker tests confirm former marketplace paths return branded `404` responses
  with `noindex`.
- SEO and prerender tests confirm marketplace is absent from generated and
  committed sitemaps.
- A repository search confirms no marketplace runtime imports, route metadata,
  or production probes remain.
- The repository's standard typecheck, lint, format, unit-test, and production
  build checks pass.
