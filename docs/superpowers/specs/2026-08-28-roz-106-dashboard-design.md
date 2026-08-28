# ROZ-106 Web Dashboard Design

## Goal

Deliver the first operational screen of the browser cabinet on the ROZ-104
service-root branch. The dashboard must use authoritative Core totals, preserve
tenant and access boundaries from the completed ROZ-40 cabinet work, expose a
URL-stable day/week/month analytics period, and remain usable across mobile,
tablet, and desktop browsers.

## Current State

The ROZ-104 root branch already contains the completed ROZ-107 parity matrix and
API audit, but `origin/main` does not contain the cabinet foundation needed by
ROZ-106. The completed ROZ-40 work exists only on branch
`vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan`.
That branch owns the `/app/:tenant` route tree, atomic tenant transitions,
tenant-scoped request headers, access and entitlement policy, responsive
navigation, billing screens, and the current placeholder dashboard.

ROZ-40 is based on an older commit and has diverged from both `origin/main` and
the ROZ-104 root branch. Reimplementing or selectively copying its security
boundary would duplicate reviewed behavior and risk omitting an interdependent
tenant-cleanup or access-policy fix.

The authoritative dashboard transport contract is the versioned Core OpenAPI
artifact on the ROZ-102 root branch:
`contracts/openapi/v1/rozbirka-core.json`. It defines:

- `GET /api/v1/dashboard` with a required `X-Tenant-Id` header;
- `GET /api/v1/dashboard/analytics?period=day|week|month` with the same tenant
  header;
- bearer authentication, the shared response envelope, and the documented
  error statuses;
- nullable role-specific dashboard fields that must not be converted into
  invented zero values.

The current backend intentionally treats both dashboard endpoints as reviewed
permission exemptions. There is no canonical `dashboard.view` permission in
the Core permission catalog. The Web implementation therefore must not invent
one. Dashboard module links and quick actions remain permission-, feature-,
subscription-, and quota-aware through the existing ROZ-40 policy layer.

## Chosen Approach

Integrate the complete ROZ-40 branch into the existing ROZ-104 root branch with
a merge commit, resolve conflicts against the current root in favor of the
newest runtime and delivery behavior, and run the existing Web verification
gate before adding dashboard behavior. This preserves the reviewed ROZ-40
history and makes all later ROZ-104 children build on one service-root branch
and one eventual integration PR.

After the foundation is green, replace the placeholder dashboard with focused
API, validation, state, presentation, and test units. No Gateway, Admin, Core,
Identity, Cloudflare, or deployment configuration changes are part of ROZ-106.

## Foundation Integration

The integration merges
`vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan` into
`vsobol/roz-104-frontend-rozbirkaweb-primary` without squashing or selecting
individual commits.

Conflict resolution follows these rules:

1. Preserve the ROZ-104 parity matrix, generator, drift gate, and ROZ-107
   documentation.
2. Preserve current `origin/main` dependency, Worker, build, and release-artifact
   behavior already present in the ROZ-104 branch.
3. Preserve the complete ROZ-40 cabinet security boundary: tenant transition
   serialization, request cancellation, cache/reset ownership, permission and
   entitlement policy, responsive shell, and route guards.
4. Do not redesign ROZ-40 behavior while resolving merge conflicts. A conflict
   that cannot be resolved mechanically from tests and current contracts stops
   the merge for a separate design decision.
5. Verify the integrated baseline before beginning ROZ-106. Dashboard failures
   must not be hidden among pre-existing merge regressions.

The merge intentionally brings the completed ROZ-40 profile and billing cabinet
surfaces into the root branch because they are part of that foundation's tested
route and policy graph. ROZ-106 does not extend those screens.

## Route and Period Contract

The canonical dashboard route is:

`/app/:tenant/dashboard?period=<day|week|month>`

The existing `/app/:tenant` index redirect continues to resolve to
`dashboard`. The period is controlled by the `period` search parameter:

- missing `period` means `week` without requiring a redirect;
- `day`, `week`, and `month` are the only accepted values;
- an unsupported or repeated value is normalized with a replace navigation to
  `period=week` so the visible URL and loaded data cannot disagree;
- changing the period updates only the search parameter and preserves the
  tenant path and unrelated approved search parameters;
- browser back and forward navigation reloads the corresponding period.

The parity matrix currently describes the conceptual route as `/cabinet`.
ROZ-106 updates that evidence to the already approved tenant-scoped route rather
than introducing a second cabinet URL family.

## API and Response Validation

A focused dashboard API adapter uses the existing authenticated `apiClient`.
The shared client supplies the bearer token and selected `X-Tenant-Id`; the
dashboard adapter must not accept a tenant ID argument or create an independent
Axios instance.

Transport data is treated as untrusted. Explicit validators accept only the
documented Core shapes and return normalized dashboard domain values. They
must verify:

- required strings, booleans, finite numbers, arrays, and dictionaries;
- `period` is exactly `day`, `week`, or `month`;
- analytics labels and series have matching lengths;
- currency totals contain finite numeric values;
- nullable role-specific fields remain `null` when omitted by the user's role;
- last-activity timestamps are valid ISO date strings before relative-time
  presentation;
- optional top-part data is either a complete valid object or `null`.

Malformed success responses become a normalized application error and are
never partially rendered. Unknown additive fields are ignored. No response
payload, authorization header, tenant data, or error body is logged.

## Tenant-Bound State and Requests

Summary and analytics requests start only when the ROZ-40 cabinet context has a
ready access snapshot for the route tenant. Each request uses an `AbortSignal`.
Tenant departure, tenant switch, logout, route unmount, or a superseding request
aborts outstanding work and clears dashboard state before the next tenant can
render.

Summary and analytics have independent loading and retry states. Changing the
period must not blank an already valid summary. A late response for an old
tenant or period is ignored even if transport cancellation races with
completion. Manual refresh refetches both summary and the active analytics
period exactly once and prevents duplicate refresh submissions.

No new global cache library is introduced. The dashboard uses a focused React
state hook registered with the existing cabinet reset lifecycle. This keeps the
change consistent with the current dependency set and tenant-cleanup ownership.

## Access, Billing, and Navigation

The dashboard itself is available to every authenticated member of a valid
tenant because Core defines no dashboard permission. It fails closed while the
tenant access snapshot is loading or unavailable.

Every module card and quick action derives availability from the existing
`cabinetModules` registry and policy helpers:

- view links require the module's view permission, feature, and subscription
  state;
- create actions additionally require the module's mutation permission and
  quota capacity;
- unreleased module destinations remain unavailable and never masquerade as
  working actions;
- billing links are shown only through the existing billing access policy;
- disabled or unavailable actions explain why they cannot be used rather than
  silently doing nothing.

Billing and quota banners use the current tenant entitlement and subscription
snapshot. The dashboard does not recompute entitlement state from usage values
or client-side plan names.

## Presentation

The browser dashboard adapts the Mobile information hierarchy without copying
native gestures or layout literally:

1. A heading identifies the active business and provides a refresh action.
2. Billing, trial, past-due, cancelled, or quota guidance appears before
   operational content when relevant.
3. An empty-yard onboarding panel offers only currently permitted and released
   starting actions.
4. Summary cards display authoritative operational totals. Role-specific cards
   are omitted when Core returns `null`; they do not display misleading zeroes.
5. Analytics provides keyboard-operable day/week/month controls, revenue,
   parts-sold, active-order, trend, and optional top-part information.
6. Recent activity is rendered only when a complete activity record exists.
7. Responsive module links expose only destinations permitted by the current
   access snapshot.

The first implementation uses lightweight CSS-based bars or trends and semantic
HTML rather than adding a chart dependency. Numeric summaries and trends remain
available as text, so the information does not depend on color or graphics.

## Loading, Empty, and Error Behavior

- Initial summary loading uses labelled, non-interactive skeleton regions and
  preserves the page heading.
- Analytics loading is scoped to the active analytics panel.
- A summary failure shows a concise error with one retry action and does not
  show stale data from another tenant.
- An analytics failure leaves a valid summary visible and offers an analytics-
  only retry.
- A missing session or forbidden tenant follows the existing cabinet/auth
  boundary rather than presenting a dashboard-local workaround.
- `402`, quota, and feature failures use normalized billing guidance where the
  existing error contract identifies them.
- Empty business data is a successful state with onboarding guidance, not an
  error.
- Refresh and retry controls are single-flight and expose busy state to
  assistive technology.

## Accessibility and Responsive Behavior

The dashboard uses semantic headings, sections, lists, links, and buttons.
Period controls expose the selected value through standard ARIA state, remain
keyboard operable, and have visible focus. Loading and error changes use
appropriate status or alert semantics without repeatedly announcing decorative
content.

The layout supports 320, 768, 1024, and 1440 pixel viewports without page-level
horizontal scrolling. Cards wrap rather than shrink below readable widths.
Touch targets remain at least 44 by 44 CSS pixels where the control is used on
small screens. Revenue and count values remain readable with large localized
numbers.

## Testing Strategy

Foundation integration is verified before dashboard work with the existing
unit, route, Worker, parity, and build gates.

ROZ-106 adds focused coverage for:

- exact dashboard and analytics request paths and cancellation;
- valid response parsing, nullable role data, additive fields, malformed
  responses, invalid dates, non-finite numbers, and series-length mismatch;
- missing, valid, invalid, and browser-history period behavior;
- initial loading, empty yard, complete data, summary failure, analytics
  failure, retry, refresh single-flight, and duplicate-click resistance;
- tenant change and logout cancellation with no previous-tenant render;
- permission-, feature-, subscription-, release-, and quota-filtered module
  links and actions;
- billing banner decisions from authoritative entitlement state;
- keyboard operation, focus visibility, semantic status/error output, and Axe
  checks;
- 320, 768, 1024, and 1440 pixel browser smoke without horizontal overflow.

The completion gate includes `npm ci`, `npm run check`, `npm run build:qa`,
`npm run build:prod`, the focused Playwright dashboard flow, and
`git diff --check`. Release or deployment commands are not executed.

## Scope

Included:

- integration of the completed ROZ-40 Web foundation into the ROZ-104 root;
- Core-backed dashboard summary and analytics;
- URL-stable period selection;
- permission-, feature-, billing-, and quota-aware navigation/actions;
- responsive, accessible loading, empty, success, and error states;
- contract, component, route, tenant-boundary, and browser tests;
- parity evidence updates for the canonical tenant-scoped route.

Excluded:

- Admin UI or static OTP work;
- nginx-gateway, same-origin routing, CORS, or Cloudflare changes;
- Core or Identity implementation changes;
- new backend permissions or API endpoints;
- implementation of cars, intake, parts, orders, customers, cash, team,
  stickers, reports, profile, or billing features beyond the already completed
  ROZ-40 foundation;
- deployment, production access changes, or release promotion.

## Delivery

All work remains in the existing worktree
`/Users/user/Code/rozbirka/rozbirka.web/.worktrees/roz-104-web-parity` on branch
`vsobol/roz-104-frontend-rozbirkaweb-primary`. ROZ-106 is a child of ROZ-104 and
does not receive an independent branch or PR. The root remains release-blocked
by ROZ-102 and ROZ-103 even though ROZ-106 can be implemented and reviewed
against their versioned contracts.
