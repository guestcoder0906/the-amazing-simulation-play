import type { IncomingMessage, ServerResponse } from 'node:http';

// Vercel serverless function (no server to host): forwards Claude requests using the CLAUDE_API_KEY env variable,
// so the key never reaches the browser. By default it adds NO limits of its own: the only limits are your real
// Anthropic account limits (credits / rate limits). Short "busy" or "rate limited" answers from Anthropic are
// retried automatically, honouring Anthropic's retry-after header.
// Optional per-visitor caps (to protect your credits from heavy use) can be switched on with env variables:
//   SHARED_LIMIT_PER_10MIN, SHARED_LIMIT_PER_DAY   (unset or 0 = no app-side limit)

type VercelRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[]>;
  headers: IncomingMessage['headers'];
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => VercelResponse;
  send: (body: unknown) => VercelResponse;
};

const WINDOW_MS = 10 * 60 * 1000;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_TOKENS = 16000;
const DEFAULT_MODEL = 'claude-haiku-5-5';
// only these models are forwarded (quick tasks: Haiku 5.5; building / coding: Opus 5.5 at low effort)
const ALLOWED_MODELS = new Set(['claude-haiku-5-5', 'claude-opus-5-5']);

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const rateBuckets = new Map<string, { short: number[]; daily: number[] }>();

function getClientKey(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff || req.socket?.remoteAddress || 'unknown';
  return String(raw).split(',')[0].trim() || 'unknown';
}

function checkRateLimit(ip: string, per10: number, perDay: number): { ok: boolean; retryAfterSec?: number } {
  if (!per10 && !perDay) return { ok: true };
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket) {
    bucket = { short: [], daily: [] };
    rateBuckets.set(ip, bucket);
  }
  bucket.short = bucket.short.filter((t) => now - t < WINDOW_MS);
  bucket.daily = bucket.daily.filter((t) => now - t < DAILY_WINDOW_MS);
  if (per10 && bucket.short.length >= per10) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - bucket.short[0])) / 1000)) };
  }
  if (perDay && bucket.daily.length >= perDay) {
    return { ok: false, retryAfterSec: Math.max(60, Math.ceil((DAILY_WINDOW_MS - (now - bucket.daily[0])) / 1000)) };
  }
  bucket.short.push(now);
  bucket.daily.push(now);
  if (rateBuckets.size > 2000) {
    for (const [k, b] of rateBuckets) if (!b.daily.some((t) => now - t < DAILY_WINDOW_MS)) rateBuckets.delete(k);
  }
  return { ok: true };
}

function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body as Record<string, unknown>);
  if (typeof req.body === 'string' && req.body.trim()) return Promise.resolve(JSON.parse(req.body) as Record<string, unknown>);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = (process.env.CLAUDE_API_KEY || '').trim();
  const per10 = num(process.env.SHARED_LIMIT_PER_10MIN);
  const perDay = num(process.env.SHARED_LIMIT_PER_DAY);

  if (req.method === 'GET') {
    return res.status(200).json({ configured: Boolean(apiKey), limits: { per10Min: per10 || null, perDay: perDay || null, maxTokens: MAX_TOKENS } });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'Use POST' } });
  }
  if (!apiKey) {
    return res.status(503).json({
      error: { code: 'not_granted', message: 'Shared CLAUDE_API_KEY is not configured on this deployment. Enter your own Claude API key instead.' },
    });
  }

  const limit = checkRateLimit(getClientKey(req), per10, perDay);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSec || 60));
    return res.status(429).json({
      error: { code: 'rate_limited', message: 'Shared usage limit for this site reached. Wait a little or enter your own Claude API key.', retry_after: limit.retryAfterSec },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: { code: 'invalid_request', message: 'Invalid JSON body' } });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: { code: 'invalid_request', message: 'messages array is required' } });
  }

  const asked = typeof body.model === 'string' ? body.model.trim() : '';
  const reqModel = ALLOWED_MODELS.has(asked) ? asked : DEFAULT_MODEL;
  const payload: Record<string, unknown> = {
    model: reqModel,
    max_tokens: Math.min(Number(body.max_tokens) || 8192, MAX_TOKENS),
    messages: body.messages,
  };
  if (Array.isArray(body.tools) && body.tools.length) payload.tools = body.tools;
  if (typeof body.system === 'string' || Array.isArray(body.system)) payload.system = body.system;
  // effort (output_config) is forwarded; temperature and forced tool_choice are not (Opus 5.5 rejects them)
  if (body.output_config && typeof body.output_config === 'object') payload.output_config = body.output_config;
  if (body.tool_choice && typeof body.tool_choice === 'object' && (body.tool_choice as { type?: string }).type === 'auto') payload.tool_choice = body.tool_choice;

  const forward = (p: Record<string, unknown>) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(p),
    });

  try {
    const started = Date.now();
    let upstream = await forward(payload);
    // brief overload / rate-limit answers are retried (within the function's time budget) instead of failing the player
    for (let attempt = 0; attempt < 4 && (upstream.status === 429 || upstream.status === 529 || upstream.status === 503); attempt++) {
      const ra = Number(upstream.headers.get('retry-after'));
      const wait = Math.min(15000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500 * 2 ** attempt);
      if (Date.now() - started + wait > 45000) break;
      await sleep(wait);
      upstream = await forward(payload);
    }
    const text = await upstream.text();
    const ra = upstream.headers.get('retry-after');
    if (ra) res.setHeader('Retry-After', ra);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res.status(502).json({
      error: { code: 'api_error', message: 'Failed to reach Claude API: ' + (err instanceof Error ? err.message : String(err)) },
    });
  }
}
