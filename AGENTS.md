# AI Knowledge: rozbirka.web

## Purpose

Public Rozbirka web application and marketing surface. It includes authentication/tenant/billing flows, SEO-aware React routes, server rendering for prerendered output, production asset optimization, and Cloudflare deployment.

## Repository map

- `src/routes/` — route definitions and router composition.
- `src/components/site/` — marketing sections and navigation.
- `src/api/` — auth, tenant, billing, and token clients.
- `src/seo/` — metadata, structured data, and route SEO.
- `src/entry-server.tsx` — SSR entry used by prerendering.
- `src/assets/` — source and optimized media.
- `scripts/` — prerendering, route checks, asset composition/optimization, and budgets.
- `e2e/` or Playwright configuration — browser coverage.
- `wrangler.jsonc` — Cloudflare deployment.

## Tooling

- React 19, React Router 7, and TypeScript 6.
- Vite 8 for client and SSR builds.
- Tailwind CSS 4, Radix UI, shadcn, and Lucide for UI.
- Vitest + Testing Library for unit/component tests.
- Playwright + axe-core for E2E and accessibility checks.
- Prettier and ESLint for consistency.
- Sharp and custom scripts for image generation/optimization and asset budgets.
- Lighthouse CI for performance budgets.
- Wrangler for Cloudflare validation/deployment.

## Commands

- `npm install`
- `npm run dev`
- `npm run check` for typecheck, lint, formatting, and tests.
- `npm run build:qa` / `npm run build:prod`
- `npm run check:routes` and `npm run check:prerender`
- `npm run test:e2e`
- `npm run budget:assets` and `npm run audit:lhci`
- `npm run verify:prod` for the full production gate.

When adding a route, update route configuration, SEO metadata, structured data when applicable, prerender coverage, navigation, and route tests together. Keep large source images out of runtime paths unless the asset pipeline generates optimized AVIF/WebP variants. Do not put secrets in `VITE_*`, client code, rendered HTML, or Wrangler configuration. Preserve keyboard navigation, semantic landmarks, focus states, contrast, reduced-motion behavior, and Core Web Vitals budgets.
