// static/app.js
document.addEventListener('DOMContentLoaded', () => {

/* ==============================
   Daily To-Dos (UI candy)
============================== */
const DAILY_TODOS = [
  "Create 3 slides",
  "Generate a provocative caption",
  "Try a new font for your slide",
  "Use the Vivid filter on an image",
  "Export a slide with the 4K Filter",
  "Share your creation and post it",
  "Edit a slide and save it locally",
  "Replace a slide image",
  "Try a 'Rescue' style caption",
  "Post an image on tiktok",
  "Pick an unusual color for text",
  "Go outside and touch grass ",
  "Do 10 pushups  (seriously!)",
  "Drink a glass of water ",
  "Do a proper journal, even describe yourday",
  "Pet someone",
  "Smile for no reason"
];

// ===== Auto Performance Mode (lite) detection =====
(function () {
  const docEl = document.documentElement;

  function isMobileUA() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || ''
    );
  }

  function lowMemory() {
    // deviceMemory is not on iOS; treat undefined as "unknown"
    const dm = navigator.deviceMemory;
    return (typeof dm === 'number' && dm <= 3);
  }

  function prefersLessMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  async function onBatterySave() {
    try {
      if (!navigator.getBattery) return false;
      const b = await navigator.getBattery();
      // low battery or saver enabled → lite
      return b.dischargingTime < 1200 || b.level <= 0.2 || b.savePowerMode === true;
    } catch { return false; }
  }

  function roughFpsProbe(ms = 800) {
    return new Promise(resolve => {
      let frames = 0;
      let start = performance.now();
      function step(t) {
        frames++;
        if (t - start >= ms) {
          const fps = frames * (1000 / (t - start));
          resolve(fps);
        } else {
          requestAnimationFrame(step);
        }
      }
      requestAnimationFrame(step);
    });
  }

  async function decideLite() {
    // Start with fast heuristics
    let lite = false;

    // Phone or touch-first device
    const touchy = (navigator.maxTouchPoints || 0) > 0 || isMobileUA();

    // Combine quick signals
    if (touchy) lite = true;
    if (lowMemory()) lite = true;
    if (prefersLessMotion()) lite = true;

    // Battery saver can flip it on
    if (await onBatterySave()) lite = true;

    // Probe early FPS; if very low, flip it on
    try {
      const fps = await roughFpsProbe(800);
      if (fps < 35) lite = true;
    } catch {}

    // Apply
    if (lite) {
      docEl.dataset.perf = 'lite';
    } else {
      delete docEl.dataset.perf;
    }

    // Let the rest of your code react if needed
    window.dispatchEvent(new CustomEvent('perfmodechange', { detail: { lite } }));
  }

  // Initial decide + re-evaluate on visibility/orientation changes
  decideLite();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) decideLite();
  });
  window.addEventListener('orientationchange', decideLite);
})();


function seededRand(seed) {
  // mulberry32 PRNG
  var t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function getTodayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + (d.getMonth()+1).toString().padStart(2,"0") + "-" + d.getDate().toString().padStart(2,"0");
}
function pickRandomTasks(n) {
  const seed = parseInt(getTodayKey().replace(/-/g,""));
  let arr = DAILY_TODOS.slice();
  let chosen = [];
  for(let i=0;i<n;i++) {
    let idx = Math.floor(seededRand(seed+i)*arr.length);
    chosen.push(arr.splice(idx,1)[0]);
  }
  return chosen;
}
function loadChecked() {
  let v = localStorage.getItem("todos-" + getTodayKey());
  return v ? JSON.parse(v) : {};
}
function saveChecked(obj) {
  localStorage.setItem("todos-" + getTodayKey(), JSON.stringify(obj));
}
function updateTodoBoxColor() {
  const checkboxes = document.querySelectorAll('#todo-list input[type="checkbox"]');
  const box = document.getElementById('daily-todo-box');
  if (!box) return;
  const allDone = Array.from(checkboxes).length &&
    Array.from(checkboxes).every(cb => cb.checked);
  box.style.background = allDone
    ? 'linear-gradient(120deg, #d5ffe6 60%, #a2f4c3 100%)'
    : 'rgba(255,255,255,0.98)';
  box.style.boxShadow = allDone
    ? '0 4px 22px #71e3a3bb'
    : '0 4px 18px #beeaff49';
  box.style.transition = 'background 0.45s, box-shadow 0.45s';
}
function renderDailyTodos() {
  const list = document.getElementById('todo-list');
  if (!list) return;
  const tasks = pickRandomTasks(3);
  const checked = loadChecked();
  list.innerHTML = '';
  tasks.forEach((task,i) => {
    const li = document.createElement('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'todo'+i;
    box.checked = checked[task] || false;
    box.addEventListener('change', () => {
      checked[task] = box.checked;
      saveChecked(checked);
      updateTodoBoxColor();
    });
    li.appendChild(box);
    const label = document.createElement('label');
    label.htmlFor = 'todo'+i;
    label.textContent = task;
    li.appendChild(label);
    list.appendChild(li);
  });
  updateTodoBoxColor();
}
renderDailyTodos();

/* ==============================
   State
============================== */
let currentStep = 1;
const canvas2d = document.getElementById('edit-canvas');


let artist = '';
let style = 'provocation';
let caption1 = '';
let caption2 = '';
let chosenImages = ['', ''];
let runs = [];
let slideIndex = 0;
let savedSlides = [];

let activeFilter = null;
const originalImages = {}; // for 4K undo

// rAF throttle for smoothness on mobile
function rafThrottle(fn) {
  let ticking = false, lastArgs, lastThis;
  return function throttled(...args) {
    lastArgs = args; lastThis = this;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => { ticking = false; fn.apply(lastThis, lastArgs); });
    }
  };
}

// Wire common sliders safely (only if they exist)
['zoom-slider','stroke-width','letter-spacing','text-opacity','curve-radius','shadow-blur']
  .forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const applyFn = window.applyTextChanges || window.requestRender || (window.drawCanvas || (()=>{}));
    el.addEventListener('input', rafThrottle(applyFn), { passive:true });
  });


// Text state
const baseFontSize = 80;
let zoomOffset = 0;
let fontSize = baseFontSize + zoomOffset;
let fontFamily = 'Inter';
let fillColor = '#FFFFFF';
let strokeColor = '#000000';
let strokeWidth = 6;
let shadowColor = '#000000';
let shadowBlur = 0;
let shadowOffsetX = 0;
let shadowOffsetY = 0;
let bgColor = '#000000';
let bgPadding = 0;
let letterSpacing = 0;
let textOpacity = 1.0;
let curveRadius = 0;
let textOffset = { x: 0, y: 0 };
let rotationAngle = 0;
let dragStart = null;

// Guarded listener for text filter toggle
const filterTextToggle = document.getElementById('filter-text-toggle');
if (filterTextToggle) {
  filterTextToggle.addEventListener('change', () => drawCanvas());
}

/* ==============================
   Helpers for custom second line
============================== */
async function getSecondLine(secondMode, artistName) {
  try {
    const r = await fetch('/api/second_line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        second_mode: (secondMode || 'classic'),
        artist: artistName || ''
      })
    });
    const j = await r.json();
    return (j && j.line) ? j.line : '';
  } catch (e) {
    console.error('getSecondLine failed', e);
    return '';
  }
}

// Read the "Second phrase" radio (Classic/Custom)
function readSecondMode() {
  return document.querySelector('input[name="secondMode"]:checked')?.value || 'classic';
}

/* ==============================
   Filters
============================== */
function getFilterCSS(name) {
  switch (name) {
    case 'clarity':  return 'saturate(1.6) contrast(1.3) brightness(1.05)';
    case 'bw':       return 'grayscale(1) contrast(1.2) brightness(1.05)';
    case 'epic':     return 'contrast(1.5) brightness(0.8) sepia(0.2) saturate(1.3)';
    case 'lofi':     return 'contrast(0.9) saturate(1.2) brightness(0.9)';
    case 'vivid':    return 'saturate(1.6) contrast(1.2)';
    case 'cinematic':return 'contrast(1.4) brightness(0.9) sepia(0.1) saturate(1.2)';
    case 'warmGlow': return 'brightness(1.1) sepia(0.2) saturate(1.2)';
    case 'moody':    return 'contrast(1.3) brightness(0.8) saturate(0.8)';
    case 'dreamy':   return 'blur(1px) brightness(1.1) saturate(1.3)';
    case 'matte':    return 'contrast(0.9) brightness(1.0) sepia(0.05)';
    case 'hdr':      return 'contrast(1.5) brightness(1.2) saturate(1.5)';
    default:         return 'none';
  }
}

// Server-powered 4K enhance (no WebGL)
async function applyEnhance4K() {
  const base = imageCache[slideIndex];
  if (!base) return;
  originalImages[slideIndex] = base; // keep for Undo

  // Draw ONLY the base image (not the text) to an offscreen canvas
  const off = document.createElement('canvas');
  off.width = base.width;
  off.height = base.height;
  off.getContext('2d').drawImage(base, 0, 0);

  try {
    // Use toBlob → FileReader to keep memory lower on Safari/iOS
    const blob = await new Promise(res => off.toBlob(res, 'image/png'));
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });

    // Send to the backend upscaler
    const r = await fetch('/api/upscale4k', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl })
    });
    const j = await r.json();
    if (!r.ok || !j.dataUrl) throw new Error(j.error || 'Upscale failed');

    // Replace the slide's base image with the enhanced one
    await new Promise((resolve, reject) => {
      const enhanced = new Image();
      enhanced.onload = () => { imageCache[slideIndex] = enhanced; drawCanvas(); resolve(); };
      enhanced.onerror = reject;
      enhanced.src = j.dataUrl;
    });
  } catch (e) {
    console.error(e);
    alert((e && e.message) || '4K failed');
  }
}


const galleryId = 'g' + Math.random().toString(36).slice(2,10);

function saveCurrentSlideToGallery() {
  const img = imageCache[slideIndex];
  if (!img) return alert('No slide to add!');
  const c  = document.createElement('canvas');
  c.width  = img.width;
  c.height = img.height;
  const cx = c.getContext('2d');
  drawImageAndText(cx, img, 1, currentDrawOpts());
  const dataUrl = c.toDataURL('image/png');
  const filename = `slide_${slideIndex+1}_${Date.now()}.png`;
  fetch('/api/save_gallery_image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gallery_id: galleryId, filename, dataUrl })
  })
  .then(r => r.json())
  .then(j => j.success ? alert('Added to phone gallery!') : alert('Error: '+(j.error||'Failed')));
}
function openPhoneGallery() {
  const url = `${window.location.origin}/gallery/${galleryId}/`;
  window.open(url, '_blank');
}

// Wire filter buttons safely
const filterButtonsWrap = document.getElementById('filter-buttons');
if (filterButtonsWrap) {
  filterButtonsWrap.querySelectorAll('button[data-filter]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const filter = btn.dataset.filter;
      if (filter === 'enhance4k') {
        btn.disabled = true;
        const prev = btn.textContent;
        btn.textContent = 'Enhancing…';
        await applyEnhance4K();
        btn.textContent = prev;
        btn.disabled = false;
        return;
      }
      if (activeFilter === filter) {
        activeFilter = null;
        btn.classList.remove('active');
      } else {
        filterButtonsWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        activeFilter = filter;
        btn.classList.add('active');
      }
      drawCanvas();
    });
  });
}

// Undo filter (single wiring)
const undoFilterBtn = document.getElementById('undo-filter');
if (undoFilterBtn) {
  undoFilterBtn.addEventListener('click', () => {
    if (originalImages[slideIndex]) {
      imageCache[slideIndex] = originalImages[slideIndex];
      delete originalImages[slideIndex];
    }
    activeFilter = null;
    if (filterButtonsWrap) filterButtonsWrap.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    drawCanvas();
  });
}

/* ==============================
   Images & Drawing
============================== */
const imageCache = [];
const slideImages = [];
const slideCaptions = [];

const fontUploadInput = document.getElementById('font-upload');
const fontUploadBtn = document.getElementById('font-upload-btn');

// Font upload button opens file picker
if (fontUploadBtn && fontUploadInput) {
  fontUploadBtn.addEventListener('click', () => fontUploadInput.click());
  fontUploadInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFontUpload(e.target.files[0]);
  });
}

// Drag-and-drop font upload
document.addEventListener('dragover', e => {
  if (e.dataTransfer && Array.from(e.dataTransfer.items).some(item => item.kind === 'file')) {
    e.preventDefault();
    document.body.style.background = '#f5f5f5';
  }
});
document.addEventListener('dragleave', () => { document.body.style.background = ''; });
document.addEventListener('drop', e => {
  document.body.style.background = '';
  e.preventDefault();
  const file = Array.from(e.dataTransfer.files).find(f => /\.(ttf|otf)$/i.test(f.name));
  if (file) handleFontUpload(file);
});

const fontSelect = document.getElementById('font-select');
const fillColorInput = document.getElementById('fill-color');
const strokeColorInput = document.getElementById('stroke-color');
const strokeWidthInput = document.getElementById('stroke-width');
const shadowColorInput = document.getElementById('shadow-color');
const shadowBlurInput = document.getElementById('shadow-blur');
const shadowOffsetXInput = document.getElementById('shadow-offset-x');
const shadowOffsetYInput = document.getElementById('shadow-offset-y');
const bgColorInput = document.getElementById('bg-color');
const bgPaddingInput = document.getElementById('bg-padding');
const letterSpacingInput = document.getElementById('letter-spacing');
const textOpacityInput = document.getElementById('text-opacity');
const curveRadiusInput = document.getElementById('curve-radius');

function handleFontUpload(file) {
  const reader = new FileReader();
  reader.onload = function(evt) {
    const fontName = file.name.replace(/\.(ttf|otf)$/i, '');
    const styleEl = document.createElement('style');
    styleEl.innerText = `
      @font-face {
        font-family: '${fontName}';
        src: url('${evt.target.result}');
      }
    `;
    document.head.appendChild(styleEl);
    if (!FONT_FAMILIES.includes(fontName)) {
      FONT_FAMILIES.push(fontName);
      if (fontSelect) {
        const opt = document.createElement('option');
        opt.value = fontName;
        opt.textContent = fontName + " (custom)";
        fontSelect.appendChild(opt);
      }
    }
    if (fontSelect) {
      fontSelect.value = fontName;
    }
    fontFamily = fontName;
    drawCanvas();
    alert('Font "' + fontName + '" added!');
  };
  reader.readAsDataURL(file);
}

const FONT_FAMILIES = ["Inter","Impact","Bangers","Anton","Oswald","Comic Neue","Archivo Black"];

// Populate font select
if (fontSelect) {
  fontSelect.innerHTML = '';
  FONT_FAMILIES.forEach(font => {
    const o = document.createElement('option');
    o.value = font;
    o.textContent = font;
    fontSelect.appendChild(o);
  });
  fontSelect.value = fontFamily;
}

/* ==============================
   UI elements
============================== */
const steps = document.querySelectorAll('.steps-indicator .step');
const sections = document.querySelectorAll('.step-section');
const artistInput = document.getElementById('artist-input');
const toStep2Btn = document.getElementById('to-step-2');
const megaGenerateBtn = document.getElementById('mega-generate-btn'); // may not exist
const styleRadios = document.getElementsByName('style');
const toStep3Btn = document.getElementById('to-step-3');
const backToStep1Btn = document.getElementById('back-to-step-1');
const firstSelect = document.getElementById('first-image');
const secondSelect = document.getElementById('second-image');
const preview1 = document.getElementById('preview1');
const preview2 = document.getElementById('preview2');
const uploadInput = document.getElementById('new-image-file');
const toStep4Btn = document.getElementById('to-step-4');
const backToStep2Btn = document.getElementById('back-to-step-2');
const generateBtn = document.getElementById('generate-btn');
const backToStep3Btn = document.getElementById('back-to-step-3');
const canvas = document.getElementById('edit-canvas');
const ctx = canvas.getContext('2d');
const prevSlideBtn = document.getElementById('prev-slide');
const nextSlideBtn = document.getElementById('next-slide');
const rotateCWBtn = document.getElementById('rotate-cw');
const rotateCCWBtn = document.getElementById('rotate-ccw');
const zoomSlider = document.getElementById('zoom-slider');
const resetCurveBtn = document.getElementById('reset-curve-btn');
const saveSlideBtn = document.getElementById('save-slide');
const saveDropboxBtn = document.getElementById('save-dropbox'); // may not exist in HTML
const restartBtn = document.getElementById('restart-btn');
const megaRestartBtn = document.getElementById('mega-restart-btn'); // may not exist

/* ==============================
   BG FX (cubes/bokeh)
============================== */
let currentBgStep = 1;
let currentBgFX = { cubes: [], bokeh: [] };

function addBgCubes(step) {
  const fx = document.getElementById('fx-bg-cubes');
  if (!fx) return;
  const stepCubeCounts = [4, 8, 14, 20, 33];
  const stepBokehCounts = [1, 3, 7, 12, 18];
  const cubesToAdd = stepCubeCounts[step-1] - currentBgFX.cubes.length;
  const bokehToAdd = stepBokehCounts[step-1] - currentBgFX.bokeh.length;

  for (let i = 0; i < cubesToAdd; ++i) {
    const cube = document.createElement('div');
    cube.className = 'fx-cube';
    let sz = 38 + Math.random() * 55;
    if (step === 5 && (currentBgFX.cubes.length + i) > 22 && Math.random() > 0.45) {
      sz = 90 + Math.random() * 52;
      cube.classList.add('special');
    }
    cube.style.width = cube.style.height = sz + 'px';
    cube.style.left = (Math.random() * 94) + 'vw';
    cube.style.top = (Math.random() * 85) + 'vh';
    cube.style.opacity = 0.45 + 0.30 * Math.random();
    let animDur = 7.5 + Math.random() * 7;
    let animDel = Math.random() * 2;
    cube.style.animationDuration = animDur + 's';
    cube.style.animationDelay = animDel + 's';
    cube.style.animationName = 'fadeInFloat, floatCube';
    cube.style.animationFillMode = 'both, both';

    if (step <= 2) {
      if (Math.random() > 0.80) cube.classList.add('teal');
    }
    if (step === 3) {
      if (Math.random() > 0.5) cube.classList.add('teal');
    }
    if (step === 4) {
      const r = Math.random();
      if (r > 0.7) cube.classList.add('green');
      else if (r > 0.3) cube.classList.add('teal');
    }
    if (step === 5) {
      const r = Math.random();
      if (r > 0.5) cube.classList.add('green');
      else if (r > 0.15) cube.classList.add('teal');
    }
    fx.appendChild(cube);
    currentBgFX.cubes.push(cube);
  }

  for (let i = 0; i < bokehToAdd; ++i) {
    const bub = document.createElement('div');
    bub.className = 'fx-bokeh';
    let sz = 30 + Math.random() * 80;
    bub.style.width = bub.style.height = sz + 'px';
    bub.style.left = (Math.random() * 97) + 'vw';
    bub.style.top = (Math.random() * 91) + 'vh';
    bub.style.opacity = 0.16 + Math.random() * 0.18;
    let animDur = 8 + Math.random() * 11;
    let animDel = Math.random() * 2;
    bub.style.animationDuration = animDur + 's';
    bub.style.animationDelay = animDel + 's';
    bub.style.animationName = 'fadeInFloat, floatBubble';
    bub.style.animationFillMode = 'both, both';
    if (step >= 4 && Math.random() > 0.57) bub.classList.add('teal');
    if (step === 5 && Math.random() > 0.31) bub.classList.add('green');
    fx.appendChild(bub);
    currentBgFX.bokeh.push(bub);
  }
  currentBgStep = step;
}
function updateBgCubesAccumulating(step) {
  if (step < currentBgStep) {
    const fx = document.getElementById('fx-bg-cubes');
    if (fx) fx.innerHTML = '';
    currentBgStep = 1;
    currentBgFX = { cubes: [], bokeh: [] };
    addBgCubes(1);
    if (step > 1) for(let s=2;s<=step;s++) addBgCubes(s);
  } else if (step > currentBgStep) {
    for(let s=currentBgStep+1;s<=step;s++) addBgCubes(s);
  }
  currentBgStep = step;
}
function resetBgFX() {
  const fx = document.getElementById('fx-bg-cubes');
  if (fx) fx.innerHTML = '';
  currentBgStep = 1;
  currentBgFX = { cubes: [], bokeh: [] };
  addBgCubes(1);
}

/* ==============================
   Step navigation + loader
============================== */
function updateStepFX(step) {
  const stepEls = document.querySelectorAll('.steps-indicator .step');
  stepEls.forEach((s, i) => {
    let aura = s.querySelector('.aura');
    if (!aura) {
      aura = document.createElement('div');
      aura.className = 'aura';
      s.insertBefore(aura, s.querySelector('small'));
    }
    const cubes = s.querySelector('.floating-cubes');
    if (cubes) cubes.remove();
    aura.style.opacity = '0';
    aura.classList.remove('green','show');
    if (i < step) {
      aura.classList.add('show');
      aura.style.opacity = '1';
      if (i === 4) aura.classList.add('green');
    }
  });
}
function showStep(step) {
  const oldSection = document.querySelector('.step-section.active');
  const newSection = document.getElementById('step-' + step);
  if (!newSection) return;

  if (oldSection && oldSection !== newSection) {
    oldSection.classList.remove('active');
    oldSection.classList.add('fading-out');
  }

  updateBgCubesAccumulating(step);
  newSection.classList.add('active');
  newSection.classList.remove('fading-out');

  setTimeout(() => {
    if (oldSection) oldSection.classList.remove('fading-out');
  }, 1200);

  const bar = document.getElementById('progress-bar-fill');
  const bubbles = document.querySelectorAll('.steps-indicator .step');
  if (bar && bubbles.length) {
    let pct = (step - 1) / (bubbles.length - 1);
    if (step === 2) pct = 0.30;
    bar.style.width = (pct * 100) + "%";
    bubbles.forEach((s, i) => {
      s.classList.toggle('completed', i < step - 1);
      s.classList.toggle('active', i === step - 1);
    });
  }
  updateStepFX(step);

  currentStep = step;
  const miniWindow = document.getElementById('mini-preview-window');
  if (miniWindow) miniWindow.style.display = (step === 5) ? 'flex' : 'none';
}
function showLoader() { const el = document.getElementById('mega-overlay'); if (el) el.style.display = 'flex'; }
function hideLoader() { const el = document.getElementById('mega-overlay'); if (el) el.style.display = 'none'; }

/* ==============================
   Styles/corpora picker
============================== */
async function refreshStylePicker() {
  try {
    const res = await fetch('/api/corpora');
    const styles = await res.json();
    const group = document.getElementById('style-radio-group');
    if (!group) return;

    const existing = Array.from(group.querySelectorAll('input[type="radio"]')).map(r => r.value);
    styles.forEach(st => {
      if (!existing.includes(st)) {
        const label = document.createElement('label');
        label.style.marginRight = '18px';
        label.innerHTML = `<input type="radio" name="style" value="${st}" /> ${st.charAt(0).toUpperCase() + st.slice(1)}`;
        group.appendChild(label);
      }
    });
  } catch (e) {
    console.warn('Failed to refresh corpora list', e);
  }
}
// call once on load
refreshStylePicker();

/* ==============================
   Canvas drawing
============================== */
function drawImageAndText(ctx, img, scale, opts) {
  opts = opts || {};
  ctx.save();
  ctx.clearRect(0, 0, img.width * scale, img.height * scale);

  ctx.translate(img.width * scale / 2, img.height * scale / 2);
  ctx.rotate(opts.rotationAngle || 0);
  ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
  ctx.rotate(-(opts.rotationAngle || 0));
  ctx.translate(-img.width * scale / 2, -img.height * scale / 2);

  const fontWeight = opts.fontWeight || 'bold';
  const fontSizePx = (opts.fontSize || 80) * scale;
  const fontFamily = opts.fontFamily || 'Inter';
  ctx.font = `${fontWeight} ${fontSizePx}px "${fontFamily}", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.globalAlpha = opts.textOpacity ?? 1.0;

  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, (opts.strokeWidth || 6) * scale);
  ctx.fillStyle = opts.fillColor || '#fff';
  ctx.strokeStyle = opts.strokeColor || '#000';
  ctx.shadowColor = opts.shadowColor || '#000';
  ctx.shadowBlur = (opts.shadowBlur || 0) * scale;
  ctx.shadowOffsetX = (opts.shadowOffsetX || 0) * scale;
  ctx.shadowOffsetY = (opts.shadowOffsetY || 0) * scale;

  const text = opts.text || '';
  const m = ctx.measureText(text);
  const textW = m.width + (opts.letterSpacing || 0) * (text.length - 1);

  let cx = img.width * scale / 2 + ((opts.textOffset?.x || 0) * scale);
  let cy = img.height * scale / 2 + ((opts.textOffset?.y || 0) * scale);

  if ((opts.bgPadding||0)>0 && (opts.curveRadius||0)===0) {
    ctx.save();
    ctx.globalAlpha = 0.7 * ctx.globalAlpha;
    ctx.fillStyle = opts.bgColor || '#000';
    ctx.fillRect(
      cx - textW/2 - (opts.bgPadding*scale),
      cy - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)/2 - (opts.bgPadding*scale),
      textW + 2*(opts.bgPadding*scale),
      m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2*(opts.bgPadding*scale)
    );
    ctx.restore();
  }

  ctx.save();
  if ((opts.curveRadius || 0) === 0) {
    if ((opts.letterSpacing || 0) > 0) {
      ctx.textAlign = 'left';
      let x = cx - textW / 2;
      for (let ch of text) {
        for (let i = 0; i < 3; i++) ctx.strokeText(ch, x, cy);
        ctx.fillText(ch, x, cy);
        x += ctx.measureText(ch).width + (opts.letterSpacing || 0);
      }
    } else {
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) ctx.strokeText(text, cx, cy);
      ctx.fillText(text, cx, cy);
    }
  } else {
    // Curved text
    const r = opts.curveRadius * scale;
    if (!r || !text) { ctx.restore(); ctx.restore(); return; }

    const widths = [];
    let totalArcLen = 0;
    for (let i = 0; i < text.length; ++i) {
      let w = ctx.measureText(text[i]).width;
      if (i < text.length - 1) w += opts.letterSpacing || 0;
      widths.push(w);
      totalArcLen += w;
    }
    const totalAngle = totalArcLen / r;
    let ang = -totalAngle / 2;

    for (let i = 0; i < text.length; ++i) {
      const ch = text[i];
      const w = widths[i];
      const a = w / r;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang + a/2);
      ctx.textAlign = 'center';
      for (let s = 0; s < 3; s++) ctx.strokeText(ch, 0, -r);
      ctx.fillText(ch, 0, -r);
      ctx.restore();
      ang += a;
    }
  }
  ctx.restore();
  ctx.restore();
}

function getDisplayScale(img) {
  const maxDisplayWidth = Math.min(img.width, 650, window.innerWidth * 0.9);
  return maxDisplayWidth / img.width;
}
function setCanvasToImage(img) {
  if (!img) return;
  const scale = getDisplayScale(img);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  canvas.style.width = `${img.width * scale}px`;
  canvas.style.height = `${img.height * scale}px`;
}
function drawImageOnly(ctx, img, scale, opts) {
  opts = opts || {};
  ctx.save();
  ctx.clearRect(0, 0, img.width * scale, img.height * scale);
  ctx.translate(img.width * scale / 2, img.height * scale / 2);
  ctx.rotate(opts.rotationAngle || 0);
  ctx.drawImage(img, -img.width * scale / 2, -img.height * scale / 2, img.width * scale, img.height * scale);
  ctx.rotate(-(opts.rotationAngle || 0));
  ctx.translate(-img.width * scale / 2, -img.height * scale / 2);
  ctx.restore();
}
function drawTextOnly(ctx, img, scale, opts) {
  opts = opts || {};
  ctx.save();

  const fontWeight = opts.fontWeight || 'bold';
  const fontSizePx = (opts.fontSize || 80) * scale;
  const ff = opts.fontFamily || 'Inter';
  ctx.font = `${fontWeight} ${fontSizePx}px "${ff}", Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.globalAlpha = opts.textOpacity ?? 1.0;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, (opts.strokeWidth || 6) * scale);
  ctx.fillStyle = opts.fillColor || '#fff';
  ctx.strokeStyle = opts.strokeColor || '#000';
  ctx.shadowColor = opts.shadowColor || '#000';
  ctx.shadowBlur = (opts.shadowBlur || 0) * scale;
  ctx.shadowOffsetX = (opts.shadowOffsetX || 0) * scale;
  ctx.shadowOffsetY = (opts.shadowOffsetY || 0) * scale;

  const text = opts.text || '';
  const m = ctx.measureText(text);
  const textW = m.width + (opts.letterSpacing || 0) * (text.length - 1);
  let cx = img.width * scale / 2 + ((opts.textOffset?.x || 0) * scale);
  let cy = img.height * scale / 2 + ((opts.textOffset?.y || 0) * scale);

  if ((opts.bgPadding||0)>0 && (opts.curveRadius||0)===0) {
    ctx.save();
    ctx.globalAlpha = 0.7 * ctx.globalAlpha;
    ctx.fillStyle = opts.bgColor || '#000';
    ctx.fillRect(
      cx - textW/2 - (opts.bgPadding*scale),
      cy - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)/2 - (opts.bgPadding*scale),
      textW + 2*(opts.bgPadding*scale),
      m.actualBoundingBoxAscent + m.actualBoundingBoxDescent + 2*(opts.bgPadding*scale)
    );
    ctx.restore();
  }

  ctx.save();
  if ((opts.curveRadius || 0) === 0) {
    if ((opts.letterSpacing || 0) > 0) {
      ctx.textAlign = 'left';
      let x = cx - textW / 2;
      for (let ch of text) {
        for (let i = 0; i < 3; i++) ctx.strokeText(ch, x, cy);
        ctx.fillText(ch, x, cy);
        x += ctx.measureText(ch).width + (opts.letterSpacing || 0);
      }
    } else {
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) ctx.strokeText(text, cx, cy);
      ctx.fillText(text, cx, cy);
    }
  } else {
    const r = opts.curveRadius * scale;
    if (!r || !text) { ctx.restore(); ctx.restore(); return; }
    const widths = [];
    let totalArcLen = 0;
    for (let i = 0; i < text.length; ++i) {
      let w = ctx.measureText(text[i]).width;
      if (i < text.length - 1) w += opts.letterSpacing || 0;
      widths.push(w); totalArcLen += w;
    }
    const totalAngle = totalArcLen / r;
    let ang = -totalAngle / 2;
    for (let i = 0; i < text.length; ++i) {
      const ch = text[i];
      const w = widths[i];
      const a = w / r;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang + a/2);
      ctx.textAlign = 'center';
      for (let s = 0; s < 3; s++) ctx.strokeText(ch, 0, -r);
      ctx.fillText(ch, 0, -r);
      ctx.restore();
      ang += a;
    }
  }
  ctx.restore();
  ctx.restore();
}

function drawCanvas() {
  const img = imageCache[slideIndex];
  if (!img || !img.complete) return;
  const scale = getDisplayScale(img);
  setCanvasToImage(img);

  const opts = {
    rotationAngle, fontSize, fontFamily, fontWeight: 'bold',
    fillColor, strokeColor, strokeWidth,
    shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    bgColor, bgPadding, letterSpacing, textOpacity, curveRadius, textOffset,
    text: slideCaptions.length ? slideCaptions[slideIndex] : (slideIndex === 0 ? caption1 : caption2),
  };

  const applyFilterToText = !!(filterTextToggle && filterTextToggle.checked);
  if (applyFilterToText) {
    ctx.filter = getFilterCSS(activeFilter);
    drawImageAndText(ctx, img, scale, opts);
    ctx.filter = 'none';
  } else {
    ctx.filter = getFilterCSS(activeFilter);
    drawImageOnly(ctx, img, scale, opts);
    ctx.filter = 'none';
    drawTextOnly(ctx, img, scale, opts);
  }
  drawMiniPreview();
}

function drawMiniPreview() {
  const mini = document.getElementById('mini-preview-canvas');
  if (!mini) return;
  const img = imageCache[slideIndex];
  if (!img || !img.complete) return;
  const ctxMini = mini.getContext('2d');
  ctxMini.clearRect(0, 0, mini.width, mini.height);
  let scale = Math.min(mini.width / img.width, mini.height / img.height);

  const opts = {
    rotationAngle,
    fontSize: fontSize * scale,
    fontFamily,
    fontWeight: 'bold',
    fillColor,
    strokeColor,
    strokeWidth: Math.max(2, strokeWidth * scale),
    shadowColor,
    shadowBlur: shadowBlur * scale,
    shadowOffsetX: shadowOffsetX * scale,
    shadowOffsetY: shadowOffsetY * scale,
    bgColor,
    bgPadding: bgPadding * scale,
    letterSpacing: letterSpacing * scale,
    textOpacity,
    curveRadius: curveRadius * scale,
    textOffset: { x: textOffset.x * scale, y: textOffset.y * scale },
    text: slideCaptions.length ? slideCaptions[slideIndex] : (slideIndex === 0 ? caption1 : caption2),
  };

  ctxMini.save();
  ctxMini.translate((mini.width - img.width * scale) / 2, (mini.height - img.height * scale) / 2);
  drawImageAndText(ctxMini, img, scale, opts);
  ctxMini.restore();
}

function exportHighRes(scale = 2) {
  const img = imageCache[slideIndex];
  if (!img) return;
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = img.width * scale;
  exportCanvas.height = img.height * scale;
  const exportCtx = exportCanvas.getContext('2d');

  const opts = {
    rotationAngle, fontSize, fontFamily, fontWeight: 'bold',
    fillColor, strokeColor, strokeWidth,
    shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    bgColor, bgPadding, letterSpacing, textOpacity, curveRadius, textOffset,
    text: slideCaptions.length ? slideCaptions[slideIndex] : (slideIndex === 0 ? caption1 : caption2),
  };

  const applyFilterToText = !!(filterTextToggle && filterTextToggle.checked);
  if (applyFilterToText) {
    exportCtx.filter = getFilterCSS(activeFilter);
    drawImageAndText(exportCtx, img, scale, opts);
    exportCtx.filter = 'none';
  } else {
    exportCtx.filter = getFilterCSS(activeFilter);
    drawImageOnly(exportCtx, img, scale, opts);
    exportCtx.filter = 'none';
    drawTextOnly(exportCtx, img, scale, opts);
  }

  const link = document.createElement('a');
  link.download = `slide_${slideIndex+1}@${scale}x.png`;
  link.href     = exportCanvas.toDataURL('image/png');
  link.click();
}

function currentDrawOpts() {
  return {
    rotationAngle, fontSize, fontFamily, fontWeight: 'bold',
    fillColor, strokeColor, strokeWidth,
    shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    bgColor, bgPadding, letterSpacing, textOpacity, curveRadius, textOffset,
    text: slideCaptions.length ? slideCaptions[slideIndex] : (slideIndex === 0 ? caption1 : caption2),
  };
}

/* ==============================
   UI wiring (safely)
============================== */
steps.forEach(s => s.addEventListener('click', () => {
  const tgt = parseInt(s.dataset.step, 10);
  if (tgt > currentStep + 1) return;
  if (tgt === 5 && slideCaptions.length === 0) return showStep(4);
  showStep(tgt);
}));

if (toStep2Btn) {
  toStep2Btn.addEventListener('click', () => {
    const v = (artistInput?.value || '').trim();
    if (!v) return alert('Enter artist name.');
    artist = v;
    showStep(2);
  });
}
if (backToStep1Btn) backToStep1Btn.addEventListener('click', () => showStep(1));

// Mega generate may not exist in your HTML; guard it.
if (megaGenerateBtn) {
  megaGenerateBtn.addEventListener('click', async () => {
    const v = (artistInput?.value || '').trim();
    if (!v) return alert('Enter artist first.');
    artist = v;
    showLoader();
    let result;
    const fetchPromise = fetch('/api/mega_generate', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:   JSON.stringify({ artist })
    }).then(r => r.json());
    const minWait = new Promise(res => setTimeout(res, 20000));
    const statusList = [
      "🤔 Thinking of the wildest captions...",
      "💡 Finding the boldest ideas...",
      "🪄 Inventing the unexpected...",
      "🤓 Studying your artist profile...",
      "🧠 Coming up with *provocative* text...",
      "🔥 Going full AI genius mode..."
    ];
    let phraseIdx = 0;
    const statusBox = document.querySelector('.loading-box');
    const phraseInterval = setInterval(() => {
      if (statusBox && statusList[phraseIdx % statusList.length]) {
        statusBox.innerHTML = `<div class="wii-orb"></div>${statusList[phraseIdx % statusList.length]}`;
        phraseIdx++;
      }
    }, 4000);
    try {
      result = await Promise.all([fetchPromise, minWait]).then(([r]) => r);
    } finally {
      clearInterval(phraseInterval);
      if (statusBox) statusBox.innerHTML = '<div class="wii-orb"></div>Generating slides…';
    }
    hideLoader();
    if (!result || result.error) return alert(result ? result.error : 'Mega-generate failed');

    runs = result.runs || [];
    slideImages.length = slideCaptions.length = 0;
    runs.forEach(run => {
      slideImages.push(run.image1, run.image2);
      slideCaptions.push(run.caption1, run.caption2);
    });
    imageCache.length = slideImages.length;
    slideImages.forEach((fn,i) => {
      const img = new Image();
      img.src = `/images/${fn}`;
      img.onload = () => { imageCache[i] = img; if (i === 0) drawCanvas(); };
    });
    slideIndex = 0; textOffset = { x:0, y:0 }; rotationAngle = 0;
    showStep(5);
  });
}

if (toStep3Btn) {
  toStep3Btn.addEventListener('click', () => {
    style = Array.from(styleRadios).find(r => r.checked)?.value || 'provocation';
    showStep(3);
  });
}
if (backToStep2Btn) backToStep2Btn.addEventListener('click', () => showStep(2));

function populateImageDropdowns() {
  fetch('/api/images')
    .then(r => r.json())
    .then(list => {
      [firstSelect, secondSelect].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '<option value="">-- select --</option>';
        list.forEach(fn => sel.append(new Option(fn, fn)));
      });
    })
    .catch(() => {});
}
function previewMedia(fn, container) {
  if (!container) return;
  container.innerHTML = '';
  if (!fn) return;
  const ext = fn.split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
    const video = document.createElement('video');
    video.src = `/images/${fn}`;
    video.controls = true;
    video.style.maxWidth = '160px';
    video.style.maxHeight = '160px';
    video.muted = true;
    video.autoplay = true;
    container.appendChild(video);
  } else {
    const img = new Image();
    img.src = `/images/${fn}`;
    img.onload = () => container.replaceChildren(img);
  }
}
if (firstSelect) firstSelect.addEventListener('change', () => previewMedia(firstSelect.value, preview1));
if (secondSelect) secondSelect.addEventListener('change', () => previewMedia(secondSelect.value, preview2));

if (uploadInput) {
  uploadInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (!/^image\/|^video\//.test(f.type)) {
      alert('Please upload only images or videos!');
      uploadInput.value = '';
      return;
    }
    const fd = new FormData(); fd.append('file', f);
    fetch('/upload-image', { method:'POST', body:fd })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          populateImageDropdowns();
          alert('Uploaded: ' + d.filename);
        } else {
          alert('Upload failed: ' + d.error);
        }
      })
      .catch(() => alert('Upload error'))
      .finally(() => uploadInput.value = '');
  });
}

if (toStep4Btn) {
  toStep4Btn.addEventListener('click', () => {
    if (!firstSelect?.value || !secondSelect?.value)
      return alert('Select two different images.');
    chosenImages = [ firstSelect.value, secondSelect.value ];
    showStep(4);
  });
}
if (backToStep3Btn) backToStep3Btn.addEventListener('click', () => showStep(3));

/* ==============================
   Generate (regular + snippet)
============================== */
let snippetMode = false;
const savedSnippet = localStorage.getItem('lyricSnippet');
if (savedSnippet) {
  caption1 = savedSnippet.trim();
  snippetMode = true;

  const lyricSecondMode = localStorage.getItem('lyricSecondMode') || 'manual';
  if (lyricSecondMode === 'auto') {
    caption2 = '';
  } else {
    const lyricSecond = localStorage.getItem('lyricSecond');
    caption2 = lyricSecond ? lyricSecond.trim() : '';
  }

  const lyricArtist = localStorage.getItem('lyricArtist');
  if (lyricArtist) {
    artist = lyricArtist;
    localStorage.removeItem('lyricArtist');
  }

  localStorage.removeItem('lyricSnippet');
  localStorage.removeItem('lyricSecond');
  localStorage.removeItem('lyricSecondMode');
  const step2 = document.getElementById('step-2');
  if (step2) step2.style.display = 'none';
  showStep(3);
}

if (generateBtn) {
  generateBtn.addEventListener('click', async () => {
    if (snippetMode) {
      let cap2 = caption2;
      const lyricSecondMode = localStorage.getItem('lyricSecondMode') || 'manual';

      if (lyricSecondMode === 'custom') {
        cap2 = await getSecondLine('custom', artist) || await getSecondLine('classic', artist);
      } else if (lyricSecondMode === 'auto' || !cap2) {
        cap2 = await getSecondLine('classic', artist);
      }

      slideCaptions.length = 0;
      slideCaptions.push(caption1, (cap2 || ''));
      slideImages.length = 0;
      slideImages.push(chosenImages[0], chosenImages[1]);
      imageCache.length = slideImages.length;

      slideImages.forEach((fn, i) => {
        const img = new Image();
        img.src = `/images/${fn}`;
        img.onload = () => { imageCache[i] = img; if (i === 0) drawCanvas(); };
      });

      slideIndex = 0; textOffset = { x: 0, y: 0 }; rotationAngle = 0;
      showStep(5);
      return;
    }

    // ---------- Regular corpus mode ----------
    try {
      const secondMode = readSecondMode(); // classic | custom (from radios)

      const r = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist,
          style,
          image1: chosenImages[0],
          image2: chosenImages[1],
          secondMode // pass through to backend
        })
      });

      const d = await r.json();
      if (d.error) return alert(d.error);

      caption1 = d.caption1 || '';

      // Ask backend for second line (handles uploaded custom file)
      caption2 = (await getSecondLine(secondMode, artist)) || d.caption2 || '';

      slideIndex = 0;
      textOffset = { x: 0, y: 0 };
      rotationAngle = 0;

      [0, 1].forEach(i => {
        const img = new Image();
        const fn = i === 0 ? chosenImages[0] : chosenImages[1];
        img.src = `/images/${fn}`;
        img.onload = () => { imageCache[i] = img; if (i === 0) drawCanvas(); };
      });

      slideCaptions.length = 0;
      slideCaptions.push(caption1, caption2);

      showStep(5);
    } catch (e) {
      console.error(e);
      alert('Generate failed');
    }
  });
}

/* ==============================
   Slide nav / transform / styling
============================== */
if (nextSlideBtn) nextSlideBtn.addEventListener('click', () => {
  slideIndex = (slideIndex + 1) % (slideCaptions.length || 2);
  textOffset  = { x:0, y:0 };
  drawCanvas();
});
if (prevSlideBtn) prevSlideBtn.addEventListener('click', () => {
  slideIndex = (slideIndex - 1 + (slideCaptions.length||2)) % (slideCaptions.length||2);
  textOffset  = { x:0, y:0 };
  drawCanvas();
});

// ===== Unified gestures: drag (1 finger), pinch-to-resize (2 fingers), optional twist-to-rotate =====

// rAF throttle
function rafThrottle(fn){
  let ticking = false, lastArgs, lastThis;
  return function(...args){
    lastArgs = args; lastThis = this;
    if (!ticking){
      ticking = true;
      requestAnimationFrame(()=>{ ticking = false; fn.apply(lastThis, lastArgs); });
    }
  };
}

// Canvas point helpers
function getCanvasPointFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  // convert to canvas CSS pixels (not image-space)
  const x = (clientX - rect.left) * (canvas.width  / rect.width);
  const y = (clientY - rect.top)  * (canvas.height / rect.height);
  return { x, y };
}
function pxToImage(dx, dy){
  const img = imageCache[slideIndex];
  const s = img ? getDisplayScale(img) : 1;
  return { x: dx / s, y: dy / s };
}

// Two-point geometry
function dist(a,b){ return Math.hypot(a.x - b.x, a.y - b.y); }
function angle(a,b){ return Math.atan2(b.y - a.y, b.x - a.x); }
function midpoint(a,b){ return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 }; }

// Config
const MIN_FONT = 16;
const MAX_FONT = 400;
const ENABLE_TWIST_ROTATION = false; // set false to disable rotation via twist

// Pointer state
const active = new Map(); // id -> {x,y}
let gesture = null;       // null | { mode: 'drag'|'pinch', ... }

// Build gesture snapshot
function snapshotForDrag(startPoint){
  return {
    mode: 'drag',
    startPoint, // canvas px
  };
}
function snapshotForPinch(p0, p1){
  return {
    mode: 'pinch',
    startP0: p0,
    startP1: p1,
    startMid: midpoint(p0, p1),
    startDist: dist(p0, p1),
    startAngle: angle(p0, p1),
    startFontSize: fontSize,
    startRotation: rotationAngle,
    startOffset: { x: textOffset.x, y: textOffset.y }
  };
}

// Update display
const drawNow = rafThrottle(() => drawCanvas());

// Pointer Events path (modern browsers + iOS 13+)
const usePointer = !!window.PointerEvent;

if (usePointer) {
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // capture so we keep receiving events
    canvas.setPointerCapture?.(e.pointerId);

    const p = getCanvasPointFromClient(e.clientX, e.clientY);
    active.set(e.pointerId, p);

    if (active.size === 1) {
      // start drag
      gesture = snapshotForDrag(p);
    } else if (active.size >= 2) {
      // get first two pointers for pinch
      const [p0, p1] = Array.from(active.values()).slice(0,2);
      gesture = snapshotForPinch(p0, p1);
    }
    e.preventDefault();
  }, { passive:false });

  canvas.addEventListener('pointermove', (e) => {
    if (!active.has(e.pointerId)) return;
    active.set(e.pointerId, getCanvasPointFromClient(e.clientX, e.clientY));
    if (!gesture) return;

    if (gesture.mode === 'drag' && active.size === 1) {
      const cur = active.get(e.pointerId);
      const dx = cur.x - gesture.startPoint.x;
      const dy = cur.y - gesture.startPoint.y;
      const d  = pxToImage(dx, dy);
      textOffset.x += d.x;
      textOffset.y += d.y;
      gesture.startPoint = cur; // continue from here
      drawNow();
    } else if (active.size >= 2) {
      // upgrade to/continue pinch
      const [cur0, cur1] = Array.from(active.values()).slice(0,2);
      if (gesture.mode !== 'pinch') {
        gesture = snapshotForPinch(cur0, cur1);
      }
      const curMid   = midpoint(cur0, cur1);
      const curDist  = dist(cur0, cur1);
      const curAngle = angle(cur0, cur1);

      // scale font by pinch ratio
      const scale = gesture.startDist > 0 ? (curDist / gesture.startDist) : 1;
      fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, gesture.startFontSize * scale));

      // rotate by twist
      if (ENABLE_TWIST_ROTATION) {
        rotationAngle = gesture.startRotation + (curAngle - gesture.startAngle);
      }

      // pan by midpoint delta (convert to image space)
      const dx = curMid.x - gesture.startMid.x;
      const dy = curMid.y - gesture.startMid.y;
      const d  = pxToImage(dx, dy);
      textOffset.x = gesture.startOffset.x + d.x;
      textOffset.y = gesture.startOffset.y + d.y;

      drawNow();
    }
    e.preventDefault();
  }, { passive:false });

  function endPointer(e){
    active.delete(e.pointerId);

    if (active.size === 0) {
      gesture = null;
    } else if (active.size === 1) {
      // drop to drag with the remaining pointer
      const remaining = Array.from(active.values())[0];
      gesture = snapshotForDrag(remaining);
    } else if (active.size >= 2) {
      // continue pinch with the first two remaining
      const [p0, p1] = Array.from(active.values()).slice(0,2);
      gesture = snapshotForPinch(p0, p1);
    }
    e.preventDefault();
  }

  canvas.addEventListener('pointerup', endPointer, { passive:false });
  canvas.addEventListener('pointercancel', endPointer, { passive:false });
  canvas.addEventListener('pointerleave', endPointer, { passive:false });

} else {
  // --- Touch Events fallback (very old iOS) + mouse desktop ---
  // Single finger drag
  let dragStart = null;

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      dragStart = getCanvasPointFromClient(t.clientX, t.clientY);
    } else if (e.touches.length >= 2) {
      const p0 = getCanvasPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
      const p1 = getCanvasPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
      gesture = snapshotForPinch(p0, p1);
    }
    e.preventDefault();
  }, { passive:false });

  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && dragStart) {
      const t = e.touches[0];
      const cur = getCanvasPointFromClient(t.clientX, t.clientY);
      const dx = cur.x - dragStart.x;
      const dy = cur.y - dragStart.y;
      const d  = pxToImage(dx, dy);
      textOffset.x += d.x;
      textOffset.y += d.y;
      dragStart = cur;
      drawNow();
    } else if (e.touches.length >= 2) {
      const p0 = getCanvasPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
      const p1 = getCanvasPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
      if (!gesture || gesture.mode !== 'pinch') {
        gesture = snapshotForPinch(p0, p1);
      }
      const curMid   = midpoint(p0, p1);
      const curDist  = dist(p0, p1);
      const curAngle = angle(p0, p1);

      const scale = gesture.startDist > 0 ? (curDist / gesture.startDist) : 1;
      fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, gesture.startFontSize * scale));

      if (ENABLE_TWIST_ROTATION) {
        rotationAngle = gesture.startRotation + (curAngle - gesture.startAngle);
      }

      const dx = curMid.x - gesture.startMid.x;
      const dy = curMid.y - gesture.startMid.y;
      const d  = pxToImage(dx, dy);
      textOffset.x = gesture.startOffset.x + d.x;
      textOffset.y = gesture.startOffset.y + d.y;

      drawNow();
      dragStart = null; // we're in pinch, not single drag
    }
    e.preventDefault();
  }, { passive:false });

  function endTouch(e){
    if (e.touches.length === 0) {
      dragStart = null;
      gesture = null;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      dragStart = getCanvasPointFromClient(t.clientX, t.clientY);
      gesture = snapshotForDrag(dragStart);
    } else if (e.touches.length >= 2) {
      const p0 = getCanvasPointFromClient(e.touches[0].clientX, e.touches[0].clientY);
      const p1 = getCanvasPointFromClient(e.touches[1].clientX, e.touches[1].clientY);
      gesture = snapshotForPinch(p0, p1);
    }
  }
  canvas.addEventListener('touchend', endTouch, { passive:false });
  canvas.addEventListener('touchcancel', endTouch, { passive:false });

  // Mouse (desktop) fallback
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragStart = getCanvasPointFromClient(e.clientX, e.clientY);
    e.preventDefault();
  });
  window.addEventListener('mousemove', rafThrottle((e) => {
    if (!dragStart) return;
    const cur = getCanvasPointFromClient(e.clientX, e.clientY);
    const dx = cur.x - dragStart.x;
    const dy = cur.y - dragStart.y;
    const d  = pxToImage(dx, dy);
    textOffset.x += d.x;
    textOffset.y += d.y;
    dragStart = cur;
    drawNow();
  }));
  window.addEventListener('mouseup', () => { dragStart = null; });
}

// — Artist of the Week config —
const AOTW_CONFIG = {
  img:  '/images/artist_of_week.jpg',  // your picture
  link: 'https://example.com/artist',   // where the box should lead
  title:'Artist of the Week'            // badge text (optional)
};

const aotwImg   = document.getElementById('aotw-img');
const aotwLink  = document.getElementById('aotw-link');
const aotwBadge = document.querySelector('#aotw .aotw-badge');

if (aotwImg && AOTW_CONFIG.img)   aotwImg.src = AOTW_CONFIG.img;
if (aotwLink && AOTW_CONFIG.link) aotwLink.href = AOTW_CONFIG.link;
if (aotwBadge && AOTW_CONFIG.title) aotwBadge.textContent = AOTW_CONFIG.title;

// If it overlaps something important, tweak z-index or move a bit on tiny screens:
window.addEventListener('resize', () => {
  // example: nudge down if viewport very short
  const card = document.getElementById('aotw');
  if (!card) return;
  card.style.top = (window.innerHeight < 520 ? '10px' : '18px');
});
const a = document.getElementById('aotw-link');
if (a) {
  [...a.childNodes].forEach(n => {
    if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) n.remove();
  });
}



// Optional: nudge buttons as a guaranteed fallback
['left','right','up','down'].forEach(dir => {
  const btn = document.getElementById(`nudge-${dir}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const step = 10; // image-space pixels
    if (dir === 'left')  textOffset.x -= step;
    if (dir === 'right') textOffset.x += step;
    if (dir === 'up')    textOffset.y -= step;
    if (dir === 'down')  textOffset.y += step;
    drawCanvas();
  });
});


if (rotateCWBtn)  rotateCWBtn.addEventListener('click', () => { rotationAngle += Math.PI/2; drawCanvas(); });
if (rotateCCWBtn) rotateCCWBtn.addEventListener('click', () => { rotationAngle -= Math.PI/2; drawCanvas(); });

if (zoomSlider) {
  zoomSlider.setAttribute('min', '-80');
  zoomSlider.setAttribute('max', '200');
  zoomSlider.setAttribute('value', '0');
  zoomSlider.addEventListener('input', () => {
    zoomOffset = +zoomSlider.value;
    fontSize   = baseFontSize + zoomOffset;
    drawCanvas();
  });
}

if (fontSelect)        fontSelect.addEventListener('change', () => { fontFamily     = fontSelect.value;       drawCanvas(); });
if (fillColorInput)    fillColorInput.addEventListener('input', () => { fillColor      = fillColorInput.value;   drawCanvas(); });
if (strokeColorInput)  strokeColorInput.addEventListener('input', () => { strokeColor    = strokeColorInput.value; drawCanvas(); });
if (strokeWidthInput) {
  strokeWidthInput.setAttribute('max', '50');
  strokeWidth = +strokeWidthInput.value;
  strokeWidthInput.addEventListener('input', () => {
    strokeWidth = +strokeWidthInput.value;
    drawCanvas();
  });
}
if (shadowColorInput)  shadowColorInput.addEventListener('input', () => { shadowColor    = shadowColorInput.value;   drawCanvas(); });
if (shadowBlurInput)   shadowBlurInput.addEventListener('input', () => { shadowBlur     = +shadowBlurInput.value;    drawCanvas(); });
if (shadowOffsetXInput)shadowOffsetXInput.addEventListener('input', () => { shadowOffsetX  = +shadowOffsetXInput.value; drawCanvas(); });
if (shadowOffsetYInput)shadowOffsetYInput.addEventListener('input', () => { shadowOffsetY  = +shadowOffsetYInput.value; drawCanvas(); });
if (bgColorInput)      bgColorInput.addEventListener('input', () => { bgColor        = bgColorInput.value;       drawCanvas(); });
if (bgPaddingInput)    bgPaddingInput.addEventListener('input', () => { bgPadding      = +bgPaddingInput.value;     drawCanvas(); });
if (letterSpacingInput)letterSpacingInput.addEventListener('input', () => { letterSpacing  = +letterSpacingInput.value; drawCanvas(); });
if (textOpacityInput)  textOpacityInput.addEventListener('input', () => { textOpacity    = +textOpacityInput.value;   drawCanvas(); });
if (curveRadiusInput) {
  curveRadiusInput.addEventListener('input', () => {
    const raw = +curveRadiusInput.value;
    const sign = raw >= 0 ? 1 : -1;
    const scaled = sign * Math.pow(Math.abs(raw), 1.5) / 5;
    if (scaled === 0) {
      curveRadius = 0;
    } else {
      const minRadius = 60;
      if (scaled > 0) curveRadius = Math.max(minRadius, scaled);
      else            curveRadius = Math.min(-minRadius, scaled);
    }
    drawCanvas();
  });
}
if (resetCurveBtn) resetCurveBtn.addEventListener('click', () => { if (curveRadiusInput) curveRadiusInput.value = 0; curveRadius = 0; drawCanvas(); });

if (saveSlideBtn) saveSlideBtn.addEventListener('click', () => exportHighRes(2));
// Only wire if you actually add a button with id="save-dropbox" in HTML
if (saveDropboxBtn) {
  saveDropboxBtn.addEventListener('click', () => {
    const img = imageCache[slideIndex];
    if (!img) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = img.width * 2;
    exportCanvas.height = img.height * 2;
    const exportCtx = exportCanvas.getContext('2d');
    drawImageAndText(exportCtx, img, 2, currentDrawOpts());
    const filename = `slide_${slideIndex+1}.png`;
    const dataUrl  = exportCanvas.toDataURL('image/png');
    fetch('/api/save_dropbox', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:   JSON.stringify({ filename, dataUrl })
    })
    .then(r => r.json())
    .then(j => j.error ? alert('Upload failed: '+j.error) : alert('Saved to Dropbox at '+j.path))
    .catch(e => { console.error(e); alert('Dropbox save error'); });
  });
}

if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    currentStep = 1;
    artist = '';
    style = 'provocation';
    caption1 = '';
    caption2 = '';
    chosenImages = ['', ''];
    runs = [];
    slideIndex = 0;
    savedSlides = [];
    slideImages.length = 0;
    slideCaptions.length = 0;
    imageCache.length = 0;
    textOffset = { x:0, y:0 };
    rotationAngle = 0;
    fontFamily = 'Inter';
    fontSize = baseFontSize;
    zoomOffset = 0;
    activeFilter = null;
    Object.keys(originalImages).forEach(k => delete originalImages[k]);
    if (artistInput) artistInput.value = '';
    if (firstSelect) firstSelect.value = '';
    if (secondSelect) secondSelect.value = '';
    if (preview1) preview1.innerHTML = '';
    if (preview2) preview2.innerHTML = '';
    if (zoomSlider) zoomSlider.value = 0;
    if (fillColorInput) fillColorInput.value = '#FFFFFF';
    if (strokeColorInput) strokeColorInput.value = '#000000';
    if (strokeWidthInput) strokeWidthInput.value = 6;
    resetBgFX();
    showStep(1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}
if (megaRestartBtn) {
  megaRestartBtn.addEventListener('click', () => {
    currentStep = 1;
    runs = [];
    slideImages.length = 0;
    slideCaptions.length = 0;
    imageCache.length = 0;
    textOffset = { x:0, y:0 };
    rotationAngle = 0;
    resetBgFX();
    showStep(1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}

['left','right','up','down'].forEach(dir => {
  const btn = document.getElementById(`nudge-${dir}`);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const step = 10; // image-space px; tweak if you like
    if (dir === 'left')  textOffset.x -= step;
    if (dir === 'right') textOffset.x += step;
    if (dir === 'up')    textOffset.y -= step;
    if (dir === 'down')  textOffset.y += step;
    drawCanvas();
  });
});


/* ==============================
   Init
============================== */
updateBgCubesAccumulating(1);
showStep(1);
populateImageDropdowns();
updateStepFX(1);

});
