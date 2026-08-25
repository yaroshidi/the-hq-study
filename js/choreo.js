import * as THREE from 'three';
import {S,L,clamp,lift,hash,sampleV3,sampleF} from './util.js';
import {CY,R_DISC,R_CAP,SAG,ZC,FLOOR0,FLOOR_H,capZ} from './building.js';

/* ================================================================
   Keyframe tracks. P in [0,1]. World units are metres.
   One flight: approach → through the glass → up the floors → out the
   roof → the tear → the drawing → the return → landmark → finale.
   ================================================================ */
export const CAM_POS=[
  [0.00, 430, 72, 30],
  [0.06, 300, 30, 135],
  [0.14, 42, 32, 215],
  [0.19, 16, 25, 72],
  [0.22, 10.5, 20.5, 21.5],
  [0.26, 4, 20.2, 2],
  [0.30, 0, 20.2, 0],
  [0.37, 0, 62, 0],
  [0.44, 0, 104, 0],
  [0.455, 0, 138, 30],
  [0.48, 0, 165, 95],
  [0.50, 0, 170, 135],
  [0.56, 150, 95, 180],
  [0.62, -110, 88, 190],
  [0.70, 0, 132, 238],
  [0.80, 100, 46, 228],
  [0.87, -230, 125, 440],
  [0.93, 210, 70, 258],
  [1.00, 0, 50, 262],
];
export const CAM_LOOK=[
  [0.00, 0, 52, 0],
  [0.06, 0, 50, 0],
  [0.14, 0, 52, 0],
  [0.19, 10, 20.2, 15],
  [0.22, 8, 20, 0],
  [0.26, -40, 27, 10],
  [0.30, 2, 48, -10],
  [0.37, 2, 92, -10],
  [0.44, 0, 128, -70],
  [0.455, 0, 72, -8],
  [0.48, 0, 64, 0],
  [0.50, 0, 62, 0],
  [0.56, 0, 55, 0],
  [0.62, 0, 50, 0],
  [0.70, 0, 34, 0],
  [0.80, 0, 50, 0],
  [0.87, 0, 40, 0],
  [0.93, 0, 50, 0],
  [1.00, 0, 50, 0],
];
export const ROLL=[[0,0],[.025,.09],[.06,0],[.20,0],[.225,.05],[.26,0],[.44,0],[.465,-.07],[.50,0],[1,0]];
export const SUN=[
  [0,200,-14],[.30,200,-9],[.42,200,-4],[.44,202,-1.5],[.50,205,0],[.62,215,3],
  [.70,230,8],[.80,262,26],[.87,275,18],[.93,285,5],[.97,290,-1],[1,292,-4],
];
export const TEAR=[[0,0],[.50,0],[.58,1],[.70,1],[.80,0],[1,0]];
/* scattered pieces drift far out of frame for the drawing, and come back from far on the return */
export const SPREAD=[[0,1],[.60,1],[.66,3.2],[.72,3.2],[.80,1],[1,1]];
export const GLOW=[[0,1],[.5,1],[.7,.6],[.8,0],[1,0]];
export const DUST=[[0,0],[.20,0],[.24,.8],[.44,.8],[.48,0],[1,0]];
export const XRAY=[[0,0],[.10,0],[.14,24],[.205,24],[.22,0],[.415,0],[.435,52],[.49,0],[.50,16],[.92,16],[.95,0],[1,0]];
export const ENTRY=[[0,0],[.205,0],[.225,44],[.44,44],[.47,0],[1,0]];
export const RING=[[0,0],[.92,0],[.955,1],[1,1]];
export const FADE=[[0,1],[.93,1],[.965,0],[1,0]];
export const DRAW_C=[[0,0],[.62,0],[.66,1],[1,1]];
export const DRAW_X=[[0,0],[1,0]];
export const DRAW_G=[[0,0],[.665,0],[.69,1],[1,1]];
export const DRAW_F=[[0,0],[.62,0],[.63,1],[.72,1],[.76,0],[1,0]];

export const CHAPTERS=[
  [0,'THE HQ'],[.06,'THE TURN'],[.14,'THE SKIN'],[.22,'INSIDE'],[.30,'THE ASCENT'],
  [.44,'THE CROWN'],[.50,'THE TEAR'],[.62,'THE DRAWING'],[.70,'THE RETURN'],[.80,'THE LANDMARK'],
  [.87,'THE NUMBERS'],[.93,'THE SIGNATURE'],[.97,'YAR AL-ROSHIDI'],
];

const _pos=new THREE.Vector3(),_look=new THREE.Vector3(),_v=new THREE.Vector3(),_hit=new THREE.Vector3();
const sphF=new THREE.Sphere(new THREE.Vector3(0,CY,-(R_CAP-SAG)+ZC),R_CAP);
const sphB=new THREE.Sphere(new THREE.Vector3(0,CY,(R_CAP-SAG)-ZC),R_CAP);
const exitPos=new THREE.Vector3(0,110,0);

/* mouse ray → nearest cap hit inside the disc, or null */
function capHit(ray,out){
  let best=null,bd=1e9;
  for(const sph of[sphF,sphB]){
    if(ray.intersectSphere(sph,_v)){
      const r=Math.hypot(_v.x,_v.y-CY);
      const d=_v.distanceTo(ray.origin);
      if(r<R_DISC+2&&d<bd&&Math.abs(_v.z)<ZC+SAG+2){bd=d;best=out.copy(_v)}
    }
  }
  return best;
}

/* entrance before any scroll: descend from high and far behind the building to the edge-on pose */
const INTRO_POS=new THREE.Vector3(820,230,-260),INTRO_LOOK=new THREE.Vector3(0,30,0);
const smoother=x=>x*x*x*(x*(x*6-15)+10);
export function applyP(P,t,dt,ctx){
  const {camera,aldar,world,dom,mouse,vel,current,W,H,renderer,ray}=ctx;
  const intro=ctx.intro===undefined?1:ctx.intro;
  const ie=smoother(clamp(intro,0,1));
  /* camera */
  sampleV3(CAM_POS,P,_pos);
  sampleV3(CAM_LOOK,P,_look);
  if(ie<1){_pos.lerpVectors(INTRO_POS,_pos,ie);_look.lerpVectors(INTRO_LOOK,_look,ie)}
  const inside=S(P,.195,.215)*(1-S(P,.46,.48));
  const lift=S(P,.29,.31)*(1-S(P,.425,.44));
  _look.x+=mouse.x*L(6,1.2,inside);_look.y-=mouse.y*L(4,1,inside);
  camera.position.copy(_pos);
  camera.lookAt(_look);
  camera.rotation.z+=sampleF(ROLL,P)+clamp(vel*.00001,-.02,.02);
  camera.fov=L(54,40,ie)+clamp(vel*.0004,-3,5);
  camera.updateProjectionMatrix();
  aldar.uniforms.uCamPos.value.copy(camera.position);

  /* sun and sky */
  const az=sampleF(SUN.map(k=>[k[0],k[1]]),P),el=sampleF(SUN.map(k=>[k[0],k[2]]),P);
  world.setSun(az,el);
  aldar.uniforms.uSkyTop.value.copy(world.sky.top);
  aldar.uniforms.uSkyHorizon.value.copy(world.sky.horizon);
  aldar.uniforms.fogColor.value.copy(world.sky.fog);
  aldar.uniforms.uSunDir.value.copy(world.sunVec);
  aldar.uniforms.uSunK.value=S(el,-2,8);
  aldar.setEnv(1-world.nightK*.85);
  aldar.setGlow(sampleF(GLOW,P),L(-20,140,S(intro,.22,.85)));
  world.setDust(sampleF(DUST,P),t);

  /* floors part for the camera during the ascent */
  aldar.setFloorOpen(inside>0?camera.position.y:-500);
  aldar.setInterior(inside*(1-S(P,.40,.43)),camera.position.y);
  aldar.setLift(lift,camera.position.y);

  /* x-ray: cursor on the exterior beats, the exit point on the roof burst */
  const xr=sampleF(XRAY,P);
  if(P>.415&&P<.495){aldar.setXray(exitPos,xr,false)}
  else if(xr>0&&ray){const h=capHit(ray,_hit);aldar.setXray(h,h?xr:0)}
  else aldar.setXray(null,0);
  aldar.setEntry(sampleF(ENTRY,P));

  /* the tear */
  const tear=sampleF(TEAR,P);
  aldar.setTear(tear,t,dt,ray,tear>.5&&P<.63,sampleF(SPREAD,P));

  /* the drawing */
  world.setDrawing(sampleF(DRAW_C,P),sampleF(DRAW_X,P),sampleF(DRAW_G,P),sampleF(DRAW_F,P));

  /* finale */
  aldar.setRing(sampleF(RING,P));
  aldar.setFade(sampleF(FADE,P));

  /* DOM: flow + chrome */
  dom.flow.style.transform=`translate3d(0,${-current}px,0)`;
  for(const b of dom.blocks){
    const sy=b._top-current;
    if(sy<-700||sy>H+700){b.style.visibility='hidden';continue}
    b.style.visibility='visible';
    b.style.top=b._top+'px';
    const dy=Math.abs(sy+90-H/2);
    const textK=b.id==='b0'?S(intro,.55,1):1;
    const topK=sy<150?clamp((sy-40)/110,0,1):1;   /* fade out before passing under the header */
    b.style.opacity=(clamp(1.5-dy/(H*.6),0,1)*textK*topK).toFixed(3);
    if(b.id==='b0')b.style.transform=`translateY(${(1-textK)*46}px)`;
  }
  let name=CHAPTERS[0][1];
  for(const c of CHAPTERS)if(P>=c[0])name=c[1];
  if(name!==dom.chapterNow){dom.chapterNow=name;dom.typewriter(dom.chapter,name)}
  dom.pct.textContent=Math.round(P*100)+'%';
  dom.ticks.forEach((el,i)=>el.classList.toggle('on',i/(dom.ticks.length-1)<=P+.001));
  dom.hint.classList.toggle('on',P<=.02&&intro>=1);
  /* floor counter */
  const fl=clamp(Math.round((camera.position.y-FLOOR0)/FLOOR_H)+1,1,23);
  dom.floor.textContent=String(fl).padStart(2,'0');
  /* callouts */
  const coK=S(tear,.86,.98)*(1-S(P,.605,.625));
  for(const key in dom.co){
    const el=dom.co[key];
    if(coK<=0){el.style.opacity=0;continue}
    aldar.anchorPos(key,_v);
    _v.project(camera);
    if(_v.z>1){el.style.opacity=0;continue}
    el.style.left=((_v.x*.5+.5)*W)+'px';
    el.style.top=((-_v.y*.5+.5)*H)+'px';
    el.style.opacity=coK;
  }
}
