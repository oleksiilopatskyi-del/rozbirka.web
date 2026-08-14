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

function isImmutableSwaggerUrl(url) {
  const immutablePathPart =
    /(?:^|\/)(?:v?\d+\.\d+(?:\.\d+)?|\d{4}-\d{2}-\d{2}|[a-f\d]{7,64})(?:\/|$)/i
  if (immutablePathPart.test(url.pathname)) return true

  for (const key of [
    'version',
    'v',
    'digest',
    'sha',
    'sha256',
    'commit',
    'revision',
    'ref',
  ]) {
    const value = url.searchParams.get(key)
    if (
      value &&
      /^(?:v?\d+\.\d+(?:\.\d+)?|\d{4}-\d{2}-\d{2}|[a-f\d]{7,64})$/i.test(value)
    ) {
      return true
    }
  }

  return false
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
  if (/\/swagger(?:\/|$)/i.test(url.pathname) && !isImmutableSwaggerUrl(url)) {
    throw new Error(
      `${label} Swagger URL must contain an immutable version or digest`,
    )
  }

  return { kind: 'url', value: url.href }
}

async function loadInput(input, label, workingDirectory) {
  const validated = validateInput(input, label)

  if (validated.kind === 'file') {
    const contents = await readFile(validated.value)
    return { contents, generatorInput: validated.value }
  }

  const response = await fetch(validated.value)
  if (!response.ok) {
    throw new Error(
      `${label} input request failed with HTTP ${response.status}`,
    )
  }
  const contents = Buffer.from(await response.arrayBuffer())
  const downloadedPath = join(workingDirectory, `${label.toLowerCase()}-input`)
  await writeFile(downloadedPath, contents)
  return { contents, generatorInput: downloadedPath }
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
