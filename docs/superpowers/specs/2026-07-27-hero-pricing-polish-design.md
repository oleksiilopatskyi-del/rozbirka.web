# ROZ-12: Hero motion and pricing polish

## Goal

Polish the landing page before production by:

- making the hero heading reveal feel intentional and consistent with the
  supporting copy and CTA;
- fixing the broken visual treatment of the monthly billing period;
- balancing the pricing grid at tablet widths;
- preserving accessibility, performance, and existing responsive behavior.

Production deployment is explicitly out of scope. The changes will be deployed
to QA through the existing `develop` workflow.

## Hero motion

The four visible heading lines will use the approved **A — staggered line
reveal**:

1. Each line starts slightly below its final position and at zero opacity.
2. Lines reveal in order with a short stagger.
3. The supporting paragraph follows the heading.
4. The primary CTA follows the paragraph.

The complete sequence should feel immediate rather than theatrical. The final
CTA must be visible in under one second on a normal-motion device. The current
permanently blinking cursor will be removed because the approved motion is a
reveal, not a typewriter interaction.

The semantic `h1` and screen-reader-only full heading remain unchanged. Motion
is presentational only. When `prefers-reduced-motion: reduce` is active, all
hero content is visible immediately and no transform animation runs.

## Pricing period

Each plan continues to display its existing price and the full label
`/ місяць`.

The period label will no longer rely on the large price row's inherited
line-height or baseline. It receives:

- the regular Visuelt font;
- an explicit small font size and line-height;
- `white-space: nowrap`;
- independent bottom alignment beside the price.

This prevents clipped or displaced glyphs at every supported viewport while
keeping the current price hierarchy.

## Tablet pricing layout

The pricing grid remains:

- one column on mobile;
- two columns on tablet;
- three columns on desktop.

At the two-column breakpoint, the third Enterprise card is centered across the
grid instead of being left-aligned by itself. At the desktop breakpoint it
returns to the normal third column. Card content and destinations do not
change.

## Scope boundaries

This polish does not change:

- plan prices, limits, trial duration, or API contracts;
- authentication or plan-selection destinations;
- landing copy apart from rendering the full `/ місяць` label;
- feature carousel behavior;
- production deployment settings.

The existing QA service-token and post-deploy route checks remain in place.

## Testing and acceptance

Implementation will be test-driven.

Automated checks must cover:

- hero line animation classes and stagger values;
- reduced-motion fallback;
- absence of the permanent cursor;
- full `/ місяць` copy and stable alignment classes;
- centered Enterprise card at the tablet breakpoint;
- unchanged pricing destinations and API/fallback behavior.

Verification must include:

- typecheck, lint, formatting, and unit tests;
- production and QA builds;
- Playwright interaction/accessibility checks;
- screenshot baselines at 320, 375, 768, 1024, and 1440 px;
- asset budget and Cloudflare dry-run;
- QA deployment and live route verification.

Acceptance criteria:

1. Hero lines reveal in sequence, followed by paragraph and CTA.
2. The CTA is visible within one second unless reduced motion makes it
   immediate.
3. `/ місяць` is fully readable and correctly aligned at all tested widths.
4. Enterprise is centered in the two-column tablet layout.
5. No horizontal overflow, serious accessibility regression, route regression,
   or pricing destination regression is introduced.
6. Production is not deployed.
