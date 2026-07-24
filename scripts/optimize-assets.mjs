import { mkdir, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const featureNames = [
  'avto',
  'intake',
  'parts',
  'stickers',
  'orders',
  'customers',
  'cash',
  'analytics',
  'reports',
  'team',
]

const targets = [
  {
    name: 'hero',
    input: 'src/assets/phone pc.png',
    output: 'src/assets/optimized/hero',
    widths: [720, 1080],
  },
  {
    name: 'cta',
    input: 'src/assets/cta-phones.png',
    output: 'src/assets/optimized/cta',
    widths: [720, 1100],
  },
  ...featureNames.map((name) => ({
    name,
    input: `src/assets/features/${name}.svg`,
    output: 'src/assets/optimized/features',
    widths: [480, 720],
  })),
]

for (const target of targets) {
  await mkdir(target.output, { recursive: true })
  for (const width of target.widths) {
    const pipeline = sharp(target.input, { density: 192 }).resize({
      width,
      fit: 'inside',
      withoutEnlargement: true,
    })
    const avif = path.join(target.output, `${target.name}-${width}.avif`)
    const webp = path.join(target.output, `${target.name}-${width}.webp`)
    await pipeline.clone().avif({ quality: 50, effort: 6 }).toFile(avif)
    await pipeline.clone().webp({ quality: 72, effort: 5 }).toFile(webp)
    for (const file of [avif, webp]) {
      const bytes = (await stat(file)).size
      if (bytes > 500 * 1024) {
        throw new Error(`${file} exceeds 500 KB: ${bytes}`)
      }
      console.log(`${file} ${bytes}`)
    }
  }
}
