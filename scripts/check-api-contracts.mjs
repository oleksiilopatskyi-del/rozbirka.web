import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defaultOutputDirectory,
  generateContracts,
  parseArguments,
} from './generate-api-contracts.mjs'

const usage =
  'Usage: npm run contracts:check -- --core <file-or-url> --identity <file-or-url> [--out <directory>]'

async function fileMatches(expectedPath, actualPath) {
  try {
    const [expected, actual] = await Promise.all([
      readFile(expectedPath),
      readFile(actualPath),
    ])
    return expected.equals(actual)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2), usage)
  const committedDirectory = options.outputDirectory ?? defaultOutputDirectory
  const generatedDirectory = await mkdtemp(
    join(tmpdir(), 'rozbirka-contract-check-'),
  )

  try {
    await generateContracts({
      core: options.core,
      identity: options.identity,
      outputDirectory: generatedDirectory,
    })

    const filenames = ['core.ts', 'identity.ts']
    const comparisons = await Promise.all(
      filenames.map(async (filename) => ({
        filename,
        matches: await fileMatches(
          join(committedDirectory, filename),
          join(generatedDirectory, filename),
        ),
      })),
    )
    const changed = comparisons
      .filter(({ matches }) => !matches)
      .map(({ filename }) => filename)

    if (changed.length > 0) {
      throw new Error(`Generated API contract drift: ${changed.join(', ')}`)
    }

    console.log('API contracts are up to date')
  } finally {
    await rm(generatedDirectory, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
