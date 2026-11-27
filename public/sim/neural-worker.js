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
  /* character voice design: tract = vocal-tract scale (>1 smaller head / higher formants, <1 bigger body / lower formants), set
     separately from pitch so a high voice is not a strained low one; tremble = an elderly wobble; robot = a flat, monotone pitch */
  const tract = Math.max(0.8, Math.min(1.3, +sh.tract || 1)), trem = Math.max(0, Math.min(1, +sh.tremble || 0)), robo = Math.max(0, Math.min(1, +sh.robot || 0));
  if (!sing && !sh.expr && !sh.fry && !sh.arc && Math.abs(tract - 1) < 0.01 && !trem && !robo && (!sh.ratio || Math.abs(sh.ratio - 1) < 0.004)) return { pcm: x, f0 };
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
      if (!sing && robo && f0 > 0) { const flat = (f0 * (sh.ratio || 1)) / (sr / pa); ratio = Math.pow(ratio || 1, 1 - robo) * Math.pow(flat, robo); } // machine voice: the melody flattens toward one note
      if (!sing && sh.arc) { const u = ts / L, a0 = +sh.arc.start || 0, a1 = +sh.arc.end || 0; const st0 = u < 0.28 ? a0 * Math.sin(Math.PI * Math.min(1, u / 0.28)) : 0, st1 = u > 0.72 ? a1 * Math.pow((u - 0.72) / 0.28, 1.6) : 0; ratio = (ratio || 1) * Math.pow(2, (st0 + st1) / 12); } // announcer flourish: the opening word lifts, the last word swoops up
      if (!sing && trem) { const tt2 = ts / sr; ratio = (ratio || 1) * Math.pow(2, (trem * (55 * Math.sin(2 * Math.PI * 2.1 * tt2) + 14 * Math.sin(2 * Math.PI * 5.6 * tt2 + 1.3))) / 1200); } // old voice: a slow steady ~2 Hz wobble plus a faint tremor (not random, which sounds drunk)
      ratio = Math.max(0.5, Math.min(2.2, ratio || 1));
      /* real voices are never machine-perfect: ~0.5% cycle-to-cycle timing jitter and ~2% loudness shimmer while singing */
      step = (pa / ratio) * (sing ? 1 + (rnd() - 0.5) * 0.01 : fryOn ? 1 + (rnd() - 0.5) * 0.35 : 1); const d0 = Math.round(ts);
      if (Math.abs(tract - 1) < 0.01) {
        const half = Math.round(pa), w0 = Math.min(1, step / pa) * (sing ? 1 + (rnd() - 0.5) * 0.04 : fryOn ? (rnd() < 0.5 ? 0.55 : 1.15) : 1);
        for (let k = -half; k <= half; k++) {
          const di = d0 + k; if (di < 0 || di >= y.length) continue;
          const a0 = m0 + k, a1 = m1 + k; const v0 = a0 >= 0 && a0 < N ? x[a0] : 0, v1 = a1 >= 0 && a1 < N ? x[a1] : 0;
          y[di] += (v0 * (1 - fr) + v1 * fr) * w0 * (0.5 + 0.5 * Math.cos((Math.PI * k) / half));
        }
      } else {
        /* formant shift: each grain (one glottal pulse filtered by the vocal tract) is read faster or slower, which scales the
           tract's resonances by `tract` while the grain spacing above still sets the pitch: a different-sized speaker, same words */
        const half = Math.max(8, Math.round(pa / tract)), w0 = Math.min(1, step / half) * (fryOn ? (rnd() < 0.5 ? 0.55 : 1.15) : 1);
        const rd = (a) => { const i0 = Math.floor(a), f2 = a - i0; return i0 >= 0 && i0 + 1 < N ? x[i0] + (x[i0 + 1] - x[i0]) * f2 : 0; };
        for (let k = -half; k <= half; k++) {
          const di = d0 + k; if (di < 0 || di >= y.length) continue;
          y[di] += (rd(m0 + k * tract) * (1 - fr) + rd(m1 + k * tract) * fr) * w0 * (0.5 + 0.5 * Math.cos((Math.PI * k) / half));
        }
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
    const from0 = j > 0 ? subs[j - 1].hz : sk > 0 ? prevLast(sp.syl[sk - 1]) : hz * Math.pow(2, -(opera ? 25 : sad ? 45 : rock ? 60 : 35) / 1200); const iv = 1200 * Math.log2(hz / from0), dir = Math.sign(iv);
    if (subInto < gIn) { const a = subInto / gIn, e = a * a * (3 - 2 * a); hz = from0 * Math.pow(hz / from0, e); }
    else if (Math.abs(iv) > 40) { const tA = (subInto - gIn) / sr, ov = dir * Math.min(45, Math.abs(iv) * 0.18) * Math.exp(-tA / 0.055) * Math.sin(Math.min(Math.PI, (tA / 0.13) * Math.PI)); hz *= Math.pow(2, ov / 1200); } /* overshoot, then settle */
    { const nxt = j < (subs ? subs.length - 1 : 0) ? subs[j + 1].hz : sk + 1 < K ? sp.syl[sk + 1].hz : 0; const left = (len - into) / sr; if (nxt && left < 0.07 && !(subs && j < subs.length - 1 && false)) { const ivn = 1200 * Math.log2(nxt / hz); if (Math.abs(ivn) > 60) hz *= Math.pow(2, (-Math.sign(ivn) * 14 * (1 - left / 0.07)) / 1200); } } /* preparation: a small dip the other way just before a step */
    if (s.vib) { const held = Math.max(0, Math.min(1, (into / sr - 0.25) / 0.35)), tt = ts / sr; /* vibrato starts ~0.25 s into the note, full by 0.6 s */ hz *= Math.pow(2, (held * (sp.vibDepth || 20) * (1 + 0.2 * Math.sin(tt * 2.3 + sk)) * Math.sin(2 * Math.PI * (sp.vibRate || 5.2) * (1 + 0.05 * Math.sin(tt * 1.7)) * tt)) / 1200); }
    if (sad && sk === K - 1 && into > len * 0.8) hz *= Math.pow(2, (-35 * ((into / len - 0.8) / 0.2)) / 1200);
    // keep a little of the spoken melody inside each note: the natural rise and fall of the words makes it sound sung by a person
    const of = f[Math.min(nF - 1, Math.round(A(ts) / hop))]; if (of > 0 && med > 0) hz *= Math.pow(Math.max(0.85, Math.min(1.18, of / med)), into / sr < 0.15 ? 0.2 : 0.08); /* a touch of the word's own melody at the start, then the note itself (in tune) */
    hz *= Math.pow(2, drift / 1200);
    hzS = hzS ? hzS + (hz - hzS) * 0.3 : hz; return hzS; // slew limit: the sung pitch moves smoothly, never in a sudden jump (crack)
  };
  const y = psolaOLA(x, sr, marks, L, A, (ts, pa) => { driftV += (rnd() - 0.5) * 0.9 - drift * 0.02; driftV *= 0.94; drift = Math.max(-11, Math.min(11, drift + driftV)); return targetHz(ts) / (sr / pa); }, rnd, true);
  // phrasing: each held syllable swells gently; the line releases naturally at its end
  for (let k = 0; k < K; k++) { const a0 = Math.round(segO[k]), a1 = Math.round(segO[k + 1]), len = Math.max(1, a1 - a0); for (let i = a0; i < a1; i++) { const a = (i - a0) / len; let g = 1; if (sp.syl[k].vib) { const tIn = (i - a0) / sr, hv = Math.max(0, Math.min(1, (tIn - 0.25) / 0.35)); g *= (0.9 + 0.1 * Math.min(1, a / 0.35)) * (1 + 0.06 * hv * Math.sin(2 * Math.PI * (sp.vibRate || 5.2) * (i / sr))); } if (k === K - 1 && a > 0.8) g *= 1 - ((a - 0.8) / 0.2) * 0.55; y[i] *= g; } }
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
function psolaOLA(x, sr, mk, L, A, ratioAt, rnd, human, tract) {
  const { marks, mper } = mk, N = x.length, y = new Float32Array(L + 4096); let mi = 0;
  tract = tract && Math.abs(tract - 1) >= 0.01 ? Math.max(0.8, Math.min(1.3, tract)) : 1; const rd = (a) => { const i0 = Math.floor(a), f2 = a - i0; return i0 >= 0 && i0 + 1 < N ? x[i0] + (x[i0 + 1] - x[i0]) * f2 : 0; };
  for (let ts = 0; ts < L;) {
    const ta = A(ts); while (mi + 1 < marks.length && marks[mi + 1] <= ta) mi++; while (mi > 0 && marks[mi] > ta) mi--;
    const m0 = marks[mi], p0 = mper[mi], m1 = mi + 1 < marks.length ? marks[mi + 1] : m0, p1 = mi + 1 < marks.length ? mper[mi + 1] : p0; let step;
    if (p0 && p1) {
      const fr = m1 > m0 ? Math.max(0, Math.min(1, (ta - m0) / (m1 - m0))) : 0, pa = p0 + (p1 - p0) * fr;
      const ratio = Math.max(0.5, Math.min(2.2, ratioAt(ts, pa) || 1));
      step = (pa / ratio) * (human ? 1 + (rnd() - 0.5) * 0.01 : 1); const half = Math.max(8, Math.round(pa / tract)), w0 = Math.min(1, step / half) * (human ? 1 + (rnd() - 0.5) * 0.04 : 1), d0 = Math.round(ts);
      for (let k = -half; k <= half; k++) { const di = d0 + k; if (di < 0 || di >= y.length) continue; y[di] += (rd(m0 + k * tract) * (1 - fr) + rd(m1 + k * tract) * fr) * w0 * (0.5 + 0.5 * Math.cos((Math.PI * k) / half)); }
    } else { const half = Math.round(sr * 0.005); step = half; for (let k = -half; k <= half; k++) { const si = Math.round(ta) + k, di = Math.round(ts) + k; if (si < 0 || si >= N || di < 0 || di >= y.length) continue; y[di] += x[si] * (0.5 + 0.5 * Math.cos((Math.PI * k) / half)); } }
    ts += Math.max(8, step);
  }
  return y.slice(0, L);
}

// ---------------------------------------------------------------- melody rewriting (intonation by design, not just bent)
// The model decides a sentence's melody when it reads the words; scaling that melody can only exaggerate it. Here the melody is
// REWRITTEN syllable by syllable: the line's syllables are found in the recording (loud voiced nuclei between consonant dips, like
// the singing detector), each gets a designed target pitch from the TEXT (accented words leap up, small words sit low, the line
// ends the way its punctuation says), and a little of the model's own micro-melody is kept on top so it still sounds spoken by a
// person. Timing is untouched (every consonant and vowel keeps its length), so pronunciation stays exactly the model's.
// Every character can have its own melody style; Caine's is fitted to his reference recording.
const FUNC_W = new Set('a an the my your his her its our their to of in on at by for with and or but so if is am are was were be been do does did i you he she it we they me him us them this that these those as from up not no just than then too very can will would shall should could has have had oh uh um'.split(' '));
function textSyllables(text) {
  const out = []; const words = String(text || '').match(/[A-Za-z']+/g) || [];
  words.forEach((w, wi) => {
    const lw = w.toLowerCase(); let g = lw.match(/[aeiouy]+/g) || ['x'];
    if (g.length > 1 && /[^aeiouy]e$/.test(lw) && !/[^aeiouy]le$/.test(lw)) g = g.slice(0, -1); // silent final e (make, time), not -le (little)
    const content = !FUNC_W.has(lw.replace(/'.*/, '')), caps = w.length > 1 && w === w.toUpperCase();
    g.forEach((_, si) => out.push({ w: wi, acc: content && si === 0 ? (caps ? 2 : 1) : 0 }));
  });
  return out;
}
function syllableBounds(x, sr, f, hop, K, syl) {
  /* Syllables are placed by the TEXT and snapped to the SOUND: the spoken span (silence before / after excluded) is shared out
     among the line's syllables (stressed ones a little longer), then each boundary moves to the deepest loudness dip near its
     expected place. Pure peak-picking drifted (a silent start counted as a syllable, soft syllables were missed), which put
     accents on the wrong words */
  const N = x.length, nF = f.length; if (K < 1 || nF < 8) return null;
  const env = new Float32Array(nF); for (let i = 0; i < nF; i++) { const c = i * hop, w = Math.round(sr * 0.0125); let s = 0, n = 0; for (let k = Math.max(0, c - w); k < Math.min(N, c + w); k++) { s += x[k] * x[k]; n++; } env[i] = n ? Math.sqrt(s / n) : 0; }
  const sm = new Float32Array(nF); for (let i = 0; i < nF; i++) { let s = 0, n = 0; for (let k = i - 4; k <= i + 4; k++) if (k >= 0 && k < nF) { s += env[k]; n++; } sm[i] = s / n; }
  let gmax = 0; for (let i = 0; i < nF; i++) gmax = Math.max(gmax, sm[i]); if (!gmax) return null;
  let s0 = 0; while (s0 < nF - 1 && sm[s0] < gmax * 0.06) s0++; let e0 = nF - 1; while (e0 > s0 && sm[e0] < gmax * 0.06) e0--;
  const span = e0 - s0 + 1, minL = Math.max(4, Math.round(0.05 * sr / hop)); if (span < K * minL * 0.6) return null;
  const wts = []; for (let k = 0; k < K; k++) wts.push(syl && syl[k] && syl[k].acc ? 1.3 : 0.9); const tw = wts.reduce((a, b) => a + b, 0);
  const bF = [0]; let acc = 0, prev = s0;
  for (let k = 0; k < K - 1; k++) {
    acc += wts[k]; const ideal = s0 + (acc / tw) * span, avg = span / K, r = Math.max(2, Math.round(avg * 0.4));
    let best = Math.round(ideal), bv = Infinity;
    for (let i = Math.max(prev + minL, Math.round(ideal - r)); i <= Math.min(e0 - minL * (K - 1 - k), Math.round(ideal + r)); i++) { const v = sm[i] * (1 + 0.6 * Math.abs(i - ideal) / r); if (v < bv) { bv = v; best = i; } }
    best = Math.max(prev + minL, Math.min(best, e0 - minL * (K - 1 - k))); bF.push(best); prev = best;
  }
  bF.push(Math.min(nF, e0 + Math.round(minL / 2) + 1));
  return bF;
}
function speakMelody(x, sr, text, pr) {
  const hop = Math.round(sr * 0.005), f = pitchTrack(x, sr, hop), nF = f.length, med = median(f) || 0; if (!med) return null;
  /* voiced sound the tracker missed (a quiet line start, a soft consonant-vowel join) would be copied UNSHIFTED at the model's raw
     pitch - a flat, low island inside a lively line (heard as monotone, or as a crack). Fill those frames from the nearest tracked
     pitch when they carry real energy, so every voiced moment follows the melody */
  { const en = new Float32Array(nF); for (let i = 0; i < nF; i++) { let s = 0; const c = i * hop; for (let k = c; k < Math.min(x.length, c + hop * 2); k++) s += x[k] * x[k]; en[i] = s; }
    const ve = []; for (let i = 0; i < nF; i++) if (f[i] > 0) ve.push(en[i]); ve.sort((a, b) => a - b); const eRef = ve.length ? ve[ve.length >> 1] : 0;
    const zc = (i) => { const c = i * hop; let z = 0, n = 0; for (let k = c + 1; k < Math.min(x.length, c + hop * 2); k++) { n++; if ((x[k] >= 0) !== (x[k - 1] >= 0)) z++; } return n ? z / n : 1; }; // hiss (s, f, sh, k bursts) crosses zero very often; voice does not
    for (let i = 0; i < nF; i++) if (!(f[i] > 0) && en[i] > eRef * 0.015 && zc(i) < 0.12) { let best = 0; for (let d = 1; d <= 30 && !best; d++) { if (i - d >= 0 && f[i - d] > 0 && !f[i - d].filled) best = f[i - d]; else if (i + d < nF && f[i + d] > 0) best = f[i + d]; } if (best) f[i] = best; } }
  const syl = textSyllables(text), K = syl.length; if (!K) return null; const bF = syllableBounds(x, sr, f, hop, K, syl); if (!bF) return null; const Kf = bF.length - 1;
  const end = /\?\s*["')]*\s*$/.test(text) ? '?' : /!\s*["')]*\s*$/.test(text) ? '!' : /(\.\.\.|…)\s*$/.test(text) ? '…' : /[,;:—–-]\s*$/.test(text) ? ',' : '.'; // ',' = the sentence goes on in the next piece
  const acc1 = pr.acc1 ?? 8, acc2 = pr.acc2 ?? 5, decay = pr.decay ?? 0.7, low = pr.low ?? 3, endRise = pr.endRise ?? 8, keep = pr.keep ?? 0.35, decl = pr.decl ?? 1.5;
  // a designed target (semitones from the voice's centre) for every syllable found
  const tgt = new Float32Array(Kf), ramp = new Float32Array(Kf), isAcc = new Uint8Array(Kf); let nAcc = pr.cont ? 1 : 0; // a continuing piece does not restart with the opening leap
  for (let k = 0; k < Kf; k++) {
    const s = syl[Math.min(K - 1, Math.round((k * (K - 1)) / Math.max(1, Kf - 1)))] || { acc: 0 }, dl = decl * (k / Math.max(1, Kf - 1));
    const vr = (pr.vary || 0) * (((Math.sin((k + 1) * 12.9898 + K * 78.233) * 43758.5453) % 1 + 1) % 1 * 2 - 1); // seeded per-syllable variety: no two syllables on the same note
    if (s.acc) { isAcc[k] = 1; const zz = nAcc > 0 && s.acc !== 2 && nAcc % 2 === 1 ? 1 - (pr.zig || 0) : 1; /* zigzag: every other key word leaps less, so the line goes high-low-high instead of plateauing */ tgt[k] = vr + (nAcc === 0 || s.acc === 2 ? acc1 : acc2 * zz * Math.max(0.55, Math.pow(decay, nAcc - 1))) - dl; nAcc++; } else tgt[k] = vr * 0.6 - low - dl;
  }
  if (pr.cont && Kf > 1) { tgt[0] = Math.min(tgt[0], 1); for (let k = 1; k < Math.min(Kf, 3); k++) tgt[k] = Math.min(tgt[k], tgt[0] + 6 * k); } // a continuing piece picks up where the last one ended (no leap at the seam), then opens up
  if (end === '!' && pr.finalYell) { let la = -1; for (let k = Kf - 1; k >= 0; k--) if (isAcc[k]) { la = k; break; } if (la > 0) { const yv = acc1 * pr.finalYell; for (let k = la; k < Kf; k++) tgt[k] = Math.max(tgt[k], yv); } } // the last key word of an exclamation is YELLED, and the line stays up there to the end
  if (pr.endDrop && Kf > 3 && end !== ',') for (let k = Math.floor(Kf * 0.7); k < Kf; k++) tgt[k] -= pr.endDrop * Math.min(1, (k - Kf * 0.7 + 1) / (Kf * 0.3)); // lines settle LOWER toward their end (calmer, deeper finish)
  const L = Kf - 1;
  if (end === '!') { tgt[L] = Math.max(tgt[L], 0); ramp[L] = endRise; }
  else if (end === '?') { tgt[L] = Math.max(tgt[L], 0); ramp[L] = endRise * 0.8; }
  else if (end === ',') { tgt[L] = Math.max(tgt[L], -1); ramp[L] = 2; } // mid-sentence: a small lift that carries into the next piece
  else if (end === '…') { tgt[L] = -low - 1; ramp[L] = -2; }
  else { tgt[L] = Math.min(tgt[L], -low - 1); ramp[L] = -3; }
  // the model's own micro-melody around each syllable's mean is kept a little (natural, human movement inside a syllable)
  const semi = new Float32Array(nF); for (let i = 0; i < nF; i++) semi[i] = f[i] > 0 ? 12 * Math.log2(f[i] / med) : NaN;
  const mean = new Float32Array(Kf); for (let k = 0; k < Kf; k++) { let s = 0, n = 0; for (let i = bF[k]; i < bF[k + 1]; i++) if (f[i] > 0) { s += semi[i]; n++; } mean[k] = n ? s / n : 0; }
  const segOf = new Int32Array(nF); for (let k = 0; k < Kf; k++) for (let i = bF[k]; i < bF[k + 1]; i++) segOf[i] = k; for (let i = bF[Kf]; i < nF; i++) segOf[i] = Kf - 1; // trailing silence belongs to the last syllable
  const center = med * (+pr.ratio || 1), glide = Math.max(1, Math.round(((+pr.glide || 0.045) * sr) / hop));
  const tFrame = (i) => {
    i = Math.min(nF - 1, Math.max(0, i)); const k = segOf[i], a = bF[k], b = bF[k + 1], u = Math.min(1, (i - a) / Math.max(1, b - a));
    let v = tgt[k] + ramp[k] * Math.pow(u, k === Kf - 1 && end === '!' ? 0.7 : 1.4); // an exclamation's final rise starts early, while the vowel is still voiced
    /* MOVEMENT INSIDE THE SYLLABLE (a showman never holds a flat note): key words scoop up into a peak and fall away (a 'hat'),
       small words slide down; the last syllable keeps its punctuation ramp */
    const sw = +pr.swoop || 0; if (sw && k !== Kf - 1) v += isAcc[k] ? sw * (u < 0.15 ? -0.5 + (u / 0.15) * 0.8 : u < 0.8 ? 0.3 : 0.3 - ((u - 0.8) / 0.2) * 1.0) : -sw * 0.35 * u; // key words: a quick lift onto a high, held plateau (like the reference), small words slide down
    if (k > 0 && i - a < glide) { const pv = tgt[k - 1] + ramp[k - 1], e = (i - a) / glide; v = pv + (v - pv) * e * e * (3 - 2 * e); } // smooth glide into each syllable
    if (pr.vib && isAcc[k] && (b - a) * hop / sr > 0.16 && u > 0.25) v += pr.vib * Math.min(1, (u - 0.25) / 0.3) * Math.sin(2 * Math.PI * 5.3 * (i * hop / sr)); // melodic: a light vibrato blooms on long stressed vowels, like a showman holding a note
    const r = semi[i]; if (r === r) v += keep * (r - mean[k]); return Math.min(v, acc1 + 4); // nothing above the yell height + a small lift (stacked rises asked for impossible notes that broke the voice)
  };
  let sm = 0; const N = x.length;
  /* SHOWMAN RHYTHM: the voiced core of every accented syllable is drawn out (stretch) and the small words are rushed (squeeze);
     consonants keep their own length, so the words stay clear. Without it every syllable got the same time: monotone rhythm */
  const st = Math.max(0.7, Math.min(1.6, +pr.stretch || 1)), sq = Math.max(0.6, Math.min(1.2, +pr.squeeze || 1)), timed = Math.abs(st - 1) > 0.01 || Math.abs(sq - 1) > 0.01;
  const oF = new Float64Array(nF + 1); for (let i = 0; i < nF; i++) oF[i + 1] = oF[i] + hop * (timed && f[i] > 0 ? (isAcc[segOf[i]] ? st : sq) : 1);
  const tail = Math.max(0, N - nF * hop), Lo = timed ? Math.max(1, Math.round(oF[nF] + tail)) : N;
  const mkMap = () => { let fi = 0; return (ts) => { if (!timed) return ts; if (ts >= oF[nF]) return nF * hop + (ts - oF[nF]); while (fi + 1 < nF && oF[fi + 1] <= ts) fi++; while (fi > 0 && oF[fi] > ts) fi--; const span = oF[fi + 1] - oF[fi] || 1; return fi * hop + ((ts - oF[fi]) / span) * hop; }; };
  const Amap = mkMap(), Amap2 = mkMap(), Amap3 = mkMap();
  const mk = pitchMarks(x, sr, (s) => { const v = f[Math.min(nF - 1, Math.max(0, Math.round(s / hop)))]; return v > 0 ? sr / v : 0; });
  const y = psolaOLA(x, sr, mk, Lo, Amap, (ts, pa) => { const want = center * Math.pow(2, tFrame(Math.round(Amap2(ts) / hop)) / 12); sm = sm ? sm * Math.pow(2, Math.max(-1, Math.min(1, 12 * Math.log2(want / sm) * 0.35)) / 12) : want; const own = sr / pa; let rr = sm / own; if (rr > 1.55) rr = 1.55 + (rr - 1.55) * 0.45; /* soft knee before the breaking point: yelled / strained peaks ease in instead of slamming into the limit (the last cracks were there) */ return Math.max(Math.pow(2, -7 / 12), Math.min(1.95, rr)); } /* crack guard: pitch moves at most ~1 semitone per grain, and never more than an octave up / 7 down (beyond about 2x the voice breaks into noise: measured) from the model's own voice */, mkRnd(Kf * 131 + N), false, pr.tract);
  /* TONE FOLLOWS THE MELODY: when a showman goes up and loud his voice gets brighter and harder (more 1.5-3.5 kHz 'edge'); on
     the low, small words it relaxes. A fixed tone at every pitch was part of what sounded monotone */
  const hb = +pr.heat || 0; if (hb) { const yb = y.slice(0); biquad('peak', sr, 1900, 0.8, 9 * hb)(yb); biquad('peak', sr, 3300, 1.0, 5 * hb)(yb); let rm0 = 0, rm1 = 0; for (let i = 0; i < Lo; i++) { rm0 += y[i] * y[i]; rm1 += yb[i] * yb[i]; } const nrm = Math.sqrt(rm0 / (rm1 || 1)); let h = 0; const Amap4 = mkMap();
    for (let i = 0; i < Lo; i++) { const fr = Math.min(nF - 1, Math.floor(Amap4(i) / hop)), k = segOf[fr]; const want = Math.max(0, Math.min(1, (tgt[k] + ramp[k] * 0.5 + low) / Math.max(1, acc1 + low))); h += (want - h) * 0.003; y[i] = y[i] * (1 - h) + yb[i] * nrm * h; } }
  // showman dynamics: accented syllables are punched louder, small words drop back (volume swings with the melody), smoothly
  const dyn = +pr.dyn || 0; if (dyn) { let g = 1; for (let i = 0; i < Lo; i++) { const fr = Math.min(nF - 1, Math.floor(Amap3(i) / hop)), k = segOf[fr]; const want0 = Math.pow(10, (dyn * Math.max(-0.45, Math.min(1.2, (tgt[k] + ramp[k] * 0.5) / Math.max(1, acc1)))) / 20); const want = k >= Kf * 0.7 ? Math.max(want0, 0.9) : want0; /* the lowered ending keeps its natural loudness (every last word stays audible) */ g += (want - g) * 0.002; y[i] *= g; } let pk = 0; for (let i = 0; i < Lo; i++) pk = Math.max(pk, Math.abs(y[i])); if (pk > 0.98) for (let i = 0; i < Lo; i++) y[i] *= 0.98 / pk; }
  const fd = Math.min(Lo >> 2, Math.round(sr * 0.008)); for (let i = 0; i < fd; i++) { const a = i / fd; y[i] *= a; y[Lo - 1 - i] *= a; }
  let outF0 = 0; try { const yf = pitchTrack(y, sr, hop * 2); outF0 = median(yf) || 0; } catch (e) { /* ok */ } // what the line REALLY came out at (the engine corrects the next lines toward the design)
  return { pcm: y, f0: med, outF0 };
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
  t._validate_voice = (v) => (/^cv_/.test(v) ? (CUSTOM_LANG.get(v) || 'a') : orig(v)); // custom voices read with the accent of their main ingredients
  t._cvPatched = true;
}

// ---------------------------------------------------------------- voice colour (after the words are spoken clearly)
// Every effect is gentle and capped: the words always stay easy to understand. RBJ biquads + shaped noise.
function biquad(type, sr, f, q, gainDb) {
  const A = Math.pow(10, (gainDb || 0) / 40), w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * (q || 0.707));
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'lowshelf') { const s2 = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s2); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s2); a0 = (A + 1) + (A - 1) * cs + s2; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s2; }
  else { const s2 = 2 * Math.sqrt(A) * al; /* high shelf */ b0 = A * ((A + 1) + (A - 1) * cs + s2); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s2); a0 = (A + 1) - (A - 1) * cs + s2; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s2; }
  const c = [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  return (x) => { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], o = c[0] * v + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; x[i] = o; } return x; };
}
const cl01 = (v) => Math.max(0, Math.min(1, +v || 0));
function voiceFx(x, sr, fx, seed) {
  if (!fx) return x; const br = cl01(fx.breath) * 0.6, ra = cl01(fx.rasp) * 0.6, na = cl01(fx.nasal), mu = cl01(fx.muffle) * 0.75, bri = Math.max(-1, Math.min(1, +fx.bright || 0)), ro = cl01(fx.robot), ech = cl01(fx.echo) * 0.6;
  const eq = Array.isArray(fx.eq) ? fx.eq.slice(0, 8) : null;
  const eff = cl01(fx.effort); // vocal effort: a shouting / projecting voice (flatter, brighter spectrum, pressed and compressed)
  if (!br && !ra && !na && !mu && !bri && !ro && !ech && !eq && !eff) return x;
  let pk0 = 0; for (let i = 0; i < x.length; i++) pk0 = Math.max(pk0, Math.abs(x[i])); if (!pk0) return x;
  const rnd = mkRnd(seed || 7), y = x;
  if (eq) for (const b of eq) { const [ty, f, g, q] = b; if (!isFinite(f) || !isFinite(g)) continue; biquad(ty === 'lowshelf' ? 'lowshelf' : ty === 'highshelf' ? 'shelf' : ty === 'lp' || ty === 'hp' ? ty : 'peak', sr, Math.max(40, Math.min(9000, f)), q || 0.8, Math.max(-12, Math.min(12, g)))(y); } // a hand-tuned tone curve (a signature voice)
  if (na) { biquad('peak', sr, 1150, 1.6, 7 * na)(y); biquad('peak', sr, 480, 1.4, -5 * na)(y); } // nasal: the nose resonance up, the open-mouth body down
  if (mu) biquad('lp', sr, 7000 - 4600 * mu, 0.7)(y); // speaking through a closed mouth / mask / helmet (never below ~2.4 kHz: words stay clear)
  if (bri) biquad('shelf', sr, 3200, 0.7, 6 * bri)(y); // crisp & airy (+) or dark & mellow (-)
  if (eff) { // SHOUTING: loud voices put far more energy into 1-4 kHz (the 'edge' of a yell), are pressed (dense, compressed)
    // and slightly driven; the words stay clear because the extra energy sits in the consonant / vowel-clarity band
    biquad('peak', sr, 1600, 0.7, 5 * eff)(y); biquad('peak', sr, 3000, 1.0, 3 * eff)(y); biquad('lowshelf', sr, 150, 0.7, -2 * eff)(y);
    let pk1 = 0; for (let i = 0; i < y.length; i++) pk1 = Math.max(pk1, Math.abs(y[i])); const drv = 1 + 1.5 * eff, n0 = pk1 || 1;
    if (fx.drive) for (let i = 0; i < y.length; i++) y[i] = (Math.tanh((y[i] / n0) * drv) / Math.tanh(drv)) * n0; // saturation only when asked for (it made voices crackly): the shout comes from the yell-band tone
  }
  if (ra) { // rasp / growl: soft drive plus a rough, irregular throat flutter riding on the voice
    let lfo = 0, tgt = 0; const drive = 1 + 5 * ra;
    for (let i = 0; i < y.length; i++) { if (i % 180 === 0) tgt = rnd(); lfo += (tgt - lfo) * 0.02; const v = Math.tanh(y[i] * drive) / Math.tanh(drive); y[i] = (y[i] * (1 - ra) + v * ra) * (1 - ra * 0.45 * lfo); }
  }
  if (br) { // breath: air noise that follows the voice's own loudness (louder vowels = more air), kept above 1.8 kHz
    const n = new Float32Array(y.length); for (let i = 0; i < n.length; i++) n[i] = rnd() * 2 - 1; biquad('hp', sr, 1800, 0.7)(n); biquad('lp', sr, 7500, 0.7)(n);
    let env = 0; for (let i = 0; i < y.length; i++) { env = Math.max(Math.abs(y[i]), env * 0.9985); y[i] = y[i] * (1 - br * 0.25) + n[i] * env * br * 0.55; }
  }
  if (ro) { // machine: a metallic comb plus a light ring modulation
    const d = Math.round(sr * 0.0035), buf = new Float32Array(d); let bi = 0; const fb = 0.45 * ro, f = 2 * Math.PI * 70 / sr;
    for (let i = 0; i < y.length; i++) { const dl = buf[bi]; const o = y[i] + dl * fb; buf[bi] = o; bi = (bi + 1) % d; y[i] = o * (1 - 0.35 * ro + 0.35 * ro * Math.sin(f * i)); }
  }
  if (ech) { // big hollow body / cave: a short slap-back
    const d = Math.round(sr * 0.085), src = y.slice(0); for (let i = d; i < y.length; i++) y[i] += src[i - d] * ech * 0.45;
  }
  let pk = 0; for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i])); if (pk) { const g = pk0 / pk; for (let i = 0; i < y.length; i++) y[i] *= g; }
  return y;
}

// ---------------------------------------------------------------- mumble speech (no words: a creature's own babble)
// Procedural source-filter voice (after UnitOfTime's NPC "mumble speech"): the line's own text drives it, so the same words always
// make the same sounds. Typewriter timing (letters ~33 ms, commas 3x, sentence ends 6x), one syllable per vowel group, six vowels
// built from a glottal buzz + breath through three formant resonators (scaled by the speaker's tract size), a swell-sustain-taper
// envelope, micro-jitter, and punctuation-driven melody: declining clauses that reset after commas, a rise on a question's last word,
// a higher start on "!", a fade on "...", louder ALL CAPS, and an optional slow ~2 Hz wobble for an old voice.
const MUMBLE_V = { A: [730, 1090, 2440], E: [530, 1840, 2480], I: [270, 2290, 3010], O: [570, 840, 2410], OO: [300, 870, 2240], U: [640, 1190, 2390] };
function mumbleVowel(cl) { cl = cl.toLowerCase(); if (/oo|ou|ew|ue/.test(cl)) return 'OO'; if (/ee|ea|ie|ey|^y$|^i$/.test(cl)) return 'I'; const c = cl[0]; return c === 'a' ? 'A' : c === 'e' ? 'E' : c === 'i' ? 'I' : c === 'o' ? 'O' : c === 'u' ? 'U' : 'E'; }
function mumble(text, sr, p) {
  text = String(text || '').slice(0, 600); const f0 = Math.max(60, Math.min(700, +p.f0 || 160)), tract = Math.max(0.6, Math.min(1.8, +p.tract || 1)), rate = Math.max(0.5, Math.min(2, +p.speed || 1));
  const breath = cl01(p.breath ?? 0.12), wob = cl01(p.tremble), seedR = mkRnd(2166136261 ^ text.length * 977 ^ Math.round(f0 * 13)); const ev = [];
  let t = 0.03, clause = 0, words = text.split(/\s+/); const lastWordStart = text.search(/\S+\s*$/);
  const qLine = /\?\s*$/.test(text), exLine = /!\s*$/.test(text), fadeLine = /(\.\.\.|…)\s*$/.test(text);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; let d = 0.033;
    if (/[,;:]/.test(ch)) { d *= 3; clause = 0; } else if (/[.!?…]/.test(ch)) { d *= 6; clause = 0; } else if (ch === ' ') d *= 1.1;
    if (/[aeiouy]/i.test(ch) && !(i > 0 && /[aeiouy]/i.test(text[i - 1]))) {
      let j = i; while (j < text.length && /[aeiouy]/i.test(text[j])) j++;
      const wsI = text.lastIndexOf(' ', i) + 1, wEnd = (text.slice(i).search(/[\s,.;:!?]/) + 1 || text.length - i + 1) + i - 1, word = text.slice(wsI, wEnd);
      const caps = word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
      let semi = -clause * 0.45 + (exLine ? 2.5 : 0) + (seedR() - 0.5) * 1.2; // declination + variety
      if (qLine && i >= lastWordStart) semi += 4 + 3 * ((i - lastWordStart) / Math.max(1, text.length - lastWordStart));
      ev.push({ t, v: mumbleVowel(text.slice(i, j)), semi, amp: (caps ? 1.45 : 1), fade: fadeLine ? 1 - 0.6 * (i / text.length) : 1 });
      clause++;
    }
    t += d / rate;
  }
  const L = Math.round((t + 0.25) * sr), y = new Float32Array(L); const gap = 0.1 / rate;
  for (let k = 0; k < ev.length; k++) {
    const e = ev[k], nextT = k + 1 < ev.length ? ev[k + 1].t : e.t + gap, dur = Math.min(0.32, Math.max(0.07, (nextT - e.t) * 1.25)); // a little overlap: one stream of speech
    const F = MUMBLE_V[e.v].map((f) => f * tract), BW = [80, 100, 130].map((b) => b * Math.sqrt(tract));
    const R = F.map((f, i2) => { const r = Math.exp((-Math.PI * BW[i2]) / sr), th = (2 * Math.PI * f) / sr; return { a1: 2 * r * Math.cos(th), a2: -r * r, g: (1 - r) * [1, 0.7, 0.4][i2], y1: 0, y2: 0 }; });
    const s0 = Math.round(e.t * sr), n = Math.round(dur * sr); let ph = 0;
    for (let i = 0; i < n && s0 + i < L; i++) {
      const tt = (s0 + i) / sr, a = i / n; const env = a < 0.2 ? Math.sin((a / 0.2) * Math.PI / 2) : a < 0.65 ? 1 : Math.cos(((a - 0.65) / 0.35) * Math.PI / 2); // swell, sustain, taper
      const hz = f0 * Math.pow(2, e.semi / 12) * (1 + (seedR() - 0.5) * 0.012) * (1 + (wob ? 0.035 * wob * Math.sin(2 * Math.PI * 2 * tt) : 0)); // micro-jitter + old-age wobble
      ph += hz / sr; if (ph >= 1) ph -= 1; const glot = ph < 0.6 ? Math.sin(Math.PI * ph / 0.6) ** 2 : 0; // Rosenberg-style glottal pulse
      const src = (glot - 0.3) * (1 - breath) + (seedR() * 2 - 1) * breath * 0.6;
      let out = 0; for (const r of R) { const v = r.g * src + r.a1 * r.y1 + r.a2 * r.y2; r.y2 = r.y1; r.y1 = v; out += v; }
      y[s0 + i] += out * env * e.amp * e.fade;
    }
  }
  let pk = 0; for (let i = 0; i < L; i++) pk = Math.max(pk, Math.abs(y[i])); if (pk) for (let i = 0; i < L; i++) y[i] *= 0.6 / pk;
  return y;
}
const CUSTOM_LANG = new Map(); // cv_name -> 'a' (American) or 'b' (British): the accent the blended voice reads with
let chain = Promise.resolve(); const CANCELLED = new Set(); /* lines the page gave up on while they waited: skipped, never made late */
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
  if (msg.type === 'cancel') { CANCELLED.add(msg.id); return; }
  if (msg.type === 'gen') {
    if (msg.mode === 'mumble') { // a creature's babble needs no speech model: made at once, even while the model is still downloading
      try { const sr = 24000; let pcm = mumble(msg.text, sr, Object.assign({ speed: msg.speed }, msg.mumble || {})); pcm = voiceFx(pcm, sr, msg.fx, msg.seed); postMessage({ type: 'audio', id: msg.id, pcm, sr, f0: (msg.mumble && msg.mumble.f0) || 0, starts: null, failed: false }, [pcm.buffer]); }
      catch (e) { postMessage({ type: 'error', id: msg.id, text: String((e && e.message) || e) }); }
      return;
    }
    chain = chain.then(async () => {
      if (CANCELLED.delete(msg.id)) return; postMessage({ type: 'start', id: msg.id }); /* the page times a line from HERE, not from when it was queued */
      try {
        const t = await load(msg.device);
        allowCustom(t);
        if (msg.mix && /^cv_/.test(msg.voice || '')) { await makeVoice(msg.voice, msg.mix, msg.seed || 1, msg.vary); if (msg.lang) CUSTOM_LANG.set(msg.voice, msg.lang); }
        if (msg.fx && msg.shape && !msg.shape.phrase && !Array.isArray(msg.shape.notes)) msg.shape = Object.assign({}, msg.shape, { tract: msg.fx.tract, tremble: msg.fx.tremble, robot: msg.fx.robot });
        else if (msg.fx && !msg.shape && (msg.fx.tract || msg.fx.tremble || msg.fx.robot)) msg.shape = { ratio: 1, tract: msg.fx.tract, tremble: msg.fx.tremble, robot: msg.fx.robot };
        const out = await t.generate(String(msg.text || '').slice(0, 900), { voice: msg.voice || 'af_heart', speed: msg.speed || 1 });
        let pcm = out.audio instanceof Float32Array ? out.audio : new Float32Array(out.audio);
        const sr = out.sampling_rate || 24000;
        let f0 = 0;
        let starts = null, failed = false, outF0 = 0;
        if (msg.shape && msg.shape.phrase) { const r = singPhrase(pcm, sr, msg.shape); if (r) { pcm = r.pcm; f0 = r.f0; starts = r.starts; } else failed = true; }
        else if (msg.shape && msg.shape.melody) { const r = speakMelody(pcm, sr, msg.text, Object.assign({ ratio: msg.shape.ratio, tract: msg.shape.tract }, msg.shape.melody)); if (r) { pcm = r.pcm; f0 = r.f0; outF0 = r.outF0 || 0; } else { const r2 = shape(pcm, sr, msg.shape); pcm = r2.pcm; f0 = r2.f0; } }
        else if (msg.shape) { const r = shape(pcm, sr, msg.shape); pcm = r.pcm; f0 = r.f0; }
        if (msg.fx) pcm = voiceFx(pcm, sr, msg.fx, msg.seed);
        if (!outF0 && f0 && msg.shape && msg.shape.ratio && !msg.shape.melody && !msg.shape.phrase && !Array.isArray(msg.shape.notes)) outF0 = f0 * msg.shape.ratio;
        postMessage({ type: 'audio', id: msg.id, pcm, sr, f0, outF0, starts, failed }, [pcm.buffer]);
      } catch (e) {
        postMessage({ type: 'error', id: msg.id, text: String((e && (e.stack || e.message)) || e).slice(0, 600) });
      }
    });
  }
};
