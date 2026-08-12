# Remove the Account Store Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `Магазин` navigation tab and seller-management content from the authenticated web account page.

**Architecture:** Keep the change at the account-screen integration boundary: narrow the account section union, remove the sidebar entry, and remove the seller panel mount. Preserve all standalone marketplace code and public routes.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library

## Global Constraints

- Modify only `rozbirka.web` on `vsobol/remove-account-store-tab`.
- Do not change `rozbirka.core` or the ROZ-35 worktree.
- Do not change public `/marketplace` routes, marketplace API clients, or standalone marketplace components.

---

### Task 1: Remove the Account Store Integration

**Files:**
- Modify: `src/screens/account.test.tsx:118-186`
- Modify: `src/screens/account.tsx:20-47,163-171`

**Interfaces:**
- Consumes: the existing `AccountScreen` component and authenticated account test fixture.
- Produces: an account sidebar limited to `subscription | plans | payment | billing`; no account mount for `SellerMarketplacePanel`.

- [ ] **Step 1: Write the failing regression test**

Add this test inside the existing `AccountScreen subscription state` suite:

```tsx
it('does not expose the marketplace seller tab', async () => {
  getSubscription.mockResolvedValue(subscription)

  renderAccount()

  expect(await screen.findByText('Pro')).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Магазин' }),
  ).not.toBeInTheDocument()
})
```

This test catches reintroducing the seller tab to authenticated account navigation.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/screens/account.test.tsx
```

Expected: FAIL because the existing sidebar still renders a `Магазин` button.

- [ ] **Step 3: Remove the minimal account integration**

In `src/screens/account.tsx`:

1. Delete the `SellerMarketplacePanel` import.
2. Change the section union to:

```tsx
type Section = 'subscription' | 'plans' | 'payment' | 'billing'
```

3. Delete this navigation entry:

```tsx
{ id: 'marketplace', label: 'Магазин', Icon: Store },
```

4. Delete the complete `section === 'marketplace'` render branch that mounts `SellerMarketplacePanel`.
5. Keep the `Store` icon import because the same file uses it in onboarding content.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- src/screens/account.test.tsx
```

Expected: all account tests PASS.

- [ ] **Step 5: Run the repository verification gate**

Run:

```bash
npm run check
```

Expected: typecheck, lint, formatting, and all Vitest tests PASS.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/screens/account.tsx src/screens/account.test.tsx
git commit -m "fix(web): remove store tab from account"
```

