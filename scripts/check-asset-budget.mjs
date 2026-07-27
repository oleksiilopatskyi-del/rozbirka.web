import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const dist = path.resolve('dist')
const maxImageBytes = 500 * 1024
const maxCriticalBytes = 3 * 1024 * 1024

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name)
        return entry.isDirectory() ? walk(target) : [target]
      }),
    )
  ).flat()
}

const files = await walk(dist)
const relative = (file) => path.relative(dist, file)
const imagePattern = /\.(?:avif|webp|png|jpe?g|svg)$/i
const legacyPattern = /(?:phone pc|cta-phones|\.ttf$)/i

for (const file of files) {
  const name = relative(file)
  const bytes = (await stat(file)).size
  if (legacyPattern.test(name)) throw new Error(`legacy asset emitted: ${name}`)
  if (imagePattern.test(name) && bytes > maxImageBytes) {
    throw new Error(`${name} exceeds 500 KB: ${bytes}`)
  }
}

const critical = files.filter((file) => {
  const name = relative(file)
  return (
    /\.(?:html|css|js|woff2)$/i.test(name) ||
    /(?:hero|cta)-720[^/]*\.(?:avif|webp)$/i.test(name)
  )
})

let criticalBytes = 0
for (const file of critical) {
  const bytes = (await stat(file)).size
  criticalBytes += bytes
  console.log(`${relative(file)} ${bytes}`)
}
console.log(`critical-total ${criticalBytes}`)
if (criticalBytes > maxCriticalBytes) {
  throw new Error(`critical assets exceed 3 MB: ${criticalBytes}`)
}
