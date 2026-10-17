/* Dr Life — contenu en direct (Supabase drlife.site_content → content.json → HTML prérendu),
   prise de rendez-vous (get_slots / book_appointment), navigation et animations. Script classique, sans dépendance hors supabase-js. */
(function () {
  'use strict';
  var C = window.DL_CONFIG || {}, R = window.DL_RENDER, TZ = C.TZ || 'Africa/Algiers';
  var sb = null, DATA = null, SET = null, root = document.documentElement;
  try { if (window.supabase && C.SUPABASE_URL) sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { db: { schema: C.SCHEMA || 'drlife' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }); } catch (e) { sb = null; }
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var esc = R.esc, rich = R.rich;
  var DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var DEF_WEEK = { 1: [['09:00', '12:00'], ['14:00', '18:00']], 2: [['09:00', '12:00'], ['14:00', '18:00']], 3: [['09:00', '12:00'], ['14:00', '18:00']], 4: [['09:00', '12:00'], ['14:00', '18:00']], 5: [], 6: [['09:00', '12:00'], ['14:00', '18:00']], 7: [['09:00', '12:00'], ['14:00', '18:00']] };
  function say(t) { var s = $('#sr'); if (!s) return; s.textContent = ''; setTimeout(function () { s.textContent = t; }, 40); }
  function timeout(p, ms) { return Promise.race([Promise.resolve(p), new Promise(function (res) { setTimeout(function () { res({ error: { message: 'timeout' }, _timeout: true }); }, ms); })]); }

  /* ---------- contenu ---------- */
  function brand() { return (DATA && DATA.brand) || {}; }
  function waNum() { return String(brand().whatsapp || '213552998411').replace(/[^0-9]/g, ''); }
  function telNum() { return String(brand().phone_intl || '+213552998411').replace(/[^0-9+]/g, ''); }
  function waLink(text) { return 'https://wa.me/' + waNum() + (text ? '?text=' + encodeURIComponent(text) : ''); }
  function apply(d, late) {
    if (!d) return; DATA = d;
    $$('[data-k]').forEach(function (el) { var v = R.get(d, el.getAttribute('data-k')); if (v == null) return; if (el.tagName === 'TITLE') document.title = String(v); else el.innerHTML = rich(v); });
    $$('[data-k-attr]').forEach(function (el) { var p = el.getAttribute('data-k-attr').split(':'); var v = R.get(d, p[1]); if (v != null) el.setAttribute(p[0], String(v)); });
    $$('[data-r]').forEach(function (el) { var n = el.getAttribute('data-r'); if (R[n]) el.innerHTML = R[n](d); });
    $$('[data-photo]').forEach(function (el) {
      var k = el.getAttribute('data-photo'), p = (d.photos || {})[k] || {}, img = el.querySelector('img');
      if (p.src || !img) el.innerHTML = R.photo(d, k, el.getAttribute('data-sizes'), '', el.getAttribute('data-eager') === '1');
      else if (p.alt != null) img.alt = p.alt;
    });
    var tm = $('#temoignages'); if (tm) tm.hidden = !$('#temoignages .tm');
    $$('[data-tel]').forEach(function (a) { a.href = 'tel:' + telNum(); });
    $$('[data-wa]').forEach(function (a) { a.href = waLink(); });
    if (late) $$('.reveal').forEach(function (e) { e.classList.add('in'); });
  }
  function hours() {
    var w = (SET && SET.week) || DEF_WEEK, tb = $('#hours tbody'); if (!tb) return;
    tb.innerHTML = [6, 7, 1, 2, 3, 4, 5].map(function (k) {
      var r = w[k] || w[String(k)] || [];
      return '<tr' + (r.length ? '' : ' class="off"') + '><td>' + DAYS[k] + '</td><td>' + (r.length ? r.map(function (x) { return esc(x[0]) + '–' + esc(x[1]); }).join(' · ') : 'Fermé') + '</td></tr>';
    }).join('');
  }
  function loadContent() {
    var p = sb ? timeout(sb.from('site_content').select('data').eq('id', 1).maybeSingle(), 5000).then(function (r) { if (r && !r.error && r.data && r.data.data) { root.setAttribute('data-live', 'supabase'); return r.data.data; } return null; }, function () { return null; }) : Promise.resolve(null);
    return p.then(function (d) {
      return d || fetch('content.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) root.setAttribute('data-live', 'json'); return j; }).catch(function () { return null; });
    });
  }
  function loadSettings() {
    if (!sb) return Promise.resolve(null);
    return timeout(sb.from('settings').select('booking_open,slot_minutes,min_notice_hours,max_days_ahead,week').eq('id', 1).maybeSingle(), 5000).then(function (r) { return r && !r.error ? r.data : null; }, function () { return null; });
  }

  /* ---------- interface générale ---------- */
  function nav() {
    var n = $('#nav'), b = $('#burger'), m = $('#menu');
    function onScroll() { n.classList.toggle('scrolled', window.scrollY > 10); }
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    function close() { m.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
    b.addEventListener('click', function () { var o = !m.classList.contains('open'); m.classList.toggle('open', o); b.setAttribute('aria-expanded', String(o)); if (o) { var f = m.querySelector('a'); if (f) f.focus(); } });
    m.addEventListener('click', function (e) { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m.classList.contains('open')) { close(); b.focus(); } });
    document.addEventListener('click', function (e) { if (m.classList.contains('open') && !e.target.closest('#menu') && !e.target.closest('#burger')) close(); });
    var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  }
  var io = null;
  function reveals() {
    var els = $$('.reveal:not(.in)');
    if (RM || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    if (!io) io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (e, i) { e.style.transitionDelay = (RM ? 0 : Math.min(i % 3, 2) * 90) + 'ms'; io.observe(e); });
  }
  function mbar() {
    var bar = $('#mbar'); if (!bar || !('IntersectionObserver' in window)) return;
    var vis = {};
    var o = new IntersectionObserver(function (en) { en.forEach(function (x) { vis[x.target.id || 'f'] = x.isIntersecting; }); bar.classList.toggle('hide', Object.keys(vis).some(function (k) { return vis[k]; })); }, { threshold: 0.05 });
    ['#accueil', '#rendez-vous', '#contact'].forEach(function (s) { var e = $(s); if (e) o.observe(e); });
    var f = document.querySelector('footer'); if (f) o.observe(f);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-book]'); if (!a) return;
    e.preventDefault(); BK.pick(a.getAttribute('data-book'));
    var s = $('#rendez-vous'); if (s) s.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  });

  /* ---------- dates (heure d'Algérie) ---------- */
  function todayStr() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function d0(s) { return new Date(s + 'T12:00:00Z'); }
  function ymd(dt) { return dt.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = d0(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function monthOf(s) { return s.slice(0, 7); }
  function addMonth(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; var d = new Date(Date.UTC(y, m, 1, 12)); return ymd(d).slice(0, 7); }
  function lastDay(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); return ymd(new Date(Date.UTC(y, m, 0, 12))); }
  function longDay(s) { return d0(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }); }
  function longDayY(s) { return d0(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  function monthLabel(ym) { return d0(ym + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }); }

  /* ---------- prise de rendez-vous ---------- */
  var ICO = R.icon;
  var BK = (function () {
    var S = { step: 1, services: [], format: null, month: null, day: null, slot: null, f: { name: '', phone: '', email: '', message: '', consent: false, hp: '' }, cache: {}, loading: false, err: '', busy: false, done: null, ready: false };
    var box;
    function services() { return R.active(DATA && DATA.services && DATA.services.items); }
    function svc(id) { return services().filter(function (s) { return s.id === id; })[0]; }
    function formats() { var f = R.active(DATA && DATA.formats && DATA.formats.items); return f.length ? f : [{ key: 'cabinet', title: 'En cabinet' }, { key: 'visio', title: 'En visio' }, { key: 'telephone', title: 'Par téléphone' }]; }
    function fmtTitle(k) { var f = formats().filter(function (x) { return x.key === k; })[0]; return f ? f.title : (R.FMT[k] || k); }
    function sel() { return S.services.map(svc).filter(Boolean); }
    function allowed(k) { return sel().every(function (s) { return !s.formats || !s.formats.length || s.formats.indexOf(k) >= 0; }); }
    // Durée : même règle que le serveur (drlife._duration) — somme des « minutes » renseignées, arrondie au créneau, 240 min max ; sinon durée standard.
    function minutes() {
      var slot = (SET && SET.slot_minutes) || 60, tot = 0;
      sel().forEach(function (s) { var m = String(s.minutes == null ? '' : s.minutes); if (/^\d{1,3}$/.test(m)) tot += Math.min(+m, 240); });
      return Math.min(Math.max(slot, Math.ceil(tot / slot) * slot), Math.max(slot, Math.floor(240 / slot) * slot));
    }
    function toggle(id, on) { var i = S.services.indexOf(id); if (on && i < 0 && S.services.length < 5) S.services.push(id); if (!on && i >= 0) S.services.splice(i, 1); S.services = services().map(function (x) { return x.id; }).filter(function (x) { return S.services.indexOf(x) >= 0; }); if (S.format && !allowed(S.format)) S.format = null; S.slot = null; }
    function open() { return !!sb && (!SET || SET.booking_open !== false); }
    function maxDay() { return addDays(todayStr(), (SET && SET.max_days_ahead) || 60); }

    function fetchMonth(ym) {
      var mins = minutes(), key = ym + '|' + mins;
      if (S.cache[key]) return Promise.resolve(S.cache[key]);
      var t = todayStr(), from = ym + '-01', to = lastDay(ym);
      if (from < t) from = t; if (to > maxDay()) to = maxDay();
      if (from > to) { S.cache[key] = {}; return Promise.resolve(S.cache[key]); }
      return timeout(sb.rpc('get_slots', { p_from: from, p_to: to, p_minutes: mins }), 9000).then(function (r) {
        if (r.error) throw new Error(r._timeout ? 'Le calendrier met trop de temps à répondre.' : r.error.message);
        var m = {}; (r.data || []).forEach(function (x) { (m[x.day] = m[x.day] || []).push({ hhmm: x.hhmm, starts_at: x.starts_at }); });
        S.cache[key] = m; return m;
      });
    }
    function firstAvail(m) { var k = Object.keys(m).sort(); return k[0] || null; }
    function goStep2() {
      S.step = 2; S.err = ''; if (!S.month) S.month = monthOf(todayStr());
      S.loading = true; draw();
      fetchMonth(S.month).then(function (m) {
        if (!firstAvail(m) && !S.day && S.month === monthOf(todayStr())) { S.month = addMonth(S.month, 1); return fetchMonth(S.month); }
        return m;
      }).then(function (m) {
        S.loading = false;
        if (!S.day || !(m[S.day])) { S.day = firstAvail(m); S.slot = null; }
        draw();
      }).catch(function (e) { S.loading = false; S.err = 'Impossible de charger les créneaux (' + e.message + '). Réessayez ou contactez-nous.'; draw(); });
    }
    function changeMonth(n) {
      S.month = addMonth(S.month, n); S.loading = true; S.err = ''; draw();
      fetchMonth(S.month).then(function (m) { S.loading = false; if (!S.day || monthOf(S.day) !== S.month) { S.day = firstAvail(m); S.slot = null; } draw(); }).catch(function (e) { S.loading = false; S.err = e.message; draw(); });
    }

    function stepsBar() {
      var L = [['Choix', 'Accompagnement'], ['Date', 'Date & heure'], ['Vous', 'Coordonnées'], ['Ok', 'Confirmation']];
      return '<ol class="bk-steps" aria-label="Étapes">' + L.map(function (l, i) {
        var n = i + 1, c = S.done ? 'done' : (n < S.step ? 'done' : n === S.step ? 'on' : '');
        return '<li class="' + c + '"' + (n === S.step && !S.done ? ' aria-current="step"' : '') + '><b>' + n + '</b><span class="l-long">' + l[1] + '</span><span class="l-short" aria-hidden="true">' + l[0] + '</span></li>';
      }).join('') + '</ol>';
    }
    function recap() {
      var ss = S.done ? S.done.services : sel().map(function (x) { return { id: x.id, title: x.title, price: x.price }; }), rows = [];
      rows.push([ss.length > 1 ? 'Accompagnements' : 'Accompagnement', ss.length ? ss.map(function (x) { return x.title; }).join(' + ') : '—']);
      rows.push(['Format', S.format ? fmtTitle(S.format) : '—']);
      rows.push(['Date', S.slot ? longDayY(S.day) : '—']);
      rows.push(['Heure', S.slot ? S.slot.hhmm + ' (' + (S.done && S.done.minutes ? S.done.minutes : minutes()) + ' min)' : '—']);
      if (S.step >= 4 || S.done) { rows.push(['Nom', S.f.name]); rows.push(['Téléphone', S.f.phone]); if (S.f.email) rows.push(['E-mail', S.f.email]); }
      if (ss.length) { var pr = ss.map(function (x) { var o = svc(x.id); return (o && o.price) || 'Tarif sur demande'; }); rows.push(['Tarif', pr.every(function (x) { return x === pr[0]; }) ? pr[0] : pr.join(' · ')]); }
      return '<dl class="recap">' + rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>';
    }
    function errBox() { return S.err ? '<p class="bk-err" role="alert">' + esc(S.err) + '</p>' : ''; }
    function closedView(msg) {
      return '<div class="done"><p class="lead" style="margin:0 auto 1.2rem">' + esc(msg) + '</p><div class="done-btns">' +
        '<a class="btn btn-solid" href="tel:' + telNum() + '">' + ICO('telephone', 'ico-s') + 'Appeler le ' + esc(brand().phone || '0552 99 84 11') + '</a>' +
        '<a class="btn btn-wa" href="' + waLink('Bonjour, je souhaite prendre rendez-vous avec Dr Life.') + '" target="_blank" rel="noopener">Écrire sur WhatsApp</a></div></div>';
    }
    function step1() {
      var n = S.services.length, mins = minutes();
      var h = '<fieldset><legend id="bk-h" tabindex="-1">Quel(s) accompagnement(s) ?</legend><p class="mut sm" id="svc-help" style="margin:-.3rem 0 .7rem">Cochez un ou plusieurs thèmes (5 au maximum) : ils seront abordés pendant le même rendez-vous.</p><div class="chips" role="group" aria-describedby="svc-help">' + services().map(function (s) {
        var on = S.services.indexOf(s.id) >= 0;
        return '<label class="chip chip-check' + (on ? ' on' : '') + '"><input type="checkbox" name="svc" value="' + esc(s.id) + '"' + (on ? ' checked' : '') + '><i class="tick" aria-hidden="true"></i>' + ICO(s.icon, 'ico-s') + '<span>' + esc(s.title) + '<small>' + esc((s.duration ? s.duration + ' · ' : '') + (s.price || 'Tarif sur demande')) + '</small></span></label>';
      }).join('') + '</div><p class="sel-count" aria-live="polite">' + (n ? n + ' accompagnement' + (n > 1 ? 's' : '') + ' sélectionné' + (n > 1 ? 's' : '') + ' · durée prévue ' + mins + ' min' : 'Aucun accompagnement sélectionné') + '</p></fieldset>';
      h += '<fieldset><legend>Quel format ?</legend><div class="fmts">' + formats().map(function (f) {
        var ok = allowed(f.key);
        return '<label class="chip' + (S.format === f.key ? ' on' : '') + (ok ? '' : ' dis') + '"><input type="radio" name="fmt" value="' + esc(f.key) + '"' + (S.format === f.key ? ' checked' : '') + (ok ? '' : ' disabled') + '>' + ICO(f.key, 'ico-s') + '<span>' + esc(f.title) + '</span></label>';
      }).join('') + '</div>' + (n && formats().some(function (f) { return !allowed(f.key); }) ? '<p class="mut sm" style="margin:.5rem 0 0">Certains formats ne sont pas proposés pour ' + (n > 1 ? 'l’un des accompagnements choisis' : 'cet accompagnement') + '.</p>' : '') + '</fieldset>';
      h += errBox() + '<div class="bk-nav"><button class="btn btn-solid" type="button" data-act="to2"' + (n && S.format ? '' : ' disabled') + '>Choisir une date →</button></div>';
      return h;
    }
    function step2() {
      var m = S.cache[S.month + '|' + minutes()] || {}, t = todayStr(), ym = S.month;
      var first = d0(ym + '-01'), off = (first.getUTCDay() + 6) % 7, last = +lastDay(ym).slice(8, 10);
      var prevOk = ym > monthOf(t), nextOk = addMonth(ym, 1) + '-01' <= maxDay();
      var cal = '<div class="cal"><div class="cal-head"><button type="button" data-act="prev" aria-label="Mois précédent"' + (prevOk && !S.loading ? '' : ' disabled') + '>‹</button><b aria-live="polite">' + esc(monthLabel(ym)) + '</b><button type="button" data-act="next" aria-label="Mois suivant"' + (nextOk && !S.loading ? '' : ' disabled') + '>›</button></div>';
      cal += '<div class="cal-grid" role="grid" aria-label="Calendrier">' + ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(function (x) { return '<span class="cal-dow" aria-hidden="true">' + x + '</span>'; }).join('');
      for (var i = 0; i < off; i++) cal += '<span></span>';
      for (var d = 1; d <= last; d++) {
        var ds = ym + '-' + (d < 10 ? '0' : '') + d, n = (m[ds] || []).length, c = 'cal-day' + (n ? ' av' : '') + (ds === S.day ? ' sel' : '') + (ds === t ? ' today' : '');
        cal += '<button type="button" class="' + c + '" data-day="' + ds + '"' + (n ? '' : ' disabled') + ' aria-label="' + esc(longDay(ds) + (n ? ', ' + n + ' créneau' + (n > 1 ? 'x' : '') + ' libre' + (n > 1 ? 's' : '') : ', complet ou fermé')) + '"' + (ds === S.day ? ' aria-pressed="true"' : '') + '>' + d + '</button>';
      }
      cal += '</div><div class="cal-legend"><span><i></i>Jour disponible</span><span>' + (S.loading ? 'Chargement…' : Object.keys(m).length ? Object.keys(m).length + ' jour(s) disponible(s) ce mois-ci' : 'Aucun créneau libre ce mois-ci') + '</span></div></div>';
      var sl = '<div class="slots">';
      if (S.day && m[S.day]) {
        var groups = [['Matin', function (h) { return h < '12:00'; }], ['Après-midi', function (h) { return h >= '12:00' && h < '18:00'; }], ['Soir', function (h) { return h >= '18:00'; }]];
        sl += '<p class="slots-day">' + esc(longDay(S.day)) + '</p>';
        groups.forEach(function (g) {
          var xs = m[S.day].filter(function (x) { return g[1](x.hhmm); }); if (!xs.length) return;
          sl += '<h4>' + g[0] + '</h4><div class="slot-grid">' + xs.map(function (x) { var on = S.slot && S.slot.starts_at === x.starts_at; return '<button type="button" class="slot' + (on ? ' sel' : '') + '" data-slot="' + esc(x.starts_at) + '" data-hhmm="' + esc(x.hhmm) + '" aria-pressed="' + on + '">' + esc(x.hhmm) + '</button>'; }).join('') + '</div>';
        });
      } else if (!S.loading) sl += '<p class="mut">' + (Object.keys(m).length ? 'Choisissez une date dans le calendrier.' : 'Aucun créneau libre ce mois-ci : essayez le mois suivant, ou contactez-nous.') + '</p>';
      sl += '</div>';
      return '<p class="lbl" id="bk-h" tabindex="-1">Choisissez une date puis un horaire</p>' + errBox() + '<div class="cal-wrap">' + cal + sl + '</div>' +
        '<div class="bk-nav"><button class="btn btn-line" type="button" data-act="to1">← Retour</button><button class="btn btn-solid" type="button" data-act="to3"' + (S.slot ? '' : ' disabled') + '>Continuer →</button></div>';
    }
    function fld(id, label, type, val, opt) {
      opt = opt || {};
      var inp = type === 'textarea' ? '<textarea id="' + id + '" name="' + id + '" maxlength="1000" rows="4" placeholder="' + esc(opt.ph || '') + '">' + esc(val) + '</textarea>'
        : '<input id="' + id + '" name="' + id + '" type="' + type + '" value="' + esc(val) + '"' + (opt.ac ? ' autocomplete="' + opt.ac + '"' : '') + (opt.im ? ' inputmode="' + opt.im + '"' : '') + (opt.req ? ' required aria-required="true"' : '') + ' maxlength="' + (opt.max || 120) + '" placeholder="' + esc(opt.ph || '') + '" aria-describedby="' + id + '-e">';
      return '<label class="fld" for="' + id + '"><span>' + label + '</span>' + inp + '<small class="ferr" id="' + id + '-e"></small></label>';
    }
    function step3() {
      return '<p class="lbl" id="bk-h" tabindex="-1">Vos coordonnées</p>' + errBox() +
        '<form id="bk-form" novalidate><div class="two">' + fld('f-name', 'Nom et prénom', 'text', S.f.name, { ac: 'name', req: 1, max: 80, ph: 'ex. Amina B.' }) +
        fld('f-phone', 'Téléphone', 'tel', S.f.phone, { ac: 'tel', im: 'tel', req: 1, max: 22, ph: 'ex. 0555 12 34 56' }) + '</div>' +
        fld('f-email', 'E-mail <small>(facultatif)</small>', 'email', S.f.email, { ac: 'email', im: 'email', max: 120, ph: 'vous@exemple.com' }) +
        fld('f-msg', 'Message <small>(facultatif — ce que vous souhaitez travailler)</small>', 'textarea', S.f.message, { ph: 'Quelques mots si vous le souhaitez…' }) +
        '<label class="hp" aria-hidden="true">Ne pas remplir<input type="text" name="website" id="f-hp" tabindex="-1" autocomplete="off"></label>' +
        '<label class="check"><input type="checkbox" id="f-consent"' + (S.f.consent ? ' checked' : '') + '><span>J’ai bien compris que ces séances de coaching ne remplacent pas un suivi médical ou psychologique, et j’accepte que mes coordonnées servent uniquement à organiser ce rendez-vous.</span></label><small class="ferr" id="f-consent-e" style="color:#a3311f"></small>' +
        '<div class="bk-nav"><button class="btn btn-line" type="button" data-act="to2b">← Retour</button><button class="btn btn-solid" type="submit">Vérifier →</button></div></form>';
    }
    function step4() {
      return '<p class="lbl" id="bk-h" tabindex="-1">Vérifiez et confirmez</p>' + errBox() + recap() +
        (S.f.message ? '<p class="mut sm" style="margin-top:.8rem"><b>Message :</b> ' + esc(S.f.message) + '</p>' : '') +
        '<p class="mut sm" style="margin-top:.9rem">' + esc((DATA && DATA.booking && DATA.booking.confirm_text) || '') + '</p>' +
        '<div class="bk-nav"><button class="btn btn-line" type="button" data-act="to3b">← Modifier</button><button class="btn btn-solid" type="button" data-act="book" id="bk-confirm"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Envoi…' : 'Confirmer le rendez-vous') + '</button></div>';
    }
    function waText() {
      var D = S.done; return 'Bonjour, je viens de réserver sur le site Dr Life.\nRéférence : ' + D.ref + (D.services.length > 1 ? '\nAccompagnements : ' : '\nAccompagnement : ') + D.services.map(function (x) { return x.title; }).join(', ') + '\nDurée prévue : ' + D.minutes + ' min' + '\nFormat : ' + fmtTitle(D.format) + '\nDate : ' + longDayY(D.day) + ' à ' + D.hhmm + '\nNom : ' + S.f.name + '\nMerci de me confirmer le rendez-vous.';
    }
    function doneView() {
      var D = S.done;
      return '<div class="done"><div class="done-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M5 12.5 10 17 19 7"/></svg></div>' +
        '<h3 id="bk-h" tabindex="-1">Demande de rendez-vous enregistrée</h3><p class="mut">Votre numéro de réservation :</p><div class="ref" id="bk-ref">' + esc(D.ref) + '</div>' + recap() +
        '<p class="mut sm" style="max-width:440px;margin:0 auto 1.2rem">' + esc((DATA && DATA.booking && DATA.booking.confirm_text) || '') + ' Pour aller plus vite, confirmez sur WhatsApp :</p>' +
        '<div class="done-btns"><a class="btn btn-wa" id="bk-wa" href="' + esc(waLink(waText())) + '" target="_blank" rel="noopener">Confirmer sur WhatsApp</a>' +
        '<button class="btn btn-line" type="button" data-act="ics">Ajouter à mon agenda</button><button class="btn btn-ghost" type="button" data-act="again">Nouvelle réservation</button></div></div>';
    }
    function draw(focus) {
      if (!box) return;
      var hadFocus = box.contains(document.activeElement) && document.activeElement !== box;
      if (!DATA) { box.innerHTML = window.DL_LOADED ? closedView('La réservation en ligne est momentanément indisponible. Appelez ou écrivez sur WhatsApp pour fixer un rendez-vous.') : '<p class="bk-loading">Chargement…</p>'; return; }
      if (!sb) { box.innerHTML = closedView('La réservation en ligne est momentanément indisponible. Appelez ou écrivez sur WhatsApp pour fixer un rendez-vous.'); return; }
      if (!open()) { box.innerHTML = closedView((DATA.booking && DATA.booking.closed_text) || 'La réservation en ligne est momentanément fermée.'); return; }
      var main = S.done ? doneView() : [step1, step2, step3, step4][S.step - 1]();
      var side = (!S.done && S.step < 4) ? '<aside class="bk-side hide-m" aria-label="Votre sélection"><h3>Votre sélection</h3>' + recap() + '<p class="mut sm">Le rendez-vous est confirmé avec vous après réservation. Tarifs communiqués sur demande.</p></aside>' : '';
      box.innerHTML = stepsBar() + '<div class="bk-grid"' + (side ? '' : ' style="grid-template-columns:1fr"') + '><div class="bk-main" data-step="' + (S.done ? 'done' : S.step) + '">' + main + '</div>' + side + '</div>';
      if (!focus && hadFocus && !box.contains(document.activeElement)) { var h0 = $('#bk-h', box); if (h0) h0.focus({ preventScroll: true }); }
      if (focus) {
        var h = $('#bk-h', box); if (h) h.focus({ preventScroll: true });
        var top = box.getBoundingClientRect().top; if (top < 0 || top > window.innerHeight * 0.6) box.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
      }
    }
    function validate() {
      var ok = true, f = S.f;
      function set(id, msg) { var e = $('#' + id + '-e'), l = e && e.closest('.fld'); if (e) e.textContent = msg || ''; if (l) l.classList.toggle('bad', !!msg); var i = $('#' + id); if (i && i.setAttribute) i.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (msg && ok) { ok = false; if (i) i.focus(); } }
      var name = f.name.trim(), phone = f.phone.trim(), digits = phone.replace(/[^0-9]/g, '');
      set('f-name', name.length < 2 ? 'Indiquez votre nom (2 caractères minimum).' : name.length > 80 ? 'Nom trop long.' : '');
      set('f-phone', !/^\+?[0-9][0-9 .-]{7,18}[0-9]$/.test(phone) || digits.length < 9 || digits.length > 15 ? 'Numéro invalide (ex. 0555 12 34 56 ou +213 555 12 34 56).' : '');
      set('f-email', f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) ? 'Adresse e-mail invalide.' : '');
      var ce = $('#f-consent-e'); if (ce) ce.textContent = f.consent ? '' : 'Merci de cocher cette case pour continuer.'; if (!f.consent && ok) { ok = false; var c = $('#f-consent'); if (c) c.focus(); }
      return ok;
    }
    function book() {
      if (S.busy) return; S.busy = true; S.err = ''; draw();
      var payload = { services: S.services.slice(), format: S.format, starts_at: S.slot.starts_at, name: S.f.name.trim(), phone: S.f.phone.trim(), email: S.f.email.trim(), message: S.f.message.trim(), hp: S.f.hp };
      timeout(sb.rpc('book_appointment', { p: payload }), 15000).then(function (r) {
        S.busy = false;
        if (r.error) {
          var msg = r._timeout || /fetch|network/i.test(r.error.message || '') ? 'Connexion impossible. Vérifiez votre réseau, ou réservez directement sur WhatsApp.' : (r.error.message || 'Erreur inconnue.');
          if (/plus disponible|vient d.être réservé/i.test(msg)) { S.cache = {}; S.slot = null; S.err = msg; goStep2(); say(msg); return; }
          S.err = msg; draw(true); say(msg); return;
        }
        var d = r.data || {};
        var list = (d.services && d.services.length ? d.services : sel()).map(function (x) { return { id: x.id, title: x.title }; });
        S.done = { ref: d.ref, services: list, service: list.map(function (x) { return x.title; }).join(' + '), minutes: d.minutes || minutes(), format: d.format || S.format, starts_at: d.starts_at, ends_at: d.ends_at, day: S.day, hhmm: S.slot.hhmm };
        S.cache = {};
        draw(true); say('Rendez-vous enregistré. Référence ' + d.ref);
      });
    }
    function ics() {
      var D = S.done; if (!D) return;
      function ics_esc(x) { return String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
      function u(s) { return new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
      var t = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dr Life//Rendez-vous//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + D.ref + '@drlife', 'DTSTAMP:' + u(new Date()), 'DTSTART:' + u(D.starts_at), 'DTEND:' + u(D.ends_at || new Date(new Date(D.starts_at).getTime() + 3600000)),
        'SUMMARY:' + ics_esc('Dr Life — ' + D.services.map(function (x) { return x.title; }).join(' + ') + ' (' + fmtTitle(D.format) + ')'), 'DESCRIPTION:' + ics_esc('Réf. ' + D.ref + ' — accompagnement(s) : ' + D.services.map(function (x) { return x.title; }).join(', ') + ' (' + D.minutes + ' min). Rendez-vous à confirmer avec le praticien. Tél. ' + (brand().phone || '')), 'LOCATION:' + (D.format === 'cabinet' ? 'Tlemcen' : 'En ligne'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/calendar;charset=utf-8' })); a.download = 'rendez-vous-' + D.ref + '.ics'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function bind() {
      box.addEventListener('change', function (e) {
        var t = e.target;
        if (t.name === 'svc') {
          if (t.checked && S.services.length >= 5) { t.checked = false; S.err = 'Cinq accompagnements au maximum par rendez-vous.'; draw(); return; }
          toggle(t.value, t.checked); if (!S.format) { var f = formats().filter(function (x) { return allowed(x.key); }); if (f.length === 1) S.format = f[0].key; }
          S.err = ''; var v = t.value; draw(); var c = box.querySelector('input[name=svc][value="' + v + '"]'); if (c) c.focus(); }
        else if (t.name === 'fmt') { S.format = t.value; S.err = ''; draw(); var c2 = box.querySelector('input[name=fmt]:checked'); if (c2) c2.focus(); }
        else if (t.id === 'f-consent') { S.f.consent = t.checked; var ce = $('#f-consent-e'); if (ce && t.checked) ce.textContent = ''; }
      });
      box.addEventListener('input', function (e) {
        var t = e.target, map = { 'f-name': 'name', 'f-phone': 'phone', 'f-email': 'email', 'f-msg': 'message', 'f-hp': 'hp' };
        if (map[t.id]) { S.f[map[t.id]] = t.value; var fe = $('#' + t.id + '-e'); if (fe && fe.textContent) { fe.textContent = ''; var fl = fe.closest('.fld'); if (fl) fl.classList.remove('bad'); t.setAttribute('aria-invalid', 'false'); } }
      });
      box.addEventListener('submit', function (e) { e.preventDefault(); if (validate()) { S.step = 4; S.err = ''; draw(true); } });
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || b.disabled) return;
        var act = b.getAttribute('data-act');
        if (b.hasAttribute('data-day')) { S.day = b.getAttribute('data-day'); S.slot = null; draw(); var sd = box.querySelector('.slots'); if (sd && window.innerWidth < 860) sd.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'nearest' }); return; }
        if (b.hasAttribute('data-slot')) { S.slot = { starts_at: b.getAttribute('data-slot'), hhmm: b.getAttribute('data-hhmm') }; draw(); var nx = box.querySelector('[data-act="to3"]'); if (nx) { nx.focus({ preventScroll: true }); if (window.innerWidth < 860) nx.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'nearest' }); } return; }
        if (act === 'to2') { goStep2(); setTimeout(function () { draw(true); }, 0); }
        else if (act === 'to1') { S.step = 1; S.err = ''; draw(true); }
        else if (act === 'prev') changeMonth(-1);
        else if (act === 'next') changeMonth(1);
        else if (act === 'to3') { S.step = 3; S.err = ''; draw(true); }
        else if (act === 'to2b') { S.step = 2; S.err = ''; draw(true); }
        else if (act === 'to3b') { S.step = 3; S.err = ''; draw(true); }
        else if (act === 'book') book();
        else if (act === 'ics') ics();
        else if (act === 'again') { var keep = { name: S.f.name, phone: S.f.phone, email: S.f.email, message: '', consent: S.f.consent, hp: '' }; S = { step: 1, services: [], format: null, month: null, day: null, slot: null, f: keep, cache: {}, loading: false, err: '', busy: false, done: null }; draw(true); }
      });
    }
    return {
      init: function () { box = $('#bk'); if (!box) return; bind(); draw(); },
      refresh: function () { if (S.step === 2 && !S.done) goStep2(); else draw(); },
      pick: function (id) { if (S.done) return; if (svc(id)) toggle(id, true); S.step = 1; S.err = ''; draw(); }
    };
  })();
  window.DL_BOOKING = BK;

  /* ---------- démarrage ---------- */
  function start() {
    nav(); mbar(); BK.init();
    var started = false;
    var kick = setTimeout(function () { if (!started) { started = true; reveals(); } }, 4500);
    Promise.all([loadContent(), loadSettings()]).then(function (rs) {
      SET = rs[1]; hours();
      var late = started; apply(rs[0], late);
      if (!rs[0]) root.setAttribute('data-live', 'static');
      window.DL_LOADED = true;
      clearTimeout(kick); started = true; reveals(); BK.refresh();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
