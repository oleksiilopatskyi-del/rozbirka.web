import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assertCabinetParityBuildCompatibility,
  fnv1a32,
  isCabinetParityEnvelopeRolledOut,
  isCabinetParityRuntimeRolledOut,
  isCabinetParityRolledOut,
  parseCabinetParityCompatibility,
  parseCabinetParityRollout,
} from './cabinet-feature-flags'

describe('cabinet parity rollout flags', () => {
  it('enables missing-envelope compatibility only for the exact v1 opt-in', () => {
    const disabled = {
      version: 1,
      allowMissingEnvelope: false,
    }

    expect(parseCabinetParityCompatibility(undefined)).toEqual(disabled)
    expect(parseCabinetParityCompatibility('{not-json')).toEqual(disabled)
    expect(
      parseCabinetParityCompatibility(
        '{"version":2,"allowMissingEnvelope":true}',
      ),
    ).toEqual(disabled)
    expect(
      parseCabinetParityCompatibility(
        '{"version":1,"allowMissingEnvelope":"true"}',
      ),
    ).toEqual(disabled)
    expect(
      parseCabinetParityCompatibility(
        '{"version":1,"allowMissingEnvelope":true}',
      ),
    ).toEqual({ version: 1, allowMissingEnvelope: true })
    expect(
      parseCabinetParityCompatibility(
        '{"version":1,"allowMissingEnvelope":false}',
      ),
    ).toEqual(disabled)
  })

  it('allows an omitted envelope only through the explicit compatibility switch', () => {
    expect(
      isCabinetParityRuntimeRolledOut(undefined, {
        version: 1,
        allowMissingEnvelope: true,
      }),
    ).toBe(true)
    expect(
      isCabinetParityRuntimeRolledOut(undefined, {
        version: 1,
        allowMissingEnvelope: false,
      }),
    ).toBe(false)
    expect(
      isCabinetParityRuntimeRolledOut(null, {
        version: 1,
        allowMissingEnvelope: true,
      }),
    ).toBe(false)
  })

  it.each(['.env.qa', '.env.production'])(
    '%s explicitly disables missing-envelope compatibility',
    (file) => {
      const source = readFileSync(file, 'utf8')
      const value = /^VITE_CABINET_PARITY_COMPATIBILITY=(.+)$/m.exec(
        source,
      )?.[1]

      expect(parseCabinetParityCompatibility(value)).toEqual({
        version: 1,
        allowMissingEnvelope: false,
      })
    },
  )

  it('blocks QA and production builds unless compatibility is explicitly disabled', () => {
    const disabled = '{"version":1,"allowMissingEnvelope":false}'
    const enabled = '{"version":1,"allowMissingEnvelope":true}'

    expect(() =>
      assertCabinetParityBuildCompatibility('qa', disabled),
    ).not.toThrow()
    expect(() =>
      assertCabinetParityBuildCompatibility('production', disabled),
    ).not.toThrow()
    expect(() =>
      assertCabinetParityBuildCompatibility('qa', undefined),
    ).toThrow(/explicitly disable/i)
    expect(() =>
      assertCabinetParityBuildCompatibility('production', enabled),
    ).toThrow(/explicitly disable/i)
    expect(() =>
      assertCabinetParityBuildCompatibility('production', '{not-json'),
    ).toThrow(/explicitly disable/i)
    expect(() =>
      assertCabinetParityBuildCompatibility('development', enabled),
    ).not.toThrow()
  })

  it('fails closed when the versioned configuration is missing or malformed', () => {
    expect(parseCabinetParityRollout(undefined)).toEqual({
      version: 1,
      mode: 'off',
      canaryPercent: 0,
      emergencyOff: true,
    })
    expect(parseCabinetParityRollout('{"version":2,"mode":"on"}')).toEqual({
      version: 1,
      mode: 'off',
      canaryPercent: 0,
      emergencyOff: true,
    })
    expect(parseCabinetParityRollout('{not-json')).toEqual({
      version: 1,
      mode: 'off',
      canaryPercent: 0,
      emergencyOff: true,
    })
  })

  it('hashes canonical UTF-8 bytes for stable cohort assignment', () => {
    expect(fnv1a32('hello')).toBe(0x4f9f2cab)
    expect(fnv1a32('tenant-42')).toBe(0xf7d215c2)
    expect(fnv1a32('розбірка-7')).toBe(0x770f006c)
    expect(fnv1a32('🚗-tenant')).toBe(0xd8eebdfa)
  })

  it('requires server authorization in every rollout mode', () => {
    for (const mode of ['internal', 'canary', 'on'] as const) {
      expect(
        isCabinetParityRolledOut(
          {
            version: 1,
            mode,
            canaryPercent: 100,
            emergencyOff: false,
          },
          {
            version: 1,
            subjectId: 'tenant-1',
            grants: [],
            audiences: ['internal'],
          },
        ),
      ).toBe(false)
    }
  })

  it('limits internal rollout to server-authorized internal subjects', () => {
    const flag = {
      version: 1 as const,
      mode: 'internal' as const,
      canaryPercent: 0,
      emergencyOff: false,
    }

    expect(
      isCabinetParityRolledOut(flag, {
        version: 1,
        subjectId: 'tenant-1',
        grants: ['cabinet-parity'],
        audiences: ['internal'],
      }),
    ).toBe(true)
    expect(
      isCabinetParityRolledOut(flag, {
        version: 1,
        subjectId: 'tenant-1',
        grants: ['cabinet-parity'],
        audiences: [],
      }),
    ).toBe(false)
  })

  it('uses deterministic percentage cohorts and honors emergency off', () => {
    const canary = {
      version: 1 as const,
      mode: 'canary' as const,
      canaryPercent: 100,
      emergencyOff: false,
    }
    const subject = {
      version: 1 as const,
      subjectId: 'tenant-42',
      grants: ['cabinet-parity'],
      audiences: [],
    }

    expect(isCabinetParityRolledOut(canary, subject)).toBe(true)
    expect(
      isCabinetParityRolledOut({ ...canary, canaryPercent: 0 }, subject),
    ).toBe(false)
    expect(
      isCabinetParityRolledOut({ ...canary, emergencyOff: true }, subject),
    ).toBe(false)
  })

  it('uses a non-extreme fixed cohort at the exact percentage boundary', () => {
    const subject = {
      version: 1 as const,
      subjectId: 'tenant-42',
      grants: ['cabinet-parity'],
      audiences: [],
    }
    const canary = {
      version: 1 as const,
      mode: 'canary' as const,
      canaryPercent: 82,
      emergencyOff: false,
    }

    expect(isCabinetParityRolledOut(canary, subject)).toBe(false)
    expect(
      isCabinetParityRolledOut({ ...canary, canaryPercent: 83 }, subject),
    ).toBe(true)
  })

  it('fails closed for a present malformed server envelope or claim', () => {
    expect(isCabinetParityEnvelopeRolledOut(null)).toBe(false)
    expect(
      isCabinetParityEnvelopeRolledOut({
        configuration: '{not-json',
        claim: {
          version: 1,
          subjectId: 'tenant-42',
          grants: ['cabinet-parity'],
          audiences: [],
        },
      }),
    ).toBe(false)
    expect(
      isCabinetParityEnvelopeRolledOut({
        configuration:
          '{"version":1,"mode":"on","canaryPercent":100,"emergencyOff":false}',
        claim: {
          version: 2,
          subjectId: 'tenant-42',
          grants: ['cabinet-parity'],
          audiences: [],
        },
      }),
    ).toBe(false)
  })
})
