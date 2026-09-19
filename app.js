(() => {
  const $ = (id) => document.getElementById(id);
  const emptyState = $('emptyState');
  const workspace = $('workspace');
  const fileInput = $('fileInput');
  const photoCanvas = $('photoCanvas');
  const outlineCanvas = $('outlineCanvas');
  const fillCanvas = $('fillCanvas');
  const drawCanvas = $('drawCanvas');
  const textureCanvas = $('textureCanvas');
  const stage = $('canvasStage');
  const viewport = $('canvasViewport');
  const pctx = photoCanvas.getContext('2d', { willReadFrequently: true });
  const octx = outlineCanvas.getContext('2d');
  const fctx = fillCanvas.getContext('2d');
  const dctx = drawCanvas.getContext('2d');
  const tctx = textureCanvas.getContext('2d');

  let image = null;
  let imageData = null;
  let quantIndexMap = null;
  let palette = [];
  let history = [];
  let historyIndex = -1;
  let previewing = false;
  let eyedropperMode = false;

  let drawing = false;
  let gesture = null;
  let lastPoint = null;
  let strokeColor = '#2a2a2a';
  let strokeStarted = false;
  let pendingTap = null;
  let movedDuringDraw = false;

  const state = {
    appMode: 'trace',
    interactionMode: 'draw',
    fillDifficulty: 'easy',
    photoOpacity: 0.28,
    outline: true,
    outlineThreshold: 55,
    brush: 'watercolor',
    brushSize: 18,
    autoColor: true,
    color: '#2a2a2a',
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    textureEnabled: true,
    textureType: 'drawing',
    textureStrength: 0.36,
  };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 1400);
  }

  function fitDimensions(w, h) {
    const max = 1400;
    const scale = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
  }

  function setupCanvas(w, h) {
    [photoCanvas, outlineCanvas, fillCanvas, drawCanvas, textureCanvas].forEach((c) => {
      c.width = w;
      c.height = h;
    });
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    dctx.lineCap = 'round';
    dctx.lineJoin = 'round';
  }

  function resetView() {
    state.zoom = 1;
    state.offsetX = 0;
    state.offsetY = 0;
    $('zoomSlider').value = '100';
    updateTransform();
  }

  function updateTransform() {
    stage.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.zoom})`;
    const label = `${Math.round(state.zoom * 100)}%`;
    $('zoomValue').textContent = label;
    $('zoomLabel').textContent = label;
  }

  function applyPhotoOpacity() {
    photoCanvas.style.opacity = previewing ? '0' : String(state.photoOpacity);
  }

  function loadImage(img) {
    image = img;
    const dim = fitDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height);
    setupCanvas(dim.w, dim.h);
    pctx.clearRect(0, 0, dim.w, dim.h);
    pctx.drawImage(img, 0, 0, dim.w, dim.h);
    imageData = pctx.getImageData(0, 0, dim.w, dim.h);
    palette = generatePalette(imageData, 12);
    quantIndexMap = buildQuantIndexMap(imageData, palette);
    renderPaletteBoard();
    applyPhotoOpacity();
    generateOutline();
    regenerateTexture();
    fctx.clearRect(0, 0, dim.w, dim.h);
    dctx.clearRect(0, 0, dim.w, dim.h);
    history = [];
    historyIndex = -1;
    pushHistory();
    resetView();
    emptyState.classList.add('hidden');
    workspace.classList.remove('hidden');
    toast('写真を読み込みました');
  }

  function generatePalette(imgData, count) {
    const samples = [];
    const d = imgData.data;
    const step = Math.max(12, Math.floor(Math.sqrt((imgData.width * imgData.height) / 5000)));
    for (let y = 0; y < imgData.height; y += step) {
      for (let x = 0; x < imgData.width; x += step) {
        const i = (y * imgData.width + x) * 4;
        const a = d[i + 3];
        if (a > 150) samples.push([d[i], d[i + 1], d[i + 2]]);
      }
    }
    if (!samples.length) return [[42, 42, 42]];
    const centers = [];
    for (let i = 0; i < count; i++) {
      centers.push(samples[Math.floor((i / count) * samples.length)]?.slice() || samples[samples.length - 1].slice());
    }
    for (let iter = 0; iter < 8; iter++) {
      const buckets = Array.from({ length: centers.length }, () => ({ r: 0, g: 0, b: 0, n: 0 }));
      for (const px of samples) {
        const idx = nearestPaletteIndex(px[0], px[1], px[2], centers);
        const b = buckets[idx];
        b.r += px[0];
        b.g += px[1];
        b.b += px[2];
        b.n += 1;
      }
      for (let i = 0; i < centers.length; i++) {
        if (!buckets[i].n) continue;
        centers[i] = [
          Math.round(buckets[i].r / buckets[i].n),
          Math.round(buckets[i].g / buckets[i].n),
          Math.round(buckets[i].b / buckets[i].n),
        ];
      }
    }
    centers.sort((a, b) => luminance(a) - luminance(b));
    return centers;
  }

  function luminance(c) {
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  }

  function nearestPaletteIndex(r, g, b, p = palette) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < p.length; i++) {
      const dr = r - p[i][0];
      const dg = g - p[i][1];
      const db = b - p[i][2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  function buildQuantIndexMap(imgData, p) {
    const map = new Uint8Array(imgData.width * imgData.height);
    const d = imgData.data;
    for (let i = 0, px = 0; i < d.length; i += 4, px++) {
      map[px] = nearestPaletteIndex(d[i], d[i + 1], d[i + 2], p);
    }
    return map;
  }

  function rgbArrayToCss(arr) {
    return `rgb(${arr[0]}, ${arr[1]}, ${arr[2]})`;
  }

  function rgbArrayToHex(arr) {
    return '#' + arr.map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  function renderPaletteBoard() {
    const board = $('paletteBoard');
    board.innerHTML = '';
    palette.forEach((col) => {
      const btn = document.createElement('button');
      btn.className = 'palette-swatch';
      btn.style.background = `linear-gradient(145deg, rgba(255,255,255,.15), rgba(0,0,0,.1)), ${rgbArrayToCss(col)}`;
      const hex = rgbArrayToHex(col);
      if (hex.toLowerCase() === state.color.toLowerCase()) btn.classList.add('active');
      btn.addEventListener('click', () => {
        state.color = hex;
        $('colorPicker').value = hex;
        state.autoColor = false;
        $('autoColorToggle').checked = false;
        updatePaletteSelection();
        toast('パレット色を選択しました');
      });
      board.appendChild(btn);
    });
  }

  function updatePaletteSelection() {
    const swatches = [...document.querySelectorAll('.palette-swatch')];
    swatches.forEach((el, idx) => {
      const hex = rgbArrayToHex(palette[idx]);
      el.classList.toggle('active', !state.autoColor && hex.toLowerCase() === state.color.toLowerCase());
    });
  }

  function quantColorAt(x, y) {
    if (!imageData || !quantIndexMap) return state.color;
    x = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
    const idx = quantIndexMap[y * imageData.width + x];
    return rgbArrayToCss(palette[idx]);
  }

  function generateOutline() {
    if (!imageData) return;
    const { width: w, height: h, data } = imageData;
    const gray = new Float32Array(w * h);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      gray[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    const out = octx.createImageData(w, h);
    const od = out.data;
    const t = state.outlineThreshold;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = -gray[i - w - 1] + gray[i - w + 1] - 2 * gray[i - 1] + 2 * gray[i + 1] - gray[i + w - 1] + gray[i + w + 1];
        const gy = -gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1];
        const mag = Math.sqrt(gx * gx + gy * gy);
        const k = i * 4;
        if (mag > t) {
          od[k] = 38;
          od[k + 1] = 38;
          od[k + 2] = 38;
          od[k + 3] = 120;
        } else {
          od[k + 3] = 0;
        }
      }
    }
    octx.clearRect(0, 0, w, h);
    octx.putImageData(out, 0, 0);
    outlineCanvas.style.opacity = state.outline && !previewing ? '1' : '0';
  }

  function regenerateTexture() {
    const w = textureCanvas.width;
    const h = textureCanvas.height;
    tctx.clearRect(0, 0, w, h);
    if (!state.textureEnabled) {
      textureCanvas.style.opacity = '0';
      return;
    }
    const alpha = state.textureStrength;
    if (state.textureType === 'drawing') drawDrawingTexture(w, h, alpha);
    if (state.textureType === 'watercolor') drawWaterTexture(w, h, alpha);
    if (state.textureType === 'sketch') drawSketchTexture(w, h, alpha);
    textureCanvas.style.opacity = previewing ? String(alpha * 0.75) : String(alpha);
  }

  function drawDrawingTexture(w, h, alpha) {
    const img = tctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 245 + Math.floor(Math.random() * 10);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v - 1;
      img.data[i + 3] = Math.floor(alpha * 45);
    }
    tctx.putImageData(img, 0, 0);
    tctx.strokeStyle = `rgba(120, 120, 110, ${alpha * 0.08})`;
    for (let y = 8; y < h; y += 18) {
      tctx.beginPath();
      tctx.moveTo(0, y + Math.random() * 2);
      tctx.lineTo(w, y + Math.random() * 2);
      tctx.stroke();
    }
  }

  function drawWaterTexture(w, h, alpha) {
    const img = tctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 243 + Math.floor(Math.random() * 12);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v - 2;
      img.data[i + 3] = Math.floor(alpha * (30 + Math.random() * 35));
    }
    tctx.putImageData(img, 0, 0);
    tctx.fillStyle = `rgba(130, 130, 120, ${alpha * 0.06})`;
    for (let i = 0; i < 900; i++) {
      tctx.beginPath();
      tctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.6 + 0.2, 0, Math.PI * 2);
      tctx.fill();
    }
  }

  function drawSketchTexture(w, h, alpha) {
    const img = tctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 244 + Math.floor(Math.random() * 11);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v - 2;
      img.data[i + 3] = Math.floor(alpha * 35);
    }
    tctx.putImageData(img, 0, 0);
    tctx.strokeStyle = `rgba(125, 125, 118, ${alpha * 0.08})`;
    tctx.lineWidth = 1;
    for (let x = -h; x < w; x += 16) {
      tctx.beginPath();
      tctx.moveTo(x, 0);
      tctx.lineTo(x + h, h);
      tctx.stroke();
    }
  }

  function pointFromEvent(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (drawCanvas.width / rect.width),
      y: (e.clientY - rect.top) * (drawCanvas.height / rect.height),
    };
  }

  function eventInsideCanvas(e) {
    const rect = drawCanvas.getBoundingClientRect();
    return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
  }

  function beginStroke(p) {
    strokeStarted = true;
    strokeColor = state.autoColor ? quantColorAt(p.x, p.y) : state.color;
    lastPoint = p;
    renderBrushPoint(p, p, strokeColor);
  }

  function continueStroke(p) {
    renderBrushPoint(lastPoint, p, strokeColor);
    lastPoint = p;
  }

  function renderBrushPoint(a, b, color) {
    if (erasingActive()) {
      eraseSegment(a, b);
      return;
    }
    if (state.brush === 'watercolor') drawWatercolor(a, b, color);
    if (state.brush === 'pencil') drawPencil(a, b, color);
    if (state.brush === 'crayon') drawCrayon(a, b, color);
    if (state.brush === 'spray') drawSpray(a, b, color);
  }

  function baseScale() {
    return drawCanvas.width / drawCanvas.getBoundingClientRect().width;
  }

  function erasingActive() {
    return $('eraserBtn').classList.contains('active');
  }

  function eraseSegment(a, b) {
    dctx.save();
    dctx.globalCompositeOperation = 'destination-out';
    dctx.lineWidth = state.brushSize * baseScale();
    dctx.beginPath();
    dctx.moveTo(a.x, a.y);
    dctx.lineTo(b.x, b.y);
    dctx.stroke();
    dctx.restore();
  }

  function drawWatercolor(a, b, color) {
    const w = state.brushSize * baseScale();
    dctx.save();
    dctx.strokeStyle = color;
    dctx.globalAlpha = 0.14;
    dctx.lineWidth = w * 1.18;
    dctx.shadowBlur = w * 0.65;
    dctx.shadowColor = color;
    for (let i = 0; i < 3; i++) {
      dctx.beginPath();
      dctx.moveTo(a.x + rand(-w * 0.08, w * 0.08), a.y + rand(-w * 0.08, w * 0.08));
      dctx.lineTo(b.x + rand(-w * 0.08, w * 0.08), b.y + rand(-w * 0.08, w * 0.08));
      dctx.stroke();
    }
    dctx.restore();
  }

  function drawPencil(a, b, color) {
    const w = state.brushSize * baseScale();
    dctx.save();
    dctx.strokeStyle = color;
    dctx.globalAlpha = 0.28;
    dctx.lineWidth = Math.max(1, w * 0.22);
    for (let i = 0; i < 5; i++) {
      const ox = rand(-w * 0.18, w * 0.18);
      const oy = rand(-w * 0.18, w * 0.18);
      dctx.beginPath();
      dctx.moveTo(a.x + ox, a.y + oy);
      dctx.lineTo(b.x + ox, b.y + oy);
      dctx.stroke();
    }
    dctx.restore();
  }

  function drawCrayon(a, b, color) {
    const w = state.brushSize * baseScale();
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(2, w * 0.22)));
    dctx.save();
    dctx.fillStyle = color;
    dctx.globalAlpha = 0.18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t + rand(-w * 0.22, w * 0.22);
      const y = a.y + (b.y - a.y) * t + rand(-w * 0.22, w * 0.22);
      dctx.beginPath();
      dctx.ellipse(x, y, w * rand(0.16, 0.28), w * rand(0.1, 0.18), Math.random() * Math.PI, 0, Math.PI * 2);
      dctx.fill();
    }
    dctx.restore();
  }

  function drawSpray(a, b, color) {
    const w = state.brushSize * baseScale();
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(4, w * 0.3)));
    dctx.save();
    dctx.fillStyle = color;
    dctx.globalAlpha = 0.18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = a.x + (b.x - a.x) * t;
      const cy = a.y + (b.y - a.y) * t;
      for (let j = 0; j < 18; j++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * w * 0.7;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad;
        dctx.beginPath();
        dctx.arc(x, y, Math.random() * w * 0.05 + 0.4, 0, Math.PI * 2);
        dctx.fill();
      }
    }
    dctx.restore();
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pushHistory() {
    if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1);
    history.push({
      fill: fctx.getImageData(0, 0, fillCanvas.width, fillCanvas.height),
      draw: dctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height),
    });
    if (history.length > 24) history.shift();
    historyIndex = history.length - 1;
    updateUndoRedo();
  }

  function restoreHistory(idx) {
    if (!history[idx]) return;
    fctx.putImageData(history[idx].fill, 0, 0);
    dctx.putImageData(history[idx].draw, 0, 0);
    historyIndex = idx;
    updateUndoRedo();
  }

  function updateUndoRedo() {
    $('undoBtn').disabled = historyIndex <= 0;
    $('redoBtn').disabled = historyIndex >= history.length - 1;
  }

  function clearDrawing() {
    fctx.clearRect(0, 0, fillCanvas.width, fillCanvas.height);
    dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    pushHistory();
  }

  function floodFillRegion(x, y) {
    if (!quantIndexMap || !imageData) return;
    x = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
    y = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
    const width = imageData.width;
    const height = imageData.height;
    const startIndex = y * width + x;
    const target = quantIndexMap[startIndex];
    const visited = new Uint8Array(width * height);
    const queue = [startIndex];
    const tolerance = state.fillDifficulty === 'easy' ? 0 : 1;
    const mask = new Uint8ClampedArray(width * height);
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      if (visited[idx]) continue;
      visited[idx] = 1;
      const current = quantIndexMap[idx];
      if (Math.abs(current - target) > tolerance) continue;
      mask[idx] = 1;
      const px = idx % width;
      const py = Math.floor(idx / width);
      if (px > 0) queue.push(idx - 1);
      if (px < width - 1) queue.push(idx + 1);
      if (py > 0) queue.push(idx - width);
      if (py < height - 1) queue.push(idx + width);
    }
    const fillColor = state.autoColor ? rgbArrayToCss(palette[target]) : state.color;
    const [r, g, b] = cssToRgb(fillColor);
    const img = fctx.getImageData(0, 0, width, height);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const off = i * 4;
      img.data[off] = r;
      img.data[off + 1] = g;
      img.data[off + 2] = b;
      img.data[off + 3] = 122;
    }
    fctx.putImageData(img, 0, 0);
    pushHistory();
  }

  function cssToRgb(css) {
    if (css.startsWith('#')) {
      const v = css.slice(1);
      return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
    }
    const m = css.match(/\d+/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }

  function updatePreviewState() {
    applyPhotoOpacity();
    outlineCanvas.style.opacity = state.outline && !previewing ? '1' : '0';
    textureCanvas.style.opacity = state.textureEnabled ? String(previewing ? state.textureStrength * 0.75 : state.textureStrength) : '0';
    $('previewBtn').textContent = previewing ? 'ガイドに戻る' : '作品だけ見る';
  }

  function exportPng() {
    const c = document.createElement('canvas');
    c.width = drawCanvas.width;
    c.height = drawCanvas.height;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(fillCanvas, 0, 0);
    ctx.drawImage(drawCanvas, 0, 0);
    if (state.textureEnabled) ctx.drawImage(textureCanvas, 0, 0);
    const a = document.createElement('a');
    a.download = 'trace-art-v2.png';
    a.href = c.toDataURL('image/png');
    a.click();
    toast('PNGを書き出しました');
  }

  function readFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => loadImage(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function updateModeUI() {
    $('traceModeBtn').classList.toggle('active', state.appMode === 'trace');
    $('easyModeBtn').classList.toggle('active', state.appMode === 'easy');
    $('drawModeBtn').classList.toggle('active', state.interactionMode === 'draw');
    $('moveModeBtn').classList.toggle('active', state.interactionMode === 'move');
    $('easyControls').classList.toggle('hidden', state.appMode !== 'easy');
    $('fillEasyBtn').classList.toggle('active', state.fillDifficulty === 'easy');
    $('fillNormalBtn').classList.toggle('active', state.fillDifficulty === 'normal');
    $('paperDrawingBtn').classList.toggle('active', state.textureType === 'drawing');
    $('paperWaterBtn').classList.toggle('active', state.textureType === 'watercolor');
    $('paperSketchBtn').classList.toggle('active', state.textureType === 'sketch');
    $('fillDifficultyValue').textContent = state.fillDifficulty === 'easy' ? 'かんたん' : 'ふつう';
  }

  function updateBrushUI() {
    document.querySelectorAll('.brush-chip').forEach((btn) => btn.classList.toggle('active', btn.dataset.brush === state.brush));
  }

  function startGesture(e) {
    gesture = { startX: e.clientX, startY: e.clientY, startOffsetX: state.offsetX, startOffsetY: state.offsetY };
  }

  function moveGesture(e) {
    if (!gesture) return;
    state.offsetX = gesture.startOffsetX + (e.clientX - gesture.startX);
    state.offsetY = gesture.startOffsetY + (e.clientY - gesture.startY);
    updateTransform();
  }

  function pointerDown(e) {
    if (!image || !eventInsideCanvas(e)) return;
    if (state.interactionMode === 'move') {
      startGesture(e);
      return;
    }
    const p = pointFromEvent(e);
    if (eyedropperMode) {
      state.color = rgbArrayToHex(palette[nearestPaletteIndex(...cssToRgb(quantColorAt(p.x, p.y)), palette)]);
      $('colorPicker').value = state.color;
      state.autoColor = false;
      $('autoColorToggle').checked = false;
      eyedropperMode = false;
      $('eyedropperBtn').classList.remove('active');
      updatePaletteSelection();
      toast('色を取得しました');
      return;
    }
    drawing = true;
    movedDuringDraw = false;
    pendingTap = p;
    strokeStarted = false;
    lastPoint = p;
    drawCanvas.setPointerCapture(e.pointerId);
  }

  function pointerMove(e) {
    if (state.interactionMode === 'move') {
      moveGesture(e);
      return;
    }
    if (!drawing) return;
    const p = pointFromEvent(e);
    if (Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y) > 2) movedDuringDraw = true;
    if (!strokeStarted && movedDuringDraw) {
      beginStroke(lastPoint);
    }
    if (strokeStarted) {
      continueStroke(p);
    }
    lastPoint = p;
  }

  function pointerUp(e) {
    if (state.interactionMode === 'move') {
      gesture = null;
      return;
    }
    if (!drawing) return;
    drawing = false;
    if (state.appMode === 'easy' && !movedDuringDraw && pendingTap) {
      floodFillRegion(pendingTap.x, pendingTap.y);
      toast('ベース色を入れました');
    } else {
      if (!strokeStarted && pendingTap) beginStroke(pendingTap);
      pushHistory();
    }
    pendingTap = null;
    strokeStarted = false;
  }

  function wireEvents() {
    fileInput.addEventListener('change', (e) => readFile(e.target.files[0]));
    $('demoBtn').addEventListener('click', () => {
      const img = new Image();
      img.onload = () => loadImage(img);
      img.src = demoDataURL();
    });

    $('photoOpacity').addEventListener('input', (e) => {
      state.photoOpacity = +e.target.value / 100;
      $('photoOpacityValue').textContent = `${e.target.value}%`;
      applyPhotoOpacity();
    });

    $('outlineToggle').addEventListener('change', (e) => {
      state.outline = e.target.checked;
      updatePreviewState();
    });

    $('outlineStrength').addEventListener('input', (e) => {
      state.outlineThreshold = +e.target.value;
      $('outlineStrengthValue').textContent = e.target.value;
      generateOutline();
    });

    $('brushSize').addEventListener('input', (e) => {
      state.brushSize = +e.target.value;
      $('brushSizeValue').textContent = `${e.target.value}px`;
    });

    $('zoomSlider').addEventListener('input', (e) => {
      state.zoom = +e.target.value / 100;
      updateTransform();
    });

    $('autoColorToggle').addEventListener('change', (e) => {
      state.autoColor = e.target.checked;
      updatePaletteSelection();
    });

    $('colorPicker').addEventListener('input', (e) => {
      state.color = e.target.value;
      state.autoColor = false;
      $('autoColorToggle').checked = false;
      updatePaletteSelection();
    });

    $('eyedropperBtn').addEventListener('click', () => {
      eyedropperMode = !eyedropperMode;
      $('eyedropperBtn').classList.toggle('active', eyedropperMode);
      toast(eyedropperMode ? '写真上をタップして色取得' : 'スポイト解除');
    });

    $('undoBtn').addEventListener('click', () => { if (historyIndex > 0) restoreHistory(historyIndex - 1); });
    $('redoBtn').addEventListener('click', () => { if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1); });
    $('clearBtn').addEventListener('click', () => { clearDrawing(); toast('塗りと描画をクリアしました'); });
    $('eraserBtn').addEventListener('click', () => $('eraserBtn').classList.toggle('active'));
    $('previewBtn').addEventListener('click', () => { previewing = !previewing; updatePreviewState(); });
    $('saveBtn').addEventListener('click', exportPng);
    $('resetBtn').addEventListener('click', () => {
      workspace.classList.add('hidden');
      emptyState.classList.remove('hidden');
      fileInput.value = '';
      image = null;
      imageData = null;
      quantIndexMap = null;
      palette = [];
      previewing = false;
    });

    $('traceModeBtn').addEventListener('click', () => { state.appMode = 'trace'; updateModeUI(); });
    $('easyModeBtn').addEventListener('click', () => { state.appMode = 'easy'; updateModeUI(); });
    $('drawModeBtn').addEventListener('click', () => { state.interactionMode = 'draw'; updateModeUI(); });
    $('moveModeBtn').addEventListener('click', () => { state.interactionMode = 'move'; updateModeUI(); });
    $('fillEasyBtn').addEventListener('click', () => { state.fillDifficulty = 'easy'; updateModeUI(); });
    $('fillNormalBtn').addEventListener('click', () => { state.fillDifficulty = 'normal'; updateModeUI(); });
    $('paperDrawingBtn').addEventListener('click', () => { state.textureType = 'drawing'; updateModeUI(); regenerateTexture(); });
    $('paperWaterBtn').addEventListener('click', () => { state.textureType = 'watercolor'; updateModeUI(); regenerateTexture(); });
    $('paperSketchBtn').addEventListener('click', () => { state.textureType = 'sketch'; updateModeUI(); regenerateTexture(); });
    $('textureToggle').addEventListener('change', (e) => { state.textureEnabled = e.target.checked; regenerateTexture(); });
    $('textureStrength').addEventListener('input', (e) => {
      state.textureStrength = +e.target.value / 100;
      $('textureStrengthValue').textContent = `${e.target.value}%`;
      regenerateTexture();
    });

    document.querySelectorAll('.brush-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.brush = btn.dataset.brush;
        updateBrushUI();
      });
    });

    drawCanvas.addEventListener('pointerdown', pointerDown);
    drawCanvas.addEventListener('pointermove', pointerMove);
    drawCanvas.addEventListener('pointerup', pointerUp);
    drawCanvas.addEventListener('pointercancel', () => { drawing = false; gesture = null; pendingTap = null; strokeStarted = false; });
  }

  function demoDataURL() {
    const c = document.createElement('canvas');
    c.width = 960; c.height = 640;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 430);
    sky.addColorStop(0, '#94d4f5'); sky.addColorStop(.65, '#f4d2a2'); sky.addColorStop(1, '#db916a');
    g.fillStyle = sky; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#5e825e'; g.fillRect(0, 430, 960, 210);
    g.fillStyle = '#efe6d5'; g.fillRect(80, 205, 800, 285);
    g.fillStyle = '#74879b'; for (let x = 115; x < 845; x += 135) g.fillRect(x, 248, 92, 108);
    g.fillStyle = '#4c6476'; g.fillRect(0, 482, 960, 12);
    g.fillStyle = '#29313b'; g.fillRect(0, 525, 960, 115);
    g.fillStyle = '#1e2227'; g.beginPath(); g.arc(390, 420, 35, 0, Math.PI * 2); g.fill(); g.fillRect(365, 452, 50, 115);
    g.fillStyle = '#33404e'; g.fillRect(350, 565, 25, 75); g.fillRect(405, 565, 25, 75);
    g.fillStyle = 'rgba(255,255,255,.42)'; g.fillRect(0, 0, 960, 22);
    return c.toDataURL('image/png');
  }

  wireEvents();
  updateModeUI();
  updateBrushUI();
  $('photoOpacityValue').textContent = `${Math.round(state.photoOpacity * 100)}%`;
  $('textureStrengthValue').textContent = `${Math.round(state.textureStrength * 100)}%`;
  if (new URLSearchParams(location.search).get('demo') === '1') setTimeout(() => $('demoBtn').click(), 20);
})();
