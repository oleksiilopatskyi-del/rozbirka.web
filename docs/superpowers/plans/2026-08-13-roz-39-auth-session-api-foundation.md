# ROZ-39 Auth, Session, and API Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persistent browser credentials with a Cloudflare Worker session BFF, provide reliable single-flight session refresh, preserve safe post-login intents, and establish reusable API contracts for subsequent cabinet modules.

**Architecture:** Identity verify, refresh, and logout pass through same-origin `/session/*` Worker routes so the refresh token exists only in an HttpOnly cookie. The browser keeps the access token in a module-scoped memory store, calls Core and authenticated Identity endpoints directly, and coordinates all 401 recovery through one refresh promise. Handwritten API facades remain behind stable shared types until ROZ-59 supplies versioned OpenAPI inputs.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Axios 1, Cloudflare Workers, Vitest, Testing Library, Playwright, openapi-typescript 7.

## Global Constraints

- Never store an access token or refresh token in `localStorage`, `sessionStorage`, IndexedDB, or a JavaScript-readable cookie.
- Store refresh credentials only in a `HttpOnly; Secure; SameSite=Strict; Path=/session` cookie; omit `Secure` only for loopback HTTP development.
- Keep the browser access token in module memory only and restore it after reload through `POST /session/refresh`.
- Session mutation responses use `Cache-Control: no-store` and never return a refresh token.
- Core API requests remain browser-to-gateway; ROZ-39 does not become a general reverse proxy.
- Retry each failed request at most once and run at most one refresh request for concurrent 401 responses.
- Accept only allowlisted internal post-login paths; reject schemes, protocol-relative paths, backslashes, controls, and unknown routes.
- Preserve tenant ID in `localStorage` only as a non-secret preference.
- Do not mark ROZ-39 complete until ROZ-59 provides versioned Core and Identity OpenAPI artifacts and the generated-contract drift check passes.
- Implement every production behavior with a RED → GREEN → REFACTOR cycle.

---

## File Structure

- `src/api/contracts.ts` — shared `ApiProblem`, `Page<T>`, cancellation, and idempotency request types.
- `src/api/errors.ts` — pure transport-error normalization.
- `src/api/credentials.ts` — in-memory access token and idempotent clear subscriptions.
- `src/api/tenant-preference.ts` — tenant ID persistence without credentials.
- `src/api/session.ts` — browser facade for the Worker session endpoints.
- `src/api/refresh-coordinator.ts` — dependency-injected single-flight refresh and one-shot replay logic.
- `src/api/client.ts` — configured Axios instances wired to the new stores and coordinator.
- `src/api/auth.ts` — OTP/name/profile facade without refresh-token handling.
- `src/auth/AuthContext.tsx` — session bootstrap and authenticated React state.
- `src/auth/post-login.ts` — safe destination parsing and intent precedence.
- `src/screens/login.tsx` — existing OTP UI wired to normalized errors and safe destinations.
- `src/screens/invite.tsx` and `src/api/invitations.ts` — resumable invitation flow.
- `worker/session.ts` — cookie policy, Origin validation, Identity calls, and sanitized responses.
- `worker/router.ts` — dispatch `/session/*` before static/SPA routing and serve invite/scan deep links.
- `scripts/generate-api-contracts.mjs` — explicit OpenAPI generation entry point for ROZ-59 artifacts.
- `scripts/check-api-contracts.mjs` — deterministic generated-output drift gate.
- `src/api/generated/README.md` — generated-only ownership boundary until artifacts arrive.
- Focused `*.test.ts(x)` files live beside each unit; `e2e/auth-session.spec.ts` covers browser flows.

---

### Task 1: Shared API Contracts and Error Normalization

**Files:**
- Create: `src/api/contracts.ts`
- Create: `src/api/errors.ts`
- Test: `src/api/errors.test.ts`

**Interfaces:**
- Produces: `ApiProblem`, `Page<T>`, `IdempotentMutation`, `RequestOptions`, `normalizeApiProblem(error: unknown): ApiProblem`.
- Consumes: Axios error metadata only; no client singleton or React state.

- [ ] **Step 1: Write failing behavior tests for every supported error family**

```ts
// src/api/errors.test.ts
import axios, { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'
import { normalizeApiProblem } from './errors'

function axiosFailure(status: number, data: unknown, headers = {}) {
  return new AxiosError(
    'request failed',
    'ERR_BAD_RESPONSE',
    { headers: new AxiosHeaders(), method: 'get', url: '/resource' },
    undefined,
    { status, statusText: 'Error', headers, config: { headers: new AxiosHeaders() }, data },
  )
}

describe('normalizeApiProblem', () => {
  it('normalizes nested middleware errors', () => {
    expect(normalizeApiProblem(axiosFailure(422, {
      error: { code: 'INVALID', message: 'Invalid request' },
    }))).toMatchObject({ kind: 'validation', status: 422, code: 'INVALID', message: 'Invalid request' })
  })

  it('normalizes flat permission errors and validation dictionaries', () => {
    expect(normalizeApiProblem(axiosFailure(403, {
      error: 'FORBIDDEN', message: 'Denied', errors: { name: ['Required'] },
    }))).toMatchObject({
      kind: 'forbidden', code: 'FORBIDDEN', fieldErrors: { name: ['Required'] },
    })
  })

  it('reads retry-after and marks an expired session', () => {
    expect(normalizeApiProblem(axiosFailure(401, {}, { 'retry-after': '30' })))
      .toMatchObject({ kind: 'session-expired', retryAfterSeconds: 30 })
  })

  it('distinguishes cancellation, timeout, and offline failures', () => {
    expect(normalizeApiProblem(new axios.CanceledError())).toMatchObject({ kind: 'cancelled' })
    expect(normalizeApiProblem(new AxiosError('timeout', 'ECONNABORTED'))).toMatchObject({ kind: 'timeout' })
    expect(normalizeApiProblem(new AxiosError('network', 'ERR_NETWORK'))).toMatchObject({ kind: 'network' })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/api/errors.test.ts`

Expected: FAIL because `./errors` and its exports do not exist.

- [ ] **Step 3: Add minimal stable contracts and the pure normalizer**

```ts
// src/api/contracts.ts
export type ApiProblemKind =
  | 'cancelled'
  | 'network'
  | 'timeout'
  | 'session-expired'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'server'
  | 'unknown'

export interface ApiProblem {
  kind: ApiProblemKind
  code?: string
  message: string
  status?: number
  fieldErrors?: Record<string, string[]>
  retryAfterSeconds?: number
  cause?: unknown
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface IdempotentMutation {
  idempotencyKey?: string
}

export interface RequestOptions {
  signal?: AbortSignal
}
```

Implement `normalizeApiProblem` as a pure function. Map 401/403/404/409/422/5xx to their named kinds; use safe Ukrainian fallback messages; copy backend strings only from known `message` fields; parse `retry-after` only when it is a non-negative integer; attach the original value as `cause` without logging it.

- [ ] **Step 4: Run focused and existing API tests**

Run: `npm test -- src/api/errors.test.ts src/api/billing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the slice**

```bash
git add -- src/api/contracts.ts src/api/errors.ts src/api/errors.test.ts
git commit -m "feat(web): normalize shared API problems"
```

---

### Task 2: Memory Credentials, Tenant Preference, and Safe Destinations

**Files:**
- Create: `src/api/credentials.ts`
- Create: `src/api/credentials.test.ts`
- Create: `src/api/tenant-preference.ts`
- Create: `src/auth/post-login.ts`
- Create: `src/auth/post-login.test.ts`
- Modify: `src/lib/plan-selection.ts`
- Modify: `src/lib/plan-selection.test.ts`

**Interfaces:**
- Produces: `credentials.getAccess()`, `credentials.setAccess(token)`, `credentials.clear()`, `credentials.onCleared(listener)`.
- Produces: `tenantPreference.get()`, `.set(id)`, `.clear()`.
- Produces: `resolvePostLoginDestination(search, fallback): string` and `isSafeCabinetPath(value): boolean`.
- Consumes: the existing plan-code helpers.

- [ ] **Step 1: Write failing tests proving credentials never touch Web Storage**

```ts
// src/api/credentials.test.ts
import { beforeEach, expect, it, vi } from 'vitest'
import { credentials } from './credentials'

beforeEach(() => credentials.clear())

it('keeps the access token in module memory only', () => {
  const localSet = vi.spyOn(Storage.prototype, 'setItem')
  const sessionSet = vi.spyOn(sessionStorage, 'setItem')
  credentials.setAccess('access-token')
  expect(credentials.getAccess()).toBe('access-token')
  expect(localSet).not.toHaveBeenCalled()
  expect(sessionSet).not.toHaveBeenCalled()
})

it('notifies subscribers once per authenticated-to-cleared transition', () => {
  const listener = vi.fn()
  credentials.onCleared(listener)
  credentials.setAccess('one')
  credentials.clear()
  credentials.clear()
  expect(listener).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Write failing safe-destination and precedence tests**

```ts
// src/auth/post-login.test.ts
import { describe, expect, it } from 'vitest'
import { isSafeCabinetPath, resolvePostLoginDestination } from './post-login'

describe('safe post-login destinations', () => {
  it.each([
    'https://evil.example/x', '//evil.example/x', '/\\evil', '/%0aevil',
    '/privacy', '/unknown',
  ])('rejects %s', (value) => expect(isSafeCabinetPath(value)).toBe(false))

  it.each(['/account', '/account?section=plans&plan=pro_monthly', '/invite/ABCD1234', '/scan/QR-123'])
    ('accepts %s', (value) => expect(isSafeCabinetPath(value)).toBe(true))

  it('prefers invite, then scan, then plan, then fallback', () => {
    expect(resolvePostLoginDestination(
      '?plan=pro_monthly&scan=QR-1&invite=ABCD1234', '/account',
    )).toBe('/invite/ABCD1234')
    expect(resolvePostLoginDestination('?plan=pro_monthly&scan=QR-1', '/account'))
      .toBe('/scan/QR-1')
    expect(resolvePostLoginDestination('?plan=pro_monthly', '/account'))
      .toBe('/account?section=plans&plan=pro_monthly')
  })
})
```

- [ ] **Step 3: Run both new test files and verify RED**

Run: `npm test -- src/api/credentials.test.ts src/auth/post-login.test.ts`

Expected: FAIL because the new modules do not exist.

- [ ] **Step 4: Implement the stores and parser minimally**

Use one module-scoped `let accessToken: string | null`. Emit clear only when the prior value was non-null. Keep tenant ID under `rozbirka.tenantId`. The destination allowlist is exactly:

```ts
const SAFE_PATHS = [
  /^\/account(?:[/?#]|$)/,
  /^\/invite\/[A-Za-z0-9_-]{4,128}(?:[?#]|$)/,
  /^\/scan\/[A-Za-z0-9._~-]{1,256}(?:[?#]|$)/,
  /^\/app\/[A-Za-z0-9_-]+(?:[/?#]|$)/,
]
```

Decode once only for control/backslash checks, construct invitation/scan paths with `encodeURIComponent`, and return `/account` when the fallback is unsafe. Make `postAuthPath` delegate to `resolvePostLoginDestination` so existing callers stay compatible.

- [ ] **Step 5: Run store, destination, and existing guard tests**

Run: `npm test -- src/api/credentials.test.ts src/auth/post-login.test.ts src/lib/plan-selection.test.ts src/auth/guards.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the slice**

```bash
git add -- src/api/credentials.ts src/api/credentials.test.ts src/api/tenant-preference.ts src/auth/post-login.ts src/auth/post-login.test.ts src/lib/plan-selection.ts src/lib/plan-selection.test.ts
git commit -m "feat(web): keep credentials in memory and validate returns"
```

---

### Task 3: Cloudflare Worker Session BFF

**Files:**
- Create: `worker/session.ts`
- Create: `worker/session.test.ts`
- Modify: `worker/router.ts`
- Modify: `worker/router.test.ts`
- Modify: `worker/index.ts`
- Modify: `wrangler.jsonc`
- Regenerate: `worker-configuration.d.ts`

**Interfaces:**
- Produces: `handleSessionRequest(request: Request, env: SessionEnv): Promise<Response | null>`.
- Produces routes: `POST /session/otp/verify`, `POST /session/refresh`, `POST /session/logout`.
- Consumes: `env.IDENTITY_ORIGIN` with no trailing slash.

- [ ] **Step 1: Write failing Worker tests for verify and cookie secrecy**

```ts
// worker/session.test.ts
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleSessionRequest } from './session'

const env = { IDENTITY_ORIGIN: 'https://identity.example' }

describe('session BFF', () => {
  it('stores refresh in an HttpOnly cookie and returns no refresh credential', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: {
      accessToken: 'access', refreshToken: 'refresh-secret',
      user: { id: 'u1', phone: '+380501112233', displayName: 'Vlad' },
      isNewUser: false,
    } })))
    const response = await handleSessionRequest(new Request(
      'https://rozbirka.pro/session/otp/verify', {
        method: 'POST', headers: { origin: 'https://rozbirka.pro', 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+380501112233', code: '123456' }),
      }), env)
    const text = await response!.text()
    expect(response!.headers.get('set-cookie')).toMatch(
      /^rozbirka_refresh=.*HttpOnly.*Secure.*SameSite=Strict.*Path=\/session/i,
    )
    expect(response!.headers.get('cache-control')).toBe('no-store')
    expect(text).not.toContain('refresh-secret')
  })
})
```

- [ ] **Step 2: Add failing cases for refresh rotation, logout, Origin, and errors**

Test all of the following in `worker/session.test.ts`:

```ts
it('rotates the refresh cookie and returns only the access token')
it('expires the cookie even when upstream logout fails')
it('rejects a mismatched Origin before calling upstream')
it('returns 401 without calling upstream when refresh cookie is absent')
it('passes Authorization access token to the protected logout endpoint')
it('maps upstream errors without exposing the upstream body')
it('omits Secure only for localhost or 127.0.0.1 over HTTP')
it('returns 405 with Allow: POST for other methods')
```

- [ ] **Step 3: Run the Worker session tests and verify RED**

Run: `npm test -- worker/session.test.ts`

Expected: FAIL because `worker/session.ts` does not exist.

- [ ] **Step 4: Implement the minimal session handler**

Use constants:

```ts
const COOKIE_NAME = 'rozbirka_refresh'
const REFRESH_MAX_AGE = 90 * 24 * 60 * 60
const SESSION_PATHS = new Set([
  '/session/otp/verify', '/session/refresh', '/session/logout',
])
```

For verify, forward to `${IDENTITY_ORIGIN}/auth/verify` with `{ allowRegistration: true, ...body }`. For refresh, read the cookie and forward `{ refreshToken }`. For logout, forward `{ refreshToken }` with `Authorization` copied from the browser request because Identity logout is protected. Unwrap `{ data: T }`, destructure refresh tokens away from browser payloads, sanitize all upstream failures to `{ error: { code, message } }`, and always return `Cache-Control: no-store`.

Origin validation rules:

```ts
const origin = request.headers.get('origin')
if (origin && origin !== new URL(request.url).origin) return jsonProblem(403, 'INVALID_ORIGIN')
```

- [ ] **Step 5: Route session requests before static assets**

Change `EdgeEnv` to include `IDENTITY_ORIGIN: string`, call `handleSessionRequest` at the start of `handleRequest`, and return its response when non-null. Configure:

```jsonc
"vars": { "IDENTITY_ORIGIN": "https://qaapi.rozbirka.pro" },
"env": {
  "qa": { "name": "qa-rozbirka-pro-web", "vars": { "IDENTITY_ORIGIN": "https://qaapi.rozbirka.pro" } },
  "production": { "name": "rozbirka-pro-web", "vars": { "IDENTITY_ORIGIN": "https://api.rozbirka.pro" } }
}
```

Update Worker test env factories with the Identity origin.

- [ ] **Step 6: Run Worker tests and regenerate Worker types**

Run: `npm test -- worker/session.test.ts worker/router.test.ts`

Expected: PASS.

Run: `npx wrangler types`

Expected: exit 0 and `Env` includes `IDENTITY_ORIGIN: "https://qaapi.rozbirka.pro"` or `string`.

- [ ] **Step 7: Commit the BFF slice**

```bash
git add -- worker/session.ts worker/session.test.ts worker/router.ts worker/router.test.ts worker/index.ts wrangler.jsonc worker-configuration.d.ts
git commit -m "feat(web): add secure session BFF"
```

---

### Task 4: Browser Session Facade and Single-Flight Refresh Coordinator

**Files:**
- Create: `src/api/session.ts`
- Create: `src/api/session.test.ts`
- Create: `src/api/refresh-coordinator.ts`
- Create: `src/api/refresh-coordinator.test.ts`
- Modify: `src/api/types.ts`

**Interfaces:**
- Produces: `sessionApi.verify(req): Promise<SessionVerifyResponse>`, `.refresh(): Promise<SessionRefreshResponse>`, `.logout(): Promise<void>`.
- Produces: `createRefreshCoordinator({ refresh, setAccess, clearAccess, replay })` with `recover(error): Promise<unknown>`.
- Consumes: `normalizeApiProblem` and `credentials`.

- [ ] **Step 1: Write failing session-facade tests**

Use an injected Axios instance factory so tests can use a custom adapter without network calls:

```ts
it('posts verify to the same-origin session route and stores only access in memory')
it('uses credentials: include semantics through withCredentials')
it('maps an absent refresh cookie to session-expired')
it('logout clears access even when the request fails')
```

The expected response types are:

```ts
export interface SessionVerifyResponse {
  accessToken: string
  user: VerifyUser
  isNewUser: boolean
}
export interface SessionRefreshResponse {
  accessToken: string
  expiresIn: number
}
```

No frontend response type may contain `refreshToken`.

- [ ] **Step 2: Write the concurrent 401 RED test against a dependency-injected coordinator**

```ts
// src/api/refresh-coordinator.test.ts
it('shares one refresh and replays every concurrent request once', async () => {
  let release!: (token: string) => void
  const refresh = vi.fn(() => new Promise<string>((resolve) => { release = resolve }))
  const replay = vi.fn(async (request: { retried?: boolean }) => request)
  const coordinator = createRefreshCoordinator({
    refresh, setAccess: vi.fn(), clearAccess: vi.fn(), replay,
  })
  const first = coordinator.recover(unauthorized('/cars'))
  const second = coordinator.recover(unauthorized('/orders'))
  expect(refresh).toHaveBeenCalledTimes(1)
  release('fresh')
  await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  expect(replay).toHaveBeenCalledTimes(2)
})
```

Add cases for a retried request, session endpoint, missing config, refresh rejection, and idempotent `clearAccess`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- src/api/session.test.ts src/api/refresh-coordinator.test.ts`

Expected: FAIL because both modules are absent.

- [ ] **Step 4: Implement minimal facades and coordinator**

Use a dedicated same-origin Axios instance with `baseURL: ''`, `withCredentials: true`, `timeout: 15000`, and no authenticated-client interceptors. `verify` and `refresh` write only `credentials.setAccess(payload.accessToken)`. `logout` calls the Worker with the current access Authorization header and clears credentials in `finally`.

The coordinator may own exactly one `refreshPromise: Promise<string> | null`; clear it in `finally`. Mark request config with `_sessionRetry = true` before replay. On refresh failure, call `clearAccess()` once and reject using the normalized session-expired problem.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- src/api/session.test.ts src/api/refresh-coordinator.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the slice**

```bash
git add -- src/api/session.ts src/api/session.test.ts src/api/refresh-coordinator.ts src/api/refresh-coordinator.test.ts src/api/types.ts
git commit -m "feat(web): coordinate browser session refresh"
```

---

### Task 5: Wire Axios Clients to Shared Contracts

**Files:**
- Modify: `src/api/client.ts`
- Create: `src/api/client.test.ts`
- Modify: `src/api/auth.ts`
- Create: `src/api/auth.test.ts`
- Modify: `src/api/tenants.ts`
- Modify: `src/api/billing.ts`
- Modify: `src/api/billing.test.ts`
- Delete: `src/api/tokens.ts`

**Interfaces:**
- Produces: `identityClient`, `apiClient`, `publicApiClient`, and `withIdempotency(config, option)`.
- Consumes: `credentials`, `tenantPreference`, `sessionApi.refresh`, coordinator, `normalizeApiProblem`.

- [ ] **Step 1: Write failing client tests for headers, retry, cancellation, and idempotency**

Test using Axios custom adapters rather than mocking Axios methods:

```ts
it('attaches Bearer access from memory and tenant preference to Core requests')
it('never reads accessToken or refreshToken from localStorage')
it('replays concurrent Core and Identity 401 responses after one session refresh')
it('does not refresh public or session requests')
it('stamps normalized ApiProblem metadata on terminal failures')
it('passes AbortSignal to the adapter and preserves cancellation kind')
it('adds Idempotency-Key only when an idempotent mutation opts in')
```

Add an Axios module augmentation:

```ts
declare module 'axios' {
  interface AxiosRequestConfig {
    idempotency?: IdempotentMutation
  }
  interface InternalAxiosRequestConfig {
    _sessionRetry?: boolean
  }
  interface AxiosError {
    problem?: ApiProblem
  }
}
```

- [ ] **Step 2: Run the client tests and verify RED**

Run: `npm test -- src/api/client.test.ts src/api/auth.test.ts`

Expected: FAIL because current clients use persistent refresh tokens and lack the new options.

- [ ] **Step 3: Replace the current monolithic interceptor implementation**

Remove direct `/auth/refresh` calls and all refresh-token response types from `client.ts`. Read access from `credentials`, tenant from `tenantPreference`, install the shared coordinator on authenticated clients only, and replay through the owning Axios instance rather than global `axios.request` so `baseURL`, adapter, and interceptors are preserved.

Generate an idempotency UUID with `crypto.randomUUID()` only when `config.idempotency` is present and has no caller-provided key. Never attach the header to GET/HEAD/OPTIONS or unmarked mutations.

- [ ] **Step 4: Migrate API facades**

- `authApi.otpVerify` calls `sessionApi.verify`; it must not handle refresh tokens.
- `authApi.logout` delegates to `sessionApi.logout`.
- `authApi.updateName` consumes the backend `UpdateNameResponse`, places its returned access token in memory, and returns the updated user.
- `tenantsApi` uses `tenantPreference` and accepts optional `RequestOptions` where appropriate.
- Existing billing methods preserve behavior while accepting `signal` through request config.
- Delete `src/api/tokens.ts` after all production imports have moved to the two focused stores.

- [ ] **Step 5: Run all API tests**

Run: `npm test -- src/api/*.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the wired transport layer**

```bash
git add -- src/api/client.ts src/api/client.test.ts src/api/auth.ts src/api/auth.test.ts src/api/tenants.ts src/api/billing.ts src/api/billing.test.ts
git rm -- src/api/tokens.ts
git commit -m "feat(web): wire authenticated API refresh and request options"
```

---

### Task 6: Session-Aware AuthProvider and Login States

**Files:**
- Modify: `src/auth/AuthContext.tsx`
- Create: `src/auth/AuthContext.test.tsx`
- Modify: `src/auth/guards.tsx`
- Modify: `src/auth/guards.test.tsx`
- Modify: `src/screens/login.tsx`
- Modify: `src/screens/login.test.tsx`

**Interfaces:**
- Produces unchanged public `AuthContextValue` plus `hydrate(accessToken?: string): Promise<void>`.
- Consumes: `sessionApi`, `credentials`, `tenantPreference`, `authApi`, `tenantsApi`, `resolvePostLoginDestination`.

- [ ] **Step 1: Write failing AuthProvider bootstrap tests**

```tsx
it('restores a reload session through the HttpOnly-cookie refresh facade')
it('shows guest when refresh reports an absent or expired session')
it('loads me and tenants only after refresh succeeds')
it('chooses the stored tenant when membership still exists')
it('clears invalid tenant preference when the user has no matching tenant')
it('resets React auth state once when a mid-session refresh fails')
it('signs out locally even when Worker logout fails')
```

Render a small context probe inside `AuthProvider`; mock only the API boundary modules, never React internals.

- [ ] **Step 2: Extend login RED tests for acceptance states**

Add user-event-driven tests:

```tsx
it('disables OTP resend during backend cooldown and applies retryAfterSeconds')
it('does not start overlapping resend requests')
it('shows the mapped expired-code message')
it('shows a network fallback without leaking transport details')
it('hydrates before navigating after verify')
it('asks a new user for a name and stores the rotated access response')
it('rejects an external fallback and navigates to /account')
it('preserves invitation before scan and plan intents')
```

- [ ] **Step 3: Run focused Auth tests and verify RED**

Run: `npm test -- src/auth/AuthContext.test.tsx src/auth/guards.test.tsx src/screens/login.test.tsx`

Expected: FAIL against the current localStorage bootstrap and Axios-specific UI error extraction.

- [ ] **Step 4: Implement refresh-first bootstrap**

`bootstrap` calls `sessionApi.refresh()` when memory access is absent, then calls `authApi.me()` and `tenantsApi.list()`. Treat only `session-expired` as the expected guest bootstrap path; other failures still end in guest but remain available to observability later. Subscribe to credential clears and make `reset` idempotent.

`hydrate` skips refresh when verify already populated memory access, loads user/tenants, and resolves only after status is authenticated or guest.

- [ ] **Step 5: Update login to consume normalized problems**

Replace the local Axios envelope parser with `normalizeApiProblem`. Use `retryAfterSeconds` to extend cooldown. Track separate `sendingOtp`, `verifyingOtp`, `savingName`, and `resendingOtp` booleans so unrelated actions cannot overlap. Compute destination with `resolvePostLoginDestination(location.search, location.state?.from)`.

- [ ] **Step 6: Prove no credential persistence remains**

Run:

```bash
rg -n "refreshToken|accessToken|getRefresh|rozbirka\.accessToken|rozbirka\.refreshToken" src \
  --glob '!api/types.ts' --glob '!api/generated/**'
```

Expected matches are limited to in-memory response destructuring and type fields needed to consume backend/BFF payloads; no Web Storage access and no `src/api/tokens.ts` remain.

- [ ] **Step 7: Run Auth and login tests**

Run: `npm test -- src/auth/*.test.tsx src/screens/login.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the React auth slice**

```bash
git add -- src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx src/auth/guards.tsx src/auth/guards.test.tsx src/screens/login.tsx src/screens/login.test.tsx
git commit -m "feat(web): restore secure sessions in auth provider"
```

---

### Task 7: Resumable Invitation and Scan Deep Links

**Files:**
- Create: `src/api/invitations.ts`
- Create: `src/api/invitations.test.ts`
- Create: `src/screens/invite.tsx`
- Create: `src/screens/invite.test.tsx`
- Modify: `src/routes/routes.tsx`
- Modify: `src/routes/routes.test.tsx`
- Create: `src/screens/scan-resume.tsx`
- Create: `src/screens/scan-resume.test.tsx`
- Modify: `worker/router.ts`
- Modify: `worker/router.test.ts`

**Interfaces:**
- Produces: `invitationsApi.info(code, options?)`, `.accept(code)`.
- Produces React route `/invite/:code`.
- Preserves `/scan/:qrCode` as a protected post-login destination owned visually by ROZ-45.
- Consumes `RequireAuth`, `useAuth`, `publicApiClient` for invitation info,
  `apiClient` for invitation acceptance, and `tenantPreference`.

- [ ] **Step 1: Write failing invitation API and screen tests**

API DTOs:

```ts
export interface InvitationInfo {
  tenantName: string
  roleName: string
  createdByName: string
  expiresAt: string
  isValid: boolean
}
export interface AcceptInvitationResult {
  tenantId: string
  tenantName: string
  role: string
  permissions: string[]
}
```

Screen cases:

```tsx
it('shows invitation information before authentication')
it('links a guest to /login?invite=<encoded code>')
it('accepts for an authenticated named user and selects the returned tenant')
it('routes an authenticated unnamed user through /login?invite=<code> name step')
it.each(['expired', 'used', 'revoked', 'not-found'])('renders %s invitation state')
it('prevents overlapping accepts')
```

- [ ] **Step 2: Write failing route/Worker deep-link tests**

Assert React Router includes `/invite/:code`; the Worker serves `app.html` for `/invite/ABCD1234` and `/scan/QR-123`; both receive `X-Robots-Tag: noindex`. Do not add a scanner UI in this task.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm test -- src/api/invitations.test.ts src/screens/invite.test.tsx src/routes/routes.test.tsx worker/router.test.ts`

Expected: FAIL because the invitation facade/screen/routes do not exist.

- [ ] **Step 4: Implement the invitation flow and route boundaries**

Invitation info uses `publicApiClient`; acceptance uses authenticated
`apiClient`. After acceptance, set `tenantPreference` to the returned tenant,
call `auth.hydrate()`, and replace navigation with `/account`. Guest acceptance
links to `/login?invite=${encodeURIComponent(code)}`. The scan route is
registered as a lazy protected boundary that redirects unauthenticated users to
login while preserving its path; its actual scanner component is deferred to
ROZ-45.

`ScanResumeScreen` validates the route parameter again and replaces navigation
with `/account?scan=<encoded qrCode>`. This retains the authenticated handoff in
the URL without implementing the scanner owned by ROZ-45. The Worker `spaPaths`
gains anchored patterns for invite and scan. Both are always noindex.

- [ ] **Step 5: Run focused route and invitation tests**

Run: `npm test -- src/api/invitations.test.ts src/screens/invite.test.tsx src/screens/scan-resume.test.tsx src/routes/routes.test.tsx worker/router.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit resumable deep links**

```bash
git add -- src/api/invitations.ts src/api/invitations.test.ts src/screens/invite.tsx src/screens/invite.test.tsx src/screens/scan-resume.tsx src/screens/scan-resume.test.tsx src/routes/routes.tsx src/routes/routes.test.tsx worker/router.ts worker/router.test.ts
git commit -m "feat(web): resume invitation and scan login intents"
```

---

### Task 8: OpenAPI Generation Hook and Deferred Drift Gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/generate-api-contracts.mjs`
- Create: `scripts/check-api-contracts.mjs`
- Create: `scripts/api-contracts.test.ts`
- Create: `src/api/generated/README.md`
- Modify: `.prettierignore`

**Interfaces:**
- Produces commands `npm run contracts:generate -- --core <file-or-url> --identity <file-or-url>` and `npm run contracts:check -- --core <file-or-url> --identity <file-or-url>`.
- Consumes versioned OpenAPI artifacts supplied by ROZ-59; neither command silently downloads an unversioned runtime Swagger endpoint.

- [ ] **Step 1: Write failing CLI contract tests**

Test the scripts through `execFile`:

```ts
it('requires both explicit Core and Identity inputs')
it('rejects /swagger runtime URLs without an immutable version or digest')
it('generates core.ts and identity.ts into a temporary output directory')
it('fails drift check when committed output differs')
it('passes drift check when output is identical')
```

Use tiny OpenAPI 3 fixtures created inside `mkdtemp`; remove only the exact temporary directory in `afterEach`.

- [ ] **Step 2: Run the script tests and verify RED**

Run: `npm test -- scripts/api-contracts.test.ts`

Expected: FAIL because the scripts are absent.

- [ ] **Step 3: Install the pinned generator and implement explicit CLIs**

Run: `npm install --save-dev openapi-typescript@7.13.0`

Implement argument parsing without another dependency. Spawn the local `openapi-typescript` binary once per input. Generate deterministic headers containing the immutable input identifier but no current timestamp. `contracts:check` generates into `mkdtemp`, byte-compares `core.ts` and `identity.ts`, reports changed filenames, and cleans only its own temporary directory.

Package scripts:

```json
"contracts:generate": "node scripts/generate-api-contracts.mjs",
"contracts:check": "node scripts/check-api-contracts.mjs"
```

Do not append `contracts:check` to `npm run check` until ROZ-59 provides committed immutable input locations. Document this explicit blocker in `src/api/generated/README.md`.

- [ ] **Step 4: Run script tests and formatting**

Run: `npm test -- scripts/api-contracts.test.ts`

Expected: PASS.

Run: `npx prettier --check package.json scripts/generate-api-contracts.mjs scripts/check-api-contracts.mjs scripts/api-contracts.test.ts src/api/generated/README.md`

Expected: PASS.

- [ ] **Step 5: Commit the generation hook**

```bash
git add -- package.json package-lock.json scripts/generate-api-contracts.mjs scripts/check-api-contracts.mjs scripts/api-contracts.test.ts src/api/generated/README.md .prettierignore
git commit -m "build(web): prepare versioned OpenAPI generation gate"
```

---

### Task 9: Browser-Level Session Coverage

**Files:**
- Create: `e2e/auth-session.spec.ts`
- Create: `scripts/auth-e2e-upstream.mjs`
- Modify: `playwright.config.ts`
- Modify: `worker/session.ts` only if a test exposes an integration defect, after adding a focused regression test.

**Interfaces:**
- Consumes public session and auth UI behavior only.
- Uses Playwright route fulfillment as the Identity/Core boundary; never places refresh credentials into page JavaScript.

- [ ] **Step 1: Write the Playwright scenarios before changing production behavior**

Scenarios:

```ts
test('OTP login stores refresh only in HttpOnly cookie and no credentials in storage')
test('reload restores the account session through one refresh request')
test('parallel protected 401 responses trigger one refresh and successful replays')
test('expired refresh redirects to login and preserves a safe cabinet return')
test('logout expires the cookie and leaves the user as guest')
test('invitation resumes after OTP and optional name')
test('scan deep link resumes after OTP without accepting an external return URL')
```

Use `browserContext.cookies()` to assert `httpOnly`, `sameSite`, path, and secure flags. Use `page.evaluate` only to verify that local/session storage keys contain no `accessToken` or `refreshToken` strings.

- [ ] **Step 2: Run Chromium only and verify each new scenario initially fails for the missing fixture or behavior**

Run: `npx playwright test e2e/auth-session.spec.ts --project=chromium`

Expected: at least one RED failure before any integration correction. Confirm failures correspond to the scenario being added, not server startup.

- [ ] **Step 3: Add the minimum deterministic route fixtures**

Implement `scripts/auth-e2e-upstream.mjs` as a loopback-only HTTP server on
`127.0.0.1:4174`. It exposes only the Identity/Core endpoints used by these
scenarios, keeps refresh rotation in process memory, and has a deterministic
reset endpoint called from `test.beforeEach`. Configure Playwright `webServer`
as an array: start the upstream fixture first, then start Wrangler with
`--var IDENTITY_ORIGIN:http://127.0.0.1:4174`. Browser route fulfillment may
still provide direct Core responses, but Worker upstream behavior must be tested
through the real loopback server. Do not modify production code to expose test
controls.

- [ ] **Step 4: Run Chromium scenarios to GREEN**

Run: `npx playwright test e2e/auth-session.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 5: Run the focused cross-browser smoke cases**

Mark OTP login, reload restoration, expired refresh, and logout as the smoke subset using `@auth-smoke` in titles.

Run: `npx playwright test e2e/auth-session.spec.ts --grep @auth-smoke`

Expected: PASS in Chromium, Firefox, WebKit, Android, and iOS projects.

- [ ] **Step 6: Commit browser coverage**

```bash
git add -- e2e/auth-session.spec.ts scripts/auth-e2e-upstream.mjs playwright.config.ts worker/session.ts worker/session.test.ts
git commit -m "test(web): cover secure auth session journeys"
```

---

### Task 10: Final Verification and Linear Handoff

**Files:**
- Modify only files required by a reproduced verification failure, following a new RED test first.
- Update Linear ROZ-39 status/comment after code verification.

**Interfaces:**
- Consumes the complete ROZ-39 frontend implementation.
- Produces a review-ready branch while explicitly retaining the ROZ-59 blocker.

- [ ] **Step 1: Run the complete repository quality gate**

Run: `npm run check`

Expected: typecheck, lint, format check, and all Vitest suites PASS.

- [ ] **Step 2: Run production build and Worker validation**

Run: `npm run build:prod`

Expected: client build, SSR build, and prerender PASS.

Run: `npx wrangler deploy --dry-run --env production`

Expected: Worker bundle validates with `IDENTITY_ORIGIN` configured.

- [ ] **Step 3: Run auth E2E plus existing production browser coverage**

Run: `npx playwright test e2e/auth-session.spec.ts`

Expected: PASS for all configured projects.

Run: `npm run test:e2e`

Expected: full existing and new Playwright suite PASS.

- [ ] **Step 4: Prove credential-storage and refresh invariants by source audit**

Run:

```bash
rg -n "localStorage|sessionStorage|document\.cookie|refreshToken|accessToken" src worker \
  --glob '!api/generated/**'
```

Review every match. Expected:

- Web Storage appears only in tenant/UI preferences.
- `refreshToken` appears only inside the Worker upstream boundary and backend-shaped local variables that are destructured away.
- Browser modules never read/write refresh tokens.
- `document.cookie` is absent from browser source.

- [ ] **Step 5: Verify repository cleanliness and commit any final test-driven correction**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors and no uncommitted implementation files.

- [ ] **Step 6: Update Linear truthfully**

Move ROZ-39 to `In Progress` when implementation begins. After verification, add a comment containing:

- branch and worktree;
- implemented session/auth/API behaviors;
- exact verification commands and results;
- statement that generated OpenAPI output remains blocked by ROZ-59.

Leave ROZ-39 `In Progress` (or the team's blocked state if one exists), not Done, until ROZ-59 is complete and Task 8's drift gate runs against both immutable artifacts.

- [ ] **Step 7: Use the finishing workflow**

Invoke `superpowers:finishing-a-development-branch`, rerun its required fresh test gate, and present exactly its three integration options for base branch `develop`. Do not push, merge, create a PR, or clean the worktree without the user's explicit choice.
