#!/usr/bin/env python3
"""临时用：把 PNG 解成像素，比较两块区域是不是真有东西。
标准库手解，不装 Pillow。"""
import sys, zlib, struct

def load(path):
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, ihdr = 8, [], None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]
        body = d[pos+8:pos+8+ln]
        if typ == b'IHDR':
            ihdr = struct.unpack('>IIBBBBB', body)
        elif typ == b'IDAT':
            idat.append(body)
        pos += 12 + ln
    w, h, depth, ctype = ihdr[0], ihdr[1], ihdr[2], ihdr[3]
    assert depth == 8, depth
    nch = {0:1, 2:3, 4:2, 6:4}[ctype]
    raw = zlib.decompress(b''.join(idat))
    stride = w * nch
    out = bytearray(h * stride)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if f == 1:
            for i in range(nch, stride): line[i] = (line[i] + line[i-nch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-nch] if i >= nch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-nch] if i >= nch else 0
                b = prev[i]
                c = prev[i-nch] if i >= nch else 0
                pa, pb, pc = abs(b-c), abs(a-c), abs(a+b-2*c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y*stride:(y+1)*stride] = line
        prev = line
    return w, h, nch, out

def region_stats(w, h, nch, px, x0, y0, x1, y1):
    seen, n = {}, 0
    for y in range(y0, y1, 2):
        row = y * w * nch
        for x in range(x0, x1, 2):
            i = row + x * nch
            key = (px[i], px[i+1], px[i+2])
            seen[key] = seen.get(key, 0) + 1
            n += 1
    top = sorted(seen.items(), key=lambda kv: -kv[1])[:4]
    return len(seen), n, top

if __name__ == '__main__':
    for path in sys.argv[1:]:
        w, h, nch, px = load(path)
        # 右半边是预览画布所在列
        x0, x1 = int(w*0.52), int(w*0.98)
        y0, y1 = int(h*0.18), int(h*0.80)
        cnt, n, top = region_stats(w, h, nch, px, x0, y0, x1, y1)
        print(f'{path.split(chr(92))[-1]}  {w}x{h}  右半区取样 {n} 点  不同颜色 {cnt}')
        for c, k in top:
            print(f'    {c}  {100*k//n}%')
