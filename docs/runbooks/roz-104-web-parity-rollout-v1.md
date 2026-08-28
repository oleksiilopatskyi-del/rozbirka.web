# ROZ-104 Web Parity Rollout Runbook v1

Status: readiness artifact only. No QA deployment, canary, rollback rehearsal, Product sign-off, or QA sign-off is recorded by this document.

## Immutable release input

The operator starts only from an approved QA manifest based on `docs/releases/roz-104-web-parity-manifest.example.yaml`. Every release-required ROZ-104 root must have an exact commit and immutable artifact identifier. Production promotes the same QA-tested artifact; a rebuild returns the release to QA.

Required evidence before any rollout action:

- all release-required child tasks completed and the root integration PR merged;
- green lint, typecheck, unit, contract, integration, E2E, authenticated smoke, accessibility, performance, build, artifact, and Wrangler dry-run gates;
- exact web commit and immutable artifact ID;
- configuration and migration inventory (expected migrations: none for this web-only root);
- successful QA operator/pipeline deployment, health check, and smoke evidence;
- Product and QA parity sign-off recorded against the same artifact.
- green QA and production compatibility build guards with
  `allowMissingEnvelope:false`;
- complete backend fleet/version inventory proving envelope omission, null,
  and malformed counts are all zero across every authenticated tenant in a
  continuous 24-hour observation window.

## Versioned flag contract

The authenticated, tenant-scoped `GET /me/permissions` response is the only
browser runtime source for this flag. It may add this server-controlled
envelope:

```json
{
  "cabinetParityRollout": {
    "configuration": "{\"version\":1,\"mode\":\"off\",\"canaryPercent\":0,\"emergencyOff\":true}",
    "claim": {
      "version": 1,
      "subjectId": "opaque-server-cohort-id",
      "grants": ["cabinet-parity"],
      "audiences": []
    }
  }
}
```

The `configuration` string has this v1 shape:

```json
{
  "version": 1,
  "mode": "off",
  "canaryPercent": 0,
  "emergencyOff": true
}
```

Modes progress in one direction per observed gate: `off` → `internal` → `canary` → `on`. `emergencyOff: true` overrides every mode. A present malformed envelope, missing `cabinet-parity` grant, malformed configuration, or unsupported version fails closed. `internal` requires the server-issued `internal` audience; no client-provided role, query parameter, storage value, or boolean is trusted.

The `cabinet-parity-v1` flag gates only the routes newly released by this
initiative: team, reports, and business settings. Profile, billing overview,
plans, and payments were already released at the initiative baseline and stay
available under their existing permission rules in every flag mode, including
`off` and emergency-off. Those existing screens may contain improvements from
this release, but rollback of the parity flag must not remove their routes.

For backwards compatibility only, omission of the entire
`cabinetParityRollout` property preserves the currently released behavior when
the separate v1 compatibility configuration explicitly sets
`allowMissingEnvelope:true`. This is permitted only in development and test.
QA and production set it to `false`; there, an omitted or `null` envelope fails
closed. The Vite configuration mechanically rejects QA or production builds
when this setting is missing, malformed, enabled, or not the exact supported
version.

```json
{
  "version": 1,
  "allowMissingEnvelope": false
}
```

## Configuration inventory

| Environment | Source file        | Missing-envelope compatibility | Release meaning                         |
| ----------- | ------------------ | ------------------------------ | --------------------------------------- |
| development | `.env.development` | explicitly enabled             | local compatibility only                |
| test        | `.env.test`        | explicitly enabled             | existing fixture compatibility only     |
| QA          | `.env.qa`          | explicitly disabled            | omitted/malformed envelope fails closed |
| production  | `.env.production`  | explicitly disabled            | omitted/malformed envelope fails closed |

The environment variable is
`VITE_CABINET_PARITY_COMPATIBILITY`. Promotion is blocked until the release
artifact records the exact QA/production value, build-gate output, and
fleet-wide evidence that every supported `/me/permissions` backend version
emits a valid non-null envelope for every authenticated tenant. Required
fleet-wide evidence consists of backend version inventory, deployment IDs,
query time range, total authenticated tenant count, omitted count `0`, null
count `0`, malformed count `0`, and an evidence link. “Expected”, sampled
manually, or `not-recorded` is not evidence and blocks promotion.

Cohort selection is FNV-1a 32-bit over the canonical UTF-8 bytes of the opaque
server-issued `subjectId`, with bucket `hash % 100`. A percentage `N` includes
buckets `0..N-1`; therefore `0` includes nobody and `100` includes every
server-authorized subject. Flags only narrow exposure; tenant permissions,
features, subscription state, and quota checks remain authoritative.

## Control plane and operator prerequisites

Promotion is blocked until every `REPLACE-BEFORE-ROLLOUT` value below is
replaced in the release record:

- flag control plane/change command: `REPLACE-BEFORE-ROLLOUT`;
- control-plane owner/team: `REPLACE-BEFORE-ROLLOUT`;
- primary authorized operator/on-call role: `REPLACE-BEFORE-ROLLOUT`;
- secondary approver role: `REPLACE-BEFORE-ROLLOUT`;
- audit-log location: `REPLACE-BEFORE-ROLLOUT`;
- API/server error dashboard and exact query: `REPLACE-BEFORE-ROLLOUT`;
- web-vitals dashboard and exact query: `REPLACE-BEFORE-ROLLOUT`;
- client-error dashboard and exact query: `REPLACE-BEFORE-ROLLOUT`;
- privacy/PII alert dashboard and exact query: `REPLACE-BEFORE-ROLLOUT`;
- authenticated cohort/sample-count query: `REPLACE-BEFORE-ROLLOUT`.
- fleet-wide envelope completeness query: `REPLACE-BEFORE-ROLLOUT`.

The maximum allowed propagation bound is five minutes from an audited control
plane write until a newly refreshed authenticated session receives the new
envelope. Before promotion, the operator must record the measured propagation
time from two independent sessions. A missing envelope after the server
contract is declared active, propagation above five minutes, or any mismatch
between requested and observed values blocks promotion and triggers the stop
procedure.

## Monitoring windows and minimum samples

Each stage has both a minimum elapsed window and a minimum number of distinct
authenticated server-authorized subjects. If the sample minimum is not met,
hold the same stage until it is met; elapsed time alone never permits
promotion.

| Stage            | Minimum window | Minimum distinct subjects | Required consecutive healthy metric windows |
| ---------------- | -------------: | ------------------------: | ------------------------------------------: |
| `internal`       |     30 minutes |                        20 |                       two 15-minute windows |
| `canary` 5%      |     60 minutes |                       100 |                      four 15-minute windows |
| `canary` 25%     |     60 minutes |                       250 |                      four 15-minute windows |
| `canary` 50%     |    120 minutes |                       500 |                     eight 15-minute windows |
| `on` observation |       24 hours |                     1,000 |                ninety-six 15-minute windows |

Subject counts and metrics must use the exact release artifact, flag version,
environment, and server-authorized cohort filters. An empty query, missing
dashboard, unknown baseline, or incomplete 15-minute window blocks promotion.

## Promotion sequence

1. Operator and secondary approver record the immutable QA artifact, exact compatibility value and build-guard evidence; fill all control-plane/dashboard/query placeholders; attach the complete 24-hour fleet-wide omission-impossible evidence; record the pre-change baseline; and only then open the `internal` monitoring window.
2. Set `mode=internal`, `canaryPercent=0`, `emergencyOff=false` for server-authorized internal subjects.
3. Run authenticated smoke for tenant switching, dashboard, team/roles/invitations, profile/business settings, provider-aware billing, reports lifecycle/download, logout, and expired-session recovery.
4. Hold for the stage-specific minimum window and sample count with the required consecutive healthy metric windows and no stop condition.
5. Set `mode=canary` with 5 percent, then 25 percent, then 50 percent. Repeat propagation verification, smoke, sample-count verification, and the complete stage hold after each change.
6. Set `mode=on`, leaving `emergencyOff=false`, only after Product and QA approve the same artifact and parity evidence. Observe for 24 hours and at least 1,000 distinct subjects; this observation is not permission to ignore a stop condition.

Each step records timestamp, operator, flag version/value, artifact ID, correlation IDs from smoke, dashboards consulted, and decision. A skipped stage requires a new explicit release decision; this runbook does not authorize skipping.

## Stop conditions

Stop promotion and execute rollback when any condition occurs:

- authentication/session or tenant-boundary breach, cross-tenant data, permission bypass, secret/PII telemetry, or destructive-action safety failure: immediate rollback on first occurrence;
- critical/serious accessibility regression in a released cabinet flow: immediate rollback;
- authenticated smoke failure or report download corruption/authorization failure: immediate rollback;
- at least 100 authenticated requests in a five-minute window and 5xx rate above 1 percent for five consecutive minutes, or double the recorded pre-canary baseline when the baseline is already above 0.5 percent;
- p75 LCP above 2.5 seconds, p75 INP above 200 milliseconds, or p75 CLS above 0.1 for two consecutive 15-minute windows;
- at least 100 authenticated requests in a ten-minute window and client error rate above 2 percent for ten consecutive minutes;
- support-confirmed inability to manage a subscription according to authoritative `source`/`manageVia`.

## Rollback

Fast rollback is a configuration action owned by the authorized operator/pipeline:

1. The primary authorized operator sets the same flag version to `emergencyOff=true`, `mode=off`, and `canaryPercent=0`; the secondary approver verifies the audit entry as soon as incident response permits.
2. Within the five-minute propagation bound, verify two new or refreshed authenticated sessions receive the disabled envelope; team, reports, and business routes fail closed; and profile, billing overview, plans, and payments remain available under their existing permissions. Escalate to the control-plane owner if the bound is exceeded.
3. If the failure exists outside flagged modules, promote the previously recorded immutable production artifact through the approved pipeline; never rebuild it.
4. Run health and the minimal authenticated smoke set, then record returned correlation IDs and artifact identity.
5. Keep rollout off until the incident has a regression test, a new immutable artifact passes QA, and a new release decision is approved.

Rollback rehearsal status: not executed. Required evidence is an operator/pipeline run identifier, timestamps, before/after flag snapshots, immutable artifact IDs, smoke correlation IDs, and measured recovery time. This task prepares the procedure but does not perform the rehearsal.

## Smoke checklist

- Login and refresh recovery preserve the intended tenant without duplicate requests.
- Tenant switching aborts stale requests and shows no previous-tenant data.
- With the flag off or emergency-off, team, reports, and business settings fail closed while profile, billing overview, plans, and payments remain available under their existing permissions.
- Team member, role, permission override, and invitation actions enforce effective permissions immediately before dispatch.
- System roles cannot be mutated or removed.
- Profile and business updates round-trip; account deletion requires explicit re-confirmation.
- Billing renders authoritative subscription source and management destination; native IAP never exposes Mono management.
- Report creation progresses through queued/processing/completed or truthful failure/expired states; retry creates one replacement; download is authenticated.
- Keyboard-only navigation, visible focus, responsive widths 320/768/1024/1440, and WCAG 2.2 AA Axe coverage pass.
- Telemetry includes a correlation ID and contains no phone, email, authorization, cookie, token, query secret, or raw backend message.

## Sign-off record

Product parity sign-off: not recorded.

QA sign-off: not recorded.

Release operator approval: not recorded.

These fields must name the approver, timestamp, immutable artifact, manifest release ID, and evidence link. Absence means promotion is blocked.
