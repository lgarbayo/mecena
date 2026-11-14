# Mecena — Guion de la demo en directo (≤ 3:00)

> 1hack 2026 · FIC A Coruña · sábado 14/11, demos entre 19:00 y 21:00 · voluntaria, en directo, sin vídeo ni diapositivas obligatorias.
> Móvil duplicado en el proyector. Castellano de España (tú/vosotros).
> **Posicionamiento: Mecena es para artistas.** El modo pyme es la expansión: se cuenta en el cierre («mañana, cualquier pyme»), ya no ocupa un paso del guion.
> **Los 8 puntos de [`fleet/IDEA.md`](../IDEA.md) salen en directo**, porque el producto los hace de principio a fin: voz + fotos + dossier + PDF, MCP, feed de convocatorias, paywall + borrador, tribunal 61 → 84, «ganadores parecidos», justificación y panel B2B.
> Fuente de verdad: [`fleet/IDEA.md`](../IDEA.md). Textos de pantalla: [`COPY.md`](COPY.md). Comprobaciones: [`QA_CHECKLIST.md`](QA_CHECKLIST.md). **Toques exactos, planes B por botón de `/demo` y checklists: [`docs/demo-script.md`](../../docs/demo-script.md)** (este guion es la versión de escenario; si difieren, manda aquel).

## Reparto en el escenario
| Rol | Quién | Qué hace |
|---|---|---|
| **Presentador/a** | Persona A | Habla, marca el ritmo, mira el reloj |
| **Operador/a** | Persona B | Lleva el móvil (duplicado), toca los botones, ejecuta los planes B |
| **Artista** | [Nombre del artista voluntario] | Contesta 5 preguntas (≈ 5 s cada una) al móvil y enseña 1 obra |

Regla de oro: **el presentador nunca toca el móvil y el operador nunca habla**. Si algo tarda, el presentador rellena con la frase de la columna «Si tarda».

**Dispositivos:** móvil de escenario (cuenta de escenario; pestañas `/` y `/demo`) · **segundo navegador o móvil con la cuenta de reserva**, cargada con «Artista Pro con solicitud» y con `/justificacion/<id>` y `/panel` abiertas (justificación y panel) · portátil con Claude Desktop (MCP). Una **copia impresa de la factura de ejemplo** (`/demo/factura-ejemplo.png`) para la foto en directo.

## Puntos de control del reloj
| Reloj | Debemos estar en… | Si vamos tarde |
|---|---|---|
| **0:40** | Entrevista terminada | > 0:50: saltar las fotos |
| **1:05** | PDF abierto | > 1:15: saltar «Ganadores parecidos a ti» |
| **1:42** | Compra pagada, borrador empezando | > 1:50 sin pagar: cuenta ya Pro |
| **2:07** | Tribunal en 84 | > 2:15: saltar el panel |
| **2:32** | Panel visto | > 2:40: MCP a una sola frase |
| **2:47** | Cierre | Cierre pase lo que pase |

Orden de recortes: scroll del dossier → «Ganadores parecidos» → segunda obra → panel → MCP a una frase.

---

## Versión completa (3:00)

| # | Tiempo | En pantalla | Se dice | Si tarda / plan B |
|---|---|---|---|---|
| 1 | **0:00–0:10** · Gancho | Pantalla de arranque A1: 3 datos con fuente | «Uno de cada dos artistas en España gana menos del salario mínimo, y más de la mitad de las pymes no pide ayudas por no conocerlas. Las ayudas existen. Falta quien haga el papeleo contigo.» | Si la app no carga: los datos están en la diapositiva 1 de [`PITCH.md`](PITCH.md) |
| 2 | **0:10–0:40** · Voz *(punto 1)* | «Empezar» → «Hablando»; el **perfil** se rellena y el **dossier** crece sección a sección mientras la artista contesta 5 preguntas cortas | «[Nombre], cuéntale a Mecena qué haces.» y **se calla**. Al salir los chips: «Fijaos: va rellenando el perfil mientras habla.» | Micro sin respuesta en 5 s: **Escribiendo** + pegar la transcripción. Presentador: «Con este eco, mejor con su texto.» IA lenta > 8 s: «IA simulada para esta cuenta» |
| 3 | **0:40–0:55** · Fotos *(punto 1)* | Cámara → una obra → dictar título, año, técnica, medidas → ficha técnica | «Solo endereza y recorta la foto. La obra no se toca, no entrenamos con ella y la última palabra es suya.» | Cámara falla: galería (fotos de la mañana) |
| 4 | **0:55–1:05** · Dossier y PDF *(punto 1)* | `/dossier` 5 s → **Descargar PDF** → se abre | «Un minuto hablando y una foto: declaración, biografía, serie y ficha. Y esto es un dossier en PDF, listo para enviar. Gratis.» | PDF no se genera: enseñar la página del dossier («es la misma maqueta») o el PDF ya descargado |
| 5 | **1:05–1:20** · Convocatorias y ganadores *(puntos 3 y 6)* | Tarjeta con importe, plazo, **Por qué encajas** / **Qué te falta** → abrir una → **Ganadores parecidos a ti** | «Convocatorias reales y abiertas, con la fuente: no solo te dice que encajas, te dice por qué y qué te falta. Y quién ha ganado antes algo parecido, con importes reales: orientativo, nunca una probabilidad.» | Feed vacío: cuenta precargada. Sin ganadores en esa convocatoria: la siguiente tarjeta o solo la frase |
| 6 | **1:20–1:42** · Paywall + compra *(punto 4)* | **Prepárame la solicitud** → paywall RevenueCat (Pro mensual, Pro anual, Solicitud premium) → **Pro mensual** → checkout sandbox → desbloqueado | «El dossier es gratis. Preparar la solicitud es lo que vale dinero: una consultora se lleva entre un 10 y un 15 % de tu beca. Nosotros, 9 euros al mes, con garantía de 90 días. Esto es RevenueCat en sandbox, compra de pruebas real.» | Checkout falla o > 10 s: cuenta **ya Pro**. «Esta compra la hicimos hace una hora; os enseño la cuenta ya Pro.» |
| 7 | **1:42–1:52** · Borrador *(punto 4)* | Borrador de la memoria con **frases literales de la artista** resaltadas | «La memoria está escrita con sus palabras; fijaos, esta frase la ha dicho hace un minuto. Lo que falta lo marca, no lo inventa.» | > 8 s: abrir la solicitud ya redactada de la cuenta precargada |
| 8 | **1:52–2:07** · Tribunal *(punto 5)* | **Pasar el tribunal simulado** → **61/100** con comentarios por criterio → **Aplicar mejoras** → **84/100** | «Un tribunal simulado con los criterios y los pesos oficiales de las bases: 61. Aplicamos lo que pide… 84. Antes de presentarla.» | > 8 s: solicitud ya puntuada de la cuenta precargada |
| 9 | **2:07–2:22** · Justificación *(punto 7)* | **2.º navegador** (cuenta de reserva): `/justificacion/<id>` con 3 facturas asignadas y un aviso en una partida pasada de presupuesto → **Fotografiar una factura** (papel impreso) → asignada a su partida + nuevo aviso → **Preparar la memoria** | «Y cuando te dan la ayuda, hay que justificarla: foto de la factura, la asigna a su partida, avisa de las desviaciones y prepara la memoria final con tus palabras. Mecena prepara; tú presentas.» Si va con IA simulada: «Este paso va con lectura de ensayo; en producción la lee Claude con visión.» | La foto falla o tarda > 8 s: no repetir; enseñar las 3 facturas ya asignadas y **Preparar la memoria**. Lectura rara: «IA simulada para esta cuenta» en la reserva |
| 10 | **2:22–2:32** · Panel B2B *(punto 8)* | Pestaña 2 del 2.º navegador: `/panel`, escuela de ejemplo con 3 miembros que ya aceptaron, sus convocatorias que encajan y plazos | «Para escuelas y asociaciones: las personas que han aceptado su invitación y, de cada una, las convocatorias abiertas que le encajan y sus plazos. Solo ven lo que cada persona comparte.» | Vacío: recargar «Artista Pro con solicitud» en la reserva, o `/panel?demo=1` |
| 11 | **2:32–2:47** · MCP *(punto 2)* | Portátil: Claude Desktop, prompt «Hazme el dossier para la convocatoria [X]» → `search_calls`, `build_dossier`, `export_dossier_pdf` | «Y todo esto también es un servidor MCP remoto: desde Claude, una frase y tienes el dossier para esa convocatoria.» | No responde o > 2:40: solo la frase. Nunca se improvisa sin haberlo ensayado |
| 12 | **2:47–3:00** · Cierre | Volver a la pantalla A1 o a la diapositiva 8 («Visión y petición») | «Mecena prepara; tú presentas. Lo que habéis visto funciona de principio a fin: 37 convocatorias reales, 213 concesiones pasadas y RevenueCat de verdad, del dossier a la justificación. Hoy, artistas; mañana, cualquier pyme. Tú creas; Mecena se encarga del papeleo. Gracias.» | Si hemos saltado el MCP, añadir antes de «Hoy»: «Y Claude puede manejarla por MCP». Solo estas cifras; nada de «millones sin reclamar para artistas» |

Suma: 10 + 30 + 15 + 10 + 15 + 22 + 10 + 15 + 15 + 10 + 15 + 13 = 180 s (la compra y el borrador suman 32 s; los cambios de navegador y portátil salen de los segundos de cada fila).

### Guion orientativo del artista (≈ 25 s, frases cortas, que lo diga con sus palabras)
Pásaselo por la mañana (bloque A11; frases cortas: son ≈ 5 s por pregunta) y ensayadlo una vez. No tiene que leerlo.
1. «Me llamo [nombre], soy [pintora / ilustrador / fotógrafa] y vivo en [ciudad].»
2. «Trabajo sobre todo con [técnica] y me interesa [tema].»
3. «Mi serie más reciente se llama [serie], va de [concepto].»
4. «He expuesto en [sitio] / he ganado [premio] / estudié en [escuela].»
5. Con la obra delante de la cámara: «Esta es [título], de [año], [técnica], [medidas aprox.].»
6. «Lo que busco ahora es [una residencia / ayuda a la producción / una beca].»

Que el punto 3 contenga una frase con personalidad: es la que luego enseñaremos citada en la memoria (fila 7).

---

## Versión corta (90 s)
Para cuando el turno sea corto o el directo se tuerza. Usa el **usuario de demo precargado** salvo en la voz. No cubre los 8 puntos: si sobran 10 s, enseñar el panel o la justificación ya hecha de la cuenta de reserva.

| Tiempo | Pantalla | Se dice |
|---|---|---|
| 0:00–0:10 | A1 | «La mitad de los artistas en España gana menos del salario mínimo y casi ninguno tiene quien le busque y le prepare las ayudas. Las ayudas existen; nadie se las prepara.» |
| 0:10–0:40 | Voz (30 s) + 1 foto | Artista habla 30 s y fotografía una obra. Perfil y dossier crecen. |
| 0:40–0:50 | Feed | «Ayudas públicas españolas reales: por qué encajas y qué te falta.» (sin cambio a pyme) |
| 0:50–1:05 | Paywall → compra sandbox (o usuario Pro) | «El dossier es gratis; la solicitud se paga. RevenueCat, compra de pruebas real. Con garantía de 90 días.» |
| 1:05–1:20 | Tribunal 61 → 84 | «Escrita con sus palabras y puntuada con los criterios oficiales antes de presentarla.» |
| 1:20–1:30 | Cierre | «Mecena prepara; tú presentas. 37 convocatorias reales, RevenueCat de verdad. Tú creas; Mecena hace el papeleo.» |

---

## Preguntas probables del público
Según las webs de cada producto (no verificado; decidlo así).
| Pregunta | Respuesta (≤ 15 s) |
|---|---|
| «¿Esto no existe ya?» | «Para pymes, sí: SUBAI, BuscoAyudas… Las pymes ya tienen herramientas; los artistas no tienen a nadie que les haga el dossier y les prepare las ayudas públicas españolas.» |
| «¿Y Sketchar o OpenCall?» | «Según sus webs, van a *open calls* internacionales y en inglés. Nosotros, ayudas públicas españolas, dossier por voz y tribunal con los criterios oficiales.» |
| «¿Por qué no empezáis por pymes, que pagan más?» | «Porque ese mercado está lleno y el de artistas, vacío. El motor ya sirve para pymes: lo habéis visto con un toque.» |
| «¿3,99 € no es poco?» | «BuscoAyudas cobra 19 € al mes a pymes, según su web; un artista no factura como una pyme. Y una consultora se lleva un 10–15 % de la ayuda.» |
| «¿La IA toca mi obra?» | «Nunca. Solo endereza y recorta la foto. No entrenamos con tu obra y presentas tú.» |

## Planes B por paso de riesgo
| Riesgo | Señal | Qué hace el operador | Qué dice el presentador |
|---|---|---|---|
| **Sin red / wifi caída** | La app no responde o el túnel da error | 1) Cambiar el móvil y el portátil al **hotspot del segundo móvil** (ya emparejado). 2) Si en 20 s no vuelve: reproducir el **vídeo de respaldo** del recorrido completo desde el portátil | «La wifi del FIC compite con cien portátiles; os enseño la grabación de esta tarde, mismo flujo.» |
| **El micro no reconoce / ruido** | La transcripción no avanza en 5 s | **Escribir en vez de hablar** → pegar la transcripción preparada del artista | «Con este eco, mejor con su texto; el resultado es el mismo.» |
| **La cámara falla** | No abre o la foto sale mal | Elegir de la **galería** las 3 fotos hechas por la mañana | — |
| **La IA va lenta** (perfil, borrador, tribunal) | > 8 s sin cambios | Abrir el resultado equivalente del **usuario de demo precargado** | «Mientras piensa, os enseño el que hicimos antes con la misma persona.» |
| **La compra falla** (checkout no carga, tarjeta rechazada) | Error o > 10 s | Cerrar el checkout y cambiar al **usuario de demo ya Pro** | «Esta compra la hicimos hace una hora; os enseño cómo queda desbloqueado.» |
| **El PDF no se genera** | Error o pantalla en blanco | Enseñar la página del dossier en la app; tener el PDF ya descargado en el móvil | «Es la misma maqueta que el PDF.» |
| **Duplicación de pantalla cae** | Proyector en negro | Reconectar el **cable USB** (no inalámbrico). Si no vuelve en 15 s: seguir con el portátil + vídeo | «Un segundo, que el proyector también quiere su beca.» |
| **MCP no responde** | Claude Desktop no lista las tools | Saltar la fila 11 sin comentarlo (solo la frase) | — |
| **La factura no se lee / la cámara falla** | Error o > 8 s en la justificación | Enseñar las 3 facturas ya asignadas y **Preparar la memoria**; si la lectura es rara, «IA simulada para esta cuenta» en la reserva | «Os enseño la que ya tenía hecha.» |
| **Justificación o panel vacíos** | Sin facturas o «Datos de demostración» | «Artista Pro con solicitud» en la cuenta de reserva; sin tiempo, `/panel?demo=1` | — |
| **Nos pasamos de tiempo** | Ver puntos de control | Recortar en este orden: ganadores parecidos → segunda obra → panel → MCP a una frase | Ir directo al cierre |

## Qué tiene que estar precargado antes de subir
**Dispositivos**
- [ ] Móvil de demo cargado > 80 %, modo No molestar, brillo al máximo, bloqueo de pantalla desactivado, solo la pestaña de Mecena abierta.
- [ ] Duplicación por **cable USB** al portátil (scrcpy en Android; QuickTime en iPhone) y portátil conectado al proyector por HDMI. Probado en la sala.
- [ ] Segundo móvil con **hotspot** encendido y ya emparejado con móvil y portátil.
- [ ] Cargador y cable de repuesto.

**App**
- [ ] `main` congelado (18:00) desplegado / túnel HTTPS activo y URL abierta en el móvil.
- [ ] Permisos de **micrófono y cámara** ya concedidos a la URL (que no salga el diálogo en escena).
- [ ] App **reseteada** justo antes de salir (script de reset, < 10 s), en la pantalla A1.
- [ ] **Usuario de demo precargado** (perfil, dossier, PDF, feed, solicitud con tribunal 61 y 84) y **usuario de demo ya Pro**, accesibles en un toque.
- [ ] **Cuenta de reserva** con «Artista Pro con solicitud» (3 facturas asignadas con una partida pasada de presupuesto, escuela de ejemplo con 3 miembros que ya aceptaron), sin memoria preparada, con `/justificacion/<id>` y `/panel` abiertas en un segundo navegador. Interruptor «IA simulada para esta cuenta» según el ensayo.
- [ ] **Factura de ejemplo impresa** (A5) de `/demo/factura-ejemplo.png`, para fotografiarla en escena.
- [ ] Ofertas de RevenueCat cargando con precios en EUR; datos de la tarjeta de pruebas sandbox a mano.
- [ ] Transcripción de respaldo del artista en el **portapapeles** del móvil.
- [ ] 3 fotos de las obras del artista en la **galería** del móvil.
- [ ] PDF del dossier del artista ya descargado en el móvil.

**Portátil**
- [ ] Claude Desktop abierto con el servidor MCP de Mecena configurado y el prompt escrito (sin enviar).
- [ ] **Vídeo de respaldo** del recorrido completo abierto en pausa.
- [ ] [`PITCH.md`](PITCH.md) en diapositivas, abierto en la diapositiva 8 para el cierre.

**Personas y cifras**
- [ ] Artista localizado/a 15 min antes, con sus obras (físicas o en otra pantalla) y el guion leído.
- [ ] El cierre solo usa cifras comprobables: 37 convocatorias y 213 concesiones (contadlas en `data/calls/` antes de subir; si cambian, cambiad el guion) y las de `fleet/IDEA.md`. Sin encuesta propia ni LOIs.
