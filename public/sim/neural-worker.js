// In-browser neural text-to-speech (Kokoro-82M via kokoro-js / ONNX Runtime Web).
// Runs entirely on the visitor's device inside this worker, so the 3D scene never stalls while a line is synthesised.
// No server: the model is fetched once from the Hugging Face CDN and then cached by the browser.
import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null;
let loading = null;

async function load(device) {
  if (tts) return tts;
  if (!loading) {
    const progress = (p) => {
      if (p && p.status === 'progress' && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
    };
    loading = (async () => {
      // WebGPU (fp32) is fastest on capable desktops; WASM q8 (~90 MB) everywhere else
      if (device === 'webgpu') {
        try { return await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'webgpu', progress_callback: progress }); }
        catch (e) { postMessage({ type: 'log', text: 'webgpu failed, using wasm: ' + (e && e.message) }); }
      }
      if (device === 'wasm-full') { try { return await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'wasm', progress_callback: progress }); } catch (e) { postMessage({ type: 'log', text: 'full model on the CPU failed, using the compact one: ' + (e && e.message) }); } } /* full-quality weights on the CPU */
      return KokoroTTS.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm', progress_callback: progress });
    })();
  }
  tts = await loading;
  return tts;
}

// ---------------------------------------------------------------- formant-preserving pitch / time shaping (TD-PSOLA)
// Speeding a recording up to raise its pitch also squeezes its formants (the "chipmunk" effect) and changes its length.
// PSOLA instead cuts the voice into grains one pitch period long (each grain keeps the vocal-tract shape = who it sounds
// like) and lays them back down closer together / further apart for a new pitch, repeating or skipping grains for a new
// length. So a character sings any note, holds it as long as needed, and still sounds like themselves.
function pitchTrack(x, sr, hop) {
  const minLag = Math.floor(sr / 420), maxLag = Math.floor(sr / 65), W = maxLag * 2;
  const n = Math.max(1, Math.ceil(x.length / hop)), f = new Float32Array(n);
  // voicing cutoff relative to this clip's loudness, so quiet voiced sounds (n, m, l, soft endings) are still tuned to the note
  let pkE = 0; for (let i = 0; i < x.length; i += 64) { let s = 0; const e = Math.min(x.length, i + 256); for (let k = i; k < e; k++) s += x[k] * x[k]; pkE = Math.max(pkE, s / Math.max(1, e - i)); } const eMin = Math.max(2e-7, pkE * 0.0015);
  for (let i = 0; i < n; i++) {
    const c = i * hop - (W >> 1); if (c < 0 || c + W + maxLag >= x.length) continue;
    let e0 = 0; for (let k = 0; k < W; k++) e0 += x[c + k] * x[c + k];
    if (e0 / W < eMin) continue;
    let best = 0; const rr = new Float32Array(maxLag + 2);
    for (let lag = minLag; lag <= maxLag; lag++) {
      let s = 0, e1 = 0; for (let k = 0; k < W; k += 2) { s += x[c + k] * x[c + k + lag]; e1 += x[c + k + lag] * x[c + k + lag]; }
      rr[lag] = s / Math.sqrt((e0 / 2) * e1 + 1e-12); if (rr[lag] > best) best = rr[lag];
    }
    // the shortest lag nearly as periodic as the best is the true period (a longer one would be an octave-down error)
    if (best > 0.42) for (let lag = minLag + 1; lag < maxLag; lag++) if (rr[lag] >= best * 0.92 && rr[lag] >= rr[lag - 1] && rr[lag] >= rr[lag + 1]) { f[i] = sr / lag; break; }
  }
  // smooth: median of 5, drop octave jumps
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) { const w = []; for (let k = -2; k <= 2; k++) { const v = f[i + k]; if (v > 0) w.push(v); } if (f[i] > 0 && w.length >= 2) { w.sort((a, b) => a - b); g[i] = w[w.length >> 1]; } }
  // anti-crack clean-up: (1) fold octave errors back toward the voice's own pitch, (2) drop tiny voiced islands,
  // (3) bridge short voiced dropouts inside a vowel, (4) smooth frame-to-frame jumps. Any of these left in makes the
  // grains change size suddenly, which is heard as a voice crack.
  const med = (() => { const a = Array.from(g).filter((v) => v > 0).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; })();
  if (med) for (let i = 0; i < n; i++) if (g[i] > 0) { while (g[i] > med * 1.65) g[i] /= 2; while (g[i] < med * 0.6) g[i] *= 2; }
  for (let i = 0; i < n;) { if (g[i] > 0) { let j = i; while (j < n && g[j] > 0) j++; if (j - i < 4) for (let k = i; k < j; k++) g[k] = 0; i = j; } else i++; }
  for (let i = 1; i < n;) { if (!(g[i] > 0) && g[i - 1] > 0) { let j = i; while (j < n && !(g[j] > 0)) j++; if (j < n && j - i <= 6) for (let k = i; k < j; k++) g[k] = g[i - 1] + ((g[j] - g[i - 1]) * (k - i + 1)) / (j - i + 1); i = j; } else i++; }
  for (let i = 1; i < n; i++) if (g[i] > 0 && g[i - 1] > 0) { const r = g[i] / g[i - 1]; if (r > 1.06) g[i] = g[i - 1] * 1.06; else if (r < 1 / 1.06) g[i] = g[i - 1] / 1.06; }
  return g;
}
function median(arr) { const a = Array.from(arr).filter((v) => v > 0).sort((p, q) => p - q); return a.length ? a[a.length >> 1] : 0; }
function trimSilence(x, sr) {
  let s = 0, e = x.length - 1; while (s < e && Math.abs(x[s]) < 0.012) s++; while (e > s && Math.abs(x[e]) < 0.012) e--;
  s = Math.max(0, s - Math.round(sr * 0.01)); e = Math.min(x.length - 1, e + Math.round(sr * 0.03)); return x.slice(s, e + 1);
}
// shape = { ratio } (constant pitch factor, speech)
//      or { notes:[Hz per syllable], target:seconds, vib, vibDepth, vibRate, style, phraseEnd, trim } (singing)
function shape(x, sr, sh) {
  if (sh.trim) x = trimSilence(x, sr);
  const hop = Math.round(sr * 0.005), f = pitchTrack(x, sr, hop), f0 = median(f) || 0;
  const sing = Array.isArray(sh.notes) && sh.notes.length;
  if (!sing && !sh.expr && !sh.fry && (!sh.ratio || Math.abs(sh.ratio - 1) < 0.004)) return { pcm: x, f0 };
  const N = x.length, nF = f.length;
  const voicedF = (i) => f[Math.min(nF - 1, Math.max(0, i))] > 0;
  const per = (i) => { const v = f[Math.min(nF - 1, Math.max(0, Math.round(i / hop)))]; return v > 0 ? sr / v : 0; };

  // ---- time map: consonants keep their natural length, only voiced sound (the vowels) is stretched to fill the note
  let L = N, aFrameStart = null, oFrameStart = null, vRate = 1;
  if (sing && sh.target) {
    const want = Math.round(sh.target * sr); let V = 0; for (let i = 0; i < nF; i++) if (voicedF(i)) V += hop; const U = Math.max(0, N - V);
    vRate = V > 0 ? Math.max(0.45, (want - U) / V) : 1; // output samples per input sample in voiced frames
    const uRate = V > 0 ? 1 : Math.max(0.5, want / Math.max(1, N));
    oFrameStart = new Float64Array(nF + 1); aFrameStart = new Float64Array(nF + 1);
    for (let i = 0; i < nF; i++) { aFrameStart[i] = i * hop; oFrameStart[i + 1] = oFrameStart[i] + hop * (voicedF(i) ? vRate : uRate); }
    aFrameStart[nF] = nF * hop; L = Math.max(1, Math.round(oFrameStart[nF]));
  } else if (sh.target) L = Math.round(sh.target * sr);
  let fi = 0;
  const A = (ts) => { // output sample -> analysis sample
    if (!oFrameStart) return ts * (N / L);
    while (fi + 1 < nF && oFrameStart[fi + 1] <= ts) fi++; while (fi > 0 && oFrameStart[fi] > ts) fi--;
    const span = oFrameStart[fi + 1] - oFrameStart[fi] || 1; return aFrameStart[fi] + ((ts - oFrameStart[fi]) / span) * hop;
  };

  // ---- pitch marks: one per glottal period, tracked period-to-period on a smoothed copy so they stay phase-consistent (no phasiness)
  const lp = new Float32Array(N); { let s = 0; const a = Math.exp((-2 * Math.PI * 900) / sr); for (let i = 0; i < N; i++) { s = a * s + (1 - a) * x[i]; lp[i] = s; } }
  const marks = [], mper = [];
  for (let t = 0; t < N;) {
    const p = per(t);
    if (p) {
      const guess = marks.length && mper[marks.length - 1] ? marks[marks.length - 1] + mper[marks.length - 1] : t;
      const c = Math.round(Math.max(t, guess)), r = Math.round(p * (marks.length && mper[marks.length - 1] ? 0.18 : 0.5));
      let b = c, bv = -Infinity; for (let k = Math.max(0, c - r); k <= Math.min(N - 1, c + r); k++) if (lp[k] > bv) { bv = lp[k]; b = k; }
      if (!marks.length || b > marks[marks.length - 1] + p * 0.5) { marks.push(b); mper.push(p); }
      t = b + Math.max(16, Math.round(p * 0.8));
    } else { marks.push(t); mper.push(0); t += Math.round(sr * 0.005); }
  }

  // ---- the sung pitch over time: notes with smooth glides, a small human scoop into each note, natural drift, vibrato that blooms
  const ns = sing ? sh.notes.length : 1, glide = 0.06 * sr, style = String(sh.style || '');
  const sad = /sad|lullaby|ballad|blues|spooky/.test(style), opera = /opera/.test(style), rock = /rock|punk|hype/.test(style);
  const scoopC = opera ? 25 : sad ? 45 : rock ? 60 : 35;
  let drift = 0, driftV = 0; const seed = ((sh.notes && sh.notes[0]) || sh.ratio || 1) * 7.3;
  const rnd = (() => { let s = Math.floor(seed * 1000) >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const targetHz = (ts) => {
    const pos = (ts / L) * ns, k = Math.min(ns - 1, Math.floor(pos)); let hz = sh.notes[k];
    const into = (pos - k) * (L / ns);
    if (k > 0 && into < glide) { const a = into / glide, prev = sh.notes[k - 1]; hz = prev * Math.pow(hz / prev, a * a * (3 - 2 * a)); }
    else if (k === 0 && into < glide) { const a = into / glide; hz *= Math.pow(2, (-scoopC * (1 - a * a * (3 - 2 * a))) / 1200); }
    const tt = ts / sr;
    if (sh.vib) { const held = Math.max(0, Math.min(1, (ts / L - 0.3) / 0.45)); const depth = (sh.vibDepth || 20) * held, rate = (sh.vibRate || 5.2) * (1 + 0.04 * Math.sin(tt * 1.7)); hz *= Math.pow(2, (depth * Math.sin(2 * Math.PI * rate * tt)) / 1200); }
    if (sh.phraseEnd && sad && ts > L * 0.8) hz *= Math.pow(2, (-35 * ((ts / L - 0.8) / 0.2)) / 1200); // a soft sigh down at a sad phrase end
    return hz * Math.pow(2, drift / 1200);
  };

  // ---- overlap-add resynthesis
  // Each output grain is a smooth blend of the two analysis periods around the current read position (aligned at their pitch
  // marks), so a held vowel evolves continuously instead of repeating or hopping between cycles: no buzz, ring, flutter or phasing.
  const y = new Float32Array(L + 4096);
  let mi = 0;
  for (let ts = 0; ts < L;) {
    const ta = A(ts);
    while (mi + 1 < marks.length && marks[mi + 1] <= ta) mi++;
    while (mi > 0 && marks[mi] > ta) mi--;
    const m0 = marks[mi], p0 = mper[mi], m1 = mi + 1 < marks.length ? marks[mi + 1] : m0, p1 = mi + 1 < marks.length ? mper[mi + 1] : p0;
    let step;
    if (p0 && p1) {
      const fr = m1 > m0 ? Math.max(0, Math.min(1, (ta - m0) / (m1 - m0))) : 0, pa = p0 + (p1 - p0) * fr;
      if (sing) { driftV += (rnd() - 0.5) * 0.8 - drift * 0.03; driftV *= 0.92; drift = Math.max(-7, Math.min(7, drift + driftV)); }
      let ratio = sing ? targetHz(ts) / (sr / pa) : sh.ratio;
      if (!sing && sh.expr && f0 > 0) ratio = (ratio || 1) * Math.max(0.72, Math.min(1.3, Math.pow(Math.max(0.6, Math.min(1.7, (sr / pa) / f0)), sh.expr - 1))); /* peaks capped so excitement never jumps up into a thin, nerdy register */ // widen the natural intonation: big theatrical pitch excursions
      const fryOn = !sing && sh.fry && ts > L * 0.72; if (fryOn) ratio = (ratio || 1) * 0.8; // frustration: the line drops low into gravelly fry
      ratio = Math.max(0.5, Math.min(2.2, ratio || 1));
      /* real voices are never machine-perfect: ~0.5% cycle-to-cycle timing jitter and ~2% loudness shimmer while singing */
      step = (pa / ratio) * (sing ? 1 + (rnd() - 0.5) * 0.01 : fryOn ? 1 + (rnd() - 0.5) * 0.35 : 1); const half = Math.round(pa), w0 = Math.min(1, step / pa) * (sing ? 1 + (rnd() - 0.5) * 0.04 : fryOn ? (rnd() < 0.5 ? 0.55 : 1.15) : 1), d0 = Math.round(ts);
      for (let k = -half; k <= half; k++) {
        const di = d0 + k; if (di < 0 || di >= y.length) continue;
        const a0 = m0 + k, a1 = m1 + k; const v0 = a0 >= 0 && a0 < N ? x[a0] : 0, v1 = a1 >= 0 && a1 < N ? x[a1] : 0;
        y[di] += (v0 * (1 - fr) + v1 * fr) * w0 * (0.5 + 0.5 * Math.cos((Math.PI * k) / half));
      }
    } else {
      const half = Math.round(sr * 0.005); step = half; // unvoiced (s, f, t...): copied at its own pace
      for (let k = -half; k <= half; k++) { const si = Math.round(ta) + k, di = Math.round(ts) + k; if (si < 0 || si >= N || di < 0 || di >= y.length) continue; y[di] += x[si] * (0.5 + 0.5 * Math.cos((Math.PI * k) / half)); }
    }
    ts += Math.max(8, step);
  }
  const out = y.slice(0, L);
  if (sing) {
    // phrasing: a gentle swell into held notes and a natural release at the end (emotion comes from dynamics as much as pitch)
    const sw = Math.round(L * 0.35);
    for (let i = 0; i < L; i++) { const a = i / L; let g = 1; if (sh.vib) g *= 0.9 + 0.1 * Math.min(1, i / Math.max(1, sw)); if (a > 0.82) g *= 1 - ((a - 0.82) / 0.18) * (sh.phraseEnd ? 0.55 : 0.25); out[i] *= g; }
    // a little air: very soft breath noise shaped by the voice itself keeps long notes from sounding synthetic
    let nb = 0; const br = sad ? 0.06 : 0.035; for (let i = 0; i < L; i++) { nb = 0.96 * nb + 0.04 * (rnd() * 2 - 1); out[i] += nb * Math.abs(out[i]) * br * 6; }
  }
  const fd = Math.min(L >> 2, Math.round(sr * 0.01)); for (let i = 0; i < fd; i++) { const a = i / fd; out[i] *= a; out[L - 1 - i] *= a; }
  return { pcm: out, f0 };
}

// ---------------------------------------------------------------- phrase singing
// A whole lyric line is spoken by the model in one go (so every word is pronounced correctly, with natural flow between words),
// then its syllables are found inside the recording (the loud voiced "nuclei" between quieter consonant dips), and each syllable
// is tuned to its note and held for its own length with the same formant-preserving PSOLA, all in one continuous take.
// sp = { syl: [{ hz, dur, vib }], style, vibDepth, vibRate }
function singPhrase(x0, sr, sp) {
  const x = trimSilence(x0, sr), N = x.length, K = sp.syl.length; if (!K || N < sr * 0.1) return null;
  const hop = Math.round(sr * 0.005), f = pitchTrack(x, sr, hop), nF = f.length, med = median(f) || 0;
  // loudness envelope (25 ms), voiced frames only count as syllable centres
  const env = new Float32Array(nF); for (let i = 0; i < nF; i++) { const c = i * hop, w = Math.round(sr * 0.0125); let s = 0, n = 0; for (let k = Math.max(0, c - w); k < Math.min(N, c + w); k++) { s += x[k] * x[k]; n++; } env[i] = n ? Math.sqrt(s / n) : 0; }
  const sm = new Float32Array(nF); for (let i = 0; i < nF; i++) { let s = 0, n = 0; for (let k = i - 3; k <= i + 3; k++) if (k >= 0 && k < nF) { s += env[k]; n++; } sm[i] = s / n; }
  let peaks = []; const minGap = Math.round(0.07 * sr / hop), gmax = Math.max(...sm);
  for (let i = 1; i < nF - 1; i++) if (f[i] > 0 && sm[i] >= sm[i - 1] && sm[i] > sm[i + 1] && sm[i] > gmax * 0.12) { if (peaks.length && i - peaks[peaks.length - 1] < minGap) { if (sm[i] > sm[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i; } else peaks.push(i); }
  if (!peaks.length || peaks.length < Math.ceil(K * 0.6)) return null; // far too few syllables found: the caller sings this line word by word
  const dipBetween = (a, b) => { let m = a, mv = Infinity; for (let i = a; i <= b; i++) if (sm[i] < mv) { mv = sm[i]; m = i; } return { m, mv }; };
  while (peaks.length > K) { // merge the two neighbouring centres with the shallowest dip between them (they are one syllable)
    let bi = 0, bs = -Infinity; for (let i = 0; i + 1 < peaks.length; i++) { const d = dipBetween(peaks[i], peaks[i + 1]).mv / Math.min(sm[peaks[i]], sm[peaks[i + 1]]); if (d > bs) { bs = d; bi = i; } }
    const keep = sm[peaks[bi]] >= sm[peaks[bi + 1]] ? peaks[bi] : peaks[bi + 1]; peaks.splice(bi, 2, keep);
  }
  const bF = [0]; for (let i = 0; i + 1 < peaks.length; i++) bF.push(dipBetween(peaks[i], peaks[i + 1]).m); bF.push(nF);
  // gliding syllables (how-I, you-are) have no dip between them: split the longest voiced stretch at its weakest point until every syllable has its own piece
  while (bF.length - 1 < K) { let bi = -1, bl = 0; for (let k = 0; k + 1 < bF.length; k++) { let v = 0; for (let i = bF[k]; i < bF[k + 1]; i++) if (f[i] > 0) v++; if (v > bl) { bl = v; bi = k; } } if (bi < 0 || bl < 8) return null; const a = bF[bi], b = bF[bi + 1], q = Math.round((b - a) / 4); let m = Math.round((a + b) / 2), mv = Infinity; for (let i = a + q; i <= b - q; i++) if (sm[i] < mv) { mv = sm[i]; m = i; } bF.splice(bi + 1, 0, m); }
  // per-syllable time map: consonants keep their own length, the voiced part of each syllable stretches to fill its note
  const segOf = new Int32Array(nF); for (let k = 0; k < K; k++) for (let i = bF[k]; i < bF[k + 1]; i++) segOf[i] = k;
  const rate = new Float32Array(K);
  // only the strong, steady core of each vowel is held (never its weak / creaky edges: stretching those is what sounds like a crack)
  const core = new Uint8Array(nF);
  for (let k = 0; k < K; k++) { let pk = 0; for (let i = bF[k]; i < bF[k + 1]; i++) if (f[i] > 0 && sm[i] > pk) pk = sm[i]; for (let i = bF[k]; i < bF[k + 1]; i++) if (f[i] > 0 && sm[i] >= pk * 0.5) core[i] = 1; }
  for (let k = 0; k < K; k++) { let V = 0, U = 0; for (let i = bF[k]; i < bF[k + 1]; i++) (core[i] ? (V += hop) : (U += hop)); const T = sp.syl[k].dur * sr; rate[k] = V > 0 ? Math.max(0.45, (T - Math.min(U, T * 0.6)) / V) : Math.max(0.5, T / Math.max(hop, U)); }
  const oF = new Float64Array(nF + 1); for (let i = 0; i < nF; i++) { const k = segOf[i]; oF[i + 1] = oF[i] + hop * (core[i] ? rate[k] : Math.min(1, rate[k])); }
  const L = Math.max(1, Math.round(oF[nF])); const segO = []; for (let k = 0; k <= K; k++) segO.push(k < K ? oF[bF[k]] : L);
  let fi = 0; const A = (ts) => { while (fi + 1 < nF && oF[fi + 1] <= ts) fi++; while (fi > 0 && oF[fi] > ts) fi--; const span = oF[fi + 1] - oF[fi] || 1; return fi * hop + ((ts - oF[fi]) / span) * hop; };
  const per = (i) => { const v = f[Math.min(nF - 1, Math.max(0, Math.round(i / hop)))]; return v > 0 ? sr / v : 0; };
  const marks = pitchMarks(x, sr, per);
  const style = String(sp.style || ''), sad = /sad|lullaby|ballad|blues|spooky/.test(style), opera = /opera/.test(style), rock = /rock|punk|hype/.test(style);
  const rnd = mkRnd(K * 7919 + Math.round(N / 97)); let drift = 0, driftV = 0, sk = 0, hzS = 0;
  const targetHz = (ts) => {
    while (sk + 1 < K && segO[sk + 1] <= ts) sk++; while (sk > 0 && segO[sk] > ts) sk--;
    const s = sp.syl[sk], into = ts - segO[sk], len = Math.max(1, segO[sk + 1] - segO[sk]), gl = Math.min(0.07 * sr, len * 0.35);
    // a syllable may carry several notes (a held vowel running through a melisma): pick the current one by time
    const subs = Array.isArray(s.sub) && s.sub.length > 1 ? s.sub : null; let hz = s.hz, j = 0, subInto = into;
    if (subs) { const tot = subs.reduce((a, q) => a + q.dur, 0) || 1, pos = (into / len) * tot; let acc = 0; while (j < subs.length - 1 && acc + subs[j].dur <= pos) { acc += subs[j].dur; j++; } hz = subs[j].hz; subInto = ((pos - acc) / tot) * len; }
    const prevLast = (q) => (Array.isArray(q.sub) && q.sub.length ? q.sub[q.sub.length - 1].hz : q.hz);
    const gIn = j > 0 ? Math.min(0.06 * sr, len * 0.2) : gl;
    if (subInto < gIn) { const a = subInto / gIn, e = a * a * (3 - 2 * a); const from = j > 0 ? subs[j - 1].hz : sk > 0 ? prevLast(sp.syl[sk - 1]) : hz * Math.pow(2, -(opera ? 25 : sad ? 45 : rock ? 60 : 35) / 1200); hz = from * Math.pow(hz / from, e); }
    if (s.vib) { const held = Math.max(0, Math.min(1, (into / len - 0.3) / 0.45)), tt = ts / sr; hz *= Math.pow(2, (held * (sp.vibDepth || 20) * (1 + 0.2 * Math.sin(tt * 2.3 + sk)) * Math.sin(2 * Math.PI * (sp.vibRate || 5.2) * (1 + 0.05 * Math.sin(tt * 1.7)) * tt)) / 1200); }
    if (sad && sk === K - 1 && into > len * 0.8) hz *= Math.pow(2, (-35 * ((into / len - 0.8) / 0.2)) / 1200);
    // keep a little of the spoken melody inside each note: the natural rise and fall of the words makes it sound sung by a person
    const of = f[Math.min(nF - 1, Math.round(A(ts) / hop))]; if (of > 0 && med > 0) hz *= Math.pow(Math.max(0.85, Math.min(1.18, of / med)), 0.26);
    hz *= Math.pow(2, drift / 1200);
    hzS = hzS ? hzS + (hz - hzS) * 0.3 : hz; return hzS; // slew limit: the sung pitch moves smoothly, never in a sudden jump (crack)
  };
  const y = psolaOLA(x, sr, marks, L, A, (ts, pa) => { driftV += (rnd() - 0.5) * 0.9 - drift * 0.02; driftV *= 0.94; drift = Math.max(-11, Math.min(11, drift + driftV)); return targetHz(ts) / (sr / pa); }, rnd, true);
  // phrasing: each held syllable swells gently; the line releases naturally at its end
  for (let k = 0; k < K; k++) { const a0 = Math.round(segO[k]), a1 = Math.round(segO[k + 1]), len = Math.max(1, a1 - a0); for (let i = a0; i < a1; i++) { const a = (i - a0) / len; let g = 1; if (sp.syl[k].vib) g *= 0.9 + 0.1 * Math.min(1, a / 0.35); if (k === K - 1 && a > 0.8) g *= 1 - ((a - 0.8) / 0.2) * 0.55; y[i] *= g; } }
  let nb = 0; const br = sad ? 0.05 : 0.03; for (let i = 0; i < L; i++) { nb = 0.96 * nb + 0.04 * (rnd() * 2 - 1); y[i] += nb * Math.abs(y[i]) * br * 2.8; }
  const fd = Math.min(L >> 2, Math.round(sr * 0.012)); for (let i = 0; i < fd; i++) { const a = i / fd; y[i] *= a; y[L - 1 - i] *= a; }
  return { pcm: y, f0: med, starts: segO.slice(0, K).map((v) => v / sr) };
}
function mkRnd(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function pitchMarks(x, sr, per) {
  const N = x.length, lp = new Float32Array(N); { let s = 0; const a = Math.exp((-2 * Math.PI * 900) / sr); for (let i = 0; i < N; i++) { s = a * s + (1 - a) * x[i]; lp[i] = s; } }
  const marks = [], mper = [];
  for (let t = 0; t < N;) {
    const p = per(t);
    if (p) { const guess = marks.length && mper[marks.length - 1] ? marks[marks.length - 1] + mper[marks.length - 1] : t; const c = Math.round(Math.max(t, guess)), r = Math.round(p * (marks.length && mper[marks.length - 1] ? 0.18 : 0.5)); let b = c, bv = -Infinity; for (let k = Math.max(0, c - r); k <= Math.min(N - 1, c + r); k++) if (lp[k] > bv) { bv = lp[k]; b = k; } if (!marks.length || b > marks[marks.length - 1] + p * 0.5) { marks.push(b); mper.push(p); } t = b + Math.max(16, Math.round(p * 0.8)); }
    else { marks.push(t); mper.push(0); t += Math.round(sr * 0.005); }
  }
  return { marks, mper };
}
// overlap-add: blend of the two analysis periods around the read position (continuous, no buzz/ring), natural jitter + shimmer
function psolaOLA(x, sr, mk, L, A, ratioAt, rnd, human) {
  const { marks, mper } = mk, N = x.length, y = new Float32Array(L + 4096); let mi = 0;
  for (let ts = 0; ts < L;) {
    const ta = A(ts); while (mi + 1 < marks.length && marks[mi + 1] <= ta) mi++; while (mi > 0 && marks[mi] > ta) mi--;
    const m0 = marks[mi], p0 = mper[mi], m1 = mi + 1 < marks.length ? marks[mi + 1] : m0, p1 = mi + 1 < marks.length ? mper[mi + 1] : p0; let step;
    if (p0 && p1) {
      const fr = m1 > m0 ? Math.max(0, Math.min(1, (ta - m0) / (m1 - m0))) : 0, pa = p0 + (p1 - p0) * fr;
      const ratio = Math.max(0.5, Math.min(2.2, ratioAt(ts, pa) || 1));
      step = (pa / ratio) * (human ? 1 + (rnd() - 0.5) * 0.01 : 1); const half = Math.round(pa), w0 = Math.min(1, step / pa) * (human ? 1 + (rnd() - 0.5) * 0.04 : 1), d0 = Math.round(ts);
      for (let k = -half; k <= half; k++) { const di = d0 + k; if (di < 0 || di >= y.length) continue; const a0 = m0 + k, a1 = m1 + k; const v0 = a0 >= 0 && a0 < N ? x[a0] : 0, v1 = a1 >= 0 && a1 < N ? x[a1] : 0; y[di] += (v0 * (1 - fr) + v1 * fr) * w0 * (0.5 + 0.5 * Math.cos((Math.PI * k) / half)); }
    } else { const half = Math.round(sr * 0.005); step = half; for (let k = -half; k <= half; k++) { const si = Math.round(ta) + k, di = Math.round(ts) + k; if (si < 0 || si >= N || di < 0 || di >= y.length) continue; y[di] += x[si] * (0.5 + 0.5 * Math.cos((Math.PI * k) / half)); } }
    ts += Math.max(8, step);
  }
  return y.slice(0, L);
}

// one request at a time (the model is not re-entrant); requests queue in order

// ---------------------------------------------------------------- custom character voices (no stock voices)
// Every character gets its OWN voice, built here from its traits: a weighted blend of the model's voice embeddings plus a
// small per-character variation (seeded by the character), so no two characters share a voice and none is a stock preset.
// The model asks for voice files by URL; requests for "cv_..." names are answered with the blended embedding.
const VOICE_BASE = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
const CUSTOM = new Map();   // cv_name -> Float32Array (510 x 256 style table)
const BASES = new Map();    // stock embedding name -> Promise<Float32Array> (ingredients only, never used directly)
const realFetch = self.fetch.bind(self);
function baseVec(name) {
  if (!BASES.has(name)) BASES.set(name, realFetch(VOICE_BASE + name + '.bin').then((r) => { if (!r.ok) throw new Error('voice ' + name + ' ' + r.status); return r.arrayBuffer(); }).then((b) => new Float32Array(b)));
  return BASES.get(name);
}
function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
async function makeVoice(name, mix, seed, vary) {
  if (CUSTOM.has(name)) return;
  const parts = await Promise.all(mix.map((m) => baseVec(m.voice)));
  const n = parts[0].length, out = new Float32Array(n);
  const tot = mix.reduce((a, m) => a + m.w, 0) || 1;
  mix.forEach((m, i) => { const v = parts[i], w = m.w / tot; for (let k = 0; k < n; k++) out[k] += v[k] * w; });
  // personal variation: the same small offset on every row (a consistent timbre shift, not noise)
  const rnd = seeded(seed), dims = 256, off = new Float32Array(dims);
  let sd = 0; for (let k = 0; k < n; k++) sd += out[k] * out[k]; sd = Math.sqrt(sd / n);
  for (let d = 0; d < dims; d++) off[d] = (rnd() * 2 - 1) * sd * (vary || 0.04);
  for (let k = 0; k < n; k++) out[k] += off[k % dims];
  CUSTOM.set(name, out);
}
self.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  const m = /\/voices\/(cv_[A-Za-z0-9_]+)\.bin(\?|$)/.exec(url);
  if (m && CUSTOM.has(m[1])) return Promise.resolve(new Response(CUSTOM.get(m[1]).buffer.slice(0), { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
  return realFetch(input, init);
};
function allowCustom(t) {
  if (t._cvPatched) return;
  const orig = t._validate_voice.bind(t);
  t._validate_voice = (v) => (/^cv_/.test(v) ? 'a' : orig(v)); // custom voices speak American English
  t._cvPatched = true;
}

let chain = Promise.resolve();
self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'load') {
    load(msg.device).then(
      async (t) => {
        // warm-up: the first synthesis compiles GPU shaders / JIT paths and can take many seconds; do it before reporting ready,
        // and report how fast this device really is so slow devices can keep the fallback voices
        let rtf = 0;
        try { await t.generate('Hi.', { voice: 'af_heart' }); const t0 = performance.now(); const o = await t.generate('Hello there, this is a quick test.', { voice: 'am_michael' }); rtf = (performance.now() - t0) / 1000 / (o.audio.length / (o.sampling_rate || 24000)); } catch (e) { /* measured below on real lines */ }
        postMessage({ type: 'ready', voices: Object.keys(t.voices || {}), rtf });
      },
      (e) => postMessage({ type: 'error', id: -1, text: String((e && e.message) || e) })
    );
    return;
  }
  if (msg.type === 'gen') {
    chain = chain.then(async () => {
      try {
        const t = await load(msg.device);
        allowCustom(t);
        if (msg.mix && /^cv_/.test(msg.voice || '')) await makeVoice(msg.voice, msg.mix, msg.seed || 1, msg.vary);
        const out = await t.generate(String(msg.text || '').slice(0, 900), { voice: msg.voice || 'af_heart', speed: msg.speed || 1 });
        let pcm = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
        const sr = out.sampling_rate || 24000;
        let f0 = 0;
        let starts = null, failed = false;
        if (msg.shape && msg.shape.phrase) { const r = singPhrase(pcm, sr, msg.shape); if (r) { pcm = r.pcm; f0 = r.f0; starts = r.starts; } else failed = true; }
        else if (msg.shape) { const r = shape(pcm, sr, msg.shape); pcm = r.pcm; f0 = r.f0; }
        postMessage({ type: 'audio', id: msg.id, pcm, sr, f0, starts, failed }, [pcm.buffer]);
      } catch (e) {
        postMessage({ type: 'error', id: msg.id, text: String((e && (e.stack || e.message)) || e).slice(0, 600) });
      }
    });
  }
};
