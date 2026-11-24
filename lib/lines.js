// Descripciones: HTML de GHL ↔ texto simple con "# Título" y "• punto" (lo que escriben el admin y los vendedores).
const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’' };
// Texto simple con dos marcas, para que el vendedor arme descripciones como las de GHL:
//   "# Título"  → párrafo en negrita        "• punto" o "- punto" → lista con viñetas
export function htmlToText(html) {
  return String(html || '')
    // títulos (h1–h6) y párrafos enteramente en negrita → "# "
    .replace(/<\s*(h[1-6])[^>]*>([\s\S]*?)<\/\s*\1\s*>/gi, (_, __, inner) => `\n# ${inner}\n`)
    .replace(/<\s*p[^>]*>\s*<\s*(strong|b)\s*>((?:(?!<\/?\s*(?:strong|b)\b)[\s\S])*?)<\/\s*\1\s*>\s*<\/\s*p\s*>/gi, (_, __, inner) => `\n# ${inner}\n`)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|h[1-6]|li|ul|ol)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENT[m] ?? m)
    .split('\n')
    .map((s) => s.replace(/[ \t]+/g, ' ').trim())
    .map((s) => s.replace(/^• # /, '• ').replace(/^# • /, '• '))
    .filter((s) => s && s !== '#' && s !== '•')
    .join('\n')
    .trim();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function textToHtml(text) {
  const out = [];
  let list = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li><p>${esc(x)}</p></li>`).join('')}</ul>`); list = []; } };
  for (const raw of String(text || '').split('\n')) {
    const s = raw.trim();
    if (!s) { flush(); continue; }
    const bullet = s.match(/^[•\-*]\s+(.*)$/);
    if (bullet) { list.push(bullet[1]); continue; }
    flush();
    const head = s.match(/^#+\s*(.*)$/);
    out.push(head ? `<p><strong>${esc(head[1])}</strong></p>` : `<p>${esc(s)}</p>`);
  }
  flush();
  return out.join('');
}

