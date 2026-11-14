# Mecena · Guion de la demo en directo (≤ 3:00)

> Sábado 14/11/2026 · demos de 19:00 a 21:00 · FIC A Coruña · móvil duplicado en el proyector.
> App: **https://mecena.fly.dev**. Guion de escenario de referencia: [`fleet/pitch/DEMO_SCRIPT.md`](../fleet/pitch/DEMO_SCRIPT.md). Comprobaciones: [`fleet/pitch/QA_CHECKLIST.md`](../fleet/pitch/QA_CHECKLIST.md). Congelación de `main` y despliegue: [README, «Día de demo»](../README.md#día-de-demo).
> Cifras: solo las de [`fleet/IDEA.md`](../fleet/IDEA.md), siempre con su fuente.

## Reparto
| Rol | Qué hace |
|---|---|
| **Presentador/a** | Habla, mira el reloj, nunca toca el móvil. |
| **Operador/a** | Lleva el móvil, toca, ejecuta los planes B. Nunca habla. |
| **Artista** | Contesta 6 preguntas en voz alta (≈ 30 s, frases cortas) y dicta la ficha de 1 obra (≈ 10 s). |

**Los ocho puntos de [`fleet/IDEA.md`](../fleet/IDEA.md) salen en la demo, todos de principio a fin:** (1) voz + fotos + dossier + PDF · (2) MCP · (3) feed de convocatorias · (4) «Prepárame la solicitud» con RevenueCat y borrador · (5) tribunal 61 → 84 · (6) «Ganadores parecidos a ti» · (7) justificación · (8) panel B2B.

**Dónde está cada cosa (la parte nueva):**
| Pantalla | Dónde se enseña |
|---|---|
| Filas 1-7 (voz → tribunal) | **Móvil de escenario**, cuenta de escenario. Pestaña 1 = `/`; pestaña 2 = `/demo`. |
| Fila 8 · `/justificacion/<id>` y fila 9 · `/panel` | **Segundo navegador del mismo móvil (o un segundo móvil), cuenta de reserva** cargada con «Artista Pro con solicitud» (3 facturas ya asignadas con una partida pasada de presupuesto + la escuela de ejemplo con 3 miembros que ya aceptaron). Pestaña 1 = `/justificacion/<id>`, pestaña 2 = `/panel`. |
| Fila 10 · MCP | **Portátil**, Claude Desktop con el prompt ya escrito. |

La cuenta de reserva sigue siendo el plan B de la compra, el borrador y el tribunal (se entra en `/tribunal/<id>` con otra pestaña). Si un plan B ya ha cargado «Artista Pro con solicitud» **en la cuenta de escenario**, la justificación y el panel se enseñan ahí mismo («Justificar la subvención» en la solicitud, o `/panel`) y no hay cambio de navegador.
**Foto de la factura:** una **copia impresa en papel** de `https://mecena.fly.dev/demo/factura-ejemplo.png` (A5; es la que hay en `/demo`, ficticia y CC0). El botón «Fotografiar una factura» abre la cámara (no la galería): se le hace la foto en directo al papel.
**IA de la reserva:** con el interruptor **«IA simulada para esta cuenta»** activado, la primera foto sin nota se lee siempre igual (Imprenta Ártabra, 1.450,00 €, partida «Edición del catálogo») y la memoria sale al instante. Con Claude real, la lectura depende de la foto. Decídelo en el ensayo (apartado «Antes de subir»). Si va simulada, el presentador lo dice (fila 8).

## Puntos de control del reloj
| Reloj | Tenemos que estar en… | Si vamos tarde |
|---|---|---|
| **0:40** | Artista terminando la entrevista | Si pasamos de **0:50**: saltar las fotos (pasar directo al dossier) |
| **1:05** | PDF abierto | Si pasamos de **1:15**: saltar «Ganadores parecidos a ti» (fila 4) |
| **1:42** | Compra pagada y borrador empezando | Si a **1:50** no está pagado: plan B de la compra (fila 5) |
| **2:07** | Tribunal en 84 | Si pasamos de **2:15**: saltar el panel (fila 9) |
| **2:32** | Panel visto | Si pasamos de **2:40**: el MCP en una sola frase, sin enseñarlo |
| **2:47** | Cierre empezando | Cierre pase lo que pase |

**Orden de recortes** (de menos a más vistoso, solo si hace falta): scroll del dossier → «Ganadores parecidos» → segunda foto de obra → panel → MCP a una frase. El cambio a Pyme ya no está en el guion principal: se cuenta en el cierre («mañana, cualquier pyme»).

---

## Versión completa (3:00)

| # | Tiempo | Pantalla y toques (operador) | Dice el presentador | Plan B: botón de `/demo` (operador) · frase (presentador) |
|---|---|---|---|---|
| 1 | **0:00–0:10** Gancho | `/` (A1): 3 datos con su fuente. Sin toques. | «Uno de cada dos artistas en España ingresa menos del salario mínimo (encuesta Nebrija/UGR), y más de la mitad de las pymes no pide ayudas por no conocerlas (MuyPymes, 2025). Las ayudas existen. Falta quien haga el papeleo contigo.» | Si `/` no carga: recargar una vez. Si sigue sin cargar: los datos en la diapositiva de [`PITCH.md`](../fleet/pitch/PITCH.md) y pasar a la versión corta con la cuenta de reserva. · «La wifi compite con cien portátiles; un segundo.» |
| 2a | **0:10–0:40** Voz *(punto 1)* | «Empezar» → «Soy creador/a» (ya marcado) → **«Hablando»** (el micro se abre solo) → la artista contesta (5 s cada una) → «Siguiente» ×5 → «Terminar». Debajo de cada pregunta van saliendo los chips «Detectado: …». | «[Nombre], cuéntale a Mecena qué haces.» Y **se calla**. Al salir los chips: «Fijaos: va rellenando el perfil mientras habla.» | **El micro no transcribe en 5 s:** «Atrás» hasta «¿Cómo prefieres contárnoslo?» → **«Escribiendo»** y pegar sus respuestas. Si se pierden > 15 s: pestaña 2 → **«Artista de ejemplo»** → «Abre el dossier». · «Con este eco, os enseño a Antía, una ilustradora de A Coruña, hecha con la misma app.» **«Analizando respuesta…» > 8 s:** interruptor **«IA simulada para esta cuenta»** y seguir. · «Seguimos; Mecena va anotando.» |
| 2b | **0:40–0:55** Fotos *(punto 1)* | «Fotografiar mi obra» → «📷 Hacer foto» → foto de frente → «🎙 Dictar» (título, año, técnica, medidas) → «■ Parar» → «Crear ficha». **Una obra**; la segunda solo si vamos sobrados. | «Solo endereza y recorta la foto. La obra no se toca, no entrenamos con ella y la última palabra es suya.» | **Cámara falla:** «Elegir de la galería» (fotos hechas por la mañana). **«Escribiendo la ficha…» > 8 s:** **«IA simulada para esta cuenta»**. · «Mientras escribe la ficha: nunca generamos ni modificamos obra.» |
| 3 | **0:55–1:05** Dossier y PDF *(punto 1)* | «Ver mi dossier →» → `/dossier`: bajar despacio **5 s** → «Descargar PDF» (se abre en otra pestaña) → enseñar 2 s → **volver a la pestaña de Mecena**. | «Un minuto hablando y una foto: declaración, biografía, serie y ficha técnica, con sus palabras, no con las nuestras. Y esto es un dossier en PDF, listo para enviar. Gratis.» | Dossier vacío o pobre: pestaña 2 → **«Artista de ejemplo»** → «Abre el dossier». · «Este es el de Antía, con la entrevista completa.» PDF no abre: enseñar `/dossier` («es la misma maqueta») o el PDF de reserva ya descargado. |
| 4 | **1:05–1:20** Convocatorias y ganadores *(puntos 3 y 6)* | «Buscar convocatorias» → `/convocatorias`: tarjeta con importe, plazo, **Por qué encajas** / **Qué te falta** (**7 s**) → abrir la primera → `/convocatorias/<id>` → bajar hasta **«Ganadores parecidos a ti»** (**8 s**). | «Convocatorias reales y abiertas, con enlace a las bases: no solo te dice que encajas, te dice por qué y qué te falta. Y quién ha ganado antes algo parecido, con importes reales: orientativo, nunca una probabilidad.» | Feed vacío o lento: **«IA simulada para esta cuenta»** y recargar. Si sigue vacío: **«Artista de ejemplo»** → «Convocatorias». · «Os la enseño con un perfil completo.» Sin ganadores en esa convocatoria: probar la siguiente tarjeta; si tampoco, decir la frase y seguir (la sección sale solo con concesiones reales). |
| 5 | **1:20–1:42** «Prepárame la solicitud», paywall y compra *(punto 4)* | En la convocatoria: **«Prepárame la solicitud»** → `/solicitud/<id>` → otra vez «Prepárame la solicitud» → oferta de Mecena Pro (Pro anual, Pro mensual, Solicitud premium, ancla y garantía) **5 s** → **«Pro mensual»** → checkout de Web Billing → **4242 4242 4242 4242**, caducidad futura, CVC cualquiera (email de pruebas si lo pide) → pagar → «Activando tu plan…» → la hoja se cierra y **el borrador empieza solo**. | «El dossier es gratis; preparar la solicitud es lo que vale dinero. Una consultora se lleva un 10-15 % de tu beca; Mecena, 3,99 € al mes, con garantía de 90 días. Esto es RevenueCat Web Billing en sandbox: una compra de pruebas de verdad, con el entitlement `pro`.» | Planes no cargan («No hemos podido cargar los planes») o checkout no carga, tarjeta rechazada o > 10 s: «Ahora no» → **cuenta de reserva** (2.º navegador) → «Abre la solicitud». Sin reserva: pestaña 2 → **«Artista Pro con solicitud»** → «Abre la solicitud». · «El pago de pruebas no carga con esta red; seguimos con una cuenta que ya es Pro.» |
| 6 | **1:42–1:52** Borrador con su voz *(punto 4)* | «Leyendo las bases… / Usando tus palabras…» → memoria, declaración, presupuesto y documentos → abrir **«Escrito con tus palabras (N)»** en una sección. | «La memoria está escrita con sus palabras: esta frase la ha dicho hace un minuto. Lo que falta lo marca como “[Completa: …]” en vez de inventarlo.» | > 8 s: rellenar («Está leyendo las bases y lo que nos ha contado…»). > 15 s: **cuenta de reserva** o **«Artista Pro con solicitud»** → «Abre la solicitud». · «Mientras piensa, os enseño una ya redactada.» |
| 7 | **1:52–2:07** Tribunal 61 → 84 *(punto 5)* | Bajar → **«Pasar el tribunal simulado»** → «Los tres jueces están leyendo tu solicitud…» → **61/100** por criterio → **«Aplicar mejoras»** → **84/100**, «+23 puntos tras las mejoras». | «Un tribunal simulado con los criterios y los pesos oficiales de las bases: 61. Aplicamos lo que piden, solo con datos que ella ha dado… 84. Antes de presentarla. Orientativo, no una probabilidad.» | Antes de tocar «Pasar el tribunal simulado», si el ensayo no dio 61 → 84 fiable: **«Tribunal determinista (plan B)»** (no cambia una nota ya puesta). Si tarda > 8 s: **cuenta de reserva** o **«Artista Pro con solicitud»** → **«Abre el tribunal (61)»** → «Aplicar mejoras». · «Os enseño el tribunal con la solicitud de Antía.» |
| 8 | **2:07–2:22** Justificación *(punto 7)* | Cambiar al **2.º navegador** (cuenta de reserva), pestaña 1 = `/justificacion/<id>`: tres facturas ya asignadas y un **aviso rojo** en una partida pasada de presupuesto → **«Fotografiar una factura»** → foto al papel impreso → «Leyendo la factura…» → la factura aparece **asignada a su partida** y sale **otro aviso** → **«Preparar la memoria»** → secciones de la memoria final, con la cuenta justificativa. | «Y cuando te dan la ayuda, hay que justificarla. Foto de la factura: la lee, la asigna a su partida del presupuesto y avisa de las desviaciones, aquí y aquí. Y prepara la memoria final con tus palabras y las cifras. Mecena prepara; tú presentas.» **Si la reserva va con IA simulada, añadir:** «Este paso va con lectura de ensayo para no depender de la red; en producción la hace Claude con visión.» | La cámara falla o la lectura tarda > 8 s: **no repetir**; enseñar las 3 facturas ya asignadas y el aviso, y **«Preparar la memoria»**. Lectura rara o memoria lenta: interruptor **«IA simulada para esta cuenta»** (en la reserva) y repetir la foto, que se lee siempre igual. Pantalla vacía o sin facturas: **«Artista Pro con solicitud»** en la reserva → «Abre la justificación». · «Os enseño la que ya tenía hecha.» |
| 9 | **2:22–2:32** Panel B2B *(punto 8)* | Pestaña 2 del 2.º navegador = `/panel`: **Escuela de Artes Atlántico (ejemplo)**, tres miembros que ya aceptaron la invitación, sus convocatorias abiertas que encajan y los próximos plazos. Bajar una vez. Sin toques. | «Y para escuelas y asociaciones: un panel con las personas que han aceptado su invitación y, de cada una, las convocatorias abiertas que le encajan y sus plazos. Solo ven lo que cada persona decide compartir: nunca su dossier ni sus borradores.» | Panel vacío o sale «Datos de demostración»: **«Artista Pro con solicitud»** en la reserva (carga la escuela). Sin tiempo para recargar: abrir `/panel?demo=1` («Ver ejemplo»; es la organización de demostración, sin guardar). · «Esto es una escuela de ejemplo; cada centro tendría la suya.» |
| 10 | **2:32–2:47** MCP *(punto 2)* | **Portátil**: Claude Desktop con el prompt escrito: «Hazme el dossier para la convocatoria de artes plásticas de la Diputación y pásamelo en PDF.» → enviar → `search_calls`, `build_dossier`, `export_dossier_pdf`. | «Y todo esto también es un servidor MCP remoto: desde Claude, una frase y tienes el dossier para esa convocatoria.» | No responde o a **2:40** sin llegar: **frase sola**, sin enseñarlo («Claude puede manejar Mecena por MCP»). Solo se enseña si se ha ensayado con el MCP remoto (`https://mecena.fly.dev/api/mcp`, token de la cuenta de escenario; [`docs/mcp.md`](mcp.md)). Plan B ensayado: captura/clip de 10 s del propio ensayo en el portátil. |
| 11 | **2:47–3:00** Cierre | Volver a `/` o a la diapositiva de cierre (8 de [`PITCH.md`](../fleet/pitch/PITCH.md)). | «Mecena prepara; tú presentas. Lo que habéis visto funciona de principio a fin: 37 convocatorias reales, 213 concesiones pasadas, RevenueCat de verdad, y del dossier a la justificación. Hoy, artistas; mañana, cualquier pyme. Tú creas; Mecena se encarga del papeleo. Gracias.» | Si hemos saltado el MCP, añadir antes de «Hoy»: «Y Claude puede manejarla por MCP». Solo estas cifras, que salen de los datos de la app y de `fleet/IDEA.md`. **Nunca inventar cifras ni decir «millones sin reclamar».** |

Suma: 10 + 30 + 15 + 10 + 15 + 22 + 10 + 15 + 15 + 10 + 15 + 13 = **180 s**. No queda holgura: los cambios de navegador y de portátil (≈ 3 s cada uno) salen de los segundos de cada fila, así que **ensayad el cambio de la fila 8** y tened las pestañas ya abiertas.

---

## Versión corta (90 s)
Para un turno corto o un directo torcido. Cuenta de escenario hasta la oferta; cuenta de reserva para el tribunal. **No cubre los ocho puntos** (sin ganadores, justificación, panel ni MCP): si sobran 10 s, enseñar el panel (`/panel` de la reserva) o la justificación ya hecha (`/justificacion/<id>`, sin foto nueva).

| Tiempo | Pantalla y toques | Dice el presentador |
|---|---|---|
| 0:00–0:10 | `/` (A1) | «Uno de cada dos artistas en España ingresa menos del salario mínimo (Nebrija/UGR). Las ayudas existen; nadie se las prepara.» |
| 0:10–0:40 | «Empezar» → «Hablando» → la artista contesta 2 preguntas → «Siguiente» hasta «Terminar» | (calla mientras habla) «Perfil y dossier, mientras habla.» |
| 0:40–0:50 | «Ver convocatorias para mí» → una tarjeta | «Convocatorias reales: por qué encajas y qué te falta.» |
| 0:50–1:05 | Tarjeta → «Prepárame la solicitud» ×2 → oferta → «Ahora no» | «El dossier es gratis; la solicitud se paga: 3,99 € al mes con RevenueCat, frente al 10-15 % de una consultora. Con garantía de 90 días.» |
| 1:05–1:20 | Cuenta de reserva → «Abre el tribunal (61)» → «Aplicar mejoras» → 84 | «Escrita con sus palabras y puntuada con los criterios oficiales antes de presentarla: de 61 a 84.» |
| 1:20–1:30 | `/` o diapositiva | «Mecena prepara; tú presentas. 37 convocatorias reales, RevenueCat de verdad. Tú creas; Mecena se encarga del papeleo.» |

---

## Briefing de la artista voluntaria (pásaselo 15 min antes)
Mecena hace **6 preguntas, una por pantalla**. Contesta cada una en **unos 5 segundos** (una o dos frases), con tus palabras, sin leer. El operador pasa de pregunta.

| Pregunta en pantalla | Qué decir (ejemplo) |
|---|---|
| ¿Cómo te llamas y desde dónde creas? | «Soy [nombre], [pintora / ilustrador / fotógrafa] y trabajo en [ciudad].» |
| ¿Qué haces? Tu disciplina y tu técnica. | «Trabajo con [técnica], sobre todo [tema].» |
| Háblanos de una serie o un proyecto reciente. | «Mi última serie se llama [serie] y va de [idea].» **Di aquí una frase con personalidad: es la que veremos citada en la memoria.** |
| ¿Exposiciones, premios o formación que quieras contar? | «He expuesto en [sitio] / quedé [premio] / estudié en [escuela].» |
| ¿Qué buscas ahora? | «Busco [una beca de producción / una residencia / un premio] para [proyecto].» |
| ¿Cómo te imaginas tu dossier? | «Sobrio, en blanco y negro, con mucha imagen» / «colorido, como un fanzine». **De aquí salen las 2 maquetaciones libres que Mecena compone sola al terminar (tardan 1-2 min).** |

**Obras (1; una segunda solo si vamos sobrados):** piezas planas o fotos/impresiones de obra (no esculturas grandes), de frente, con buena luz y sin reflejos. Elige las de la serie que nombras. Por cada una, al pulsar «Dictar»: «Esta es [título], de [año], [técnica], [ancho] por [alto] centímetros.»
**Por la mañana:** fotos de esas 1–3 obras en la galería del móvil de demo, y sus 6 respuestas escritas en el portapapeles/notas (plan B «Escribiendo»).
**Confianza:** su obra no se modifica ni se usa para entrenar; puede pedir que se borre todo al acabar («Empezar de cero»).

---

## Checklist del dispositivo
| | Android + Chrome (**recomendado**) | iPhone + Safari |
|---|---|---|
| Voz es-ES (Web Speech) | Funciona mejor (usa los servicios de Google de Chrome) | **Sin probar / menos fiable** → si no hay Android, usar «Escribiendo» |
| Duplicación al proyector | Cable USB + scrcpy al portátil | Cable + QuickTime en un Mac |

- [ ] **HTTPS:** abrir `https://mecena.fly.dev` (sin HTTPS no hay micro ni cámara).
- [ ] Permisos de **micrófono y cámara** ya concedidos a la URL: hacer una pasada de prueba (hablar y una foto) para que no salga ningún diálogo en escena.
- [ ] Brillo al máximo, bloqueo automático desactivado, **No molestar**, rotación bloqueada en vertical, batería > 80 %.
- [ ] Sesión iniciada **antes de subir** en la cuenta de escenario. **NO hacer logout** («Salir» está en la cabecera: no tocarlo). La cookie dura 30 días.
- [ ] Pestaña 1 en `/`, pestaña 2 en `/demo`. Nada más abierto.
- [ ] Cuenta de reserva con sesión en el 2.º navegador, cargada con «Artista Pro con solicitud»; pestaña 1 = `/justificacion/<id>` (el enlace «Abre la justificación» sale tras cargar el escenario), pestaña 2 = `/panel`. **No** preparar la memoria ni subir facturas en ensayo en esta cuenta: si ocurre, volver a cargar «Artista Pro con solicitud».
- [ ] **Factura de ejemplo impresa en papel** (A5), de `https://mecena.fly.dev/demo/factura-ejemplo.png` (también descargable en `/demo`), a mano del operador. Funciona con papel, pantalla ajena o cualquier objeto si la reserva va con IA simulada.
- [ ] Portátil: Claude Desktop con el servidor MCP configurado y el prompt escrito, sin enviar ([`docs/mcp.md`](mcp.md)); un clip o captura de 10 s del ensayo como plan B.
- [ ] Tarjeta de pruebas a mano: **4242 4242 4242 4242**, cualquier fecha futura, cualquier CVC.
- [ ] Si hay Basic auth activo (opcional, `BASIC_AUTH_PASSWORD`), la contraseña ya metida en los dos navegadores.

## Checklist antes de subir
**Antes de 18:00**
- [ ] `fly secrets set DEMO_EMAILS="escenario@…,reserva@…"` (reinicia la máquina: hacerlo ya, nunca a última hora). Sin esto, «Artista Pro con solicitud» sale desactivado con RevenueCat real.
- [ ] Cuentas de **escenario y de reserva creadas** en `/entrar` → «Crear cuenta» (el límite por IP de la sede puede bloquear altas: 10 intentos / 15 min por email y por IP). Con el código de invitación si `MECENA_SIGNUP_CODE` está puesto.

**18:00 · `main` congelado** (todo push a `main` despliega y reinicia la máquina: ver [README, «Día de demo»](../README.md#día-de-demo)).

**18:00–18:45**
- [ ] Dos ensayos completos **con la clave real** (IA: Claude), cronometrados. Apuntar: ¿borrador < 10 s? ¿tribunal 61 → 84 fiable?
- [ ] `flyctl status -a mecena` (una máquina, `started`) y `fly logs -a mecena` abierto en el portátil durante la demo.
- [ ] Preflight en **verde**, cuenta de escenario (inofensivo):
  `MECENA_DEMO_EMAIL=escenario@… MECENA_DEMO_PASSWORD=… npm run demo:preflight -- https://mecena.fly.dev`
- [ ] Preflight de la **reserva** cargando el plan B (borra esa cuenta y comprueba el 61):
  `MECENA_DEMO_EMAIL=reserva@… MECENA_DEMO_PASSWORD=… npm run demo:preflight -- https://mecena.fly.dev --load pro`
- [ ] En la reserva, `/demo` → «Abre el tribunal (61)» enseña 61. **No** tocar «Aplicar mejoras» después del último ensayo.
- [ ] Preflight de la reserva en verde también en: «Datos de la justificación listos», «Datos del panel B2B listos», «Justificación de la solicitud de ejemplo» (3 facturas, ≥ 1 partida pasada, sin memoria), «Foto de factura en directo (IA simulada)» (1 → 2 alertas; se borra sola) y «Panel B2B» (3 miembros que ya aceptaron). Con `--allow-ai` la foto en directo no se prueba: ensayarla a mano.
- [ ] **Un ensayo de la justificación en una cuenta de ensayo (no la reserva), con la clave real:** foto del papel → ¿asignada a «Edición del catálogo» y con aviso? ¿«Preparar la memoria» < 8 s? Si sí a las dos, la reserva va **sin** IA simulada; si no, activar **«IA simulada para esta cuenta»** en la reserva y decirlo en escena (fila 8).

**Justo antes de subir (cuenta de escenario, pestaña `/demo`)**
- [ ] **«Tribunal determinista (plan B)»** activado si el ensayo con la clave real no dio 61 → 84 de forma fiable. (Los interruptores sobreviven a «Empezar de cero».)
- [ ] **«IA simulada para esta cuenta»** desactivado (etiqueta «IA: Claude»). Si se cortó un preflight a medias, puede haberse quedado encendido.
- [ ] **«Empezar de cero»** con **«Dejar la pyme de ejemplo para el cambio a Pyme»** marcado → confirmar.
- [ ] Etiquetas: «Pagos: RevenueCat sandbox», «Gratis», «Modo: Creador/a». Pestaña 1 en `/`.

## Qué botón de `/demo` para qué fallo
Todos los escenarios **borran los datos de la cuenta con sesión** (solo esa) y piden confirmación. Los interruptores no borran nada. **Todos dejan la escuela de ejemplo en `/panel`** (3 miembros que ya aceptaron; se recrea sin duplicarse); «Artista Pro con solicitud» deja además **3 facturas asignadas** en `/justificacion/<id>` con una partida pasada de presupuesto. «Empezar de cero» las borra con la solicitud.

| Fallo | Qué tocar en `/demo` | Después |
|---|---|---|
| El micro no reconoce o la entrevista se atasca | «Artista de ejemplo» | «Abre el dossier» → «Descargar PDF» → «Buscar convocatorias» |
| La IA tarda en la entrevista, las fichas o el feed | Interruptor «IA simulada para esta cuenta» | Seguir donde estabas (respuestas instantáneas, menos finas) |
| Claude no responde en absoluto | Interruptor «IA simulada para esta cuenta» | Seguir; avisar en `fly logs` |
| Dossier o convocatorias vacíos | «Artista de ejemplo» | Pantallas de la demo → «Convocatorias» |
| El cambio a Pyme (ya no está en el guion; solo si sobran 8 s) sale vacío | Nada en escena (borraría a la artista) | Saltarlo. Antes de subir: «Empezar de cero» con la casilla de la pyme |
| La compra de RevenueCat falla o tarda > 10 s | Cuenta de reserva; si no, «Artista Pro con solicitud» | «Abre la solicitud» |
| El borrador tarda > 15 s | Cuenta de reserva; si no, «Artista Pro con solicitud» | «Abre la solicitud» → «Pasar el tribunal simulado» |
| La foto de la factura no se lee, la cámara falla o la memoria tarda | Reserva: interruptor «IA simulada para esta cuenta» (la primera foto se lee siempre igual y la memoria sale al instante) | Repetir la foto; si la cámara no abre, enseñar las 3 facturas ya asignadas, el aviso y «Preparar la memoria» |
| La justificación sale vacía o ya tiene memoria de un ensayo | «Artista Pro con solicitud» **en la reserva** | «Abre la justificación» (3 facturas, una partida pasada, sin memoria) |
| El panel sale vacío o como «Datos de demostración» | «Artista Pro con solicitud» **en la reserva** (también «Empezar de cero» deja la escuela) | `/panel`. Sin tiempo: `/panel?demo=1` («Ver ejemplo») |
| El tribunal tarda o no da 61 → 84 | Antes de puntuar: «Tribunal determinista (plan B)». Ya atascado: «Artista Pro con solicitud» | «Abre el tribunal (61)» → «Aplicar mejoras» → 84 |
| Hay que repetir la demo con el siguiente turno | «Empezar de cero» (casilla de la pyme marcada) | `/` en la pestaña 1 |
| «Artista Pro con solicitud» desactivado | — | Falta el email en `DEMO_EMAILS`: usar la cuenta de reserva |

**Desde la terminal** (solo si el móvil no responde): `fly ssh console -C "sh -c 'cd /app && npx tsx scripts/demo-reset.ts --email escenario@… --scenario pro'"` (escenarios: `blank`, `onboarded`, `pro`, `business`). **Nunca** `npm run demo:reset` sin `--email` en Fly durante la demo: borra la base de datos entera, todas las cuentas y sesiones incluidas.
