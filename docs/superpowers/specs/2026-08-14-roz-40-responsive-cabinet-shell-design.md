# ROZ-40 Responsive Cabinet Shell

## Goal

Create the tenant-scoped authenticated shell that all web ERP modules use. The
shell must provide stable routes, responsive navigation, backend-derived access
decisions, and an atomic tenant boundary that never renders data or permissions
from the previous tenant after a switch begins.

ROZ-40 establishes infrastructure and a minimal shell home. It does not
implement the dashboard or ERP business modules owned by ROZ-41 through ROZ-51.

## Product Decisions

- Tenant URLs use the backend tenant `slug`; API requests continue to use the
  tenant `id` in `X-Tenant-Id`.
- Module visibility is progressive. The route contract exists before a module
  ships, but unreleased modules are absent from navigation and direct visits
  render an explicit unavailable state.
- A central module registry is the single source for navigation and route
  access. Screens do not reimplement permission, feature, billing, or release
  checks.
- Backend permissions, features, subscription state, and usage are
  authoritative. Role names and frontend guesses are not authorization rules.
- A route/control gate improves UX but never replaces backend authorization for
  mutations.

## Scope

- Add the authenticated `/app/:tenant` route tree and canonical redirects from
  `/account`.
- Add desktop sidebar, tablet rail, and mobile bottom navigation shells.
- Load permissions, features, and the non-sensitive entitlement state/quota
  summary from `/api/v1/me/permissions`; load detailed subscription data from
  `/api/v1/billing/subscription` only when `billing.view` is granted.
- Add central route, control, and mutation policy evaluation.
- Make tenant switching an ordered, generation-safe transition that cancels
  old requests and resets tenant-scoped client state before the target tenant
  can render.
- Preserve tenant creation, invitation join/resume, tenant switching, billing,
  and logout flows inside the new route model.
- Add branded global and cabinet not-found states and keep cabinet screens lazy.
- Verify responsive layout, keyboard navigation, visible focus, and the tenant
  isolation boundary.

## Out of Scope

- Dashboard analytics and quick actions (ROZ-41).
- Cars, intakes, parts, scanners, stickers, orders, customers, cash, reports,
  team administration, or expanded profile settings (ROZ-42 through ROZ-51).
- New backend endpoints or changes to backend authorization rules.
- A backend-configured navigation schema.
- Client-side offline mutation queues. ROZ-40 defines their reset boundary so a
  future queue can register without changing tenant-switch semantics.

## Route Model

The authenticated route tree is:

```text
/app/:tenant
  /dashboard
  /cars
  /intakes
  /parts
  /stickers
  /orders
  /customers
  /cash
  /reports
  /team
  /settings/profile
  /settings/business
  /settings/billing/overview
  /settings/billing/plans
  /settings/billing/payments
```

`/app/:tenant` redirects to `/app/:tenant/dashboard`. The `:tenant` parameter
must match one active tenant from the authenticated tenant list. The shell maps
that slug to the tenant ID before committing the API scope. Unknown or inactive
tenants do not fall back silently to another tenant.

`/account` remains a compatibility entry point:

- users with a selected tenant redirect to its dashboard;
- `section=plans`, `section=payment`, and billing-related plan query state map to
  the corresponding tenant billing route;
- users with no tenants remain in the tenant onboarding state;
- safe query state such as a validated plan code is preserved.

Every cabinet child is route-level lazy. Unreleased route entries resolve to a
small shared `ModuleUnavailable` screen rather than importing future module
bundles. A final `*` route renders a branded, `noindex` 404 with a safe link to
the active dashboard or public home.

ROZ-40 releases the minimal dashboard shell home, existing subscription/plans/
payments surfaces, basic profile/logout actions, tenant onboarding, and tenant
switching. Business settings and the ERP modules remain registered but
unreleased until their owning child tasks ship. The minimal dashboard home is a
navigation destination and shell status surface only; it contains no ROZ-41
analytics or business widgets.

## Module Registry and Access Policy

A typed module registry owns each module's:

- route segment and label;
- navigation placement and icon;
- release state;
- required view permission;
- optional feature code;
- allowed subscription states;
- optional quota resource for create controls.

The policy evaluator accepts a registry entry, an access snapshot, and an
operation (`view`, `control`, or `mutation`). It returns a discriminated result:

```text
allowed
unreleased
permission-denied
feature-unavailable
subscription-blocked
quota-exhausted
access-loading
access-error
```

The same evaluator drives navigation filtering, direct-route guards, and shared
control/mutation guards. This prevents a hidden menu item from remaining
reachable by URL and prevents a visible create button from bypassing a quota.

Quota exhaustion only blocks operations that consume that resource; it does not
hide read-only lists. Mutation helpers re-check the latest snapshot immediately
before dispatch and still surface backend `403`, feature, billing, or quota
responses honestly if state changed concurrently.

## Tenant Access Snapshot

The access layer stores one immutable snapshot associated with an exact
`{ userId, tenantId, generation }` scope:

```text
role
permissions
features
entitlement: state + quota usage
subscription (optional when billing.view is absent)
status: loading | ready | error
```

`GET /me/permissions` is always loaded for the target tenant. It supplies role,
effective permissions, backend features, and a non-sensitive entitlement
summary that is available to Manager/Master members without granting billing
access. Detailed subscription data is loaded only when the returned permissions
include `billing.view`; lack of billing permission is not converted into a fake
blocked subscription. Module state/quota policy consumes the entitlement
summary, while billing screens consume the separately protected subscription.

Access loading and network failure are distinct from denial. While access is
loading, protected module content is not rendered. A failed access bootstrap
shows a retryable error boundary and retains the requested safe route.

## Atomic Tenant Transition

Tenant switching is an explicit coordinator rather than a direct token write.
It performs these steps in order:

1. Increment the transition generation and enter a neutral switching state.
2. Abort every in-flight core request attached to the old tenant scope.
3. Clear old permissions, features, subscription state, overlays, drafts,
   queues, and registered tenant-scoped caches.
4. Remove old tenant-scoped cache entries.
5. Persist the target tenant ID for `X-Tenant-Id`.
6. Load the target permission/feature/entitlement snapshot and optional detailed
   subscription.
7. Commit the target tenant and its access snapshot together.
8. Navigate to the equivalent allowed route, or the target dashboard when the
   previous module is unavailable.

The API client attaches the current tenant scope's `AbortSignal` to core
requests by default. Future tenant-scoped stores register reset callbacks with
the boundary rather than adding ad-hoc cleanup to the switcher.

Every asynchronous continuation checks the transition generation before it can
commit. A late A-to-B response, a rapid A-to-B-to-C switch, route changes during
bootstrap, and unmount must not restore stale access or content. If target
bootstrap fails, the old tenant is not rendered again under the target URL; the
shell shows a target-scoped retry state.

## Responsive Shell

The visual hierarchy follows the existing dark Rozbirka account language and
reuses current brand, color, radius, type, and focus tokens.

- At 1024 px and wider, render a persistent labeled sidebar and content area.
- From 768 through 1023 px, render a compact icon rail with accessible names and
  keyboard/focus-visible labels or tooltips.
- Below 768 px, render a fixed bottom navigation. It contains only released and
  allowed primary destinations plus `Ще`; unreleased modules do not occupy dead
  slots.
- `Ще` exposes tenant switching, secondary released routes, billing/profile,
  and logout in a keyboard-operable drawer/dialog.
- The shell reserves safe-area space, maintains at least 44 by 44 px touch
  targets, and does not create page-level horizontal scrolling at 320, 768,
  1024, or 1440 px.

Navigation uses semantic links, indicates the current page with
`aria-current`, has visible focus, and supports keyboard-only tenant switching.
Reduced-motion preference disables nonessential transitions.

## Existing Flow Migration

The current account implementation is decomposed rather than nested inside a
second shell:

- reusable tenant onboarding and billing panels move into cabinet routes;
- tenant switching calls the atomic coordinator;
- logout keeps the already-verified immediate navigation behavior;
- invitation acceptance continues to hydrate tenants, then enters the accepted
  tenant's dashboard;
- scan/login resume paths keep their intended destination and pass through the
  same tenant boundary.

No business panel may maintain an independent selected-tenant value. The URL,
authenticated tenant record, access snapshot, API header, and cache scope must
agree before module content renders.

## Empty and Error States

- No tenants: tenant creation plus invitation guidance, without rendering the
  cabinet shell as if a tenant existed.
- Unknown tenant slug: tenant-not-found state; never silently use the first
  tenant.
- Inactive tenant: unavailable state with a switch action.
- Access request failure: retryable network state.
- Missing permission: access-denied state without leaking module data.
- Missing feature or blocked subscription: explicit upgrade/billing state when
  the user can view billing, otherwise a generic owner-contact state.
- Exhausted quota: read access remains available; consuming controls are
  disabled with current usage and limit.
- Unreleased module: explicit unavailable state and route back to dashboard.
- Unknown route: branded 404.

## Testing Strategy

### Unit tests

- Registry and policy truth tables for release, permission, feature,
  subscription, and quota gates.
- Built-in Manager/Master policy regressions without `billing.view`, including
  blocked entitlement and quota-full read-versus-mutation behavior.
- Compatibility redirects and tenant slug resolution.
- Transition coordinator ordering, cleanup, generation invalidation, abort, and
  failure behavior.
- Route helpers preserve safe paths and reject cross-tenant fallbacks.

### Integration tests

- Navigation and direct URLs produce the same access decision.
- Switching A to B clears A state before B can render.
- Late A responses and rapid A-to-B-to-C transitions cannot commit.
- Permission, feature, billing, empty-tenant, invalid-tenant, retry, unavailable,
  and 404 states render honestly.
- Existing onboarding, invitation resume, billing, and logout paths survive the
  route migration.

### Browser tests

- Shell navigation and tenant switching at 320, 768, 1024, and 1440 px.
- No page-level horizontal overflow.
- Keyboard-only navigation, visible focus, dialog focus containment, Escape,
  and focus restoration.
- A delayed old-tenant response never appears after a switch.
- Direct-route gates match visible navigation.

The normal repository check, QA artifact gate, asset budget, Worker dry-run,
and relevant cross-browser authentication smoke tests remain required before
publication.

## Rollout and Compatibility

ROZ-40 ships the shell and redirects while keeping unreleased modules closed.
Subsequent module tasks only need to replace their unavailable route element and
flip the typed release state after their own checks pass.

The rollout does not change backend permissions or subscription rules. Existing
QA auth/session behavior remains the prerequisite smoke flow. Production
promotion remains separate from QA validation.
