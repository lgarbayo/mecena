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
import { familyOf } from "./arts";

export interface DesignDossierInput {
  request: string; // what the artist asked for ("más oscuro, como una noche en el puerto"); "" = design from the interview
  interview?: string[]; // what they told Mecena about their work (statement + transcript), for the first design
  current: Design; // the design on screen; requests are applied on top of it
  profile: Profile;
  call?: Call;
  workColors: string[]; // dominant colours sampled from their photos
  history: string[]; // earlier requests, oldest first
}

const SYSTEM = `Eres la directora de arte de Mecena. Diseñas el dossier de un artista o de una pyme a partir de lo que te pide con sus palabras.
Devuelves un diseño completo (paleta, tipografías, maquetación, ritmo y títulos de sección) que se aplica a las páginas del dossier en la web y en un PDF A4.

Principios:
- Si "peticion" está vacía, nadie te ha dicho cómo lo quiere: es el primer diseño. Sácalo de cómo habla de su obra en "entrevista" (materiales, lugares, luz, estaciones, oficio, tono) y de los colores de sus fotos. Que se note que es SU dossier y no una plantilla. En "rationale" explica qué de lo que contó te ha llevado a este diseño e invita a pedir cambios.
- La petición del artista manda. Si pide algo concreto (un color, una letra, "más oscuro", "como un fanzine", "como un catálogo de los 70"), hazlo de verdad y con decisión; no lo diluyas en algo genérico.
- Partes del diseño actual: cambia lo que la petición pide y mantén lo demás, salvo que pida empezar de cero.
- La obra es la protagonista. El diseño la enmarca; nunca compite con ella. Los colores de sus fotos (workColors) son buena fuente para el acento y el fondo de las obras.
- Piensa en quién lee: si hay convocatoria, en su jurado. Artes visuales: deja respirar la obra. Letras, ilustración o diseño: ojo editorial. Ayuda pública o pyme: claridad ante todo, sin letras manuscritas ni fantasía en el texto corrido.
- Debe leerse impreso en A4 y proyectado: contraste alto entre ink y paper, textos secundarios legibles.
- Tipografías: cualquier familia de Google Fonts, escrita exactamente como en Google Fonts. Evita las de siempre (Inter, Roboto, Poppins, Montserrat, Open Sans, Lato, Playfair Display). Busca carácter: p. ej. Fraunces, Instrument Serif, Cormorant Garamond, Libre Caslon Text, EB Garamond, Spectral, Young Serif, Bricolage Grotesque, Familjen Grotesk, Hanken Grotesk, Space Grotesk, Syne, Unbounded, Archivo, IBM Plex Mono, DM Mono, Space Mono, Caveat, Gloock, Bodoni Moda, Anybody. "category" debe corresponder a la familia.
- Nada de degradados, brillos ni adornos de plantilla. Un solo acento que signifique algo.
- Imágenes: el dossier solo muestra la obra del propio artista (sus fotos, portadas, carteles); tú no añades fotos ni ilustraciones de otros. Si pide imágenes ("con imágenes de jazz", "fotos de conciertos"), lleva ese ambiente a la paleta, las letras y la textura, y en "rationale" dile en una frase que suba sus propias fotos (portadas, conciertos, ensayos) en Obra para que aparezcan.
- Si pide un fondo concreto ("fondo negro", "que predomine el negro"), paper y wall son ese fondo y ink el contraste; backPaper/backInk pueden invertirse.
- titles: solo cuando ayuden (por ejemplo si el artista habla de sus "piezas" en vez de "obra", o pide un tono más personal). Máximo 3-4 palabras, en español o gallego si el artista lo usa. Si no, déjalos vacíos.
- Vale para cualquier arte (familia en "perfil.familia"): pintura, música, danza, teatro, cine, literatura, diseño, artesanía… Piensa en cómo se presenta ese arte: una compañía de danza no es una galería, un disco no es un cuadro.
- structure: también decides el contenido entre portada y contraportada, si el artista lo pide o si su forma de hablar lo pide.
  - blocks: orden de los bloques "statement", "bio", "works", "cv" y "custom". Déjalo vacío para el orden habitual. Quita un bloque si el artista no lo quiere.
  - "custom" es una sección propia (Proceso, Lo que me mueve, Prensa, Con quién trabajo…). Su "body" se escribe SOLO con lo que el artista ha contado en la entrevista, con sus palabras. Nunca inventes datos, nombres, fechas ni premios. Si no hay material, no la crees.
  - title de un bloque: renómbralo si lo pide o si encaja con su arte (p. ej. "Repertorio", "Piezas", "Lo que hago").
  - length: "breve" si pide algo corto (una página, lo esencial); si no, "completo".
- Las obras siempre se quedan. Si la convocatoria pide currículum, la trayectoria también.
- name: nombre corto y evocador del diseño (2-4 palabras).
- rationale: 1-3 frases en español de España, tuteando: qué has hecho y por qué encaja con su obra y, si la hay, con la convocatoria.`;

function brief(input: DesignDossierInput) {
  const { profile, call } = input;
  return {
    peticion: input.request,
    entrevista: (input.interview ?? []).join("\n").slice(0, 3000),
    peticionesAnteriores: input.history.slice(-5),
    disenoActual: input.current,
    coloresDeSusObras: input.workColors,
    perfil: {
      tipo: profile.kind === "creator" ? "artista" : "pyme/autónomo",
      nombre: profile.displayName,
      disciplinas: profile.disciplines,
      familia: familyOf(profile.disciplines),
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

/** The design never adds pictures that are not the artist's: it says so and points to where theirs go. */
const IMAGES_NOTE = " Las imágenes del dossier son siempre tuyas: sube fotos de tus portadas, conciertos o ensayos en Obra y aparecerán aquí.";

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export function mockDesign(input: DesignDossierInput): Design {
  if (!input.request.trim()) return mockFirstDesign(input);
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
  // "negro de fondo" is the page, not an accent: on a dark page the accent must stay visible.
  const dark = d.palette.paper === "#16191d";
  const named = Object.keys(COLOURS).find((c) => req.includes(c) && !(dark && (c === "negro" || c === "gris")));
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

  // Structure: what goes in the dossier and in what order.
  const st = { ...d.structure, blocks: [...(d.structure?.blocks ?? [])] };
  const order = () => (st.blocks.length ? st.blocks : (["statement", "bio", "works", "cv"] as const).map((key) => ({ key })));
  if (has(req, "breve", "una pagina", "corto", "lo esencial")) {
    st.length = "breve";
    done.push("versión breve, con lo esencial");
  } else if (has(req, "completo", "largo")) {
    st.length = "completo";
  }
  if (has(req, "sin biografia", "quita la biografia", "fuera la biografia")) {
    st.blocks = order().filter((b) => b.key !== "bio");
    done.push("sin biografía");
  }
  if (has(req, "trayectoria primero", "trayectoria antes", "cv primero", "curriculum primero")) {
    const bs = order();
    st.blocks = [...bs.filter((b) => b.key === "cv"), ...bs.filter((b) => b.key !== "cv")];
    done.push("la trayectoria por delante");
  } else if (has(req, "obra primero", "obras primero", "obra antes", "empieza por la obra")) {
    const bs = order();
    st.blocks = [...bs.filter((b) => b.key === "works"), ...bs.filter((b) => b.key !== "works")];
    done.push("la obra por delante");
  }
  const custom = /seccion\s+(?:de|sobre|con|llamada)?\s*(?:mi\s+|mis\s+|el\s+|la\s+|los\s+|las\s+)?([a-z]+)/.exec(req);
  if (custom) {
    const topic = custom[1];
    const said = (input.interview ?? []).filter((t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(topic));
    if (said.length) {
      st.blocks = [...order(), { key: "custom" as const, title: capital(topic), body: said.slice(0, 3).join("\n\n") }];
      done.push(`una sección «${capital(topic)}» con lo que contaste`);
    } else {
      done.push(`no tengo nada de lo que contaste sobre «${topic}» para escribir esa sección; cuéntamelo y la añado`);
    }
  }
  d.structure = st;

  const images = has(req, "imagen", "foto", "ilustracion");

  const words = input.request.trim().split(/\s+/).slice(0, 4).join(" ");
  d.name = done.length ? (input.request.trim().length <= 40 ? capital(input.request.trim()) : `${capital(words)}…`) : d.name;
  d.rationale = done.length
    ? `He aplicado lo que pedías: ${done.join(", ")}.${input.call ? " Lo he mantenido legible para el jurado de la convocatoria." : ""}${images ? IMAGES_NOTE : ""}`.slice(0, 600)
    : "No he entendido qué cambiar. Prueba con un color, un ambiente («más oscuro», «como un libro», «tipo fanzine») o cómo quieres ver la obra («a sangre», «en rejilla»).";
  return d;
}

/** First design with no request: read the mood of the interview and take the accent from the work. */
function mockFirstDesign(input: DesignDossierInput): Design {
  const text = (input.interview ?? []).join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const d = presetDesign(suggestStyle({ call: input.call, profile: input.profile }).style, input.profile.kind, input.workColors[0]);
  const why: string[] = [];
  if (has(text, "otono", "vendimia", "vina", "vinedo", "tierra", "barro", "madera")) {
    d.palette = { ...d.palette, paper: "#f6efe3", ink: "#2b2520", muted: "#6c6258", rule: "#d8cebf", wall: "#ddd2c0", ground: "#ece3d3" };
    why.push("la tierra y la viña de las que hablas");
  } else if (has(text, " mar ", "puerto", "costa", "marea")) {
    if (!input.workColors[0]) d.palette.accent = "#2f5d8a";
    why.push("el mar que atraviesa tu trabajo");
  } else if (has(text, "noche", "oscur", "sombra")) {
    d.palette = { ...d.palette, paper: "#16191d", ink: "#ecebe6", muted: "#a5aab0", rule: "#3a4047", wall: "#0e1013", ground: "#22262b", backPaper: "#ecebe6", backInk: "#16191d" };
    why.push("la noche y las sombras de tu obra");
  }
  if (has(text, "libro", "poesia", "relato", "ilustr", "grabado")) {
    d.type.display = { family: "Cormorant Garamond", category: "serif", weight: 500, italic: false, tracking: -0.01, uppercase: false };
    why.push("tu relación con el libro y el papel");
  }
  if (input.workColors[0]) why.push("los colores de tus obras");
  d.name = why.length ? "A partir de tu entrevista" : d.name;
  d.rationale = `${why.length ? `Lo he diseñado a partir de ${why.join(", ")}.`.replace(/\bde el\b/g, "del") : "He partido del estilo que mejor encaja con tu trabajo."} Si lo quieres de otra manera, dímelo con tus palabras.`;
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
