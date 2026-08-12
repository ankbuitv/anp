/** ZIP (STORE) tối giản — ảnh/video vốn đã nén, không cần deflate. */

const enc = new TextEncoder();

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const time = (d.getSeconds() / 2) | (d.getMinutes() << 5) | (d.getHours() << 11);
  const date = d.getDate() | ((d.getMonth() + 1) << 5) | ((d.getFullYear() - 1980) << 9);
  return { time, date };
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

export type ZipEntry = { name: string; data: Uint8Array; mtime?: number };

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name.replace(/\\/g, "/"));
    const { time, date } = dosDateTime(e.mtime ?? Date.now());
    const crc = crc32(e.data);
    const local = concat(
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(e.data.length),
      u32(e.data.length),
      u16(name.length),
      u16(0),
      name,
      e.data,
    );
    const central = concat(
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(e.data.length),
      u32(e.data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    );
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralBlob = concat(...centrals);
  const end = concat(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBlob.length), u32(offset), u16(0));
  return concat(...locals, centralBlob, end);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
