(() => {
  const $ = (id) => document.getElementById(id);
  const emptyState = $('emptyState'), workspace = $('workspace'), fileInput = $('fileInput');
  const photoCanvas = $('photoCanvas'), outlineCanvas = $('outlineCanvas'), drawCanvas = $('drawCanvas');
  const pctx = photoCanvas.getContext('2d', {willReadFrequently:true});
  const octx = outlineCanvas.getContext('2d');
  const dctx = drawCanvas.getContext('2d');
  let image = null, imageData = null, drawing = false, last = null, erasing = false, eyedropperMode = false;
  let history = [], historyIndex = -1, previewing = false;

  const state = {photoOpacity:.35, outline:true, threshold:55, brushSize:14, autoColor:true, color:'#2a2a2a'};

  function toast(msg){const el=$('toast'); el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1300)}

  function fitDimensions(w,h){const max=1400; const s=Math.min(1,max/Math.max(w,h)); return {w:Math.max(1,Math.round(w*s)),h:Math.max(1,Math.round(h*s))}}
  function setupCanvas(w,h){
    [photoCanvas,outlineCanvas,drawCanvas].forEach(c=>{c.width=w;c.height=h});
    $('canvasWrap').style.aspectRatio=`${w}/${h}`;
    dctx.lineCap='round';dctx.lineJoin='round';
  }
  function loadImage(img){
    image=img; const dim=fitDimensions(img.naturalWidth||img.width,img.naturalHeight||img.height); setupCanvas(dim.w,dim.h);
    pctx.clearRect(0,0,dim.w,dim.h);pctx.drawImage(img,0,0,dim.w,dim.h);imageData=pctx.getImageData(0,0,dim.w,dim.h);
    applyPhotoOpacity();generateOutline();dctx.clearRect(0,0,dim.w,dim.h);history=[];historyIndex=-1;pushHistory();
    emptyState.classList.add('hidden');workspace.classList.remove('hidden');
  }
  function applyPhotoOpacity(){photoCanvas.style.opacity=previewing?'0':String(state.photoOpacity)}
  function generateOutline(){
    if(!imageData)return; const {width:w,height:h,data}=imageData; const gray=new Float32Array(w*h);
    for(let i=0,j=0;i<data.length;i+=4,j++) gray[j]=.299*data[i]+.587*data[i+1]+.114*data[i+2];
    const out=octx.createImageData(w,h), od=out.data, t=state.threshold;
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
      const i=y*w+x;
      const gx=-gray[i-w-1]+gray[i-w+1]-2*gray[i-1]+2*gray[i+1]-gray[i+w-1]+gray[i+w+1];
      const gy=-gray[i-w-1]-2*gray[i-w]-gray[i-w+1]+gray[i+w-1]+2*gray[i+w]+gray[i+w+1];
      const mag=Math.sqrt(gx*gx+gy*gy), k=i*4;
      if(mag>t){od[k]=28;od[k+1]=28;od[k+2]=28;od[k+3]=150}else{od[k+3]=0}
    }
    octx.clearRect(0,0,w,h);octx.putImageData(out,0,0);outlineCanvas.style.opacity=state.outline&&!previewing?'1':'0';
  }
  function colorAt(x,y){
    if(!imageData)return state.color; x=Math.max(0,Math.min(photoCanvas.width-1,Math.round(x)));y=Math.max(0,Math.min(photoCanvas.height-1,Math.round(y)));
    const i=(y*photoCanvas.width+x)*4,d=imageData.data; return `rgb(${d[i]},${d[i+1]},${d[i+2]})`;
  }
  function pointFromEvent(e){const r=drawCanvas.getBoundingClientRect();return {x:(e.clientX-r.left)*drawCanvas.width/r.width,y:(e.clientY-r.top)*drawCanvas.height/r.height}}
  function stroke(a,b){
    dctx.save(); dctx.lineWidth=state.brushSize*(drawCanvas.width/drawCanvas.getBoundingClientRect().width);
    if(erasing){dctx.globalCompositeOperation='destination-out';dctx.strokeStyle='rgba(0,0,0,1)'}else{dctx.globalCompositeOperation='source-over';dctx.strokeStyle=state.autoColor?colorAt(b.x,b.y):state.color}
    dctx.beginPath();dctx.moveTo(a.x,a.y);dctx.lineTo(b.x,b.y);dctx.stroke();dctx.restore();
  }
  function pushHistory(){
    if(historyIndex<history.length-1)history=history.slice(0,historyIndex+1);
    history.push(dctx.getImageData(0,0,drawCanvas.width,drawCanvas.height)); if(history.length>25)history.shift(); else historyIndex++;
    if(history.length>25)historyIndex=history.length-1; updateUndoRedo();
  }
  function restoreHistory(idx){if(!history[idx])return;dctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);dctx.putImageData(history[idx],0,0);historyIndex=idx;updateUndoRedo()}
  function updateUndoRedo(){$('undoBtn').disabled=historyIndex<=0;$('redoBtn').disabled=historyIndex>=history.length-1}
  function clearDrawing(){dctx.clearRect(0,0,drawCanvas.width,drawCanvas.height);pushHistory()}

  drawCanvas.addEventListener('pointerdown',e=>{
    if(!image)return; const p=pointFromEvent(e);
    if(eyedropperMode){state.color=rgbToHex(colorAt(p.x,p.y));$('colorPicker').value=state.color;eyedropperMode=false;$('eyedropperBtn').classList.remove('active');toast('色を取得しました');return}
    drawing=true;last=p;drawCanvas.setPointerCapture(e.pointerId);stroke(p,p);
  });
  drawCanvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=pointFromEvent(e);stroke(last,p);last=p});
  drawCanvas.addEventListener('pointerup',()=>{if(drawing){drawing=false;pushHistory()}});
  drawCanvas.addEventListener('pointercancel',()=>{drawing=false});

  function rgbToHex(rgb){const m=rgb.match(/\d+/g);if(!m)return'#2a2a2a';return'#'+m.slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join('')}
  function readFile(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>loadImage(img);img.src=reader.result};reader.readAsDataURL(file)}
  fileInput.addEventListener('change',e=>readFile(e.target.files[0]));

  $('photoOpacity').addEventListener('input',e=>{state.photoOpacity=+e.target.value/100;$('photoOpacityValue').textContent=e.target.value+'%';applyPhotoOpacity()});
  $('outlineToggle').addEventListener('change',e=>{state.outline=e.target.checked;outlineCanvas.style.opacity=state.outline&&!previewing?'1':'0'});
  $('outlineStrength').addEventListener('input',e=>{state.threshold=+e.target.value;$('outlineStrengthValue').textContent=e.target.value;generateOutline()});
  $('brushSize').addEventListener('input',e=>{state.brushSize=+e.target.value;$('brushSizeValue').textContent=e.target.value+'px'});
  $('autoColorToggle').addEventListener('change',e=>{state.autoColor=e.target.checked;$('manualColorRow').classList.toggle('hidden',state.autoColor)});
  $('colorPicker').addEventListener('input',e=>state.color=e.target.value);
  $('eraserBtn').addEventListener('click',()=>{erasing=!erasing;$('eraserBtn').classList.toggle('active',erasing)});
  $('eyedropperBtn').addEventListener('click',()=>{eyedropperMode=!eyedropperMode;$('eyedropperBtn').classList.toggle('active',eyedropperMode);toast(eyedropperMode?'写真上をタップ':'スポイト解除')});
  $('undoBtn').addEventListener('click',()=>{if(historyIndex>0)restoreHistory(historyIndex-1)});
  $('redoBtn').addEventListener('click',()=>{if(historyIndex<history.length-1)restoreHistory(historyIndex+1)});
  $('clearBtn').addEventListener('click',()=>{clearDrawing();toast('描画をクリアしました')});
  $('previewBtn').addEventListener('click',()=>{previewing=!previewing;applyPhotoOpacity();outlineCanvas.style.opacity=state.outline&&!previewing?'1':'0';$('previewBtn').textContent=previewing?'ガイドに戻る':'作品だけ見る'});
  $('saveBtn').addEventListener('click',()=>{
    const c=document.createElement('canvas');c.width=drawCanvas.width;c.height=drawCanvas.height;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(drawCanvas,0,0);
    const a=document.createElement('a');a.download='trace-art.png';a.href=c.toDataURL('image/png');a.click();toast('PNGを書き出しました');
  });
  $('resetBtn').addEventListener('click',()=>{workspace.classList.add('hidden');emptyState.classList.remove('hidden');fileInput.value='';image=null;imageData=null;previewing=false});

  function demoDataURL(){
    const c=document.createElement('canvas');c.width=960;c.height=640;const g=c.getContext('2d');
    const sky=g.createLinearGradient(0,0,0,430);sky.addColorStop(0,'#8fc5e8');sky.addColorStop(.65,'#f0c28e');sky.addColorStop(1,'#d88863');g.fillStyle=sky;g.fillRect(0,0,c.width,c.height);
    g.fillStyle='#506b58';g.fillRect(0,430,960,210);g.fillStyle='#f6f1e6';g.fillRect(80,210,800,280);g.fillStyle='#607986';for(let x=120;x<840;x+=135)g.fillRect(x,250,90,105);
    g.fillStyle='#303436';g.fillRect(0,485,960,10);g.fillStyle='#2b3440';g.fillRect(0,520,960,120);
    g.fillStyle='#1c1e21';g.beginPath();g.arc(390,420,35,0,Math.PI*2);g.fill();g.fillRect(365,452,50,115);g.fillStyle='#303438';g.fillRect(350,565,25,75);g.fillRect(405,565,25,75);
    g.fillStyle='rgba(255,255,255,.45)';g.fillRect(0,0,960,22);return c.toDataURL('image/png');
  }
  $('demoBtn').addEventListener('click',()=>{const img=new Image();img.onload=()=>loadImage(img);img.src=demoDataURL()});
  if(new URLSearchParams(location.search).get('demo')==='1')setTimeout(()=>$('demoBtn').click(),20);
})();
