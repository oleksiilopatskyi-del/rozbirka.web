# Landing Typography and Footer Design

## Goal

Restore the landing page's original hero message with compact responsive
typography, and ensure the oversized `rozbirka` wordmark in the shared footer
is fully visible everywhere.

## Scope

- Restore the original hero wording and its four intentional lines:
  - `Знаєш`
  - `де кожна`
  - `деталь і де`
  - `твої гроші`
- Restore the original supporting paragraph:
  `Застосунок, який об’єднує фінанси, функції та управління в одному
  інтерфейсі.`
- Reduce the hero heading's responsive font sizes from `52 / 76 / 108 px` to
  `44 / 64 / 88 px` at the existing base, `sm`, and `lg` breakpoints.
- Remove the downward translation from the oversized footer wordmark so the
  complete `rozbirka` text is visible.
- Apply the footer behavior to every route that renders the shared
  `SiteFooter`, at every supported viewport width.

## Implementation Design

The hero keeps its current structure, responsive `44 / 64 / 88 px` scale,
line height, tracking, animation behavior, accessible full heading, and fixed
visual line breaks. Its visible and accessible heading copy and supporting
paragraph return to the original wording.

The footer remains a shared component. The visual wordmark keeps its current
responsive `clamp()` size, centering, weight, color, and decorative
`aria-hidden` treatment. Removing its vertical translation prevents the
container's overflow clipping from cutting off the glyphs. No route-specific
footer overrides will be added.

## Verification

- Add or update component tests that assert the restored accessible heading,
  four visible lines, supporting paragraph, and intended responsive
  typography.
- Run formatting, linting, type checking, and the relevant unit tests.
- Visually verify the homepage and both SEO use-case routes at mobile, tablet,
  and desktop widths.
- Confirm that the complete footer wordmark is visible on every checked route
  without introducing horizontal page overflow.

## Out of Scope

- Hero animation changes.
- Footer navigation, spacing, colors, or wordmark sizing changes.
- Changes to pages that do not render `SiteFooter`.
