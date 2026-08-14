import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const environments = {
  qa: {
    expected: 'https://qaapi.rozbirka.pro',
    forbidden: 'https://api.rozbirka.pro',
    success: 'QA API origin verified',
    missing: 'QA API origin was not found',
    forbiddenMessage: 'production API origin',
  },
  production: {
    expected: 'https://api.rozbirka.pro',
    forbidden: 'https://qaapi.rozbirka.pro',
    success: 'Production API origin verified',
    missing: 'Production API origin was not found',
    forbiddenMessage: 'QA API origin',
  },
}

const environment = process.argv[2]
const contract = environments[environment]

if (!contract) {
  throw new Error('Usage: check-deploy-artifact.mjs <qa|production>')
}

const dist = resolve('dist')
const files = await readdir(dist, { recursive: true, withFileTypes: true })
const deployFiles = files.filter((entry) => entry.isFile())

let expectedFound = false
const forbiddenFiles = []

for (const file of deployFiles) {
  const parentPath = file.parentPath ?? file.path
  const path = resolve(parentPath, file.name)
  const contents = await readFile(path)

  if (contents.includes(contract.expected)) expectedFound = true
  if (contents.includes(contract.forbidden)) forbiddenFiles.push(path)
}

if (forbiddenFiles.length > 0) {
  throw new Error(
    `Refusing ${environment} deployment: ${contract.forbiddenMessage} found in ${forbiddenFiles.join(', ')}`,
  )
}

if (!expectedFound) {
  throw new Error(`Refusing ${environment} deployment: ${contract.missing}`)
}

console.log(`${contract.success}: ${contract.expected}`)
