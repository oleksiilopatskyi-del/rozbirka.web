import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const checker = path.resolve('scripts/check-asset-budget.mjs')
const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((workspace) => rm(workspace, { recursive: true, force: true })),
  )
})

const workspaceWithChunk = async (
  bytes: number,
  options: {
    missingRoute?: string
    preloadRoute?: string
    staticImportRoute?: string
    minifiedNamedImportRoute?: string
    staticBareImport?: string
  } = {},
) => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'rozbirka-budget-'))
  workspaces.push(workspace)
  await mkdir(path.join(workspace, 'dist', 'assets'), { recursive: true })
  const routeChunks = {
    team: 'TeamScreen-fixture.js',
    reports: 'ReportsScreen-fixture.js',
    business: 'business-settings-screen-fixture.js',
  }
  const preloadedRoute = options.preloadRoute
    ? routeChunks[options.preloadRoute as keyof typeof routeChunks]
    : null
  const entryImports = [
    options.staticImportRoute
      ? `import './${routeChunks[options.staticImportRoute as keyof typeof routeChunks]}'`
      : '',
    options.minifiedNamedImportRoute
      ? `import{screen as s}from'./${routeChunks[options.minifiedNamedImportRoute as keyof typeof routeChunks]}'`
      : '',
    options.staticBareImport ? `import '${options.staticBareImport}'` : '',
  ].filter(Boolean)
  await writeFile(
    path.join(workspace, 'dist', 'index.html'),
    `<main></main><script type="module" src="/assets/cabinet.js"></script>${
      preloadedRoute
        ? `<link rel="modulepreload" href="/assets/${preloadedRoute}">`
        : ''
    }`,
  )
  await writeFile(
    path.join(workspace, 'dist', 'assets', 'cabinet.js'),
    entryImports.length > 0 ? entryImports.join('\n') : Buffer.alloc(bytes),
  )
  await Promise.all(
    Object.entries(routeChunks)
      .filter(([route]) => route !== options.missingRoute)
      .map(([, filename]) =>
        writeFile(path.join(workspace, 'dist', 'assets', filename), 'export{}'),
      ),
  )
  return workspace
}

const expectBudgetFailure = async (workspace: string, message: string) => {
  let stderr = ''
  try {
    await execFileAsync(process.execPath, [checker], { cwd: workspace })
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === 'object' &&
      'stderr' in error &&
      typeof error.stderr === 'string'
    ) {
      stderr = error.stderr
    }
  }

  expect(stderr).toContain(message)
}

describe('production asset budget', () => {
  it('accepts a JavaScript route chunk at the 350 KiB boundary', async () => {
    const workspace = await workspaceWithChunk(350 * 1024)

    await expect(
      execFileAsync(process.execPath, [checker], { cwd: workspace }),
    ).resolves.toMatchObject({ stderr: '' })
  })

  it('rejects a JavaScript route chunk above 350 KiB', async () => {
    const workspace = await workspaceWithChunk(350 * 1024 + 1)

    await expectBudgetFailure(workspace, 'exceeds 350 KiB JavaScript budget')
  })

  it('requires every released access screen to remain a separate route chunk', async () => {
    const workspace = await workspaceWithChunk(1, { missingRoute: 'team' })

    await expectBudgetFailure(
      workspace,
      'missing lazy route chunk for released screen: team',
    )
  })

  it('rejects a released access route chunk preloaded by an HTML entry', async () => {
    const workspace = await workspaceWithChunk(1, { preloadRoute: 'reports' })

    await expectBudgetFailure(
      workspace,
      'released route chunk must stay lazy: ReportsScreen-fixture.js',
    )
  })

  it('rejects a released route chunk reached through the static entry import graph', async () => {
    const workspace = await workspaceWithChunk(1, {
      staticImportRoute: 'business',
    })

    await expectBudgetFailure(
      workspace,
      'released route chunk must stay lazy: business-settings-screen-fixture.js',
    )
  })

  it('follows minified named imports in the static entry graph', async () => {
    const workspace = await workspaceWithChunk(1, {
      minifiedNamedImportRoute: 'team',
    })

    await expectBudgetFailure(
      workspace,
      'released route chunk must stay lazy: TeamScreen-fixture.js',
    )
  })

  it('ignores bare imports that are not emitted JavaScript files', async () => {
    const workspace = await workspaceWithChunk(1, {
      staticBareImport: 'react-router/dom',
    })

    await expect(
      execFileAsync(process.execPath, [checker], { cwd: workspace }),
    ).resolves.toMatchObject({ stderr: '' })
  })
})
