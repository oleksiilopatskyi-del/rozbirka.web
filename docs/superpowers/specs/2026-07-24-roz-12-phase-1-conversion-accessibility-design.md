# ROZ-12 Phase 1: Conversion and Accessibility

## Goal

Make the existing `rozbirka.pro` landing conversion flow usable, responsive,
and accessible without changing the current visual identity. This phase fixes
destinations, plan selection, mobile navigation, responsive layout, carousel
controls, FAQ semantics, focus treatment, and the hero heading.

ROZ-12 remains open after this phase. Billing catalog alignment, asset
optimization, SEO/static files, and Cloudflare edge behavior are handled by
later phases.

## Confirmed Product Decisions

- App Store links to
  `https://apps.apple.com/ua/app/rozbirka/id6762130912`.
- Google Play is not published. It appears as a non-interactive "Скоро"
  destination and never as a placeholder link.
- There is no demo page or video. The "Дивитись демо" CTA is removed.
- Selecting a paid plan never starts checkout automatically.
- After login or registration, the account opens the plans section and
  highlights the selected plan. Checkout still requires a separate user action.
- Plan selection is carried in the URL rather than browser storage.

## Scope

### Store Destinations

`StoreBadge` will have explicit interactive and unavailable variants:

- App Store renders an external link with a verified production URL;
- Google Play renders non-interactive content with an accessible "Скоро"
  label;
- neither variant renders `href="#"`.

The same variants are used in the desktop header, mobile menu, and CTA banner.

### Hero Conversion

The main hero CTA routes to `/login`. The demo CTA is removed.

The visible typewriter treatment may remain, but it is hidden from assistive
technology. The semantic `h1` exposes the complete stable text
"Знаєш де кожна деталь і де твої гроші".

### Plan Selection

Each pricing CTA carries one of the supported plan codes:

- `lite_monthly`
- `pro_monthly`
- `enterprise_monthly`

The destination is:

- guest: `/login?plan=<planCode>`;
- authenticated user: `/account?section=plans&plan=<planCode>`.

The login screen validates the query value against the supported codes. A valid
selection becomes its post-authentication destination:
`/account?section=plans&plan=<planCode>`. Unknown or missing values are ignored,
and the existing default `/account` destination is preserved.

The account screen reads `section=plans` and a valid `plan` value. It opens the
plans section and marks the matching card as selected. Selection is
presentational only; it does not call the subscribe endpoint.

### Mobile Navigation

Below the existing `lg` breakpoint, the header exposes a menu button with
`aria-expanded` and `aria-controls`. The menu contains:

- landing section links;
- the App Store link;
- the non-interactive Google Play "Скоро" item;
- the existing login/account destination.

The menu closes when the trigger is pressed again, Escape is pressed, or a
navigation link is selected. Focus returns to the trigger when Escape closes
the menu. Desktop navigation remains unchanged.

### Responsive Layout

- Pricing uses one column on mobile, two columns on tablet, and three columns
  only on wide desktop.
- CTA banner store items participate in normal layout flow on mobile and tablet
  instead of being absolutely positioned over the title.
- Existing typography, colors, shapes, and content hierarchy are preserved.
- The layout must not introduce horizontal overflow at 320, 375, 768, 1024,
  or 1440 CSS pixels.

### Feature Carousel

Previous, next, and pause/play controls are visible and keyboard-accessible at
all viewport widths.

Autoplay:

- starts by default only when reduced motion is not requested;
- pauses while the carousel has pointer hover or keyboard focus;
- stays paused after the user presses pause;
- never starts when `prefers-reduced-motion: reduce` matches.

The controls have accessible names and minimum 44-by-44 CSS pixel targets.

### FAQ and Focus

Closed FAQ panels must be absent from the accessibility tree. Toggle buttons
retain `aria-expanded` and `aria-controls`, and open panels remain associated
with their questions.

Global focus-visible styling uses a two-tone indicator that remains visible on
both dark and orange surfaces. Muted body copy used in this phase is adjusted
where needed to meet a 4.5:1 contrast ratio.

All changed links and buttons have a minimum 44-by-44 CSS pixel interactive
target.

## Components and Responsibilities

- `plan-selection.ts`: owns the supported plan-code type, validation, and
  account/login destination builders.
- `store-badges.tsx`: owns verified/unavailable store presentation.
- `header.tsx`: owns desktop navigation and the accessible mobile disclosure.
- `hero.tsx`: owns the primary registration CTA and stable semantic heading.
- `pricing.tsx`: owns auth-aware plan links, responsive cards, and
  selected-plan styling.
- `login.tsx`: validates and preserves a requested plan through OTP and name
  onboarding.
- `account.tsx`: initializes the plans section from valid URL state and passes
  selection to plan cards.
- `features.tsx`: owns carousel movement, autoplay state, and controls.
- `faq.tsx`: owns disclosure semantics and accessible panel mounting.
- `cta-banner.tsx`: owns responsive store placement.
- `index.css`: owns shared focus-visible behavior and reduced-motion rules.

No new global state store or browser storage is introduced.

## Data Flow

1. A user selects a plan on the landing page.
2. Pricing builds an auth-aware URL with a validated plan code.
3. A guest completes OTP and optional name onboarding.
4. Login navigates to the account plans URL.
5. Account parses the URL, opens the plans section, and marks the matching plan.
6. The user may explicitly choose the existing subscribe action.

Invalid plan codes stop at steps 2, 4, or 5 and fall back to existing defaults
without an error screen.

## Error Handling

- External store links use safe external-link attributes.
- Missing Google Play and demo destinations never create broken interactive
  controls.
- Unknown plan query values are ignored rather than persisted or submitted.
- Menu and carousel behavior remain usable when browser motion APIs are absent.
- This phase does not add network calls, so it introduces no new network retry
  or loading states.

## Testing

Use Vitest and Testing Library to cover:

- no placeholder links or dangling hero fragments;
- verified App Store link and unavailable Google Play semantics;
- mobile menu disclosure, Escape behavior, and link-driven close;
- guest and authenticated pricing destinations;
- valid and invalid plan propagation through login;
- account section initialization and selected plan styling;
- stable accessible hero heading;
- FAQ closed-panel accessibility behavior;
- carousel controls, manual pause, and reduced-motion autoplay behavior.

Use a local production build for manual viewport verification at 320, 375, 768,
1024, and 1440 CSS pixels. Confirm no overlap, clipping, or horizontal overflow,
and verify keyboard focus order and visible focus treatment.

## Out of Scope

- changing plan limits, prices, feature claims, or canonical trial copy;
- loading the public billing catalog;
- optimizing images or fonts;
- metadata, structured data, robots, sitemap, prototype routes, or 404 behavior;
- Cloudflare cache headers, HTTPS/www redirects, or DNS;
- redesigning or rebranding the landing page;
- automatic checkout.
