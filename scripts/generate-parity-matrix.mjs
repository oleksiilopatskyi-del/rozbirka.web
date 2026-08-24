import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseDocument } from 'yaml'

function expectRecord(value, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${location}: expected an object`)
  }
  return value
}

function expectArray(value, location) {
  if (!Array.isArray(value)) {
    throw new Error(`${location}: expected an array`)
  }
  return value
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
  if (document.schemaVersion !== 1) {
    throw new Error('schemaVersion: expected 1')
  }
  expectRecord(document.audit, 'audit')
  expectArray(document.capabilities, 'capabilities')
  expectArray(document.systemCapabilities, 'systemCapabilities')
  expectArray(document.excludedRoutes, 'excludedRoutes')
  return document
}

function escapeCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.map(escapeCell).join('<br>')
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

function table(headers, rows) {
  const header = `| ${headers.join(' | ')} |`
  const separator = `| ${headers.map(() => '---').join(' | ')} |`
  const body = rows.map(
    (row) => `| ${row.map((value) => escapeCell(value)).join(' | ')} |`,
  )
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
