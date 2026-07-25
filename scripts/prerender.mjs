import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const indexPath = resolve('dist/index.html')
const serverEntry = resolve('dist-ssr/entry-server.js')
const { renderLanding } = await import(pathToFileURL(serverEntry).href)
const html = await readFile(indexPath, 'utf8')
const marker = '<div id="root"></div>'
const stylesheetPattern =
  /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/

if (!html.includes(marker)) {
  throw new Error('Prerender marker was not found in dist/index.html')
}
const stylesheetMatch = html.match(stylesheetPattern)
if (!stylesheetMatch?.[1]) {
  throw new Error('Production stylesheet was not found in dist/index.html')
}
const css = await readFile(resolve('dist', stylesheetMatch[1].slice(1)), 'utf8')
const heroFont = await readFile(resolve('dist/fonts/VisueltPro-Hero.woff2'))
const criticalCss = css.replace(
  /url\(["']?\/fonts\/VisueltPro-Hero\.woff2["']?\)/,
  `url("data:font/woff2;base64,${heroFont.toString('base64')}")`,
)

const rendered = html
  .replace(stylesheetPattern, `<style>${criticalCss}</style>`)
  .replace(marker, `<div id="root">${renderLanding()}</div>`)
await writeFile(resolve('dist/app.html'), html)
await writeFile(indexPath, rendered)
