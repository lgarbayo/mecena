# Mecena · Guion de la demo en directo (≤ 3:00)

> Sábado 14/11/2026 · demos de 19:00 a 21:00 · FIC A Coruña · móvil duplicado en el proyector.
> App: **https://mecena.fly.dev**. Guion de escenario de referencia: [`fleet/pitch/DEMO_SCRIPT.md`](../fleet/pitch/DEMO_SCRIPT.md). Comprobaciones: [`fleet/pitch/QA_CHECKLIST.md`](../fleet/pitch/QA_CHECKLIST.md). Congelación de `main` y despliegue: [README, «Día de demo»](../README.md#día-de-demo).
> Cifras: solo las de [`fleet/IDEA.md`](../fleet/IDEA.md), siempre con su fuente.

## Reparto
| Rol | Qué hace |
|---|---|
| **Presentador/a** | Habla, mira el reloj, nunca toca el móvil. |
| **Operador/a** | Lleva el móvil, toca, ejecuta los planes B. Nunca habla. |
| **Artista** | Contesta 5 preguntas en voz alta (≈ 40 s) y dicta la ficha de 2 obras (≈ 20 s). |

**Pestañas del móvil (Chrome, cuenta de escenario):** pestaña 1 = la app en `/`; pestaña 2 = `/demo`, ya abierta.
**Cuenta de reserva:** sesión iniciada en un **segundo navegador** del mismo móvil (o en un segundo móvil), precargada con «Artista Pro con solicitud». No se toca hasta que haga falta.

## Puntos de control del reloj
| Reloj | Tenemos que estar en… | Si vamos tarde |
|---|---|---|
| **0:15** | Artista empezando a hablar | Cortar el gancho a un dato |
| **1:15** | Segunda ficha creada | Saltar la segunda obra |
| **1:30** | PDF abierto | Si pasamos de **1:40**: saltar el cambio a Pyme (6) |
| **2:02** | Checkout de RevenueCat abierto | Si a **2:25** no está pagado: plan B de la compra |
| **2:45** | Tribunal en 84 | Si pasamos de **2:45**: saltar el MCP (12) |
| **2:52** | Cierre | Cierre pase lo que pase |

---

## Versión completa (3:00)

| # | Tiempo | Pantalla y toques (operador) | Dice el presentador | Plan B: botón de `/demo` (operador) · frase (presentador) |
|---|---|---|---|---|
| 1 | **0:00–0:15** Gancho | `/` (A1): 3 datos con su fuente. Sin toques. | «Uno de cada dos artistas en España ingresa menos del salario mínimo (encuesta Nebrija/UGR). Y no es solo el arte: más de la mitad de las pymes no pide ayudas públicas porque no las conoce, y una de cada cuatro que empieza una solicitud la abandona por complejidad (MuyPymes, 2025). Las ayudas existen. Falta quien haga el papeleo contigo.» | Si `/` no carga: recargar una vez. Si sigue sin cargar: los datos en la diapositiva de [`PITCH.md`](../fleet/pitch/PITCH.md) y pasar a la versión corta con la cuenta de reserva. · «La wifi compite con cien portátiles; un segundo.» |
| 2a | **0:15–0:55** Voz | «Empezar» → «Soy creador/a» (ya marcado) → **«Hablando»** (el micro se abre solo) → la artista contesta → «Siguiente» ×4 → «Terminar». Debajo de cada pregunta van saliendo los chips «Detectado: …». | «[Nombre], cuéntale a Mecena qué haces.» Y **se calla**. Al salir los chips: «Fijaos: va rellenando el perfil mientras habla.» | **El micro no transcribe en 5 s:** «Atrás» hasta «¿Cómo prefieres contárnoslo?» → **«Escribiendo»** y pegar sus respuestas. Si se pierden > 15 s: pestaña 2 → **«Artista de ejemplo»** → «Abre el dossier». · «Con este eco, os enseño a Antía, una ilustradora de A Coruña, hecha con la misma app.» **«Analizando respuesta…» > 8 s:** interruptor **«IA simulada para esta cuenta»** y seguir. · «Seguimos; Mecena va anotando.» |
| 2b | **0:55–1:15** Fotos | «Fotografiar mi obra» → «📷 Hacer foto» → foto de frente → «🎙 Dictar» (título, año, técnica, medidas) → «■ Parar» → «Crear ficha». Repetir con la 2.ª obra. | «Solo endereza y recorta la foto. La obra no se toca, no entrenamos con ella y la última palabra es suya.» | **Cámara falla:** «Elegir de la galería» (fotos hechas por la mañana). **«Escribiendo la ficha…» > 8 s:** **«IA simulada para esta cuenta»**. · «Mientras escribe la ficha: nunca generamos ni modificamos obra.» |
| 3 | **1:15–1:25** Perfil y dossier | «Ver mi dossier →» → `/dossier`: Declaración artística, Biografía, Series y proyectos, Obras, Trayectoria. Bajar despacio. | «Un minuto hablando y dos fotos: declaración, biografía, serie, trayectoria y fichas técnicas. Con sus palabras, no con las nuestras.» | Dossier vacío o pobre: pestaña 2 → **«Artista de ejemplo»** → «Abre el dossier». · «Este es el de Antía, con la entrevista completa.» |
| 4 | **1:25–1:30** PDF | «Descargar PDF» (se abre en otra pestaña) → enseñar 2 s → **volver a la pestaña de Mecena**. | «Y esto es un dossier en PDF, listo para enviar. Es gratis.» | PDF no abre: enseñar `/dossier` («es la misma maqueta») o el PDF de reserva ya descargado. |
| 5 | **1:30–1:45** Convocatorias | «Buscar convocatorias» → `/convocatorias`: tarjetas con importe, plazo, **Por qué encajas** / **Qué te falta** → tocar la primera tarjeta → `/convocatorias/<id>`. | «Convocatorias reales y abiertas, con enlace a las bases. No solo te dice que encajas: te dice por qué y qué te falta. Aquí: [leer una línea de «Qué te falta»].» | Feed vacío o lento: **«IA simulada para esta cuenta»** y recargar. Si sigue vacío: **«Artista de ejemplo»** → «Convocatorias» (Pantallas de la demo). · «Os la enseño con un perfil completo.» |
| 6 | **1:45–1:52** Pyme *(recortable)* | Cabecera: **«Pyme»** → cambian perfil y ayudas (Obradoiro Mareira, cerámica en Lugo) → **«Creador/a»** enseguida → volver a abrir la convocatoria de antes. | «Empezamos por artistas porque nadie les hace esto. Pero el motor es el mismo para una pyme: un toque.» | Pyme vacía: **saltar el paso**. No tocar «Pyme de ejemplo» en escena: borra el perfil de la artista. |
| 7 | **1:52–1:57** «Prepárame la solicitud» | En la convocatoria: **«Prepárame la solicitud»** → `/solicitud/<id>` → **«Prepárame la solicitud»** otra vez → se abre la oferta de Mecena Pro. | «Ahora, lo que de verdad lleva días: la solicitud.» | — |
| 8 | **1:57–2:02** Paywall RevenueCat | Oferta: Pro anual, Pro mensual, Solicitud premium, ancla y garantía. Sin tocar. | «El dossier es gratis; preparar la solicitud es lo que vale dinero. Una consultora se lleva un 10-15 % de tu beca; Mecena, 9 € al mes. Y con garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.» | Planes no cargan («No hemos podido cargar los planes»): plan B de la compra (fila 9). |
| 9 | **2:02–2:20** Compra sandbox | «Pro mensual» → checkout de Web Billing dentro de la hoja → tarjeta **4242 4242 4242 4242**, caducidad futura, CVC cualquiera (email de pruebas si lo pide) → pagar → «Activando tu plan…» → la hoja se cierra y **el borrador empieza solo**. | «Esto es RevenueCat Web Billing en sandbox: una compra de pruebas de verdad, con el entitlement `pro` que desbloquea la solicitud.» | Checkout no carga, tarjeta rechazada o > 10 s: «Ahora no» → **cuenta de reserva** (2.º navegador) → «Abre la solicitud». Sin reserva: pestaña 2 → **«Artista Pro con solicitud»** → «Abre la solicitud». · «El pago de pruebas no carga con esta red; seguimos con una cuenta que ya es Pro.» |
| 10 | **2:20–2:30** Borrador con su voz | «Leyendo las bases… / Usando tus palabras…» → memoria, declaración, presupuesto y documentos → abrir **«Escrito con tus palabras (N)»** en una sección. | «La memoria está escrita con sus palabras: esta frase la ha dicho hace un minuto. Lo que falta lo marca como “[Completa: …]” en vez de inventarlo.» | > 8 s: rellenar («Está leyendo las bases y lo que nos ha contado…»). > 15 s: **cuenta de reserva** o **«Artista Pro con solicitud»** → «Abre la solicitud». · «Mientras piensa, os enseño una ya redactada.» |
| 11 | **2:30–2:45** Tribunal 61 → 84 | Bajar → **«Pasar el tribunal simulado»** → «Los tres jueces están leyendo tu solicitud…» → **61/100** por criterio → (mejoras ya marcadas) **«Aplicar mejoras»** → **84/100**, «+23 puntos tras las mejoras». | «Un tribunal simulado con los criterios y los pesos oficiales de las bases: 61. Aplicamos lo que piden, solo con datos que ella ha dado… 84. Antes de presentarla. Es orientativo, no una probabilidad.» | Antes de tocar «Pasar el tribunal simulado», si el ensayo no dio 61 → 84 fiable: **«Tribunal determinista (plan B)»** (no cambia una nota ya puesta). Si tarda > 8 s: **cuenta de reserva** o **«Artista Pro con solicitud»** → **«Abre el tribunal (61)»** → «Aplicar mejoras». · «Os enseño el tribunal con la solicitud de Antía.» |
| 12 | **2:45–2:52** MCP *(opcional)* | Portátil: Claude Desktop con el prompt escrito: «Hazme el dossier para la convocatoria de artes plásticas de la Diputación y pásamelo en PDF.» → `search_calls`, `build_dossier`, `export_dossier_pdf`. | «Y las mismas herramientas son un servidor MCP: desde Claude Desktop, una frase y tienes el dossier para esa convocatoria.» | **Por defecto, solo decir la frase.** El MCP lee el almacén **local** del portátil, no el de Fly: solo enseñarlo si se ha ensayado con servidor local + túnel ([`docs/mcp.md`](mcp.md)). No responde: saltar sin comentarlo. |
| 13 | **2:52–3:00** Cierre | Volver a `/` o a la diapositiva de tracción. | «Esta noche hemos preguntado a [N] artistas: [X %] [dato de la encuesta]. Tenemos [N] cartas de interés de escuelas y asociaciones. Mecena: tú creas, nosotros hacemos el papeleo. Gracias.» | Sin datos de encuesta ni cartas: solo la frase de marca. **Nunca inventar cifras.** |

Suma: 15 + 40 + 20 + 10 + 5 + 15 + 7 + 5 + 5 + 18 + 10 + 15 + 7 + 8 = **180 s**.

---

## Versión corta (90 s)
Para un turno corto o un directo torcido. Cuenta de escenario hasta la oferta; cuenta de reserva para el tribunal.

| Tiempo | Pantalla y toques | Dice el presentador |
|---|---|---|
| 0:00–0:10 | `/` (A1) | «Uno de cada dos artistas en España ingresa menos del salario mínimo (Nebrija/UGR). Las ayudas existen; nadie se las prepara.» |
| 0:10–0:40 | «Empezar» → «Hablando» → la artista contesta 2 preguntas → «Siguiente» hasta «Terminar» | (calla mientras habla) «Perfil y dossier, mientras habla.» |
| 0:40–0:50 | «Ver convocatorias para mí» → una tarjeta | «Convocatorias reales: por qué encajas y qué te falta.» |
| 0:50–1:05 | Tarjeta → «Prepárame la solicitud» ×2 → oferta → «Ahora no» | «El dossier es gratis; la solicitud se paga: 9 € al mes con RevenueCat, frente al 10-15 % de una consultora. Con garantía de 90 días.» |
| 1:05–1:20 | Cuenta de reserva → «Abre el tribunal (61)» → «Aplicar mejoras» → 84 | «Escrita con sus palabras y puntuada con los criterios oficiales antes de presentarla: de 61 a 84.» |
| 1:20–1:30 | `/` o diapositiva | «[Dato de la encuesta / cartas de interés]. Tú creas; Mecena se encarga del papeleo.» |

---

## Briefing de la artista voluntaria (pásaselo 15 min antes)
Mecena hace **5 preguntas, una por pantalla**. Contesta cada una en **unos 8 segundos**, con tus palabras, sin leer. El operador pasa de pregunta.

| Pregunta en pantalla | Qué decir (ejemplo) |
|---|---|
| ¿Cómo te llamas y desde dónde creas? | «Soy [nombre], [pintora / ilustrador / fotógrafa] y trabajo en [ciudad].» |
| ¿Qué haces? Tu disciplina y tu técnica. | «Trabajo con [técnica], sobre todo [tema].» |
| Háblanos de una serie o un proyecto reciente. | «Mi última serie se llama [serie] y va de [idea].» **Di aquí una frase con personalidad: es la que veremos citada en la memoria.** |
| ¿Exposiciones, premios o formación que quieras contar? | «He expuesto en [sitio] / quedé [premio] / estudié en [escuela].» |
| ¿Qué buscas ahora? | «Busco [una beca de producción / una residencia / un premio] para [proyecto].» |

**Obras (2, máximo 3):** piezas planas o fotos/impresiones de obra (no esculturas grandes), de frente, con buena luz y sin reflejos. Elige las de la serie que nombras. Por cada una, al pulsar «Dictar»: «Esta es [título], de [año], [técnica], [ancho] por [alto] centímetros.»
**Por la mañana:** fotos de esas 2–3 obras en la galería del móvil de demo, y sus 5 respuestas escritas en el portapapeles/notas (plan B «Escribiendo»).
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
- [ ] Cuenta de reserva con sesión en el 2.º navegador, cargada con «Artista Pro con solicitud».
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

**Justo antes de subir (cuenta de escenario, pestaña `/demo`)**
- [ ] **«Tribunal determinista (plan B)»** activado si el ensayo con la clave real no dio 61 → 84 de forma fiable. (Los interruptores sobreviven a «Empezar de cero».)
- [ ] **«IA simulada para esta cuenta»** desactivado (etiqueta «IA: Claude»). Si se cortó un preflight a medias, puede haberse quedado encendido.
- [ ] **«Empezar de cero»** con **«Dejar la pyme de ejemplo para el cambio a Pyme»** marcado → confirmar.
- [ ] Etiquetas: «Pagos: RevenueCat sandbox», «Gratis», «Modo: Creador/a». Pestaña 1 en `/`.

## Qué botón de `/demo` para qué fallo
Todos los escenarios **borran los datos de la cuenta con sesión** (solo esa) y piden confirmación. Los interruptores no borran nada.

| Fallo | Qué tocar en `/demo` | Después |
|---|---|---|
| El micro no reconoce o la entrevista se atasca | «Artista de ejemplo» | «Abre el dossier» → «Descargar PDF» → «Buscar convocatorias» |
| La IA tarda en la entrevista, las fichas o el feed | Interruptor «IA simulada para esta cuenta» | Seguir donde estabas (respuestas instantáneas, menos finas) |
| Claude no responde en absoluto | Interruptor «IA simulada para esta cuenta» | Seguir; avisar en `fly logs` |
| Dossier o convocatorias vacíos | «Artista de ejemplo» | Pantallas de la demo → «Convocatorias» |
| El cambio a Pyme sale vacío | Nada en escena (borraría a la artista) | Saltar el paso 6. Antes de subir: «Empezar de cero» con la casilla de la pyme |
| La compra de RevenueCat falla o tarda > 10 s | Cuenta de reserva; si no, «Artista Pro con solicitud» | «Abre la solicitud» |
| El borrador tarda > 15 s | Cuenta de reserva; si no, «Artista Pro con solicitud» | «Abre la solicitud» → «Pasar el tribunal simulado» |
| El tribunal tarda o no da 61 → 84 | Antes de puntuar: «Tribunal determinista (plan B)». Ya atascado: «Artista Pro con solicitud» | «Abre el tribunal (61)» → «Aplicar mejoras» → 84 |
| Hay que repetir la demo con el siguiente turno | «Empezar de cero» (casilla de la pyme marcada) | `/` en la pestaña 1 |
| «Artista Pro con solicitud» desactivado | — | Falta el email en `DEMO_EMAILS`: usar la cuenta de reserva |

**Desde la terminal** (solo si el móvil no responde): `fly ssh console -C "sh -c 'cd /app && npx tsx scripts/demo-reset.ts --email escenario@… --scenario pro'"` (escenarios: `blank`, `onboarded`, `pro`, `business`). **Nunca** `npm run demo:reset` sin `--email` en Fly durante la demo: borra la base de datos entera, todas las cuentas y sesiones incluidas.
