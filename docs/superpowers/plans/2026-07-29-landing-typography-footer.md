# Landing Typography and Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore compact hero proportions and make the shared footer's oversized `rozbirka` wordmark fully visible on every route and viewport.

**Architecture:** Keep the existing shared `Hero` and `SiteFooter` components and change only their Tailwind presentation classes. Protect the chosen responsive sizes and unclipped footer behavior with focused component tests, then run repository-wide checks and browser-based responsive verification.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Vite.

## Global Constraints

- Keep the current hero wording and its five intentional visual lines unchanged.
- Keep the supporting hero paragraph unchanged.
- Use hero heading sizes `44 / 64 / 88 px` at the existing base, `sm`, and `lg` breakpoints.
- Keep the footer wordmark's current responsive `clamp()` size, centering, weight, color, and decorative `aria-hidden` treatment.
- The complete footer `rozbirka` wordmark must be visible on every route that renders `SiteFooter`, at every supported viewport width.
- Do not add route-specific footer overrides.

---

## File Map

- Modify `src/components/site/hero.tsx`: apply the approved responsive hero font sizes.
- Modify `src/components/site/hero.test.tsx`: assert the approved typography while preserving copy and line structure.
- Modify `src/components/site/site-footer.tsx`: remove the vertical wordmark translation that causes clipping.
- Create `src/components/site/site-footer.test.tsx`: protect the shared footer wordmark against reintroducing the clipping translation.

### Task 1: Compact Hero Typography

**Files:**
- Modify: `src/components/site/hero.tsx`
- Modify: `src/components/site/hero.test.tsx`

**Interfaces:**
- Consumes: existing `Hero(): JSX.Element`.
- Produces: the same `Hero` component with responsive heading classes `text-[44px] sm:text-[64px] lg:text-[88px]`.

- [ ] **Step 1: Write the failing typography assertion**

Add this assertion to the existing stable-heading test after retrieving the heading:

```tsx
const heading = screen.getByRole('heading', {
  level: 1,
  name: 'Програма для авторозбірки, де кожна деталь і кожна оплата під контролем',
})

expect(heading).toHaveClass(
  'text-[44px]',
  'sm:text-[64px]',
  'lg:text-[88px]',
)
expect(heading).not.toHaveClass(
  'text-[52px]',
  'sm:text-[76px]',
  'lg:text-[108px]',
)
```

Retain the existing accessible-name, CTA destination, line text, and animation assertions.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/components/site/hero.test.tsx
```

Expected: FAIL because the heading still has `text-[52px] sm:text-[76px] lg:text-[108px]`.

- [ ] **Step 3: Apply the approved responsive sizes**

In `src/components/site/hero.tsx`, replace only the heading size utilities:

```tsx
className="text-[44px] leading-[1] font-light tracking-[-0.035em] sm:text-[64px] lg:text-[88px]"
```

Do not change `heroLines`, the supporting paragraph, accessibility markup, or animation timings.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
npm test -- src/components/site/hero.test.tsx
```

Expected: all tests in `hero.test.tsx` PASS.

- [ ] **Step 5: Commit the hero change**

```bash
git add src/components/site/hero.tsx src/components/site/hero.test.tsx
git commit -m "fix(web): restore compact landing hero"
```

### Task 2: Fully Visible Shared Footer Wordmark

**Files:**
- Create: `src/components/site/site-footer.test.tsx`
- Modify: `src/components/site/site-footer.tsx`

**Interfaces:**
- Consumes: existing `SiteFooter(): JSX.Element`.
- Produces: the same shared footer with its decorative wordmark no longer translated below its clipping container.

- [ ] **Step 1: Write the failing footer regression test**

Create `src/components/site/site-footer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from './site-footer'

describe('SiteFooter wordmark', () => {
  it('keeps the complete shared wordmark inside its footer container', () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>,
    )

    const wordmark = screen.getByText('rozbirka')
    expect(wordmark).toHaveClass(
      'text-[clamp(80px,22vw,420px)]',
      'whitespace-nowrap',
    )
    expect(wordmark).not.toHaveClass('translate-y-[12%]')
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm test -- src/components/site/site-footer.test.tsx
```

Expected: FAIL because the wordmark still has `translate-y-[12%]`.

- [ ] **Step 3: Remove only the clipping translation**

In `src/components/site/site-footer.tsx`, change the decorative wordmark to:

```tsx
<p className="text-brand text-center text-[clamp(80px,22vw,420px)] leading-[0.9] font-bold tracking-tight whitespace-nowrap select-none">
  rozbirka
</p>
```

Keep the shared component, wordmark size, centering, weight, color,
`whitespace-nowrap`, and `aria-hidden` wrapper unchanged.

- [ ] **Step 4: Run both focused test files**

Run:

```bash
npm test -- src/components/site/hero.test.tsx src/components/site/site-footer.test.tsx
```

Expected: both test files PASS.

- [ ] **Step 5: Run the repository quality gate**

Run:

```bash
npm run check
```

Expected: type checking, linting, formatting checks, and the full Vitest suite PASS.

- [ ] **Step 6: Build the QA bundle**

Run:

```bash
npm run build:qa
```

Expected: client build, SSR build, and prerendering complete successfully.

- [ ] **Step 7: Verify responsive rendering**

Use the authenticated QA browser after deployment, or a local Vite server before
deployment, to inspect these routes at `375×812`, `768×1024`, and `1440×900`:

```text
/
/oblik-avtozapchastyn
/oblik-prodazhiv-avtozapchastyn
/privacy
```

On `/`, confirm the heading retains exactly five visual lines and the supporting
paragraph is unchanged. On every route, confirm the complete footer wordmark is
visible and `document.documentElement.scrollWidth ===
document.documentElement.clientWidth`.

- [ ] **Step 8: Commit the footer change and verification test**

```bash
git add src/components/site/site-footer.tsx src/components/site/site-footer.test.tsx
git commit -m "fix(web): show complete footer wordmark"
```
