# Mecena — Guion de la demo en directo (≤ 3:00)

> 1hack 2026 · FIC A Coruña · sábado 14/11, demos entre 19:00 y 21:00 · voluntaria, en directo, sin vídeo ni diapositivas obligatorias.
> Móvil duplicado en el proyector. Castellano de España (tú/vosotros).
> Fuente de verdad: [`fleet/IDEA.md`](../IDEA.md). Textos de pantalla: [`COPY.md`](COPY.md). Comprobaciones: [`QA_CHECKLIST.md`](QA_CHECKLIST.md).

## Reparto en el escenario
| Rol | Quién | Qué hace |
|---|---|---|
| **Presentador/a** | Persona A | Habla, marca el ritmo, mira el reloj |
| **Operador/a** | Persona B | Lleva el móvil (duplicado), toca los botones, ejecuta los planes B |
| **Artista** | [Nombre del artista voluntario] | Habla 60 s al móvil y enseña 2–3 obras |

Regla de oro: **el presentador nunca toca el móvil y el operador nunca habla**. Si algo tarda, el presentador rellena con la frase de la columna «Si tarda».

## Puntos de control del reloj
- **1:20** — debemos estar en el PDF. Si vamos por encima de **1:35**: saltamos el cambio a pyme (paso 5).
- **2:30** — debemos tener el tribunal en 84. Si vamos por encima de **2:35**: saltamos el MCP (paso 9).
- **2:50** — empieza el cierre, pase lo que pase.

---

## Versión completa (3:00)

| # | Tiempo | En pantalla (móvil) | Se dice (presentador salvo que se indique) | Si tarda / plan B |
|---|---|---|---|---|
| 1 | **0:00–0:15** · Gancho | Pantalla de arranque A1: 3 datos con fuente | «La mitad de los artistas en España gana menos del salario mínimo. Un 34 % de quienes trabajan en cultura son autónomos, el doble que en el resto de la economía. Y más de la mitad de las pymes ni siquiera pide ayudas porque no se entera; de las que empiezan, una de cada cuatro abandona por el papeleo. Las ayudas existen. Lo que falta es alguien que las encuentre y las prepare contigo.» | Si la app no carga: los 3 datos están en la diapositiva 2 de [`PITCH.md`](PITCH.md) |
| 2 | **0:15–0:20** · Confianza | Pantalla A2 «El arte es tuyo; nosotros hacemos el papeleo» → operador toca **Soy creador/a** | «Antes de nada: Mecena no genera ni toca tu obra. Solo endereza y recorta las fotos, no entrena con lo tuyo y la última palabra es siempre tuya.» | — |
| 3 | **0:20–1:20** · Voz + fotos (estrella) | Transcripción en directo a la izquierda/arriba; **perfil** rellenándose y **dossier** creciendo sección a sección. A mitad, operador abre la cámara y fotografía 2–3 obras; cada foto aparece enderezada con su ficha técnica | Presentador: «[Nombre], cuéntale a Mecena qué haces.» y **se calla**. **Artista** (≈ 60 s, guion orientativo abajo): quién es, dónde vive, técnica, una serie, una exposición o premio. Al enseñar cada obra: título, año, técnica, medidas | Si el micro no reconoce: operador toca **Escribir en vez de hablar** y pega la transcripción preparada (portapapeles). Presentador: «La sala tiene más eco que un estudio; os lo enseño con su texto.» |
| 4 | **1:20–1:30** · PDF | Operador toca **Descargar PDF** → se abre el dossier maquetado | «Sesenta segundos hablando y tres fotos. Esto es un dossier profesional en PDF, y es gratis.» | Si el PDF no se genera: enseñar la página del dossier en la app («es la misma maqueta») |
| 5 | **1:30–1:45** · Convocatorias | Feed de convocatorias reales: tarjeta con importe, plazo, **Por qué encajas** / **Qué te falta**. Operador abre una | «Convocatorias reales y vigentes, con la fuente. Y no solo te dice que encajas: te dice por qué, y qué te falta. Aquí: [qué te falta en la tarjeta].» | Si no carga el feed: el usuario de demo precargado ya tiene el feed (ver «Precargado») |
| 6 | **1:45–1:55** · Modo pyme | Operador toca el cambio **Creador/a ↔ Pyme/autónomo**: cambian perfil y convocatorias. Vuelve a creador | «Y el mismo motor sirve para una pyme o un autónomo: ayudas de digitalización, contratación, internacionalización. Un toque.» | **Recortable** si a 1:35 no estamos en el paso 5 |
| 7 | **1:55–2:15** · Paywall + compra | En la convocatoria: **Prepárame la solicitud** → paywall RevenueCat (Pro mensual, Pro anual, Solicitud premium) → operador elige **Solicitud premium** o **Pro mensual** → checkout sandbox → desbloqueado | «El dossier es gratis. Preparar la solicitud es lo que vale dinero: una consultora se lleva entre un 10 y un 15 % de tu beca. Nosotros, 9 euros al mes, con garantía: si en 90 días no has presentado 3 solicitudes, te lo devolvemos. Esto es RevenueCat en modo sandbox, compra real de pruebas.» | Si el checkout falla o tarda > 10 s: operador cambia al **usuario de demo ya Pro** (compra hecha antes). Presentador: «Esta compra la hicimos hace una hora con el mismo flujo; os la enseño hecha.» |
| 8 | **2:15–2:35** · Borrador + tribunal | Borrador de la memoria **con frases literales del artista** resaltadas → **Pasar por el tribunal** → **61/100** con comentarios por criterio → **Aplicar mejoras** → **84/100** | «La memoria está escrita con sus palabras; fijaos, esta frase la ha dicho hace un minuto. Ahora la pasamos por un tribunal simulado con los criterios y los pesos oficiales de las bases: 61. Aplicamos lo que pide… 84. Antes de presentarla.» | Si el borrador o el tribunal tardan > 8 s: abrir la solicitud ya puntuada del usuario de demo precargado |
| 9 | **2:35–2:50** · MCP *(opcional)* | Cambio al portátil: Claude Desktop, prompt «Hazme el dossier para la convocatoria [X]» → llamadas a `get_profile`, `build_dossier`, `export_dossier_pdf` | «Y todo esto también es un servidor MCP: desde Claude, una frase y tienes el dossier adaptado a esa convocatoria.» | **Recortable** si a 2:35 no hemos llegado. Nunca se improvisa sin haberlo ensayado |
| 10 | **2:50–3:00** · Cierre | Volver a la pantalla A1 o diapositiva de tracción | «Esta noche hemos preguntado a [N] artistas: el [X %] perdió una convocatoria por enterarse tarde y el [X %] pagaría por esto. Tenemos [N LOIs] cartas de interés de escuelas y asociaciones. Mecena: tú creas, nosotros hacemos el papeleo. Gracias.» | Si no hay datos de encuesta: decir solo las LOIs; si tampoco, cerrar con la frase de marca |

### Guion orientativo del artista (≈ 60 s, que lo diga con sus palabras)
Pásaselo por la mañana (bloque A11) y ensayadlo una vez. No tiene que leerlo.
1. «Me llamo [nombre], soy [pintora / ilustrador / fotógrafa] y vivo en [ciudad].»
2. «Trabajo sobre todo con [técnica] y me interesa [tema].»
3. «Mi serie más reciente se llama [serie], va de [concepto].»
4. «He expuesto en [sitio] / he ganado [premio] / estudié en [escuela].»
5. Con cada obra delante de la cámara: «Esta es [título], de [año], [técnica], [medidas aprox.].»
6. «Lo que busco ahora es [una residencia / ayuda a la producción / una beca].»

Que el punto 3 contenga una frase con personalidad: es la que luego enseñaremos citada en la memoria (paso 8).

---

## Versión corta (90 s)
Para cuando el turno sea corto o el directo se tuerza. Usa el **usuario de demo precargado** salvo en la voz.

| Tiempo | Pantalla | Se dice |
|---|---|---|
| 0:00–0:10 | A1 | «La mitad de los artistas gana menos del salario mínimo y más de la mitad de las pymes no pide ayudas porque no se entera. Las ayudas existen; nadie te las prepara.» |
| 0:10–0:40 | Voz (30 s) + 1 foto | Artista habla 30 s y fotografía una obra. Perfil y dossier crecen. |
| 0:40–0:50 | Feed | «Convocatorias reales: por qué encajas y qué te falta.» |
| 0:50–1:05 | Paywall → compra sandbox (o usuario Pro) | «El dossier es gratis; la solicitud se paga. RevenueCat, compra de pruebas real. Con garantía de 90 días.» |
| 1:05–1:20 | Tribunal 61 → 84 | «Escrita con sus palabras y puntuada con los criterios oficiales antes de presentarla.» |
| 1:20–1:30 | Cierre | «[X %] de los artistas encuestados pagaría; [N LOIs] cartas de interés. Tú creas; Mecena hace el papeleo.» |

---

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
| **MCP no responde** | Claude Desktop no lista las tools | Saltar el paso 9 sin comentarlo | — |
| **Nos pasamos de tiempo** | Ver puntos de control | Saltar paso 6, luego paso 9 | Ir directo al cierre |

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
- [ ] Ofertas de RevenueCat cargando con precios en EUR; datos de la tarjeta de pruebas sandbox a mano.
- [ ] Transcripción de respaldo del artista en el **portapapeles** del móvil.
- [ ] 3 fotos de las obras del artista en la **galería** del móvil.
- [ ] PDF del dossier del artista ya descargado en el móvil.

**Portátil**
- [ ] Claude Desktop abierto con el servidor MCP de Mecena configurado y el prompt escrito (sin enviar).
- [ ] **Vídeo de respaldo** del recorrido completo abierto en pausa.
- [ ] [`PITCH.md`](PITCH.md) en diapositivas, abierto en la diapositiva de tracción para el cierre.

**Personas y cifras**
- [ ] Artista localizado/a 15 min antes, con sus obras (físicas o en otra pantalla) y el guion leído.
- [ ] Cifras de la encuesta y LOIs (B16) sustituidas en el cierre: [X %], [N], [N LOIs].
