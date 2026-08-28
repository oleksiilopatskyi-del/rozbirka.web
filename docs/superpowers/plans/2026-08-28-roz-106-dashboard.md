# ROZ-106 Web Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Integrate the completed ROZ-40 cabinet foundation into the ROZ-104 root branch and deliver a tenant-safe, Core-backed, responsive Web dashboard with URL-stable analytics periods.

**Architecture:** Preserve the complete reviewed ROZ-40 tenant/access boundary through a merge commit, then add a dashboard transport parser, API adapter, tenant-bound request hook, and focused presentation components under src/cabinet/dashboard/. The existing cabinet registry and policy remain the sole source for module visibility and actions; the existing authenticated apiClient remains the sole Core transport.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Axios, Tailwind CSS 4, Radix UI, Vitest, Testing Library, Playwright, versioned Core OpenAPI.

**Spec:** docs/superpowers/specs/2026-08-28-roz-106-dashboard-design.md

## Global Constraints

- Work only in /Users/user/Code/rozbirka/rozbirka.web/.worktrees/roz-104-web-parity on vsobol/roz-104-frontend-rozbirkaweb-primary.
- Integrate the full branch vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan; do not recreate or selectively cherry-pick its security boundary.
- Do not change rozbirka.admin, nginx-gateway, rozbirka.core, rozbirka.identity, Cloudflare, deployment, or production access.
- Use /app/:tenant/dashboard?period=day|week|month; do not introduce /cabinet.
- Use only the existing apiClient; dashboard API functions never accept a browser-selected tenant argument.
- Do not invent dashboard.view; Core intentionally defines dashboard endpoints as reviewed permission exemptions.
- Preserve nullable role-specific values. Never render absent privileged totals as zero.
- Treat successful response bodies as untrusted and reject malformed dashboard or analytics data before rendering.
- Do not add a charting, state-management, or query dependency.
- Never log response bodies, Authorization headers, tenant identifiers, activity data, or upstream error payloads.
- Use TDD for every behavior change and systematic debugging for every unexpected failure.
- Commit after each independently verified task.

---

### Task 1: Integrate and Verify the ROZ-40 Cabinet Foundation

**Files:**
- Merge: branch vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan
- Resolve: src/components/site/pricing.test.tsx
- Resolve: src/screens/account.tsx
- Resolve: src/screens/account.test.tsx
- Verify: all files introduced or modified by the ROZ-40 merge

**Interfaces:**
- Consumes: current ROZ-104 parity matrix/generator and current origin/main runtime.
- Produces: /app/:tenant routes, CabinetProvider, TenantAccessSnapshot, cabinetModules, evaluateModuleAccess, tenantRequestScope, and placeholder CabinetHomeScreen.

- [ ] **Step 1: Reconfirm clean integration inputs**

    git status --short --branch
    git rev-parse HEAD
    git rev-parse vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan
    git merge-base HEAD vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan

Expected: the root branch is clean at or after spec commit d0f388c; ROZ-40 resolves to adbd16a.

- [ ] **Step 2: Merge ROZ-40 without squash**

    git merge --no-commit --no-ff vsobol/roz-40-web-responsive-cabinet-shell-tenant-isolation-rbac-i-plan

Expected: conflicts are limited to the known account/pricing overlap. Stop and inspect any additional semantic conflict.

- [ ] **Step 3: Resolve known conflicts by contract**

Use apply_patch:

- src/screens/account.tsx keeps the ROZ-40 compatibility entry: no tenants renders TenantOnboardingScreen; existing tenants redirect through resolveAccountDestination.
- src/screens/account.test.tsx keeps ROZ-40 route/onboarding coverage. Removed monolithic billing UI remains covered by src/cabinet/billing/billing-screens.test.tsx.
- src/components/site/pricing.test.tsx keeps every current root pricing assertion while replacing switchTenant fixtures with commitTenant and adding updateName.
- Preserve every ROZ-107 parity file.

Verify:

    rg -n '^(<<<<<<<|=======|>>>>>>>)' . --glob '!node_modules/**' --glob '!.git/**'
    git diff --check
    git status --short

Expected: no conflict markers or whitespace errors.

- [ ] **Step 4: Finish the merge commit**

    git add --all
    git commit --no-edit

Expected: one merge commit with both parents.

- [ ] **Step 5: Install exactly and verify the integrated baseline**

    npm ci
    npm run check
    npm run build:qa
    npm run build:prod
    git diff --check

Expected: all commands pass. Record dependency/install-script warnings exactly; do not run an automatic audit fix. On failure invoke superpowers:systematic-debugging and fix only integration regressions before Task 2.

---

### Task 2: Define and Validate the Dashboard Transport Contract

**Files:**
- Create: src/api/dashboard-contract.ts
- Create: src/api/dashboard-contract.test.ts
- Create: src/api/dashboard.ts
- Create: src/api/dashboard.test.ts

**Interfaces:**
- Consumes: apiClient, RequestOptions, Core DashboardDto, and Core AnalyticsDto.
- Produces: DashboardData, DashboardAnalytics, DashboardPeriod, DashboardContractError, parseDashboardData, parseDashboardAnalytics, dashboardApi.getSummary, and dashboardApi.getAnalytics.

- [ ] **Step 1: Write failing parser tests**

Create complete owner, master, and analytics fixtures. Assert unknown additive fields are ignored and nullable privileged values remain null. Assert rejection for missing required strings, NaN/Infinity, invalid activity timestamps, unsupported periods, labels/series length mismatch, and a partial topPart.

    npm test -- src/api/dashboard-contract.test.ts

Expected: FAIL because the parser module does not exist.

- [ ] **Step 2: Implement the minimal typed contract and validators**

Define:

    export const DASHBOARD_PERIODS = ['day', 'week', 'month'] as const
    export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]

    export interface DashboardData {
      userName: string
      role: string
      yardName: string
      yardCity: string | null
      isYardEmpty: boolean
      todaySalesCount: number
      availablePartsCount: number
      intakesCount: number
      revenue: DashboardRevenue | null
      todayNewPartsCount: number | null
      lastActivity: LastActivity | null
      activeCarsCount: number | null
      outOfStockPartsCount: number | null
      customersCount: number | null
      totalBalanceUah: number | null
      teamMembersCount: number | null
      totalInvested: number | null
      totalRecouped: number | null
      carsInWork: number | null
      totalPartsSold: number | null
      myPartsToday: number | null
      lastMyActivity: LastActivity | null
    }

Implement narrow record/string/boolean/finite-number/nullable/array helpers. DashboardContractError uses a fixed safe message and never embeds rejected data.

    npm test -- src/api/dashboard-contract.test.ts

Expected: PASS.

- [ ] **Step 3: Write failing API adapter tests**

Mock apiClient.get and assert:

    await dashboardApi.getSummary({ signal })
    expect(get).toHaveBeenCalledWith('/dashboard', { signal })

    await dashboardApi.getAnalytics('month', { signal })
    expect(get).toHaveBeenCalledWith(
      '/dashboard/analytics',
      { params: { period: 'month' }, signal },
    )

Return malformed success data and assert parser rejection. The adapter exposes no tenant argument.

    npm test -- src/api/dashboard.test.ts

Expected: FAIL because dashboardApi does not exist.

- [ ] **Step 4: Implement and verify the adapter**

Implement:

    getSummary(options?: RequestOptions): Promise<DashboardData>
    getAnalytics(
      period: DashboardPeriod,
      options?: RequestOptions,
    ): Promise<DashboardAnalytics>

Use only apiClient.get and parse response.data before returning.

    npm test -- src/api/dashboard-contract.test.ts src/api/dashboard.test.ts
    npm run typecheck

Expected: PASS.

- [ ] **Step 5: Commit**

    git add src/api/dashboard-contract.ts src/api/dashboard-contract.test.ts src/api/dashboard.ts src/api/dashboard.test.ts
    git commit -m "feat(web): add validated dashboard API contract"

---

### Task 3: Add URL-Stable Period Semantics

**Files:**
- Create: src/cabinet/dashboard/dashboard-period.ts
- Create: src/cabinet/dashboard/dashboard-period.test.ts
- Create: src/cabinet/dashboard/DashboardScreen.tsx
- Create: src/cabinet/dashboard/DashboardScreen.test.tsx
- Modify: src/cabinet/screens/cabinet-home.tsx
- Modify: src/routes/routes.test.tsx

**Interfaces:**
- Consumes: DashboardPeriod, URLSearchParams, and the existing dashboard route.
- Produces: readDashboardPeriod, writeDashboardPeriod, and a route-level DashboardScreen.

- [ ] **Step 1: Write failing period helper tests**

Cover:

    readDashboardPeriod(new URLSearchParams(''))
    // { period: 'week', normalize: false }

    readDashboardPeriod(new URLSearchParams('period=day'))
    // { period: 'day', normalize: false }

    readDashboardPeriod(new URLSearchParams('period=year'))
    // { period: 'week', normalize: true }

    readDashboardPeriod(new URLSearchParams('period=day&period=month'))
    // { period: 'week', normalize: true }

Assert writeDashboardPeriod preserves scan and other approved parameters while replacing every period value.

    npm test -- src/cabinet/dashboard/dashboard-period.test.ts

Expected: FAIL.

- [ ] **Step 2: Implement pure period helpers**

Define:

    export interface DashboardPeriodSelection {
      period: DashboardPeriod
      normalize: boolean
    }

Do not mutate the caller's URLSearchParams.

    npm test -- src/cabinet/dashboard/dashboard-period.test.ts

Expected: PASS.

- [ ] **Step 3: Write failing route-level tests**

Render DashboardScreen in a memory router and mocked ready cabinet context. Assert missing period means week without navigation; invalid/repeated values replace to one period=week; period controls update the URL; browser back restores the prior period; tenant path and scan remain intact.

    npm test -- src/cabinet/dashboard/DashboardScreen.test.tsx src/routes/routes.test.tsx

Expected: FAIL because the placeholder still renders.

- [ ] **Step 4: Introduce DashboardScreen**

CabinetHomeScreen delegates to DashboardScreen, preserving lazy route loading. useSearchParams uses replace only for normalization and normal push navigation for user changes.

    npm test -- src/cabinet/dashboard/dashboard-period.test.ts src/cabinet/dashboard/DashboardScreen.test.tsx src/routes/routes.test.tsx
    npm run typecheck

Expected: PASS with request/presentation behavior still mocked.

- [ ] **Step 5: Commit**

    git add src/cabinet/dashboard src/cabinet/screens/cabinet-home.tsx src/routes/routes.test.tsx
    git commit -m "feat(web): make dashboard period URL-stable"

---

### Task 4: Implement Tenant-Bound Dashboard Request State

**Files:**
- Create: src/cabinet/dashboard/use-dashboard-data.ts
- Create: src/cabinet/dashboard/use-dashboard-data.test.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.test.tsx

**Interfaces:**
- Consumes: ready CabinetContextValue, tenantRequestScope.signal, tenantResetRegistry, dashboardApi, DashboardPeriod, and normalizeApiProblem.
- Produces: useDashboardData(period) with independent summary/analytics loadables and single-flight refresh/retry actions.

- [ ] **Step 1: Write failing lifecycle tests**

Use deferred promises and a hook harness. Prove one summary plus one active-period request, independent ready/error states, period-only analytics reload, duplicate refresh coalescing, targeted retries, tenantRequestScope.rotate cancellation, tenant reset/unmount clearing, and ignored late old-period/old-tenant completion.

    npm test -- src/cabinet/dashboard/use-dashboard-data.test.tsx

Expected: FAIL.

- [ ] **Step 2: Implement the loadable contract**

Define:

    export type DashboardLoadable<T> =
      | { status: 'loading'; data: null; error: null }
      | { status: 'ready'; data: T; error: null }
      | { status: 'error'; data: null; error: ApiProblem }

    export interface DashboardDataState {
      summary: DashboardLoadable<DashboardData>
      analytics: DashboardLoadable<DashboardAnalytics>
      refreshing: boolean
      refresh(): Promise<void>
      retrySummary(): Promise<void>
      retryAnalytics(): Promise<void>
    }

Combine a local AbortController signal with tenantRequestScope.signal through AbortSignal.any. Guard writes with a monotonic generation and the active user/tenant/snapshot generation key. Register and unregister tenant reset ownership. Normalize failures; cancellation is not visible.

- [ ] **Step 3: Connect the hook**

Start only when useCabinet is ready with a non-null snapshot. Render temporary tested summary/analytics status landmarks; later tasks replace them with presentation components.

    npm test -- src/cabinet/dashboard/use-dashboard-data.test.tsx src/cabinet/dashboard/DashboardScreen.test.tsx
    npm run typecheck

Expected: PASS.

- [ ] **Step 4: Commit**

    git add src/cabinet/dashboard/use-dashboard-data.ts src/cabinet/dashboard/use-dashboard-data.test.tsx src/cabinet/dashboard/DashboardScreen.tsx src/cabinet/dashboard/DashboardScreen.test.tsx
    git commit -m "feat(web): bind dashboard data to tenant lifecycle"

---

### Task 5: Render Summary, Billing Guidance, and Empty State

**Files:**
- Create: src/cabinet/dashboard/DashboardSummary.tsx
- Create: src/cabinet/dashboard/DashboardSummary.test.tsx
- Create: src/cabinet/dashboard/DashboardBillingBanner.tsx
- Create: src/cabinet/dashboard/DashboardBillingBanner.test.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.test.tsx

**Interfaces:**
- Consumes: DashboardData, TenantAccessSnapshot, cabinet paths/policy, and request actions.
- Produces: semantic totals, subscription guidance, empty success state, loading/error/retry, and refresh.

- [ ] **Step 1: Write failing presentation tests**

Assert common totals, Ukrainian formatting, non-null owner/manager values only, master-specific values, recent activity, isYardEmpty onboarding, trial/pastDue/cancelled/blocked/quota guidance, billing CTA only when billing view is allowed, and semantic single-flight loading/retry/refresh states.

    npm test -- src/cabinet/dashboard/DashboardSummary.test.tsx src/cabinet/dashboard/DashboardBillingBanner.test.tsx src/cabinet/dashboard/DashboardScreen.test.tsx

Expected: FAIL.

- [ ] **Step 2: Implement summary cards**

Use Intl.NumberFormat('uk-UA') and Intl.DateTimeFormat('uk-UA'). Include nullable fields only when non-null. Use section, dl, dt, and dd. Skeletons are aria-hidden with one containing status.

- [ ] **Step 3: Implement billing guidance**

Read snapshot.entitlement and snapshot.subscription only. Use existing cabinetPath destinations. Render no CTA when evaluateModuleAccess for billing view is denied.

- [ ] **Step 4: Compose heading, refresh, summary, and empty state**

Heading names targetTenant.name. Refresh uses the hook single-flight action and aria-busy. Summary error retries summary only.

    npm test -- src/cabinet/dashboard/DashboardSummary.test.tsx src/cabinet/dashboard/DashboardBillingBanner.test.tsx src/cabinet/dashboard/DashboardScreen.test.tsx
    npm run typecheck
    npm run lint

Expected: PASS.

- [ ] **Step 5: Commit**

    git add src/cabinet/dashboard
    git commit -m "feat(web): render dashboard summary and billing guidance"

---

### Task 6: Render Accessible Analytics

**Files:**
- Create: src/cabinet/dashboard/DashboardAnalytics.tsx
- Create: src/cabinet/dashboard/DashboardAnalytics.test.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.test.tsx

**Interfaces:**
- Consumes: DashboardAnalytics, selected period, period callback, analytics loadable, and analytics retry.
- Produces: accessible period controls, textual/CSS trends, optional top part, scoped loading, and scoped errors.

- [ ] **Step 1: Write failing analytics tests**

Assert three buttons with exactly one aria-pressed state; click/keyboard changes once; currencies come from the response; trend sign/value is text; parts/orders totals and deltas are authoritative; CSS bars are decorative; topPart is optional; analytics loading/error leaves summary mounted; retry is analytics-only.

    npm test -- src/cabinet/dashboard/DashboardAnalytics.test.tsx

Expected: FAIL.

- [ ] **Step 2: Implement analytics**

Use native buttons in a labelled group with min-h-11. Use headings/lists for metrics. Scale decorative bars against the maximum absolute value and handle all-zero series without division by zero.

- [ ] **Step 3: Compose analytics into DashboardScreen**

Pass the URL-derived period and writeDashboardPeriod callback. Preserve ready summary content during analytics transitions.

    npm test -- src/cabinet/dashboard/DashboardAnalytics.test.tsx src/cabinet/dashboard/DashboardScreen.test.tsx
    npm run typecheck
    npm run lint

Expected: PASS.

- [ ] **Step 4: Commit**

    git add src/cabinet/dashboard
    git commit -m "feat(web): add accessible dashboard analytics"

---

### Task 7: Add Policy-Derived Dashboard Destinations

**Files:**
- Create: src/cabinet/dashboard/DashboardDestinations.tsx
- Create: src/cabinet/dashboard/DashboardDestinations.test.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.tsx
- Modify: src/cabinet/dashboard/DashboardScreen.test.tsx

**Interfaces:**
- Consumes: cabinetModules, evaluateModuleAccess, cabinetPath, TenantAccessSnapshot, and tenant slug.
- Produces: released/view-allowed links and released/mutation-allowed quick actions.

- [ ] **Step 1: Write failing policy matrix tests**

Build owner, manager, master, missing-feature, blocked-subscription, and exhausted-quota snapshots. Assert only released destinations become links/actions; view and mutation decisions are respected; unreleased future modules never appear as working links; generated links remain within /app/:tenant; no dashboard permission is introduced.

    npm test -- src/cabinet/dashboard/DashboardDestinations.test.tsx

Expected: FAIL.

- [ ] **Step 2: Implement destination derivation**

Derive from Object.values(cabinetModules), exclude dashboard itself, and call evaluateModuleAccess for view/mutation. If no operational module is released, show concise preparation guidance rather than dead buttons.

- [ ] **Step 3: Compose and verify**

Place destinations after analytics. Keep unique labels and 44px mobile targets.

    npm test -- src/cabinet/dashboard/DashboardDestinations.test.tsx src/cabinet/dashboard/DashboardScreen.test.tsx
    npm run typecheck
    npm run lint

Expected: PASS.

- [ ] **Step 4: Commit**

    git add src/cabinet/dashboard
    git commit -m "feat(web): add policy-derived dashboard destinations"

---

### Task 8: Update Parity Evidence and Browser Coverage

**Files:**
- Modify: docs/parity/mobile-web-parity.yaml
- Regenerate: docs/parity/mobile-web-parity.md
- Modify: scripts/parity-matrix.test.ts
- Modify: e2e/cabinet-shell.spec.ts
- Modify: scripts/auth-e2e-upstream.mjs
- Modify: scripts/auth-e2e-upstream.test.ts

**Interfaces:**
- Consumes: implemented route/API behavior and deterministic parity generator.
- Produces: exact tenant dashboard evidence and authenticated browser coverage at 320/768/1024/1440 widths.

- [ ] **Step 1: Write failing parity/fixture assertions**

Require /app/:tenant/dashboard and /app/:tenant/dashboard?period=week for ROZ-106 outcomes. Add deterministic dashboard/analytics fixture responses and per-period request counters.

    npm test -- scripts/parity-matrix.test.ts scripts/auth-e2e-upstream.test.ts

Expected: FAIL.

- [ ] **Step 2: Update and regenerate parity evidence**

Change only the three ROZ-106 dashboard capabilities.

    npm run parity:generate
    npm run parity:check

Expected: generated Markdown is byte-identical on check.

- [ ] **Step 3: Add authenticated E2E coverage**

Cover direct week load; one summary/analytics request; month URL/request; back to week; summary and analytics retries; tenant switch without stale totals; keyboard traversal; no critical/serious Axe violations; no horizontal overflow at 320, 768, 1024, 1440. Never snapshot/log tenant or activity payloads.

    npm run build:qa
    npx playwright test e2e/cabinet-shell.spec.ts --project=chromium

Expected: PASS.

- [ ] **Step 4: Run focused integration and commit**

    npm test -- scripts/parity-matrix.test.ts scripts/auth-e2e-upstream.test.ts src/api/dashboard-contract.test.ts src/api/dashboard.test.ts src/cabinet/dashboard
    npm run parity:check
    git diff --check
    git add docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md scripts/parity-matrix.test.ts e2e/cabinet-shell.spec.ts scripts/auth-e2e-upstream.mjs scripts/auth-e2e-upstream.test.ts
    git commit -m "test(web): cover ROZ-106 dashboard end to end"

Expected: PASS.

---

### Task 9: Broad Review and Completion Verification

**Files:**
- Review: exact diff from the pre-ROZ-40 merge parent through HEAD.
- Fix only: confirmed Critical/Important findings in ROZ-40 integration or ROZ-106.

**Interfaces:**
- Consumes: all prior task commits.
- Produces: APPROVE with no unresolved Critical/Important findings and a clean intended worktree.

- [ ] **Step 1: Run spec-compliance review**

Use superpowers:requesting-code-review against the spec, exact branch diff, Core OpenAPI schemas, and no-dashboard.view decision. Fix confirmed Critical/Important findings with tests and re-review to APPROVE.

- [ ] **Step 2: Run broad code-quality/security review**

Review tenant leakage, stale responses, cancellation races, malformed payloads, nullable privileged data, policy bypass, URL loops, duplicate requests, sensitive logging, accessibility, and responsive overflow. Fix and re-review all confirmed Critical/Important issues.

- [ ] **Step 3: Run complete verification from a clean install**

Use superpowers:verification-before-completion:

    npm ci
    npm run check
    npm run build
    npm run build:qa
    npm run build:prod
    npm run test:e2e
    npm run check:routes
    npm run check:prerender
    npm run budget:assets
    git diff --check
    git status --short --branch

Expected: every command exits 0 and no unintended changes remain. Report dependency, pending install-script, browser, Lighthouse, or environment warnings. Do not run audit fixes or deployment commands.

- [ ] **Step 4: Commit final confirmed fixes if required**

    git add -- src/api src/cabinet/dashboard src/cabinet/screens/cabinet-home.tsx src/routes/routes.test.tsx docs/parity/mobile-web-parity.yaml docs/parity/mobile-web-parity.md scripts/parity-matrix.test.ts scripts/auth-e2e-upstream.mjs scripts/auth-e2e-upstream.test.ts e2e/cabinet-shell.spec.ts
    git commit -m "fix(web): address ROZ-106 final review"

Skip when no fixes are needed. Re-run the complete gate after any fix.

- [ ] **Step 5: Prepare root-branch handoff**

Use superpowers:finishing-a-development-branch. Do not merge or deploy. Before push, PR creation, or Linear completion/status changes, present an exact external mutation preview and obtain user approval.

Report behavior, commits/HEAD, exact verification results, warnings/flakes, review verdict, push/PR/Linear state, and remaining ROZ-102/ROZ-103 blockers.
