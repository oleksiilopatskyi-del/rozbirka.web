// @vitest-environment node
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeFeatureSvg,
  updateFeatureScreens,
} from './feature-screen-composer.mjs'

describe('feature screenshot composer', () => {
  it('replaces only the two phone screens and preserves the frame geometry', () => {
    const source = [
      '<svg viewBox="0 0 363 346">',
      '<rect x="30" y="117" width="303" height="195"/>',
      '<image id="back" width="1290" height="2796" preserveAspectRatio="none" xlink:href="data:image/png;base64,T0xEX0JBQ0s="/>',
      '<image id="frame" width="364" height="750" preserveAspectRatio="none" xlink:href="data:image/png;base64,RlJBTUU="/>',
      '<image id="front" width="1290" height="2796" preserveAspectRatio="none" xlink:href="data:image/png;base64,T0xEX0ZST05U"/>',
      '</svg>',
    ].join('')

    const result = composeFeatureSvg(
      source,
      Buffer.from('new-back-screen'),
      Buffer.from('new-front-screen'),
    )

    expect(result).toContain(
      'xlink:href="data:image/png;base64,bmV3LWJhY2stc2NyZWVu"',
    )
    expect(result).toContain(
      'xlink:href="data:image/png;base64,bmV3LWZyb250LXNjcmVlbg=="',
    )
    expect(result).toContain(
      '<image id="frame" width="364" height="750" preserveAspectRatio="none" xlink:href="data:image/png;base64,RlJBTUU="/>',
    )
    expect(result).toContain('<rect x="30" y="117" width="303" height="195"/>')
  })

  it('updates every feature that displays business data from test screenshots', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'feature-screens-'))
    const screensDirectory = path.join(root, 'src/assets/feature-screens')
    const featuresDirectory = path.join(root, 'src/assets/features')
    await Promise.all([
      mkdir(screensDirectory, { recursive: true }),
      mkdir(featuresDirectory, { recursive: true }),
    ])

    const screenPlan = {
      avto: ['avto-list.png', 'avto-detail.png'],
      intake: ['intake-list.png', 'intake-detail.png'],
      parts: ['parts-list.png', 'parts-detail.png'],
      stickers: ['stickers-list.png', 'stickers-detail.png'],
      orders: ['orders-list.png', 'orders-detail.png'],
      customers: ['customers-list.png', 'customers-detail.png'],
      cash: ['cash-list.png', 'cash-detail.png'],
      team: ['team-list.png', 'team-detail.png'],
    }
    const template = [
      '<svg>',
      '<image width="1290" height="2796" xlink:href="data:image/png;base64,T0xEX0JBQ0s="/>',
      '<image width="364" height="750" xlink:href="data:image/png;base64,RlJBTUU="/>',
      '<image width="1290" height="2796" xlink:href="data:image/png;base64,T0xEX0ZST05U"/>',
      '</svg>',
    ].join('')

    for (const [feature, [backName, frontName]] of Object.entries(screenPlan)) {
      await Promise.all([
        writeFile(path.join(featuresDirectory, `${feature}.svg`), template),
        writeFile(path.join(screensDirectory, backName), `${feature}-back`),
        writeFile(path.join(screensDirectory, frontName), `${feature}-front`),
      ])
    }

    await updateFeatureScreens(root)

    for (const feature of Object.keys(screenPlan)) {
      const output = await readFile(
        path.join(featuresDirectory, `${feature}.svg`),
        'utf8',
      )
      expect(output, feature).toContain(
        Buffer.from(`${feature}-back`).toString('base64'),
      )
      expect(output, feature).toContain(
        Buffer.from(`${feature}-front`).toString('base64'),
      )
      expect(output, feature).toContain('data:image/png;base64,RlJBTUU=')
    }
  })
})
