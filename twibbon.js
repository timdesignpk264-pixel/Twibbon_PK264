// ===== Helper DOM =====
const $ = s => document.querySelector(s);
const dataStatus=$("#dataStatus"), groupFilter=$("#groupFilter"), searchInput=$("#searchInput"),
      nameList=$("#nameList"), nameSelect=$("#nameSelect"), university=$("#university"), program=$("#program");
const photoInput=$("#photoInput"), downloadBtn=$("#downloadBtn");
const zoomRange=$("#zoomRange"), offsetXRange=$("#offsetXRange"), offsetYRange=$("#offsetYRange"), resetPhotoBtn=$("#resetPhotoBtn");
const fileNameEl = document.querySelector('.file-name');
const stage=$("#stage"), canvas=$("#c"), ctx=canvas.getContext("2d");
const suggestionWrapper = $("#suggestionWrapper");
const suggestionSelect  = $("#suggestionSelect");
const DEBUG = false;

// NEW: hints di bawah input
const nameHint  = $("#nameHint");
const univHint  = $("#univHint");
const prodiHint = $("#prodiHint");

// NEW: Dropzone + uploads + toast
const dropzone   = $("#dropzone");
const uploadsList= $("#uploadsList");
const toastEl    = $("#toast");

// NEW: Koreksi foto controls
const brightnessRange = $("#brightnessRange");
const contrastRange   = $("#contrastRange");
const saturationRange = $("#saturationRange");
const detailBoostChk  = $("#detailBoost");

// ===== Konstanta =====
const MAX_NAME_CHARS = 35;

// ✅ Sesuaikan dengan file di root repo (GitHub Pages friendly)
const CSV_URL = "./Data%20formulir%20PK%20264.csv";   // jika memakai CSV langsung (spasi di-encode)
// Jika Anda nanti merename file CSV → gunakan baris ini sebagai gantinya:
// const CSV_URL = "./data_pk264.csv";

const FRAME_SVG = "./frame.svg";              // frame default (SVG di root)
const FRAME_PNG = "./frame.png";              // fallback PNG
const TEXT_SVG_TEMPLATE = "./text-template.svg"; // SVG overlay (id: nameText, univText, prodiText)

// Lebar wrap (px) sesuai layout overlay 1080x1350
const UNIV_MAX_W  = 792;
const PRODI_MAX_W = 626;

// NEW: validasi upload & limit
const ACCEPT_MIME = new Set(['image/png','image/jpeg']);
const REJECT_MIME = new Set(['image/heic','image/heif','image/gif']);
const ACCEPT_EXT  = new Set(['png','jpg','jpeg']);
const REJECT_EXT  = new Set(['heic','heif','gif']);
const MAX_MB = 10;

// NEW: batas ideal untuk hints
const LIMITS = {
  nameWithSpaces: 34,
  univWithSpaces: 38,
  prodiNoSpaces : 47,
};

// ===== App state =====
let DATA = Array.isArray(window.DATA) ? window.DATA : [];
let selected=null, photoImg=null, frameImg=null;

// Hanya tampilan: boleh beda dari nama asli jika pakai “saran nama”
let currentDisplayName = "";

// Edit toggle untuk Univ/Prodi
let editUnlocked = false;

// NEW: State koreksi foto (default netral)
let brightness = 100; // %
let contrast   = 100; // %
let saturation = 100; // %
let detailBoost = false;

// ===== Overlay SVG cache =====
let textTplRaw = "";
let overlayUrl = null;
let overlayImg = null;
function disposeOverlay(){ if (overlayUrl) URL.revokeObjectURL(overlayUrl); overlayUrl = null; overlayImg = null; }

// ===== Utils =====
function clamp(v,min,max){ return Math.max(min, Math.min(max,v)); }

function centerPhoto(keepScale = true){
  if (!keepScale) photoScale = 1.0;
  photoOffsetX = 0; photoOffsetY = 0;
  if (zoomRange)    zoomRange.value    = Math.round(photoScale*100);
  if (offsetXRange) offsetXRange.value = 0;
  if (offsetYRange) offsetYRange.value = 0;

  // NEW: reset koreksi (untuk reset total)
  brightness = 100; contrast = 100; saturation = 100; detailBoost = false;
  if (brightnessRange) brightnessRange.value = 100;
  if (contrastRange)   contrastRange.value   = 100;
  if (saturationRange) saturationRange.value = 100;
  if (detailBoostChk)  detailBoostChk.checked= false;
}

function loadImage(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{ URL.revokeObjectURL(url); res(img); };
    img.onerror=rej; img.src=url;
  });
}
function loadImageUrl(src){
  return new Promise((res,rej)=>{
    const img=new Image();
    try {
      const u = new URL(src, window.location.href);
      if (u.origin !== window.location.origin && /^https?:/.test(u.protocol)) {
        img.crossOrigin = "anonymous";
      }
    } catch(_) {}
    img.onload=()=>res(img);
    img.onerror=()=>rej(new Error("Gagal memuat: "+src));
    img.src=src;
  });
}
async function fetchText(url){
  const res = await fetch(url, {cache:"no-store"});
  if (!res.ok) throw new Error(`Gagal memuat ${url}: ${res.status}`);
  return await res.text();
}

// NEW: toast & uploader helpers
function showToast(msg, type='ok'){
  if (!toastEl) return;
  toastEl.className = `toast ${type} show`;
  toastEl.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toastEl.classList.remove('show'), 2600);
}
function extOf(name){ return String(name||'').split('.').pop().toLowerCase(); }
function acceptedFile(file){
  const mime = (file.type||'').toLowerCase(), ext = extOf(file.name);
  if (REJECT_MIME.has(mime) || REJECT_EXT.has(ext)) return false;
  if (ACCEPT_MIME.has(mime)) return true;
  return ACCEPT_EXT.has(ext);
}
function addFileItem(file){
  if (!uploadsList) return;
  const li = document.createElement('li');
  li.className='fileitem';
  li.innerHTML = `
    <div class="filebadge">${extOf(file.name).toUpperCase() || 'IMG'}</div>
    <div class="filemeta">
      <div class="name">${file.name}</div>
      <div class="sub">${(file.size/1024/1024).toFixed(1)} MB</div>
      <div class="progressbar"><span style="width:0"></span></div>
    </div>
    <div class="fileactions">
      <button class="iconbtn" title="Hapus">🗑</button>
    </div>`;
  li.querySelector('.iconbtn').onclick = ()=> li.remove();
  uploadsList.prepend(li);
  requestAnimationFrame(()=> li.querySelector('.progressbar > span').style.width = '100%');
}

// ===== CSV =====
function parseCSV(text){
  const rows = [];
  let cur = [], field = "", inQuotes = false;
  for (let i=0;i<text.length;i++){
    const ch = text[i], nx = text[i+1];
    if (inQuotes){
      if (ch === '"' && nx === '"'){ field += '"'; i++; }
      else if (ch === '"'){ inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"'){ inQuotes = true; }
      else if (ch === ','){ cur.push(field); field = ""; }
      else if (ch === '\n' || ch === '\r'){
        if (field !== "" || cur.length>0){ cur.push(field); rows.push(cur); cur=[]; field=""; }
        if (ch === '\r' && nx === '\n') i++;
      } else { field += ch; }
    }
  }
  if (field !== "" || cur.length>0){ cur.push(field); rows.push(cur); }
  return rows;
}
function rowsToObjects(rows){
  if (!rows.length) return [];
  const header = rows[0].map(h=>h.trim());
  const out = [];
  for (let i=1;i<rows.length;i++){
    const r = rows[i], obj = {};
    for (let j=0;j<header.length;j++){ obj[header[j]] = (r[j] ?? "").trim(); }
    out.push(obj);
  }
  return out;
}

// ===== Nama Title Case =====
function formatName(raw){
  if (!raw) return "";
  const lower = String(raw).trim().toLowerCase();
  const smallWords = new Set(["bin","binti","ibn","al","as","ash","af","el","de","del","della","da","di","la","le","van","von","der","den","of","and","&"]);
  return lower.split(/\s+/).map((w,i)=> smallWords.has(w)&&i!==0 ? w : w.replace(/(^|[-'’`])\p{L}/gu, m=>m.toUpperCase())).join(" ");
}

// ===== Saran Nama (<= MAX_NAME_CHARS) =====
function createNameSuggestions(fullName, maxLength){
  const clean = fullName.replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= maxLength) return [];
  const words = clean.split(" ");
  if (words.length <= 2){
    const last = words[words.length-1] || "";
    const remain = Math.max(1, maxLength - (words[0].length + 1));
    return [`${words[0]} ${last.slice(0, remain)}`.trim()];
  }
  const suggestions = new Set();
  for (let i = words.length - 2; i > 0; i--){
    const temp=[...words]; temp[i]=`${temp[i][0].toUpperCase()}.`;
    const s=temp.join(" "); if (s.length<=maxLength) suggestions.add(s);
  }
  { const s=[words[0], ...words.slice(1,-1).map(w=>`${w[0].toUpperCase()}.`), words.at(-1)].join(" "); if (s.length<=maxLength) suggestions.add(s); }
  { const s=`${words[0]} ${words.at(-1)}`; if (s.length<=maxLength) suggestions.add(s); }
  if (!suggestions.size){
    const last = words.at(-1); const s=`${words[0]} ${last[0].toUpperCase()}.`; if (s.length<=maxLength) suggestions.add(s);
  }
  return Array.from(suggestions).sort((a,b)=> b.length - a.length);
}

// ===== Text wrap helpers (ukur via canvas → bungkus <tspan>) =====
function measureTextPx(text, { sizePx, weight = 400, italic = false, family = "Raleway" }){
  const italicStr = italic ? "italic " : "";
  ctx.font = `${italicStr}${weight} ${sizePx}px ${family}, system-ui, sans-serif`;
  return ctx.measureText(text).width;
}
function wrapWordsToWidth(text, maxWidth, fontSpec){
  const words = String(text||"").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines=[]; let line="";
  for (const w of words){
    const test = line ? `${line} ${w}` : w;
    if (measureTextPx(test, fontSpec) <= maxWidth){ line = test; }
    else{
      if (!line){
        let chunk=""; for (const ch of w){ const t2 = chunk + ch; if (measureTextPx(t2, fontSpec) <= maxWidth) chunk=t2; else { lines.push(chunk); chunk=ch; } }
        line = chunk;
      }else{ lines.push(line); line = w; }
    }
  }
  if (line) lines.push(line);
  return lines;
}
function applyMultiline(svgDoc, textEl, lines, opts){
  const NS = "http://www.w3.org/2000/svg";
  const x = parseFloat(textEl.getAttribute("x") || "540");
  const y = parseFloat(textEl.getAttribute("y") || "0");
  const lhEm = opts.lineHeightEm || 1.2;
  const sizePx = opts.sizePx;

  while (textEl.firstChild) textEl.removeChild(textEl.firstChild);

  const blockPx = sizePx * lhEm * (lines.length - 1);
  const firstY = y - blockPx / 2;

  lines.forEach((line, i)=>{
    const t = svgDoc.createElementNS(NS, "tspan");
    t.setAttribute("x", String(x));
    if (i===0) t.setAttribute("y", String(firstY));
    else t.setAttribute("dy", `${lhEm}em`);
    t.textContent = line;
    textEl.appendChild(t);
  });
}
function buildOverlayFromTemplate(svgString, payload){
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");

  // NAMA (single line)
  const nameEl = doc.getElementById("nameText");
  if (nameEl) nameEl.textContent = payload.name || "";

  // UNIVERSITAS (wrap)
  const univEl = doc.getElementById("univText");
  if (univEl){
    const spec = { sizePx: 36, weight: 500, italic: false, family: "Raleway" };
    const lines = wrapWordsToWidth(payload.univ || "", UNIV_MAX_W, spec);
    applyMultiline(doc, univEl, lines, { sizePx: 36, lineHeightEm: 1.2 });
  }

  // PRODI (wrap)
  const prodiEl = doc.getElementById("prodiText");
  if (prodiEl){
    const spec = { sizePx: 24, weight: 400, italic: false, family: "Raleway" };
    const lines = wrapWordsToWidth(payload.prodi || "", PRODI_MAX_W, spec);
    applyMultiline(doc, prodiEl, lines, { sizePx: 24, lineHeightEm: 1.2 });
  }

  return new XMLSerializer().serializeToString(doc);
}

// ===== Overlay updater =====
async function ensureTextOverlayUpToDate(){
  if (!textTplRaw){
    try { textTplRaw = await fetchText(TEXT_SVG_TEMPLATE); }
    catch(e){ console.warn("Gagal memuat text-template.svg:", e.message); disposeOverlay(); return; }
  }
  const name = getDisplayName();
  const univ = selected ? (selected["University"]||"") : "";
  const prodi= selected ? (selected["Program of Study"]||"") : "";
  const key  = [name,univ,prodi].join("||");
  if (overlayImg && overlayImg.dataset && overlayImg.dataset.key === key) return;

  try{
    if ("fonts" in document) { await document.fonts.ready; }
    const svgString = buildOverlayFromTemplate(textTplRaw, { name, univ, prodi });
    const blob = new Blob([svgString], {type:"image/svg+xml"});
    disposeOverlay();
    overlayUrl = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=overlayUrl; });
    img.dataset.key = key;
    overlayImg = img;
  }catch(err){
    console.warn("Gagal membangun overlay:", err);
    disposeOverlay();
  }
}
const getDisplayName = () => currentDisplayName || (selected ? formatName(selected["Full Name"]||"") : "");

// ===== Frame default =====
async function preloadDefaultFrame(){
  try{ frameImg = await loadImageUrl(FRAME_SVG); }
  catch(e1){
    console.warn("Frame SVG gagal, fallback PNG:", e1.message);
    try{ frameImg = await loadImageUrl(FRAME_PNG); }
    catch(e2){ console.warn("Frame PNG juga gagal:", e2.message); }
  }
  centerPhoto(true); draw();
}

// === Hints helpers ===
const lenWithSpaces  = s => String(s||'').length;
const lenWithoutSpcs = s => String(s||'').replace(/\s+/g,'').length;

function setMeta(el, html, ok){
  if (!el) return;
  el.classList.remove('meta-ok','meta-bad');
  el.classList.add(ok ? 'meta-ok' : 'meta-bad');
  el.innerHTML = html;
}
function updateNameHint(){
  const v = currentDisplayName || getDisplayName() || '';
  const n = lenWithSpaces(v);
  const lim = LIMITS.nameWithSpaces;
  const isOk = n <= lim;
  
  // Pesan dinamis: berubah jika melebihi batas
  const message = isOk
    ? `Saat ini: <strong>${n}</strong> / ${lim} karakter.`
    : `Terlalu panjang: <strong>${n}</strong> / ${lim}. Perlu disingkat.`;
    
  setMeta(nameHint, message, isOk);
}

function updateUnivHint(){
  const v = (university?.value || '');
  const n = lenWithSpaces(v);
  const lim = LIMITS.univWithSpaces;
  const isOk = n <= lim;

  const message = isOk
    ? `Saat ini: <strong>${n}</strong> / ${lim} karakter.`
    : `Melebihi batas ideal (<strong>${n}</strong> / ${lim}).`; // Untuk Univ, info saja sudah cukup

  setMeta(univHint, message, isOk);
}

function updateProdiHint(){
  const v = (program?.value || '');
  const n = lenWithoutSpcs(v);
  const lim = LIMITS.prodiNoSpaces;
  const isOk = n <= lim;

  const message = isOk
    ? `Saat ini: <strong>${n}</strong> / ${lim} karakter.`
    : `Melebihi batas ideal (<strong>${n}</strong> / ${lim}).`;
    
  setMeta(prodiHint, message, isOk);

}
function updateAllHints(){ updateNameHint(); updateUnivHint(); updateProdiHint(); }

// ===== Init =====
(async function init(){
  // Data
  if (!DATA.length){
    try{
      const text = await fetchText(CSV_URL);
      const rows = parseCSV(text);
      const objs = rowsToObjects(rows);
      DATA = objs.map(o=>{
        const fullName = o["Full Name"] || o["Nama Lengkap"] || o["Nama"] || o["Name"] || "";
        const univ     = o["University"]  || o["Universitas"] || o["Afiliasi"] || "";
        const prodi    = o["Program of Study"] || o["Program"] || o["Prodi"] || o["Jurusan"] || "";
        const group    = o["Kelompok"] || o["Group"] || o["Group/Team"] || "";
        return { "Full Name": fullName, "University": univ, "Program of Study": prodi, "Kelompok": group };
      });
    } catch(e){ console.warn("Gagal memuat CSV:", e.message); }
  }
  dataStatus && (dataStatus.textContent = `Data (${DATA.length} baris)`);

  // UI
  populateLists();
  injectEditToggle();        // ← tombol Edit Univ/Prodi
  preloadDefaultFrame();

  if ("fonts" in document) {
    document.fonts.ready.then(async ()=>{ await ensureTextOverlayUpToDate(); draw(); });
    document.fonts.addEventListener?.("loadingdone", async ()=>{ await ensureTextOverlayUpToDate(); draw(); });
  }
  window.addEventListener("load", draw);

  // NEW: Dropzone events
  if (dropzone){
    ['dragenter','dragover'].forEach(evt=>{
      dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave','drop'].forEach(evt=>{
      dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', e=>{
      const f = e.dataTransfer?.files?.[0]; if (f) handleIncomingFile(f);
    });
    dropzone.addEventListener('click', e=>{
      if (e.target.classList.contains('dz-browse')) photoInput?.click();
    });
  }

  // NEW: Koreksi foto listeners
  brightnessRange?.addEventListener('input', ()=>{ brightness = +brightnessRange.value; draw(); });
  contrastRange?.addEventListener('input',   ()=>{ contrast   = +contrastRange.value;   draw(); });
  saturationRange?.addEventListener('input', ()=>{ saturation = +saturationRange.value; draw(); });
  detailBoostChk?.addEventListener('change', ()=>{ detailBoost = detailBoostChk.checked; draw(); });

  // panggil hint awal
  updateAllHints();
})();

// ===== Data UI =====
function populateLists(){
  if (!groupFilter || !nameSelect) return;
  groupFilter.innerHTML = '<option value="">— Semua —</option>';
  [...new Set(DATA.map(r=>r.Kelompok).filter(Boolean))].sort().forEach(g=>{
    const o=document.createElement("option"); o.value=g; o.textContent=g; groupFilter.appendChild(o);
  });
  renderOptions();
  if (nameSelect.options.length){
    nameSelect.value = nameSelect.options[0].value;
    const rec = DATA.find(r=>r["Full Name"]===nameSelect.value);
    if (rec) chooseRecord(rec);
  }
}
function renderOptions(){
  if (!nameSelect) return;
  const g=groupFilter?.value, q=(searchInput?.value||"").toLowerCase().trim();
  const filtered=DATA.filter(r=>(!g||r.Kelompok===g) && (!q||String(r["Full Name"]).toLowerCase().includes(q)))
                     .sort((a,b)=>String(a["Full Name"]).localeCompare(String(b["Full Name"])));
  nameSelect.innerHTML=""; nameList && (nameList.innerHTML="");
  filtered.forEach(r=>{
    const val=String(r["Full Name"]||"").trim();
    if (!val) return;
    const opt=document.createElement("option"); opt.value=val; opt.textContent=val; nameSelect.appendChild(opt);
    if (nameList){ const dl=document.createElement("option"); dl.value=val; nameList.appendChild(dl); }
  });
}
groupFilter && groupFilter.addEventListener("change", renderOptions);
searchInput && searchInput.addEventListener("input", ()=>{
  renderOptions();
  const exact=DATA.find(r=>String(r["Full Name"]).trim()===String(searchInput.value).trim());
  if(exact) chooseRecord(exact);
});
nameSelect && nameSelect.addEventListener("change", ()=>{
  const rec=DATA.find(r=>String(r["Full Name"]).trim()===String(nameSelect.value).trim());
  if(rec) chooseRecord(rec);
});

// ===== Toggle edit Univ/Prodi (dibuat via JS) =====
function injectEditToggle(){
  if (!program) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "toggleEditBtn";
  btn.textContent = "✏️ Edit Univ/Prodi";
  // gaya inline ringan
  btn.style.marginTop = "6px";
  btn.style.alignSelf = "start";
  btn.style.padding = "6px 10px";
  btn.style.border = "1px solid var(--primary)";
  btn.style.borderRadius = "8px";
  btn.style.background = "color-mix(in srgb, var(--primary) 15%, transparent)";
  btn.style.color = "var(--primary)";
  btn.style.fontWeight = "700";
  btn.style.cursor = "pointer";

  program.parentElement.insertAdjacentElement("afterend", btn);

  btn.addEventListener("click", ()=>{
    editUnlocked = !editUnlocked;
    if (university) university.readOnly = !editUnlocked;
    if (program)    program.readOnly    = !editUnlocked;
    btn.textContent = editUnlocked ? "🔒 Kunci Univ/Prodi" : "✏️ Edit Univ/Prodi";
    if (editUnlocked && university) university.focus();
  });
}

// Ubah Univ/Prodi → render ulang + update hints
university && university.addEventListener("input", async ()=>{
  if (!selected) return;
  selected["University"] = university.value || "";
  updateUnivHint();
  await ensureTextOverlayUpToDate(); draw();
});
program && program.addEventListener("input", async ()=>{
  if (!selected) return;
  selected["Program of Study"] = program.value || "";
  updateProdiHint();
  await ensureTextOverlayUpToDate(); draw();
});

// ===== chooseRecord + saran nama (nama asli default) =====
async function chooseRecord(rec){
  selected = rec;
  const originalName = formatName(rec["Full Name"] || "");

  // isi field
  if (university){ university.value = rec["University"] || ""; university.readOnly = !editUnlocked; }
  if (program){    program.value    = rec["Program of Study"] || ""; program.readOnly    = !editUnlocked; }
  if (searchInput) searchInput.value = originalName;

  // Dropdown saran nama
  const suggestions = createNameSuggestions(originalName, MAX_NAME_CHARS);
  if (suggestions.length > 0 && suggestionWrapper && suggestionSelect){
    suggestionWrapper.classList.remove("hidden");
    suggestionSelect.innerHTML = "";

    const o = document.createElement("option");
    o.value = originalName; o.textContent = `${originalName} (Nama Asli)`;
    suggestionSelect.appendChild(o);

    suggestions.forEach(s=>{
      const opt=document.createElement("option");
      opt.value=s; opt.textContent=s;
      suggestionSelect.appendChild(opt);
    });

    suggestionSelect.value = originalName;
    currentDisplayName = originalName;
  }else{
    if (suggestionWrapper) suggestionWrapper.classList.add("hidden");
    if (suggestionSelect)  suggestionSelect.innerHTML = "";
    currentDisplayName = originalName;
  }

  await ensureTextOverlayUpToDate();
  updateAllHints();   // <<— update counters setelah pilih data
  draw();
}

// Ganti pilihan saran nama → hanya tampilan + hint
if (suggestionSelect){
  suggestionSelect.addEventListener("change", async ()=>{
    currentDisplayName = suggestionSelect.value || getDisplayName();
    await ensureTextOverlayUpToDate();
    updateNameHint();
    draw();
  });
}

// ===== Upload & Edit Foto =====
let photoScale = 1.0, photoOffsetX = 0, photoOffsetY = 0;
const MIN_SCALE = 0.5, MAX_SCALE = 2.0;

// NEW: handler terpusat untuk file masuk (browse/drop)
async function handleIncomingFile(f){
  if (!f){ return; }
  if (f.size > MAX_MB*1024*1024){ showToast(`Ukuran maksimal ${MAX_MB} MB.`, 'error'); return; }
  if (!acceptedFile(f)){ showToast('Hanya menerima PNG/JPEG. HEIC/HEIF/GIF ditolak.', 'error'); return; }

  // tampilkan nama (kompat lama)
  if (fileNameEl) fileNameEl.textContent = f.name;

  // load ke image
  try{
    photoImg = await loadImage(f);
    centerPhoto(true);
    addFileItem(f);
    showToast('File diterima. Siap diedit.', 'ok');
    draw();
  }catch(err){
    console.warn(err);
    showToast('Gagal memuat gambar.', 'error');
  }
}

// browse input (tetap didukung)
photoInput && photoInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0] || null;
  if (!f){ photoImg=null; draw(); return; }
  handleIncomingFile(f);
});

zoomRange && zoomRange.addEventListener("input", ()=>{ photoScale=clamp(parseInt(zoomRange.value,10)/100, MIN_SCALE, MAX_SCALE); draw(); });
offsetXRange && offsetXRange.addEventListener("input", ()=>{ photoOffsetX = parseInt(offsetXRange.value,10)||0; draw(); });
offsetYRange && offsetYRange.addEventListener("input", ()=>{ photoOffsetY = parseInt(offsetYRange.value,10)||0; draw(); });

resetPhotoBtn && resetPhotoBtn.addEventListener("click", ()=>{
  centerPhoto(false);
  photoImg=null;
  if(photoInput) photoInput.value="";
  if(fileNameEl) fileNameEl.textContent="Belum ada file";
  uploadsList && (uploadsList.innerHTML="");   // NEW: kosongkan list
  draw();
});

// Drag & Zoom
let draggingPhoto=false, dragStartX=0, dragStartY=0, startOffX=0, startOffY=0;
stage && stage.addEventListener("mousedown", (e)=>{ if (e.target.id === "c"){ draggingPhoto=true; dragStartX=e.clientX; dragStartY=e.clientY; startOffX=photoOffsetX; startOffY=photoOffsetY; } });
window.addEventListener("mousemove", (e)=>{ if(!draggingPhoto) return; const dx=e.clientX-dragStartX, dy=e.clientY-dragStartY; photoOffsetX=startOffX+dx; photoOffsetY=startOffY+dy; if(offsetXRange) offsetXRange.value=Math.round(photoOffsetX); if(offsetYRange) offsetYRange.value=Math.round(photoOffsetY); draw(); });
window.addEventListener("mouseup", ()=>{ draggingPhoto=false; });

stage && stage.addEventListener("wheel", (e)=>{
  if(e.target.id!=="c") return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const cy = (e.clientY - rect.top ) * (canvas.height/ rect.height);
  const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
  const newScale = clamp(photoScale * zoomFactor, MIN_SCALE, MAX_SCALE);
  const scaleRatio = newScale / photoScale;
  photoOffsetX = cx - scaleRatio * (cx - photoOffsetX);
  photoOffsetY = cy - scaleRatio * (cy - photoOffsetY);
  photoScale = newScale;
  if (zoomRange)    zoomRange.value = Math.round(photoScale*100);
  if (offsetXRange) offsetXRange.value = Math.round(photoOffsetX);
  if (offsetYRange) offsetYRange.value = Math.round(photoOffsetY);
  draw();
}, {passive:false});

// ===== Render =====
function draw(){
  if (!ctx) return;

  // latar
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#000"; ctx.fillRect(0,0,canvas.width,canvas.height);

  // foto
  if(photoImg){
    ctx.save();

    // NEW: filter koreksi foto — hanya untuk gambar foto
    const b = (brightness/100).toFixed(3);
    const c = (contrast/100).toFixed(3);
    const s = (saturation/100).toFixed(3);
    const db = detailBoost ? ' contrast(1.06) saturate(1.04)' : '';
    ctx.filter = `brightness(${b}) contrast(${c}) saturate(${s})${db}`;

    ctx.translate(photoOffsetX, photoOffsetY);
    ctx.scale(photoScale, photoScale);

    const w = canvas.width, h = canvas.height;
    const ir = photoImg.width / photoImg.height, r = w/h;
    let dw, dh, dx, dy;
    if (ir > r){ dh = h; dw = dh * ir; } else { dw = w; dh = dw / ir; }
    dx = (w - dw) / 2 / photoScale;
    dy = (h - dh) / 2 / photoScale;

    ctx.drawImage(photoImg, dx, dy, dw, dh);
    ctx.restore();

    // kembalikan filter ke normal untuk elemen lain
    ctx.filter = 'none';
  }else{
    ctx.fillStyle="#222"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#bbb"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font = "600 48px Inter, sans-serif";
    ctx.fillText("Upload foto…", canvas.width/2, canvas.height/2);
  }

  // frame + overlay teks
  if(frameImg)  ctx.drawImage(frameImg,0,0,canvas.width,canvas.height);
  if (overlayImg) ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);

  if (DEBUG){ ctx.strokeStyle='rgba(255,0,0,.35)'; ctx.strokeRect(0,0,canvas.width,canvas.height); }
}

window.addEventListener("resize", draw);

// ===== Download =====
downloadBtn && downloadBtn.addEventListener("click", () => {
  try {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url  = URL.createObjectURL(blob);
      const safe = (selected ? (formatName(selected["Full Name"]) || "twibbon") : "twibbon").replace(/[^a-z0-9\- ]/gi,"_");
      const a = document.createElement("a");
      a.href = url; a.download = safe + ".png";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }, "image/png");
  } catch (err) {
    console.error(err);
    alert("Gagal mengunduh gambar. Coba lagi ya.");
  }
});

// ==== Enhance slider UI: isi progress + badge nilai ====
(function enhanceRanges(){
  const ranges = [
    {el: document.getElementById('zoomRange')},
    {el: document.getElementById('offsetXRange')},
    {el: document.getElementById('offsetYRange')},
    {el: document.getElementById('brightnessRange'), badge: document.getElementById('brightnessBadge'), suffix: '%'},
    {el: document.getElementById('contrastRange'),   badge: document.getElementById('contrastBadge'),   suffix: '%'},
    {el: document.getElementById('saturationRange'), badge: document.getElementById('saturationBadge'), suffix: '%'},
  ].filter(r => r.el);

  function setFill(r){
    const el = r.el;
    const min = +el.min || 0;
    const max = +el.max || 100;
    const val = +el.value;
    const pct = ((val - min) / (max - min)) * 100; // 0..100
    el.style.setProperty('--val', pct.toFixed(2));
    if (r.badge) r.badge.textContent = (r.suffix ? `${val}${r.suffix}` : String(val));
  }

  ranges.forEach(r=>{
    setFill(r);
    r.el.addEventListener('input', ()=> setFill(r));
    r.el.addEventListener('change', ()=> setFill(r));
  });
})();
