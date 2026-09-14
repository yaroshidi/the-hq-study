/* Visit and story-depth beacons to GoatCounter (yaroshidi.goatcounter.com).
   No cookies, no third-party script: one image GET per beacon, straight to the /count endpoint.
   The recipient code rides in ?via=xx so each send is its own line in the dashboard
   (referrer "via:xx", and every event path carries "[xx]").
   A mail-gateway link scanner registers a visit and nothing else; a person scrolls,
   so the depth events are what separate the two. */
const GC='https://yaroshidi.goatcounter.com/count';
const q=new URLSearchParams(location.search);
const via=(q.get('via')||'').replace(/[^\w-]/g,'').slice(0,24);
const tag=via?' ['+via+']':'';
const local=/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
/* localhost and my own recorder (puppeteer sets navigator.webdriver) never count; ?track=1 forces a local send for testing */
const live=(!local||q.has('track'))&&!navigator.webdriver;
/* what was sent (or would have been, on localhost), for verification from the console */
const TR=window.__TRACK={sent:[],live,via};

export function send(path,event){
  const u=new URL(GC);
  u.searchParams.set('p',path);
  u.searchParams.set('t',document.title);
  u.searchParams.set('r',via?'via:'+via:document.referrer);
  u.searchParams.set('s',screen.width+','+screen.height+','+(devicePixelRatio||1));
  if(event)u.searchParams.set('e','true');
  u.searchParams.set('rnd',Math.random().toString(36).slice(2,10));
  TR.sent.push({path,event:!!event,live});
  if(!live)return;
  const img=new Image();img.src=u.href;
}

/* pageview: the real path plus the recipient code */
send(location.pathname+(via?'?via='+via:''));

/* story depth: one event per chapter threshold, fired the first time P reaches it */
const DEPTH=[[.18,'form'],[.36,'facade'],[.54,'edge'],[.72,'structure'],[.90,'return'],[.99,'end']];
let di=0;
export function trackP(P){
  while(di<DEPTH.length&&P>=DEPTH[di][0]){send('depth:'+DEPTH[di][1]+tag,true);di++}
}

/* time on page, counted only while the tab is visible */
const TIME=[30,60,120,300];
let ti=0,secs=0;
setInterval(()=>{
  if(document.visibilityState!=='visible')return;
  secs++;
  while(ti<TIME.length&&secs>=TIME[ti]){send('time:'+TIME[ti]+'s'+tag,true);ti++}
},1000);
