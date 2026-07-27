# Marketplace Design Spec

## Goal

Build a public marketplace for Rozbirka where buyers can discover published parts from dismantlers, while keeping marketplace ownership, public data, seller publishing, and inventory operations isolated from the existing parts, orders, billing, and account flows.

## Scope

This spec covers the architecture and phased product design for:

- Public marketplace catalog at `/marketplace`.
- Public shop profiles for dismantlers.
- Future seller tools that let web and mobile users create a shop and publish parts from inventory.

This spec does not implement checkout, online payments, delivery, buyer accounts, chat, or order placement inside the marketplace. Initial buyer contact is lead-oriented: call, message, or request availability.

## Architectural Principle

Marketplace is a separate bounded context.

Inventory `Part` remains the internal source of truth for warehouse quantity, reservations, sales, QR codes, part events, internal notes, car/intake ownership, and tenant ownership. Marketplace owns only the public sales projection of inventory.

The marketplace module may reference a part by id and read a narrow inventory availability interface, but it must not add marketplace fields to `Part`, reuse `PartDto` as a public DTO, or route public marketplace reads through `/parts`.

## Backend Module Boundary

Create a new backend module or namespace under `rozbirka.core`:

```text
Marketplace
  Controllers
  DTOs
  Entities
  Services
  Repositories
  Validators
```

The module owns:

- `MarketplaceShop`
- `MarketplaceListing`
- public marketplace queries
- seller marketplace commands
- listing lifecycle rules
- marketplace-specific permissions
- marketplace monetization gates

The module depends on inventory through an interface, for example:

```csharp
public interface IMarketplaceInventoryReader
{
    Task<MarketplacePartSnapshot?> GetPublishablePartAsync(Guid tenantId, Guid partId, CancellationToken ct);
    Task<MarketplacePartAvailability?> GetPartAvailabilityAsync(Guid tenantId, Guid partId, CancellationToken ct);
}
```

The inventory implementation can live near existing parts code, but marketplace code should consume only this interface.

> **Revision 2026-06-14:** the marketplace module does **not** depend on subscription/billing. The earlier `IMarketplaceEntitlements` interface is removed. Access is governed solely by permissions plus the platform's existing active-subscription gate (see Access Model). The module-owns list above no longer includes "marketplace monetization gates."

## Data Model

### MarketplaceShop

```text
Id
TenantId
Slug
DisplayName
Description
City
LogoUrl
Phone
PublicContactName
IsPublished
CreatedAt
UpdatedAt
```

Rules:

- One shop per tenant for the first version.
- `Slug` is globally unique and stable for public URLs.
- Shop can exist as draft while hidden from public marketplace.
- Public listings require a published shop.

### MarketplaceListing

```text
Id
TenantId
ShopId
PartId
Slug
Title
Description
Price
Currency
Photos
Condition
VehicleMake
VehicleModel
VehicleYear
OemCode
QuantityPublished
Status
PublishedAt
CreatedAt
UpdatedAt
ArchivedAt
```

`Status` values:

```text
draft
published
hidden
sold
archived
```

Rules:

- `PartId` is required for first version. Marketplace listings are created from warehouse parts.
- Public listing data is copied into listing fields at publish time, then can be edited independently from internal inventory text.
- Availability is computed from inventory at read time for the first version.
- Public reads only return listings where listing status is `published`, shop is published, tenant is active, and computed available quantity is greater than zero.
- If computed availability reaches zero, the listing is not returned in public search. Seller UI can show it as unavailable.

## API Design

### Public API

No auth required.

```text
GET /api/v1/marketplace/listings
GET /api/v1/marketplace/listings/{slugOrId}
GET /api/v1/marketplace/shops/{slug}
GET /api/v1/marketplace/shops/{slug}/listings
```

`GET /api/v1/marketplace/listings` supports:

```text
q
city
make
model
yearFrom
yearTo
condition
minPrice
maxPrice
page
per_page
sort
```

Public response DTOs are marketplace DTOs only:

```text
MarketplaceListingCardDto
MarketplaceListingDetailDto
MarketplaceShopPublicDto
MarketplaceSearchResultDto
```

Public DTOs must not expose:

- tenant internal ids unless needed as opaque ids
- internal part notes
- QR code
- created-by user
- intake id
- internal car vin
- order/reservation data
- billing/subscription state

### Seller API

Auth and tenant required.

```text
GET /api/v1/marketplace/shop
PUT /api/v1/marketplace/shop
GET /api/v1/marketplace/seller/listings
POST /api/v1/marketplace/seller/listings/from-part/{partId}
PATCH /api/v1/marketplace/seller/listings/{listingId}
POST /api/v1/marketplace/seller/listings/{listingId}/publish
POST /api/v1/marketplace/seller/listings/{listingId}/hide
POST /api/v1/marketplace/seller/listings/{listingId}/archive
```

Seller commands go through marketplace services, not parts controllers.

Required permission:

```text
marketplace.view
marketplace.manage
```

`marketplace.manage` depends on `marketplace.view` and `parts.view`. Publishing from inventory also requires `parts.view`; editing inventory remains guarded by `parts.manage`.

> **Revision 2026-06-14 — monetization removed.** Marketplace is a feature bundled into the existing subscription. There is **no** marketplace-specific billing logic: no listing-count limits, no plan tiers, no entitlement interface, no paywall conflict codes. Seller write APIs are guarded only by (a) the `marketplace.view` / `marketplace.manage` permissions above and (b) the platform's existing active-subscription/trial gate that already protects authenticated tenant operations. The sections below describing plan limits, the publish counting gate, analytics tiers, featured placement, and commission are superseded by the "Access Model" section and retained only as historical context.

## Access Model

Marketplace is available to any tenant whose subscription is active (or in trial) — the same gate the rest of the authenticated app already uses. The marketplace module performs **no** plan-feature resolution, listing counting, or billing checks of its own.

Publishing a listing requires only:

1. The caller has `marketplace.manage`.
2. The tenant has a published shop.
3. The listing is in a publishable state.
4. Inventory availability for the part is greater than zero.

Drafts can be created freely. There is no per-plan listing cap. If a tenant's subscription lapses, the platform's existing subscription gate blocks seller mutations; stored shops and listings are never deleted, and public visibility follows the normal published/availability rules.

Out of scope for this rebuild (may be modeled later, not implemented now): `MarketplacePromotion`, featured placement, advanced seller analytics, and sales commission.

## Monetization Model (HISTORICAL — superseded by Access Model)

Marketplace monetization is part of the first architecture version.

Initial monetization uses subscriptions and plan limits, not sales commission. This matches the current Rozbirka billing model and avoids requiring platform-controlled payments, seller payouts, refunds, disputes, or delivery reconciliation in the first marketplace release.

### Plan Features

Billing exposes marketplace features as stable feature codes:

```text
marketplace.enabled
marketplace.shop
marketplace.published_listings
marketplace.analytics
marketplace.bulk_publish
marketplace.featured_placement
```

Plan limits:

```text
marketplacePublishedListingsMax
marketplaceFeaturedListingsMax
```

Example plan shape:

```text
Trial
- marketplace enabled
- shop enabled
- 10 published listings
- no advanced analytics
- no featured placement

Lite
- shop enabled
- 50 published listings
- basic listing stats
- no featured placement

Pro
- shop enabled
- 500 published listings
- seller analytics
- limited featured placement
- bulk publish

Business
- high or unlimited published listings
- advanced analytics
- more featured placements
- priority support
```

Exact plan names and numeric limits remain billing catalog decisions, but marketplace must consume them through `IMarketplaceEntitlements`.

### Publish Gate

Publishing is the monetization enforcement point.

`POST /api/v1/marketplace/seller/listings/{listingId}/publish` must:

1. Load marketplace entitlements for tenant.
2. Verify marketplace is enabled.
3. Verify tenant has active billing access.
4. Count currently published listings for tenant.
5. Compare count with `marketplacePublishedListingsMax`.
6. Verify listing is publishable and inventory availability is positive.
7. Publish listing.

Draft listing creation can be allowed even when the tenant is over the publish limit, but publishing must be blocked. This lets sellers prepare listings and then upgrade when ready.

### Shop Gate

Shop creation and editing require:

```text
marketplace.shop
```

If a tenant loses access, the shop and listings remain stored but public visibility is disabled until access is restored. The system must not delete shops/listings because of billing state.

### Analytics Gate

Basic metrics can be available to all marketplace-enabled plans:

```text
views
contact clicks
lead count
```

Advanced analytics requires:

```text
marketplace.analytics
```

Advanced analytics includes:

```text
top listings
conversion rates
zero-result demand
city/make/model demand
listing performance recommendations
```

### Featured Placement

Featured placement is a separate monetization surface, but it should be modeled from the start:

```text
MarketplacePromotion
- Id
- TenantId
- ListingId
- Type
- Status
- StartsAt
- EndsAt
- CreatedAt
```

Promotion types:

```text
featured_listing
featured_shop
city_boost
category_boost
```

First implementation may hide this UI, but the data model and entitlement checks should not make promotions impossible later.

### Commission Is Not MVP

Sales commission is not the first monetization model because first marketplace orders may be paid:

- on pickup
- by Nova Poshta cash on delivery
- by direct transfer to seller

The platform cannot reliably calculate, collect, refund, or audit commission until payment flows through the platform or marketplace orders become mandatory for sale completion.

Commission can be added later only after:

- platform online payment exists
- payout model is defined
- refund/dispute flow exists
- marketplace order lifecycle is required for seller completion

The architecture should therefore track `MarketplaceOrder` and lead attribution, but not depend on commission for first revenue.

## Frontend Web Boundary

`rozbirka.com/marketplace` is a separate product app mounted under the main domain.

It should not behave like one more landing page section. It has its own app shell, layout, navigation, route tree, search state, error/loading handling, and product-specific components. The first deployment can still live inside the existing `rozbirka.web` Vite app, but the code boundary must make future extraction to a separate frontend or subdomain straightforward.

Preferred structure:

```text
src/apps/marketplace/
  marketplace-app.tsx
  marketplace-layout.tsx
  marketplace-routes.tsx
  marketplace-nav.tsx
  marketplace-shell.tsx
```

Shared marketplace domain code:

```text
src/api/marketplace.ts
src/features/marketplace/
  types.ts
  marketplace-screen.tsx
  marketplace-header.tsx
  marketplace-filters.tsx
  listing-card.tsx
  listing-grid.tsx
  listing-detail-screen.tsx
  shop-profile-screen.tsx
  empty-state.tsx
  mock-data.ts
```

If the implementation chooses not to create `src/apps/marketplace` immediately, it must still keep marketplace route/layout code isolated enough that moving it later does not require rewriting landing, account, auth, billing, or site components.

In `rozbirka.web`, marketplace code should not live in `src/components/site/*`:

```text
src/api/marketplace.ts
src/features/marketplace/
  types.ts
  marketplace-screen.tsx
  marketplace-header.tsx
  marketplace-filters.tsx
  listing-card.tsx
  listing-grid.tsx
  listing-detail-screen.tsx
  shop-profile-screen.tsx
  empty-state.tsx
  mock-data.ts
```

The public route is:

```text
/marketplace
/marketplace/listings/:slugOrId
/marketplace/shops/:slug
```

Rules:

- `/marketplace` uses a marketplace app shell, not `App.tsx` landing composition.
- Marketplace has its own header/navigation optimized for catalog search and buyer actions.
- Marketplace routes should be lazy-loaded separately from landing and account routes.
- Public marketplace screens do not import `billingApi`, `tenantsApi`, `auth` guards, or account screen code.
- Public marketplace screens consume only `marketplaceApi`.
- `marketplaceApi` returns marketplace types, not `Part` or billing types.
- Temporary mock data may exist only inside `src/features/marketplace/mock-data.ts` and behind an API fallback. It should be removable without touching UI components.
- Code should remain extractable to `marketplace.rozbirka.com` or a dedicated frontend build if marketplace scale requires it.

Future seller web code should live separately:

```text
src/features/seller-marketplace/
```

Seller UI must not be mixed into the public marketplace feature.

## Mobile Boundary

Mobile should use the same seller API as web:

- create/update shop
- create listing from part
- publish/hide/archive listing
- view own seller listings

Mobile warehouse screens should not gain marketplace fields directly in the core part API. They can show marketplace status by calling seller marketplace endpoints or by receiving a small marketplace summary DTO if later optimized.

## Listing Lifecycle

1. Seller creates a warehouse part as usual.
2. Seller creates a marketplace listing from that part.
3. Marketplace service reads a `MarketplacePartSnapshot` from inventory.
4. Listing is created as `draft` with seeded public fields.
5. Seller edits public title, description, price, photos, and quantity.
6. Seller publishes listing.
7. Public marketplace returns the listing only while it is published and inventory availability is positive.
8. If the part sells or becomes fully reserved internally, public search no longer returns it.
9. Seller can hide or archive the listing without modifying the warehouse part.

## Error Handling

Use existing API error envelope conventions.

Expected marketplace errors:

```text
MARKETPLACE_SHOP_NOT_FOUND
MARKETPLACE_SHOP_SLUG_TAKEN
MARKETPLACE_SHOP_NOT_PUBLISHED
MARKETPLACE_LISTING_NOT_FOUND
MARKETPLACE_LISTING_NOT_PUBLISHABLE
MARKETPLACE_PART_NOT_FOUND
MARKETPLACE_PART_NOT_AVAILABLE
MARKETPLACE_PART_ALREADY_LISTED
MARKETPLACE_FORBIDDEN
VALIDATION_ERROR
```

The monetization conflict codes (`MARKETPLACE_PLAN_REQUIRED`, `MARKETPLACE_LISTING_LIMIT_REACHED`, `MARKETPLACE_ANALYTICS_PLAN_REQUIRED`, `MARKETPLACE_PROMOTION_PLAN_REQUIRED`) are removed per the 2026-06-14 revision — see Access Model.

Public API should return 404 for hidden, archived, unavailable, or non-owned public resources rather than exposing internal state.

## Search and Indexing

MVP search can use database queries over `MarketplaceListings` joined to `MarketplaceShops` and inventory availability. Index:

- listing status
- shop id
- tenant id
- title
- city
- vehicle make/model/year
- oem code
- price
- published at

If search grows beyond simple filters, add a separate marketplace search projection later. That projection should still be owned by Marketplace and fed from marketplace listings plus narrow inventory availability events.

## Phases

### Phase 1: Public Marketplace Web

- Add public web routes.
- Add marketplace frontend API/types.
- Build catalog, filters, listing cards, empty/error/loading states.
- Use real marketplace API if available; otherwise use isolated mock data behind `marketplaceApi`.
- Keep seller tools out of this phase.

### Phase 2: Backend Marketplace Module

- Add marketplace domain entities and migrations.
- Add public marketplace API.
- Add seller marketplace API.
- Add inventory reader interface and implementation.
- Add marketplace entitlement interface and publish gates.
- Add tests for lifecycle, public visibility, and tenant isolation.

### Phase 3: Shop Profiles

- Add public shop pages.
- Add shop listing filters.
- Add contact CTA.

### Phase 4: Seller Publishing

- Add web seller marketplace feature.
- Add mobile seller marketplace flow.
- Allow creating/updating shop.
- Allow creating listings from warehouse parts.
- Allow publish/hide/archive.

## Testing Strategy

Backend:

- Unit tests for listing lifecycle rules.
- Unit tests for marketplace entitlement gates and listing limits.
- Integration tests for public visibility filtering.
- Tenant isolation tests for seller endpoints.
- Tests proving public APIs do not return hidden, draft, archived, unavailable, or other-tenant listings.
- Tests for `MARKETPLACE_PART_ALREADY_LISTED` and availability guards.
- Tests proving over-limit tenants can create drafts but cannot publish.
- Tests proving expired billing access hides public listings without deleting them.

Web:

- Component tests for catalog loading, empty, error, filter, and card states.
- Router test for `/marketplace`.
- API adapter tests for query params and mock fallback.

Mobile:

- Seller API adapter tests once seller flow starts.
- Screen tests for publish/hide/archive once mobile UI starts.

## Resolved Decisions (2026-06-14 rebuild)

- **Web data source:** mock-first. Public screens consume `marketplaceApi`, which falls back to isolated `mock-data.ts` only in DEV when the backend is unavailable. Mock data is removable without touching UI components and never blends into real responses.
- **Buyer contact:** phone (primary) plus an optional messenger link (Telegram/Viber), shown on listing detail and shop profile. No request form or in-app chat.
- **Listing photos:** referenced by URL. At publish time the part's photo URLs are copied into `Listing.Photos`, then editable independently. No re-upload in this version.
- **Slug:** a generated, stable, stored slug field of the form `{slugified-title}-{shortId}`, globally unique, immutable for public URLs.
- **Plan limits / featured placement:** none. Monetization is removed (see Access Model); marketplace is a bundled subscription feature with no per-plan limits, no featured placement, and no commission.
- **Rebuild scope:** `rozbirka.core` (backend) and `rozbirka.web` (frontend), full public + seller flow. Mobile and identity are out of scope for this rebuild.

## Approval

Approved direction:

- Public marketplace first.
- Later web and mobile seller tools.
- Marketplace module must be maximally independent.
- Marketplace listings are separate public projections of inventory parts.
- Public marketplace reads marketplace DTOs only, never internal part DTOs.
- Marketplace is a bundled subscription feature with no marketplace-specific monetization, limits, or billing logic (2026-06-14 revision — see Access Model).
