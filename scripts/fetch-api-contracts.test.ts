// @vitest-environment node
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const fetchScript = join(repositoryRoot, 'scripts/fetch-api-contracts.mjs')
const temporaryDirectories: string[] = []
const commit = '0123456789abcdef0123456789abcdef01234567'

interface ContractSource {
  uri: string
  sha256: string
}
interface ContractManifest {
  version: number
  core: ContractSource
  identity: ContractSource
  unexpected?: boolean
}
interface ManifestOverride {
  version?: number
  core?: Partial<ContractSource>
  identity?: Partial<ContractSource>
  unexpected?: boolean
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'rozbirka-contract-fetch-'))
  temporaryDirectories.push(directory)
  return directory
}

function sha256(contents: string) {
  return createHash('sha256').update(contents).digest('hex')
}

function manifest(coreContents: string, identityContents: string) {
  return {
    version: 1,
    core: {
      uri: `gs://rozbirka-ci-openapi-contracts/core/${commit}/rozbirka-core.json`,
      sha256: sha256(coreContents),
    },
    identity: {
      uri: `gs://rozbirka-ci-openapi-contracts/identity/${commit}/rozbirka-identity.json`,
      sha256: sha256(identityContents),
    },
  }
}

async function fixture() {
  const directory = await temporaryDirectory()
  const fakeBin = join(directory, 'bin')
  const output = join(directory, 'downloaded')
  const coreContents = '{"openapi":"3.0.4","info":{"title":"Core"}}\n'
  const identityContents = '{"openapi":"3.0.4","info":{"title":"Identity"}}\n'
  const coreSource = join(directory, 'core-source.json')
  const identitySource = join(directory, 'identity-source.json')
  const manifestPath = join(directory, 'manifest.json')
  const invocationLog = join(directory, 'gcloud.log')
  await mkdir(fakeBin, { recursive: true })
  await Promise.all([
    writeFile(coreSource, coreContents),
    writeFile(identitySource, identityContents),
    writeFile(
      join(fakeBin, 'gcloud'),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_GCLOUD_LOG"
test "$1" = storage
test "$2" = cp
case "$3" in
  gs://*/core/*/rozbirka-core.json) cp "$FAKE_CORE_SOURCE" "$4" ;;
  gs://*/identity/*/rozbirka-identity.json) cp "$FAKE_IDENTITY_SOURCE" "$4" ;;
  *) exit 22 ;;
esac
`,
    ),
  ])
  await chmod(join(fakeBin, 'gcloud'), 0o700)
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest(coreContents, identityContents), null, 2)}\n`,
  )
  return {
    directory,
    fakeBin,
    output,
    coreContents,
    identityContents,
    coreSource,
    identitySource,
    manifestPath,
    invocationLog,
  }
}

async function runFetch(
  testFixture: Awaited<ReturnType<typeof fixture>>,
  manifestPath = testFixture.manifestPath,
) {
  return execFileAsync(
    process.execPath,
    [fetchScript, '--manifest', manifestPath, '--out', testFixture.output],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        PATH: `${testFixture.fakeBin}:${process.env.PATH}`,
        FAKE_CORE_SOURCE: testFixture.coreSource,
        FAKE_IDENTITY_SOURCE: testFixture.identitySource,
        FAKE_GCLOUD_LOG: testFixture.invocationLog,
      },
    },
  )
}

async function runFetchFailure(
  testFixture: Awaited<ReturnType<typeof fixture>>,
  manifestPath = testFixture.manifestPath,
) {
  try {
    await runFetch(testFixture, manifestPath)
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
    ) {
      return error.stderr
    }
    throw error
  }
  throw new Error('Expected contract fetch to fail')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('private OpenAPI contract fetcher', () => {
  it('authenticates the develop PR quality gate with a dedicated read-only identity', async () => {
    const caller = await readFile(
      join(repositoryRoot, '.github/workflows/deploy-rozbirka-web.yml'),
      'utf8',
    )
    const reusable = await readFile(
      join(repositoryRoot, '.github/workflows/deploy-node-static-template.yml'),
      'utf8',
    )

    expect(caller).toContain('pull_request:\n    branches:\n      - develop')
    expect(caller).toContain('id-token: write')
    expect(caller).toContain('GCP_WIF_PROVIDER:')
    expect(caller).toContain('GCP_CONTRACT_READER_SERVICE_ACCOUNT:')
    expect(caller).not.toContain('CORE_OPENAPI_IMMUTABLE_URL')
    expect(caller).not.toContain('IDENTITY_OPENAPI_IMMUTABLE_URL')
    expect(reusable).toContain('google-github-actions/auth@v2')
    expect(reusable).toContain('secrets.GCP_CONTRACT_READER_SERVICE_ACCOUNT')
    expect(reusable).toContain('scripts/fetch-api-contracts.mjs')
    expect(reusable).not.toContain('inputs.core_contract')
    expect(reusable).not.toContain('inputs.identity_contract')
  })

  it('downloads exact GCS objects and emits only verified local paths as JSON', async () => {
    const testFixture = await fixture()

    const { stdout, stderr } = await runFetch(testFixture)

    expect(stderr).toBe('')
    const paths = JSON.parse(stdout) as { core: string; identity: string }
    expect(paths).toEqual({
      core: resolve(testFixture.output, 'core.json'),
      identity: resolve(testFixture.output, 'identity.json'),
    })
    expect(await readFile(paths.core, 'utf8')).toBe(testFixture.coreContents)
    expect(await readFile(paths.identity, 'utf8')).toBe(
      testFixture.identityContents,
    )
    const invocations = await readFile(testFixture.invocationLog, 'utf8')
    expect(invocations).toContain(
      `storage cp gs://rozbirka-ci-openapi-contracts/core/${commit}/rozbirka-core.json`,
    )
    expect(invocations).toContain(
      `storage cp gs://rozbirka-ci-openapi-contracts/identity/${commit}/rozbirka-identity.json`,
    )
  })

  it.each([
    ['unsupported version', { version: 2 }, 'version'],
    [
      'public URL',
      { core: { uri: 'https://example.test/core.json' } },
      'commit-addressed gs://',
    ],
    [
      'uppercase commit',
      {
        core: {
          uri: 'gs://rozbirka-ci-openapi-contracts/core/0123456789ABCDEF0123456789ABCDEF01234567/rozbirka-core.json',
        },
      },
      'commit-addressed gs://',
    ],
    ['extra root key', { unexpected: true }, 'exactly'],
    [
      'invalid digest',
      { identity: { sha256: 'abc' } },
      '64-character lowercase SHA-256',
    ],
  ])('rejects %s before invoking gcloud', async (_name, override, message) => {
    const testFixture = await fixture()
    const original = JSON.parse(
      await readFile(testFixture.manifestPath, 'utf8'),
    ) as ContractManifest
    const manifestOverride = override as ManifestOverride
    const modified = {
      ...original,
      ...manifestOverride,
      core: { ...original.core, ...manifestOverride.core },
      identity: {
        ...original.identity,
        ...manifestOverride.identity,
      },
    }
    await writeFile(testFixture.manifestPath, JSON.stringify(modified))

    expect(await runFetchFailure(testFixture)).toContain(message)
    await expect(stat(testFixture.invocationLog)).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('removes a downloaded contract when its digest does not match', async () => {
    const testFixture = await fixture()
    const parsed = JSON.parse(
      await readFile(testFixture.manifestPath, 'utf8'),
    ) as ContractManifest
    parsed.core.sha256 = '0'.repeat(64)
    await writeFile(testFixture.manifestPath, JSON.stringify(parsed))

    expect(await runFetchFailure(testFixture)).toContain(
      'Core contract SHA-256 mismatch',
    )
    await expect(
      stat(join(testFixture.output, 'core.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
