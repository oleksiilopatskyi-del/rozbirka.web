# Landing Typography and Footer Design

## Goal

Restore the landing page's visual balance after the longer hero copy was
introduced, and ensure the oversized `rozbirka` wordmark in the shared footer is
fully visible everywhere.

## Scope

- Keep the current hero wording and its five intentional lines:
  - `Програма для`
  - `авторозбірки,`
  - `де кожна деталь`
  - `і кожна оплата`
  - `під контролем`
- Keep the supporting paragraph unchanged.
- Reduce the hero heading's responsive font sizes from `52 / 76 / 108 px` to
  `44 / 64 / 88 px` at the existing base, `sm`, and `lg` breakpoints.
- Remove the downward translation from the oversized footer wordmark so the
  complete `rozbirka` text is visible.
- Apply the footer behavior to every route that renders the shared
  `SiteFooter`, at every supported viewport width.

## Implementation Design

The hero remains structurally and semantically unchanged. Only its responsive
font-size utility classes change, preserving the existing line height, tracking,
animation, accessible full heading, and fixed visual line breaks.

The footer remains a shared component. The visual wordmark keeps its current
responsive `clamp()` size, centering, weight, color, and decorative
`aria-hidden` treatment. Removing its vertical translation prevents the
container's overflow clipping from cutting off the glyphs. No route-specific
footer overrides will be added.

## Verification

- Add or update component tests that assert the intended responsive typography
  classes and the absence of the footer's downward-translation class.
- Run formatting, linting, type checking, and the relevant unit tests.
- Visually verify the homepage and both SEO use-case routes at mobile, tablet,
  and desktop widths.
- Confirm that the complete footer wordmark is visible on every checked route
  without introducing horizontal page overflow.

## Out of Scope

- Copy changes.
- Hero animation changes.
- Footer navigation, spacing, colors, or wordmark sizing changes.
- Changes to pages that do not render `SiteFooter`.
