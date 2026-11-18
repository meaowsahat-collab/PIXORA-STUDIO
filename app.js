'use strict';
window.addEventListener('error', e => {
  try {
    let b = document.getElementById('errBanner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'errBanner';
      b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#b00020;color:#fff;font:12px monospace;padding:8px;white-space:pre-wrap';
      document.body.appendChild(b);
    }
    b.textContent = 'Error: ' + e.message + ' (' + String(e.filename || '').split('/').pop() + ':' + e.lineno + ')';
  } catch (_) {}
});
/* IXORA Studio v2.2 — offline manual photo editor & pro segmentation toolkit */
const $ = s => document.querySelector(s);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const MAX_EDGE = 4096;

/* ---------- adjustments ---------- */
const ADJ = {
  brightness: ['Brightness', -100, 100],
  contrast: ['Contrast', -100, 100],
  saturation: ['Saturation', -100, 100],
  exposure: ['Exposure', -100, 100],
  temperature: ['Temperature', -100, 100],
  tint: ['Tint', -100, 100],
  highlights: ['Highlights', -100, 100],
  shadows: ['Shadows', -100, 100],
  vibrance: ['Vibrance', -100, 100],
  hue: ['Hue', -100, 100],
  fade: ['Fade', 0, 100],
  sharpness: ['Sharpness', 0, 100],
  grain: ['Grain', 0, 100],
  edge: ['Edge Darken', -100, 100]
};
const ADJ_KEYS = Object.keys(ADJ);
const zeroAdjust = () => Object.fromEntries(ADJ_KEYS.map(k => [k, 0]));
const hasAdjust = a => ADJ_KEYS.some(k => a[k]);

/* ---------- state ---------- */
let base = null, photoName = 'ixora-photo', layers = [], undoStack = [], future = [], activeTool = '', panel = 'all',
  adjust = zeroAdjust(), drawMode = '', pointerState = null, adjustmentSnapshot = false,
  dressImage = null, dress = { x: .25, y: .25, w: .5, h: .5, opacity: 1, rotate: 0 }, toastTimer,
  previewOverride = null, restoreSource = null, originalRestore = null, rawOriginal = null, selection = [], overlay = null,
  renderQueued = false, bgSeed = null, fgStrokes = [], bgStrokes = [], wandMaskState = null, wandOpts = null,
  aiBgMod = null, aiBgPromise = null, aiMaskCache = null, lastVectorSvg = '';

const defs = [
  ['photo', 'Photo Editor', 'Crop', 'crop'],
  ['photo', 'Photo Editor', 'Rotate', 'rotate'],
  ['photo', 'Photo Editor', 'Flip', 'flip'],
  ['photo', 'Photo Editor', 'Layers', 'layers'],
  ['photo', 'Photo Editor', 'Draw', 'draw'],
  ['photo', 'Photo Editor', 'Eraser', 'eraser'],
  ['photo', 'Photo Editor', 'Text', 'text'],
  ['photo', 'Photo Editor', 'Shapes', 'shapes'],
  ['photo', 'Photo Editor', 'Pro Vectorize (SVG)', 'vectorize'],
  ['adjust', 'Image Adjust', 'All Adjustments', 'adjustAll'],
  ...ADJ_KEYS.map(k => ['adjust', 'Image Adjust', ADJ[k][0], k]),
  ['filters', 'Filters', 'Vintage', 'vintage'],
  ['filters', 'Filters', 'HDR-style', 'hdr'],
  ['filters', 'Filters', 'B&W', 'bw'],
  ['filters', 'Filters', 'Film', 'film'],
  ['filters', 'Filters', 'Sepia', 'sepia'],
  ['filters', 'Filters', 'Noir', 'noir'],
  ['filters', 'Filters', 'Warm', 'warm'],
  ['filters', 'Filters', 'Cool', 'cool'],
  ['filters', 'Filters', 'Cinematic', 'cinematic'],
  ['filters', 'Filters', 'Vivid', 'vivid'],
  ['filters', 'Filters', 'Sunset', 'sunset'],
  ['filters', 'Filters', 'Invert', 'invert'],
  ['filters', 'Filters', 'Blur', 'blur'],
  ['filters', 'Filters', 'Vignette', 'vignette'],
  ['filters', 'Filters', 'Pixelate', 'pixelate'],
  ['background', 'Background', 'Auto Remove BG', 'autoBg'],
  ['background', 'Background', 'Magic Wand', 'magicWand'],
  ['background', 'Background', 'Manual Selection', 'selection'],
  ['background', 'Background', 'Erase Background', 'bgErase'],
  ['background', 'Background', 'Restore Eraser', 'restore'],
  ['background', 'Background', 'Background Color', 'bgFill'],
  ['image', 'Image Tools', 'Resize', 'resize'],
  ['image', 'Image Tools', 'Compress', 'compress'],
  ['image', 'Image Tools', 'Convert', 'convert'],
  ['image', 'Image Tools', 'Watermark', 'watermark'],
  ['image', 'Image Tools', 'Border', 'border'],
  ['image', 'Image Tools', 'Collage', 'collage'],
  ['batch', 'Batch Tools', 'Batch Resize', 'batchResize'],
  ['batch', 'Batch Tools', 'Batch Convert', 'batchConvert'],
  ['batch', 'Batch Tools', 'Batch Rename', 'batchRename'],
  ['files', 'File Tools', 'ZIP Extractor', 'zip'],
  ['files', 'File Tools', 'File Manager', 'fileManager'],
  ['files', 'File Tools', 'Download History', 'history'],
  ['dress', 'Manual Dress Editor', 'Add Clothing Layer', 'dressAdd'],
  ['dress', 'Manual Dress Editor', 'Move / Resize Clothing', 'dressEdit'],
  ['dress', 'Manual Dress Editor', 'Remove Clothing Layer', 'dressRemove']
];

const ICONS = {
  crop: '⌗', rotate: '↻', flip: '⇋', layers: '▱', draw: '✎', eraser: '◩', text: 'T', shapes: '◇', vectorize: '❖',
  adjustAll: '☰', brightness: '☼', contrast: '◐', saturation: '◉', exposure: '☀', temperature: '♨',
  tint: '◍', highlights: '△', shadows: '▽', vibrance: '❖', hue: '◔', fade: '░', sharpness: '✧',
  grain: '∷', edge: '▣', vintage: '◷', hdr: '▧', bw: '◑', film: '▤', sepia: '◈', noir: '●',
  warm: '☀', cool: '❄', cinematic: '▭', vivid: '✺', sunset: '◒', invert: '⊖', blur: '◌',
  vignette: '◉', pixelate: '▦', autoBg: '✂', magicWand: '✦', selection: '⬡', bgErase: '⌫',
  restore: '↶', bgFill: '■', resize: '↗', compress: '⇩', convert: '⇄', watermark: 'T',
  border: '▣', collage: '▦', batchResize: '▦', batchConvert: '⇄', batchRename: '✎', zip: '▣',
  fileManager: '▤', history: '◷', dressAdd: '＋', dressEdit: '↔', dressRemove: '×'
};
const toolIcon = k => ICONS[k] || '✦';

/* ---------- helpers ---------- */
function toast(s) {
  let t = $('#toast');
  t.textContent = s;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9));
function cloneCanvas(c) {
  let n = document.createElement('canvas');
  n.width = c.width;
  n.height = c.height;
  n.getContext('2d', { willReadFrequently: true }).drawImage(c, 0, 0);
  return n;
}
function newCanvas(w, h) {
  let n = document.createElement('canvas');
  n.width = w;
  n.height = h;
  return n;
}
function requirePhoto() {
  if (!base) { toast('Open a photo first.'); return false; }
  return true;
}
function blobOf(c, type = 'image/png', q = .92) {
  return new Promise(r => c.toBlob(b => r(b || new Blob()), type, q));
}
function canvasPos(e) {
  let r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * canvas.width / r.width,
    y: (e.clientY - r.top) * canvas.height / r.height
  };
}
function ensureRestoreSource() {
  if (!restoreSource || restoreSource.width !== base.width || restoreSource.height !== base.height) {
    restoreSource = cloneCanvas(base);
  }
}
function isImageFile(f) {
  return (f.type && f.type.startsWith('image/')) || /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(f.name || '');
}

/* ---------- native (Android) save / share & web download ---------- */
const Cap = window.Capacitor;
let isNative = false;
try { isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform()); } catch (e) {}
function nativePlugin(n) {
  try {
    if (Cap.Plugins && Cap.Plugins[n]) return Cap.Plugins[n];
    return Cap.registerPlugin(n);
  } catch (e) { return null; }
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    let r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
function addDownload(name, type) {
  try {
    let arr = JSON.parse(localStorage.getItem('ixoraDownloads') || '[]');
    arr.unshift({ name, type, date: new Date().toISOString() });
    localStorage.setItem('ixoraDownloads', JSON.stringify(arr.slice(0, 100)));
  } catch (e) {}
}
function triggerBrowserDownload(blob, name) {
  let url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  addDownload(name, blob.type);
}
async function deliver(items) {
  if (!items.length) return;
  const FS = isNative ? nativePlugin('Filesystem') : null, ShareP = isNative ? nativePlugin('Share') : null;
  if (isNative && FS && ShareP) {
    try {
      const uris = [];
      for (const it of items) {
        const r = await FS.writeFile({ path: 'ixora/' + it.name, data: await blobToBase64(it.blob), directory: 'CACHE', recursive: true });
        uris.push(r.uri);
      }
      items.forEach(it => addDownload(it.name, it.blob.type));
      await ShareP.share({ title: 'IXORA Studio', dialogTitle: 'Save or share', files: uris });
      toast('Choose "Save to device" / Files / Gallery to keep it.');
      return;
    } catch (e) {
      if (/cancel|dismiss/i.test(String(e && e.message || e))) return;
      toast('Could not save: ' + (e && e.message || e));
      return;
    }
  }
  for (let i = 0; i < items.length; i++) {
    triggerBrowserDownload(items[i].blob, items[i].name);
    if (i + 1 < items.length) await new Promise(r => setTimeout(r, 180));
  }
  toast(items.length > 1 ? `${items.length} files downloaded.` : 'Download ready: ' + items[0].name);
}
const saveBlob = (blob, name) => deliver([{ blob, name }]);

/* ---------- pure JS ZIP builder (store) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function buildZip(items) {
  const enc = new TextEncoder();
  const localParts = [], centralParts = [];
  let offset = 0;
  for (const it of items) {
    const nameBytes = enc.encode(it.name);
    const data = new Uint8Array(await it.blob.arrayBuffer());
    const crc = crc32(data);
    const lh = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(lh);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    new Uint8Array(lh, 30).set(nameBytes);

    const ch = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(ch);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    new Uint8Array(ch, 46).set(nameBytes);

    localParts.push(lh, data);
    centralParts.push(ch);
    offset += lh.byteLength + data.length;
  }
  const cdSize = centralParts.reduce((a, b) => a + b.byteLength, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, items.length, true);
  ev.setUint16(10, items.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

/* ---------- history ---------- */
function snap() {
  return { base: cloneCanvas(base), layers: structuredClone(layers), adjust: { ...adjust }, dress: { ...dress }, dressImage };
}
function snapshot() {
  if (!base) return;
  undoStack.push(snap());
  let limit = clamp(Math.floor(60e6 / (base.width * base.height)), 4, 30);
  while (undoStack.length > limit) undoStack.shift();
  future = [];
  updateHistoryButtons();
}
function updateHistoryButtons() {
  $('#undoBtn').disabled = !undoStack.length;
  $('#redoBtn').disabled = !future.length;
}
function undo() {
  if (!undoStack.length) return;
  future.push(snap());
  restoreState(undoStack.pop());
}
function redo() {
  if (!future.length) return;
  undoStack.push(snap());
  restoreState(future.pop());
}
function restoreState(s) {
  base = s.base;
  layers = s.layers;
  adjust = s.adjust;
  dress = s.dress;
  dressImage = s.dressImage || null;
  previewOverride = null;
  aiMaskCache = null;
  render();
  updateHistoryButtons();
  renderLayerList();
  if (ADJ[activeTool] || activeTool === 'adjustAll') selectTool(activeTool);
}

/* ---------- pixel adjustment pipeline ---------- */
function processPixels(im, a) {
  const d = im.data, w = im.width, h = im.height;
  const M = Math.pow(2, a.brightness / 100) * Math.pow(2, a.exposure / 50), cf = (100 + a.contrast) / 100, sh = a.shadows / 100, hi = a.highlights / 100, fd = a.fade / 100;
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = i / 255 * M;
    v = (v - .5) * cf + .5;
    let vc = clamp(v, 0, 1);
    v += sh * .4 * (1 - vc) * (1 - vc) + hi * .4 * vc * vc;
    v = v * (1 - fd * .25) + fd * .25;
    lut[i] = Math.round(v * 255);
  }
  const tr = a.temperature * .4 + a.tint * .15, tg = -a.tint * .3, tb = -a.temperature * .4 + a.tint * .15, doTone = a.temperature || a.tint;
  const sat = 1 + a.saturation / 100, vib = a.vibrance / 100, doColor = a.saturation || a.vibrance;
  const ang = a.hue * 1.8 * Math.PI / 180, cs = Math.cos(ang), sn = Math.sin(ang), doHue = a.hue !== 0;
  const m0 = .213 + cs * .787 - sn * .213, m1 = .715 - cs * .715 - sn * .715, m2 = .072 - cs * .072 + sn * .928;
  const m3 = .213 - cs * .213 + sn * .143, m4 = .715 + cs * .285 + sn * .140, m5 = .072 - cs * .072 - sn * .283;
  const m6 = .213 - cs * .213 - sn * .787, m7 = .715 - cs * .715 + sn * .715, m8 = .072 + cs * .928 + sn * .072;
  const grain = a.grain * .9, edge = a.edge / 100, cx = w / 2, cy = h / 2;
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      if (d[p + 3] === 0) continue;
      let r = lut[d[p]], g = lut[d[p + 1]], b = lut[d[p + 2]];
      if (doTone) { r += tr; g += tg; b += tb; }
      if (doHue) {
        let nr = r * m0 + g * m1 + b * m2, ng = r * m3 + g * m4 + b * m5, nb = r * m6 + g * m7 + b * m8;
        r = nr; g = ng; b = nb;
      }
      if (doColor) {
        let gray = .299 * r + .587 * g + .114 * b, s = sat;
        if (vib) {
          let mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          s *= 1 + vib * (1 - clamp((mx - mn) / 255, 0, 1));
        }
        r = gray + (r - gray) * s; g = gray + (g - gray) * s; b = gray + (b - gray) * s;
      }
      if (grain) {
        let n = (Math.random() - .5) * grain;
        r += n; g += n; b += n;
      }
      if (edge) {
        let dx = (x - cx) / cx, dy = (y - cy) / cy, rr = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 1.414), f = rr * rr * Math.abs(edge);
        if (edge > 0) {
          let k = 1 - f * .9; r *= k; g *= k; b *= k;
        } else {
          r += (255 - r) * f * .9; g += (255 - g) * f * .9; b += (255 - b) * f * .9;
        }
      }
      d[p] = r; d[p + 1] = g; d[p + 2] = b;
    }
  }
  if (a.sharpness > 0) sharpenData(im, a.sharpness);
}
function sharpenData(im, amount) {
  const d = im.data, w = im.width, h = im.height, s = new Uint8ClampedArray(d), k = amount / 100 * .9, c = 1 + 4 * k, w4 = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let i = (y * w + x) * 4;
      if (!s[i + 3]) continue;
      let aL = s[i - 1], aR = s[i + 7], aT = s[i - w4 + 3], aB = s[i + w4 + 3];
      for (let ch = 0; ch < 3; ch++) {
        let center = s[i + ch];
        let vL = aL ? s[i - 4 + ch] : center;
        let vR = aR ? s[i + 4 + ch] : center;
        let vT = aT ? s[i - w4 + ch] : center;
        let vB = aB ? s[i + w4 + ch] : center;
        d[i + ch] = center * c - k * (vL + vR + vT + vB);
      }
    }
  }
}
function adjustCanvas(src, a) {
  let n = cloneCanvas(src), c = n.getContext('2d', { willReadFrequently: true }), im = c.getImageData(0, 0, n.width, n.height);
  processPixels(im, a);
  c.putImageData(im, 0, 0);
  return n;
}

/* ---------- render ---------- */
function render() {
  if (!base) return;
  let src = previewOverride || base;
  if (canvas.width !== src.width || canvas.height !== src.height) {
    canvas.width = src.width;
    canvas.height = src.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0);
  if (hasAdjust(adjust)) {
    let im = ctx.getImageData(0, 0, canvas.width, canvas.height);
    processPixels(im, adjust);
    ctx.putImageData(im, 0, 0);
  }
  layers.forEach(l => drawLayer(ctx, l));
  if (dressImage && dress.visible !== false) {
    ctx.save();
    ctx.globalAlpha = dress.opacity;
    const dw = dress.w * canvas.width, dh = dress.h * canvas.height, dx = dress.x * canvas.width, dy = dress.y * canvas.height;
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.rotate((dress.rotate || 0) * Math.PI / 180);
    ctx.drawImage(dressImage, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  if (overlay) overlay(ctx);
  $('#canvasHint').textContent = `${canvas.width} × ${canvas.height} · ${photoName}`;
}
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function renderClean() {
  const o = overlay;
  overlay = null;
  render();
  overlay = o;
}
function flat() {
  renderClean();
  return cloneCanvas(canvas);
}
function commitBase(n, keepRestore = false) {
  base = n;
  layers = [];
  adjust = zeroAdjust();
  dressImage = null;
  previewOverride = null;
  aiMaskCache = null;
  if (!keepRestore) restoreSource = null;
  render();
}
function drawLayer(c, l) {
  c.save();
  c.globalAlpha = l.opacity ?? 1;
  if (l.type === 'text') {
    c.fillStyle = l.color;
    c.font = `${l.weight || 'normal'} ${l.size}px ${l.font || 'Arial'}`;
    c.textAlign = l.align || 'left';
    c.textBaseline = l.baseline || 'alphabetic';
    c.fillText(l.text, l.x, l.y);
  } else if (l.type === 'shape') {
    c.strokeStyle = l.color;
    c.fillStyle = l.color;
    c.lineWidth = l.lineWidth || 5;
    if (l.shape === 'line') {
      c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.x2, l.y2); c.stroke();
    } else if (l.shape === 'circle') {
      c.beginPath(); c.ellipse(l.x + l.w / 2, l.y + l.h / 2, Math.abs(l.w / 2), Math.abs(l.h / 2), 0, 0, Math.PI * 2);
      l.fill ? c.fill() : c.stroke();
    } else {
      c.beginPath(); c.rect(l.x, l.y, l.w, l.h);
      l.fill ? c.fill() : c.stroke();
    }
  } else if (l.type === 'stroke') {
    c.strokeStyle = l.color;
    c.lineWidth = l.size;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    l.points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    if (l.points.length === 1) c.lineTo(l.points[0].x + .01, l.points[0].y);
    c.stroke();
  }
  c.restore();
}

/* ---------- Pro Max Vector-HD Master Pass + SVG Vectorizer ---------- */
function applyVectorMasterPass(srcCanvas) {
  let w = srcCanvas.width, h = srcCanvas.height;
  const maxSide = Math.max(w, h);
  let target = srcCanvas;
  /* Smart resolution upscale for phone/web photos under 1600px */
  if (maxSide < 1600 && maxSide >= 32) {
    const scale = Math.min(2, 1600 / maxSide);
    const nw = Math.round(w * scale), nh = Math.round(h * scale);
    const up = newCanvas(nw, nh), uc = up.getContext('2d', { willReadFrequently: true });
    uc.imageSmoothingEnabled = true;
    uc.imageSmoothingQuality = 'high';
    uc.drawImage(srcCanvas, 0, 0, nw, nh);
    target = up;
    w = nw; h = nh;
  } else {
    target = cloneCanvas(srcCanvas);
  }
  const c = target.getContext('2d', { willReadFrequently: true });
  const im = c.getImageData(0, 0, w, h), d = im.data, s = new Uint8ClampedArray(d), w4 = w * 4;
  /* Edge-preserving bilateral denoise + edge-directed vector clarity */
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (!s[i + 3]) continue;
      const r0 = s[i], g0 = s[i + 1], b0 = s[i + 2];
      let sr = r0, sg = g0, sb = b0, sw = 1, maxDiff = 0;
      const nb = [i - 4, i + 4, i - w4, i + w4];
      for (let k = 0; k < 4; k++) {
        const q = nb[k];
        if (!s[q + 3]) continue;
        const diff = Math.abs(r0 - s[q]) + Math.abs(g0 - s[q + 1]) + Math.abs(b0 - s[q + 2]);
        if (diff > maxDiff) maxDiff = diff;
        if (diff < 46) {
          const wt = 1 - diff / 46;
          sr += s[q] * wt; sg += s[q + 1] * wt; sb += s[q + 2] * wt; sw += wt;
        }
      }
      const mr = sr / sw, mg = sg / sw, mb = sb / sw;
      if (maxDiff > 24) {
        const sharp = clamp((maxDiff - 24) / 140, 0, 0.42);
        d[i] = mr + (r0 - mr) * (1 + sharp);
        d[i + 1] = mg + (g0 - mg) * (1 + sharp);
        d[i + 2] = mb + (b0 - mb) * (1 + sharp);
      } else {
        d[i] = mr; d[i + 1] = mg; d[i + 2] = mb;
      }
    }
  }
  c.putImageData(im, 0, 0);
  return target;
}

function buildVectorSVG(srcCanvas, numColors = 12, detailEdge = 500, addOutline = false) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const sc = Math.min(1, detailEdge / Math.max(W, H));
  const w = Math.max(16, Math.round(W * sc)), h = Math.max(16, Math.round(H * sc));
  const tmp = newCanvas(w, h), tc = tmp.getContext('2d', { willReadFrequently: true });
  tc.imageSmoothingEnabled = true;
  tc.imageSmoothingQuality = 'high';
  tc.drawImage(srcCanvas, 0, 0, w, h);
  const im = tc.getImageData(0, 0, w, h), d = im.data, N = w * h;

  /* 2-pass edge-preserving smooth for crisp flat vector bands */
  let buf = new Uint8ClampedArray(d);
  for (let pass = 0; pass < 2; pass++) {
    const next = new Uint8ClampedArray(buf);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (buf[i + 3] < 20) continue;
        let sr = buf[i], sg = buf[i + 1], sb = buf[i + 2], sw = 1;
        const nbs = [i - 4, i + 4, i - w * 4, i + w * 4];
        for (const q of nbs) {
          if (buf[q + 3] < 20) continue;
          const diff = Math.abs(buf[i] - buf[q]) + Math.abs(buf[i + 1] - buf[q + 1]) + Math.abs(buf[i + 2] - buf[q + 2]);
          if (diff < 75) {
            const wt = 1 - diff / 75;
            sr += buf[q] * wt; sg += buf[q + 1] * wt; sb += buf[q + 2] * wt; sw += wt;
          }
        }
        next[i] = sr / sw; next[i + 1] = sg / sw; next[i + 2] = sb / sw;
      }
    }
    buf = next;
  }

  /* K-Means RGB palette quantization */
  const samples = [];
  const step = Math.max(1, Math.floor(N / 1600));
  for (let i = 0; i < N; i += step) {
    const p = i * 4;
    if (buf[p + 3] > 30) samples.push([buf[p], buf[p + 1], buf[p + 2]]);
  }
  let pal = [[128, 128, 128]];
  if (samples.length) {
    pal = [samples[0].slice()];
    while (pal.length < numColors) {
      let best = null, bd = -1;
      for (const s of samples) {
        let md = 1e9;
        for (const c of pal) {
          const dd = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
          if (dd < md) md = dd;
        }
        if (md > bd) { bd = md; best = s; }
      }
      if (!best || bd < 90) break;
      pal.push(best.slice());
    }
    for (let it = 0; it < 6; it++) {
      const sums = pal.map(() => [0, 0, 0, 0]);
      for (const s of samples) {
        let bi = 0, bd = 1e9;
        for (let k = 0; k < pal.length; k++) {
          const c = pal[k], dd = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
          if (dd < bd) { bd = dd; bi = k; }
        }
        sums[bi][0] += s[0]; sums[bi][1] += s[1]; sums[bi][2] += s[2]; sums[bi][3]++;
      }
      pal = pal.map((c, k) => sums[k][3] ? [Math.round(sums[k][0] / sums[k][3]), Math.round(sums[k][1] / sums[k][3]), Math.round(sums[k][2] / sums[k][3])] : c);
    }
  }

  /* Map each pixel to nearest palette color and build scanline SVG paths */
  const idxMap = new Int16Array(N).fill(-1);
  const pathsByColor = pal.map(() => []);
  for (let y = 0; y < h; y++) {
    let runColor = -1, runStart = 0;
    for (let x = 0; x <= w; x++) {
      let ci = -1;
      if (x < w) {
        const p = (y * w + x) * 4;
        if (buf[p + 3] >= 30) {
          let best = 1e9;
          for (let k = 0; k < pal.length; k++) {
            const c = pal[k], dd = (buf[p] - c[0]) ** 2 + (buf[p + 1] - c[1]) ** 2 + (buf[p + 2] - c[2]) ** 2;
            if (dd < best) { best = dd; ci = k; }
          }
          idxMap[y * w + x] = ci;
        }
      }
      if (ci !== runColor) {
        if (runColor >= 0 && x > runStart) {
          pathsByColor[runColor].push(`M${runStart} ${y}h${x - runStart}v1.15H${runStart}z`);
        }
        runColor = ci;
        runStart = x;
      }
    }
  }

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${W}" height="${H}" shape-rendering="crispEdges">`;
  for (let k = 0; k < pal.length; k++) {
    if (!pathsByColor[k].length) continue;
    const [r, g, b] = pal[k];
    out += `<path fill="rgb(${r},${g},${b})" d="${pathsByColor[k].join('')}"/>`;
  }
  if (addOutline) {
    const edgePaths = [];
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const c = idxMap[y * w + x];
        if (c < 0) continue;
        if (c !== idxMap[y * w + x + 1] || c !== idxMap[(y + 1) * w + x]) {
          edgePaths.push(`M${x} ${y}h1v1H${x}z`);
        }
      }
    }
    if (edgePaths.length) out += `<path fill="rgba(16,20,28,0.45)" d="${edgePaths.join('')}"/>`;
  }
  out += '</svg>';
  return out;
}

/* ---------- opening a photo ---------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    let url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
    im.onerror = () => { URL.revokeObjectURL(url); reject(Error('Image could not be decoded')); };
    im.src = url;
  });
}
function loadPhotoFromBlob(blob, rawName) {
  return loadImage(blob).then(im => {
    let w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, MAX_EDGE / Math.max(w, h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
    const raw = newCanvas(w, h);
    raw.getContext('2d', { willReadFrequently: true }).drawImage(im, 0, 0, w, h);
    rawOriginal = raw;
    base = applyVectorMasterPass(raw);
    photoName = (rawName || 'ixora-photo').replace(/\.[^.]+$/, '') || 'ixora-photo';
    layers = []; adjust = zeroAdjust(); dressImage = null; restoreSource = null;
    previewOverride = null; undoStack = []; future = []; bgSeed = null;
    fgStrokes = []; bgStrokes = []; wandMaskState = null; aiMaskCache = null;
    canvas.hidden = false;
    $('.empty-state').hidden = true;
    originalRestore = cloneCanvas(base);
    $('#downloadBtn').disabled = false;
    $('#resetBtn').disabled = false;
    render();
    updateHistoryButtons();
    selectTool('adjustAll');
    toast(`Pro Vector-HD ready (${base.width}×${base.height}).`);
    if (window.innerWidth <= 1050 && $('.stage')) setTimeout(() => $('.stage').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  });
}
$('#fileInput').addEventListener('change', async e => {
  let f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { await loadPhotoFromBlob(f, f.name); } catch (err) { toast(err.message); }
});

/* ---------- tool list ---------- */
function setPanel(p) {
  panel = p;
  document.querySelectorAll('.side-link').forEach(b => b.classList.toggle('active', b.dataset.panel === p));
  renderTools();
}
document.querySelectorAll('.side-link').forEach(b => b.addEventListener('click', () => setPanel(b.dataset.panel)));
$('#toolSearch').addEventListener('input', renderTools);
function renderTools() {
  let q = $('#toolSearch').value.trim().toLowerCase(), groups = {};
  defs.filter(d => (panel === 'all' || panel === d[0]) && d[2].toLowerCase().includes(q)).forEach(d => (groups[d[1]] ??= []).push(d));
  $('#toolGroups').innerHTML = Object.entries(groups).map(([name, items]) => `<div class="group"><div class="group-title"><i></i>${name}</div><div class="tools-grid">${items.map(d => `<button class="tool-card ${activeTool === d[3] ? 'selected' : ''}" data-tool="${d[3]}"><b class="tool-icon">${toolIcon(d[3])}</b><span>${d[2]}</span></button>`).join('')}</div></div>`).join('') || '<p class="muted">No matching tools.</p>';
  document.querySelectorAll('.tool-card').forEach(b => b.addEventListener('click', () => { selectTool(b.dataset.tool); focusInspector(); }));
}
function focusInspector() {
  if (window.innerWidth <= 1050) setTimeout(() => $('.inspector').scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}
function syncStageHeight() {
  let s = $('.stage');
  if (s) document.documentElement.style.setProperty('--stage-h', s.offsetHeight + 'px');
}
if (window.ResizeObserver && $('.stage')) new ResizeObserver(syncStageHeight).observe($('.stage'));
window.addEventListener('resize', syncStageHeight);

/* ---------- control builders ---------- */
function control(label, id, type = 'number', value = '', extra = '') {
  return `<div class="control"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${value}" ${extra}></div>`;
}
function range(label, id, min, max, val, step = 1) {
  return `<div class="control"><label for="${id}">${label} <output id="${id}Out">${val}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
function button(id, text, cls = 'primary') {
  return `<button class="${cls}" id="${id}">${text}</button>`;
}
function select(label, id, opts) {
  return `<div class="control"><label for="${id}">${label}</label><select id="${id}">${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>`;
}
function check(label, id, on = true) {
  return `<label class="check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${label}</label>`;
}
function show(html) { $('#inspectorContent').innerHTML = html; }
function onRange(id, fn) {
  let r = $('#' + id);
  if (!r) return;
  r.addEventListener('input', () => {
    let o = $('#' + id + 'Out');
    if (o) o.textContent = r.value;
    fn(+r.value);
  });
}
const on = (id, fn) => { let e = $('#' + id); if (e) e.onclick = fn; };

function resetTools() {
  drawMode = ''; pointerState = null; selection = []; overlay = null; wandMaskState = null;
  canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onclick = null;
  canvas.style.cursor = 'default';
  canvas.style.touchAction = 'pan-y';
  adjustmentSnapshot = false;
  if (previewOverride) previewOverride = null;
  if (base) render();
}

function selectTool(k) {
  activeTool = k;
  resetTools();
  renderTools();
  $('#canvasTitle').textContent = defs.find(d => d[3] === k)?.[2] || 'Editor';
  $('#toolStatus').textContent = 'READY';
  if (['zip', 'fileManager', 'history', 'batchResize', 'batchConvert', 'batchRename', 'collage'].includes(k)) { toolAction(k); return; }
  if (['dressAdd', 'dressEdit', 'dressRemove'].includes(k)) { dressAction(k); return; }
  if (!requirePhoto()) { show('<p class="muted">Open a photo to use this tool.</p>'); return; }
  if (k === 'adjustAll' || ADJ[k]) return adjustTool(k);
  if (FILTER_IDS.includes(k)) return filterTool(k);
  if (k === 'autoBg') return autoBgTool();
  if (k === 'magicWand') return wandTool();
  if (k === 'selection' || k === 'transparent') return polygonTool();
  if (k === 'bgFill') return bgFillTool();
  if (k === 'crop') return cropTool();
  if (k === 'vectorize') return vectorizeTool();

  let html = '';
  if (k === 'rotate' || k === 'flip') {
    html = `<p class="muted">Transform the complete image. Transparent areas are preserved.</p><div class="inline-actions">${button('turnLeft', '↶ 90°', 'ghost')}${button('turnRight', '↷ 90°', 'ghost')}</div><div class="inline-actions">${button('flipH', 'Flip horizontal', 'ghost')}${button('flipV', 'Flip vertical', 'ghost')}</div>`;
  } else if (k === 'layers') {
    html = `<p class="muted">Text, shapes, drawing and clothing are separate editable layers.</p><div class="inline-actions">${button('addTextLayer', '＋ Text', 'ghost')}${button('addShapeLayer', '＋ Shape', 'ghost')}</div><div id="layerList" class="layer-list" style="margin-top:8px"></div>`;
  } else if (k === 'text') {
    html = `${control('Text', 'layerText', 'text', 'Your text')}${select('Font', 'textFont', [['Arial', 'Arial'], ['Georgia', 'Georgia'], ['Impact', 'Impact'], ['Courier New', 'Courier'], ['Verdana', 'Verdana']])}${select('Weight', 'textWeight', [['normal', 'Normal'], ['bold', 'Bold']])}${control('Font size (px)', 'textSize', 'number', Math.max(12, Math.round(base.width / 12)), 'min="8" max="1000"')}${control('Text color', 'textColor', 'color', '#ffffff')}${range('Horizontal position (%)', 'textX', 0, 100, 8)}${range('Vertical position (%)', 'textY', 0, 100, 12)}<p class="muted">Drag directly on the photo to position the text preview.</p>${button('addText', 'Add text layer')}`;
  } else if (k === 'shapes') {
    html = `${select('Shape', 'shapeType', [['rect', 'Rectangle'], ['circle', 'Ellipse'], ['line', 'Line']])}${control('Color', 'shapeColor', 'color', '#9cf06b')}${check('Filled', 'shapeFill', false)}${range('Line width', 'shapeLine', 1, 60, 5)}${range('X (%)', 'shapeX', 0, 100, 20)}${range('Y (%)', 'shapeY', 0, 100, 20)}${range('Width (%)', 'shapeW', 1, 100, 40)}${range('Height (%)', 'shapeH', 1, 100, 30)}<p class="muted">Drag on the photo to reposition the shape preview.</p>${button('addShape', 'Add shape layer')}`;
  } else if (k === 'draw' || k === 'eraser' || k === 'bgErase' || k === 'restore') {
    html = `<p class="muted">${k === 'bgErase' || k === 'eraser' ? 'Drag on the photo to erase to transparency.' : k === 'restore' ? 'Drag over erased areas to bring original pixels back.' : 'Drag directly on the photo to draw.'}</p>${k === 'draw' ? control('Brush color', 'brushColor', 'color', '#ffffff') : ''}${range('Brush size', 'brushSize', 1, 150, 28)}${button('startBrush', k === 'draw' ? 'Brush active (drag photo)' : k === 'restore' ? 'Restore active' : 'Eraser active', 'ghost btn-active')}${button('stopBrush', 'Pause brush', 'ghost')}`;
  } else if (k === 'resize') {
    html = `${control('Width (px)', 'resizeW', 'number', base.width, 'min="1" max="12000"')}${control('Height (px)', 'resizeH', 'number', base.height, 'min="1" max="12000"')}${check('Keep aspect ratio', 'keepRatio')}${button('doResize', 'Resize image')}`;
  } else if (k === 'compress') {
    html = `${range('JPEG quality (%)', 'quality', 10, 100, 82)}<p class="muted">JPEG export removes transparency (white background). Use PNG if you need transparency.</p>${button('doCompress', 'Compress & save')}`;
  } else if (k === 'convert') {
    html = `${select('Output format', 'convertType', [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WEBP']])}${range('Quality (%)', 'convertQ', 10, 100, 92)}${button('doConvert', 'Convert & save')}`;
  } else if (k === 'watermark') {
    html = `${control('Watermark text', 'watermarkText', 'text', 'IXORA Studio')}${control('Color', 'watermarkColor', 'color', '#ffffff')}${range('Size', 'watermarkSize', 12, 300, Math.max(14, Math.round(base.width / 25)))}${range('Opacity (%)', 'watermarkOpacity', 10, 100, 75)}${button('doWatermark', 'Add watermark')}`;
  } else if (k === 'border') {
    html = `${control('Border color', 'borderColor', 'color', '#ffffff')}${range('Border width (px)', 'borderWidth', 1, 250, 24)}${button('doBorder', 'Add border')}`;
  }

  show(html);
  bindCommon(k);
  if (k === 'layers') renderLayerList();
  if (k === 'draw' || k === 'eraser' || k === 'bgErase' || k === 'restore') {
    if (k !== 'restore' || restoreSource) startBrush(k, true);
  }
  if (k === 'text') bindTextPreview();
  if (k === 'shapes') bindShapePreview();
}

/* ---------- adjustments UI ---------- */
function adjustTool(k) {
  const keys = k === 'adjustAll' ? ADJ_KEYS : [k];
  const top = `${button('applyAdjust', 'Apply adjustments')}${button('resetAdjust', k === 'adjustAll' ? 'Reset all' : 'Reset', 'ghost')}${k === 'adjustAll' ? button('autoEnhance', '✦ Auto enhance', 'ghost') : ''}`;
  show(`<p class="muted">Move a slider and watch the photo above. Apply to keep it.</p>${top}${keys.map(x => range(ADJ[x][0], x, ADJ[x][1], ADJ[x][2], adjust[x])).join('')}`);
  keys.forEach(x => onRange(x, v => {
    if (!adjustmentSnapshot) { snapshot(); adjustmentSnapshot = true; }
    adjust[x] = v;
    scheduleRender();
  }));
  const sync = () => keys.forEach(x => { $('#' + x).value = adjust[x]; $('#' + x + 'Out').textContent = adjust[x]; });
  on('applyAdjust', () => {
    if (!hasAdjust(adjust)) return toast('Nothing to apply yet.');
    if (!adjustmentSnapshot) snapshot();
    base = adjustCanvas(base, adjust);
    adjust = zeroAdjust();
    adjustmentSnapshot = false;
    render();
    sync();
    toast('Adjustments applied.');
  });
  on('resetAdjust', () => {
    if (hasAdjust(adjust) && !adjustmentSnapshot) snapshot();
    keys.forEach(x => adjust[x] = 0);
    adjustmentSnapshot = false;
    render();
    sync();
  });
  on('autoEnhance', () => {
    snapshot();
    adjustmentSnapshot = true;
    let t = newCanvas(64, 64), c = t.getContext('2d', { willReadFrequently: true });
    c.drawImage(base, 0, 0, 64, 64);
    let d = c.getImageData(0, 0, 64, 64).data, sum = 0, n = 0, lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 20) continue;
      let l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
      sum += l; n++; lo = Math.min(lo, l); hi = Math.max(hi, l);
    }
    let mean = n ? sum / n : 128;
    adjust.brightness = Math.round(clamp((128 - mean) / 128 * 70, -40, 50));
    adjust.contrast = Math.round(clamp((255 - (hi - lo)) / 255 * 40 + 8, 0, 35));
    adjust.vibrance = 18;
    adjust.saturation = 6;
    adjust.sharpness = 15;
    render();
    sync();
    toast('Auto enhance preview. Press Apply to keep.');
  });
}

/* ---------- filters ---------- */
const FILTERS = {
  bw: (r, g, b, o) => { let z = .299 * r + .587 * g + .114 * b; o[0] = o[1] = o[2] = z; },
  sepia: (r, g, b, o) => { o[0] = .393 * r + .769 * g + .189 * b; o[1] = .349 * r + .686 * g + .168 * b; o[2] = .272 * r + .534 * g + .131 * b; },
  invert: (r, g, b, o) => { o[0] = 255 - r; o[1] = 255 - g; o[2] = 255 - b; },
  vintage: (r, g, b, o) => { o[0] = r * .9 + 25; o[1] = g * .82 + 18; o[2] = b * .65 + 5; },
  film: (r, g, b, o) => { let z = .299 * r + .587 * g + .114 * b; o[0] = z * .9 + 25; o[1] = g * .94 + 8; o[2] = b * .88 + 12; },
  hdr: (r, g, b, o) => { let z = .299 * r + .587 * g + .114 * b, s = 1.25; o[0] = ((z + (r - z) * s) - 128) * 1.25 + 128; o[1] = ((z + (g - z) * s) - 128) * 1.25 + 128; o[2] = ((z + (b - z) * s) - 128) * 1.25 + 128; },
  warm: (r, g, b, o) => { o[0] = r * 1.08 + 12; o[1] = g * 1.02 + 4; o[2] = b * .9; },
  cool: (r, g, b, o) => { o[0] = r * .9; o[1] = g + 3; o[2] = b * 1.1 + 12; },
  cinematic: (r, g, b, o) => { let z = .299 * r + .587 * g + .114 * b; o[0] = (r * 1.1 + (z > 128 ? 12 : -6) - 128) * 1.12 + 128; o[1] = (g - 128) * 1.12 + 128; o[2] = (b * 1.05 + (z < 128 ? 14 : -6) - 128) * 1.12 + 128; },
  vivid: (r, g, b, o) => { let z = .299 * r + .587 * g + .114 * b; o[0] = ((z + (r - z) * 1.5) - 128) * 1.08 + 128; o[1] = ((z + (g - z) * 1.5) - 128) * 1.08 + 128; o[2] = ((z + (b - z) * 1.5) - 128) * 1.08 + 128; },
  noir: (r, g, b, o) => { let z = (.299 * r + .587 * g + .114 * b - 128) * 1.4 + 118; o[0] = o[1] = o[2] = z; },
  sunset: (r, g, b, o) => { o[0] = r * 1.15 + 20; o[1] = g * .95 + 6; o[2] = b * .78; }
};
const FILTER_IDS = ['vintage', 'hdr', 'bw', 'film', 'sepia', 'noir', 'warm', 'cool', 'cinematic', 'vivid', 'sunset', 'invert', 'blur', 'vignette', 'pixelate'];
function filterTool(k) {
  const name = defs.find(d => d[3] === k)[2];
  const extra = k === 'blur' ? range('Blur strength', 'fxValue', 1, 30, 6)
    : k === 'vignette' ? range('Vignette strength', 'fxValue', 5, 100, 55)
    : k === 'pixelate' ? range('Pixel size', 'fxValue', 2, 60, 12)
    : range('Strength (%)', 'fxValue', 0, 100, 100);
  show(`<p class="muted">${name} — live preview. Apply to keep it.</p>${extra}${button('applyFx', 'Apply effect')}${button('cancelFx', 'Cancel preview', 'ghost')}`);
  const upd = () => { previewOverride = applyFilter(k, +$('#fxValue').value); scheduleRender(); };
  onRange('fxValue', upd);
  upd();
  on('applyFx', () => {
    snapshot();
    let n = applyFilter(k, +$('#fxValue').value);
    previewOverride = null;
    base = n;
    render();
    toast('Effect applied.');
  });
  on('cancelFx', () => { previewOverride = null; render(); });
}
function applyFilter(k, v) {
  const w = base.width, h = base.height, n = newCanvas(w, h), c = n.getContext('2d', { willReadFrequently: true });
  if (k === 'blur') {
    const r = Math.ceil(v * Math.max(1, w / 900)), pad = Math.min(80, r * 2);
    const p = newCanvas(w + pad * 2, h + pad * 2), pc = p.getContext('2d');
    pc.drawImage(base, pad, pad);
    pc.drawImage(base, 0, 0, w, 1, pad, 0, w, pad);
    pc.drawImage(base, 0, h - 1, w, 1, pad, pad + h, w, pad);
    pc.drawImage(base, 0, 0, 1, h, 0, pad, pad, h);
    pc.drawImage(base, w - 1, 0, 1, h, pad + w, pad, pad, h);
    const b2 = newCanvas(w + pad * 2, h + pad * 2), bc2 = b2.getContext('2d');
    bc2.filter = `blur(${r}px)`;
    bc2.drawImage(p, 0, 0);
    bc2.filter = 'none';
    c.drawImage(b2, pad, pad, w, h, 0, 0, w, h);
    return n;
  }
  if (k === 'pixelate') {
    const sz = Math.max(2, Math.round(v * Math.max(1, w / 900))), sw = Math.max(1, Math.ceil(w / sz)), sh = Math.max(1, Math.ceil(h / sz)), t = newCanvas(sw, sh);
    t.getContext('2d').drawImage(base, 0, 0, sw, sh);
    c.imageSmoothingEnabled = false;
    c.drawImage(t, 0, 0, sw, sh, 0, 0, sw * sz, sh * sz);
    return n;
  }
  c.drawImage(base, 0, 0);
  if (k === 'vignette') {
    c.globalCompositeOperation = 'source-atop';
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .15, w / 2, h / 2, Math.max(w, h) * .7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${v / 100})`);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    return n;
  }
  const im = c.getImageData(0, 0, w, h), d = im.data, f = FILTERS[k], m = v / 100, o = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2];
    f(r, g, b, o);
    d[i] = r + (o[0] - r) * m;
    d[i + 1] = g + (o[1] - g) * m;
    d[i + 2] = b + (o[2] - b) * m;
  }
  c.putImageData(im, 0, 0);
  return n;
}

/* ---------- crop ---------- */
function cropTool() {
  show(`<p class="muted">Pick a shape, zoom, or drag on the photo to frame what stays.</p>${select('Aspect ratio', 'cropRatio', [['free', 'Original'], ['1:1', 'Square (1:1)'], ['4:5', 'Portrait (4:5)'], ['3:4', 'Portrait (3:4)'], ['2:3', 'Portrait (2:3)'], ['9:16', 'Story (9:16)'], ['5:4', 'Landscape (5:4)'], ['4:3', 'Landscape (4:3)'], ['3:2', 'Photo (3:2)'], ['16:9', 'Wide (16:9)'], ['21:9', 'Cinema (21:9)']])}${range('Zoom (%)', 'cropZoom', 100, 400, 100)}${range('Horizontal position (%)', 'cropX', 0, 100, 50)}${range('Vertical position (%)', 'cropY', 0, 100, 50)}${button('doCrop', 'Apply crop')}`);
  const rect = () => {
    const r = $('#cropRatio').value, z = +$('#cropZoom').value / 100, px = +$('#cropX').value / 100, py = +$('#cropY').value / 100;
    let W = base.width, H = base.height, w = W, h = H;
    if (r !== 'free') {
      const [a, b] = r.split(':').map(Number), t = a / b;
      if (W / H > t) w = H * t; else h = W / t;
    }
    w /= z; h /= z;
    return { x: (W - w) * px, y: (H - h) * py, w, h };
  };
  overlay = c => {
    const r = rect();
    c.save();
    c.fillStyle = 'rgba(0,0,0,.6)';
    c.beginPath();
    c.rect(0, 0, canvas.width, canvas.height);
    c.rect(r.x, r.y, r.w, r.h);
    c.fill('evenodd');
    c.strokeStyle = '#9cf06b';
    c.lineWidth = Math.max(2, canvas.width / 300);
    c.strokeRect(r.x, r.y, r.w, r.h);
    c.restore();
  };
  ['cropRatio', 'cropZoom', 'cropX', 'cropY'].forEach(id => $('#' + id).addEventListener('input', () => {
    let o = $('#' + id + 'Out');
    if (o) o.textContent = $('#' + id).value;
    scheduleRender();
  }));
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';
  let drag = null;
  canvas.onpointerdown = e => {
    e.preventDefault();
    drag = { p: canvasPos(e), px: +$('#cropX').value, py: +$('#cropY').value };
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture?.(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drag) return;
    const p = canvasPos(e), r = rect(), dx = p.x - drag.p.x, dy = p.y - drag.p.y;
    const maxX = Math.max(1, base.width - r.w), maxY = Math.max(1, base.height - r.h);
    const nx = clamp(Math.round(drag.px + (dx / maxX) * 100), 0, 100);
    const ny = clamp(Math.round(drag.py + (dy / maxY) * 100), 0, 100);
    $('#cropX').value = nx; $('#cropXOut').textContent = nx;
    $('#cropY').value = ny; $('#cropYOut').textContent = ny;
    scheduleRender();
  };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = null; canvas.style.cursor = 'grab'; };
  render();
  on('doCrop', () => {
    const r = rect();
    overlay = null;
    snapshot();
    const f = flat(), n = newCanvas(Math.max(1, Math.round(r.w)), Math.max(1, Math.round(r.h)));
    n.getContext('2d').drawImage(f, r.x, r.y, r.w, r.h, 0, 0, n.width, n.height);
    commitBase(n);
    toast('Crop applied.');
    selectTool('crop');
  });
}

/* ==========================================================================
   PRO ADOBE-GRADE SEGMENTATION ENGINE (CIELAB + Sobel Edge Barrier +
   Foreground Protection + Alpha Matting + Color Decontamination)
   ========================================================================== */
const SRGB_LUT = (() => {
  const a = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = i / 255;
    a[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return a;
})();
const CBRT_LUT = (() => {
  const a = new Float32Array(1025);
  for (let i = 0; i <= 1024; i++) {
    let t = i / 1024;
    a[i] = t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  }
  return a;
})();
function rgbToLabPixel(r, g, b) {
  const rl = SRGB_LUT[r], gl = SRGB_LUT[g], bl = SRGB_LUT[b];
  const x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047;
  const y = (0.2126 * rl + 0.7152 * gl + 0.0722 * bl);
  const z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883;
  const fx = CBRT_LUT[clamp(Math.round(x * 1024), 0, 1024)];
  const fy = CBRT_LUT[clamp(Math.round(y * 1024), 0, 1024)];
  const fz = CBRT_LUT[clamp(Math.round(z * 1024), 0, 1024)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function buildLabAndEdges(d, w, h) {
  const N = w * h;
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N), edge = new Float32Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const rl = SRGB_LUT[d[p]], gl = SRGB_LUT[d[p + 1]], bl = SRGB_LUT[d[p + 2]];
    const x = (0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047;
    const y = (0.2126 * rl + 0.7152 * gl + 0.0722 * bl);
    const z = (0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883;
    const fx = CBRT_LUT[clamp(Math.round(x * 1024), 0, 1024)];
    const fy = CBRT_LUT[clamp(Math.round(y * 1024), 0, 1024)];
    const fz = CBRT_LUT[clamp(Math.round(z * 1024), 0, 1024)];
    L[i] = 116 * fy - 16;
    A[i] = 500 * (fx - fy);
    B[i] = 200 * (fy - fz);
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gxL = (L[i + 1 - w] + 2 * L[i + 1] + L[i + 1 + w]) - (L[i - 1 - w] + 2 * L[i - 1] + L[i - 1 + w]);
      const gyL = (L[i + w - 1] + 2 * L[i + w] + L[i + w + 1]) - (L[i - w - 1] + 2 * L[i - w] + L[i - w + 1]);
      const gxA = (A[i + 1] - A[i - 1]) * 3, gyA = (A[i + w] - A[i - w]) * 3;
      const gxB = (B[i + 1] - B[i - 1]) * 3, gyB = (B[i + w] - B[i - w]) * 3;
      edge[i] = Math.min(255, Math.sqrt(gxL * gxL + gyL * gyL) * 0.32 + Math.sqrt(gxA * gxA + gyA * gyA + gxB * gxB + gyB * gyB) * 0.45);
    }
  }
  return { L, A, B, edge };
}
function boxBlur(a, w, h, r) {
  if (r < 1) return a;
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length), k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let row = y * w, sum = 0;
    for (let x = -r; x <= r; x++) sum += a[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      t[row + x] = sum / k;
      sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += t[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = sum / k;
      sum += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
    }
  }
  return o;
}
function morph(a, w, h, r, dilate) {
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 255;
    for (let dx = -r; dx <= r; dx++) {
      let val = a[y * w + clamp(x + dx, 0, w - 1)];
      v = dilate ? Math.max(v, val) : Math.min(v, val);
    }
    t[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 255;
    for (let dy = -r; dy <= r; dy++) {
      let val = t[clamp(y + dy, 0, h - 1) * w + x];
      v = dilate ? Math.max(v, val) : Math.min(v, val);
    }
    o[y * w + x] = v;
  }
  return o;
}
function kmeansLab(samples, k, minShare = 0.05) {
  if (!samples.length) return [];
  const dist = (a, b) => (a[0] - b[0]) ** 2 * 0.65 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const avg = [0, 0, 0];
  samples.forEach(s => { avg[0] += s[0]; avg[1] += s[1]; avg[2] += s[2]; });
  avg.forEach((_, i) => avg[i] /= samples.length);
  let cs = [avg.slice()];
  while (cs.length < k) {
    let best = null, bd = -1;
    for (const s of samples) {
      let md = Math.min(...cs.map(c => dist(c, s)));
      if (md > bd) { bd = md; best = s; }
    }
    if (bd < 120 || !best) break;
    cs.push(best.slice());
  }
  for (let it = 0; it < 7; it++) {
    const sums = cs.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0, bd = 1e9;
      cs.forEach((c, i) => { let d = dist(c, s); if (d < bd) { bd = d; bi = i; } });
      let q = sums[bi]; q[0] += s[0]; q[1] += s[1]; q[2] += s[2]; q[3]++;
    }
    cs = cs.map((c, i) => sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c);
  }
  const cnt = cs.map(() => 0);
  for (const s of samples) {
    let bi = 0, bd = 1e9;
    cs.forEach((c, i) => { let d = dist(c, s); if (d < bd) { bd = d; bi = i; } });
    cnt[bi]++;
  }
  return cs.filter((_, i) => cnt[i] >= samples.length * minShare);
}
function rasterizeStrokes(strokes, w, h) {
  const mask = new Uint8Array(w * h);
  const pts = [];
  if (!strokes.length) return { mask, pts };
  for (const st of strokes) {
    const r = Math.max(2, Math.round((st.r || 0.02) * Math.max(w, h)));
    for (let k = 0; k < st.pts.length; k++) {
      const a = st.pts[k], b = st.pts[Math.min(k + 1, st.pts.length - 1)];
      const ax = a.x * w, ay = a.y * h, bx = b.x * w, by = b.y * h;
      const dist = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.ceil(dist / Math.max(1, r * 0.4)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps, cx = Math.round(ax + (bx - ax) * t), cy = Math.round(ay + (by - ay) * t);
        const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r);
        const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r), r2 = r * r;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
              const idx = y * w + x;
              if (!mask[idx]) { mask[idx] = 1; pts.push(idx); }
            }
          }
        }
      }
    }
  }
  return { mask, pts };
}
function computeBgMask(o, maxDim = 900) {
  const W = base.width, H = base.height, sc = Math.min(1, maxDim / Math.max(W, H));
  const w = Math.max(8, Math.round(W * sc)), h = Math.max(8, Math.round(H * sc)), N = w * h;
  const t = newCanvas(w, h), tc = t.getContext('2d', { willReadFrequently: true });
  tc.drawImage(base, 0, 0, w, h);
  const d = tc.getImageData(0, 0, w, h).data;
  const { L, A, B, edge } = buildLabAndEdges(d, w, h);
  const fgUser = rasterizeStrokes(fgStrokes, w, h);
  const bgUser = rasterizeStrokes(bgStrokes, w, h);

  /* 1. Foreground interior + user protect color model */
  const userFgSamples = [];
  for (let k = 0; k < fgUser.pts.length; k += Math.max(1, Math.floor(fgUser.pts.length / 400))) {
    const i = fgUser.pts[k];
    if (d[i * 4 + 3] > 20) userFgSamples.push([L[i], A[i], B[i]]);
  }
  const userFgCenters = kmeansLab(userFgSamples, 5, 0.02);

  const autoFgSamples = [];
  const x0 = Math.round(w * 0.28), x1 = Math.round(w * 0.72), y0 = Math.round(h * 0.20), y1 = Math.round(h * 0.72);
  const stepCore = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 900)));
  for (let y = y0; y < y1; y += stepCore) {
    for (let x = x0; x < x1; x += stepCore) {
      const i = y * w + x;
      if (d[i * 4 + 3] > 20 && !bgUser.mask[i]) autoFgSamples.push([L[i], A[i], B[i]]);
    }
  }
  const autoFgCenters = kmeansLab(autoFgSamples, 5, 0.08);

  /* 2. Background color model (border + corners + user erase strokes, rejecting subject-touching bottom leaks) */
  let bgCenters = [];
  const userBgSamples = [];
  for (let k = 0; k < bgUser.pts.length; k += Math.max(1, Math.floor(bgUser.pts.length / 400))) {
    const i = bgUser.pts[k];
    if (d[i * 4 + 3] > 20) userBgSamples.push([L[i], A[i], B[i]]);
  }
  const userBgCenters = kmeansLab(userBgSamples, 4, 0.02);

  if (bgSeed) {
    bgCenters = [rgbToLabPixel(bgSeed[0], bgSeed[1], bgSeed[2]), ...userBgCenters];
  } else {
    const b = Math.max(2, Math.round(Math.min(w, h) * 0.025));
    const upperSamples = [], bottomSamples = [];
    const stride = Math.max(1, Math.floor((w + h) / 450));
    for (let y = 0; y < h; y += stride) {
      for (let x = 0; x < w; x += stride) {
        if (x < b || x >= w - b || y < b) {
          const i = y * w + x;
          if (d[i * 4 + 3] > 20 && !fgUser.mask[i]) upperSamples.push([L[i], A[i], B[i]]);
        } else if (y >= h - b) {
          const i = y * w + x;
          if (d[i * 4 + 3] > 20 && !fgUser.mask[i]) bottomSamples.push([L[i], A[i], B[i]]);
        }
      }
    }
    const upperCenters = kmeansLab(upperSamples, 4, 0.06);
    const botCenters = kmeansLab(bottomSamples, 3, 0.12);
    bgCenters = [...upperCenters];
    /* Include bottom border cluster only if it closely matches upper background and not interior core */
    for (const bc of botCenters) {
      const distUpper = upperCenters.length ? Math.min(...upperCenters.map(c => (bc[0] - c[0]) ** 2 * 0.6 + (bc[1] - c[1]) ** 2 * 1.4 + (bc[2] - c[2]) ** 2 * 1.4)) : 9999;
      const distCore = autoFgCenters.length ? Math.min(...autoFgCenters.map(c => (bc[0] - c[0]) ** 2 * 0.6 + (bc[1] - c[1]) ** 2 * 1.4 + (bc[2] - c[2]) ** 2 * 1.4)) : 9999;
      if (distUpper < 220 && distUpper < distCore * 0.85) bgCenters.push(bc);
    }
    if (!bgCenters.length && botCenters.length) bgCenters = botCenters;
    bgCenters.push(...userBgCenters);
  }

  /* Measure how tight/uniform the background is */
  const labDistMin = (i, centers) => {
    let best = 1e9;
    const li = L[i], ai = A[i], bi = B[i];
    for (let k = 0; k < centers.length; k++) {
      const c = centers[k], dl = (li - c[0]) * 0.6, da = (ai - c[1]) * 1.35, db = (bi - c[2]) * 1.35;
      const dd = dl * dl + da * da + db * db;
      if (dd < best) best = dd;
    }
    return best;
  };

  /* 3. Edge-barrier + foreground-protected region growing */
  const maxDE = 5 + o.tol * 0.52;
  const T2 = maxDE * maxDE;
  const edgeLimit = o.edgeGuard >= 99 ? 14 : o.edgeGuard <= 0 ? 1e9 : (150 - o.edgeGuard * 1.24);
  const protectFactor = o.protect / 100;

  const bg = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;

  const canEnter = (i, strictScale, isBottomEdge = false) => {
    if (fgUser.mask[i]) return false;
    if (d[i * 4 + 3] < 20) return true;
    if (bgUser.mask[i]) return true;
    if (!bgCenters.length) return false;
    const dBg = labDistMin(i, bgCenters);
    if (dBg > T2 * strictScale) return false;

    /* Edge barrier stops flood fill from crossing sharp subject edges */
    if (edge[i] > edgeLimit && dBg > T2 * 0.12) return false;

    /* Subject color protection */
    if (protectFactor > 0) {
      if (userFgCenters.length) {
        const dUFg = labDistMin(i, userFgCenters);
        if (dUFg * (1.5 - protectFactor * 0.45) < dBg) return false;
      }
      if (autoFgCenters.length) {
        const dAFg = labDistMin(i, autoFgCenters);
        const x = i % w, y = (i - x) / w;
        const inCore = x > w * 0.14 && x < w * 0.86 && y > h * 0.12 && y < h * 0.98;
        const fgBias = isBottomEdge ? 1.05 : inCore ? (1.85 - protectFactor * 0.85) : 1.1;
        if ((isBottomEdge || dBg > T2 * 0.1) && dAFg * fgBias < dBg) return false;
      }
    }
    if (isBottomEdge && dBg > T2 * 0.35) return false;
    return true;
  };

  const seed = (i, strictScale, isBottomEdge = false) => {
    if (!bg[i] && canEnter(i, strictScale, isBottomEdge)) {
      bg[i] = 1;
      stack[sp++] = i;
    }
  };

  /* Seed from image borders (protecting bottom-edge subjects) + user Erase BG strokes */
  for (let x = 0; x < w; x++) {
    seed(x, 0.72, false);
    seed((h - 1) * w + x, 0.55, true);
  }
  for (let y = 0; y < h; y++) { seed(y * w, 0.72, false); seed(y * w + w - 1, 0.72, false); }
  for (let k = 0; k < bgUser.pts.length; k++) {
    const i = bgUser.pts[k];
    if (!fgUser.mask[i] && !bg[i]) { bg[i] = 1; stack[sp++] = i; }
  }

  /* Pass 1: high-confidence core background flood */
  const frontier = [];
  while (sp) {
    const i = stack[--sp], x = i % w, y = (i - x) / w;
    let atEdge = false;
    const step = q => {
      if (!bg[q]) {
        if (canEnter(q, 0.72)) { bg[q] = 1; stack[sp++] = q; }
        else atEdge = true;
      }
    };
    if (x > 0) step(i - 1); if (x < w - 1) step(i + 1);
    if (y > 0) step(i - w); if (y < h - 1) step(i + w);
    if (atEdge) frontier.push(i);
  }

  /* Pass 2: refine up to full sensitivity along frontier */
  for (let k = 0; k < frontier.length; k++) stack[sp++] = frontier[k];
  while (sp) {
    const i = stack[--sp], x = i % w, y = (i - x) / w;
    if (x > 0) seed(i - 1, 1.0);
    if (x < w - 1) seed(i + 1, 1.0);
    if (y > 0) seed(i - w, 1.0);
    if (y < h - 1) seed(i + w, 1.0);
  }

  let fg = new Uint8Array(N);
  for (let i = 0; i < N; i++) fg[i] = bg[i] ? 0 : 255;
  /* Ensure user Protect strokes stay 100% foreground */
  for (let k = 0; k < fgUser.pts.length; k++) {
    const i = fgUser.pts[k];
    if (d[i * 4 + 3] > 20) fg[i] = 255;
  }

  /* 4. Connected component cleanup (preserves components protected by user!) */
  if (o.keep) {
    const lab = new Int32Array(N), sizes = [0], hasProtect = [0];
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (fg[i] && !lab[i]) {
        n++; lab[i] = n;
        let cnt = 0, prot = fgUser.mask[i] ? 1 : 0;
        sp = 0; stack[sp++] = i;
        while (sp) {
          const j = stack[--sp]; cnt++;
          if (fgUser.mask[j]) prot = 1;
          const x = j % w, y = (j - x) / w;
          const nb = q => { if (fg[q] && !lab[q]) { lab[q] = n; stack[sp++] = q; } };
          if (x > 0) nb(j - 1); if (x < w - 1) nb(j + 1);
          if (y > 0) nb(j - w); if (y < h - 1) nb(j + w);
        }
        sizes[n] = cnt;
        hasProtect[n] = prot;
      }
    }
    const maxS = Math.max(0, ...sizes);
    for (let i = 0; i < N; i++) {
      if (fg[i]) {
        const id = lab[i];
        if (!hasProtect[id] && sizes[id] < Math.max(maxS * 0.08, N * 0.002)) fg[i] = 0;
      }
    }
  }

  /* 5. Morphological edge shift */
  if (o.shrink > 0) fg = morph(fg, w, h, o.shrink, false);
  else if (o.shrink < 0) fg = morph(fg, w, h, -o.shrink, true);

  /* 6. Local Color-Line Alpha Matting on narrow boundary band */
  const rawBin = fg;
  const smoothR = Math.round(o.smooth);
  let alpha = smoothR > 0 ? boxBlur(fg, w, h, smoothR) : fg.slice();

  /* Edge-aware fractional matting in 2px transition band */
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      const a0 = rawBin[i];
      if (rawBin[i - 2] === a0 && rawBin[i + 2] === a0 && rawBin[i - 2 * w] === a0 && rawBin[i + 2 * w] === a0) continue;
      let fgL = 0, fgA = 0, fgB = 0, fgN = 0, bgL = 0, bgA = 0, bgB = 0, bgN = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const q = (y + dy) * w + (x + dx);
          if (rawBin[q] === 255 && rawBin[q - 1] === 255 && rawBin[q + 1] === 255) {
            fgL += L[q]; fgA += A[q]; fgB += B[q]; fgN++;
          } else if (rawBin[q] === 0 && rawBin[q - 1] === 0 && rawBin[q + 1] === 0) {
            bgL += L[q]; bgA += A[q]; bgB += B[q]; bgN++;
          }
        }
      }
      if (fgN && bgN) {
        fgL /= fgN; fgA /= fgN; fgB /= fgN;
        bgL /= bgN; bgA /= bgN; bgB /= bgN;
        const vL = fgL - bgL, vA = fgA - bgA, vB = fgB - bgB;
        const len2 = vL * vL + vA * vA + vB * vB;
        if (len2 > 64) {
          const dot = (L[i] - bgL) * vL + (A[i] - bgA) * vA + (B[i] - bgB) * vB;
          const mAlpha = clamp(Math.round((dot / len2) * 255), 0, 255);
          alpha[i] = Math.round(alpha[i] * 0.45 + mAlpha * 0.55);
        }
      }
    }
  }
  for (let k = 0; k < fgUser.pts.length; k++) {
    const i = fgUser.pts[k];
    if (d[i * 4 + 3] > 20) alpha[i] = 255;
  }
  return { w, h, alpha };
}

function buildCutoutFromMask(maskRes, decontam, previewMode) {
  const W = base.width, H = base.height;
  const mc = newCanvas(maskRes.w, maskRes.h), mctx = mc.getContext('2d'), mi = mctx.createImageData(maskRes.w, maskRes.h);
  for (let i = 0; i < maskRes.alpha.length; i++) mi.data[i * 4 + 3] = maskRes.alpha[i];
  mctx.putImageData(mi, 0, 0);

  if (previewMode === 'mask') {
    const out = cloneCanvas(base), oc = out.getContext('2d');
    const inv = newCanvas(maskRes.w, maskRes.h), ic = inv.getContext('2d'), ii = ic.createImageData(maskRes.w, maskRes.h);
    for (let i = 0; i < maskRes.alpha.length; i++) {
      const bgAmt = 255 - maskRes.alpha[i];
      if (bgAmt > 4) {
        ii.data[i * 4] = 255; ii.data[i * 4 + 1] = 45; ii.data[i * 4 + 2] = 75;
        ii.data[i * 4 + 3] = Math.round(bgAmt * 0.62);
      }
    }
    ic.putImageData(ii, 0, 0);
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(inv, 0, 0, W, H);
    return out;
  }

  const out = cloneCanvas(base), oc = out.getContext('2d', { willReadFrequently: true });
  oc.globalCompositeOperation = 'destination-in';
  oc.imageSmoothingQuality = 'high';
  oc.drawImage(mc, 0, 0, W, H);
  oc.globalCompositeOperation = 'source-over';

  /* Color decontamination (eliminates white/colored halos on hair & edges) */
  if (decontam) {
    const im = oc.getImageData(0, 0, W, H), dd = im.data;
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x, p = i * 4, a = dd[p + 3];
        if (a > 6 && a < 240) {
          let sr = 0, sg = 0, sb = 0, cnt = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const q = ((y + dy) * W + (x + dx)) * 4;
              if (dd[q + 3] >= 240) {
                sr += dd[q]; sg += dd[q + 1]; sb += dd[q + 2]; cnt++;
              }
            }
          }
          if (cnt) {
            const blend = (1 - a / 255) * 0.85;
            dd[p] = Math.round(dd[p] * (1 - blend) + (sr / cnt) * blend);
            dd[p + 1] = Math.round(dd[p + 1] * (1 - blend) + (sg / cnt) * blend);
            dd[p + 2] = Math.round(dd[p + 2] * (1 - blend) + (sb / cnt) * blend);
          }
        }
      }
    }
    oc.putImageData(im, 0, 0);
  }

  if (previewMode === 'white' || previewMode === 'black') {
    const m = newCanvas(W, H), c = m.getContext('2d');
    c.fillStyle = previewMode === 'white' ? '#ffffff' : '#0b0e14';
    c.fillRect(0, 0, W, H);
    c.drawImage(out, 0, 0);
    return m;
  }
  return out;
}

/* ---------- Pro Vectorize (SVG) Tool ---------- */
function vectorizeTool() {
  show(`<p class="muted">Convert your photo into crisp, infinitely scalable Vector Art (SVG). Apply to canvas to keep editing or export the .SVG file.</p>
  ${range('Color bands', 'vecColors', 4, 24, 12)}
  ${range('Trace detail', 'vecDetail', 180, 750, 420, 20)}
  ${check('Add crisp ink outlines', 'vecOutline', false)}
  ${button('vecApply', 'Apply vector art to canvas')}
  ${button('vecExport', 'Export .SVG vector file', 'ghost')}
  ${rawOriginal ? button('vecRevertRaw', 'Revert to raw original upload', 'ghost') : ''}
  ${button('vecCancel', 'Cancel preview', 'ghost')}
  <p class="muted" id="vecNote">Tracing vector paths…</p>`);

  let timer;
  const runVec = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const cols = +$('#vecColors').value, det = +$('#vecDetail').value, out = $('#vecOutline').checked;
        lastVectorSvg = buildVectorSVG(base, cols, det, out);
        const svgBlob = new Blob([lastVectorSvg], { type: 'image/svg+xml' });
        const im = await loadImage(svgBlob);
        const n = newCanvas(base.width, base.height), c = n.getContext('2d');
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(im, 0, 0, base.width, base.height);
        previewOverride = n;
        render();
        let vn = $('#vecNote');
        if (vn) vn.textContent = `Vector SVG ready (${cols} color layers).`;
      } catch (e) { toast(e.message); }
    }, 100);
  };

  ['vecColors', 'vecDetail'].forEach(id => onRange(id, runVec));
  $('#vecOutline').onchange = runVec;

  on('vecApply', () => {
    if (!previewOverride) return toast('Vector preview not ready yet.');
    snapshot();
    const n = previewOverride;
    previewOverride = null;
    base = n;
    aiMaskCache = null;
    render();
    toast('Vector art applied to canvas.');
  });
  on('vecExport', () => {
    if (!lastVectorSvg) return toast('Vector SVG not ready yet.');
    saveBlob(new Blob([lastVectorSvg], { type: 'image/svg+xml' }), `${photoName}-vector.svg`);
  });
  on('vecRevertRaw', () => {
    if (!rawOriginal) return;
    snapshot();
    previewOverride = null;
    base = cloneCanvas(rawOriginal);
    aiMaskCache = null;
    render();
    toast('Reverted to unenhanced raw photo.');
    runVec();
  });
  on('vecCancel', () => { previewOverride = null; render(); });
  runVec();
}

/* ---------- Neural AI Background Removal (IS-Net) + Hybrid Refine ---------- */
async function loadAiBgModule() {
  if (aiBgMod) return aiBgMod;
  if (!aiBgPromise) {
    aiBgPromise = import(new URL('vendor/bg-removal/index.mjs', document.baseURI).href);
  }
  aiBgMod = await aiBgPromise;
  return aiBgMod;
}

async function computeAiMask(onProgress) {
  if (aiMaskCache && aiMaskCache.ref === base) return aiMaskCache;
  const mod = await loadAiBgModule();
  const W = base.width, H = base.height, sc = Math.min(1, 1280 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * sc)), h = Math.max(8, Math.round(H * sc));
  const srcC = newCanvas(w, h);
  const sctx = srcC.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(base, 0, 0, w, h);
  const inBlob = await blobOf(srcC, 'image/png', 1);

  const outBlob = await mod.removeBackground(inBlob, {
    model: 'small',
    publicPath: new URL('vendor/bg-data/', document.baseURI).href,
    proxyToWorker: false,
    output: { format: 'image/png', quality: 1 },
    progress: (key, cur, tot) => {
      if (onProgress && tot > 0) onProgress(key, cur, tot);
    }
  });
  const outImg = await loadImage(outBlob);
  const resC = newCanvas(w, h), rctx = resC.getContext('2d', { willReadFrequently: true });
  rctx.drawImage(outImg, 0, 0, w, h);
  const d = rctx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
  aiMaskCache = { ref: base, w, h, alpha };
  return aiMaskCache;
}

function refineAiMask(aiMask, o) {
  const w = aiMask.w, h = aiMask.h, N = w * h;
  let alpha = new Uint8Array(aiMask.alpha);
  const fgUser = rasterizeStrokes(fgStrokes, w, h);
  const bgUser = rasterizeStrokes(bgStrokes, w, h);

  if (o.shrink > 0) alpha = morph(alpha, w, h, o.shrink, false);
  else if (o.shrink < 0) alpha = morph(alpha, w, h, -o.shrink, true);

  if (o.smooth > 0) {
    const blurred = boxBlur(alpha, w, h, Math.round(o.smooth));
    for (let i = 0; i < N; i++) {
      if (alpha[i] > 12 && alpha[i] < 245) alpha[i] = Math.round(alpha[i] * 0.45 + blurred[i] * 0.55);
      else if (o.smooth > 1) alpha[i] = blurred[i];
    }
  }

  for (let k = 0; k < bgUser.pts.length; k++) alpha[bgUser.pts[k]] = 0;
  for (let k = 0; k < fgUser.pts.length; k++) alpha[fgUser.pts[k]] = 255;
  return { w, h, alpha };
}

function autoBgTool() {
  let brushAction = '', previewMode = 'transparent', engine = 'ai', alive = true;
  show(`<p class="muted"><b>AI Neural Cutout (IS-Net)</b> automatically isolates people & objects even in trees/outdoor scenes. Refine with Protect/Erase brushes if needed.</p>
  <div class="seg-row" id="bgEngRow">
    <button data-e="ai" class="active">AI Subject Cutout</button>
    <button data-e="color">Color Edge Mode</button>
  </div>
  <div class="seg-row" id="bgViewRow">
    <button data-v="transparent" class="active">Cutout</button>
    <button data-v="mask">Red Mask</button>
    <button data-v="white">White</button>
    <button data-v="black">Black</button>
  </div>
  <div class="inline-actions" style="margin-bottom:6px">
    ${button('bgProtectBrush', '＋ Protect Subject', 'ghost')}
    ${button('bgEraseBrush', '－ Erase BG', 'ghost')}
  </div>
  <div id="colorModeCtrls" hidden>
    ${range('Sensitivity', 'bgTol', 5, 100, 35)}
    ${range('Edge Guard (stop at edges)', 'bgEdge', 0, 100, 60)}
    ${range('Subject Protection', 'bgProtect', 0, 100, 58)}
    ${check('Keep main subject only', 'bgKeep', true)}
  </div>
  ${range('Edge Feather / Smooth', 'bgSmooth', 0, 8, 1)}
  ${range('Edge Shift (− shrink / + grow)', 'bgShrink', -5, 5, 0)}
  ${check('Decontaminate edge halo', 'bgDecontam', true)}
  ${button('bgApply', 'Apply — keep result')}
  <div class="inline-actions" style="margin-top:6px">
    ${button('bgPick', 'Pick BG Colour', 'ghost')}
    ${button('bgClearMarks', 'Reset Marks', 'ghost')}
  </div>
  ${button('bgCancel', 'Cancel preview', 'ghost')}
  <p class="muted" id="bgNote">Initializing AI Subject Cutout…</p>`);

  let timer;
  const opts = () => ({
    tol: +$('#bgTol').value,
    edgeGuard: +$('#bgEdge').value,
    protect: +$('#bgProtect').value,
    smooth: +$('#bgSmooth').value,
    shrink: +$('#bgShrink').value,
    decontam: $('#bgDecontam').checked,
    keep: $('#bgKeep').checked
  });

  const drawGuideOverlay = c => {
    if (!fgStrokes.length && !bgStrokes.length) return;
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const drawSet = (list, col) => {
      c.strokeStyle = col;
      for (const st of list) {
        c.lineWidth = (st.r || 0.02) * Math.max(canvas.width, canvas.height) * 2;
        c.beginPath();
        st.pts.forEach((p, i) => i ? c.lineTo(p.x * canvas.width, p.y * canvas.height) : c.moveTo(p.x * canvas.width, p.y * canvas.height));
        if (st.pts.length === 1) c.lineTo(st.pts[0].x * canvas.width + 0.01, st.pts[0].y * canvas.height);
        c.stroke();
      }
    };
    drawSet(fgStrokes, 'rgba(156,240,107,0.45)');
    drawSet(bgStrokes, 'rgba(255,92,92,0.45)');
    c.restore();
  };

  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!alive || activeTool !== 'autoBg') return;
      const o = opts();
      let note = $('#bgNote');
      try {
        if (engine === 'ai') {
          if (!aiMaskCache || aiMaskCache.ref !== base) {
            $('#toolStatus').textContent = 'AI WORKING';
            if (note) note.textContent = 'Running AI Subject Cutout (offline model)…';
            await computeAiMask((key, cur, tot) => {
              if (!alive || activeTool !== 'autoBg') return;
              const pct = Math.min(100, Math.round((cur / tot) * 100));
              const el = $('#bgNote');
              if (el) el.textContent = `AI Subject Cutout: ${key.includes('fetch') ? 'Loading AI model' : 'Processing'} ${pct}%`;
            });
          }
          if (!alive || activeTool !== 'autoBg') return;
          const m = refineAiMask(aiMaskCache, o);
          previewOverride = buildCutoutFromMask(m, o.decontam, previewMode);
          overlay = drawGuideOverlay;
          render();
          $('#toolStatus').textContent = 'AI READY';
          if ($('#bgNote')) $('#bgNote').textContent = 'AI Cutout ready! Refine edges or paint Protect/Erase, then Apply.';
        } else {
          const m = computeBgMask(o, 850);
          previewOverride = buildCutoutFromMask(m, o.decontam, previewMode);
          overlay = drawGuideOverlay;
          render();
          $('#toolStatus').textContent = 'READY';
          if ($('#bgNote')) $('#bgNote').textContent = 'Color Edge preview ready.';
        }
      } catch (e) {
        if (!alive || activeTool !== 'autoBg') return;
        engine = 'color';
        document.querySelectorAll('#bgEngRow button').forEach(x => x.classList.toggle('active', x.dataset.e === 'color'));
        $('#colorModeCtrls').hidden = false;
        const m = computeBgMask(o, 850);
        previewOverride = buildCutoutFromMask(m, o.decontam, previewMode);
        overlay = drawGuideOverlay;
        render();
        $('#toolStatus').textContent = 'OFFLINE FALLBACK';
        if ($('#bgNote')) $('#bgNote').textContent = 'Offline fallback active (AI model unavailable). Use Protect/Erase brushes.';
      }
    }, 60);
  };

  document.querySelectorAll('#bgEngRow button').forEach(b => b.onclick = () => {
    engine = b.dataset.e;
    document.querySelectorAll('#bgEngRow button').forEach(x => x.classList.toggle('active', x === b));
    $('#colorModeCtrls').hidden = engine !== 'color';
    run();
  });

  document.querySelectorAll('#bgViewRow button').forEach(b => b.onclick = () => {
    previewMode = b.dataset.v;
    document.querySelectorAll('#bgViewRow button').forEach(x => x.classList.toggle('active', x === b));
    run();
  });

  const setBrushMode = m => {
    brushAction = brushAction === m ? '' : m;
    $('#bgProtectBrush').classList.toggle('btn-active', brushAction === 'fg');
    $('#bgEraseBrush').classList.toggle('btn-active', brushAction === 'bg');
    canvas.onclick = null;
    if (!brushAction) {
      canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
      canvas.style.cursor = 'default';
      canvas.style.touchAction = 'pan-y';
      return;
    }
    canvas.style.cursor = 'crosshair';
    canvas.style.touchAction = 'none';
    let cur = null;
    canvas.onpointerdown = e => {
      e.preventDefault();
      const p = canvasPos(e);
      cur = { r: 0.022, pts: [{ x: p.x / canvas.width, y: p.y / canvas.height }] };
      if (brushAction === 'fg') fgStrokes.push(cur); else bgStrokes.push(cur);
      overlay = drawGuideOverlay;
      scheduleRender();
      canvas.setPointerCapture?.(e.pointerId);
    };
    canvas.onpointermove = e => {
      if (!cur) return;
      e.preventDefault();
      const p = canvasPos(e);
      cur.pts.push({ x: p.x / canvas.width, y: p.y / canvas.height });
      scheduleRender();
    };
    canvas.onpointerup = canvas.onpointercancel = () => {
      if (!cur) return;
      cur = null;
      run();
    };
    toast(brushAction === 'fg' ? 'Paint over subject parts to protect them.' : 'Paint over missed background pockets to erase them.');
  };

  on('bgProtectBrush', () => setBrushMode('fg'));
  on('bgEraseBrush', () => setBrushMode('bg'));

  ['bgTol', 'bgEdge', 'bgProtect', 'bgSmooth', 'bgShrink'].forEach(id => onRange(id, run));
  $('#bgDecontam').onchange = run;
  $('#bgKeep').onchange = run;

  on('bgPick', () => {
    setBrushMode('');
    engine = 'color';
    document.querySelectorAll('#bgEngRow button').forEach(x => x.classList.toggle('active', x.dataset.e === 'color'));
    $('#colorModeCtrls').hidden = false;
    toast('Tap the background colour on the photo.');
    canvas.style.cursor = 'crosshair';
    canvas.onclick = e => {
      const p = canvasPos(e), x = clamp(Math.floor(p.x), 0, base.width - 1), y = clamp(Math.floor(p.y), 0, base.height - 1);
      const px = base.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
      bgSeed = [px[0], px[1], px[2]];
      canvas.onclick = null;
      canvas.style.cursor = 'default';
      run();
    };
  });

  on('bgClearMarks', () => {
    fgStrokes = []; bgStrokes = []; bgSeed = null;
    run();
    toast('Background marks cleared.');
  });

  on('bgApply', async () => {
    try {
      const o = opts();
      let finalMask;
      if (engine === 'ai') {
        if (!aiMaskCache || aiMaskCache.ref !== base) await computeAiMask();
        finalMask = refineAiMask(aiMaskCache, o);
      } else {
        finalMask = computeBgMask(o, 1600);
      }
      snapshot();
      ensureRestoreSource();
      const result = buildCutoutFromMask(finalMask, o.decontam, 'transparent');
      alive = false;
      previewOverride = null;
      overlay = null;
      fgStrokes = []; bgStrokes = []; bgSeed = null; aiMaskCache = null;
      setBrushMode('');
      base = result;
      render();
      toast('Background removed cleanly. Use Restore Eraser for fine touch-ups.');
    } catch (e) { toast(e.message); }
  });

  on('bgCancel', () => {
    alive = false;
    setBrushMode('');
    previewOverride = null;
    overlay = null;
    render();
  });

  run();
}

/* ---------- Adobe-grade Magic Wand ---------- */
function computeWandSelection(seeds, tol, edgeGuard, contig, w, h, d, labData) {
  const N = w * h;
  const mask = new Uint8Array(N);
  const { L, A, B, edge } = labData;
  const maxDE = 4 + tol * 0.52, T2 = maxDE * maxDE;
  const edgeLimit = edgeGuard >= 99 ? 16 : edgeGuard <= 0 ? 1e9 : (155 - edgeGuard * 1.28);

  for (const s of seeds) {
    const sx = clamp(Math.floor(s.x * w), 0, w - 1), sy = clamp(Math.floor(s.y * h), 0, h - 1);
    const si = sy * w + sx;
    if (d[si * 4 + 3] === 0) continue;
    const sL = L[si], sA = A[si], sB = B[si];
    const sim = i => {
      if (d[i * 4 + 3] === 0) return false;
      const dl = (L[i] - sL) * 0.68, da = A[i] - sA, db = B[i] - sB;
      return dl * dl + da * da + db * db <= T2;
    };
    if (contig) {
      const st = new Int32Array(N);
      let sp = 0;
      if (!mask[si] && sim(si)) { mask[si] = 255; st[sp++] = si; }
      while (sp) {
        const i = st[--sp], x = i % w, y = (i - x) / w;
        const nb = q => {
          if (!mask[q] && sim(q) && (edge[q] <= edgeLimit || q === si)) {
            mask[q] = 255;
            st[sp++] = q;
          }
        };
        if (x > 0) nb(i - 1); if (x < w - 1) nb(i + 1);
        if (y > 0) nb(i - w); if (y < h - 1) nb(i + w);
      }
    } else {
      for (let i = 0; i < N; i++) if (!mask[i] && sim(i)) mask[i] = 255;
    }
  }
  return mask;
}
function wandTool() {
  let seeds = [];
  show(`<p class="muted">Tap the photo to preview selection with Edge Guard. Refine sliders live, then remove or keep.</p>
  ${range('Tolerance', 'wTol', 1, 100, 28)}
  ${range('Edge Guard (prevent bleed)', 'wEdge', 0, 100, 62)}
  ${range('Edge feather (px)', 'wSoft', 0, 6, 1)}
  ${check('Only touching area (contiguous)', 'wContig', true)}
  ${check('Add to selection on tap', 'wAdd', true)}
  ${button('wandRemove', 'Remove selected area')}
  ${button('wandKeep', 'Keep selected only', 'ghost')}
  ${button('wandClear', 'Clear selection', 'ghost')}
  <p class="muted" id="wandNote">Tap anywhere on the photo to select.</p>`);

  const w = base.width, h = base.height;
  const bc = base.getContext('2d', { willReadFrequently: true }), im = bc.getImageData(0, 0, w, h);
  const labData = buildLabAndEdges(im.data, w, h);

  let ovCanvas = newCanvas(w, h), ovCtx = ovCanvas.getContext('2d'), ovImg = ovCtx.createImageData(w, h);
  const updatePreview = () => {
    if (!seeds.length) {
      wandMaskState = null; overlay = null; render();
      let n = $('#wandNote'); if (n) n.textContent = 'Tap anywhere on the photo to select.';
      return;
    }
    const tol = +$('#wTol').value, edgeG = +$('#wEdge').value, contig = $('#wContig').checked;
    wandMaskState = computeWandSelection(seeds, tol, edgeG, contig, w, h, im.data, labData);
    const od = ovImg.data;
    od.fill(0);
    for (let i = 0; i < wandMaskState.length; i++) {
      if (wandMaskState[i]) {
        const p = i * 4;
        od[p] = 255; od[p + 1] = 65; od[p + 2] = 90; od[p + 3] = 140;
      }
    }
    ovCtx.putImageData(ovImg, 0, 0);
    overlay = c => c.drawImage(ovCanvas, 0, 0);
    render();
    let n = $('#wandNote'); if (n) n.textContent = `Selection preview active (${seeds.length} point${seeds.length > 1 ? 's' : ''}). Adjust sliders or tap more areas.`;
  };

  canvas.style.cursor = 'crosshair';
  canvas.onclick = e => {
    const p = canvasPos(e);
    const pt = { x: clamp(p.x / w, 0, 0.9999), y: clamp(p.y / h, 0, 0.9999) };
    if ($('#wAdd').checked) seeds.push(pt); else seeds = [pt];
    updatePreview();
  };

  ['wTol', 'wEdge', 'wSoft'].forEach(id => onRange(id, updatePreview));
  $('#wContig').onchange = updatePreview;

  const applyWand = invertKeep => {
    if (!wandMaskState) return toast('Tap on the photo to select an area first.');
    snapshot();
    ensureRestoreSource();
    const soft = +$('#wSoft').value;
    let mask = wandMaskState;
    if (soft > 0) mask = boxBlur(mask, w, h, Math.round(soft * Math.max(1, w / 900)));
    const cur = bc.getImageData(0, 0, w, h);
    for (let i = 0; i < mask.length; i++) {
      const m = invertKeep ? mask[i] : (255 - mask[i]);
      cur.data[i * 4 + 3] = Math.round(cur.data[i * 4 + 3] * m / 255);
    }
    bc.putImageData(cur, 0, 0);
    seeds = [];
    wandMaskState = null;
    overlay = null;
    render();
    toast(invertKeep ? 'Kept selected area only.' : 'Selected area removed.');
  };

  on('wandRemove', () => applyWand(false));
  on('wandKeep', () => applyWand(true));
  on('wandClear', () => { seeds = []; updatePreview(); });
}

function bgFillTool() {
  show(`<p class="muted">Put a solid colour behind the transparent parts of your photo.</p>${control('Colour', 'fillColor', 'color', '#ffffff')}<div class="inline-actions">${button('fillWhite', 'White', 'ghost')}${button('fillBlack', 'Black', 'ghost')}${button('fillGreen', 'Green', 'ghost')}</div>${button('doFill', 'Apply background colour')}`);
  const set = c => { $('#fillColor').value = c; preview(); };
  const make = () => {
    const n = newCanvas(base.width, base.height), c = n.getContext('2d');
    c.fillStyle = $('#fillColor').value;
    c.fillRect(0, 0, n.width, n.height);
    c.drawImage(base, 0, 0);
    return n;
  };
  const preview = () => { previewOverride = make(); render(); };
  $('#fillColor').oninput = preview;
  on('fillWhite', () => set('#ffffff'));
  on('fillBlack', () => set('#000000'));
  on('fillGreen', () => set('#00b140'));
  on('doFill', () => {
    snapshot();
    const n = make();
    previewOverride = null;
    base = n;
    render();
    toast('Background colour applied.');
  });
  preview();
}

/* ---------- brushes & polygon lasso ---------- */
function startBrush(mode, quiet = false) {
  if (mode === 'restore' && !restoreSource) {
    if (!quiet) toast('Nothing has been erased yet.');
    return;
  }
  drawMode = mode;
  if (mode === 'eraser' || mode === 'bgErase') ensureRestoreSource();
  $('#startBrush')?.classList.add('btn-active');
  canvas.style.cursor = 'crosshair';
  canvas.style.touchAction = 'none';
  const size = () => +$('#brushSize').value * Math.max(1, canvas.width / 700);
  const stamp = (a, b) => {
    const c = base.getContext('2d'), r = size() / 2, dist = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(dist / Math.max(1, r / 3)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      c.save();
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      if (mode === 'restore') {
        c.clip();
        const sx = clamp(Math.floor(x - r - 1), 0, base.width), sy = clamp(Math.floor(y - r - 1), 0, base.height);
        const ex = clamp(Math.ceil(x + r + 1), 0, base.width), ey = clamp(Math.ceil(y + r + 1), 0, base.height);
        const sw = ex - sx, sh = ey - sy;
        if (sw > 0 && sh > 0) {
          c.clearRect(sx, sy, sw, sh);
          c.drawImage(restoreSource, sx, sy, sw, sh, sx, sy, sw, sh);
        }
      } else {
        c.globalCompositeOperation = 'destination-out';
        c.fill();
      }
      c.restore();
    }
  };
  canvas.onpointerdown = e => {
    if (!drawMode) return;
    e.preventDefault();
    snapshot();
    const p = canvasPos(e);
    pointerState = { last: p };
    if (mode === 'draw') {
      pointerState.layer = { type: 'stroke', points: [p], color: $('#brushColor').value, size: size() };
      layers.push(pointerState.layer);
    } else stamp(p, p);
    render();
    canvas.setPointerCapture?.(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!pointerState) return;
    e.preventDefault();
    const p = canvasPos(e);
    if (mode === 'draw') pointerState.layer.points.push(p);
    else stamp(pointerState.last, p);
    pointerState.last = p;
    scheduleRender();
  };
  canvas.onpointerup = canvas.onpointercancel = () => { pointerState = null; render(); };
  if (!quiet) toast('Drag on the photo to use the brush.');
}

function polygonTool() {
  show(`<p class="muted">Tap points around the subject. Tap the red first point (or press Apply) to close the shape.</p>${range('Edge feather (px)', 'selFeather', 0, 20, 2)}${check('Remove the inside instead', 'selInvert', false)}${button('startSelect', 'Start polygon selection')}${button('finishSelect', 'Apply selection')}${button('undoPoint', 'Remove last point', 'ghost')}${button('clearSelect', 'Cancel selection', 'ghost')}`);
  const startPolygon = () => {
    drawMode = 'selection';
    selection = [];
    canvas.style.cursor = 'crosshair';
    overlay = c => {
      if (!selection.length) return;
      const m = Math.max(3, canvas.width / 220);
      c.save();
      c.strokeStyle = '#9cf06b';
      c.lineWidth = Math.max(1.5, m / 2);
      c.beginPath();
      selection.forEach((pt, i) => i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y));
      c.stroke();
      selection.forEach((pt, i) => {
        c.fillStyle = i ? '#9cf06b' : '#ff5c5c';
        c.beginPath();
        c.arc(pt.x, pt.y, m, 0, Math.PI * 2);
        c.fill();
      });
      c.restore();
    };
    canvas.onclick = e => {
      if (drawMode !== 'selection') return;
      const p = canvasPos(e);
      if (selection.length >= 3 && Math.hypot(p.x - selection[0].x, p.y - selection[0].y) < canvas.width * .035) {
        finishPolygon();
        return;
      }
      selection.push(p);
      render();
    };
    toast('Tap points around the subject. Tap the red first point to close.');
  };
  const finishPolygon = () => {
    if (selection.length < 3) return toast('Add at least three points.');
    snapshot();
    ensureRestoreSource();
    const inv = $('#selInvert')?.checked, feather = +($('#selFeather')?.value || 0);
    const mc = newCanvas(base.width, base.height), mctx = mc.getContext('2d');
    mctx.fillStyle = '#000';
    if (feather > 0) mctx.filter = `blur(${feather}px)`;
    mctx.beginPath();
    if (inv) mctx.rect(0, 0, mc.width, mc.height);
    selection.forEach((p, i) => i ? mctx.lineTo(p.x, p.y) : mctx.moveTo(p.x, p.y));
    mctx.closePath();
    mctx.fill(inv ? 'evenodd' : 'nonzero');
    mctx.filter = 'none';

    const n = cloneCanvas(base), c = n.getContext('2d');
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(mc, 0, 0);
    base = n;
    selection = [];
    drawMode = '';
    overlay = null;
    canvas.onclick = null;
    canvas.style.cursor = 'default';
    render();
    toast(inv ? 'Inside area removed.' : 'Outside area made transparent.');
  };
  on('startSelect', startPolygon);
  on('finishSelect', finishPolygon);
  on('undoPoint', () => { selection.pop(); render(); });
  on('clearSelect', () => { drawMode = ''; selection = []; overlay = null; canvas.onclick = null; canvas.style.cursor = 'default'; render(); toast('Selection cancelled.'); });
  startPolygon();
}

/* ---------- live text & shape preview dragging ---------- */
function bindTextPreview() {
  const drawTextPreview = c => {
    const text = $('#layerText').value.trim();
    if (!text) return;
    c.save();
    c.fillStyle = $('#textColor').value;
    c.font = `${$('#textWeight').value} ${+$('#textSize').value || 24}px ${$('#textFont').value}`;
    c.textBaseline = 'top';
    c.fillText(text, canvas.width * (+$('#textX').value / 100), canvas.height * (+$('#textY').value / 100));
    c.restore();
  };
  overlay = drawTextPreview;
  ['layerText', 'textFont', 'textWeight', 'textSize', 'textColor', 'textX', 'textY'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('input', () => {
      let o = $('#' + id + 'Out');
      if (o) o.textContent = el.value;
      scheduleRender();
    });
  });
  canvas.style.cursor = 'move';
  canvas.style.touchAction = 'none';
  let drag = false;
  canvas.onpointerdown = e => { drag = true; updatePos(e); canvas.setPointerCapture?.(e.pointerId); };
  canvas.onpointermove = e => { if (drag) updatePos(e); };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = false; };
  function updatePos(e) {
    const p = canvasPos(e);
    const px = clamp(Math.round(p.x / canvas.width * 100), 0, 100);
    const py = clamp(Math.round(p.y / canvas.height * 100), 0, 100);
    $('#textX').value = px; $('#textXOut').textContent = px;
    $('#textY').value = py; $('#textYOut').textContent = py;
    scheduleRender();
  }
  render();
}
function bindShapePreview() {
  const drawShapePreview = c => {
    const x = canvas.width * (+$('#shapeX').value / 100), y = canvas.height * (+$('#shapeY').value / 100);
    const w = canvas.width * (+$('#shapeW').value / 100), h = canvas.height * (+$('#shapeH').value / 100);
    drawLayer(c, {
      type: 'shape',
      shape: $('#shapeType').value,
      x, y, w, h, x2: x + w, y2: y + h,
      color: $('#shapeColor').value,
      fill: $('#shapeFill').checked,
      lineWidth: +$('#shapeLine').value * Math.max(1, canvas.width / 1000)
    });
  };
  overlay = drawShapePreview;
  ['shapeType', 'shapeColor', 'shapeFill', 'shapeLine', 'shapeX', 'shapeY', 'shapeW', 'shapeH'].forEach(id => {
    const el = $('#' + id);
    if (el) el.addEventListener('input', () => {
      let o = $('#' + id + 'Out');
      if (o) o.textContent = el.value;
      scheduleRender();
    });
  });
  canvas.style.cursor = 'move';
  canvas.style.touchAction = 'none';
  let drag = false;
  canvas.onpointerdown = e => { drag = true; updatePos(e); canvas.setPointerCapture?.(e.pointerId); };
  canvas.onpointermove = e => { if (drag) updatePos(e); };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = false; };
  function updatePos(e) {
    const p = canvasPos(e);
    const px = clamp(Math.round(p.x / canvas.width * 100), 0, 100);
    const py = clamp(Math.round(p.y / canvas.height * 100), 0, 100);
    $('#shapeX').value = px; $('#shapeXOut').textContent = px;
    $('#shapeY').value = py; $('#shapeYOut').textContent = py;
    scheduleRender();
  }
  render();
}

/* ---------- common tool actions ---------- */
function bindCommon(k) {
  on('turnLeft', () => rotateImage(-1));
  on('turnRight', () => rotateImage(1));
  on('flipH', () => flipImage(true));
  on('flipV', () => flipImage(false));
  on('addText', () => {
    let text = $('#layerText').value.trim();
    if (!text) return toast('Enter text first.');
    snapshot();
    layers.push({
      type: 'text',
      text,
      color: $('#textColor').value,
      size: Math.max(8, +$('#textSize').value || 24),
      font: $('#textFont').value,
      weight: $('#textWeight').value,
      baseline: 'top',
      x: canvas.width * (+$('#textX').value / 100),
      y: canvas.height * (+$('#textY').value / 100)
    });
    render();
    renderLayerList();
    toast('Text layer added.');
  });
  on('addShape', () => {
    snapshot();
    let x = canvas.width * (+$('#shapeX').value / 100), y = canvas.height * (+$('#shapeY').value / 100);
    let w = canvas.width * (+$('#shapeW').value / 100), h = canvas.height * (+$('#shapeH').value / 100);
    layers.push({
      type: 'shape',
      shape: $('#shapeType').value,
      x, y, w, h, x2: x + w, y2: y + h,
      color: $('#shapeColor').value,
      fill: $('#shapeFill').checked,
      lineWidth: +$('#shapeLine').value * Math.max(1, canvas.width / 1000)
    });
    render();
    renderLayerList();
    toast('Shape added.');
  });
  on('addTextLayer', () => selectTool('text'));
  on('addShapeLayer', () => selectTool('shapes'));
  on('startBrush', () => startBrush(k));
  on('stopBrush', () => {
    drawMode = '';
    $('#startBrush')?.classList.remove('btn-active');
    canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
    canvas.style.cursor = 'default';
    canvas.style.touchAction = 'pan-y';
    toast('Brush paused.');
  });
  if ($('#resizeW')) {
    const rw = $('#resizeW'), rh = $('#resizeH'), ar = base.width / base.height;
    rw.oninput = () => { if ($('#keepRatio').checked && +rw.value > 0) rh.value = Math.max(1, Math.round(rw.value / ar)); };
    rh.oninput = () => { if ($('#keepRatio').checked && +rh.value > 0) rw.value = Math.max(1, Math.round(rh.value * ar)); };
  }
  on('doResize', () => {
    snapshot();
    const f = flat(), w = clamp(+$('#resizeW').value || 1, 1, 12000), h = clamp(+$('#resizeH').value || 1, 1, 12000);
    const n = newCanvas(w, h), c = n.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(f, 0, 0, w, h);
    commitBase(n);
    toast('Image resized.');
    selectTool('resize');
  });
  on('doCompress', () => exportImage('image/jpeg', +$('#quality').value / 100));
  on('doConvert', () => exportImage($('#convertType').value, +($('#convertQ')?.value || 92) / 100));
  on('doWatermark', () => {
    const t = $('#watermarkText').value.trim();
    if (!t) return toast('Enter watermark text.');
    snapshot();
    layers.push({
      type: 'text',
      text: t,
      color: $('#watermarkColor').value,
      size: +$('#watermarkSize').value,
      opacity: +($('#watermarkOpacity')?.value || 75) / 100,
      x: canvas.width - 20,
      y: canvas.height - 24,
      align: 'right'
    });
    render();
    renderLayerList();
    toast('Watermark added.');
  });
  on('doBorder', () => {
    snapshot();
    const f = flat(), b = +$('#borderWidth').value, n = newCanvas(f.width + 2 * b, f.height + 2 * b), c = n.getContext('2d');
    c.fillStyle = $('#borderColor').value;
    c.fillRect(0, 0, n.width, n.height);
    c.drawImage(f, b, b);
    commitBase(n);
    toast('Border added.');
  });
}
function rotateImage(dir) {
  snapshot();
  const f = flat(), n = newCanvas(f.height, f.width), c = n.getContext('2d');
  c.translate(n.width / 2, n.height / 2);
  c.rotate(dir * Math.PI / 2);
  c.drawImage(f, -f.width / 2, -f.height / 2);
  commitBase(n);
  toast('Rotated.');
}
function flipImage(horizontal) {
  snapshot();
  const f = flat(), n = newCanvas(f.width, f.height), c = n.getContext('2d');
  c.translate(horizontal ? n.width : 0, horizontal ? 0 : n.height);
  c.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
  c.drawImage(f, 0, 0);
  commitBase(n);
  toast('Flipped.');
}

/* ---------- export ---------- */
async function exportImage(mime = 'image/png', quality = .92) {
  if (!requirePhoto()) return;
  renderClean();
  let src = canvas;
  if (mime === 'image/jpeg') {
    src = newCanvas(canvas.width, canvas.height);
    const c = src.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, src.width, src.height);
    c.drawImage(canvas, 0, 0);
  }
  const blob = await blobOf(src, mime, quality), ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  render();
  await deliver([{ blob, name: `${photoName}-ixora.${ext}` }]);
}
$('#downloadBtn').onclick = () => exportImage();
$('#undoBtn').onclick = undo;
$('#redoBtn').onclick = redo;
$('#resetBtn').onclick = () => {
  if (!base) return;
  snapshot();
  base = cloneCanvas(originalRestore || base);
  restoreSource = null;
  layers = [];
  adjust = zeroAdjust();
  dressImage = null;
  previewOverride = null;
  fgStrokes = [];
  bgStrokes = [];
  bgSeed = null;
  aiMaskCache = null;
  render();
  toast('Reset to the opened photo.');
  selectTool(activeTool || 'adjustAll');
};

/* ---------- batch, zip, file manager, history, collage ---------- */
function renderDownloadResults(container, items, zipName) {
  if (!items.length) { container.innerHTML = '<p class="muted">No matching files processed.</p>'; return; }
  container.innerHTML = `<p class="muted">Processed ${items.length} file(s).</p>` +
    (items.length > 1 ? `${button('dlZipBtn', 'Download all as ZIP', 'primary')}${button('dlAllBtn', 'Download individually', 'ghost')}` : '') +
    `<div class="file-dl-list">${items.map((it, i) => `<div class="file-dl-row"><span>${escapeHTML(it.name)}</span><button data-dl-idx="${i}">↓ Save</button></div>`).join('')}</div>`;
  container.querySelectorAll('[data-dl-idx]').forEach(b => b.onclick = () => {
    const it = items[+b.dataset.dlIdx];
    saveBlob(it.blob, it.name);
  });
  const zb = container.querySelector('#dlZipBtn');
  if (zb) zb.onclick = async () => {
    const zblob = await buildZip(items);
    saveBlob(zblob, zipName);
  };
  const ab = container.querySelector('#dlAllBtn');
  if (ab) ab.onclick = () => deliver(items);
}

async function toolAction(k) {
  if (k === 'batchResize' || k === 'batchConvert' || k === 'batchRename') {
    const extra = k === 'batchResize' ? control('Max longest edge (px)', 'batchMaxEdge', 'number', 1600, 'min="64" max="8192"')
      : k === 'batchConvert' ? select('Target format', 'batchFmt', [['image/webp', 'WEBP'], ['image/png', 'PNG'], ['image/jpeg', 'JPEG']])
      : '';
    show(`<p class="muted">${k === 'batchResize' ? 'Resizes images proportionally to fit within max edge.' : k === 'batchConvert' ? 'Converts images to your chosen format locally.' : 'Renames selected files ixora-001, ixora-002 …'}</p>${extra}${button('chooseBatch', 'Choose files')}<div id="batchStatus" class="muted"></div>`);
    $('#chooseBatch').onclick = () => {
      const m = $('#multiInput');
      m.accept = k === 'batchRename' ? '*/*' : 'image/*';
      m.onchange = () => { const fs = [...m.files]; m.value = ''; batchProcess(k, fs); };
      m.click();
    };
    return;
  }
  if (k === 'zip') {
    show(`<p class="muted">Extract standard ZIP archives locally. Encrypted archives and unusual compression methods are not supported.</p>${button('chooseZip', 'Choose ZIP file')}<div id="zipStatus" class="muted"></div>`);
    $('#chooseZip').onclick = () => $('#zipInput').click();
    $('#zipInput').onchange = async () => {
      let f = $('#zipInput').files[0]; $('#zipInput').value = '';
      if (!f) return;
      try {
        let files = await unzipFile(f);
        const items = files.map(x => ({ blob: x.blob, name: x.name.split('/').pop() || x.name }));
        renderDownloadResults($('#zipStatus'), items, 'extracted-files.zip');
        if (items.length === 1) await deliver(items);
      } catch (e) { $('#zipStatus').textContent = e.message; }
    };
    return;
  }
  if (k === 'fileManager') {
    let files = await dbList();
    show(`<p class="muted">Files saved in this app's private local database.</p>${button('saveCurrent', 'Save current photo', 'ghost')}<div class="layer-list" id="storedFiles" style="margin-top:8px"></div>`);
    $('#saveCurrent').onclick = async () => {
      if (!requirePhoto()) return;
      renderClean();
      let blob = await blobOf(canvas, 'image/png');
      render();
      await dbPut({ id: uid(), name: photoName + '.png', blob, created: Date.now() });
      toast('Saved in local file manager.');
      toolAction('fileManager');
    };
    $('#storedFiles').innerHTML = files.map(f => `<div class="layer-item"><span>${escapeHTML(f.name)}</span><span><button data-open="${f.id}" title="Open in editor">Open</button> <button data-get="${f.id}" title="Download">↓</button> <button data-del="${f.id}" title="Delete">×</button></span></div>`).join('') || '<p class="muted">No saved files yet.</p>';
    document.querySelectorAll('[data-open]').forEach(b => b.onclick = async () => {
      let f = await dbGet(b.dataset.open);
      if (f) await loadPhotoFromBlob(f.blob, f.name);
    });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await dbDelete(b.dataset.del); toolAction('fileManager'); });
    document.querySelectorAll('[data-get]').forEach(b => b.onclick = async () => { let f = await dbGet(b.dataset.get); if (f) saveBlob(f.blob, f.name); });
    return;
  }
  if (k === 'history') {
    let a = [];
    try { a = JSON.parse(localStorage.getItem('ixoraDownloads') || '[]'); } catch (e) {}
    show(`<p class="muted">Recent exports from this app.</p><div class="layer-list">${a.map(x => `<div class="layer-item"><span>${escapeHTML(x.name)}<br><small>${new Date(x.date).toLocaleString()}</small></span></div>`).join('') || '<p class="muted">No downloads recorded yet.</p>'}</div>${button('clearHistory', 'Clear history', 'ghost')}`);
    $('#clearHistory').onclick = () => { localStorage.removeItem('ixoraDownloads'); toolAction('history'); };
    return;
  }
  if (k === 'collage') {
    show(`<p class="muted">Choose 2–9 images to create a grid collage.</p>${button('chooseCollage', 'Choose images')}<div id="collageStatus" class="muted"></div>`);
    $('#chooseCollage').onclick = () => {
      const m = $('#multiInput');
      m.accept = 'image/*';
      m.onchange = async () => {
        let fs = [...m.files].slice(0, 9); m.value = '';
        if (fs.length < 2) return toast('Choose at least two images.');
        try {
          let ims = await Promise.all(fs.map(loadImage)), cols = Math.ceil(Math.sqrt(ims.length)), rows = Math.ceil(ims.length / cols), cell = 500, gap = 12;
          let n = newCanvas(cols * cell + (cols + 1) * gap, rows * cell + (rows + 1) * gap), c = n.getContext('2d');
          c.fillStyle = '#fff';
          c.fillRect(0, 0, n.width, n.height);
          c.imageSmoothingEnabled = true;
          c.imageSmoothingQuality = 'high';
          ims.forEach((im, i) => {
            let x = gap + (i % cols) * (cell + gap), y = gap + Math.floor(i / cols) * (cell + gap), s = Math.min(cell / im.width, cell / im.height), w = im.width * s, h = im.height * s;
            c.drawImage(im, x + (cell - w) / 2, y + (cell - h) / 2, w, h);
          });
          await saveBlob(await blobOf(n, 'image/jpeg', .92), 'ixora-collage.jpg');
          $('#collageStatus').textContent = 'Collage created.';
        } catch (e) { toast(e.message); }
      };
      m.click();
    };
    return;
  }
}

async function batchProcess(k, files) {
  if (!files.length) return;
  const out = [];
  const maxEdge = clamp(+($('#batchMaxEdge')?.value || 1600), 64, 8192);
  const fmt = $('#batchFmt')?.value || 'image/webp';
  try {
    for (let i = 0; i < files.length; i++) {
      let f = files[i];
      if (k === 'batchRename') {
        let ext = (f.name.includes('.') ? f.name.split('.').pop() : 'png') || 'png';
        out.push({ blob: f, name: `ixora-${String(i + 1).padStart(3, '0')}.${ext}` });
        continue;
      }
      if (!isImageFile(f)) continue;
      let name = f.name.replace(/\.[^.]+$/, '') || `image-${i + 1}`;
      let im = await loadImage(f), n = document.createElement('canvas');
      if (k === 'batchResize') {
        let s = Math.min(1, maxEdge / Math.max(im.width, im.height));
        n.width = Math.max(1, Math.round(im.width * s));
        n.height = Math.max(1, Math.round(im.height * s));
      } else {
        n.width = im.width;
        n.height = im.height;
      }
      const nc = n.getContext('2d');
      if (fmt === 'image/jpeg' && k === 'batchConvert') {
        nc.fillStyle = '#fff';
        nc.fillRect(0, 0, n.width, n.height);
      }
      nc.imageSmoothingEnabled = true;
      nc.imageSmoothingQuality = 'high';
      nc.drawImage(im, 0, 0, n.width, n.height);
      let mime = k === 'batchConvert' ? fmt : 'image/png';
      let ext = mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : 'png';
      out.push({ blob: await blobOf(n, mime, .9), name: `${name}-ixora.${ext}` });
    }
    renderDownloadResults($('#batchStatus'), out, `ixora-${k}.zip`);
    if (out.length === 1) await deliver(out);
  } catch (e) { $('#batchStatus').textContent = 'Could not process: ' + e.message; }
}

async function unzipFile(file) {
  let b = await file.arrayBuffer(), v = new DataView(b), out = [];
  /* Find End of Central Directory (0x06054b50) from end */
  let eocd = -1;
  for (let p = b.byteLength - 22; p >= Math.max(0, b.byteLength - 65558); p--) {
    if (v.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw Error('Invalid or unsupported ZIP archive.');
  const totalEntries = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const td = new TextDecoder();
  for (let idx = 0; idx < totalEntries && p + 46 <= b.byteLength; idx++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const flags = v.getUint16(p + 8, true);
    const method = v.getUint16(p + 10, true);
    const compressed = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = td.decode(new Uint8Array(b, p + 46, nameLen));
    p += 46 + nameLen + extra + comment;
    if (!name || name.endsWith('/')) continue;
    if (flags & 1) throw Error('Encrypted ZIP archives are not supported.');
    if (local + 30 > b.byteLength || v.getUint32(local, true) !== 0x04034b50) continue;
    const dataStart = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (dataStart + compressed > b.byteLength) throw Error('Corrupted ZIP entry: ' + name);
    const raw = b.slice(dataStart, dataStart + compressed);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) {
      if (!('DecompressionStream' in window)) throw Error('This browser does not support offline ZIP decompression.');
      let ds = new DecompressionStream('deflate-raw');
      data = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
    } else throw Error('Unsupported ZIP compression method: ' + method);
    out.push({ name, blob: new Blob([data]) });
  }
  if (!out.length) throw Error('No supported files found in this ZIP.');
  return out;
}

/* ---------- IndexedDB local file manager ---------- */
function db() {
  return new Promise((resolve, reject) => {
    let r = indexedDB.open('ixora-local-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbPut(x) { let d = await db(); return new Promise((res, rej) => { let t = d.transaction('files', 'readwrite'); t.objectStore('files').put(x); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
async function dbList() { let d = await db(); return new Promise((res, rej) => { let r = d.transaction('files').objectStore('files').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function dbGet(id) { let d = await db(); return new Promise(res => { let r = d.transaction('files').objectStore('files').get(id); r.onsuccess = () => res(r.result); }); }
async function dbDelete(id) { let d = await db(); return new Promise(res => { let t = d.transaction('files', 'readwrite'); t.objectStore('files').delete(id); t.oncomplete = res; }); }

function renderLayerList() {
  let el = $('#layerList');
  if (!el) return;
  let items = layers.map((l, i) => `<div class="layer-item"><span>${escapeHTML(l.type === 'text' ? l.text : l.type + ' layer')}</span><button data-layer="${i}">Remove</button></div>`);
  if (dressImage) items.push(`<div class="layer-item"><span>Clothing overlay layer</span><button data-dress-del="1">Remove</button></div>`);
  el.innerHTML = items.join('') || '<p class="muted">No layers.</p>';
  el.querySelectorAll('[data-layer]').forEach(b => b.onclick = () => { snapshot(); layers.splice(+b.dataset.layer, 1); render(); renderLayerList(); });
  el.querySelectorAll('[data-dress-del]').forEach(b => b.onclick = () => { snapshot(); dressImage = null; render(); renderLayerList(); });
}

/* ---------- dress overlay ---------- */
function dressControls() {
  return `${range('X position (%)', 'dressX', 0, 100, Math.round(dress.x * 100))}${range('Y position (%)', 'dressY', 0, 100, Math.round(dress.y * 100))}${range('Width (%)', 'dressW', 5, 100, Math.round(dress.w * 100))}${range('Rotate (°)', 'dressRot', -180, 180, Math.round(dress.rotate || 0))}${range('Opacity (%)', 'dressOpacity', 5, 100, Math.round(dress.opacity * 100))}`;
}
function bindDress() {
  let snapped = false;
  const ensureSnap = () => { if (!snapped) { snapshot(); snapped = true; } };
  ['dressX', 'dressY', 'dressW', 'dressRot', 'dressOpacity'].forEach(id => onRange(id, () => {
    ensureSnap();
    dress.x = +$('#dressX').value / 100;
    dress.y = +$('#dressY').value / 100;
    dress.w = +$('#dressW').value / 100;
    dress.h = dress.w * dressImage.height / dressImage.width * canvas.width / canvas.height;
    dress.rotate = +$('#dressRot').value;
    dress.opacity = +$('#dressOpacity').value / 100;
    scheduleRender();
  }));
  canvas.style.cursor = 'move';
  canvas.style.touchAction = 'none';
  let drag = null;
  canvas.onpointerdown = e => {
    e.preventDefault();
    ensureSnap();
    drag = { p: canvasPos(e), x: dress.x, y: dress.y };
    canvas.setPointerCapture?.(e.pointerId);
  };
  canvas.onpointermove = e => {
    if (!drag) return;
    const p = canvasPos(e);
    dress.x = clamp(drag.x + (p.x - drag.p.x) / canvas.width, -0.5, 1);
    dress.y = clamp(drag.y + (p.y - drag.p.y) / canvas.height, -0.5, 1);
    const sx = Math.round(dress.x * 100), sy = Math.round(dress.y * 100);
    if ($('#dressX')) { $('#dressX').value = clamp(sx, 0, 100); $('#dressXOut').textContent = sx; }
    if ($('#dressY')) { $('#dressY').value = clamp(sy, 0, 100); $('#dressYOut').textContent = sy; }
    scheduleRender();
  };
  canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
}
function dressAction(k) {
  if (!requirePhoto()) return;
  if (k === 'dressAdd') {
    show(`<p class="muted">Add a clothing image as a separate layer. Transparent PNG clothing works best. This is a manual overlay editor, not automatic garment fitting.</p>${button('chooseDress', 'Choose clothing image')}`);
    $('#chooseDress').onclick = () => $('#dressInput').click();
    $('#dressInput').onchange = async () => {
      let f = $('#dressInput').files[0]; $('#dressInput').value = ''; if (!f) return;
      try {
        snapshot();
        dressImage = await loadImage(f);
        dress = { x: .25, y: .25, w: .5, h: .5 * dressImage.height / dressImage.width * canvas.width / canvas.height, opacity: 1, rotate: 0, visible: true };
        render();
        show(`<p class="muted">Clothing layer added. Drag on the photo or use sliders to fit it.</p>${dressControls()}${button('saveDress', 'Done')}`);
        bindDress();
        $('#saveDress').onclick = () => toast('Clothing layer position applied.');
      } catch (e) { toast(e.message); }
    };
    return;
  }
  if (k === 'dressEdit') {
    if (!dressImage) return show('<p class="muted">Add a clothing image layer first.</p>');
    show(`<p class="muted">Drag the clothing layer directly on the photo or adjust sliders below.</p>${dressControls()}${button('saveDress', 'Done')}`);
    bindDress();
    $('#saveDress').onclick = () => toast('Clothing layer updated.');
    return;
  }
  if (k === 'dressRemove') {
    if (!dressImage) return show('<p class="muted">No clothing layer to remove.</p>');
    snapshot();
    dressImage = null;
    render();
    show('<p class="muted">Clothing layer removed.</p>');
    toast('Clothing layer removed.');
  }
}

/* ---------- boot ---------- */
$('#themeBtn').onclick = () => document.body.classList.toggle('light');
$('#year').textContent = new Date().getFullYear();
renderTools();
updateHistoryButtons();
syncStageHeight();
if (isNative) {
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {});
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').onclick = async () => {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
};
