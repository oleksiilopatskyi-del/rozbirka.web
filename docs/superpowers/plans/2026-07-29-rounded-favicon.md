# Rounded Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved 20% rounded-corner mask to the existing Rozbirka favicon without altering its artwork.

**Architecture:** Keep the existing favicon URL and replace only the PNG pixels. Use `sharp`, which is already a development dependency, to apply a deterministic SVG alpha mask; extend the existing node-based SEO asset test to verify the resulting transparency.

**Tech Stack:** PNG, SVG alpha mask, Sharp 0.35, Vitest

## Global Constraints

- Keep the PNG canvas at exactly 1024 × 1024.
- Use a corner radius equal to 20% of the canvas: 205 px.
- Make only pixels outside the rounded rectangle transparent.
- Preserve the black interior, orange `r`, colors, position, proportions, and glow.
- Do not change HTML, routes, header/footer wordmarks, typography, layout, or SEO copy.

---

### Task 1: Apply and verify the rounded-corner mask

**Files:**
- Modify: `src/seo/seo-files.test.ts`
- Modify: `public/favicon.png`

**Interfaces:**
- Consumes: the existing `public/favicon.png` RGBA asset and the existing `/favicon.png` link in `index.html`
- Produces: the same `/favicon.png` asset with transparent outer corners and an opaque center

- [ ] **Step 1: Write the failing transparency test**

Add `sharp` to the test imports:

```ts
import sharp from 'sharp'
```

Extend `publishes the Rozbirka PNG favicon` after the dimension assertions:

```ts
const { data, info } = await sharp(favicon)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })
const alphaAt = (x: number, y: number) =>
  data[(y * info.width + x) * info.channels + 3]

expect(info.width).toBe(1024)
expect(info.height).toBe(1024)
expect(alphaAt(0, 0)).toBe(0)
expect(alphaAt(1023, 0)).toBe(0)
expect(alphaAt(0, 1023)).toBe(0)
expect(alphaAt(1023, 1023)).toBe(0)
expect(alphaAt(512, 512)).toBe(255)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run src/seo/seo-files.test.ts
```

Expected: FAIL because the current PNG corner alpha is `255`, not `0`.

- [ ] **Step 3: Apply the 205 px rounded mask**

Run this one-time deterministic asset transformation:

```bash
node --input-type=module -e '
import sharp from "sharp";
import { rename } from "node:fs/promises";
const size = 1024;
const radius = 205;
const output = "public/favicon.rounded.png";
const mask = Buffer.from(
  `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
);
await sharp("public/favicon.png")
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toFile(output);
await rename(output, "public/favicon.png");
'
```

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npx vitest run src/seo/seo-files.test.ts
npm run check
npm run build:qa
```

Expected: the focused test passes; typecheck, lint, formatting, all unit tests,
and the QA build pass.

- [ ] **Step 5: Visually inspect the asset**

Open `public/favicon.png` at full size and confirm:

- the four outer corners are transparent;
- the black rounded rectangle is smooth and symmetric;
- the orange `r` and glow are unchanged;
- the icon remains legible when displayed at 32 × 32.

- [ ] **Step 6: Commit the implementation**

```bash
git add src/seo/seo-files.test.ts public/favicon.png
git commit -m "fix(web): round favicon corners"
```
