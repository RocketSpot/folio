#!/usr/bin/env python3
"""Generate test assets for the Folio reader from the public-domain Alice text.

Outputs (in test-assets/):
  alice.epub              EPUB 3 with cover, nav, NCX, subjects
  alice-text.pdf          hand-rolled text PDF (2 chapters, running header + page numbers)
  alice-scan.pdf          image-only PDF (3 pages) for the OCR path
  page-photo-1.jpg        "photographed" physical page (chapter IV text, page 37)
  page-photo-2.jpg        second photographed page (chapter VII text, page 61)
Also writes src/01b_sample.js with the embedded sample book text.
"""
import io, json, math, os, random, re, textwrap, zipfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TA = os.path.join(ROOT, 'test-assets')
SRC = os.path.join(ROOT, 'src')
os.makedirs(TA, exist_ok=True)
os.makedirs(SRC, exist_ok=True)

raw = open(os.path.join(TA, 'pg11.txt'), encoding='utf-8').read().replace('\r\n', '\n')
m1 = re.search(r'^\*\*\* ?START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*[ \t]*$', raw, re.M | re.I)
m2 = re.search(r'^\*\*\* ?END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*[ \t]*$', raw, re.M | re.I)
body = raw[m1.end():m2.start()] if (m1 and m2) else raw
body = body.strip('\n')

# ---- chapters for EPUB/PDF generation ----
heads = list(re.finditer(r'^CHAPTER ([IVXLC]+)\.[ \t]*\n([^\n]+)\n', body, re.M))
chapters = []
for i, h in enumerate(heads):
    start = h.end()
    end = heads[i + 1].start() if i + 1 < len(heads) else len(body)
    title = 'Chapter %s. %s' % (h.group(1), h.group(2).strip())
    chunk = body[start:end]
    paras = []
    for blk in re.split(r'\n[ \t]*\n+', chunk):
        blk = blk.strip('\n')
        if not blk.strip():
            continue
        if re.match(r'^\s*\[Illustration', blk):
            continue
        lines = [l.strip() for l in blk.split('\n') if l.strip()]
        paras.append(re.sub(r'\s+', ' ', ' '.join(lines)))
    chapters.append((title, paras))
print('chapters parsed:', len(chapters), [c[0] for c in chapters][:3])

# ---- sample book JS ----
sample = {
    'title': "Alice's Adventures in Wonderland",
    'author': 'Lewis Carroll',
    'language': 'en',
    'subjects': ['Fantasy fiction', "Children's stories", 'Fantasy', 'Classic literature', 'Nonsense literature'],
    'description': 'A girl named Alice falls through a rabbit hole into a fantasy world of peculiar creatures. Public domain text, included as a sample so the app is never empty.',
    'text': body,
}
with open(os.path.join(SRC, '01b_sample.js'), 'w', encoding='utf-8') as f:
    f.write('(function(){window.F=window.F||{};window.F.SAMPLE_BOOK=')
    f.write(json.dumps(sample, ensure_ascii=False))
    f.write(';})();\n')
print('sample js written, chars:', len(body))

# ---- fonts ----
def font(size, bold=False):
    candidates = [
        '/usr/share/fonts/dejavu-serif-fonts/DejaVuSerif-Bold.ttf' if bold else '/usr/share/fonts/dejavu-serif-fonts/DejaVuSerif.ttf',
        '/usr/share/fonts/liberation-serif/LiberationSerif-Bold.ttf' if bold else '/usr/share/fonts/liberation-serif/LiberationSerif-Regular.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf',
        '/usr/share/fonts/dejavu/DejaVuSerif-Bold.ttf' if bold else '/usr/share/fonts/dejavu/DejaVuSerif.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default(size=size)

def esc_xml(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

# ---- cover image ----
def make_cover():
    img = Image.new('RGB', (600, 900), (47, 93, 80))
    d = ImageDraw.Draw(img)
    d.rectangle([30, 30, 570, 870], outline=(232, 226, 214), width=3)
    f1 = font(52, bold=True)
    f2 = font(30)
    y = 300
    for line in ["Alice's", 'Adventures', 'in Wonderland']:
        w = d.textlength(line, font=f1)
        d.text(((600 - w) / 2, y), line, fill=(244, 241, 234), font=f1)
        y += 66
    w = d.textlength('Lewis Carroll', font=f2)
    d.text(((600 - w) / 2, 560), 'Lewis Carroll', fill=(246, 212, 107), font=f2)
    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue()

# ---- EPUB ----
def make_epub(path):
    z = zipfile.ZipFile(path, 'w')
    z.writestr(zipfile.ZipInfo('mimetype'), 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
    z.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>''', compress_type=zipfile.ZIP_DEFLATED)
    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
                '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
                '<item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>']
    spine = []
    nav_items = []
    ncx_points = []
    for i, (title, paras) in enumerate(chapters):
        fn = 'chapter%02d.xhtml' % (i + 1)
        html = ['<?xml version="1.0" encoding="UTF-8"?>',
                '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>%s</title></head><body>' % esc_xml(title),
                '<h2>%s</h2>' % esc_xml(title)]
        for p in paras:
            html.append('<p>%s</p>' % esc_xml(p))
        html.append('</body></html>')
        z.writestr('OEBPS/' + fn, '\n'.join(html), compress_type=zipfile.ZIP_DEFLATED)
        manifest.append('<item id="c%d" href="%s" media-type="application/xhtml+xml"/>' % (i + 1, fn))
        spine.append('<itemref idref="c%d"/>' % (i + 1))
        nav_items.append('<li><a href="%s">%s</a></li>' % (fn, esc_xml(title)))
        ncx_points.append('<navPoint id="np%d" playOrder="%d"><navLabel><text>%s</text></navLabel><content src="%s"/></navPoint>' % (i + 1, i + 1, esc_xml(title), fn))
    z.writestr('OEBPS/cover.png', make_cover(), compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('OEBPS/nav.xhtml', '''<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>%s</ol></nav></body></html>''' % '\n'.join(nav_items), compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('OEBPS/toc.ncx', '''<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="urn:uuid:alice-test"/></head>
<docTitle><text>Alice's Adventures in Wonderland</text></docTitle><navMap>%s</navMap></ncx>''' % '\n'.join(ncx_points), compress_type=zipfile.ZIP_DEFLATED)
    z.writestr('OEBPS/content.opf', '''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:alice-test</dc:identifier>
    <dc:title>Alice's Adventures in Wonderland</dc:title>
    <dc:creator>Lewis Carroll</dc:creator>
    <dc:language>en</dc:language>
    <dc:subject>Fantasy fiction</dc:subject>
    <dc:subject>Children's stories</dc:subject>
    <dc:subject>Nonsense literature</dc:subject>
    <dc:description>A girl named Alice falls through a rabbit hole into a fantasy world.</dc:description>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>%s</manifest>
  <spine toc="ncx">%s</spine>
</package>''' % ('\n'.join(manifest), '\n'.join(spine)), compress_type=zipfile.ZIP_DEFLATED)
    z.close()
    print('epub written', os.path.getsize(path))

# ---- hand-rolled text PDF ----
def asciify(s):
    return (s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
             .replace('—', '--').replace('–', '-').replace('…', '...').encode('latin-1', 'replace').decode('latin-1'))

def pdf_escape(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

def make_text_pdf(path, max_chapters=2):
    W, H = 612, 792
    margin, size, leading, hsize = 72, 11, 15, 18
    pages, cur, y = [], [], H - margin

    def newpage():
        nonlocal cur, y
        pages.append(cur)
        cur, y = [], H - margin

    for title, paras in chapters[:max_chapters]:
        if cur:
            newpage()
        cur.append(('F2', hsize, margin, y, asciify(title)))
        y -= hsize * 2
        for p in paras:
            for line in textwrap.wrap(asciify(p), 84):
                if y < margin + leading:
                    newpage()
                cur.append(('F1', size, margin, y, line))
                y -= leading
            y -= int(leading * 0.6)
            if y < margin + leading:
                newpage()
    if cur:
        pages.append(cur)

    objs = []  # list of bytes (object bodies), index+1 = object number
    def add(body):
        objs.append(body)
        return len(objs)

    font1 = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>')
    font2 = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>')
    pages_obj_num = len(objs) + 1
    objs.append(None)  # placeholder for /Pages
    page_nums = []
    for pi, items in enumerate(pages):
        ops = []
        header = "ALICE'S ADVENTURES IN WONDERLAND"
        ops.append('BT /F1 8 Tf %d %d Td (%s) Tj ET' % (margin, H - 40, pdf_escape(header)))
        for fnt, sz, x, yy, txt in items:
            ops.append('BT /%s %d Tf %d %d Td (%s) Tj ET' % (fnt, sz, x, yy, pdf_escape(txt)))
        ops.append('BT /F1 9 Tf %d %d Td (%d) Tj ET' % (W // 2 - 5, 36, pi + 1))
        stream = '\n'.join(ops).encode('latin-1')
        content_num = add(b'<< /Length %d >>\nstream\n' % len(stream) + stream + b'\nendstream')
        page_num = add(('<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>'
                        % (pages_obj_num, W, H, font1, font2, content_num)).encode('latin-1'))
        page_nums.append(page_num)
    objs[pages_obj_num - 1] = ('<< /Type /Pages /Kids [%s] /Count %d >>' % (' '.join('%d 0 R' % n for n in page_nums), len(page_nums))).encode('latin-1')
    catalog = add(('<< /Type /Catalog /Pages %d 0 R >>' % pages_obj_num).encode('latin-1'))
    info = add(("<< /Title (Alice's Adventures in Wonderland) /Author (Lewis Carroll) >>").encode('latin-1'))

    out = io.BytesIO()
    out.write(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, body in enumerate(objs):
        offsets.append(out.tell())
        out.write(b'%d 0 obj\n' % (i + 1))
        out.write(body)
        out.write(b'\nendobj\n')
    xref = out.tell()
    out.write(b'xref\n0 %d\n' % (len(objs) + 1))
    out.write(b'0000000000 65535 f \n')
    for off in offsets:
        out.write(b'%010d 00000 n \n' % off)
    out.write(b'trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, catalog, info, xref))
    open(path, 'wb').write(out.getvalue())
    print('text pdf written', os.path.getsize(path), 'pages', len(pages))

# ---- page renderer used for scan PDF and photos ----
def render_page(paras, page_label, size=(1240, 1754), fsize=34, header=None):
    img = Image.new('RGB', size, (255, 255, 255))
    d = ImageDraw.Draw(img)
    f = font(fsize)
    fh = font(int(fsize * 0.8))
    margin = 120
    y = margin
    if header:
        d.text((margin, 60), header, fill=(60, 60, 60), font=fh)
    d.text((size[0] - margin - 60, 60), str(page_label), fill=(30, 30, 30), font=fh)
    maxw = size[0] - 2 * margin
    for p in paras:
        words = p.split(' ')
        line = ''
        for w in words:
            test = (line + ' ' + w).strip()
            if d.textlength(test, font=f) > maxw and line:
                d.text((margin, y), line, fill=(20, 20, 20), font=f)
                y += int(fsize * 1.45)
                line = w
            else:
                line = test
            if y > size[1] - margin:
                break
        if line and y <= size[1] - margin:
            d.text((margin, y), line, fill=(20, 20, 20), font=f)
            y += int(fsize * 1.45)
        y += int(fsize * 0.8)
        if y > size[1] - margin:
            break
    return img

def make_scan_pdf(path):
    # chapter III text, three pages, each page a few paragraphs
    title, paras = chapters[2]
    pages = []
    idx = 0
    for pi in range(3):
        chunk = paras[idx: idx + 4]
        idx += 4
        header = title.upper() if pi == 0 else None
        pages.append(render_page(chunk, 21 + pi, header=header).convert('L').convert('RGB'))
    pages[0].save(path, 'PDF', resolution=150, save_all=True, append_images=pages[1:])
    print('scan pdf written', os.path.getsize(path))

def photograph(img, seed=1):
    random.seed(seed)
    # paper tint
    paper = Image.new('RGB', img.size, (246, 240, 226))
    img = Image.blend(img.convert('RGB'), paper, 0.18)
    # shading gradient (book curvature)
    w, h = img.size
    grad = Image.new('L', (w, 1))
    for x in range(w):
        v = int(255 - 70 * (1 - math.cos(math.pi * x / w)) / 2 - 25 * max(0, 1 - x / (w * 0.25)))
        grad.putpixel((x, 0), max(0, min(255, v)))
    grad = grad.resize((w, h))
    dark = Image.new('RGB', (w, h), (40, 30, 20))
    img = Image.composite(img, dark, grad)
    # rotate slightly, add border like a photo of a page on a table
    img = img.rotate(random.uniform(-2.2, 2.2), resample=Image.BICUBIC, expand=True, fillcolor=(70, 60, 55))
    # noise + blur
    px = img.load()
    for _ in range(int(img.size[0] * img.size[1] * 0.004)):
        x = random.randrange(img.size[0]); y = random.randrange(img.size[1])
        r, g, b = px[x, y]
        n = random.randint(-25, 25)
        px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.thumbnail((1400, 2000))
    return img

def make_photos():
    t4, p4 = chapters[3]   # chapter IV
    t7, p7 = chapters[6]   # chapter VII
    pg1 = render_page(p4[2:6], 37, header=t4.upper())
    pg2 = render_page(p7[4:8], 61, header=t7.upper())
    photograph(pg1, 1).save(os.path.join(TA, 'page-photo-1.jpg'), 'JPEG', quality=86)
    photograph(pg2, 2).save(os.path.join(TA, 'page-photo-2.jpg'), 'JPEG', quality=86)
    # ground truth for the calibration test
    open(os.path.join(TA, 'photo-ground-truth.json'), 'w').write(json.dumps({
        'page-photo-1.jpg': {'page': 37, 'chapter_index': 3, 'chapter': t4, 'first_para_index': 2, 'first_words': ' '.join(p4[2].split(' ')[:8])},
        'page-photo-2.jpg': {'page': 61, 'chapter_index': 6, 'chapter': t7, 'first_para_index': 4, 'first_words': ' '.join(p7[4].split(' ')[:8])},
    }, indent=2))
    print('photos written')

make_epub(os.path.join(TA, 'alice.epub'))
make_text_pdf(os.path.join(TA, 'alice-text.pdf'))
make_scan_pdf(os.path.join(TA, 'alice-scan.pdf'))
make_photos()
print('done')
