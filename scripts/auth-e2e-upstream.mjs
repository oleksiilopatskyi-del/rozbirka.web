import { createServer } from 'node:http'

const hostname = '127.0.0.1'
const port = 4174
const maxBodyBytes = 16 * 1024
const validOtp = '123456'
const dashboardPeriods = ['day', 'week', 'month']

let newUser = false
let tokenSequence = 0
let sendRequests = 0
let verifyRequests = 0
let refreshRequests = 0
let logoutRequests = 0
let dashboardRequests = 0
let dashboardAnalyticsRequests = { day: 0, week: 0, month: 0 }
let dashboardSummaryFailures = 0
let dashboardAnalyticsFailures = { day: 0, week: 0, month: 0 }
let delayedLogout = null
let delayedDashboard = null
const refreshTokens = new Set()
const accessTokens = new Set()

const dashboardSummaries = {
  'tenant-1': {
    userName: 'Олена',
    role: 'owner',
    yardName: 'Розбірка Коваль',
    yardCity: 'Львів',
    isYardEmpty: false,
    todaySalesCount: 7,
    availablePartsCount: 48,
    intakesCount: 2,
    revenue: {
      today: [{ currency: 'UAH', amount: 12500 }],
      week: [{ currency: 'UAH', amount: 73500 }],
      month: [{ currency: 'UAH', amount: 284000 }],
    },
    todayNewPartsCount: 5,
    lastActivity: {
      type: 'Продаж',
      userName: 'Оператор',
      timestamp: '2026-08-28T09:15:00.000Z',
    },
    activeCarsCount: 12,
    outOfStockPartsCount: 4,
    customersCount: 36,
    totalBalanceUah: 91000,
    teamMembersCount: 5,
    totalInvested: 450000,
    totalRecouped: 210000,
    carsInWork: null,
    totalPartsSold: null,
    myPartsToday: null,
    lastMyActivity: null,
  },
  'tenant-2': {
    userName: 'Максим',
    role: 'manager',
    yardName: 'Розбірка Соболя',
    yardCity: 'Київ',
    isYardEmpty: false,
    todaySalesCount: 17,
    availablePartsCount: 148,
    intakesCount: 6,
    revenue: {
      today: [{ currency: 'UAH', amount: 22500 }],
      week: [{ currency: 'UAH', amount: 173500 }],
      month: [{ currency: 'UAH', amount: 684000 }],
    },
    todayNewPartsCount: 15,
    lastActivity: {
      type: 'Приймання',
      userName: 'Менеджер',
      timestamp: '2026-08-28T10:30:00.000Z',
    },
    activeCarsCount: 22,
    outOfStockPartsCount: 14,
    customersCount: 136,
    totalBalanceUah: 191000,
    teamMembersCount: 8,
    totalInvested: 850000,
    totalRecouped: 510000,
    carsInWork: null,
    totalPartsSold: null,
    myPartsToday: null,
    lastMyActivity: null,
  },
}

const analyticsProfiles = {
  day: {
    labels: ['08:00', '12:00', '16:00'],
    partsSold: 3,
    series: [1, 0, 2],
  },
  week: {
    labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'],
    partsSold: 21,
    series: [2, 4, 3, 5, 1, 4, 2],
  },
  month: {
    labels: ['1 тиж.', '2 тиж.', '3 тиж.', '4 тиж.'],
    partsSold: 84,
    series: [18, 22, 19, 25],
  },
}

function failureCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function resetDashboard(options = {}) {
  dashboardRequests = 0
  dashboardAnalyticsRequests = { day: 0, week: 0, month: 0 }
  dashboardSummaryFailures = failureCount(options.dashboardSummaryFailures)
  dashboardAnalyticsFailures = { day: 0, week: 0, month: 0 }
  if (isObject(options.dashboardAnalyticsFailures)) {
    for (const period of dashboardPeriods) {
      dashboardAnalyticsFailures[period] = failureCount(
        options.dashboardAnalyticsFailures[period],
      )
    }
  }
}

function reset(options = {}) {
  releaseLogoutDelay()
  releaseDashboardDelay()
  newUser = options.newUser === true
  tokenSequence = 0
  sendRequests = 0
  verifyRequests = 0
  refreshRequests = 0
  logoutRequests = 0
  resetDashboard(options)
  refreshTokens.clear()
  accessTokens.clear()
}

function releaseLogoutDelay() {
  const pendingLogout = delayedLogout
  delayedLogout = null
  pendingLogout?.resolve()
  return pendingLogout !== null
}

function armLogoutDelay() {
  let resolve = () => undefined
  const promise = new Promise((release) => {
    resolve = release
  })
  delayedLogout = { promise, resolve }
}

function releaseDashboardDelay() {
  const pendingDashboard = delayedDashboard
  delayedDashboard = null
  pendingDashboard?.resolve()
  return pendingDashboard !== null
}

function armDashboardDelay(tenantId) {
  let resolve = () => undefined
  const promise = new Promise((release) => {
    resolve = release
  })
  delayedDashboard = { tenantId, promise, resolve, pending: false }
}

function issueSession() {
  tokenSequence += 1
  const refreshToken = `refresh-${tokenSequence}`
  const accessToken = `access-${tokenSequence}`
  refreshTokens.add(refreshToken)
  accessTokens.add(accessToken)
  return {
    refreshToken,
    accessToken,
    expiresIn: 900,
  }
}

function dashboardAnalytics(tenantId, period) {
  const profile = analyticsProfiles[period]
  const tenantOffset = tenantId === 'tenant-2' ? 100 : 0
  const revenueSeries = profile.series.map((value) => value * 1000)
  return {
    period,
    labels: profile.labels,
    revenue: {
      totals: { UAH: profile.partsSold * 2500 + tenantOffset * 1000 },
      trendPercent: period === 'day' ? 2.5 : period === 'week' ? 8 : 12,
      series: revenueSeries,
    },
    partsSold: {
      total: profile.partsSold + tenantOffset,
      delta: period === 'month' ? 11 : 4,
      series: profile.series,
    },
    activeOrders: {
      total: 9 + tenantOffset,
      delta: -1,
      series: profile.series.map((value) => value + 1),
    },
    topPart: {
      id: `top-part-${tenantId}`,
      name: tenantId === 'tenant-2' ? 'Капот' : 'Фара',
      photoUrl: null,
      revenueUsd: 420 + tenantOffset,
      salesCount: 6 + tenantOffset,
      salesSeries: profile.series,
    },
  }
}

function authorizeDashboard(request, response) {
  const authorization = request.headers.authorization
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null
  if (accessToken === null || !accessTokens.has(accessToken)) {
    sendProblem(response, 401, 'AUTH_REQUIRED', 'Authentication required')
    return null
  }

  const tenantId = request.headers['x-tenant-id']
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    sendProblem(response, 400, 'TENANT_REQUIRED', 'Tenant required')
    return null
  }
  if (tenantId === 'tenant-3') {
    sendProblem(response, 403, 'TENANT_INACTIVE', 'Tenant inactive')
    return null
  }
  if (!(tenantId in dashboardSummaries)) {
    sendProblem(response, 404, 'TENANT_NOT_FOUND', 'Tenant not found')
    return null
  }
  return tenantId
}

function sendJson(response, status, value, extraHeaders = {}) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  })
  response.end(body)
}

function sendProblem(response, status, code, message) {
  sendJson(response, status, { error: { code, message } })
}

async function readJson(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw new Error('BODY_TOO_LARGE')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${hostname}:${port}`)

  try {
    if (request.method === 'POST' && url.pathname === '/_test/reset') {
      const options = await readJson(request)
      if (!isObject(options)) {
        sendProblem(response, 400, 'INVALID_RESET', 'Invalid reset payload')
        return
      }
      reset(options)
      sendJson(response, 200, { reset: true })
      return
    }

    if (request.method === 'GET' && url.pathname === '/_test/stats') {
      sendJson(response, 200, {
        sendRequests,
        verifyRequests,
        refreshRequests,
        logoutRequests,
        dashboardRequests,
        dashboardAnalyticsRequests,
        dashboardDelayPending: delayedDashboard?.pending === true,
      })
      return
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/_test/dashboard/reset'
    ) {
      const options = await readJson(request)
      if (!isObject(options)) {
        sendProblem(
          response,
          400,
          'INVALID_DASHBOARD_RESET',
          'Invalid dashboard reset payload',
        )
        return
      }
      resetDashboard(options)
      sendJson(response, 200, { reset: true })
      return
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/_test/dashboard/delay'
    ) {
      const options = await readJson(request)
      if (
        !isObject(options) ||
        typeof options.tenantId !== 'string' ||
        !(options.tenantId in dashboardSummaries)
      ) {
        sendProblem(
          response,
          400,
          'INVALID_DASHBOARD_DELAY',
          'Invalid dashboard delay payload',
        )
        return
      }
      if (delayedDashboard) {
        sendProblem(
          response,
          409,
          'DASHBOARD_DELAY_ALREADY_ARMED',
          'Dashboard delay already armed',
        )
        return
      }
      armDashboardDelay(options.tenantId)
      sendJson(response, 200, { delayed: true })
      return
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/_test/dashboard/release'
    ) {
      if (!releaseDashboardDelay()) {
        sendProblem(
          response,
          409,
          'DASHBOARD_DELAY_NOT_ARMED',
          'Dashboard delay is not armed',
        )
        return
      }
      sendJson(response, 200, { released: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/_test/logout/delay') {
      if (delayedLogout) {
        sendProblem(
          response,
          409,
          'LOGOUT_DELAY_ALREADY_ARMED',
          'Logout delay already armed',
        )
        return
      }
      armLogoutDelay()
      sendJson(response, 200, { delayed: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/_test/logout/release') {
      if (!releaseLogoutDelay()) {
        sendProblem(
          response,
          409,
          'LOGOUT_DELAY_NOT_ARMED',
          'Logout delay is not armed',
        )
        return
      }
      sendJson(response, 200, { released: true })
      return
    }

    if (request.method === 'POST' && url.pathname === '/auth/phone') {
      const body = await readJson(request)
      if (!isObject(body) || typeof body.phone !== 'string') {
        sendProblem(response, 400, 'INVALID_SEND', 'Invalid send payload')
        return
      }
      sendRequests += 1
      sendJson(response, 200, {
        data: {
          cooldownSeconds: 0,
          retryAfterSeconds: 0,
          internalSecret: 'identity-send-internal-secret',
        },
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/auth/verify') {
      const body = await readJson(request)
      if (
        !isObject(body) ||
        typeof body.phone !== 'string' ||
        typeof body.code !== 'string'
      ) {
        sendProblem(response, 400, 'INVALID_VERIFY', 'Invalid verify payload')
        return
      }
      verifyRequests += 1
      if (body.code !== validOtp) {
        sendJson(
          response,
          400,
          {
            data: null,
            error: {
              code: 'OTP_INVALID',
              message: 'Invalid OTP identity-otp-internal-secret',
              details: {
                internalToken: 'identity-otp-internal-secret',
              },
            },
          },
          { 'Retry-After': '17' },
        )
        return
      }
      const session = issueSession()
      sendJson(response, 200, {
        data: {
          ...session,
          user: {
            id: 'user-1',
            phone: body.phone,
            displayName: newUser ? '' : 'Олена Коваль',
            internalSecret: 'identity-arbitrary-secret',
          },
          isNewUser: newUser,
          internalSecret: 'identity-arbitrary-secret',
        },
      })
      return
    }

    if (request.method === 'POST' && url.pathname === '/auth/refresh') {
      const body = await readJson(request)
      refreshRequests += 1
      if (
        !isObject(body) ||
        typeof body.refreshToken !== 'string' ||
        !refreshTokens.delete(body.refreshToken)
      ) {
        sendProblem(response, 401, 'REFRESH_EXPIRED', 'Refresh expired')
        return
      }
      sendJson(response, 200, { data: issueSession() })
      return
    }

    if (request.method === 'POST' && url.pathname === '/auth/logout') {
      const body = await readJson(request)
      logoutRequests += 1
      const pendingLogout = delayedLogout
      if (pendingLogout) {
        await pendingLogout.promise
        if (delayedLogout === pendingLogout) delayedLogout = null
      }
      if (isObject(body) && typeof body.refreshToken === 'string') {
        refreshTokens.delete(body.refreshToken)
      }
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      response.end()
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/v1/dashboard') {
      const tenantId = authorizeDashboard(request, response)
      if (tenantId === null) return
      dashboardRequests += 1
      if (dashboardSummaryFailures > 0) {
        dashboardSummaryFailures -= 1
        sendProblem(
          response,
          503,
          'DASHBOARD_FIXTURE_FAILURE',
          'Dashboard fixture request failed',
        )
        return
      }
      const pendingDashboard = delayedDashboard
      if (pendingDashboard?.tenantId === tenantId) {
        pendingDashboard.pending = true
        await pendingDashboard.promise
        if (delayedDashboard === pendingDashboard) delayedDashboard = null
      }
      sendJson(response, 200, { data: dashboardSummaries[tenantId] })
      return
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/api/v1/dashboard/analytics'
    ) {
      const tenantId = authorizeDashboard(request, response)
      if (tenantId === null) return
      const periods = url.searchParams.getAll('period')
      const period = periods[0]
      if (periods.length !== 1 || !dashboardPeriods.includes(period)) {
        sendProblem(
          response,
          400,
          'INVALID_DASHBOARD_PERIOD',
          'Invalid dashboard period',
        )
        return
      }
      dashboardAnalyticsRequests[period] += 1
      if (dashboardAnalyticsFailures[period] > 0) {
        dashboardAnalyticsFailures[period] -= 1
        sendProblem(
          response,
          503,
          'DASHBOARD_ANALYTICS_FIXTURE_FAILURE',
          'Dashboard analytics fixture request failed',
        )
        return
      }
      sendJson(response, 200, {
        data: dashboardAnalytics(tenantId, period),
      })
      return
    }

    if (
      url.pathname === '/api/v1/dashboard' ||
      url.pathname === '/api/v1/dashboard/analytics'
    ) {
      sendProblem(
        response,
        405,
        'FIXTURE_METHOD_NOT_ALLOWED',
        'Dashboard fixture method not allowed',
      )
      return
    }

    sendProblem(response, 404, 'NOT_FOUND', 'Fixture route not found')
  } catch (error) {
    if (error instanceof SyntaxError) {
      sendProblem(response, 400, 'INVALID_JSON', 'Invalid JSON')
      return
    }
    if (error instanceof Error && error.message === 'BODY_TOO_LARGE') {
      sendProblem(response, 413, 'BODY_TOO_LARGE', 'Request body is too large')
      return
    }
    sendProblem(response, 500, 'FIXTURE_ERROR', 'Fixture request failed')
  }
})

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
})

server.on('error', (error) => {
  const detail = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    `auth e2e upstream failed to bind ${hostname}:${port}: ${detail}\n`,
  )
  process.exitCode = 1
})

let closing = false
function shutdown(signal) {
  if (closing) return
  closing = true
  releaseLogoutDelay()
  releaseDashboardDelay()
  server.close((error) => {
    if (error) {
      process.stderr.write(
        `auth e2e upstream failed to close after ${signal}: ${error.message}\n`,
      )
      process.exitCode = 1
    }
  })
  server.closeIdleConnections()
  setImmediate(() => server.closeAllConnections())
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

server.listen(port, hostname)
