/* twibbon.js – PK264 (rev settings-card + left drawer)
 * - Toolbar Search + Drawer Filter (Kelompok, Negara)
 * - Nama: tombol edit muncul otomatis bila > 34
 * - Prodi & Univ: inline edit (tombol di kanan)
 * - DATA dari CSV atau window.DATA (data_peserta.js)
 * - Degree/Negara statis + icon bendera
 * - Nama: highlight valid/invalid (tanpa badge teks) + AUTO WRAP 2 baris // NEW
 * - Editor foto (zoom, drag, koreksi)
 */

"use strict";

/* ================= DOM HELPERS ================= */
const $  = (s)=>document.querySelector(s);

/* Header info */
const dataStatus = $("#dataStatus");

/* Toolbar search + datalist + pilihan nama */
const searchInput = $("#searchInput");
const nameList    = $("#nameList");
const nameSelect  = $("#nameSelect");

/* Personal Info (settings card) */
const rowNameVal    = $("#rowNameVal");
const btnEditName   = $("#btnEditName");
const rowNameEdit   = $("#rowNameEdit");
const rowNameSelect = $("#rowNameSelect");

const rowProdiInput = $("#rowProdiInput");
const btnEditProdi  = $("#btnEditProdi");

const rowUnivInput  = $("#rowUnivInput");
const btnEditUniv   = $("#btnEditUniv");

/* Jenjang & Negara (statis) */
const degreeVal   = $("#degreeVal");
const countryVal  = $("#countryVal");
const countryFlag = $("#countryFlag");

/* Hints */
const nameHint = $("#nameHint");
const prodiHint= $("#prodiHint");
const univHint = $("#univHint");

/* Drawer chips (LEFT) */
const chipsKelompok = $("#chipsKelompok");
const chipsNegara   = $("#chipsNegara");
const btnApply      = $("#btnApply");
const btnReset      = $("#btnReset");
const btnCloseDrawer= $("#closeFilter");

/* Canvas & editor foto */
const stage   = $("#stage");
const canvas  = $("#c");
const ctx     = canvas?.getContext("2d");

const photoInput   = $("#photoInput");
const uploadList   = $("#uploadsList");
const toastEl      = $("#toast");
const downloadBtn  = $("#downloadBtn");

const zoomRange    = $("#zoomRange");
const offsetXRange = $("#offsetXRange");
const offsetYRange = $("#offsetYRange");
const resetPhotoBtn = $("#resetBtn");

const brightnessRange = $("#brightnessRange");
const contrastRange   = $("#contrastRange");
const saturationRange = $("#saturationRange");
const detailBoostChk  = $("#detailBoost");

const showGuidesChk = $("#showGuides");

const DEBUG = false;

/* ================= KONSTANTA ================= */
const MAX_NAME_CHARS   = 35; // buat saran singkatan
const LIMITS = { nameWithSpaces: 34, univWithSpaces: 38, prodiNoSpaces: 47 };

/* Versi untuk bust cache asset (ubah saat rilis baru) */
const ASSET_VERSION = "20250819";

/* CSV candidates: otomatis pilih yang ada di repo */
const CSV_CANDIDATES = [
  "./Data formulir PK 264.csv",
  "./Data%20formulir%20PK%20264.csv",
  "./data_pk264.csv",
];

/* Asset frame & template — tambah query versi agar tidak ke-cache */
const FRAME_SVG         = `./frame.svg?v=${ASSET_VERSION}`;
const FRAME_PNG         = `./frame.png?v=${ASSET_VERSION}`;
const TEXT_SVG_TEMPLATE = `./text-template.svg?v=${ASSET_VERSION}`;

/* Wrap width sesuai desain SVG 1080x1350 */
const UNIV_MAX_W  = 792;
const PRODI_MAX_W = 626;

/* Upload guard */
const ACCEPT_MIME = new Set(["image/png","image/jpeg"]);
const REJECT_MIME = new Set(["image/heic","image/heif","image/gif"]);
const ACCEPT_EXT  = new Set(["png","jpg","jpeg"]);
const REJECT_EXT  = new Set(["heic","heif","gif"]);
const MAX_MB      = 10;

/* === Dropzone (klik & drag/drop) === */
(() => {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('photoInput');
  if (!dz || !input) return;

  // Klik di mana saja pada box -> open file (input sudah menutupi area, ini hanya fallback)
  dz.addEventListener('click', (e) => {
    // biar tidak mengganggu drag/drop, tapi tetap aman
    if (e.target === dz || e.target.classList.contains('dz-title') || e.target.classList.contains('dz-browse') || e.target.classList.contains('dz-svg')){
      input.click();
    }
  });

  // Drag states
  ['dragenter','dragover'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); })
  );
  ['dragleave','dragend','drop'].forEach(ev =>
    dz.addEventListener(ev, () => dz.classList.remove('dragover'))
  );

  // Drop file
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) handleIncomingFile(f); // fungsi kamu yg sudah ada
  });

  // Pilih via dialog
  input.addEventListener('change', (e)=>{
    const f = e.target.files?.[0];
    if (f) handleIncomingFile(f);
  });
})();


/* Panduan (posisi lubang twibbon) */
const GUIDE  = { cx: 540, cy: 655, r: 320 };
const COLORS = { circle:"rgba(255,255,255,.70)", eyes:"#00BFA6", face:"#7C4DFF", shoulder:"#FF8F00" };

/* ================= APP STATE ================= */
let DATA = Array.isArray(window.DATA) ? window.DATA : [];
let selected = null;

let currentDisplayName = ""; // boleh saran singkat
let frameImg = null, photoImg = null;

let brightness = 100, contrast = 100, saturation = 100, detailBoost = false;
let showGuides = !!showGuidesChk?.checked;

let photoScale=1.0, photoOffsetX=0, photoOffsetY=0;
const MIN_SCALE=0.5, MAX_SCALE=2.0;

/* Filters (Apply di drawer) */
const FILTERS = { Kelompok:new Set(), Negara:new Set() };

/* Overlay cache */
let textTplRaw = "";
let overlayUrl = null, overlayImg = null;

/* ================== UTILS ================== */
const clamp=(v,min,max)=> Math.max(min, Math.min(max, v));

/* Nama highlight: hijau bila valid, merah bila tidak */
function setNameBoxClass(ok){
  if (!rowNameVal) return;
  rowNameVal.classList.add("name-box");
  rowNameVal.classList.toggle("valid",  ok);
  rowNameVal.classList.toggle("invalid", !ok);
}

/* === NEW: helper untuk wrap nama 2 baris di UI === */
function escapeHTML(s){ return String(s).replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[m])); }
function wrapNameForBox(name, limit=LIMITS.nameWithSpaces){
  const v = String(name||"").trim();
  if (!v) return "—";
  if (v.length <= limit) return escapeHTML(v);        // tidak perlu wrap

  // cari spasi terdekat dari tengah agar baris lebih seimbang
  const mid = Math.round(v.length/2);
  let breakAt = -1, minDist = 1e9;

  // kandidat: semua spasi
  for (let i=0;i<v.length;i++){
    if (v[i]===" "){
      const d = Math.abs(i - mid);
      if (d < minDist){ minDist = d; breakAt = i; }
    }
  }
  if (breakAt === -1) {
    // tidak ada spasi, paksa break di tengah
    breakAt = mid;
  }

  const left  = v.slice(0, breakAt).trimEnd();
  const right = v.slice(breakAt+1).trimStart();
  return `${escapeHTML(left)}<br>${escapeHTML(right)}`;
}

function extOf(name){ return String(name||"").split(".").pop().toLowerCase(); }
function acceptedFile(file){
  const mime=(file.type||"").toLowerCase(), ext=extOf(file.name);
  if (REJECT_MIME.has(mime) || REJECT_EXT.has(ext)) return false;
  if (ACCEPT_MIME.has(mime)) return true;
  return ACCEPT_EXT.has(ext);
}
function showToast(msg, type='ok'){
  if (!toastEl) return;
  toastEl.className = `toast ${type} show`;
  toastEl.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toastEl.classList.remove("show"), 2600);
}

function loadImage(file){
  return new Promise((res,rej)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload=()=>{ URL.revokeObjectURL(url); res(img); };
    img.onerror=rej; img.src=url;
  });
}
function loadImageUrl(src){
  return new Promise((res,rej)=>{
    const img=new Image();
    try{
      const u=new URL(src, location.href);
      if (u.origin!==location.origin && /^https?:/.test(u.protocol)) img.crossOrigin="anonymous";
    }catch(_) {}
    img.onload=()=>res(img);
    img.onerror=()=>rej(new Error("Gagal memuat: "+src));
    img.src=src;
  });
}
async function fetchText(url){
  const res=await fetch(url,{cache:"no-store"});
  if(!res.ok) throw new Error(`Gagal memuat ${url}: ${res.status}`);
  return await res.text();
}

/* Cari CSV pertama yang tersedia dari daftar kandidat */
async function fetchFirstAvailable(urls){
  for (const u of urls){
    try{
      const t = await fetchText(u);
      if (t && t.length) return { text: t, url: u };
    }catch(e){
      // lanjut ke kandidat berikutnya
    }
  }
  throw new Error("CSV tidak ditemukan di kandidat nama yang dicoba.");
}

/* ===== CSV ===== */
function parseCSV(text){
  const rows=[]; let cur=[], field="", inQuotes=false;
  for (let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if (inQuotes){
      if (ch === '"' && nx === '"'){ field += '"'; i++; }
      else if (ch === '"'){ inQuotes = false; }
      else field += ch;
    }else{
      if (ch === '"') inQuotes = true;
      else if (ch === ','){ cur.push(field); field=""; }
      else if (ch === '\n' || ch === '\r'){
        if (field!=="" || cur.length){ cur.push(field); rows.push(cur); cur=[]; field=""; }
        if (ch==='\r' && nx === '\n') i++;
      }else field += ch;
    }
  }
  if (field!=="" || cur.length){ cur.push(field); rows.push(cur); }
  return rows;
}
function rowsToObjects(rows){
  if (!rows.length) return [];
  const header = rows[0].map(h=>h.trim());
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i], obj={};
    for(let j=0;j<header.length;j++) obj[header[j]] = (r[j] ?? "").trim();
    out.push(obj);
  }
  return out;
}

/* ===== Nama Title Case + Saran ===== */
function formatName(raw){
  if (!raw) return "";
  const lower=String(raw).trim().toLowerCase();
  const smallWords=new Set(["bin","binti","ibn","al","as","ash","af","el","de","del","della","da","di","la","le","van","von","der","den","of","and","&"]);
  return lower.split(/\s+/).map((w,i)=> smallWords.has(w)&&i!==0 ? w : w.replace(/(^|[-'’`])\p{L}/gu, m=>m.toUpperCase())).join(" ");
}
function createNameSuggestions(fullName, maxLength){
  const clean = fullName.replace(/\s+/g," ").trim();
  if (!clean || clean.length<=maxLength) return [];
  const words=clean.split(" ");
  if (words.length<=2){
    const last = words[words.length-1]||"";
    const remain = Math.max(1, maxLength - (words[0].length+1));
    return [`${words[0]} ${last.slice(0, remain)}`.trim()];
  }
  const set=new Set();
  for (let i=words.length-2;i>0;i--){
    const tmp=[...words]; tmp[i]=`${tmp[i][0].toUpperCase()}.`;
    const s=tmp.join(" "); if (s.length<=maxLength) set.add(s);
  }
  { const s=[words[0], ...words.slice(1,-1).map(w=>`${w[0].toUpperCase()}.`), words.at(-1)].join(" "); if (s.length<=maxLength) set.add(s); }
  { const s=`${words[0]} ${words.at(-1)}`; if (s.length<=maxLength) set.add(s); }
  if (!set.size){
    const last=words.at(-1); const s=`${words[0]} ${last[0].toUpperCase()}.`; if (s.length<=maxLength) set.add(s);
  }
  return Array.from(set).sort((a,b)=> b.length-a.length);
}

/* ===== Negara → Kode ISO + Bendera ===== */
function countryToISO2(nameRaw){
  if(!nameRaw) return null;
  const n = String(nameRaw).trim().toLowerCase();
  const map = {
    "indonesia":"id",
    "malaysia":"my",
    "australia":"au",
    "jepang":"jp",
    "korea selatan":"kr","korea":"kr",
    "inggris":"gb","uk":"gb","inggris (uk)":"gb","britania raya":"gb",
    "belanda":"nl","jerman":"de","prancis":"fr","perancis":"fr",
    "kanada":"ca","selandia baru":"nz","new zealand":"nz"
  };
  return map[n] || null;
}
function setCountryFlag(countryName){
  const code = countryToISO2(countryName);
  if (countryFlag){
    if (code){
      countryFlag.src = `https://flagcdn.com/h40/${code}.png`;
      countryFlag.alt = `Bendera ${countryName}`;
      countryFlag.title = countryName || "";
    }else{
      countryFlag.removeAttribute("src");
      countryFlag.alt = "Bendera tidak tersedia";
      countryFlag.title = countryName || "";
    }
  }
  if (countryVal) countryVal.textContent = countryName || "";
}

/* ===== SVG TEXT OVERLAY ===== */
function measureTextPx(text, {sizePx, weight=400, italic=false, family="Raleway"}){
  const italicStr = italic ? "italic " : "";
  ctx.font = `${italicStr}${weight} ${sizePx}px ${family}, system-ui, sans-serif`;
  return ctx.measureText(text).width;
}
function wrapWordsToWidth(text, maxWidth, fontSpec){
  const words=String(text||"").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines=[]; let line="";
  for (const w of words){
    const test=line ? `${line} ${w}` : w;
    if (measureTextPx(test, fontSpec) <= maxWidth){ line=test; }
    else{
      if (!line){
        let chunk=""; for(const ch of w){ const t2=chunk+ch; if (measureTextPx(t2,fontSpec)<=maxWidth) chunk=t2; else { lines.push(chunk); chunk=ch; } }
        line=chunk;
      }else{ lines.push(line); line=w; }
    }
  }
  if (line) lines.push(line);
  return lines;
}
function applyMultiline(svgDoc, textEl, lines, {sizePx, lineHeightEm=1.2}){
  const NS="http://www.w3.org/2000/svg";
  const x=parseFloat(textEl.getAttribute("x")||"540");
  const y=parseFloat(textEl.getAttribute("y")||"0");

  while (textEl.firstChild) textEl.removeChild(textEl.firstChild);

  const blockPx = sizePx*lineHeightEm*(lines.length-1);
  const firstY = y - blockPx/2;
  lines.forEach((line,i)=>{
    const t = svgDoc.createElementNS(NS,"tspan");
    t.setAttribute("x", String(x));
    if (i===0) t.setAttribute("y", String(firstY));
    else t.setAttribute("dy", `${lineHeightEm}em`);
    t.textContent=line;
    textEl.appendChild(t);
  });
}
function buildOverlayFromTemplate(svgString, payload){
  const doc=new DOMParser().parseFromString(svgString,"image/svg+xml");
  const nameEl=doc.getElementById("nameText");
  if (nameEl) nameEl.textContent = payload.name || "";
  const univEl=doc.getElementById("univText");
  if (univEl){
    const spec={sizePx:36, weight:500, italic:false, family:"Raleway"};
    const lines=wrapWordsToWidth(payload.univ||"", UNIV_MAX_W, spec);
    applyMultiline(doc, univEl, lines, {sizePx:36, lineHeightEm:1.2});
  }
  const prodiEl=doc.getElementById("prodiText");
  if (prodiEl){
    const spec={sizePx:24, weight:400, italic:false, family:"Raleway"};
    const lines=wrapWordsToWidth(payload.prodi||"", PRODI_MAX_W, spec);
    applyMultiline(doc, prodiEl, lines, {sizePx:24, lineHeightEm:1.2});
  }
  return new XMLSerializer().serializeToString(doc);
}
function disposeOverlay(){ if (overlayUrl) URL.revokeObjectURL(overlayUrl); overlayUrl=null; overlayImg=null; }
async function ensureTextOverlayUpToDate(){
  if (!textTplRaw){
    try{ textTplRaw = await fetchText(TEXT_SVG_TEMPLATE); }
    catch(e){ console.warn("Gagal memuat text-template.svg:", e.message); disposeOverlay(); return; }
  }
  const name = getDisplayName();
  const univ = selected ? (selected["University"] || rowUnivInput?.value || "") : (rowUnivInput?.value || "");
  const prodi= selected ? (selected["Program of Study"] || rowProdiInput?.value || "") : (rowProdiInput?.value || "");
  const key  = [name,univ,prodi].join("||");
  if (overlayImg?.dataset?.key === key) return;

  try{
    if ("fonts" in document) await document.fonts.ready;
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
const getDisplayName = ()=> currentDisplayName || (selected ? formatName(selected["Full Name"]||"") : "");

/* ===== HINTS (tanpa badge teks) ===== */
const lenWithSpaces  = (s)=> String(s||"").length;
const lenWithoutSpcs = (s)=> String(s||"").replace(/\s+/g,"").length;

function setMeta(el, html, ok){
  if (!el) return;
  el.classList.remove("meta-ok","meta-bad");
  el.classList.add(ok ? "meta-ok" : "meta-bad");
  el.innerHTML = html;
}
function updateNameHint(){
  const v   = getDisplayName() || "";
  const n   = lenWithSpaces(v);
  const lim = LIMITS.nameWithSpaces;
  const ok  = n > 0 && n <= lim;

  setMeta(
    nameHint,
    ok
      ? `Saat ini: <strong>${n}</strong> / ${lim} karakter.`
      : `Terlalu panjang: <strong>${n}</strong> / ${lim}. Perlu disingkat.`,
    ok
  );

  if (btnEditName) btnEditName.hidden = n <= lim;

  // UI label nama: wrap jadi 2 baris bila panjang // NEW
  if (rowNameVal){
    rowNameVal.innerHTML = wrapNameForBox(v, LIMITS.nameWithSpaces);
  }

  setNameBoxClass(ok); // highlight hijau/merah
}
function updateUnivHint(){
  const v = rowUnivInput?.value || "";
  const n = lenWithSpaces(v), lim = LIMITS.univWithSpaces;
  const ok = n>0 && n<=lim;
  setMeta(univHint, ok ? `Saat ini: <strong>${n}</strong> / ${lim} karakter.`
                       : `Melebihi batas ideal (<strong>${n}</strong> / ${lim}).`, ok);
}
function updateProdiHint(){
  const v = rowProdiInput?.value || "";
  const n = lenWithoutSpcs(v), lim = LIMITS.prodiNoSpaces;
  const ok = n>0 && n<=lim;
  setMeta(prodiHint, ok ? `Saat ini: <strong>${n}</strong> / ${lim} karakter.`
                        : `Melebihi batas ideal (<strong>${n}</strong> / ${lim}).`, ok);
}
function updateAllHints(){ updateNameHint(); updateUnivHint(); updateProdiHint(); }

/* pasang class dasar untuk span nama */
rowNameVal?.classList.add("name-box");

/* ===== FILTER CHIPS (DRAWER) ===== */
function uniqSorted(items){
  return [...new Set(items.filter(Boolean))].sort((a,b)=> String(a).localeCompare(String(b)));
}
function renderChips(container, list){
  if (!container) return;
  container.innerHTML="";
  list.forEach(val=>{
    const b=document.createElement("button");
    b.className="chip";
    b.type="button";
    b.textContent = val;
    b.setAttribute("aria-pressed","false");
    b.addEventListener("click", ()=>{
      const on = b.getAttribute("aria-pressed")==="true";
      b.setAttribute("aria-pressed", String(!on));
    });
    container.appendChild(b);
  });
}
function collectChipSelections(){
  const selected = {Kelompok:[], Negara:[]};
  chipsKelompok && chipsKelompok.querySelectorAll('.chip[aria-pressed="true"]').forEach(b=> selected.Kelompok.push(b.textContent));
  chipsNegara   && chipsNegara  .querySelectorAll('.chip[aria-pressed="true"]').forEach(b=> selected.Negara.push(b.textContent));
  return selected;
}
function applyDrawerFilters(){
  const pick = collectChipSelections();
  FILTERS.Kelompok = new Set(pick.Kelompok);
  FILTERS.Negara   = new Set(pick.Negara);
  renderOptions();
}
function resetDrawerFiltersUI(){
  document.querySelectorAll('#drawer .chip').forEach(b=> b.setAttribute("aria-pressed","false"));
  FILTERS.Kelompok.clear(); FILTERS.Negara.clear();
  renderOptions();
}
function passesFilters(rec){
  const okGroup  = FILTERS.Kelompok.size===0 || FILTERS.Kelompok.has(rec.Kelompok || "");
  const okNegara = FILTERS.Negara.size===0   || FILTERS.Negara.has(rec.Negara || "");
  return okGroup && okNegara;
}

/* ===== INIT ===== */
(async function init(){
  let csvInfo = "(DATA dari window.DATA)";
  // Muat data jika perlu
  if (!DATA.length){
    try{
      const { text, url: csvUsed } = await fetchFirstAvailable(CSV_CANDIDATES);
      const rows = parseCSV(text);
      const objs = rowsToObjects(rows);
      DATA = objs.map(o=>{
        const fullName = o["Full Name"] || o["Nama Lengkap"] || o["Nama"] || o["Name"] || "";
        const univ     = o["University"]  || o["Universitas"] || o["Afiliasi"] || "";
        const prodi    = o["Program of Study"] || o["Program"] || o["Prodi"] || o["Jurusan"] || "";
        const group    = o["Kelompok"] || o["Group"] || o["Group/Team"] || "";
        const negara   = o["Negara Tujuan"] || o["Negara"] || o["Country"] || o["Destination Country"] || "";
        const degree   = o["Jenis Gelar"] || o["Jenjang"] || o["Degree"] || "";
        return {
          "Full Name": fullName,
          "University": univ,
          "Program of Study": prodi,
          "Kelompok": group,
          "Negara": negara,
          "Negara Tujuan": negara,
          "Jenjang": degree,
          "Jenis Gelar": degree
        };
      });
      csvInfo = `(CSV: ${csvUsed.split('/').pop()})`;
    }catch(e){ console.warn("Gagal memuat CSV:", e.message); }
  }else{
    // Normalisasi bila DATA berasal dari file JS
    DATA = DATA.map(rec=>{
      const negara = rec["Negara Tujuan"] || rec["Negara"] || rec["Country"] || "";
      const degree = rec["Jenis Gelar"] || rec["Jenjang"] || rec["Degree"] || "";
      return { ...rec,
        "Negara": negara,
        "Negara Tujuan": negara,
        "Jenjang": degree,
        "Jenis Gelar": degree
      };
    });
  }

  dataStatus && (dataStatus.textContent = `Data (${DATA.length} baris) ${csvInfo}`);

  // Seed chips dari data
  renderChips(chipsKelompok, uniqSorted(DATA.map(r=>r.Kelompok)));
  renderChips(chipsNegara,   uniqSorted(DATA.map(r=>r.Negara)));

  // Drawer actions
  btnReset && btnReset.addEventListener("click", resetDrawerFiltersUI);
  btnApply && btnApply.addEventListener("click", ()=>{
    applyDrawerFilters();
    btnCloseDrawer?.click(); // tutup drawer
  });

  // Isi select nama & datalist
  renderOptions();

  // Pilih default pertama
  if (nameSelect && nameSelect.options.length){
    const rec = DATA.find(r=> String(r["Full Name"]).trim() === String(nameSelect.value).trim()) || DATA[0];
    if (rec) chooseRecord(rec);
  }

  // Frame default
  try{ frameImg = await loadImageUrl(FRAME_SVG); }
  catch(e1){
    console.warn("Frame SVG gagal, fallback PNG:", e1.message);
    try{ frameImg = await loadImageUrl(FRAME_PNG); } catch(e2){ console.warn("Frame PNG juga gagal:", e2.message); }
  }
  centerPhoto(true); draw();

  if ("fonts" in document) {
    document.fonts.ready.then(async ()=>{ await ensureTextOverlayUpToDate(); draw(); });
    document.fonts.addEventListener?.("loadingdone", async ()=>{ await ensureTextOverlayUpToDate(); draw(); });
  }
  window.addEventListener("load", draw);

  // Koreksi foto
  brightnessRange?.addEventListener("input", ()=>{ brightness = +brightnessRange.value; draw(); });
  contrastRange  ?.addEventListener("input", ()=>{ contrast   = +contrastRange.value;   draw(); });
  saturationRange?.addEventListener("input", ()=>{ saturation = +saturationRange.value; draw(); });
  detailBoostChk ?.addEventListener("change",()=>{ detailBoost = detailBoostChk.checked; draw(); });

  // Panduan
  showGuidesChk?.addEventListener("change", ()=>{ showGuides = !!showGuidesChk.checked; draw(); });

  // Search ketik
  searchInput && searchInput.addEventListener("input", ()=>{
    renderOptions();
    const exact = DATA.find(r=> String(r["Full Name"]).trim() === String(searchInput.value).trim());
    if (exact) chooseRecord(exact);
  });

  // Edit buttons (Prodi/Univ toggles)
  if (btnEditProdi){
    btnEditProdi.addEventListener("click", ()=>{
      const ro = rowProdiInput.readOnly;
      rowProdiInput.readOnly = !ro;
      if (!rowProdiInput.readOnly) rowProdiInput.focus();
    });
  }
  if (btnEditUniv){
    btnEditUniv.addEventListener("click", ()=>{
      const ro = rowUnivInput.readOnly;
      rowUnivInput.readOnly = !ro;
      if (!rowUnivInput.readOnly) rowUnivInput.focus();
    });
  }
  // Input change → update overlay & hints
  rowProdiInput?.addEventListener("input", async ()=>{
    if (!selected) return;
    selected["Program of Study"] = rowProdiInput.value || "";
    updateProdiHint(); await ensureTextOverlayUpToDate(); draw();
  });
  rowUnivInput?.addEventListener("input", async ()=>{
    if (!selected) return;
    selected["University"] = rowUnivInput.value || "";
    updateUnivHint(); await ensureTextOverlayUpToDate(); draw();
  });

  // Edit Nama (dropdown saran)
  btnEditName?.addEventListener("click", ()=>{
    rowNameEdit.hidden = !rowNameEdit.hidden;
    if (!rowNameEdit.hidden) rowNameSelect?.focus();
  });
  rowNameSelect?.addEventListener("change", async ()=>{
    currentDisplayName = rowNameSelect.value || getDisplayName();
    updateNameHint();
    await ensureTextOverlayUpToDate(); draw();
    if (lenWithSpaces(currentDisplayName) <= LIMITS.nameWithSpaces){
      rowNameEdit.hidden = true;
      btnEditName.hidden = true;
    }
  });

  // Hints awal
  updateAllHints();
})();

/* ===== Options (nama) ===== */
function renderOptions(){
  if (!nameSelect) return;
  const q=(searchInput?.value||"").toLowerCase().trim();

  const filtered = DATA
    .filter(r=> passesFilters(r) && (!q || String(r["Full Name"]).toLowerCase().includes(q)))
    .sort((a,b)=> String(a["Full Name"]).localeCompare(String(b["Full Name"])));

  nameSelect.innerHTML=""; if (nameList) nameList.innerHTML="";
  filtered.forEach(r=>{
    const val=String(r["Full Name"]||"").trim(); if (!val) return;
    const opt=document.createElement("option"); opt.value=val; opt.textContent=val; nameSelect.appendChild(opt);
    if (nameList){ const dl=document.createElement("option"); dl.value=val; nameList.appendChild(dl); }
  });
}

/* ===== Choose record + siapkan UI ===== */
async function chooseRecord(rec){
  selected = rec;
  const originalName = formatName(rec["Full Name"]||"");

  // isi toolbar search
  if (searchInput) searchInput.value = originalName;

  // isi fields (readonly default)
  rowUnivInput && (rowUnivInput.value = rec["University"]||"");
  rowProdiInput && (rowProdiInput.value = rec["Program of Study"]||"");

  // Jenjang & Negara (statis)
  const gelar  = rec["Jenis Gelar"] || rec["Jenjang"] || rec["Degree"] || "";
  const negara = rec["Negara Tujuan"] || rec["Negara"] || rec["Country"] || "";
  degreeVal && (degreeVal.textContent = gelar || "—");
  setCountryFlag(negara);

  // tampilan nama + tombol edit (muncul kalau > 34)
  currentDisplayName = originalName;
  if (rowNameVal){
    // tampilkan versi wrap utk UI // NEW
    rowNameVal.innerHTML = wrapNameForBox(currentDisplayName, LIMITS.nameWithSpaces);
  }
  if (btnEditName) btnEditName.hidden = lenWithSpaces(originalName) <= LIMITS.nameWithSpaces;

  // siapkan dropdown saran (hanya saat perlu)
  if (rowNameSelect){
    rowNameSelect.innerHTML = "";
    const suggestions = createNameSuggestions(originalName, MAX_NAME_CHARS);
    const base = document.createElement("option");
    base.value = originalName; base.textContent = `${originalName} (Nama Asli)`;
    rowNameSelect.appendChild(base);
    suggestions.forEach(s=>{
      const o=document.createElement("option"); o.value=s; o.textContent=s; rowNameSelect.appendChild(o);
    });
    rowNameSelect.value = originalName;
    rowNameEdit && (rowNameEdit.hidden = true);
  }

  updateAllHints();
  await ensureTextOverlayUpToDate();
  draw();
}

/* ===== File upload ===== */
async function handleIncomingFile(f){
  if (!f) return;
  if (f.size > MAX_MB*1024*1024){ showToast(`Ukuran maksimal ${MAX_MB} MB.`,"error"); return; }
  if (!acceptedFile(f)){ showToast("Hanya menerima PNG/JPEG. HEIC/HEIF/GIF ditolak.","error"); return; }

  try{
    photoImg = await loadImage(f);
    centerPhoto(true);
    if (uploadList){
      const li=document.createElement("li");
      li.textContent = f.name;
      uploadList.prepend(li);
    }
    showToast("File diterima. Siap diedit.","ok");
    draw();
  }catch(e){ console.warn(e); showToast("Gagal memuat gambar.","error"); }
}
photoInput && photoInput.addEventListener("change", async (e)=>{
  const f=e.target.files?.[0] || null;
  if(!f){ photoImg=null; draw(); return; }
  handleIncomingFile(f);
});

/* ===== Editor foto ===== */
function centerPhoto(keepScale=true){
  if (!keepScale) photoScale=1.0;
  photoOffsetX=0; photoOffsetY=0;
  zoomRange && (zoomRange.value=Math.round(photoScale*100));
  offsetXRange && (offsetXRange.value=0);
  offsetYRange && (offsetYRange.value=0);

  brightness=100; contrast=100; saturation=100; detailBoost=false;
  brightnessRange && (brightnessRange.value=100);
  contrastRange   && (contrastRange.value=100);
  saturationRange && (saturationRange.value=100);
  detailBoostChk  && (detailBoostChk.checked=false);
}

zoomRange && zoomRange.addEventListener("input", ()=>{
  photoScale = clamp(parseInt(zoomRange.value,10)/100, MIN_SCALE, MAX_SCALE);
  $("#zoomBadge") && ($("#zoomBadge").textContent = `${Math.round(photoScale*100)}%`);
  draw();
});
offsetXRange && offsetXRange.addEventListener("input", ()=>{ photoOffsetX=parseInt(offsetXRange.value,10)||0; draw(); });
offsetYRange && offsetYRange.addEventListener("input", ()=>{ photoOffsetY=parseInt(offsetYRange.value,10)||0; draw(); });

resetPhotoBtn && resetPhotoBtn.addEventListener("click", ()=>{
  centerPhoto(false);              // reset transform & koreksi
  photoImg = null;                 // kosongkan gambar
  if (photoInput)  photoInput.value = "";
  if (uploadList)  uploadList.innerHTML = "";
  draw();
});

let dragging=false, sx=0, sy=0, sox=0, soy=0;
stage && stage.addEventListener("mousedown",(e)=>{
  if (e.target.id==="c"){ dragging=true; sx=e.clientX; sy=e.clientY; sox=photoOffsetX; soy=photoOffsetY; }
});
window.addEventListener("mousemove",(e)=>{
  if(!dragging) return;
  const dx=e.clientX-sx, dy=e.clientY-sy;
  photoOffsetX=sox+dx; photoOffsetY=soy+dy;
  offsetXRange && (offsetXRange.value=Math.round(photoOffsetX));
  offsetYRange && (offsetYRange.value=Math.round(photoOffsetY));
  draw();
});
window.addEventListener("mouseup",()=> dragging=false);

stage && stage.addEventListener("wheel",(e)=>{
  if(e.target.id!=="c") return;
  e.preventDefault();
  const rect=canvas.getBoundingClientRect();
  const cx=(e.clientX-rect.left)*(canvas.width/rect.width);
  const cy=(e.clientY-rect.top )*(canvas.height/rect.height);
  const zoomFactor = e.deltaY<0 ? 1.05 : 0.95;
  const newScale   = clamp(photoScale*zoomFactor, MIN_SCALE, MAX_SCALE);
  const ratio = newScale/photoScale;
  photoOffsetX = cx - ratio*(cx-photoOffsetX);
  photoOffsetY = cy - ratio*(cy-photoOffsetY);
  photoScale   = newScale;
  zoomRange && (zoomRange.value=Math.round(photoScale*100));
  $("#zoomBadge") && ($("#zoomBadge").textContent = `${Math.round(photoScale*100)}%`);
  offsetXRange && (offsetXRange.value=Math.round(photoOffsetX));
  offsetYRange && (offsetYRange.value=Math.round(photoOffsetY));
  draw();
},{passive:false});

/* ===== Guide drawing ===== */
function drawLabel(ctx,x,y,text,color,side='right'){
  ctx.save();
  ctx.font = "700 20px Inter, system-ui, sans-serif";
  ctx.textBaseline="middle";
  ctx.textAlign = side==='right' ? "left" : "right";
  ctx.lineWidth=4; ctx.strokeStyle="rgba(0,0,0,.55)"; ctx.strokeText(text,x,y);
  ctx.fillStyle=color; ctx.fillText(text,x,y);
  ctx.restore();
}
function drawGuides(ctx){
  if (!showGuides || !photoImg) return;
  const {cx,cy,r}=GUIDE;

  // lingkaran & safe area
  ctx.save();
  ctx.strokeStyle=COLORS.circle; ctx.setLineDash([8,8]); ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,r*0.82,0,Math.PI*2); ctx.stroke();
  ctx.restore();

  const xL = cx - r*0.95, xR = cx + r*0.95;

  // Mata
  const eyeY = cy - r*0.33;
  ctx.save(); ctx.strokeStyle=COLORS.eyes; ctx.setLineDash([10,8]); ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(xL,eyeY); ctx.lineTo(xR,eyeY); ctx.stroke(); ctx.restore();
  drawLabel(ctx, cx - r*0.9, eyeY, "Mata", COLORS.eyes, "right");

  // Wajah (ellipse)
  ctx.save(); ctx.translate(cx,cy); ctx.setLineDash([12,10]); ctx.lineWidth=3; ctx.strokeStyle=COLORS.face;
  ctx.scale(0.72,1.0); ctx.beginPath(); ctx.arc(0,-r*0.02, r*0.75, 0, Math.PI*2); ctx.stroke(); ctx.restore();
  drawLabel(ctx, cx - r*0.9, cy - r*0.02, "Wajah", COLORS.face, "right");

  // Pundak
  const shoulderY = cy + r*0.35;
  ctx.save(); ctx.strokeStyle=COLORS.shoulder; ctx.setLineDash([10,8]); ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(xL,shoulderY); ctx.lineTo(xR,shoulderY); ctx.stroke(); ctx.restore();
  drawLabel(ctx, cx - r*0.9, shoulderY, "Pundak", COLORS.shoulder, "right");

  // sumbu bantu
  ctx.save(); ctx.strokeStyle="rgba(255,255,255,.45)"; ctx.setLineDash([6,10]); ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx, cy-r); ctx.lineTo(cx, cy+r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx-r, cy); ctx.lineTo(cx+r, cy); ctx.stroke();
  ctx.restore();
}

/* ===== Render & Download ===== */
function draw(forExport=false){
  if (!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#000"; ctx.fillRect(0,0,canvas.width,canvas.height);

  if (photoImg){
    ctx.save();
    const b=(brightness/100).toFixed(3), c=(contrast/100).toFixed(3), s=(saturation/100).toFixed(3);
    const db = detailBoost ? " contrast(1.06) saturate(1.04)" : "";
    ctx.filter=`brightness(${b}) contrast(${c}) saturate(${s})${db}`;
    ctx.translate(photoOffsetX, photoOffsetY); ctx.scale(photoScale, photoScale);

    const w=canvas.width, h=canvas.height;
    const ir = photoImg.width/photoImg.height, r=w/h;
    let dw,dh,dx,dy;
    if (ir>r){ dh=h; dw=dh*ir; } else { dw=w; dh=dw/ir; }
    dx=(w-dw)/2/photoScale; dy=(h-dh)/2/photoScale;
    ctx.drawImage(photoImg, dx,dy,dw,dh);
    ctx.restore(); ctx.filter="none";
  }else{
    ctx.fillStyle="#222"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#bbb"; ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font="600 48px Inter, sans-serif"; ctx.fillText("Upload foto…", canvas.width/2, canvas.height/2);
  }

  if (!forExport) drawGuides(ctx);
  if (frameImg)   ctx.drawImage(frameImg,0,0,canvas.width,canvas.height);
  if (overlayImg) ctx.drawImage(overlayImg,0,0,canvas.width,canvas.height);
  if (DEBUG){ ctx.strokeStyle="rgba(255,0,0,.35)"; ctx.strokeRect(0,0,canvas.width,canvas.height); }
}
window.addEventListener("resize", draw);

downloadBtn && downloadBtn.addEventListener("click", ()=>{
  try{
    draw(true);
    canvas.toBlob((blob)=>{
      if(!blob) return;
      const url=URL.createObjectURL(blob);
      const safe=(selected ? (formatName(selected["Full Name"])||"twibbon") : "twibbon").replace(/[^a-z0-9\- ]/gi,"_");
      const a=document.createElement("a"); a.href=url; a.download=safe+".png";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      draw(false);
    },"image/png");
  }catch(err){ console.error(err); alert("Gagal mengunduh gambar. Coba lagi ya."); }
});

/* ===== Range cosmetics ===== */
(function enhanceRanges(){
  const ranges = [
    {el: $("#zoomRange"),       badge: $("#zoomBadge"),       suffix: "%"},
    {el: $("#offsetXRange")},
    {el: $("#offsetYRange")},
    {el: $("#brightnessRange"), badge: $("#brightnessBadge"), suffix: "%"},
    {el: $("#contrastRange"),   badge: $("#contrastBadge"),   suffix: "%"},
    {el: $("#saturationRange"), badge: $("#saturationBadge"), suffix: "%"},
  ].filter(r=>r.el);
  function setFill(r){
    const el=r.el, min=+el.min||0, max=+el.max||100, val=+el.value;
    const pct=((val-min)/(max-min))*100;
    el.style.setProperty("--val", pct.toFixed(2));
    if (r.badge) r.badge.textContent = r.suffix ? `${val}${r.suffix}` : String(val);
  }
  ranges.forEach(r=>{ setFill(r); r.el.addEventListener("input",()=>setFill(r)); r.el.addEventListener("change",()=>setFill(r)); });
})();

/* ===== Events: select nama ===== */
nameSelect && nameSelect.addEventListener("change", ()=>{
  const rec = DATA.find(r=> String(r["Full Name"]).trim() === String(nameSelect.value).trim());
  if (rec) chooseRecord(rec);
});
