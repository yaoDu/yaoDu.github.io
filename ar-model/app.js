// Minimal inline viewer behavior and scaffold for WASM-only AI (local-only)
(() => {
  const modelViewer = document.querySelector('#pagoda-model');
  if (!modelViewer) return;

  modelViewer.addEventListener('load', () => {
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    // Optionally scale the element on mobile without using Three.js internals
    if (isMobile) {
      modelViewer.scale = '1 1 1';
    }
  });

  // Register a minimalist Service Worker for offline reloads (CSP-safe: not inline)
  if ('serviceWorker' in navigator) {
    try {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    } catch {}
  }

  // Hook into existing UI elements in the results panel
  const runBtn = document.getElementById('run-ai-btn');
  const realtimeChk = document.getElementById('realtime-chk');
  const speakChk = document.getElementById('speak-chk');
  const statusChip = document.getElementById('status-chip');
  const fpsChip = document.getElementById('fps-chip');
  const resultsCaption = null; // textual caption removed; we use bars only
  const resultCards = document.querySelectorAll('.results-cards .result-card');
  const previewVideo = document.getElementById('camera-preview');
  const setStatus = (value) => {
    if (statusChip) {
      statusChip.textContent = `AI: ${value}`;
      statusChip.setAttribute('data-ai-status', value);
    }
  };

  // Speech synthesis reliability helpers (mobile browsers often need warmup)
  let speechReady = false;
  let speechWarmupInProgress = false;

  function getPreferredVoice() {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return null;
      const voices = synth.getVoices ? synth.getVoices() : [];
      if (!voices || voices.length === 0) return null;
      // Prefer en-US, then any English, else first
      let voice = voices.find(v => v.lang && v.lang.toLowerCase().includes('en-us'))
        || voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'))
        || voices[0];
      return voice || null;
    } catch { return null; }
  }

  async function warmupSpeech() {
    if (speechReady || speechWarmupInProgress) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      speechWarmupInProgress = true;
      // Ensure voices are loaded
      let voices = synth.getVoices();
      if (!voices || voices.length === 0) {
        await new Promise(resolve => {
          let settled = false;
          const done = () => { if (!settled) { settled = true; resolve(); } };
          const onVoices = () => { synth.removeEventListener('voiceschanged', onVoices); done(); };
          synth.addEventListener('voiceschanged', onVoices);
          // Nudge voices loading and provide a timeout fallback
          synth.getVoices();
          setTimeout(done, 700);
        });
        voices = synth.getVoices();
      }
      // Speak an inaudible short utterance to unlock on iOS
      const u0 = new SpeechSynthesisUtterance('.');
      u0.lang = 'en-US';
      u0.rate = 1;
      u0.pitch = 1;
      u0.volume = 0; // muted warmup
      const v = getPreferredVoice();
      if (v) u0.voice = v;
      try { synth.speak(u0); } catch {}
      speechReady = true;
    } catch {
      // ignore
    } finally {
      speechWarmupInProgress = false;
    }
  }

  function speak(text) {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !speakChk.checked) return;
      if (!speechReady) {
        // Attempt warmup, then speak after a short delay
        warmupSpeech();
        setTimeout(() => speak(text), 120);
        return;
      }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1;
      u.pitch = 1;
      const v = getPreferredVoice();
      if (v) u.voice = v;
      synth.speak(u);
    } catch {}
  }

  // If user enables speech, warm up immediately under a user gesture
  speakChk.addEventListener('change', () => { if (speakChk.checked) warmupSpeech(); });

  // Camera controls: use static button under subtitle and the right-panel toggles

  // Button is placed in HTML under the subtitle; toggles live in results panel

  let mediaStream = null;

  // Use the built-in preview video in the media panel

  async function startCamera() {
    if (!('mediaDevices' in navigator)) throw new Error('mediaDevices unsupported');
    if (!(window.isSecureContext || location.hostname === 'localhost')) {
      throw new Error('Camera requires HTTPS or localhost');
    }
    // Lower resolution to reduce preprocessing and model input cost
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 }, audio: false });
    if (previewVideo) {
      previewVideo.srcObject = mediaStream;
      try { await previewVideo.play(); } catch {}
      previewVideo.style.display = 'block';
    }
    // Hide AR viewer while real-time is enabled
    if (modelViewer) modelViewer.style.display = 'none';
    // Start real-time classification loop (auto)
    try { await ensureSession(); } catch {}
    beginRealtimeClassification();
  }

  function stopCamera() {
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
    // Ensure preview is stopped and restore AR viewer
    try { if (previewVideo) previewVideo.pause(); } catch {}
    if (previewVideo) {
      previewVideo.srcObject = null;
      previewVideo.style.display = 'none';
    }
    if (modelViewer) modelViewer.style.display = '';
    // Stop real-time classification loop
    stopRealtimeClassification();
  }

  // Reuse canvas and typed buffers to reduce allocations
  const preprocess = (() => {
    const size = 224;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const float = new Float32Array(size * size * 3);
    const chw = new Float32Array(size * size * 3);
    return { size, canvas, ctx, float, chw };
  })();

  async function videoToTensor(ort, inputMeta) {
    if (!previewVideo || !previewVideo.videoWidth || !previewVideo.videoHeight) throw new Error('Video not ready');
    const size = preprocess.size;
    const ctx = preprocess.ctx;
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(previewVideo, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const dims = inputMeta?.dimensions || [1, 3, size, size];
    const isNCHW = Array.isArray(dims) && dims.length === 4 ? (dims[1] === 3) : true;
    const float = preprocess.float;
    for (let i = 0, j = 0; i < data.length; i += 4) {
      const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
      float[j++] = r; float[j++] = g; float[j++] = b;
    }
    if (isNCHW) {
      const chw = preprocess.chw;
      let p = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) chw[p++] = float[(y * size + x) * 3 + 0];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) chw[p++] = float[(y * size + x) * 3 + 1];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) chw[p++] = float[(y * size + x) * 3 + 2];
      return new ort.Tensor('float32', chw, [1, 3, size, size]);
    }
    return new ort.Tensor('float32', float, [1, size, size, 3]);
  }

  // setStatus defined above to update the right-panel chip

  // Helpers to update the results cards in the right panel
  function updateResultCards(tops) {
    const cards = resultCards || document.querySelectorAll('.results-cards .result-card');
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const titleEl = card.querySelector('.result-title');
      const pctEl = card.querySelector('.percent');
      const barEl = card.querySelector('.bar');
      const progressEl = card.querySelector('.progress');
      let label = '—';
      let pct = 0;
      if (i < tops.length) {
        label = getLabel(tops[i].index);
        pct = Math.max(0, Math.min(100, tops[i].prob * 100));
      }
      if (titleEl) titleEl.textContent = label;
      if (pctEl) pctEl.textContent = `${pct.toFixed(0)}%`;
      if (barEl) barEl.style.width = `${pct}%`;
      if (progressEl) progressEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
  }

  // --- Singleton AI module/session state (for offline reuse) ---
  let ortModule = null; // onnxruntime-web module (loaded once)
  let modelBytes = null; // ONNX bytes cached in-memory after first fetch
  let session = null;    // InferenceSession reused across predictions
  const MODEL_PATH = '../models/mobilenetv2.onnx';

  async function ensureOrtModule() {
    if (ortModule) return ortModule;
    const mod = await import('../lib/ort/ort.min.js');
    if (mod && mod.env && mod.env.wasm) {
      mod.env.wasm.wasmPaths = '../lib/ort/';
      // In non crossOriginIsolated contexts, force 1 thread to avoid warning
      const isolated = (typeof crossOriginIsolated !== 'undefined') ? crossOriginIsolated : false;
      const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 2;
      mod.env.wasm.numThreads = isolated ? Math.min(4, Math.max(1, cores)) : 1;
      mod.env.wasm.simd = true;
    }
    ortModule = mod;
    return ortModule;
  }

  async function ensureSession() {
    if (session) return session;
    const ort = await ensureOrtModule();
    if (!modelBytes) modelBytes = await fetchOnnxBytes(MODEL_PATH);
    session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] });
    return session;
  }

  function firstInitRequiresNetwork() {
    return !session && !navigator.onLine;
  }

  // --- Inference helpers ---
  let labels = null;
  function normalizeLabels(obj) {
    try {
      // Case 1: already an array of strings
      if (Array.isArray(obj)) return obj.map(String);
      // Case 2: { labels: [...] }
      if (obj && Array.isArray(obj.labels)) return obj.labels.map(String);
      // Case 3: { "0": "tench", "1": "goldfish", ... }
      if (obj && typeof obj === 'object') {
        const entries = Object.entries(obj)
          .filter(([k]) => !isNaN(Number(k)))
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([, v]) => String(v));
        if (entries.length > 0) return entries;
      }
    } catch {}
    return null;
  }

  function prettifyLabel(s) {
    if (typeof s !== 'string') return s;
    // Common ImageNet label formats: "n01440764 tench" or "tench, Tinca tinca"
    if (s.includes(',')) s = s.split(',')[0];
    const parts = s.trim().split(/\s+/);
    if (parts[0].match(/^n\d{8}$/)) parts.shift();
    return parts.join(' ');
  }

  function getLabel(idx) {
    if (!labels) return `class ${idx}`;
    const raw = labels[idx];
    return raw ? prettifyLabel(raw) : `class ${idx}`;
  }
  async function tryLoadLabels() {
    try {
      const res = await fetch('../models/labels.json');
      if (!res.ok) return;
      // Try strict JSON first
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        const normalized = normalizeLabels(data);
        if (normalized && normalized.length > 0) { labels = normalized; return; }
      } catch {}
      // Fallback: line-based tolerant parse for non-JSON label maps like: {0: 'tench', 1: 'goldfish', ...}
      const lines = text.split(/\r?\n/);
      const parsed = [];
      for (const line of lines) {
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const keyStr = line.slice(0, idx).replace(/[^0-9]/g, '');
        if (keyStr === '') continue;
        const key = Number(keyStr);
        let val = line.slice(idx + 1).trim();
        // Remove trailing comma or closing brace
        if (val.endsWith(',')) val = val.slice(0, -1).trim();
        if (val.endsWith('}')) val = val.slice(0, -1).trim();
        // Strip wrapping quotes (single or double)
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1);
        }
        parsed[key] = String(val);
      }
      const compact = parsed.filter(v => typeof v === 'string');
      if (compact.length > 0) labels = compact;
    } catch {}
  }
  // fire-and-forget optional labels load
  tryLoadLabels();

  function softmax(logits) {
    let max = -Infinity;
    for (let i = 0; i < logits.length; i++) if (logits[i] > max) max = logits[i];
    const exps = new Float32Array(logits.length);
    let sum = 0;
    for (let i = 0; i < logits.length; i++) { const v = Math.exp(logits[i] - max); exps[i] = v; sum += v; }
    for (let i = 0; i < exps.length; i++) exps[i] /= sum;
    return exps;
  }

  function argmax(arr) {
    let idx = 0, best = -Infinity;
    for (let i = 0; i < arr.length; i++) { if (arr[i] > best) { best = arr[i]; idx = i; } }
    return idx;
  }

  function topK(probs, k) {
    const n = probs.length;
    const indices = new Array(n);
    for (let i = 0; i < n; i++) indices[i] = i;
    indices.sort((a, b) => probs[b] - probs[a]);
    const out = [];
    for (let j = 0; j < Math.min(k, n); j++) out.push({ index: indices[j], prob: probs[indices[j]] });
    return out;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  async function imageToTensor(url, ort, inputMeta) {
    const img = await loadImage(url);
    const size = 224; // MobileNetV2 target
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const dims = inputMeta?.dimensions || [1, 3, size, size];
    const isNCHW = Array.isArray(dims) && dims.length === 4 ? (dims[1] === 3) : true; // default to NCHW
    const tensorSize = size * size * 3;
    const float = new Float32Array(tensorSize);

    // Normalize to [0,1]
    for (let i = 0, j = 0; i < data.length; i += 4) {
      const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
      float[j++] = r; float[j++] = g; float[j++] = b;
    }

    if (isNCHW) {
      // Convert HWC -> CHW
      const chw = new Float32Array(tensorSize);
      let p = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 3;
          chw[p++] = float[idx + 0];
        }
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 3;
          chw[p++] = float[idx + 1];
        }
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 3;
          chw[p++] = float[idx + 2];
        }
      }
      return new ort.Tensor('float32', chw, [1, 3, size, size]);
    } else {
      // NHWC [1,224,224,3]
      return new ort.Tensor('float32', float, [1, size, size, 3]);
    }
  }

  // Helper: robustly fetch and validate ONNX bytes to avoid HTML fallbacks
  async function fetchOnnxBytes(url) {
    if (modelBytes) return modelBytes;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100 * 1024) {
      throw new Error('ONNX too small or invalid (size check)');
    }
    const bytes = new Uint8Array(buf);
    // Quick heuristic: first bytes shouldn’t look like ASCII '<' (60) which signals HTML
    const asciiLT = 60;
    let asciiLike = 0;
    for (let i = 0; i < Math.min(16, bytes.length); i++) {
      if (bytes[i] === asciiLT) asciiLike++;
    }
    if (asciiLike > 2) throw new Error('Invalid ONNX: looks like HTML');
    return bytes;
  }

  // Real-time classification loop
  let lastSpokenLabel = '';
  let lastInferEnd = 0;
  let fpsEMA = null; // exponential moving average for smoother FPS
  let classifyTimer = null;
  let classifyInFlight = false;
  function beginRealtimeClassification() {
    if (classifyTimer) return;
    // Run every ~600ms for higher responsiveness
    classifyTimer = setInterval(async () => {
      if (classifyInFlight || !mediaStream) return;
      if (!session) { try { await ensureSession(); } catch { return; } }
      classifyInFlight = true;
      try {
        setStatus('running');
        const metaMap = session.inputMetadata || {};
        const inputNames = (session.inputNames && session.inputNames.length > 0) ? session.inputNames : Object.keys(metaMap);
        if (!inputNames || inputNames.length === 0) throw new Error('No input names found');
        const inputName = inputNames[0];
        const inputMeta = metaMap[inputName];
        const tensor = await videoToTensor(ortModule || (await ensureOrtModule()), inputMeta);
        const results = await session.run({ [inputName]: tensor });
        const outNames = (session.outputNames && session.outputNames.length > 0) ? session.outputNames : Object.keys(results);
        const output = results[outNames[0]];
        const probs = softmax(output.data);
        const tops = topK(probs, 4);
        updateResultCards(tops);
        // Speak only the top-1 label (no prefix/percentage) and only when it changes
        const top1Label = tops.length > 0 ? getLabel(tops[0].index) : '';
        if (speakChk.checked && top1Label && top1Label !== lastSpokenLabel && !(window.speechSynthesis && window.speechSynthesis.speaking)) {
          speak(top1Label);
          lastSpokenLabel = top1Label;
        }
        // Update FPS (EMA of instantaneous FPS between completed inferences)
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (lastInferEnd > 0) {
          const dt = now - lastInferEnd;
          if (dt > 0) {
            const inst = 1000 / dt;
            fpsEMA = fpsEMA == null ? inst : (fpsEMA * 0.9 + inst * 0.1);
            if (fpsChip) fpsChip.textContent = `FPS: ${fpsEMA.toFixed(1)}`;
          }
        }
        lastInferEnd = now;
        setStatus('done');
      } catch (e) {
        // keep going; show error status briefly
        setStatus('error');
      } finally {
        classifyInFlight = false;
      }
    }, 600);
  }
  function stopRealtimeClassification() {
    if (classifyTimer) {
      clearInterval(classifyTimer);
      classifyTimer = null;
    }
  }

  // Run-on-Device AI: classify a static sample image
  if (runBtn) runBtn.addEventListener('click', async () => {
    try {
      if (speakChk.checked) warmupSpeech();
      setStatus('running');
      if (firstInitRequiresNetwork()) {
        if (resultsCaption) resultsCaption.textContent = 'Model not yet cached. Connect once to initialize.';
        setStatus('error');
        return;
      }
      await ensureSession();
      const metaMap = session.inputMetadata || {};
      const inputNames = (session.inputNames && session.inputNames.length > 0) ? session.inputNames : Object.keys(metaMap);
      if (!inputNames || inputNames.length === 0) throw new Error('No input names found');
      const inputName = inputNames[0];
      const inputMeta = metaMap[inputName];
      const tensor = await imageToTensor('../assets/sample.jpg', ortModule || (await ensureOrtModule()), inputMeta);
      const results = await session.run({ [inputName]: tensor });
      const outNames = (session.outputNames && session.outputNames.length > 0) ? session.outputNames : Object.keys(results);
      const output = results[outNames[0]];
      const probs = softmax(output.data);
      const tops = topK(probs, 4);
      const labelsWithPct = tops.slice(0, 3).map(t => `${getLabel(t.index)} (${(t.prob * 100).toFixed(1)}%)`).join(', ');
      // caption removed; results are shown in the bars only
      updateResultCards(tops);
      setStatus('done');
      const top1Label = tops.length > 0 ? getLabel(tops[0].index) : '';
      if (speakChk.checked && top1Label && !(window.speechSynthesis && window.speechSynthesis.speaking)) {
        speak(top1Label);
        lastSpokenLabel = top1Label;
      }
    } catch (e) {
      console.warn('[AI] sample classify failed:', e.message);
      setStatus('error');
      alert('Classification failed. Ensure model is present.');
    }
  });

  // Real-time Classification toggle
  realtimeChk.addEventListener('change', async () => {
    try {
      if (realtimeChk.checked) {
        await startCamera();
      } else {
        stopCamera();
      }
    } catch (e) {
      console.warn('[AI] camera not available:', e.message);
      alert('Camera unavailable. Use HTTPS or localhost and grant permission.');
      realtimeChk.checked = false;
    }
  });
})();


