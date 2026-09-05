import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const sha256Pattern = /^[0-9a-f]{64}$/
const sourceDefinitions = {
  core: {
    label: 'Core',
    filename: 'core.json',
    uriPattern:
      /^gs:\/\/rozbirka-ci-openapi-contracts\/core\/[0-9a-f]{40}\/rozbirka-core\.json$/,
  },
  identity: {
    label: 'Identity',
    filename: 'identity.json',
    uriPattern:
      /^gs:\/\/rozbirka-ci-openapi-contracts\/identity\/[0-9a-f]{40}\/rozbirka-identity\.json$/,
  },
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`)
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
}

export function parseManifest(contents) {
  let parsed
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error('OpenAPI source manifest must be valid JSON')
  }

  assertObject(parsed, 'OpenAPI source manifest')
  assertExactKeys(
    parsed,
    ['version', 'core', 'identity'],
    'OpenAPI source manifest',
  )
  if (parsed.version !== 1) {
    throw new Error('OpenAPI source manifest version must equal 1')
  }

  for (const [key, definition] of Object.entries(sourceDefinitions)) {
    const source = parsed[key]
    assertObject(source, `${definition.label} source`)
    assertExactKeys(source, ['uri', 'sha256'], `${definition.label} source`)
    if (
      typeof source.uri !== 'string' ||
      !definition.uriPattern.test(source.uri)
    ) {
      throw new Error(
        `${definition.label} source URI must be a commit-addressed gs:// path in rozbirka-ci-openapi-contracts`,
      )
    }
    if (
      typeof source.sha256 !== 'string' ||
      !sha256Pattern.test(source.sha256)
    ) {
      throw new Error(
        `${definition.label} source digest must be a 64-character lowercase SHA-256`,
      )
    }
  }

  return parsed
}

function digest(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

export async function fetchContracts({
  manifestPath,
  outputDirectory,
  gcloud = 'gcloud',
}) {
  const manifest = parseManifest(await readFile(resolve(manifestPath), 'utf8'))
  const absoluteOutput = resolve(outputDirectory)
  await mkdir(absoluteOutput, { recursive: true })

  const paths = {
    core: resolve(absoluteOutput, sourceDefinitions.core.filename),
    identity: resolve(absoluteOutput, sourceDefinitions.identity.filename),
  }

  try {
    for (const [key, definition] of Object.entries(sourceDefinitions)) {
      const source = manifest[key]
      await execFileAsync(gcloud, ['storage', 'cp', source.uri, paths[key]])
      const contents = await readFile(paths[key])
      const actualDigest = digest(contents)
      if (actualDigest !== source.sha256) {
        throw new Error(
          `${definition.label} contract SHA-256 mismatch: expected ${source.sha256}, received ${actualDigest}`,
        )
      }
    }
  } catch (error) {
    await Promise.all(
      Object.values(paths).map((path) => rm(path, { force: true })),
    )
    throw error
  }

  return paths
}

function parseArguments(argumentsToParse) {
  const usage =
    'Usage: node scripts/fetch-api-contracts.mjs --manifest <file> --out <directory>'
  const values = {}
  const supported = new Set(['--manifest', '--out'])
  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const flag = argumentsToParse[index]
    const value = argumentsToParse[index + 1]
    if (
      !supported.has(flag) ||
      !value ||
      value.startsWith('--') ||
      values[flag]
    ) {
      throw new Error(usage)
    }
    values[flag] = value
  }
  if (!values['--manifest'] || !values['--out']) {
    throw new Error(usage)
  }
  return {
    manifestPath: values['--manifest'],
    outputDirectory: values['--out'],
  }
}

async function main() {
  const paths = await fetchContracts(parseArguments(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(paths)}\n`)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
