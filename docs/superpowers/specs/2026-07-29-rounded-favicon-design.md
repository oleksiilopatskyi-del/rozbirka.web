# Rounded favicon design

## Goal

Round the outer corners of the existing Rozbirka favicon while preserving the
approved logo artwork.

## Approved appearance

- Use the selected **B** treatment with a corner radius equal to 20% of the
  1024 px canvas.
- Keep the PNG canvas at 1024 × 1024.
- Make only the pixels outside the rounded rectangle transparent.
- Preserve the black background inside the rounded rectangle.
- Preserve the orange `r`, its proportions, colors, position, and glow without
  retouching or regeneration.

## Integration

Replace `public/favicon.png` in place. Keep the existing
`<link rel="icon" type="image/png" href="/favicon.png" />` declaration, so no
HTML or routing changes are required.

## Verification

- The favicon remains a valid 1024 × 1024 RGBA PNG.
- All four corner pixels are transparent.
- The center and rounded-edge interior remain opaque.
- The existing SEO/favicon test continues to pass.
- A focused regression assertion verifies the transparent corners.
- The production build succeeds.
- The resulting icon is visually inspected at full size and browser-tab size.

## Scope

No changes to header/footer wordmarks, typography, layout, SEO copy, routes, or
other brand assets.
