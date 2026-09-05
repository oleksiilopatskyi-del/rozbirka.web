import type { ReactNode } from 'react'
import type { ModuleAccessDecision } from './policy'

export interface AccessGateProps {
  decision: ModuleAccessDecision
  children: ReactNode
}

export const AccessGate = ({ decision, children }: AccessGateProps) =>
  decision.kind === 'allowed' ? children : null
