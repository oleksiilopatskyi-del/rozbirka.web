# Landing Typography and Footer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original landing hero message with compact proportions and make the shared footer's oversized `rozbirka` wordmark fully visible on every route and viewport.

**Architecture:** Keep the existing shared `Hero` and `SiteFooter` components. Restore the original hero copy without changing the approved responsive scale or animation behavior, and protect the copy, responsive sizes, and footer behavior with component and browser tests.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Vite.

## Global Constraints

- Restore the original four hero lines: `Знаєш`, `де кожна`,
  `деталь і де`, and `твої гроші`.
- Restore the supporting paragraph to
  `Застосунок, який об'єднує фінанси, функції та управління в одному інтерфейсі.`
- Use hero heading sizes `44 / 64 / 88 px` at the existing base, `sm`, and `lg` breakpoints.
- Keep the footer wordmark's current responsive `clamp()` size, centering, weight, color, and decorative `aria-hidden` treatment.
- The complete footer `rozbirka` wordmark must be visible on every route that renders `SiteFooter`, at every supported viewport width.
- Do not add route-specific footer overrides.

---

## File Map

- Modify `src/components/site/hero.tsx`: apply the approved responsive hero font sizes.
- Modify `src/components/site/hero.test.tsx`: assert the restored copy, four-line structure, and approved typography.
- Modify `src/components/site/site-footer.tsx`: remove the vertical wordmark translation that causes clipping.
- Create `src/components/site/site-footer.test.tsx`: protect the shared footer wordmark against reintroducing the clipping translation.
- Modify `e2e/landing.spec.ts`: assert the restored hero copy and LCP reveal sequence.
- Modify `e2e/landing.spec.ts-snapshots/*.png`: refresh macOS and Linux landing baselines after the copy change.

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
  name: 'Знаєш де кожна деталь і де твої гроші',
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

On `/`, confirm the heading has exactly four visual lines and the restored
supporting paragraph. On every route, confirm the complete footer wordmark is
visible and `document.documentElement.scrollWidth ===
document.documentElement.clientWidth`.

- [ ] **Step 8: Commit the footer change and verification test**

```bash
git add src/components/site/site-footer.tsx src/components/site/site-footer.test.tsx
git commit -m "fix(web): show complete footer wordmark"
```

### Task 3: Restore the Original Hero Message

**Files:**
- Modify: `src/components/site/hero.tsx`
- Modify: `src/components/site/hero.test.tsx`
- Modify: `e2e/landing.spec.ts`
- Modify: `e2e/landing.spec.ts-snapshots/*.png`

**Interfaces:**
- Consumes: the compact `Hero(): JSX.Element` from Task 1.
- Produces: the same component with the original four-line heading and
  supporting paragraph, while preserving the current reveal sequence.

- [ ] **Step 1: Write failing component assertions**

Update `src/components/site/hero.test.tsx` to require the accessible heading
`Знаєш де кожна деталь і де твої гроші`, the four visible lines, and the
supporting paragraph
`Застосунок, який об'єднує фінанси, функції та управління в одному інтерфейсі.`
Keep the first line immediately visible, followed by `100ms`, `200ms`, and
`300ms` delays. Keep the paragraph and CTA delays at `520ms` and `680ms`.

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
npm test -- src/components/site/hero.test.tsx
```

Expected: FAIL because the component still renders the newer five-line copy.

- [ ] **Step 3: Restore the copy without changing layout behavior**

Set `heroLines` to:

```tsx
const heroLines: HeroLine[] = [
  { text: 'Знаєш', visibleFromStart: true },
  { text: 'де кожна', delay: '100ms' },
  { text: 'деталь і де', delay: '200ms' },
  { text: 'твої гроші', className: 'text-brand', delay: '300ms' },
]
```

Update the screen-reader heading and supporting paragraph to the exact approved
copy. Keep the `44 / 64 / 88 px` classes and all other behavior unchanged.

- [ ] **Step 4: Update browser assertions and verify RED/GREEN**

Replace the newer visible line literals in `e2e/landing.spec.ts` with the four
restored lines. Update the LCP assertion to use `Знаєш` as the first line and
`де кожна` as the first staggered line. Run:

```bash
npm run build:qa
npx playwright test e2e/landing.spec.ts --project=chromium --grep "hero content|hero LCP|uses compact hero typography"
```

Expected: all focused browser tests PASS.

- [ ] **Step 5: Refresh and inspect visual baselines**

Regenerate the five macOS and five Linux Chromium baselines using the existing
local and Linux-container workflows. Inspect at least the `375px` and `1440px`
outputs and confirm the four-line heading is legible with no overflow.

- [ ] **Step 6: Run the full verification**

Run:

```bash
npm run check
npm run build:qa
npm run test:e2e
```

Expected: all static checks, unit tests, build steps, and browser tests PASS.

- [ ] **Step 7: Commit and push the approved copy**

```bash
git add src/components/site/hero.tsx src/components/site/hero.test.tsx \
  e2e/landing.spec.ts e2e/landing.spec.ts-snapshots
git commit -m "fix(web): restore original landing hero copy"
git push
```
