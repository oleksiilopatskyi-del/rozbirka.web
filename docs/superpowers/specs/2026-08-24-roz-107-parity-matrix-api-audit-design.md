# ROZ-107 Parity Matrix and API Contract Audit Design

## Purpose

ROZ-107 creates the authoritative, versioned map from reachable Rozbirka
Mobile capabilities to browser-appropriate Web outcomes and the backend
contracts required to deliver them. The artifact must turn the broad goal of
"Mobile parity in Web" into an evidence-backed inventory in which every
capability has a disposition, contract status, owner, and delivery tracking
state.

This task does not implement cabinet screens or backend contract fixes. It
defines the delivery contract that those implementation tasks follow.

## Scope

### In scope

- Every currently reachable Mobile user capability.
- Every system capability required to preserve session, tenant, permission,
  cache, billing, retry, and media safety in Web.
- Every route file found in Mobile, including unreachable, obsolete,
  prototype, and native-only routes recorded explicitly as exclusions.
- Browser-native replacements for native camera, sharing, printing, file,
  scanning, and deep-link behavior.
- Core and Identity API contract mapping, including permissions, tenant
  isolation, billing, feature flags, quotas, idempotency, errors, and durable
  operation behavior where relevant.
- Existing Linear ownership and a proposed tracking identity for newly
  discovered gaps.
- Deterministic generation of a human-readable Markdown report from a YAML
  source of truth.

### Out of scope

- Implementing Web screens or flows.
- Changing Mobile, Core, Identity, Gateway, or Platform code.
- Creating or mutating Linear blockers without a separately approved exact
  preview.
- Creating a separate UX workstream.
- Creating or merging a pull request, deploying, or treating a branch or
  issue status as release evidence.
- Literal React Native UI replication.

## Guiding Principles

1. Audit user outcomes, not screen names. One screen can contain several
   independently deliverable capabilities.
2. Use current reachable behavior as the parity baseline. Found but
   unreachable routes remain visible in the exclusion inventory.
3. Preserve business parity while choosing browser-appropriate interaction
   patterns.
4. Treat backend contracts as authoritative for business rules, permissions,
   tenant isolation, billing, and financial correctness. Web must not duplicate
   these rules.
5. Require evidence for every decision. Do not infer readiness from an endpoint
   name or a route file alone.
6. Leave no silent gaps. Unknown or incomplete behavior is `partial`,
   `missing`, or `unsafe`, with an explanation and owner.
7. Keep the YAML source deterministic and generate Markdown from it. Never
   hand-edit generated Markdown.

## Repository and Delivery Boundary

The maintained artifact belongs to `oleksiilopatskyi-del/rozbirka.web` under
the ROZ-104 service root. Work is performed on the service-root branch
`vsobol/roz-104-frontend-rozbirkaweb-primary`, based on `main`. ROZ-107 is a
child task and does not own a separate repository, branch, or pull request.

The audit reads exact revisions of:

- `rozbirka.mobile`
- `rozbirka.web`
- `rozbirka.core`
- `rozbirka.identity`

Only `rozbirka.web` is modified by this task.

## Artifacts

The implementation creates:

- `docs/parity/mobile-web-parity.yaml` — authoritative structured source.
- `docs/parity/mobile-web-parity.md` — deterministic generated report.
- `scripts/generate-parity-matrix.mjs` — YAML loader, validator, report model,
  Markdown renderer, and CLI entry point for generation.
- `scripts/check-parity-matrix.mjs` — CLI drift gate that regenerates in memory
  and compares exact Markdown bytes.
- `scripts/parity-matrix.test.ts` — validation, rendering, and drift tests.
- `package.json` and `package-lock.json` updates for commands and the pinned
  YAML parser.

No separate JSON Schema, database, or hosted service is introduced. Runtime
validation remains in the generator so the executable rules and report logic
cannot drift apart.

## YAML Model

The top-level document has these required fields:

```yaml
schemaVersion: 1
audit:
  mobileCommit: 40-character-lowercase-git-sha
  webCommit: 40-character-lowercase-git-sha
  coreCommit: 40-character-lowercase-git-sha
  identityCommit: 40-character-lowercase-git-sha
capabilities: []
systemCapabilities: []
excludedRoutes: []
```

The source contains no generated-at timestamp. Exact source commits make the
audit reproducible without introducing nondeterministic output.

### User capability

Each `capabilities` entry contains:

- `id`: stable dotted identifier such as `parts.list.view`.
- `domain`: one approved domain name.
- `name`: concise user outcome.
- `mobile.routes`: one or more Mobile routes.
- `mobile.actions`: specific user actions represented by the row.
- `web.outcome`: observable Web result.
- `web.route`: planned stable Web route or `null` when no route is needed.
- `web.disposition`: `parity` or `browser-native`.
- `web.browserEquivalent`: required for `browser-native`, otherwise omitted.
- `contract.service`: `core`, `identity`, `gateway`, `platform`, or `none`.
- `contract.status`: `ready`, `partial`, `missing`, `unsafe`, or
  `not-applicable`.
- `contract.operations`: exact OpenAPI operation identifiers or endpoint
  references; required for `ready` and whenever known for other statuses.
- `contract.notes`: required for `partial`, `missing`, and `unsafe`.
- `access.permissions`, `access.tenant`, and `access.billing`: explicit access
  requirements or `not-applicable` with evidence.
- `owner`: `web`, `core`, `identity`, `gateway`, or `platform`.
- `tracking`: existing Linear issue or proposed gap identity.
- `evidence`: non-empty repository-qualified code or contract references.

### System capability

`systemCapabilities` uses the same contract, access, tracking, and evidence
model. It replaces Mobile and Web route requirements with:

- `trigger`: when the behavior runs.
- `mobileBehavior`: current observable Mobile behavior.
- `webOutcome`: required Web guarantee.

Examples include refresh coordination, tenant transitions, private cache
cleanup, offline/retry policy, media upload ownership, permission enforcement,
and billing gates.

### Excluded route

Each `excludedRoutes` entry contains:

- `route`: discovered Mobile route.
- `classification`: `unreachable`, `obsolete`, `prototype`, or `native-only`.
- `reason`: explicit decision rationale.
- `evidence`: non-empty repository-qualified references.
- `webReplacement`: required when the user outcome still needs a Web path;
  otherwise `null` with the reason proving no replacement is necessary.
- `tracking`: existing issue or proposed decision identity when follow-up is
  required.

### Delivery tracking

Existing work uses:

```yaml
tracking:
  status: existing
  issue: ROZ-110
```

Newly discovered work awaiting an approved Linear preview uses:

```yaml
tracking:
  status: proposed
  proposalKey: core-cars-server-search
```

`proposalKey` is a stable audit identity, not a Linear issue identifier and not
proof that an issue exists. After approved creation and exact re-fetch, the
entry changes to `existing` with the returned issue identifier.

## Approved Domains

The audit proceeds in this order:

1. Auth and onboarding
2. Dashboard
3. Cars
4. Intake
5. Parts and warehouse
6. QR, VIN/OEM, and stickers
7. Customers
8. Orders
9. Cash
10. Reports
11. Team, roles, permissions, and invitations
12. Profile, business settings, and billing
13. System capabilities
14. Excluded routes

The canonical Orders flow replaces obsolete direct-sale behavior. The audit
must not create a second business path merely to mimic legacy navigation.

## Audit Workflow

For each domain:

1. Record the exact source commits in `audit`.
2. Inventory route files and prove whether each route is reachable through
   navigation, redirects, deep links, or system flows.
3. Decompose reachable screens into individual user capabilities.
4. Trace Mobile API calls and relevant permission, tenant, billing, feature
   flag, quota, and error behavior.
5. Locate the corresponding Core or Identity implementation and contract
   evidence.
6. Define the Web outcome and browser-native replacement where applicable.
7. Assign the contract status and owning service.
8. Link existing Linear work or assign a stable proposed gap key.
9. Add repository-qualified evidence for every material claim.
10. Generate the report and run the full validator before moving to the next
    domain.

If the code cannot prove behavior, the audit records the uncertainty rather
than guessing. Unknown contract support is never `ready`.

## Validation Rules

The generator rejects:

- unsupported `schemaVersion` values;
- malformed or non-lowercase 40-character commit SHAs;
- duplicate IDs, routes, or proposal keys where uniqueness is required;
- unknown domains, dispositions, classifications, services, owners, contract
  statuses, or tracking statuses;
- empty evidence arrays;
- a user capability without Mobile routes/actions or a Web outcome;
- `browser-native` without `browserEquivalent`;
- `ready` without contract operations and contract evidence;
- `partial`, `missing`, or `unsafe` without contract notes and an owning
  service;
- `not-applicable` with a non-`none` service;
- an exclusion without a reason or evidence;
- `tracking.status: existing` without an issue matching `ROZ-[0-9]+`;
- `tracking.status: proposed` without a stable kebab-case `proposalKey`;
- contradictory fields that are forbidden by the selected status.

Cross-repository evidence uses strings such as
`rozbirka.mobile:app/part/[id]/index.tsx`. Web CI validates the syntax and
source commit, but does not require sibling repositories to be checked out.
This avoids an accidental multi-repository CI dependency.

## Generated Report

The Markdown report contains:

- audit source commits;
- a summary count by contract status and disposition;
- one capability table per domain;
- a system capability table;
- excluded route decisions;
- existing Linear tracking grouped by owner;
- proposed gaps grouped by owner;
- a legend describing every status.

Rows use stable capability IDs for deterministic ordering. The output contains
no current timestamp, machine path, or environment-specific data.

## Error Handling

Both CLIs return a non-zero exit code with a field-qualified message. The
generator does not write partial output: it validates and renders completely
before replacing the target Markdown file. The check command does not modify
files; it reports that `npm run parity:generate` is required when generated
output differs.

YAML parse errors include the parser location. Semantic validation errors
include the capability ID or excluded route plus the invalid field.

## Testing

Vitest covers:

- a minimal valid document;
- deterministic rendering and ordering;
- duplicate capability IDs;
- malformed source commits;
- missing evidence;
- `browser-native` without an equivalent;
- `ready` without an operation or contract evidence;
- incomplete non-ready contracts;
- invalid tracking state combinations;
- exclusions without rationale;
- exact generated-output drift detection;
- CLI exit behavior for valid, invalid, and stale fixtures.

Repository verification includes the focused parity test, `npm run
parity:check`, formatting, lint, typecheck, and the existing Web test suite.

## Linear and Release Governance

ROZ-107 remains under ROZ-104 and inherits the service-root branch. Audit
results do not mutate Linear automatically. Newly discovered blockers are
collected as exact proposals containing title, team, project, parent/root
placement, description, priority, ownership, relations, and delivery key. They
are created only after an approved immutable preview and are re-fetched by
returned ID.

ROZ-107 is release-required. A completed document or merged pull request alone
does not prove QA or production delivery. Status advancement beyond review must
follow the separately approved release gate and verified external evidence.

## Completion Criteria

ROZ-107 implementation is ready for review when:

- every discovered Mobile route is represented by a reachable capability or an
  explicit exclusion;
- every reachable user action is mapped to a Web outcome;
- all required system capabilities are represented;
- every included row has contract status, owner, tracking state, and evidence;
- all exclusions contain evidence and rationale;
- proposed gaps are complete enough for an exact Linear preview;
- generated Markdown matches YAML exactly;
- all parity checks and the existing Web verification suite pass.
