import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const screenshotPattern =
  /(<image\b(?=[^>]*\bwidth="1290")(?=[^>]*\bheight="2796")[^>]*\bxlink:href=")[^"]+("\s*\/>)/g

export function composeFeatureSvg(source, backScreen, frontScreen) {
  const screens = [backScreen, frontScreen]
  let index = 0

  const output = source.replace(screenshotPattern, (_match, prefix, suffix) => {
    const screen = screens[index]
    if (!screen) return _match
    index += 1
    return `${prefix}data:image/png;base64,${screen.toString('base64')}${suffix}`
  })

  if (index !== screens.length) {
    throw new Error(`Expected 2 phone screens in feature SVG, found ${index}`)
  }

  return output
}

const screenPlan = {
  avto: ['avto-list.png', 'avto-detail.png'],
  intake: ['intake-list.png', 'intake-detail.png'],
  parts: ['parts-list.png', 'parts-detail.png'],
  stickers: ['stickers-list.png', 'stickers-detail.png'],
  orders: ['orders-list.png', 'orders-detail.png'],
  cash: ['cash-list.png', 'cash-detail.png'],
  customers: ['customers-list.png', 'customers-detail.png'],
  team: ['team-list.png', 'team-detail.png'],
}

export async function updateFeatureScreens(root = process.cwd()) {
  const screensDirectory = path.join(root, 'src/assets/feature-screens')
  const featuresDirectory = path.join(root, 'src/assets/features')

  for (const [feature, [backName, frontName]] of Object.entries(screenPlan)) {
    const svgPath = path.join(featuresDirectory, `${feature}.svg`)
    const [source, backScreen, frontScreen] = await Promise.all([
      readFile(svgPath, 'utf8'),
      readFile(path.join(screensDirectory, backName)),
      readFile(path.join(screensDirectory, frontName)),
    ])

    await writeFile(
      svgPath,
      composeFeatureSvg(source, backScreen, frontScreen),
      'utf8',
    )
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await updateFeatureScreens()
}
