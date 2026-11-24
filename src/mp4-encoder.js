// ============================================================================
// MP4 (H.264) encoder. The webview's own VideoEncoder compresses the frames;
// this file packs them into an .mp4 that ordinary players open.
//   const enc = await Mp4Encoder.create(w, h, fps, bitrate);  // null: no H.264
//   await enc.add(canvas); ...                                // one per frame
//   const bytes = await enc.finish();     // or enc.close() to abandon
// ============================================================================
const Mp4Encoder = (() => {
  const str = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  const u8 = (...v) => Uint8Array.from(v);
  const u16 = (...v) => { const b = new DataView(new ArrayBuffer(v.length * 2)); v.forEach((x, i) => b.setUint16(i * 2, x)); return new Uint8Array(b.buffer); };
  const u32 = (...v) => { const b = new DataView(new ArrayBuffer(v.length * 4)); v.forEach((x, i) => b.setUint32(i * 4, x >>> 0)); return new Uint8Array(b.buffer); };
  const join = (parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const box = (type, ...parts) => join([u32(8 + parts.reduce((n, p) => n + p.length, 0)), str(type), ...parts]);
  const full = (type, version, flags, ...parts) => box(type, u32(version * 0x1000000 + flags), ...parts);
  const MATRIX = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);
  const TICK = 1000;                          // timescale units per frame

  function mux({ w, h, fps, samples, config, color }) {
    const scale = fps * TICK, dur = samples.length * TICK;
    const ms = Math.round(samples.length / fps * 1000);
    const colr = color ? box("colr", str("nclx"), u16(...color.codes), u8(color.full ? 0x80 : 0)) : new Uint8Array(0);
    const avc1 = box("avc1", new Uint8Array(6), u16(1), new Uint8Array(16), u16(w, h), u32(0x480000, 0x480000, 0), u16(1),
      new Uint8Array(32), u16(24, 0xFFFF), box("avcC", config), colr);
    const keys = samples.map((s, i) => s.key ? i + 1 : 0).filter(Boolean);
    const shifted = samples.some((s, i) => s.ts !== i);      // only if the encoder reordered frames
    const table = (offset) => box("stbl",
      full("stsd", 0, 0, u32(1), avc1),
      full("stts", 0, 0, u32(1, samples.length, TICK)),
      ...(shifted ? [full("ctts", 1, 0, u32(samples.length), ...samples.map((s, i) => u32(1, (s.ts - i) * TICK)))] : []),
      full("stss", 0, 0, u32(keys.length, ...keys)),
      full("stsc", 0, 0, u32(1, 1, samples.length, 1)),
      full("stsz", 0, 0, u32(0, samples.length, ...samples.map(s => s.data.length))),
      full("stco", 0, 0, u32(1, offset)));
    const moov = (offset) => box("moov",
      full("mvhd", 0, 0, u32(0, 0, 1000, ms, 0x10000), u16(0x100, 0), u32(0, 0), MATRIX, new Uint8Array(24), u32(2)),
      box("trak",
        full("tkhd", 0, 3, u32(0, 0, 1, 0, ms, 0, 0), u16(0, 0, 0, 0), MATRIX, u32(w * 65536, h * 65536)),
        box("mdia",
          full("mdhd", 0, 0, u32(0, 0, scale, dur), u16(0x55C4, 0)),
          full("hdlr", 0, 0, u32(0), str("vide"), u32(0, 0, 0), str("VideoHandler\0")),
          box("minf", full("vmhd", 0, 1, u16(0, 0, 0, 0)),
            box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
            table(offset)))));
    const ftyp = box("ftyp", str("isom"), u32(0x200), str("isomiso2avc1mp41"));
    const at = ftyp.length + moov(0).length + 8;              // index first, so players start at once
    const size = samples.reduce((n, s) => n + s.data.length, 0);
    return join([ftyp, moov(at), u32(8 + size), str("mdat"), ...samples.map(s => s.data)]);
  }

  async function pickConfig(w, h, fps, bitrate) {
    if (typeof VideoEncoder === "undefined") return null;
    for (const codec of ["avc1.640028", "avc1.4D0028", "avc1.42E028", "avc1.640033", "avc1.42E033"]) {
      const c = { codec, width: w, height: h, bitrate, framerate: fps, avc: { format: "avc" } };
      try { if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch (_) { /* try the next */ }
    }
    return null;
  }

  async function create(w, h, fps, bitrate) {
    const cfg = await pickConfig(w, h, fps, bitrate);
    if (!cfg) return null;
    const samples = [];
    let config = null, color = null, error = null, n = 0;
    const PRIM = { bt709: 1, bt470bg: 5, smpte170m: 6 }, TRC = { bt709: 1, smpte170m: 6, "iec61966-2-1": 13 }, MAT = { rgb: 0, bt709: 1, bt470bg: 5, smpte170m: 6 };
    const enc = new VideoEncoder({
      output(chunk, meta) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, key: chunk.type === "key", ts: Math.round(chunk.timestamp * fps / 1e6) });
        const dc = meta && meta.decoderConfig;
        if (dc && dc.description && !config) {
          const d = dc.description;
          config = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
          const c = dc.colorSpace;
          if (c && PRIM[c.primaries] && TRC[c.transfer] && MAT[c.matrix] !== undefined)
            color = { codes: [PRIM[c.primaries], TRC[c.transfer], MAT[c.matrix]], full: !!c.fullRange };
        }
      },
      error(e) { error = e; },
    });
    enc.configure(cfg);
    const check = () => { if (error) throw error; };
    return {
      codec: cfg.codec,
      async add(canvas) {
        check();
        while (enc.encodeQueueSize > 6) { await new Promise(r => setTimeout(r, 4)); check(); }
        const f = new VideoFrame(canvas, { timestamp: Math.round(n * 1e6 / fps), duration: Math.round(1e6 / fps) });
        try { enc.encode(f, { keyFrame: n % (fps * 2) === 0 }); } finally { f.close(); }
        n++;
      },
      async finish() {
        await enc.flush(); check(); enc.close();
        if (!config || samples.length !== n) throw new Error(`encoder returned ${samples.length} of ${n} frames`);
        return mux({ w, h, fps, samples, config, color });
      },
      close() { if (enc.state !== "closed") enc.close(); },
    };
  }
  return { create };
})();
