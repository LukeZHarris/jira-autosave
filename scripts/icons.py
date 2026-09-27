"""Generate the project's simple document/check icons. Python standard library only."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parent.parent

def inside_round(x, y, l, t, r, b, radius):
    cx, cy = max(l + radius, min(x, r - radius)), max(t + radius, min(y, b - radius))
    return l <= x <= r and t <= y <= b and math.hypot(x - cx, y - cy) <= radius

def segment(x, y, a, b, width):
    vx, vy = b[0] - a[0], b[1] - a[1]
    u = max(0, min(1, ((x-a[0])*vx + (y-a[1])*vy)/(vx*vx+vy*vy)))
    return math.hypot(x-a[0]-u*vx, y-a[1]-u*vy) <= width/2

def color(x, y):
    result = (0, 0, 0, 0)
    if inside_round(x, y, 3, 3, 125, 125, 27): result = (12, 102, 228, 255)
    if inside_round(x, y, 30, 23, 91, 104, 7): result = (255, 255, 255, 255)
    if any(segment(x, y, (43, yy), (77, yy), 5) for yy in (42, 55, 68)): result = (166, 197, 241, 255)
    if math.hypot(x-91, y-91) <= 28: result = (12, 102, 228, 255)
    if math.hypot(x-91, y-91) <= 23: result = (75, 206, 151, 255)
    if segment(x, y, (79, 91), (87, 99), 6) or segment(x, y, (87, 99), (103, 82), 6): result = (16, 42, 37, 255)
    return result

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

for size in (16, 32, 48, 128):
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            pixels = [color((x+(sx+.5)/4)*128/size, (y+(sy+.5)/4)*128/size) for sx in range(4) for sy in range(4)]
            rows.extend(round(sum(p[c] for p in pixels)/16) for c in range(4))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', size, size, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
    (ROOT / 'icons' / f'{size}.png').write_bytes(png)
