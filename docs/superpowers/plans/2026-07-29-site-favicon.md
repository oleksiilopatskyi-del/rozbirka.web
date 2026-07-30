# Site Favicon Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current purple SVG favicon with the exact user-supplied Rozbirka `r` PNG and publish a preview without merging PR #10.

**Architecture:** The browser-facing contract remains a standard `<link rel="icon">` in `index.html`. The supplied binary is copied unchanged into `public`, and an existing Node-environment Vitest suite validates the rendered HTML reference plus the PNG signature and dimensions.

**Tech Stack:** Vite 8, Vitest 4, Node.js file APIs, PNG binary format

## Global Constraints

- Preserve `/Users/user/Desktop/2026-07-29 15.07.03.jpg` byte-for-byte.
- The source is PNG image data at exactly `1024 × 1024`, despite its filename.
- Do not crop, resize, recolor, remove the background, or recompress the image.
- Do not merge PR #10 or delete any branch during this plan.

---

### Task 1: Replace and validate the site favicon

**Files:**
- Modify: `src/seo/seo-files.test.ts`
- Modify: `index.html`
- Create: `public/favicon.png`
- Delete: `public/favicon.svg`

**Interfaces:**
- Consumes: the supplied PNG at `/Users/user/Desktop/2026-07-29 15.07.03.jpg`
- Produces: `/favicon.png`, referenced as an `image/png` favicon by every rendered route

- [ ] **Step 1: Write the failing browser-facing asset test**

Add this test to `src/seo/seo-files.test.ts`:

```ts
it('publishes the Rozbirka PNG favicon', async () => {
  const [html, favicon] = await Promise.all([
    readFile('index.html', 'utf8'),
    readFile('public/favicon.png'),
  ])

  expect(html).toContain(
    '<link rel="icon" type="image/png" href="/favicon.png" />',
  )
  expect(favicon.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )
  expect(favicon.readUInt32BE(16)).toBe(1024)
  expect(favicon.readUInt32BE(20)).toBe(1024)
})
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npx vitest run src/seo/seo-files.test.ts
```

Expected: FAIL because `public/favicon.png` does not exist.

- [ ] **Step 3: Install the exact supplied favicon**

Copy `/Users/user/Desktop/2026-07-29 15.07.03.jpg` byte-for-byte to
`public/favicon.png`, update the `index.html` favicon link to:

```html
<link rel="icon" type="image/png" href="/favicon.png" />
```

Delete `public/favicon.svg`.

- [ ] **Step 4: Verify exact binary preservation**

Run:

```bash
shasum -a 256 \
  '/Users/user/Desktop/2026-07-29 15.07.03.jpg' \
  public/favicon.png
```

Expected: both files have SHA-256
`041bfa052b212e91cc21f26743d216c9dd36cd27bdd1aa44cee41b7ea051120e`.

- [ ] **Step 5: Run focused GREEN verification**

Run:

```bash
npx vitest run src/seo/seo-files.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run full repository verification**

Run:

```bash
npm run check && npm run build:qa && npm run test:e2e
```

Expected: typecheck, lint, formatting, unit tests, QA build, prerender, and
Playwright tests all pass.

- [ ] **Step 7: Review in a fresh local browser tab**

Open `http://127.0.0.1:4174/` in a new tab or hard-refresh an existing tab.
Confirm the browser requests `/favicon.png` successfully and shows the supplied
icon.

- [ ] **Step 8: Commit and push for Cloudflare preview**

```bash
git add index.html public/favicon.png public/favicon.svg \
  src/seo/seo-files.test.ts \
  docs/superpowers/plans/2026-07-29-site-favicon.md
git commit -m "fix(web): replace site favicon"
git push origin fix/roz-13-landing-layout
```

Confirm PR #10 stays open and unmerged while Cloudflare checks complete.
