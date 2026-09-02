# Inventory Management Web Design

**Date:** 2026-09-02
**Status:** Approved
**Repositories:** `rozbirka.core` ROZ-102 and `rozbirka.web` ROZ-104

## Goal

Expose the inventory zoning and reconciliation domain on Web as a responsive
management and results surface. Physical QR scanning, zone lease acquisition,
lease heartbeat, offline scan replay, and zone counting remain Mobile-only.

## Architecture

Core remains the single source of truth. ROZ-102 merges current Core `develop`,
keeps its deterministic v1 OpenAPI machinery, and republishes the inventory
controllers, DTOs, permissions, and error codes through the committed contract.
ROZ-104 generates TypeScript from that artifact and adds a first-class
`inventory` cabinet module; Web contains no duplicate inventory business rules.

## Web information architecture

The primary route is `/app/:tenant/inventory`. It opens a management overview
with warehouses and recent sessions. Stable detail routes are:

- `/inventory/warehouses/:warehouseId` for zones and zone-label printing;
- `/inventory/sessions/new` for session creation;
- `/inventory/sessions/:sessionId` for progress and lifecycle actions;
- `/inventory/sessions/:sessionId/results` for reconciliation and adjustments;
- `/inventory/sessions/:sessionId/audit` for the immutable audit trail;
- `/parts/:partId/inventory` for zone placement from the part context.

The module uses `inventory.view` for entry/read surfaces. Mutations are checked
at the action boundary with `inventory.zones.manage`, `inventory.manage`, or
`inventory.adjust`. Hiding a button never replaces Core authorization.

## Responsive presentation

The visual language stays aligned with the current dark Rozbirka cabinet and
Mobile inventory: near-black canvas, elevated graphite panels, orange primary
actions, compact status pills, and Ukrainian operational copy. Desktop uses a
summary grid plus dense tables and side-by-side detail panels. Tablet collapses
secondary columns and keeps actions in toolbars. Narrow Web uses stacked record
cards and bottom-safe full-width actions. There is no camera UI on Web.

## Data and refresh

The API adapter is isolated in `src/api/inventory.ts` and unwraps the existing
Core `Result<T>` envelope consistently. Initial loads use abortable requests.
Active session detail polls at a modest interval while the page is visible so
Mobile scans become visible without manual refresh; completed/cancelled sessions
do not poll. Mutations reload the affected resource and surface stable Core
errors without optimistic lifecycle transitions.

The existing Core endpoints cover warehouses, zones, part-zone placement,
session lifecycle, results, adjustments, audit, and read-only scans. No
browser-only endpoint is added unless generated-contract integration proves a
missing management query.

## States and safeguards

Every route provides loading, empty, retryable error, denied, and stale-action
states. Destructive archive/cancel/reopen/complete/adjust actions require a
confirmation surface. Adjustment requires a non-empty reason. Active leases
are shown as informational ownership/expiry state; Web cannot acquire or force
release them in this scope.

## Testing

Core gates are build, inventory-focused tests, the complete Core test project,
and deterministic OpenAPI generation/check. Web uses test-first API adapter,
permission/navigation, route, overview, session/result, and responsive behavior
coverage. Final validation is `npm run check`, production build, focused
Playwright cabinet coverage, and Core contract drift verification.

## Out of scope

- Browser camera access or QR recognition;
- offline scan queue or background synchronization;
- acquiring, heartbeating, force-releasing, or completing a counting lease;
- changing Mobile counting behavior;
- deployment, production migration, or pull-request creation.
