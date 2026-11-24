// ============================================================================
// Minimal animated-GIF encoder (no dependencies).
//   const enc = GifEncoder(w, h, palette);   // palette from GifEncoder.palette()
//   enc.add(rgba, delayMs); ... ; const bytes = enc.finish();
// One global 256-colour palette; pixels unchanged since the previous frame are
// stored as transparent, which keeps files small when the camera is still.
// ============================================================================
function GifEncoder(w, h, pal) {
  let buf = new Uint8Array(1 << 20), len = 0;
  const need = (n) => {
    if (len + n <= buf.length) return;
    const b = new Uint8Array(Math.max(buf.length * 2, len + n)); b.set(buf); buf = b;
  };
  const byte = (b) => { need(1); buf[len++] = b; };
  const u16 = (v) => { byte(v & 255); byte((v >> 8) & 255); };
  const str = (s) => { for (const c of s) byte(c.charCodeAt(0)); };

  const CLEAR = 256, EOI = 257, TRANS = 255;      // colours use 0..254
  const lut = new Int16Array(32768).fill(-1);     // rgb555 -> palette index
  function nearest(r, g, b) {
    const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (lut[k] >= 0) return lut[k];
    let best = 0, bd = 1e9;
    const R = (r & 248) | 4, G = (g & 248) | 4, B = (b & 248) | 4;
    for (let i = 0; i < pal.length; i++) {
      const p = pal[i], d = 2 * (p[0] - R) ** 2 + 4 * (p[1] - G) ** 2 + 3 * (p[2] - B) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return (lut[k] = best);
  }

  str("GIF89a"); u16(w); u16(h); byte(0xF7); byte(0); byte(0);
  for (let i = 0; i < 256; i++) { const p = pal[i] || [0, 0, 0]; byte(p[0]); byte(p[1]); byte(p[2]); }
  byte(0x21); byte(0xFF); byte(11); str("NETSCAPE2.0"); byte(3); byte(1); u16(0); byte(0);

  const trie = new Uint16Array(4096 * 256);
  function lzw(px) {
    byte(8);
    const blk = new Uint8Array(255);
    let bl = 0, acc = 0, nb = 0, size = 9, next = 258;
    const flush = () => { if (!bl) return; byte(bl); need(bl); buf.set(blk.subarray(0, bl), len); len += bl; bl = 0; };
    const emit = (code) => {
      acc |= code << nb; nb += size;
      while (nb >= 8) { blk[bl++] = acc & 255; acc >>>= 8; nb -= 8; if (bl === 255) flush(); }
    };
    trie.fill(0); emit(CLEAR);
    let cur = px[0];
    for (let i = 1; i < px.length; i++) {
      const c = px[i], k = cur * 256 + c, hit = trie[k];
      if (hit) { cur = hit; continue; }
      emit(cur);
      if (next < 4096) {
        trie[k] = next;
        if (next === (1 << size) && size < 12) size++;
        next++;
      } else {
        emit(CLEAR); trie.fill(0); size = 9; next = 258;
      }
      cur = c;
    }
    emit(cur);
    if (next === (1 << size) && size < 12) size++;   // decoder adds one more entry
    emit(EOI);
    if (nb > 0) { blk[bl++] = acc & 255; if (bl === 255) flush(); }
    flush(); byte(0);
  }

  let prev = null;
  return {
    add(rgba, delayMs) {
      const n = w * h, idx = new Uint8Array(n), out = new Uint8Array(n);
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        const v = nearest(rgba[j], rgba[j + 1], rgba[j + 2]);
        idx[i] = v;
        out[i] = prev && prev[i] === v ? TRANS : v;
      }
      byte(0x21); byte(0xF9); byte(4); byte(prev ? 0x05 : 0x04);   // keep previous frame
      u16(Math.max(2, Math.round(delayMs / 10))); byte(TRANS); byte(0);
      byte(0x2C); u16(0); u16(0); u16(w); u16(h); byte(0);
      lzw(out);
      prev = idx;
    },
    finish() { byte(0x3B); return buf.slice(0, len); },
  };
}

// Median-cut palette (255 colours) from sample RGBA frames.
GifEncoder.palette = function (frames) {
  const hist = new Map();
  for (const f of frames) for (let j = 0; j < f.length; j += 12) {
    const k = ((f[j] >> 3) << 10) | ((f[j + 1] >> 3) << 5) | (f[j + 2] >> 3);
    let e = hist.get(k);
    if (!e) hist.set(k, e = [0, 0, 0, 0]);
    e[0] += f[j]; e[1] += f[j + 1]; e[2] += f[j + 2]; e[3]++;
  }
  const pts = [...hist.values()].map(e => ({ c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]], n: Math.sqrt(e[3]) }));
  const measure = (p) => {
    let axis = 0, range = -1;
    for (let a = 0; a < 3; a++) {
      let lo = 255, hi = 0;
      for (const q of p) { if (q.c[a] < lo) lo = q.c[a]; if (q.c[a] > hi) hi = q.c[a]; }
      const r = (hi - lo) * [1, 1.3, 0.9][a];
      if (r > range) { range = r; axis = a; }
    }
    return { p, axis, score: range * Math.sqrt(p.reduce((s, q) => s + q.n, 0)) };
  };
  const boxes = [measure(pts)];
  while (boxes.length < 255) {
    let bi = -1;
    boxes.forEach((b, i) => { if (b.p.length > 1 && (bi < 0 || b.score > boxes[bi].score)) bi = i; });
    if (bi < 0) break;
    const { p, axis } = boxes[bi];
    p.sort((a, b) => a.c[axis] - b.c[axis]);
    const half = p.reduce((s, q) => s + q.n, 0) / 2;
    let s = 0, cut = 1;
    for (; cut < p.length; cut++) { s += p[cut - 1].n; if (s >= half) break; }
    cut = Math.min(Math.max(1, cut), p.length - 1);
    boxes.splice(bi, 1, measure(p.slice(0, cut)), measure(p.slice(cut)));
  }
  return boxes.map(({ p }) => {
    const n = p.reduce((s, q) => s + q.n, 0);
    return [0, 1, 2].map(a => Math.round(p.reduce((s, q) => s + q.c[a] * q.n, 0) / n));
  });
};
