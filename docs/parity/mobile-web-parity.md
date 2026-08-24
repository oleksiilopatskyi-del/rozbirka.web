# Mobile → Web Parity Matrix

## Audit sources

| Repository | Commit |
| --- | --- |
| mobile | 2f0930509b2dbf7293da529ce2e1f225a852dba0 |
| web | 6aa6d92f443db451aace4875d0afd7dd358e975c |
| core | 46e2d91b371fac24043a5eebaef7a8f75fb3ff08 |
| identity | b7497a46204cbae0e964bb2cf4d00f91f9d382d0 |

## Summary

| Dimension | Value | Count |
| --- | --- | --- |
| Contract | not-applicable | 9 |
| Contract | partial | 51 |
| Contract | unsafe | 7 |
| Disposition | browser-native | 31 |
| Disposition | parity | 25 |
| Excluded routes | total | 11 |

## User capabilities

### auth

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| auth.invitation.accept | Join a tenant through an invitation | /(auth)/invite/[code]<br>/(auth)/onboarding | Accept an invitation only after authentication and transition into the new tenant without stale tenant data | partial | core | ROZ-122 |
| auth.invitation.preview | Preview an invitation before accepting it | /(auth)/invite/[code] | Open a stable invitation URL and preview safe invitation information before authentication or acceptance | partial | web | ROZ-104 |
| auth.otp.request | Request a phone OTP | /(auth)/login | Request and safely resend a phone OTP with clear rate-limit errors | partial | identity | ROZ-125 |
| auth.otp.verify | Verify a phone OTP and establish a session | /(auth)/login | Verify the OTP, establish the authenticated session, and resume the correct onboarding destination | partial | identity | ROZ-125 |
| auth.profile-name.set | Set the authenticated user display name | /(auth)/name | Save the authenticated profile name before tenant or invitation onboarding continues | partial | identity | ROZ-124 |
| auth.tenant.create | Create the first business tenant | /(auth)/onboarding<br>/(auth)/register | Create an eligible business tenant and enter its cabinet with server-derived ownership | partial | core | ROZ-122 |
| auth.tenant.list | List tenants available to the authenticated user | /(auth)/login<br>/(auth)/name<br>/(auth)/register | Resolve available tenant memberships before entering the authenticated cabinet | partial | core | ROZ-121 |
| auth.welcome.view | View the authentication entry screen and legal links | /(auth)/welcome | Start authentication and open the applicable legal documents | not-applicable | web | ROZ-104 |

### billing

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| billing.subscription.manage | Start, restore, synchronize, or manage a subscription | /(tabs)/(profile)/billing | Activate trial or complete an authorized Web checkout, then refresh authoritative server entitlement | partial | web | ROZ-117 |
| billing.subscription.view | View subscription status, limits, and store ownership | /(tabs)/(profile)/billing | Show authoritative tenant subscription, entitlements, limits, and management destination even when business access is blocked | partial | web | ROZ-117 |

### cars

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| cars.create | Create a vehicle with identification, media, and purchase data | /car/add | Create a tenant vehicle with browser-safe media input, explicit VIN fallback, financial data, and quota enforcement | partial | web | ROZ-109 |
| cars.detail.view | View vehicle details, profitability, photos, and linked parts | /car/[id] | Open a permission-aware vehicle detail URL with authoritative totals and linked inventory | partial | web | ROZ-109 |
| cars.edit | Edit vehicle identification and financial metadata | /car/[id]/edit | Edit a tenant vehicle through a validated form without replacing unrelated fields | partial | web | ROZ-109 |
| cars.expenses.manage | Add, edit, and remove vehicle expenses | /car/add<br>/car/[id] | Manage vehicle expenses and display authoritative profitability without client-side financial rules | partial | core | ROZ-123 |
| cars.inventory.view | Browse inventory produced from a vehicle | /(tabs)/(home)/warehouse/[carId] | Browse paginated vehicle-scoped inventory through a stable filterable URL | partial | web | ROZ-110 |
| cars.lifecycle.manage | Archive or delete a vehicle | /car/[id] | Archive or delete a tenant vehicle with explicit confirmation and server-enforced safety rules | partial | web | ROZ-109 |
| cars.list.view | Browse and find vehicles | /(tabs)/(home)/cars | Search, filter, paginate, and open tenant vehicles through a stable URL | partial | core | ROZ-60 |

### cash

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| cash.overview.view | View daily cash balances and registers | /(tabs)/(home)/cash | View timezone-correct daily finance totals and open a stable register URL | partial | web | ROZ-115 |
| cash.register-manage | Create and manage cash registers | /(tabs)/(home)/cash<br>/cash/[id] | Manage tenant registers with server-enforced balance and lifecycle preconditions | partial | web | ROZ-115 |
| cash.transactions | View and record cash transactions | /cash/[id] | Browse an auditable ledger and record validated manual movements without client-side balance authority | partial | web | ROZ-115 |
| cash.transfer | Transfer value between registers and currencies | /cash/[id] | Create one atomic, balanced, and auditable cross-register transfer | partial | core | ROZ-123 |

### customers

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| customers.create | Create or recover a customer | /customer/new<br>/order/new<br>/order/[id] | Create a customer from the directory or order flow with safe duplicate-phone resolution | partial | web | ROZ-113 |
| customers.detail.view | View customer details and order history | /customer/[id] | Open a tenant customer with authoritative summary and order history | partial | web | ROZ-113 |
| customers.edit-lifecycle | Edit, activate, deactivate, or delete a customer | /customer/[id]<br>/customer/[id]/edit | Manage a customer lifecycle with explicit confirmations and server-enforced order constraints | partial | web | ROZ-113 |
| customers.list.view | Search and browse customers | /(tabs)/(orders)/customers | Search and paginate tenant customers through stable URL-backed controls | partial | web | ROZ-113 |

### dashboard

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| dashboard.analytics.view | View dashboard analytics by period | /(tabs)/(home) | View URL-stable day, week, and month analytics from authoritative server data | partial | web | ROZ-106 |
| dashboard.navigation.use | Navigate to permitted cabinet modules and quick actions | /(tabs)/(home) | Navigate to permission-aware cabinet modules through stable links and guarded create actions | not-applicable | web | ROZ-106 |
| dashboard.summary.view | View the operational dashboard summary | /(tabs)/(home) | View permission-aware server totals and recent activity for the active tenant | partial | web | ROZ-106 |

### intake

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| intake.create | Create a vehicle intake batch | /intake/batch | Create an intake batch with browser-safe media upload, complete financial fields, and quota enforcement | partial | web | ROZ-108 |
| intake.delete | Delete an intake batch | /intake/[id] | Delete an intake only when server-enforced relationship and audit rules allow it | partial | web | ROZ-108 |
| intake.detail.view | View intake details, cost, photos, and created parts | /intake/[id] | Open a permission-aware intake detail URL with server-derived totals and linked inventory | partial | web | ROZ-108 |
| intake.edit | Edit intake metadata | /intake/[id]/edit | Edit intake metadata through a validated form while preserving omitted values | partial | web | ROZ-108 |
| intake.list.view | Browse and find vehicle intake batches | /(tabs)/(home)/intake | Search, filter by status, paginate, and open tenant intake batches through a stable URL | partial | core | ROZ-60 |
| intake.parts.create | Create and browse parts within an intake | /intake/[id] | Create a part with an immutable intake relationship and browse intake-scoped inventory | partial | web | ROZ-108 |

### orders

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| orders.create | Create a pending order | /order/new | Create a canonical pending order with validated availability, pricing, customer, and reservation behavior | partial | web | ROZ-112 |
| orders.detail-manage | View and edit a pending order | /order/[id]<br>/order/[id]/add-item | Open an auditable order URL and safely edit only lifecycle-eligible fields | partial | web | ROZ-112 |
| orders.list.view | Browse and filter orders | /(tabs)/(orders) | Search, filter, and paginate tenant orders through stable URL-backed controls | partial | core | ROZ-60 |
| orders.payment-lifecycle | Confirm payment, cancel, or refund an order | /order/[id] | Execute one atomic, auditable order transition with authoritative inventory and cash effects | partial | core | ROZ-123 |

### parts

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| parts.create | Create a part from a vehicle, intake, VIN, or manual source | /part/add | Create a tenant part with explicit source, browser-safe media input, VIN fallback, compatibility, and validated inventory fields | unsafe | core | ROZ-122 |
| parts.delete | Delete a part | /part/[id]<br>/part/[id]/edit | Delete a tenant part only when server-enforced reservation, order, media, and audit rules allow it | partial | web | ROZ-110 |
| parts.detail.view | View part details, compatibility, media, and source vehicle | /part/[id] | Open a tenant-safe part detail URL with authoritative availability, compatibility, history links, and media | unsafe | core | ROZ-122 |
| parts.edit | Edit part inventory, commercial, compatibility, and media fields | /part/[id]/edit | Edit a tenant part with server validation and a safe media lifecycle | unsafe | core | ROZ-122 |
| parts.history.view | View part inventory and order history | /part/[id] | View an auditable chronological part history and navigate to related orders | unsafe | core | ROZ-122 |
| parts.list.view | Search and filter tenant inventory | /(tabs)/(parts) | Search, filter, paginate, and open tenant inventory through stable URLs | unsafe | core | ROZ-122 |

### profile

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| profile.account-delete | Permanently delete the user account | /(tabs)/(profile) | Permanently delete only the authenticated account after explicit re-confirmation and clear all private browser state | partial | identity | ROZ-125 |
| profile.account-settings | View and edit personal and tenant profile settings | /(tabs)/(profile) | Manage personal identity and authorized tenant settings from one stable account page | partial | web | ROZ-104 |

### reports

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| reports.generate | Generate a car-sales report | /(tabs)/(home)/reports | Queue an authorized report job and expose clear asynchronous progress and failure states | partial | web | ROZ-114 |
| reports.history-download | Browse and download generated reports | /(tabs)/(home)/reports | Browse report history and securely download or share a completed PDF before expiry | partial | web | ROZ-114 |

### scanning

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| scanning.qr.lookup | Resolve a part from a QR code | /(tabs)/scan-tab<br>/scan | Resolve a tenant-safe QR through camera, manual input, uploaded image, or stable scan URL | unsafe | core | ROZ-122 |
| scanning.vin.decode | Extract and decode a VIN for vehicle and part workflows | /car/add<br>/part/add<br>/part/[id]/edit | Capture or enter a VIN and decode it with explicit partial-result and failure states | not-applicable | web | ROZ-111 |
| stickers.generate-print-share | Generate, print, download, or share part stickers | /(tabs)/(home)/stickers<br>/part/[id] | Generate authenticated sticker data and provide downloadable PDF plus browser print | partial | web | ROZ-111 |
| stickers.queue.manage | Build and persist a tenant-scoped sticker queue | /(tabs)/(home)/stickers<br>/part/[id] | Maintain a tenant-scoped sticker selection with explicit resume, discard, and print-confirmation behavior | not-applicable | web | ROZ-111 |

### team

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| team.directory.view | View team members, roles, and invitations | /(tabs)/(profile)/team<br>/(tabs)/(profile)/team/members/[id]<br>/(tabs)/(profile)/team/roles/[id] | Browse tenant-scoped team, role, permission, and invitation details through stable URLs | partial | web | ROZ-116 |
| team.invitation-manage | Create, copy, and revoke team invitations | /(tabs)/(profile)/team | Create and manage expiring tenant invitations with a copyable canonical invite URL | partial | web | ROZ-116 |
| team.member-lifecycle | Change a member role or lifecycle state | /(tabs)/(profile)/team/members/[id] | Manage a non-owner member with server-enforced owner, self-action, last-owner, and user-limit rules | partial | web | ROZ-116 |
| team.roles-manage | Create, edit, and delete custom roles | /(tabs)/(profile)/team<br>/(tabs)/(profile)/team/roles/[id] | Manage custom roles with canonical permission dependencies and server-enforced system-role protections | partial | web | ROZ-116 |

## System capabilities

| ID | Capability | Trigger | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| auth.private-cache-invalidation | Clear private caches at identity and tenant boundaries | Logout, account deletion, failed recovery, or tenant transition completes | Cancel and remove private cached data before credentials or active tenant ownership changes | not-applicable | web | ROZ-119 |
| auth.retry-policy | Retry only safe and current requests | A query fails because of transport, server, authorization, or tenant state | Apply bounded retry only to idempotent current-session work and route authentication, permission, tenant-block, and validation failures to explicit handling | not-applicable | web | ROZ-119 |
| auth.session-generation | Reject stale asynchronous work after a session boundary | Login, logout, account deletion, or tenant transition changes the private-data owner | Associate asynchronous work with the active session and tenant generation and discard results captured before a boundary change | not-applicable | web | ROZ-119 |
| auth.session.logout | Revoke and clean up an authenticated session | The user signs out or session recovery cannot continue | Revoke the refresh token, remove credentials, and clear private tenant data before returning to login | partial | identity | ROZ-125 |
| auth.session.refresh | Refresh an authenticated session | An API request encounters an expired access token | Preserve one safe session refresh operation and retry eligible requests without exposing tokens | partial | identity | ROZ-125 |
| auth.tenant-query-scope | Scope every private cache key and mutation to user and tenant | Any tenant-private query or mutation is created | Never share private cache entries across users or tenants and prevent stale mutation effects after tenant switching | not-applicable | web | ROZ-119 |
| auth.tenant.transition | Transition safely into a selected or accepted tenant | Login, tenant creation, or invitation acceptance selects a tenant | Switch the active tenant without leaking cached data, permissions, or billing state from the previous tenant | partial | core | ROZ-122 |
| billing.access-gates | Enforce billing blocks, features, and quotas | Subscription state loads or a quota-sensitive operation is attempted | Preserve billing and recovery routes for blocked tenants, gate feature UI from server entitlements, and rely on authoritative API quota enforcement | partial | web | ROZ-119 |
| parts.media-ownership | Enforce private media ownership and cleanup | A part or vehicle image is uploaded, viewed, replaced, or deleted | Treat storage keys as opaque, require server authorization for every media operation, and clean abandoned uploads without exposing cross-tenant objects | unsafe | core | ROZ-122 |
| profile.private-temporary-files | Own and remove private temporary files | A report, sticker PDF, or private image is downloaded or generated | Prefer memory or authenticated downloads; revoke object URLs and remove tenant-private browser artifacts on use and session boundaries | not-applicable | web | ROZ-119 |
| team.permission-enforcement | Enforce permissions on navigation, data, and mutations | A user enters a protected feature or attempts an operation | Gate routes and controls for clarity while requiring the API to enforce every read and mutation permission independently | partial | core | ROZ-122 |

## Excluded routes

| Route | Classification | Reason | Web replacement | Tracking |
| --- | --- | --- | --- | --- |
| /_layout | unreachable | Expo Router root layout initializes providers, session recovery, and navigation but is not a user-addressable capability | — | — |
| /(auth)/_layout | unreachable | Expo Router layout groups authentication screens but is not a user-addressable capability | — | — |
| /(tabs)/_layout | unreachable | Expo Router tab layout declares navigation and access policy but is not a user-addressable capability | — | — |
| /(tabs)/(home)/_layout | unreachable | Expo Router home stack layout groups dashboard screens but is not a user-addressable capability | — | — |
| /(tabs)/(orders)/_layout | unreachable | Expo Router orders stack layout groups order and customer screens but is not a user-addressable capability | — | — |
| /(tabs)/(parts)/_layout | unreachable | Expo Router layout groups parts screens but is not a user-addressable capability | — | — |
| /(tabs)/(profile)/_layout | unreachable | Expo Router profile stack layout groups account, team, and billing screens but is not a user-addressable capability | — | — |
| /+not-found | unreachable | Expo Router fallback handles invalid URLs and does not represent a Mobile business capability requiring parity | /404 | — |
| /part/[id]/sell | obsolete | Legacy direct-sale is replaced by the canonical Orders flow for reserve, payment, cancel, refund, and audit consistency | /cabinet/orders/new?partId=:id | ROZ-112 |
| /part/[id]/success | obsolete | The legacy direct-sale success screen is replaced by the canonical order detail and payment outcome | /cabinet/orders/:id | ROZ-112 |
| native://revenuecat/purchase-restore | native-only | App Store and Play billing SDK purchase and restore mechanics do not run on Web; the required browser outcome is server-created checkout and authoritative entitlement refresh | /cabinet/billing | ROZ-117 |

## Existing Linear tracking

| Item | Owner | Tracking |
| --- | --- | --- |
| /part/[id]/sell | decision | ROZ-112 |
| /part/[id]/success | decision | ROZ-112 |
| auth.invitation.accept | core | ROZ-122 |
| auth.invitation.preview | web | ROZ-104 |
| auth.otp.request | identity | ROZ-125 |
| auth.otp.verify | identity | ROZ-125 |
| auth.private-cache-invalidation | web | ROZ-119 |
| auth.profile-name.set | identity | ROZ-124 |
| auth.retry-policy | web | ROZ-119 |
| auth.session-generation | web | ROZ-119 |
| auth.session.logout | identity | ROZ-125 |
| auth.session.refresh | identity | ROZ-125 |
| auth.tenant-query-scope | web | ROZ-119 |
| auth.tenant.create | core | ROZ-122 |
| auth.tenant.list | core | ROZ-121 |
| auth.tenant.transition | core | ROZ-122 |
| auth.welcome.view | web | ROZ-104 |
| billing.access-gates | web | ROZ-119 |
| billing.subscription.manage | web | ROZ-117 |
| billing.subscription.view | web | ROZ-117 |
| cars.create | web | ROZ-109 |
| cars.detail.view | web | ROZ-109 |
| cars.edit | web | ROZ-109 |
| cars.expenses.manage | core | ROZ-123 |
| cars.inventory.view | web | ROZ-110 |
| cars.lifecycle.manage | web | ROZ-109 |
| cars.list.view | core | ROZ-60 |
| cash.overview.view | web | ROZ-115 |
| cash.register-manage | web | ROZ-115 |
| cash.transactions | web | ROZ-115 |
| cash.transfer | core | ROZ-123 |
| customers.create | web | ROZ-113 |
| customers.detail.view | web | ROZ-113 |
| customers.edit-lifecycle | web | ROZ-113 |
| customers.list.view | web | ROZ-113 |
| dashboard.analytics.view | web | ROZ-106 |
| dashboard.navigation.use | web | ROZ-106 |
| dashboard.summary.view | web | ROZ-106 |
| intake.create | web | ROZ-108 |
| intake.delete | web | ROZ-108 |
| intake.detail.view | web | ROZ-108 |
| intake.edit | web | ROZ-108 |
| intake.list.view | core | ROZ-60 |
| intake.parts.create | web | ROZ-108 |
| native://revenuecat/purchase-restore | decision | ROZ-117 |
| orders.create | web | ROZ-112 |
| orders.detail-manage | web | ROZ-112 |
| orders.list.view | core | ROZ-60 |
| orders.payment-lifecycle | core | ROZ-123 |
| parts.create | core | ROZ-122 |
| parts.delete | web | ROZ-110 |
| parts.detail.view | core | ROZ-122 |
| parts.edit | core | ROZ-122 |
| parts.history.view | core | ROZ-122 |
| parts.list.view | core | ROZ-122 |
| parts.media-ownership | core | ROZ-122 |
| profile.account-delete | identity | ROZ-125 |
| profile.account-settings | web | ROZ-104 |
| profile.private-temporary-files | web | ROZ-119 |
| reports.generate | web | ROZ-114 |
| reports.history-download | web | ROZ-114 |
| scanning.qr.lookup | core | ROZ-122 |
| scanning.vin.decode | web | ROZ-111 |
| stickers.generate-print-share | web | ROZ-111 |
| stickers.queue.manage | web | ROZ-111 |
| team.directory.view | web | ROZ-116 |
| team.invitation-manage | web | ROZ-116 |
| team.member-lifecycle | web | ROZ-116 |
| team.permission-enforcement | core | ROZ-122 |
| team.roles-manage | web | ROZ-116 |

## Proposed gaps

| Item | Owner | Tracking |
| --- | --- | --- |

## Legend

- Contract: `ready`, `partial`, `missing`, `unsafe`, or `not-applicable`.

- Web disposition: `parity` or `browser-native`.

- Tracking: a verified Linear issue or a proposed gap key awaiting preview approval.
