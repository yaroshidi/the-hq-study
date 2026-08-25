import * as THREE from 'three';
import {clamp,L} from './util.js';
import {buildAldar} from './building.js';
import {buildWorld} from './world.js';
import {applyP} from './choreo.js';

const phone=matchMedia('(max-width: 820px)').matches||('ontouchstart' in window&&innerWidth<1024);
const VH=phone?15:18;

/* ---------------- renderer / scene ---------------- */
const mount=document.getElementById('stage');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,phone?1.5:2));
renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=.4;
renderer.shadowMap.enabled=!phone;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
mount.appendChild(renderer.domElement);
/* GPU resets (headless capture, laptops waking, driver hiccups): keep the context recoverable */
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();console.warn('[aldar] webgl context lost')});
renderer.domElement.addEventListener('webglcontextrestored',()=>{console.warn('[aldar] webgl context restored')});
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.4,6000);

const world=buildWorld(scene,renderer,{phone});
const aldar=buildAldar({phone});
scene.add(aldar.group,aldar.ringGroup);

/* ---------------- DOM ---------------- */
const $=id=>document.getElementById(id);
const dom={
  flow:$('flow'),blocks:[...document.querySelectorAll('.blk')],chapter:$('chapter'),
  hint:$('hint'),floor:$('floor'),co:{},chapterNow:'',
};
document.querySelectorAll('.co').forEach(el=>dom.co[el.dataset.co]=el);
let twTimer=null;
dom.typewriter=(el,str)=>{
  clearTimeout(twTimer);let i=0;
  (function step(){el.textContent=str.slice(0,i++);if(i<=str.length)twTimer=setTimeout(step,26)})();
};
const prog=$('prog'),TICKS=23;
dom.pct=document.createElement('div');dom.pct.id='pct';dom.pct.className='mono';
for(let i=0;i<TICKS;i++){
  if(i===Math.floor(TICKS/2))prog.appendChild(dom.pct);
  prog.appendChild(document.createElement('i'));
}
dom.ticks=[...prog.querySelectorAll('i')];
$('topBtn')?.addEventListener('click',e=>{e.preventDefault();scrollTo(0,TOTAL)});

/* ---------------- scroll state ---------------- */
let TOTAL=1,target=0,current=0,vel=0,frozenP=null,tOff=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
history.scrollRestoration='manual';
scrollTo(0,0);
let W=innerWidth,H=innerHeight;
function resize(){
  W=innerWidth;H=innerHeight;
  const oldP=TOTAL>1?scrollY/TOTAL:0;
  TOTAL=VH*H;
  $('spacer').style.height=(TOTAL+H)+'px';
  camera.aspect=W/H;camera.updateProjectionMatrix();
  renderer.setSize(W,H);
  dom.blocks.forEach(b=>{b._top=parseFloat(b.dataset.at)*TOTAL+parseFloat(b.dataset.dy||0)*H});
  if(oldP)scrollTo(0,oldP*TOTAL);
}
addEventListener('resize',resize);

/* mouse: parallax + ray */
const mouse={x:0,y:0,tx:0,ty:0};
const ndc=new THREE.Vector2(),raycaster=new THREE.Raycaster();
let rayLive=false;
addEventListener('mousemove',e=>{
  mouse.tx=(e.clientX/W-.5)*2;mouse.ty=(e.clientY/H-.5)*2;rayLive=!phone;
});
addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const d={ArrowDown:H*.5,PageDown:H*.9,' ':H*.9,ArrowUp:-H*.5,PageUp:-H*.9}[e.key];
  if(d!==undefined){scrollBy(0,d);e.preventDefault()}
  else if(e.key==='End'){scrollTo(0,TOTAL);e.preventDefault()}
  else if(e.key==='Home'){scrollTo(0,0);e.preventDefault()}
});

/* ---------------- loop ---------------- */
const ctx={THREE,camera,scene,renderer,aldar,world,dom,mouse,ray:null,vel:0,current:0,W,H,intro:0};
/* loader + entrance: the ring draws while the first frames compile, then the camera descends in */
const loader=$('loader'),loaderRing=$('loaderRing');
const INTRO_MS=4200,LOADER_MIN=1500;
let introStart=null,firstFrameAt=null,loaderOff=false;
const skipIntro=()=>{ctx.intro=1;introStart=-1;if(!loaderOff){loaderOff=true;loader.classList.add('off')}};
if(reduced)skipIntro();
/* opened in a background tab (email link): restart the ring when the tab becomes visible so the entrance plays while someone is looking */
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!loaderOff)firstFrameAt=null});
function tickIntro(now){
  if(introStart===-1)return;
  if(firstFrameAt===null){firstFrameAt=now;return}
  const lp=clamp((now-firstFrameAt)/LOADER_MIN,0,1);
  loaderRing.style.strokeDashoffset=(1-lp).toFixed(3);
  if(lp<1)return;
  if(!loaderOff){loaderOff=true;loader.classList.add('off');introStart=now}
  ctx.intro=clamp((now-introStart)/INTRO_MS,0,1);
}
let last=performance.now();
const frameTimes=[];
function step(now,forceP){
  const dt=Math.min((now-last)/1000,.05);last=now;
  const t=(now+tOff)/1000;
  if(frozenP!==null)forceP=frozenP;
  if(forceP===undefined){
    target=clamp(scrollY,0,TOTAL);
    const prev=current;
    current+=reduced?(target-current):(target-current)*(1-Math.pow(.004,dt));
    if(Math.abs(target-current)<.05)current=target;
    vel=L(vel,(current-prev)/Math.max(dt,.001),.2);
  }else{
    current=target=forceP*TOTAL;vel=0;if(frozenP===null)scrollTo(0,current);
  }
  mouse.x+=(mouse.tx-mouse.x)*(1-Math.pow(.01,dt));
  mouse.y+=(mouse.ty-mouse.y)*(1-Math.pow(.01,dt));
  if(rayLive){ndc.set(mouse.tx,-mouse.ty);raycaster.setFromCamera(ndc,camera);ctx.ray=raycaster.ray}
  const P=TOTAL>0?current/TOTAL:0;
  ctx.vel=vel;ctx.current=current;ctx.W=W;ctx.H=H;
  world.tick(t);
  applyP(P,t,dt,ctx);
  renderer.render(scene,camera);
  tickIntro(now);
  return P;
}
function frame(now){
  const t0=performance.now();
  step(now);
  frameTimes.push(performance.now()-t0);if(frameTimes.length>240)frameTimes.shift();
  requestAnimationFrame(frame);
}

/* manual drive for verification (hidden-tab rAF trap) */
window.__ALDAR={
  drive(p){skipIntro();const P=step(performance.now(),p);return 'P='+P.toFixed(3)},
  /* freeze P for screenshots without scrolling the document (the capture tool mis-clips fixed layers when scrolled) */
  freeze(p){frozenP=p;if(p!==null){if(p>0.001)skipIntro();scrollTo(0,0);step(performance.now(),p)}return 'frozen '+p},
  skipIntro(){skipIntro();return 'intro skipped'},
  intro:()=>ctx.intro,
  mouse(x,y){mouse.tx=x;mouse.ty=y;mouse.x=x;mouse.y=y;rayLive=true;return 'mouse'},
  stats(){const a=frameTimes.slice();a.sort((x,y)=>x-y);return {n:a.length,med:a[a.length>>1],p95:a[Math.floor(a.length*.95)],tris:renderer.info.render.triangles,calls:renderer.info.render.calls,counts:aldar.counts}},
  TOTAL:()=>TOTAL,
  x:{world,aldar,renderer,scene,camera},
  lost:()=>renderer.getContext().isContextLost(),
  /* continue the ambience clock from an absolute virtual time (segmented captures) */
  setTime(ms){tOff=ms-performance.now();return 'clock '+ms},
};

resize();
requestAnimationFrame(frame);
