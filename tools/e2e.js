// E2E Dr Life : node tools/e2e.js BASE OUTDIR
// 375 + 1440 px : captures par section, réservation complète réelle (« TEST E2E »), double réservation refusée,
// course de 2 réservations simultanées, mouvement réduit, admin (mauvais mot de passe refusé), erreurs console.
// Les références créées sont listées dans la sortie JSON (à supprimer ensuite).
const p = require(process.env.PUPPETEER || '/home/box/dl_tools/node_modules/puppeteer-core');
const BASE = (process.argv[2] || 'https://sayler991.github.io/Dr_Life_site/').replace(/\/?$/, '/');
const OUT = (process.argv[3] || '/workspace/drlife_shots/').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  const R = { refs: [] };
  for (const [W, H, tag] of [[1440, 900, 'desktop'], [375, 812, 'mobile']]) {
    const res = R[tag] = { errs: [], bad: [] };
    const pg = await b.newPage();
    pg.on('pageerror', e => res.errs.push('pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error') res.errs.push(m.text()); });
    pg.on('response', r => { if (r.status() >= 400) res.bad.push(r.status() + ' ' + r.url()); });
    await pg.setViewport({ width: W, height: H, isMobile: W < 600, hasTouch: W < 600, deviceScaleFactor: W < 600 ? 2 : 1 });
    const resp = await pg.goto(BASE + '?e2e=' + Date.now(), { waitUntil: 'networkidle2' }); res.status = resp.status();
    await pg.waitForFunction(() => document.documentElement.dataset.live === 'supabase', { timeout: 20000 }); res.live = 'supabase';
    await sleep(1500);
    res.services = await pg.$$eval('.svc', e => e.length); res.faq = await pg.$$eval('.qa', e => e.length);
    res.testimonialsHidden = await pg.$eval('#temoignages', e => e.hidden);
    res.imgs = await pg.$$eval('img', e => ({ total: e.length, lazy: e.filter(i => i.loading === 'lazy').length, webp: e.filter(i => /\.webp/.test(i.currentSrc || i.src)).length }));
    await pg.screenshot({ path: OUT + tag + '_01_hero.png' });
    let n = 2;
    for (const id of ['approche', 'accompagnements', 'deroulement', 'formats', 'apropos', 'faq', 'rendez-vous', 'contact']) {
      await pg.evaluate(id => document.getElementById(id).scrollIntoView({ block: 'start' }), id); await sleep(1400);
      await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_' + id + '.png' });
    }
    await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(1200);
    await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_footer.png' });
    res.hscroll = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    res.overflow = await pg.evaluate(() => { const vw = document.documentElement.clientWidth, out = []; document.querySelectorAll('main *, header *, footer *').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return; if (r.right > vw + 1 || r.left < -1) { let q = e, clip = false; while ((q = q.parentElement)) { const s = getComputedStyle(q); if (/hidden|clip/.test(s.overflowX)) { clip = true; break; } } if (!clip && getComputedStyle(e).position !== 'fixed') out.push(e.tagName + '.' + e.className); } }); return out.slice(0, 8); });
    res.reveals = await pg.evaluate(() => document.querySelectorAll('.reveal.in').length + '/' + document.querySelectorAll('.reveal').length);
    if (W < 600) {
      // menu mobile
      await pg.evaluate(() => window.scrollTo(0, 0)); await sleep(400);
      await pg.click('#burger'); await sleep(500); res.menuOpen = await pg.$eval('#menu', e => e.classList.contains('open'));
      await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_menu.png' }); await pg.click('#burger'); await sleep(300);
    }
    // ---- réservation complète via l'interface
    await pg.evaluate(() => document.querySelector('.svc[data-id="stress"] .svc-go').scrollIntoView({ block: 'center' })); await sleep(400);
    await pg.click('.svc[data-id="stress"] .svc-go'); await sleep(1200);
    res.preselected = await pg.$eval('input[name=svc][value=stress]', e => e.checked);
    await pg.evaluate(() => document.querySelector('input[name=fmt][value=visio]').closest('label').scrollIntoView({ block: 'center' })); await sleep(300);
    await pg.click('input[name=fmt][value=visio] + svg'); await sleep(400);
    res.fmtChecked = await pg.$eval('input[name=fmt][value=visio]', e => e.checked);
    await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_booking_1_choix.png' });
    await pg.evaluate(() => document.querySelector('[data-act=to2]').scrollIntoView({ block: 'center' })); await sleep(200);
    await pg.click('[data-act=to2]');
    await pg.waitForSelector('.cal-day.av', { timeout: 20000 }); await sleep(600);
    const days = await pg.$$eval('.cal-day.av', e => e.map(x => x.dataset.day)); res.availDaysShown = days.length;
    const pick = days[Math.min(days.length - 1, W < 600 ? 2 : 1)];
    await pg.evaluate(d => document.querySelector('.cal-day[data-day="' + d + '"]').scrollIntoView({ block: 'center' }), pick); await sleep(300);
    await pg.click('.cal-day[data-day="' + pick + '"]'); await sleep(500);
    res.slotsForDay = await pg.$$eval('.slot', e => e.map(x => x.textContent));
    const slotSel = '.slot:nth-of-type(1)';
    await pg.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), '.slot'); await sleep(300);
    const chosen = await pg.$eval('.slot', e => ({ starts_at: e.dataset.slot, hhmm: e.dataset.hhmm }));
    await pg.click('.slot'); await sleep(400);
    res.chosen = { day: pick, ...chosen };
    await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_booking_2_calendrier.png' });
    await pg.evaluate(() => document.querySelector('[data-act=to3]').scrollIntoView({ block: 'center' })); await sleep(200);
    await pg.click('[data-act=to3]'); await pg.waitForSelector('#bk-form'); await sleep(400);
    // validation : envoi vide refusé
    await pg.evaluate(() => document.querySelector('#bk-form [type=submit]').scrollIntoView({ block: 'center' })); await sleep(200);
    await pg.click('#bk-form [type=submit]'); await sleep(300);
    res.validation = await pg.evaluate(() => ({ name: document.getElementById('f-name-e').textContent, phone: document.getElementById('f-phone-e').textContent, stillStep3: !!document.getElementById('bk-form') }));
    await pg.type('#f-name', 'TEST E2E ' + W); await pg.type('#f-phone', W < 600 ? '0550 00 03 75' : '0550 00 14 40');
    if (W > 600) await pg.type('#f-email', 'test-e2e@example.com');
    await pg.type('#f-msg', 'Réservation de test automatique — à supprimer.');
    await pg.evaluate(() => document.getElementById('f-consent').scrollIntoView({ block: 'center' })); await pg.click('#f-consent');
    await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_booking_3_coordonnees.png' });
    await pg.click('#bk-form [type=submit]'); await pg.waitForSelector('#bk-confirm', { timeout: 5000 }); await sleep(400);
    await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_booking_4_recap.png' });
    await pg.evaluate(() => document.getElementById('bk-confirm').scrollIntoView({ block: 'center' })); await sleep(200);
    await pg.click('#bk-confirm');
    await pg.waitForSelector('#bk-ref', { timeout: 20000 }); await sleep(1300);
    res.ref = await pg.$eval('#bk-ref', e => e.textContent.trim()); R.refs.push(res.ref);
    res.wa = await pg.$eval('#bk-wa', e => decodeURIComponent(e.href));
    res.waOk = res.wa.startsWith('https://wa.me/213552998411?text=') && res.wa.includes(res.ref);
    await pg.evaluate(() => document.getElementById('bk-ref').scrollIntoView({ block: 'center' })); await sleep(500);
    await pg.screenshot({ path: OUT + tag + '_' + String(n++).padStart(2, '0') + '_booking_5_confirmation.png' });
    res.errsNormalFlow = res.errs.slice(); res.badNormalFlow = res.bad.slice();
    // ---- double réservation du même créneau (appel direct de l'API publique)
    const rpc = (payload) => pg.evaluate(async (payload) => {
      const C = window.DL_CONFIG; const r = await fetch(C.SUPABASE_URL + '/rest/v1/rpc/book_appointment', { method: 'POST', headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Content-Profile': 'drlife' }, body: JSON.stringify({ p: payload }) });
      return { status: r.status, body: await r.json() };
    }, payload);
    const dbl = await rpc({ service: 'confiance', format: 'cabinet', starts_at: chosen.starts_at, name: 'TEST E2E double', phone: '0550 00 99 0' + (W < 600 ? '1' : '2') });
    res.doubleBooking = { status: dbl.status, refused: dbl.status >= 400, message: dbl.body && dbl.body.message };
    if (dbl.body && dbl.body.ref) R.refs.push(dbl.body.ref);
    res.slotHiddenAfter = await pg.evaluate(async (s) => { const C = window.DL_CONFIG; const day = s.day; const r = await fetch(C.SUPABASE_URL + '/rest/v1/rpc/get_slots', { method: 'POST', headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Content-Profile': 'drlife' }, body: JSON.stringify({ p_from: day, p_to: day }) }); const j = await r.json(); return !j.some(x => x.starts_at === s.starts_at || new Date(x.starts_at).getTime() === new Date(s.starts_at).getTime()); }, res.chosen);
    if (W > 600) {
      // course : deux réservations simultanées sur un autre créneau libre
      const free = await pg.evaluate(async (d) => { const C = window.DL_CONFIG; const r = await fetch(C.SUPABASE_URL + '/rest/v1/rpc/get_slots', { method: 'POST', headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Content-Profile': 'drlife' }, body: JSON.stringify({ p_from: d, p_to: d }) }); return (await r.json()).pop(); }, pick);
      const race = await Promise.all([rpc({ service: 'sommeil', format: 'telephone', starts_at: free.starts_at, name: 'TEST E2E course A', phone: '0550 00 77 01' }), rpc({ service: 'sommeil', format: 'telephone', starts_at: free.starts_at, name: 'TEST E2E course B', phone: '0550 00 77 02' })]);
      race.forEach(x => { if (x.body && x.body.ref) R.refs.push(x.body.ref); });
      R.race = { slot: free.hhmm + ' ' + free.day, successes: race.filter(x => x.status < 300).length, errors: race.filter(x => x.status >= 400).map(x => x.body.message) };
      // validations serveur
      const v1 = await rpc({ service: 'stress', format: 'visio', starts_at: free.starts_at, name: 'X', phone: '12' });
      const v2 = await rpc({ service: 'inconnu', format: 'visio', starts_at: free.starts_at, name: 'Test', phone: '0550000000' });
      const v3 = await rpc({ service: 'stress', format: 'visio', starts_at: free.starts_at, name: 'Test', phone: '0550000000', hp: 'bot' });
      const v4 = await rpc({ service: 'couple', format: 'telephone', starts_at: free.starts_at, name: 'Test', phone: '0550000000' });
      R.serverValidation = [v1, v2, v3, v4].map(x => x.status + ' ' + (x.body && x.body.message));
      // l'anonyme ne peut pas lire les rendez-vous
      R.anonRead = await pg.evaluate(async () => { const C = window.DL_CONFIG; const r = await fetch(C.SUPABASE_URL + '/rest/v1/appointments?select=*', { headers: { apikey: C.SUPABASE_ANON_KEY, 'Accept-Profile': 'drlife' } }); return r.status + ' ' + (await r.text()).slice(0, 80); });
    }
    res.errsAfterDeliberateApiTests = res.errs.length - res.errsNormalFlow.length; delete res.errs; delete res.bad;
    await pg.close();
  }
  // mouvement réduit
  const rm = await b.newPage(); await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await rm.setViewport({ width: 1440, height: 900 });
  await rm.goto(BASE, { waitUntil: 'networkidle2' }); await sleep(1500);
  R.reducedMotion = await rm.evaluate(() => ({ hiddenReveals: [...document.querySelectorAll('.reveal')].filter(e => getComputedStyle(e).opacity !== '1').length, drawDashOffset: getComputedStyle(document.querySelector('.neuro-draw path')).strokeDashoffset, dotAnim: getComputedStyle(document.querySelector('.neuro-draw circle')).animationName }));
  await rm.close();
  // admin : page de connexion + mauvais mot de passe
  for (const [W, H, tag] of [[1440, 900, 'desktop'], [375, 812, 'mobile']]) {
    const ad = await b.newPage(); const aerr = []; ad.on('pageerror', e => aerr.push(e.message)); ad.on('console', m => { if (m.type() === 'error' && !/400|Invalid login/i.test(m.text())) aerr.push(m.text()); });
    await ad.setViewport({ width: W, height: H, isMobile: W < 600, deviceScaleFactor: W < 600 ? 2 : 1 });
    const ar = await ad.goto(BASE + 'admin/', { waitUntil: 'networkidle2' }); await ad.waitForSelector('#login-form', { visible: true, timeout: 15000 });
    await ad.screenshot({ path: OUT + 'admin_' + tag + '_login.png' });
    await ad.type('#login-email', 'benduy0@gmail.com'); await ad.type('#login-pw', 'mauvais-mot-de-passe-e2e');
    await ad.click('#login-btn'); await ad.waitForSelector('#login-err:not([hidden])', { timeout: 15000 });
    R['admin_' + tag] = { status: ar.status(), error: await ad.$eval('#login-err', e => e.textContent), appHidden: await ad.$eval('#app', e => e.hidden), pageErrors: aerr, hscroll: await ad.evaluate(() => document.documentElement.scrollWidth - innerWidth) };
    await ad.screenshot({ path: OUT + 'admin_' + tag + '_mauvais_mdp.png' });
    await ad.close();
  }
  const ck = await b.newPage();
  for (const u of ['robots.txt', 'sitemap.xml', 'content.json', 'site.webmanifest', 'assets/og-image.jpg', 'favicon.svg', 'icon-192.png', 'page-inexistante']) { const r = await ck.goto(BASE + u); R[u] = r.status(); }
  console.log(JSON.stringify(R, null, 1));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
