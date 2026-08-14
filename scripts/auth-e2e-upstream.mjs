import { createServer } from 'node:http'

const hostname = '127.0.0.1'
const port = 4174
const maxBodyBytes = 16 * 1024

let newUser = false
let tokenSequence = 0
let verifyRequests = 0
let refreshRequests = 0
let logoutRequests = 0
const refreshTokens = new Set()

function reset(options = {}) {
  newUser = options.newUser === true
  tokenSequence = 0
  verifyRequests = 0
  refreshRequests = 0
  logoutRequests = 0
  refreshTokens.clear()
}

function issueSession() {
  tokenSequence += 1
  const refreshToken = `refresh-${tokenSequence}`
  refreshTokens.add(refreshToken)
  return {
    refreshToken,
    accessToken: `access-${tokenSequence}`,
    expiresIn: 900,
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
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
        verifyRequests,
        refreshRequests,
        logoutRequests,
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
      const session = issueSession()
      sendJson(response, 200, {
        data: {
          ...session,
          user: {
            id: 'user-1',
            phone: body.phone,
            displayName: newUser ? '' : 'Олена Коваль',
          },
          isNewUser: newUser,
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
      if (isObject(body) && typeof body.refreshToken === 'string') {
        refreshTokens.delete(body.refreshToken)
      }
      response.writeHead(204, { 'Cache-Control': 'no-store' })
      response.end()
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
  server.close((error) => {
    if (error) {
      process.stderr.write(
        `auth e2e upstream failed to close after ${signal}: ${error.message}\n`,
      )
      process.exitCode = 1
    }
  })
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

server.listen(port, hostname)
