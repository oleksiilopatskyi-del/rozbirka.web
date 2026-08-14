import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const script = resolve('scripts/check-deploy-artifact.mjs')
const temporaryDirectories: string[] = []

const runCheck = (environment: 'qa' | 'production', contents: string) => {
  const cwd = mkdtempSync(join(tmpdir(), 'rozbirka-web-artifact-'))
  temporaryDirectories.push(cwd)
  mkdirSync(join(cwd, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(cwd, 'dist', 'assets', 'app.js'), contents)

  try {
    return {
      status: 0,
      output: execFileSync(process.execPath, [script, environment], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    }
  } catch (error) {
    const failure = error as { status: number; stdout: string; stderr: string }
    return {
      status: failure.status,
      output: `${failure.stdout}${failure.stderr}`,
    }
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('deployment artifact environment gate', () => {
  it('accepts a QA artifact that only targets the QA API', () => {
    const result = runCheck('qa', 'https://qaapi.rozbirka.pro/auth/me')

    expect(result.status).toBe(0)
    expect(result.output).toContain('QA API origin verified')
  })

  it('rejects a QA artifact containing the production API origin', () => {
    const result = runCheck('qa', 'https://api.rozbirka.pro/auth/me')

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('production API origin')
  })

  it('rejects an artifact with no expected API origin', () => {
    const result = runCheck('qa', 'const api = window.location.origin')

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('QA API origin was not found')
  })

  it('rejects a production artifact containing the QA API origin', () => {
    const result = runCheck('production', 'https://qaapi.rozbirka.pro/auth/me')

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('QA API origin')
  })
})
