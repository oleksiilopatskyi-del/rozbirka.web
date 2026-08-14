# Generated API contracts

This directory is owned by `openapi-typescript`. Do not edit `core.ts` or
`identity.ts` by hand.

Generate both contracts only from explicit, immutable Core and Identity
OpenAPI inputs:

```sh
npm run contracts:generate -- --core <versioned-file-or-url> --identity <versioned-file-or-url>
```

Check committed output for byte-for-byte drift with the same inputs:

```sh
npm run contracts:check -- --core <versioned-file-or-url> --identity <versioned-file-or-url>
```

The normal `npm run check` intentionally does not run `contracts:check` yet.
ROZ-59 must first provide committed, immutable Core and Identity OpenAPI input
locations. Once those artifacts exist, wire their exact locations into CI and
make the drift gate mandatory before marking ROZ-39 complete.

The pinned generator currently declares a TypeScript 5 peer range, while this
project uses TypeScript 6. The repository-local npm configuration permits that
single known mismatch; generation tests and the project typecheck verify the
combination. Remove the override when the generator's peer range catches up.
