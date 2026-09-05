// @vitest-environment node
/*
 * These tests deliberately mutate unvalidated YAML-shaped values and import a
 * JavaScript validator. Keeping that boundary dynamic is the behavior under
 * test, so the unsafe-value rules are disabled for this test module only.
 */
/* eslint-disable @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/unbound-method */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultOutputPath,
  defaultSourcePath,
  generateParityReport,
  parseParityYaml,
  renderParityMarkdown,
  validateParityDocument,
} from './generate-parity-matrix.mjs'

const temporaryDirectories: string[] = []
const execFileAsync = promisify(execFile)
const repositoryRoot = resolve(import.meta.dirname, '..')
const generateScript = join(
  repositoryRoot,
  'scripts/generate-parity-matrix.mjs',
)
const checkScript = join(repositoryRoot, 'scripts/check-parity-matrix.mjs')

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

const validYaml = `
schemaVersion: 1
audit:
  mobileCommit: 2f0930509b2dbf7293da529ce2e1f225a852dba0
  webCommit: 6aa6d92f443db451aace4875d0afd7dd358e975c
  coreCommit: 46e2d91b371fac24043a5eebaef7a8f75fb3ff08
  identityCommit: b7497a46204cbae0e964bb2cf4d00f91f9d382d0
capabilities:
  - id: dashboard.view
    domain: dashboard
    name: View the business dashboard
    mobile:
      routes:
        - /(tabs)/(home)
      actions:
        - View period metrics
    web:
      outcome: View permission-aware business metrics for a selected period
      route: /cabinet
      disposition: parity
    contract:
      service: core
      status: ready
      operations:
        - GET /api/dashboard
    access:
      permissions:
        - dashboard.view
      tenant: required
      billing: required
    owner: web
    tracking:
      status: existing
      issue: ROZ-106
    evidence:
      - rozbirka.mobile:app/(tabs)/(home)/index.tsx
      - rozbirka.core:src/Rozbirka.API/Controllers/DashboardController.cs
systemCapabilities: []
excludedRoutes: []
`

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('parity matrix generator', () => {
  it('parses a valid source and renders deterministic audit provenance', () => {
    const document = validateParityDocument(parseParityYaml(validYaml))
    const markdown = renderParityMarkdown(document)

    expect(document.schemaVersion).toBe(1)
    expect(markdown).toContain('# Mobile → Web Parity Matrix')
    expect(markdown).toContain('2f0930509b2dbf7293da529ce2e1f225a852dba0')
    expect(markdown).not.toContain('Generated at')
  })

  it('writes a fully rendered report to the requested output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rozbirka-parity-test-'))
    temporaryDirectories.push(directory)
    const sourcePath = join(directory, 'matrix.yaml')
    const outputPath = join(directory, 'matrix.md')
    await writeFile(sourcePath, validYaml)

    await generateParityReport({ sourcePath, outputPath })

    expect(await readFile(outputPath, 'utf8')).toBe(
      renderParityMarkdown(validateParityDocument(parseParityYaml(validYaml))),
    )
  })

  it.each([
    {
      name: 'malformed audit commit',
      mutate(document: any) {
        document.audit.mobileCommit = 'ABC123'
      },
      message: 'audit.mobileCommit: expected a lowercase 40-character Git SHA',
    },
    {
      name: 'duplicate capability id',
      mutate(document: any) {
        document.capabilities.push(structuredClone(document.capabilities[0]))
      },
      message: 'capabilities[1].id: duplicate capability id dashboard.view',
    },
    {
      name: 'missing evidence',
      mutate(document: any) {
        document.capabilities[0].evidence = []
      },
      message: 'capabilities[0].evidence: expected at least one reference',
    },
    {
      name: 'browser-native without equivalent',
      mutate(document: any) {
        document.capabilities[0].web.disposition = 'browser-native'
      },
      message:
        'capabilities[0].web.browserEquivalent: required for browser-native',
    },
    {
      name: 'ready without operations',
      mutate(document: any) {
        delete document.capabilities[0].contract.operations
      },
      message:
        'capabilities[0].contract.operations: required when contract status is ready',
    },
    {
      name: 'partial without notes',
      mutate(document: any) {
        document.capabilities[0].contract.status = 'partial'
      },
      message:
        'capabilities[0].contract.notes: required when contract status is partial',
    },
    {
      name: 'invalid existing issue',
      mutate(document: any) {
        document.capabilities[0].tracking.issue = 'dashboard-ticket'
      },
      message: 'capabilities[0].tracking.issue: expected ROZ-[0-9]+',
    },
    {
      name: 'invalid proposal key',
      mutate(document: any) {
        document.capabilities[0].tracking = {
          status: 'proposed',
          proposalKey: 'Bad Key',
        }
      },
      message:
        'capabilities[0].tracking.proposalKey: expected stable kebab-case key',
    },
  ])('rejects $name', ({ mutate, message }) => {
    const document = structuredClone(parseParityYaml(validYaml))
    mutate(document)

    expect(() => validateParityDocument(document)).toThrow(message)
  })

  it.each([
    ['domain', 'unknown-domain', 'capabilities[0].domain: unsupported value'],
    [
      'web.disposition',
      'native-copy',
      'capabilities[0].web.disposition: unsupported value',
    ],
    [
      'contract.service',
      'mobile',
      'capabilities[0].contract.service: unsupported value',
    ],
    [
      'contract.status',
      'mostly-ready',
      'capabilities[0].contract.status: unsupported value',
    ],
    ['owner', 'product', 'capabilities[0].owner: unsupported value'],
    [
      'tracking.status',
      'planned',
      'capabilities[0].tracking.status: unsupported value',
    ],
  ])('rejects unsupported %s', (path, value, message) => {
    const document: any = structuredClone(parseParityYaml(validYaml))
    const segments = path.split('.')
    let target = document.capabilities[0]
    for (const segment of segments.slice(0, -1)) target = target[segment]
    target[segments.at(-1)!] = value

    expect(() => validateParityDocument(document)).toThrow(message)
  })

  it('rejects not-applicable contracts owned by a service', () => {
    const document: any = structuredClone(parseParityYaml(validYaml))
    document.capabilities[0].contract = {
      service: 'core',
      status: 'not-applicable',
    }

    expect(() => validateParityDocument(document)).toThrow(
      'capabilities[0].contract.service: expected none when contract status is not-applicable',
    )
  })

  it('rejects contradictory tracking fields', () => {
    const document: any = structuredClone(parseParityYaml(validYaml))
    document.capabilities[0].tracking.proposalKey = 'dashboard-gap'

    expect(() => validateParityDocument(document)).toThrow(
      'capabilities[0].tracking.proposalKey: not allowed when tracking status is existing',
    )
  })

  it('rejects duplicate proposal keys across sections', () => {
    const document: any = structuredClone(parseParityYaml(validYaml))
    document.capabilities[0].tracking = {
      status: 'proposed',
      proposalKey: 'shared-gap',
    }
    document.systemCapabilities.push({
      id: 'session.refresh',
      domain: 'auth',
      name: 'Refresh an authenticated session',
      trigger: 'An access token expires',
      mobileBehavior: 'Coordinates one refresh request',
      webOutcome: 'Keeps the session active without duplicate refreshes',
      contract: {
        service: 'identity',
        status: 'partial',
        operations: ['POST /auth/refresh'],
        notes: 'The immutable Identity contract is pending',
      },
      access: {
        permissions: ['authenticated'],
        tenant: 'not-applicable',
        billing: 'not-applicable',
      },
      owner: 'identity',
      tracking: { status: 'proposed', proposalKey: 'shared-gap' },
      evidence: ['rozbirka.mobile:src/session/authRefreshCoordinator.ts'],
    })

    expect(() => validateParityDocument(document)).toThrow(
      'systemCapabilities[0].tracking.proposalKey: duplicate proposal key shared-gap',
    )
  })

  it('rejects exclusions without rationale and duplicate routes', () => {
    const document: any = structuredClone(parseParityYaml(validYaml))
    const exclusion = {
      route: '/legacy-sale',
      classification: 'obsolete',
      reason: '',
      evidence: ['rozbirka.mobile:src/api/sales.ts'],
      webReplacement: '/cabinet/orders/new',
    }
    document.excludedRoutes.push(exclusion, {
      ...exclusion,
      reason: 'Canonical Orders replaces direct sale',
    })

    expect(() => validateParityDocument(document)).toThrow(
      'excludedRoutes[0].reason: expected non-empty text',
    )

    document.excludedRoutes[0].reason = 'Canonical Orders replaces direct sale'
    expect(() => validateParityDocument(document)).toThrow(
      'excludedRoutes[1].route: duplicate excluded route /legacy-sale',
    )
  })

  it('rejects unknown keys that could hide misspelled evidence', () => {
    const document: any = structuredClone(parseParityYaml(validYaml))
    document.capabilities[0].evidnce = document.capabilities[0].evidence

    expect(() => validateParityDocument(document)).toThrow(
      'capabilities[0].evidnce: unknown field',
    )
  })

  it('generates a report through the CLI with explicit paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rozbirka-parity-cli-'))
    temporaryDirectories.push(directory)
    const source = join(directory, 'source.yaml')
    const output = join(directory, 'output.md')
    await writeFile(source, validYaml)

    const { stdout } = await runScript(generateScript, [
      '--source',
      source,
      '--out',
      output,
    ])

    expect(stdout).toContain(`Generated parity matrix at ${output}`)
    expect(await readFile(output, 'utf8')).toBe(
      renderParityMarkdown(validateParityDocument(parseParityYaml(validYaml))),
    )
  })

  it('rejects unsupported CLI arguments with usage guidance', async () => {
    expect(
      await runScriptFailure(generateScript, ['--matrix', 'source.yaml']),
    ).toContain(
      'Usage: npm run parity:generate -- [--source <yaml>] [--out <markdown>]',
    )
  })

  it('passes the read-only checker for byte-identical output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rozbirka-parity-check-'))
    temporaryDirectories.push(directory)
    const source = join(directory, 'source.yaml')
    const output = join(directory, 'output.md')
    await writeFile(source, validYaml)
    await generateParityReport({ sourcePath: source, outputPath: output })

    const { stdout } = await runScript(checkScript, [
      '--source',
      source,
      '--out',
      output,
    ])

    expect(stdout).toContain('Parity matrix is up to date')
  })

  it('reports drift without modifying stale output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rozbirka-parity-drift-'))
    temporaryDirectories.push(directory)
    const source = join(directory, 'source.yaml')
    const output = join(directory, 'output.md')
    await writeFile(source, validYaml)
    await writeFile(output, '# stale report\n')

    expect(
      await runScriptFailure(checkScript, [
        '--source',
        source,
        '--out',
        output,
      ]),
    ).toContain(`Generated parity matrix drift: ${output}`)
    expect(await readFile(output, 'utf8')).toBe('# stale report\n')
  })

  it('leaves existing output untouched when YAML is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rozbirka-parity-invalid-'))
    temporaryDirectories.push(directory)
    const source = join(directory, 'source.yaml')
    const output = join(directory, 'output.md')
    await writeFile(source, 'schemaVersion: [invalid')
    await writeFile(output, '# preserved report\n')

    expect(
      await runScriptFailure(generateScript, [
        '--source',
        source,
        '--out',
        output,
      ]),
    ).toContain(
      'Flow sequence in block collection must be sufficiently indented',
    )
    expect(await readFile(output, 'utf8')).toBe('# preserved report\n')
  })

  it('keeps the committed report byte-identical to its pinned audit source', async () => {
    const source = await readFile(defaultSourcePath, 'utf8')
    const document = validateParityDocument(parseParityYaml(source))
    const output = await readFile(defaultOutputPath, 'utf8')

    expect(document.audit).toEqual({
      mobileCommit: '2f0930509b2dbf7293da529ce2e1f225a852dba0',
      webCommit: '6aa6d92f443db451aace4875d0afd7dd358e975c',
      coreCommit: '46e2d91b371fac24043a5eebaef7a8f75fb3ff08',
      identityCommit: 'b7497a46204cbae0e964bb2cf4d00f91f9d382d0',
    })
    expect(document.capabilities.length).toBeGreaterThan(0)
    expect(document.systemCapabilities.length).toBeGreaterThan(0)
    expect(document.excludedRoutes.length).toBeGreaterThan(0)
    type DashboardCapability = {
      id: string
      domain: string
      web: { route: string }
      tracking: { status: string; issue?: string }
    }
    expect(
      (document.capabilities as DashboardCapability[])
        .filter(
          ({ domain, tracking }) =>
            domain === 'dashboard' &&
            tracking.status === 'existing' &&
            tracking.issue === 'ROZ-106',
        )
        .map(({ id, web }) => ({ id, route: web.route })),
    ).toEqual([
      {
        id: 'dashboard.summary.view',
        route: '/app/:tenant/dashboard',
      },
      {
        id: 'dashboard.analytics.view',
        route: '/app/:tenant/dashboard?period=week',
      },
      {
        id: 'dashboard.navigation.use',
        route: '/app/:tenant/dashboard',
      },
    ])
    expect(
      new Set(
        [...document.capabilities, ...document.systemCapabilities].map(
          ({ domain }) => domain,
        ),
      ),
    ).toEqual(
      new Set([
        'auth',
        'billing',
        'cars',
        'cash',
        'customers',
        'dashboard',
        'intake',
        'inventory',
        'orders',
        'parts',
        'profile',
        'reports',
        'scanning',
        'team',
      ]),
    )

    type TrackedEntry = {
      tracking:
        | { status: 'existing'; issue: string }
        | { status: 'proposed'; proposalKey: string }
    }
    const trackedEntries: TrackedEntry[] = [
      ...document.capabilities,
      ...document.systemCapabilities,
      ...document.excludedRoutes.filter(
        (entry: { tracking?: TrackedEntry['tracking'] }) => entry.tracking,
      ),
    ]
    for (const { tracking } of trackedEntries) {
      const reference =
        tracking.status === 'existing' ? tracking.issue : tracking.proposalKey
      expect(output).toContain(reference)
    }

    expect(output).toBe(renderParityMarkdown(document))
    expect(output).not.toMatch(/\/Users\/|[A-Z]:\\/)
    expect(output).not.toContain('Generated at')
    expect(output).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })
})
