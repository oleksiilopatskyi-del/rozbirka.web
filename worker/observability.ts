import {
  createSafeTelemetryEvent,
  type SafeTelemetryEvent,
} from '../src/observability/redaction'

type RequestHandler = (request: Request) => Promise<Response>
type TelemetryLogger = (event: SafeTelemetryEvent) => void

const routeTemplate = (pathname: string): string => {
  if (/^\/invite\/[^/]+\/?$/.test(pathname)) return '/invite/:code'
  if (/^\/scan\/[^/]+\/?$/.test(pathname)) return '/scan/:qrCode'
  if (/^\/app\/[^/]+(?:\/.*)?$/.test(pathname)) {
    return '/app/:tenant/:path'
  }
  if (/^\/api\/auth\/[^/]+\/?$/.test(pathname)) {
    return '/api/auth/:action'
  }
  if (/^\/(?:privacy|login|account)\/?$/.test(pathname)) {
    return pathname.replace(/\/$/, '')
  }
  return pathname === '/' ? '/' : '/unknown'
}

const categoryForStatus = (status: number) => {
  if (status >= 500) return 'network'
  if (status === 401) return 'auth'
  if (status === 403) return 'permission'
  if (status === 400 || status === 422) return 'validation'
  return 'unknown'
}

export const observeRequest = async (
  request: Request,
  handler: RequestHandler,
  log: TelemetryLogger = console.info,
): Promise<Response> => {
  // Never treat the caller-controlled request ID as telemetry-safe provenance.
  const correlationId = crypto.randomUUID()
  const record = (status: number) => {
    const event = createSafeTelemetryEvent({
      correlationId,
      routeTemplate: routeTemplate(new URL(request.url).pathname),
      method: request.method,
      status,
      category: categoryForStatus(status),
    })
    try {
      log(event)
    } catch {
      // Telemetry must never change the request outcome.
    }
  }

  let response: Response
  try {
    response = await handler(request)
  } catch (error) {
    record(500)
    throw error
  }
  record(response.status)

  const headers = new Headers(response.headers)
  headers.set('X-Request-Id', correlationId)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
