# ROZ-104 Inventory Management Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a responsive Web management and reconciliation experience for Core inventory while keeping physical counting Mobile-only.

**Architecture:** Generate the ROZ-104 Core client contract from ROZ-102, wrap inventory operations in one typed API module, and register one permission-gated cabinet module with stable detail routes. Split presentation by overview, warehouse, session, results, audit, and part-placement responsibilities while sharing small inventory format/status helpers.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vite 8, Tailwind CSS 4, Radix UI, Vitest, Testing Library, Playwright, openapi-typescript 7.13.0.

**Spec:** `docs/superpowers/specs/2026-09-02-inventory-management-web-design.md`

## Global Constraints

- Physical scanning, lease acquisition/heartbeat, offline replay, and counting stay Mobile-only.
- Core is authoritative; Web must consume the generated v1 contract and shared API client.
- All read and mutation operations remain tenant-scoped and permission-gated.
- Match the existing dark cabinet UI kit and preserve keyboard, focus, contrast, and reduced-motion behavior.
- No deployment, production migration, pull request, or branch push without explicit authorization.

---

### Task 1: Publish and consume the inventory contract

**Files:**
- Modify generated: `src/api/generated/core.ts`
- Test: `src/api/inventory.test.ts`
- Create: `src/api/inventory.ts`

**Interfaces:**
- Consumes: ROZ-102 `contracts/openapi/v1/rozbirka-core.json`.
- Produces: `inventoryApi` methods for warehouses, zones, sessions, results, scans, adjustments, audit, and part-zone placement.

- [ ] **Step 1: Generate `core.ts` from the local ROZ-102 artifact while preserving the Identity artifact.**
- [ ] **Step 2: Write failing adapter tests for exact HTTP methods, paths, query parameters, request bodies, abort signals, and envelope unwrapping.**
- [ ] **Step 3: Run `npm test -- src/api/inventory.test.ts` and confirm failures are missing exports/behavior.**
- [ ] **Step 4: Implement the minimal typed adapter using `apiClient`; do not add screen-local requests.**
- [ ] **Step 5: Re-run the adapter test and `npm run typecheck`; expect zero failures.**
- [ ] **Step 6: Commit with `feat(web): add inventory api contract` after review.**

### Task 2: Register navigation, permissions, and routes

**Files:**
- Modify: `src/cabinet/access-types.ts`
- Modify: `src/cabinet/module-registry.ts`
- Modify: `src/routes/routes.tsx`
- Modify: `src/cabinet/cabinet-paths.ts`
- Test: `src/cabinet/module-registry.test.ts`
- Test: `src/cabinet/cabinet-paths.test.ts`
- Test: `src/routes/routes.test.tsx`

**Interfaces:**
- Consumes: permission strings `inventory.view`, `inventory.manage`, `inventory.adjust`, `inventory.zones.manage`.
- Produces: `CabinetModuleKey` value `inventory` and stable nested inventory routes.

- [ ] **Step 1: Add failing assertions for navigation visibility, exact route construction, and permission denial.**
- [ ] **Step 2: Run focused tests and verify they fail because `inventory` is unknown.**
- [ ] **Step 3: Register the module in the stock group and lazy inventory route screens.**
- [ ] **Step 4: Re-run focused tests and typecheck; expect green.**
- [ ] **Step 5: Commit with `feat(web): register inventory cabinet routes` after review.**

### Task 3: Build warehouse and zone management

**Files:**
- Create: `src/cabinet/inventory/inventory-format.ts`
- Create: `src/cabinet/inventory/InventoryOverviewScreen.tsx`
- Create: `src/cabinet/inventory/WarehouseScreen.tsx`
- Create: `src/cabinet/inventory/ZoneLabels.tsx`
- Test: `src/cabinet/inventory/InventoryOverviewScreen.test.tsx`
- Test: `src/cabinet/inventory/WarehouseScreen.test.tsx`

**Interfaces:**
- Consumes: warehouse/zone API and the cabinet `DataTable`, `RecordCard`, `FormDialog`, `ConfirmDialog`, `StatusPill`, and toast primitives.
- Produces: responsive warehouse list, create/edit/archive flows, zone management, and printable QR labels.

- [ ] **Step 1: Write failing behavior tests for loading, empty, retry, responsive records, permissions, form validation, and archive confirmation.**
- [ ] **Step 2: Verify RED with the two focused Vitest files.**
- [ ] **Step 3: Implement overview and warehouse screens with desktop tables and narrow cards from the same semantic records.**
- [ ] **Step 4: Add QR label rendering/print behavior using the existing `qrcode` dependency.**
- [ ] **Step 5: Run focused tests, accessibility assertions, and typecheck; expect green.**
- [ ] **Step 6: Commit with `feat(web): manage inventory warehouses and zones` after review.**

### Task 4: Build session lifecycle and live progress

**Files:**
- Create: `src/cabinet/inventory/InventorySessionScreen.tsx`
- Create: `src/cabinet/inventory/InventorySessionForm.tsx`
- Create: `src/cabinet/inventory/use-inventory-resource.ts`
- Test: `src/cabinet/inventory/InventorySessionScreen.test.tsx`

**Interfaces:**
- Consumes: session create/start/reopen/complete/cancel/read APIs.
- Produces: management-only session lifecycle, per-zone progress, lease display, and visibility-aware polling for active sessions.

- [ ] **Step 1: Write failing tests for legal actions by status, permission boundaries, confirmation, stale responses, and polling only while active/visible.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement abortable resource loading and guarded mutations without camera/counting controls.**
- [ ] **Step 4: Render desktop progress table and narrow progress cards with Mobile-aligned status copy.**
- [ ] **Step 5: Re-run focused tests and typecheck; expect green.**
- [ ] **Step 6: Commit with `feat(web): manage inventory sessions` after review.**

### Task 5: Build results, adjustment, audit, and part placement

**Files:**
- Create: `src/cabinet/inventory/InventoryResultsScreen.tsx`
- Create: `src/cabinet/inventory/InventoryAuditScreen.tsx`
- Create: `src/cabinet/inventory/PartInventoryPlacement.tsx`
- Modify: `src/cabinet/parts/PartsScreen.tsx`
- Test: `src/cabinet/inventory/InventoryResultsScreen.test.tsx`
- Test: `src/cabinet/inventory/InventoryAuditScreen.test.tsx`
- Test: `src/cabinet/parts/PartsScreen.test.tsx`

**Interfaces:**
- Consumes: results, adjustment, audit, scans, and part-zone APIs.
- Produces: discrepancy filtering, reason-required adjustment, read-only journal/audit, and part-zone assignment.

- [ ] **Step 1: Write failing tests for discrepancy semantics, adjustment permission/reason, immutable audit display, read-only scans, and zone assignment.**
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement responsive result and audit tables/cards plus guarded dialogs.**
- [ ] **Step 4: Integrate placement into the existing part detail route without changing part mutations.**
- [ ] **Step 5: Re-run focused tests and typecheck; expect green.**
- [ ] **Step 6: Commit with `feat(web): review and reconcile inventory` after review.**

### Task 6: Parity evidence and release verification

**Files:**
- Modify: `docs/parity/mobile-web-parity.yaml`
- Regenerate: `docs/parity/mobile-web-parity.md`
- Modify: `e2e/cabinet-shell.spec.ts`

**Interfaces:**
- Consumes: all previous inventory routes and accessibility names.
- Produces: auditable parity entries and browser coverage at desktop/tablet/mobile widths.

- [ ] **Step 1: Add failing parity and Playwright expectations for management routes, responsive navigation, denied actions, and absence of camera controls.**
- [ ] **Step 2: Update parity source and regenerate its Markdown artifact.**
- [ ] **Step 3: Run `npm run check`, `npm run build:prod`, and focused Playwright tests.**
- [ ] **Step 4: Run `npm run contracts:check` with the exact local Core and Identity artifacts.**
- [ ] **Step 5: Inspect `git diff --check`, generated drift, scope, and responsive screenshots.**
- [ ] **Step 6: Commit with `test(web): verify inventory management parity` after review.
