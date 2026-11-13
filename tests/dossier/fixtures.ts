/** Test-only helpers for the dossier: a tiny PNG encoder and upload seeding (no network, no AI). */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import type { Call, Work } from "@/contracts";
import { DEMO_CREATOR_ID, FIXTURE_NOW, fixtureCalls } from "@/fixtures";
import { callsDir, saveWork, uploadsDir } from "@/server/store";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** A w×h RGB PNG with a noisy gradient (so it does not compress to nothing). */
export function makePng(w = 120, h = 160, seed = 1): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let s = seed;
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 2 + (s & 15)) & 0xff;
      raw[o + 1] = (y + (s & 31)) & 0xff;
      raw[o + 2] = 140;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Saves a work whose image is a real PNG upload under <data>/uploads (like WP-02 does). */
export async function seedUploadWork(id: string, sheet: Work["sheet"], order = 0, profileId = DEMO_CREATOR_ID): Promise<Work> {
  fs.writeFileSync(path.join(uploadsDir(), `${id}.png`), makePng(120, 160, order + 1));
  return saveWork({ id, profileId, imageUrl: `/api/works/${id}/image`, sheet, sheetSource: "voice", confirmed: true, order, createdAt: FIXTURE_NOW });
}

/** Adds calls to the test calls.json (fixtures + extras). */
export function writeCalls(extra: Call[]) {
  fs.writeFileSync(path.join(callsDir(), "calls.json"), JSON.stringify([...fixtureCalls, ...extra]));
}
