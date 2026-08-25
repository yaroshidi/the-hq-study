import * as THREE from 'three';
import {S,L,clamp,hash,canv,glowTex} from './util.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/* ================================================================
   Aldar HQ, parametric. World unit = 1 m. Grade y = 0.
   Disc in the XY plane, faces along ±Z. Each face is a spherical cap.
   Every pane, member, node and rim arc carries a rest transform and a
   hashed scatter transform; setTear() blends between them.
   ================================================================ */
export const R_DISC=60.45, CY=49.55, R_CAP=122, SAG=16, ZC=3;
export const FLOOR_H=4.4, FLOORS=23, FLOOR0=0.4;
export const R_MAIN=54;               // main diagrid face radius; beyond it: edge strip
const M=Math.tan(Math.PI/3), DELTA=34.6;

export function capZ(u,v){
  const rr=R_CAP*R_CAP-u*u-v*v;
  return ZC+(Math.sqrt(Math.max(rr,0))-(R_CAP-SAG));
}
const _n=new THREE.Vector3();
export function capNormal(u,v,sign,out=_n){
  out.set(u,v,Math.sqrt(Math.max(R_CAP*R_CAP-u*u-v*v,0))).normalize();
  if(sign<0)out.z=-out.z;return out;
}

/* basis matrix: y along dir, z along normal (orthogonalised), x = y×z */
const _x=new THREE.Vector3(),_y=new THREE.Vector3(),_z=new THREE.Vector3();
function basis(m,pos,dir,normal,sx,sy,sz){
  _y.copy(dir).normalize();
  _z.copy(normal).addScaledVector(_y,-_y.dot(normal)).normalize();
  _x.crossVectors(_y,_z).normalize();
  m.set(
    _x.x*sx,_y.x*sy,_z.x*sz,pos.x,
    _x.y*sx,_y.y*sy,_z.y*sz,pos.y,
    _x.z*sx,_y.z*sy,_z.z*sz,pos.z,
    0,0,0,1);
  return m;
}

/* ---------------- scatter bookkeeping ---------------- */
/* each entry: rest matrix (decomposed), scatter pos/quat, delay, omega */
class Scatter{
  constructor(mesh,n){
    this.mesh=mesh;this.n=n;
    this.rp=new Float32Array(n*3);this.rq=new Float32Array(n*4);this.rs=new Float32Array(n*3);
    this.sp=new Float32Array(n*3);this.sq=new Float32Array(n*4);
    this.delay=new Float32Array(n);this.om=new Float32Array(n*3);
    this.disp=new Float32Array(n*3);
    this.lastK=-1;
  }
  set(i,m,seed){
    const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
    m.decompose(p,q,s);
    this.rp.set([p.x,p.y,p.z],i*3);this.rq.set([q.x,q.y,q.z,q.w],i*4);this.rs.set([s.x,s.y,s.z],i*3);
    const dir=new THREE.Vector3(p.x,p.y-CY,p.z*1.6).normalize();
    dir.y+=.15;dir.normalize();
    const dist=40+hash(seed*3.1)*130;
    const sp=p.clone().addScaledVector(dir,dist);
    this.sp.set([sp.x,sp.y,sp.z],i*3);
    const e=new THREE.Euler(hash(seed*5.3)*6.28,hash(seed*7.7)*6.28,hash(seed*9.1)*6.28);
    const sq=new THREE.Quaternion().setFromEuler(e);
    this.sq.set([sq.x,sq.y,sq.z,sq.w],i*4);
    this.delay[i]=hash(seed*11.3)*.5;
    this.om.set([(hash(seed*13)-.5)*.9,(hash(seed*17)-.5)*.9,(hash(seed*19)-.5)*.9],i*3);
    this.mesh.setMatrixAt(i,m);
  }
}
const _p=new THREE.Vector3(),_q=new THREE.Quaternion(),_q2=new THREE.Quaternion(),
      _s=new THREE.Vector3(),_m=new THREE.Matrix4(),_e=new THREE.Euler(),_qt=new THREE.Quaternion(),
      _cp=new THREE.Vector3(),_d=new THREE.Vector3();
/* k: category tear amount 0..1; ray: THREE.Ray or null; repel: bool */
function applyScatter(sc,k,t,dt,ray,repel,spread=1){
  if(k<=0&&sc.lastK<=0){return}
  sc.lastK=k;
  const {n,rp,rq,rs,sp,sq,delay,om,disp,mesh}=sc;
  const ease=1-Math.pow(.02,dt);
  for(let i=0;i<n;i++){
    const ki=S(k,delay[i],delay[i]+.5);
    const i3=i*3,i4=i*4;
    _p.set(rp[i3]+(sp[i3]-rp[i3])*spread*ki,rp[i3+1]+(sp[i3+1]-rp[i3+1])*spread*ki,rp[i3+2]+(sp[i3+2]-rp[i3+2])*spread*ki);
    if(ki>0){
      /* float */
      _p.x+=Math.sin(t*.7+i*1.3)*1.2*ki;
      _p.y+=Math.sin(t*.9+i*2.1)*1.4*ki;
      _p.z+=Math.cos(t*.6+i*.7)*1.2*ki;
      /* cursor repulsion */
      if(repel&&ray&&ki>.5){
        ray.closestPointToPoint(_p,_cp);
        _d.subVectors(_p,_cp);const d=_d.length();
        if(d<28&&d>.001){
          _d.multiplyScalar((28-d)*.9/d);
          disp[i3]+=(_d.x-disp[i3])*ease*2;disp[i3+1]+=(_d.y-disp[i3+1])*ease*2;disp[i3+2]+=(_d.z-disp[i3+2])*ease*2;
        }else{
          disp[i3]-=disp[i3]*ease;disp[i3+1]-=disp[i3+1]*ease;disp[i3+2]-=disp[i3+2]*ease;
        }
        _p.x+=disp[i3];_p.y+=disp[i3+1];_p.z+=disp[i3+2];
      }
    }
    _q.set(rq[i4],rq[i4+1],rq[i4+2],rq[i4+3]);
    if(ki>0){
      _q2.set(sq[i4],sq[i4+1],sq[i4+2],sq[i4+3]);
      _e.set(om[i3]*t*ki,om[i3+1]*t*ki,om[i3+2]*t*ki);
      _qt.setFromEuler(_e);_q2.multiply(_qt);
      _q.slerp(_q2,ki);
    }
    _s.set(rs[i3],rs[i3+1],rs[i3+2]);
    _m.compose(_p,_q,_s);
    mesh.setMatrixAt(i,_m);
  }
  mesh.instanceMatrix.needsUpdate=true;
}

/* ================================================================ */
export function buildAldar(opts={}){
  const phone=!!opts.phone;
  const group=new THREE.Group();
  const anchors={};
  const scatters=[];

  /* ---------- pane skin ---------- */
  const CW=phone?4.2:3.4, CH=FLOOR_H;   // pane cell width; rows align with floors
  const paneItems=[];
  for(let sign=1;sign>=-1;sign-=2){
    for(let y=FLOOR0+CH/2-CH*4;y<118;y+=CH){
      const v=y-CY;
      for(let u=-62+CW/2;u<62;u+=CW){
        const r=Math.hypot(u,v);
        if(r>R_DISC-1.7)continue;
        paneItems.push({u,v,sign,strip:r>R_MAIN?1:0});
      }
    }
  }
  const paneN=paneItems.length;
  const paneU={
    uTime:{value:0},uSunDir:{value:new THREE.Vector3(0,1,0)},uSunK:{value:0},
    uSkyTop:{value:new THREE.Color('#0a1424')},uSkyHorizon:{value:new THREE.Color('#1a2a44')},
    uGlow:{value:1},uXrayPos:{value:new THREE.Vector3(0,-999,0)},uXrayR:{value:0},
    uEntryPos:{value:new THREE.Vector3(10,20.2,capZ(10,20.2-CY))},uEntryR:{value:0},
    uCamPos:{value:new THREE.Vector3()},uFade:{value:1},uEnvK:{value:.2},
    fogColor:{value:new THREE.Color('#0a1220')},fogDensity:{value:.0012},
  };
  const paneMat=new THREE.ShaderMaterial({
    uniforms:paneU,transparent:true,side:THREE.DoubleSide,depthWrite:false,
    vertexShader:`
      attribute float aSeed;attribute float aStrip;
      varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;varying float vSeed;varying float vStrip;
      varying vec2 vScale;varying float vDepth;
      void main(){
        vUv=uv;vSeed=aSeed;vStrip=aStrip;
        vScale=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
        vNormal=normalize(mat3(instanceMatrix)*normal);
        vec4 w=instanceMatrix*vec4(position,1.0);
        vWorld=w.xyz;
        vec4 mv=viewMatrix*w;vDepth=-mv.z;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`
      uniform float uTime,uSunK,uGlow,uXrayR,uEntryR,uFade,uEnvK,fogDensity;
      uniform vec3 uSunDir,uSkyTop,uSkyHorizon,uXrayPos,uEntryPos,uCamPos,fogColor;
      varying vec3 vWorld;varying vec3 vNormal;varying vec2 vUv;varying float vSeed;varying float vStrip;
      varying vec2 vScale;varying float vDepth;
      float h1(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
      void main(){
        vec3 N=normalize(vNormal);
        vec3 V=normalize(uCamPos-vWorld);
        bool front=gl_FrontFacing;
        if(!front)N=-N;
        float ndv=max(dot(N,V),0.0);
        float fres=pow(1.0-ndv,3.0);
        vec3 R=reflect(-V,N);
        vec3 sky=mix(uSkyHorizon,uSkyTop,clamp(R.y*.9+.3,0.,1.));
        vec3 base=vec3(.03,.13,.25);
        vec3 col=mix(base,mix(uSkyTop,sky,.5)*uEnvK*1.6,.25+.65*fres);
        float spec=pow(max(dot(R,uSunDir),0.0),160.0)*uSunK;
        col+=vec3(1.0,.93,.8)*spec*3.0;
        /* interior floor light at night, banded by world y */
        float fy=fract((vWorld.y-${FLOOR0.toFixed(2)})/${FLOOR_H.toFixed(2)});
        float band=smoothstep(.50,.72,fy)*(1.0-smoothstep(.86,.98,fy));
        float floorId=floor((vWorld.y-${FLOOR0.toFixed(2)})/${FLOOR_H.toFixed(2)});
        float lit=step(.28,h1(floorId*3.7+floor(vSeed*.11)));
        float warm=.55+.45*h1(vSeed*2.3);
        col+=vec3(1.0,.56,.26)*band*lit*warm*uGlow*(1.0-vStrip*.5)*.5;
        col+=vec3(1.0,.8,.55)*uGlow*.025;
        /* silver frame from the uv edge, in metres */
        vec2 e=min(vUv,1.0-vUv)*vScale;
        float em=min(e.x,e.y);
        float frame=1.0-smoothstep(.04,.09,em);
        float inner=smoothstep(.09,.12,em)*(1.0-smoothstep(.15,.20,em));
        col=mix(col,vec3(.42,.45,.49)*(.4+.6*uEnvK),frame*.85);
        col*=1.0-inner*.45;
        float a=front?mix(.90,.985,fres):.34;
        a=max(a,frame*.9);
        /* cursor x-ray */
        float dx=distance(vWorld,uXrayPos);
        a*=mix(.06,1.0,smoothstep(uXrayR*.45,uXrayR,dx));
        /* entry ripple: panes near the entry point dissolve */
        float de=distance(vWorld,uEntryPos);
        a*=smoothstep(uEntryR-7.0,uEntryR+2.0,de);
        a*=uFade;
        float fog=1.0-exp(-fogDensity*fogDensity*vDepth*vDepth);
        col=mix(col,fogColor,clamp(fog,0.,1.));
        gl_FragColor=vec4(col,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const paneG=new THREE.PlaneGeometry(1,1);
  const panes=new THREE.InstancedMesh(paneG,paneMat,paneN);
  const paneSeed=new Float32Array(paneN),paneStrip=new Float32Array(paneN);
  const paneSc=new Scatter(panes,paneN);
  {
    const m=new THREE.Matrix4(),pos=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),up=new THREE.Vector3(0,0,1);
    paneItems.forEach((it,i)=>{
      const n=capNormal(it.u,it.v,it.sign,new THREE.Vector3());
      pos.set(it.u,CY+it.v,it.sign*capZ(it.u,it.v));
      q.setFromUnitVectors(up,n);
      s.set(CW-.1,CH-.1,1);
      m.compose(pos,q,s);
      paneSc.set(i,m,i*1.7+it.sign*.3);
      paneSeed[i]=i;paneStrip[i]=it.strip;
    });
    paneG.setAttribute('aSeed',new THREE.InstancedBufferAttribute(paneSeed,1));
    paneG.setAttribute('aStrip',new THREE.InstancedBufferAttribute(paneStrip,1));
  }
  panes.frustumCulled=false;panes.castShadow=true;
  group.add(panes);scatters.push({sc:paneSc,cat:'pane'});
  anchors.pane=(()=>{let best=0,bd=1e9;paneItems.forEach((it,i)=>{const d=Math.hypot(it.u-22,it.v-12);if(it.sign>0&&d<bd){bd=d;best=i}});return {sc:paneSc,i:best}})();

  /* ---------- diagrid: nodes + members ---------- */
  const steel=new THREE.MeshStandardMaterial({color:'#cfd3d8',roughness:.42,metalness:.65});
  const steelDark=new THREE.MeshStandardMaterial({color:'#8d949c',roughness:.5,metalness:.6});
  const nodeList=[],memberList=[];  // per face
  const inMain=(u,v)=>u*u+v*v<R_MAIN*R_MAIN;
  function lineCircle(m,c,rad){ /* v=m u + c with u²+v²=rad²: returns [u1,u2] */
    const A=1+m*m,B=2*m*c,C=c*c-rad*rad,D=B*B-4*A*C;
    if(D<0)return null;const s=Math.sqrt(D);return [(-B-s)/(2*A),(-B+s)/(2*A)];
  }
  for(let sign=1;sign>=-1;sign-=2){
    const K=Math.ceil(90/DELTA);
    for(let fam=0;fam<2;fam++){
      const m=fam?-M:M;
      for(let k=-K;k<=K;k++){
        const c=k*DELTA;
        const uu=lineCircle(m,c,R_MAIN);if(!uu)continue;
        /* nodes along this line: intersections with the other family inside the circle */
        const pts=[];
        for(let j=-K;j<=K;j++){
          const c2=j*DELTA;
          const u=(c2-c)/(2*m),v=m*u+c;
          if(inMain(u,v))pts.push(u);
        }
        pts.push(uu[0],uu[1]);
        pts.sort((a,b)=>a-b);
        for(let i=0;i<pts.length-1;i++){
          const u0=pts[i],u1=pts[i+1];if(u1-u0<.5)continue;
          /* two sub-segments so the member follows the cap */
          const um=(u0+u1)/2;
          memberList.push([sign,u0,m*u0+c,um,m*um+c,1.1]);
          memberList.push([sign,um,m*um+c,u1,m*u1+c,1.1]);
        }
        if(fam===0)for(const u of pts){nodeList.push([sign,u,m*u+c,Math.abs(u-uu[0])<1e-6||Math.abs(u-uu[1])<1e-6?.7:1])}
      }
    }
    /* edge strip lattice: finer diagonals in the annulus R_MAIN..R_DISC */
    const K2=Math.ceil(140/8);
    for(let fam=0;fam<2;fam++){
      const m=fam?-M:M;
      for(let k=-K2;k<=K2;k++){
        const c=k*8;
        const o=lineCircle(m,c,R_DISC-.8);if(!o)continue;
        const inner=lineCircle(m,c,R_MAIN);
        const spans=inner?[[o[0],inner[0]],[inner[1],o[1]]]:[[o[0],o[1]]];
        for(const [a,b] of spans){
          const len=Math.hypot(b-a,(b-a)*m);const n=Math.max(1,Math.round(len/3));
          for(let i=0;i<n;i++){
            const u0=L(a,b,i/n),u1=L(a,b,(i+1)/n);
            memberList.push([sign,u0,m*u0+c,u1,m*u1+c,.24]);
          }
        }
      }
    }
  }
  const memberG=new THREE.BoxGeometry(1,1,1);
  function makeMembers(list,mat,seedBase){
    const mesh=new THREE.InstancedMesh(memberG,mat,list.length);
    const sc=new Scatter(mesh,list.length);
    const m=new THREE.Matrix4(),a=new THREE.Vector3(),b=new THREE.Vector3(),mid=new THREE.Vector3(),dir=new THREE.Vector3(),n=new THREE.Vector3();
    list.forEach(([sign,u0,v0,u1,v1,w],i)=>{
      a.set(u0,CY+v0,sign*capZ(u0,v0));b.set(u1,CY+v1,sign*capZ(u1,v1));
      mid.addVectors(a,b).multiplyScalar(.5);
      capNormal((u0+u1)/2,(v0+v1)/2,sign,n);
      mid.addScaledVector(n,w*.45);
      dir.subVectors(b,a);const len=dir.length();
      basis(m,mid,dir,n,w,len+w*.2,w);
      sc.set(i,m,i*2.3+seedBase);
    });
    mesh.frustumCulled=false;mesh.castShadow=true;
    group.add(mesh);scatters.push({sc,cat:'steel'});
    return mesh;
  }
  const members=makeMembers(memberList.filter(x=>x[5]>.5),steel,100);
  const stripMembers=makeMembers(memberList.filter(x=>x[5]<=.5),steelDark,7000);

  const nodeG=new THREE.CylinderGeometry(1.15,1.15,.6,18);
  const nodes=new THREE.InstancedMesh(nodeG,steel,nodeList.length);
  const nodeSc=new Scatter(nodes,nodeList.length);
  {
    const m=new THREE.Matrix4(),p=new THREE.Vector3(),n=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
    nodeList.forEach(([sign,u,v,k],i)=>{
      capNormal(u,v,sign,n);
      p.set(u,CY+v,sign*capZ(u,v)).addScaledVector(n,.5);
      q.setFromUnitVectors(up,n);s.set(k,1,k);
      m.compose(p,q,s);
      nodeSc.set(i,m,i*3.7+300);
    });
  }
  nodes.frustumCulled=false;group.add(nodes);scatters.push({sc:nodeSc,cat:'steel'});
  anchors.node=(()=>{let best=0,bd=1e9;nodeList.forEach(([sign,u,v],i)=>{const d=Math.hypot(u-0,v-18);if(sign>0&&d<bd){bd=d;best=i}});return {sc:nodeSc,i:best}})();

  /* ---------- rim: 12 arcs ---------- */
  const rimMat=new THREE.MeshStandardMaterial({color:'#bfc4c9',roughness:.48,metalness:.6});
  const rimArcs=[];
  {
    const depth=2*ZC+1.6;
    for(let i=0;i<12;i++){
      const a0=i/12*Math.PI*2,a1=(i+1)/12*Math.PI*2;
      const sh=new THREE.Shape();
      sh.absarc(0,0,R_DISC+2.1,a0,a1,false);
      sh.absarc(0,0,R_DISC-.2,a1,a0,true);
      const g=new THREE.ExtrudeGeometry(sh,{depth,bevelEnabled:false,curveSegments:24});
      g.translate(0,0,-depth/2);
      const mesh=new THREE.Mesh(g,rimMat);mesh.castShadow=true;
      mesh.position.y=CY;
      group.add(mesh);
      const am=(a0+a1)/2;
      mesh.userData.rest=new THREE.Vector3(0,CY,0);
      mesh.userData.dir=new THREE.Vector3(Math.cos(am),Math.sin(am),0);
      mesh.userData.seed=i*5.1+900;
      rimArcs.push(mesh);
    }
  }
  anchors.rim=rimArcs[2];

  /* ---------- floors: 23 plates, two halves each ---------- */
  const stripeTex=canv(64,256,(g,w,h)=>{
    g.fillStyle='#000';g.fillRect(0,0,w,h);
    g.fillStyle='#fff';g.fillRect(0,122,w,7);
  });
  stripeTex.wrapS=stripeTex.wrapT=THREE.RepeatWrapping;stripeTex.repeat.set(1,1);
  const carpetTex=canv(256,256,(g,w,h)=>{
    g.fillStyle='#8a8781';g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(40,40,40,.28)';g.lineWidth=2;
    for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();g.beginPath();g.moveTo(0,x);g.lineTo(w,x);g.stroke()}
  });
  carpetTex.wrapS=carpetTex.wrapT=THREE.RepeatWrapping;carpetTex.repeat.set(1/7,1/7);
  const floorMat=new THREE.MeshStandardMaterial({map:carpetTex,color:'#8d8a84',roughness:.85,metalness:.05,
    emissive:'#ffc98c',emissiveMap:stripeTex,emissiveIntensity:.7,side:THREE.DoubleSide});
  const ceilTex=canv(256,256,(g,w,h)=>{
    g.fillStyle='#5a5955';g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(20,20,20,.5)';g.lineWidth=3;
    for(let x=0;x<=w;x+=128){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();g.beginPath();g.moveTo(0,x);g.lineTo(w,x);g.stroke()}
  });
  ceilTex.wrapS=ceilTex.wrapT=THREE.RepeatWrapping;
  const ceilMat=new THREE.MeshStandardMaterial({map:ceilTex,color:'#8a8883',roughness:.9});
  const stripMat=new THREE.MeshStandardMaterial({color:'#fff1d8',emissive:'#ffd7a4',emissiveIntensity:1.6,roughness:.5});
  const floors=[];
  {
    for(let i=0;i<FLOORS;i++){
      const y=FLOOR0+i*FLOOR_H,v=y-CY;
      const inner=R_MAIN+3.5;
      if(v*v>=inner*inner)continue;
      const a=Math.sqrt(inner*inner-v*v);
      const halves=[];
      for(const side of[-1,1]){
        const sh=new THREE.Shape();
        const N=18;
        for(let k=0;k<=N;k++){
          const x=side<0?L(-a,0,k/N):L(0,a,k/N);
          const z=Math.max(capZ(x,v)-1.1,.6);
          if(k===0)sh.moveTo(x,z);else sh.lineTo(x,z);
        }
        for(let k=N;k>=0;k--){
          const x=side<0?L(-a,0,k/N):L(0,a,k/N);
          const z=-Math.max(capZ(x,v)-1.1,.6);
          sh.lineTo(x,z);
        }
        sh.closePath();
        const g=new THREE.ExtrudeGeometry(sh,{depth:.5,bevelEnabled:false});
        /* uv in shape units: stripes every 7 m along z */
        g.attributes.uv.array.forEach((val,idx,arr)=>{arr[idx]=val/7});
        const mesh=new THREE.Mesh(g,floorMat);mesh.castShadow=true;mesh.receiveShadow=true;
        /* ceiling under the plate: tile grid + light strips, faces down */
        const ceil=new THREE.Mesh(new THREE.ShapeGeometry(sh,12),ceilMat);
        ceil.geometry.attributes.uv.array.forEach((val,idx,arr)=>{arr[idx]=val/3});
        ceil.position.z=.56;mesh.add(ceil);
        const strips=[];
        for(let sx=(side<0?-a:0)+3.5;sx<(side<0?0:a);sx+=7){
          const zz=Math.max(capZ(sx,v)-2.4,.4);
          const sg=new THREE.BoxGeometry(.28,zz*2-1,.12);sg.translate(sx,0,.62);strips.push(sg);
        }
        if(strips.length){const lm=new THREE.Mesh(mergeGeometries(strips),stripMat);mesh.add(lm)}
        mesh.rotation.x=Math.PI/2;
        mesh.position.y=y;
        mesh.userData.side=side;mesh.userData.y=y;mesh.userData.i=i;
        mesh.userData.seed=i*7.3+side*2+500;
        group.add(mesh);halves.push(mesh);
      }
      floors.push({y,i,halves});
    }
  }
  anchors.plate=floors[Math.min(12,floors.length-1)].halves[0];

  /* ---------- cores ---------- */
  const coreTex=canv(256,512,(g,w,h)=>{
    g.fillStyle='#5e5b55';g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(60,58,52,.35)';g.lineWidth=2;
    for(let y=0;y<h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
    for(let x=0;x<w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}
  });
  coreTex.wrapS=coreTex.wrapT=THREE.RepeatWrapping;coreTex.repeat.set(1.5,10);
  const coreMat=new THREE.MeshStandardMaterial({map:coreTex,roughness:.9});
  const cores=[];
  const topY=FLOOR0+(FLOORS-1)*FLOOR_H+.5;
  for(const x of[-24,24]){
    const c=new THREE.Mesh(new THREE.BoxGeometry(9,topY,6),coreMat);
    c.position.set(x,topY/2,0);group.add(c);cores.push(c);
  }
  anchors.core=cores[0];

  /* ---------- podium ---------- */
  const podTex=canv(256,256,(g,w,h)=>{
    g.fillStyle='#173846';g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(200,210,220,.55)';g.lineWidth=3;
    for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}
    for(let y=0;y<=h;y+=128){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
  });
  podTex.wrapS=podTex.wrapT=THREE.RepeatWrapping;podTex.repeat.set(1/6,1/6);
  const podMat=new THREE.MeshStandardMaterial({map:podTex,roughness:.3,metalness:.35,emissive:'#ffb870',emissiveIntensity:.04});
  const roofMat=new THREE.MeshStandardMaterial({color:'#6f6a60',roughness:.95});
  const podium=new THREE.Group();
  {
    const W=190,D=90,r=30;
    const sh=new THREE.Shape();
    sh.moveTo(-W/2+r,-D/2);sh.lineTo(W/2-r,-D/2);sh.absarc(W/2-r,-D/2+r,r,-Math.PI/2,0,false);
    sh.lineTo(W/2,D/2-r);sh.absarc(W/2-r,D/2-r,r,0,Math.PI/2,false);
    sh.lineTo(-W/2+r,D/2);sh.absarc(-W/2+r,D/2-r,r,Math.PI/2,Math.PI,false);
    sh.lineTo(-W/2,-D/2+r);sh.absarc(-W/2+r,-D/2+r,r,Math.PI,Math.PI*1.5,false);
    const bodyG=new THREE.ExtrudeGeometry(sh,{depth:11.4,bevelEnabled:false,curveSegments:24});
    const body=new THREE.Mesh(bodyG,podMat);
    body.rotation.x=Math.PI/2;body.position.y=11.4;body.receiveShadow=true;
    const roof=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:.6,bevelEnabled:false,curveSegments:24}),roofMat);
    roof.rotation.x=Math.PI/2;roof.position.y=12;roof.receiveShadow=true;
    podium.add(body,roof);
  }
  group.add(podium);

  /* ---------- elevator shaft: two guide rails and a light ring that rides with the cab ---------- */
  const railMat=new THREE.MeshStandardMaterial({color:'#9aa0a8',roughness:.4,metalness:.7,emissive:'#8ecbea',emissiveIntensity:0});
  const rails=new THREE.Group();
  for(const x of[-3.4,3.4]){const r=new THREE.Mesh(new THREE.BoxGeometry(.22,topY,.22),railMat);r.position.set(x,topY/2,3.2);rails.add(r)}
  const cabRing=new THREE.Mesh(new THREE.TorusGeometry(2.9,.08,8,48),new THREE.MeshBasicMaterial({color:'#dff2ff',transparent:true,opacity:0}));
  cabRing.rotation.x=Math.PI/2;rails.add(cabRing);
  group.add(rails);
  function setLift(k,camY){rails.visible=k>0;railMat.emissiveIntensity=k*.9;cabRing.material.opacity=k*.85;cabRing.position.y=camY-2.4;cabRing.visible=k>0}

  /* ---------- interior lights (ride with the camera on the inside beats) ---------- */
  const inLights=[];
  for(let i=0;i<3;i++){
    const l=new THREE.PointLight('#ffd3a0',0,140,1.6);group.add(l);inLights.push(l);
  }
  function setInterior(k,camY){
    inLights.forEach((l,i)=>{
      l.intensity=k*520;
      l.position.set((i-1)*26,clamp(camY,4,104)+3+(i===1?6:0),(i-1)*6);
    });
  }

  /* ---------- ring (finale) ---------- */
  const ringMat=new THREE.MeshBasicMaterial({color:'#eaf7ff',transparent:true,opacity:0,depthWrite:false,fog:false});
  const ringGroup=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(R_DISC+1.2,1.0,10,240),ringMat);
  ring.position.y=CY;ringGroup.add(ring);
  const ringGlow=[];
  {
    const tex=glowTex();
    for(let i=0;i<48;i++){
      const a=i/48*Math.PI*2;
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:'#dff2ff',transparent:true,
        opacity:0,depthWrite:false,fog:false}));
      sp.position.set(Math.cos(a)*(R_DISC+1.2),CY+Math.sin(a)*(R_DISC+1.2),0);
      sp.scale.setScalar(14);ringGroup.add(sp);ringGlow.push(sp);
    }
  }

  /* ================================================================
     runtime setters
     ================================================================ */
  /* the skeleton never leaves: 'take it apart and the geometry still holds' */
  const CAT_WIN={pane:[0,.5],floor:[.3,.85],steel:[2,3]};
  let lastTear=-1;
  const _dir=new THREE.Vector3(),_rest=new THREE.Vector3();
  function setTear(k,t,dt,ray,repel,spread=1){
    for(const {sc,cat} of scatters){
      const w=CAT_WIN[cat];
      if(cat==='steel')continue;
      applyScatter(sc,S(k,w[0],w[1]),t,dt,ray,repel&&cat==='pane',spread);
    }
    /* rim arcs and floors are plain meshes */
    const ks=S(k,CAT_WIN.steel[0],CAT_WIN.steel[1]);
    const kf=S(k,CAT_WIN.floor[0],CAT_WIN.floor[1]);
    if(k>0||lastTear>0){
      floors.forEach(({y,i,halves})=>{
        halves.forEach(h=>{
          const d=hash(h.userData.seed)*.5,ki=S(kf,d,d+.5);
          const side=h.userData.side;
          h.position.x=h.userData.openX+side*ki*(70+hash(i*2.2+side)*90)*spread;
          h.position.y=y+ki*((i-11)*9*spread+Math.sin(t*.7+i)*2);
          h.position.z=ki*(hash(i*6.1+side)-.5)*160*spread;
          h.rotation.set(Math.PI/2+ki*(hash(i*3.3+side)-.5)*.8,ki*(hash(i*4.7+side)-.5)*.6+t*.03*ki,ki*(hash(i*5.9+side)-.5)*.5);
        });
      });
      cores.forEach((c,i)=>{c.position.y=topY/2-kf*(60+i*30)*spread;c.rotation.z=kf*(i?-.4:.4)});
    }
    lastTear=k;
  }
  floors.forEach(({halves})=>halves.forEach(h=>h.userData.openX=0));
  /* floors part as the camera passes through them */
  function setFloorOpen(camY){
    for(const {y,halves} of floors){
      const o=1-S(Math.abs(camY-y),6,34);
      for(const h of halves){h.userData.openX=h.userData.side*o*62;if(lastTear<=0)h.position.x=h.userData.openX}
    }
  }
  function setGlow(k){paneU.uGlow.value=k;floorMat.emissiveIntensity=.35*k+.02;stripMat.emissiveIntensity=.3+1.6*k}
  const xrayLight=new THREE.PointLight('#ffe2b8',0,90,1.5);group.add(xrayLight);
  const _xn=new THREE.Vector3();
  function setXray(pos,r,torch=true){
    if(pos){paneU.uXrayPos.value.copy(pos);
      _xn.set(pos.x,pos.y-CY,pos.z).normalize();
      xrayLight.position.copy(pos).addScaledVector(_xn,-14);
    }
    paneU.uXrayR.value=r;xrayLight.intensity=(r>0&&torch)?700:0;
  }
  function setEntry(r){paneU.uEntryR.value=r}
  function setRing(k){
    ringMat.opacity=k*.9;
    ringGlow.forEach((s,i)=>s.material.opacity=k*(.5+.4*Math.sin(i*1.7)));
  }
  function setFade(k){
    paneU.uFade.value=k;
    steel.opacity=k;steel.transparent=k<1;steelDark.opacity=k;steelDark.transparent=k<1;rimMat.opacity=k;rimMat.transparent=k<1;
    floorMat.opacity=k;floorMat.transparent=k<1;ceilMat.opacity=k;ceilMat.transparent=k<1;stripMat.opacity=k;stripMat.transparent=k<1;coreMat.opacity=k;coreMat.transparent=k<1;
    podMat.opacity=k;podMat.transparent=k<1;roofMat.opacity=k;roofMat.transparent=k<1;railMat.opacity=k;railMat.transparent=k<1;
    group.visible=k>0.01;
  }
  function setEnv(k){
    paneU.uEnvK.value=k;
    for(const m of[steel,steelDark,rimMat,floorMat,ceilMat,stripMat,coreMat,podMat,roofMat,railMat])m.envMapIntensity=.15+k*1.1;
  }
  /* world position of a callout anchor */
  const _am=new THREE.Matrix4();
  function anchorPos(key,out){
    const a=anchors[key];
    if(a.sc){a.sc.mesh.getMatrixAt(a.i,_am);out.setFromMatrixPosition(_am);return out}
    out.setFromMatrixPosition(a.matrixWorld);
    if(key==='core')out.y+=topY*.35;
    if(key==='rim')out.add(new THREE.Vector3(a.userData.dir.x*R_DISC,a.userData.dir.y*R_DISC,0));
    if(key==='plate')out.x-=28;
    return out;
  }

  return {group,ringGroup,panes,members,stripMembers,nodes,rimArcs,floors,cores,podium,ring,anchors,anchorPos,
    uniforms:paneU,materials:{steel,rimMat,floorMat,coreMat,podMat,roofMat},
    setTear,setFloorOpen,setGlow,setXray,setEntry,setRing,setFade,setEnv,setInterior,setLift,
    counts:{panes:paneN,members:memberList.length,nodes:nodeList.length}};
}
