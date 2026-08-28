import { describe, expect, it } from 'vitest'
import { readDashboardPeriod, writeDashboardPeriod } from './dashboard-period'

describe('readDashboardPeriod', () => {
  it.each([
    ['', { period: 'week', normalize: false }],
    ['period=day', { period: 'day', normalize: false }],
    ['period=year', { period: 'week', normalize: true }],
    ['period=day&period=month', { period: 'week', normalize: true }],
  ] as const)('returns %o for %s', (query, expected) => {
    expect(readDashboardPeriod(new URLSearchParams(query))).toEqual(expected)
  })
})

describe('writeDashboardPeriod', () => {
  it('replaces every period while preserving scan and approved parameters', () => {
    const input = new URLSearchParams(
      'scan=QR-123~part&period=day&filter=active&period=month',
    )

    const result = writeDashboardPeriod(input, 'week')

    expect(result.toString()).toBe(
      'scan=QR-123%7Epart&filter=active&period=week',
    )
    expect(input.toString()).toBe(
      'scan=QR-123%7Epart&period=day&filter=active&period=month',
    )
  })
})
