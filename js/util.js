import * as THREE from 'three';

/* smoothstep of p across [a,b], clamped */
export const S=(p,a,b)=>{const t=Math.min(1,Math.max(0,(p-a)/(b-a)));return t*t*(3-2*t)};
export const L=(a,b,t)=>a+(b-a)*t;
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
/* rises over [a,b], settles back over [c,d] */
export const lift=(p,a,b,c,d,h)=>h*S(p,a,b)*(1-S(p,c,d));
export const hash=n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s)};

/* piecewise vec3 path: keys = [[p,x,y,z],...] sorted by p */
export function sampleV3(keys,p,out){
  if(p<=keys[0][0])return out.set(keys[0][1],keys[0][2],keys[0][3]);
  const last=keys[keys.length-1];
  if(p>=last[0])return out.set(last[1],last[2],last[3]);
  for(let i=0;i<keys.length-1;i++){
    const a=keys[i],b=keys[i+1];
    if(p>=a[0]&&p<=b[0]){
      const t=S(p,a[0],b[0]);
      return out.set(L(a[1],b[1],t),L(a[2],b[2],t),L(a[3],b[3],t));
    }
  }
  return out;
}
export function sampleF(keys,p){
  if(p<=keys[0][0])return keys[0][1];
  const last=keys[keys.length-1];
  if(p>=last[0])return last[1];
  for(let i=0;i<keys.length-1;i++){
    const a=keys[i],b=keys[i+1];
    if(p>=a[0]&&p<=b[0])return L(a[1],b[1],S(p,a[0],b[0]));
  }
  return last[1];
}
/* keys = [[p, THREE.Color],...] */
export function sampleColor(keys,p,out){
  if(p<=keys[0][0])return out.copy(keys[0][1]);
  const last=keys[keys.length-1];
  if(p>=last[0])return out.copy(last[1]);
  for(let i=0;i<keys.length-1;i++){
    const a=keys[i],b=keys[i+1];
    if(p>=a[0]&&p<=b[0])return out.copy(a[1]).lerp(b[1],S(p,a[0],b[0]));
  }
  return out;
}
export const colorKeys=arr=>arr.map(([p,c])=>[p,new THREE.Color(c)]);

export function canv(w,h,fn){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  fn(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;return t;
}
export const glowTex=()=>canv(128,128,(g,w,h)=>{
  const r=g.createRadialGradient(64,64,0,64,64,64);
  r.addColorStop(0,'rgba(255,255,255,1)');
  r.addColorStop(.35,'rgba(255,255,255,.35)');
  r.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=r;g.fillRect(0,0,w,h);
});
