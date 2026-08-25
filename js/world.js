import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {S,L,clamp,hash,canv,glowTex} from './util.js';
import {R_DISC,CY} from './building.js';

/* ================================================================
   The world around the building: sky + sun, marina water (reflector),
   sand, highway light trails, distant blocks, stars, dust, and the
   architect's drawing (circle, cross, ground line) in the XY plane.
   ================================================================ */
export function buildWorld(scene,renderer,opts={}){
  const phone=!!opts.phone;
  const world={};

  /* ---------- sky ---------- */
  const sky=new Sky();sky.scale.setScalar(4500);scene.add(sky);
  const su=sky.material.uniforms;
  su.turbidity.value=5;su.rayleigh.value=1.6;su.mieCoefficient.value=.006;su.mieDirectionalG.value=.82;
  const sunVec=new THREE.Vector3(0,1,0);
  const sunLight=new THREE.DirectionalLight('#fff2df',0);scene.add(sunLight);
  sunLight.castShadow=!phone;
  sunLight.shadow.mapSize.set(2048,2048);
  const sc=sunLight.shadow.camera;sc.left=-170;sc.right=170;sc.top=170;sc.bottom=-120;sc.near=200;sc.far=1700;
  sunLight.shadow.bias=-.0006;sunLight.shadow.normalBias=.6;
  sunLight.target.position.set(0,40,0);scene.add(sunLight.target);
  const hemi=new THREE.HemisphereLight('#1a2740','#0a0806',.5);scene.add(hemi);
  scene.add(new THREE.AmbientLight('#222a38',.25));
  scene.fog=new THREE.FogExp2('#0a1220',.0011);
  scene.background=null;

  /* environment for the metals: neutral gradient studio */
  {
    const env=new THREE.Scene();
    const strip=(w,h,d,x,y,z,c,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(i)}));m.position.set(x,y,z);env.add(m)};
    strip(20,.5,20,0,8,0,'#dfeaf7',2.0);strip(20,.5,20,0,-8,0,'#6b5b42',.5);strip(.5,10,10,-9,0,0,'#ffffff',1.2);strip(.5,10,10,9,0,0,'#ffe2c0',.7);
    const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(env,.08).texture;pm.dispose();
  }

  /* ---------- colour ramps by sun elevation ---------- */
  const KEY=[ // elev, top, horizon, fog, sunColor
    [-14,'#04060c','#0b1322','#070c16','#ff9a60'],
    [-6,'#070c1a','#182640','#0c1322','#ff9a60'],
    [-2,'#0e1a34','#4a3a50','#1e1c30','#ff8a55'],
    [0,'#16305a','#f0925a','#7a4a3a','#ff9c58'],
    [4,'#1e4a86','#f6b57a','#b08466','#ffc28a'],
    [10,'#2b68b0','#d9c2a4','#b8ae9e','#fff0d8'],
    [20,'#2f6fb8','#b9cfe4','#b6c6d6','#fff6ea'],
    [30,'#2a66b4','#a9c4dd','#aebfd0','#fffaf0'],
  ].map(([e,a,b,c,d])=>[e,new THREE.Color(a),new THREE.Color(b),new THREE.Color(c),new THREE.Color(d)]);
  const _t=new THREE.Color(),_h=new THREE.Color(),_f=new THREE.Color(),_s=new THREE.Color();
  function ramp(el){
    if(el<=KEY[0][0]){_t.copy(KEY[0][1]);_h.copy(KEY[0][2]);_f.copy(KEY[0][3]);_s.copy(KEY[0][4]);return}
    const last=KEY[KEY.length-1];
    if(el>=last[0]){_t.copy(last[1]);_h.copy(last[2]);_f.copy(last[3]);_s.copy(last[4]);return}
    for(let i=0;i<KEY.length-1;i++){
      const a=KEY[i],b=KEY[i+1];
      if(el>=a[0]&&el<=b[0]){
        const t=(el-a[0])/(b[0]-a[0]);
        _t.copy(a[1]).lerp(b[1],t);_h.copy(a[2]).lerp(b[2],t);_f.copy(a[3]).lerp(b[3],t);_s.copy(a[4]).lerp(b[4],t);
        return;
      }
    }
  }
  world.sky={top:_t,horizon:_h,fog:_f};
  world.cfg={rayDay:.75,turbDay:1,mieDay:.0006,expDay:.34,expNight:.34,rayNight:1.1,turbNight:1.4,mieNight:.0015,sunDay:6.5,hemiDay:1.3};
  world.nightK=1;world.sunVec=sunVec;
  /* azimuth in degrees around +Y (0 = toward +Z), elevation in degrees */
  world.setSun=function(az,el){
    const a=az*Math.PI/180,e=el*Math.PI/180;
    sunVec.set(Math.cos(e)*Math.sin(a),Math.sin(e),Math.cos(e)*Math.cos(a));
    su.sunPosition.value.copy(sunVec);
    const c=world.cfg;
    su.rayleigh.value=L(c.rayNight,c.rayDay,S(el,-6,10));
    su.turbidity.value=L(c.turbNight,c.turbDay,S(el,-4,10));
    su.mieCoefficient.value=L(c.mieNight,c.mieDay,S(el,-6,4));
    ramp(el);
    sunLight.position.copy(sunVec).multiplyScalar(900);
    sunLight.color.copy(_s);
    sunLight.intensity=S(el,-3,12)*c.sunDay;
    hemi.color.copy(_t).multiplyScalar(1.6);hemi.groundColor.copy(_f).multiplyScalar(.7);
    hemi.intensity=L(.35,c.hemiDay,S(el,-8,10));
    scene.fog.color.copy(_f);
    const night=1-S(el,-8,2);
    scene.fog.density=L(.0008,.0011,night);blockU.uFogDensity.value=L(.0019,.0011,night);
    world.nightK=night;
    world.exposure=L(c.expNight,c.expDay,S(el,-9,12));
    renderer.toneMappingExposure=world.exposure;
    stars.material.opacity=night*.85;
    trailsA.material.opacity=night*.9;trailsB.material.opacity=night*.8;
    blockU.uNight.value=night;
    waterU.uNight.value=night;waterU.uSunDir.value.copy(sunVec);waterU.uHorizon.value.copy(_h);waterU.uSunK.value=S(el,-2,6);
  };

  /* ---------- stars ---------- */
  const stars=(()=>{
    const n=1500,pos=new Float32Array(n*3);
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2,e=Math.random()*Math.PI*.5;
      pos[i*3]=Math.cos(a)*Math.cos(e)*1900;pos[i*3+1]=Math.sin(e)*1900+30;pos[i*3+2]=Math.sin(a)*Math.cos(e)*1900;
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const p=new THREE.Points(g,new THREE.PointsMaterial({color:'#d8e2f2',size:1.6,sizeAttenuation:false,transparent:true,opacity:.8,fog:false,depthWrite:false}));
    scene.add(p);return p;
  })();

  /* ---------- sand ---------- */
  const sandTex=canv(512,512,(g,w,h)=>{
    g.fillStyle='#8f836a';g.fillRect(0,0,w,h);
    for(let i=0;i<14000;i++){const v=110+Math.random()*60;g.fillStyle=`rgba(${v+12},${v},${v-22},${.08+Math.random()*.12})`;g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5)}
  });
  sandTex.wrapS=sandTex.wrapT=THREE.RepeatWrapping;sandTex.repeat.set(90,90);
  const sand=new THREE.Mesh(new THREE.CircleGeometry(3200,72),new THREE.MeshStandardMaterial({map:sandTex,color:'#cbbc9e',roughness:1}));
  sand.rotation.x=-Math.PI/2;sand.position.y=-.6;sand.receiveShadow=true;scene.add(sand);
  /* quay edge along the water */
  const quay=new THREE.Mesh(new THREE.BoxGeometry(1400,3,6),new THREE.MeshStandardMaterial({color:'#8b8577',roughness:1}));
  quay.position.set(0,.4,88);scene.add(quay);

  /* ---------- water: marina basin on the +Z side ---------- */
  const waterU={
    uTime:{value:0},uNight:{value:1},uSunDir:{value:new THREE.Vector3(0,1,0)},uSunK:{value:0},
    uHorizon:{value:new THREE.Color('#1a2a44')},
  };
  const waterShader={
    name:'MarinaWater',
    uniforms:THREE.UniformsUtils.merge([{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},waterU]),
    vertexShader:`
      uniform mat4 textureMatrix;
      varying vec4 vUv;varying vec3 vWorld;
      void main(){
        vUv=textureMatrix*vec4(position,1.0);
        vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;
        gl_Position=projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader:`
      uniform sampler2D tDiffuse;uniform float uTime,uNight,uSunK;uniform vec3 uSunDir,uHorizon;
      varying vec4 vUv;varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;
        float w1=sin(p.x*.08+uTime*.9)+sin(p.y*.11-uTime*.7);
        float w2=sin((p.x+p.y)*.23+uTime*1.3)*.5;
        vec2 n=vec2(w1,w2)*.008;
        vec4 uv=vUv;uv.xy+=n*uv.w;
        vec3 refl=texture2DProj(tDiffuse,uv).rgb;
        vec3 V=normalize(cameraPosition-vWorld);
        vec3 N=normalize(vec3(n.x*6.0,1.0,n.y*6.0));
        float fres=pow(1.0-max(dot(N,V),0.0),2.2);
        vec3 deep=mix(vec3(.02,.05,.08),vec3(.05,.16,.22),1.0-uNight);
        vec3 col=mix(deep,refl,.35+.55*fres);
        vec3 R=reflect(-V,N);
        float glint=pow(max(dot(R,uSunDir),0.0),260.0)*uSunK;
        col+=vec3(1.0,.9,.7)*glint*4.0;
        col=mix(col,uHorizon*.8,fres*.25);
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const waterGeo=new THREE.PlaneGeometry(1600,900);
  let water;
  if(phone){
    water=new THREE.Mesh(waterGeo,new THREE.MeshStandardMaterial({color:'#0b2230',roughness:.15,metalness:.6}));
  }else{
    water=new Reflector(waterGeo,{textureWidth:1024,textureHeight:1024,color:0xffffff,shader:waterShader,clipBias:.003});
    water.material.uniforms.uTime=waterU.uTime;water.material.uniforms.uNight=waterU.uNight;
    water.material.uniforms.uSunDir=waterU.uSunDir;water.material.uniforms.uSunK=waterU.uSunK;water.material.uniforms.uHorizon=waterU.uHorizon;
  }
  water.rotation.x=-Math.PI/2;water.position.set(0,-.4,90+450);scene.add(water);

  /* ---------- highway on the -Z side ---------- */
  const roadTex=canv(512,128,(g,w,h)=>{
    g.fillStyle='#2a2c30';g.fillRect(0,0,w,h);
    for(let i=0;i<3000;i++){const v=34+Math.random()*22;g.fillStyle=`rgba(${v},${v},${v+3},.5)`;g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5)}
    g.fillStyle='rgba(230,230,225,.75)';g.fillRect(0,6,w,2);g.fillRect(0,h-8,w,2);
    g.fillStyle='rgba(230,230,225,.6)';for(let x=0;x<w;x+=64){g.fillRect(x,h/2-1,28,2)}
    g.fillStyle='rgba(120,120,118,.5)';g.fillRect(0,h*.3,w,1);g.fillRect(0,h*.7,w,1);
  });
  roadTex.wrapS=roadTex.wrapT=THREE.RepeatWrapping;roadTex.repeat.set(70,1);
  const road=new THREE.Mesh(new THREE.PlaneGeometry(2600,34),new THREE.MeshStandardMaterial({map:roadTex,roughness:.95}));
  road.rotation.x=-Math.PI/2;road.position.set(0,-.3,-175);scene.add(road);
  const gt=glowTex();
  function trails(color,size){
    const n=170,g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
    const p=new THREE.Points(g,new THREE.PointsMaterial({map:gt,color,size,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    p.userData.seed=Array.from({length:n},(_,i)=>[hash(i*1.1)*2600,hash(i*2.3),hash(i*3.7)]);
    scene.add(p);return p;
  }
  const trailsA=trails('#ffe9c4',3.2),trailsB=trails('#ff4a3a',2.6);
  function stepTrails(t){
    for(const [pts,dir,lane] of[[trailsA,1,-8],[trailsB,-1,8]]){
      const a=pts.geometry.attributes.position.array,sd=pts.userData.seed;
      for(let i=0;i<sd.length;i++){
        const x=((sd[i][0]+dir*t*(60+sd[i][1]*40))%2600+2600)%2600-1300;
        a[i*3]=x;a[i*3+1]=1.1;a[i*3+2]=-175+lane+(sd[i][2]-.5)*6;
      }
      pts.geometry.attributes.position.needsUpdate=true;
    }
  }

  /* ---------- distant blocks with lit windows ---------- */
  const blockU={uNight:{value:1},uFogColor:{value:scene.fog.color},uFogDensity:{value:.0011}};
  const blockMat=new THREE.ShaderMaterial({
    uniforms:blockU,
    vertexShader:`
      attribute float aSeed;varying vec3 vNorm;varying vec2 vUv;varying float vSeed;varying vec3 vScale;varying float vViewZ;
      void main(){vSeed=aSeed;vUv=uv;
        vScale=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        vNorm=normalize(mat3(instanceMatrix)*normal);
        vec4 w=instanceMatrix*vec4(position,1.0);vec4 mv=viewMatrix*w;vViewZ=-mv.z;
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`
      uniform float uNight,uFogDensity;uniform vec3 uFogColor;
      varying vec3 vNorm;varying vec2 vUv;varying float vSeed;varying vec3 vScale;varying float vViewZ;
      float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+34.345);return fract(p.x*p.y);}
      void main(){
        vec3 day=vec3(.50,.46,.40)*(0.6+0.4*vUv.y);vec3 nightF=vec3(.03,.035,.05);
        vec3 col=mix(day,nightF,uNight);
        float side=step(.5,abs(vNorm.y));
        if(side<.5){
          vec2 span=abs(vNorm.x)>.5?vec2(vScale.z,vScale.y):vec2(vScale.x,vScale.y);
          vec2 grid=vec2(vUv.x*span.x/4.0,vUv.y*span.y/3.8);
          vec2 cell=floor(grid);vec2 f=fract(grid);
          float lit=step(h21(cell+vSeed*7.31),.55);
          float win=step(.2,f.x)*step(f.x,.8)*step(.3,f.y)*step(f.y,.78);
          col+=vec3(1.0,.85,.55)*win*lit*uNight*1.1;
          col=mix(col,col*.6,win*(1.0-uNight)*.5);
        }
        float fog=1.0-exp(-uFogDensity*uFogDensity*vViewZ*vViewZ);
        col=mix(col,uFogColor,clamp(fog,0.,1.));
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  {
    const g=new THREE.BoxGeometry(1,1,1);g.translate(0,.5,0);
    const spots=[];
    for(let i=0;i<170;i++){
      const a=hash(i*1.3)*Math.PI*2,r=620+hash(i*2.1)*900;
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(z>40&&Math.abs(x)<1100)continue;         // the marina
      if(Math.abs(z)<200&&x>300)continue;          // the approach
      if(Math.abs(z+175)<40)continue;             // the highway
      spots.push([x,z,hash(i*3.3)]);
    }
    const inst=new THREE.InstancedMesh(g,blockMat,spots.length);
    const seeds=new Float32Array(spots.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3();
    spots.forEach(([x,z,sd],i)=>{
      p.set(x,0,z);s.set(22+sd*50,8+hash(sd*9)*26,22+hash(sd*5)*50);
      m.compose(p,q,s);inst.setMatrixAt(i,m);seeds[i]=sd*100;
    });
    inst.geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seeds,1));
    scene.add(inst);
  }

  /* ---------- interior dust ---------- */
  const dust=(()=>{
    const n=600,pos=new Float32Array(n*3);
    for(let i=0;i<n;i++){pos[i*3]=(Math.random()-.5)*90;pos[i*3+1]=Math.random()*105;pos[i*3+2]=(Math.random()-.5)*26}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const p=new THREE.Points(g,new THREE.PointsMaterial({map:gt,color:'#ffe6c0',size:.9,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    scene.add(p);return p;
  })();
  world.setDust=(k,t)=>{dust.material.opacity=k*.35;dust.rotation.y=t*.01};

  /* ---------- the drawing: circle, cross, ground line in the XY plane ---------- */
  const drawMat=new THREE.MeshBasicMaterial({color:'#8ecbea',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
  const drawing=new THREE.Group();scene.add(drawing);
  const circlePath=new THREE.Curve();circlePath.getPoint=(t,o=new THREE.Vector3())=>o.set(Math.cos(t*Math.PI*2-Math.PI/2)*(R_DISC+7),CY+Math.sin(t*Math.PI*2-Math.PI/2)*(R_DISC+7),0);
  const circle=new THREE.Mesh(new THREE.TubeGeometry(circlePath,240,1.1,8,false),drawMat);
  drawing.add(circle);
  const circleIdx=circle.geometry.index.count;
  const mkLine=(len,w=.7)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(len,w,w),drawMat);drawing.add(m);return m};
  const crossH=mkLine(2*R_DISC+40),crossV=mkLine(2*R_DISC+40);crossV.rotation.z=Math.PI/2;
  crossH.position.y=CY;crossV.position.y=CY;
  const groundL=mkLine(2*R_DISC+120,.8);groundL.position.y=0.05;
  world.setDrawing=(circleK,crossK,groundK,fade)=>{
    circle.geometry.setDrawRange(0,Math.floor(circleIdx*circleK));
    circle.visible=circleK>0;
    crossH.scale.x=Math.max(.001,crossK);crossV.scale.x=Math.max(.001,crossK);
    groundL.scale.x=Math.max(.001,groundK);
    drawMat.opacity=.9*fade;drawing.visible=fade>0;
  };

  world.tick=t=>{waterU.uTime.value=t;stepTrails(t);};
  world.stars=stars;world.water=water;world.sunLight=sunLight;world.hemi=hemi;
  world.setSun(200,-14);
  return world;
}
