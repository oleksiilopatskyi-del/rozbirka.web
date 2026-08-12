# Remove the Account Store Tab

## Goal

Remove the `Магазин` tab and its seller-management screen from the authenticated
`/account` page shown in QA.

## Scope

- Remove the `Магазин` navigation entry from the account sidebar.
- Remove `marketplace` from the account section state.
- Stop importing and rendering `SellerMarketplacePanel` from `AccountScreen`.
- Add an account-screen regression test that verifies there is no `Магазин`
  navigation button after the account finishes loading.

## Out of Scope

- Public `/marketplace` routes and screens.
- Marketplace API clients and seller components that may still be used or
  restored independently later.
- Any `rozbirka.core` changes.
- The ROZ-35 core branch and worktree.

## Implementation Boundary

The change is isolated to `rozbirka.web` on branch
`vsobol/remove-account-store-tab`, based on the current `origin/develop`.
Removing the account integration rather than hiding it with CSS ensures that the
seller panel is not mounted and cannot make marketplace requests from the
account page.

## Verification

- The account unit test confirms that the `Магазин` navigation button is absent.
- The existing account tests continue to cover subscription, billing, and plan
  behavior.
- The focused account tests and the repository's standard checks pass.

