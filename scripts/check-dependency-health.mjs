import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const expectedGeneratorVersion = '7.13.0'
const expectedPeerRequirement = '"^5.x" from node_modules/openapi-typescript'

export function validateDependencyReport(report) {
  const dependencies = report?.dependencies
  if (!dependencies || typeof dependencies !== 'object') {
    throw new Error('npm ls did not return a dependency tree')
  }

  const generator = dependencies['openapi-typescript']
  if (generator?.version !== expectedGeneratorVersion) {
    throw new Error(`Expected openapi-typescript@${expectedGeneratorVersion}`)
  }

  const typescript = dependencies.typescript
  if (
    typeof typescript?.version !== 'string' ||
    typescript.invalid !== expectedPeerRequirement
  ) {
    throw new Error('The documented TypeScript peer mismatch changed')
  }

  const expectedProblemPrefix = `invalid: typescript@${typescript.version} `
  const problems = Array.isArray(report.problems) ? report.problems : []
  if (
    problems.length !== 1 ||
    typeof problems[0] !== 'string' ||
    !problems[0].startsWith(expectedProblemPrefix) ||
    !problems[0].replaceAll('\\', '/').endsWith('/node_modules/typescript')
  ) {
    throw new Error(
      `Unexpected npm dependency problems: ${problems.join('; ') || 'none'}`,
    )
  }
}

async function readDependencyReport() {
  const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  try {
    const { stdout } = await execFileAsync(npmExecutable, [
      'ls',
      '--json',
      '--all',
    ])
    return JSON.parse(stdout)
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'stdout' in error &&
      typeof error.stdout === 'string' &&
      error.stdout.trim()
    ) {
      return JSON.parse(error.stdout)
    }
    throw error
  }
}

async function main() {
  const report = await readDependencyReport()
  validateDependencyReport(report)
  console.log(
    'Dependency tree is healthy with the documented openapi-typescript peer mismatch',
  )
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
