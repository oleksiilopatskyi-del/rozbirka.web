import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const generatorCli = join(
  repositoryRoot,
  'node_modules/openapi-typescript/bin/cli.js',
)

export const defaultOutputDirectory = join(repositoryRoot, 'src/api/generated')

function usage() {
  return 'Usage: npm run contracts:generate -- --core <file-or-url> --identity <file-or-url> [--out <directory>]'
}

export function parseArguments(argumentsToParse, commandUsage = usage()) {
  const values = {}
  const supported = new Set(['--core', '--identity', '--out'])

  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const flag = argumentsToParse[index]
    const value = argumentsToParse[index + 1]

    if (!supported.has(flag) || !value || value.startsWith('--')) {
      throw new Error(commandUsage)
    }
    if (values[flag]) {
      throw new Error(
        `Argument ${flag} may be provided only once. ${commandUsage}`,
      )
    }
    values[flag] = value
  }

  if (!values['--core']) {
    throw new Error(`Missing required argument --core. ${commandUsage}`)
  }
  if (!values['--identity']) {
    throw new Error(`Missing required argument --identity. ${commandUsage}`)
  }

  return {
    core: values['--core'],
    identity: values['--identity'],
    outputDirectory: values['--out']
      ? resolve(values['--out'])
      : defaultOutputDirectory,
  }
}

const semanticVersion = /^v?\d+\.\d+\.\d+(?:-[0-9a-z]+(?:\.[0-9a-z]+)*)?$/i
const commitDigest = /^(?:[a-f\d]{40}|[a-f\d]{64})$/i
const sha256Digest = /^[a-f\d]{64}$/i
const mutableAliases = new Set([
  'current',
  'dev',
  'develop',
  'head',
  'latest',
  'main',
  'master',
  'nightly',
  'runtime',
  'snapshot',
])

function hasImmutableIdentifier(url) {
  const pathSegments = url.pathname.split('/').filter(Boolean)
  const pathTokens = url.pathname
    .toLowerCase()
    .split(/[^a-z\d]+/)
    .filter(Boolean)
  if (pathTokens.some((token) => mutableAliases.has(token))) {
    return false
  }

  const pathHasIdentifier = pathSegments.some(
    (segment) => semanticVersion.test(segment) || commitDigest.test(segment),
  )
  const queryEntries = [...url.searchParams.entries()]
  if (pathHasIdentifier) return queryEntries.length === 0

  const rules = {
    commit: commitDigest,
    digest: /^(?:sha256:)?[a-f\d]{64}$/i,
    sha256: sha256Digest,
    version: semanticVersion,
  }
  if (queryEntries.length !== 1) return false
  const [key, value] = queryEntries[0]
  return Object.hasOwn(rules, key) && rules[key].test(value)
}

export function validateInput(input, label) {
  if (!input || input === '-') {
    throw new Error(`${label} input must be an explicit file or HTTP(S) URL`)
  }

  let url
  try {
    url = new URL(input)
  } catch {
    if (/^[a-z][a-z\d+.-]*:/i.test(input)) {
      throw new Error(`${label} input must be an explicit file or HTTP(S) URL`)
    }
    return { kind: 'file', value: resolve(input) }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} input must be an explicit file or HTTP(S) URL`)
  }
  if (
    url.username ||
    url.password ||
    url.hash ||
    /%[a-f\d]{2}/i.test(url.pathname)
  ) {
    throw new Error(
      `${label} HTTP(S) input must use an unencoded path and an immutable identifier`,
    )
  }
  if (!hasImmutableIdentifier(url)) {
    throw new Error(
      `${label} HTTP(S) input must contain an immutable semantic version, commit, or SHA-256 digest`,
    )
  }

  return { kind: 'url', value: url.href }
}

async function loadInput(input, label, workingDirectory) {
  const validated = validateInput(input, label)
  const snapshotPath = join(
    workingDirectory,
    `${label.toLowerCase()}-input.yaml`,
  )

  if (validated.kind === 'file') {
    const contents = await readFile(validated.value)
    await writeFile(snapshotPath, contents)
    return { contents, generatorInput: snapshotPath }
  }

  const response = await fetch(validated.value, { redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${label} input redirects are not allowed`)
  }
  if (!response.ok) {
    throw new Error(
      `${label} input request failed with HTTP ${response.status}`,
    )
  }
  const contents = Buffer.from(await response.arrayBuffer())
  await writeFile(snapshotPath, contents)
  return { contents, generatorInput: snapshotPath }
}

function provenanceHeader(label, contents) {
  const digest = createHash('sha256').update(contents).digest('hex')
  return `// Generated from ${label} OpenAPI input (sha256:${digest}). Do not edit.\n`
}

async function generateOne(label, input, workingDirectory) {
  const { contents, generatorInput } = await loadInput(
    input,
    label,
    workingDirectory,
  )
  const rawOutput = join(workingDirectory, `${label.toLowerCase()}.ts`)

  await execFileAsync(
    process.execPath,
    [generatorCli, generatorInput, '--output', rawOutput],
    {
      cwd: repositoryRoot,
    },
  )

  const generated = await readFile(rawOutput, 'utf8')
  return `${provenanceHeader(label, contents)}${generated}`
}

export async function generateContracts({ core, identity, outputDirectory }) {
  validateInput(core, 'Core')
  validateInput(identity, 'Identity')

  const workingDirectory = await mkdtemp(
    join(tmpdir(), 'rozbirka-contract-generate-'),
  )
  try {
    const coreOutput = await generateOne('Core', core, workingDirectory)
    const identityOutput = await generateOne(
      'Identity',
      identity,
      workingDirectory,
    )

    await mkdir(outputDirectory, { recursive: true })
    await Promise.all([
      writeFile(join(outputDirectory, 'core.ts'), coreOutput),
      writeFile(join(outputDirectory, 'identity.ts'), identityOutput),
    ])
  } finally {
    await rm(workingDirectory, { recursive: true, force: true })
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  await generateContracts(options)
  console.log(`Generated API contracts in ${options.outputDirectory}`)
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
