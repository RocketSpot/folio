#!/usr/bin/env python3
"""Generate the format test files in test-assets/formats/ from the first chapter of test-assets/pg11.txt.

  python3 tools/make_format_assets.py             # DOCX, ODT, RTF, FB2 (+ .fb2.zip), PDB (PalmDoc), SRT, VTT, LaTeX, Markdown,
                                                   # an HTML+TXT zip bundle and a CBZ made from the page photos
  python3 tools/make_format_assets.py --download   # also fetch Project Gutenberg's MOBI and AZW3 editions of Alice

Every file is hand-assembled with the standard library so the parsers are tested against the raw specifications,
not against one particular authoring program.
"""
import os, struct, sys, zipfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test-assets', 'formats')
SRC = os.path.join(ROOT, 'test-assets', 'pg11.txt')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def paragraphs():
    src = open(SRC, encoding='utf-8').read()
    start = src.find('CHAPTER I.\nDown the Rabbit-Hole')
    if start < 0:
        start = src.find('CHAPTER I.')
    body = src[start:start + 9000]
    return [p.replace('\n', ' ').strip() for p in body.split('\n\n') if p.strip()]


def docx(paras):
    body = []
    for p in paras:
        if p.startswith('CHAPTER'):
            body.append('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % esc(p))
        else:
            h = len(p) // 2  # two runs per paragraph, to test run joining
            body.append('<w:p><w:r><w:t xml:space="preserve">%s</w:t></w:r><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % (esc(p[:h]), esc(p[h:])))
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s<w:sectPr/></w:body></w:document>' % ''.join(body))
    core = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">'
            '<dc:title>Alice DOCX Test</dc:title><dc:creator>Lewis Carroll</dc:creator><dc:language>en-GB</dc:language></cp:coreProperties>')
    ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')
    rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')
    with zipfile.ZipFile(os.path.join(OUT, 'alice.docx'), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels); z.writestr('word/document.xml', document); z.writestr('docProps/core.xml', core)


def odt(paras):
    body = []
    for p in paras:
        body.append(('<text:h text:outline-level="1">%s</text:h>' if p.startswith('CHAPTER') else '<text:p text:style-name="P1">%s</text:p>') % esc(p))
    content = ('<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">'
               '<office:body><office:text>%s</office:text></office:body></office:document-content>' % ''.join(body))
    meta = ('<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">'
            '<office:meta><dc:title>Alice ODT Test</dc:title><dc:creator>Lewis Carroll</dc:creator><dc:language>en</dc:language></office:meta></office:document-meta>')
    with zipfile.ZipFile(os.path.join(OUT, 'alice.odt'), 'w') as z:
        z.writestr('mimetype', 'application/vnd.oasis.opendocument.text', compress_type=zipfile.ZIP_STORED)
        z.writestr('content.xml', content, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr('meta.xml', meta, compress_type=zipfile.ZIP_DEFLATED)


def rtf(paras):
    def escape(s):
        out = []
        for ch in s:
            o = ord(ch)
            if ch in '\\{}': out.append('\\' + ch)
            elif o < 128: out.append(ch)
            elif o < 256: out.append("\\'%02x" % o)
            else: out.append('\\u%d?' % (o if o < 32768 else o - 65536))
        return ''.join(out)
    parts = ['{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\froman Times New Roman;}}{\\colortbl;\\red0\\green0\\blue0;}'
             '{\\stylesheet{\\s0 Normal;}{\\s1\\b\\fs32 heading 1;}}{\\info{\\title Alice RTF Test}{\\author Lewis Carroll}}\\viewkind4\\uc1\\pard\\f0\\fs24 ']
    for p in paras:
        if p.startswith('CHAPTER'): parts.append('\\pard\\s1\\b\\fs32 ' + escape(p) + '\\b0\\fs24\\par\n')
        else: parts.append('\\pard ' + escape(p) + '\\par\n')
    parts.append('}')
    open(os.path.join(OUT, 'alice.rtf'), 'w', encoding='cp1252', errors='replace').write(''.join(parts))


def fb2(paras):
    sections, cur = [], None
    for p in paras:
        if p.startswith('CHAPTER'):
            if cur: sections.append(cur)
            cur = {'title': p, 'paras': []}
        else:
            if cur is None: cur = {'title': 'Front', 'paras': []}
            cur['paras'].append(p)
    if cur: sections.append(cur)
    xml = ['<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><genre>prose_classic</genre>'
           '<author><first-name>Lewis</first-name><last-name>Carroll</last-name></author><book-title>Alice FB2 Test</book-title><annotation><p>A test FictionBook.</p></annotation><lang>en</lang></title-info></description><body>']
    for s in sections:
        xml.append('<section><title><p>%s</p></title>%s</section>' % (esc(s['title']), ''.join('<p>%s</p>' % esc(p) for p in s['paras'])))
    xml.append('</body></FictionBook>')
    path = os.path.join(OUT, 'alice.fb2')
    open(path, 'w', encoding='utf-8').write(''.join(xml))
    with zipfile.ZipFile(os.path.join(OUT, 'alice.fb2.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(path, 'alice.fb2')


def pdb(paras):
    def compress(data):
        # PalmDoc "compression 2" using only literal runs and the 0x09-0x7f pass-through range (valid, if not compact)
        out, i = bytearray(), 0
        while i < len(data):
            b = data[i]
            if 0x09 <= b <= 0x7f: out.append(b); i += 1
            else:
                run = bytearray()
                while i < len(data) and len(run) < 8 and not (0x09 <= data[i] <= 0x7f): run.append(data[i]); i += 1
                out.append(len(run)); out.extend(run)
        return bytes(out)
    text = ('\n\n'.join(paras)).encode('utf-8')
    records = [compress(text[i:i + 4096]) for i in range(0, len(text), 4096)]
    rec0 = struct.pack('>HHIHHH', 2, 0, len(text), len(records), 4096, 0)
    allrecs = [rec0] + records
    hdr = b'Alice PDB Test'.ljust(32, b'\0') + struct.pack('>HHIIIIII', 0, 0, 0, 0, 0, 0, 0, 0) + b'TEXtREAd' + struct.pack('>IIH', 0, 0, len(allrecs))
    offset = len(hdr) + 8 * len(allrecs) + 2
    reclist = bytearray()
    for i, r in enumerate(allrecs):
        reclist += struct.pack('>IBBH', offset, 0, 0, i & 0xffff); offset += len(r)
    open(os.path.join(OUT, 'alice.pdb'), 'wb').write(hdr + reclist + b'\0\0' + b''.join(allrecs))


def subtitles(paras):
    srt = ['%d\n00:00:%02d,000 --> 00:00:%02d,500\n%s\n' % (i + 1, i * 4, i * 4 + 3, p[:160]) for i, p in enumerate(paras[:12])]
    open(os.path.join(OUT, 'alice.srt'), 'w', encoding='utf-8').write('\n'.join(srt))
    vtt = ['00:00:%02d.000 --> 00:00:%02d.500\n%s\n' % (i * 4, i * 4 + 3, p[:160]) for i, p in enumerate(paras[:12])]
    open(os.path.join(OUT, 'alice.vtt'), 'w', encoding='utf-8').write('WEBVTT\n\n' + '\n'.join(vtt))


def latex(paras):
    tex = ['\\documentclass{book}\n\\usepackage[utf8]{inputenc}\n\\title{Alice LaTeX Test}\n\\author{Lewis Carroll}\n\\begin{document}\n\\maketitle\n']
    for p in paras:
        if p.startswith('CHAPTER'): tex.append('\\chapter{%s}\n\n' % p.replace('&', '\\&'))
        else: tex.append(p.replace('&', '\\&').replace('_', '\\_').replace('\u201c', '``').replace('\u201d', "''") + '\n\n')
    tex.append('\\end{document}\n')
    open(os.path.join(OUT, 'alice.tex'), 'w', encoding='utf-8').write(''.join(tex))


def markdown(paras):
    body = '\n\n'.join(('# ' + p) if p.startswith('CHAPTER') else p for p in paras)
    open(os.path.join(OUT, 'alice.md'), 'w', encoding='utf-8').write('---\ntitle: Alice Markdown\nauthor: Lewis Carroll\n---\n\n' + body)


def bundle(paras):
    html = '<html><head><title>Alice HTML in ZIP</title></head><body>' + ''.join(('<h2>%s</h2>' if p.startswith('CHAPTER') else '<p>%s</p>') % esc(p) for p in paras) + '</body></html>'
    with zipfile.ZipFile(os.path.join(OUT, 'alice-bundle.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('book/chapter1.html', html)
        z.writestr('book/readme.txt', 'A second text file in the same bundle; it becomes its own section.')


def cbz():
    photos = sorted(f for f in os.listdir(os.path.join(ROOT, 'test-assets')) if f.lower().endswith(('.jpg', '.jpeg', '.png')))[:2]
    if not photos:
        print('no page photos in test-assets/, skipping CBZ'); return
    with zipfile.ZipFile(os.path.join(OUT, 'alice.cbz'), 'w') as z:
        for i, f in enumerate(photos):
            z.write(os.path.join(ROOT, 'test-assets', f), '%03d.jpg' % (i + 1))


def download():
    for url, name in [('https://www.gutenberg.org/ebooks/11.kf8.images', 'alice-kf8.azw3'), ('https://www.gutenberg.org/ebooks/11.kindle.noimages', 'alice-mobi6.mobi')]:
        try:
            urllib.request.urlretrieve(url, os.path.join(OUT, name)); print('downloaded', name)
        except Exception as e:
            print('download failed', name, e)


def main():
    os.makedirs(OUT, exist_ok=True)
    paras = paragraphs()
    docx(paras); odt(paras); rtf(paras); fb2(paras); pdb(paras); subtitles(paras); latex(paras); markdown(paras); bundle(paras); cbz()
    if '--download' in sys.argv:
        download()
    for f in sorted(os.listdir(OUT)):
        print('%-22s %8d bytes' % (f, os.path.getsize(os.path.join(OUT, f))))


if __name__ == '__main__':
    main()
