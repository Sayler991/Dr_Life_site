/* Espace praticien Dr Life — Supabase schéma « drlife » :
   rendez-vous (statuts, filtres, WhatsApp), calendrier, disponibilités & dates bloquées,
   contenu, accompagnements & tarifs, FAQ, témoignages, photos, historique.
   Compte propriétaire = table partagée public.owners (fonction public.is_owner()). */
(function () {
  'use strict';
  var C = window.DL_CONFIG || {}, TZ = C.TZ || 'Africa/Algiers';
  var sb = (window.supabase && C.SUPABASE_URL) ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { db: { schema: C.SCHEMA || 'drlife' } }) : null;
  window.DL_SB = sb;
  var BUCKET = 'images', STATUSES = ['en attente', 'confirmé', 'annulé', 'terminé'];
  var FMT = { cabinet: 'En cabinet', visio: 'En visio', telephone: 'Par téléphone' };
  var ICONS = { wave: 'Vague (stress)', leaf: 'Feuille (anxiété)', star: 'Étoile (confiance)', loop: 'Boucle (habitudes)', heart: 'Cœur (émotions)', moon: 'Lune (sommeil)', link: 'Anneaux (couple)', spiral: 'Spirale (hypnose)', spark: 'Neurones (coaching)' };
  var DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CONTENT = null, DIRTY = false, TAB = 'rdv';
  function slug(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^en /, '').replace(/[^a-z]/g, ''); }
  function h(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'text') e.textContent = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); }); }
    return e;
  }
  function toast(t, err) { var x = h('div', { class: 'toast' + (err ? ' err' : ''), text: t }); $('#toasts').appendChild(x); setTimeout(function () { x.remove(); }, err ? 7000 : 3500); }
  function dt(s) { return new Date(s).toLocaleString('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }); }
  function dLong(s) { return new Date(s).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function hm(s) { return new Date(s).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); }
  function localDay(s) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s)); }
  function todayStr() { return localDay(new Date()); }
  function d0(s) { return new Date(s + 'T12:00:00Z'); }
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = d0(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function addMonth(ym, n) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; return ymd(new Date(Date.UTC(y, m, 1, 12))).slice(0, 7); }
  function lastDay(ym) { return ymd(new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0, 12))); }
  // Algérie : UTC+1 toute l'année (pas d'heure d'été)
  function localISO(day, time) { return day + 'T' + time + ':00+01:00'; }
  function telA(p) { return h('a', { href: 'tel:' + String(p || '').replace(/[^0-9+]/g, ''), text: p || '' }); }
  function intl(p) { var d = String(p || '').replace(/[^0-9+]/g, ''); if (d[0] === '+') return d.slice(1); if (d.slice(0, 2) === '00') return d.slice(2); if (d[0] === '0' && d.length === 10) return '213' + d.slice(1); return d; }
  function waClient(a) {
    var when = dLong(a.starts_at) + ' à ' + hm(a.starts_at), f = FMT[a.format] || a.format, t;
    if (a.status === 'annulé') t = 'Bonjour ' + a.name + ', c’est Dr Life. Votre rendez-vous du ' + when + ' (réf. ' + a.ref + ') est annulé. Souhaitez-vous choisir un autre créneau ?';
    else if (a.status === 'terminé') t = 'Bonjour ' + a.name + ', c’est Dr Life. Merci pour la séance. N’hésitez pas à me écrire si vous avez une question.';
    else t = 'Bonjour ' + a.name + ', c’est Dr Life. Je vous confirme votre rendez-vous « ' + (a.service_name || '') + ' » le ' + when + ' (' + f.toLowerCase() + '). Réf. ' + a.ref + '. À bientôt !';
    return 'https://wa.me/' + intl(a.phone) + '?text=' + encodeURIComponent(t);
  }
  function field(label, obj, key, opt) {
    opt = opt || {};
    if (opt.type === 'checkbox') { var cb = h('input', { type: 'checkbox' }); cb.checked = obj[key] !== false; cb.onchange = function () { obj[key] = cb.checked; DIRTY = true; }; return h('label', { class: 'switch' }, cb, label); }
    var inp = opt.type === 'textarea' ? h('textarea', { rows: opt.rows || 2, placeholder: opt.ph || null }) : h('input', { type: opt.type || 'text', placeholder: opt.ph || null, inputmode: opt.inputmode || null });
    inp.value = obj[key] == null ? '' : obj[key];
    inp.oninput = function () { obj[key] = inp.value; if (!opt.free) DIRTY = true; };
    return h('label', { class: 'f' }, h('span', { text: label }), inp, opt.hint ? h('small', { class: 'mut', text: opt.hint }) : null);
  }
  function select(label, obj, key, options, free) {
    var s = h('select', null, Object.keys(options).map(function (k) { return h('option', { value: k, text: options[k] }); })); s.value = obj[key] || Object.keys(options)[0];
    s.onchange = function () { obj[key] = s.value; if (!free) DIRTY = true; };
    return h('label', { class: 'f' }, h('span', { text: label }), s);
  }
  function mover(list, i, redraw) {
    return [h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↑', title: 'Monter', disabled: i === 0, onclick: function () { list.splice(i - 1, 0, list.splice(i, 1)[0]); DIRTY = true; redraw(); } }),
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↓', title: 'Descendre', disabled: i === list.length - 1, onclick: function () { list.splice(i + 1, 0, list.splice(i, 1)[0]); DIRTY = true; redraw(); } }),
      h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Supprimer', onclick: function () { if (confirm('Supprimer cet élément ?')) { list.splice(i, 1); DIRTY = true; redraw(); } } })];
  }

  /* ---------- connexion ---------- */
  function showLogin(msg) {
    $('#boot').hidden = true; $('#app').hidden = true; $('#login').hidden = false;
    if (msg) { $('#login-err').textContent = msg; $('#login-err').hidden = false; }
  }
  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault(); $('#login-err').hidden = true; $('#login-btn').disabled = true;
    sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pw').value }).then(function (r) {
      $('#login-btn').disabled = false;
      if (r.error) showLogin('Connexion refusée : ' + (r.error.message === 'Invalid login credentials' ? 'e-mail ou mot de passe incorrect.' : r.error.message));
    });
  });
  function checkOwner(session) {
    return sb.schema('public').from('owners').select('user_id').eq('user_id', session.user.id).maybeSingle().then(function (r) { return !!(r.data); });
  }

  /* ---------- squelette ---------- */
  var TABS = [['rdv', '📅 Rendez-vous'], ['calendrier', '🗓️ Calendrier'], ['dispo', '🕘 Disponibilités'], ['contenu', '✏️ Textes du site'], ['services', '🧩 Accompagnements & tarifs'], ['faq', '❓ FAQ'], ['temoignages', '💬 Témoignages'], ['photos', '🖼️ Photos'], ['historique', '↺ Historique']];
  function shell(session) {
    var app = $('#app'); app.innerHTML = '';
    var side = h('nav', { class: 'side', 'aria-label': 'Sections' });
    TABS.forEach(function (t) { side.appendChild(h('button', { type: 'button', 'data-tab': t[0], text: t[1], onclick: function () { go(t[0]); } })); });
    app.appendChild(h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('img', { src: '../assets/logo.svg', alt: '' }), h('b', { text: 'Dr Life — espace praticien' })),
      h('span', { id: 'status', text: session.user.email }),
      h('a', { class: 'btn btn-line btn-sm', href: '../', target: '_blank', text: 'Voir le site' }),
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Déconnexion', onclick: function () { sb.auth.signOut(); } })));
    app.appendChild(h('div', { class: 'layout' }, side, h('main', { id: 'main' })));
    $('#boot').hidden = true; $('#login').hidden = true; app.hidden = false;
    go((location.hash || '#rdv').slice(1));
  }
  function go(tab) {
    if (DIRTY && !confirm('Modifications non enregistrées : les abandonner ?')) return;
    DIRTY = false; if (!TABS.some(function (t) { return t[0] === tab; })) tab = 'rdv'; TAB = tab;
    history.replaceState(null, '', '#' + tab);
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    var m = $('#main'); m.innerHTML = '';
    ({ rdv: viewAppts, calendrier: viewCalendar, dispo: viewAvail, contenu: viewContent, services: viewServices, faq: viewFaq, temoignages: viewTestimonials, photos: viewPhotos, historique: viewHistory })[tab](m);
  }
  window.DL_GO = function (t) { go(t); };

  /* ---------- rendez-vous ---------- */
  function apptCard(a, onChange) {
    var badge = h('span', { class: 'st st-' + slug(a.status), text: a.status }), card;
    var sel = h('select', { 'aria-label': 'Statut du rendez-vous ' + a.ref }, STATUSES.map(function (s) { return h('option', { value: s, text: s }); })); sel.value = a.status;
    var wa = h('a', { class: 'btn btn-wa btn-sm', href: waClient(a), target: '_blank', rel: 'noopener', text: 'WhatsApp client' });
    sel.onchange = function () {
      var v = sel.value;
      sb.from('appointments').update({ status: v }).eq('id', a.id).select('id').single().then(function (r) {
        if (r.error) { toast(/dl_appt|duplicate|conflict/i.test(r.error.message) ? 'Impossible : ce créneau est déjà pris par un autre rendez-vous.' : r.error.message, true); sel.value = a.status; return; }
        a.status = v; badge.className = 'st st-' + slug(v); badge.textContent = v; card.className = 'card appt s-' + slug(v); wa.href = waClient(a); toast(a.ref + ' : ' + v); if (onChange) onChange();
      });
    };
    var note = h('textarea', { rows: 2, placeholder: 'Note privée (visible uniquement ici)' }); note.value = a.admin_note || '';
    var saveNote = h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Enregistrer la note', onclick: function () {
      sb.from('appointments').update({ admin_note: note.value.trim() || null }).eq('id', a.id).select('id').single().then(function (r) { toast(r.error ? r.error.message : 'Note enregistrée', !!r.error); });
    } });
    var del = h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Supprimer', onclick: function () {
      if (!confirm('Supprimer définitivement le rendez-vous ' + a.ref + ' ? (Pour libérer le créneau, vous pouvez aussi le passer en « annulé ».)')) return;
      sb.from('appointments').delete().eq('id', a.id).then(function (r) { if (r.error) return toast(r.error.message, true); card.remove(); toast('Rendez-vous supprimé'); if (onChange) onChange(); });
    } });
    card = h('section', { class: 'card appt s-' + slug(a.status), 'data-ref': a.ref },
      h('div', null,
        h('div', { class: 'when', text: dLong(a.starts_at) + ' · ' + hm(a.starts_at) + '–' + hm(a.ends_at) }),
        h('p', null, h('b', { text: a.name }), ' ', badge, ' · ', telA(a.phone), a.email ? [' · ', h('a', { href: 'mailto:' + a.email, text: a.email })] : null),
        h('p', { class: 'sm', text: '🧩 ' + (a.service_name || a.service_id) + ' · ' + (FMT[a.format] || a.format) + ' · réf. ' + a.ref + ' · ' + (a.source === 'admin' ? 'ajouté par vous' : 'réservé en ligne') + ' le ' + dt(a.created_at) }),
        a.message ? h('p', { text: '💬 ' + a.message }) : null,
        h('div', { style: 'margin-top:.4rem' }, note, h('div', { class: 'row', style: 'margin-top:.3rem' }, saveNote, del))),
      h('div', { class: 'acts' }, sel, wa));
    return card;
  }
  function viewAppts(m) {
    m.appendChild(h('h2', { text: '📅 Rendez-vous' }));
    var kp = h('div', { class: 'kpis' });
    m.appendChild(kp);
    var filt = h('select', { 'aria-label': 'Filtre' }, [['upcoming', 'À venir (en attente + confirmés)'], ['en attente', 'En attente'], ['confirmé', 'Confirmés'], ['terminé', 'Terminés'], ['annulé', 'Annulés'], ['today', 'Aujourd’hui'], ['past', 'Passés'], ['', 'Tous']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var from = h('input', { type: 'date', 'aria-label': 'Du' }), to = h('input', { type: 'date', 'aria-label': 'Au' });
    var q = h('input', { type: 'search', placeholder: 'Nom, téléphone ou réf.' });
    var list = h('div'), addBox = h('div');
    m.appendChild(h('div', { class: 'crm-bar' }, filt, h('span', { class: 'mut sm', text: 'du' }), from, h('span', { class: 'mut sm', text: 'au' }), to, q,
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '↻ Actualiser', onclick: load }),
      h('button', { class: 'btn btn-solid btn-sm', type: 'button', text: '+ Ajouter un rendez-vous', onclick: function () { addBox.hidden = !addBox.hidden; } })));
    addBox.hidden = true; m.appendChild(addBox); addForm(addBox, load);
    m.appendChild(list);
    filt.onchange = load; from.onchange = load; to.onchange = load; var qt; q.oninput = function () { clearTimeout(qt); qt = setTimeout(load, 300); };
    function kpis() {
      var now = new Date().toISOString(), t = todayStr();
      Promise.all([
        sb.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'en attente').gte('starts_at', now),
        sb.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'confirmé').gte('starts_at', now),
        sb.from('appointments').select('id', { count: 'exact', head: true }).neq('status', 'annulé').gte('starts_at', localISO(t, '00:00')).lt('starts_at', localISO(addDays(t, 1), '00:00')),
        sb.from('appointments').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
      ]).then(function (rs) {
        kp.innerHTML = '';
        [['En attente', rs[0].count], ['Confirmés à venir', rs[1].count], ['Aujourd’hui', rs[2].count], ['Reçus (7 jours)', rs[3].count]].forEach(function (k) { kp.appendChild(h('div', { class: 'kpi' }, h('b', { text: String(k[1] == null ? '–' : k[1]) }), k[0])); });
      });
    }
    function load() {
      kpis();
      var now = new Date().toISOString(), t = todayStr(), v = filt.value;
      var qq = sb.from('appointments').select('*').limit(500);
      if (v === 'upcoming') qq = qq.in('status', ['en attente', 'confirmé']).gte('starts_at', now).order('starts_at');
      else if (v === 'today') qq = qq.gte('starts_at', localISO(t, '00:00')).lt('starts_at', localISO(addDays(t, 1), '00:00')).order('starts_at');
      else if (v === 'past') qq = qq.lt('starts_at', now).order('starts_at', { ascending: false });
      else if (v) qq = qq.eq('status', v).order('starts_at', { ascending: v !== 'terminé' && v !== 'annulé' });
      else qq = qq.order('starts_at', { ascending: false });
      if (from.value) qq = qq.gte('starts_at', localISO(from.value, '00:00'));
      if (to.value) qq = qq.lt('starts_at', localISO(addDays(to.value, 1), '00:00'));
      var s = q.value.trim().replace(/[,()*%]/g, ' ').trim();
      if (s) qq = qq.or('name.ilike.*' + s + '*,phone.ilike.*' + s + '*,ref.ilike.*' + s + '*');
      qq.then(function (r) {
        if (r.error) return toast(r.error.message, true);
        list.innerHTML = '';
        if (!r.data.length) list.appendChild(h('p', { class: 'mut', text: 'Aucun rendez-vous pour ce filtre.' }));
        r.data.forEach(function (a) { list.appendChild(apptCard(a, kpis)); });
      });
    }
    window.DL_RELOAD = load;
    load();
  }
  function addForm(box, after) {
    var o = { day: todayStr(), time: '09:00', status: 'confirmé', format: 'cabinet', name: '', phone: '', email: '', message: '' };
    loadContent().then(function (d) {
      var sv = {}; ((d.services || {}).items || []).forEach(function (s) { sv[s.id] = s.title; }); o.service = Object.keys(sv)[0];
      box.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Ajouter un rendez-vous (pris par téléphone, WhatsApp…)' }),
        h('div', { class: 'grid3' }, field('Date', o, 'day', {  type: 'date' , free: 1 }), field('Heure', o, 'time', {  type: 'time' , free: 1 }), select('Statut', o, 'status', { 'confirmé': 'confirmé', 'en attente': 'en attente' }, 1)),
        h('div', { class: 'grid2' }, select('Accompagnement', o, 'service', sv, 1), select('Format', o, 'format', FMT, 1)),
        h('div', { class: 'grid3' }, field('Nom', o, 'name', { free: 1 }), field('Téléphone', o, 'phone', {  inputmode: 'tel' , free: 1 }), field('E-mail (facultatif)', o, 'email', { free: 1 })),
        field('Message / motif (facultatif)', o, 'message', {  type: 'textarea' , free: 1 }),
        h('button', { class: 'btn btn-solid', type: 'button', text: 'Enregistrer le rendez-vous', onclick: function () {
          DIRTY = false;
          if (!o.day || !/^\d\d:\d\d$/.test(o.time)) return toast('Date ou heure invalide.', true);
          sb.from('appointments').insert({ starts_at: localISO(o.day, o.time), status: o.status, service_id: o.service, service_name: sv[o.service], format: o.format, name: o.name, phone: o.phone, email: o.email || null, message: o.message || null, source: 'admin' }).select('ref').single().then(function (r) {
            if (r.error) return toast(/dl_appt|duplicate|conflict|exclusion/i.test(r.error.message) ? 'Ce créneau chevauche un rendez-vous existant.' : /check/i.test(r.error.message) ? 'Vérifiez le nom (2 caractères min.) et le téléphone.' : r.error.message, true);
            toast('Rendez-vous ' + r.data.ref + ' ajouté'); box.hidden = true; box.innerHTML = ''; addForm(box, after); after();
          });
        } })));
    });
  }

  /* ---------- calendrier ---------- */
  function viewCalendar(m) {
    var ym = todayStr().slice(0, 7), selDay = null, showCancel = false;
    m.appendChild(h('h2', { text: '🗓️ Calendrier' }));
    var label = h('b', { style: 'font:500 1.4rem Georgia,serif;min-width:12rem;text-align:center;text-transform:capitalize' });
    var cb = h('input', { type: 'checkbox' }); cb.onchange = function () { showCancel = cb.checked; load(); };
    m.appendChild(h('div', { class: 'crm-bar' }, h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '‹', 'aria-label': 'Mois précédent', onclick: function () { ym = addMonth(ym, -1); load(); } }), label,
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '›', 'aria-label': 'Mois suivant', onclick: function () { ym = addMonth(ym, 1); load(); } }),
      h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Aujourd’hui', onclick: function () { ym = todayStr().slice(0, 7); load(); } }),
      h('label', { class: 'switch sm' }, cb, 'Afficher les annulés')));
    var grid = h('div', { class: 'acal' }), day = h('div');
    m.appendChild(grid); m.appendChild(h('p', { class: 'mut sm', text: 'Hachuré = date bloquée · grisé = jour fermé · cliquez sur un jour pour voir le détail.' })); m.appendChild(day);
    function load() {
      label.textContent = d0(ym + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      var q = sb.from('appointments').select('*').gte('starts_at', localISO(ym + '-01', '00:00')).lt('starts_at', localISO(addDays(lastDay(ym), 1), '00:00')).order('starts_at');
      if (!showCancel) q = q.neq('status', 'annulé');
      Promise.all([q, sb.from('blocked_dates').select('day,note').gte('day', ym + '-01').lte('day', lastDay(ym)), sb.from('settings').select('week').eq('id', 1).maybeSingle()]).then(function (rs) {
        if (rs[0].error) return toast(rs[0].error.message, true);
        var by = {}, blk = {}, week = (rs[2].data && rs[2].data.week) || {};
        rs[0].data.forEach(function (a) { var k = localDay(a.starts_at); (by[k] = by[k] || []).push(a); });
        (rs[1].data || []).forEach(function (b) { blk[b.day] = b.note || 'bloqué'; });
        grid.innerHTML = '';
        ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].forEach(function (x) { grid.appendChild(h('div', { class: 'dow', text: x })); });
        var off = (d0(ym + '-01').getUTCDay() + 6) % 7; for (var i = 0; i < off; i++) grid.appendChild(h('div'));
        var n = +lastDay(ym).slice(8);
        for (var dd = 1; dd <= n; dd++) (function (ds) {
          var iso = ((d0(ds).getUTCDay() + 6) % 7) + 1, closed = !(week[iso] || []).length, list = by[ds] || [];
          var cell = h('button', { type: 'button', class: 'd' + (blk[ds] ? ' blk' : '') + (closed ? ' closed' : '') + (ds === todayStr() ? ' today' : '') + (ds === selDay ? ' sel' : ''), title: blk[ds] ? 'Date bloquée : ' + blk[ds] : '' },
            h('span', { class: 'n', text: String(+ds.slice(8)) + (list.length ? ' · ' + list.length : '') }),
            list.slice(0, 4).map(function (a) { return h('span', { class: 'ev st-' + slug(a.status), text: hm(a.starts_at) + ' ' + a.name }); }),
            list.length > 4 ? h('span', { class: 'sm mut', text: '+' + (list.length - 4) }) : null);
          cell.onclick = function () { selDay = ds; showDay(ds, list, blk[ds]); grid.querySelectorAll('.d').forEach(function (x) { x.classList.remove('sel'); }); cell.classList.add('sel'); };
          grid.appendChild(cell);
        })(ym + '-' + (dd < 10 ? '0' : '') + dd);
        if (selDay && selDay.slice(0, 7) === ym) showDay(selDay, by[selDay] || [], blk[selDay]); else day.innerHTML = '';
      });
    }
    function showDay(ds, list, blocked) {
      day.innerHTML = '';
      day.appendChild(h('h3', { text: d0(ds).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + (blocked ? ' — date bloquée (' + blocked + ')' : '') }));
      if (!list.length) day.appendChild(h('p', { class: 'mut', text: 'Aucun rendez-vous ce jour.' }));
      list.forEach(function (a) { day.appendChild(apptCard(a, load)); });
    }
    window.DL_RELOAD = load;
    load();
  }

  /* ---------- disponibilités ---------- */
  function viewAvail(m) {
    m.appendChild(h('h2', { text: '🕘 Disponibilités' }));
    m.appendChild(h('p', { class: 'mut', text: 'Les créneaux proposés sur le site sont calculés à partir de ces plages (heure d’Algérie). Les créneaux déjà réservés et les dates bloquées sont masqués automatiquement.' }));
    sb.from('settings').select('*').eq('id', 1).maybeSingle().then(function (r) {
      if (r.error) return toast(r.error.message, true);
      var S = r.data || { booking_open: true, slot_minutes: 60, min_notice_hours: 2, max_days_ahead: 60, week: {} };
      var W = JSON.parse(JSON.stringify(S.week || {}));
      var card = h('section', { class: 'card' }, h('h3', { text: 'Réglages' }));
      var openCb = h('input', { type: 'checkbox' }); openCb.checked = S.booking_open !== false; openCb.onchange = function () { S.booking_open = openCb.checked; DIRTY = true; };
      var dur = h('select', null, [30, 45, 60, 75, 90, 120].map(function (x) { return h('option', { value: x, text: x + ' minutes' }); })); dur.value = S.slot_minutes; dur.onchange = function () { S.slot_minutes = +dur.value; DIRTY = true; };
      var notice = h('input', { type: 'number', min: 0, max: 168, value: S.min_notice_hours }); notice.oninput = function () { S.min_notice_hours = +notice.value; DIRTY = true; };
      var ahead = h('input', { type: 'number', min: 1, max: 365, value: S.max_days_ahead }); ahead.oninput = function () { S.max_days_ahead = +ahead.value; DIRTY = true; };
      card.appendChild(h('label', { class: 'switch' }, openCb, 'Réservation en ligne ouverte (décochez pour la fermer : le site invite alors à appeler)'));
      card.appendChild(h('div', { class: 'grid3' }, h('label', { class: 'f' }, h('span', { text: 'Durée d’une séance' }), dur), h('label', { class: 'f' }, h('span', { text: 'Délai minimum avant un RDV (heures)' }), notice), h('label', { class: 'f' }, h('span', { text: 'Réservable jusqu’à (jours à l’avance)' }), ahead)));
      m.appendChild(card);
      var wk = h('section', { class: 'card' }, h('h3', { text: 'Semaine type' }));
      var rows = h('div'); wk.appendChild(rows);
      function draw() {
        rows.innerHTML = '';
        [6, 7, 1, 2, 3, 4, 5].forEach(function (k) {
          var list = W[k] = W[k] || [];
          var col = h('div');
          if (!list.length) col.appendChild(h('span', { class: 'mut', text: 'Fermé ' }));
          list.forEach(function (rg, i) {
            var a = h('input', { type: 'time', value: rg[0], step: 900, 'aria-label': DAYS[k] + ' début' }), b = h('input', { type: 'time', value: rg[1], step: 900, 'aria-label': DAYS[k] + ' fin' });
            a.onchange = function () { rg[0] = a.value; DIRTY = true; }; b.onchange = function () { rg[1] = b.value; DIRTY = true; };
            col.appendChild(h('div', { class: 'rg' }, a, '→', b, h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: '✕', 'aria-label': 'Supprimer la plage', onclick: function () { list.splice(i, 1); DIRTY = true; draw(); } })));
          });
          col.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ plage', onclick: function () { list.push(list.length ? ['14:00', '18:00'] : ['09:00', '12:00']); DIRTY = true; draw(); } }));
          rows.appendChild(h('div', { class: 'wk' }, h('b', { text: DAYS[k] }), col));
        });
      }
      draw(); m.appendChild(wk);
      m.appendChild(h('div', { class: 'savebar' }, h('button', { class: 'btn btn-line', type: 'button', text: 'Annuler', onclick: function () { DIRTY = false; go('dispo'); } }),
        h('button', { class: 'btn btn-solid', type: 'button', text: 'Enregistrer les disponibilités', onclick: function () {
          var bad = null; Object.keys(W).forEach(function (k) { W[k].forEach(function (rg) { if (!rg[0] || !rg[1] || rg[0] >= rg[1]) bad = DAYS[k]; }); });
          if (bad) return toast('Plage invalide le ' + bad + ' : l’heure de début doit précéder l’heure de fin.', true);
          sb.from('settings').upsert({ id: 1, booking_open: S.booking_open, slot_minutes: S.slot_minutes, min_notice_hours: S.min_notice_hours, max_days_ahead: S.max_days_ahead, week: W }).select('id').single().then(function (r2) {
            if (r2.error) return toast('Échec : ' + r2.error.message, true); DIRTY = false; toast('Disponibilités enregistrées — le site est à jour.');
          });
        } })));
      blocked(m);
    });
  }
  function blocked(m) {
    var card = h('section', { class: 'card' }, h('h3', { text: 'Dates bloquées (congés, absences…)' }));
    var o = { from: todayStr(), to: '', note: '' }, list = h('div');
    card.appendChild(h('div', { class: 'grid3' }, field('Du', o, 'from', {  type: 'date' , free: 1 }), field('Au (facultatif)', o, 'to', {  type: 'date' , free: 1 }), field('Motif (privé)', o, 'note', {  ph: 'ex. congés' , free: 1 })));
    card.appendChild(h('button', { class: 'btn btn-solid btn-sm', type: 'button', text: 'Bloquer ces dates', onclick: function () {
      DIRTY = false;
      if (!o.from) return toast('Choisissez une date.', true);
      var end = o.to && o.to > o.from ? o.to : o.from, rows = [], d = o.from;
      while (d <= end && rows.length < 120) { rows.push({ day: d, note: o.note || null }); d = addDays(d, 1); }
      sb.from('blocked_dates').upsert(rows).then(function (r) {
        if (r.error) return toast(r.error.message, true); toast(rows.length + ' date(s) bloquée(s)'); load();
        sb.from('appointments').select('ref,starts_at,name').neq('status', 'annulé').gte('starts_at', localISO(o.from, '00:00')).lt('starts_at', localISO(addDays(end, 1), '00:00')).then(function (r2) {
          if (r2.data && r2.data.length) toast('Attention : ' + r2.data.length + ' rendez-vous existent déjà sur ces dates (' + r2.data.map(function (a) { return a.name + ' ' + dt(a.starts_at); }).join(', ') + ').', true);
        });
      });
    } }));
    card.appendChild(list); m.appendChild(card);
    function load() {
      sb.from('blocked_dates').select('*').gte('day', addDays(todayStr(), -1)).order('day').then(function (r) {
        list.innerHTML = '';
        if (r.error) return toast(r.error.message, true);
        if (!r.data.length) return list.appendChild(h('p', { class: 'mut', text: 'Aucune date bloquée à venir.' }));
        list.appendChild(h('table', null, r.data.map(function (b) {
          return h('tr', null, h('td', { text: d0(b.day).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }), h('td', { class: 'mut', text: b.note || '' }),
            h('td', { style: 'text-align:right' }, h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Débloquer', onclick: function () { sb.from('blocked_dates').delete().eq('day', b.day).then(function (r2) { if (r2.error) return toast(r2.error.message, true); load(); }); } })));
        })));
      });
    }
    load();
  }

  /* ---------- contenu ---------- */
  function loadContent() { return sb.from('site_content').select('data').eq('id', 1).single().then(function (r) { if (r.error) throw r.error; CONTENT = r.data.data; return CONTENT; }); }
  function save(after) {
    var err = null, ids = {};
    ((CONTENT.services || {}).items || []).forEach(function (s) {
      s.title = String(s.title || '').trim(); if (!s.title) err = 'Un accompagnement n’a pas de titre.';
      if (!s.id) s.id = s.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || ('service-' + Date.now());
      if (ids[s.id]) s.id += '-' + Math.random().toString(36).slice(2, 5); ids[s.id] = 1;
      if (!s.formats || !s.formats.length) err = 'L’accompagnement « ' + s.title + ' » doit proposer au moins un format.';
    });
    if (err) return toast(err, true);
    sb.from('site_content').update({ data: CONTENT }).eq('id', 1).select('data').single().then(function (r) {
      if (r.error) return toast('Échec : ' + r.error.message, true);
      CONTENT = r.data.data; DIRTY = false; toast('Enregistré — le site est à jour.'); if (typeof after === 'function') after();
    });
  }
  function saveBar() { return h('div', { class: 'savebar' }, h('button', { class: 'btn btn-line', type: 'button', text: 'Annuler', onclick: function () { DIRTY = false; go(TAB); } }), h('button', { class: 'btn btn-solid', type: 'button', id: 'save', text: 'Enregistrer', onclick: function () { save(); } })); }
  function withContent(m, title, intro, fn) { m.appendChild(h('h2', { text: title })); if (intro) m.appendChild(h('p', { class: 'mut', text: intro })); loadContent().then(function (d) { fn(d); m.appendChild(saveBar()); }).catch(function (e) { toast(e.message, true); }); }
  var STAR = '*texte* = mot mis en valeur (italique)';

  function viewContent(m) {
    withContent(m, '✏️ Textes du site', 'Modifiez les textes puis cliquez sur « Enregistrer » : le site se met à jour immédiatement.', function (d) {
      var B = d.brand = d.brand || {}, HE = d.hero = d.hero || {}, AP = d.approach = d.approach || { blocks: [] }, ST = d.steps = d.steps || { items: [] }, FO = d.formats = d.formats || { items: [] }, AB = d.about = d.about || {}, BK = d.booking = d.booking || {}, CT = d.contact = d.contact || {}, SE = d.seo = d.seo || {};
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Coordonnées' }),
        h('div', { class: 'grid2' }, field('Nom de la marque', B, 'name'), field('Titre affiché', B, 'role', { hint: 'ex. Coach & praticien en PNL (évitez « médecin » / « docteur »)' })),
        h('div', { class: 'grid3' }, field('Téléphone affiché', B, 'phone'), field('Téléphone international', B, 'phone_intl', { hint: 'ex. +213552998411' }), field('WhatsApp (chiffres seulement)', B, 'whatsapp', { hint: 'ex. 213552998411' })),
        h('div', { class: 'grid2' }, field('Lieu', B, 'place'), field('E-mail (facultatif)', B, 'email')),
        field('Précision sur l’adresse', B, 'address_note', { type: 'textarea' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Haut de page' }), field('Petit titre', HE, 'kicker'), field('Titre', HE, 'title', { hint: STAR }), field('Texte', HE, 'text', { type: 'textarea', rows: 3 }),
        h('div', { class: 'grid2' }, field('Bouton principal', HE, 'cta'), field('Bouton secondaire', HE, 'cta2'))));
      var apb = h('div');
      function drawAp() { apb.innerHTML = ''; AP.blocks.forEach(function (b, i) { apb.appendChild(h('div', { class: 'item' }, field('Titre', b, 'title'), field('Texte', b, 'text', { type: 'textarea', rows: 3 }), h('div', { class: 'row' }, mover(AP.blocks, i, drawAp)))); }); apb.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter un bloc', onclick: function () { AP.blocks.push({ title: '', text: '' }); DIRTY = true; drawAp(); } })); }
      AP.blocks = AP.blocks || []; drawAp();
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'L’approche' }), field('Petit titre', AP, 'kicker'), field('Titre', AP, 'title', { hint: STAR }), field('Introduction', AP, 'intro', { type: 'textarea' }), apb));
      var stb = h('div');
      function drawSt() { stb.innerHTML = ''; ST.items.forEach(function (b, i) { stb.appendChild(h('div', { class: 'item' }, field('Étape ' + (i + 1), b, 'title'), field('Texte', b, 'text', { type: 'textarea' }), h('div', { class: 'row' }, mover(ST.items, i, drawSt)))); }); stb.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter une étape', onclick: function () { ST.items.push({ title: '', text: '' }); DIRTY = true; drawSt(); } })); }
      ST.items = ST.items || []; drawSt();
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Déroulement d’une séance' }), field('Petit titre', ST, 'kicker'), field('Titre', ST, 'title'), stb));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Formats' }), field('Petit titre', FO, 'kicker'), field('Titre', FO, 'title'),
        (FO.items || []).map(function (f) { return h('div', { class: 'item' }, h('b', { text: FMT[f.key] || f.key }), field('Titre', f, 'title'), field('Texte', f, 'text', { type: 'textarea' }), field('Format proposé (décochez pour le retirer du site et de la réservation)', f, 'active', { type: 'checkbox' })); })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'À propos' }), field('Petit titre', AB, 'kicker'), field('Titre', AB, 'title'), h('div', { class: 'grid2' }, field('Nom', AB, 'name'), field('Titre / rôle', AB, 'role')),
        field('Présentation', AB, 'text', { type: 'textarea', rows: 6, hint: 'Laissez une ligne vide entre deux paragraphes.' }),
        field('Parcours & formations (facultatif — masqué si vide)', AB, 'credentials', { type: 'textarea', rows: 4, hint: 'N’indiquez que des formations réellement suivies.' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Réservation & contact' }), field('Titre de la réservation', BK, 'title'), field('Introduction', BK, 'intro', { type: 'textarea' }),
        field('Message après réservation', BK, 'confirm_text', { type: 'textarea' }), field('Message si la réservation est fermée', BK, 'closed_text', { type: 'textarea' }),
        field('Titre contact', CT, 'title'), field('Texte contact', CT, 'text', { type: 'textarea' })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Avertissement (pied de page et réservation)' }), field('Texte', d, 'disclaimer', { type: 'textarea', rows: 3 })));
      m.appendChild(h('section', { class: 'card' }, h('h3', { text: 'Référencement (Google)' }), field('Titre de la page', SE, 'title'), field('Description', SE, 'description', { type: 'textarea' })));
    });
  }
  function viewServices(m) {
    withContent(m, '🧩 Accompagnements & tarifs', 'Chaque carte apparaît sur le site et dans la réservation. Le tarif est un texte libre (ex. « Tarif sur demande » ou « 3000 DA »).', function (d) {
      var S = d.services = d.services || { items: [] }; S.items = S.items || [];
      m.appendChild(h('section', { class: 'card' }, field('Petit titre', S, 'kicker'), field('Titre de la section', S, 'title'), field('Introduction', S, 'intro', { type: 'textarea' })));
      var list = h('div'); m.appendChild(list);
      function draw() {
        list.innerHTML = '';
        S.items.forEach(function (s, i) {
          s.formats = s.formats || ['cabinet', 'visio', 'telephone'];
          var fm = h('div', { class: 'row' }, Object.keys(FMT).map(function (k) { var c = h('input', { type: 'checkbox' }); c.checked = s.formats.indexOf(k) >= 0; c.onchange = function () { s.formats = Object.keys(FMT).filter(function (x) { return x === k ? c.checked : s.formats.indexOf(x) >= 0; }); DIRTY = true; }; return h('label', { class: 'switch' }, c, FMT[k]); }));
          list.appendChild(h('section', { class: 'card' }, h('h3', { text: s.title || 'Nouvel accompagnement' }),
            h('div', { class: 'grid2' }, field('Titre', s, 'title'), select('Icône', s, 'icon', ICONS)),
            field('Description', s, 'text', { type: 'textarea', rows: 3 }),
            h('div', { class: 'grid2' }, field('Tarif affiché', s, 'price', { ph: 'Tarif sur demande' }), field('Durée affichée', s, 'duration', { ph: '60 min' })),
            h('div', { class: 'f' }, h('span', { text: 'Formats proposés' }), fm),
            field('Visible sur le site et réservable', s, 'active', { type: 'checkbox' }),
            h('div', { class: 'row', style: 'margin-top:.5rem' }, mover(S.items, i, draw))));
        });
        list.appendChild(h('button', { class: 'btn btn-line', type: 'button', text: '+ Ajouter un accompagnement', onclick: function () { S.items.push({ id: '', icon: 'spark', title: '', text: '', price: 'Tarif sur demande', duration: '60 min', formats: ['cabinet', 'visio', 'telephone'], active: true }); DIRTY = true; draw(); } }));
      }
      draw();
    });
  }
  function viewFaq(m) {
    withContent(m, '❓ Questions fréquentes', null, function (d) {
      var F = d.faq = d.faq || { items: [] }; F.items = F.items || [];
      m.appendChild(h('section', { class: 'card' }, field('Petit titre', F, 'kicker'), field('Titre', F, 'title')));
      var list = h('div'); m.appendChild(list);
      function draw() { list.innerHTML = ''; F.items.forEach(function (x, i) { list.appendChild(h('div', { class: 'item' }, field('Question', x, 'q'), field('Réponse', x, 'a', { type: 'textarea', rows: 3 }), h('div', { class: 'row' }, mover(F.items, i, draw)))); }); list.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter une question', onclick: function () { F.items.push({ q: '', a: '' }); DIRTY = true; draw(); } })); }
      draw();
    });
  }
  function viewTestimonials(m) {
    withContent(m, '💬 Témoignages', 'La section reste masquée sur le site tant qu’aucun témoignage n’est rempli. N’ajoutez que des témoignages réels, avec l’accord écrit de la personne (prénom ou initiales suffisent).', function (d) {
      var T = d.testimonials = d.testimonials || { items: [] }; T.items = T.items || [];
      m.appendChild(h('section', { class: 'card' }, field('Petit titre', T, 'kicker'), field('Titre', T, 'title')));
      var list = h('div'); m.appendChild(list);
      function draw() { list.innerHTML = ''; T.items.forEach(function (x, i) { list.appendChild(h('div', { class: 'item' }, field('Témoignage (mot pour mot)', x, 'text', { type: 'textarea', rows: 3 }), h('div', { class: 'grid2' }, field('Auteur (prénom ou initiales)', x, 'author'), field('Contexte (facultatif)', x, 'context', { ph: 'ex. accompagnement stress, 2026' })), h('div', { class: 'row' }, mover(T.items, i, draw)))); }); list.appendChild(h('button', { class: 'btn btn-line btn-sm', type: 'button', text: '+ Ajouter un témoignage réel', onclick: function () { T.items.push({ text: '', author: '', context: '' }); DIRTY = true; draw(); } })); }
      draw();
    });
  }
  function viewPhotos(m) {
    withContent(m, '🖼️ Photos', 'JPG, PNG ou WebP, 6 Mo max. La nouvelle photo remplace l’originale sur le site après « Enregistrer ». Utilisez vos propres photos ou des photos libres de droits.', function (d) {
      d.photos = d.photos || {};
      var ph = h('section', { class: 'card' });
      Object.keys(d.photos).forEach(function (k) {
        var p = d.photos[k], orig = '../assets/img/' + k + '-800.webp', img = h('img', { class: 'thumb', alt: '', src: p.src || orig });
        var f = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }); f.style.width = 'auto';
        f.onchange = function () {
          var file = f.files[0]; if (!file) return; if (file.size > 6291456) return toast('Image trop lourde (6 Mo max).', true);
          var ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]; if (!ext) return toast('Format non accepté.', true);
          var name = 'up-drlife_' + k.replace(/[^a-z0-9]/g, '') + '-' + Math.random().toString(36).slice(2, 8).replace(/[^a-z0-9]/g, 'x') + '-' + Date.now() + '.' + ext;
          sb.storage.from(BUCKET).upload(name, file, { contentType: file.type, cacheControl: '31536000', upsert: false }).then(function (r) {
            if (r.error) return toast(r.error.message, true);
            p.src = sb.storage.from(BUCKET).getPublicUrl(name).data.publicUrl; img.src = p.src; DIRTY = true; toast('Photo envoyée — cliquez sur Enregistrer.');
          });
        };
        ph.appendChild(h('div', { class: 'item row' }, img, h('div', { style: 'flex:1;min-width:220px' }, h('b', { text: p.label || k }), h('div', null, f), field('Texte alternatif (décrit la photo)', p, 'alt'),
          p.src ? h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Revenir à la photo d’origine', onclick: function () { p.src = ''; DIRTY = true; img.src = orig; } }) : null)));
      });
      m.appendChild(ph);
    });
  }
  function viewHistory(m) {
    m.appendChild(h('h2', { text: '↺ Historique' })); m.appendChild(h('p', { class: 'mut', text: 'Les 50 dernières versions des textes, accompagnements, FAQ, témoignages et photos. Restaurer remplace le contenu actuel, qui est lui-même archivé.' }));
    sb.from('site_content_history').select('id,saved_at').order('id', { ascending: false }).limit(50).then(function (r) {
      if (r.error) return toast(r.error.message, true);
      if (!r.data.length) m.appendChild(h('p', { class: 'mut', text: 'Aucune version précédente.' }));
      r.data.forEach(function (v) {
        m.appendChild(h('div', { class: 'card row', style: 'justify-content:space-between' }, h('span', { text: 'Version du ' + dt(v.saved_at) }),
          h('button', { class: 'btn btn-line btn-sm', type: 'button', text: 'Restaurer', onclick: function () {
            if (!confirm('Restaurer cette version ?')) return;
            sb.from('site_content_history').select('data').eq('id', v.id).single().then(function (r1) {
              if (r1.error) return toast(r1.error.message, true);
              sb.from('site_content').update({ data: r1.data.data }).eq('id', 1).select('id').single().then(function (r2) { if (r2.error) return toast(r2.error.message, true); toast('Version restaurée.'); go('historique'); });
            });
          } })));
      });
    });
  }

  /* ---------- démarrage ---------- */
  if (!sb) { $('#boot').textContent = 'Configuration Supabase manquante (config.js).'; return; }
  var current;
  sb.auth.onAuthStateChange(function (ev, session) {
    var uid = session && session.user && session.user.id;
    if (uid === current) return; current = uid;
    if (!session) return showLogin();
    setTimeout(function () {
      checkOwner(session).then(function (ok) {
        if (!ok) { sb.auth.signOut(); return showLogin('Ce compte n’est pas autorisé (réservé au propriétaire).'); }
        shell(session);
      });
    }, 0);
  });
  window.addEventListener('beforeunload', function (e) { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });
})();
