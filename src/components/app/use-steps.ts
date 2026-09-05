import { useCallback, useMemo, useState } from 'react'
import type { Step } from './stepper'

export interface StepsApi {
  index: number
  step: Step
  isFirst: boolean
  isLast: boolean
  /** True when every step up to and including the current one validates. */
  canAdvance: boolean
  next: () => void
  back: () => void
  goTo: (index: number) => void
}

/**
 * State for a stepped creation flow. Advancing is blocked while the current
 * step reports an error, so a wizard cannot bury a problem two steps back.
 */
export function useSteps(steps: readonly Step[]): StepsApi {
  const [index, setIndex] = useState(0)
  const safeIndex = Math.min(index, steps.length - 1)
  const step = steps[safeIndex]!
  const canAdvance = !step.error

  const next = useCallback(() => {
    setIndex((current) =>
      steps[current]?.error ? current : Math.min(current + 1, steps.length - 1),
    )
  }, [steps])

  const back = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0))
  }, [])

  const goTo = useCallback(
    (target: number) => {
      setIndex(Math.max(0, Math.min(target, steps.length - 1)))
    },
    [steps.length],
  )

  return useMemo(
    () => ({
      index: safeIndex,
      step,
      isFirst: safeIndex === 0,
      isLast: safeIndex === steps.length - 1,
      canAdvance,
      next,
      back,
      goTo,
    }),
    [back, canAdvance, goTo, next, safeIndex, step, steps.length],
  )
}
