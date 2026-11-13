/** Links of a work (CCR-arts): validation and what they say about the work. Pure: safe in the browser. */
import { artFamily, defaultMediaKind, mediaKindFromLink, type MediaKind, type Profile } from "@/contracts";

/** "bandcamp.com/x" -> "https://bandcamp.com/x"; anything that is not an http(s) URL -> undefined. */
export function normalizeLink(raw: string): string | undefined {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    return (u.protocol === "http:" || u.protocol === "https:") && /\.[a-z]{2,}$/i.test(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Valid http(s) URLs only, deduped, in order. Invalid entries are dropped, never stored. */
export function normalizeLinks(links: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of links ?? []) {
    const u = normalizeLink(raw);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/** Explicit choice > what the first recognisable link says > the profile's art. */
export function inferMediaKind(opts: { explicit?: MediaKind; links?: readonly string[]; profile?: Pick<Profile, "kind" | "disciplines"> }): MediaKind {
  if (opts.explicit) return opts.explicit;
  for (const l of opts.links ?? []) {
    const k = mediaKindFromLink(l);
    if (k) return k;
  }
  if (opts.profile?.kind === "business") return "image";
  return defaultMediaKind(artFamily(opts.profile?.disciplines));
}


/** Short label for a link chip: "YouTube", "Bandcamp", or the bare host. */
export function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const known: Record<string, string> = { "youtube.com": "YouTube", "youtu.be": "YouTube", "vimeo.com": "Vimeo", "bandcamp.com": "Bandcamp", "soundcloud.com": "SoundCloud", "spotify.com": "Spotify", "open.spotify.com": "Spotify" };
    const hit = Object.keys(known).find((d) => host === d || host.endsWith(`.${d}`));
    return hit ? known[hit] : host;
  } catch {
    return url;
  }
}
