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
| Contract | not-applicable | 2 |
| Contract | partial | 12 |
| Disposition | browser-native | 3 |
| Disposition | parity | 8 |
| Excluded routes | total | 1 |

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

### dashboard

| ID | Capability | Mobile routes | Web outcome | Contract | Owner | Tracking |
| --- | --- | --- | --- | --- | --- | --- |
| dashboard.analytics.view | View dashboard analytics by period | /(tabs)/(home) | View URL-stable day, week, and month analytics from authoritative server data | partial | web | ROZ-106 |
| dashboard.navigation.use | Navigate to permitted cabinet modules and quick actions | /(tabs)/(home) | Navigate to permission-aware cabinet modules through stable links and guarded create actions | not-applicable | web | ROZ-106 |
| dashboard.summary.view | View the operational dashboard summary | /(tabs)/(home) | View permission-aware server totals and recent activity for the active tenant | partial | web | ROZ-106 |

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

## Existing Linear tracking

| Item | Owner | Tracking |
| --- | --- | --- |
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
| dashboard.analytics.view | web | ROZ-106 |
| dashboard.navigation.use | web | ROZ-106 |
| dashboard.summary.view | web | ROZ-106 |

## Proposed gaps

| Item | Owner | Tracking |
| --- | --- | --- |

## Legend

- Contract: `ready`, `partial`, `missing`, `unsafe`, or `not-applicable`.

- Web disposition: `parity` or `browser-native`.

- Tracking: a verified Linear issue or a proposed gap key awaiting preview approval.
