# Persona A — "Del artista al dossier" + integración + demo

> Quién: **nosotros (Luis y equipo)** · Contraparte: [PERSONA-B.md](PERSONA-B.md)
> Fuente de verdad del producto: [`fleet/IDEA.md`](../IDEA.md) · Spec y paquetes: `fleet/SPEC.md`, `fleet/workpackages/` (los deja el arquitecto)
> Fin del build: **sábado 14/11, 19:00**. `main` se congela a las **18:00**.

## Tu misión en una frase
Que un artista hable 60 segundos, fotografíe su obra y **vea crecer su perfil y su dossier en directo** hasta descargar el PDF, y que todo eso esté en `main` funcionando en el móvil para la demo.

## 1. Producto que te toca construir (con agentes builder)
| # | Bloque | Qué tiene que hacer | Hecho cuando… |
|---|---|---|---|
| A1 | **Pantalla de arranque con datos** | Primera pantalla de la demo: 3 datos con fuente (≈50 % de artistas < SMI; 34 % de creativos son autónomos vs 16 %; > 50 % de pymes no piden ayudas por desconocimiento y 1 de cada 4 abandona). Sin cifras inventadas: ver IDEA.md | Se ve en el móvil, fuentes enlazadas |
| A2 | **Mensaje de confianza en el alta** | "El arte es tuyo; nosotros hacemos el papeleo". No generamos ni modificamos obra (solo recortar, enderezar y color). No entrenamos con tu obra. Tú tienes la última palabra en cada texto | Visible antes de grabar voz y subir fotos |
| A3 | **Alta por voz → perfil + dossier en vivo** (estrella) | Web Speech API (es-ES) con texto alternativo. La transcripción va a la IA, que rellena el **perfil estructurado** y construye el **dossier sección a sección**, visibles junto a la transcripción. Modo **creador** y modo **pyme** (`kind`) | 60 s de voz → perfil y dossier llenos, sin recargar |
| A4 | **Fotos de obras + fichas técnicas** | Cámara del móvil. Visión: recortar/enderezar (sin alterar la obra). La descripción por voz de cada pieza rellena la ficha (título, año, técnica, medidas, serie, concepto) | 3 fotos → 3 fichas correctas en el dossier |
| A5 | **Dossier: plantilla + PDF** | Plantilla editorial cuidada. Variante **creador** (statement, series, obras, CV) y variante **pyme** (actividad, equipo, proyectos, cifras, CNAE). Exportar a PDF fiable | PDF descargable en el móvil, se ve bien proyectado |
| A6 | **Variantes del dossier por convocatoria** | "Esta pide 10 imágenes y 5 MB; esta valora impacto social, pon esa serie primero". Usa los requisitos de la `Call` que deja B | Desde una convocatoria se genera su variante. Es Pro (lo bloquea la paywall de B) |
| A7 | **Tools compartidas + servidor MCP** | Un único módulo de tools usado por la app y por el servidor MCP (stdio): `get_profile`, `update_profile`, `build_dossier`, `export_dossier_pdf`, `search_calls`, `explain_call`, `draft_application`, `score_application`. Las de calls/draft/score las implementa B: tú expones y registras | El MCP arranca y lista las tools. Tests en verde |
| A8 | **Demo con Claude Desktop vía MCP** *(recortable)* | Config de Claude Desktop/Code apuntando al servidor. Guion: "hazme el dossier para la convocatoria X" | Funciona en tu portátil sin tocar código |
| A9 | **Datos de demo + reset + túnel al móvil** | Usuario de demo, botón o script de reset, README con cómo abrirlo en el móvil por HTTPS (túnel) | Reset en < 10 s; el móvil abre la app por URL |

## 2. Integración (eres el único que escribe `main`)
- Revisas y fusionas **todas** las PR (las tuyas y las de B) en `main`, de una en una, con tests en verde (`npm test`, y `npm run build` cada 2–3 merges).
- Los **cambios de contrato** (tipos de `Profile`, `Dossier`, `Call`, `Application`, `JuryScore`, `Entitlement`, tools) los aplicas tú cuando alguien los pida en su PR o por chat.
- Cada 2–3 h avisas a B de que fusione `main` en sus ramas abiertas.
- 18:00: congelas `main`. Después de esa hora solo entran arreglos de la demo.

## 3. No-código que te toca
| # | Tarea | Cuándo |
|---|---|---|
| A10 | **Guion de la demo** (≤ 3 min) siguiendo IDEA.md: datos → artista habla y fotografía → dossier y PDF → convocatorias + cambio a pyme → paywall → borrador → tribunal 61 → 84 → (MCP) → cierre con encuesta y LOIs | Sábado antes de las 13:00 |
| A11 | **Artista voluntario** para la demo (alguien de la sala o del equipo), con 2–3 obras físicas o en pantalla | Sábado por la mañana |
| A12 | **Pitch**: problema con datos reales, visión del CEO (artistas → creadores → autónomos y pymes), foso de datos (convocatorias + concesiones), **diapositiva del panel B2B** para escuelas y asociaciones, nicho de entrada (artistas visuales en Galicia) | Sábado 13:00–15:00 |
| A13 | **Ensayo** completo dos veces con el móvil real y el proyector | Sábado 17:00–18:30 |

## 4. QA final (con B)
- 16:00–18:00: `hk-qa` sobre `main` siguiendo el guion. Arregláis lo que rompa la demo.
- Plan B: vídeo grabado del recorrido completo por si falla la red o el micro.

## 5. Cómo trabajar con la flota
1. `git clone https://github.com/lgarbayo/mecena && fleet install mecena --hackathon 1hack-2026`.
2. Para cada WP tuyo: marca `status: building` en su frontmatter, haz commit y push (así B ve que está cogido) y lanza un hilo builder en su worktree `wp/<id>`.
3. Cada WP termina en una PR a `main`. B revisa las tuyas; tú fusionas.

## 6. Orden de recorte si vais justos
A8 (MCP en Claude Desktop) → A6 (variantes por convocatoria) → A4 se queda con 1 foto y ficha manual. **Nunca se recortan** A3, A5 ni A9.

## 7. Tabla WP → bloque *(rellenar cuando el arquitecto entregue los WPs)*
| WP | Título | Bloques | Estado |
|---|---|---|---|
| | | | |
