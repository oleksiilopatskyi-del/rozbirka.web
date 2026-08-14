// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type RequestListener, type Server } from 'node:http'
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
const servers: Server[] = []

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

async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected a loopback TCP address')
  }
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
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

  it.each([
    '/contracts/core.json',
    '/latest/v1.2.3/core.json',
    '/runtime/v1.2.3/core.json',
    '/main/v1.2.3/openapi.json',
    '/v1.2.3/openapi-latest.json',
    '/openapi-main.json?version=1.2.3',
    '/openapi.json?version=1.2.3&latest=true',
    '/v1.2.3/openapi.json?ref=latest',
    '/openapi.json?sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&source=runtime',
    '/swagger/v1/swagger.json',
    '/swagger.json',
    '/openapi.json',
    '/sw%61gger/swagger.json?sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/swagger%2Fswagger.json?sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ])('rejects non-immutable or encoded HTTP input %s', async (path) => {
    const { identity } = await fixtures()
    expect(
      await runScriptFailure(generateScript, [
        '--core',
        `https://api.example.test${path}`,
        '--identity',
        identity,
      ]),
    ).toContain('immutable')
  })

  it('rejects redirects instead of following a versioned URL to mutable content', async () => {
    const { identity } = await fixtures()
    const origin = await serve((_request, response) => {
      response.writeHead(302, { location: '/openapi.json' })
      response.end()
    })

    expect(
      await runScriptFailure(generateScript, [
        '--core',
        `${origin}/v1.2.3/core.json`,
        '--identity',
        identity,
      ]),
    ).toContain('redirects are not allowed')
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
