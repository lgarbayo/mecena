/**
 * Deterministic onboarding extraction (no AI). Used in tests, offline demo mode and as the per-turn
 * fallback when Claude fails. Spanish keyword rules: names after "me llamo/soy", cities, disciplines of every art
 * (visual arts, music, stage, film, literature, design, crafts),
 * years, "quiero…" -> fundingNeeds/projectIdea, business figures. Sentences keep the user's own words
 * (only unambiguous typos are fixed, see wording.ts) and are routed to the dossier section keys of the profile kind.
 */
import type { DossierSection, OnboardingTurnInput, OnboardingTurnResult, Profile, ProfileKind, ProfilePatch } from "@/contracts";
import { extractTerritories, territoryAncestors, territoryNode } from "@/features/normalize";
import { fixWording, polishProse } from "@/server/ai/wording";
import { familyInterview, sectionTitles } from "./copy";
import { onboardingFamily } from "./family";
import { dossierLookQuestion, isDossierLookSentence } from "./interview";

// ---------- text helpers ----------
/** Lowercase, strip accents (keeps ñ distinct as "n" is fine for matching). */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

const titleCase = (s: string) =>
  s
    .split(/\s+/)
    .map((w, i) => (i > 0 && /^(de|del|da|do|dos|das|la|las|y|e)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const stripEnd = (s: string) => s.replace(/[\s,.;:!?…]+$/, "").trim();

// ---------- dictionaries ----------
interface Place {
  city: string;
  province: string;
  region: string;
  aliases: string[]; // normalised
}
const G = "Galicia";
const PLACES: Place[] = [
  { city: "A Coruña", province: "A Coruña", region: G, aliases: ["a coruna", "la coruna", "coruna"] },
  { city: "Santiago de Compostela", province: "A Coruña", region: G, aliases: ["santiago de compostela", "santiago"] },
  { city: "Ferrol", province: "A Coruña", region: G, aliases: ["ferrol"] },
  { city: "Betanzos", province: "A Coruña", region: G, aliases: ["betanzos"] },
  { city: "Carballo", province: "A Coruña", region: G, aliases: ["carballo"] },
  { city: "Oleiros", province: "A Coruña", region: G, aliases: ["oleiros"] },
  { city: "Arteixo", province: "A Coruña", region: G, aliases: ["arteixo"] },
  { city: "Malpica", province: "A Coruña", region: G, aliases: ["malpica"] },
  { city: "Vigo", province: "Pontevedra", region: G, aliases: ["vigo"] },
  { city: "Pontevedra", province: "Pontevedra", region: G, aliases: ["pontevedra"] },
  { city: "Vilagarcía de Arousa", province: "Pontevedra", region: G, aliases: ["vilagarcia de arousa", "vilagarcia"] },
  { city: "Cangas", province: "Pontevedra", region: G, aliases: ["cangas"] },
  { city: "Lugo", province: "Lugo", region: G, aliases: ["lugo"] },
  { city: "Monforte de Lemos", province: "Lugo", region: G, aliases: ["monforte de lemos", "monforte"] },
  { city: "Viveiro", province: "Lugo", region: G, aliases: ["viveiro"] },
  { city: "Ourense", province: "Ourense", region: G, aliases: ["ourense", "orense"] },
  { city: "Madrid", province: "Madrid", region: "Comunidad de Madrid", aliases: ["madrid"] },
  { city: "Barcelona", province: "Barcelona", region: "Cataluña", aliases: ["barcelona"] },
  { city: "Valencia", province: "Valencia", region: "Comunidad Valenciana", aliases: ["valencia"] },
  { city: "Sevilla", province: "Sevilla", region: "Andalucía", aliases: ["sevilla"] },
  { city: "Málaga", province: "Málaga", region: "Andalucía", aliases: ["malaga"] },
  { city: "Granada", province: "Granada", region: "Andalucía", aliases: ["granada"] },
  { city: "Córdoba", province: "Córdoba", region: "Andalucía", aliases: ["cordoba"] },
  { city: "Cádiz", province: "Cádiz", region: "Andalucía", aliases: ["cadiz"] },
  { city: "Bilbao", province: "Bizkaia", region: "País Vasco", aliases: ["bilbao"] },
  { city: "San Sebastián", province: "Gipuzkoa", region: "País Vasco", aliases: ["san sebastian", "donostia"] },
  { city: "Vitoria", province: "Álava", region: "País Vasco", aliases: ["vitoria", "gasteiz"] },
  { city: "Zaragoza", province: "Zaragoza", region: "Aragón", aliases: ["zaragoza"] },
  { city: "Valladolid", province: "Valladolid", region: "Castilla y León", aliases: ["valladolid"] },
  { city: "Salamanca", province: "Salamanca", region: "Castilla y León", aliases: ["salamanca"] },
  { city: "León", province: "León", region: "Castilla y León", aliases: ["leon"] },
  { city: "Burgos", province: "Burgos", region: "Castilla y León", aliases: ["burgos"] },
  { city: "Oviedo", province: "Asturias", region: "Asturias", aliases: ["oviedo"] },
  { city: "Gijón", province: "Asturias", region: "Asturias", aliases: ["gijon", "xixon"] },
  { city: "Santander", province: "Cantabria", region: "Cantabria", aliases: ["santander"] },
  { city: "Pamplona", province: "Navarra", region: "Navarra", aliases: ["pamplona", "iruna"] },
  { city: "Logroño", province: "La Rioja", region: "La Rioja", aliases: ["logrono"] },
  { city: "Murcia", province: "Murcia", region: "Región de Murcia", aliases: ["murcia"] },
  { city: "Alicante", province: "Alicante", region: "Comunidad Valenciana", aliases: ["alicante"] },
  { city: "Palma", province: "Illes Balears", region: "Illes Balears", aliases: ["palma de mallorca", "palma"] },
  { city: "Las Palmas de Gran Canaria", province: "Las Palmas", region: "Canarias", aliases: ["las palmas"] },
  { city: "Santa Cruz de Tenerife", province: "Santa Cruz de Tenerife", region: "Canarias", aliases: ["santa cruz de tenerife", "tenerife"] },
  { city: "Toledo", province: "Toledo", region: "Castilla-La Mancha", aliases: ["toledo"] },
  { city: "Cáceres", province: "Cáceres", region: "Extremadura", aliases: ["caceres"] },
  { city: "Badajoz", province: "Badajoz", region: "Extremadura", aliases: ["badajoz"] },
];
const ALIASES = PLACES.flatMap((p) => p.aliases.map((a) => ({ a, p }))).sort((x, y) => y.a.length - x.a.length);

const DISCIPLINES: [RegExp, string][] = [
  [/\bilustr(ador|adora|adoras|adores|acion|aciones|o)\b/, "ilustración"],
  [/\b(pintor|pintora|pintura|pinturas|pinto)\b/, "pintura"],
  [/\b(fotograf[oa]|fotografia|fotografias)\b/, "fotografía"],
  [/\b(escultor|escultora|escultura|esculturas)\b/, "escultura"],
  [/\b(grabador|grabadora|grabado|grabados)\b/, "grabado"],
  [/\b(ceramista|ceramica)\b/, "cerámica"],
  [
    /\b(music[oa]s?|musica|compositor|compositora|compongo|cantante|cantautor|cantautora|guitarrista|guitarra|pianista|piano|violinista|violin|violonchelista|chelista|baterista|bajista|saxofonista|trompetista|gaiteir[oa]|gaiter[oa]|dj|raper[oa]|toco (?:el|la|en)|mi banda|mi grupo|canciones)\b/,
    "música",
  ],
  [/\b(bailarin|bailarina|bailarines|bailarinas|bailo|danza|coreograf[oa])\b/, "danza"],
  [/\b(actor|actriz|teatro|dramaturg[oa]|dramaturgia|titiriter[oa]|titeres|marionetas)\b/, "teatro"],
  [/\b(circo|circense|clown|payas[oa]|malabarista|malabares|acrobata|acrobacias?|trapecista)\b/, "circo"],
  [/\b(escritor|escritora|escribo|literatura)\b/, "literatura"],
  [/\b(poeta|poesia|poemas|poemario)\b/, "poesía"],
  [/\b(novelista|novela|novelas|relatos|cuentos)\b/, "narrativa"],
  [/\b(comic|comics|historietista|novela grafica)\b/, "cómic"],
  [/\b(fanzine|fanzines|fotolibro|fotolibros|autoedicion|libro de artista)\b/, "edición"],
  [/\b(animacion|animador|animadora)\b/, "animación"],
  [/\b(muralista|muralismo|murales|arte urbano|grafiti)\b/, "arte urbano"],
  [/\b(cine|cineasta|cortometraje|cortometrajes|largometraje|pelicula|peliculas|realizador|realizadora)\b/, "cine"],
  [/\b(documental|documentales|documentalista)\b/, "documental"],
  [/\b(videoarte|videoartista|audiovisual)\b/, "audiovisual"],
  [/\b(instalacion|instalaciones)\b/, "instalación"],
  [/\bperformance\b/, "performance"],
  [/\b(disenador|disenadora|diseno grafico)\b/, "diseño gráfico"],
  [/\b(joyer[oa]|joyeria|orfebre)\b/, "joyería"],
  [/\b(textil|bordado|bordados)\b/, "arte textil"],
];

const SECTORS: [RegExp, string][] = [
  [/\b(ceramica|alfareria|ceramista|artesania|artesan[oa]s?|taller artesanal|orfebreria|joyeria|vidrio|cesteria|marroquineria)\b/, "artesanía / cerámica"],
  [/\b(restaurante|hosteleria|bar|cafeteria|taberna|meson|gastrobar|catering|pizzeria|asador|cerveceria)\b/, "hostelería"],
  [/\b(software|aplicacion|app|desarrollo web|programacion|informatica|tecnologia|saas|inteligencia artificial|ciberseguridad|videojuegos)\b/, "tecnología"],
  [/\b(conserva|conservas|pesca|marisco|mariscadora|acuicultura)\b/, "pesca y conservas"],
  [/\b(vino|vinos|bodega|vinedo|queso|quesos|agricola|agricultura|ganaderia|granja|panaderia|pasteleria|obrador|reposteria|miel|aceite|alimentacion|agroalimentari\w*)\b/, "agroalimentario"],
  [/\b(casa rural|hotel|turismo|albergue|hostal|pension|camping|apartamentos? turistic\w*)\b/, "turismo"],
  [/\b(carpinteria|muebles|ebanisteria|madera|tapiceria)\b/, "carpintería / mueble"],
  [/\b(moda|ropa|confeccion|costura|sastreria|calzado|textil)\b/, "moda / textil"],
  [/\b(editorial|libreria|libros|edicion|imprenta|revistas)\b/, "editorial / libros"],
  [/\b(productora|audiovisual|cine|cortometrajes|largometrajes|rodaje|postproduccion|estudio de grabacion|discografica)\b/, "audiovisual / cine"],
  [/\b(arquitectura|arquitect[oa]s?|ingenieria|urbanismo|interiorismo)\b/, "arquitectura e ingeniería"],
  [/\b(consultoria|asesoria|gestoria|auditoria|abogad\w*|juridic\w*|contabilidad)\b/, "consultoría"],
  [/\b(academia|formacion|ensenanza|escuela|centro educativo)\b/, "educación / formación"],
  [/\b(clinica|fisioterapia|dental|odontologia|psicologia|nutricion|optica|farmacia|veterinaria|gimnasio)\b/, "salud y bienestar"],
  [/\b(peluqueria|estetica|barberia|salon de belleza|cosmetica|spa)\b/, "estética"],
  [/\b(tienda(?!\s+online|\s+virtual|\s+web)|comercio|minorista|retail|boutique|floristeria|ferreteria|papeleria|supermercado)\b/, "comercio"],
  [/\b(reformas|construccion|albanileria|fontaneria|electricidad|instalaciones|climatizacion|rehabilitacion)\b/, "construcción"],
  [/\b(transporte|logistica|reparto|mensajeria|mudanzas|distribucion)\b/, "transporte y logística"],
  [/\b(diseno|estudio creativo|agencia|publicidad|branding|comunicacion|estudio fotografico)\b/, "diseño y comunicación"],
];

const LANGUAGES: [RegExp, string][] = [
  [/\bgallego\b/, "gallego"],
  [/\b(castellano|espanol)\b/, "castellano"],
  [/\bingles\b/, "inglés"],
  [/\bfrances\b/, "francés"],
  [/\bportugues\b/, "portugués"],
  [/\bitaliano\b/, "italiano"],
  [/\baleman\b/, "alemán"],
  [/\bcatalan\b/, "catalán"],
  [/\beuskera\b/, "euskera"],
];

const NUMBER_WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20 };

const WANT = /\b(quiero|queria|quisiera|me gustaria|necesito|busco|queremos|necesitamos|buscamos|nos gustaria|mi idea es|el proyecto es)\b/;
const DIRECT_NEED =
  /^(?:pues |bueno |ahora )?(?:una? |el |la |unos |unas )?(?:beca|ayuda|ayudas|subvencion|financiacion|residencia|dinero|apoyo|premio|comprar|contratar|abrir|lanzar|producir|editar|publicar|exponer|rodar|grabar|financiar|digitalizar|internacionalizar|ampliar|reformar|montar|tienda online|una web|maquinaria|equipo)\b/;
const DIRECT_IDEA =
  /\b(estoy con|estamos con|trabajando en|trabajo en una?|acabo de|preparo|preparando|estoy desarrollando|desarrollando|una serie|un proyecto|una instalacion|un fotolibro|un libro|un disco|un fanzine|una pelicula|un corto|un documental|una obra|un espectaculo)\b/;
const ACHIEVEMENT = /\b(expuse|he expuesto|expuesto|exposicion|exposiciones|expongo|premio|premios|premiad[oa]|finalista|seleccionad[oa]|residencia|residencias|publique|he publicado|publicado|gane|ganamos|ganador|ganadora|mencion|festival|bienal|feria|ferias|carta artesana|clientes|colaboramos|colabore|encargo|encargos|pedidos|concierto|conciertos|he tocado|hemos tocado|toque en|tocamos en|actuado|actuamos|actue|estrene|estrenamos|estreno|estrenado|estrenada|gira|giras|girado|editorial|sello|proyectado|proyectada|seleccion oficial|accesit|grabamos|grabe|he grabado|hemos grabado)\b/;
const EDUCATION = /\b(estudie|estudio bellas|grado en|graduad[oa]|licenciad[oa]|master|doctorad[oa]|bellas artes|escuela de arte|me forme|formacion en|conservatorio|escuela de musica|arte dramatico|esad|resad|escuela de cine|escuela de circo|escuela de danza|filologia|taller de escritura)\b/;
const STATEMENT = /\b(porque|me interesa|me interesan|mi obra|mi trabajo|trabajo con|trabajo sobre|hablo de|exploro|investigo|retrato|pinto|dibujo|fotografio|me inspira|me inspiran|quiero que|compongo|escribo sobre|mis canciones|mis poemas|mis piezas|hablan de|cuento historias|(?:piezas|canciones|poemas|obras|peliculas|libros) sobre)\b/;
const IDENTITY = /\b(me llamo|soy|naci|vivo|tengo \d+ anos|desde hace)\b/;
const WORKS = /\b(acuarela|acuarelas|oleo|oleos|tinta|lienzo|lienzos|cuadro|cuadros|pieza|piezas|obra|obras|serigrafia|dibujos|cancion|canciones|disco|discos|album|ep|single|temas|repertorio|espectaculo|espectaculos|montaje|montajes|funcion|funciones|coreografia|coreografias|pelicula|peliculas|corto|cortos|cortometraje|cortometrajes|largometraje|libro|libros|poemario|poemarios|novela|novelas)\b/;
const SERIES = /\b(serie|series|proyecto|proyectos|coleccion|fanzine|libro ilustrado|gira|residencia de creacion)\b/;
const CONTACT = /(@[a-z0-9_.]{2,}|https?:\/\/|www\.|\.com\b|\.es\b|\.gal\b|telefono|correo|email|instagram)/;
const FIGURES = /\b(factur\w*|euros|ventas|vendemos|ingresos|beneficio|presupuesto)\b|€/;
const TEAM = /\b(somos \w+ personas?|empleados?|empleadas?|trabajadores|trabajadoras|equipo|socios?|socias?|contratar|plantilla|trabajo sol[oa])\b/;
const PROJECTS = /\b(proyecto|proyectos|clientes?|pedidos|colaboramos|encargos|tienda online|exportar|digitalizar)\b/;
const LOCATION_HINT = /\b(vivo en|estamos en|esta en|tenemos (el|un) (taller|local)|nuestro taller|el local|nave|poligono)\b/;

// ---------- profile extraction ----------
function findPlace(n: string): { place: Place; index: number } | undefined {
  for (const { a, p } of ALIASES) {
    const m = new RegExp(`(^|[^a-z])${a.replace(/ /g, "\\s+")}($|[^a-z])`).exec(n);
    if (m) return { place: p, index: m.index };
  }
  return undefined;
}

/**
 * Any Spanish province or comunidad autónoma the short list above misses ("Teruel", "Soria", "Navarra"), read from the
 * national territory taxonomy. Municipalities are skipped: too many of them are also ordinary words ("Barro").
 */
function findRegion(text: string): { province?: string; region: string } | undefined {
  for (const id of extractTerritories(text)) {
    const node = territoryNode(id);
    if (!node || (node.level !== "province" && node.level !== "ccaa")) continue;
    const chain = territoryAncestors(id).map((a) => territoryNode(a));
    const ccaa = chain.find((x) => x?.level === "ccaa");
    if (!ccaa) continue;
    return node.level === "province" ? { province: node.name, region: ccaa.name } : { region: ccaa.name };
  }
  return undefined;
}

/** Words that open a sentence about something else, never a name ("Vivo en…", "Una beca…", "Hago cerámica"). */
const NOT_A_NAME = /^(hola|buenas|soy|me|mi|mis|nuestr\w*|somos|estoy|estamos|vivo|trabajo|trabajamos|hago|hacemos|pinto|escribo|toco|dirijo|tengo|tenemos|busco|buscamos|necesito|necesitamos|quiero|queremos|desde|en|de|un|una|unos|unas|el|la|los|las|no|si|sí|ahora|pues|bueno|autonom\w*|sociedad|empresa|negocio|estudio|taller|tienda|beca|ayuda|premio|proyecto|serie|llevo|llevamos|nos|con|para|por|sobre)$/i;

/** Answer to "¿Cómo te llamas…?" with just the name: "LUCHO DIAZ", "Lucho Díaz, desde Cáceres", "Taller Barro Vivo". */
function bareName(text: string): string | undefined {
  const head = stripEnd(text.split(/[,.;:!?\n]| y | desde | de (?=[A-ZÁÉÍÓÚÑ])| en (?=[A-ZÁÉÍÓÚÑ])/)[0] ?? "");
  const words = head.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return undefined;
  if (NOT_A_NAME.test(words[0]) && !/^(taller|estudio|tienda)$/i.test(words[0])) return undefined;
  if (/^(taller|estudio|tienda)$/i.test(words[0]) && words.length < 2) return undefined;
  if (/\d|€|\b(euros?|años|personas?|emplead\w*)\b/i.test(head)) return undefined;
  // Every word looks like a name word (letters only) and the first one is capitalised as typed or spoken.
  if (!words.every((w) => /^[A-Za-zÁÉÍÓÚÑÜáéíóúñü'-]+$/.test(w))) return undefined;
  if (!/^[A-ZÁÉÍÓÚÑ]/.test(words[0])) return undefined;
  const allCaps = head === head.toUpperCase();
  return titleCase(allCaps ? head.toLowerCase() : head);
}

function extractName(text: string, kind: ProfileKind): string | undefined {
  const stop = "(?=,|\\.|;|:|!|\\?| y | e | soy | tengo | vivo | trabajo | desde | de profesi| en |$)";
  const patterns =
    kind === "creator"
      ? [new RegExp(`\\bme llamo ([^,.;]{2,60}?)${stop}`, "i"), new RegExp(`\\bmi nombre (?:art[ií]stico )?es ([^,.;]{2,60}?)${stop}`, "i")]
      : [
          new RegExp(`\\b(?:mi|nuestra|nuestro) (?:empresa|negocio|taller|tienda|estudio|marca|cooperativa|asociaci[oó]n) se llama ([^,.;]{2,60}?)${stop}`, "i"),
          new RegExp(`\\bnos llamamos ([^,.;]{2,60}?)${stop}`, "i"),
          new RegExp(`\\bme llamo ([^,.;]{2,60}?)${stop}`, "i"),
        ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const words = stripEnd(m[1]).replace(/^["“«']|["”»']$/g, "").split(/\s+/).slice(0, 4);
      if (words.length) return titleCase(words.join(" "));
    }
  }
  // "Soy Antía Varela": only when the words are capitalised (speech engines capitalise proper names).
  const soy = /\bsoy ((?:[A-ZÁÉÍÓÚÑ][\wáéíóúñü'-]+)(?:\s+(?:de |da |del )?[A-ZÁÉÍÓÚÑ][\wáéíóúñü'-]+){0,3})/.exec(text);
  if (soy && !findPlace(norm(soy[1]))) return soy[1];
  return undefined;
}

function wordNumber(s: string): number | undefined {
  if (/^\d+$/.test(s)) return Number(s);
  return NUMBER_WORDS[norm(s)];
}

function parseEuros(n: string): number | undefined {
  const m = /(\d{1,3}(?:[.\s]\d{3})+|\d+(?:,\d+)?)\s*(mil|k)?\s*(?:euros|eur|€)/.exec(n);
  if (!m) return undefined;
  let v = Number(m[1].replace(/[.\s]/g, "").replace(",", "."));
  if (m[2]) v *= 1000;
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

function clauseAfter(re: RegExp, sentence: string): string | undefined {
  const n = norm(sentence);
  const m = re.exec(n);
  if (!m) return undefined;
  const after = sentence.slice(m.index + m[0].length).trim();
  return after.length > 3 ? stripEnd(after) : undefined;
}

export function extractProfilePatch(rawText: string, kind: ProfileKind, current: Profile): ProfilePatch {
  const patch: ProfilePatch = {};
  // How they imagine their dossier is for the design agent (it reads the transcript), not for the profile.
  const text = splitSentences(rawText)
    .filter((s) => !isDossierLookSentence(s))
    .join(" ");
  const n = norm(text);
  const sentences = splitSentences(text);

  const name = extractName(text, kind) ?? (!current.displayName ? bareName(text) : undefined);
  if (name && !findPlace(norm(name)) && !findRegion(name)) patch.displayName = name;

  // City: first mention fills an empty profile; an explicit move/location statement can override it.
  const explicitCity =
    /\b(vivo en|me mude a|me he mudado a|estamos en|tenemos (?:el|la|un|una) (?:taller|tienda|local|estudio|oficina|sede|empresa|negocio) en|nuestra sede esta en|trabajamos en|trabajamos desde|ubicados en|no,? soy de|en realidad soy de|soy de)\b|^en\s+/.exec(
      n,
    );
  const hit = explicitCity ? findPlace(n.slice(explicitCity.index)) : findPlace(n);
  if (hit && (!current.city || explicitCity)) {
    patch.city = hit.place.city;
    patch.province = hit.place.province;
    patch.region = hit.place.region;
  } else if (!hit && (!current.region || explicitCity)) {
    const r = findRegion(text);
    if (r) {
      if (r.province) patch.province = r.province;
      patch.region = r.region;
      if (r.province && (!current.city || explicitCity)) patch.city = r.province;
    }
  }

  const birth = /\bnaci (?:en [a-z ]+? )?(?:en |el (?:ano )?)?(19[4-9]\d|200\d)\b/.exec(n);
  if (birth && kind === "creator") patch.birthYear = Number(birth[1]);

  if (kind === "creator") {
    // Venues ("Teatro Pradillo", "Sala Capitol") are places, not the creator's art.
    const noVenues = norm(text.replace(/\b(?:Teatro|Sala|Auditorio|Cine|Festival)(?:\s+(?:de |del |da |do )?[A-ZÁÉÍÓÚÑ][\wáéíóúñü'-]*)+/g, " "));
    const ds = DISCIPLINES.filter(([re]) => re.test(noVenues)).map(([, d]) => d);
    if (ds.length) patch.disciplines = ds;
  } else {
    // Sector: first mention fills it; later mentions override when describing the company's own identity (not client lists).
    const ownActivity = /\b(somos|tenemos|nos dedicamos|me dedico|mi empresa|nuestra empresa|mi negocio|nuestro negocio|mi taller|nuestro taller)\b/.test(n);
    const sector = SECTORS.find(([re]) => re.test(n));
    if (sector && (!current.sector || ownActivity)) patch.sector = sector[1];
    const founded = /\b(?:desde|fundad[oa] en|abrimos en|abri en|empece en|empezamos en|en marcha desde)(?: el(?: ano)?)? (19[5-9]\d|20[0-3]\d)\b/.exec(n);
    const ago = /\b(?:llevamos|llevo|hace) (\d+|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte) anos\b/.exec(n);
    const bareYear = /^(?:en |desde )?(?:el )?(19[5-9]\d|20[0-3]\d)\b/.exec(n.trim());
    if (founded) patch.foundedYear = Number(founded[1]);
    else if (bareYear) patch.foundedYear = Number(bareYear[1]); // answer to "¿Desde qué año…?"
    else if (ago) {
      const k = wordNumber(ago[1]);
      if (k !== undefined) patch.foundedYear = new Date().getFullYear() - k;
    }
    const team = /\b(?:somos|tengo|tenemos|hay) (\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte) (?:personas?|trabajador\w*|emplead\w*)/.exec(n);
    if (team) {
      const k = wordNumber(team[1]);
      // "tengo dos empleados" = me + 2 employees; "somos dos personas" = 2 in total.
      if (k !== undefined) patch.employees = /^(tengo|tenemos|hay)/.test(team[0]) && /emplead|trabajador/.test(team[0]) ? k + 1 : k;
    } else if (/\btrabajo sol[oa]\b|\bsolo yo\b/.test(n)) patch.employees = 1;
    else {
      // Bare answer to "¿Cuántas personas trabajáis?": "somos tres", "tres", "5 contándome".
      const bare = /^(?:somos )?(\d+|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte)(?: (?:personas?|en total|contandome|conmigo))?[.!]?$/.exec(n.trim());
      const k = bare && (current.legalForm || current.city || patch.city) ? wordNumber(bare[1]) : undefined;
      if (k !== undefined && k > 0 && k < 500) patch.employees = k;
    }
    if (
      FIGURES.test(n) &&
      (/factur|ingres|ventas|vendemos|al ano|anual/.test(n) || (!WANT.test(n) && /^(?:unos |aproximadamente |sobre |cerca de |alrededor de |mas o menos )?\d/.test(n.trim())))
    ) {
      const eur = parseEuros(n);
      if (eur) patch.annualRevenueEur = eur;
    }
    if (/\bautonom[oa]\b/.test(n)) patch.legalForm = "autonomo";
    else if (/\b(sociedad limitada|s\.? ?l\.?)\b/.test(n)) patch.legalForm = "sl";
    else if (/\b(sociedad anonima|s\.? ?a\.?)(?=\s|$|[.,])/.test(n)) patch.legalForm = "sa";
    else if (/\b(comunidad de bienes|sociedad civil)\b/.test(n)) patch.legalForm = "otra";
    else if (/\bcooperativa\b/.test(n)) patch.legalForm = "cooperativa";
    else if (/\basociacion\b/.test(n)) patch.legalForm = "asociacion";
  }

  const achievements: string[] = [];
  const education: string[] = [];
  const needs: string[] = [];
  let idea: string | undefined;
  for (const s of sentences) {
    const sn = norm(s);
    // Direct answer to "¿Qué buscas ahora?": "Una beca para producir la serie", "Comprar un horno nuevo".
    if (!WANT.test(sn) && DIRECT_NEED.test(sn)) {
      needs.push(fixWording(stripEnd(s)));
      idea ??= polishProse(stripEnd(s));
      continue;
    }
    // Direct answer to "Háblanos de un proyecto": "Estoy con una serie sobre la despoblación".
    if (!WANT.test(sn) && DIRECT_IDEA.test(sn)) {
      idea ??= polishProse(stripEnd(s));
    }
    if (WANT.test(sn)) {
      const clause = clauseAfter(WANT, s);
      if (clause) {
        needs.push(fixWording(clause));
        idea ??= polishProse(stripEnd(s));
      }
      continue;
    }
    if (EDUCATION.test(sn)) {
      const at = sn.search(/\b(estudie|me forme)\b/);
      education.push(polishProse(stripEnd(at > 0 ? s.slice(at) : s)));
    } else if (ACHIEVEMENT.test(sn)) achievements.push(polishProse(stripEnd(s)));
  }
  if (achievements.length) patch.achievements = achievements;
  if (education.length) patch.education = education;
  if (needs.length) patch.fundingNeeds = needs;
  if (idea && (SERIES.test(norm(idea)) || !current.projectIdea)) patch.projectIdea = idea;

  if (/\b(hablo|idiomas|trabajo en|escribo en)\b/.test(n)) {
    const langs = LANGUAGES.filter(([re]) => re.test(n)).map(([, l]) => l);
    if (langs.length) patch.languages = langs;
  }
  const links = [...text.matchAll(/(https?:\/\/\S+|www\.\S+|@[A-Za-z0-9_.]{2,})/g)].map((m) => stripEnd(m[1]));
  if (links.length) patch.links = links;

  return patch;
}

// ---------- dossier sections ----------
type Classifier = (sn: string, s: string) => boolean;

const CREATOR_RULES: [string, Classifier][] = [
  ["contact", (sn) => CONTACT.test(sn)],
  ["cv", (sn) => !WANT.test(sn) && (ACHIEVEMENT.test(sn) || EDUCATION.test(sn))],
  ["series", (sn) => WANT.test(sn) || SERIES.test(sn)],
  ["statement", (sn) => STATEMENT.test(sn)],
  ["bio", (sn) => IDENTITY.test(sn) || DISCIPLINES.some(([re]) => re.test(sn)) || !!findPlace(sn)],
  ["works", (sn) => WORKS.test(sn)],
];

const BUSINESS_RULES: [string, Classifier][] = [
  ["contact", (sn) => CONTACT.test(sn)],
  ["figures", (sn) => FIGURES.test(sn)],
  ["team", (sn) => TEAM.test(sn)],
  ["projects", (sn) => WANT.test(sn) || PROJECTS.test(sn) || ACHIEVEMENT.test(sn)],
  ["location", (sn) => LOCATION_HINT.test(sn) || !!findPlace(sn)],
  ["activity", (sn) => SECTORS.some(([re]) => re.test(sn)) || /\b(nos dedicamos|me dedico|hacemos|fabricamos|vendemos|ofrecemos)\b/.test(sn)],
];

/** Which section keys a sentence feeds. Creators: the single best section; businesses: every matching one. */
export function classifySentence(sentence: string, kind: ProfileKind): string[] {
  const sn = norm(sentence);
  const rules = kind === "creator" ? CREATOR_RULES : BUSINESS_RULES;
  const hits = rules.filter(([, test]) => test(sn, sentence)).map(([k]) => k);
  if (kind === "creator") return [hits[0] ?? "statement"];
  return hits.length ? hits : ["activity"];
}

function appendParagraph(body: string, sentence: string): string {
  const clean = polishProse(sentence);
  if (norm(body).includes(norm(stripEnd(clean)))) return body;
  return body ? `${body}\n\n${clean}` : clean;
}

export function buildSectionUpdates(input: OnboardingTurnInput): DossierSection[] {
  const { kind, newSegment } = input;
  const titles = sectionTitles(kind);
  const current = new Map(input.sections.map((s) => [s.key, s]));
  const changed = new Map<string, DossierSection>();
  for (const sentence of splitSentences(newSegment.text)) {
    if (isDossierLookSentence(sentence)) continue; // stays in the transcript only
    for (const key of classifySentence(sentence, kind)) {
      const base = changed.get(key) ?? current.get(key as DossierSection["key"]);
      const body = appendParagraph(base?.body ?? "", sentence);
      if (base && body === base.body) continue;
      changed.set(key, {
        key: key as DossierSection["key"],
        title: base?.title || titles[key],
        body,
        sourceSegmentIds: [...new Set([...(base?.sourceSegmentIds ?? []), newSegment.id])],
        status: "draft",
        updatedAt: newSegment.at,
      });
    }
  }
  return [...changed.values()];
}

// ---------- follow-up ----------
type FollowUpProfile = Pick<Profile, "displayName" | "city" | "disciplines" | "projectIdea" | "fundingNeeds" | "achievements" | "education" | "sector" | "employees" | "annualRevenueEur"> &
  Partial<Pick<Profile, "legalForm" | "foundedYear">>;

/** Next question about what is still missing: in the words of the creator's art, or in eligibility order for a pyme. */
export function followUpFor(kind: ProfileKind, p: FollowUpProfile, opts: { hasWorks?: boolean } = {}): string {
  if (kind === "creator") {
    const q = familyInterview(onboardingFamily(p.disciplines));
    if (!p.displayName) return "¿Cómo te llamas y desde dónde trabajas?";
    if (!p.disciplines.length) return "¿Qué haces: artes visuales, música, teatro, danza, cine, escritura, diseño…?";
    if (!p.city) return "¿En qué ciudad vives y trabajas?";
    if (!p.projectIdea && !p.fundingNeeds.length) return q.project;
    if (!opts.hasWorks) return q.work;
    if (!p.achievements.length) return q.track;
    if (!p.education.length) return q.education;
    return "¿Qué te gustaría que un jurado supiera de ti que aún no me hayas contado?";
  }
  // Pyme: ask first for what decides which aid it can apply for (activity, place, legal form, size), then what to finance.
  if (!p.displayName) return p.sector ? "¿Cómo se llama tu negocio?" : "¿Cómo se llama tu negocio y a qué os dedicáis?";
  if (!p.sector) return "¿Qué vendéis o qué servicio dais?";
  if (!p.city) return "¿En qué municipio estáis?";
  if (!p.legalForm) return "¿Eres autónomo/a o tenéis una sociedad (S.L., cooperativa…)?";
  if (!p.employees) return "¿Cuántas personas trabajáis, contándote a ti?";
  if (!p.projectIdea && !p.fundingNeeds.length) return "¿Qué queréis financiar: maquinaria, digitalizar, contratar, exportar…?";
  if (!p.foundedYear) return "¿Desde qué año existe el negocio?";
  if (!p.annualRevenueEur) return "Si quieres, dime la facturación aproximada del último año.";
  return "¿Hay algo más que queráis hacer este año y para lo que necesitéis financiación?";
}

/** The full deterministic turn: profile patch + changed sections + one follow-up question. */
export function mockOnboardingTurn(input: OnboardingTurnInput): OnboardingTurnResult {
  const profilePatch = extractProfilePatch(input.newSegment.text, input.kind, input.profile);
  const sectionUpdates = buildSectionUpdates(input);
  const merged = {
    ...input.profile,
    ...profilePatch,
    disciplines: [...input.profile.disciplines, ...(profilePatch.disciplines ?? [])],
    fundingNeeds: [...input.profile.fundingNeeds, ...(profilePatch.fundingNeeds ?? [])],
    achievements: [...input.profile.achievements, ...(profilePatch.achievements ?? [])],
    education: [...input.profile.education, ...(profilePatch.education ?? [])],
  };
  const sectionKeys = new Set([...input.sections, ...sectionUpdates].map((s) => s.key));
  const followUpQuestion =
    dossierLookQuestion(input.kind, input.profile, merged, input.transcript) ??
    followUpFor(input.kind, merged, { hasWorks: sectionKeys.has("works") || sectionKeys.has("series") });
  return { profilePatch, sectionUpdates, followUpQuestion };
}
