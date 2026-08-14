import { render, screen } from '@testing-library/react'
import { AccessGate } from './AccessGate'
import {
  ModuleAccessDeniedError,
  requireModuleMutation,
  type ModuleAccessDecision,
} from './policy'

describe('AccessGate', () => {
  it('renders controls only for an allowed decision', () => {
    const { rerender } = render(
      <AccessGate decision={{ kind: 'permission-denied' }}>
        <button type="button">Create car</button>
      </AccessGate>,
    )

    expect(screen.queryByRole('button', { name: 'Create car' })).toBeNull()

    rerender(
      <AccessGate decision={{ kind: 'allowed' }}>
        <button type="button">Create car</button>
      </AccessGate>,
    )

    expect(screen.getByRole('button', { name: 'Create car' })).toBeVisible()
  })
})

describe('requireModuleMutation', () => {
  it('throws a typed error carrying the exact denial decision before dispatch', () => {
    const decision: ModuleAccessDecision = {
      kind: 'quota-exhausted',
      resource: 'cars',
      used: 10,
      max: 10,
    }

    let thrown: unknown
    try {
      requireModuleMutation(decision)
    } catch (error: unknown) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(ModuleAccessDeniedError)
    expect((thrown as ModuleAccessDeniedError).decision).toBe(decision)
  })

  it('returns the allowed decision for an authorized mutation', () => {
    const decision = { kind: 'allowed' } as const

    expect(requireModuleMutation(decision)).toBe(decision)
  })
})
