/**
 * Server-only PDF of a prepared free layout: a pure function of the prepared tree, one absolutely positioned
 * box per element. The guard already fitted everything; this only paints.
 */
import { Document, Ellipse, Image, Page, Svg, Text, View } from "@react-pdf/renderer";
import { registerFonts } from "../pdf/DossierPdf";
import type { PdfImage } from "../pdf/images";
import { fontKey, type PdfFont } from "./fonts-server";
import { PARA_GAP_EM } from "./measure";
import { PAGE_H_PT, PAGE_W_PT, type PreparedElement, type PreparedLayout } from "./schema";

const pc = (n: number) => `${n}%`;

function Element({ el, images, fonts }: { el: PreparedElement; images: Record<string, PdfImage | undefined>; fonts: Map<string, PdfFont> }) {
  if (el.type === "line") {
    const x1 = (el.x1 / 100) * PAGE_W_PT;
    const y1 = (el.y1 / 100) * PAGE_H_PT;
    const x2 = (el.x2 / 100) * PAGE_W_PT;
    const y2 = (el.y2 / 100) * PAGE_H_PT;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    return (
      <View
        style={{
          position: "absolute",
          left: (x1 + x2) / 2 - len / 2,
          top: (y1 + y2) / 2 - el.width / 2,
          width: len,
          height: el.width,
          backgroundColor: el.dashed ? undefined : el.color,
          borderTopWidth: el.dashed ? el.width : 0,
          borderTopColor: el.color,
          borderTopStyle: el.dashed ? "dashed" : undefined,
          opacity: el.opacity,
          transform: `rotate(${angle}deg)`,
        }}
      />
    );
  }
  const box = { position: "absolute" as const, left: pc(el.x), top: pc(el.y), width: pc(el.w), height: pc(el.h) };
  const short = Math.min((el.w / 100) * PAGE_W_PT, (el.h / 100) * PAGE_H_PT);
  if (el.type === "rect")
    return <View style={{ ...box, backgroundColor: el.fill, opacity: el.opacity, borderRadius: (el.radiusPct / 100) * short, borderWidth: el.strokeWidth, borderColor: el.stroke }} />;
  if (el.type === "ellipse") {
    const w = (el.w / 100) * PAGE_W_PT;
    const h = (el.h / 100) * PAGE_H_PT;
    const sw = el.strokeWidth;
    return (
      <View style={{ ...box, opacity: el.opacity }}>
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Ellipse cx={w / 2} cy={h / 2} rx={Math.max(0.5, w / 2 - sw / 2)} ry={Math.max(0.5, h / 2 - sw / 2)} fill={el.fill ?? "none"} stroke={el.stroke ?? "none"} strokeWidth={sw} />
        </Svg>
      </View>
    );
  }
  if (el.type === "image") {
    const img = images[el.workId];
    const pad = (el.matPct / 100) * short;
    return (
      <View style={{ ...box, backgroundColor: el.frame === "mat" ? el.mat : undefined, padding: pad, borderWidth: el.frame === "line" ? 0.75 : 0, borderColor: el.lineColor, borderRadius: (el.radiusPct / 100) * short, opacity: el.opacity, overflow: "hidden" }}>
        {img ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt
          <Image
            src={{ data: img.data, format: img.format }}
            style={{ width: "100%", height: "100%", objectFit: el.fit, objectPositionX: pc(el.focus.x * 100), objectPositionY: pc(el.focus.y * 100) }}
          />
        ) : (
          <View style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center", backgroundColor: el.mat }}>
            <Text style={{ fontSize: 9, color: el.lineColor }}>{el.alt}</Text>
          </View>
        )}
      </View>
    );
  }
  const face = fonts.get(fontKey(el.renderFamily, el.weight, el.italic)) ?? { family: "Serif", weight: 400, italic: false };
  return (
    <View style={{ ...box, justifyContent: el.valign === "top" ? "flex-start" : el.valign === "middle" ? "center" : "flex-end", transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined }}>
      {el.paragraphs.map((p, i) => (
        <Text
          key={i}
          style={{
            fontFamily: face.family,
            fontWeight: face.weight,
            fontStyle: face.italic ? "italic" : "normal",
            fontSize: el.size,
            lineHeight: el.lineHeight,
            letterSpacing: el.tracking * el.size,
            textAlign: el.align,
            color: el.color,
            opacity: el.opacity,
            textTransform: el.uppercase ? "uppercase" : "none",
            marginBottom: i < el.paragraphs.length - 1 ? PARA_GAP_EM * el.size : 0,
          }}
        >
          {p}
        </Text>
      ))}
    </View>
  );
}

export function FreeLayoutPdf({ layout, images, fonts }: { layout: PreparedLayout; images: Record<string, PdfImage | undefined>; fonts: Map<string, PdfFont> }) {
  registerFonts();
  return (
    <Document title={layout.name} author="Mecena">
      {layout.pages.map((pg, i) => (
        <Page key={i} size="A4" style={{ backgroundColor: pg.background, padding: 0 }}>
          {pg.elements.map((el, k) => (
            <Element key={k} el={el} images={images} fonts={fonts} />
          ))}
        </Page>
      ))}
    </Document>
  );
}
