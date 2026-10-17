/* Dr Life — alertes « nouveau rendez-vous ».
   Supabase Realtime (INSERT sur drlife.appointments) + relève de secours toutes les 30 s.
   Son WebAudio, bannière, pastille sur l'onglet Rendez-vous, titre de l'onglet, notification du navigateur.
   Dépend de window.DL_SB (créé par admin.js). */
(function () {
  'use strict';
  var sb = window.DL_SB; if (!sb) return;
  var TZ = (window.DL_CONFIG || {}).TZ || 'Africa/Algiers';
  var BASE_TITLE = document.title, unread = 0, maxId = null, seen = {}, chan = null, pollT = null, ac = null, running = false;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (e) {} return ac; }
  function chime() {
    var a = audio(); if (!a) return;
    [0, 0.22, 0.44, 0.9, 1.12].forEach(function (t, i) {
      var o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
      o.type = 'sine'; o.frequency.value = [659, 784, 988][i % 3];
      g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.35, s + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      o.connect(g).connect(a.destination); o.start(s); o.stop(s + 0.55);
    });
  }
  document.addEventListener('pointerdown', audio, { once: true });
  function badge() {
    var b = document.querySelector('.side button[data-tab="rdv"]');
    if (b) {
      var x = b.querySelector('.al-badge');
      if (!unread) { if (x) x.remove(); } else { if (!x) { x = el('span', 'al-badge'); b.appendChild(x); } x.textContent = unread > 99 ? '99+' : String(unread); x.setAttribute('aria-label', unread + ' nouveau(x)'); }
    }
    document.title = unread ? '(' + unread + ') 🔔 Nouveau rendez-vous — ' + BASE_TITLE : BASE_TITLE;
  }
  function clearCurrent() { if (unread && (location.hash || '#rdv') === '#rdv' && document.visibilityState === 'visible' && document.hasFocus()) { unread = 0; badge(); } }
  window.addEventListener('hashchange', clearCurrent); document.addEventListener('visibilitychange', clearCurrent); window.addEventListener('focus', clearCurrent);
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.side button[data-tab="rdv"]'); if (b) setTimeout(function () { unread = 0; badge(); }, 0); });
  function openTab() { if (window.DL_GO) window.DL_GO('rdv'); }
  function when(o) { try { return new Date(o.starts_at).toLocaleString('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function desc(o) { return (o.name || 'Client') + ' — ' + (o.service_name || '') + ' · ' + when(o); }
  function banner(o) {
    var box = document.getElementById('al-stack');
    if (!box) { box = el('div', 'al-stack'); box.id = 'al-stack'; box.setAttribute('role', 'alert'); document.body.appendChild(box); }
    var b = el('div', 'al-banner');
    b.appendChild(el('b', null, '🔔 Nouveau rendez-vous ' + (o.ref || ''))); b.appendChild(el('span', null, desc(o)));
    var v = el('button', 'btn btn-solid btn-sm', 'Voir'); v.type = 'button'; v.onclick = function () { openTab(); b.remove(); };
    var x = el('button', 'al-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = function () { b.remove(); };
    b.appendChild(v); b.appendChild(x); box.appendChild(b);
    setTimeout(function () { b.remove(); }, 120000);
  }
  function notify(o) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { var n = new Notification('Dr Life — nouveau rendez-vous ' + (o.ref || ''), { body: desc(o), tag: 'drlife-' + o.id, icon: '../icon-192.png', requireInteraction: true }); n.onclick = function () { window.focus(); openTab(); n.close(); }; } catch (e) {}
  }
  function permButton() {
    var top = document.querySelector('header.top'); if (!top || top.querySelector('.al-perm')) return;
    var need = ('Notification' in window) && Notification.permission === 'default';
    var b = el('button', 'btn btn-line btn-sm al-perm', '🔔'); b.type = 'button';
    b.appendChild(el('span', 'al-lbl', need ? ' Activer les alertes' : ' Tester le son')); b.setAttribute('aria-label', need ? 'Activer les alertes' : 'Tester le son');
    b.onclick = function () { audio(); chime(); if (need) Notification.requestPermission().then(function () { b.remove(); }); else b.remove(); };
    top.insertBefore(b, top.querySelector('#status'));
  }
  function handle(o) {
    if (!o || seen[o.id]) return; seen[o.id] = 1;
    if (maxId != null && o.id <= maxId && !o._rt) return;
    if (o.id > (maxId || 0)) maxId = o.id;
    if (o.source === 'admin') return; // ajout manuel : pas d'alerte
    unread++; badge(); clearCurrent(); chime(); banner(o); notify(o);
    if (typeof window.DL_RELOAD === 'function') try { window.DL_RELOAD(); } catch (e) {}
    document.dispatchEvent(new CustomEvent('dl:new-appointment', { detail: o }));
  }
  function poll() {
    if (maxId == null) return;
    sb.from('appointments').select('id,ref,name,service_name,starts_at,source').gt('id', maxId).order('id').limit(20).then(function (r) { if (!r.error) (r.data || []).forEach(handle); });
  }
  function start() {
    if (running) return; running = true;
    sb.from('appointments').select('id').order('id', { ascending: false }).limit(1).then(function (r) {
      if (r.error) { running = false; return; }
      maxId = r.data && r.data[0] ? r.data[0].id : 0;
      chan = sb.channel('drlife-appointments')
        .on('postgres_changes', { event: 'INSERT', schema: 'drlife', table: 'appointments' }, function (p) { var o = p.new; o._rt = 1; handle(o); })
        .subscribe(function (st) { document.documentElement.setAttribute('data-realtime', st); });
      pollT = setInterval(poll, 30000);
      var t = setInterval(function () { if (document.querySelector('header.top')) { permButton(); badge(); clearInterval(t); } }, 300);
    });
  }
  function stop() { running = false; if (chan) sb.removeChannel(chan); chan = null; clearInterval(pollT); }
  sb.auth.onAuthStateChange(function (ev, session) {
    if (session && session.access_token && sb.realtime && sb.realtime.setAuth) sb.realtime.setAuth(session.access_token);
    if (session) setTimeout(start, 0); else stop();
  });
  window.DL_ALERTS = { test: function () { handle({ id: (maxId || 0) + 100000 + Math.floor(Math.random() * 1000), ref: 'DL-TEST', name: 'Test', service_name: 'Gestion du stress', starts_at: new Date().toISOString() }); } };
})();
