import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  assertProductDocument,
  documentPathForRoute,
} from './prerender-helpers.mjs'

const serverEntry = resolve('dist-ssr/entry-server.js')
const { expectedH1ForRoute, prerenderManifest } = await import(
  pathToFileURL(serverEntry).href
)

function readMetadata(html) {
  return {
    title: html.match(/<title data-product-seo>([\s\S]*?)<\/title>/)?.[1],
    description: html.match(
      /<meta data-product-seo name="description" content="([^"]*)"\s*\/?>/,
    )?.[1],
    canonical: html.match(
      /<link data-product-seo rel="canonical" href="([^"]*)"\s*\/?>/,
    )?.[1],
  }
}

const documents = await Promise.all(
  prerenderManifest.map(async (seo) => {
    const html = await readFile(resolve(documentPathForRoute(seo.path)), 'utf8')
    assertProductDocument({
      html,
      seo,
      expectedH1: expectedH1ForRoute(seo.path),
    })
    return { seo, html }
  }),
)

for (const field of ['title', 'description', 'canonical']) {
  const values = documents.map(({ html }) => readMetadata(html)[field])
  if (new Set(values).size !== documents.length) {
    throw new Error(
      `Product ${field} metadata must be unique across prerendered documents`,
    )
  }
}

console.log(`Validated ${documents.length} prerendered product documents`)
