# ROZ-107 Parity Matrix and API Contract Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an evidence-backed YAML parity inventory and deterministic Markdown report mapping every reachable Rozbirka Mobile capability to its Web outcome, backend contract status, owner, and delivery tracking state.

**Architecture:** A YAML document is the source of truth. A focused Node.js module parses, validates, normalizes, and renders it; a separate read-only checker detects Markdown drift. The audit is populated domain by domain from pinned Mobile, Web, Core, and Identity revisions.

**Tech Stack:** Node.js 24, ECMAScript modules, YAML 2.9.0, TypeScript 6, Vitest 4, npm 11, Markdown.

**Spec:** `docs/superpowers/specs/2026-08-24-roz-107-parity-matrix-api-audit-design.md`

## Global Constraints

- Modify only `rozbirka.web`; Mobile, Core, and Identity are read-only evidence sources.
- Work on `vsobol/roz-104-frontend-rozbirkaweb-primary`. ROZ-107 owns no separate branch or PR.
- Audit Mobile commit `2f0930509b2dbf7293da529ce2e1f225a852dba0`.
- Audit Web application commit `6aa6d92f443db451aace4875d0afd7dd358e975c`.
- Audit Core commit `46e2d91b371fac24043a5eebaef7a8f75fb3ff08`.
- Audit Identity commit `b7497a46204cbae0e964bb2cf4d00f91f9d382d0`.
- YAML is authoritative; generated Markdown is never edited manually.
- Every material claim needs repository-qualified evidence.
- Unknown support is `partial`, `missing`, or `unsafe`, never guessed as `ready`.
- New Linear work remains `tracking.status: proposed` until a separately approved exact preview.
- Do not create or merge a PR and do not deploy.

---

### Task 1: YAML Loader and Deterministic Renderer

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/generate-parity-matrix.mjs`
- Create: `scripts/parity-matrix.test.ts`

**Interfaces:**
- Produces: `parseParityYaml(source: string): unknown`
- Produces: `validateParityDocument(value: unknown): ParityDocument`
- Produces: `renderParityMarkdown(document: ParityDocument): string`
- Produces: `generateParityReport({ sourcePath, outputPath }): Promise<void>`

- [ ] **Step 1: Install the pinned parser**

```bash
npm install --save-dev yaml@2.9.0
```

Expected: `yaml` is in `devDependencies` and the lockfile pins `2.9.0`.

- [ ] **Step 2: Write the failing parser and renderer test**

Create a minimal YAML fixture in `scripts/parity-matrix.test.ts` with the four pinned commits, one `dashboard.view` capability, `tracking.status: existing`, `issue: ROZ-106`, and repository-qualified evidence. Assert:

```ts
const document = validateParityDocument(parseParityYaml(validYaml))
const markdown = renderParityMarkdown(document)

expect(document.schemaVersion).toBe(1)
expect(markdown).toContain('# Mobile → Web Parity Matrix')
expect(markdown).toContain('2f0930509b2dbf7293da529ce2e1f225a852dba0')
expect(markdown).not.toContain('Generated at')
```

- [ ] **Step 3: Verify the test fails**

Run: `npx vitest run scripts/parity-matrix.test.ts`

Expected: FAIL because `generate-parity-matrix.mjs` is missing.

- [ ] **Step 4: Implement parsing, skeleton validation, sorting, and rendering**

Use `parseDocument` from `yaml` with `prettyErrors: true`. Validate the top-level object, `schemaVersion`, `audit`, and the three arrays. Sort capabilities by domain then ID and exclusions by route. Render audit commits, status summaries, domain tables, system capabilities, exclusions, tracking groups, and a legend. End with one newline and include no timestamp or machine path.

`generateParityReport` must validate and render completely, write a sibling temporary file, then rename it over the final Markdown.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run scripts/parity-matrix.test.ts
npx prettier --write package.json package-lock.json scripts/generate-parity-matrix.mjs scripts/parity-matrix.test.ts
npx prettier --check package.json package-lock.json scripts/generate-parity-matrix.mjs scripts/parity-matrix.test.ts
git diff --check
git add -- package.json package-lock.json scripts/generate-parity-matrix.mjs scripts/parity-matrix.test.ts
git commit -m "feat(web): add parity matrix generator"
```

---

### Task 2: Complete Semantic Validator

**Files:**
- Modify: `scripts/generate-parity-matrix.mjs`
- Modify: `scripts/parity-matrix.test.ts`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: field-qualified errors formatted `<location>: <message>`.
- Preserves all valid fields and rejects unknown keys.

- [ ] **Step 1: Add failing validation tests**

Use cloned fixture mutations and assert these exact fragments:

```text
audit.mobileCommit: expected a lowercase 40-character Git SHA
capabilities[1].id: duplicate capability id dashboard.view
capabilities[0].evidence: expected at least one reference
capabilities[0].web.browserEquivalent: required for browser-native
capabilities[0].contract.operations: required when contract status is ready
capabilities[0].contract.notes: required when contract status is partial
capabilities[0].tracking.issue: expected ROZ-[0-9]+
capabilities[0].tracking.proposalKey: expected stable kebab-case key
excludedRoutes[0].reason: expected non-empty text
```

Also test unknown enums, `not-applicable` with a non-`none` service, contradictory tracking fields, duplicate proposal keys, and duplicate excluded routes.

- [ ] **Step 2: Verify semantic cases fail**

Run: `npx vitest run scripts/parity-matrix.test.ts`

Expected: FAIL because Task 1 only validates the skeleton.

- [ ] **Step 3: Implement focused validators**

Add internal functions:

```js
function expectRecord(value, location) {}
function expectText(value, location) {}
function expectTextArray(value, location) {}
function expectEnum(value, allowed, location) {}
function validateTracking(value, location) {}
function validateContract(value, location) {}
function validateCapability(value, index, seenIds, seenProposalKeys) {}
function validateSystemCapability(value, index, seenIds, seenProposalKeys) {}
function validateExcludedRoute(value, index, seenRoutes, seenProposalKeys) {}
```

Validate evidence syntax as `repository:relative/path[:line]` for only the four approved repositories. Enforce all conditional rules from the spec. Reject unknown object keys rather than dropping them.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run scripts/parity-matrix.test.ts scripts/api-contracts.test.ts
npx prettier --write scripts/generate-parity-matrix.mjs scripts/parity-matrix.test.ts
npx prettier --check scripts/generate-parity-matrix.mjs scripts/parity-matrix.test.ts
git diff --check
git add -- scripts/generate-parity-matrix.mjs scripts/parity-matrix.test.ts
git commit -m "test(web): enforce parity matrix contracts"
```

---

### Task 3: Generator CLI, Drift Gate, and npm Commands

**Files:**
- Modify: `scripts/generate-parity-matrix.mjs`
- Create: `scripts/check-parity-matrix.mjs`
- Modify: `scripts/parity-matrix.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- CLI: `node scripts/generate-parity-matrix.mjs [--source <yaml>] [--out <markdown>]`
- CLI: `node scripts/check-parity-matrix.mjs [--source <yaml>] [--out <markdown>]`
- Defaults: `docs/parity/mobile-web-parity.yaml` and `docs/parity/mobile-web-parity.md`
- npm: `parity:generate` and `parity:check`

- [ ] **Step 1: Write failing CLI tests**

With `mkdtemp` and `execFile`, assert generator success, unsupported-argument usage failure, byte-identical drift success, stale-output failure, checker non-mutation, and invalid-YAML atomicity.

- [ ] **Step 2: Verify CLI tests fail**

Run: `npx vitest run scripts/parity-matrix.test.ts`

Expected: FAIL because argument parsing and the checker are absent.

- [ ] **Step 3: Implement both CLIs**

Add guarded `main()` execution to the generator. Accept `--source` and `--out` at most once. The checker parses, validates, and renders entirely in memory; it treats missing output as drift and never writes. Success prints `Parity matrix is up to date`. Drift prints `Generated parity matrix drift: <path>` and exits non-zero.

Add:

```json
"parity:generate": "node scripts/generate-parity-matrix.mjs",
"parity:check": "node scripts/check-parity-matrix.mjs"
```

Do not add `parity:check` to the global `check` command until Task 4 creates the real artifacts.

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run scripts/parity-matrix.test.ts
npx prettier --write package.json package-lock.json scripts/generate-parity-matrix.mjs scripts/check-parity-matrix.mjs scripts/parity-matrix.test.ts
npx prettier --check package.json package-lock.json scripts/generate-parity-matrix.mjs scripts/check-parity-matrix.mjs scripts/parity-matrix.test.ts
git diff --check
git add -- package.json package-lock.json scripts/generate-parity-matrix.mjs scripts/check-parity-matrix.mjs scripts/parity-matrix.test.ts
git commit -m "feat(web): add parity matrix drift gate"
```

---

### Task 4: Route Inventory, Auth, Onboarding, and Dashboard

**Files:**
- Create: `docs/parity/mobile-web-parity.yaml`
- Create: `docs/parity/mobile-web-parity.md`
- Modify: `scripts/parity-matrix.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces the real audit document and first generated report.
- Produces complete accounting for auth, onboarding, invite, account, dashboard, and their initial system flows.

- [ ] **Step 1: Prove all source revisions**

```bash
git -C ../../../rozbirka.mobile rev-parse HEAD
git rev-parse 6aa6d92^{commit}
git -C ../../../rozbirka.core rev-parse HEAD
git -C ../../../rozbirka.identity rev-parse HEAD
```

Expected: exact matches to Global Constraints. Any mismatch stops the audit and requires spec/plan review.

- [ ] **Step 2: Capture the complete route inventory outside Git**

```bash
find ../../../rozbirka.mobile/app -type f -name '*.tsx' | sort
rg -n "router\\.(push|replace)|href=|Redirect|Link" ../../../rozbirka.mobile/app ../../../rozbirka.mobile/src
```

Use the output as working evidence; do not commit temporary inventories.

- [ ] **Step 3: Audit the first domain batch**

Read together:

```text
rozbirka.mobile/app/(auth)/**
rozbirka.mobile/app/(tabs)/(home)/index.tsx
rozbirka.mobile/src/api/auth.ts
rozbirka.mobile/src/api/invites.ts
rozbirka.mobile/src/api/me.ts
rozbirka.mobile/src/api/tenants.ts
rozbirka.mobile/src/api/dashboard.ts
rozbirka.mobile/src/session/**
rozbirka.mobile/src/stores/authPersistence.ts
rozbirka.mobile/src/stores/authStore.ts
rozbirka.web/src/routes/routes.tsx
rozbirka.web/src/api/auth.ts
rozbirka.web/src/api/session.ts
rozbirka.web/src/api/invitations.ts
rozbirka.web/src/api/tenants.ts
rozbirka.identity/src/Rozbirka.Identity.API/Controllers/AuthController.cs
rozbirka.identity/src/Rozbirka.Identity.Application/Auth/**
rozbirka.core/src/Rozbirka.API/Controllers/DashboardController.cs
rozbirka.core/src/Rozbirka.API/Controllers/InvitationsController.cs
rozbirka.core/src/Rozbirka.API/Controllers/MeController.cs
rozbirka.core/src/Rozbirka.API/Controllers/TenantsController.cs
```

Create one row per user outcome. Map dashboard delivery to ROZ-106, Identity contract/hardening to ROZ-124/ROZ-125, and Web-root behavior to ROZ-104 where no narrower issue exists.

- [ ] **Step 4: Generate and add committed-artifact tests**

```bash
npm run parity:generate
npm run parity:check
```

Test that the committed source validates, the four commits match, and rendered Markdown equals the committed file byte-for-byte. Add `npm run parity:check` to `check` after `format:check` and before `test`.

- [ ] **Step 5: Verify and commit**

```bash
npx prettier --write package.json package-lock.json scripts/parity-matrix.test.ts docs/parity/mobile-web-parity.yaml
npm run parity:generate
npm run parity:check
npx vitest run scripts/parity-matrix.test.ts
git diff --check
git add -- package.json package-lock.json scripts/parity-matrix.test.ts docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md
git commit -m "docs(web): audit auth and dashboard parity"
```

---

### Task 5: Cars and Intake Audit

**Files:**
- Modify: `docs/parity/mobile-web-parity.yaml`
- Modify (generated): `docs/parity/mobile-web-parity.md`

- [ ] **Step 1: Inventory routes and navigation**

Read `app/(tabs)/(home)/cars/index.tsx`, `app/car/**`, `app/(tabs)/(home)/intake/index.tsx`, `app/intake/**`, and `app/(tabs)/(home)/warehouse/[carId].tsx`. Trace entry points:

```bash
rg -n "car/|intake/|warehouse/|router\\.(push|replace)" ../../../rozbirka.mobile/app ../../../rozbirka.mobile/src
```

- [ ] **Step 2: Trace API and Core evidence**

Read Mobile `src/api/cars.ts`, `src/api/intakes.ts`,
`src/api/carCatalog.ts`, `src/query/carsQueries.ts`,
`src/query/carsMutationFlows.ts`, `src/query/carsCacheEffects.ts`,
`src/query/intakesQueries.ts`, and `src/query/intakesCacheEffects.ts`. Read
Core `src/Rozbirka.API/Controllers/CarsController.cs` and
`src/Rozbirka.API/Controllers/IntakesController.cs`.

Create separate rows for list/search/filter/pagination, detail, create, edit, media, VIN/catalog selection, expenses/ROI, warehouse linkage, intake status, batch intake, and part creation. Map Web to ROZ-109/ROZ-108, list gaps to ROZ-60, and proven Core gaps to ROZ-121/ROZ-122/ROZ-123.

- [ ] **Step 3: Apply contract status discipline**

Until ROZ-121 supplies an immutable versioned Core contract, endpoints with runtime implementation but no immutable contract evidence remain `partial` rather than `ready`.

- [ ] **Step 4: Generate, verify, and commit**

```bash
npx prettier --write docs/parity/mobile-web-parity.yaml
npm run parity:generate
npm run parity:check
npx vitest run scripts/parity-matrix.test.ts
git diff --check
git add -- docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md
git commit -m "docs(web): audit cars and intake parity"
```

---

### Task 6: Parts, Warehouse, QR, VIN/OEM, and Stickers

**Files:**
- Modify: `docs/parity/mobile-web-parity.yaml`
- Modify (generated): `docs/parity/mobile-web-parity.md`

- [ ] **Step 1: Inventory routes and native capabilities**

Read `app/(tabs)/(parts)/**`, `app/part/**`, `app/(tabs)/scan-tab.tsx`, `app/scan.tsx`, `app/(tabs)/(home)/stickers.tsx`, and warehouse routes. Trace native integrations:

```bash
rg -n "Camera|ImagePicker|TextExtractor|Print|Sharing|FileSystem|scan|sticker|vin|oem" ../../../rozbirka.mobile/app ../../../rozbirka.mobile/src
```

- [ ] **Step 2: Trace APIs and contracts**

Read Mobile `src/api/parts.ts`, `src/api/media.ts`,
`src/api/vinDecode.ts`, `src/query/partsQueries.ts`,
`src/query/partsCacheEffects.ts`, `src/stores/printQueueStore.ts`,
`src/stores/printQueueStoreCore.ts`, `src/stores/printQueuePersistence.ts`,
`src/stores/printQueueHydration.ts`, and
`src/session/printQueuePersistence.test.mjs`. Read Core
`src/Rozbirka.API/Controllers/PartsController.cs` and
`src/Rozbirka.API/Controllers/MediaController.cs`.

Split list/detail/CRUD, quantities, reservation, OEM, condition, history, compatibility, photos, sale handoff, QR lookup, VIN decode/OCR, sticker queue, PDF, and printing. Map Web to ROZ-110/ROZ-111 and proven Core gaps to ROZ-121/ROZ-122/ROZ-123.

- [ ] **Step 3: Record browser equivalents**

Camera rows require browser camera plus manual/file fallback. Sharing requires Web Share or copy/download fallback. Printing requires downloadable PDF plus browser print. Native-only behavior without a required Web result belongs in exclusions with evidence.

- [ ] **Step 4: Generate, verify, and commit**

```bash
npx prettier --write docs/parity/mobile-web-parity.yaml
npm run parity:generate
npm run parity:check
npx vitest run scripts/parity-matrix.test.ts
git diff --check
git add -- docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md
git commit -m "docs(web): audit inventory and scanning parity"
```

---

### Task 7: Customers, Orders, Cash, and Reports

**Files:**
- Modify: `docs/parity/mobile-web-parity.yaml`
- Modify (generated): `docs/parity/mobile-web-parity.md`

- [ ] **Step 1: Inventory routes**

Read `app/(tabs)/(orders)/**`, `app/order/**`, `app/customer/**`, cash routes, and reports route.

- [ ] **Step 2: Trace API and query behavior**

Read Mobile `src/api/customers.ts`, `src/api/orders.ts`,
`src/api/sales.ts`, `src/api/cash.ts`, `src/api/reports.ts`,
`src/query/customersQueries.ts`, `src/query/customersMutationFlows.ts`,
`src/query/customerOrderQueries.ts`,
`src/query/customerOrderMutationFlows.ts`, `src/query/ordersQueries.ts`,
`src/query/ordersCacheEffects.ts`, `src/query/cashQueries.ts`,
`src/query/cashMutationFlows.ts`, `src/query/cashCacheEffects.ts`,
`src/query/reportsQueries.ts`, and `src/query/reportsMutationFlows.ts`. Read
Core `src/Rozbirka.API/Controllers/CustomersController.cs`,
`src/Rozbirka.API/Controllers/OrdersController.cs`,
`src/Rozbirka.API/Controllers/CashController.cs`, and
`src/Rozbirka.API/Controllers/ReportsController.cs`.

- [ ] **Step 3: Record business-critical guarantees**

Create separate rows for customer search/CRUD/history; order list/detail/create/items/customer/reserve/confirm/payment/cancel/refund/notes/audit; cash list/balance/transaction/permissions; and report job/status/download/retry.

Record legacy `sales.ts` direct-sale as obsolete with canonical Orders as its Web replacement. Financial mutations lacking proved idempotency, authoritative totals, or durable report lifecycle are `partial` or `unsafe`. Map delivery to ROZ-112/ROZ-113/ROZ-114/ROZ-115 and ROZ-123.

- [ ] **Step 4: Generate, verify, and commit**

```bash
npx prettier --write docs/parity/mobile-web-parity.yaml
npm run parity:generate
npm run parity:check
npx vitest run scripts/parity-matrix.test.ts
git diff --check
git add -- docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md
git commit -m "docs(web): audit commerce and finance parity"
```

---

### Task 8: Team, Profile, Billing, System Capabilities, and Exclusions

**Files:**
- Modify: `docs/parity/mobile-web-parity.yaml`
- Modify (generated): `docs/parity/mobile-web-parity.md`

- [ ] **Step 1: Audit visible profile domains**

Read Mobile `app/(tabs)/(profile)/**`, `src/api/team.ts`,
`src/api/billing.ts`, `src/api/me.ts`, `src/query/teamQueries.ts`,
`src/query/teamMutationFlows.ts`, `src/query/teamCacheEffects.ts`,
`src/query/billingQueries.ts`, `src/query/billingAccess.ts`,
`src/query/accessQueries.ts`, `src/billing/featureSource.ts`,
`src/stores/blockedStore.ts`, and `src/stores/paywallStore.ts`. Read Core
`src/Rozbirka.API/Controllers/TeamController.cs`,
`src/Rozbirka.API/Controllers/UserPermissionsController.cs`,
`src/Rozbirka.API/Controllers/BillingController.cs`, and
`src/Rozbirka.API/Controllers/MeController.cs`. Map Web delivery to
ROZ-116/ROZ-117.

- [ ] **Step 2: Audit invisible system behavior**

Read Mobile `src/session/**`, `src/query/queryClient.ts`,
`src/query/queryLifecycle.ts`, `src/query/retryPolicy.ts`,
`src/query/tenantMutationBoundary.ts`, `src/query/tenantQueryScope.ts`,
`src/stores/authPersistence.ts`, `src/stores/authStore.ts`,
`src/api/client.ts`, and `src/api/media.ts`. Read Web `src/api/auth.ts`,
`src/api/client.ts`, `src/api/credentials.ts`, `src/api/session.ts`,
`src/api/refresh-coordinator.ts`, `src/api/tenant-preference.ts`,
`src/api/tenants.ts`, `src/api/billing.ts`, and `src/api/invitations.ts`.
Create system rows for refresh coordination, session generation, logout
cleanup, tenant transitions, tenant-scoped query keys, private cache
invalidation, private temporary files, retry policy, media ownership,
permission enforcement, and billing gates. Map Web gates to ROZ-119 and proven
backend security work to ROZ-122/ROZ-125.

- [ ] **Step 3: Reconcile every remaining route**

```bash
find ../../../rozbirka.mobile/app -type f -name '*.tsx' | sort
rg -n "route:" docs/parity/mobile-web-parity.yaml
```

Every route file must appear through a capability or exclusion. Layout and not-found files may be excluded only with technical classification and evidence. Native IAP purchase/restore, haptics, and push notifications follow ROZ-104 exclusions unless evidence proves a required browser result.

- [ ] **Step 4: Generate, verify, and commit**

```bash
npx prettier --write docs/parity/mobile-web-parity.yaml
npm run parity:generate
npm run parity:check
npx vitest run scripts/parity-matrix.test.ts
git diff --check
git add -- docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md
git commit -m "docs(web): complete mobile parity inventory"
```

---

### Task 9: Cross-Domain Consistency and Full Verification

**Files:**
- Modify: `docs/parity/mobile-web-parity.yaml`
- Modify (generated): `docs/parity/mobile-web-parity.md`
- Modify: `scripts/parity-matrix.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Reconcile all routes and API consumers**

```bash
find ../../../rozbirka.mobile/app -type f -name '*.tsx' | sort
rg -n "from ['\\\"](@/|\\.\\./).*api/|from ['\\\"].*/api/" ../../../rozbirka.mobile/app ../../../rozbirka.mobile/src
rg -n "tracking:|proposalKey:|issue:" docs/parity/mobile-web-parity.yaml
```

Every route and API consumer must map to a capability, system capability, or exclusion. Merge rows only when user outcome, Web outcome, contract status, owner, and tracking are identical.

- [ ] **Step 2: Review every readiness claim and gap**

```bash
rg -n "status: ready|status: proposed|status: unsafe|status: missing|status: partial" docs/parity/mobile-web-parity.yaml
```

Every `ready` row needs implementation plus immutable contract evidence. Every non-ready row needs exact notes. Every proposed gap needs a stable key, owner, affected outcome, desired contract, and evidence sufficient for an exact Linear preview.

- [ ] **Step 3: Add final artifact tests**

Assert the committed document validates, rendered Markdown is byte-identical, every approved domain is present, all three inventory sections are non-empty, proposed keys appear in the report, existing ROZ issues appear in tracking, and no output contains absolute paths or timestamps.

- [ ] **Step 4: Run complete verification**

```bash
npm run parity:generate
npm run parity:check
npm run check
npm run build
```

Expected: all checks/tests/build pass and generation remains byte-identical.

- [ ] **Step 5: Inspect and commit**

```bash
git diff --check
git status --short
git diff --stat
git add -- docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md scripts/parity-matrix.test.ts package.json package-lock.json
git commit -m "docs(web): finalize ROZ-107 parity audit"
```

Do not stage build output, temporary inventories, sibling-repository changes, or unrelated files.

- [ ] **Step 6: Prepare the operator report without mutating Linear**

Report capability counts by status/disposition, existing mappings, proposed gaps grouped by owner, exclusions and browser replacements, verification evidence, and unchanged release state. Render a separate exact Linear preview for new blockers and wait for approval before any mutation.
