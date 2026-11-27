import type { IncomingMessage, ServerResponse } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Vercel serverless function: fetches ONE picture from the public web for the game (the AI found it with web search and wants to look at
// it; the browser cannot read pictures from other sites itself). Only https, only public hosts (never this server's own network), only
// images, at most 6 MB, 10 s. POST { url } -> { media_type, data (base64) }.

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse & { status: (c: number) => Res; json: (b: unknown) => Res };
const MAX = 6 * 1024 * 1024;

function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.') || l === '::'; }
  const p = ip.split('.').map(Number); if (p.length !== 4) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
}
async function publicHttps(raw: string): Promise<URL | null> {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.replace(/^\[|\]$/g, ''); if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return null;
  if (isIP(h)) return privateIp(h) ? null : u;
  try { const all = await lookup(h, { all: true }); if (!all.length || all.some((a) => privateIp(a.address))) return null; } catch { return null; }
  return u;
}
function readJson(req: Req): Promise<any> {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string' && req.body.trim()) return Promise.resolve(JSON.parse(req.body));
  return new Promise((resolve, reject) => { const ch: Buffer[] = []; req.on('data', (c: Buffer) => ch.push(c)); req.on('end', () => { try { const s = Buffer.concat(ch).toString('utf8'); resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } }); req.on('error', reject); });
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  let body: any; try { body = await readJson(req); } catch { return res.status(400).json({ error: 'bad JSON' }); }
  let url = await publicHttps(String(body && body.url || ''));
  if (!url) return res.status(400).json({ error: 'only public https image links can be fetched' });
  try {
    for (let hop = 0; hop < 4; hop++) {
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 10000);
      const r = await fetch(url, { redirect: 'manual', signal: ac.signal, headers: { 'user-agent': 'AmazingSimulationGame/1.0 (image preview)', accept: 'image/*' } }); clearTimeout(tm);
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { const next = await publicHttps(new URL(r.headers.get('location') as string, url).toString()); if (!next) return res.status(400).json({ error: 'redirected somewhere that cannot be fetched' }); url = next; continue; }
      if (!r.ok) return res.status(502).json({ error: 'the site answered ' + r.status });
      const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(type)) return res.status(415).json({ error: 'that link is not a picture (' + (type || 'unknown type') + ')' });
      const len = Number(r.headers.get('content-length') || 0); if (len > MAX) return res.status(413).json({ error: 'picture too large' });
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > MAX) return res.status(413).json({ error: 'picture too large' });
      return res.status(200).json({ media_type: type === 'image/jpg' ? 'image/jpeg' : type, data: buf.toString('base64'), url: url.toString() });
    }
    return res.status(400).json({ error: 'too many redirects' });
  } catch (e: any) { return res.status(502).json({ error: 'could not fetch it: ' + String(e && e.message || e).slice(0, 200) }); }
}
