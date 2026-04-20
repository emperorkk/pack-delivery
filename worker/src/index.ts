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

function parseCharset(contentType: string | null): string | null {
  if (!contentType) return null;
  const m = /charset=([^;\s]+)/i.exec(contentType);
  return m ? m[1].toLowerCase().replace(/^"|"$/g, '') : null;
}

function isTextual(contentType: string | null): boolean {
  if (!contentType) return true; // Soft1 CST/JSON paths don't serve binary
  return /^(text\/|application\/(?:json|javascript|xml|x-www-form-urlencoded)|application\/.*\+(?:json|xml))/i.test(
    contentType
  );
}

/**
 * Soft1 CST endpoints frequently emit Greek text as windows-1253 (ISO 8859-7 /
 * legacy Greek codepage) even when the request carries `enc:"utf8"`. The
 * browser's `res.json()` is hard-coded to UTF-8, which mojibakes Greek into
 * U+FFFD. We normalise everything to UTF-8 at the proxy so callers can treat
 * the response as plain JSON.
 */
async function normaliseToUtf8(res: Response): Promise<Response> {
  const contentType = res.headers.get('content-type');
  if (!isTextual(contentType)) return res;

  const buf = await res.arrayBuffer();
  const declared = parseCharset(contentType);
  let text: string;
  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      text = new TextDecoder(declared, { fatal: false }).decode(buf);
    } catch {
      text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    }
  } else {
    // No (or UTF-8) charset declared — trust UTF-8 but fall back to
    // windows-1253 if the decoded text is riddled with replacement chars.
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (utf8.includes('\uFFFD')) {
      try {
        text = new TextDecoder('windows-1253', { fatal: false }).decode(buf);
      } catch {
        text = utf8;
      }
    } else {
      text = utf8;
    }
  }

  const newHeaders = new Headers(res.headers);
  const baseCT = (contentType ?? 'application/json').replace(/;\s*charset=[^;]*/i, '');
  newHeaders.set('content-type', `${baseCT}; charset=utf-8`);
  newHeaders.delete('content-length');
  newHeaders.delete('content-encoding');
  return new Response(text, {
    status: res.status,
    statusText: res.statusText,
    headers: newHeaders
  });
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

  const normalised = await normaliseToUtf8(res);
  const proxied = new Response(normalised.body, normalised);
  for (const [k, v] of Object.entries(corsHeaders(env, origin))) proxied.headers.set(k, v);
  return proxied;
}

/**
 * The admin SPA lives at /admin (HTML entry emitted by Vite as `admin.html`)
 * and ships its own bundle. For any client-side navigation under /admin/...
 * we need to serve `admin.html`, mirroring the driver PWA's SPA fallback
 * to index.html (which the ASSETS binding handles for /). Static asset
 * requests (`/assets/...`) fall through unchanged.
 */
async function handleAdminNavigation(req: Request, env: Env, url: URL): Promise<Response> {
  // Requests for named files under /admin (e.g. a hypothetical /admin/foo.png)
  // keep their path. We only rewrite extensionless navigations.
  const last = url.pathname.split('/').pop() ?? '';
  if (last.includes('.')) {
    return env.ASSETS.fetch(req);
  }
  const rewritten = new Request(new URL('/admin.html', url).toString(), req);
  return env.ASSETS.fetch(rewritten);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(req, env, url);
    }
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return handleAdminNavigation(req, env, url);
    }
    // Everything else is the PWA: static assets + SPA fallback.
    return env.ASSETS.fetch(req);
  }
};
