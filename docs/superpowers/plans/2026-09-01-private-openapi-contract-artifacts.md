# Private OpenAPI Contract Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish immutable private Core and Identity OpenAPI documents to GCS through GCP WIF and make Web verify generated contracts against exact, digest-pinned objects.

**Architecture:** `rozbirka-platform` provisions one private bucket and three repository-specific service accounts. Core and Identity trusted workflows publish commit-addressed objects with a create-only precondition; Web authenticates with its read-only identity, fetches sources declared in a committed manifest, verifies SHA-256, and runs the existing local-file drift checker.

**Tech Stack:** Terraform Google provider, Google Cloud Storage, GCP IAM/WIF, GitHub Actions, Bash, Node.js 22, Vitest, .NET 10.

**Spec:** `docs/superpowers/specs/2026-09-01-private-openapi-contract-artifacts-design.md`

## Global Constraints

- Bucket name is `rozbirka-ci-openapi-contracts` in project `rozbirka-ci`, region `europe-west1`.
- Uniform bucket-level access and public access prevention are enforced.
- Versioning is enabled, `force_destroy = false`, and no lifecycle deletion is configured.
- Object paths contain a lowercase 40-character Git SHA: `core/<sha>/rozbirka-core.json` and `identity/<sha>/rozbirka-identity.json`.
- Publishers have create-only access and use `--if-generation-match=0`; Web has read-only access.
- WIF impersonation is restricted by `attribute.repository` to the exact GitHub repository.
- Automatic publication runs only for trusted `develop` pushes and release tags.
- Web's source URIs and SHA-256 digests are committed and reviewed, never supplied by mutable repository variables.
- Local generation and drift checks continue accepting explicit local files without GCP.
- Do not deploy or merge any repository as part of implementation.
- Preserve unrelated work, including the existing uncommitted `rozbirka-platform/envs/ci/iam.tf` change, by working in an isolated Platform worktree.

---

### Task 1: Provision private artifact storage and identities

**Files:**
- Create: `rozbirka-platform/envs/ci/openapi_contracts.tf`
- Create: `rozbirka-platform/envs/ci/openapi_contracts_test.tftest.hcl`

**Interfaces:**
- Consumes: existing `module.gcs_bucket`, project local `local.project_id`, and managed WIF pool resource `google_iam_workload_identity_pool.github`.
- Produces: bucket `rozbirka-ci-openapi-contracts`; service-account emails `core-contract-publisher@rozbirka-ci.iam.gserviceaccount.com`, `identity-contract-publisher@rozbirka-ci.iam.gserviceaccount.com`, and `web-contract-reader@rozbirka-ci.iam.gserviceaccount.com`.

- [ ] **Step 1: Create an isolated Platform worktree.**

Run:

```bash
git fetch origin
git worktree add .worktrees/private-openapi-contracts -b vsobol/private-openapi-contracts origin/main
```

Expected: the new worktree is clean; the original checkout retains its existing `envs/ci/iam.tf` modification.

- [ ] **Step 2: Write the failing Terraform test.**

Create `envs/ci/openapi_contracts_test.tftest.hcl` with mocked providers and assertions that:

```hcl
assert {
  condition     = module.openapi_contracts.public_access_prevention == "enforced"
  error_message = "OpenAPI contracts must never be public."
}

assert {
  condition     = google_storage_bucket_iam_member.core_contract_creator.role == "roles/storage.objectCreator"
  error_message = "Core publisher must be create-only."
}

assert {
  condition     = google_storage_bucket_iam_member.web_contract_viewer.role == "roles/storage.objectViewer"
  error_message = "Web must be read-only."
}
```

The GCS module must expose `public_access_prevention` as an output so the first assertion tests the rendered resource rather than duplicating input values.

- [ ] **Step 3: Run the test to verify it fails.**

Run: `terraform -chdir=envs/ci init -backend=false && terraform -chdir=envs/ci test`

Expected: FAIL because the module/output and OpenAPI contract resources do not exist.

- [ ] **Step 4: Implement storage, identities, and least-privilege IAM.**

Create `envs/ci/openapi_contracts.tf` with:

```hcl
locals {
  github_repository_principal_prefix = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_owner}"
}

module "openapi_contracts" {
  source        = "../../modules/gcs_bucket"
  name          = "rozbirka-ci-openapi-contracts"
  project_id    = local.project_id
  location      = var.region
  storage_class = "STANDARD"
  versioning    = true
  force_destroy = false
  public_read   = false
  delete_after_days       = null
  noncurrent_version_days = null
}
```

Create the three `google_service_account` resources. Grant Core and Identity `roles/storage.objectCreator`, grant Web `roles/storage.objectViewer`, and grant `roles/iam.workloadIdentityUser` on each service account to these exact members:

```text
${local.github_repository_principal_prefix}/rozbirka.core
${local.github_repository_principal_prefix}/rozbirka.identity
${local.github_repository_principal_prefix}/rozbirka.web
```

Do not add `storage.objectAdmin`, `storage.admin`, delete permissions, or `allUsers`/`allAuthenticatedUsers` bindings.

- [ ] **Step 5: Expose the public-access-prevention output and run validation.**

Add to `modules/gcs_bucket/outputs.tf`:

```hcl
output "public_access_prevention" {
  value = google_storage_bucket.this.public_access_prevention
}
```

Run:

```bash
terraform fmt -recursive
terraform -chdir=envs/ci validate
terraform -chdir=envs/ci test
```

Expected: all commands exit 0.

- [ ] **Step 6: Produce a non-mutating plan when credentials are available.**

Run `gcloud auth application-default login` interactively, then:

```bash
terraform -chdir=envs/ci plan -out=openapi-contracts.tfplan
terraform -chdir=envs/ci show -no-color openapi-contracts.tfplan
```

Expected: one private bucket, three service accounts, create-only/read-only bucket bindings, and three repository-scoped WIF impersonation bindings; no destroys and no public members. Do not apply.

- [ ] **Step 7: Commit Platform changes.**

```bash
git add envs/ci/openapi_contracts.tf envs/ci/openapi_contracts_test.tftest.hcl modules/gcs_bucket/outputs.tf
git commit -m "feat(ci): provision private OpenAPI artifacts"
```

---

### Task 2: Publish the Core contract from trusted revisions

**Files:**
- Create: `rozbirka.core/scripts/publish-openapi.sh`
- Create: `rozbirka.core/tests/Rozbirka.Tests/OpenApi/OpenApiPublishScriptTests.cs`
- Create: `rozbirka.core/.github/workflows/publish-openapi.yml`

**Interfaces:**
- Consumes: `contracts/openapi/v1/rozbirka-core.json`, full commit SHA, bucket name `rozbirka-ci-openapi-contracts`, and existing WIF secrets.
- Produces: `gs://rozbirka-ci-openapi-contracts/core/<sha>/rozbirka-core.json` with SHA-256 metadata and a workflow summary.

- [ ] **Step 1: Write failing script tests.**

Add tests that copy `publish-openapi.sh` into a temporary repository, put a fake `gcloud` executable first on `PATH`, and verify:

```csharp
Assert.Contains("--if-generation-match=0", invocation);
Assert.Contains("core/0123456789abcdef0123456789abcdef01234567/rozbirka-core.json", invocation);
Assert.Contains("sha256=", invocation);
```

Also assert that a short SHA, uppercase SHA, missing artifact, or missing bucket exits non-zero before invoking `gcloud`.

- [ ] **Step 2: Run the targeted test to verify it fails.**

Run: `dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj --filter FullyQualifiedName~OpenApiPublishScriptTests`

Expected: FAIL because the script does not exist.

- [ ] **Step 3: Implement the Core publisher.**

The executable Bash script accepts exactly `--bucket NAME --commit SHA`, validates `^[0-9a-f]{40}$`, runs `scripts/check-openapi.sh`, computes SHA-256 with `shasum -a 256` or `sha256sum`, and executes:

```bash
gcloud storage cp "$ARTIFACT" \
  "gs://$bucket/core/$commit/rozbirka-core.json" \
  --if-generation-match=0 \
  --content-type=application/json \
  --custom-metadata="sha256=$digest,source-commit=$commit"
```

Rely on the successful GCS upload's transport-integrity check, then append the immutable URI and locally computed digest to `$GITHUB_STEP_SUMMARY` when that variable is defined. Do not add read access to the publisher.

- [ ] **Step 4: Run targeted tests and the local currentness check.**

Run:

```bash
dotnet test tests/Rozbirka.Tests/Rozbirka.Tests.csproj --filter FullyQualifiedName~OpenApiPublishScriptTests
scripts/check-openapi.sh
```

Expected: PASS and `Core OpenAPI contract is up to date.`

- [ ] **Step 5: Add the trusted publication workflow.**

Create `.github/workflows/publish-openapi.yml` triggered by `push` to `develop`, tags matching `v*`, and `workflow_dispatch`. Grant only `contents: read` and `id-token: write`. Checkout the exact event SHA, authenticate with `google-github-actions/auth@v2`, install gcloud with `google-github-actions/setup-gcloud@v2`, and run:

```bash
scripts/publish-openapi.sh \
  --bucket rozbirka-ci-openapi-contracts \
  --commit "$(git rev-parse HEAD)"
```

The manual job uses a protected `contract-publish` GitHub environment; PR events are absent.

- [ ] **Step 6: Validate and commit Core changes.**

Run the full Core test/build/currentness gates already used by PR #36, then:

```bash
git add scripts/publish-openapi.sh tests/Rozbirka.Tests/OpenApi/OpenApiPublishScriptTests.cs .github/workflows/publish-openapi.yml
git commit -m "ci(core): publish immutable OpenAPI contract"
```

---

### Task 3: Publish the Identity contract from trusted revisions

**Files:**
- Create: `rozbirka.identity/scripts/publish-openapi.sh`
- Create: `rozbirka.identity/tests/Rozbirka.Identity.Tests/OpenApi/OpenApiPublishScriptTests.cs`
- Create: `rozbirka.identity/.github/workflows/publish-openapi.yml`

**Interfaces:**
- Consumes: `contracts/openapi/v1/rozbirka-identity.json`, full commit SHA, bucket name, and existing WIF secrets.
- Produces: `gs://rozbirka-ci-openapi-contracts/identity/<sha>/rozbirka-identity.json` with SHA-256 metadata and a workflow summary.

- [ ] **Step 1: Write failing Identity publisher tests.**

Mirror the Core test harness but require the exact Identity prefix and filename. Assert that only the public Identity contract is uploaded; `rozbirka-identity-management.json` must never appear in the fake gcloud invocation.

- [ ] **Step 2: Run the targeted test to verify it fails.**

Run the Identity test project filtered to `OpenApiPublishScriptTests`.

Expected: FAIL because `scripts/publish-openapi.sh` does not exist.

- [ ] **Step 3: Implement the Identity publisher.**

Use the same CLI and validation contract as Core. Run `scripts/check-openapi.sh`, calculate the digest of `contracts/openapi/v1/rozbirka-identity.json`, create only:

```text
gs://rozbirka-ci-openapi-contracts/identity/<sha>/rozbirka-identity.json
```

with `--if-generation-match=0`, rely on GCS transfer-integrity validation, and write the URI/local digest to the job summary. Do not add read access to the publisher.

- [ ] **Step 4: Add the trusted Identity publication workflow.**

Use the same trusted triggers, minimal permissions, exact-SHA checkout, WIF authentication, fixed bucket name, and protected `contract-publish` environment as Core. Do not add a pull-request trigger.

- [ ] **Step 5: Verify and commit Identity changes.**

Run targeted publisher tests, `scripts/check-openapi.sh`, and the repository's complete test/build gates. Then:

```bash
git add scripts/publish-openapi.sh tests/Rozbirka.Identity.Tests/OpenApi/OpenApiPublishScriptTests.cs .github/workflows/publish-openapi.yml
git commit -m "ci(identity): publish immutable OpenAPI contract"
```

---

### Task 4: Add digest-pinned private contract fetching to Web

**Files:**
- Create: `rozbirka.web/contracts/openapi-sources.json`
- Create: `rozbirka.web/scripts/fetch-api-contracts.mjs`
- Modify: `rozbirka.web/scripts/api-contracts.test.ts`
- Modify: `rozbirka.web/package.json`
- Modify: `rozbirka.web/.github/workflows/deploy-rozbirka-web.yml`
- Modify: `rozbirka.web/.github/workflows/deploy-node-static-template.yml`
- Regenerate: `rozbirka.web/src/api/generated/core.ts`
- Regenerate: `rozbirka.web/src/api/generated/identity.ts`

**Interfaces:**
- Consumes: manifest schema `{ version: 1, core: { uri, sha256 }, identity: { uri, sha256 } }` and authenticated `gcloud storage cp`.
- Produces: JSON on stdout `{ "core": "/absolute/temp/core.json", "identity": "/absolute/temp/identity.json" }`; downloaded files persist only inside the caller-provided output directory.

- [ ] **Step 1: Write failing manifest and fetcher tests.**

Extend `scripts/api-contracts.test.ts` with cases that verify:

- version must equal integer `1`;
- keys are exactly `version`, `core`, and `identity`;
- URIs match exact bucket/prefix/40-lowercase-SHA/filename shapes;
- SHA-256 is 64 lowercase hexadecimal characters;
- the fake `gcloud storage cp` receives each exact URI and destination;
- downloaded bytes must match the manifest digest;
- missing files and digest mismatches exit non-zero;
- stdout contains only machine-readable JSON and stderr contains diagnostics.

- [ ] **Step 2: Run the contract tooling test to verify it fails.**

Run: `npm run test:contracts -- scripts/api-contracts.test.ts`

Expected: FAIL because `fetch-api-contracts.mjs` and the manifest do not exist.

- [ ] **Step 3: Implement the manifest parser and authenticated fetcher.**

Create `scripts/fetch-api-contracts.mjs` with exported interfaces:

```js
export function parseManifest(contents) // => validated manifest object
export async function fetchContracts({ manifestPath, outputDirectory, gcloud = 'gcloud' })
```

The CLI is:

```text
node scripts/fetch-api-contracts.mjs --manifest contracts/openapi-sources.json --out <directory>
```

Use `execFile` rather than a shell, create the output directory, download Core and Identity to fixed filenames, compute SHA-256 with `node:crypto`, delete a mismatching file, and print the two absolute local paths as JSON.

- [ ] **Step 4: Add the committed source manifest.**

Set Core to commit `7c6fa19597b9f6ff8ef6a3fc4a136bbb75b3c28b` and digest `4cdc8a64bd08ed1f22e3d4466c7cff3c4a3fb32d27fdb03dd858e617fe819521`. Set Identity to commit `db0a142d6fab1ef2441d4a16d9fd8a182e456da6` and digest `5ed38f1514a2f34785fb807e1b14751b74875205b066171f1bdbdf33d544e7cb` under bucket `rozbirka-ci-openapi-contracts`.

- [ ] **Step 5: Run tests and regenerate from locally verified source files.**

Before the GCS objects exist, verify the manifest parser with fake gcloud tests and regenerate using the known local Core/Identity artifact paths:

```bash
npm run contracts:generate -- \
  --core /Users/user/Code/rozbirka/rozbirka.core/.worktrees/roz-102-core-primary/contracts/openapi/v1/rozbirka-core.json \
  --identity /Users/user/Code/rozbirka/.worktrees/roz-103-identity-primary/contracts/openapi/v1/rozbirka-identity.json
npm run test:contracts
```

Expected: tests pass and generated provenance digests equal the manifest values.

- [ ] **Step 6: Authenticate the Web quality job and replace URL inputs.**

In `deploy-rozbirka-web.yml`, remove `core_contract` and `identity_contract`, grant the reusable job `id-token: write`, and pass `GCP_WIF_PROVIDER` plus `GCP_CI_SERVICE_ACCOUNT` through the reusable workflow's secret interface.

In `deploy-node-static-template.yml`, remove both contract inputs, declare the two GCP secrets, grant `quality` `id-token: write`, authenticate/setup gcloud, and replace the drift step with a Bash step that:

```bash
contract_dir="$RUNNER_TEMP/openapi-contracts"
paths_json="$(node scripts/fetch-api-contracts.mjs --manifest contracts/openapi-sources.json --out "$contract_dir")"
core_path="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.core)' "$paths_json")"
identity_path="$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.identity)' "$paths_json")"
npm run contracts:check -- --core "$core_path" --identity "$identity_path"
```

- [ ] **Step 7: Run all Web gates and commit.**

Run:

```bash
npm run check
npm run build:qa
git diff --check
```

Do not run Playwright because the user explicitly excluded it for this delivery. Then:

```bash
git add contracts/openapi-sources.json scripts/fetch-api-contracts.mjs scripts/api-contracts.test.ts package.json .github/workflows/deploy-rozbirka-web.yml .github/workflows/deploy-node-static-template.yml src/api/generated/core.ts src/api/generated/identity.ts
git commit -m "ci(web): verify private immutable API contracts"
```

---

### Task 5: Cross-repository review and operational handoff

**Files:**
- Modify when verification evidence is known: `rozbirka.web/docs/superpowers/specs/2026-09-01-private-openapi-contract-artifacts-design.md`

**Interfaces:**
- Consumes: commits from Tasks 1-4 and successful repository-local verification.
- Produces: review findings, exact operator actions, and release-readiness status without merge or deployment.

- [ ] **Step 1: Review the combined security boundary.**

Inspect the Terraform plan and workflows for public IAM, delete permissions, broad WIF principals, PR-triggered publisher credentials, mutable object paths, token logging, and unchecked downloads. Any finding blocks readiness until fixed and re-tested.

- [ ] **Step 2: Verify live prerequisites without mutating GCP.**

After interactive authentication, confirm the existing WIF pool ID/project number and compare them with Terraform inputs. Confirm that each GitHub repository has `GCP_WIF_PROVIDER`; record that `GCP_CI_SERVICE_ACCOUNT` must be changed to the corresponding Terraform output after Platform apply.

- [ ] **Step 3: Record the operator-only sequence.**

The handoff must state exactly:

1. approve and apply the reviewed Platform plan;
2. update repository `GCP_CI_SERVICE_ACCOUNT` secrets to their dedicated identities;
3. merge Core and Identity backend PRs to `develop`;
4. confirm both publication workflows created the manifest-pinned objects;
5. rerun Web PR checks;
6. request final human review of Web PR #24.

No step authorizes Codex to apply Terraform, update secrets, merge, or deploy unless the user separately requests it.

- [ ] **Step 4: Run final repository verification from clean worktrees.**

Run Terraform formatting/validation/tests, Core full build/tests/currentness, Identity full build/tests/currentness, and Web `npm run check && npm run build:qa`. Run `git status --short` in all four worktrees and explain every remaining change.

- [ ] **Step 5: Push only after review approval.**

Push the Platform, Core, Identity, and Web branches; update the relevant PRs or create a Platform PR. Report commit SHAs and links. Do not merge or deploy.
