import { describe, expect, it } from 'vitest'
import { cabinetModules, type CabinetModuleKey } from './module-registry'

describe('integrated cabinet module release registry', () => {
  it.each<CabinetModuleKey>([
    'cars',
    'intakes',
    'parts',
    'stickers',
    'customers',
    'orders',
    'cash',
    'team',
    'reports',
    'business',
  ])('releases %s through the existing access boundary', (module) => {
    expect(cabinetModules[module].released).toBe(true)
  })
})
