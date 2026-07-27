# Hero Motion and Pricing Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved staggered hero reveal, repair the `/ місяць` label, and balance the tablet pricing grid without deploying production.

**Architecture:** Keep the work inside the existing `Hero` and `Pricing` components and reuse the global `anim-fade-up` reduced-motion behavior. Encode motion timings as component data/styles so unit tests can verify the sequence, and use responsive utility classes for pricing alignment without adding runtime layout logic.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Vitest, Testing Library, Playwright, Vite, Cloudflare Workers/Wrangler.

## Global Constraints

- Production deployment is out of scope.
- Deploy only through the existing `develop` → QA workflow.
- Hero CTA must be visible within one second on normal-motion devices.
- `prefers-reduced-motion: reduce` must reveal all hero content immediately with no transform animation.
- Keep the semantic `h1`, full screen-reader heading, pricing data, trial duration, API contracts, and plan destinations unchanged.
- Render the full label `/ місяць` at every supported width.
- Preserve one pricing column on mobile, two on tablet, and three on desktop.
- Verify 320, 375, 768, 1024, and 1440 px without horizontal overflow.

## File map

- `src/components/site/hero.tsx`: hero line metadata, staggered presentation, copy/CTA timing, removal of the blinking cursor.
- `src/components/site/hero.test.tsx`: semantic heading, stagger timing, copy/CTA sequence, and cursor regression tests.
- `e2e/landing.spec.ts`: reduced-motion visibility regression and existing responsive/accessibility coverage.
- `src/components/site/pricing.tsx`: period typography/alignment and responsive Enterprise-card placement.
- `src/components/site/pricing.test.tsx`: period and tablet/desktop class regressions plus existing destination/API behavior.
- `e2e/landing.spec.ts-snapshots/*.png`: approved macOS and Linux visual baselines for five viewport widths.
- `.github/workflows/deploy-node-static-template.yml`: no behavior change expected; existing failure artifacts supply Linux actual screenshots if baselines differ.

---

### Task 1: Stagger the hero reveal

**Files:**
- Modify: `src/components/site/hero.test.tsx`
- Modify: `src/components/site/hero.tsx`
- Modify: `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: existing `anim-fade-up` class from `src/index.css`, whose reduced-motion media query disables animation and restores opacity.
- Produces: four visible line spans with `anim-fade-up` and delays `0ms`, `100ms`, `200ms`, `300ms`; supporting copy at `520ms`; CTA container at `680ms`.

- [ ] **Step 1: Write the failing hero motion test**

Add this test below the existing conversion test:

```tsx
it('reveals heading lines, copy, and CTA in the approved sequence', () => {
  const { container } = render(
    <MemoryRouter>
      <Hero />
    </MemoryRouter>,
  )

  const expectedLines = [
    ['Знаєш', '0ms'],
    ['де кожна', '100ms'],
    ['деталь і де', '200ms'],
    ['твої гроші', '300ms'],
  ] as const

  expectedLines.forEach(([text, delay]) => {
    const line = screen.getByText(text)
    expect(line).toHaveClass('anim-fade-up')
    expect(line).toHaveStyle({ animationDelay: delay })
  })

  expect(
    screen.getByText(/Застосунок, який об'єднує фінанси/),
  ).toHaveStyle({ animationDelay: '520ms' })
  expect(
    screen.getByRole('link', { name: 'Спробувати безкоштовно' }).parentElement,
  ).toHaveStyle({ animationDelay: '680ms' })
  expect(container.querySelector('.animate-pulse')).toBeNull()
})
```

- [ ] **Step 2: Run the hero test and confirm the new assertions fail**

Run:

```bash
npx vitest run src/components/site/hero.test.tsx
```

Expected: FAIL because line spans do not have `anim-fade-up` or delays, the copy/CTA still use `1700ms`/`1900ms`, and `.animate-pulse` exists.

- [ ] **Step 3: Implement the minimal staggered reveal**

Change the line metadata and renderer to:

```tsx
interface HeroLine {
  text: string
  className?: string
  delay: string
}

const heroLines: HeroLine[] = [
  { text: 'Знаєш', delay: '0ms' },
  { text: 'де кожна', delay: '100ms' },
  { text: 'деталь і де', delay: '200ms' },
  { text: 'твої гроші', className: 'text-brand', delay: '300ms' },
]

function AnimatedHeading({ lines }: { lines: HeroLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <span
          key={line.text}
          className={`anim-fade-up block min-h-[1em] ${line.className ?? ''}`}
          style={{ animationDelay: line.delay }}
        >
          {line.text}
        </span>
      ))}
    </>
  )
}
```

Render `AnimatedHeading` in the existing `aria-hidden` wrapper. Remove the cursor span entirely. Change the paragraph delay to `520ms` and the CTA container delay to `680ms`.

- [ ] **Step 4: Run the focused test and static checks**

Run:

```bash
npx vitest run src/components/site/hero.test.tsx
npm run typecheck
npm run lint
```

Expected: all commands PASS.

- [ ] **Step 5: Add the reduced-motion browser regression**

Add this Playwright test after the existing landing interaction test:

```tsx
test('hero content is immediately visible with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Знаєш де кожна деталь і де твої гроші',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Спробувати безкоштовно' }),
  ).toBeVisible()

  const visibleLine = page.getByText('Знаєш', { exact: true })
  await expect(visibleLine).toHaveCSS('animation-name', 'none')
  await expect(visibleLine).toHaveCSS('opacity', '1')
  await expect(visibleLine).toHaveCSS('transform', 'none')
})
```

- [ ] **Step 6: Build QA and run the reduced-motion browser test**

Run:

```bash
npm run build:qa
npx playwright test e2e/landing.spec.ts --project=chromium --grep "reduced motion"
```

Expected: the reduced-motion test PASS.

- [ ] **Step 7: Commit the hero change**

```bash
git add src/components/site/hero.tsx src/components/site/hero.test.tsx e2e/landing.spec.ts
git commit -m "feat(web): animate hero heading reveal"
```

---

### Task 2: Repair pricing typography and tablet balance

**Files:**
- Modify: `src/components/site/pricing.test.tsx`
- Modify: `src/components/site/pricing.tsx`

**Interfaces:**
- Consumes: `LandingPlan.variant` from `src/lib/landing-plans.ts`.
- Produces: full `/ місяць` labels with independent typography; Enterprise card centered only at the two-column breakpoint.

- [ ] **Step 1: Write failing pricing layout tests**

In `src/components/site/pricing.test.tsx`, add:

```tsx
it('renders a stable full monthly period label beside every price', async () => {
  render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  )

  const periods = await screen.findAllByText('/ місяць')
  expect(periods).toHaveLength(3)
  periods.forEach((period) => {
    expect(period).toHaveClass(
      'font-visuelt',
      'leading-none',
      'whitespace-nowrap',
      'self-end',
    )
  })
})

it('centers Enterprise on tablet and restores the third column on desktop', async () => {
  const { container } = render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  )

  await screen.findByText('Enterprise')
  const grid = container.querySelector('#pricing ul')
  expect(grid).toHaveClass('md:grid-cols-2', 'lg:grid-cols-3')

  const enterpriseCard = screen.getByText('Enterprise').closest('li')
  expect(enterpriseCard).toHaveClass(
    'md:col-span-2',
    'md:mx-auto',
    'lg:col-span-1',
    'lg:mx-0',
  )
})
```

- [ ] **Step 2: Run the pricing tests and confirm the new assertions fail**

Run:

```bash
npx vitest run src/components/site/pricing.test.tsx
```

Expected: FAIL because the grid still switches to three columns at `xl`, the Enterprise card has no centering classes, and the period label inherits the price row alignment.

- [ ] **Step 3: Implement the pricing layout**

Change the outer grid classes to:

```tsx
className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
```

Add Enterprise-only responsive classes to the card:

```tsx
isEnterprise &&
  'md:col-span-2 md:mx-auto md:w-[calc(50%-0.5rem)] lg:col-span-1 lg:mx-0 lg:w-auto'
```

Define `const isEnterprise = plan.variant === 'enterprise'` beside `isPro`.

Replace the price row with independently aligned children:

```tsx
<p className="flex items-end gap-2 font-light tracking-[-0.04em]">
  <span className="text-[64px] leading-[0.9] lg:text-[80px]">
    {plan.price}
  </span>
  <span className="font-visuelt mb-[0.55em] self-end whitespace-nowrap text-[14px] leading-none font-normal tracking-normal opacity-70">
    / {plan.period}
  </span>
</p>
```

- [ ] **Step 4: Run pricing and full unit checks**

Run:

```bash
npx vitest run src/components/site/pricing.test.tsx
npm run check
```

Expected: pricing tests and all unit/static checks PASS.

- [ ] **Step 5: Commit the pricing change**

```bash
git add src/components/site/pricing.tsx src/components/site/pricing.test.tsx
git commit -m "fix(web): align pricing periods and tablet cards"
```

---

### Task 3: Refresh responsive visual baselines

**Files:**
- Modify: `e2e/landing.spec.ts-snapshots/landing-320-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-375-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-768-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-1024-chromium.png`
- Modify: `e2e/landing.spec.ts-snapshots/landing-1440-chromium.png`
- Modify after Linux CI capture: matching `*-linux-chromium.png` files.

**Interfaces:**
- Consumes: the completed Hero and Pricing rendering from Tasks 1–2.
- Produces: reviewed macOS and Linux baselines for the existing responsive matrix.

- [ ] **Step 1: Build QA and generate macOS baselines**

Run:

```bash
npm run build:qa
npx playwright test e2e/landing.spec.ts --project=chromium --update-snapshots
```

Expected: seven Chromium tests PASS and five macOS baseline images update.

- [ ] **Step 2: Visually inspect every updated baseline**

Open the five files and confirm:

- the four hero lines are fully visible;
- `/ місяць` is legible and aligned on all three cards;
- Enterprise is centered at 768 px;
- all three cards occupy columns at 1024 and 1440 px;
- no content is clipped and no horizontal overflow is visible.

- [ ] **Step 3: Run the full local production verification**

Run:

```bash
npm run verify:prod
```

Expected: unit/static checks, production build, asset budget, all Playwright projects, Lighthouse, and Wrangler production dry-run PASS.

- [ ] **Step 4: Commit the macOS baselines**

```bash
git add e2e/landing.spec.ts-snapshots/*-chromium.png
git commit -m "test(web): refresh landing visual baselines"
```

- [ ] **Step 5: Push to `develop` and collect Linux actual screenshots**

From the main checkout, fast-forward `develop` to the isolated implementation
branch and push it. The first Linux workflow is expected to fail only on old
Linux screenshot baselines and upload the `playwright-failure` artifact.

Run:

```bash
git -C /Users/user/Code/rozbirka/rozbirka.web merge --ff-only feat/roz-12-hero-pricing-polish
git -C /Users/user/Code/rozbirka/rozbirka.web push origin develop
final_sha=$(git -C /Users/user/Code/rozbirka/rozbirka.web rev-parse HEAD)
run_id=$(gh run list --repo oleksiilopatskyi-del/rozbirka.web --branch develop --limit 5 --json databaseId,headSha --jq ".[] | select(.headSha == \"$final_sha\") | .databaseId" | head -n 1)
test -n "$run_id"
gh run watch "$run_id" --repo oleksiilopatskyi-del/rozbirka.web --exit-status || true
gh run view "$run_id" --repo oleksiilopatskyi-del/rozbirka.web --log-failed | rg "toHaveScreenshot|Expected an image"
artifact_dir=$(mktemp -d /tmp/roz12-linux-baselines.XXXXXX)
gh run download "$run_id" --repo oleksiilopatskyi-del/rozbirka.web --name playwright-failure --dir "$artifact_dir"
```

Copy each actual image into the isolated worktree:

```bash
for width in 320 375 768 1024 1440; do
  actual=$(find "$artifact_dir/test-results" -name "landing-$width-linux-actual.png" -print -quit)
  test -n "$actual"
  cp "$actual" "e2e/landing.spec.ts-snapshots/landing-$width-linux-chromium.png"
done
```

Compare dimensions and visually inspect all five images before committing.

- [ ] **Step 6: Commit and push Linux baselines**

```bash
git add e2e/landing.spec.ts-snapshots/*-linux-chromium.png
git commit -m "test(web): refresh Linux landing baselines"
git -C /Users/user/Code/rozbirka/rozbirka.web merge --ff-only feat/roz-12-hero-pricing-polish
git -C /Users/user/Code/rozbirka/rozbirka.web push origin develop
```

Expected: the next QA workflow builds, tests, deploys, and passes post-deploy
route checks.

---

### Task 4: Verify the live QA release

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: successful QA deployment from Task 3.
- Produces: release evidence for ROZ-12 without touching production.

- [ ] **Step 1: Confirm GitHub Actions is green**

Run:

```bash
gh run list --repo oleksiilopatskyi-del/rozbirka.web --branch develop --limit 1 --json databaseId,headSha,status,conclusion,url
```

Expected: the run for the final commit has `status: completed` and
`conclusion: success`.

- [ ] **Step 2: Run authenticated QA route checks**

Run the existing route checker with the repository's GitHub/Cloudflare Access
service-token secrets supplied through the environment:

```bash
npm run check:routes -- https://qa.rozbirka.pro https://qaapi.rozbirka.pro
```

Expected: exit code 0, including 200/404 route contracts, production canonicals,
immutable assets, and JSON billing plans.

- [ ] **Step 3: Perform focused live visual QA**

Inspect the deployed QA landing at 320, 768, and 1440 px and confirm:

- staggered hero reveal order;
- immediate static content with reduced motion;
- correct `/ місяць` typography;
- centered Enterprise at tablet width;
- no new overflow or clipped content.

- [ ] **Step 4: Report completion without production deployment**

Report:

- final commit SHA;
- successful GitHub Actions URL;
- local and live verification results;
- confirmation that production was not deployed;
- any non-blocking warnings separately from acceptance results.
