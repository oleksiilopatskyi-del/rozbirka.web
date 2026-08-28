export type CabinetParityRolloutMode = 'off' | 'internal' | 'canary' | 'on'

export interface CabinetParityRolloutV1 {
  version: 1
  mode: CabinetParityRolloutMode
  canaryPercent: number
  emergencyOff: boolean
}

export interface CabinetParityRolloutSubject {
  version: 1
  subjectId: string
  grants: readonly string[]
  audiences: readonly string[]
}

export interface CabinetParityRolloutEnvelopeV1 {
  configuration: string
  claim: CabinetParityRolloutSubject
}

export interface CabinetParityCompatibilityV1 {
  version: 1
  allowMissingEnvelope: boolean
}

const DISABLED_ROLLOUT: CabinetParityRolloutV1 = {
  version: 1,
  mode: 'off',
  canaryPercent: 0,
  emergencyOff: true,
}

const DISABLED_COMPATIBILITY: CabinetParityCompatibilityV1 = {
  version: 1,
  allowMissingEnvelope: false,
}

const decodeCabinetParityCompatibility = (
  source: string | undefined,
): CabinetParityCompatibilityV1 | null => {
  if (!source) return null

  try {
    const value = JSON.parse(source) as Record<string, unknown> | null
    if (
      value?.['version'] !== 1 ||
      typeof value['allowMissingEnvelope'] !== 'boolean' ||
      Object.keys(value).length !== 2
    ) {
      return null
    }

    return {
      version: 1,
      allowMissingEnvelope: value['allowMissingEnvelope'],
    }
  } catch {
    return null
  }
}

export const parseCabinetParityCompatibility = (
  source: string | undefined,
): CabinetParityCompatibilityV1 =>
  decodeCabinetParityCompatibility(source) ?? { ...DISABLED_COMPATIBILITY }

export const assertCabinetParityBuildCompatibility = (
  mode: string,
  source: string | undefined,
): void => {
  if (mode !== 'qa' && mode !== 'production') return
  const compatibility = decodeCabinetParityCompatibility(source)
  if (compatibility?.allowMissingEnvelope !== false) {
    throw new Error(
      `${mode} must explicitly disable cabinet parity missing-envelope compatibility`,
    )
  }
}

const isMode = (value: unknown): value is CabinetParityRolloutMode =>
  value === 'off' ||
  value === 'internal' ||
  value === 'canary' ||
  value === 'on'

export const parseCabinetParityRollout = (
  source: string | undefined,
): CabinetParityRolloutV1 => {
  if (!source) return { ...DISABLED_ROLLOUT }

  try {
    const value = JSON.parse(source) as Record<string, unknown> | null
    if (
      value?.['version'] !== 1 ||
      !isMode(value['mode']) ||
      !Number.isInteger(value['canaryPercent']) ||
      typeof value['canaryPercent'] !== 'number' ||
      value['canaryPercent'] < 0 ||
      value['canaryPercent'] > 100 ||
      typeof value['emergencyOff'] !== 'boolean'
    ) {
      return { ...DISABLED_ROLLOUT }
    }

    return {
      version: 1,
      mode: value['mode'],
      canaryPercent: value['canaryPercent'],
      emergencyOff: value['emergencyOff'],
    }
  } catch {
    return { ...DISABLED_ROLLOUT }
  }
}

export const fnv1a32 = (value: string): number => {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const parseClaim = (value: unknown): CabinetParityRolloutSubject | null => {
  if (value === null || typeof value !== 'object') return null
  const claim = value as Record<string, unknown>
  if (
    claim['version'] !== 1 ||
    typeof claim['subjectId'] !== 'string' ||
    claim['subjectId'].length === 0 ||
    !isStringArray(claim['grants']) ||
    !isStringArray(claim['audiences'])
  ) {
    return null
  }

  return {
    version: 1,
    subjectId: claim['subjectId'],
    grants: claim['grants'],
    audiences: claim['audiences'],
  }
}

export const isCabinetParityRolledOut = (
  rollout: CabinetParityRolloutV1,
  subject: CabinetParityRolloutSubject,
): boolean => {
  if (
    rollout.emergencyOff ||
    rollout.mode === 'off' ||
    subject.version !== 1 ||
    !subject.grants.includes('cabinet-parity') ||
    subject.subjectId.length === 0
  ) {
    return false
  }

  if (rollout.mode === 'on') return true
  if (rollout.mode === 'internal') {
    return subject.audiences.includes('internal')
  }

  return fnv1a32(subject.subjectId) % 100 < rollout.canaryPercent
}

export const isCabinetParityEnvelopeRolledOut = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false
  const envelope = value as Record<string, unknown>
  if (typeof envelope['configuration'] !== 'string') return false
  const claim = parseClaim(envelope['claim'])
  if (claim === null) return false

  return isCabinetParityRolledOut(
    parseCabinetParityRollout(envelope['configuration']),
    claim,
  )
}

export const isCabinetParityRuntimeRolledOut = (
  envelope: unknown,
  compatibility: CabinetParityCompatibilityV1,
): boolean =>
  envelope === undefined
    ? compatibility.version === 1 && compatibility.allowMissingEnvelope
    : isCabinetParityEnvelopeRolledOut(envelope)
