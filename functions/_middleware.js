// Cloudflare Pages middleware — runs at the edge for every request.
//
// API paths get reverse-proxied to the CF Tunnel backstage hostname (which
// terminates at the env's nginx-gateway in GCP). Everything else falls
// through to the static SPA bundle.
//
// Configure per Pages project (Settings → Environment variables):
//   TUNNEL_API_HOST = internal-qa.rozbirka.com   (qa)
//   TUNNEL_API_HOST = internal.rozbirka.com      (prod)

const API_PREFIXES = ['/api/', '/auth/', '/.well-known/']

export const onRequest = async ({ request, env, next }) => {
  const url = new URL(request.url)

  if (!API_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return next()
  }

  if (!env.TUNNEL_API_HOST) {
    return new Response('TUNNEL_API_HOST not configured', { status: 500 })
  }

  const target = `https://${env.TUNNEL_API_HOST}${url.pathname}${url.search}`
  return fetch(new Request(target, request))
}
