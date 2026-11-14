// Generates the example artworks of the demo scenarios: data/demo/works/*.png.
// Usage: npm run demo:images   (deterministic: same bytes every run, no network, no third-party art)
//
// They are procedural abstractions drawn by this script (sea washes, a net, tide bands), made by the Mecena team and
// released under CC0 1.0 (see data/demo/works/LICENSE.md). They stand in for "photos of the artist's works" in the
// demo scenarios; they are not, and do not imitate, any real artist's work.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const W = 720;
const H = 960;
const OUT = path.resolve(process.cwd(), "data/demo/works");

type RGB = [number, number, number];

/** Small deterministic PRNG (mulberry32) so the PNGs are byte-identical on every run. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Value noise on a coarse lattice, bilinear + smoothstep: soft watercolour-like blooms. */
function noise2(seed: number, cells: number) {
  const r = rng(seed);
  const n = cells + 2;
  const grid = Array.from({ length: n * n }, () => r());
  return (x: number, y: number) => {
    const gx = (x / W) * cells;
    const gy = (y / H) * cells;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(0, 1, gx - x0);
    const fy = smooth(0, 1, gy - y0);
    const v = (i: number, j: number) => grid[Math.min(n - 1, j) * n + Math.min(n - 1, i)];
    const top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx;
    const bot = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bot * fy;
  };
}

function paper(seed: number) {
  const fine = noise2(seed, 90);
  return (x: number, y: number): RGB => {
    const g = 244 + (fine(x, y) - 0.5) * 10;
    return [g, g - 3, g - 10];
  };
}

/** "Redeira I": a sea wash crossed by a hand-drawn fishing net. */
function redeira(x: number, y: number, n1: ReturnType<typeof noise2>, n2: ReturnType<typeof noise2>, base: (x: number, y: number) => RGB): RGB {
  const deep: RGB = [28, 74, 104];
  const shallow: RGB = [96, 160, 170];
  const wash = smooth(0.15, 0.95, y / H + (n1(x, y) - 0.5) * 0.5);
  let c = mix(base(x, y), mix(shallow, deep, wash), 0.82 * smooth(0.05, 0.25, n2(x, y) + 0.2));
  // net: two families of sagging curves
  const u = x + Math.sin(y / 70) * 18;
  const v = y + Math.sin(x / 55) * 22;
  const line = (d: number, period: number) => {
    const m = ((d % period) + period) % period;
    return Math.min(m, period - m);
  };
  const a = line(u + v * 0.55, 62);
  const b = line(u - v * 0.55, 62);
  const ink = Math.max(1 - smooth(0.6, 2.4, a), 1 - smooth(0.6, 2.4, b));
  const knot = 1 - smooth(1.5, 5, Math.hypot(a, b));
  c = mix(c, [236, 226, 204], Math.min(1, ink * 0.75 + knot * 0.6) * smooth(0.1, 0.4, y / H));
  return c;
}

/** "Marea baixa": horizontal tide bands, ochre sand meeting grey-blue water. */
function marea(x: number, y: number, n1: ReturnType<typeof noise2>, n2: ReturnType<typeof noise2>, base: (x: number, y: number) => RGB): RGB {
  const bands: RGB[] = [
    [214, 196, 160],
    [190, 150, 92],
    [128, 150, 158],
    [70, 104, 124],
    [168, 182, 176],
    [204, 172, 118],
  ];
  const t = (y / H) * bands.length + (n1(x, y) - 0.5) * 1.6 + Math.sin(x / 90) * 0.12;
  const i = Math.max(0, Math.min(bands.length - 1, Math.floor(t)));
  const j = Math.min(bands.length - 1, i + 1);
  const c = mix(bands[i], bands[j], smooth(0.55, 1, t - Math.floor(t)));
  return mix(base(x, y), c, 0.55 + n2(x, y) * 0.4);
}

/** "As que agardan": overlapping translucent discs, like figures waiting on the quay. */
function agardan(x: number, y: number, n1: ReturnType<typeof noise2>, n2: ReturnType<typeof noise2>, base: (x: number, y: number) => RGB, discs: { cx: number; cy: number; r: number; c: RGB }[]): RGB {
  let c = mix(base(x, y), [222, 208, 196], 0.5 + (n1(x, y) - 0.5) * 0.3);
  for (const d of discs) {
    const edge = d.r * (0.92 + n2(x, y) * 0.16);
    const k = 1 - smooth(edge - 6, edge + 2, Math.hypot(x - d.cx, y - d.cy));
    c = mix(c, d.c, k * 0.55);
  }
  return c;
}

function render(name: string, seed: number): Buffer {
  const base = paper(seed);
  const n1 = noise2(seed + 1, 7);
  const n2 = noise2(seed + 2, 16);
  const r = rng(seed + 3);
  const palette: RGB[] = [
    [168, 64, 52],
    [40, 72, 96],
    [196, 140, 64],
    [92, 116, 92],
  ];
  const discs = Array.from({ length: 7 }, (_, i) => ({ cx: 90 + r() * (W - 180), cy: 260 + r() * (H - 420), r: 60 + r() * 120, c: palette[i % palette.length] }));
  const px = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    px[y * (W * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const c = name === "redeira" ? redeira(x, y, n1, n2, base) : name === "marea" ? marea(x, y, n1, n2, base) : agardan(x, y, n1, n2, base, discs);
      const o = y * (W * 3 + 1) + 1 + x * 3;
      px[o] = clamp(c[0]);
      px[o + 1] = clamp(c[1]);
      px[o + 2] = clamp(c[2]);
    }
  }
  return png(px);
}

// ---------- minimal PNG encoder (RGB, 8 bit) ----------
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const text = Buffer.from("Comment\0Mecena demo artwork, procedurally generated, CC0 1.0", "latin1");
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("tEXt", text), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export const DEMO_IMAGES = [
  { file: "redeira-i.png", name: "redeira", seed: 11 },
  { file: "marea-baixa.png", name: "marea", seed: 23 },
  { file: "as-que-agardan.png", name: "agardan", seed: 37 },
] as const;

fs.mkdirSync(OUT, { recursive: true });
for (const img of DEMO_IMAGES) {
  const bytes = render(img.name, img.seed);
  fs.writeFileSync(path.join(OUT, img.file), bytes);
  console.log(`[demo] ${img.file} ${(bytes.length / 1024).toFixed(0)} KB`);
}
