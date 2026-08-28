import { describe, expect, it } from 'vitest'
import { cabinetModules, type CabinetModuleKey } from './module-registry'

describe('commerce module release registry', () => {
  it.each<CabinetModuleKey>([
    'cars',
    'intakes',
    'parts',
    'stickers',
    'customers',
    'orders',
    'cash',
  ])('releases %s through the existing access boundary', (module) => {
    expect(cabinetModules[module].released).toBe(true)
  })

  it.each<CabinetModuleKey>(['team', 'reports', 'business'])(
    'does not release unrelated %s work',
    (module) => {
      expect(cabinetModules[module].released).toBe(false)
    },
  )
})
