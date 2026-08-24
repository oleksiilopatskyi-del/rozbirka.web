import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDocument } from 'yaml'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
export const defaultSourcePath = join(
  repositoryRoot,
  'docs/parity/mobile-web-parity.yaml',
)
export const defaultOutputPath = join(
  repositoryRoot,
  'docs/parity/mobile-web-parity.md',
)
const generateUsage =
  'Usage: npm run parity:generate -- [--source <yaml>] [--out <markdown>]'

const domains = new Set([
  'auth',
  'billing',
  'cars',
  'cash',
  'customers',
  'dashboard',
  'intake',
  'orders',
  'parts',
  'profile',
  'reports',
  'scanning',
  'team',
])
const dispositions = new Set(['browser-native', 'parity'])
const contractServices = new Set([
  'core',
  'gateway',
  'identity',
  'none',
  'platform',
])
const contractStatuses = new Set([
  'missing',
  'not-applicable',
  'partial',
  'ready',
  'unsafe',
])
const owners = new Set(['core', 'gateway', 'identity', 'platform', 'web'])
const trackingStatuses = new Set(['existing', 'proposed'])
const exclusionClassifications = new Set([
  'native-only',
  'obsolete',
  'prototype',
  'unreachable',
])
const commitPattern = /^[a-f0-9]{40}$/
const issuePattern = /^ROZ-[0-9]+$/
const proposalKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const evidencePattern =
  /^rozbirka\.(?:core|identity|mobile|web):[^:\n]+(?::[0-9]+)?$/

function expectRecord(value, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location}: expected an object`)
  }
  return value
}

function expectKnownKeys(record, allowed, location) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`${location}.${key}: unknown field`)
  }
}

function expectText(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${location}: expected non-empty text`)
  }
  return value
}

function expectArray(value, location) {
  if (!Array.isArray(value)) {
    throw new Error(`${location}: expected an array`)
  }
  return value
}

function expectTextArray(
  value,
  location,
  emptyMessage = 'expected at least one value',
) {
  const values = expectArray(value, location)
  if (values.length === 0) throw new Error(`${location}: ${emptyMessage}`)
  values.forEach((entry, index) => expectText(entry, `${location}[${index}]`))
  return values
}

function expectEnum(value, allowed, location) {
  if (!allowed.has(value))
    throw new Error(`${location}: unsupported value ${value}`)
  return value
}

function validateEvidence(value, location) {
  const evidence = expectTextArray(
    value,
    location,
    'expected at least one reference',
  )
  evidence.forEach((reference, index) => {
    if (!evidencePattern.test(reference)) {
      throw new Error(
        `${location}[${index}]: expected repository-qualified reference`,
      )
    }
  })
  return evidence
}

function validateTracking(value, location, seenProposalKeys) {
  const tracking = expectRecord(value, location)
  expectKnownKeys(
    tracking,
    new Set(['issue', 'proposalKey', 'status']),
    location,
  )
  const status = expectEnum(
    tracking.status,
    trackingStatuses,
    `${location}.status`,
  )
  if (status === 'existing') {
    if (!issuePattern.test(tracking.issue ?? '')) {
      throw new Error(`${location}.issue: expected ROZ-[0-9]+`)
    }
    if (Object.hasOwn(tracking, 'proposalKey')) {
      throw new Error(
        `${location}.proposalKey: not allowed when tracking status is existing`,
      )
    }
  } else {
    if (!proposalKeyPattern.test(tracking.proposalKey ?? '')) {
      throw new Error(`${location}.proposalKey: expected stable kebab-case key`)
    }
    if (Object.hasOwn(tracking, 'issue')) {
      throw new Error(
        `${location}.issue: not allowed when tracking status is proposed`,
      )
    }
    if (seenProposalKeys.has(tracking.proposalKey)) {
      throw new Error(
        `${location}.proposalKey: duplicate proposal key ${tracking.proposalKey}`,
      )
    }
    seenProposalKeys.add(tracking.proposalKey)
  }
  return tracking
}

function validateContract(value, location) {
  const contract = expectRecord(value, location)
  expectKnownKeys(
    contract,
    new Set(['notes', 'operations', 'service', 'status']),
    location,
  )
  const service = expectEnum(
    contract.service,
    contractServices,
    `${location}.service`,
  )
  const status = expectEnum(
    contract.status,
    contractStatuses,
    `${location}.status`,
  )
  if (status === 'not-applicable') {
    if (service !== 'none') {
      throw new Error(
        `${location}.service: expected none when contract status is not-applicable`,
      )
    }
    if (Object.hasOwn(contract, 'operations')) {
      throw new Error(
        `${location}.operations: not allowed when contract status is not-applicable`,
      )
    }
  } else if (service === 'none') {
    throw new Error(
      `${location}.service: expected owning service when contract status is ${status}`,
    )
  }
  if (status === 'ready' && !contract.operations?.length) {
    throw new Error(
      `${location}.operations: required when contract status is ready`,
    )
  }
  if (contract.operations !== undefined) {
    expectTextArray(contract.operations, `${location}.operations`)
  }
  if (['missing', 'partial', 'unsafe'].includes(status)) {
    if (typeof contract.notes !== 'string' || contract.notes.trim() === '') {
      throw new Error(
        `${location}.notes: required when contract status is ${status}`,
      )
    }
  } else if (contract.notes !== undefined) {
    expectText(contract.notes, `${location}.notes`)
  }
  return contract
}

function validateAccess(value, location) {
  const access = expectRecord(value, location)
  expectKnownKeys(
    access,
    new Set(['billing', 'permissions', 'tenant']),
    location,
  )
  expectTextArray(access.permissions, `${location}.permissions`)
  expectText(access.tenant, `${location}.tenant`)
  expectText(access.billing, `${location}.billing`)
  return access
}

function validateIdentity(id, location, seenIds) {
  expectText(id, location)
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id)) {
    throw new Error(`${location}: expected stable dotted identifier`)
  }
  if (seenIds.has(id))
    throw new Error(`${location}: duplicate capability id ${id}`)
  seenIds.add(id)
}

function validateCapability(value, index, seenIds, seenProposalKeys) {
  const location = `capabilities[${index}]`
  const capability = expectRecord(value, location)
  expectKnownKeys(
    capability,
    new Set([
      'access',
      'contract',
      'domain',
      'evidence',
      'id',
      'mobile',
      'name',
      'owner',
      'tracking',
      'web',
    ]),
    location,
  )
  validateIdentity(capability.id, `${location}.id`, seenIds)
  expectEnum(capability.domain, domains, `${location}.domain`)
  expectText(capability.name, `${location}.name`)

  const mobile = expectRecord(capability.mobile, `${location}.mobile`)
  expectKnownKeys(mobile, new Set(['actions', 'routes']), `${location}.mobile`)
  expectTextArray(mobile.routes, `${location}.mobile.routes`)
  expectTextArray(mobile.actions, `${location}.mobile.actions`)

  const web = expectRecord(capability.web, `${location}.web`)
  expectKnownKeys(
    web,
    new Set(['browserEquivalent', 'disposition', 'outcome', 'route']),
    `${location}.web`,
  )
  expectText(web.outcome, `${location}.web.outcome`)
  if (web.route !== null) expectText(web.route, `${location}.web.route`)
  const disposition = expectEnum(
    web.disposition,
    dispositions,
    `${location}.web.disposition`,
  )
  if (disposition === 'browser-native') {
    if (
      typeof web.browserEquivalent !== 'string' ||
      web.browserEquivalent.trim() === ''
    ) {
      throw new Error(
        `${location}.web.browserEquivalent: required for browser-native`,
      )
    }
  } else if (Object.hasOwn(web, 'browserEquivalent')) {
    throw new Error(
      `${location}.web.browserEquivalent: not allowed for parity disposition`,
    )
  }

  validateContract(capability.contract, `${location}.contract`)
  validateAccess(capability.access, `${location}.access`)
  expectEnum(capability.owner, owners, `${location}.owner`)
  validateTracking(
    capability.tracking,
    `${location}.tracking`,
    seenProposalKeys,
  )
  validateEvidence(capability.evidence, `${location}.evidence`)
  return capability
}

function validateSystemCapability(value, index, seenIds, seenProposalKeys) {
  const location = `systemCapabilities[${index}]`
  const capability = expectRecord(value, location)
  expectKnownKeys(
    capability,
    new Set([
      'access',
      'contract',
      'domain',
      'evidence',
      'id',
      'mobileBehavior',
      'name',
      'owner',
      'tracking',
      'trigger',
      'webOutcome',
    ]),
    location,
  )
  validateIdentity(capability.id, `${location}.id`, seenIds)
  expectEnum(capability.domain, domains, `${location}.domain`)
  expectText(capability.name, `${location}.name`)
  expectText(capability.trigger, `${location}.trigger`)
  expectText(capability.mobileBehavior, `${location}.mobileBehavior`)
  expectText(capability.webOutcome, `${location}.webOutcome`)
  validateContract(capability.contract, `${location}.contract`)
  validateAccess(capability.access, `${location}.access`)
  expectEnum(capability.owner, owners, `${location}.owner`)
  validateTracking(
    capability.tracking,
    `${location}.tracking`,
    seenProposalKeys,
  )
  validateEvidence(capability.evidence, `${location}.evidence`)
  return capability
}

function validateExcludedRoute(value, index, seenRoutes, seenProposalKeys) {
  const location = `excludedRoutes[${index}]`
  const exclusion = expectRecord(value, location)
  expectKnownKeys(
    exclusion,
    new Set([
      'classification',
      'evidence',
      'reason',
      'route',
      'tracking',
      'webReplacement',
    ]),
    location,
  )
  const route = expectText(exclusion.route, `${location}.route`)
  if (seenRoutes.has(route)) {
    throw new Error(`${location}.route: duplicate excluded route ${route}`)
  }
  seenRoutes.add(route)
  expectEnum(
    exclusion.classification,
    exclusionClassifications,
    `${location}.classification`,
  )
  expectText(exclusion.reason, `${location}.reason`)
  validateEvidence(exclusion.evidence, `${location}.evidence`)
  if (!Object.hasOwn(exclusion, 'webReplacement')) {
    throw new Error(`${location}.webReplacement: expected text or null`)
  }
  if (exclusion.webReplacement !== null) {
    expectText(exclusion.webReplacement, `${location}.webReplacement`)
  }
  if (exclusion.tracking !== undefined) {
    validateTracking(
      exclusion.tracking,
      `${location}.tracking`,
      seenProposalKeys,
    )
  }
  return exclusion
}

export function parseParityYaml(source) {
  const parsed = parseDocument(source, { prettyErrors: true })
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(({ message }) => message).join('\n'))
  }
  return parsed.toJS()
}

export function validateParityDocument(value) {
  const document = expectRecord(value, 'document')
  expectKnownKeys(
    document,
    new Set([
      'audit',
      'capabilities',
      'excludedRoutes',
      'schemaVersion',
      'systemCapabilities',
    ]),
    'document',
  )
  if (document.schemaVersion !== 1) {
    throw new Error('schemaVersion: expected 1')
  }
  const audit = expectRecord(document.audit, 'audit')
  expectKnownKeys(
    audit,
    new Set(['coreCommit', 'identityCommit', 'mobileCommit', 'webCommit']),
    'audit',
  )
  for (const repository of ['mobile', 'web', 'core', 'identity']) {
    const location = `audit.${repository}Commit`
    if (!commitPattern.test(audit[`${repository}Commit`] ?? '')) {
      throw new Error(`${location}: expected a lowercase 40-character Git SHA`)
    }
  }

  const capabilities = expectArray(document.capabilities, 'capabilities')
  const systemCapabilities = expectArray(
    document.systemCapabilities,
    'systemCapabilities',
  )
  const excludedRoutes = expectArray(document.excludedRoutes, 'excludedRoutes')
  const seenIds = new Set()
  const seenProposalKeys = new Set()
  const seenRoutes = new Set()
  capabilities.forEach((entry, index) =>
    validateCapability(entry, index, seenIds, seenProposalKeys),
  )
  systemCapabilities.forEach((entry, index) =>
    validateSystemCapability(entry, index, seenIds, seenProposalKeys),
  )
  excludedRoutes.forEach((entry, index) =>
    validateExcludedRoute(entry, index, seenRoutes, seenProposalKeys),
  )
  return document
}

function escapeCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(escapeCell).join('<br>')
  return String(value)
    .replaceAll('|', '\\|')
    .replaceAll('\n', '<br>')
    .replace(/(^|\/)_(?=[A-Za-z])/g, '$1\\_')
}

function table(headers, rows) {
  const escapedRows = rows.map((row) => row.map(escapeCell))
  const widths = headers.map((header, index) =>
    Math.max(
      3,
      header.length,
      ...escapedRows.map((row) => row[index]?.length ?? 0),
    ),
  )
  const renderRow = (row) =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`
  const header = renderRow(headers)
  const separator = renderRow(widths.map((width) => '-'.repeat(width)))
  const body = escapedRows.map(renderRow)
  return [header, separator, ...body].join('\n')
}

function countBy(items, selector) {
  const counts = new Map()
  for (const item of items) {
    const key = selector(item) ?? 'unknown'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right))
}

function renderCapabilities(capabilities) {
  const domains = new Map()
  for (const capability of [...capabilities].sort((left, right) =>
    `${left.domain ?? ''}:${left.id ?? ''}`.localeCompare(
      `${right.domain ?? ''}:${right.id ?? ''}`,
    ),
  )) {
    const domain = capability.domain ?? 'unknown'
    const entries = domains.get(domain) ?? []
    entries.push(capability)
    domains.set(domain, entries)
  }

  return [...domains]
    .map(
      ([domain, entries]) =>
        `### ${domain}\n\n${table(
          [
            'ID',
            'Capability',
            'Mobile routes',
            'Web outcome',
            'Contract',
            'Owner',
            'Tracking',
          ],
          entries.map((entry) => [
            entry.id,
            entry.name,
            entry.mobile?.routes,
            entry.web?.outcome,
            entry.contract?.status,
            entry.owner,
            entry.tracking?.issue ?? entry.tracking?.proposalKey,
          ]),
        )}`,
    )
    .join('\n\n')
}

function renderSystemCapabilities(capabilities) {
  return table(
    [
      'ID',
      'Capability',
      'Trigger',
      'Web outcome',
      'Contract',
      'Owner',
      'Tracking',
    ],
    [...capabilities]
      .sort((left, right) => (left.id ?? '').localeCompare(right.id ?? ''))
      .map((entry) => [
        entry.id,
        entry.name,
        entry.trigger,
        entry.webOutcome,
        entry.contract?.status,
        entry.owner,
        entry.tracking?.issue ?? entry.tracking?.proposalKey,
      ]),
  )
}

function renderExclusions(exclusions) {
  return table(
    ['Route', 'Classification', 'Reason', 'Web replacement', 'Tracking'],
    [...exclusions]
      .sort((left, right) =>
        (left.route ?? '').localeCompare(right.route ?? ''),
      )
      .map((entry) => [
        entry.route,
        entry.classification,
        entry.reason,
        entry.webReplacement,
        entry.tracking?.issue ?? entry.tracking?.proposalKey,
      ]),
  )
}

function renderTracking(document, status) {
  const entries = [
    ...document.capabilities,
    ...document.systemCapabilities,
    ...document.excludedRoutes,
  ]
    .filter((entry) => entry.tracking?.status === status)
    .sort((left, right) =>
      (left.id ?? left.route ?? '').localeCompare(
        right.id ?? right.route ?? '',
      ),
    )
  return table(
    ['Item', 'Owner', 'Tracking'],
    entries.map((entry) => [
      entry.id ?? entry.route,
      entry.owner ?? 'decision',
      entry.tracking.issue ?? entry.tracking.proposalKey,
    ]),
  )
}

export function renderParityMarkdown(document) {
  const contractCounts = countBy(
    [...document.capabilities, ...document.systemCapabilities],
    (entry) => entry.contract?.status,
  )
  const dispositionCounts = countBy(
    document.capabilities,
    (entry) => entry.web?.disposition,
  )

  const sections = [
    '# Mobile → Web Parity Matrix',
    '## Audit sources',
    table(
      ['Repository', 'Commit'],
      Object.entries(document.audit).map(([repository, commit]) => [
        repository.replace(/Commit$/, ''),
        commit,
      ]),
    ),
    '## Summary',
    table(
      ['Dimension', 'Value', 'Count'],
      [
        ...contractCounts.map(([value, count]) => ['Contract', value, count]),
        ...dispositionCounts.map(([value, count]) => [
          'Disposition',
          value,
          count,
        ]),
        ['Excluded routes', 'total', document.excludedRoutes.length],
      ],
    ),
    '## User capabilities',
    renderCapabilities(document.capabilities),
    '## System capabilities',
    renderSystemCapabilities(document.systemCapabilities),
    '## Excluded routes',
    renderExclusions(document.excludedRoutes),
    '## Existing Linear tracking',
    renderTracking(document, 'existing'),
    '## Proposed gaps',
    renderTracking(document, 'proposed'),
    '## Legend',
    '- Contract: `ready`, `partial`, `missing`, `unsafe`, or `not-applicable`.',
    '- Web disposition: `parity` or `browser-native`.',
    '- Tracking: a verified Linear issue or a proposed gap key awaiting preview approval.',
  ]

  return `${sections.join('\n\n')}\n`
}

export async function generateParityReport({ sourcePath, outputPath }) {
  const source = await readFile(sourcePath, 'utf8')
  const document = validateParityDocument(parseParityYaml(source))
  const markdown = renderParityMarkdown(document)
  await mkdir(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, markdown)
    await rename(temporaryPath, outputPath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export function parseArguments(argumentsToParse, commandUsage = generateUsage) {
  const values = {}
  const supported = new Set(['--out', '--source'])
  for (let index = 0; index < argumentsToParse.length; index += 2) {
    const flag = argumentsToParse[index]
    const value = argumentsToParse[index + 1]
    if (!supported.has(flag) || !value || value.startsWith('--')) {
      throw new Error(commandUsage)
    }
    if (values[flag]) {
      throw new Error(
        `Argument ${flag} may be provided only once. ${commandUsage}`,
      )
    }
    values[flag] = value
  }
  return {
    sourcePath: values['--source']
      ? resolve(values['--source'])
      : defaultSourcePath,
    outputPath: values['--out'] ? resolve(values['--out']) : defaultOutputPath,
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  await generateParityReport(options)
  console.log(`Generated parity matrix at ${options.outputPath}`)
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
