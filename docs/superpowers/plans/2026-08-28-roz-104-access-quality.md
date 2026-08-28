# ROZ-104 Access and Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver team access, account/business/billing, reports, accessibility/performance, quality/observability, and rollout-readiness slices for the ROZ-104 web parity branch.

**Architecture:** Each functional slice owns a tenant-scoped API adapter and route-level cabinet screen, with authorization enforced through the existing policy boundary and again immediately before mutations. Shared routing, policy, integration, E2E, observability, performance, and rollout files are integrated only after the three functional slices exist.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Axios, Vitest, Testing Library, Playwright, Axe, Vite, Cloudflare Workers.

**Spec:** Linear issues ROZ-116, ROZ-117, ROZ-114, ROZ-118, ROZ-119, and ROZ-120, read-only on 2026-08-28.

## Global Constraints

- Work only in `/Users/user/Code/rozbirka/rozbirka.web/.worktrees/roz-104-access-quality` on `codex/roz-104-access-quality`, starting at `95984bc`.
- Do not modify another checkout/worktree, push, merge, deploy, create child PRs, or mutate Linear.
- Do not interrupt any process using `127.0.0.1:4174`.
- Do not run Playwright, browser E2E, browser automation, or any browser test suite. E2E code may be prepared but remains unexecuted by explicit user instruction.
- Run full `npm test` only when port 4174 is free; otherwise use focused unit/API/contract/non-browser integration tests.
- Use strict RED → GREEN → REFACTOR TDD and record focused commands and failure reasons.
- Preserve tenant scoping, abort stale requests, check mutation permission at dispatch time, redact PII/secrets, and expose truthful loading/error/empty states.
- Commit each Linear task separately with its ROZ ID.
- ROZ-120 prepares versioned rollout/rollback readiness only; it does not perform QA or production deployment.

---

### Task 1: ROZ-116 Team, Roles, Permissions, and Invitations

**Files:**
- Create: `src/api/team.ts`
- Create: `src/api/team.test.ts`
- Create: `src/cabinet/team/TeamScreen.tsx`
- Create: `src/cabinet/team/TeamScreen.test.tsx`
- Create as needed only under: `src/cabinet/team/**`

**Interfaces:**
- Consume `apiClient`, cabinet tenant scope, `team.view` and `team.manage` effective permissions.
- Produce `teamApi` operations for `/team/members`, `/team/roles`, `/team/users/:id/permissions`, and `/team/invitations`.
- Produce `TeamScreen: ComponentType<CabinetModuleScreenProps>` for later route integration.

- [ ] Write API tests first for list/detail/mutation HTTP methods, encoded IDs, abort signals, and exact payloads; run `npx vitest run src/api/team.test.ts` and verify failure because `teamApi` is missing.
- [ ] Implement minimal typed `teamApi`; rerun the API test to green.
- [ ] Write screen tests first for member/role/invitation lifecycle, protected system roles, invitation states, no mutation controls without `team.manage`, and a permission revalidation immediately before every mutation; run the focused test and verify expected failure.
- [ ] Implement the minimal accessible screen with real headings, tables/lists, labels, confirmations, status/live feedback, and stale-request cancellation; rerun both focused files to green.
- [ ] Run Prettier check and `git diff --check`; do not commit from the worker.

### Task 2: ROZ-117 Profile, Business Settings, and Provider-aware Billing

**Files:**
- Create: `src/api/profile.ts`, `src/api/profile.test.ts`
- Create: `src/api/business.ts`, `src/api/business.test.ts`
- Modify only this lane's existing files: `src/api/billing.ts`, `src/api/billing.test.ts`, `src/cabinet/profile/**`, `src/cabinet/billing/**`
- Create as needed only under: `src/cabinet/business/**`

**Interfaces:**
- Consume Identity `/auth/me` name/delete operations, Core `/tenants/:id` settings operations, and existing billing contracts.
- Produce update round-trips, guarded account deletion, tenant business settings, and provider-aware `source`/`manageVia` billing presentation.
- Native IAP subscriptions must never expose Mono checkout/cancel controls; Web/Mono subscriptions may use the authoritative checkout/management destination.

- [ ] Write failing API tests for profile update/delete, tenant patch, subscription refresh, plan checkout, and provider-specific behavior; verify RED with focused Vitest.
- [ ] Implement minimal typed adapters and rerun focused API tests to green.
- [ ] Extend failing screen tests for round-trip profile/business updates, destructive re-confirmation, authoritative billing source/management, and denied actions; verify RED.
- [ ] Implement minimal accessible UI, preserving abort/tenant lifecycle behavior and checking permission immediately before dispatch; rerun all lane tests to green.
- [ ] Run Prettier check and `git diff --check`; do not commit from the worker.

### Task 3: ROZ-114 Reports and Authenticated Downloads

**Files:**
- Create: `src/api/reports.ts`
- Create: `src/api/reports.test.ts`
- Create: `src/cabinet/reports/ReportsScreen.tsx`
- Create: `src/cabinet/reports/ReportsScreen.test.tsx`
- Create as needed only under: `src/cabinet/reports/**`

**Interfaces:**
- Produce typed list/detail/create operations for `/reports` and an authenticated streaming download helper for `/reports/:id/download`.
- Produce `ReportsScreen: ComponentType<CabinetModuleScreenProps>` for later route integration.
- Model queued, processing, completed, failed, and expired states; retry creates at most one replacement job per user action.

- [ ] Write failing API tests for pagination/ranges, job creation, detail polling, authenticated Blob download, filename parsing, abort, and non-buffering direct stream handoff where supported; verify RED.
- [ ] Implement minimal typed API/download helpers; rerun API tests to green.
- [ ] Write failing screen tests for the full lifecycle, stable range controls, retry de-duplication, completed download/print, expired recovery, denied actions, and stale polling cancellation; verify RED.
- [ ] Implement minimal accessible screen and rerun both focused files to green.
- [ ] Run Prettier check and `git diff --check`; do not commit from the worker.

### Task 4: Integrate Functional Routes and Commit ROZ-116, ROZ-117, ROZ-114 Separately

**Files:**
- Modify: `src/routes/routes.tsx`, `src/routes/routes.test.tsx`
- Modify: `src/cabinet/module-registry.ts`, `src/cabinet/policy.ts`, `src/cabinet/policy.test.ts`
- Modify as required: `src/cabinet/access-types.ts`, `src/cabinet/CabinetNavigation.test.tsx`

**Interfaces:**
- Bind `team`, `profile`, business settings, billing, and reports modules to released screens without weakening `ModuleBoundary`.

- [ ] Review worker diffs for ownership overlap and split changes into the three ROZ scopes.
- [ ] Add a failing route/policy test for every released destination and permission boundary, then verify RED.
- [ ] Integrate one child at a time, run its focused API/UI/route/policy tests, format, inspect staged diff, and commit with `ROZ-116`, `ROZ-117`, or `ROZ-114` in the message.

### Task 5: ROZ-118 WCAG 2.2 AA and Performance Hardening

**Files:**
- Modify functional screens only where an observed failing test requires it.
- Modify: `e2e/cabinet-shell.spec.ts`, `lighthouserc.cjs`, `scripts/check-asset-budget.mjs`
- Create/modify focused accessibility or budget tests under `scripts/**` as needed.

**Interfaces:**
- Enforce no critical/serious Axe violations, keyboard-only critical paths, reduced motion, responsive widths 320/768/1024/1440, route lazy loading, and explicit asset/CWV budgets.

- [ ] Add focused failing unit/static budget checks that do not use port 4174; verify RED.
- [ ] Harden semantics, focus, announcements, responsive overflow, lazy boundaries, and budget configuration minimally; verify GREEN.
- [ ] Add Playwright coverage as code only; do not execute it.
- [ ] Run focused tests, asset budget, relevant build, formatting, and diff check; commit once as ROZ-118.

### Task 6: ROZ-119 Contract, Integration, E2E, and Redacted Observability Gates

**Files:**
- Modify: `package.json`, `.github/workflows/deploy-rozbirka-web.yml`
- Modify/create: `scripts/check-api-contracts.mjs`, `scripts/api-contracts.test.ts`, `e2e/cabinet-shell.spec.ts`
- Create: `src/observability/redaction.ts`, `src/observability/redaction.test.ts`
- Modify Worker/client integration only where needed to emit a correlation ID and sanitized events.
- Include this implementation plan in the ROZ-119 commit.

**Interfaces:**
- CI quality gate must execute lint, typecheck, unit, contract, integration, E2E, and authenticated smoke coverage.
- Redaction must remove phone/email/token/cookie/authorization/query secrets while retaining correlation ID, route template, status, and safe error category.

- [ ] Write failing contract and redaction tests with literal sensitive fixtures; verify RED.
- [ ] Implement minimal contract validation and centralized sanitizer; rerun focused tests to green.
- [ ] Add deterministic tenant/auth concurrency integration cases and authenticated smoke cases.
- [ ] Wire named npm/CI gates without deploy side effects; run focused non-browser gates and do not execute browser tests.
- [ ] Format, diff-check, and commit once as ROZ-119.

### Task 7: ROZ-120 Versioned Feature-flag Rollout, Canary, and Rollback Readiness

**Files:**
- Create: `src/config/cabinet-feature-flags.ts`, `src/config/cabinet-feature-flags.test.ts`
- Modify: `src/cabinet/module-registry.ts` and tests only if flags gate released modules.
- Create: `docs/runbooks/roz-104-web-parity-rollout-v1.md`
- Create: `docs/releases/roz-104-web-parity-manifest.example.yaml`

**Interfaces:**
- Versioned, fail-closed flags support off/internal/canary/on cohorts without client-provided authorization.
- Runbook declares immutable artifact promotion, canary order, monitoring stop conditions, smoke checklist, rollback commands owned by the operator/pipeline, rehearsal evidence placeholders, and Product/QA sign-off fields.

- [ ] Write failing flag evaluation tests for missing/malformed config, deterministic cohort assignment, server-authorized allowlists, and emergency off; verify RED.
- [ ] Implement minimal fail-closed flag evaluation and route gating; rerun focused tests to green.
- [ ] Write the v1 operator runbook and manifest example; do not claim rehearsal, QA, sign-off, or deployment occurred.
- [ ] Run focused tests, formatting, diff check, and commit once as ROZ-120.

### Task 8: Final Integration Verification and Review

**Files:** No planned product changes; fixes require a failing regression test and remain in the owning ROZ commit or a clearly identified follow-up commit.

- [ ] Confirm port 4174 ownership without terminating its process. If free, run `npm test`, `npm run check`, relevant production build, asset budget, contract check, and Wrangler dry-run only where it cannot deploy.
- [ ] Do not run Playwright/browser E2E under any condition; report it as not run by explicit user instruction and provide focused non-browser verification evidence.
- [ ] Dispatch task-scoped and whole-branch code reviews, resolve Critical/Important findings with tests, and verify the final git status/log.
- [ ] Report commits per ROZ issue, remaining cross-lane dependencies, and canonical cherry-pick order; do not push, merge, deploy, or mutate Linear.
