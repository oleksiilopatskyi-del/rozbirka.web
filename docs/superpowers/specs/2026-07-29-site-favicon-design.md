# Site Favicon Replacement Design

## Goal

Replace the current purple SVG favicon with the user-provided Rozbirka `r`
image so it can be reviewed before PR #10 is merged.

## Source Asset

- Source: `/Users/user/Desktop/2026-07-29 15.07.03.jpg`
- The file contains PNG image data with alpha at `1024 × 1024`, despite its
  `.jpg` filename.
- Preserve the source image byte-for-byte: no cropping, resizing, color
  changes, background removal, or recompression.

## Implementation

- Copy the source asset to `public/favicon.png`.
- Update the favicon link in `index.html` from `/favicon.svg` to
  `/favicon.png` with MIME type `image/png`.
- Remove the obsolete `public/favicon.svg` from the repository.
- Add a regression check that verifies the HTML favicon reference and source
  asset contract.

## Validation

- Confirm `public/favicon.png` is PNG, `1024 × 1024`, and byte-identical to the
  supplied source.
- Run the focused favicon regression check.
- Run the repository's complete verification suite and production/QA build.
- Open the local site in a fresh browser tab and verify the tab icon.
- Push the reviewed change to the existing
  `fix/roz-13-landing-layout` branch so Cloudflare can produce a preview.

## Integration Boundary

- Do not merge PR #10 in this step.
- Do not delete local or remote branches in this step.
- Merge and branch cleanup require explicit approval after the user reviews
  the favicon preview.
