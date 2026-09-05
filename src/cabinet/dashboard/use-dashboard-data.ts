import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApiProblem } from '@/api/contracts'
import { dashboardApi } from '@/api/dashboard'
import type {
  DashboardAnalytics,
  DashboardData,
  DashboardPeriod,
} from '@/api/dashboard-contract'
import { normalizeApiProblem } from '@/api/errors'
import { useCabinet } from '../CabinetContext'
import { tenantRequestScope } from '../tenant-request-scope'
import { tenantResetRegistry } from '../tenant-reset-registry'

export type DashboardLoadable<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: ApiProblem }

export interface DashboardDataState {
  summary: DashboardLoadable<DashboardData>
  analytics: DashboardLoadable<DashboardAnalytics>
  refreshing: boolean
  refresh(): Promise<void>
  retrySummary(): Promise<void>
  retryAnalytics(): Promise<void>
}

interface DashboardState {
  scopeKey: ScopeKey | null
  analyticsPeriod: DashboardPeriod | null
  summary: DashboardLoadable<DashboardData>
  analytics: DashboardLoadable<DashboardAnalytics>
  refreshing: boolean
}

interface ScopeKey {
  userId: string
  tenantId: string
  snapshotGeneration: number
}

interface RequestFlight {
  key: ScopeKey
  generation: number
  controller: AbortController
  promise: Promise<void>
}

interface AnalyticsFlight extends RequestFlight {
  period: DashboardPeriod
}

interface RefreshFlight {
  key: ScopeKey
  period: DashboardPeriod
  promise: Promise<void>
}

const loading = { status: 'loading', data: null, error: null } as const

const initialState: DashboardState = {
  scopeKey: null,
  analyticsPeriod: null,
  summary: loading,
  analytics: loading,
  refreshing: false,
}

const sameResetScope = (
  key: ScopeKey,
  scope: { userId: string; tenantId: string },
) => key.userId === scope.userId && key.tenantId === scope.tenantId

export function useDashboardData(period: DashboardPeriod): DashboardDataState {
  const cabinet = useCabinet()
  const snapshot = cabinet.status === 'ready' ? cabinet.snapshot : null
  const scopeKey = useMemo<ScopeKey | null>(
    () =>
      snapshot === null
        ? null
        : {
            userId: snapshot.userId,
            tenantId: snapshot.tenantId,
            snapshotGeneration: snapshot.generation,
          },
    [snapshot],
  )
  const [state, setState] = useState<DashboardState>(initialState)
  const mountedRef = useRef(false)
  const activeKeyRef = useRef<ScopeKey | null>(null)
  const tenantSignalRef = useRef<AbortSignal | null>(null)
  const nextGenerationRef = useRef(0)
  const summaryFlightRef = useRef<RequestFlight | null>(null)
  const analyticsFlightRef = useRef<AnalyticsFlight | null>(null)
  const refreshFlightRef = useRef<RefreshFlight | null>(null)
  const abortSummary = useCallback((key?: ScopeKey) => {
    const flight = summaryFlightRef.current
    if (flight === null || (key !== undefined && flight.key !== key)) return
    summaryFlightRef.current = null
    flight.controller.abort('dashboard-summary-invalidated')
  }, [])

  const abortAnalytics = useCallback(
    (key?: ScopeKey, selectedPeriod?: DashboardPeriod) => {
      const flight = analyticsFlightRef.current
      if (
        flight === null ||
        (key !== undefined && flight.key !== key) ||
        (selectedPeriod !== undefined && flight.period !== selectedPeriod)
      ) {
        return
      }
      analyticsFlightRef.current = null
      flight.controller.abort('dashboard-analytics-invalidated')
    },
    [],
  )

  const invalidateScope = useCallback(
    (key: ScopeKey | null, publishClear: boolean) => {
      if (key !== null && activeKeyRef.current !== key) return
      activeKeyRef.current = null
      tenantSignalRef.current = null
      nextGenerationRef.current += 1
      abortSummary(key ?? undefined)
      abortAnalytics(key ?? undefined)
      refreshFlightRef.current = null
      if (publishClear && mountedRef.current) setState(initialState)
    },
    [abortAnalytics, abortSummary],
  )

  const isCurrentSummary = useCallback(
    (flight: RequestFlight) =>
      mountedRef.current &&
      activeKeyRef.current === flight.key &&
      summaryFlightRef.current === flight &&
      summaryFlightRef.current.generation === flight.generation,
    [],
  )

  const isCurrentAnalytics = useCallback(
    (flight: AnalyticsFlight) =>
      mountedRef.current &&
      activeKeyRef.current === flight.key &&
      analyticsFlightRef.current === flight &&
      analyticsFlightRef.current.generation === flight.generation,
    [],
  )

  const loadSummary = useCallback(
    (key: ScopeKey): Promise<void> => {
      const existing = summaryFlightRef.current
      if (existing?.key === key) return existing.promise
      if (activeKeyRef.current !== key || tenantSignalRef.current === null) {
        return Promise.resolve()
      }

      abortSummary()
      const controller = new AbortController()
      const signal = AbortSignal.any([
        controller.signal,
        tenantSignalRef.current,
      ])
      const flight: RequestFlight = {
        key,
        generation: ++nextGenerationRef.current,
        controller,
        promise: Promise.resolve(),
      }
      summaryFlightRef.current = flight
      setState((current) => ({
        ...current,
        scopeKey: key,
        summary: loading,
      }))

      flight.promise = (async () => {
        try {
          const data = await dashboardApi.getSummary({ signal })
          if (!isCurrentSummary(flight)) return
          setState((current) => ({
            ...current,
            scopeKey: key,
            summary: { status: 'ready', data, error: null },
          }))
        } catch (error: unknown) {
          if (signal.aborted || !isCurrentSummary(flight)) return
          const problem = normalizeApiProblem(error)
          if (problem.kind === 'cancelled') return
          setState((current) => ({
            ...current,
            scopeKey: key,
            summary: { status: 'error', data: null, error: problem },
          }))
        } finally {
          if (summaryFlightRef.current === flight) {
            summaryFlightRef.current = null
          }
        }
      })()
      return flight.promise
    },
    [abortSummary, isCurrentSummary],
  )

  const loadAnalytics = useCallback(
    (key: ScopeKey, selectedPeriod: DashboardPeriod): Promise<void> => {
      const existing = analyticsFlightRef.current
      if (existing?.key === key && existing.period === selectedPeriod) {
        return existing.promise
      }
      if (activeKeyRef.current !== key || tenantSignalRef.current === null) {
        return Promise.resolve()
      }

      abortAnalytics()
      const controller = new AbortController()
      const signal = AbortSignal.any([
        controller.signal,
        tenantSignalRef.current,
      ])
      const flight: AnalyticsFlight = {
        key,
        period: selectedPeriod,
        generation: ++nextGenerationRef.current,
        controller,
        promise: Promise.resolve(),
      }
      analyticsFlightRef.current = flight
      setState((current) => ({
        ...current,
        scopeKey: key,
        analyticsPeriod: selectedPeriod,
        analytics: loading,
      }))

      flight.promise = (async () => {
        try {
          const data = await dashboardApi.getAnalytics(selectedPeriod, {
            signal,
          })
          if (!isCurrentAnalytics(flight)) return
          setState((current) => ({
            ...current,
            scopeKey: key,
            analyticsPeriod: selectedPeriod,
            analytics: { status: 'ready', data, error: null },
          }))
        } catch (error: unknown) {
          if (signal.aborted || !isCurrentAnalytics(flight)) return
          const problem = normalizeApiProblem(error)
          if (problem.kind === 'cancelled') return
          setState((current) => ({
            ...current,
            scopeKey: key,
            analyticsPeriod: selectedPeriod,
            analytics: { status: 'error', data: null, error: problem },
          }))
        } finally {
          if (analyticsFlightRef.current === flight) {
            analyticsFlightRef.current = null
          }
        }
      })()
      return flight.promise
    },
    [abortAnalytics, isCurrentAnalytics],
  )

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      invalidateScope(activeKeyRef.current, false)
    }
  }, [invalidateScope])

  useEffect(() => {
    if (scopeKey === null) {
      invalidateScope(activeKeyRef.current, true)
      return
    }

    invalidateScope(activeKeyRef.current, false)
    activeKeyRef.current = scopeKey
    const tenantSignal = tenantRequestScope.signal
    tenantSignalRef.current = tenantSignal

    const clear = () => invalidateScope(scopeKey, true)
    const unregister = tenantResetRegistry.register((resetScope) => {
      if (sameResetScope(scopeKey, resetScope)) clear()
    })
    tenantSignal.addEventListener('abort', clear, { once: true })
    if (tenantSignal.aborted) clear()

    return () => {
      unregister()
      tenantSignal.removeEventListener('abort', clear)
      invalidateScope(scopeKey, false)
    }
  }, [invalidateScope, scopeKey])

  useEffect(() => {
    if (scopeKey === null || activeKeyRef.current !== scopeKey) return
    let start = true
    queueMicrotask(() => {
      if (start && activeKeyRef.current === scopeKey) {
        void loadSummary(scopeKey)
      }
    })
    return () => {
      start = false
      abortSummary(scopeKey)
    }
  }, [abortSummary, loadSummary, scopeKey])

  useEffect(() => {
    if (scopeKey === null || activeKeyRef.current !== scopeKey) return
    let start = true
    queueMicrotask(() => {
      if (start && activeKeyRef.current === scopeKey) {
        void loadAnalytics(scopeKey, period)
      }
    })
    return () => {
      start = false
      abortAnalytics(scopeKey, period)
    }
  }, [abortAnalytics, loadAnalytics, period, scopeKey])

  const refresh = useCallback((): Promise<void> => {
    const key = activeKeyRef.current
    if (key === null) return Promise.resolve()
    const existing = refreshFlightRef.current
    if (existing?.key === key && existing.period === period) {
      return existing.promise
    }

    setState((current) => ({ ...current, scopeKey: key, refreshing: true }))
    const promise = Promise.all([
      loadSummary(key),
      loadAnalytics(key, period),
    ]).then(() => undefined)
    const flight = { key, period, promise }
    refreshFlightRef.current = flight
    void promise.finally(() => {
      if (
        refreshFlightRef.current === flight &&
        activeKeyRef.current === key &&
        mountedRef.current
      ) {
        refreshFlightRef.current = null
        setState((current) => ({ ...current, refreshing: false }))
      }
    })
    return promise
  }, [loadAnalytics, loadSummary, period])

  const retrySummary = useCallback((): Promise<void> => {
    const key = activeKeyRef.current
    return key === null ? Promise.resolve() : loadSummary(key)
  }, [loadSummary])

  const retryAnalytics = useCallback((): Promise<void> => {
    const key = activeKeyRef.current
    return key === null ? Promise.resolve() : loadAnalytics(key, period)
  }, [loadAnalytics, period])

  const visibleState = state.scopeKey === scopeKey ? state : initialState
  const visibleAnalytics =
    visibleState.analyticsPeriod === period ? visibleState.analytics : loading

  return {
    summary: visibleState.summary,
    analytics: visibleAnalytics,
    refreshing: visibleState.refreshing,
    refresh,
    retrySummary,
    retryAnalytics,
  }
}
