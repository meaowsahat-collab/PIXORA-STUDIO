'use strict';
/* PIXORA / IXORA Studio v2.1 — offline manual photo editor */
const $=s=>document.querySelector(s),canvas=$('#canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const MAX_EDGE=4096;

/* ---------- adjustments ---------- */
const ADJ={
  brightness:['Brightness',-100,100],contrast:['Contrast',-100,100],saturation:['Saturation',-100,100],exposure:['Exposure',-100,100],
  temperature:['Temperature',-100,100],tint:['Tint',-100,100],highlights:['Highlights',-100,100],shadows:['Shadows',-100,100],
  vibrance:['Vibrance',-100,100],hue:['Hue',-100,100],fade:['Fade',0,100],sharpness:['Sharpness',0,100],grain:['Grain',0,100],edge:['Edge Darken',-100,100]
};
const ADJ_KEYS=Object.keys(ADJ);
const zeroAdjust=()=>Object.fromEntries(ADJ_KEYS.map(k=>[k,0]));
const hasAdjust=a=>ADJ_KEYS.some(k=>a[k]);

/* ---------- state ---------- */
let base=null,photoName='ixora-photo',layers=[],undoStack=[],future=[],activeTool='',panel='all',adjust=zeroAdjust(),
  drawMode='',pointerState=null,adjustmentSnapshot=false,dressImage=null,dress={x:.25,y:.25,w:.5,h:.5,opacity:1},toastTimer,
  previewOverride=null,restoreSource=null,originalRestore=null,selection=[],overlay=null,renderQueued=false,bgSeed=null;

const defs=[
['photo','Photo Editor','Crop','crop'],['photo','Photo Editor','Rotate','rotate'],['photo','Photo Editor','Flip','flip'],['photo','Photo Editor','Layers','layers'],['photo','Photo Editor','Draw','draw'],['photo','Photo Editor','Eraser','eraser'],['photo','Photo Editor','Text','text'],['photo','Photo Editor','Shapes','shapes'],
['adjust','Image Adjust','All Adjustments','adjustAll'],
...ADJ_KEYS.map(k=>['adjust','Image Adjust',ADJ[k][0],k]),
['filters','Filters','Vintage','vintage'],['filters','Filters','HDR-style','hdr'],['filters','Filters','B&W','bw'],['filters','Filters','Film','film'],['filters','Filters','Sepia','sepia'],['filters','Filters','Noir','noir'],['filters','Filters','Warm','warm'],['filters','Filters','Cool','cool'],['filters','Filters','Cinematic','cinematic'],['filters','Filters','Vivid','vivid'],['filters','Filters','Sunset','sunset'],['filters','Filters','Invert','invert'],['filters','Filters','Blur','blur'],['filters','Filters','Vignette','vignette'],['filters','Filters','Pixelate','pixelate'],
['background','Background','Auto Remove BG','autoBg'],['background','Background','Magic Wand','magicWand'],['background','Background','Manual Selection','selection'],['background','Background','Erase Background','bgErase'],['background','Background','Restore Eraser','restore'],['background','Background','Background Color','bgFill'],
['image','Image Tools','Resize','resize'],['image','Image Tools','Compress','compress'],['image','Image Tools','Convert','convert'],['image','Image Tools','Watermark','watermark'],['image','Image Tools','Border','border'],['image','Image Tools','Collage','collage'],
['batch','Batch Tools','Batch Resize','batchResize'],['batch','Batch Tools','Batch Convert','batchConvert'],['batch','Batch Tools','Batch Rename','batchRename'],
['files','File Tools','ZIP Extractor','zip'],['files','File Tools','File Manager','fileManager'],['files','File Tools','Download History','history'],
['dress','Manual Dress Editor','Add Clothing Layer','dressAdd'],['dress','Manual Dress Editor','Move / Resize Clothing','dressEdit'],['dress','Manual Dress Editor','Remove Clothing Layer','dressRemove']
];
const ICONS={crop:'⌗',rotate:'↻',flip:'⇋',layers:'▱',draw:'✎',eraser:'◩',text:'T',shapes:'◇',adjustAll:'☰',brightness:'☼',contrast:'◐',saturation:'◉',exposure:'☀',temperature:'♨',tint:'◍',highlights:'△',shadows:'▽',vibrance:'❖',hue:'◔',fade:'░',sharpness:'✧',grain:'∷',edge:'▣',
vintage:'◷',hdr:'▧',bw:'◑',film:'▤',sepia:'◈',noir:'●',warm:'☀',cool:'❄',cinematic:'▭',vivid:'✺',sunset:'◒',invert:'⊖',blur:'◌',vignette:'◉',pixelate:'▦',
autoBg:'✂',magicWand:'✦',selection:'⬡',bgErase:'⌫',restore:'↶',bgFill:'■',resize:'↗',compress:'⇩',convert:'⇄',watermark:'T',border:'▣',collage:'▦',batchResize:'▦',batchConvert:'⇄',batchRename:'✎',zip:'▣',fileManager:'▤',history:'◷',dressAdd:'＋',dressEdit:'↔',dressRemove:'×'};
const toolIcon=k=>ICONS[k]||'✦';

/* ---------- helpers ---------- */
function toast(s){let t=$('#toast');t.textContent=s;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function cloneCanvas(c){let n=document.createElement('canvas');n.width=c.width;n.height=c.height;n.getContext('2d',{willReadFrequently:true}).drawImage(c,0,0);return n}
function newCanvas(w,h){let n=document.createElement('canvas');n.width=w;n.height=h;return n}
function requirePhoto(){if(!base){toast('Open a photo first.');return false}return true}
function blobOf(c,type='image/png',q=.92){return new Promise(r=>c.toBlob(r,type,q))}
function canvasPos(e){let r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}}
function ensureRestoreSource(){if(!restoreSource||restoreSource.width!==base.width||restoreSource.height!==base.height)restoreSource=cloneCanvas(base)}

/* ---------- native (Android) save / share ---------- */
const Cap=window.Capacitor,isNative=!!(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform());
const FS=isNative?Cap.registerPlugin('Filesystem'):null,ShareP=isNative?Cap.registerPlugin('Share'):null;
function blobToBase64(blob){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function addDownload(name,type){try{let arr=JSON.parse(localStorage.getItem('ixoraDownloads')||'[]');arr.unshift({name,type,date:new Date().toISOString()});localStorage.setItem('ixoraDownloads',JSON.stringify(arr.slice(0,100)))}catch(e){}}
async function deliver(items){
  if(!items.length)return;
  if(isNative){
    try{
      const uris=[];
      for(const it of items){const r=await FS.writeFile({path:'ixora/'+it.name,data:await blobToBase64(it.blob),directory:'CACHE',recursive:true});uris.push(r.uri)}
      items.forEach(it=>addDownload(it.name,it.blob.type));
      await ShareP.share({title:'IXORA Studio',dialogTitle:'Save or share',files:uris});
      toast('Choose "Save to device" / Files / Gallery to keep it.');return;
    }catch(e){if(/cancel|dismiss/i.test(String(e&&e.message||e)))return;toast('Could not save: '+(e&&e.message||e));return}
  }
  for(const it of items){let url=URL.createObjectURL(it.blob),a=document.createElement('a');a.href=url;a.download=it.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);addDownload(it.name,it.blob.type)}
  toast(items.length>1?`${items.length} files downloaded.`:'Download ready: '+items[0].name);
}
const saveBlob=(blob,name)=>deliver([{blob,name}]);

/* ---------- history ---------- */
function snap(){return{base:cloneCanvas(base),layers:structuredClone(layers),adjust:{...adjust},dress:{...dress},dressImage}}
function snapshot(){if(!base)return;undoStack.push(snap());let limit=clamp(Math.floor(60e6/(base.width*base.height)),4,30);while(undoStack.length>limit)undoStack.shift();future=[];updateHistoryButtons()}
function updateHistoryButtons(){$('#undoBtn').disabled=!undoStack.length;$('#redoBtn').disabled=!future.length}
function undo(){if(!undoStack.length)return;future.push(snap());restoreState(undoStack.pop())}
function redo(){if(!future.length)return;undoStack.push(snap());restoreState(future.pop())}
function restoreState(s){base=s.base;layers=s.layers;adjust=s.adjust;dress=s.dress;dressImage=s.dressImage||null;previewOverride=null;render();updateHistoryButtons();renderLayerList();if(ADJ[activeTool]||activeTool==='adjustAll')selectTool(activeTool)}

/* ---------- pixel adjustment pipeline ---------- */
function processPixels(im,a){
  const d=im.data,w=im.width,h=im.height;
  const M=Math.pow(2,a.brightness/100)*Math.pow(2,a.exposure/50),cf=(100+a.contrast)/100,sh=a.shadows/100,hi=a.highlights/100,fd=a.fade/100;
  const lut=new Uint8ClampedArray(256);
  for(let i=0;i<256;i++){let v=i/255*M;v=(v-.5)*cf+.5;let vc=clamp(v,0,1);v+=sh*.4*(1-vc)*(1-vc)+hi*.4*vc*vc;v=v*(1-fd*.25)+fd*.25;lut[i]=Math.round(v*255)}
  const tr=a.temperature*.4+a.tint*.15,tg=-a.tint*.3,tb=-a.temperature*.4+a.tint*.15,doTone=a.temperature||a.tint;
  const sat=1+a.saturation/100,vib=a.vibrance/100,doColor=a.saturation||a.vibrance;
  const ang=a.hue*1.8*Math.PI/180,cs=Math.cos(ang),sn=Math.sin(ang),doHue=a.hue!==0;
  const m0=.213+cs*.787-sn*.213,m1=.715-cs*.715-sn*.715,m2=.072-cs*.072+sn*.928,m3=.213-cs*.213+sn*.143,m4=.715+cs*.285+sn*.140,m5=.072-cs*.072-sn*.283,m6=.213-cs*.213-sn*.787,m7=.715-cs*.715+sn*.715,m8=.072+cs*.928+sn*.072;
  const grain=a.grain*.9,edge=a.edge/100,cx=w/2,cy=h/2;
  for(let y=0,p=0;y<h;y++){
    for(let x=0;x<w;x++,p+=4){
      if(d[p+3]===0)continue;
      let r=lut[d[p]],g=lut[d[p+1]],b=lut[d[p+2]];
      if(doTone){r+=tr;g+=tg;b+=tb}
      if(doHue){let nr=r*m0+g*m1+b*m2,ng=r*m3+g*m4+b*m5,nb=r*m6+g*m7+b*m8;r=nr;g=ng;b=nb}
      if(doColor){let gray=.299*r+.587*g+.114*b,s=sat;if(vib){let mx=Math.max(r,g,b),mn=Math.min(r,g,b);s*=1+vib*(1-clamp((mx-mn)/255,0,1))}r=gray+(r-gray)*s;g=gray+(g-gray)*s;b=gray+(b-gray)*s}
      if(grain){let n=(Math.random()-.5)*grain;r+=n;g+=n;b+=n}
      if(edge){let dx=(x-cx)/cx,dy=(y-cy)/cy,rr=Math.min(1,Math.sqrt(dx*dx+dy*dy)/1.414),f=rr*rr*Math.abs(edge);if(edge>0){let k=1-f*.9;r*=k;g*=k;b*=k}else{r+=(255-r)*f*.9;g+=(255-g)*f*.9;b+=(255-b)*f*.9}}
      d[p]=r;d[p+1]=g;d[p+2]=b;
    }
  }
  if(a.sharpness>0)sharpenData(im,a.sharpness)
}
function sharpenData(im,amount){
  const d=im.data,w=im.width,h=im.height,s=new Uint8ClampedArray(d),k=amount/100*.9,c=1+4*k,w4=w*4;
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let i=(y*w+x)*4;if(!s[i+3])continue;for(let ch=0;ch<3;ch++)d[i+ch]=s[i+ch]*c-k*(s[i-4+ch]+s[i+4+ch]+s[i-w4+ch]+s[i+w4+ch])}
}
function adjustCanvas(src,a){let n=cloneCanvas(src),c=n.getContext('2d',{willReadFrequently:true}),im=c.getImageData(0,0,n.width,n.height);processPixels(im,a);c.putImageData(im,0,0);return n}

/* ---------- render ---------- */
function render(){
  if(!base)return;
  let src=previewOverride||base;
  if(canvas.width!==src.width||canvas.height!==src.height){canvas.width=src.width;canvas.height=src.height}
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(src,0,0);
  if(hasAdjust(adjust)){let im=ctx.getImageData(0,0,canvas.width,canvas.height);processPixels(im,adjust);ctx.putImageData(im,0,0)}
  layers.forEach(l=>drawLayer(ctx,l));
  if(dressImage&&dress.visible!==false){ctx.save();ctx.globalAlpha=dress.opacity;ctx.drawImage(dressImage,dress.x*canvas.width,dress.y*canvas.height,dress.w*canvas.width,dress.h*canvas.height);ctx.restore()}
  if(overlay)overlay(ctx);
  $('#canvasHint').textContent=`${canvas.width} × ${canvas.height} · ${photoName}`;
}
function scheduleRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render()})}
function renderClean(){const o=overlay;overlay=null;render();overlay=o}
function flat(){renderClean();return cloneCanvas(canvas)}
function commitBase(n,keepRestore=false){base=n;layers=[];adjust=zeroAdjust();dressImage=null;previewOverride=null;if(!keepRestore)restoreSource=null;render()}
function drawLayer(c,l){
  c.save();c.globalAlpha=l.opacity??1;
  if(l.type==='text'){c.fillStyle=l.color;c.font=`${l.weight||'normal'} ${l.size}px ${l.font||'Arial'}`;c.textAlign=l.align||'left';c.fillText(l.text,l.x,l.y)}
  else if(l.type==='shape'){c.strokeStyle=l.color;c.fillStyle=l.color;c.lineWidth=l.lineWidth||5;if(l.shape==='line'){c.beginPath();c.moveTo(l.x,l.y);c.lineTo(l.x2,l.y2);c.stroke()}else if(l.shape==='circle'){c.beginPath();c.ellipse(l.x+l.w/2,l.y+l.h/2,Math.abs(l.w/2),Math.abs(l.h/2),0,0,Math.PI*2);l.fill?c.fill():c.stroke()}else{c.beginPath();c.rect(l.x,l.y,l.w,l.h);l.fill?c.fill():c.stroke()}}
  else if(l.type==='stroke'){c.strokeStyle=l.color;c.lineWidth=l.size;c.lineCap='round';c.lineJoin='round';c.beginPath();l.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(l.points.length===1)c.lineTo(l.points[0].x+.01,l.points[0].y);c.stroke()}
  c.restore();
}

/* ---------- opening a photo ---------- */
function loadImage(file){return new Promise((resolve,reject)=>{let url=URL.createObjectURL(file),im=new Image();im.onload=()=>{URL.revokeObjectURL(url);resolve(im)};im.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Image could not be decoded'))};im.src=url})}
$('#fileInput').addEventListener('change',async e=>{
  let f=e.target.files[0];e.target.value='';if(!f)return;
  try{
    let im=await loadImage(f),w=im.naturalWidth,h=im.naturalHeight,s=Math.min(1,MAX_EDGE/Math.max(w,h));w=Math.max(1,Math.round(w*s));h=Math.max(1,Math.round(h*s));
    base=newCanvas(w,h);base.getContext('2d',{willReadFrequently:true}).drawImage(im,0,0,w,h);
    photoName=f.name.replace(/\.[^.]+$/,'')||'ixora-photo';layers=[];adjust=zeroAdjust();dressImage=null;restoreSource=null;previewOverride=null;undoStack=[];future=[];bgSeed=null;
    canvas.hidden=false;$('.empty-state').hidden=true;originalRestore=cloneCanvas(base);$('#downloadBtn').disabled=false;$('#resetBtn').disabled=false;
    render();updateHistoryButtons();selectTool('adjustAll');
    toast(s<1?`Photo opened (scaled to ${w}×${h} for speed).`:'Photo opened locally.');
    if(window.innerWidth<=1050)setTimeout(()=>$('.stage').scrollIntoView({behavior:'smooth',block:'start'}),50);
  }catch(err){toast(err.message)}
});

/* ---------- tool list ---------- */
function setPanel(p){panel=p;document.querySelectorAll('.side-link').forEach(b=>b.classList.toggle('active',b.dataset.panel===p));renderTools()}
document.querySelectorAll('.side-link').forEach(b=>b.addEventListener('click',()=>setPanel(b.dataset.panel)));$('#toolSearch').addEventListener('input',renderTools);
function renderTools(){
  let q=$('#toolSearch').value.trim().toLowerCase(),groups={};
  defs.filter(d=>(panel==='all'||panel===d[0])&&d[2].toLowerCase().includes(q)).forEach(d=>(groups[d[1]]??=[]).push(d));
  $('#toolGroups').innerHTML=Object.entries(groups).map(([name,items])=>`<div class="group"><div class="group-title"><i></i>${name}</div><div class="tools-grid">${items.map(d=>`<button class="tool-card ${activeTool===d[3]?'selected':''}" data-tool="${d[3]}"><b class="tool-icon">${toolIcon(d[3])}</b><span>${d[2]}</span></button>`).join('')}</div></div>`).join('')||'<p class="muted">No matching tools.</p>';
  document.querySelectorAll('.tool-card').forEach(b=>b.addEventListener('click',()=>{selectTool(b.dataset.tool);focusInspector()}));
}
function focusInspector(){if(window.innerWidth<=1050)setTimeout(()=>$('.inspector').scrollIntoView({behavior:'smooth',block:'start'}),30)}
function syncStageHeight(){let s=$('.stage');if(s)document.documentElement.style.setProperty('--stage-h',s.offsetHeight+'px')}
if(window.ResizeObserver)new ResizeObserver(syncStageHeight).observe($('.stage'));window.addEventListener('resize',syncStageHeight);

/* ---------- control builders ---------- */
function control(label,id,type='number',value='',extra=''){return `<div class="control"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${value}" ${extra}></div>`}
function range(label,id,min,max,val,step=1){return `<div class="control"><label for="${id}">${label} <output id="${id}Out">${val}</output></label><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}"></div>`}
function button(id,text,cls='primary'){return `<button class="${cls}" id="${id}">${text}</button>`}
function select(label,id,opts){return `<div class="control"><label for="${id}">${label}</label><select id="${id}">${opts.map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>`}
function check(label,id,on=true){return `<label class="check"><input type="checkbox" id="${id}" ${on?'checked':''}> ${label}</label>`}
function show(html){$('#inspectorContent').innerHTML=html}
function onRange(id,fn){let r=$('#'+id);if(!r)return;r.addEventListener('input',()=>{let o=$('#'+id+'Out');if(o)o.textContent=r.value;fn(+r.value)})}
const on=(id,fn)=>{let e=$('#'+id);if(e)e.onclick=fn};

function resetTools(){
  drawMode='';pointerState=null;selection=[];overlay=null;
  canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=canvas.onclick=null;
  canvas.style.cursor='default';canvas.style.touchAction='pan-y';
  adjustmentSnapshot=false;
  if(previewOverride){previewOverride=null}
  if(base)render();
}
function selectTool(k){
  activeTool=k;resetTools();renderTools();
  $('#canvasTitle').textContent=defs.find(d=>d[3]===k)?.[2]||'Editor';$('#toolStatus').textContent='READY';
  if(['zip','fileManager','history','batchResize','batchConvert','batchRename','collage'].includes(k)){toolAction(k);return}
  if(['dressAdd','dressEdit','dressRemove'].includes(k)){dressAction(k);return}
  if(!requirePhoto()){show('<p class="muted">Open a photo to use this tool.</p>');return}
  if(k==='adjustAll'||ADJ[k])return adjustTool(k);
  if(FILTER_IDS.includes(k))return filterTool(k);
  if(k==='autoBg')return autoBgTool();
  if(k==='magicWand')return wandTool();
  if(k==='bgFill')return bgFillTool();
  if(k==='crop')return cropTool();
  let html='';
  if(k==='rotate'||k==='flip')html=`<p class="muted">Transform the complete image. Transparent areas are preserved.</p><div class="inline-actions">${button('turnLeft','↶ 90°','ghost')}${button('turnRight','↷ 90°','ghost')}</div><div class="inline-actions">${button('flipH','Flip horizontal','ghost')}${button('flipV','Flip vertical','ghost')}</div>`;
  else if(k==='layers')html=`<p class="muted">Text, shapes, drawing and clothing are separate editable layers.</p>${button('addTextLayer','＋ Add text','ghost')}${button('addShapeLayer','＋ Add shape','ghost')}<div id="layerList" class="layer-list"></div>`;
  else if(k==='text')html=`${control('Text','layerText','text','Your text')}${select('Font','textFont',[['Arial','Arial'],['Georgia','Georgia'],['Impact','Impact'],['Courier New','Courier'],['Verdana','Verdana']])}${select('Weight','textWeight',[['normal','Normal'],['bold','Bold']])}${control('Font size (px)','textSize','number',Math.round(base.width/12),'min="8" max="1000"')}${control('Text color','textColor','color','#ffffff')}${range('Horizontal position (%)','textX',0,100,8)}${range('Vertical position (%)','textY',0,100,18)}${button('addText','Add text layer')}`;
  else if(k==='shapes')html=`${select('Shape','shapeType',[['rect','Rectangle'],['circle','Ellipse'],['line','Line']])}${control('Color','shapeColor','color','#9cf06b')}${check('Filled','shapeFill',false)}${range('Line width','shapeLine',1,60,5)}${range('X (%)','shapeX',0,100,20)}${range('Y (%)','shapeY',0,100,20)}${range('Width (%)','shapeW',1,100,40)}${range('Height (%)','shapeH',1,100,30)}${button('addShape','Add shape layer')}`;
  else if(k==='draw'||k==='eraser'||k==='bgErase'||k==='restore')html=`<p class="muted">${k==='bgErase'||k==='eraser'?'Paint over the area to erase it (creates transparency).':k==='restore'?'Paint over erased areas to bring the original pixels back.':'Drag on the image to draw.'}</p>${k==='draw'?control('Brush color','brushColor','color','#ffffff'):''}${range('Brush size','brushSize',1,150,24)}${button('startBrush',k==='draw'?'Enable drawing':k==='restore'?'Enable restore brush':'Enable eraser')}${button('stopBrush','Stop tool','ghost')}`;
  else if(k==='selection'||k==='transparent')html=`<p class="muted">Tap points around the subject. Tap the first point (or press Apply) to close the shape. The outside becomes transparent.</p>${check('Remove the inside instead','selInvert',false)}${button('startSelect','Start polygon selection')}${button('finishSelect','Apply selection')}${button('undoPoint','Remove last point','ghost')}${button('clearSelect','Cancel selection','ghost')}`;
  else if(k==='resize')html=`${control('Width (px)','resizeW','number',base.width,'min="1" max="12000"')}${control('Height (px)','resizeH','number',base.height,'min="1" max="12000"')}${check('Keep aspect ratio','keepRatio')}${button('doResize','Resize image')}`;
  else if(k==='compress')html=`${range('JPEG quality (%)','quality',10,100,82)}<p class="muted">JPEG export removes transparency (white background). Use PNG if you need transparency.</p>${button('doCompress','Compress & save')}`;
  else if(k==='convert')html=`${select('Output format','convertType',[['image/png','PNG'],['image/jpeg','JPEG'],['image/webp','WEBP']])}${button('doConvert','Convert & save')}`;
  else if(k==='watermark')html=`${control('Watermark text','watermarkText','text','IXORA Studio')}${control('Color','watermarkColor','color','#ffffff')}${range('Size','watermarkSize',12,300,Math.round(base.width/25))}${button('doWatermark','Add watermark')}`;
  else if(k==='border')html=`${control('Border color','borderColor','color','#ffffff')}${range('Border width (px)','borderWidth',1,250,24)}${button('doBorder','Add border')}`;
  show(html);bindCommon(k);if(k==='layers')renderLayerList();
}

/* ---------- adjustments UI ---------- */
function adjustTool(k){
  const keys=k==='adjustAll'?ADJ_KEYS:[k];
  const top=`${button('applyAdjust','Apply adjustments')}${button('resetAdjust',k==='adjustAll'?'Reset all':'Reset','ghost')}${k==='adjustAll'?button('autoEnhance','✦ Auto enhance','ghost'):''}`;
  show(`<p class="muted">Move a slider and watch the photo above. Apply to keep it.</p>${top}${keys.map(x=>range(ADJ[x][0],x,ADJ[x][1],ADJ[x][2],adjust[x])).join('')}`);
  keys.forEach(x=>onRange(x,v=>{if(!adjustmentSnapshot){snapshot();adjustmentSnapshot=true}adjust[x]=v;scheduleRender()}));
  const sync=()=>keys.forEach(x=>{$('#'+x).value=adjust[x];$('#'+x+'Out').textContent=adjust[x]});
  on('applyAdjust',()=>{if(!hasAdjust(adjust))return toast('Nothing to apply yet.');if(!adjustmentSnapshot)snapshot();base=adjustCanvas(base,adjust);adjust=zeroAdjust();adjustmentSnapshot=false;render();sync();toast('Adjustments applied.')});
  on('resetAdjust',()=>{if(hasAdjust(adjust)&&!adjustmentSnapshot)snapshot();keys.forEach(x=>adjust[x]=0);render();sync()});
  on('autoEnhance',()=>{
    snapshot();adjustmentSnapshot=false;
    let t=newCanvas(64,64),c=t.getContext('2d',{willReadFrequently:true});c.drawImage(base,0,0,64,64);let d=c.getImageData(0,0,64,64).data,sum=0,n=0,lo=255,hi=0;
    for(let i=0;i<d.length;i+=4){if(d[i+3]<20)continue;let l=.299*d[i]+.587*d[i+1]+.114*d[i+2];sum+=l;n++;lo=Math.min(lo,l);hi=Math.max(hi,l)}
    let mean=n?sum/n:128;adjust.brightness=Math.round(clamp((128-mean)/128*70,-40,50));adjust.contrast=Math.round(clamp((255-(hi-lo))/255*40+8,0,35));adjust.vibrance=18;adjust.saturation=6;adjust.sharpness=15;
    render();sync();toast('Auto enhance preview. Press Apply to keep.');
  });
}

/* ---------- filters ---------- */
const FILTERS={
  bw:(r,g,b,o)=>{let z=.299*r+.587*g+.114*b;o[0]=o[1]=o[2]=z},
  sepia:(r,g,b,o)=>{o[0]=.393*r+.769*g+.189*b;o[1]=.349*r+.686*g+.168*b;o[2]=.272*r+.534*g+.131*b},
  invert:(r,g,b,o)=>{o[0]=255-r;o[1]=255-g;o[2]=255-b},
  vintage:(r,g,b,o)=>{o[0]=r*.9+25;o[1]=g*.82+18;o[2]=b*.65+5},
  film:(r,g,b,o)=>{let z=.299*r+.587*g+.114*b;o[0]=z*.9+25;o[1]=g*.94+8;o[2]=b*.88+12},
  hdr:(r,g,b,o)=>{let z=.299*r+.587*g+.114*b,s=1.25;o[0]=((z+(r-z)*s)-128)*1.25+128;o[1]=((z+(g-z)*s)-128)*1.25+128;o[2]=((z+(b-z)*s)-128)*1.25+128},
  warm:(r,g,b,o)=>{o[0]=r*1.08+12;o[1]=g*1.02+4;o[2]=b*.9},
  cool:(r,g,b,o)=>{o[0]=r*.9;o[1]=g+3;o[2]=b*1.1+12},
  cinematic:(r,g,b,o)=>{let z=.299*r+.587*g+.114*b;o[0]=(r*1.1+(z>128?12:-6)-128)*1.12+128;o[1]=(g-128)*1.12+128;o[2]=(b*1.05+(z<128?14:-6)-128)*1.12+128},
  vivid:(r,g,b,o)=>{let z=.299*r+.587*g+.114*b;o[0]=((z+(r-z)*1.5)-128)*1.08+128;o[1]=((z+(g-z)*1.5)-128)*1.08+128;o[2]=((z+(b-z)*1.5)-128)*1.08+128},
  noir:(r,g,b,o)=>{let z=(.299*r+.587*g+.114*b-128)*1.4+118;o[0]=o[1]=o[2]=z},
  sunset:(r,g,b,o)=>{o[0]=r*1.15+20;o[1]=g*.95+6;o[2]=b*.78}
};
const FILTER_IDS=['vintage','hdr','bw','film','sepia','noir','warm','cool','cinematic','vivid','sunset','invert','blur','vignette','pixelate'];
function filterTool(k){
  const name=defs.find(d=>d[3]===k)[2];
  const extra=k==='blur'?range('Blur strength','fxValue',1,30,6):k==='vignette'?range('Vignette strength','fxValue',5,100,55):k==='pixelate'?range('Pixel size','fxValue',2,60,12):range('Strength (%)','fxValue',0,100,100);
  show(`<p class="muted">${name} — live preview. Apply to keep it.</p>${extra}${button('applyFx','Apply effect')}${button('cancelFx','Cancel preview','ghost')}`);
  const upd=()=>{previewOverride=applyFilter(k,+$('#fxValue').value);scheduleRender()};
  onRange('fxValue',upd);upd();
  on('applyFx',()=>{snapshot();let n=applyFilter(k,+$('#fxValue').value);previewOverride=null;base=n;render();toast('Effect applied.')});
  on('cancelFx',()=>{previewOverride=null;render()});
}
function applyFilter(k,v){
  const w=base.width,h=base.height,n=newCanvas(w,h),c=n.getContext('2d',{willReadFrequently:true});
  if(k==='blur'){c.filter=`blur(${v*Math.max(1,w/900)}px)`;c.drawImage(base,0,0);c.filter='none';return n}
  if(k==='pixelate'){const sz=Math.max(2,Math.round(v*Math.max(1,w/900))),sw=Math.max(1,Math.ceil(w/sz)),sh=Math.max(1,Math.ceil(h/sz)),t=newCanvas(sw,sh);t.getContext('2d').drawImage(base,0,0,sw,sh);c.imageSmoothingEnabled=false;c.drawImage(t,0,0,sw,sh,0,0,sw*sz,sh*sz);return n}
  c.drawImage(base,0,0);
  if(k==='vignette'){c.globalCompositeOperation='source-atop';const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.15,w/2,h/2,Math.max(w,h)*.7);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${v/100})`);c.fillStyle=g;c.fillRect(0,0,w,h);return n}
  const im=c.getImageData(0,0,w,h),d=im.data,f=FILTERS[k],m=v/100,o=[0,0,0];
  for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;let r=d[i],g=d[i+1],b=d[i+2];f(r,g,b,o);d[i]=r+(o[0]-r)*m;d[i+1]=g+(o[1]-g)*m;d[i+2]=b+(o[2]-b)*m}
  c.putImageData(im,0,0);return n;
}

/* ---------- crop ---------- */
function cropTool(){
  show(`<p class="muted">Pick a shape, then move/zoom the frame. The bright frame is what stays.</p>${select('Aspect ratio','cropRatio',[['free','Original'],['1:1','Square (1:1)'],['4:5','Portrait (4:5)'],['3:4','Portrait (3:4)'],['2:3','Portrait (2:3)'],['9:16','Story (9:16)'],['5:4','Landscape (5:4)'],['4:3','Landscape (4:3)'],['3:2','Photo (3:2)'],['16:9','Wide (16:9)'],['21:9','Cinema (21:9)']])}${range('Zoom (%)','cropZoom',100,400,100)}${range('Horizontal position (%)','cropX',0,100,50)}${range('Vertical position (%)','cropY',0,100,50)}${button('doCrop','Apply crop')}`);
  const rect=()=>{const r=$('#cropRatio').value,z=+$('#cropZoom').value/100,px=+$('#cropX').value/100,py=+$('#cropY').value/100;let W=base.width,H=base.height,w=W,h=H;if(r!=='free'){const [a,b]=r.split(':').map(Number),t=a/b;if(W/H>t)w=H*t;else h=W/t}w/=z;h/=z;return{x:(W-w)*px,y:(H-h)*py,w,h}};
  overlay=c=>{const r=rect();c.save();c.fillStyle='rgba(0,0,0,.6)';c.beginPath();c.rect(0,0,canvas.width,canvas.height);c.rect(r.x,r.y,r.w,r.h);c.fill('evenodd');c.strokeStyle='#9cf06b';c.lineWidth=Math.max(2,canvas.width/300);c.strokeRect(r.x,r.y,r.w,r.h);c.restore()};
  ['cropRatio','cropZoom','cropX','cropY'].forEach(id=>$('#'+id).addEventListener('input',()=>{let o=$('#'+id+'Out');if(o)o.textContent=$('#'+id).value;scheduleRender()}));
  render();
  on('doCrop',()=>{const r=rect();overlay=null;snapshot();const f=flat(),n=newCanvas(Math.max(1,Math.round(r.w)),Math.max(1,Math.round(r.h)));n.getContext('2d').drawImage(f,r.x,r.y,r.w,r.h,0,0,n.width,n.height);commitBase(n);toast('Crop applied.');selectTool('crop')});
}

/* ---------- background removal ---------- */
function boxBlur(a,w,h,r){
  if(r<1)return a;const t=new Uint8Array(a.length),o=new Uint8Array(a.length),k=2*r+1;
  for(let y=0;y<h;y++){let row=y*w,sum=0;for(let x=-r;x<=r;x++)sum+=a[row+clamp(x,0,w-1)];for(let x=0;x<w;x++){t[row+x]=sum/k;sum+=a[row+Math.min(w-1,x+r+1)]-a[row+Math.max(0,x-r)]}}
  for(let x=0;x<w;x++){let sum=0;for(let y=-r;y<=r;y++)sum+=t[clamp(y,0,h-1)*w+x];for(let y=0;y<h;y++){o[y*w+x]=sum/k;sum+=t[Math.min(h-1,y+r+1)*w+x]-t[Math.max(0,y-r)*w+x]}}
  return o;
}
function morph(a,w,h,r,dilate){
  const t=new Uint8Array(a.length),o=new Uint8Array(a.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=dilate?0:255;for(let dx=-r;dx<=r;dx++){let val=a[y*w+clamp(x+dx,0,w-1)];v=dilate?Math.max(v,val):Math.min(v,val)}t[y*w+x]=v}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=dilate?0:255;for(let dy=-r;dy<=r;dy++){let val=t[clamp(y+dy,0,h-1)*w+x];v=dilate?Math.max(v,val):Math.min(v,val)}o[y*w+x]=v}
  return o;
}
function kmeansBorder(samples,k){
  if(!samples.length)return[];
  const avg=[0,0,0];samples.forEach(s=>{avg[0]+=s[0];avg[1]+=s[1];avg[2]+=s[2]});avg.forEach((_,i)=>avg[i]/=samples.length);
  const dist=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  let cs=[avg.slice()];
  while(cs.length<k){let best=null,bd=-1;for(const s of samples){let md=Math.min(...cs.map(c=>dist(c,s)));if(md>bd){bd=md;best=s}}if(bd<400)break;cs.push(best.slice())}
  for(let it=0;it<6;it++){const sums=cs.map(()=>[0,0,0,0]);for(const s of samples){let bi=0,bd=1e9;cs.forEach((c,i)=>{let d=dist(c,s);if(d<bd){bd=d;bi=i}});let q=sums[bi];q[0]+=s[0];q[1]+=s[1];q[2]+=s[2];q[3]++}cs=cs.map((c,i)=>sums[i][3]?[sums[i][0]/sums[i][3],sums[i][1]/sums[i][3],sums[i][2]/sums[i][3]]:c)}
  // keep clusters that actually represent a part of the border
  const cnt=cs.map(()=>0);for(const s of samples){let bi=0,bd=1e9;cs.forEach((c,i)=>{let d=dist(c,s);if(d<bd){bd=d;bi=i}});cnt[bi]++}
  return cs.filter((_,i)=>cnt[i]>=samples.length*.06);
}
/* Detect the background from the photo edges, flood-fill it, clean up and return a new canvas with the background transparent. */
function autoRemoveBg(o){
  const W=base.width,H=base.height,s=Math.min(1,1000/Math.max(W,H)),w=Math.max(8,Math.round(W*s)),h=Math.max(8,Math.round(H*s));
  const t=newCanvas(w,h),tc=t.getContext('2d',{willReadFrequently:true});tc.drawImage(base,0,0,w,h);
  const d=tc.getImageData(0,0,w,h).data,N=w*h;
  let centers;
  if(bgSeed)centers=[bgSeed];
  else{const b=Math.max(1,Math.round(Math.min(w,h)*.02)),samples=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x<b||y<b||x>=w-b||y>=h-b){let i=(y*w+x)*4;if(d[i+3]>20)samples.push([d[i],d[i+1],d[i+2]])}}centers=kmeansBorder(samples,3)}
  const T2=(o.tol*2.2)**2;
  const bgLike=i=>{let p=i*4;if(d[p+3]<20)return true;for(const c of centers){if((d[p]-c[0])**2+(d[p+1]-c[1])**2+(d[p+2]-c[2])**2<=T2)return true}return false};
  const bg=new Uint8Array(N),stack=new Int32Array(N);let sp=0;
  const push=i=>{if(!bg[i]&&bgLike(i)){bg[i]=1;stack[sp++]=i}};
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  while(sp){let i=stack[--sp],x=i%w,y=(i-x)/w;if(x>0)push(i-1);if(x<w-1)push(i+1);if(y>0)push(i-w);if(y<h-1)push(i+w)}
  let fg=new Uint8Array(N);for(let i=0;i<N;i++)fg[i]=bg[i]?0:255;
  if(o.keep){
    const lab=new Int32Array(N),sizes=[0];let n=0;
    for(let i=0;i<N;i++){if(fg[i]&&!lab[i]){n++;lab[i]=n;let cnt=0;sp=0;stack[sp++]=i;while(sp){let j=stack[--sp];cnt++;let x=j%w,y=(j-x)/w;const nb=(q)=>{if(fg[q]&&!lab[q]){lab[q]=n;stack[sp++]=q}};if(x>0)nb(j-1);if(x<w-1)nb(j+1);if(y>0)nb(j-w);if(y<h-1)nb(j+w)}sizes[n]=cnt}}
    const maxS=Math.max(0,...sizes);for(let i=0;i<N;i++)if(fg[i]&&sizes[lab[i]]<Math.max(maxS*.12,N*.002))fg[i]=0;
  }
  if(o.shrink>0)fg=morph(fg,w,h,o.shrink,false);else if(o.shrink<0)fg=morph(fg,w,h,-o.shrink,true);
  fg=boxBlur(fg,w,h,Math.round(o.smooth));
  const mc=newCanvas(w,h),mctx=mc.getContext('2d'),mi=mctx.createImageData(w,h);
  for(let i=0;i<N;i++){mi.data[i*4+3]=fg[i]}
  mctx.putImageData(mi,0,0);
  const out=cloneCanvas(base),oc=out.getContext('2d');oc.globalCompositeOperation='destination-in';oc.imageSmoothingQuality='high';oc.drawImage(mc,0,0,W,H);
  return out;
}
function autoBgTool(){
  show(`<p class="muted">The app looks at the photo edges, finds the background colour and removes it automatically. If it cuts too much or too little, change <b>Sensitivity</b>, or tap the background to pick its colour.</p>${range('Sensitivity','bgTol',5,100,35)}${range('Edge smoothness','bgSmooth',0,8,1)}${range('Edge shrink (−) / grow (+)','bgShrink',-5,5,1)}${check('Keep main subject only','bgKeep')}${button('bgApply','Apply — keep result')}${button('bgPick','Tap to pick background colour','ghost')}${button('bgAuto','Auto-detect again','ghost')}${button('bgCancel','Cancel preview','ghost')}<p class="muted" id="bgNote">Working…</p>`);
  let timer;
  const opts=()=>({tol:+$('#bgTol').value,smooth:+$('#bgSmooth').value,shrink:+$('#bgShrink').value,keep:$('#bgKeep').checked});
  const run=()=>{clearTimeout(timer);timer=setTimeout(()=>{try{previewOverride=autoRemoveBg(opts());render();let n=$('#bgNote');if(n)n.textContent='Preview shown. Press Apply to keep it.'}catch(e){toast(e.message)}},120)};
  ['bgTol','bgSmooth','bgShrink'].forEach(id=>onRange(id,run));$('#bgKeep').onchange=run;
  on('bgApply',()=>{if(!previewOverride)return toast('Nothing to apply.');snapshot();ensureRestoreSource();const n=previewOverride;previewOverride=null;base=n;render();toast('Background removed. Use Restore Eraser to bring parts back.')});
  on('bgCancel',()=>{previewOverride=null;render()});
  on('bgAuto',()=>{bgSeed=null;run()});
  on('bgPick',()=>{toast('Tap the background on the photo.');canvas.style.cursor='crosshair';canvas.onclick=e=>{const p=canvasPos(e),x=clamp(Math.floor(p.x),0,base.width-1),y=clamp(Math.floor(p.y),0,base.height-1),px=base.getContext('2d',{willReadFrequently:true}).getImageData(x,y,1,1).data;bgSeed=[px[0],px[1],px[2]];canvas.onclick=null;canvas.style.cursor='default';run()}});
  run();
}
function wandTool(){
  show(`<p class="muted">Tap a part of the photo to remove similar colours. Tap again to remove more. Use Undo if it goes too far.</p>${range('Tolerance','wTol',1,100,30)}${range('Edge softness','wSoft',0,6,1)}${check('Only touching area (contiguous)','wContig')}`);
  canvas.style.cursor='crosshair';
  canvas.onclick=e=>{const p=canvasPos(e);wandErase(clamp(Math.floor(p.x),0,base.width-1),clamp(Math.floor(p.y),0,base.height-1),+$('#wTol').value,$('#wContig').checked,+$('#wSoft').value)};
}
function wandErase(sx,sy,tol,contig,soft){
  const w=base.width,h=base.height,bc=base.getContext('2d',{willReadFrequently:true}),im=bc.getImageData(0,0,w,h),d=im.data,N=w*h,si=(sy*w+sx)*4,sr=d[si],sg=d[si+1],sb=d[si+2],T2=(tol*2.2)**2;
  const sim=i=>{let p=i*4;return d[p+3]>0&&(d[p]-sr)**2+(d[p+1]-sg)**2+(d[p+2]-sb)**2<=T2};
  let mask=new Uint8Array(N);
  if(contig){const st=new Int32Array(N);let sp=0,s0=sy*w+sx;if(sim(s0)){mask[s0]=255;st[sp++]=s0}while(sp){let i=st[--sp],x=i%w,y=(i-x)/w;const nb=q=>{if(!mask[q]&&sim(q)){mask[q]=255;st[sp++]=q}};if(x>0)nb(i-1);if(x<w-1)nb(i+1);if(y>0)nb(i-w);if(y<h-1)nb(i+w)}}
  else for(let i=0;i<N;i++)if(sim(i))mask[i]=255;
  snapshot();ensureRestoreSource();
  mask=boxBlur(mask,w,h,Math.round(soft*Math.max(1,w/1000)));
  for(let i=0;i<N;i++)if(mask[i])d[i*4+3]=d[i*4+3]*(255-mask[i])/255;
  bc.putImageData(im,0,0);render();
}
function bgFillTool(){
  show(`<p class="muted">Put a solid colour behind the transparent parts of your photo.</p>${control('Colour','fillColor','color','#ffffff')}<div class="inline-actions">${button('fillWhite','White','ghost')}${button('fillBlack','Black','ghost')}${button('fillGreen','Green','ghost')}</div>${button('doFill','Apply background colour')}`);
  const set=c=>{$('#fillColor').value=c;preview()};
  const make=()=>{const n=newCanvas(base.width,base.height),c=n.getContext('2d');c.fillStyle=$('#fillColor').value;c.fillRect(0,0,n.width,n.height);c.drawImage(base,0,0);return n};
  const preview=()=>{previewOverride=make();render()};
  $('#fillColor').oninput=preview;on('fillWhite',()=>set('#ffffff'));on('fillBlack',()=>set('#000000'));on('fillGreen',()=>set('#00b140'));
  on('doFill',()=>{snapshot();const n=make();previewOverride=null;base=n;render();toast('Background colour applied.')});
  preview();
}

/* ---------- brushes ---------- */
function startBrush(mode){
  if(mode==='restore'&&!restoreSource){toast('Nothing has been erased yet.');return}
  drawMode=mode;if(mode==='eraser'||mode==='bgErase')ensureRestoreSource();
  canvas.style.cursor='crosshair';canvas.style.touchAction='none';
  const size=()=>+$('#brushSize').value*Math.max(1,canvas.width/700);
  const stamp=(a,b)=>{const c=base.getContext('2d'),r=size()/2,dist=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(dist/Math.max(1,r/3)));for(let i=0;i<=n;i++){const t=i/n,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;c.save();c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(mode==='restore'){c.clip();c.clearRect(x-r,y-r,2*r,2*r);c.drawImage(restoreSource,0,0)}else{c.globalCompositeOperation='destination-out';c.fill()}c.restore()}};
  canvas.onpointerdown=e=>{if(!drawMode)return;e.preventDefault();snapshot();const p=canvasPos(e);pointerState={last:p};if(mode==='draw'){pointerState.layer={type:'stroke',points:[p],color:$('#brushColor').value,size:size()};layers.push(pointerState.layer)}else stamp(p,p);render();canvas.setPointerCapture?.(e.pointerId)};
  canvas.onpointermove=e=>{if(!pointerState)return;e.preventDefault();const p=canvasPos(e);if(mode==='draw')pointerState.layer.points.push(p);else stamp(pointerState.last,p);pointerState.last=p;scheduleRender()};
  canvas.onpointerup=canvas.onpointercancel=()=>{pointerState=null;render()};
  toast('Drag on the photo to use the brush.');
}
function startPolygon(){
  drawMode='selection';selection=[];canvas.style.cursor='crosshair';
  overlay=c=>{if(!selection.length)return;const m=Math.max(3,canvas.width/250);c.save();c.strokeStyle='#9cf06b';c.lineWidth=m/2;c.beginPath();selection.forEach((pt,i)=>i?c.lineTo(pt.x,pt.y):c.moveTo(pt.x,pt.y));c.stroke();selection.forEach((pt,i)=>{c.fillStyle=i?'#9cf06b':'#ff5c5c';c.beginPath();c.arc(pt.x,pt.y,m,0,7);c.fill()});c.restore()};
  canvas.onclick=e=>{if(drawMode!=='selection')return;const p=canvasPos(e);if(selection.length>=3&&Math.hypot(p.x-selection[0].x,p.y-selection[0].y)<canvas.width*.03){finishPolygon();return}selection.push(p);render()};
  toast('Tap points around the subject. Tap the red first point to close.');
}
function finishPolygon(){
  if(selection.length<3)return toast('Add at least three points.');
  snapshot();ensureRestoreSource();const n=newCanvas(base.width,base.height),c=n.getContext('2d'),inv=$('#selInvert')?.checked;
  c.beginPath();if(inv)c.rect(0,0,n.width,n.height);selection.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip(inv?'evenodd':'nonzero');c.drawImage(base,0,0);
  base=n;selection=[];drawMode='';overlay=null;canvas.onclick=null;canvas.style.cursor='default';render();toast(inv?'Inside area removed.':'Outside area made transparent.');
}

/* ---------- common tool actions ---------- */
function bindCommon(k){
  on('turnLeft',()=>rotateImage(-1));on('turnRight',()=>rotateImage(1));on('flipH',()=>flipImage(true));on('flipV',()=>flipImage(false));
  on('addText',()=>{let text=$('#layerText').value.trim();if(!text)return toast('Enter text first.');snapshot();layers.push({type:'text',text,color:$('#textColor').value,size:+$('#textSize').value,font:$('#textFont').value,weight:$('#textWeight').value,x:canvas.width*(+$('#textX').value/100),y:canvas.height*(+$('#textY').value/100)});render();renderLayerList();toast('Text layer added.')});
  on('addShape',()=>{snapshot();let x=canvas.width*(+$('#shapeX').value/100),y=canvas.height*(+$('#shapeY').value/100),w=canvas.width*(+$('#shapeW').value/100),h=canvas.height*(+$('#shapeH').value/100);layers.push({type:'shape',shape:$('#shapeType').value,x,y,w,h,x2:x+w,y2:y+h,color:$('#shapeColor').value,fill:$('#shapeFill').checked,lineWidth:+$('#shapeLine').value*Math.max(1,canvas.width/1000)});render();renderLayerList();toast('Shape added.')});
  on('addTextLayer',()=>selectTool('text'));on('addShapeLayer',()=>selectTool('shapes'));
  on('startBrush',()=>startBrush(k));
  on('stopBrush',()=>{drawMode='';canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=null;canvas.style.cursor='default';canvas.style.touchAction='pan-y';toast('Tool stopped.')});
  on('startSelect',startPolygon);on('finishSelect',finishPolygon);
  on('undoPoint',()=>{selection.pop();render()});
  on('clearSelect',()=>{drawMode='';selection=[];overlay=null;canvas.onclick=null;render();toast('Selection cancelled.')});
  if($('#resizeW')){const rw=$('#resizeW'),rh=$('#resizeH'),ar=base.width/base.height;rw.oninput=()=>{if($('#keepRatio').checked)rh.value=Math.max(1,Math.round(rw.value/ar))};rh.oninput=()=>{if($('#keepRatio').checked)rw.value=Math.max(1,Math.round(rh.value*ar))}}
  on('doResize',()=>{snapshot();const f=flat(),w=clamp(+$('#resizeW').value||1,1,12000),h=clamp(+$('#resizeH').value||1,1,12000),n=newCanvas(w,h);n.getContext('2d').drawImage(f,0,0,w,h);commitBase(n);toast('Image resized.');selectTool('resize')});
  on('doCompress',()=>exportImage('image/jpeg',+$('#quality').value/100));on('doConvert',()=>exportImage($('#convertType').value,.92));
  on('doWatermark',()=>{snapshot();layers.push({type:'text',text:$('#watermarkText').value,color:$('#watermarkColor').value,size:+$('#watermarkSize').value,x:canvas.width-20,y:canvas.height-24,align:'right'});render();renderLayerList();toast('Watermark added.')});
  on('doBorder',()=>{snapshot();const f=flat(),b=+$('#borderWidth').value,n=newCanvas(f.width+2*b,f.height+2*b),c=n.getContext('2d');c.fillStyle=$('#borderColor').value;c.fillRect(0,0,n.width,n.height);c.drawImage(f,b,b);commitBase(n);toast('Border added.')});
}
function rotateImage(dir){snapshot();const f=flat(),n=newCanvas(f.height,f.width),c=n.getContext('2d');c.translate(n.width/2,n.height/2);c.rotate(dir*Math.PI/2);c.drawImage(f,-f.width/2,-f.height/2);commitBase(n);toast('Rotated.')}
function flipImage(horizontal){snapshot();const f=flat(),n=newCanvas(f.width,f.height),c=n.getContext('2d');c.translate(horizontal?n.width:0,horizontal?0:n.height);c.scale(horizontal?-1:1,horizontal?1:-1);c.drawImage(f,0,0);commitBase(n);toast('Flipped.')}

/* ---------- export ---------- */
async function exportImage(mime='image/png',quality=.92){
  if(!requirePhoto())return;
  renderClean();let src=canvas;
  if(mime==='image/jpeg'){src=newCanvas(canvas.width,canvas.height);const c=src.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,src.width,src.height);c.drawImage(canvas,0,0)}
  const blob=await blobOf(src,mime,quality),ext=mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':'png';
  render();await deliver([{blob,name:`${photoName}-ixora.${ext}`}]);
}
$('#downloadBtn').onclick=()=>exportImage();$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
$('#resetBtn').onclick=()=>{if(!base)return;snapshot();base=cloneCanvas(originalRestore||base);restoreSource=null;layers=[];adjust=zeroAdjust();dressImage=null;previewOverride=null;render();toast('Reset to the opened photo.');selectTool(activeTool||'adjustAll')};

/* ---------- other tools ---------- */
async function toolAction(k){
  if(k==='batchResize'||k==='batchConvert'||k==='batchRename'){
    show(`<p class="muted">${k==='batchResize'?'Resizes every image so the longest side is at most 1600 px.':k==='batchConvert'?'Converts every image to WEBP.':'Renames files ixora-001, ixora-002 …'} Processing happens on this device.</p>${button('chooseBatch','Choose files')}<div id="batchStatus" class="muted"></div>`);
    $('#chooseBatch').onclick=()=>{const m=$('#multiInput');m.accept='image/*';m.onchange=()=>{const fs=[...m.files];m.value='';batchProcess(k,fs)};m.click()};return}
  if(k==='zip'){
    show(`<p class="muted">Extract standard ZIP archives locally. Encrypted archives and unusual compression methods are not supported.</p>${button('chooseZip','Choose ZIP file')}<div id="zipStatus" class="muted"></div>`);
    $('#chooseZip').onclick=()=>$('#zipInput').click();
    $('#zipInput').onchange=async()=>{let f=$('#zipInput').files[0];$('#zipInput').value='';if(f)try{let files=await unzipFile(f);$('#zipStatus').innerHTML=`Extracted ${files.length} file(s).<br>${files.map(x=>escapeHTML(x.name)).join('<br>')}`;await deliver(files.map(x=>({blob:x.blob,name:x.name.split('/').pop()||x.name})))}catch(e){$('#zipStatus').textContent=e.message}};return}
  if(k==='fileManager'){
    let files=await dbList();show(`<p class="muted">Files saved in this app's private local database.</p>${button('saveCurrent','Save current photo','ghost')}<div class="layer-list" id="storedFiles"></div>`);
    $('#saveCurrent').onclick=async()=>{if(!requirePhoto())return;renderClean();let blob=await blobOf(canvas,'image/png');render();await dbPut({id:crypto.randomUUID(),name:photoName+'.png',blob,created:Date.now()});toast('Saved in local file manager.');toolAction('fileManager')};
    $('#storedFiles').innerHTML=files.map(f=>`<div class="layer-item"><span>${escapeHTML(f.name)}</span><span><button data-get="${f.id}">↓</button><button data-del="${f.id}">Delete</button></span></div>`).join('')||'<p class="muted">No saved files yet.</p>';
    document.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{await dbDelete(b.dataset.del);toolAction('fileManager')});
    document.querySelectorAll('[data-get]').forEach(b=>b.onclick=async()=>{let f=await dbGet(b.dataset.get);if(f)saveBlob(f.blob,f.name)});return}
  if(k==='history'){
    let a=[];try{a=JSON.parse(localStorage.getItem('ixoraDownloads')||'[]')}catch(e){}
    show(`<p class="muted">Recent exports from this app.</p><div class="layer-list">${a.map(x=>`<div class="layer-item"><span>${escapeHTML(x.name)}<br><small>${new Date(x.date).toLocaleString()}</small></span></div>`).join('')||'<p class="muted">No downloads recorded yet.</p>'}</div>${button('clearHistory','Clear history','ghost')}`);
    $('#clearHistory').onclick=()=>{localStorage.removeItem('ixoraDownloads');toolAction('history')};return}
  if(k==='collage'){
    show(`<p class="muted">Choose 2–9 images to create a grid collage.</p>${button('chooseCollage','Choose images')}<div id="collageStatus" class="muted"></div>`);
    $('#chooseCollage').onclick=()=>{const m=$('#multiInput');m.accept='image/*';m.onchange=async()=>{let fs=[...m.files].slice(0,9);m.value='';if(fs.length<2)return toast('Choose at least two images.');try{let ims=await Promise.all(fs.map(loadImage)),cols=Math.ceil(Math.sqrt(ims.length)),rows=Math.ceil(ims.length/cols),cell=500,gap=12,n=newCanvas(cols*cell+(cols+1)*gap,rows*cell+(rows+1)*gap),c=n.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,n.width,n.height);ims.forEach((im,i)=>{let x=gap+(i%cols)*(cell+gap),y=gap+Math.floor(i/cols)*(cell+gap),s=Math.min(cell/im.width,cell/im.height),w=im.width*s,h=im.height*s;c.drawImage(im,x+(cell-w)/2,y+(cell-h)/2,w,h)});await saveBlob(await blobOf(n,'image/jpeg',.92),'ixora-collage.jpg');$('#collageStatus').textContent='Collage created.'}catch(e){toast(e.message)}};m.click()};return}
}
async function batchProcess(k,files){
  if(!files.length)return;const out=[];
  try{
    for(let i=0;i<files.length;i++){
      let f=files[i];if(!f.type.startsWith('image/'))continue;let name=f.name.replace(/\.[^.]+$/,'');
      if(k==='batchRename'){out.push({blob:f,name:`ixora-${String(i+1).padStart(3,'0')}.${f.name.split('.').pop()||'png'}`});continue}
      let im=await loadImage(f),n=document.createElement('canvas');
      if(k==='batchResize'){let s=Math.min(1,1600/Math.max(im.width,im.height));n.width=Math.round(im.width*s);n.height=Math.round(im.height*s)}else{n.width=im.width;n.height=im.height}
      n.getContext('2d').drawImage(im,0,0,n.width,n.height);
      let mime=k==='batchConvert'?'image/webp':'image/png',ext=k==='batchConvert'?'webp':'png';out.push({blob:await blobOf(n,mime,.88),name:`${name}-ixora.${ext}`});
    }
    await deliver(out);$('#batchStatus').textContent=`Processed ${out.length} file(s).`;
  }catch(e){$('#batchStatus').textContent='Could not process: '+e.message}
}
async function unzipFile(file){let b=await file.arrayBuffer(),v=new DataView(b),out=[];for(let p=0;p+46<=b.byteLength;){if(v.getUint32(p,true)!==0x02014b50){p++;continue}let method=v.getUint16(p+10,true),compressed=v.getUint32(p+20,true),nameLen=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true),local=v.getUint32(p+42,true),name=new TextDecoder().decode(new Uint8Array(b,p+46,nameLen));let dataStart=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);if(name&&!name.endsWith('/')){let raw=b.slice(dataStart,dataStart+compressed),data;if(method===0)data=raw;else if(method===8){if(!('DecompressionStream'in window))throw Error('This device does not support offline ZIP decompression.');let ds=new DecompressionStream('deflate-raw');data=await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer()}else throw Error('Unsupported ZIP compression method: '+method);out.push({name,blob:new Blob([data])})}p+=46+nameLen+extra+comment}if(!out.length)throw Error('No supported files found in this ZIP.');return out}
function db(){return new Promise((resolve,reject)=>{let r=indexedDB.open('ixora-local-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbPut(x){let d=await db();return new Promise((res,rej)=>{let t=d.transaction('files','readwrite');t.objectStore('files').put(x);t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function dbList(){let d=await db();return new Promise((res,rej)=>{let r=d.transaction('files').objectStore('files').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function dbGet(id){let d=await db();return new Promise(res=>{let r=d.transaction('files').objectStore('files').get(id);r.onsuccess=()=>res(r.result)})}
async function dbDelete(id){let d=await db();return new Promise(res=>{let t=d.transaction('files','readwrite');t.objectStore('files').delete(id);t.oncomplete=res})}
function renderLayerList(){let el=$('#layerList');if(!el)return;el.innerHTML=layers.map((l,i)=>`<div class="layer-item"><span>${escapeHTML(l.type==='text'?l.text:l.type+' layer')}</span><button data-layer="${i}">Remove</button></div>`).join('')||'<p class="muted">No layers.</p>';el.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{snapshot();layers.splice(+b.dataset.layer,1);render();renderLayerList()})}

/* ---------- dress overlay ---------- */
function dressControls(){return `${range('X position (%)','dressX',0,100,Math.round(dress.x*100))}${range('Y position (%)','dressY',0,100,Math.round(dress.y*100))}${range('Width (%)','dressW',5,100,Math.round(dress.w*100))}${range('Opacity (%)','dressOpacity',5,100,Math.round(dress.opacity*100))}`}
function bindDress(){['dressX','dressY','dressW','dressOpacity'].forEach(id=>onRange(id,()=>{dress.x=+$('#dressX').value/100;dress.y=+$('#dressY').value/100;dress.w=+$('#dressW').value/100;dress.h=dress.w*dressImage.height/dressImage.width*canvas.width/canvas.height;dress.opacity=+$('#dressOpacity').value/100;scheduleRender()}))}
function dressAction(k){
  if(!requirePhoto())return;
  if(k==='dressAdd'){show(`<p class="muted">Add a clothing image as a separate layer. Transparent PNG clothing works best. This is a manual overlay editor, not automatic garment fitting.</p>${button('chooseDress','Choose clothing image')}`);
    $('#chooseDress').onclick=()=>$('#dressInput').click();
    $('#dressInput').onchange=async()=>{let f=$('#dressInput').files[0];$('#dressInput').value='';if(!f)return;try{snapshot();dressImage=await loadImage(f);dress={x:.25,y:.25,w:.5,h:.5*dressImage.height/dressImage.width*canvas.width/canvas.height,opacity:1,visible:true};render();show(`<p class="muted">Clothing layer added. Adjust its position and size.</p>${dressControls()}${button('saveDress','Done')}`);bindDress();$('#saveDress').onclick=()=>toast('Clothing layer position applied.')}catch(e){toast(e.message)}};return}
  if(k==='dressEdit'){if(!dressImage)return show('<p class="muted">Add a clothing image layer first.</p>');snapshot();show(`${dressControls()}${button('saveDress','Done')}`);bindDress();$('#saveDress').onclick=()=>toast('Clothing layer updated.');return}
  if(k==='dressRemove'){snapshot();dressImage=null;render();show('<p class="muted">Clothing layer removed.</p>');toast('Clothing layer removed.')}
}

/* ---------- boot ---------- */
$('#themeBtn').onclick=()=>document.body.classList.toggle('light');$('#year').textContent=new Date().getFullYear();renderTools();updateHistoryButtons();syncStageHeight();
if(isNative){if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});if(window.caches)caches.keys().then(ks=>ks.forEach(k=>caches.delete(k))).catch(()=>{})}
else if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
let deferredPrompt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installBtn').hidden=false});$('#installBtn').onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null}};
