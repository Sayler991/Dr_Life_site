// Pré-rendu statique : remplit index.html à partir de content.json (SEO + affichage sans JavaScript).
// Usage : node tools/build.js   (idempotent ; live.js remplace ensuite par le contenu Supabase)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'assets/js/render.js'));
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8'));
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/(<(\w+)\b[^>]*?\bdata-k="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g, (m, open, tag, key, inner, close) => {
  const v = R.get(d, key); const t = tag === 'title' ? R.esc(String(v || '')) : R.rich(v == null ? '' : v);
  return open + t + close;
});
html = html.replace(/<(meta|link)\b([^>]*?)data-k-attr="(\w+):([^"]+)"([^>]*)>/g, (m, tag, a, attr, key, b) => {
  const all = (a + 'data-k-attr="' + attr + ':' + key + '"' + b).replace(new RegExp('\\b' + attr + '="[^"]*"'), attr + '="' + R.esc(R.get(d, key) || '') + '"');
  return '<' + tag + all + '>';
});
html = html.replace(/<!--r:(\w+)-->[\s\S]*?<!--\/r:\1-->/g, (m, name) => '<!--r:' + name + '-->' + R[name](d) + '<!--/r:' + name + '-->');
html = html.replace(/(<div\b([^>]*?)data-photo="([^"]+)"([^>]*)>)([\s\S]*?)(<\/div>)/g, (m, open, a, key, b, inner, close) => {
  const sizes = (/data-sizes="([^"]+)"/.exec(open) || [])[1]; const eager = /data-eager="1"/.test(open);
  return open + R.photo(d, key, sizes, '', eager) + close;
});
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('index.html prérendu :', html.length, 'octets');
