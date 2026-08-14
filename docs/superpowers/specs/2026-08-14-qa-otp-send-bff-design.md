# QA OTP Send BFF Design

## Problem

The login screen sends `POST /auth/phone` directly to the cross-origin QA API,
while OTP verification uses the same-origin Worker session facade. Cloudflare
Access intercepts the direct browser request and returns its HTML login page with
status 200. The client treats that response as a successful OTP send and advances
to verification even though Identity never stored an OTP. Verification then
correctly returns `OTP_INVALID`.

QA Cloud Run request logs confirmed the boundary failure: repeated
`POST /auth/verify` requests reached Identity, but no corresponding
`POST /auth/phone` request did.

## Chosen Design

Add `POST /session/otp/send` to the existing same-origin Worker session facade.
The Worker will validate that the browser payload is a JSON object, forward only
the `phone` field to `${IDENTITY_ORIGIN}/auth/phone`, and return a bounded browser
DTO containing only `cooldownSeconds` and `retryAfterSeconds`.

The browser auth API will call `/session/otp/send` instead of the cross-origin
Identity client. OTP verification remains on `/session/otp/verify`; both halves
of the login flow therefore cross the same trusted BFF boundary.

## Error and Security Boundary

- Keep same-origin, POST-only, and `Cache-Control: no-store` behavior.
- Reject malformed browser payloads with `INVALID_REQUEST`.
- Never forward arbitrary upstream success fields.
- Allowlist non-sensitive send errors used by the UI, including cooldown and
  rate limiting; never forward upstream messages or details.
- Preserve a valid integer `Retry-After` header and collapse malformed or unknown
  upstream failures to `IDENTITY_REQUEST_FAILED`.
- Do not expose credentials or add production-only test controls.

## Verification

TDD coverage will prove:

1. the Worker routes `/session/otp/send` to `/auth/phone` with the expected body;
2. success responses are strictly narrowed;
3. safe cooldown/rate-limit failures remain actionable without leaking details;
4. the frontend uses the same-origin session facade;
5. E2E send followed by verify reaches the upstream fixture and completes login;
6. the full unit, type, lint, format, build, Worker dry-run, and auth E2E gates pass.

## Scope

This is a `rozbirka.web` change only. Identity, Core, and mobile behavior remain
unchanged.
