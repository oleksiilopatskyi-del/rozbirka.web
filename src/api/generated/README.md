# Generated API contracts

This directory is owned by `openapi-typescript`. Do not edit `core.ts` or
`identity.ts` by hand.

Generate both contracts only from explicit, immutable Core and Identity
OpenAPI inputs:

```sh
npm run contracts:generate -- --core <versioned-file-or-url> --identity <versioned-file-or-url>
```

Remote inputs must use an unencoded HTTP(S) path and exactly one immutable form:

- a full `v1.2.3`/`1.2.3` semantic-version path segment or a complete 40- or
  64-character hexadecimal commit/digest path segment, with no query parameters;
  or
- exactly one query parameter named `version`, `commit`, `digest`, or `sha256`,
  with the corresponding complete semantic-version or digest value and no
  immutable path segment.

Mutable aliases (`latest`, `runtime`, `main`, `master`, `dev`, `develop`, `head`,
`current`, `snapshot`, and `nightly`) are rejected as standalone path tokens or
filename tokens such as `openapi-latest.json`. Dates, short versions/hashes,
extra or conflicting query parameters, encoded path characters, fragments,
credentials, and redirects are also rejected. Local files are read once and
generated from a private byte snapshot; remote response bytes use the same
snapshot rule.

Check committed output for byte-for-byte drift with the same inputs:

```sh
npm run contracts:check -- --core <versioned-file-or-url> --identity <versioned-file-or-url>
```

CI requires `CORE_OPENAPI_IMMUTABLE_URL` and `IDENTITY_OPENAPI_IMMUTABLE_URL`
repository variables. The reusable quality workflow passes those explicit inputs
to `contracts:check`; missing values, mutable URLs, missing committed outputs, or
byte drift fail the gate. The variables must identify the exact Core and Identity
inputs used to generate the committed files, never a runtime or `latest` alias.

The pinned generator currently declares a TypeScript 5 peer range, while this
project uses TypeScript 6. The repository-local `force=true` npm setting applies
to every npm command and could otherwise hide unrelated peer conflicts. The
mandatory `deps:check` gate therefore rejects every dependency-tree problem
except the exact `openapi-typescript@7.13.0` → TypeScript `^5.x` mismatch.
Generation tests and the project typecheck verify this combination. Remove the
repo-wide override and its health-check allowance when the generator's peer
range catches up.
