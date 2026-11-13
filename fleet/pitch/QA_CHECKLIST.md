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
- [ ] Reset completo en < 10 s y la app vuelve a la pantalla A1.

## 3. Recorrido de la demo, paso a paso
**A1 · Datos**
- [ ] Los 3 datos y sus etiquetas coinciden con [`COPY.md`](COPY.md) §1.
- [ ] Los 3 enlaces de fuente abren la página correcta.

**A2 · Confianza**
- [ ] Aparece **antes** de pedir micro y cámara. Los 4 puntos se leen sin hacer scroll.
- [ ] Botones «Soy creador/a» y «Tengo una pyme o soy autónomo/a» llevan al modo correcto.

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

**MCP (opcional)**
- [ ] Claude Desktop lista las 8 tools de Mecena.
- [ ] «Hazme el dossier para la convocatoria [X]» llama a las tools y devuelve el PDF en < 15 s.

## 4. Textos
- [ ] Sin voseo: buscad «querés», «tenés», «podés», «sabés», «hacé», «contá», «vos ».
- [ ] Ninguna cifra que no esté en [`fleet/IDEA.md`](../IDEA.md); nada de «millones sin reclamar».
- [ ] Sin textos en inglés ni claves de traducción a la vista (`profile.title`, `TODO`, `lorem`).
- [ ] Ninguna probabilidad de éxito inventada en «ganadores parecidos».

## 5. Planes B listos
- [ ] Usuario de demo precargado con perfil, dossier, PDF, feed y solicitud con tribunal 61 y 84.
- [ ] Transcripción de respaldo en el portapapeles del móvil y 3 fotos en la galería.
- [ ] PDF del dossier descargado en el móvil.
- [ ] Vídeo de respaldo del recorrido completo en el portátil, probado con el proyector y con sonido.

## 6. Ensayo cronometrado
- [ ] Pasada 1: ____ min ____ s · fallos: __________
- [ ] Pasada 2: ____ min ____ s · fallos: __________
- [ ] Versión corta de 90 s ensayada una vez.
- [ ] Cifras de encuesta y LOIs puestas en el cierre: [X %], [N], [N LOIs].
- [ ] Reset final hecho y móvil en la pantalla A1 justo antes de subir.
