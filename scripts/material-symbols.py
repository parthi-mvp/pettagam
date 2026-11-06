#!/usr/bin/env python3
"""Regenerate src/catalog/material-symbols.ts: every Material Symbols icon our font file can draw.

Usage (from the repo root, after updating @expo-google-fonts/material-symbols):
    python3 scripts/material-symbols.py

Downloads Google's name → codepoint list, keeps only names whose glyph exists in the bundled font
(read from its cmap table; no extra Python packages), merges aliases of the same glyph into its search text.
"""
import struct
import urllib.request

FONT = 'node_modules/@expo-google-fonts/material-symbols/300Light/MaterialSymbols_300Light.ttf'
CODEPOINTS = ('https://raw.githubusercontent.com/google/material-design-icons/master/variablefont/'
              'MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.codepoints')
OUT = 'src/catalog/material-symbols.ts'


def font_codepoints(path):
    d = open(path, 'rb').read()
    num = struct.unpack('>H', d[4:6])[0]
    tables = {d[12 + 16 * i:16 + 16 * i].decode('latin1'): struct.unpack('>II', d[20 + 16 * i:28 + 16 * i]) for i in range(num)}
    off = tables['cmap'][0]
    cps = set()
    for i in range(struct.unpack('>H', d[off + 2:off + 4])[0]):
        o = off + struct.unpack('>I', d[off + 8 + 8 * i:off + 12 + 8 * i])[0]
        fmt = struct.unpack('>H', d[o:o + 2])[0]
        if fmt == 4:
            segx2 = struct.unpack('>H', d[o + 6:o + 8])[0]
            ends = struct.unpack('>%dH' % (segx2 // 2), d[o + 14:o + 14 + segx2])
            starts = struct.unpack('>%dH' % (segx2 // 2), d[o + 16 + segx2:o + 16 + 2 * segx2])
            for s, e in zip(starts, ends):
                if s != 0xFFFF:
                    cps.update(range(s, e + 1))
        elif fmt == 12:
            for g in range(struct.unpack('>I', d[o + 12:o + 16])[0]):
                s, e, _ = struct.unpack('>III', d[o + 16 + 12 * g:o + 28 + 12 * g])
                cps.update(range(s, e + 1))
    return cps


def main():
    in_font = font_codepoints(FONT)
    by_cp = {}
    for line in urllib.request.urlopen(CODEPOINTS).read().decode().splitlines():
        name, hexcp = line.split()
        cp = int(hexcp, 16)
        if cp in in_font:
            by_cp.setdefault(cp, set()).add(name)
    entries = []
    for cp, names in by_cp.items():
        ns = sorted(names, key=lambda x: (len(x), x))  # shortest name shows, the rest become search aliases
        entries.append((ns[0], cp, ns[1:]))  # aliases keep their underscores: "name:hex:alias_one alias_two"
    entries.sort()
    data = '\n'.join(f'{n}:{cp:x}' + (':' + ' '.join(a) if a else '') for n, cp, a in entries)
    header = open(OUT).read().split('export const')[0] if __import__('os').path.exists(OUT) else ''
    open(OUT, 'w').write(header + 'export const MATERIAL_SYMBOLS_DATA = `' + data + '`;\n')
    print(f'{len(entries)} icons written to {OUT}')


if __name__ == '__main__':
    main()
