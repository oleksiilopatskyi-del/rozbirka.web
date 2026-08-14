// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const generateScript = join(
  repositoryRoot,
  'scripts/generate-api-contracts.mjs',
)
const checkScript = join(repositoryRoot, 'scripts/check-api-contracts.mjs')
const temporaryDirectories: string[] = []

async function makeTemporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'rozbirka-contract-test-'))
  temporaryDirectories.push(directory)
  return directory
}

async function writeSpecification(
  directory: string,
  name: string,
  title: string,
) {
  const path = join(directory, name)
  await writeFile(
    path,
    JSON.stringify({
      openapi: '3.0.0',
      info: { title, version: '2026-08-13' },
      paths: {},
    }),
  )
  return path
}

async function fixtures() {
  const directory = await makeTemporaryDirectory()
  return {
    directory,
    core: await writeSpecification(directory, 'core-2026-08-13.json', 'Core'),
    identity: await writeSpecification(
      directory,
      'identity-2026-08-13.json',
      'Identity',
    ),
  }
}

async function runScript(script: string, args: string[]) {
  return execFileAsync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
  })
}

async function runScriptFailure(script: string, args: string[]) {
  try {
    await runScript(script, args)
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
  throw new Error('Expected the script to fail')
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('OpenAPI contract CLIs', () => {
  it('requires both explicit Core and Identity inputs', async () => {
    const { core } = await fixtures()

    expect(await runScriptFailure(generateScript, ['--core', core])).toContain(
      '--identity',
    )
    expect(await runScriptFailure(checkScript, ['--identity', core])).toContain(
      '--core',
    )
  })

  it('rejects runtime Swagger URLs without an immutable version or digest', async () => {
    expect(
      await runScriptFailure(generateScript, [
        '--core',
        'https://api.example.test/swagger/v1/swagger.json',
        '--identity',
        'https://identity.example.test/swagger/swagger.json',
      ]),
    ).toContain('immutable version or digest')
  })

  it('generates deterministic Core and Identity contracts into an exact output directory', async () => {
    const { directory, core, identity } = await fixtures()
    const output = join(directory, 'generated output')

    await runScript(generateScript, [
      '--core',
      core,
      '--identity',
      identity,
      '--out',
      output,
    ])

    const coreOutput = await readFile(join(output, 'core.ts'), 'utf8')
    const identityOutput = await readFile(join(output, 'identity.ts'), 'utf8')
    expect(coreOutput).toMatch(
      /^\/\/ Generated from Core OpenAPI input \(sha256:[a-f0-9]{64}\)\. Do not edit\.\n/,
    )
    expect(identityOutput).toMatch(
      /^\/\/ Generated from Identity OpenAPI input \(sha256:[a-f0-9]{64}\)\. Do not edit\.\n/,
    )
    expect(coreOutput).not.toContain('Generated at')
    expect(identityOutput).not.toContain('Generated at')
  })

  it('fails the drift check and reports every differing contract', async () => {
    const { directory, core, identity } = await fixtures()
    const committed = join(directory, 'committed')
    await runScript(generateScript, [
      '--core',
      core,
      '--identity',
      identity,
      '--out',
      committed,
    ])
    await writeFile(join(committed, 'core.ts'), '// stale core\n')
    await writeFile(join(committed, 'identity.ts'), '// stale identity\n')

    expect(
      await runScriptFailure(checkScript, [
        '--core',
        core,
        '--identity',
        identity,
        '--out',
        committed,
      ]),
    ).toContain('core.ts, identity.ts')
    expect(await readFile(join(committed, 'core.ts'), 'utf8')).toBe(
      '// stale core\n',
    )
    expect(await readFile(join(committed, 'identity.ts'), 'utf8')).toBe(
      '// stale identity\n',
    )
  })

  it('passes the drift check when both committed outputs are byte-identical', async () => {
    const { directory, core, identity } = await fixtures()
    const committed = join(directory, 'committed')
    await mkdir(committed)
    await runScript(generateScript, [
      '--core',
      core,
      '--identity',
      identity,
      '--out',
      committed,
    ])

    const { stdout } = await runScript(checkScript, [
      '--core',
      core,
      '--identity',
      identity,
      '--out',
      committed,
    ])
    expect(stdout).toContain('API contracts are up to date')
  })
})
