/**
 * Cloudflare Worker — reverse proxy for Soft1 Web Services.
 *
 * Soft1 does not emit CORS headers, so browsers cannot talk to
 * `https://<sn>.oncloud.gr/s1services` directly. This worker strips the
 * serial number from the path, forwards the request to the matching
 * Soft1 host, and decorates the response with permissive CORS headers.
 *
 * Expected request shape from the web app:
 *   GET    /<sn>/s1services?info
 *   POST   /<sn>/s1services                 (core services: login, authenticate, getData, setData)
 *   POST   /<sn>/s1services/JS/<ns>/<method>  (CSTs: aicmp.pack-delivery/*)
 */

export interface Env {
  ALLOWED_SERIALS: string;
  ALLOWED_ORIGINS: string;
}

const SERIAL_RX = /^\d{10,20}$/;

function corsHeaders(env: Env, reqOrigin: string | null): HeadersInit {
  const allow = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = allow.includes('*') ? '*' : (reqOrigin && allow.includes(reqOrigin) ? reqOrigin : allow[0] ?? '*');
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function isSerialAllowed(env: Env, serial: string): boolean {
  const list = (env.ALLOWED_SERIALS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(serial);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, origin) });
    }

    // Expected path: /<serial>/s1services[/...]
    const parts = url.pathname.split('/').filter(Boolean);
    const [serial, marker, ...rest] = parts;
    if (!serial || !SERIAL_RX.test(serial) || marker !== 's1services') {
      return new Response('Not Found', { status: 404, headers: corsHeaders(env, origin) });
    }
    if (!isSerialAllowed(env, serial)) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders(env, origin) });
    }

    const upstream = new URL(`https://${serial}.oncloud.gr/s1services${rest.length ? '/' + rest.join('/') : ''}`);
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
    const cors = corsHeaders(env, origin);
    for (const [k, v] of Object.entries(cors)) proxied.headers.set(k, v as string);
    return proxied;
  }
};
