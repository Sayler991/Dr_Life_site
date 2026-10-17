// Aperçu de l'espace praticien SANS connexion réelle : remplace supabase-js par un faux client (données fictives)
// pour vérifier que chaque onglet s'affiche sans erreur JavaScript. Usage : node tools/admin_preview.js BASE OUTDIR
const p = require(process.env.PUPPETEER || '/home/box/dl_tools/node_modules/puppeteer-core');
const fs = require('fs'), path = require('path');
const BASE = (process.argv[2] || 'http://localhost:8765/').replace(/\/?$/, '/');
const OUT = (process.argv[3] || '/tmp/').replace(/\/?$/, '/');
const content = fs.readFileSync(path.join(__dirname, '..', 'content.json'), 'utf8');
const MOCK = `(function(){
 var CONTENT=${content};
 function iso(d,h){return d+'T'+h+':00+01:00'}
 var t=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Algiers',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function add(s,n){var d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
 var A=[{id:1,ref:'DL-AB2CD',status:'en attente',service_id:'stress',service_name:'Gestion du stress',format:'visio',starts_at:iso(add(t,1),'10:00'),ends_at:iso(add(t,1),'11:00'),name:'Client fictif 1',phone:'0555 12 34 56',email:'exemple@exemple.com',message:'Exemple de message',source:'site',created_at:new Date().toISOString()},
 {id:2,ref:'DL-EF3GH',status:'confirmé',service_id:'confiance',service_name:'Confiance en soi',format:'cabinet',starts_at:iso(add(t,2),'14:00'),ends_at:iso(add(t,2),'15:00'),name:'Client fictif 2',phone:'0661 00 00 00',source:'admin',created_at:new Date().toISOString()},
 {id:3,ref:'DL-JK4LM',status:'terminé',service_id:'sommeil',service_name:'Sommeil & récupération',format:'telephone',starts_at:iso(add(t,-3),'09:00'),ends_at:iso(add(t,-3),'10:00'),name:'Client fictif 3',phone:'0770 00 00 00',source:'site',created_at:new Date().toISOString()}];
 var D={site_content:[{id:1,data:CONTENT}],settings:[{id:1,booking_open:true,slot_minutes:60,min_notice_hours:2,max_days_ahead:60,week:{1:[['09:00','12:00'],['14:00','18:00']],2:[['09:00','12:00'],['14:00','18:00']],3:[['09:00','12:00'],['14:00','18:00']],4:[['09:00','12:00'],['14:00','18:00']],5:[],6:[['09:00','12:00'],['14:00','18:00']],7:[['09:00','12:00'],['14:00','18:00']]}}],appointments:A,blocked_dates:[{day:add(t,5),note:'congés (exemple)'}],site_content_history:[{id:1,saved_at:new Date().toISOString()}],owners:[{user_id:'u'}]};
 function Q(tb){var o={_h:false,_single:false};var self={};['select','eq','neq','gte','lt','lte','in','or','order','limit','update','insert','upsert','delete'].forEach(function(m){self[m]=function(a,b){if(m==='select'&&b&&b.head)o._h=true;return self}});
  self.single=self.maybeSingle=function(){o._single=true;return self};
  self.then=function(res,rej){var rows=D[tb]||[];var r=o._h?{data:null,count:rows.length,error:null}:{data:o._single?(rows[0]||null):rows.slice(),error:null};return Promise.resolve(r).then(res,rej)};return self}
 var cl={from:Q,schema:function(){return cl},rpc:function(){return Promise.resolve({data:[],error:null})},
  auth:{onAuthStateChange:function(cb){setTimeout(function(){cb('SIGNED_IN',{user:{id:'u',email:'benduy0@gmail.com'},access_token:'x'})},50);return{data:{subscription:{unsubscribe:function(){}}}}},signOut:function(){},signInWithPassword:function(){return Promise.resolve({error:{message:'Invalid login credentials'}})}},
  storage:{from:function(){return{upload:function(){return Promise.resolve({})},getPublicUrl:function(){return{data:{publicUrl:''}}}}}},
  channel:function(){var c={on:function(){return c},subscribe:function(f){f&&f('SUBSCRIBED');return c}};return c},removeChannel:function(){},realtime:{setAuth:function(){}}};
 window.supabase={createClient:function(){return cl}};
})();`;
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const R = {};
  for (const [W, H, tag] of [[1440, 900, 'desktop'], [375, 812, 'mobile']]) {
    const pg = await b.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.setRequestInterception(true);
    pg.on('request', r => { if (/supabase-js/.test(r.url())) r.respond({ status: 200, contentType: 'application/javascript', body: MOCK }); else r.continue(); });
    await pg.setViewport({ width: W, height: H, isMobile: W < 600, deviceScaleFactor: W < 600 ? 2 : 1 });
    await pg.goto(BASE + 'admin/#rdv', { waitUntil: 'networkidle2' });
    await pg.waitForSelector('header.top', { timeout: 10000 }); await new Promise(r => setTimeout(r, 800));
    const tabs = await pg.$$eval('.side button', e => e.map(x => x.dataset.tab)); R[tag] = { tabs: {} };
    for (const t of tabs) {
      await pg.evaluate(t => window.DL_GO(t), t); await new Promise(r => setTimeout(r, 700));
      R[tag].tabs[t] = { cards: await pg.$$eval('main .card', e => e.length), hscroll: await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth) };
      if (['rdv', 'calendrier', 'dispo', 'services'].includes(t) || tag === 'desktop') await pg.screenshot({ path: OUT + 'admin_apercu_' + tag + '_' + t + '.png' });
    }
    await pg.evaluate(() => window.DL_GO('rdv')); await new Promise(r => setTimeout(r, 500));
    await pg.evaluate(() => window.DL_ALERTS.test()); await new Promise(r => setTimeout(r, 900));
    R[tag].alert = { banner: !!(await pg.$('.al-banner')), badge: await pg.$eval('.side button[data-tab="rdv"]', e => !!e.querySelector('.al-badge')).catch(() => false), title: await pg.title() };
    await pg.screenshot({ path: OUT + 'admin_apercu_' + tag + '_alerte.png' });
    R[tag].errors = errs; await pg.close();
  }
  console.log(JSON.stringify(R, null, 1)); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
