# Mecena — QA en el móvil real antes de subir al escenario

> Hacedlo con **el móvil de la demo, en la sala, con el proyector**, después de congelar `main` (18:00).
> Dos pasadas completas del [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) cronometradas. Marcad cada casilla; si una falla, apuntad quién la arregla.

## 1. Dispositivo y proyección
- [ ] Batería > 80 % y cargador enchufado hasta salir.
- [ ] No molestar activado; notificaciones y alarmas silenciadas.
- [ ] Bloqueo automático de pantalla desactivado; brillo al máximo; rotación bloqueada en vertical.
- [ ] Navegador actualizado, solo la pestaña de Mecena abierta, zoom al 100 %, sin barra de traducción.
- [ ] Teclado en español (que el autocorrector no cambie nombres propios del artista).
- [ ] Duplicación por **cable USB** funcionando en el proyector; la letra se lee desde la última fila.
- [ ] Segundo móvil con hotspot emparejado; probado cambiar de wifi a hotspot en < 20 s.

## 2. Red y acceso
- [ ] La URL HTTPS (túnel o despliegue) abre en el móvil con la wifi del FIC **y** con el hotspot.
- [ ] El certificado es válido (sin aviso de seguridad), condición para micro y cámara.
- [ ] `ANTHROPIC_API_KEY` y clave de RevenueCat cargadas en el entorno que sirve la app (no en mocks por error).
- [ ] Reset completo en < 10 s y la app vuelve a la pantalla A1 («Empezar de cero» en `/demo`, con confirmación).
- [ ] `npm run demo:preflight` en verde contra la URL desplegada (login, config, entitlements, convocatorias open, PDF válido, escenario, panel B2B con 3 miembros, sin 500; no gasta IA). En la reserva, con `--load pro`: además las 3 facturas asignadas con aviso, la foto de ejemplo leída con la IA simulada (se borra sola) y `/justificacion/<id>` y `/panel` sin 500.
- [ ] `flyctl status` correcto y `DEMO_EMAILS` con el email de la cuenta de demo (sin él, «Artista Pro con solicitud» sale desactivado).

## 3. Recorrido de la demo, paso a paso
**A1 · Datos**
- [ ] Los 3 datos y sus etiquetas coinciden con [`COPY.md`](COPY.md) §1.
- [ ] Los 3 enlaces de fuente abren la página correcta.

**A2 · Confianza**
- [ ] Aparece **antes** de pedir micro y cámara. Los 4 puntos se leen sin hacer scroll.
- [ ] «Soy artista, empezamos» es el botón principal y lleva al modo creador/a; el enlace secundario de pyme lleva al modo pyme.
- [ ] Ninguna pantalla común (arranque, confianza, paywall) habla primero de pymes; los datos de pymes solo aparecen dentro del modo pyme.

**Voz → perfil + dossier**
- [ ] Permiso de micrófono ya concedido (no sale el diálogo).
- [ ] Reconocimiento en **es-ES**; con el ruido de la sala la transcripción avanza.
- [ ] En 60 s se rellenan perfil (nombre, ciudad, disciplina, técnica, serie) y dossier (statement, serie, trayectoria) **sin recargar**.
- [ ] «Prefiero escribir» + pegar la transcripción de respaldo produce el mismo resultado.

**Fotos**
- [ ] Permiso de cámara ya concedido; la cámara trasera abre.
- [ ] 3 fotos → 3 fichas con título, año, técnica y medidas tomados de la voz.
- [ ] La obra **no** aparece alterada (solo enderezada/recortada); «Ver original» funciona.
- [ ] Elegir de la galería funciona como alternativa.

**PDF**
- [ ] «Descargar PDF» genera el PDF en < 5 s y se abre en el móvil.
- [ ] Imágenes nítidas, sin texto cortado, tildes y eñes correctas.

**Convocatorias**
- [ ] Salen 4–6 convocatorias reales con importe, plazo y enlace a las bases.
- [ ] Cada tarjeta tiene «Por qué encajas» y «Qué te falta» coherentes con lo que dijo el artista.
- [ ] Ningún plazo aparece ya vencido el 14/11/2026.
- [ ] En una convocatoria con concesiones, **«Ganadores parecidos a ti»** sale con importes reales y la nota «Orientativo, no es una probabilidad» (sin porcentajes). Comprobar cuál es la primera tarjeta que lo tiene.
- [ ] Cambio creador ↔ pyme en un toque: cambian perfil y convocatorias; volver deja todo como estaba.

**Paywall + RevenueCat**
- [ ] «Prepárame la solicitud» abre la paywall (y la 4.ª convocatoria también).
- [ ] Se cargan los 3 productos con precios en EUR (9 €/mes, 79 €/año, 15 €) y los textos de [`COPY.md`](COPY.md) §6, garantía incluida.
- [ ] Compra **sandbox** completa en el móvil (datos de prueba a mano) en < 15 s.
- [ ] Tras la compra se desbloquea el entitlement `pro` sin recargar; se ve en el panel de RevenueCat.
- [ ] «Restaurar compras» y el **usuario de demo ya Pro** funcionan (plan B).
- [ ] Cancelar el checkout vuelve a la app sin romper nada.

**Borrador + tribunal**
- [ ] El borrador se genera en streaming y contiene **frases literales** del artista marcadas.
- [ ] Presupuesto solo con partidas que admiten las bases; checklist de documentos presente.
- [ ] Tribunal: puntuación inicial ~61 con comentario por criterio y pesos de las bases.
- [ ] «Aplicar mejoras» sube a ~84. Tiempo total del paso < 20 s.
- [ ] Aviso «Mecena prepara; tú presentas» visible.

**Justificación** *(cuenta de reserva con «Artista Pro con solicitud»)*
- [ ] `/justificacion/<id>` abre con 3 facturas ya asignadas, **al menos una partida pasada de presupuesto** con aviso rojo y **sin memoria**.
- [ ] «Fotografiar una factura» abre la cámara; con la factura impresa, la factura sale **asignada a una partida** y aparece un aviso nuevo en < 8 s (con la IA simulada, siempre: Imprenta Ártabra, 1.450,00 €, «Edición del catálogo»).
- [ ] «Preparar la memoria» devuelve las secciones y la «Cuenta justificativa» con las cifras en < 8 s.
- [ ] Tras el ensayo, **volver a cargar «Artista Pro con solicitud»** en la reserva (3 facturas, sin memoria).

**Panel B2B** *(cualquier cuenta cargada con un escenario)*
- [ ] `/panel` muestra «Escuela de Artes Atlántico (ejemplo)» con **3 miembros que ya aceptaron**, cada uno con sus convocatorias abiertas que encajan, y los próximos plazos; sin la etiqueta «Datos de demostración».
- [ ] No aparece ningún dossier, obra ni borrador de los miembros (solo nombre, disciplina, lugar, convocatorias y plazos).
- [ ] Recargar un escenario no duplica la escuela ni los miembros.

**MCP (opcional)**
- [ ] Claude Desktop lista las 8 tools de Mecena (se enseña en la demo, ≈ 15 s; plan B: solo la frase).
- [ ] «Hazme el dossier para la convocatoria [X]» llama a las tools y devuelve el PDF en < 15 s.

## 4. Textos
- [ ] Sin voseo: buscad «querés», «tenés», «podés», «sabés», «hacé», «contá», «vos ».
- [ ] Ninguna cifra que no esté en [`fleet/IDEA.md`](../IDEA.md); nada de «millones sin reclamar».
- [ ] Sin textos en inglés ni claves de traducción a la vista (`profile.title`, `TODO`, `lorem`).
- [ ] Ninguna probabilidad de éxito inventada en «ganadores parecidos».
- [ ] La app no nombra competidores (solo el pitch, y siempre «según su web»).

## 5. Planes B listos
- [ ] Panel `/demo` probado: «Artista de ejemplo», «Artista Pro con solicitud» (tribunal 61 → 84, 3 facturas, escuela con 3 miembros) y «Pyme de ejemplo» cargan en la cuenta con sesión, sin tocar otras; todos dejan la escuela de ejemplo en `/panel`.
- [ ] Interruptores «Tribunal determinista (plan B)» e «IA simulada para esta cuenta» probados y vueltos a apagar antes de la demo si hay clave real.
- [ ] Cuentas de reserva creadas antes de subir (el límite por IP del recinto puede bloquear altas).
- [ ] Guion con plan B por paso: [`docs/demo-script.md`](../../docs/demo-script.md).
- [ ] Transcripción de respaldo en el portapapeles del móvil y 3 fotos en la galería.
- [ ] PDF del dossier descargado en el móvil.
- [ ] Vídeo de respaldo del recorrido completo en el portátil, probado con el proyector y con sonido.

## 6. Ensayo cronometrado
- [ ] Pasada 1: ____ min ____ s · fallos: __________
- [ ] Pasada 2: ____ min ____ s · fallos: __________
- [ ] Versión corta de 90 s ensayada una vez.
- [ ] Puntos de control del reloj (0:40 · 1:05 · 1:42 · 2:07 · 2:32 · 2:47) cumplidos en las dos pasadas; el cambio de navegador a la reserva (justificación) en ≤ 3 s.
- [ ] Cierre ensayado en ≤ 13 s (desde 2:47) con las cifras reales: 37 convocatorias, 213 concesiones. Sin encuesta ni LOIs.
- [ ] Reset final hecho y móvil en la pantalla A1 justo antes de subir.
