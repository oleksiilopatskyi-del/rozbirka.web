import { readFile } from 'node:fs/promises'
import {
  parseArguments,
  parseParityYaml,
  renderParityMarkdown,
  validateParityDocument,
} from './generate-parity-matrix.mjs'

const usage =
  'Usage: npm run parity:check -- [--source <yaml>] [--out <markdown>]'

async function main() {
  const options = parseArguments(process.argv.slice(2), usage)
  const source = await readFile(options.sourcePath, 'utf8')
  const expected = renderParityMarkdown(
    validateParityDocument(parseParityYaml(source)),
  )
  let actual
  try {
    actual = await readFile(options.outputPath, 'utf8')
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
      throw error
    }
  }
  if (actual !== expected) {
    throw new Error(`Generated parity matrix drift: ${options.outputPath}`)
  }
  console.log('Parity matrix is up to date')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
