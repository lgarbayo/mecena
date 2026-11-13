import { describe, expect, it } from "vitest";
import { cropStyles, dataUrlBytes, fitWithin, isIdentityCrop } from "@/features/works/image";

describe("photo helpers", () => {
  it("fits the long edge within 1600 px, never upscaling", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("estimates data URL size", () => {
    expect(dataUrlBytes("data:image/png;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/png;base64,AA==")).toBe(1);
  });

  it("identity crop shows the whole photo", () => {
    expect(isIdentityCrop({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 })).toBe(true);
    expect(cropStyles({ x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 }, { width: 400, height: 300 }).frame.aspectRatio).toBe("400 / 300");
  });

  it("crop is CSS over the original: frame ratio = crop ratio, image scaled and offset", () => {
    const s = cropStyles({ x: 0.1, y: 0.2, width: 0.5, height: 0.5, rotationDeg: 2 }, { width: 1000, height: 800 });
    expect(s.frame.aspectRatio).toBe("500.0 / 400.0");
    expect(s.img).toMatchObject({ width: "200.0000%", height: "200.0000%", left: "-20.0000%", top: "-40.0000%", transform: "rotate(2deg)" });
  });
});
