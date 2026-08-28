# ROZ-104 Commerce Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the seven commerce and inventory Web parity child tasks ROZ-108–ROZ-115 assigned to `codex/roz-104-commerce`, with separate commits and browser-stable routes.

**Architecture:** Each Linear child is a vertical slice with a tenant-scoped API adapter, a route-level cabinet screen, and focused tests. Domain files are independent; only the integrator edits shared route and module registry files. Runtime payloads must match the immutable Core OpenAPI artifact and observable Mobile behavior; the client never invents financial, availability, ROI, balance, or allocation rules.

**Tech Stack:** React 19, React Router 7, TypeScript 6, Vitest 4, Testing Library, Axios shared API client.

**Spec:** `docs/parity/mobile-web-parity.yaml` and the current Linear descriptions for ROZ-108, ROZ-109, ROZ-110, ROZ-111, ROZ-112, ROZ-113, and ROZ-115.

## Global Constraints

- Work only in `/Users/user/Code/rozbirka/rozbirka.web/.worktrees/roz-104-commerce` on `codex/roz-104-commerce`.
- Treat `/Users/user/Code/rozbirka/rozbirka.core/.worktrees/roz-102-core-primary/contracts/openapi/v1/rozbirka-core.json`, Mobile API modules, and Core controllers/DTOs as read-only contract evidence.
- Keep every request tenant-scoped through the existing shared API client and existing cabinet access boundary.
- Preserve server authority for ROI, availability, balances, totals, currency validation, allocations, reservations, permissions, billing, and conflicts.
- Every production behavior starts with a focused failing test and a confirmed RED run.
- Do not run Playwright, browser E2E, browser automation, the full E2E suite, or the full `npm test`; do not stop or signal the process occupying `127.0.0.1:4174`.
- Do not push, merge, deploy, create PRs, or mutate Linear.
- Commit each Linear child separately and include its ID in the commit subject.

---

### Task 1: ROZ-109 Cars, Expenses, and ROI

**Files:**
- Create: `src/api/cars.ts`, `src/api/cars.test.ts`
- Create: `src/cabinet/cars/CarsScreen.tsx`, `src/cabinet/cars/CarsScreen.test.tsx`
- Integrator modifies: `src/routes/routes.tsx`, `src/routes/routes.test.tsx`, `src/cabinet/module-registry.ts`, `src/cabinet/module-registry.test.ts`

**Interfaces:**
- Stable routes: `/app/:tenant/cars`, `/app/:tenant/cars/new`, `/app/:tenant/cars/:carId`, `/app/:tenant/cars/:carId/edit`, `/app/:tenant/cars/:carId/warehouse`.
- Query state preserves server-side search, filters, and pagination in the URL.
- Car mutations send only OpenAPI-defined fields; expense and ROI displays consume authoritative server fields.

- [ ] Write API and screen tests that fail because the adapters and screens do not exist.
- [ ] Run `npx vitest run src/api/cars.test.ts src/cabinet/cars/CarsScreen.test.tsx` and confirm the expected RED failure.
- [ ] Implement the minimal OpenAPI-aligned adapter and accessible list/detail/form/expense flow.
- [ ] Re-run the focused tests and keep them green.
- [ ] Integrator registers routes and module release state, runs route/policy tests, and commits with `ROZ-109`.

### Task 2: ROZ-108 Vehicle Intake

**Files:**
- Create: `src/api/intakes.ts`, `src/api/intakes.test.ts`
- Create: `src/cabinet/intakes/IntakesScreen.tsx`, `src/cabinet/intakes/IntakesScreen.test.tsx`
- Integrator modifies the shared route/registry files listed in Task 1.

**Interfaces:**
- Stable routes: `/app/:tenant/intakes`, `/app/:tenant/intakes/new`, `/app/:tenant/intakes/batch`, `/app/:tenant/intakes/:intakeId`, `/app/:tenant/intakes/:intakeId/edit`, `/app/:tenant/intakes/:intakeId/parts/new`.
- Search, status, and pagination remain URL-stable; supplier/date/cost/notes/media/ROI are server payload fields.

- [ ] Write failing API and screen tests for list/detail/create/edit/delete and part creation without silent item truncation.
- [ ] Confirm RED with focused Vitest.
- [ ] Implement the minimal adapter and accessible screen flow.
- [ ] Re-run focused tests.
- [ ] Integrator registers routes and commits with `ROZ-108`.

### Task 3: ROZ-110 Parts, Compatibility, Reservations, and Media

**Files:**
- Create: `src/api/parts.ts`, `src/api/parts.test.ts`
- Create: `src/cabinet/parts/PartsScreen.tsx`, `src/cabinet/parts/PartsScreen.test.tsx`
- Integrator modifies the shared route/registry files listed in Task 1.

**Interfaces:**
- Stable routes: `/app/:tenant/parts`, `/app/:tenant/parts/new`, `/app/:tenant/parts/:partId`, `/app/:tenant/parts/:partId/edit`.
- Search/filter/page state stays in the URL; availability, reservation quantities, compatibility, history, and media ownership are server-authoritative.

- [ ] Write failing adapter and screen tests, including compatibility round-trip and explicit HEIC/retry/delete outcomes.
- [ ] Confirm RED with focused Vitest.
- [ ] Implement the minimal OpenAPI-aligned adapter and screens.
- [ ] Re-run focused tests.
- [ ] Integrator registers routes and commits with `ROZ-110`.

### Task 4: ROZ-111 QR/VIN/OEM Scanners and Stickers

**Files:**
- Create: `src/api/scanners.ts`, `src/api/scanners.test.ts`, `src/api/stickers.ts`, `src/api/stickers.test.ts`
- Create: `src/cabinet/scanners/ScannerScreen.tsx`, `src/cabinet/scanners/ScannerScreen.test.tsx`
- Create: `src/cabinet/stickers/StickersScreen.tsx`, `src/cabinet/stickers/StickersScreen.test.tsx`
- Integrator modifies the shared route/registry files listed in Task 1.

**Interfaces:**
- Stable routes: `/app/:tenant/scan`, `/app/:tenant/stickers`; existing `/scan/:qrCode` remains an authenticated resume link.
- Camera is an optional adapter; manual and file inputs remain usable after denial or unsupported APIs.
- QR lookup reveals no data before tenant-authorized server resolution; sticker PDF uses authenticated download and revokes temporary object URLs.

- [ ] Write failing tests for camera denial fallback, manual/file inputs, tenant-scoped lookup, and print/download fallback.
- [ ] Confirm RED with focused Vitest.
- [ ] Implement adapters and accessible screens.
- [ ] Re-run focused tests.
- [ ] Integrator registers routes and commits with `ROZ-111`.

### Task 5: ROZ-113 Customers and Order History

**Files:**
- Create: `src/api/customers.ts`, `src/api/customers.test.ts`
- Create: `src/cabinet/customers/CustomersScreen.tsx`, `src/cabinet/customers/CustomersScreen.test.tsx`
- Integrator modifies the shared route/registry files listed in Task 1.

**Interfaces:**
- Stable routes: `/app/:tenant/customers`, `/app/:tenant/customers/new`, `/app/:tenant/customers/:customerId`, `/app/:tenant/customers/:customerId/edit`.
- Search is server-side and URL-stable; history and statistics are authoritative responses, never derived from the visible page.
- Telephone and SMS actions use browser-native links without logging PII; create-order preselection uses a customer ID query parameter.

- [ ] Write failing API/screen tests for server search, CRUD/activation, authoritative statistics, and safe contact links.
- [ ] Confirm RED with focused Vitest.
- [ ] Implement the adapter and screens.
- [ ] Re-run focused tests.
- [ ] Integrator registers routes and commits with `ROZ-113`.

### Task 6: ROZ-112 Canonical Orders and Sales

**Files:**
- Create: `src/api/orders.ts`, `src/api/orders.test.ts`
- Create: `src/cabinet/orders/OrdersScreen.tsx`, `src/cabinet/orders/OrdersScreen.test.tsx`
- Integrator modifies the shared route/registry files listed in Task 1.

**Interfaces:**
- Stable routes: `/app/:tenant/orders`, `/app/:tenant/orders/new`, `/app/:tenant/orders/:orderId`, `/app/:tenant/orders/:orderId/items/new`.
- No direct-sale route is added. Mutations disable duplicate submission; immutable idempotency headers are used only where the authoritative OpenAPI contract supports them, and missing coverage is reported as a Core blocker.
- Currency/allocation/payment validation remains server-side and API conflicts are explicit.

- [ ] Write failing API/screen tests for canonical creation, reservation/confirmation, payments, cancellation/refund, audit display, and double-submit prevention.
- [ ] Confirm RED with focused Vitest.
- [ ] Implement the minimal adapter and screens.
- [ ] Re-run focused tests.
- [ ] Integrator registers routes and commits with `ROZ-112`.

### Task 7: ROZ-115 Cash Registers, Balances, and Transactions

**Files:**
- Create: `src/api/cash.ts`, `src/api/cash.test.ts`
- Create: `src/cabinet/cash/CashScreen.tsx`, `src/cabinet/cash/CashScreen.test.tsx`
- Integrator modifies the shared route/registry files listed in Task 1.

**Interfaces:**
- Stable routes: `/app/:tenant/cash`, `/app/:tenant/cash/new`, `/app/:tenant/cash/:registerId`, `/app/:tenant/cash/:registerId/edit`.
- Daily totals, balances, currencies, and ledger results are authoritative server values.
- Manual movements and register mutations disable duplicate submission; immutable idempotency headers are used only where the authoritative OpenAPI contract supports them. Transfer remains unavailable unless the contract proves a safe atomic operation.

- [ ] Write failing API/screen tests for register CRUD, daily totals, ledger, manual income/expense, and explicit conflict/permission/billing states.
- [ ] Confirm RED with focused Vitest.
- [ ] Implement the minimal adapter and screens.
- [ ] Re-run focused tests.
- [ ] Integrator registers routes and commits with `ROZ-115`.

### Task 8: Integrated Verification and Handoff

**Files:**
- Modify only tests or domain files required by verified integration defects.

- [ ] Run focused domain, route, registry, policy, and cabinet tests.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run parity:check`, and `npm run build`.
- [ ] Run focused unit, API/contract, and non-browser integration suites only; browser E2E and the full suite remain explicitly prohibited.
- [ ] Run `git diff --check`, inspect commit boundaries, and obtain a whole-branch code review.
- [ ] Report commit SHA per Linear child and the dependency-preserving cherry-pick order into `vsobol/roz-104-frontend-rozbirkaweb-primary`.
