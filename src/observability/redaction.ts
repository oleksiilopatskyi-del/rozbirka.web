const SAFE_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
])
const SAFE_CATEGORIES = new Set([
  'network',
  'auth',
  'permission',
  'validation',
  'timeout',
  'unknown',
])

const SAFE_CORRELATION = /^[A-Za-z0-9._-]{1,128}$/
const SAFE_ROUTE_TEMPLATE =
  /^\/(?:(?:[a-z0-9-]{1,32}|:[A-Za-z][A-Za-z0-9]*|\{[A-Za-z][A-Za-z0-9]*\})(?:\/(?:[a-z0-9-]{1,32}|:[A-Za-z][A-Za-z0-9]*|\{[A-Za-z][A-Za-z0-9]*\}))*)?$/

export interface SafeTelemetryEvent {
  correlationId: string
  routeTemplate: string
  method: string
  status: number
  category: string
}

export const createSafeTelemetryEvent = (
  source: Record<string, unknown>,
): SafeTelemetryEvent => {
  const correlationId =
    typeof source['correlationId'] === 'string' &&
    SAFE_CORRELATION.test(source['correlationId'])
      ? source['correlationId']
      : 'redacted'
  const routeTemplate =
    typeof source['routeTemplate'] === 'string' &&
    SAFE_ROUTE_TEMPLATE.test(source['routeTemplate'])
      ? source['routeTemplate']
      : '/unknown'
  const normalizedMethod =
    typeof source['method'] === 'string' ? source['method'].toUpperCase() : ''
  const method = SAFE_METHODS.has(normalizedMethod) ? normalizedMethod : 'GET'
  const status =
    typeof source['status'] === 'number' &&
    Number.isInteger(source['status']) &&
    source['status'] >= 100 &&
    source['status'] <= 599
      ? source['status']
      : 0
  const category =
    typeof source['category'] === 'string' &&
    SAFE_CATEGORIES.has(source['category'])
      ? source['category']
      : 'unknown'

  return { correlationId, routeTemplate, method, status, category }
}
