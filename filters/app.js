(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const emptyState = $('emptyState');
  const workspace = $('workspace');
  const bottomBar = $('bottomBar');
  const loading = $('loading');

  let sourceCanvas = document.createElement('canvas');
  let sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  let hasImage = false;
  let showingOriginal = false;
  let history = [];

  const state = {
    preset: '3ds',
    intensity: 0.7,
    dateStamp: false,
    flashBoost: false,
  };

  const presetMeta = {
    '3ds': {
      name: '3DS',
      note: '低解像度・色数制限・少しの寒色感・ノイズで3DSらしい画質に寄せます。'
    },
    disposable: {
      name: '写ルンです',
      note: '粒子・暖色寄りの色・周辺減光・少しの白飛びで使い捨てカメラ風にします。'
    },
    digicam: {
      name: '2000s デジカメ',
      note: 'CCDっぽい彩度・シャープ感・青緑寄りの色・低解像度感を加えます。'
    }
  };

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 1300);
  }

  function fitSize(w, h) {
    const max = 1400;
    const s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }

  function loadImage(img) {
    const d = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
    sourceCanvas.width = canvas.width = d.w;
    sourceCanvas.height = canvas.height = d.h;
    sourceCtx.clearRect(0, 0, d.w, d.h);
    sourceCtx.drawImage(img, 0, 0, d.w, d.h);
    hasImage = true;
    emptyState.classList.add('hidden');
    workspace.classList.remove('hidden');
    bottomBar.classList.remove('hidden');
    history = [];
    applyPreset(true);
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

  function setPreset(preset, pushHistory = true) {
    if (state.preset === preset) return;
    if (pushHistory) history.push({ ...state });
    state.preset = preset;
    document.querySelectorAll('.preset-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.preset === preset));
    $('presetName').textContent = presetMeta[preset].name;
    $('presetNote').textContent = presetMeta[preset].note;
    $('undoBtn').disabled = history.length === 0;
    applyPreset();
  }

  function applyPreset(skipLoading = false) {
    if (!hasImage) return;
    if (!skipLoading) loading.classList.remove('hidden');
    requestAnimationFrame(() => {
      if (showingOriginal) {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(sourceCanvas,0,0);
        loading.classList.add('hidden');
        return;
      }
      const temp = document.createElement('canvas');
      temp.width = sourceCanvas.width;
      temp.height = sourceCanvas.height;
      const tctx = temp.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(sourceCanvas, 0, 0);

      if (state.preset === '3ds') render3DS(temp, tctx);
      if (state.preset === 'disposable') renderDisposable(temp, tctx);
      if (state.preset === 'digicam') renderDigicam(temp, tctx);

      blendWithOriginal(temp);
      loading.classList.add('hidden');
    });
  }

  function blendWithOriginal(processed) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.globalAlpha = 1;
    ctx.drawImage(sourceCanvas,0,0);
    ctx.globalAlpha = state.intensity;
    ctx.drawImage(processed,0,0);
    ctx.globalAlpha = 1;
    if (state.dateStamp) drawDateStamp(ctx, state.preset);
  }

  function render3DS(temp, tctx) {
    const w=temp.width,h=temp.height;
    const small=document.createElement('canvas');
    const sw=Math.max(120,Math.round(w*0.34)), sh=Math.max(90,Math.round(h*0.34));
    small.width=sw; small.height=sh;
    const sctx=small.getContext('2d',{willReadFrequently:true});
    sctx.imageSmoothingEnabled=true;
    sctx.drawImage(sourceCanvas,0,0,sw,sh);
    let img=sctx.getImageData(0,0,sw,sh),d=img.data;
    for(let i=0;i<d.length;i+=4){
      let r=d[i],g=d[i+1],b=d[i+2];
      const y=(r+g+b)/3;
      r = r*0.94 + y*0.06;
      g = g*1.01;
      b = b*1.04;
      r = Math.round(r/8)*8;
      g = Math.round(g/8)*8;
      b = Math.round(b/8)*8;
      const n=(Math.random()-.5)*10;
      d[i]=clamp(r+n); d[i+1]=clamp(g+n); d[i+2]=clamp(b+n+2);
    }
    sctx.putImageData(img,0,0);
    tctx.clearRect(0,0,w,h);
    tctx.imageSmoothingEnabled=false;
    tctx.drawImage(small,0,0,w,h);
    softOverlay(tctx,w,h,'rgba(18,40,46,.08)');
  }

  function renderDisposable(temp, tctx) {
    const w=temp.width,h=temp.height;
    let img=tctx.getImageData(0,0,w,h),d=img.data;
    for(let i=0;i<d.length;i+=4){
      let r=d[i],g=d[i+1],b=d[i+2];
      r=(r-128)*1.08+128; g=(g-128)*1.03+128; b=(b-128)*0.98+128;
      r*=1.05; g*=1.015; b*=0.95;
      const grain=(Math.random()-.5)*22;
      d[i]=clamp(r+grain); d[i+1]=clamp(g+grain*.85); d[i+2]=clamp(b+grain*.75);
    }
    tctx.putImageData(img,0,0);
    addVignette(tctx,w,h,0.34);
    addLightLeak(tctx,w,h);
    if(state.flashBoost) addFlash(tctx,w,h,.32);
  }

  function renderDigicam(temp, tctx) {
    const w=temp.width,h=temp.height;
    const small=document.createElement('canvas');
    const sw=Math.max(220,Math.round(w*0.56)), sh=Math.max(165,Math.round(h*0.56));
    small.width=sw; small.height=sh;
    const sctx=small.getContext('2d',{willReadFrequently:true});
    sctx.drawImage(sourceCanvas,0,0,sw,sh);
    let img=sctx.getImageData(0,0,sw,sh),d=img.data;
    for(let i=0;i<d.length;i+=4){
      let r=d[i],g=d[i+1],b=d[i+2];
      const avg=(r+g+b)/3;
      const sat=1.16;
      r=avg+(r-avg)*sat; g=avg+(g-avg)*sat; b=avg+(b-avg)*sat;
      r=(r-128)*1.07+128; g=(g-128)*1.09+128; b=(b-128)*1.1+128;
      g*=1.015; b*=1.03;
      const n=(Math.random()-.5)*8;
      d[i]=clamp(r+n); d[i+1]=clamp(g+n); d[i+2]=clamp(b+n);
    }
    sctx.putImageData(img,0,0);
    tctx.clearRect(0,0,w,h);
    tctx.imageSmoothingEnabled=true;
    tctx.drawImage(small,0,0,w,h);
    sharpenApprox(tctx,w,h);
    if(state.flashBoost) addFlash(tctx,w,h,.18);
  }

  function clamp(v){return Math.max(0,Math.min(255,v));}

  function softOverlay(c,w,h,color){c.save();c.fillStyle=color;c.fillRect(0,0,w,h);c.restore();}

  function addVignette(c,w,h,strength){
    c.save();
    const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.18,w/2,h/2,Math.max(w,h)*.72);
    g.addColorStop(0,'rgba(0,0,0,0)');
    g.addColorStop(.6,'rgba(0,0,0,0)');
    g.addColorStop(1,`rgba(0,0,0,${strength})`);
    c.fillStyle=g;c.fillRect(0,0,w,h);c.restore();
  }

  function addLightLeak(c,w,h){
    c.save();
    const g=c.createLinearGradient(0,0,w*.38,h);
    g.addColorStop(0,'rgba(255,95,35,.16)');
    g.addColorStop(.35,'rgba(255,170,70,.05)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g;c.fillRect(0,0,w,h);c.restore();
  }

  function addFlash(c,w,h,alpha){
    c.save();
    const g=c.createRadialGradient(w*.5,h*.42,0,w*.5,h*.42,Math.max(w,h)*.62);
    g.addColorStop(0,`rgba(255,255,245,${alpha})`);
    g.addColorStop(.45,`rgba(255,248,228,${alpha*.35})`);
    g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g;c.fillRect(0,0,w,h);c.restore();
  }

  function sharpenApprox(c,w,h){
    const base=document.createElement('canvas'); base.width=w;base.height=h;
    const bctx=base.getContext('2d'); bctx.drawImage(c.canvas,0,0);
    c.save(); c.globalCompositeOperation='overlay'; c.globalAlpha=.08; c.drawImage(base,-1,0); c.drawImage(base,1,0); c.restore();
  }

  function drawDateStamp(c,preset){
    const now=new Date();
    const yy=String(now.getFullYear()).slice(-2), mm=String(now.getMonth()+1).padStart(2,'0'), dd=String(now.getDate()).padStart(2,'0');
    const text=`${yy} ${mm} ${dd}`;
    c.save();
    c.font=`700 ${Math.max(18,canvas.width*.026)}px monospace`;
    c.textAlign='right'; c.textBaseline='bottom';
    c.fillStyle=preset==='3ds'?'rgba(230,235,220,.85)':'rgba(255,148,52,.95)';
    c.shadowColor='rgba(0,0,0,.35)'; c.shadowBlur=2;
    c.fillText(text,canvas.width*.96,canvas.height*.95); c.restore();
  }

  function showOriginal(show){
    if(!hasImage)return;
    showingOriginal=show;
    if(show){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(sourceCanvas,0,0);}
    else applyPreset(true);
  }

  function saveImage(){
    if(!hasImage)return;
    const a=document.createElement('a');
    a.download=`photo-shift-${state.preset}.png`;
    a.href=canvas.toDataURL('image/png');
    a.click();
    toast('保存しました');
  }

  function undo(){
    if(!history.length)return;
    const prev=history.pop();
    state.preset=prev.preset; state.intensity=prev.intensity; state.dateStamp=prev.dateStamp; state.flashBoost=prev.flashBoost;
    $('intensity').value=Math.round(state.intensity*100);$('intensityValue').textContent=`${Math.round(state.intensity*100)}%`;
    $('dateStamp').checked=state.dateStamp;$('flashBoost').checked=state.flashBoost;
    document.querySelectorAll('.preset-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.preset===state.preset));
    $('presetName').textContent=presetMeta[state.preset].name;$('presetNote').textContent=presetMeta[state.preset].note;
    $('undoBtn').disabled=history.length===0;
    applyPreset();
  }

  function demoDataURL(){
    const c=document.createElement('canvas');c.width=1000;c.height=750;const g=c.getContext('2d');
    const sky=g.createLinearGradient(0,0,0,500);sky.addColorStop(0,'#5f8fbd');sky.addColorStop(.55,'#d9c2a2');sky.addColorStop(1,'#f0a35d');g.fillStyle=sky;g.fillRect(0,0,c.width,c.height);
    g.fillStyle='#2f3842';g.fillRect(0,500,1000,250);g.fillStyle='#1b2026';g.fillRect(0,570,1000,180);
    g.fillStyle='#f2dfb4';g.beginPath();g.arc(760,425,54,0,Math.PI*2);g.fill();
    g.fillStyle='#d9d7cf';g.fillRect(80,310,520,34);g.fillStyle='#a4a7aa';g.fillRect(120,344,420,16);
    return c.toDataURL('image/png');
  }

  $('fileInput').addEventListener('change',e=>readFile(e.target.files[0]));
  $('emptyFileInput').addEventListener('change',e=>readFile(e.target.files[0]));
  $('demoBtn').addEventListener('click',()=>{const img=new Image();img.onload=()=>loadImage(img);img.src=demoDataURL();});
  document.querySelectorAll('.preset-tab').forEach(btn=>btn.addEventListener('click',()=>setPreset(btn.dataset.preset)));
  $('intensity').addEventListener('input',e=>{history.push({...state});if(history.length>20)history.shift();state.intensity=+e.target.value/100;$('intensityValue').textContent=`${e.target.value}%`;$('undoBtn').disabled=false;applyPreset();});
  $('dateStamp').addEventListener('change',e=>{history.push({...state});state.dateStamp=e.target.checked;$('undoBtn').disabled=false;applyPreset();});
  $('flashBoost').addEventListener('change',e=>{history.push({...state});state.flashBoost=e.target.checked;$('undoBtn').disabled=false;applyPreset();});
  $('undoBtn').addEventListener('click',undo);
  $('saveBtn').addEventListener('click',saveImage);

  const compareStart=()=>showOriginal(true), compareEnd=()=>showOriginal(false);
  $('compareBtn').addEventListener('pointerdown',compareStart);$('compareBtn').addEventListener('pointerup',compareEnd);$('compareBtn').addEventListener('pointercancel',compareEnd);$('compareBtn').addEventListener('pointerleave',compareEnd);
  $('originalBtn').addEventListener('pointerdown',compareStart);$('originalBtn').addEventListener('pointerup',compareEnd);$('originalBtn').addEventListener('pointercancel',compareEnd);$('originalBtn').addEventListener('pointerleave',compareEnd);
})();
