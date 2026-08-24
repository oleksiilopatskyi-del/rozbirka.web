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
| Contract | not-applicable | 4 |
| Contract | partial | 27 |
| Contract | unsafe | 6 |
| Disposition | browser-native | 17 |
| Disposition | parity | 17 |
| Excluded routes | total | 4 |

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

### parts

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| parts.create | Create a part from a vehicle, intake, VIN, or manual source | /part/add | Create a tenant part with explicit source, browser-safe media input, VIN fallback, compatibility, and validated inventory fields | unsafe | core | ROZ-122 |
| parts.delete | Delete a part | /part/[id]<br>/part/[id]/edit | Delete a tenant part only when server-enforced reservation, order, media, and audit rules allow it | partial | web | ROZ-110 |
| parts.detail.view | View part details, compatibility, media, and source vehicle | /part/[id] | Open a tenant-safe part detail URL with authoritative availability, compatibility, history links, and media | unsafe | core | ROZ-122 |
| parts.edit | Edit part inventory, commercial, compatibility, and media fields | /part/[id]/edit | Edit a tenant part with server validation and a safe media lifecycle | unsafe | core | ROZ-122 |
| parts.history.view | View part inventory and order history | /part/[id] | View an auditable chronological part history and navigate to related orders | unsafe | core | ROZ-122 |
| parts.list.view | Search and filter tenant inventory | /(tabs)/(parts) | Search, filter, paginate, and open tenant inventory through stable URLs | unsafe | core | ROZ-122 |

### scanning

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| scanning.qr.lookup | Resolve a part from a QR code | /(tabs)/scan-tab<br>/scan | Resolve a tenant-safe QR through camera, manual input, uploaded image, or stable scan URL | unsafe | core | ROZ-122 |
| scanning.vin.decode | Extract and decode a VIN for vehicle and part workflows | /car/add<br>/part/add<br>/part/[id]/edit | Capture or enter a VIN and decode it with explicit partial-result and failure states | not-applicable | web | ROZ-111 |
| stickers.generate-print-share | Generate, print, download, or share part stickers | /(tabs)/(home)/stickers<br>/part/[id] | Generate authenticated sticker data and provide downloadable PDF plus browser print | partial | web | ROZ-111 |
| stickers.queue.manage | Build and persist a tenant-scoped sticker queue | /(tabs)/(home)/stickers<br>/part/[id] | Maintain a tenant-scoped sticker selection with explicit resume, discard, and print-confirmation behavior | not-applicable | web | ROZ-111 |

## System capabilities

| ID | Capability | Trigger | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| auth.session.logout | Revoke and clean up an authenticated session | The user signs out or session recovery cannot continue | Revoke the refresh token, remove credentials, and clear private tenant data before returning to login | partial | identity | ROZ-125 |
| auth.session.refresh | Refresh an authenticated session | An API request encounters an expired access token | Preserve one safe session refresh operation and retry eligible requests without exposing tokens | partial | identity | ROZ-125 |
| auth.tenant.transition | Transition safely into a selected or accepted tenant | Login, tenant creation, or invitation acceptance selects a tenant | Switch the active tenant without leaking cached data, permissions, or billing state from the previous tenant | partial | core | ROZ-122 |

## Excluded routes

| Route | Classification | Reason | Web replacement | Tracking |
| --- | --- | --- | --- | --- |
| /(auth)/_layout | unreachable | Expo Router layout groups authentication screens but is not a user-addressable capability | — | — |
| /(tabs)/(parts)/_layout | unreachable | Expo Router layout groups parts screens but is not a user-addressable capability | — | — |
| /part/[id]/sell | obsolete | Legacy direct-sale is replaced by the canonical Orders flow for reserve, payment, cancel, refund, and audit consistency | /cabinet/orders/new?partId=:id | ROZ-112 |
| /part/[id]/success | obsolete | The legacy direct-sale success screen is replaced by the canonical order detail and payment outcome | /cabinet/orders/:id | ROZ-112 |

## Existing Linear tracking

| Item | Owner | Tracking |
| --- | --- | --- |
| /part/[id]/sell | decision | ROZ-112 |
| /part/[id]/success | decision | ROZ-112 |
| auth.invitation.accept | core | ROZ-122 |
| auth.invitation.preview | web | ROZ-104 |
| auth.otp.request | identity | ROZ-125 |
| auth.otp.verify | identity | ROZ-125 |
| auth.profile-name.set | identity | ROZ-124 |
| auth.session.logout | identity | ROZ-125 |
| auth.session.refresh | identity | ROZ-125 |
| auth.tenant.create | core | ROZ-122 |
| auth.tenant.list | core | ROZ-121 |
| auth.tenant.transition | core | ROZ-122 |
| auth.welcome.view | web | ROZ-104 |
| cars.create | web | ROZ-109 |
| cars.detail.view | web | ROZ-109 |
| cars.edit | web | ROZ-109 |
| cars.expenses.manage | core | ROZ-123 |
| cars.inventory.view | web | ROZ-110 |
| cars.lifecycle.manage | web | ROZ-109 |
| cars.list.view | core | ROZ-60 |
| dashboard.analytics.view | web | ROZ-106 |
| dashboard.navigation.use | web | ROZ-106 |
| dashboard.summary.view | web | ROZ-106 |
| intake.create | web | ROZ-108 |
| intake.delete | web | ROZ-108 |
| intake.detail.view | web | ROZ-108 |
| intake.edit | web | ROZ-108 |
| intake.list.view | core | ROZ-60 |
| intake.parts.create | web | ROZ-108 |
| parts.create | core | ROZ-122 |
| parts.delete | web | ROZ-110 |
| parts.detail.view | core | ROZ-122 |
| parts.edit | core | ROZ-122 |
| parts.history.view | core | ROZ-122 |
| parts.list.view | core | ROZ-122 |
| scanning.qr.lookup | core | ROZ-122 |
| scanning.vin.decode | web | ROZ-111 |
| stickers.generate-print-share | web | ROZ-111 |
| stickers.queue.manage | web | ROZ-111 |

## Proposed gaps

| Item | Owner | Tracking |
| --- | --- | --- |

## Legend

- Contract: `ready`, `partial`, `missing`, `unsafe`, or `not-applicable`.

- Web disposition: `parity` or `browser-native`.

- Tracking: a verified Linear issue or a proposed gap key awaiting preview approval.
