#!/usr/bin/env python3
"""Build Folio.

  python3 build.py          -> reader.html   single self-contained file (data-URI manifest, no service worker)
  python3 build.py --site   -> docs/         deploy folder for static hosting such as GitHub Pages:
                                             index.html, manifest.webmanifest, sw.js, icons/
  python3 build.py --all    -> both

The docs/ folder is what GitHub Pages serves (Settings -> Pages -> Deploy from a branch -> main, /docs),
and what the optional Actions workflow uploads.
"""
import base64, datetime, hashlib, io, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DOCS = os.path.join(ROOT, 'docs')

JS_ORDER = ['01_util.js', '01b_sample.js', '02_store.js', '03_text.js', '04_ingest.js', '05_catalog.js', '06_tts.js',
            '08_calibration.js', '07_reader.js', '09_analytics.js', '10_ui.js', '11_app.js']
APP_NAME = 'Folio'
APP_DESC = 'A personal reading room: import PDFs and EPUBs, listen with synchronized highlighting, keep your place across paper and screen. Everything stays on your device.'
BG, THEME, INK = '#F4F1EA', '#2F5D50', '#F4F1EA'

SW_REGISTER = '''<script>
(function(){
  if (!('serviceWorker' in navigator)) return;
  try { if (self.origin === 'null') return; } catch (e) { return; }
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  window.addEventListener('load', function(){
    navigator.serviceWorker.register('sw.js').then(function(reg){
      function offerReload(){
        var toast = window.F && F.ui && F.ui.toast;
        if (!toast) return;
        toast('A new version of Folio is ready.', { timeout: 0, action: 'Reload', onAction: function(){
          if (reg.waiting) {
            navigator.serviceWorker.addEventListener('controllerchange', function(){ location.reload(); }, { once: true });
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            setTimeout(function(){ location.reload(); }, 1500);
          } else location.reload();
        } });
      }
      if (reg.waiting && navigator.serviceWorker.controller) offerReload();
      reg.addEventListener('updatefound', function(){
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function(){ if (nw.state === 'installed' && navigator.serviceWorker.controller) offerReload(); });
      });
    }).catch(function(e){ console.warn('[folio] service worker registration failed', e); });
  });
})();
</script>'''


def font(size):
    from PIL import ImageFont
    for c in ['/usr/share/fonts/dejavu-serif-fonts/DejaVuSerif-Bold.ttf', '/usr/share/fonts/liberation-serif/LiberationSerif-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf']:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default(size=size)


def icon_png(size, maskable=False):
    """Rounded green square with a serif F. Maskable icons fill the whole canvas and keep the glyph inside the safe zone."""
    from PIL import Image, ImageDraw
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, size - 1, size - 1], fill=(47, 93, 80, 255))
        glyph = int(size * 0.5)
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.22), fill=(47, 93, 80, 255))
        glyph = int(size * 0.66)
    f = font(glyph)
    bbox = d.textbbox((0, 0), 'F', font=f)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((size - w) / 2 - bbox[0], (size - h) / 2 - bbox[1] - size * 0.02), 'F', fill=(244, 241, 234, 255), font=f)
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def icon_svg():
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
            '<rect width="512" height="512" rx="112" fill="#2F5D50"/>'
            '<text x="256" y="362" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-weight="700" font-size="330" fill="#F4F1EA">F</text>'
            '</svg>\n')


def b64(data):
    return base64.b64encode(data).decode('ascii')


def read(name):
    return open(os.path.join(SRC, name), encoding='utf-8').read()


def build_id():
    h = hashlib.sha1()
    for name in ['00_head.html', '99_tail.html', 'sw.template.js'] + JS_ORDER:
        h.update(read(name).encode('utf-8'))
    return h.hexdigest()[:8]


def assemble(mode, icons, bid):
    head = read('00_head.html')
    if mode == 'site':
        pwa = ('<link rel="apple-touch-icon" href="data:image/png;base64,%s">\n'
               '<link rel="icon" href="icons/icon.svg" type="image/svg+xml">\n'
               '<link rel="manifest" href="manifest.webmanifest">') % icons['180']
    else:
        manifest = {
            'name': APP_NAME, 'short_name': APP_NAME, 'display': 'standalone', 'start_url': '.',
            'background_color': BG, 'theme_color': THEME,
            'icons': [{'src': 'data:image/png;base64,' + icons['180'], 'sizes': '180x180', 'type': 'image/png'}],
        }
        pwa = ('<link rel="apple-touch-icon" href="data:image/png;base64,%s">\n'
               '<link rel="icon" href="data:image/png;base64,%s">\n'
               "<link rel=\"manifest\" href='data:application/manifest+json,%s'>") % (
            icons['180'], icons['192'], json.dumps(manifest, separators=(',', ':')).replace('#', '%23'))
    head = head.replace('{{PWA_HEAD}}', pwa)
    parts = [head]
    for name in JS_ORDER:
        js = read(name).replace('{{BUILD_ID}}', bid).replace('{{SITE_MODE}}', mode)
        if '</script' in js:
            js = js.replace('</script', '<\\/script')
        parts.append('<script>\n/* ==== %s ==== */\n%s\n</script>\n' % (name, js))
    tail = read('99_tail.html').replace('{{SW_REGISTER}}', SW_REGISTER if mode == 'site' else '')
    parts.append(tail)
    return ''.join(parts)


def write(path, data, binary=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb' if binary else 'w', **({} if binary else {'encoding': 'utf-8'})) as f:
        f.write(data)


def main():
    args = sys.argv[1:]
    site = '--site' in args or '--all' in args
    single = '--all' in args or not site
    bid = build_id()
    icons = {'180': b64(icon_png(180)), '192': b64(icon_png(192)), '512': b64(icon_png(512)), '512m': b64(icon_png(512, maskable=True))}
    if single:
        html = assemble('single', icons, bid)
        write(os.path.join(ROOT, 'reader.html'), html)
        print('wrote reader.html', len(html.encode('utf-8')), 'bytes, build', bid)
    if site:
        html = assemble('site', icons, bid)
        write(os.path.join(DOCS, 'index.html'), html)
        manifest = {
            'name': APP_NAME, 'short_name': APP_NAME, 'description': APP_DESC, 'id': './', 'start_url': './', 'scope': './',
            'display': 'standalone', 'orientation': 'any', 'background_color': BG, 'theme_color': THEME,
            'categories': ['books', 'productivity', 'education'],
            'icons': [
                {'src': 'data:image/png;base64,' + icons['192'], 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
                {'src': 'data:image/png;base64,' + icons['512'], 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
                {'src': 'data:image/png;base64,' + icons['512m'], 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
                {'src': 'icons/icon.svg', 'sizes': 'any', 'type': 'image/svg+xml', 'purpose': 'any'},
            ],
        }
        write(os.path.join(DOCS, 'manifest.webmanifest'), json.dumps(manifest, indent=2) + '\n')
        write(os.path.join(DOCS, 'sw.js'), read('sw.template.js').replace('{{BUILD_ID}}', bid).replace('{{BUILD_DATE}}', datetime.date.today().isoformat()))
        write(os.path.join(DOCS, 'icons', 'icon.svg'), icon_svg())
        write(os.path.join(DOCS, '.nojekyll'), '\n')
        for name, size, mask in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-512-maskable.png', 512, True), ('apple-touch-icon.png', 180, False)]:
            write(os.path.join(DOCS, 'icons', name), icon_png(size, mask), binary=True)
        print('wrote docs/ (index.html %d bytes, manifest, sw.js, icons), build %s' % (len(html.encode('utf-8')), bid))


if __name__ == '__main__':
    main()
