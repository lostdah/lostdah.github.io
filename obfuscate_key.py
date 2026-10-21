import base64, os, random, re

BASE = r"C:\Users\cleoa\coding\Random nonsensical scribbles\micelanious\Huellas Al Lodo v2"
html_path = os.path.join(BASE, "reportar.html")

key = ""
with open(os.path.join(BASE, ".env"), encoding="utf-8") as f:
    for line in f:
        m = re.match(r"^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.+?)\s*$", line)
        if m:
            key = m.group(1).strip().strip('"').strip("'")
assert key.startswith("AIza"), "clave no encontrada"

seed = random.randint(10_000, 2_000_000_000)
mul, inc, mod = 1103515245, 12345, 2**31

def stream(n, s):
    out = []
    for _ in range(n):
        s = (s * mul + inc) % mod
        out.append((s >> 16) & 0xFF)
    return out

raw = key.encode()
ks = stream(len(raw), seed)
xored = bytes((b ^ k ^ ((i * 37) & 0xFF)) for i, (b, k) in enumerate(zip(raw, ks)))[::-1]
b64 = base64.b64encode(xored).decode().rstrip("=")
b64 = b64[::-1].translate(str.maketrans(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    "NOPQRSTUVWXYZABCDEFGHIJKLMnopqrstuvwxyzabcdefghijklm"))

chunks, i = [], 0
while i < len(b64):
    n = random.randint(3, 7)
    chunks.append(b64[i:i + n]); i += n
order = list(range(len(chunks)))
random.shuffle(order)
shuffled = [None] * len(chunks)
for pos, idx in enumerate(order):
    shuffled[pos] = chunks[idx]
# map[idx] = pos  -> to rebuild: for idx in 0..n-1, take shuffled[pos_of_idx]
pos_of = [0] * len(chunks)
for pos, idx in enumerate(order):
    pos_of[idx] = pos
# disguise indices
salt = random.randint(11, 97)
enc_pos = [(p * 7 + salt) for p in pos_of]
seed_parts = (seed ^ 0x5A17C3, 0x5A17C3)
decoys = [''.join(random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/") for _ in range(random.randint(3, 7))) for _ in range(5)]
tiles = shuffled + decoys

js = f"""const PUBLIC_GOOGLE_MAPS_KEY = (function () {{
        const _t = {tiles!r};
        const _o = {enc_pos!r};
        const _q = [{seed_parts[0]}, {seed_parts[1]}];
        let s = _o.map(v => _t[(v - {salt}) / 7]).join('').split('').reverse().join('')
          .replace(/[a-z]/gi, c => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26));
        while (s.length % 4) s += '=';
        const b = Array.from(atob(s), c => c.charCodeAt(0)).reverse();
        let r = _q[0] ^ _q[1];
        return b.map((v, i) => {{
          r = (Math.imul(r, {mul}) + {inc}) >>> 0 & 0x7fffffff;
          return String.fromCharCode(v ^ ((r >>> 16) & 255) ^ ((i * 37) & 255));
        }}).join('');
      }})();"""

assert "AIza" not in js and key not in js

def js_sim():
    s = ''.join(tiles[(v - salt) // 7] for v in enc_pos)[::-1]
    rot = []
    for c in s:
        if c.isascii() and c.isalpha():
            limit = 90 if c <= 'Z' else 122
            n = ord(c) + 13
            rot.append(chr(n if limit >= n else n - 26))
        else:
            rot.append(c)
    s = ''.join(rot)
    while len(s) % 4: s += '='
    b = list(base64.b64decode(s))[::-1]
    r = seed_parts[0] ^ seed_parts[1]
    res = []
    for i, v in enumerate(b):
        prod = (r * mul) & 0xFFFFFFFF  # Math.imul low 32 bits
        r = ((prod + inc) & 0xFFFFFFFF) & 0x7FFFFFFF
        res.append(chr(v ^ ((r >> 16) & 255) ^ ((i * 37) & 255)))
    return ''.join(res)
assert js_sim() == key, "la decodificación no coincide"

with open(html_path, encoding="utf-8") as f:
    html = f.read()
target = "const PUBLIC_GOOGLE_MAPS_KEY = '';"
assert target in html
html = html.replace(target, js)
with open(html_path, "w", encoding="utf-8") as f:
    f.write(html)
print("OK: decodificación verificada e insertada; longitud", len(key))
