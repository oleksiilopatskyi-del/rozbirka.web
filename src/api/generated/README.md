# Generated API contracts

This directory is owned by `openapi-typescript`. Do not edit `core.ts` or
`identity.ts` by hand.

Generate both contracts only from explicit, immutable Core and Identity
OpenAPI inputs:

```sh
npm run contracts:generate -- --core <versioned-file-or-url> --identity <versioned-file-or-url>
```

Remote inputs must use an unencoded HTTP(S) path and contain one of these exact
immutable identifiers: a full `v1.2.3`/`1.2.3` semantic-version path segment, a
40- or 64-character hexadecimal commit/digest path segment, or one exact query
key (`version`, `commit`, `digest`, or `sha256`) with the corresponding complete
semantic-version or digest value. Values such as `latest`, `v1`, dates, short
hashes, encoded path characters, fragments, credentials, and redirects are
rejected. Local files are read once and generated from a private byte snapshot;
remote response bytes use the same snapshot rule.

Check committed output for byte-for-byte drift with the same inputs:

```sh
npm run contracts:check -- --core <versioned-file-or-url> --identity <versioned-file-or-url>
```

The normal `npm run check` intentionally does not run `contracts:check` yet.
ROZ-59 must first provide committed, immutable Core and Identity OpenAPI input
locations. Once those artifacts exist, wire their exact locations into CI and
make the drift gate mandatory before marking ROZ-39 complete.

The pinned generator currently declares a TypeScript 5 peer range, while this
project uses TypeScript 6. The repository-local `force=true` npm setting applies
to every npm command and could otherwise hide unrelated peer conflicts. The
mandatory `deps:check` gate therefore rejects every dependency-tree problem
except the exact `openapi-typescript@7.13.0` → TypeScript `^5.x` mismatch.
Generation tests and the project typecheck verify this combination. Remove the
repo-wide override and its health-check allowance when the generator's peer
range catches up.
