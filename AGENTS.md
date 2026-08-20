# AI Agent Guide: `rozbirka.web`

## Scope

This repository contains the public Rozbirka website, authentication and account flows, SEO-aware React routes, prerendered output, and the Cloudflare Worker that serves the application. Keep changes limited to this repository unless the task explicitly coordinates a contract change with `rozbirka.core` or `rozbirka.mobile`.

## Repository map

- `src/routes/` — route declarations and router composition.
- `src/screens/` — route-level screens, including login and account.
- `src/components/site/` — public marketing sections and navigation.
- `src/components/ui/` — shared UI primitives.
- `src/auth/` — authentication context and route guards.
- `src/api/` — API client, auth, tenant, billing, token, and shared API types.
- `src/seo/` — page metadata and structured data.
- `src/entry-server.tsx` — SSR entry used by prerendering.
- `src/assets/` and `public/` — source, optimized, and static assets.
- `worker/` — Cloudflare Worker entry and request handling.
- `scripts/` — prerender, production-route, asset, and performance checks.
- `e2e/` and `playwright.config.ts` — browser and accessibility coverage.
- `wrangler.jsonc` — QA and production Cloudflare configuration.

## Stack and commands

The app uses React 19, React Router 7, TypeScript 6, Vite 8, Tailwind CSS 4, Radix UI, Vitest, Playwright, and Wrangler. Use the committed lockfile and Node/npm versions expected by CI.

- Install dependencies: `npm ci`
- Start locally: `npm run dev`
- Run the standard validation gate: `npm run check`
- Build the default target: `npm run build`
- Build environment variants: `npm run build:qa` and `npm run build:prod`
- Check generated routes and prerender output: `npm run check:routes` and `npm run check:prerender`
- Run browser tests: `npm run test:e2e`
- Check asset and Lighthouse budgets: `npm run budget:assets` and `npm run audit:lhci`
- Run the full production gate: `npm run verify:prod`

Before handing off a change, run `npm run check` and the build most relevant to the target environment. Add focused tests when behavior changes. `verify:prod` also runs browser, Lighthouse, asset-budget, and Wrangler dry-run checks and may require the environment expected by CI.

## Change guidelines

- When adding or changing a route, update its route declaration, SEO metadata, structured data when applicable, prerender coverage, navigation, and route tests together.
- Keep API calls in `src/api/`; reuse the shared client and types instead of creating screen-local HTTP code.
- Treat authentication and tenant selection as security boundaries. Preserve token clearing on failed refresh or logout, send the selected tenant through the shared client, and never trust a client-selected tenant without server-side authorization.
- Do not expose secrets in `VITE_*` variables, client bundles, rendered HTML, committed environment files, or `wrangler.jsonc`. Only values intentionally public to the browser belong in client environment variables.
- Do not document or depend on unmerged feature branches. Confirm behavior against the target branch and generated API contract.
- Preserve semantic landmarks, keyboard navigation, visible focus, contrast, reduced-motion behavior, and existing accessibility tests.
- Keep large source images out of runtime paths. Use the asset pipeline and optimized AVIF/WebP variants, and respect asset and Core Web Vitals budgets.
- Keep QA and production behavior aligned. Any Cloudflare route, Worker, or deployment change must be reflected in `wrangler.jsonc` and the relevant workflow, without committing credentials.
