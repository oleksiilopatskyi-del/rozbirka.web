# ROZ-39 Auth, Session, and API Foundation Design

## Goal

Build the web authentication and transport foundation required by the Rozbirka
cabinet without exposing access or refresh credentials to persistent browser
storage. The result must support the existing OTP flow, recover a session after
reload, serialize concurrent refresh attempts, resume approved post-login
destinations, and give later ERP modules consistent API contracts.

## Current State

The web application already has OTP login, an `AuthProvider`, Axios clients,
tenant selection, basic error normalization, and a Cloudflare Worker that serves
the application shell. Both the access token and refresh token are currently
stored in `localStorage`. That violates ROZ-39 and makes credentials available to
any JavaScript running in the origin.

The Core and Identity repositories do not currently publish deterministic,
versioned OpenAPI artifacts. ROZ-59 owns that backend gap and blocks the final
generated-client acceptance criterion. ROZ-39 will create the frontend contract
boundary and generation gate, but the issue cannot be marked complete until the
artifacts exist and the gate runs against them.

## Chosen Approach

Use the existing Cloudflare Worker as a narrow session BFF. The Worker owns the
refresh token in an HttpOnly cookie, while the browser keeps the access token in
memory only. Core API traffic remains browser-to-gateway; only Identity session
operations pass through the BFF.

This approach is preferred over proxying every API operation because it removes
persistent credentials without expanding ROZ-39 into a general API gateway. It
is preferred over waiting for backend cookie sessions because the existing
Identity token endpoints remain usable without backend behavior changes.

## Session BFF

The Worker exposes same-origin session endpoints under `/session`:

- `POST /session/otp/verify` forwards the verified phone, OTP, and registration
  flag to Identity. It stores the returned refresh token in the session cookie
  and returns only the access token, user, and `isNewUser` to the browser.
- `POST /session/refresh` reads the refresh cookie, calls Identity refresh,
  rotates the cookie, and returns only the new access token.
- `POST /session/logout` calls Identity logout when a cookie exists and always
  expires the browser cookie.

OTP send does not exchange credentials and continues to use the normal Identity
API. Name update and authenticated resource calls continue to use the in-memory
Bearer access token.

The refresh cookie uses `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/session`,
and a bounded `Max-Age` matching the Identity refresh-token lifetime. Local
Worker development may omit `Secure` only for loopback HTTP. Session mutations
reject requests whose `Origin` is not the current request origin; missing Origin
is accepted only for same-origin navigation-compatible test and server clients.
Responses use `Cache-Control: no-store` and never include refresh tokens.

The Worker obtains the Identity origin from environment configuration. It does
not log request bodies, Authorization headers, cookies, upstream token payloads,
or upstream error bodies.

## Browser Session State

Replace the persistent token module with two focused stores:

- A memory credential store holds the access token and emits a single cleared
  event for an authentication transition.
- Tenant preference remains in `localStorage` because a tenant identifier is a
  UI preference, not an authentication credential.

On application startup, `AuthProvider` calls `/session/refresh`. A successful
response places the access token in memory and then loads `/auth/me` and the
tenant list. A missing or expired refresh session produces the guest state
without treating the expected 401 as a visible application error.

Logout calls `/session/logout`, clears the memory credential and tenant
preference, and transitions to guest even when the upstream logout request
fails. The state transition is idempotent so refresh failure and a concurrent
request failure cannot produce repeated clear notifications.

## Request Refresh Semantics

Authenticated Identity and Core clients share one refresh coordinator. When
requests receive 401 responses, the first request starts `/session/refresh` and
all concurrent requests await the same promise. After success, each original
request is replayed once with the new access token.

Each request carries an internal retry marker. A replayed 401, an error from the
session endpoints, or a request without replayable configuration is never
refreshed again. Failed refresh clears authentication once, rejects every
waiting request with the normalized session-expired error, and records the
current approved internal destination for a future login.

## Safe Post-Login Destinations

Post-login navigation uses a single parser instead of reading arbitrary URLs.
It accepts only absolute-path destinations beginning with one slash and matching
an approved cabinet route family. It rejects schemes, protocol-relative values,
backslashes, encoded control characters, and unknown paths.

The parser understands these intents:

- selected billing plan;
- invitation code and its intended acceptance route;
- scan intent for a QR, VIN, or OEM workflow;
- the current authenticated cabinet path when a session expires.

If more than one intent exists, invitation takes precedence over scan, scan over
plan selection, and plan selection over the default cabinet route. Raw tokens
or codes are preserved only in the URL needed to resume the approved action and
are never copied into persistent storage.

## Shared API Contracts

The transport boundary exports these concepts for later modules:

- `ApiProblem` with `kind`, optional backend `code`, user-safe `message`, HTTP
  `status`, optional `fieldErrors`, and optional `retryAfterSeconds`;
- `Page<T>` with `items`, `page`, `pageSize`, `total`, and `totalPages`;
- request cancellation through the standard `AbortSignal`;
- an explicit idempotent-mutation option that adds a caller-provided or generated
  `Idempotency-Key` only to operations marked idempotent.

Error normalization covers nested middleware errors, flat permission/tenant
errors, validation dictionaries, network failures, timeouts, cancellation, and
expired sessions. Cancellation is distinguishable from failure and does not
surface a user-facing network message.

The handwritten feature adapters consume narrow facade types rather than raw
Axios response shapes. Once ROZ-59 publishes Core and Identity artifacts, an
OpenAPI generation command produces DTO and operation types in a generated-only
directory. A drift check regenerates into a temporary directory and fails when
committed generated output differs. Generated files are never hand-edited.

## Login Experience

The existing phone, OTP, optional-name, and success steps remain. Each step has
explicit idle, submitting, validation-error, network-error, cooldown, and
expired-code behavior. Resend uses the backend retry/cooldown values and cannot
start overlapping requests. A successful verification hydrates the authenticated
state before navigation so protected routes do not flash the guest screen.

## Testing Strategy

Focused tests cover:

- Worker cookie flags, refresh rotation, logout expiry, no-store responses,
  origin rejection, upstream failure mapping, and absence of refresh tokens in
  response bodies;
- memory credential lifetime and idempotent clear notifications;
- session bootstrap after reload and guest behavior for an absent session;
- concurrent 401 responses producing exactly one refresh and one replay per
  request;
- failed refresh producing one auth reset and no retry loop;
- safe destination acceptance, precedence, and open-redirect rejection;
- error normalization, pagination typing, AbortSignal cancellation, and
  idempotency header behavior;
- login loading, validation, cooldown, network, and expired-session states;
- Playwright flows for OTP success, reload restoration, expired refresh, logout,
  invitation resume, and scan resume.

The standard `npm run check`, production build, and focused Playwright suite must
pass. The OpenAPI drift gate is required for final ROZ-39 completion once ROZ-59
delivers both versioned artifacts.

## Scope

Included:

- session BFF endpoints and security policy;
- browser memory credentials and session bootstrap;
- OTP verify/resend integration and optional new-user name flow;
- logout and single-flight refresh;
- safe plan, invitation, scan, and expired-session return destinations;
- shared error, pagination, cancellation, and idempotency contracts;
- OpenAPI generation/drift tooling prepared for versioned contracts;
- focused unit, Worker, integration, and Playwright tests.

Excluded:

- cabinet shell, tenant isolation, RBAC, and plan gates owned by ROZ-40;
- ERP feature screens and data adapters beyond the shared foundation;
- backend OpenAPI publication owned by ROZ-59;
- full Core API proxying through the Worker;
- cross-tab synchronization of access tokens;
- backend authentication or token-lifetime changes.

## Delivery and Status

Work is isolated on branch
`vsobol/roz-39-web-authsession-generated-api-client-i-spilni-error`, based on
`origin/develop`, in the ROZ-39 worktree.

The frontend portion may reach review with the OpenAPI generation hook present,
but ROZ-39 remains in progress and blocked by ROZ-59 until deterministic Core
and Identity artifacts are available, generated output is committed, and the
drift gate passes.
