// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  generateParityReport,
  parseParityYaml,
  renderParityMarkdown,
  validateParityDocument,
} from './generate-parity-matrix.mjs'

const temporaryDirectories: string[] = []

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
})
