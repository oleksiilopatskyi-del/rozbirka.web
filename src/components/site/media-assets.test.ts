// @vitest-environment node
/// <reference types="node" />
import { readFile, readdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('production media contract', () => {
  it('uses the approved anonymized CTA phone artwork', async () => {
    const artwork = await readFile(path.join(root, 'src/assets/cta-phones.png'))
    expect(createHash('sha256').update(artwork).digest('hex')).toBe(
      '488e7ff94e33d8bf8e89cfb551977206fcca0a608125812d1d98ff2dc5bd49bd',
    )
  })

  it('does not import legacy heavy media from production components', async () => {
    const files = [
      'src/components/site/hero.tsx',
      'src/components/site/features.tsx',
      'src/components/site/cta-banner.tsx',
    ]
    const source = (
      await Promise.all(
        files.map((file) => readFile(path.join(root, file), 'utf8')),
      )
    ).join('\n')
    expect(source).not.toMatch(
      /phone pc\.png|cta-phones\.png|features\/.+\.svg/,
    )
  })

  it('keeps every optimized key image at or below 500 KB', async () => {
    const base = path.join(root, 'src/assets/optimized')
    const directories = ['hero', 'cta', 'features']
    const files = (
      await Promise.all(
        directories.map(async (directory) =>
          (await readdir(path.join(base, directory))).map((file) =>
            path.join(base, directory, file),
          ),
        ),
      )
    ).flat()
    expect(files.length).toBeGreaterThanOrEqual(24)
    for (const file of files) {
      expect((await stat(file)).size, file).toBeLessThanOrEqual(500 * 1024)
    }
  })
})
