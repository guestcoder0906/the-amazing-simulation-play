// listen-worker.js - in-browser listening, used only when Gemini is not available.
// Speech -> text with Whisper (onnx-community/whisper-base) and "what can be heard" with an AudioSet classifier
// (Xenova/ast-finetuned-audioset-10-10-0.4593: 527 classes: speech, laughter, crying, shouting, whispering, singing,
// music genres and instruments, animals, vehicles, effects...). Both run on the device (WebGPU when available).
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/+esm';

let asr = null, tagger = null, loading = null;

async function load(device) {
  if (asr && tagger) return;
  if (!loading) {
    loading = (async () => {
      const opts = device === 'webgpu' ? { device: 'webgpu', dtype: 'fp32' } : { device: 'wasm', dtype: 'q8' };
      const tryLoad = async (task, model, o) => { try { return await pipeline(task, model, o); } catch (e) { if (o.device === 'webgpu') return pipeline(task, model, { device: 'wasm', dtype: 'q8' }); throw e; } };
      [asr, tagger] = await Promise.all([
        tryLoad('automatic-speech-recognition', 'onnx-community/whisper-base', opts),
        tryLoad('audio-classification', 'Xenova/ast-finetuned-audioset-10-10-0.4593', { device: 'wasm', dtype: 'q8' }),
      ]);
    })();
  }
  await loading;
}

let chain = Promise.resolve();
self.onmessage = (ev) => {
  const m = ev.data || {};
  if (m.type === 'load') { load(m.device).then(() => postMessage({ type: 'ready' }), (e) => postMessage({ type: 'error', id: -1, text: String(e && e.message || e) })); return; }
  if (m.type !== 'listen') return;
  chain = chain.then(async () => {
    try {
      await load(m.device);
      const pcm = m.pcm; // Float32Array, 16 kHz mono
      const [words, tags] = await Promise.all([
        m.speech ? asr(pcm, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false }) : Promise.resolve({ text: '' }),
        tagger(pcm, { top_k: 12 }),
      ]);
      postMessage({ type: 'heard', id: m.id, text: String((words && words.text) || '').trim(), tags: (tags || []).map((t) => ({ label: t.label, score: +t.score.toFixed(3) })) });
    } catch (e) {
      postMessage({ type: 'error', id: m.id, text: String(e && e.message || e) });
    }
  });
};
