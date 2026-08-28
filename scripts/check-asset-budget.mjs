import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const dist = path.resolve('dist')
const maxImageBytes = 500 * 1024
const maxJavaScriptChunkBytes = 350 * 1024
const maxCriticalBytes = 3 * 1024 * 1024
const releasedRouteChunks = [
  { screen: 'team', pattern: /^TeamScreen-[^/]+\.js$/ },
  { screen: 'reports', pattern: /^ReportsScreen-[^/]+\.js$/ },
  {
    screen: 'business',
    pattern: /^business-settings-screen-[^/]+\.js$/,
  },
]

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
  if (/\.js$/i.test(name) && bytes > maxJavaScriptChunkBytes) {
    throw new Error(`${name} exceeds 350 KiB JavaScript budget: ${bytes}`)
  }
}

const htmlEntries = await Promise.all(
  files
    .filter((file) => /\.html$/i.test(file))
    .map(async (file) => ({
      name: relative(file),
      source: await readFile(file, 'utf8'),
    })),
)

const distReference = (reference, importer) => {
  const clean = reference.split(/[?#]/, 1)[0]
  if (!clean || /^[a-z]+:/i.test(clean)) return null
  const target = clean.startsWith('/')
    ? path.resolve(dist, clean.slice(1))
    : path.resolve(path.dirname(importer), clean)
  const relativeTarget = path.relative(dist, target)
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    return null
  }
  return target
}

const htmlJavaScriptReferences = (source) =>
  [...source.matchAll(/(?:src|href)=["']([^"']+\.js(?:[?#][^"']*)?)["']/gi)]
    .map((match) => match[1])
    .filter(Boolean)

const staticJavaScriptReferences = (source) => {
  const references = []
  for (const pattern of [
    /\bimport\s*["']([^"']+)["']/g,
    /\b(?:import|export)[^"'();]*?\bfrom\s*["']([^"']+)["']/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) references.push(match[1])
    }
  }
  return references
}

const eagerJavaScript = new Set()
const pendingJavaScript = htmlEntries.flatMap(({ name, source }) =>
  htmlJavaScriptReferences(source)
    .map((reference) => distReference(reference, path.resolve(dist, name)))
    .filter(Boolean),
)

while (pendingJavaScript.length > 0) {
  const file = pendingJavaScript.pop()
  if (!file || eagerJavaScript.has(file)) continue
  eagerJavaScript.add(file)
  const source = await readFile(file, 'utf8')
  for (const reference of staticJavaScriptReferences(source)) {
    if (!/^(?:\.{1,2}\/|\/).+\.js(?:[?#]|$)/i.test(reference)) continue
    const dependency = distReference(reference, file)
    if (dependency && !eagerJavaScript.has(dependency)) {
      pendingJavaScript.push(dependency)
    }
  }
}

const emittedJavaScript = files
  .map(relative)
  .filter((name) => /\.js$/i.test(name))

for (const route of releasedRouteChunks) {
  const chunks = emittedJavaScript.filter((name) =>
    route.pattern.test(path.basename(name)),
  )
  if (chunks.length === 0) {
    throw new Error(
      `missing lazy route chunk for released screen: ${route.screen}`,
    )
  }
  for (const chunk of chunks) {
    const filename = path.basename(chunk)
    if (eagerJavaScript.has(path.resolve(dist, chunk))) {
      throw new Error(`released route chunk must stay lazy: ${filename}`)
    }
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
  throw new Error(`critical assets exceed 3 MiB: ${criticalBytes}`)
}
