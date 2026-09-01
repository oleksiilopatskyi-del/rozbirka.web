# Private OpenAPI Contract Artifacts Design

**Date:** 2026-09-01  
**Scope:** `rozbirka.core`, `rozbirka.identity`, `rozbirka.web`, and `rozbirka-platform`  
**Status:** Proposed

## Problem

Web contract drift checks need immutable Core and Identity OpenAPI documents. The source repositories are private, so commit-pinned `raw.githubusercontent.com` URLs return `404` without GitHub credentials. Making those documents public would also expose the API structure. The current Web deployment workflow therefore has no usable values for `CORE_OPENAPI_IMMUTABLE_URL` and `IDENTITY_OPENAPI_IMMUTABLE_URL`.

The solution must keep the documents private, make each consumed version reviewable and immutable, use the existing GitHub Actions-to-GCP Workload Identity Federation (WIF) trust path, and fail CI before deployment when a contract is missing or changed unexpectedly.

## Goals

- Store Core and Identity OpenAPI artifacts privately in GCP.
- Address every artifact by the full source commit SHA.
- Authenticate GitHub Actions without long-lived GCP keys.
- Give publishers only create access and Web only read access.
- Make the exact backend contract revisions consumed by Web visible in Git review.
- Reject overwrite attempts and digest mismatches.
- Keep local contract generation/checking available without requiring GCP access.

## Non-goals

- Deploying services or Web from this change.
- Merging Core, Identity, Web, or Platform pull requests.
- Publishing arbitrary build artifacts.
- Replacing the existing GCP WIF pool/provider.
- Exposing API schemas publicly.

## Options Considered

### Public-read GCS bucket

This is operationally simple, but anyone with an object URL could inspect the API structure. It does not meet the chosen confidentiality requirement.

### Private GitHub raw URLs with a token

This keeps artifacts in GitHub but introduces a cross-repository GitHub token, its rotation, and broader repository permissions. It also couples the Web build to GitHub content authentication. This option is rejected.

### Private GCS with GCP WIF

This reuses the repositories' existing keyless GCP authentication, permits narrowly scoped IAM, and separates release artifacts from source access. This is the selected design.

## Architecture

### Storage

Create a dedicated bucket in the `rozbirka-ci` project. The proposed bucket name is `rozbirka-openapi-contracts`; the final globally unique name is an explicit Terraform input because GCS bucket names are global.

Bucket controls:

- uniform bucket-level access;
- public access prevention enforced;
- object versioning enabled as defense in depth;
- `force_destroy = false`;
- no public IAM members;
- no automatic deletion lifecycle;
- standard encryption at rest managed by Google unless the platform owner later requires CMEK.

Objects use full Git commit SHAs:

```text
gs://<bucket>/core/<40-character-commit-sha>/rozbirka-core.json
gs://<bucket>/identity/<40-character-commit-sha>/rozbirka-identity.json
```

Publication uses an object creation precondition equivalent to `ifGenerationMatch=0`. A second upload to the same path must fail. Publisher identities receive no delete permission, so a normal workflow cannot replace or remove an existing contract.

No retention-policy lock is enabled initially. A locked policy is difficult to reverse and is unnecessary when IAM and creation preconditions already enforce the required workflow invariant.

### Identities and IAM

Reuse the existing GitHub Actions WIF pool/provider, but use three dedicated service accounts:

- Core contract publisher: object creation permission only;
- Identity contract publisher: object creation permission only;
- Web contract reader: object read permission only.

Each repository keeps the established `GCP_WIF_PROVIDER`. Contract workflows use dedicated service-account secrets: `GCP_CONTRACT_PUBLISHER_SERVICE_ACCOUNT` in Core and Identity and `GCP_CONTRACT_READER_SERVICE_ACCOUNT` in Web. The existing deployment secret `GCP_CI_SERVICE_ACCOUNT` is unchanged so Docker and Cloud Run permissions continue to work. Publisher WIF impersonation is bound to the exact GitHub OIDC subject for that repository's `develop` ref; changing workflow triggers cannot widen it.

The publisher role must not include object deletion or overwrite. If platform policy requires prefix separation beyond distinct service accounts, conditional IAM bindings restrict Core to `/core/` and Identity to `/identity/`. Web receives `storage.objects.get` for both prefixes; list permission is not required by the normal build path.

### Publication workflow

Core and Identity each add a contract publication workflow that:

1. runs only after the repository's OpenAPI generation/currentness checks pass;
2. authenticates to GCP through WIF;
3. derives the full contract-source commit SHA with `git log -1 --format=%H -- <canonical-contract-file>` from a full-history checkout;
4. computes and records SHA-256 for the generated JSON;
5. creates the commit-addressed object with the no-overwrite precondition and relies on GCS transfer-integrity validation;
6. emits the immutable `gs://` URI and locally computed SHA-256 in the workflow summary.

Automatic publication occurs only from trusted `develop` pushes, not from pull-request or tag code. Manual dispatch is also accepted only when the selected ref is `develop`. This restriction is enforced both by the workflow and the publisher service account's exact WIF subject binding. The object path uses the commit that last changed the canonical contract rather than the merge commit, so Web can pin the reviewed contract revision before the backend merge.

Consequently, the normal dependency order is: merge a reviewed backend contract to `develop`, publish it, then point the Web change at that artifact. Web cannot claim release readiness against an unpublished backend PR commit.

### Web source manifest

Replace out-of-band repository URL variables with a versioned manifest committed to Web, for example `contracts/openapi-sources.json`:

```json
{
  "version": 1,
  "core": {
    "uri": "gs://<bucket>/core/<full-commit-sha>/rozbirka-core.json",
    "sha256": "<64-lowercase-hex>"
  },
  "identity": {
    "uri": "gs://<bucket>/identity/<full-commit-sha>/rozbirka-identity.json",
    "sha256": "<64-lowercase-hex>"
  }
}
```

The manifest makes a contract upgrade part of the Web code review and removes mutable repository-variable state from the dependency definition.

The Web deployment workflow authenticates through WIF using the read-only service account, downloads the two exact objects into the runner's temporary directory, verifies both SHA-256 values, and passes the resulting local paths to the existing contract currentness command. The generator remains able to consume explicitly supplied local files for developer workflows and tests.

The old `CORE_OPENAPI_IMMUTABLE_URL` and `IDENTITY_OPENAPI_IMMUTABLE_URL` inputs are removed after the manifest-backed path is verified.

## Failure Behaviour

The contract gate fails closed before build/deployment when:

- WIF authentication or service-account impersonation fails;
- an object does not exist or is inaccessible;
- a URI is not a supported `gs://` commit-addressed path;
- the downloaded SHA-256 differs from the manifest;
- generated Web contract types differ from committed output;
- a publisher attempts to create an already existing object.

Logs must not print access tokens. The immutable URI and non-secret digest may be printed.

## Delivery Sequence

1. Add the private bucket, service accounts, and least-privilege IAM to `rozbirka-platform`; review the Terraform plan and apply it through the normal platform process.
2. Update Core and Identity WIF service-account configuration and add publication workflows.
3. Merge reviewed backend contract changes to `develop` and publish their commit-addressed artifacts.
4. Add the Web source manifest and authenticated fetch/check flow, then regenerate contracts from the published artifacts.
5. Run combined review and verification: Terraform validation/plan, backend tests and OpenAPI checks, Web unit tests, contract tests, integration tests, typecheck, lint, and production-equivalent build.
6. Only after those gates pass, mark the Web PR ready for human review. Deployment and merge remain separate authorized actions.

## Verification

- `terraform fmt -check` and `terraform validate` for the affected Platform environment/module.
- A reviewed Terraform plan proving no public bucket binding and no delete-capable publisher role.
- Core and Identity generation/currentness tests plus workflow syntax validation.
- A publication smoke test showing first creation succeeds and a duplicate path is rejected.
- Web tests for manifest schema, invalid SHA/URI rejection, missing object, and digest mismatch.
- Existing Web `contracts:check` against downloaded local files.
- Web unit, contract, integration, typecheck, lint, and build gates.

## Operational Prerequisite

The local GCP session for `vsobol@rozbirka.com` currently requires interactive re-authentication. Codex can prepare and review Terraform and workflow changes without it, but a live GCP plan/apply or IAM inspection requires the operator to complete `gcloud auth login` (and application-default login if Terraform uses ADC) in an interactive terminal. No credentials are to be copied into chat or committed.
