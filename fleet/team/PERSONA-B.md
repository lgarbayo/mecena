# Persona B — "Del dossier al dinero" + tracción

> Nombre: **[rellenar]** · Contraparte: [PERSONA-A.md](PERSONA-A.md) (A integra y fusiona `main`)
> Fuente de verdad del producto: [`fleet/IDEA.md`](../IDEA.md) · Spec y paquetes: `fleet/SPEC.md`, `fleet/workpackages/`
> Fin del build: **sábado 14/11, 19:00**. `main` se congela a las **18:00**.

## Tu misión en una frase
Que, con el perfil y el dossier que crea A, el usuario vea **convocatorias reales que encajan**, pague con **RevenueCat** y reciba una **solicitud escrita con sus palabras** que el **tribunal simulado** puntúa y mejora en directo. Y llegar a la demo con **datos de la encuesta y LOIs**.

## 1. Producto que te toca construir (con agentes builder)
| # | Bloque | Qué tiene que hacer | Hecho cuando… |
|---|---|---|---|
| B1 | **Dataset de convocatorias reales** | ~25 convocatorias **vigentes y reales** (artistas + pymes, España/Galicia) con URL de las bases. La IA las estructura: requisitos, importe, plazos, beneficiarios (creador/pyme), documentos y **criterios de valoración con su peso** | 25 `Call` válidas contra el contrato, todas con fuente |
| B2 | **Ingesta de la BDNS (prueba)** | Comprobar qué permite infosubvenciones.es (API o descarga) para convocatorias de cultura y pymes. Caché local como plan B | Ingesta real o caché documentada. La demo no depende de la red |
| B3 | **"Ganadores parecidos a ti"** *(recortable)* | Concesiones pasadas de la BDNS como evidencia orientativa (rangos de importe y tipo de proyecto). **Nunca** un porcentaje falso | Se muestran 2–3 ejemplos reales en una convocatoria |
| B4 | **Matching** | Filtro duro (edad, residencia, tipo de beneficiario, plazos) + encaje semántico con la obra o actividad. Para cada una: **por qué encajas** y **qué te falta** | Perfil de demo → 4–6 convocatorias con explicación |
| B5 | **Feed de convocatorias + modo creador/pyme** | Tarjetas con importe, fecha límite, por qué encajas y qué falta. Bases explicadas en lenguaje claro + checklist de documentos. Cambio **creador ↔ pyme** de un toque | En la demo, el cambio a pyme muestra otras convocatorias al instante |
| B6 | **RevenueCat: compras y entitlements** | SDK web (`@revenuecat/purchases-js`, Web Billing **sandbox**) tras la interfaz `Purchases`, con versión simulada. Productos: **Pro mensual (~9 €)**, **Pro anual (~79 €)**, **"Solicitud premium" suelta (~15 €)**. Entitlement `pro`. Configurar el proyecto en el dashboard de RevenueCat | Compra sandbox real que desbloquea `pro` en la app |
| B7 | **Paywall con oferta Hormozi** | Salta en "Prepárame la solicitud" y en la 4.ª convocatoria. Textos: dossier gratis como gancho, "Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero", ancla "una consultora se lleva un 10–15 % de tu beca" | Paywall bonita en el móvil, con los 3 productos |
| B8 | **Generador de la solicitud** | Memoria, statement o texto de empresa, **presupuesto con partidas admitidas por las bases** y checklist. Escrita **a partir de las palabras del usuario** (transcripción de voz de A), nunca genérica | Borrador citable con frases del usuario |
| B9 | **Tribunal simulado** | Varios jueces IA puntúan con los **criterios y pesos oficiales** de la convocatoria y dan comentarios por criterio. El usuario aplica las mejoras y se vuelve a puntuar | Demo: ~61 → ~84 tras aplicar las mejoras |
| B10 | **Justificación** *(recortable, solo si sobra)* | Foto de factura → lectura automática → partida del presupuesto, aviso de desvíos, memoria final | Una factura asignada en la demo |
| B11 | **Tools de dominio para el MCP** | Implementar `search_calls`, `explain_call`, `draft_application`, `score_application` en el módulo de tools compartido. A las expone en el servidor MCP | Tests de las tools en verde |

## 2. Reglas de integración
- **No fusionas en `main`**: cada WP termina en su rama `wp/<id>` y abre PR. A fusiona; tú revisas las PR de A.
- Si necesitas cambiar un contrato (`Call`, `Application`, `JuryScore`, `Entitlement`, tools), pídelo en la PR o por chat y lo aplica A.
- Cada 2–3 h fusiona `main` en tus ramas abiertas.
- Claves solo en `.env` (nunca en commits): `NEXT_PUBLIC_REVENUECAT_API_KEY`, `ANTHROPIC_API_KEY`.

## 3. No-código que te toca (tracción)
| # | Tarea | Cuándo |
|---|---|---|
| B12 | **Encuesta de 6 preguntas** (Tally o Google Forms) a artistas y creadores; difusión por X y LinkedIn con los textos preparados | Viernes por la noche |
| B13 | **Contactos concretos**: usa `fleet/outreach/CONTACTS.md` (lo está generando el hilo de outreach) y escribe primero a la prioridad A | Viernes por la noche (artistas) y sábado por la mañana (instituciones) |
| B14 | **LOIs** no vinculantes de escuelas de arte, asociaciones, academias, gestorías y asociaciones de autónomos, con la plantilla de una página. Un "sí, nos interesa" por mensaje también cuenta (captura con permiso) | Objetivo: 2–3 firmadas antes de las 18:00 del sábado |
| B15 | **Análisis de competencia** con la skill `competitive-teardown` (Arte Informado y agregadores de convocatorias, consultoras de subvenciones). Sacar 1 diapositiva con "en qué somos distintos" | Sábado, 1 h |
| B16 | **Números para el cierre de la demo**: % que perdió una convocatoria por enterarse tarde, horas por solicitud, % que pagaría y nº de LOIs. Pásaselos a A antes de las 15:00 | Sábado 15:00 |

## 4. QA final (con A)
- 16:00–18:00: recorrido completo de la demo con `hk-qa`. Tú te encargas de que la paywall y la compra sandbox funcionen **en el móvil real**.
- Ten preparada una cuenta sandbox y una compra ya hecha por si falla la red.

## 5. Cómo trabajar con la flota
1. `git clone https://github.com/lgarbayo/mecena && fleet install mecena --hackathon 1hack-2026`.
2. Para cada WP tuyo: marca `status: building` en el frontmatter, haz commit y push, y lanza un hilo builder en su worktree `wp/<id>`.
3. Cada WP termina en una PR a `main`; A la revisa y la fusiona.

## 6. Orden de recorte si vais justos
B10 (justificación) → B3 (ganadores parecidos) → B2 se queda solo con la caché → B9 con un único juez. **Nunca se recortan** B1, B5, B6, B7 ni B8.

## 7. Tabla WP → bloque *(rellenar cuando el arquitecto entregue los WPs)*
| WP | Título | Bloques | Estado |
|---|---|---|---|
| | | | |

## Anexo: encuesta y LOI
**Encuesta (6 preguntas):**
1. ¿A qué te dedicas? (artes visuales / ilustración / fotografía / música / escénicas / otro / pyme o autónomo)
2. ¿A cuántas convocatorias, becas o premios te presentaste el último año? (0 / 1–2 / 3–5 / más de 5)
3. ¿Te has enterado alguna vez de una convocatoria cuando ya había cerrado? (sí, varias / alguna / nunca)
4. ¿Cuántas horas te lleva preparar una solicitud con dossier, memoria y presupuesto? (<2 / 2–5 / 5–10 / más de 10)
5. ¿Tienes tu dossier o portfolio actualizado? (sí / más o menos / no)
6. ¿Pagarías por una app que te avise de las convocatorias que encajan contigo y te prepare la solicitud? (no / solicitud suelta ~15 € / suscripción ~9 €/mes) + email opcional para probarla

**LOI (no vinculante):**
> [Organización], con sede en [ciudad], representada por [nombre y cargo], manifiesta su interés en participar en un piloto de **Mecena**, una herramienta de IA para que [artistas/alumnado/socios] encuentren convocatorias y preparen su dossier y sus solicitudes. Contemplamos probarla con aproximadamente [N] personas cuando esté disponible, y valoraríamos una licencia para la organización si el piloto resulta útil. Esta carta no supone ningún compromiso económico ni contractual. [Fecha] — [Firma]
