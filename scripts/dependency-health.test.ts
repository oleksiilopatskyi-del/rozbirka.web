// @vitest-environment node
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const healthScript = join(repositoryRoot, 'scripts/check-dependency-health.mjs')

it('accepts only the documented openapi-typescript TypeScript peer mismatch', async () => {
  const { stdout } = await execFileAsync(process.execPath, [healthScript], {
    cwd: repositoryRoot,
  })

  expect(stdout).toContain(
    'Dependency tree is healthy with the documented openapi-typescript peer mismatch',
  )
})

describe('dependency report validation', () => {
  it('rejects any additional npm problem', async () => {
    const { validateDependencyReport } =
      await import('./check-dependency-health.mjs')
    const report = {
      problems: [
        'invalid: typescript@6.0.3 /repo/node_modules/typescript',
        'missing: example@1.0.0, required by app@1.0.0',
      ],
      dependencies: {
        'openapi-typescript': { version: '7.13.0' },
        typescript: {
          version: '6.0.3',
          invalid: '"^5.x" from node_modules/openapi-typescript',
        },
      },
    }

    expect(() => validateDependencyReport(report)).toThrow(
      'Unexpected npm dependency problems',
    )
  })

  it('rejects a changed generator version or peer mismatch', async () => {
    const { validateDependencyReport } =
      await import('./check-dependency-health.mjs')
    const report = {
      problems: ['invalid: typescript@6.0.3 /repo/node_modules/typescript'],
      dependencies: {
        'openapi-typescript': { version: '7.13.1' },
        typescript: {
          version: '6.0.3',
          invalid: '"^5.x" from node_modules/openapi-typescript',
        },
      },
    }

    expect(() => validateDependencyReport(report)).toThrow(
      'Expected openapi-typescript@7.13.0',
    )
  })
})
