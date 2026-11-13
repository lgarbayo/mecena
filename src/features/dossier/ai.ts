/**
 * Design agent: turns what the artist asks for, in their own words, into a DossierDesign.
 * Real: Claude (fast tier, medium effort) as an art director that knows the call and its jury.
 * Mock: deterministic keyword reading of the request (tests, no API key, demo fallback).
 * Never touches the artwork: it designs the pages around it.
 * Server-only (imports the LLM helper). Contract change request CCR-design-agent: add to AiService.
 */
import type { Call, Profile } from "@/contracts";
import { isMockAi, structured } from "@/server/ai/llm";
import { DossierDesign, presetDesign, type DossierDesign as Design } from "./design";
import { suggestStyle, tameAccent } from "./style";

export interface DesignDossierInput {
  request: string; // what the artist said or typed ("más oscuro, como una noche en el puerto")
  current: Design; // the design on screen; requests are applied on top of it
  profile: Profile;
  call?: Call;
  workColors: string[]; // dominant colours sampled from their photos
  history: string[]; // earlier requests, oldest first
}

const SYSTEM = `Eres la directora de arte de Mecena. Diseñas el dossier de un artista o de una pyme a partir de lo que te pide con sus palabras.
Devuelves un diseño completo (paleta, tipografías, maquetación, ritmo y títulos de sección) que se aplica a las páginas del dossier en la web y en un PDF A4.

Principios:
- La petición del artista manda. Si pide algo concreto (un color, una letra, "más oscuro", "como un fanzine", "como un catálogo de los 70"), hazlo de verdad y con decisión; no lo diluyas en algo genérico.
- Partes del diseño actual: cambia lo que la petición pide y mantén lo demás, salvo que pida empezar de cero.
- La obra es la protagonista. El diseño la enmarca; nunca compite con ella. Los colores de sus fotos (workColors) son buena fuente para el acento y el fondo de las obras.
- Piensa en quién lee: si hay convocatoria, en su jurado. Artes visuales: deja respirar la obra. Letras, ilustración o diseño: ojo editorial. Ayuda pública o pyme: claridad ante todo, sin letras manuscritas ni fantasía en el texto corrido.
- Debe leerse impreso en A4 y proyectado: contraste alto entre ink y paper, textos secundarios legibles.
- Tipografías: cualquier familia de Google Fonts, escrita exactamente como en Google Fonts. Evita las de siempre (Inter, Roboto, Poppins, Montserrat, Open Sans, Lato, Playfair Display). Busca carácter: p. ej. Fraunces, Instrument Serif, Cormorant Garamond, Libre Caslon Text, EB Garamond, Spectral, Young Serif, Bricolage Grotesque, Familjen Grotesk, Hanken Grotesk, Space Grotesk, Syne, Unbounded, Archivo, IBM Plex Mono, DM Mono, Space Mono, Caveat, Gloock, Bodoni Moda, Anybody. "category" debe corresponder a la familia.
- Nada de degradados, brillos ni adornos de plantilla. Un solo acento que signifique algo.
- titles: solo cuando ayuden (por ejemplo si el artista habla de sus "piezas" en vez de "obra", o pide un tono más personal). Máximo 3-4 palabras, en español o gallego si el artista lo usa. Si no, déjalos vacíos.
- name: nombre corto y evocador del diseño (2-4 palabras).
- rationale: 1-3 frases en español de España, tuteando: qué has hecho y por qué encaja con su obra y, si la hay, con la convocatoria.`;

function brief(input: DesignDossierInput) {
  const { profile, call } = input;
  return {
    peticion: input.request,
    peticionesAnteriores: input.history.slice(-5),
    disenoActual: input.current,
    coloresDeSusObras: input.workColors,
    perfil: {
      tipo: profile.kind === "creator" ? "artista" : "pyme/autónomo",
      nombre: profile.displayName,
      disciplinas: profile.disciplines,
      sector: profile.sector,
      declaracion: profile.statement?.slice(0, 600),
      zona: [profile.city, profile.region].filter(Boolean).join(", "),
    },
    convocatoria: call
      ? {
          titulo: call.title,
          tipo: call.type,
          organiza: call.organizer,
          disciplinas: call.disciplines,
          resumen: call.summary?.slice(0, 600),
          criterios: call.criteria.map((c) => c.name),
          requisitosDelDossier: call.dossierRequirements,
        }
      : null,
  };
}

// ---------------------------------------------------------------- mock: read the request literally

const COLOURS: Record<string, string> = {
  rojo: "#a3362a", granate: "#7a2430", rosa: "#c06a7e", naranja: "#c4682c", ocre: "#b08a3e", amarillo: "#c9a227", mostaza: "#b8962e",
  verde: "#4f7a4a", oliva: "#6f7440", azul: "#2f5d8a", marino: "#1f3550", turquesa: "#2f8a87", morado: "#6a4a8a", violeta: "#6a4a8a",
  terracota: "#a65a3a", teja: "#a65a3a", gris: "#6b7075", negro: "#1a1a1a", dorado: "#a8873a", liquen: "#a3a05a",
};

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export function mockDesign(input: DesignDossierInput): Design {
  const req = input.request.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fresh = has(req, "de cero", "empezar", "nuevo diseno");
  const base: Design = fresh ? presetDesign(suggestStyle({ call: input.call, profile: input.profile }).style, input.profile.kind) : structuredClone(input.current);
  const d = base;
  const done: string[] = [];

  if (has(req, "oscur", "noche", "negro", "nocturn")) {
    d.palette = { ...d.palette, paper: "#16191d", ink: "#ecebe6", muted: "#a5aab0", rule: "#3a4047", wall: "#0e1013", ground: "#22262b", backPaper: "#ecebe6", backInk: "#16191d" };
    done.push("fondo oscuro, como de noche");
  } else if (has(req, "claro", "luminos", "blanco", "luz")) {
    d.palette = { ...d.palette, paper: "#ffffff", ink: "#141517", muted: "#5d6166", rule: "#dededb", wall: "#ececea", ground: "#f3f3f1" };
    done.push("más luz y fondo blanco");
  } else if (has(req, "calid", "calor", "tierra", "crema")) {
    d.palette = { ...d.palette, paper: "#f6efe3", ink: "#2b2520", muted: "#6c6258", rule: "#d8cebf", wall: "#ddd2c0", ground: "#ece3d3" };
    done.push("papel cálido");
  }
  const named = Object.keys(COLOURS).find((c) => req.includes(c));
  if (named) {
    d.palette.accent = COLOURS[named];
    done.push(`acento ${named}`);
  } else if (has(req, "mar", "frio", "atlantico")) {
    d.palette.accent = "#2f5d8a";
    done.push("acento azul atlántico");
  } else if (has(req, "color de mi obra", "colores de mi obra", "mis colores") && input.workColors[0]) {
    d.palette.accent = tameAccent(input.workColors[0]) ?? d.palette.accent;
    done.push("el color de tu obra como acento");
  }

  if (has(req, "fanzine", "punk", "collage", "fotocopia", "underground")) {
    d.type.display = { family: "Space Mono", category: "mono", weight: 700, italic: false, tracking: 0, uppercase: true };
    d.type.labels = "display";
    d.rhythm = { ...d.rhythm, density: "compacta", rules: "gruesas", texture: "grano" };
    d.works.frame = "plana";
    done.push("aire de fanzine: mecanográfica en mayúsculas, reglas gruesas y grano");
  } else if (has(req, "clasic", "libro", "elegant", "serif", "catalogo", "museo")) {
    d.type.display = { family: "Cormorant Garamond", category: "serif", weight: 500, italic: false, tracking: -0.01, uppercase: false };
    d.type.body = { ...d.type.body, family: "EB Garamond", category: "serif" };
    done.push("serifas de libro");
  } else if (has(req, "modern", "minimal", "limpi", "suiz")) {
    d.type.display = { family: "Hanken Grotesk", category: "sans", weight: 600, italic: false, tracking: -0.035, uppercase: false };
    d.rhythm.rules = "finas";
    done.push("palo seco moderno");
  } else if (has(req, "manuscrit", "a mano", "cuaderno", "diario")) {
    d.type.display = { family: "Caveat", category: "handwriting", weight: 600, italic: false, tracking: 0, uppercase: false };
    done.push("títulos a mano, como un cuaderno");
  }
  if (has(req, "a sangre", "obra grande", "mas grande", "protagonista")) {
    d.cover.layout = "obra-a-sangre";
    d.works.frame = "plana";
    done.push("la obra a sangre y sin marco");
  }
  if (has(req, "nombre primero", "nombre arriba", "nombre grande")) {
    d.cover.layout = "nombre-primero";
    d.cover.nameScale = 1.2;
    done.push("el nombre por delante");
  }
  if (has(req, "rejilla", "cuadricula", "mosaico")) {
    d.works.layout = "rejilla";
    done.push("obras en rejilla");
  } else if (has(req, "debajo", "cartela abajo")) {
    d.works.layout = "cartela-debajo";
    done.push("cartelas debajo de cada obra");
  }
  if (has(req, "respir", "aire", "espacio")) {
    d.rhythm.density = "aireada";
    done.push("más aire");
  } else if (has(req, "compact", "apretad", "denso")) {
    d.rhythm.density = "compacta";
    done.push("más compacto");
  }
  if (has(req, "redond")) {
    d.rhythm.corners = 10;
    done.push("esquinas redondeadas");
  }
  if (has(req, "grano", "textura", "papel")) {
    d.rhythm.texture = has(req, "grano") ? "grano" : "papel";
    done.push("textura de papel");
  }
  if (has(req, "pieza")) {
    d.titles = { ...d.titles, works: "Piezas" };
    done.push("«Piezas» en vez de «Obra»");
  }

  const words = input.request.trim().split(/\s+/).slice(0, 4).join(" ");
  d.name = done.length ? (input.request.trim().length <= 40 ? capital(input.request.trim()) : `${capital(words)}…`) : d.name;
  d.rationale = done.length
    ? `He aplicado lo que pedías: ${done.join(", ")}.${input.call ? " Lo he mantenido legible para el jurado de la convocatoria." : ""}`
    : "No he entendido qué cambiar. Prueba con un color, un ambiente («más oscuro», «como un libro», «tipo fanzine») o cómo quieres ver la obra («a sangre», «en rejilla»).";
  return d;
}

const capital = (s: string) => (s ? s[0].toLocaleUpperCase("es-ES") + s.slice(1) : s);

// ---------------------------------------------------------------- entry point

export async function designDossier(input: DesignDossierInput, opts: { forceMock?: boolean } = {}): Promise<Design> {
  if (opts.forceMock || isMockAi()) return mockDesign(input);
  return structured({
    tier: "fast",
    effort: "medium",
    system: SYSTEM,
    schema: DossierDesign,
    maxTokens: 4000,
    user: JSON.stringify(brief(input), null, 1),
  });
}
