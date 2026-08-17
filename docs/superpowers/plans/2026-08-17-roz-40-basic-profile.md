# ROZ-40 Basic Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the released profile route's generic heading with a tested basic profile that displays authenticated cabinet data and updates the user's display name.

**Architecture:** Keep identity mutation in `AuthContext` so the API response and global authenticated user stay synchronized. Render a dedicated lazy-loaded `ProfileScreen` behind the existing `ModuleBoundary`; consume `useAuth` and `useCabinet` rather than issuing duplicate reads.

**Tech Stack:** React 19, TypeScript, React Router, Vitest, Testing Library, Tailwind CSS, Axios API facade.

## Global Constraints

- Reuse existing cabinet colors, spacing, typography, borders, inputs, buttons, and responsive behavior; add no new visual language.
- Only display name is editable; phone, current tenant, and tenant role are read-only.
- Use the existing `PATCH /auth/me/name` API through `authApi.updateName`.
- Keep phone changes, avatars, security settings, and business settings out of scope.
- Follow strict RED → GREEN TDD and do not push, merge, or deploy.

---

### Task 1: Authenticated display-name mutation

**Files:**
- Modify: `src/auth/AuthContext.tsx`
- Test: `src/auth/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `authApi.updateName(name: string): Promise<VerifyUser>`
- Produces: `AuthContextValue.updateName(name: string): Promise<void>`

- [ ] **Step 1: Write the failing context test**

Add a harness action and assert that a trimmed, valid API result becomes the
current context user without changing the authenticated tenant list:

```tsx
<button onClick={() => void auth.updateName('Нове імʼя')}>rename</button>
```

```ts
await user.click(screen.getByRole('button', { name: 'rename' }))
expect(authApi.updateName).toHaveBeenCalledWith('Нове імʼя')
expect(await screen.findByTestId('user')).toHaveTextContent('Нове імʼя')
expect(screen.getByTestId('tenant')).toHaveTextContent('tenant-1')
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/auth/AuthContext.test.tsx`

Expected: type/runtime failure because `AuthContextValue.updateName` does not exist.

- [ ] **Step 3: Add the minimal context operation**

Extend the interface and provider with:

```ts
updateName: (name: string) => Promise<void>
```

The callback awaits `authApi.updateName(name)`, then replaces `user` only if
the provider is still authenticated as the same user returned by the request.
It must not call `hydrate`, replace tenants, or reset the selected tenant.

- [ ] **Step 4: Run focused GREEN and static checks**

Run:

```bash
npx vitest run src/auth/AuthContext.test.tsx
npm run typecheck
```

Expected: all focused tests and typecheck pass.

### Task 2: Dedicated profile screen and route

**Files:**
- Create: `src/cabinet/profile/profile-screen.tsx`
- Create: `src/cabinet/profile/profile-screen.test.tsx`
- Modify: `src/routes/routes.tsx`
- Modify: `src/routes/routes.test.tsx`

**Interfaces:**
- Consumes: `useAuth().user`, `useAuth().updateName`, `useCabinet().targetTenant`, and `useCabinet().snapshot.role`
- Produces: `ProfileScreen(): ReactElement`, loaded only for the released `profile` module

- [ ] **Step 1: Write failing screen and route tests**

The component test must render real context-shaped values and assert:

```ts
expect(screen.getByRole('heading', { name: 'Профіль' })).toBeVisible()
expect(screen.getByLabelText('Ім’я')).toHaveValue('Олена')
expect(screen.getByText('+380733182301')).toBeVisible()
expect(screen.getByText('Власник')).toBeVisible()
expect(screen.getByText('QA Switch Test')).toBeVisible()
```

It must also cover unchanged/short-name disabled state, trimming, one pending
request, success, rejection, and unmount before settlement. The route test must
assert the `profile` child references `ProfileScreen`, not
`CabinetModuleRoute`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx vitest run src/cabinet/profile/profile-screen.test.tsx src/routes/routes.test.tsx
```

Expected: missing profile-screen module and missing dedicated route mapping.

- [ ] **Step 3: Implement the minimal existing-design screen**

Build one responsive section using only existing cabinet utility tokens. The
form owns `name`, `idle | pending | success | error`, and a mounted generation
guard. Submit the trimmed name through `auth.updateName`; preserve input on
failure and suppress local late-state writes after unmount.

Wire the route with:

```ts
profile: cabinetScreenRoute('profile', async () => {
  const { ProfileScreen } = await import('@/cabinet/profile/profile-screen')
  return ProfileScreen
})
```

- [ ] **Step 4: Run focused GREEN and affected quality gates**

Run:

```bash
npx vitest run src/cabinet/profile/profile-screen.test.tsx src/routes/routes.test.tsx src/auth/AuthContext.test.tsx
npm run typecheck
npx eslint src/cabinet/profile/profile-screen.tsx src/cabinet/profile/profile-screen.test.tsx src/routes/routes.tsx src/routes/routes.test.tsx src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx
npx prettier --check src/cabinet/profile/profile-screen.tsx src/cabinet/profile/profile-screen.test.tsx src/routes/routes.tsx src/routes/routes.test.tsx src/auth/AuthContext.tsx src/auth/AuthContext.test.tsx
git diff --check
```

Expected: all commands pass.

- [ ] **Step 5: Run full verification and commit**

Run:

```bash
npm run check
npm run build:qa
npm run check:artifact:qa
git diff --check
```

Review the final diff for scope and visual-token reuse, then commit only the
profile implementation, tests, route wiring, and this plan. Do not push,
merge, or deploy.

