/** SHA-256 tăng dần — hash file lớn mà không nạp toàn bộ vào RAM. */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function rotr(n: number, x: number) {
  return (x >>> n) | (x << (32 - n));
}

export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private buf = new Uint8Array(64);
  private bufLen = 0;
  private bits = 0n;

  update(data: ArrayBuffer | Uint8Array) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.bits += BigInt(u8.length) * 8n;
    let off = 0;
    if (this.bufLen) {
      const take = Math.min(64 - this.bufLen, u8.length);
      this.buf.set(u8.subarray(0, take), this.bufLen);
      this.bufLen += take;
      off = take;
      if (this.bufLen === 64) {
        this.block(this.buf);
        this.bufLen = 0;
      }
    }
    while (off + 64 <= u8.length) {
      this.block(u8.subarray(off, off + 64));
      off += 64;
    }
    if (off < u8.length) {
      this.buf.set(u8.subarray(off));
      this.bufLen = u8.length - off;
    }
  }

  digestHex(): string {
    const pad = new Uint8Array(64);
    pad[0] = 0x80;
    const len = this.bufLen;
    const need = len < 56 ? 56 - len : 120 - len;
    const extra = new Uint8Array(need + 8);
    extra[0] = 0x80;
    const view = new DataView(extra.buffer);
    const hi = Number((this.bits >> 32n) & 0xffffffffn);
    const lo = Number(this.bits & 0xffffffffn);
    view.setUint32(need, hi);
    view.setUint32(need + 4, lo);
    this.update(extra);
    let s = "";
    for (const n of this.h) s += (n >>> 0).toString(16).padStart(8, "0");
    return s;
  }

  private block(chunk: Uint8Array) {
    const w = new Uint32Array(64);
    const view = new DataView(chunk.buffer, chunk.byteOffset, 64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, w[i - 15]!) ^ rotr(18, w[i - 15]!) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(17, w[i - 2]!) ^ rotr(19, w[i - 2]!) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e!) ^ rotr(11, e!) ^ rotr(25, e!);
      const ch = (e! & f!) ^ (~e! & g!);
      const t1 = (h! + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(2, a!) ^ rotr(13, a!) ^ rotr(22, a!);
      const maj = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    this.h[0] = (this.h[0]! + a!) >>> 0;
    this.h[1] = (this.h[1]! + b!) >>> 0;
    this.h[2] = (this.h[2]! + c!) >>> 0;
    this.h[3] = (this.h[3]! + d!) >>> 0;
    this.h[4] = (this.h[4]! + e!) >>> 0;
    this.h[5] = (this.h[5]! + f!) >>> 0;
    this.h[6] = (this.h[6]! + g!) >>> 0;
    this.h[7] = (this.h[7]! + h!) >>> 0;
  }
}

export async function sha256File(file: Blob, onProgress?: (ratio: number) => void): Promise<string> {
  const hasher = new Sha256();
  const chunk = 2 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(file.size, offset + chunk);
    const buf = await file.slice(offset, end).arrayBuffer();
    hasher.update(buf);
    offset = end;
    onProgress?.(file.size ? offset / file.size : 1);
    await new Promise((r) => setTimeout(r, 0));
  }
  return hasher.digestHex();
}
