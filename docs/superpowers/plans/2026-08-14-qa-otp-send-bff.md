# QA OTP Send BFF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route OTP sending through the same-origin Worker BFF so Cloudflare Access cannot turn a blocked cross-origin request into a false browser success.

**Architecture:** Extend the existing session facade with `POST /session/otp/send`. The Worker forwards a narrowed `{ phone }` request to Identity, validates and narrows the success response, sanitizes allowlisted errors, and the browser auth API delegates to this facade. The deterministic upstream fixture records sends so E2E proves send and verify traverse the real Worker.

**Tech Stack:** TypeScript, Cloudflare Workers, Axios, Vitest, Playwright, Node HTTP fixture.

## Global Constraints

- Keep every OTP browser call same-origin.
- Return `Cache-Control: no-store` from the Worker facade.
- Never forward arbitrary Identity success fields, error messages, or details.
- Preserve only non-negative safe-integer `Retry-After` values.
- Do not add production test controls or modify Identity, Core, or mobile.

---

### Task 1: Worker OTP Send Boundary

**Files:**
- Modify: `worker/session.test.ts`
- Modify: `worker/session.ts`

**Interfaces:**
- Consumes: `handleSessionRequest(request: Request, env: SessionEnv): Promise<Response | null>`
- Produces: `POST /session/otp/send` returning `{ cooldownSeconds: number, retryAfterSeconds: number }`

- [ ] **Step 1: Write failing Worker tests**

Add tests that submit `{ phone: '+380501112233', ignored: 'secret' }` and assert the upstream request is exactly `POST https://identity.example/auth/phone` with `{ phone: '+380501112233' }`. Return upstream data with extra secret fields and assert the browser receives only:

```ts
{
  cooldownSeconds: 60,
  retryAfterSeconds: 300,
}
```

Add table tests for malformed success data and allowlisted `OTP_COOLDOWN` / `OTP_RATE_LIMITED` failures, including sanitized messages and validated `Retry-After`.

- [ ] **Step 2: Run RED**

Run: `npm test -- worker/session.test.ts`

Expected: FAIL because `/session/otp/send` is not in `SESSION_PATHS` and returns `null`.

- [ ] **Step 3: Implement the minimal Worker route**

Add the route, validate a non-empty string `phone`, forward only that field, and validate the upstream DTO with a helper shaped as:

```ts
interface SendBrowserDto {
  cooldownSeconds: number
  retryAfterSeconds: number
}

function sendBrowserData(data: unknown): SendBrowserDto | null
```

Use the existing bounded JSON parsing, `identityFailure`, `safeRetryAfter`, and sanitized problem response patterns. Use a send-specific fixed message and allowlist only `OTP_COOLDOWN` and `OTP_RATE_LIMITED`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- worker/session.test.ts`

Expected: all Worker session tests pass.

---

### Task 2: Browser Session Facade

**Files:**
- Modify: `src/api/session.test.ts`
- Modify: `src/api/session.ts`
- Modify: `src/api/auth.test.ts`
- Modify: `src/api/auth.ts`

**Interfaces:**
- Consumes: `SendOtpRequest` and `SendOtpResponse` from `src/api/types.ts`
- Produces: `sessionApi.send(req: SendOtpRequest): Promise<SendOtpResponse>`

- [ ] **Step 1: Write failing facade tests**

Assert `sessionApi.send({ phone })` posts to `/session/otp/send`, returns only the two numeric cooldown fields, and normalizes facade failures. Assert `authApi.otpSend` delegates to `sessionApi.send` and does not call `identityClient`.

- [ ] **Step 2: Run RED**

Run: `npm test -- src/api/session.test.ts src/api/auth.test.ts`

Expected: FAIL because `sessionApi.send` does not exist and `authApi.otpSend` still uses the cross-origin client.

- [ ] **Step 3: Implement minimal facade delegation**

Add:

```ts
async send(req: SendOtpRequest): Promise<SendOtpResponse> {
  const response = await client.post<SendOtpResponse>('/session/otp/send', req)
  return {
    cooldownSeconds: response.data.cooldownSeconds,
    retryAfterSeconds: response.data.retryAfterSeconds,
  }
}
```

Wrap errors through the existing normalized `problemError` boundary and change `authApi.otpSend` to return `sessionApi.send(req)`.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/api/session.test.ts src/api/auth.test.ts`

Expected: all facade tests pass.

---

### Task 3: Real Worker E2E Regression

**Files:**
- Modify: `scripts/auth-e2e-upstream.mjs`
- Modify: `e2e/auth-session.spec.ts`

**Interfaces:**
- Consumes: fixture `POST /auth/phone` and `GET /_test/stats`
- Produces: `sendRequests` counter proving Worker-to-Identity delivery

- [ ] **Step 1: Write the failing E2E contract**

Extend fixture stats with `sendRequests`. Add a real `/auth/phone` fixture response with bounded cooldown data plus an extra upstream secret. Stop intercepting `/auth/phone` in `installApiBoundary`. In the login security test, capture same-origin `POST /session/otp/send`, assert its narrowed JSON response, and assert `sendRequests === 1` before verification.

- [ ] **Step 2: Run RED on the integrated path**

Run: `npm run test:e2e -- --project=chromium e2e/auth-session.spec.ts`

Expected: FAIL because the browser still requests `/auth/phone` or the fixture has not observed `/session/otp/send` through the Worker.

- [ ] **Step 3: Complete fixture support and GREEN**

Implement only the fixture behavior required for the real send route, then rerun:

`npm run test:e2e -- --project=chromium e2e/auth-session.spec.ts`

Expected: all Chromium auth-session scenarios pass and stats report one send plus one verify for login.

---

### Task 4: Verification and Delivery

**Files:**
- Modify: `.superpowers/sdd/2026-08-13-roz-39-auth-session-api-foundation/task-10-report.md` if present and tracked policy permits

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: reviewed commit on PR #16

- [ ] **Step 1: Run affected and full verification**

Run:

```bash
npm test -- worker/session.test.ts src/api/session.test.ts src/api/auth.test.ts
npm run check
npm run build:qa
npx wrangler deploy --dry-run --env qa
npm run test:e2e -- --project=chromium e2e/auth-session.spec.ts
npm run test:e2e -- --grep @auth-smoke
git diff --check
```

- [ ] **Step 2: Self-review the full diff**

Verify the response allowlist, same-origin routing, error sanitization, absence of credential leakage, no unrelated changes, and a clean worktree apart from intended files.

- [ ] **Step 3: Commit and push**

Stage only the changed Worker, API, fixture, E2E, and test files. Commit with:

```bash
git commit -m "fix(web): send OTP through session BFF"
git push
```

- [ ] **Step 4: Validate the GitHub runner**

Trigger `deploy-rozbirka-web.yml` for the feature branch with `environment=qa` and `enable_deployment=false`, then wait for a successful build job before reporting completion.
