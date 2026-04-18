/**
 * Cloudflare Worker — single endpoint hosting both the pack-delivery PWA
 * (served from `web/dist` via the ASSETS binding) and a reverse proxy for
 * Soft1 Web Services (Soft1 emits no CORS headers, so browsers cannot talk
 * to it directly).
 *
 * Routing:
 *   /api/<sn>/s1services?info                                — preflight GET
 *   /api/<sn>/s1services                                     — login/authenticate/getData/setData
 *   /api/<sn>/s1services/JS/aicmp.pack-delivery/<method>     — CST calls
 *   /<anything else>                                         — PWA static assets
 *                                                              (SPA fallback to index.html)
 *
 * The PWA itself fetches the proxy via the *relative* path `/api/...`, so it
 * inherits same-origin behaviour and zero CORS overhead. The CORS headers
 * below only matter for cross-origin clients (e.g. another Pages deployment
 * pointing at this Worker).
 */

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  ALLOWED_SERIALS: string;
  ALLOWED_ORIGINS: string;
}

const SERIAL_RX = /^\d{10,20}$/;

function corsHeaders(env: Env, reqOrigin: string | null): Record<string, string> {
  const allow = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = allow.includes('*')
    ? '*'
    : reqOrigin && allow.includes(reqOrigin)
      ? reqOrigin
      : (allow[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function isSerialAllowed(env: Env, serial: string): boolean {
  const list = (env.ALLOWED_SERIALS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(serial);
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
  }

  // Path layout: /api/<serial>/s1services[/...]
  const parts = url.pathname.split('/').filter(Boolean);
  // parts[0] === 'api'
  const [, serial, marker, ...rest] = parts;
  if (!serial || !SERIAL_RX.test(serial) || marker !== 's1services') {
    return new Response('Not Found', { status: 404, headers: corsHeaders(env, origin) });
  }
  if (!isSerialAllowed(env, serial)) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders(env, origin) });
  }

  const upstream = new URL(
    `https://${serial}.oncloud.gr/s1services${rest.length ? '/' + rest.join('/') : ''}`
  );
  upstream.search = url.search;

  const init: RequestInit = {
    method: req.method,
    headers: { 'content-type': req.headers.get('content-type') ?? 'application/json' }
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  let res: Response;
  try {
    res = await fetch(upstream.toString(), init);
  } catch (err) {
    return new Response(`Upstream fetch failed: ${String(err)}`, {
      status: 502,
      headers: corsHeaders(env, origin)
    });
  }

  const proxied = new Response(res.body, res);
  for (const [k, v] of Object.entries(corsHeaders(env, origin))) proxied.headers.set(k, v);
  return proxied;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(req, env, url);
    }
    // Everything else is the PWA: static assets + SPA fallback.
    return env.ASSETS.fetch(req);
  }
};
