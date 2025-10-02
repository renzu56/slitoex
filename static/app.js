document.addEventListener('DOMContentLoaded', () => {


  

const DAILY_TODOS = [
  "Create 3 slides",
  "Add images to Titofoto",
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

function renderDailyTodos() {
  const tasks = pickRandomTasks(3);
  const checked = loadChecked();
  const list = document.getElementById('todo-list');
  if (!list) return;
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
      updateTodoBoxColor(); // <-- Here!
    });
    li.appendChild(box);
    const label = document.createElement('label');
    label.htmlFor = 'todo'+i;
    label.textContent = task;
    li.appendChild(label);
    list.appendChild(li);
  });
  updateTodoBoxColor(); // <-- Here!
}




  renderDailyTodos();


  
  // --- STATE ---
  let currentStep = 1;
  const canvas2d = document.getElementById('edit-canvas');


// create the fx canvas
const fxCanvas = fx.canvas();
let fxTexture = null;

// insert it offscreen (we'll draw it back into the 2d canvas)
fxCanvas.style.display = 'none';
document.body.appendChild(fxCanvas);

  let artist = '';
  let style = 'provocation';
  let caption1 = '';
  let caption2 = '';
  let chosenImages = ['', ''];
  let runs = [];
  let slideIndex = 0;
  let savedSlides = [];

  // ---- right after your CLIENT-SIDE FILTER STATE ----
  let activeFilter = null;
  const originalImages = {};    // <-- store pre-4K versions here







  // --- Text State ---
  const baseFontSize = 80;
  let zoomOffset = 0;
  let fontSize = baseFontSize + zoomOffset;
  let fontFamily = 'Inter';
  let fillColor = '#FFFFFF';
  let strokeColor = '#000000'; // default to solid black, not alpha!
  let strokeWidth = 6;         // thicker by default
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
document.getElementById('filter-text-toggle').addEventListener('change', e => {

  drawCanvas();
});


    // --- CLIENT-SIDE FILTER STATE ---

// — simple convolution for sharpening —
function convolve(imageData, width, height, kernel) {
  const out = new Uint8ClampedArray(imageData.data);
  const side = Math.round(Math.sqrt(kernel.length));
  const half = Math.floor(side/2);

  for (let y=half; y<height-half; y++) {
    for (let x=half; x<width-half; x++) {
      let r=0,g=0,b=0,a=0;
      for (let ky=0; ky<side; ky++) {
        for (let kx=0; kx<side; kx++) {
          const w = kernel[ky*side + kx];
          const ix = x + kx - half;
          const iy = y + ky - half;
          const idx = (iy*width + ix)*4;
          r += imageData.data[idx+0] * w;
          g += imageData.data[idx+1] * w;
          b += imageData.data[idx+2] * w;
          a += imageData.data[idx+3] * w;
        }
      }
      const oidx = (y*width + x)*4;
      out[oidx+0] = r;
      out[oidx+1] = g;
      out[oidx+2] = b;
      out[oidx+3] = a;
    }
  }
  imageData.data.set(out);
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

async function applyEnhance4K() {
  const img = imageCache[slideIndex];
  if (!img) return;

  // Stash original for undo
  originalImages[slideIndex] = img;

  // 1. First, upscale with Canvas 2D API
  const scale = 2;
  const tmp = document.createElement('canvas');
  tmp.width = img.width * scale;
  tmp.height = img.height * scale;
  tmp.getContext('2d').drawImage(img, 0, 0, tmp.width, tmp.height);

  // 2. Now apply glfx.js sharpening
  fxTexture = fxCanvas.texture(tmp);

  fxCanvas.width = tmp.width;  // update canvas size!
  fxCanvas.height = tmp.height;
  fxCanvas.draw(fxTexture)
    .unsharpMask(20, 2) // radius, strength
    .update();

  // 3. Pull the result back into a JS Image
  const dataURL = fxCanvas.toDataURL();
  await new Promise(resolve => {
    const enhanced = new Image();
    enhanced.onload = () => {
      imageCache[slideIndex] = enhanced;
      drawCanvas();
      resolve();
    };
    enhanced.src = dataURL;


    
  });
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
    body: JSON.stringify({
      gallery_id: galleryId,
      filename,
      dataUrl
    })
  }).then(r => r.json())
    .then(j => {
      if (j.success) alert('Added to phone gallery!');
      else alert('Error: '+(j.error||'Failed'));
    });
}
function openPhoneGallery() {
  // Detect local IP for QR if you want, or just use window.location
  const url = `${window.location.origin}/gallery/${galleryId}/`;
  window.open(url, '_blank');
}


// — upscale + sharpen function —
// Make sure this lives inside your DOMContentLoaded callback,
// and that applyEnhance4K(), getFilterCSS(), drawCanvas(), originalImages, imageCache, activeFilter are all in scope.

document.querySelectorAll('#filter-buttons button[data-filter]')
  .forEach(btn => {
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
        document.querySelectorAll('#filter-buttons button')
          .forEach(b => b.classList.remove('active'));
        activeFilter = filter;
        btn.classList.add('active');
      }
      
      drawCanvas();
      
    });
  });

document.getElementById('undo-filter').addEventListener('click', () => {
  if (originalImages[slideIndex]) {
    imageCache[slideIndex] = originalImages[slideIndex];
    delete originalImages[slideIndex];
  }
  activeFilter = null;
  document.querySelectorAll('#filter-buttons button')
    .forEach(b => b.classList.remove('active'));
  drawCanvas();
});



  // Map filter names to CSS-filter strings
// ← already inside your DOMContentLoaded
function getFilterCSS(name) {
  switch (name) {
    case 'clarity':
      return 'saturate(1.6) contrast(1.3) brightness(1.05)';
    case 'bw':
      return 'grayscale(1) contrast(1.2) brightness(1.05)';
    case 'epic':
      return 'contrast(1.5) brightness(0.8) sepia(0.2) saturate(1.3)';
    case 'lofi':
      return 'contrast(0.9) saturate(1.2) brightness(0.9)';
    case 'vivid':
      return 'saturate(1.6) contrast(1.2)';
    /* ——— new presets ——— */
    case 'cinematic':
      // deep contrast, slight warm sepia
      return 'contrast(1.4) brightness(0.9) sepia(0.1) saturate(1.2)';
    case 'warmGlow':
      // gentle warmth & glow
      return 'brightness(1.1) sepia(0.2) saturate(1.2)';
    case 'moody':
      // dark, desaturated, punchy shadows
      return 'contrast(1.3) brightness(0.8) saturate(0.8)';
    case 'dreamy':
      // soft blur + light boost
      return 'blur(1px) brightness(1.1) saturate(1.3)';
    case 'matte':
      // low contrast, subtle filmic matte
      return 'contrast(0.9) brightness(1.0) sepia(0.05)';
    case 'hdr':
      // extra pop in highs & mids
      return 'contrast(1.5) brightness(1.2) saturate(1.5)';
    default:
      return 'none';
  }
}




  const imageCache = [];
  const slideImages = [];
  const slideCaptions = [];

  const fontUploadInput = document.getElementById('font-upload');
const fontUploadBtn = document.getElementById('font-upload-btn');

// Font upload button opens file picker
fontUploadBtn.addEventListener('click', () => fontUploadInput.click());

// Drag-and-drop font upload
document.addEventListener('dragover', e => {
  if (e.dataTransfer && Array.from(e.dataTransfer.items).some(item => item.kind === 'file')) {
    e.preventDefault();
    document.body.style.background = '#f5f5f5'; // Highlight drop area
  }
});
document.addEventListener('dragleave', e => {
  document.body.style.background = '';
});
document.addEventListener('drop', e => {
  document.body.style.background = '';
  e.preventDefault();
  const file = Array.from(e.dataTransfer.files).find(f => /\.(ttf|otf)$/i.test(f.name));
  if (file) handleFontUpload(file);
});

// Handle font file upload
fontUploadInput.addEventListener('change', e => {
  if (e.target.files[0]) handleFontUpload(e.target.files[0]);
});

function handleFontUpload(file) {
  const reader = new FileReader();
  reader.onload = function(evt) {
    const fontName = file.name.replace(/\.(ttf|otf)$/i, '');
    // Add @font-face
    const style = document.createElement('style');
    style.innerText = `
      @font-face {
        font-family: '${fontName}';
        src: url('${evt.target.result}');
      }
    `;
    document.head.appendChild(style);
    // Add to font families and dropdown if not present
    if (!FONT_FAMILIES.includes(fontName)) {
      FONT_FAMILIES.push(fontName);
      const opt = document.createElement('option');
      opt.value = fontName;
      opt.textContent = fontName + " (custom)";
      fontSelect.appendChild(opt);
    }
    // Select the new font automatically
    fontSelect.value = fontName;
    fontFamily = fontName;
    drawCanvas();
    alert('Font "' + fontName + '" added!');
  };
  reader.readAsDataURL(file);
}


  // Add more fonts for memes and style!
  const FONT_FAMILIES = [
    "Inter",
    "Impact",
    "Bangers",
    "Anton",
    "Oswald",
    "Comic Neue",
    "Archivo Black"
  ];


  // --- UI ---
  const steps = document.querySelectorAll('.steps-indicator .step');
  const sections = document.querySelectorAll('.step-section');
  const artistInput = document.getElementById('artist-input');
  const toStep2Btn = document.getElementById('to-step-2');
  const megaGenerateBtn = document.getElementById('mega-generate-btn');
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
  const fontSelect = document.getElementById('font-select');
  const fillColorInput = document.getElementById('fill-color');
  const strokeColorInput = document.getElementById('stroke-color');
  const strokeWidthInput = document.getElementById('stroke-width');
  strokeWidthInput.setAttribute('max', '50');
  strokeWidth = +strokeWidthInput.value;
  const shadowColorInput = document.getElementById('shadow-color');
  const shadowBlurInput = document.getElementById('shadow-blur');
  const shadowOffsetXInput = document.getElementById('shadow-offset-x');
  const shadowOffsetYInput = document.getElementById('shadow-offset-y');
  const bgColorInput = document.getElementById('bg-color');
  const bgPaddingInput = document.getElementById('bg-padding');
  const letterSpacingInput = document.getElementById('letter-spacing');
  const textOpacityInput = document.getElementById('text-opacity');
  const curveRadiusInput = document.getElementById('curve-radius');
  const resetCurveBtn = document.getElementById('reset-curve-btn');
  const saveSlideBtn = document.getElementById('save-slide');
  const saveDropboxBtn = document.getElementById('save-dropbox');
  const restartBtn = document.getElementById('restart-btn');
  const megaRestartBtn = document.getElementById('mega-restart-btn');
let snippetMode = false; 
  // --- BG FX state ---
  let currentBgStep = 1;
  let currentBgFX = { cubes: [], bokeh: [] };


  

const saved = localStorage.getItem('lyricSnippet');
if (saved) {
  caption1 = saved.trim();
  snippetMode = true;

  // Get second phrase mode and text (manual, fetched, auto)
  const lyricSecondMode = localStorage.getItem('lyricSecondMode') || 'manual';
  let cap2 = '';
  if (lyricSecondMode === 'auto') {
    caption2 = ''; // Will be filled at generate time using artist and template
  } else {
    const lyricSecond = localStorage.getItem('lyricSecond');
    caption2 = lyricSecond ? lyricSecond.trim() : '';
  }

  // Pick up artist (if any)
  const lyricArtist = localStorage.getItem('lyricArtist');
  if (lyricArtist) {
    artist = lyricArtist;
    localStorage.removeItem('lyricArtist');
  }

  // Clean up after ourselves
  localStorage.removeItem('lyricSnippet');
  localStorage.removeItem('lyricSecond');
  localStorage.removeItem('lyricSecondMode');
  // Optionally hide step 2 (style) if you want:
  const step2 = document.getElementById('step-2');
  if (step2) step2.style.display = 'none';
  showStep(3);   // skip to image selection
}



  // --- BG Cubes: unchanged ---
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
      // User went back or restarted: clear all
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

  // --- Step FX ---
  function updateStepFX(step) {
    steps.forEach((s, i) => {
      let aura = s.querySelector('.aura');
      if (!aura) {
        aura = document.createElement('div');
        aura.className = 'aura';
        s.insertBefore(aura, s.querySelector('small'));
      }
      const cubes = s.querySelector('.floating-cubes');
      if (cubes) cubes.remove();
      aura.style.opacity = '0';
      aura.classList.remove('green');
      aura.classList.remove('show');
      if (i < step) {
        aura.classList.add('show');
        aura.style.opacity = '1';
        if (i === 4) aura.classList.add('green');
      }
    });
  }

  // --- Show Step ---
  function showStep(step) {
    const oldSection = document.querySelector('.step-section.active');
    const newSection = document.getElementById('step-' + step);

    if (oldSection === newSection) return;

    if (oldSection) {
      oldSection.classList.remove('active');
      oldSection.classList.add('fading-out');
    }

    updateBgCubesAccumulating(step);

    newSection.classList.add('active');
    newSection.classList.remove('fading-out');

    setTimeout(() => {
      if (oldSection) oldSection.classList.remove('fading-out');
    }, 1200);

    // Progress bar & step bubbles
    const bar = document.getElementById('progress-bar-fill');
    const bubbles = document.querySelectorAll('.steps-indicator .step');
    let pct = (step - 1) / (bubbles.length - 1);
    if (step === 2) pct = 0.30;
    bar.style.width = (pct * 100) + "%";
    bubbles.forEach((s, i) => {
      s.classList.toggle('completed', i < step - 1);
      s.classList.toggle('active', i === step - 1);
    });
    updateStepFX(step);

    currentStep = step;
    // Show/hide mini-preview window
const miniWindow = document.getElementById('mini-preview-window');
if (miniWindow) {
  miniWindow.style.display = (step === 5) ? 'flex' : 'none';
}

  }

function showLoader() {
  document.getElementById('mega-overlay').style.display = 'flex';
}
function hideLoader() {
  document.getElementById('mega-overlay').style.display = 'none';
}

async function refreshStylePicker() {
  const res = await fetch('/api/corpora');
  const styles = await res.json();
  const group = document.getElementById('style-radio-group');
  if (!group) return;

  // Find existing values (avoid duplicates)
  const existing = Array.from(group.querySelectorAll('input[type="radio"]'))
    .map(r => r.value);

  styles.forEach(style => {
    if (!existing.includes(style)) {
      const label = document.createElement('label');
      label.style.marginRight = '18px';
      label.innerHTML = `
        <input type="radio" name="style" value="${style}" /> ${style.charAt(0).toUpperCase() + style.slice(1)}
      `;
      group.appendChild(label);
    }
  });
}
window.addEventListener('DOMContentLoaded', refreshStylePicker);


window.addEventListener('DOMContentLoaded', refreshStylePicker);


  // --- DRAWING LOGIC ---
  function drawImageAndText(ctx, img, scale, opts) {
    opts = opts || {};
    ctx.save();
    ctx.clearRect(0, 0, img.width * scale, img.height * scale);

    // Draw the image centered
    ctx.translate(img.width * scale / 2, img.height * scale / 2);
    ctx.rotate(opts.rotationAngle || 0);
    ctx.drawImage(
      img,
      -img.width * scale / 2,
      -img.height * scale / 2,
      img.width * scale,
      img.height * scale
    );
    ctx.rotate(-(opts.rotationAngle || 0));
    ctx.translate(-img.width * scale / 2, -img.height * scale / 2);

    // Font settings
    const fontWeight = opts.fontWeight || 'bold';
    const fontSizePx = (opts.fontSize || 80) * scale;
    const fontFamily = opts.fontFamily || 'Inter';
    ctx.font = `${fontWeight} ${fontSizePx}px "${fontFamily}", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.globalAlpha = opts.textOpacity ?? 1.0;
    // Super-strong outline
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

    // Draw background box (for straight text)
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
      // Straight text (with optional letter spacing)
      if ((opts.letterSpacing || 0) > 0) {
        ctx.textAlign = 'left';
        let x = cx - textW / 2;
        for (let ch of text) {
          // Draw stronger outline: stroke 3 times for each letter
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
      // ------ CURVED TEXT (Picsart-style arc, each letter upright!) ------
      const r = opts.curveRadius * scale;
      if (!r || !text) { ctx.restore(); ctx.restore(); return; }

      // Get width for each char (inc spacing) to calculate arc length
      const widths = [];
      let totalArcLen = 0;
      for (let i = 0; i < text.length; ++i) {
        let w = ctx.measureText(text[i]).width;
        if (i < text.length - 1) w += opts.letterSpacing || 0;
        widths.push(w);
        totalArcLen += w;
      }
      const totalAngle = totalArcLen / r; // in radians

      let ang = -totalAngle / 2;

      for (let i = 0; i < text.length; ++i) {
        const ch = text[i];
        const w = widths[i];
        const a = w / r;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang + a/2);
        ctx.textAlign = 'center';
        // Draw stroke 3 times for stronger outline
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
  // Draw only the image, with optional rotation and scaling
function drawImageOnly(ctx, img, scale, opts) {
  opts = opts || {};
  ctx.save();
  ctx.clearRect(0, 0, img.width * scale, img.height * scale);

  ctx.translate(img.width * scale / 2, img.height * scale / 2);
  ctx.rotate(opts.rotationAngle || 0);
  ctx.drawImage(
    img,
    -img.width * scale / 2,
    -img.height * scale / 2,
    img.width * scale,
    img.height * scale
  );
  ctx.rotate(-(opts.rotationAngle || 0));
  ctx.translate(-img.width * scale / 2, -img.height * scale / 2);

  ctx.restore();
}


// Draw only the text, on top of the image
function drawTextOnly(ctx, img, scale, opts) {
  opts = opts || {};
  ctx.save();

  // Font and style settings
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

  // Draw background box (for straight text)
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
    // Straight text (with optional letter spacing)
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
    // Curved text (same as your code)
    const r = opts.curveRadius * scale;
    if (!r || !text) { ctx.restore(); ctx.restore(); return; }

    // Get width for each char (inc spacing) to calculate arc length
    const widths = [];
    let totalArcLen = 0;
    for (let i = 0; i < text.length; ++i) {
      let w = ctx.measureText(text[i]).width;
      if (i < text.length - 1) w += opts.letterSpacing || 0;
      widths.push(w);
      totalArcLen += w;
    }
    const totalAngle = totalArcLen / r; // in radians

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
    rotationAngle,
    fontSize,
    fontFamily,
    fontWeight: 'bold',
    fillColor,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    bgColor,
    bgPadding,
    letterSpacing,
    textOpacity,
    curveRadius,
    textOffset,
    text: slideCaptions.length
      ? slideCaptions[slideIndex]
      : (slideIndex === 0 ? caption1 : caption2),
  };

  const applyFilterToText = document.getElementById('filter-text-toggle')?.checked;

  if (applyFilterToText) {
    ctx.filter = getFilterCSS(activeFilter);
    // Draw both together, filter applies to both
    drawImageAndText(ctx, img, scale, opts);
    ctx.filter = 'none';
  } else {
    // Draw image only (with filter)
    ctx.filter = getFilterCSS(activeFilter);
    drawImageOnly(ctx, img, scale, opts);
    ctx.filter = 'none';
    // Draw text only (no filter)
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
  // Compute scale to fit image in preview
  let scale = Math.min(mini.width / img.width, mini.height / img.height);

  // Copy the options used for main drawing (but scale font size etc)
  const opts = {
    rotationAngle,
    fontSize: fontSize * scale,      // Scale font size down for preview
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
    text: slideCaptions.length
      ? slideCaptions[slideIndex]
      : (slideIndex === 0 ? caption1 : caption2),
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
    rotationAngle,
    fontSize,
    fontFamily,
    fontWeight: 'bold',
    fillColor,
    strokeColor,
    strokeWidth,
    shadowColor,
    shadowBlur,
    shadowOffsetX,
    shadowOffsetY,
    bgColor,
    bgPadding,
    letterSpacing,
    textOpacity,
    curveRadius,
    textOffset,
    text: slideCaptions.length
      ? slideCaptions[slideIndex]
      : (slideIndex === 0 ? caption1 : caption2),
  };

  const applyFilterToText = document.getElementById('filter-text-toggle')?.checked;
  if (applyFilterToText) {
    exportCtx.filter = getFilterCSS(activeFilter);
    drawImageAndText(exportCtx, img, scale, opts);
    exportCtx.filter = 'none';
  } else {
    // Filter only the image
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

  // ─── CLIENT-SIDE FILTER BUTTONS & UNDO ────────────────────────
  



document.getElementById('undo-filter')
  .addEventListener('click', () => {
    if (originalImages[slideIndex]) {
      imageCache[slideIndex] = originalImages[slideIndex];
      delete originalImages[slideIndex];
    }
    activeFilter = null;
    document.querySelectorAll('#filter-buttons button')
      .forEach(b => b.classList.remove('active'));
    drawCanvas();
  });



  // ───────────────────────────────────────────────────────────────


  // -- Event Wiring: unchanged (your logic here) --
  // ... (No change needed in your event wiring except for below)

  // --- Font dropdown: populate with all fonts (if you want to be robust to future additions) ---
  if (fontSelect && fontSelect.options.length < FONT_FAMILIES.length) {
    fontSelect.innerHTML = '';
    FONT_FAMILIES.forEach(font => {
      const o = document.createElement('option');
      o.value = font;
      o.textContent = font;
      fontSelect.appendChild(o);
    });
    fontSelect.value = fontFamily;
  }

  // --- Listen for font change (already present in your code) ---
  fontSelect.addEventListener('change', () => {
    fontFamily = fontSelect.value;
    drawCanvas();
  });
  // ─── Event Wiring ─────────────────────────────
  steps.forEach(s => s.addEventListener('click', () => {
    const tgt = parseInt(s.dataset.step, 10);
    if (tgt > currentStep + 1) return;
    if (tgt === 5 && slideCaptions.length === 0) return showStep(4);
    showStep(tgt);
  }));

  toStep2Btn.addEventListener('click', () => {
    const v = artistInput.value.trim();
    if (!v) return alert('Enter artist name.');
    artist = v; showStep(2);
  });
  backToStep1Btn.addEventListener('click', () => showStep(1));

  megaGenerateBtn.addEventListener('click', async () => {
    const v = artistInput.value.trim();
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
    runs.length = slideImages.length = slideCaptions.length = 0;
    runs = result.runs;
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



  toStep3Btn.addEventListener('click', () => {
    style = Array.from(styleRadios).find(r => r.checked).value;
    showStep(3);
  });
  backToStep2Btn.addEventListener('click', () => showStep(2));

  function populateImageDropdowns() {
    fetch('/api/images')
      .then(r => r.json())
      .then(list => {
        [firstSelect, secondSelect].forEach(sel => {
          sel.innerHTML = '<option value="">-- select --</option>';
          list.forEach(fn => sel.append(new Option(fn, fn)));
        });
      });
  }
function previewMedia(fn, container) {
  container.innerHTML = '';
  if (!fn) return;
  const ext = fn.split('.').pop().toLowerCase();
  if (['mp4', 'webm', 'mov', 'ogg'].includes(ext)) {
    const video = document.createElement('video');
    video.src = `/images/${fn}`;   // or `/uploads/${fn}` depending on your server
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

firstSelect.addEventListener('change', () => previewMedia(firstSelect.value, preview1));
secondSelect.addEventListener('change', () => previewMedia(secondSelect.value, preview2));

 uploadInput.addEventListener('change', e => {
  const f = e.target.files[0]; 
  if (!f) return;

  // Check type - accept only images or videos
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


  toStep4Btn.addEventListener('click', () => {
    if (!firstSelect.value || !secondSelect.value)
      return alert('Select two different images.');
    chosenImages = [ firstSelect.value, secondSelect.value ];
    showStep(4);
  });
  backToStep3Btn.addEventListener('click', () => showStep(3));

  generateBtn.addEventListener('click', () => {
 if (snippetMode) {
   let cap2 = caption2;
  const lyricSecondMode = localStorage.getItem('lyricSecondMode') || 'manual';
  if (lyricSecondMode === 'auto' || !cap2) {
    const SECOND_TEMPLATES = [
      "But {artist} just flipped the script",
      "Enter {artist}, the game-changer",
      "Now watch {artist} light up every beat",
      "Don’t miss {artist} breaking the mold",
      "Here comes {artist} with the antidote",
      "No one expected {artist} to change the game",
      "That’s when {artist} stepped in",
      "Suddenly, {artist} rewrites the rules",
      "It only took {artist} to spark a revolution",
      "{artist} doesn’t follow trends — but creates them",
      "{artist} brought the storm the scene needed",
      "Now the spotlight belongs to {artist}",
      "Then everything changed — thanks to {artist}",
      "{artist} didn’t wait for a seat at the table",
      "Brace yourself — {artist} just arrived",
      "Here’s where {artist} redefines the sound",
      "Now {artist} is all anyone talks about",
      "They didn’t see {artist} coming",
      "Time for {artist} to take the mic",
      "The wait is over — {artist} is here",
      "From silence to roar — that’s {artist}",
      "{artist} didn’t knock, they kicked the door in",
      "See {artist}, the artist that is unstoppable",
      "{artist} made the scene impossible to ignore",
      "Get ready — {artist} is rewriting everything"
    ];
       const template = SECOND_TEMPLATES[Math.floor(Math.random() * SECOND_TEMPLATES.length)];
    cap2 = template.replace(/\{artist\}/g, artist || '').trim();
  }
  slideCaptions.length = 0;
  slideCaptions.push(caption1, cap2);
  slideImages.length = 0;
  slideImages.push(chosenImages[0], chosenImages[1]);
  imageCache.length = slideImages.length;
  slideImages.forEach((fn, i) => {
    const img = new Image();
    img.src = `/images/${fn}`;
    img.onload = () => {
      imageCache[i] = img;
      if (i === 0) drawCanvas();
    };
  });
  slideIndex   = 0;
  textOffset   = { x: 0, y: 0 };
  rotationAngle = 0;
  showStep(5);
  return;
}

  // ---------- Regular corpus mode (original behavior) ----------
  fetch('/api/generate', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:   JSON.stringify({
      artist, style,
      image1: chosenImages[0],
      image2: chosenImages[1]
    })
  })
  .then(r => r.json())
  .then(d => {
    if (d.error) return alert(d.error);
    caption1 = d.caption1; 
    caption2 = d.caption2;
    slideIndex = 0; 
    textOffset = { x:0, y:0 }; 
    rotationAngle = 0;
    [0,1].forEach(i => {
      const img = new Image();
      img.src = `/images/${chosenImages[i]}`;
      img.onload = () => {
        imageCache[i] = img;
        if (i === 0) {
          drawCanvas();
        }
      };
    });
    showStep(5);
  })
  .catch(e => { 
    console.error(e); 
    alert('Generate failed'); 
  });
});


  nextSlideBtn.addEventListener('click', () => {
    slideIndex = (slideIndex + 1) % (slideCaptions.length || 2);
    textOffset  = { x:0, y:0 };
    drawCanvas();
  });
  prevSlideBtn.addEventListener('click', () => {
    slideIndex = (slideIndex - 1 + (slideCaptions.length||2)) % (slideCaptions.length||2);
    textOffset  = { x:0, y:0 };
    drawCanvas();
  });

  canvas.addEventListener('mousedown', e => { dragStart = { x: e.offsetX, y: e.offsetY }; });
  canvas.addEventListener('mousemove', e => {
    if (!dragStart) return;
    textOffset.x += (e.offsetX - dragStart.x) / getDisplayScale(imageCache[slideIndex]);
    textOffset.y += (e.offsetY - dragStart.y) / getDisplayScale(imageCache[slideIndex]);
    dragStart = { x: e.offsetX, y: e.offsetY };
    drawCanvas();
  });
  window.addEventListener('mouseup', () => dragStart = null);

  rotateCWBtn .addEventListener('click', () => { rotationAngle += Math.PI/2; drawCanvas(); });
  rotateCCWBtn.addEventListener('click', () => { rotationAngle -= Math.PI/2; drawCanvas(); });

  zoomSlider.setAttribute('min', '-80');
  zoomSlider.setAttribute('max', '200');
  zoomSlider.setAttribute('value', '0');
  zoomSlider.addEventListener('input', () => {
    zoomOffset = +zoomSlider.value;
    fontSize   = baseFontSize + zoomOffset;
    drawCanvas();
  });

  fontSelect.addEventListener('change',       () => { fontFamily     = fontSelect.value;       drawCanvas(); });
  fillColorInput.addEventListener('input',    () => { fillColor      = fillColorInput.value;   drawCanvas(); });
  strokeColorInput.addEventListener('input',  () => { strokeColor    = strokeColorInput.value; drawCanvas(); });
strokeWidthInput.addEventListener('input', () => {
  strokeWidth = +strokeWidthInput.value;
  drawCanvas();
});

  shadowColorInput.addEventListener('input',    () => { shadowColor    = shadowColorInput.value;   drawCanvas(); });
  shadowBlurInput.addEventListener('input',     () => { shadowBlur     = +shadowBlurInput.value;    drawCanvas(); });
  shadowOffsetXInput.addEventListener('input', () => { shadowOffsetX  = +shadowOffsetXInput.value; drawCanvas(); });
  shadowOffsetYInput.addEventListener('input', () => { shadowOffsetY  = +shadowOffsetYInput.value; drawCanvas(); });
  bgColorInput.addEventListener('input',        () => { bgColor        = bgColorInput.value;       drawCanvas(); });
  bgPaddingInput.addEventListener('input',      () => { bgPadding      = +bgPaddingInput.value;     drawCanvas(); });
  letterSpacingInput.addEventListener('input',  () => { letterSpacing  = +letterSpacingInput.value; drawCanvas(); });
  textOpacityInput.addEventListener('input',    () => { textOpacity    = +textOpacityInput.value;   drawCanvas(); });
curveRadiusInput.addEventListener('input', () => {
  // Instead of linear, use quadratic scaling for better sensitivity
  const raw = +curveRadiusInput.value;
  const sign = raw >= 0 ? 1 : -1;
  // This makes the middle less sensitive, ends more strong
  const scaled = sign * Math.pow(Math.abs(raw), 1.5) / 5; // Tune divisor
  // Clamp min/max as before
  if (scaled === 0) {
    curveRadius = 0;
  } else {
    const minRadius = 60;
    if (scaled > 0) curveRadius = Math.max(minRadius, scaled);
    else            curveRadius = Math.min(-minRadius, scaled);
  }
  drawCanvas();
});
function currentDrawOpts() {
  return {
    rotationAngle, fontSize, fontFamily, fontWeight: 'bold',
    fillColor, strokeColor, strokeWidth,
    shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY,
    bgColor, bgPadding, letterSpacing, textOpacity, curveRadius, textOffset,
    text: slideCaptions.length
      ? slideCaptions[slideIndex]
      : (slideIndex === 0 ? caption1 : caption2),
  };
}

function saveCurrentSlideToGallery() {
  const img = imageCache[slideIndex];
  if (!img) return alert('No slide to add!');
  const c  = document.createElement('canvas');
  c.width  = img.width;
  c.height = img.height;
  const cx = c.getContext('2d');
  drawImageAndText(cx, img, 1, currentDrawOpts());
  savedSlides.push({
    dataUrl: c.toDataURL('image/png'),
    filename: `slide_${slideIndex+1}.png`
  });
  document.getElementById('session-gallery').style.display = 'block';
  const thumb = document.createElement('img');
  thumb.src   = savedSlides.at(-1).dataUrl;
  thumb.style = 'height:80px;margin:4px;cursor:pointer;border-radius:6px;';
  thumb.addEventListener('click', openShareGallery);
  document.getElementById('gallery-thumbs').appendChild(thumb);
}

function openShareGallery() {
  if (!savedSlides.length) return alert('Nothing saved yet!');
  const html = `
    <html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        body { font-family:sans-serif; padding:1em }
        img  { width:100%; max-width:400px; margin:1em 0; border-radius:8px }
      </style>
    </head><body>
      <h1>Tap & Hold to Save</h1>
      ${savedSlides.map(s => `
        <a href="${s.dataUrl}" download="${s.filename}">
          <img src="${s.dataUrl}" alt="${s.filename}">
        </a>
      `).join('')}
    </body></html>
  `;
  const w = window.open();
  w.document.write(html);
  w.document.close();
}

  resetCurveBtn.addEventListener('click',       () => { curveRadiusInput.value = 0; curveRadius = 0; drawCanvas(); });

  saveSlideBtn.addEventListener('click', () => exportHighRes(2));
  saveDropboxBtn.addEventListener('click', () => {
    const img = imageCache[slideIndex];
    if (!img) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = img.width * 2;
    exportCanvas.height = img.height * 2;
    const exportCtx = exportCanvas.getContext('2d');
    drawImageAndText(exportCtx, img, 2, {
      rotationAngle,
      fontSize,
      fontFamily,
      fontWeight: 'bold',
      fillColor,
      strokeColor,
      strokeWidth,
      shadowColor,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      bgColor,
      bgPadding,
      letterSpacing,
      textOpacity,
      curveRadius,
      textOffset,
      text: slideCaptions.length
        ? slideCaptions[slideIndex]
        : (slideIndex === 0 ? caption1 : caption2),
    });
    const filename = `slide_${slideIndex+1}.png`;
    const dataUrl  = exportCanvas.toDataURL('image/png');
    fetch('/api/save_dropbox', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:   JSON.stringify({ filename, dataUrl })
    })
    .then(r => r.json())
    .then(j => j.error
      ? alert('Upload failed: '+j.error)
      : alert('Saved to Dropbox at '+j.path)
    )
    .catch(e => { console.error(e); alert('Dropbox save error'); });
  });
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
  artistInput.value = '';
  firstSelect.value = '';
  secondSelect.value = '';
  preview1.innerHTML = '';
  preview2.innerHTML = '';
  zoomSlider.value = 0;
  fillColorInput.value = '#FFFFFF';
  strokeColorInput.value = '#000000';
  strokeWidthInput.value = 6;
  resetBgFX();
  showStep(1);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});
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


function openShareGallery() {
  if (!savedSlides.length) return alert('Nothing saved yet!');
  // 1. Generate a unique session ID
  const sessionId = 'gallery-' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem(sessionId, JSON.stringify(savedSlides));
  // 2. Compose a gallery URL with the session ID
  const galleryUrl = `${window.location.origin}${window.location.pathname}#${sessionId}`;
  // 3. Open new window and inject code to load images from localStorage by hash
  const html = `
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family:sans-serif; padding:1em; background:#fff; }
    img  { width:100%; max-width:400px; margin:1em 0; border-radius:8px }
    #qrcode { margin:1em auto; display:block; }
  </style>
</head>
<body>
  <h1>Scan QR on phone to open</h1>
  <canvas id="qrcode" width="170" height="170"></canvas>
  <div id="images"></div>
  <script>
    function drawQR(text) {
      // Use a mini pure-JS QR lib (no external requests)
      const qr = new QRious({ element: document.getElementById('qrcode'), value: text, size: 170 });
    }
    function showImages() {
      const hash = location.hash.replace('#','');
      const slides = JSON.parse(localStorage.getItem(hash)||'[]');
      const div = document.getElementById('images');
      div.innerHTML = '';
      slides.forEach(s => {
        const a = document.createElement('a');
        a.href = s.dataUrl;
        a.download = s.filename;
        const img = document.createElement('img');
        img.src = s.dataUrl;
        img.alt = s.filename;
        a.appendChild(img);
        div.appendChild(a);
      });
    }
    // Inject QRious (tiny, MIT, one-file QR code lib)
    var scr=document.createElement('script');
    scr.src='https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js';
    scr.onload=function(){
      drawQR(location.href);
      showImages();
    };
    document.head.appendChild(scr);
  </script>
</body>
</html>`;
  // 4. Open the window and write HTML
  const w = window.open();
  w.document.write(html);
  w.document.close();
}


  // wire the buttons at top level
  
  // ─── Init FX and everything else ───────────────
  // This must match your HTML: <div id="fx-bg-cubes"></div> before .container!
  updateBgCubesAccumulating(1);
  showStep(1);
  populateImageDropdowns();
  updateStepFX(1);

    // ─── SESSION GALLERY LOGIC ────────────────────────────────


})