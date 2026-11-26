// NeuralVoice: human-quality, fully in-browser character voices (Kokoro-82M, runs in a Web Worker on the visitor's device).
// No server and no API: the model downloads once (about 90 MB, then cached by the browser) and every line is synthesised locally.
// Each character gets its own matched voice: a base neural voice chosen from its gender, accent and personality, plus its own
// pitch and pace, so two characters never sound the same. If the device cannot run it, the game falls back to the best voices
// the browser has (then to the built-in synth), so speech always works.
(function () {
  'use strict';
  var BASE = (document.currentScript && document.currentScript.src) || new URL('sim/neural.js', location.href).href;
  var state = 'off'; // off | loading | ready | failed | unsupported
  var worker = null, slow = 0, busyUntil = 0, nextId = 1, pending = new Map(), listeners = [], progress = {}, device = 'wasm', lastErr = '';

  // ---------------------------------------------------------------- device support
  function supported() {
    try {
      if (typeof Worker === 'undefined' || typeof WebAssembly !== 'object') return false;
      var nav = navigator || {};
      if (nav.connection && nav.connection.saveData) return false; // the visitor asked to save data: don't pull a 90 MB model
      if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 3) return false; // too little RAM to run the model smoothly
      if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency < 2) return false;
      // module workers (needed to import the model runtime inside the worker)
      var ok = false;
      try { var blob = new Blob([''], { type: 'text/javascript' }); var u = URL.createObjectURL(blob); var w = new Worker(u, { get type() { ok = true; return 'module'; } }); w.terminate(); URL.revokeObjectURL(u); } catch (e) { ok = false; }
      return ok;
    } catch (e) { return false; }
  }

  function emit() { var s = status(); listeners.forEach(function (f) { try { f(s); } catch (e) { /* ok */ } }); }
  function status() {
    var l = 0, t = 0; Object.keys(progress).forEach(function (k) { l += progress[k].loaded; t += progress[k].total; });
    return { state: state, device: device, pct: t ? Math.min(100, Math.round((l / t) * 100)) : 0, error: lastErr };
  }

  function start() {
    if (state === 'loading' || state === 'ready') return;
    if (!supported()) { state = 'unsupported'; emit(); return; }
    state = 'loading'; emit();
    var go = function (dev) {
      device = dev;
      try { worker = new Worker(new URL('./neural-worker.js', BASE), { type: 'module' }); }
      catch (e) { state = 'failed'; lastErr = String(e && e.message || e); emit(); return; }
      worker.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.type === 'progress') { progress[m.file] = { loaded: m.loaded, total: m.total }; emit(); }
        else if (m.type === 'ready') { /* the speed test runs while the page is still busy loading (world, Caine's model), so a slow result is NOT a reason to give up the natural voice for the whole visit: only a device that is hopelessly slow (over 4x real time) falls back */ if (m.rtf && m.rtf > 4) { state = 'failed'; lastErr = 'device too slow for natural voices (x' + m.rtf.toFixed(2) + ' real time)'; console.info('[neural voice] ' + lastErr + '; using fallback voices'); try { worker.terminate(); } catch (e) { /* ok */ } } else { if (m.rtf > 1.3) console.info('[neural voice] slow start (x' + m.rtf.toFixed(2) + ' real time, the page was busy): keeping the natural voices'); state = 'ready'; } emit(); }
        else if (m.type === 'log') { console.info('[neural voice]', m.text); }
        else if (m.type === 'audio') { var p = pending.get(m.id); if (p) { pending.delete(m.id); var secs = m.pcm.length / (m.sr || 24000), took = (performance.now() - Math.max(p.t, busyUntil)) / 1000; slow = secs > 0.4 && took > secs * 2.2 ? slow + 1 : Math.max(0, slow - 1); if (slow >= 3) { slow = 0; console.info('[neural voice] a few lines were slow (the page was busy): keeping the natural voices'); } /* never switched off for the visit because of a busy moment */ p.res({ pcm: m.pcm, sr: m.sr, f0: m.f0 || 0, starts: m.starts || null, failed: !!m.failed }); } busyUntil = performance.now(); }
        else if (m.type === 'error') {
          if (m.id === -1) { state = 'failed'; lastErr = m.text; console.warn('[neural voice] could not load, using fallback voices:', m.text); emit(); pending.forEach(function (p) { p.rej(new Error(m.text)); }); pending.clear(); }
          else { var q = pending.get(m.id); if (q) { pending.delete(m.id); q.rej(new Error(m.text)); } }
        }
      };
      worker.onerror = function (e) { state = 'failed'; lastErr = String(e && e.message || 'worker error'); emit(); pending.forEach(function (p) { p.rej(new Error(lastErr)); }); pending.clear(); };
      worker.postMessage({ type: 'load', device: dev });
    };
    // WebGPU only on roomy desktops (its fp32 model is larger); everyone else gets the compact WASM model
    var forced = (/[?&]nvdevice=(wasm|webgpu)/.exec(location.search) || [])[1]; if (forced) { go(forced); return; } // debug override
    /* the voice model never runs on the GPU next to the 3D game (the two together could crash the tab): on roomy desktops it runs on the
       CPU with the SAME full-quality fp32 weights ('wasm-full'), so the voices sound exactly the same; small devices keep the compact model */
    /* the compact model everywhere: the full fp32 model is 326 MB and several times slower on the CPU, so lines waited for it and
       then fell back to the built-in voices (or its first speed test failed and switched the natural voices off for the visit) */
    go('wasm');
  }

  function gen(text, voice, speed, shape) {
    text = String(text == null ? '' : text).replace(/[*_~`#|<>\[\]{}^]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); // never read symbols like * aloud
    var cv = CUSTOM_VOICES[voice], mum = !!(cv && cv.mode === 'mumble');
    /* ACCURACY: the blended voice's own pitch is measured on its first line; from then on every line is tuned so the voice really
       speaks at the pitch its design asked for (target_pitch_hz), whatever the blend happened to come out as */
    if (cv && cv.targetHz && cv.baseF0 && shape && !shape.phrase && !Array.isArray(shape.notes)) { var cal = Math.max(0.6, Math.min(1.8, cv.targetHz / cv.baseF0)); shape = Object.assign({}, shape, { ratio: (shape.ratio || 1) / (cv.k || 1) * cal }); }
    if (!worker || (state !== 'ready' && !(mum && state === 'loading'))) return Promise.reject(new Error('neural voice not ready'));
    var id = nextId++;
    return new Promise(function (res, rej) {
      var now = performance.now(); if (!pending.size) busyUntil = now; var res0 = res; res = function (r) { try { if (cv && cv.targetHz && !cv.baseF0 && r && r.f0 > 40) cv.baseF0 = r.f0; } catch (e) { /* ok */ } res0(r); }; pending.set(id, { res: res, rej: rej, t: now });
      worker.postMessage({ type: 'gen', id: id, text: text, voice: voice, speed: Math.max(0.5, Math.min(2, speed || 1)), shape: mum ? null : (shape || null), device: device,
        mix: cv ? cv.mix || null : null, seed: cv ? cv.seed : 0, vary: cv ? cv.vary : 0, fx: cv ? cv.fx || null : null, lang: cv ? cv.lang || null : null, mode: mum ? 'mumble' : null, mumble: mum ? cv.mumble : null });
      setTimeout(function () { if (pending.has(id)) { pending.delete(id); rej(new Error('neural voice timeout')); } }, 45000);
    });
  }

  // ---------------------------------------------------------------- character -> voice matcher
  // Kokoro v1.0 English voices, best quality first inside each group
  var V = {
    usM: ['am_michael', 'am_fenrir', 'am_puck', 'am_eric', 'am_liam', 'am_onyx', 'am_echo'],
    usF: ['af_heart', 'af_bella', 'af_nicole', 'af_aoede', 'af_kore', 'af_sarah', 'af_nova', 'af_sky', 'af_jessica', 'af_river', 'af_alloy'],
    gbM: ['bm_george', 'bm_fable', 'bm_lewis', 'bm_daniel'],
    gbF: ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily']
  };
  // personality -> preferred voices and a pitch factor (1 = the voice's own pitch); factors stay in a natural range
  var PERSONA = [
    { re: /showman|ringmaster|announcer|host|theatrical|circus/, m: ['am_santa', 'am_fenrir', 'am_puck'], /* a deep lead (santa) with the energetic showman voices blended in underneath */ f: ['af_bella', 'af_nova'], k: 0.97, s: 1.08 },
    { re: /deep|booming|giant|ogre|titan|golem|dragon|monster/, m: ['am_onyx', 'am_fenrir', 'am_michael'], f: ['af_kore', 'af_alloy'], k: 0.88, s: 0.94 },
    { re: /gruff|grumpy|tough|pirate|knight|guard|raspy/, m: ['am_fenrir', 'am_onyx', 'am_eric'], f: ['af_kore', 'af_jessica'], k: 0.93, s: 0.98 },
    { re: /sly|smooth|villain|cool|detective/, m: ['am_eric', 'am_liam', 'am_michael'], f: ['af_river', 'af_kore'], k: 0.97, s: 0.97 },
    { re: /soft|shy|gentle|quiet|timid|whisper|ghost/, m: ['am_echo', 'am_liam'], f: ['af_nicole', 'af_sky'], k: 1.02, s: 0.92 },
    { re: /calm|warm|kind|friendly|mentor|gentleman/, m: ['am_michael', 'am_echo'], f: ['af_heart', 'af_aoede'], k: 1, s: 0.98 },
    { re: /bright|cheerful|bubbly|happy|fairy|princess/, m: ['am_puck', 'am_liam'], f: ['af_bella', 'af_heart', 'af_nova'], k: 1.04, s: 1.05 },
    { re: /small|cute|tiny|child|kid|baby|plush|youth|squeak/, m: ['am_puck', 'am_echo'], f: ['af_sky', 'af_nova'], k: 1.12, s: 1.04 }
  ];
  var used = new Map(); // character key -> its voice
  var CUSTOM_VOICES = {}; // cv_name -> { mix, seed, vary }: recipes the worker builds the voices from
  function hash(s) { var h = 2166136261; s = String(s || ''); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function match(spec, key, hint) {
    spec = spec || {}; key = String(key || 'x');
    if (used.has(key) && used.get(key).spec === spec) return used.get(key).pick;
    var designed = fromDesign(spec, key); if (designed) { used.set(key, { spec: spec, pick: designed }); return designed; }
    var desc = [spec.preset, spec.timbre, spec.label, hint].join(' ').toLowerCase();
    var g = spec.gender === 'female' ? 'f' : spec.gender === 'child' ? 'c' : 'm';
    var gb = /^en-(gb|au|ie|nz)/i.test(spec.accent || '') && !spec.showman && spec.timbre !== 'showman';
    var persona = null; for (var i = 0; i < PERSONA.length; i++) if (PERSONA[i].re.test(desc)) { persona = PERSONA[i]; break; }
    var prefs = persona ? (g === 'f' || g === 'c' ? persona.f : persona.m) : [];
    if (g === 'c' && !persona) prefs = ['af_sky', 'am_puck'];
    var pool = gb ? (g === 'f' || g === 'c' ? V.gbF : V.gbM) : (g === 'f' || g === 'c' ? V.usF : V.usM);
    var order = prefs.filter(function (v) { return gb ? /^b/.test(v) : /^a/.test(v); }).concat(prefs, pool);
    var h = hash(key);
    // the character's own voice: a blend of up to three ingredient voices from its gender/accent/personality, in
    // proportions set by the character (the main one leads; a showman keeps its energetic lead), plus a small personal
    // timbre offset in the worker - so every character sounds like itself and never like a stock voice
    var uniq = []; order.forEach(function (v) { if (uniq.indexOf(v) < 0) uniq.push(v); });
    var show = !!(spec.showman || spec.timbre === 'showman' || /showman|ringmaster/.test(desc));
    var lead = uniq.slice(0, 3);
    if (show && prefs[0] === 'am_santa') lead = ['am_santa', 'am_michael', 'am_onyx']; /* Caine: mainly santa, with a clear, lively American voice (michael) and a little deep American (onyx) */ var deepOnly = /santa/.test(String(spec.blend || '')) || (spec.showman && spec.only_lead);
    if (!show && lead.length > 1) { var r = h % lead.length; lead = lead.slice(r).concat(lead.slice(0, r)); }
    var W = show && lead[0] === 'am_santa' && lead.length === 3 ? [0.5, 0.32, 0.18] : show && lead[0] === 'am_santa' && lead.length === 2 ? [0.65, 0.35] : show && lead.length === 1 ? [1] : show ? [0.55, 0.25, 0.20] : [0.55 + ((h >>> 3) % 10) / 100, 0.28, 0.17 - ((h >>> 3) % 10) / 100];
    if (deepOnly) { lead = ['am_onyx', 'am_fenrir']; W = [0.5, 0.5]; } /* Caine: a full American show baritone - onyx (deep, resonant) + fenrir (grit, energy); george was dropped (its posh, over-precise diction read as nerdy) */ /* Caine: a booming SHOW BARITONE - onyx (deep, resonant), fenrir (grit and energy) and george (theatrical, crisp vintage-announcer diction); measured: about 3x the chest resonance of the earlier blend, no nasal 'nerdy' honk, a big-bodied voice */ /* Caine: a strong, YOUNGER adult voice (fenrir, deep and gritty) with a clear announcer (michael) and a lively, playful edge (puck) - no santa (it made him sound elderly). Picked by tone and resonance against the reference clip */ /* Caine: the deep lead voice, with 15% of a lively, playful voice (puck) - the blend that scored closest to the reference clip in an automatic search over 8 voices */
    var mix = lead.map(function (v, i) { return { voice: v, w: Math.max(0.05, W[i] || 0.1) }; });
    var voice = 'cv_' + String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_' + hash(JSON.stringify(mix)).toString(36);
    CUSTOM_VOICES[voice] = { mix: mix, seed: h, vary: 0.035 };
    /* CAINE'S SIGNATURE VOICE, measured against the reference recording (tadc-caine-3) and tuned until they match: the deep lead
       voice at its own pitch (median ~165 Hz like the clip, not dragged down), wide but natural swings, a slightly shorter vocal
       tract (F3 ~2.75 kHz like the clip) and a forward, brassy announcer tone (lows trimmed, strong 1.8 kHz projection), so it is
       bright and booming instead of dark and boomy; no random personal offset - Caine always sounds exactly like Caine */
    var caineV = !!(spec.showman || spec.timbre === 'showman');
    if (caineV) CUSTOM_VOICES[voice] = { mix: mix, seed: h, vary: 0, fx: { tract: 0.91, effort: 0.6, eq: [['lowshelf', 150, 4.5, 0.7], ['peak', 250, 1, 1.0], ['peak', 400, -1.5, 1.2], ['peak', 600, 2.5, 1.0], ['peak', 1050, -6, 1.0], ['peak', 1500, -4, 1.3], ['peak', 3000, 5, 1.0]] } }; /* less nasal: the 0.9-1.8 kHz nose band cut ~3.6 dB more, a more open mouth (600 Hz), clarity kept at 3 kHz */ /* bass-baritone: a bigger body (tract 0.88 = longer vocal tract, lower resonances), deep chest boom (150-250 Hz), honk cut, 2.9 kHz ring keeps the words clear */ /* effort 0.6: he is always half-shouting, a projecting showman, never conversational */ /* full chest, nasal honk cut further, a round 2.9 kHz 'ring' for projection instead of hissy crispness; a bigger body */ /* booming chest, mud and nasal honk trimmed, brassy 2.4 kHz projection and crisp consonants (exaggerated enunciation); a slightly bigger body (tract 0.97) */ /* searched against the clip's own sentence: open-mouthed vowels (F1 ~480 Hz like the clip), forward 1.8 kHz projection, a little air on top */
    // personal pitch / pace: persona base x the character's own natural-pitch setting x a tiny per-character offset
    var np = typeof spec.np === 'number' ? spec.np : 1, nr = typeof spec.nr === 'number' ? spec.nr : 1;
    var jit = (((h >>> 9) % 7) - 3) * 0.008;
    var k = (persona ? persona.k : 1) * (0.55 + 0.45 * np) + jit;
    if (g === 'c') k += 0.06;
    k = Math.max(0.84, Math.min(1.18, k));
    k = 1 + (k - 1) * 0.5;
    var showman = !!(spec.showman || spec.timbre === 'showman');
    if (showman) k = 1.02 + jit * 0.05; /* deeper speaking pitch (bass-baritone); the melody still leaps up for the showman peaks and yells */ /* a shouting voice sits a little higher than a talking one (~112 Hz typical, still a baritone) */ /* deeper: typical pitch ~105-110 Hz (a low show baritone); the wide melody still leaps high on accents */ /* typical pitch ~118 Hz: a show baritone; the melody still leaps up on accents and yells */ /* the new blend speaks low on its own (~118 Hz): this lands his typical pitch near 130 Hz - lower than before (163), not gruff */ /* his own natural pitch (measured to match the reference clip) */ /* a touch higher: deep, but not sunk */ // mid baritone-tenor, kept low: depth comes from the blend, not from dragging the pitch down
    var pace = Math.max(0.8, Math.min(1.3, (persona ? persona.s : 1) * (0.5 + 0.5 * nr)));
    if (showman) pace = 1.1; /* exclamations run x1.1 = 1.16, which matched the clip's length for the same sentence */ // fast announcer pacing, as in the reference clip (bursts go faster, deadpan slower)
    var pick = { voice: voice, k: k, pace: pace };
    if (showman) pick.style = { expr: 1.4, eq: 'caine' };
    /* Caine's melody, REWRITTEN per syllable (not just bent): fitted by an automatic search against his reference recording
       (melody error 3.8 semitones for the model's own reading -> 2.0): the first accented word leaps ~13 semitones, later
       accents fade, small words sit low, and "!" lines swoop up at the end */
    if (showman) pick.melody = { acc1: 19, acc2: 14, decay: 0.75, low: 3.5, endRise: 1, keep: 0.35, decl: 1.2, dyn: 12, vary: 1, stretch: 1.5, squeeze: 0.8, swoop: 0, zig: 0.1, finalYell: 0.3, endDrop: 8, heat: 0.5, glide: 0.13, vib: 0.6 }; /* showman, MELODIC: big leaps joined by long smooth slides (130 ms, sung speech), vibrato on held stressed vowels, steady designed notes (less random wobble), drawn-out stressed vowels, calmer lower line endings */
    /* deadpan / caught off guard: flatter and slower, but in the SAME voice register as his showman lines (the raw model reading sat
       far below him and sounded like a different person) */
    if (showman) { pick.deadMelody = { acc1: 4, acc2: 3, decay: 0.9, low: 1.5, endRise: 0, keep: 0.4, decl: 1.5, dyn: 4, vary: 0.5, stretch: 1.15, squeeze: 0.95, glide: 0.1, endDrop: 2 }; pick.deadLift = 1.2; }
    used.set(key, { spec: spec, pick: pick });
    return pick;
  }

  // ---------------------------------------------------------------- AI-designed voices (the hybrid voice)
  // The AI looks at the character and writes a voice design; it is built in three layers, so the voice is the character's own
  // and the words stay clear:
  //  1) WORDS: a new neural voice blended from up to 4 of the model's voices in the AI's own proportions (the model still does the
  //     pronunciation, so speech stays natural and clear), read with the accent of its main ingredients;
  //  2) BODY: pitch and vocal-tract size set separately (formant-shifted PSOLA: a giant has a long tract, a pixie a short one,
  //     so a high voice is a small speaker, not a strained big one), pace, an old-age wobble, a machine's flat melody;
  //  3) TEXTURE: breath, rasp/growl, nasal, muffled (through a mask or a closed mouth), bright/dark, metallic, hollow echo.
  //  A creature that does not speak words can use mode "mumble": procedural babble driven by its line's text (see the worker).
  var ALL = V.usM.concat(V.usF, V.gbM, V.gbF, ['am_santa', 'am_adam']);
  function num(x, a, b, d) { x = +x; return isFinite(x) ? Math.max(a, Math.min(b, x)) : d; }
  function fromDesign(spec, key) {
    var d = spec && spec.design; if (!d || typeof d !== 'object') return null;
    var h = hash(key + JSON.stringify(d));
    var mode = d.mode === 'mumble' ? 'mumble' : 'words';
    var mix = (Array.isArray(d.blend) ? d.blend : []).map(function (b) { return b && typeof b === 'object' ? { voice: String(b.voice || ''), w: num(b.weight != null ? b.weight : b.w, 0, 1, 0) } : null; })
      .filter(function (b) { return b && b.w > 0 && ALL.indexOf(b.voice) >= 0; }).slice(0, 4);
    if (mode === 'words' && !mix.length) return null; // no usable blend: the regular matcher picks one
    var bw = 0, tw = 0; mix.forEach(function (b) { tw += b.w; if (/^b/.test(b.voice)) bw += b.w; });
    var fx = { tract: num(d.tract, 0.82, 1.25, 1), tremble: num(d.tremble, 0, 1, 0), robot: num(d.robot, 0, 1, 0), breath: num(d.breath, 0, 1, 0), rasp: num(d.rasp, 0, 1, 0), nasal: num(d.nasal, 0, 1, 0), muffle: num(d.muffle, 0, 1, 0), bright: num(d.bright, -1, 1, 0), echo: num(d.echo, 0, 1, 0) };
    var pitch = num(d.pitch, 0.7, 1.45, 1), pace = num(d.pace, 0.75, 1.35, 1);
    /* CLARITY BUDGET: stacked effects blur words, so when the design piles them up they are scaled down together until the
       words stay clear (a muffled, raspy, metallic, echoing voice keeps its character at a lower total strength) */
    var load = fx.muffle * 1.0 + fx.rasp * 0.9 + fx.robot * 0.9 + fx.echo * 0.7 + fx.breath * 0.5 + fx.nasal * 0.4 + fx.tremble * 0.4;
    if (load > 1.1) { var sc = 1.1 / load; ['muffle', 'rasp', 'robot', 'echo', 'breath', 'nasal', 'tremble'].forEach(function (k) { fx[k] *= sc; }); }
    if (mode === 'mumble') {
      var mpk = { voice: 'mumble_' + h.toString(36), k: 1, pace: pace, mode: 'mumble' };
      CUSTOM_VOICES[mpk.voice] = { mode: 'mumble', seed: h, fx: fx, mumble: { f0: num(d.mumble_pitch_hz, 60, 700, 170 * pitch), tract: num(d.tract, 0.6, 1.8, 1), breath: num(d.breath, 0, 1, 0.12), tremble: fx.tremble } };
      return mpk;
    }
    var voice = 'cv_' + String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_d' + h.toString(36);
    CUSTOM_VOICES[voice] = { mix: mix, seed: h, vary: num(d.uniqueness, 0, 1, 0.5) * 0.07, fx: fx, lang: tw && bw / tw > 0.5 ? 'b' : 'a', targetHz: d.target_pitch_hz != null ? num(d.target_pitch_hz, 70, 420, 0) : 0, k: pitch };
    /* the character's own way of speaking: melody 0 = the model's natural reading, up to 1 = a wildly animated, sing-song delivery
       (accents leap, small words drop, lines end the way their punctuation says) */
    var mel = num(d.melody, 0, 1, 0), melody = mel >= 0.1 ? { acc1: 3 + 10 * mel, acc2: 2 + 8 * mel, decay: 0.6, low: 1.5 + 3 * mel, endRise: 3 + 7 * mel, keep: 0.6 - 0.25 * mel, decl: 1.2 } : null;
    return { voice: voice, k: pitch, pace: pace, mode: 'words', melody: melody };
  }

  // a rough fundamental-frequency estimate of a voiced clip (autocorrelation over the loudest frames)
  function f0(pcm, sr) {
    var N = 1024, lo = Math.floor(sr / 420), hi = Math.floor(sr / 65), best = [];
    for (var off = 0; off + N + hi < pcm.length; off += N) {
      var e0 = 0; for (var i = 0; i < N; i++) e0 += pcm[off + i] * pcm[off + i];
      if (e0 / N < 1e-4) continue;
      var r = new Float32Array(hi + 1), rmax = 0;
      for (var lag = lo; lag <= hi; lag++) { var s = 0, e1 = 0; for (var q = 0; q < N; q += 2) { s += pcm[off + q] * pcm[off + q + lag]; e1 += pcm[off + q + lag] * pcm[off + q + lag]; } r[lag] = s / Math.sqrt((e0 / 2) * e1 + 1e-12); if (r[lag] > rmax) rmax = r[lag]; }
      if (rmax < 0.5) continue;
      // the shortest lag that is (nearly) as periodic as the best one is the true period (avoids octave-down errors)
      for (var l2 = lo + 1; l2 < hi; l2++) if (r[l2] >= rmax * 0.92 && r[l2] >= r[l2 - 1] && r[l2] >= r[l2 + 1]) { best.push(sr / l2); break; }
    }
    if (!best.length) return 0; best.sort(function (a, b) { return a - b; }); return best[Math.floor(best.length / 2)];
  }
  window.NeuralVoice = {
    supported: supported, start: start, gen: gen, match: match, f0: f0,
    status: status, ready: function () { return state === 'ready'; },
    onStatus: function (f) { listeners.push(f); try { f(status()); } catch (e) { /* ok */ } }
  };
  // download the natural voices right after the page has loaded (not when the first line is spoken), so they are ready in time
  (function preload() { var go2 = function () { setTimeout(function () { try { if (state === 'off') start(); } catch (e) { /* ok */ } }, 1500); }; if (document.readyState === 'complete') go2(); else window.addEventListener('load', go2, { once: true }); })();
})();
