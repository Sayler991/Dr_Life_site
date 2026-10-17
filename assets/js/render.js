/* Dr Life — fonctions de rendu partagées (navigateur + tools/build.js). Pures : données → HTML. */
(function (root, factory) {
  var R = factory();
  if (typeof module === 'object' && module.exports) module.exports = R; else root.DL_RENDER = R;
})(this, function () {
  'use strict';
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rich(t) { return esc(t).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }
  function paras(t) { return String(t || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean).map(function (p) { return '<p>' + rich(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function get(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  var I = {
    wave: '<path d="M3 12c2.5-4 5-4 7.5 0s5 4 7.5 0 2.5-2 3-2"/><path d="M3 17c2.5-3 5-3 7.5 0s5 3 7.5 0"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19 14 10"/>',
    star: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    loop: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    link: '<circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/>',
    spiral: '<path d="M12 12a1.5 1.5 0 1 1 1.5 1.5A3 3 0 1 1 15 10.5 4.5 4.5 0 1 1 10.5 7 6 6 0 1 1 6 13.5"/>',
    spark: '<circle cx="12" cy="12" r="2.4"/><circle cx="4.5" cy="6" r="1.4"/><circle cx="19.5" cy="5" r="1.4"/><circle cx="19" cy="18.5" r="1.4"/><circle cx="5" cy="18" r="1.4"/><path d="M5.6 6.9 10.2 10.5M18.5 6 13.8 10.6M18 17.4l-4.3-3.8M6.1 17.1l4-3.6"/>',
    cabinet: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/>',
    visio: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
    telephone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'
  };
  function icon(k, cls) { return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (I[k] || I.spark) + '</svg>'; }
  var FMT = { cabinet: 'En cabinet', visio: 'En visio', telephone: 'Par téléphone' };
  function photo(d, key, sizes, cls, eager) {
    var p = (d.photos && d.photos[key]) || {}, alt = esc(p.alt || '');
    if (p.src) return '<img class="' + (cls || '') + '" src="' + esc(p.src) + '" alt="' + alt + '"' + (eager ? '' : ' loading="lazy"') + ' decoding="async">';
    var b = 'assets/img/' + key;
    return '<img class="' + (cls || '') + '" src="' + b + '-800.webp" srcset="' + b + '-480.webp 480w, ' + b + '-800.webp 800w, ' + b + '-1200.webp 1200w" sizes="' + (sizes || '100vw') + '" alt="' + alt + '"' + (eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
  }
  function active(list) { return (list || []).filter(function (x) { return x && x.active !== false; }); }
  var R = {
    esc: esc, rich: rich, paras: paras, get: get, icon: icon, photo: photo, FMT: FMT, active: active,
    approach: function (d) {
      return ((d.approach && d.approach.blocks) || []).map(function (b, i) {
        return '<article class="ap-block reveal"><span class="ap-n">0' + (i + 1) + '</span><h3>' + rich(b.title) + '</h3><p>' + rich(b.text) + '</p></article>';
      }).join('');
    },
    services: function (d) {
      return active(d.services && d.services.items).map(function (s) {
        var f = (s.formats && s.formats.length ? s.formats : ['cabinet', 'visio', 'telephone']);
        return '<article class="card svc reveal" data-id="' + esc(s.id) + '">' +
          '<div class="svc-ico">' + icon(s.icon) + '</div>' +
          '<h3>' + rich(s.title) + '</h3><p>' + rich(s.text) + '</p>' +
          '<div class="svc-meta"><span>' + esc(s.price || 'Tarif sur demande') + '</span>' + (s.duration ? '<span>' + esc(s.duration) + '</span>' : '') + '</div>' +
          '<div class="svc-fmt" aria-label="Formats proposés">' + f.map(function (k) { return '<span title="' + esc(FMT[k] || k) + '">' + icon(k, 'ico-s') + '<span class="sr">' + esc(FMT[k] || k) + '</span></span>'; }).join('') + '</div>' +
          '<a class="svc-go" href="#rendez-vous" data-book="' + esc(s.id) + '">Réserver<span aria-hidden="true"> →</span><span class="sr"> : ' + esc(s.title) + '</span></a>' +
          '</article>';
      }).join('');
    },
    steps: function (d) {
      return ((d.steps && d.steps.items) || []).map(function (s, i) {
        return '<li class="step reveal"><span class="step-n" aria-hidden="true">' + (i + 1) + '</span><h3>' + rich(s.title) + '</h3><p>' + rich(s.text) + '</p></li>';
      }).join('');
    },
    formats: function (d) {
      return active(d.formats && d.formats.items).map(function (f) {
        return '<article class="fmt reveal"><div class="fmt-img">' + photo(d, f.photo || f.key, '(min-width: 1000px) 30vw, (min-width: 700px) 45vw, 92vw') + '</div>' +
          '<div class="fmt-body"><h3>' + icon(f.key, 'ico-s') + ' ' + rich(f.title) + '</h3><p>' + rich(f.text) + '</p></div></article>';
      }).join('');
    },
    faq: function (d) {
      return ((d.faq && d.faq.items) || []).filter(function (x) { return x && x.q; }).map(function (x) {
        return '<details class="qa reveal"><summary><span>' + rich(x.q) + '</span><i aria-hidden="true"></i></summary><div class="qa-a">' + paras(x.a) + '</div></details>';
      }).join('');
    },
    testimonials: function (d) {
      return ((d.testimonials && d.testimonials.items) || []).filter(function (x) { return x && String(x.text || '').trim(); }).map(function (x) {
        return '<figure class="tm reveal"><blockquote>' + paras(x.text) + '</blockquote><figcaption>' + esc(x.author || '') + (x.context ? ' <span>· ' + esc(x.context) + '</span>' : '') + '</figcaption></figure>';
      }).join('');
    },
    about: function (d) {
      var a = d.about || {};
      return paras(a.text) + (String(a.credentials || '').trim() ? '<div class="creds"><h3>Parcours</h3>' + paras(a.credentials) + '</div>' : '');
    }
  };
  return R;
});
