# Marketplace Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the marketplace feature (backend `rozbirka.core` + web `rozbirka.web`) cleanly per the approved spec, dropping all Codex-era monetization/limit logic and fixing the public API, lifecycle, boundaries, and tests.

**Architecture:** Marketplace is an isolated bounded context. Backend owns `MarketplaceShop` + `MarketplaceListing`, reads inventory only through `IMarketplaceInventoryReader`, exposes anonymous public read APIs and authed seller commands, and is gated only by permissions + the platform's existing active-subscription check (no marketplace-specific billing). Frontend has a separate `/marketplace` app shell (no auth/billing imports) consuming `marketplaceApi`; seller tooling lives separately under `src/features/seller-marketplace/`, mounted inside the authed account screen.

**Tech Stack:** Backend — .NET 10, EF Core (Npgsql), xUnit, Testcontainers.PostgreSql for integration tests. Frontend — React 19 + react-router v7, Vite, Tailwind v4 + Radix/shadcn, Vitest + Testing Library.

**Spec:** `rozbirka.web/docs/superpowers/specs/2026-06-14-marketplace-design.md` (Access Model + Resolved Decisions sections are authoritative; Monetization Model section is HISTORICAL/superseded).

**Conventions reference (verified against the codebase):**
- Backend errors: throw `DomainException` subclasses (`NotFoundException`, `ConflictException`, `ForbiddenException`); `ErrorHandlingMiddleware` maps to the `Result.Failure(code,message,details)` envelope. NotFound→404, Conflict→409, Forbidden→403, FluentValidation→400.
- Controllers: `[ApiController]`, `[Route("api/v1/marketplace")]`, `[AllowAnonymous]` for public, `[Authorize]` + `[AuthorizePermission(Permissions.Marketplace.*)]` for seller. Tenant/user from injected `IRequestContext`.
- Public anonymous bypass is decided in `TenantMiddleware` by path.
- DI: `services.AddScoped<IInterface, Impl>()` in `Infrastructure/DependencyInjection.cs`.
- EF: entity configs in `Infrastructure/Persistence/Configurations/`, registered in `AppDbContext.OnModelCreating`; migrations via `dotnet ef migrations add <Name> --project src/Rozbirka.Infrastructure --startup-project src/Rozbirka.API`.
- Frontend routes: `createBrowserRouter` with `lazy: async () => ({ element })`. Three axios clients: `apiClient` (authed + `X-Tenant-Id`), `publicApiClient` (anonymous), `identityClient`. Responses unwrap `{data:T}→T`; errors stamped `.normalized`.
- Frontend gate: `npm run check` = typecheck + lint + format:check + test. Must be green.

---

## File Structure

### Backend (`rozbirka.core`)

```
src/Rozbirka.Domain/
  Entities/MarketplaceShop.cs                 # KEEP, add MessengerUrl
  Entities/MarketplaceListing.cs              # KEEP as-is
  Enums/MarketplaceListingStatus.cs           # KEEP (draft/published/hidden/sold/archived)
  Constants/Permissions.cs                    # KEEP marketplace entries
src/Rozbirka.Application/Marketplace/
  IMarketplaceService.cs                      # REWRITE (add archive + public detail/shop, drop entitlements)
  MarketplaceService.cs                       # REWRITE (no monetization, visibility predicate, slug, archive)
  MarketplaceInventoryReader.cs               # KEEP, drop dead `Exists`
  MarketplaceSlug.cs                          # NEW (Cyrillic-aware slug generator)
  IMarketplaceEntitlements.cs                 # DELETE
  MarketplaceEntitlements.cs                  # DELETE
  DTOs/MarketplaceDtos.cs                     # REWRITE (split public vs seller DTOs, drop limits)
src/Rozbirka.Infrastructure/
  Persistence/Configurations/MarketplaceShopConfiguration.cs     # KEEP, add MessengerUrl
  Persistence/Configurations/MarketplaceListingConfiguration.cs  # KEEP as-is
  Persistence/AppDbContext.cs                 # KEEP marketplace bits
  Persistence/Migrations/*AddMarketplace*     # REGENERATE
  DependencyInjection.cs                      # remove entitlements registration
src/Rozbirka.API/
  Controllers/MarketplaceController.cs        # REWRITE (spec routes + archive + public detail/shop)
  Middleware/TenantMiddleware.cs              # FIX anonymous bypass path matching
tests/Rozbirka.Tests/
  Rozbirka.Tests.csproj                       # add Testcontainers.PostgreSql
  Marketplace/PostgresFixture.cs              # NEW (Testcontainers fixture)
  Marketplace/MarketplaceLifecycleTests.cs    # NEW (InMemory: lifecycle/slug/archive)
  Marketplace/MarketplaceVisibilityTests.cs   # NEW (Postgres: public visibility/isolation)
```

### Frontend (`rozbirka.web`)

```
src/apps/marketplace/
  marketplace-app.tsx           # REWRITE (no useAuth; static header)
  marketplace-layout.tsx        # NEW (shell chrome)
src/features/marketplace/       # PUBLIC ONLY
  types.ts                      # REWRITE (align to backend public DTOs)
  marketplace-api-types.ts      # NEW (request/response DTO types)
  marketplace-screen.tsx        # REWRITE (catalog: filters/sort wired, links)
  listing-card.tsx              # NEW
  listing-detail-screen.tsx     # NEW
  shop-profile-screen.tsx       # NEW
  mock-data.ts                  # REWRITE (DEV fallback only)
src/features/seller-marketplace/  # SELLER ONLY (moved from account-marketplace)
  seller-marketplace-panel.tsx  # REWRITE (no paywall/limits, fix phone)
src/api/
  marketplace.ts                # REWRITE (spec paths, full params, no mock blending)
src/routes/router.tsx           # add listing-detail + shop routes
src/screens/account.tsx         # mount SellerMarketplacePanel
src/features/account-marketplace/ # DELETE
```

---

# Phase 0 — Branch Reset

### Task 0.1: Reset core branch to pre-marketplace state

**Files:** none (git surgery in `rozbirka.core`)

- [ ] **Step 1: Confirm the commits to drop**

Run: `git -C /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.core log --oneline main..feature/marketplace`
Expected: top two are `a9cc6c1 feat: complete marketplace seller workflow` and `6c37e8d feat: add marketplace backend`, then `060c674 chore(billing): tune subscription plan limits`.

- [ ] **Step 2: Hard reset to the commit before marketplace work (keeps RevenueCat/billing)**

```bash
cd /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.core
git status --short            # verify clean working tree first
git reset --hard 060c674
```
Expected: `HEAD is now at 060c674 chore(billing): tune subscription plan limits`. All Codex marketplace files gone.

- [ ] **Step 3: Verify no marketplace files remain**

Run: `find /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.core/src -iname '*marketplace*'`
Expected: no output.

### Task 0.2: Reset web branch, preserving the spec doc + auth change

**Files:** none (git surgery in `rozbirka.web`)

- [ ] **Step 1: Back up the edited spec to /tmp**

```bash
cd /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.web
cp docs/superpowers/specs/2026-06-14-marketplace-design.md /tmp/marketplace-design.md
```

- [ ] **Step 2: Hard reset to the auth-only commit (keeps `feat(auth): allowRegistration`)**

Run: `git -C /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.web log --oneline main..feature/marketplace`
Then:
```bash
git reset --hard 6ff43ba
```
Expected: `HEAD is now at 6ff43ba feat(auth): send allowRegistration on OTP verify`. All Codex marketplace + docs commits gone.

- [ ] **Step 3: Restore the spec doc**

```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp /tmp/marketplace-design.md docs/superpowers/specs/2026-06-14-marketplace-design.md
```

- [ ] **Step 4: Verify no marketplace source remains (spec doc is fine)**

Run: `find src -iname '*marketplace*'`
Expected: no output (only the spec under `docs/`).

- [ ] **Step 5: Commit the spec + this plan**

```bash
git add docs/superpowers/specs/2026-06-14-marketplace-design.md docs/superpowers/plans/2026-06-14-marketplace-rebuild.md
git commit -m "docs: marketplace rebuild spec + plan"
```

---

# Phase 1 — Backend (`rozbirka.core`)

All paths below are relative to `/Users/oleksiilopatskyi/Code/rozbirka/rozbirka.core`. Run `dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj` and `dotnet build` from the repo root.

### Task 1.1: Domain entities + enum

**Files:**
- Create: `src/Rozbirka.Domain/Enums/MarketplaceListingStatus.cs`
- Create: `src/Rozbirka.Domain/Entities/MarketplaceShop.cs`
- Create: `src/Rozbirka.Domain/Entities/MarketplaceListing.cs`

- [ ] **Step 1: Create the status enum**

`src/Rozbirka.Domain/Enums/MarketplaceListingStatus.cs`:
```csharp
namespace Rozbirka.Domain.Enums;

public enum MarketplaceListingStatus
{
    Draft,
    Published,
    Hidden,
    Sold,
    Archived
}
```

- [ ] **Step 2: Create MarketplaceShop (adds `MessengerUrl` per resolved contact decision)**

`src/Rozbirka.Domain/Entities/MarketplaceShop.cs`:
```csharp
namespace Rozbirka.Domain.Entities;

public class MarketplaceShop
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Slug { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string? Description { get; set; }
    public string? City { get; set; }
    public string? LogoUrl { get; set; }
    public string? Phone { get; set; }
    public string? MessengerUrl { get; set; }
    public string? PublicContactName { get; set; }
    public bool IsPublished { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Tenant Tenant { get; set; } = null!;
    public ICollection<MarketplaceListing> Listings { get; set; } = new List<MarketplaceListing>();
}
```

- [ ] **Step 3: Create MarketplaceListing**

`src/Rozbirka.Domain/Entities/MarketplaceListing.cs`:
```csharp
using Rozbirka.Domain.Enums;

namespace Rozbirka.Domain.Entities;

public class MarketplaceListing
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ShopId { get; set; }
    public Guid PartId { get; set; }
    public string Slug { get; set; } = null!;
    public string Title { get; set; } = null!;
    public string? Description { get; set; }
    public decimal? Price { get; set; }
    public string Currency { get; set; } = "UAH";
    public List<string> Photos { get; set; } = [];
    public string? Condition { get; set; }
    public string? VehicleMake { get; set; }
    public string? VehicleModel { get; set; }
    public short? VehicleYear { get; set; }
    public string? OemCode { get; set; }
    public int QuantityPublished { get; set; } = 1;
    public MarketplaceListingStatus Status { get; set; } = MarketplaceListingStatus.Draft;
    public DateTime? PublishedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ArchivedAt { get; set; }

    public Tenant Tenant { get; set; } = null!;
    public MarketplaceShop Shop { get; set; } = null!;
    public Part Part { get; set; } = null!;
}
```

- [ ] **Step 4: Build to verify domain compiles**

Run: `dotnet build src/Rozbirka.Domain/Rozbirka.Domain.csproj`
Expected: Build succeeded, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/Rozbirka.Domain
git commit -m "feat(marketplace): domain entities and listing status"
```

### Task 1.2: Slug generator (Cyrillic-aware) — TDD

**Files:**
- Create: `src/Rozbirka.Application/Marketplace/MarketplaceSlug.cs`
- Test: `tests/Rozbirka.Tests/Marketplace/MarketplaceSlugTests.cs`

- [ ] **Step 1: Write the failing test**

`tests/Rozbirka.Tests/Marketplace/MarketplaceSlugTests.cs`:
```csharp
using Rozbirka.Application.Marketplace;

namespace Rozbirka.Tests.Marketplace;

public class MarketplaceSlugTests
{
    [Fact]
    public void Generate_TransliteratesCyrillicAndAppendsShortId()
    {
        var id = Guid.Parse("11112222-3333-4444-5555-666677778888");
        var slug = MarketplaceSlug.Generate("Фара права LED", id);
        Assert.Equal("fara-prava-led-11112222", slug);
    }

    [Fact]
    public void Generate_CollapsesPunctuationAndCase()
    {
        var id = Guid.Parse("aaaabbbb-cccc-dddd-eeee-ffff00001111");
        var slug = MarketplaceSlug.Generate("Двигун 2.0 TDI (CAGA)!!!", id);
        Assert.Equal("dvigun-2-0-tdi-caga-aaaabbbb", slug);
    }

    [Fact]
    public void Generate_FallsBackToShortIdWhenTitleEmpty()
    {
        var id = Guid.Parse("12345678-0000-0000-0000-000000000000");
        var slug = MarketplaceSlug.Generate("   ", id);
        Assert.Equal("listing-12345678", slug);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj --filter MarketplaceSlugTests`
Expected: FAIL — `MarketplaceSlug` does not exist.

- [ ] **Step 3: Implement the generator**

`src/Rozbirka.Application/Marketplace/MarketplaceSlug.cs`:
```csharp
using System.Text;

namespace Rozbirka.Application.Marketplace;

public static class MarketplaceSlug
{
    private static readonly Dictionary<char, string> Translit = new()
    {
        ['а']="a",['б']="b",['в']="v",['г']="h",['ґ']="g",['д']="d",['е']="e",['є']="ie",
        ['ж']="zh",['з']="z",['и']="y",['і']="i",['ї']="i",['й']="i",['к']="k",['л']="l",
        ['м']="m",['н']="n",['о']="o",['п']="p",['р']="r",['с']="s",['т']="t",['у']="u",
        ['ф']="f",['х']="kh",['ц']="ts",['ч']="ch",['ш']="sh",['щ']="shch",['ь']="",['ю']="iu",
        ['я']="ia",['ы']="y",['э']="e",['ё']="e",['ъ']="",
    };

    public static string Generate(string? title, Guid id)
    {
        var shortId = id.ToString("N")[..8];
        var slugBody = Slugify(title);
        return string.IsNullOrEmpty(slugBody) ? $"listing-{shortId}" : $"{slugBody}-{shortId}";
    }

    public static string Slugify(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var sb = new StringBuilder();
        var prevDash = false;
        foreach (var ch in input.Trim().ToLowerInvariant())
        {
            if (Translit.TryGetValue(ch, out var rep))
            {
                sb.Append(rep);
                prevDash = false;
            }
            else if (char.IsLetterOrDigit(ch) && ch < 128)
            {
                sb.Append(ch);
                prevDash = false;
            }
            else if (!prevDash && sb.Length > 0)
            {
                sb.Append('-');
                prevDash = true;
            }
        }
        return sb.ToString().Trim('-');
    }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj --filter MarketplaceSlugTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/Rozbirka.Application/Marketplace/MarketplaceSlug.cs tests/Rozbirka.Tests/Marketplace/MarketplaceSlugTests.cs
git commit -m "feat(marketplace): cyrillic-aware slug generator"
```

### Task 1.3: Inventory reader

**Files:**
- Create: `src/Rozbirka.Application/Marketplace/MarketplaceInventoryReader.cs`

- [ ] **Step 1: Create the reader (drops the dead `Exists` flag the review flagged)**

`src/Rozbirka.Application/Marketplace/MarketplaceInventoryReader.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Rozbirka.Application.Common;
using Rozbirka.Domain.Enums;

namespace Rozbirka.Application.Marketplace;

public interface IMarketplaceInventoryReader
{
    Task<MarketplacePartSnapshot?> GetPublishablePartAsync(Guid tenantId, Guid partId, CancellationToken ct = default);
    Task<int?> GetPartAvailabilityAsync(Guid tenantId, Guid partId, CancellationToken ct = default);
}

public record MarketplacePartSnapshot(
    Guid Id,
    Guid TenantId,
    string Name,
    string? OemCode,
    string Condition,
    List<string> Photos,
    string? VehicleMake,
    string? VehicleModel,
    short? VehicleYear,
    int QuantityAvailable);

public class MarketplaceInventoryReader : IMarketplaceInventoryReader
{
    private readonly IAppDbContext _db;

    public MarketplaceInventoryReader(IAppDbContext db) => _db = db;

    public async Task<MarketplacePartSnapshot?> GetPublishablePartAsync(Guid tenantId, Guid partId, CancellationToken ct = default)
    {
        var part = await _db.Parts
            .IgnoreQueryFilters()
            .Include(p => p.Photos)
            .FirstOrDefaultAsync(p => p.TenantId == tenantId && p.Id == partId && p.DeletedAt == null, ct);
        if (part == null) return null;

        var available = await GetPartAvailabilityAsync(tenantId, partId, ct);
        if (available is not > 0) return null;

        return new MarketplacePartSnapshot(
            part.Id,
            part.TenantId,
            part.Name,
            part.OemCode,
            part.Condition.ToString().ToLowerInvariant(),
            part.Photos.OrderBy(p => p.SortOrder).Select(p => p.StorageKey).ToList(),
            part.CompatCarBrand,
            part.CompatCarModel,
            part.CompatCarYear,
            available.Value);
    }

    public async Task<int?> GetPartAvailabilityAsync(Guid tenantId, Guid partId, CancellationToken ct = default)
    {
        var part = await _db.Parts
            .IgnoreQueryFilters()
            .Where(p => p.TenantId == tenantId && p.Id == partId && p.DeletedAt == null)
            .Select(p => new { p.Id, p.Quantity })
            .FirstOrDefaultAsync(ct);
        if (part == null) return null;

        var reserved = await _db.OrderItems.IgnoreQueryFilters()
            .Where(oi => oi.PartId == partId && oi.Order.TenantId == tenantId && oi.Order.Status == OrderStatus.Pending)
            .SumAsync(oi => (int?)oi.Quantity, ct) ?? 0;
        var sold = await _db.OrderItems.IgnoreQueryFilters()
            .Where(oi => oi.PartId == partId && oi.Order.TenantId == tenantId && oi.Order.Status == OrderStatus.Confirmed)
            .SumAsync(oi => (int?)oi.Quantity, ct) ?? 0;

        return Math.Max(0, part.Quantity - reserved - sold);
    }
}
```

- [ ] **Step 2: Build**

Run: `dotnet build src/Rozbirka.Application/Rozbirka.Application.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Rozbirka.Application/Marketplace/MarketplaceInventoryReader.cs
git commit -m "feat(marketplace): inventory availability reader"
```

### Task 1.4: DTOs (split public vs seller; no limits)

**Files:**
- Create: `src/Rozbirka.Application/Marketplace/DTOs/MarketplaceDtos.cs`

- [ ] **Step 1: Create the DTOs**

`src/Rozbirka.Application/Marketplace/DTOs/MarketplaceDtos.cs`:
```csharp
using Rozbirka.Application.Common;

namespace Rozbirka.Application.Marketplace.DTOs;

// ---- Requests ----
public record UpsertMarketplaceShopRequest(
    string DisplayName,
    string? Description,
    string? City,
    string? Phone,
    string? MessengerUrl,
    string? PublicContactName,
    bool IsPublished);

public record UpdateMarketplaceListingRequest(
    string? Title = null,
    string? Description = null,
    decimal? Price = null,
    int? QuantityPublished = null);

public record MarketplaceSearchRequest(
    string? Q = null,
    string? City = null,
    string? Make = null,
    string? Model = null,
    short? YearFrom = null,
    short? YearTo = null,
    string? Condition = null,
    decimal? MinPrice = null,
    decimal? MaxPrice = null,
    string? Sort = null,
    int Page = 1,
    int PageSize = 30);

// ---- Public DTOs (NO partId / no internal ids beyond opaque shop id) ----
public record MarketplaceShopPublicDto(
    string Slug,
    string Name,
    string? Description,
    string? City,
    string? LogoUrl,
    string? Phone,
    string? MessengerUrl,
    string? PublicContactName);

public record MarketplaceShopSummaryDto(
    string Slug,
    string Name,
    string? City);

public record MarketplaceListingCardDto(
    string Slug,
    string Title,
    decimal? Price,
    string Currency,
    string? Photo,
    string? Condition,
    string? VehicleMake,
    string? VehicleModel,
    short? VehicleYear,
    string? OemCode,
    int QuantityAvailable,
    MarketplaceShopSummaryDto Shop);

public record MarketplaceListingDetailDto(
    string Slug,
    string Title,
    string? Description,
    decimal? Price,
    string Currency,
    List<string> Photos,
    string? Condition,
    string? VehicleMake,
    string? VehicleModel,
    short? VehicleYear,
    string? OemCode,
    int QuantityAvailable,
    MarketplaceShopPublicDto Shop);

// ---- Seller DTOs (partId allowed; this is the owner's own data) ----
public record MarketplaceShopDto(
    Guid Id,
    string Slug,
    string Name,
    string? Description,
    string? City,
    string? LogoUrl,
    string? Phone,
    string? MessengerUrl,
    string? PublicContactName,
    bool IsPublished);

public record MarketplaceSellerListingDto(
    Guid Id,
    Guid ShopId,
    Guid PartId,
    string Slug,
    string Title,
    string? Description,
    decimal? Price,
    string Currency,
    List<string> Photos,
    string? Condition,
    string? VehicleMake,
    string? VehicleModel,
    short? VehicleYear,
    string? OemCode,
    int QuantityPublished,
    int QuantityAvailable,
    string Status);

public record MarketplaceSellerPartDto(
    Guid Id,
    string Name,
    List<string> Photos,
    int QuantityTotal,
    int QuantityAvailable,
    string? CarMake,
    string? CarModel,
    short? CarYear,
    string? Condition,
    string? OemCode,
    bool AlreadyListed,
    Guid? ListingId);

public record MarketplaceSellerSummaryDto(
    MarketplaceShopDto? Shop,
    int DraftListings,
    int PublishedListings,
    int HiddenListings,
    int AvailableWarehouseParts);
```

- [ ] **Step 2: Build**

Run: `dotnet build src/Rozbirka.Application/Rozbirka.Application.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Rozbirka.Application/Marketplace/DTOs/MarketplaceDtos.cs
git commit -m "feat(marketplace): public + seller DTOs, no monetization fields"
```

### Task 1.5: Service interface

**Files:**
- Create: `src/Rozbirka.Application/Marketplace/IMarketplaceService.cs`

- [ ] **Step 1: Create the interface**

`src/Rozbirka.Application/Marketplace/IMarketplaceService.cs`:
```csharp
using Rozbirka.Application.Common;
using Rozbirka.Application.Marketplace.DTOs;

namespace Rozbirka.Application.Marketplace;

public interface IMarketplaceService
{
    // Seller — shop
    Task<MarketplaceShopDto?> GetSellerShopAsync(CancellationToken ct = default);
    Task<MarketplaceShopDto> UpsertShopAsync(UpsertMarketplaceShopRequest request, CancellationToken ct = default);

    // Seller — listings
    Task<MarketplaceSellerListingDto> CreateListingFromPartAsync(Guid partId, CancellationToken ct = default);
    Task<MarketplaceSellerListingDto> UpdateListingAsync(Guid listingId, UpdateMarketplaceListingRequest request, CancellationToken ct = default);
    Task<MarketplaceSellerListingDto> PublishListingAsync(Guid listingId, CancellationToken ct = default);
    Task<MarketplaceSellerListingDto> HideListingAsync(Guid listingId, CancellationToken ct = default);
    Task<MarketplaceSellerListingDto> ArchiveListingAsync(Guid listingId, CancellationToken ct = default);
    Task<PagedResult<MarketplaceSellerListingDto>> GetSellerListingsAsync(int page = 1, int pageSize = 30, CancellationToken ct = default);
    Task<PagedResult<MarketplaceSellerPartDto>> SearchSellerPartsAsync(string? q, int page = 1, int pageSize = 30, CancellationToken ct = default);
    Task<MarketplaceSellerSummaryDto> GetSellerSummaryAsync(CancellationToken ct = default);

    // Public
    Task<PagedResult<MarketplaceListingCardDto>> GetPublicListingsAsync(MarketplaceSearchRequest request, CancellationToken ct = default);
    Task<MarketplaceListingDetailDto?> GetPublicListingAsync(string slugOrId, CancellationToken ct = default);
    Task<MarketplaceShopPublicDto?> GetPublicShopAsync(string slug, CancellationToken ct = default);
    Task<PagedResult<MarketplaceListingCardDto>?> GetPublicShopListingsAsync(string slug, MarketplaceSearchRequest request, CancellationToken ct = default);
}
```

- [ ] **Step 2: Commit (will not build until 1.6; that's fine, commit interface with impl)**

Defer commit to Task 1.6.

### Task 1.6: Service implementation (no monetization, visibility predicate, archive)

**Files:**
- Create: `src/Rozbirka.Application/Marketplace/MarketplaceService.cs`

Key rules encoded here (from spec Access Model + visibility rule 139):
- Public visibility predicate: `Status == Published && Shop.IsPublished && Tenant active && availability > 0`.
- Tenant "active": `Tenant.PlanExpiresAt == null || PlanExpiresAt > now`. (Matches existing platform subscription gate semantics; confirm against `Tenant` entity during implementation and reuse the same check used elsewhere.)
- No listing-count gate. Publish requires shop published + listing publishable (`Draft` or `Hidden`) + availability > 0.
- `CreateListingFromPart`: seeds `Draft`, copies photo URLs, `QuantityPublished = snapshot.QuantityAvailable` (fixes the `Math.Min(1, ...)` bug), `MARKETPLACE_PART_ALREADY_LISTED` if a non-archived listing exists for the part.
- `UpdateListing` quantity above availability → `ConflictException("MARKETPLACE_PART_NOT_AVAILABLE", ...)`.
- Seller mutations load listing scoped by tenant; missing → `NotFoundException` (404, never reveals other tenants).

- [ ] **Step 1: Create the service**

`src/Rozbirka.Application/Marketplace/MarketplaceService.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Rozbirka.Application.Common;
using Rozbirka.Application.Marketplace.DTOs;
using Rozbirka.Domain.Entities;
using Rozbirka.Domain.Enums;
using Rozbirka.Domain.Exceptions;

namespace Rozbirka.Application.Marketplace;

public class MarketplaceService : IMarketplaceService
{
    private readonly IAppDbContext _db;
    private readonly IRequestContext _ctx;
    private readonly IMarketplaceInventoryReader _inventory;

    public MarketplaceService(IAppDbContext db, IRequestContext ctx, IMarketplaceInventoryReader inventory)
    {
        _db = db;
        _ctx = ctx;
        _inventory = inventory;
    }

    private Guid RequireTenant()
    {
        if (_ctx.TenantId == Guid.Empty) throw new ForbiddenException("MARKETPLACE_FORBIDDEN", "Tenant context required.");
        return _ctx.TenantId;
    }

    // ---------- Seller: shop ----------
    public async Task<MarketplaceShopDto?> GetSellerShopAsync(CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var shop = await _db.MarketplaceShops.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        return shop == null ? null : MapShop(shop);
    }

    public async Task<MarketplaceShopDto> UpsertShopAsync(UpsertMarketplaceShopRequest request, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        if (string.IsNullOrWhiteSpace(request.DisplayName))
            throw new ConflictException(ErrorCodes.ValidationError, "Shop display name is required.");

        var shop = await _db.MarketplaceShops.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        if (shop == null)
        {
            shop = new MarketplaceShop
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                Slug = await UniqueShopSlugAsync(request.DisplayName, ct),
            };
            _db.MarketplaceShops.Add(shop);
        }

        shop.DisplayName = request.DisplayName.Trim();
        shop.Description = request.Description;
        shop.City = request.City;
        shop.Phone = request.Phone;
        shop.MessengerUrl = request.MessengerUrl;
        shop.PublicContactName = request.PublicContactName;
        shop.IsPublished = request.IsPublished;

        await _db.SaveChangesAsync(ct);
        return MapShop(shop);
    }

    private async Task<string> UniqueShopSlugAsync(string name, CancellationToken ct)
    {
        var baseSlug = MarketplaceSlug.Slugify(name);
        if (string.IsNullOrEmpty(baseSlug)) baseSlug = "shop";
        var slug = baseSlug;
        var i = 1;
        while (await _db.MarketplaceShops.AnyAsync(s => s.Slug == slug, ct))
            slug = $"{baseSlug}-{++i}";
        return slug;
    }

    // ---------- Seller: listings ----------
    public async Task<MarketplaceSellerListingDto> CreateListingFromPartAsync(Guid partId, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var shop = await _db.MarketplaceShops.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct)
            ?? throw new ConflictException("MARKETPLACE_SHOP_NOT_FOUND", "Create a marketplace shop before listing parts.");

        var alreadyListed = await _db.MarketplaceListings
            .AnyAsync(l => l.TenantId == tenantId && l.PartId == partId && l.Status != MarketplaceListingStatus.Archived, ct);
        if (alreadyListed)
            throw new ConflictException("MARKETPLACE_PART_ALREADY_LISTED", "Part already has an active marketplace listing.");

        var snapshot = await _inventory.GetPublishablePartAsync(tenantId, partId, ct)
            ?? throw new ConflictException("MARKETPLACE_PART_NOT_AVAILABLE", "Part is not available to publish.");

        var listing = new MarketplaceListing
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ShopId = shop.Id,
            PartId = snapshot.Id,
            Title = snapshot.Name,
            Condition = snapshot.Condition,
            Photos = snapshot.Photos,
            VehicleMake = snapshot.VehicleMake,
            VehicleModel = snapshot.VehicleModel,
            VehicleYear = snapshot.VehicleYear,
            OemCode = snapshot.OemCode,
            QuantityPublished = snapshot.QuantityAvailable,
            Status = MarketplaceListingStatus.Draft,
        };
        listing.Slug = MarketplaceSlug.Generate(listing.Title, listing.Id);
        _db.MarketplaceListings.Add(listing);
        await _db.SaveChangesAsync(ct);

        return MapSellerListing(listing, snapshot.QuantityAvailable);
    }

    public async Task<MarketplaceSellerListingDto> UpdateListingAsync(Guid listingId, UpdateMarketplaceListingRequest request, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var listing = await LoadSellerListingAsync(tenantId, listingId, ct);
        var available = await _inventory.GetPartAvailabilityAsync(tenantId, listing.PartId, ct) ?? 0;

        if (request.Title != null) listing.Title = request.Title.Trim();
        if (request.Description != null) listing.Description = request.Description;
        if (request.Price != null) listing.Price = request.Price;
        if (request.QuantityPublished is { } qty)
        {
            if (qty < 0) throw new ConflictException(ErrorCodes.ValidationError, "Quantity cannot be negative.");
            if (qty > available)
                throw new ConflictException("MARKETPLACE_PART_NOT_AVAILABLE", "Quantity exceeds available warehouse stock.");
            listing.QuantityPublished = qty;
        }

        await _db.SaveChangesAsync(ct);
        return MapSellerListing(listing, available);
    }

    public async Task<MarketplaceSellerListingDto> PublishListingAsync(Guid listingId, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var listing = await LoadSellerListingAsync(tenantId, listingId, ct);
        var shop = await _db.MarketplaceShops.FirstAsync(s => s.Id == listing.ShopId, ct);

        if (!shop.IsPublished)
            throw new ConflictException("MARKETPLACE_SHOP_NOT_PUBLISHED", "Publish your shop before publishing listings.");
        if (listing.Status is not (MarketplaceListingStatus.Draft or MarketplaceListingStatus.Hidden))
            throw new ConflictException("MARKETPLACE_LISTING_NOT_PUBLISHABLE", "Listing cannot be published from its current state.");

        var available = await _inventory.GetPartAvailabilityAsync(tenantId, listing.PartId, ct) ?? 0;
        if (available <= 0)
            throw new ConflictException("MARKETPLACE_PART_NOT_AVAILABLE", "Part has no available stock.");

        listing.Status = MarketplaceListingStatus.Published;
        listing.PublishedAt ??= DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return MapSellerListing(listing, available);
    }

    public async Task<MarketplaceSellerListingDto> HideListingAsync(Guid listingId, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var listing = await LoadSellerListingAsync(tenantId, listingId, ct);
        listing.Status = MarketplaceListingStatus.Hidden;
        await _db.SaveChangesAsync(ct);
        var available = await _inventory.GetPartAvailabilityAsync(tenantId, listing.PartId, ct) ?? 0;
        return MapSellerListing(listing, available);
    }

    public async Task<MarketplaceSellerListingDto> ArchiveListingAsync(Guid listingId, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var listing = await LoadSellerListingAsync(tenantId, listingId, ct);
        listing.Status = MarketplaceListingStatus.Archived;
        listing.ArchivedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        var available = await _inventory.GetPartAvailabilityAsync(tenantId, listing.PartId, ct) ?? 0;
        return MapSellerListing(listing, available);
    }

    private async Task<MarketplaceListing> LoadSellerListingAsync(Guid tenantId, Guid listingId, CancellationToken ct) =>
        await _db.MarketplaceListings.FirstOrDefaultAsync(l => l.Id == listingId && l.TenantId == tenantId, ct)
        ?? throw new NotFoundException("MarketplaceListing", listingId);

    public async Task<PagedResult<MarketplaceSellerListingDto>> GetSellerListingsAsync(int page = 1, int pageSize = 30, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var query = _db.MarketplaceListings
            .Where(l => l.TenantId == tenantId && l.Status != MarketplaceListingStatus.Archived)
            .OrderByDescending(l => l.UpdatedAt);
        var total = await query.CountAsync(ct);
        var listings = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        var items = new List<MarketplaceSellerListingDto>(listings.Count);
        foreach (var l in listings)
        {
            var available = await _inventory.GetPartAvailabilityAsync(tenantId, l.PartId, ct) ?? 0;
            items.Add(MapSellerListing(l, available));
        }
        return Paged(items, page, pageSize, total);
    }

    public async Task<PagedResult<MarketplaceSellerPartDto>> SearchSellerPartsAsync(string? q, int page = 1, int pageSize = 30, CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var partsQuery = _db.Parts.Where(p => p.TenantId == tenantId && p.DeletedAt == null);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            partsQuery = partsQuery.Where(p =>
                p.Name.ToLower().Contains(term) ||
                (p.OemCode != null && p.OemCode.ToLower().Contains(term)));
        }

        var availability = partsQuery.Select(p => new
        {
            Part = p,
            Reserved = _db.OrderItems.Where(oi => oi.PartId == p.Id && oi.Order.TenantId == tenantId && oi.Order.Status == OrderStatus.Pending).Sum(oi => (int?)oi.Quantity) ?? 0,
            Sold = _db.OrderItems.Where(oi => oi.PartId == p.Id && oi.Order.TenantId == tenantId && oi.Order.Status == OrderStatus.Confirmed).Sum(oi => (int?)oi.Quantity) ?? 0,
        })
        .Where(x => x.Part.Quantity - x.Reserved - x.Sold > 0)
        .OrderByDescending(x => x.Part.CreatedAt);

        var total = await availability.CountAsync(ct);
        var rows = await availability.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new { x.Part, Available = x.Part.Quantity - x.Reserved - x.Sold }).ToListAsync(ct);

        var partIds = rows.Select(r => r.Part.Id).ToList();
        var listings = await _db.MarketplaceListings
            .Where(l => l.TenantId == tenantId && partIds.Contains(l.PartId) && l.Status != MarketplaceListingStatus.Archived)
            .Select(l => new { l.PartId, l.Id }).ToListAsync(ct);
        var listingByPart = listings.ToDictionary(l => l.PartId, l => l.Id);

        var items = rows.Select(r => new MarketplaceSellerPartDto(
            r.Part.Id, r.Part.Name,
            new List<string>(), // photos loaded lazily by UI; keep light here
            r.Part.Quantity, r.Available,
            r.Part.CompatCarBrand, r.Part.CompatCarModel, r.Part.CompatCarYear,
            r.Part.Condition.ToString().ToLowerInvariant(), r.Part.OemCode,
            listingByPart.ContainsKey(r.Part.Id),
            listingByPart.TryGetValue(r.Part.Id, out var lid) ? lid : null)).ToList();

        return Paged(items, page, pageSize, total);
    }

    public async Task<MarketplaceSellerSummaryDto> GetSellerSummaryAsync(CancellationToken ct = default)
    {
        var tenantId = RequireTenant();
        var shop = await _db.MarketplaceShops.FirstOrDefaultAsync(s => s.TenantId == tenantId, ct);
        var counts = await _db.MarketplaceListings
            .Where(l => l.TenantId == tenantId)
            .GroupBy(l => l.Status)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(ct);
        int Count(MarketplaceListingStatus s) => counts.FirstOrDefault(c => c.Key == s)?.Count ?? 0;

        var availableParts = await _db.Parts
            .Where(p => p.TenantId == tenantId && p.DeletedAt == null && p.Quantity > 0)
            .CountAsync(ct);

        return new MarketplaceSellerSummaryDto(
            shop == null ? null : MapShop(shop),
            Count(MarketplaceListingStatus.Draft),
            Count(MarketplaceListingStatus.Published),
            Count(MarketplaceListingStatus.Hidden),
            availableParts);
    }

    // ---------- Public ----------
    private IQueryable<MarketplaceListing> VisibleListings(DateTime now) =>
        _db.MarketplaceListings
            .Where(l => l.Status == MarketplaceListingStatus.Published
                && l.Shop.IsPublished
                && (l.Tenant.PlanExpiresAt == null || l.Tenant.PlanExpiresAt > now));

    private IQueryable<MarketplaceListing> ApplyFilters(IQueryable<MarketplaceListing> q, MarketplaceSearchRequest r)
    {
        if (!string.IsNullOrWhiteSpace(r.Q))
        {
            var term = r.Q.Trim().ToLower();
            q = q.Where(l => l.Title.ToLower().Contains(term)
                || (l.OemCode != null && l.OemCode.ToLower().Contains(term))
                || (l.VehicleMake != null && l.VehicleMake.ToLower().Contains(term))
                || (l.VehicleModel != null && l.VehicleModel.ToLower().Contains(term)));
        }
        if (!string.IsNullOrWhiteSpace(r.City)) q = q.Where(l => l.Shop.City != null && l.Shop.City.ToLower() == r.City.Trim().ToLower());
        if (!string.IsNullOrWhiteSpace(r.Make)) q = q.Where(l => l.VehicleMake != null && l.VehicleMake.ToLower() == r.Make.Trim().ToLower());
        if (!string.IsNullOrWhiteSpace(r.Model)) q = q.Where(l => l.VehicleModel != null && l.VehicleModel.ToLower() == r.Model.Trim().ToLower());
        if (!string.IsNullOrWhiteSpace(r.Condition)) q = q.Where(l => l.Condition != null && l.Condition.ToLower() == r.Condition.Trim().ToLower());
        if (r.YearFrom is { } yf) q = q.Where(l => l.VehicleYear != null && l.VehicleYear >= yf);
        if (r.YearTo is { } yt) q = q.Where(l => l.VehicleYear != null && l.VehicleYear <= yt);
        if (r.MinPrice is { } mn) q = q.Where(l => l.Price != null && l.Price >= mn);
        if (r.MaxPrice is { } mx) q = q.Where(l => l.Price != null && l.Price <= mx);

        q = r.Sort switch
        {
            "price_asc" => q.OrderBy(l => l.Price),
            "price_desc" => q.OrderByDescending(l => l.Price),
            _ => q.OrderByDescending(l => l.PublishedAt),
        };
        return q;
    }

    public async Task<PagedResult<MarketplaceListingCardDto>> GetPublicListingsAsync(MarketplaceSearchRequest request, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var q = ApplyFilters(VisibleListings(now), request);
        return await PageWithAvailabilityAsync(q, request.Page, request.PageSize, ct);
    }

    public async Task<MarketplaceListingDetailDto?> GetPublicListingAsync(string slugOrId, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var q = VisibleListings(now).Include(l => l.Shop);
        var listing = Guid.TryParse(slugOrId, out var id)
            ? await q.FirstOrDefaultAsync(l => l.Id == id, ct)
            : await q.FirstOrDefaultAsync(l => l.Slug == slugOrId, ct);
        if (listing == null) return null;

        var available = await _inventory.GetPartAvailabilityAsync(listing.TenantId, listing.PartId, ct) ?? 0;
        if (available <= 0) return null;

        return new MarketplaceListingDetailDto(
            listing.Slug, listing.Title, listing.Description, listing.Price, listing.Currency,
            listing.Photos, listing.Condition, listing.VehicleMake, listing.VehicleModel,
            listing.VehicleYear, listing.OemCode, available, MapShopPublic(listing.Shop));
    }

    public async Task<MarketplaceShopPublicDto?> GetPublicShopAsync(string slug, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var shop = await _db.MarketplaceShops
            .FirstOrDefaultAsync(s => s.Slug == slug && s.IsPublished
                && (s.Tenant.PlanExpiresAt == null || s.Tenant.PlanExpiresAt > now), ct);
        return shop == null ? null : MapShopPublic(shop);
    }

    public async Task<PagedResult<MarketplaceListingCardDto>?> GetPublicShopListingsAsync(string slug, MarketplaceSearchRequest request, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var shopExists = await _db.MarketplaceShops.AnyAsync(s => s.Slug == slug && s.IsPublished
            && (s.Tenant.PlanExpiresAt == null || s.Tenant.PlanExpiresAt > now), ct);
        if (!shopExists) return null;

        var q = ApplyFilters(VisibleListings(now).Where(l => l.Shop.Slug == slug), request);
        return await PageWithAvailabilityAsync(q, request.Page, request.PageSize, ct);
    }

    private async Task<PagedResult<MarketplaceListingCardDto>> PageWithAvailabilityAsync(IQueryable<MarketplaceListing> q, int page, int pageSize, CancellationToken ct)
    {
        // Availability is computed per-row; we over-fetch then filter zero-availability and page in memory
        // for correctness of the "availability > 0" public rule (spec 139).
        var candidates = await q.Include(l => l.Shop).ToListAsync(ct);
        var visible = new List<MarketplaceListingCardDto>();
        foreach (var l in candidates)
        {
            var available = await _inventory.GetPartAvailabilityAsync(l.TenantId, l.PartId, ct) ?? 0;
            if (available <= 0) continue;
            visible.Add(MapCard(l, available));
        }
        var total = visible.Count;
        var pageItems = visible.Skip((page - 1) * pageSize).Take(pageSize).ToList();
        return Paged(pageItems, page, pageSize, total);
    }

    // ---------- Mappers ----------
    private static MarketplaceShopDto MapShop(MarketplaceShop s) => new(
        s.Id, s.Slug, s.DisplayName, s.Description, s.City, s.LogoUrl, s.Phone, s.MessengerUrl, s.PublicContactName, s.IsPublished);

    private static MarketplaceShopPublicDto MapShopPublic(MarketplaceShop s) => new(
        s.Slug, s.DisplayName, s.Description, s.City, s.LogoUrl, s.Phone, s.MessengerUrl, s.PublicContactName);

    private static MarketplaceShopSummaryDto MapShopSummary(MarketplaceShop s) => new(s.Slug, s.DisplayName, s.City);

    private static MarketplaceListingCardDto MapCard(MarketplaceListing l, int available) => new(
        l.Slug, l.Title, l.Price, l.Currency, l.Photos.FirstOrDefault(),
        l.Condition, l.VehicleMake, l.VehicleModel, l.VehicleYear, l.OemCode, available, MapShopSummary(l.Shop));

    private static MarketplaceSellerListingDto MapSellerListing(MarketplaceListing l, int available) => new(
        l.Id, l.ShopId, l.PartId, l.Slug, l.Title, l.Description, l.Price, l.Currency, l.Photos,
        l.Condition, l.VehicleMake, l.VehicleModel, l.VehicleYear, l.OemCode, l.QuantityPublished, available,
        l.Status.ToString().ToLowerInvariant());

    private static PagedResult<T> Paged<T>(List<T> items, int page, int pageSize, int total) => new()
    {
        Items = items, Page = page, PageSize = pageSize, Total = total
    };
}
```

> **Implementation note:** confirm `PagedResult<T>` property names (`Items/Page/PageSize/Total` and any `TotalPages`) against `src/Rozbirka.Application/Common/`, and confirm `Tenant.PlanExpiresAt` is the correct active-subscription field (the test seed uses it). Adjust the active-tenant predicate to match whatever the rest of the app uses for "subscription active" if different.

- [ ] **Step 2: Build the application + API projects**

Run: `dotnet build src/Rozbirka.API/Rozbirka.API.csproj`
Expected: will fail until the controller (1.8) and DI (1.7) are updated; resolve compile errors as you wire those tasks. For now build the Application project:
Run: `dotnet build src/Rozbirka.Application/Rozbirka.Application.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit interface + service**

```bash
git add src/Rozbirka.Application/Marketplace/IMarketplaceService.cs src/Rozbirka.Application/Marketplace/MarketplaceService.cs
git commit -m "feat(marketplace): service with public visibility, lifecycle, archive; no monetization"
```

### Task 1.7: DI registration (no entitlements)

**Files:**
- Modify: `src/Rozbirka.Infrastructure/DependencyInjection.cs`

- [ ] **Step 1: Register marketplace services (omit entitlements)**

In `AddInfrastructure`, ensure exactly these two registrations exist (remove any `IMarketplaceEntitlements` line):
```csharp
services.AddScoped<IMarketplaceService, MarketplaceService>();
services.AddScoped<IMarketplaceInventoryReader, MarketplaceInventoryReader>();
```

- [ ] **Step 2: Build**

Run: `dotnet build src/Rozbirka.Infrastructure/Rozbirka.Infrastructure.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Rozbirka.Infrastructure/DependencyInjection.cs
git commit -m "chore(marketplace): DI registration without entitlements"
```

### Task 1.8: Controller (spec routes + archive + public detail/shop)

**Files:**
- Create: `src/Rozbirka.API/Controllers/MarketplaceController.cs`

- [ ] **Step 1: Create the controller**

`src/Rozbirka.API/Controllers/MarketplaceController.cs`:
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Rozbirka.API.Filters;
using Rozbirka.Application.Common;
using Rozbirka.Application.Marketplace;
using Rozbirka.Application.Marketplace.DTOs;
using Rozbirka.Domain.Constants;

namespace Rozbirka.API.Controllers;

[ApiController]
[Route("api/v1/marketplace")]
public class MarketplaceController : ControllerBase
{
    private readonly IMarketplaceService _marketplace;
    public MarketplaceController(IMarketplaceService marketplace) => _marketplace = marketplace;

    private static MarketplaceSearchRequest Search(string? q, string? city, string? make, string? model,
        short? yearFrom, short? yearTo, string? condition, decimal? minPrice, decimal? maxPrice, string? sort, int page, int pageSize) =>
        new(q, city, make, model, yearFrom, yearTo, condition, minPrice, maxPrice, sort, page, pageSize);

    // ---------- Public ----------
    [AllowAnonymous]
    [HttpGet("listings")]
    public async Task<ActionResult<Result<PagedResult<MarketplaceListingCardDto>>>> GetListings(
        [FromQuery] string? q, [FromQuery] string? city, [FromQuery] string? make, [FromQuery] string? model,
        [FromQuery] short? yearFrom, [FromQuery] short? yearTo, [FromQuery] string? condition,
        [FromQuery] decimal? minPrice, [FromQuery] decimal? maxPrice, [FromQuery] string? sort,
        [FromQuery] int page = 1, [FromQuery(Name = "per_page")] int pageSize = 30, CancellationToken ct = default)
    {
        var result = await _marketplace.GetPublicListingsAsync(
            Search(q, city, make, model, yearFrom, yearTo, condition, minPrice, maxPrice, sort, page, pageSize), ct);
        return Ok(Result<PagedResult<MarketplaceListingCardDto>>.Success(result));
    }

    [AllowAnonymous]
    [HttpGet("listings/{slugOrId}")]
    public async Task<ActionResult<Result<MarketplaceListingDetailDto>>> GetListing(string slugOrId, CancellationToken ct)
    {
        var result = await _marketplace.GetPublicListingAsync(slugOrId, ct);
        if (result == null) return NotFound(Result.Failure("MARKETPLACE_LISTING_NOT_FOUND", "Listing not found."));
        return Ok(Result<MarketplaceListingDetailDto>.Success(result));
    }

    [AllowAnonymous]
    [HttpGet("shops/{slug}")]
    public async Task<ActionResult<Result<MarketplaceShopPublicDto>>> GetShop(string slug, CancellationToken ct)
    {
        var result = await _marketplace.GetPublicShopAsync(slug, ct);
        if (result == null) return NotFound(Result.Failure("MARKETPLACE_SHOP_NOT_FOUND", "Shop not found."));
        return Ok(Result<MarketplaceShopPublicDto>.Success(result));
    }

    [AllowAnonymous]
    [HttpGet("shops/{slug}/listings")]
    public async Task<ActionResult<Result<PagedResult<MarketplaceListingCardDto>>>> GetShopListings(
        string slug, [FromQuery] string? q, [FromQuery] string? condition, [FromQuery] string? sort,
        [FromQuery] int page = 1, [FromQuery(Name = "per_page")] int pageSize = 30, CancellationToken ct = default)
    {
        var result = await _marketplace.GetPublicShopListingsAsync(slug,
            Search(q, null, null, null, null, null, condition, null, null, sort, page, pageSize), ct);
        if (result == null) return NotFound(Result.Failure("MARKETPLACE_SHOP_NOT_FOUND", "Shop not found."));
        return Ok(Result<PagedResult<MarketplaceListingCardDto>>.Success(result));
    }

    // ---------- Seller: shop ----------
    [Authorize, AuthorizePermission(Permissions.Marketplace.View)]
    [HttpGet("shop")]
    public async Task<ActionResult<Result<MarketplaceShopDto?>>> GetSellerShop(CancellationToken ct) =>
        Ok(Result<MarketplaceShopDto?>.Success(await _marketplace.GetSellerShopAsync(ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.Manage)]
    [HttpPut("shop")]
    public async Task<ActionResult<Result<MarketplaceShopDto>>> UpsertSellerShop([FromBody] UpsertMarketplaceShopRequest request, CancellationToken ct) =>
        Ok(Result<MarketplaceShopDto>.Success(await _marketplace.UpsertShopAsync(request, ct)));

    // ---------- Seller: listings ----------
    [Authorize, AuthorizePermission(Permissions.Marketplace.View)]
    [HttpGet("seller/listings")]
    public async Task<ActionResult<Result<PagedResult<MarketplaceSellerListingDto>>>> GetSellerListings(
        [FromQuery] int page = 1, [FromQuery(Name = "per_page")] int pageSize = 30, CancellationToken ct = default) =>
        Ok(Result<PagedResult<MarketplaceSellerListingDto>>.Success(await _marketplace.GetSellerListingsAsync(page, pageSize, ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.View)]
    [HttpGet("seller/parts")]
    public async Task<ActionResult<Result<PagedResult<MarketplaceSellerPartDto>>>> SearchSellerParts(
        [FromQuery] string? q, [FromQuery] int page = 1, [FromQuery(Name = "per_page")] int pageSize = 30, CancellationToken ct = default) =>
        Ok(Result<PagedResult<MarketplaceSellerPartDto>>.Success(await _marketplace.SearchSellerPartsAsync(q, page, pageSize, ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.View)]
    [HttpGet("seller/summary")]
    public async Task<ActionResult<Result<MarketplaceSellerSummaryDto>>> GetSellerSummary(CancellationToken ct) =>
        Ok(Result<MarketplaceSellerSummaryDto>.Success(await _marketplace.GetSellerSummaryAsync(ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.Manage)]
    [HttpPost("seller/listings/from-part/{partId:guid}")]
    public async Task<ActionResult<Result<MarketplaceSellerListingDto>>> CreateListingFromPart(Guid partId, CancellationToken ct) =>
        StatusCode(201, Result<MarketplaceSellerListingDto>.Success(await _marketplace.CreateListingFromPartAsync(partId, ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.Manage)]
    [HttpPatch("seller/listings/{listingId:guid}")]
    public async Task<ActionResult<Result<MarketplaceSellerListingDto>>> UpdateListing(Guid listingId, [FromBody] UpdateMarketplaceListingRequest request, CancellationToken ct) =>
        Ok(Result<MarketplaceSellerListingDto>.Success(await _marketplace.UpdateListingAsync(listingId, request, ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.Manage)]
    [HttpPost("seller/listings/{listingId:guid}/publish")]
    public async Task<ActionResult<Result<MarketplaceSellerListingDto>>> Publish(Guid listingId, CancellationToken ct) =>
        Ok(Result<MarketplaceSellerListingDto>.Success(await _marketplace.PublishListingAsync(listingId, ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.Manage)]
    [HttpPost("seller/listings/{listingId:guid}/hide")]
    public async Task<ActionResult<Result<MarketplaceSellerListingDto>>> Hide(Guid listingId, CancellationToken ct) =>
        Ok(Result<MarketplaceSellerListingDto>.Success(await _marketplace.HideListingAsync(listingId, ct)));

    [Authorize, AuthorizePermission(Permissions.Marketplace.Manage)]
    [HttpPost("seller/listings/{listingId:guid}/archive")]
    public async Task<ActionResult<Result<MarketplaceSellerListingDto>>> Archive(Guid listingId, CancellationToken ct) =>
        Ok(Result<MarketplaceSellerListingDto>.Success(await _marketplace.ArchiveListingAsync(listingId, ct)));
}
```

- [ ] **Step 2: Build the API**

Run: `dotnet build src/Rozbirka.API/Rozbirka.API.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Rozbirka.API/Controllers/MarketplaceController.cs
git commit -m "feat(marketplace): controller with spec public routes, seller commands, archive"
```

### Task 1.9: Fix anonymous bypass in TenantMiddleware

**Files:**
- Modify: `src/Rozbirka.API/Middleware/TenantMiddleware.cs`

- [ ] **Step 1: Replace the `/public` prefix check with precise public-route matching**

Find the existing block (the Codex version matched `/api/v1/marketplace/public`). Replace the bypass condition so it matches the spec public routes but NOT the seller `/shop` route:
```csharp
var path = context.Request.Path.Value ?? "";
const string mp = "/api/v1/marketplace";
var isPublicMarketplace =
    path.StartsWith($"{mp}/listings", StringComparison.OrdinalIgnoreCase) ||
    path.StartsWith($"{mp}/shops", StringComparison.OrdinalIgnoreCase);

if (isPublicMarketplace && HttpMethods.IsGet(context.Request.Method))
{
    ctx.TenantId = Guid.Empty;
    ctx.Role = "public";
    ctx.Permissions = [];
    await _next(context);
    return;
}
```

> Note: `/api/v1/marketplace/shop` (seller, singular) does NOT match `/shops` — it correctly stays on the authed path. `/shops/{slug}` and `/shops/{slug}/listings` both match. Verify there is no `/listings`-prefixed seller route outside `/seller/...` (there isn't — seller listings live under `/seller/listings`, which does not start with `/marketplace/listings`).

- [ ] **Step 2: Build**

Run: `dotnet build src/Rozbirka.API/Rozbirka.API.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Rozbirka.API/Middleware/TenantMiddleware.cs
git commit -m "fix(marketplace): anonymous bypass matches spec public routes only"
```

### Task 1.10: EF configurations + DbContext wiring

**Files:**
- Create: `src/Rozbirka.Infrastructure/Persistence/Configurations/MarketplaceShopConfiguration.cs`
- Create: `src/Rozbirka.Infrastructure/Persistence/Configurations/MarketplaceListingConfiguration.cs`
- Modify: `src/Rozbirka.Infrastructure/Persistence/AppDbContext.cs`

- [ ] **Step 1: Shop configuration (adds MessengerUrl)**

`MarketplaceShopConfiguration.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Rozbirka.Domain.Entities;

namespace Rozbirka.Infrastructure.Persistence.Configurations;

public class MarketplaceShopConfiguration : IEntityTypeConfiguration<MarketplaceShop>
{
    public void Configure(EntityTypeBuilder<MarketplaceShop> builder)
    {
        builder.ToTable("marketplace_shops", "marketplace");
        builder.HasKey(s => s.Id);
        builder.Property(s => s.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(s => s.Slug).HasMaxLength(140).IsRequired();
        builder.Property(s => s.DisplayName).HasMaxLength(160).IsRequired();
        builder.Property(s => s.Description).HasMaxLength(2000);
        builder.Property(s => s.City).HasMaxLength(120);
        builder.Property(s => s.LogoUrl).HasMaxLength(1000);
        builder.Property(s => s.Phone).HasMaxLength(40);
        builder.Property(s => s.MessengerUrl).HasMaxLength(500);
        builder.Property(s => s.PublicContactName).HasMaxLength(160);
        builder.HasIndex(s => s.TenantId).IsUnique();
        builder.HasIndex(s => s.Slug).IsUnique();
        builder.HasOne(s => s.Tenant).WithMany().HasForeignKey(s => s.TenantId);
    }
}
```

- [ ] **Step 2: Listing configuration**

`MarketplaceListingConfiguration.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Rozbirka.Domain.Entities;
using Rozbirka.Domain.Enums;

namespace Rozbirka.Infrastructure.Persistence.Configurations;

public class MarketplaceListingConfiguration : IEntityTypeConfiguration<MarketplaceListing>
{
    public void Configure(EntityTypeBuilder<MarketplaceListing> builder)
    {
        builder.ToTable("marketplace_listings", "marketplace");
        builder.HasKey(l => l.Id);
        builder.Property(l => l.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(l => l.Slug).HasMaxLength(200).IsRequired();
        builder.Property(l => l.Title).HasMaxLength(220).IsRequired();
        builder.Property(l => l.Description).HasMaxLength(4000);
        builder.Property(l => l.Currency).HasMaxLength(3).HasDefaultValue("UAH").IsRequired();
        builder.Property(l => l.Price).HasColumnType("numeric(12,2)");
        builder.Property(l => l.Condition).HasMaxLength(40);
        builder.Property(l => l.VehicleMake).HasMaxLength(100);
        builder.Property(l => l.VehicleModel).HasMaxLength(100);
        builder.Property(l => l.VehicleYear).HasColumnType("smallint");
        builder.Property(l => l.OemCode).HasMaxLength(100);
        builder.Property(l => l.Status).HasMaxLength(20)
            .HasConversion(s => s.ToString().ToLowerInvariant(), s => Enum.Parse<MarketplaceListingStatus>(s, true))
            .HasDefaultValue(MarketplaceListingStatus.Draft);
        builder.Property(l => l.Photos).HasColumnType("jsonb");
        builder.HasIndex(l => l.Slug).IsUnique();
        builder.HasIndex(l => new { l.TenantId, l.Status });
        builder.HasIndex(l => new { l.ShopId, l.Status });
        builder.HasIndex(l => new { l.TenantId, l.PartId }).HasFilter("\"Status\" <> 'archived'");
        builder.HasIndex(l => l.OemCode).HasFilter("\"OemCode\" IS NOT NULL");
        builder.HasIndex(l => new { l.VehicleMake, l.VehicleModel, l.VehicleYear });
        builder.HasIndex(l => l.PublishedAt);
        builder.HasOne(l => l.Tenant).WithMany().HasForeignKey(l => l.TenantId);
        builder.HasOne(l => l.Shop).WithMany(s => s.Listings).HasForeignKey(l => l.ShopId);
        builder.HasOne(l => l.Part).WithMany().HasForeignKey(l => l.PartId);
    }
}
```

- [ ] **Step 3: Register DbSets, configs, and UpdatedAt hook in AppDbContext**

In `AppDbContext.cs` add:
```csharp
public DbSet<MarketplaceShop> MarketplaceShops => Set<MarketplaceShop>();
public DbSet<MarketplaceListing> MarketplaceListings => Set<MarketplaceListing>();
```
In `OnModelCreating`:
```csharp
mb.ApplyConfiguration(new MarketplaceShopConfiguration());
mb.ApplyConfiguration(new MarketplaceListingConfiguration());
```
In the `SaveChanges` UpdatedAt hook (where other entities set `UpdatedAt`), add:
```csharp
else if (entry.Entity is MarketplaceShop shop) shop.UpdatedAt = DateTime.UtcNow;
else if (entry.Entity is MarketplaceListing listing) listing.UpdatedAt = DateTime.UtcNow;
```
Also expose the DbSets on `IAppDbContext` (the interface the service uses) — add the same two `DbSet<>` members there.

- [ ] **Step 4: Build**

Run: `dotnet build src/Rozbirka.Infrastructure/Rozbirka.Infrastructure.csproj`
Expected: Build succeeded.

- [ ] **Step 5: Commit**

```bash
git add src/Rozbirka.Infrastructure/Persistence
git commit -m "feat(marketplace): EF configurations and DbContext wiring"
```

### Task 1.11: Generate the migration

**Files:**
- Create: `src/Rozbirka.Infrastructure/Persistence/Migrations/*_AddMarketplace.*`

- [ ] **Step 1: Add the migration**

```bash
cd /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.core
dotnet ef migrations add AddMarketplace --project src/Rozbirka.Infrastructure --startup-project src/Rozbirka.API
```
Expected: new migration files generated; build succeeds.

- [ ] **Step 2: Append role-permission backfill SQL to the migration `Up`**

Open the generated `*_AddMarketplace.cs` and add at the end of `Up` (idempotent, mirrors existing role seeding):
```csharp
migrationBuilder.Sql(@"
UPDATE roles SET ""Permissions"" = (
  SELECT jsonb_agg(DISTINCT p ORDER BY p)
  FROM jsonb_array_elements_text(""Permissions"" || '[""marketplace.view"",""marketplace.manage""]'::jsonb) p
) WHERE ""IsSystem"" = true AND lower(""Name"") IN ('owner','manager');

UPDATE roles SET ""Permissions"" = (
  SELECT jsonb_agg(DISTINCT p ORDER BY p)
  FROM jsonb_array_elements_text(""Permissions"" || '[""marketplace.view""]'::jsonb) p
) WHERE ""IsSystem"" = true AND lower(""Name"") = 'master';
");
```
And a matching cleanup in `Down` if other migrations follow that convention (optional — removing permissions on downgrade).

> Confirm the `roles` table/column names (`Permissions`, `IsSystem`, `Name`) against an existing role-seeding migration before finalizing.

- [ ] **Step 3: Build + verify the model snapshot updated**

Run: `dotnet build src/Rozbirka.Infrastructure/Rozbirka.Infrastructure.csproj`
Expected: Build succeeded; `AppDbContextModelSnapshot.cs` now includes both marketplace tables.

- [ ] **Step 4: Commit**

```bash
git add src/Rozbirka.Infrastructure/Persistence/Migrations
git commit -m "feat(marketplace): AddMarketplace migration with permission backfill"
```

### Task 1.12: Permissions verification

**Files:**
- Modify (if needed): `src/Rozbirka.Domain/Constants/Permissions.cs`

- [ ] **Step 1: Ensure marketplace permissions + dependency exist**

Confirm `Permissions.Marketplace.View/Manage` constants exist, `Marketplace.View/Manage` are in `All`, `Dependencies[Marketplace.Manage] = [Marketplace.View, Parts.View]`, and Owner/Manager get both while Master gets View. If the reset removed them (it did — Permissions.cs reverted to pre-marketplace), re-add exactly as in the conventions reference.

- [ ] **Step 2: Build**

Run: `dotnet build src/Rozbirka.Domain/Rozbirka.Domain.csproj`
Expected: Build succeeded.

- [ ] **Step 3: Commit**

```bash
git add src/Rozbirka.Domain/Constants/Permissions.cs
git commit -m "feat(marketplace): permissions and role dependencies"
```

### Task 1.13: Lifecycle tests (InMemory, fast)

**Files:**
- Create: `tests/Rozbirka.Tests/Marketplace/MarketplaceLifecycleTests.cs`

These cover pure logic that InMemory models faithfully: slug seeding, archive, already-listed, over-availability, draft-creation-unrestricted, publish-requires-published-shop.

- [ ] **Step 1: Write the tests**

`tests/Rozbirka.Tests/Marketplace/MarketplaceLifecycleTests.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Rozbirka.Application.Marketplace;
using Rozbirka.Application.Marketplace.DTOs;
using Rozbirka.Domain.Entities;
using Rozbirka.Domain.Enums;
using Rozbirka.Domain.Exceptions;
using Rozbirka.Infrastructure.Persistence;

namespace Rozbirka.Tests.Marketplace;

public class MarketplaceLifecycleTests
{
    private static AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase($"mp_{Guid.NewGuid():N}").Options);

    private static MarketplaceService Sut(AppDbContext db, Guid tenantId) =>
        new(db, new TestRequestContext(tenantId), new MarketplaceInventoryReader(db));

    [Fact]
    public async Task CreateFromPart_SeedsDraftWithSlugAndQuantity()
    {
        await using var db = NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t, name: "Фара права LED", qty: 3);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(Shop(true), default);

        var draft = await svc.CreateListingFromPartAsync(part, default);

        Assert.Equal("draft", draft.Status);
        Assert.Equal("Фара права LED", draft.Title);
        Assert.StartsWith("fara-prava-led-", draft.Slug);
        Assert.Equal(3, draft.QuantityPublished);
    }

    [Fact]
    public async Task CreateFromPart_SecondTimeForSamePart_Throws()
    {
        await using var db = NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(Shop(true), default);
        await svc.CreateListingFromPartAsync(part, default);

        var ex = await Assert.ThrowsAsync<ConflictException>(() => svc.CreateListingFromPartAsync(part, default));
        Assert.Equal("MARKETPLACE_PART_ALREADY_LISTED", ex.Code);
    }

    [Fact]
    public async Task Publish_RequiresPublishedShop()
    {
        await using var db = NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(Shop(false), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);

        var ex = await Assert.ThrowsAsync<ConflictException>(() => svc.PublishListingAsync(draft.Id, default));
        Assert.Equal("MARKETPLACE_SHOP_NOT_PUBLISHED", ex.Code);
    }

    [Fact]
    public async Task Update_QuantityAboveStock_Throws()
    {
        await using var db = NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t, qty: 1);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(Shop(true), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);

        var ex = await Assert.ThrowsAsync<ConflictException>(
            () => svc.UpdateListingAsync(draft.Id, new UpdateMarketplaceListingRequest(QuantityPublished: 2), default));
        Assert.Equal("MARKETPLACE_PART_NOT_AVAILABLE", ex.Code);
    }

    [Fact]
    public async Task Archive_SetsArchivedAndAllowsRelistingSamePart()
    {
        await using var db = NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(Shop(true), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);

        var archived = await svc.ArchiveListingAsync(draft.Id, default);
        Assert.Equal("archived", archived.Status);

        // Same part can be listed again after archive
        var relisted = await svc.CreateListingFromPartAsync(part, default);
        Assert.Equal("draft", relisted.Status);
    }

    [Fact]
    public async Task SellerMutation_OnAnotherTenantsListing_Throws404()
    {
        await using var db = NewDb();
        var owner = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var attacker = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, owner);
        var ownerSvc = Sut(db, owner);
        await ownerSvc.UpsertShopAsync(Shop(true), default);
        var listing = await ownerSvc.CreateListingFromPartAsync(part, default);

        var attackerSvc = Sut(db, attacker);
        await Assert.ThrowsAsync<NotFoundException>(() => attackerSvc.HideListingAsync(listing.Id, default));
        await Assert.ThrowsAsync<NotFoundException>(() => attackerSvc.PublishListingAsync(listing.Id, default));
    }

    private static UpsertMarketplaceShopRequest Shop(bool published) =>
        new("AvtoParts Lviv", null, "Львів", "+380501112233", null, "Іван", published);

    private sealed class TestRequestContext(Guid tenantId) : IRequestContext
    {
        public Guid TenantId { get; } = tenantId;
        public Guid UserId { get; } = Guid.NewGuid();
        public string? UserName => "Owner";
        public string Role => "owner";
        public HashSet<string> Permissions { get; } = [];
        public bool HasPermission(string permission) => true;
    }
}
```

- [ ] **Step 2: Create the shared seed helper**

`tests/Rozbirka.Tests/Marketplace/Seed.cs`:
```csharp
using Rozbirka.Domain.Entities;
using Rozbirka.Domain.Enums;
using Rozbirka.Infrastructure.Persistence;

namespace Rozbirka.Tests.Marketplace;

internal static class Seed
{
    public static async Task<Guid> TenantAsync(AppDbContext db, DateTime? planExpiresAt)
    {
        var id = Guid.NewGuid();
        db.Tenants.Add(new Tenant { Id = id, Name = "AvtoParts Lviv", Slug = $"avtoparts-{id:N}", City = "Львів", PlanExpiresAt = planExpiresAt });
        await db.SaveChangesAsync();
        return id;
    }

    public static async Task<Guid> PartAsync(AppDbContext db, Guid tenantId, string name = "Фара права LED", string? qr = null, int qty = 1)
    {
        var userId = Guid.NewGuid();
        var partId = Guid.NewGuid();
        db.Users.Add(new User { Id = userId, Phone = $"+380{Random.Shared.Next(100000000, 999999999)}", DisplayName = "Owner" });
        db.Parts.Add(new Part
        {
            Id = partId, TenantId = tenantId, Name = name, OemCode = "8R0941004",
            Condition = PartCondition.Good, QrCode = qr ?? $"qr-{partId:N}", SourceType = PartSourceType.Free,
            Quantity = qty, Unit = "шт", CreatedBy = userId,
            CompatCarBrand = "Audi", CompatCarModel = "Q5 8R", CompatCarYear = 2014,
        });
        await db.SaveChangesAsync();
        return partId;
    }
}
```

> Confirm `Tenant`, `Part`, `User` required fields against the entities during implementation; adjust seed if the constructor surface differs.

- [ ] **Step 3: Run the tests**

Run: `dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj --filter MarketplaceLifecycleTests`
Expected: PASS (6 tests).

- [ ] **Step 4: Commit**

```bash
git add tests/Rozbirka.Tests/Marketplace/MarketplaceLifecycleTests.cs tests/Rozbirka.Tests/Marketplace/Seed.cs
git commit -m "test(marketplace): lifecycle, archive, tenant isolation (InMemory)"
```

### Task 1.14: Public visibility + isolation tests (Testcontainers Postgres)

Why Postgres here: the public visibility query joins listings→shop→tenant and computes availability via correlated `OrderItems` subqueries; EF InMemory does not faithfully execute these (the review's H2). These tests run against a real Postgres so query translation is validated.

**Files:**
- Modify: `tests/Rozbirka.Tests/Rozbirka.Tests.csproj`
- Create: `tests/Rozbirka.Tests/Marketplace/PostgresFixture.cs`
- Create: `tests/Rozbirka.Tests/Marketplace/MarketplaceVisibilityTests.cs`

- [ ] **Step 1: Add the Testcontainers package**

In `Rozbirka.Tests.csproj` add:
```xml
<PackageReference Include="Testcontainers.PostgreSql" Version="4.0.0" />
```
Run: `dotnet restore tests/Rozbirka.Tests/Rozbirka.Tests.csproj`
Expected: restore succeeds.

- [ ] **Step 2: Create the fixture (applies migrations to a throwaway Postgres)**

`tests/Rozbirka.Tests/Marketplace/PostgresFixture.cs`:
```csharp
using Microsoft.EntityFrameworkCore;
using Rozbirka.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Rozbirka.Tests.Marketplace;

public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var db = NewDb();
        await db.Database.MigrateAsync();
    }

    public AppDbContext NewDb() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ConnectionString).Options);

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

[CollectionDefinition("postgres")]
public class PostgresCollection : ICollectionFixture<PostgresFixture>;
```

> If `IAsyncLifetime` requires `ValueTask` in this xUnit version, match the existing signature used elsewhere in the suite.

- [ ] **Step 3: Write the visibility tests**

`tests/Rozbirka.Tests/Marketplace/MarketplaceVisibilityTests.cs`:
```csharp
using Rozbirka.Application.Marketplace;
using Rozbirka.Application.Marketplace.DTOs;
using Microsoft.EntityFrameworkCore;
using Rozbirka.Infrastructure.Persistence;

namespace Rozbirka.Tests.Marketplace;

[Collection("postgres")]
public class MarketplaceVisibilityTests
{
    private readonly PostgresFixture _pg;
    public MarketplaceVisibilityTests(PostgresFixture pg) => _pg = pg;

    private MarketplaceService Sut(AppDbContext db, Guid tenantId) =>
        new(db, new Ctx(tenantId), new MarketplaceInventoryReader(db));

    [Fact]
    public async Task PublicListings_ReturnsOnlyPublishedActiveAvailable()
    {
        await using var db = _pg.NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t, qty: 1);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(new UpsertMarketplaceShopRequest("Shop", null, "Львів", null, null, null, true), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);
        await svc.PublishListingAsync(draft.Id, default);

        var result = await svc.GetPublicListingsAsync(new MarketplaceSearchRequest(), default);
        Assert.Single(result.Items);
        Assert.Equal(draft.Slug, result.Items[0].Slug);
    }

    [Fact]
    public async Task PublicListings_HidesExpiredTenant()
    {
        await using var db = _pg.NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(-1));
        var part = await Seed.PartAsync(db, t, qty: 1);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(new UpsertMarketplaceShopRequest("Shop", null, "Львів", null, null, null, true), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);
        await svc.PublishListingAsync(draft.Id, default);

        var result = await svc.GetPublicListingsAsync(new MarketplaceSearchRequest(), default);
        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task PublicListings_ExcludeOtherTenantDraftHiddenArchived()
    {
        await using var db = _pg.NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var pPub = await Seed.PartAsync(db, t, name: "Published", qty: 1);
        var pDraft = await Seed.PartAsync(db, t, name: "Draft", qty: 1);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(new UpsertMarketplaceShopRequest("Shop", null, "Львів", null, null, null, true), default);
        var pub = await svc.CreateListingFromPartAsync(pPub, default);
        await svc.PublishListingAsync(pub.Id, default);
        await svc.CreateListingFromPartAsync(pDraft, default); // stays draft

        var result = await svc.GetPublicListingsAsync(new MarketplaceSearchRequest(), default);
        Assert.Single(result.Items);
        Assert.Equal("Published", result.Items[0].Title);
    }

    [Fact]
    public async Task PublicListings_DropsZeroAvailability()
    {
        await using var db = _pg.NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t, qty: 1);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(new UpsertMarketplaceShopRequest("Shop", null, "Львів", null, null, null, true), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);
        await svc.PublishListingAsync(draft.Id, default);

        var p = await db.Parts.IgnoreQueryFilters().FirstAsync(x => x.Id == part);
        p.Quantity = 0;
        await db.SaveChangesAsync();

        var result = await svc.GetPublicListingsAsync(new MarketplaceSearchRequest(), default);
        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task PublicListing_Detail_404ForDraft()
    {
        await using var db = _pg.NewDb();
        var t = await Seed.TenantAsync(db, DateTime.UtcNow.AddDays(10));
        var part = await Seed.PartAsync(db, t, qty: 1);
        var svc = Sut(db, t);
        await svc.UpsertShopAsync(new UpsertMarketplaceShopRequest("Shop", null, "Львів", null, null, null, true), default);
        var draft = await svc.CreateListingFromPartAsync(part, default);

        var detail = await svc.GetPublicListingAsync(draft.Slug, default);
        Assert.Null(detail);
    }

    private sealed class Ctx(Guid tenantId) : IRequestContext
    {
        public Guid TenantId { get; } = tenantId;
        public Guid UserId { get; } = Guid.NewGuid();
        public string? UserName => "Owner";
        public string Role => "owner";
        public HashSet<string> Permissions { get; } = [];
        public bool HasPermission(string permission) => true;
    }
}
```

- [ ] **Step 4: Run (requires Docker running)**

Run: `dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj --filter MarketplaceVisibilityTests`
Expected: PASS (5 tests). If Docker is unavailable, document the skip; do not delete the tests.

- [ ] **Step 5: Run the whole backend suite + build**

Run: `dotnet build && dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj`
Expected: Build succeeded; all marketplace tests pass; no pre-existing tests broken.

- [ ] **Step 6: Commit**

```bash
git add tests/Rozbirka.Tests/Rozbirka.Tests.csproj tests/Rozbirka.Tests/Marketplace/PostgresFixture.cs tests/Rozbirka.Tests/Marketplace/MarketplaceVisibilityTests.cs
git commit -m "test(marketplace): public visibility + isolation on real Postgres"
```

---

# Phase 2 — Frontend (`rozbirka.web`)

All paths relative to `/Users/oleksiilopatskyi/Code/rozbirka/rozbirka.web`. Gate: `npm run check` must pass at the end of each task group.

### Task 2.1: API DTO types + adapter (spec paths, full params, no mock blending)

**Files:**
- Create: `src/features/marketplace/marketplace-api-types.ts`
- Create: `src/api/marketplace.ts`
- Test: `src/api/marketplace.test.ts`

- [ ] **Step 1: Create the DTO types (mirror backend public + seller DTOs)**

`src/features/marketplace/marketplace-api-types.ts`:
```typescript
export interface MarketplaceShopSummaryDto {
  slug: string
  name: string
  city: string | null
}

export interface MarketplaceShopPublicDto {
  slug: string
  name: string
  description: string | null
  city: string | null
  logoUrl: string | null
  phone: string | null
  messengerUrl: string | null
  publicContactName: string | null
}

export interface MarketplaceListingCardDto {
  slug: string
  title: string
  price: number | null
  currency: string
  photo: string | null
  condition: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  oemCode: string | null
  quantityAvailable: number
  shop: MarketplaceShopSummaryDto
}

export interface MarketplaceListingDetailDto {
  slug: string
  title: string
  description: string | null
  price: number | null
  currency: string
  photos: string[]
  condition: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  oemCode: string | null
  quantityAvailable: number
  shop: MarketplaceShopPublicDto
}

export interface MarketplaceCatalogParams {
  q?: string
  city?: string
  make?: string
  model?: string
  yearFrom?: number
  yearTo?: number
  condition?: string
  minPrice?: number
  maxPrice?: number
  sort?: 'price_asc' | 'price_desc' | 'newest'
  page?: number
  pageSize?: number
}

// Seller
export interface MarketplaceShopDto {
  id: string
  slug: string
  name: string
  description: string | null
  city: string | null
  logoUrl: string | null
  phone: string | null
  messengerUrl: string | null
  publicContactName: string | null
  isPublished: boolean
}

export interface UpsertMarketplaceShopRequest {
  displayName: string
  description: string | null
  city: string | null
  phone: string | null
  messengerUrl: string | null
  publicContactName: string | null
  isPublished: boolean
}

export interface MarketplaceSellerListingDto {
  id: string
  shopId: string
  partId: string
  slug: string
  title: string
  description: string | null
  price: number | null
  currency: string
  photos: string[]
  condition: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  oemCode: string | null
  quantityPublished: number
  quantityAvailable: number
  status: 'draft' | 'published' | 'hidden' | 'sold' | 'archived'
}

export interface MarketplaceSellerPartDto {
  id: string
  name: string
  photos: string[]
  quantityTotal: number
  quantityAvailable: number
  carMake: string | null
  carModel: string | null
  carYear: number | null
  condition: string | null
  oemCode: string | null
  alreadyListed: boolean
  listingId: string | null
}

export interface MarketplaceSellerSummaryDto {
  shop: MarketplaceShopDto | null
  draftListings: number
  publishedListings: number
  hiddenListings: number
  availableWarehouseParts: number
}

export interface UpdateMarketplaceListingRequest {
  title?: string
  description?: string
  price?: number
  quantityPublished?: number
}
```

- [ ] **Step 2: Write the failing adapter test**

`src/api/marketplace.test.ts`:
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from './marketplace'
import { apiClient, publicApiClient } from './client'

vi.mock('./client', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() },
  publicApiClient: { get: vi.fn() },
}))

describe('marketplaceApi', () => {
  beforeEach(() => {
    vi.mocked(publicApiClient.get).mockReset()
    vi.mocked(apiClient.get).mockReset()
  })

  it('calls the spec public listings path with all compacted params', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: { items: [], page: 1, pageSize: 30, total: 0 },
    })
    await marketplaceApi.getCatalog({
      q: 'фара', city: 'Львів', make: 'Audi', yearFrom: 2010,
      minPrice: 100, sort: 'price_asc', pageSize: 12,
    })
    expect(publicApiClient.get).toHaveBeenCalledWith('/marketplace/listings', {
      params: { q: 'фара', city: 'Львів', make: 'Audi', yearFrom: 2010, minPrice: 100, sort: 'price_asc', per_page: 12 },
    })
  })

  it('maps card DTOs to catalog listings without inventing featured/stats', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({
      data: {
        items: [{
          slug: 'fara-1', title: 'Фара', price: 6400, currency: 'UAH', photo: null,
          condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5', vehicleYear: 2014,
          oemCode: '8R0941004', quantityAvailable: 2,
          shop: { slug: 'shop-1', name: 'AvtoParts', city: 'Львів' },
        }],
        page: 1, pageSize: 30, total: 1,
      },
    })
    const result = await marketplaceApi.getCatalog({})
    expect(result.total).toBe(1)
    expect(result.listings[0].slug).toBe('fara-1')
    expect(result.listings[0]).not.toHaveProperty('featured')
  })

  it('fetches listing detail by slug', async () => {
    vi.mocked(publicApiClient.get).mockResolvedValueOnce({ data: { slug: 'fara-1', title: 'Фара', photos: [], currency: 'UAH', quantityAvailable: 1, shop: { slug: 's', name: 'n', description: null, city: null, logoUrl: null, phone: null, messengerUrl: null, publicContactName: null } } })
    const detail = await marketplaceApi.getListing('fara-1')
    expect(publicApiClient.get).toHaveBeenCalledWith('/marketplace/listings/fara-1')
    expect(detail.slug).toBe('fara-1')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- src/api/marketplace.test.ts`
Expected: FAIL — `./marketplace` not found.

- [ ] **Step 4: Implement the adapter (mock fallback only in DEV catch; never blended)**

`src/api/marketplace.ts`:
```typescript
import { apiClient, publicApiClient } from './client'
import type { PagedResult } from './types'
import type {
  MarketplaceCatalogParams,
  MarketplaceListingCardDto,
  MarketplaceListingDetailDto,
  MarketplaceSellerListingDto,
  MarketplaceSellerPartDto,
  MarketplaceSellerSummaryDto,
  MarketplaceShopDto,
  MarketplaceShopPublicDto,
  UpdateMarketplaceListingRequest,
  UpsertMarketplaceShopRequest,
} from '@/features/marketplace/marketplace-api-types'

export interface MarketplaceCatalogResult {
  listings: MarketplaceListingCardDto[]
  total: number
}

function compactParams(p: MarketplaceCatalogParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (p.q) out.q = p.q
  if (p.city) out.city = p.city
  if (p.make) out.make = p.make
  if (p.model) out.model = p.model
  if (p.yearFrom != null) out.yearFrom = p.yearFrom
  if (p.yearTo != null) out.yearTo = p.yearTo
  if (p.condition) out.condition = p.condition
  if (p.minPrice != null) out.minPrice = p.minPrice
  if (p.maxPrice != null) out.maxPrice = p.maxPrice
  if (p.sort && p.sort !== 'newest') out.sort = p.sort
  if (p.page != null) out.page = p.page
  if (p.pageSize != null) out.per_page = p.pageSize
  return out
}

export const marketplaceApi = {
  async getCatalog(params: MarketplaceCatalogParams = {}): Promise<MarketplaceCatalogResult> {
    try {
      const resp = await publicApiClient.get<PagedResult<MarketplaceListingCardDto>>(
        '/marketplace/listings', { params: compactParams(params) })
      return { listings: resp.data.items, total: resp.data.total }
    } catch (error) {
      if (import.meta.env.DEV) {
        const { mockCatalog } = await import('@/features/marketplace/mock-data')
        return mockCatalog
      }
      throw error
    }
  },

  async getListing(slugOrId: string): Promise<MarketplaceListingDetailDto> {
    const resp = await publicApiClient.get<MarketplaceListingDetailDto>(`/marketplace/listings/${slugOrId}`)
    return resp.data
  },

  async getShop(slug: string): Promise<MarketplaceShopPublicDto> {
    const resp = await publicApiClient.get<MarketplaceShopPublicDto>(`/marketplace/shops/${slug}`)
    return resp.data
  },

  async getShopListings(slug: string, params: MarketplaceCatalogParams = {}): Promise<MarketplaceCatalogResult> {
    const resp = await publicApiClient.get<PagedResult<MarketplaceListingCardDto>>(
      `/marketplace/shops/${slug}/listings`, { params: compactParams(params) })
    return { listings: resp.data.items, total: resp.data.total }
  },

  // ---- Seller ----
  async getSellerShop(): Promise<MarketplaceShopDto | null> {
    const resp = await apiClient.get<MarketplaceShopDto | null>('/marketplace/shop')
    return resp.data
  },
  async upsertSellerShop(payload: UpsertMarketplaceShopRequest): Promise<MarketplaceShopDto> {
    const resp = await apiClient.put<MarketplaceShopDto>('/marketplace/shop', payload)
    return resp.data
  },
  async getSellerSummary(): Promise<MarketplaceSellerSummaryDto> {
    const resp = await apiClient.get<MarketplaceSellerSummaryDto>('/marketplace/seller/summary')
    return resp.data
  },
  async getSellerListings(page = 1, pageSize = 30): Promise<PagedResult<MarketplaceSellerListingDto>> {
    const resp = await apiClient.get<PagedResult<MarketplaceSellerListingDto>>('/marketplace/seller/listings', { params: { page, per_page: pageSize } })
    return resp.data
  },
  async searchSellerParts(q?: string, page = 1, pageSize = 30): Promise<PagedResult<MarketplaceSellerPartDto>> {
    const resp = await apiClient.get<PagedResult<MarketplaceSellerPartDto>>('/marketplace/seller/parts', { params: { q, page, per_page: pageSize } })
    return resp.data
  },
  async createListingFromPart(partId: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/from-part/${partId}`)
    return resp.data
  },
  async updateListing(id: string, payload: UpdateMarketplaceListingRequest): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.patch<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}`, payload)
    return resp.data
  },
  async publishListing(id: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}/publish`)
    return resp.data
  },
  async hideListing(id: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}/hide`)
    return resp.data
  },
  async archiveListing(id: string): Promise<MarketplaceSellerListingDto> {
    const resp = await apiClient.post<MarketplaceSellerListingDto>(`/marketplace/seller/listings/${id}/archive`)
    return resp.data
  },
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/api/marketplace.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/marketplace.ts src/api/marketplace.test.ts src/features/marketplace/marketplace-api-types.ts
git commit -m "feat(marketplace-web): API adapter with spec paths and full params"
```

### Task 2.2: Mock data (DEV fallback only)

**Files:**
- Create: `src/features/marketplace/mock-data.ts`

- [ ] **Step 1: Create isolated mock catalog (shape matches the real DTO)**

`src/features/marketplace/mock-data.ts`:
```typescript
import type { MarketplaceCatalogResult } from '@/api/marketplace'

export const mockCatalog: MarketplaceCatalogResult = {
  total: 2,
  listings: [
    {
      slug: 'fara-prava-led-11112222',
      title: 'Фара права LED',
      price: 6400, currency: 'UAH', photo: null,
      condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5 8R', vehicleYear: 2014,
      oemCode: '8R0941004', quantityAvailable: 1,
      shop: { slug: 'avtoparts-lviv', name: 'AvtoParts Lviv', city: 'Львів' },
    },
    {
      slug: 'dzerkalo-live-33334444',
      title: 'Дзеркало ліве',
      price: 2100, currency: 'UAH', photo: null,
      condition: 'good', vehicleMake: 'VW', vehicleModel: 'Passat B7', vehicleYear: 2012,
      oemCode: '3AB857933', quantityAvailable: 2,
      shop: { slug: 'avtoparts-lviv', name: 'AvtoParts Lviv', city: 'Львів' },
    },
  ],
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/marketplace/mock-data.ts
git commit -m "feat(marketplace-web): isolated DEV mock catalog"
```

### Task 2.3: Catalog screen + listing card (filters/sort wired, links)

**Files:**
- Create: `src/features/marketplace/listing-card.tsx`
- Create: `src/features/marketplace/marketplace-screen.tsx`
- Test: `src/features/marketplace/marketplace-screen.test.tsx`

- [ ] **Step 1: Create the listing card (a link to the detail route)**

`src/features/marketplace/listing-card.tsx`:
```tsx
import { Link } from 'react-router'
import type { MarketplaceListingCardDto } from './marketplace-api-types'

export function ListingCard({ listing }: { listing: MarketplaceListingCardDto }) {
  const vehicle = [listing.vehicleMake, listing.vehicleModel, listing.vehicleYear]
    .filter(Boolean)
    .join(' ')
  return (
    <Link
      to={`/marketplace/listings/${listing.slug}`}
      className="group block overflow-hidden rounded-[10px] border border-white/8 bg-[#16181c] transition-colors hover:border-white/20"
    >
      <article>
        <div className="aspect-[4/3] w-full bg-zinc-800/60">
          {listing.photo && (
            <img src={listing.photo} alt={listing.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-1 text-sm font-medium text-white">{listing.title}</h3>
          {vehicle && <p className="line-clamp-1 text-xs text-white/50">{vehicle}</p>}
          {listing.oemCode && <p className="text-xs text-white/40">OEM: {listing.oemCode}</p>}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-semibold text-white">
              {listing.price != null ? `${listing.price.toLocaleString('uk-UA')} ${listing.currency}` : 'Ціна за запитом'}
            </span>
            <span className="text-xs text-white/40">{listing.shop.city ?? ''}</span>
          </div>
        </div>
      </article>
    </Link>
  )
}
```

- [ ] **Step 2: Write the failing screen test**

`src/features/marketplace/marketplace-screen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '@/api/marketplace'
import { MarketplaceScreen } from './marketplace-screen'

vi.mock('@/api/marketplace', () => ({ marketplaceApi: { getCatalog: vi.fn() } }))
const mockGet = vi.mocked(marketplaceApi.getCatalog)

const sample = {
  total: 1,
  listings: [{
    slug: 'fara-1', title: 'Фара права LED', price: 6400, currency: 'UAH', photo: null,
    condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5', vehicleYear: 2014,
    oemCode: '8R0941004', quantityAvailable: 1,
    shop: { slug: 'shop-1', name: 'AvtoParts', city: 'Львів' },
  }],
}

describe('MarketplaceScreen', () => {
  beforeEach(() => { mockGet.mockReset(); mockGet.mockResolvedValue(sample) })

  it('loads and renders catalog cards as links to detail', async () => {
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    const card = await screen.findByRole('link', { name: /фара права led/i })
    expect(card).toHaveAttribute('href', '/marketplace/listings/fara-1')
    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('passes search query to the API', async () => {
    const user = userEvent.setup()
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    await screen.findByRole('link', { name: /фара/i })
    await user.type(screen.getByRole('searchbox'), '8R0941004')
    await user.click(screen.getByRole('button', { name: /знайти/i }))
    expect(mockGet).toHaveBeenLastCalledWith(expect.objectContaining({ q: '8R0941004' }))
  })

  it('shows empty state when no listings', async () => {
    mockGet.mockResolvedValue({ total: 0, listings: [] })
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    expect(await screen.findByText(/нічого не знайдено/i)).toBeInTheDocument()
  })

  it('shows error state on failure', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    render(<MarketplaceScreen />, { wrapper: MemoryRouter })
    expect(await screen.findByText(/каталог тимчасово недоступний/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- src/features/marketplace/marketplace-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the screen (filters/sort in state, no mock import, proper states)**

`src/features/marketplace/marketplace-screen.tsx`:
```tsx
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
import { marketplaceApi, type MarketplaceCatalogResult } from '@/api/marketplace'
import type { MarketplaceCatalogParams } from './marketplace-api-types'
import { ListingCard } from './listing-card'

const SORTS: { value: NonNullable<MarketplaceCatalogParams['sort']>; label: string }[] = [
  { value: 'newest', label: 'Новіші' },
  { value: 'price_asc', label: 'Дешевші' },
  { value: 'price_desc', label: 'Дорожчі' },
]

export function MarketplaceScreen() {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<MarketplaceCatalogParams>({ sort: 'newest' })
  const [data, setData] = useState<MarketplaceCatalogResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((params: MarketplaceCatalogParams) => {
    setLoading(true)
    setError(null)
    marketplaceApi
      .getCatalog(params)
      .then(setData)
      .catch(() => setError('Каталог тимчасово недоступний.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(filters) }, [load, filters])

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    setFilters((f) => ({ ...f, q: query.trim() || undefined }))
  }

  const setSort = (sort: MarketplaceCatalogParams['sort']) => setFilters((f) => ({ ...f, sort }))

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-8 text-[#e8eaed]">
      <h1 className="mb-6 text-2xl font-semibold text-white">Каталог запчастин з розборок</h1>

      <form role="search" onSubmit={onSearch} className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-white/40" />
          <input
            type="search"
            aria-label="Пошук запчастини, OEM-коду, марки або моделі"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук: назва, OEM-код, марка…"
            className="w-full rounded-lg border border-white/10 bg-[#16181c] py-2 pr-3 pl-9 text-sm text-white placeholder:text-white/30"
          />
        </div>
        <button type="submit" className="rounded-lg bg-brand px-4 text-sm font-medium text-black">
          Знайти
        </button>
      </form>

      <div className="mb-4 flex gap-2">
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSort(s.value)}
            aria-pressed={filters.sort === s.value}
            className={`rounded-full border px-3 py-1 text-xs ${filters.sort === s.value ? 'border-brand text-brand' : 'border-white/10 text-white/60'}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {loading && !data && <p className="py-12 text-center text-sm text-white/40">Завантаження…</p>}
      {!loading && !error && data && data.listings.length === 0 && (
        <p className="py-12 text-center text-sm text-white/40">Нічого не знайдено за вашим запитом.</p>
      )}
      {data && data.listings.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {data.listings.map((l) => (
            <ListingCard key={l.slug} listing={l} />
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/features/marketplace/marketplace-screen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/marketplace/listing-card.tsx src/features/marketplace/marketplace-screen.tsx src/features/marketplace/marketplace-screen.test.tsx
git commit -m "feat(marketplace-web): catalog screen with wired search/sort and detail links"
```

### Task 2.4: Listing detail + shop profile screens

**Files:**
- Create: `src/features/marketplace/listing-detail-screen.tsx`
- Create: `src/features/marketplace/shop-profile-screen.tsx`
- Test: `src/features/marketplace/listing-detail-screen.test.tsx`

- [ ] **Step 1: Write the failing detail test**

`src/features/marketplace/listing-detail-screen.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '@/api/marketplace'
import { ListingDetailScreen } from './listing-detail-screen'

vi.mock('@/api/marketplace', () => ({ marketplaceApi: { getListing: vi.fn() } }))
const mockGet = vi.mocked(marketplaceApi.getListing)

describe('ListingDetailScreen', () => {
  beforeEach(() => mockGet.mockReset())

  it('renders listing details and shop contact', async () => {
    mockGet.mockResolvedValue({
      slug: 'fara-1', title: 'Фара права LED', description: 'Оригінал', price: 6400, currency: 'UAH',
      photos: [], condition: 'good', vehicleMake: 'Audi', vehicleModel: 'Q5', vehicleYear: 2014,
      oemCode: '8R0941004', quantityAvailable: 1,
      shop: { slug: 'shop-1', name: 'AvtoParts', description: null, city: 'Львів', logoUrl: null, phone: '+380501112233', messengerUrl: null, publicContactName: 'Іван' },
    })
    render(
      <MemoryRouter initialEntries={['/marketplace/listings/fara-1']}>
        <Routes><Route path="/marketplace/listings/:slugOrId" element={<ListingDetailScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('heading', { name: /фара права led/i })).toBeInTheDocument()
    expect(screen.getByText(/\+380501112233/)).toBeInTheDocument()
  })

  it('shows not-found when API 404s', async () => {
    mockGet.mockRejectedValue(new Error('404'))
    render(
      <MemoryRouter initialEntries={['/marketplace/listings/missing']}>
        <Routes><Route path="/marketplace/listings/:slugOrId" element={<ListingDetailScreen />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText(/оголошення не знайдено/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/marketplace/listing-detail-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement detail screen**

`src/features/marketplace/listing-detail-screen.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { marketplaceApi } from '@/api/marketplace'
import type { MarketplaceListingDetailDto } from './marketplace-api-types'

export function ListingDetailScreen() {
  const { slugOrId } = useParams<{ slugOrId: string }>()
  const [listing, setListing] = useState<MarketplaceListingDetailDto | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading')

  useEffect(() => {
    if (!slugOrId) return
    setState('loading')
    marketplaceApi
      .getListing(slugOrId)
      .then((l) => { setListing(l); setState('ok') })
      .catch(() => setState('notfound'))
  }, [slugOrId])

  if (state === 'loading') return <p className="py-16 text-center text-sm text-white/40">Завантаження…</p>
  if (state === 'notfound' || !listing)
    return (
      <div className="py-16 text-center text-sm text-white/50">
        Оголошення не знайдено. <Link to="/marketplace" className="text-brand">До каталогу</Link>
      </div>
    )

  const vehicle = [listing.vehicleMake, listing.vehicleModel, listing.vehicleYear].filter(Boolean).join(' ')
  return (
    <main className="mx-auto w-full max-w-[900px] px-4 py-8 text-[#e8eaed]">
      <Link to="/marketplace" className="text-xs text-white/50">← До каталогу</Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">{listing.title}</h1>
      {vehicle && <p className="mt-1 text-sm text-white/60">{vehicle}</p>}
      {listing.photos.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {listing.photos.map((p) => <img key={p} src={p} alt={listing.title} className="aspect-square w-full rounded-lg object-cover" />)}
        </div>
      )}
      <p className="mt-4 text-xl font-semibold text-white">
        {listing.price != null ? `${listing.price.toLocaleString('uk-UA')} ${listing.currency}` : 'Ціна за запитом'}
      </p>
      {listing.oemCode && <p className="mt-1 text-sm text-white/50">OEM: {listing.oemCode}</p>}
      {listing.description && <p className="mt-4 whitespace-pre-line text-sm text-white/80">{listing.description}</p>}

      <section className="mt-8 rounded-xl border border-white/10 bg-[#16181c] p-4">
        <Link to={`/marketplace/shops/${listing.shop.slug}`} className="text-sm font-medium text-white">
          {listing.shop.name}
        </Link>
        {listing.shop.city && <p className="text-xs text-white/50">{listing.shop.city}</p>}
        <div className="mt-3 space-y-1 text-sm">
          {listing.shop.publicContactName && <p className="text-white/70">{listing.shop.publicContactName}</p>}
          {listing.shop.phone && <a href={`tel:${listing.shop.phone}`} className="block text-brand">{listing.shop.phone}</a>}
          {listing.shop.messengerUrl && <a href={listing.shop.messengerUrl} target="_blank" rel="noreferrer" className="block text-brand">Написати в месенджер</a>}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Implement shop profile screen**

`src/features/marketplace/shop-profile-screen.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { marketplaceApi, type MarketplaceCatalogResult } from '@/api/marketplace'
import type { MarketplaceShopPublicDto } from './marketplace-api-types'
import { ListingCard } from './listing-card'

export function ShopProfileScreen() {
  const { slug } = useParams<{ slug: string }>()
  const [shop, setShop] = useState<MarketplaceShopPublicDto | null>(null)
  const [catalog, setCatalog] = useState<MarketplaceCatalogResult | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading')

  useEffect(() => {
    if (!slug) return
    setState('loading')
    Promise.all([marketplaceApi.getShop(slug), marketplaceApi.getShopListings(slug)])
      .then(([s, c]) => { setShop(s); setCatalog(c); setState('ok') })
      .catch(() => setState('notfound'))
  }, [slug])

  if (state === 'loading') return <p className="py-16 text-center text-sm text-white/40">Завантаження…</p>
  if (state === 'notfound' || !shop)
    return (
      <div className="py-16 text-center text-sm text-white/50">
        Магазин не знайдено. <Link to="/marketplace" className="text-brand">До каталогу</Link>
      </div>
    )

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-8 text-[#e8eaed]">
      <Link to="/marketplace" className="text-xs text-white/50">← До каталогу</Link>
      <h1 className="mt-3 text-2xl font-semibold text-white">{shop.name}</h1>
      {shop.city && <p className="mt-1 text-sm text-white/60">{shop.city}</p>}
      {shop.description && <p className="mt-3 text-sm text-white/80">{shop.description}</p>}
      <div className="mt-3 space-y-1 text-sm">
        {shop.phone && <a href={`tel:${shop.phone}`} className="block text-brand">{shop.phone}</a>}
        {shop.messengerUrl && <a href={shop.messengerUrl} target="_blank" rel="noreferrer" className="block text-brand">Месенджер</a>}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-medium text-white">Оголошення</h2>
      {catalog && catalog.listings.length === 0 && <p className="text-sm text-white/40">Поки що немає активних оголошень.</p>}
      {catalog && catalog.listings.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {catalog.listings.map((l) => <ListingCard key={l.slug} listing={l} />)}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/features/marketplace/listing-detail-screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/marketplace/listing-detail-screen.tsx src/features/marketplace/shop-profile-screen.tsx src/features/marketplace/listing-detail-screen.test.tsx
git commit -m "feat(marketplace-web): listing detail and shop profile screens"
```

### Task 2.5: App shell + layout (no auth/billing imports)

**Files:**
- Create: `src/apps/marketplace/marketplace-layout.tsx`
- Create: `src/apps/marketplace/marketplace-app.tsx`
- Test: `src/apps/marketplace/marketplace-app.test.tsx`

- [ ] **Step 1: Write the failing shell test (asserts NO auth coupling)**

`src/apps/marketplace/marketplace-app.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { MarketplaceLayout } from './marketplace-layout'

describe('MarketplaceLayout', () => {
  it('renders an isolated marketplace header linking home + account without reading auth', () => {
    render(
      <MemoryRouter>
        <MarketplaceLayout><div>child</div></MarketplaceLayout>
      </MemoryRouter>,
    )
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /rozbirka/i })).toHaveAttribute('href', '/marketplace')
    expect(screen.getByRole('link', { name: /кабінет/i })).toHaveAttribute('href', '/account')
    expect(screen.getByText('child')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/apps/marketplace/marketplace-app.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the layout (pure, no `useAuth`)**

`src/apps/marketplace/marketplace-layout.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Link } from 'react-router'

export function MarketplaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0e0f11] text-white">
      <header role="banner" className="border-b border-white/8">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-4 py-3">
          <Link to="/marketplace" className="text-sm font-semibold tracking-tight">Rozbirka Маркет</Link>
          <Link to="/account" className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 hover:border-white/30">
            Кабінет магазину
          </Link>
        </div>
      </header>
      {children}
    </div>
  )
}
```

`src/apps/marketplace/marketplace-app.tsx`:
```tsx
import { MarketplaceLayout } from './marketplace-layout'
import { MarketplaceScreen } from '@/features/marketplace/marketplace-screen'

export function MarketplaceApp() {
  return (
    <MarketplaceLayout>
      <MarketplaceScreen />
    </MarketplaceLayout>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/apps/marketplace/marketplace-app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/apps/marketplace
git commit -m "feat(marketplace-web): auth-free app shell and layout"
```

### Task 2.6: Routes (catalog + detail + shop, lazy)

**Files:**
- Modify: `src/routes/router.tsx`

- [ ] **Step 1: Add the three public marketplace routes, each lazy and wrapped in the layout**

In `router.tsx`, replace any single `/marketplace` entry with:
```tsx
{
  path: '/marketplace',
  lazy: async () => {
    const { MarketplaceApp } = await import('@/apps/marketplace/marketplace-app')
    return { element: <MarketplaceApp /> }
  },
},
{
  path: '/marketplace/listings/:slugOrId',
  lazy: async () => {
    const { MarketplaceLayout } = await import('@/apps/marketplace/marketplace-layout')
    const { ListingDetailScreen } = await import('@/features/marketplace/listing-detail-screen')
    return { element: <MarketplaceLayout><ListingDetailScreen /></MarketplaceLayout> }
  },
},
{
  path: '/marketplace/shops/:slug',
  lazy: async () => {
    const { MarketplaceLayout } = await import('@/apps/marketplace/marketplace-layout')
    const { ShopProfileScreen } = await import('@/features/marketplace/shop-profile-screen')
    return { element: <MarketplaceLayout><ShopProfileScreen /></MarketplaceLayout> }
  },
},
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/router.tsx
git commit -m "feat(marketplace-web): public catalog, detail, and shop routes"
```

### Task 2.7: Seller marketplace panel (moved + monetization-free, phone round-trip fixed)

**Files:**
- Create: `src/features/seller-marketplace/seller-marketplace-panel.tsx`
- Test: `src/features/seller-marketplace/seller-marketplace-panel.test.tsx`
- Modify: `src/screens/account.tsx`
- Delete: `src/features/account-marketplace/` (already gone after reset; ensure not recreated)

- [ ] **Step 1: Write a focused failing test (shop form hydrates phone; no paywall)**

`src/features/seller-marketplace/seller-marketplace-panel.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marketplaceApi } from '@/api/marketplace'
import { SellerMarketplacePanel } from './seller-marketplace-panel'

vi.mock('@/api/marketplace', () => ({
  marketplaceApi: {
    getSellerSummary: vi.fn(),
    getSellerListings: vi.fn(),
    searchSellerParts: vi.fn(),
    upsertSellerShop: vi.fn(),
  },
}))

describe('SellerMarketplacePanel', () => {
  beforeEach(() => {
    vi.mocked(marketplaceApi.getSellerSummary).mockResolvedValue({
      shop: { id: 's1', slug: 'shop', name: 'AvtoParts', description: null, city: 'Львів', logoUrl: null, phone: '+380501112233', messengerUrl: null, publicContactName: 'Іван', isPublished: true },
      draftListings: 0, publishedListings: 1, hiddenListings: 0, availableWarehouseParts: 4,
    })
    vi.mocked(marketplaceApi.getSellerListings).mockResolvedValue({ items: [], page: 1, pageSize: 30, total: 0, totalPages: 0 })
    vi.mocked(marketplaceApi.searchSellerParts).mockResolvedValue({ items: [], page: 1, pageSize: 30, total: 0, totalPages: 0 })
  })

  it('hydrates the shop phone from the loaded shop (no data loss)', async () => {
    render(<SellerMarketplacePanel />)
    const phone = await screen.findByDisplayValue('+380501112233')
    expect(phone).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/features/seller-marketplace/seller-marketplace-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the panel**

`src/features/seller-marketplace/seller-marketplace-panel.tsx` — implement with these exact responsibilities (no limits/paywall anywhere):

```tsx
import { useCallback, useEffect, useState } from 'react'
import { marketplaceApi } from '@/api/marketplace'
import type {
  MarketplaceSellerListingDto,
  MarketplaceSellerPartDto,
  MarketplaceSellerSummaryDto,
  MarketplaceShopDto,
  UpsertMarketplaceShopRequest,
} from '@/features/marketplace/marketplace-api-types'

interface ShopForm {
  displayName: string
  description: string
  city: string
  phone: string
  messengerUrl: string
  publicContactName: string
  isPublished: boolean
}

const emptyForm: ShopForm = {
  displayName: '', description: '', city: '', phone: '', messengerUrl: '', publicContactName: '', isPublished: false,
}

function shopToForm(shop: MarketplaceShopDto | null): ShopForm {
  if (!shop) return emptyForm
  return {
    displayName: shop.name,
    description: shop.description ?? '',
    city: shop.city ?? '',
    phone: shop.phone ?? '',
    messengerUrl: shop.messengerUrl ?? '',
    publicContactName: shop.publicContactName ?? '',
    isPublished: shop.isPublished,
  }
}

function formToRequest(f: ShopForm): UpsertMarketplaceShopRequest {
  return {
    displayName: f.displayName.trim(),
    description: f.description.trim() || null,
    city: f.city.trim() || null,
    phone: f.phone.trim() || null,
    messengerUrl: f.messengerUrl.trim() || null,
    publicContactName: f.publicContactName.trim() || null,
    isPublished: f.isPublished,
  }
}

export function SellerMarketplacePanel() {
  const [summary, setSummary] = useState<MarketplaceSellerSummaryDto | null>(null)
  const [listings, setListings] = useState<MarketplaceSellerListingDto[]>([])
  const [parts, setParts] = useState<MarketplaceSellerPartDto[]>([])
  const [form, setForm] = useState<ShopForm>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [s, l, p] = await Promise.all([
      marketplaceApi.getSellerSummary(),
      marketplaceApi.getSellerListings(),
      marketplaceApi.searchSellerParts(),
    ])
    setSummary(s)
    setForm(shopToForm(s.shop))
    setListings(l.items)
    setParts(p.items)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    refresh()
      .catch(() => { if (!cancelled) setError('Не вдалось завантажити магазин.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [refresh])

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch {
      setError('Дію не вдалось виконати.')
    } finally {
      setBusy(null)
    }
  }

  const saveShop = () => run('shop', () => marketplaceApi.upsertSellerShop(formToRequest(form)))

  if (loading) return <p className="py-12 text-center text-sm text-white/40">Завантаження…</p>

  return (
    <div className="space-y-8">
      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>}

      {/* Shop form */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Магазин</h2>
        <label className="block text-sm">
          <span className="text-white/60">Назва</span>
          <input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white" />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Місто</span>
          <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white" />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Телефон</span>
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white" />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Месенджер (Telegram/Viber URL)</span>
          <input value={form.messengerUrl} onChange={(e) => setForm((f) => ({ ...f, messengerUrl: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white" />
        </label>
        <label className="block text-sm">
          <span className="text-white/60">Контактна особа</span>
          <input value={form.publicContactName} onChange={(e) => setForm((f) => ({ ...f, publicContactName: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-white" />
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))} />
          Опублікувати магазин
        </label>
        <button type="button" disabled={busy === 'shop'} onClick={() => void saveShop()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          Зберегти магазин
        </button>
      </section>

      {/* Listings */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Оголошення ({summary?.publishedListings ?? 0} опубліковано)</h2>
        {listings.length === 0 && <p className="text-sm text-white/40">Немає оголошень.</p>}
        <ul className="space-y-2">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-sm">
              <span className="text-white">{l.title} <span className="text-white/40">· {l.status}</span></span>
              <span className="flex gap-2">
                {l.status !== 'published' && (
                  <button type="button" disabled={busy === l.id} onClick={() => void run(l.id, () => marketplaceApi.publishListing(l.id))} className="text-brand">Опублікувати</button>
                )}
                {l.status === 'published' && (
                  <button type="button" disabled={busy === l.id} onClick={() => void run(l.id, () => marketplaceApi.hideListing(l.id))} className="text-white/60">Сховати</button>
                )}
                <button type="button" disabled={busy === l.id} onClick={() => void run(l.id, () => marketplaceApi.archiveListing(l.id))} className="text-red-300">Архів</button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Add from warehouse */}
      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Додати зі складу ({summary?.availableWarehouseParts ?? 0} доступно)</h2>
        <ul className="space-y-2">
          {parts.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#16181c] px-3 py-2 text-sm">
              <span className="text-white">{p.name} <span className="text-white/40">· {p.quantityAvailable} шт</span></span>
              <button type="button" disabled={p.alreadyListed || busy === p.id}
                onClick={() => void run(p.id, () => marketplaceApi.createListingFromPart(p.id))}
                className="text-brand disabled:text-white/30">
                {p.alreadyListed ? 'Вже в маркеті' : 'Створити оголошення'}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Mount in account screen**

In `src/screens/account.tsx`, import `SellerMarketplacePanel` from `@/features/seller-marketplace/seller-marketplace-panel` and render it where the marketplace section is (`{section === 'marketplace' && <SellerMarketplacePanel />}`). Remove any reference to the deleted `account-marketplace` path.

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/features/seller-marketplace/seller-marketplace-panel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/seller-marketplace src/screens/account.tsx
git commit -m "feat(marketplace-web): monetization-free seller panel under seller-marketplace"
```

### Task 2.8: Full gate green

**Files:** none (verification)

- [ ] **Step 1: Run the full check gate**

Run: `npm run check`
Expected: typecheck + lint + format:check + test ALL pass. Fix any lint/format issues with `npm run lint:fix && npm run format` and re-run. Address the lint classes the review flagged: no `set-state-in-effect`, wrap async handlers with `void`, no redundant union type constituents.

- [ ] **Step 2: Commit any lint/format fixups**

```bash
git add -A
git commit -m "chore(marketplace-web): satisfy lint/format/typecheck gate"
```

---

# Phase 3 — End-to-end verification

### Task 3.1: Backend builds + all tests pass

- [ ] Run: `cd /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.core && dotnet build && dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj`
  Expected: build succeeded; all marketplace tests pass; no other tests broken. (Postgres tests require Docker.)

### Task 3.2: Frontend gate green

- [ ] Run: `cd /Users/oleksiilopatskyi/Code/rozbirka/rozbirka.web && npm run check`
  Expected: all green.

### Task 3.3: Manual smoke (optional, requires running stack)

- [ ] Start backend + web (docker-compose / dev servers), visit `/marketplace`, confirm catalog loads from the real API (not mock), open a listing detail, open a shop profile, then in the account → Магазин panel create a shop, list a part, publish it, and confirm it appears in the public catalog. Hide/archive and confirm it disappears.

---

## Self-Review

**Spec coverage:**
- Bounded context / inventory via interface — Tasks 1.3, 1.6 ✓
- Public API (4 routes, 404 semantics) — Tasks 1.8, 1.6 ✓
- Seller API (shop, from-part, patch, publish/hide/archive) — Tasks 1.8, 1.6 ✓
- Lifecycle incl. archive + sold-from-availability — Tasks 1.6 (sold derived by availability filter), 1.13 ✓ (note: `sold` status is never explicitly written; public visibility already drops zero-availability listings, satisfying spec 501. If an explicit `sold` status is later required, add a job — out of scope here, documented.)
- Access Model (no monetization, permission + subscription gate) — Tasks 1.6, 1.7, 1.9, 1.12 ✓
- Error codes set — Tasks 1.6, 1.8 ✓
- Public DTOs hide internals (no partId) — Task 1.4 ✓
- Slug stable generated field — Tasks 1.2, 1.6 ✓
- Contact (phone + messenger) — Tasks 1.1, 1.4, 2.4, 2.7 ✓
- Web app boundary (no auth/billing in public shell, seller separate) — Tasks 2.5, 2.7 ✓
- Web routes/screens/filters/states — Tasks 2.3, 2.4, 2.6 ✓
- Mock-first removable, no blending — Tasks 2.1, 2.2 ✓
- Tests (lifecycle, visibility, isolation, web states/adapter) — Tasks 1.13, 1.14, 2.1, 2.3, 2.4, 2.7 ✓

**Placeholder scan:** No "TBD"/"implement later". The few "confirm against codebase" notes are explicit verification steps (PagedResult shape, Tenant.PlanExpiresAt, role table column names, entity required fields), not deferred work.

**Type consistency:** Service returns `MarketplaceSellerListingDto` for seller ops and `MarketplaceListingCardDto`/`MarketplaceListingDetailDto` for public — controller, adapter, and screens use the matching types. `compactParams` emits `per_page` (matching `[FromQuery(Name="per_page")]`). Frontend `marketplace-api-types.ts` mirrors backend DTO field names (camelCase via the JSON serializer).

**Known open verification (do during implementation, not guesses):** exact `PagedResult<T>` members; the canonical "subscription active" predicate (plan assumes `Tenant.PlanExpiresAt`); `roles` seeding column names; `Tenant`/`Part`/`User` required fields for the seed helper; xUnit `IAsyncLifetime` return type.
