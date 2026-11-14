# Mecena — Textos de la app (listos para pegar)

> Castellano de España, tú/vosotros (nunca voseo). Tono: claro, cálido, sin jerga de IA.
> Los textos de pago (sección 6) son también para **Persona B** (B7).
> Las cifras solo salen de [`fleet/IDEA.md`](../IDEA.md). No inventar ninguna.
> **Posicionamiento: primero artistas.** El modo pyme existe pero es secundario: nunca abre la app ni encabeza una pantalla común.
> No nombrar competidores en la app (eso va solo en el pitch).
> Marcadores `{así}` = variables que rellena la app.

---

## 1 · Pantalla de arranque con datos (A1)

**Título:** Las ayudas existen. Enterarse a tiempo y prepararlas es otro trabajo.

**Dato 1**
- Cifra: **1 de cada 2**
- Texto: artistas en España ingresa menos del salario mínimo.
- Fuente (etiqueta): Encuesta Nebrija/UGR, 2016-17
- URL: https://masdearte.com/especiales/estudio-sobre-la-situacion-economica-de-los-artistas-en-espana/

**Dato 2**
- Cifra: **34 %**
- Texto: de quienes trabajan en cultura son autónomos. En el conjunto de la economía, el 16 %.
- Fuente (etiqueta): Fundación Cotec, 2025
- URL: https://www.bolsamania.com/noticias_amp/economia/economia--el-empleo-en-el-sector-cultural-aumenta-un-17-tras-la-pandemia-frente-al-8-del-conjunto-de-la-economia--19731138.html

**Dato 3**
- Cifra: **< 15 %**
- Texto: de los artistas vive solo de su arte.
- Fuente (etiqueta): Encuesta Nebrija/UGR, 2016-17
- URL: https://masdearte.com/especiales/estudio-sobre-la-situacion-economica-de-los-artistas-en-espana/

**Datos para el modo pyme** (solo dentro del modo pyme, nunca en el arranque)
- Cifra: **+50 %**
- Texto: de las pymes no pide ayudas públicas porque no las conoce. Y 1 de cada 4 que empieza una solicitud la abandona por complejidad.
- Fuente (etiqueta): MuyPymes, oct. 2025
- URL: https://www.muypymes.com/2025/10/02/mitad-pymes-ayudas-publicas-desconocimiento

- Cifra: **+200.000**
- Texto: autónomos con 1 o 2 empleados no pidieron el Kit Digital (hasta 3.000 €) porque creían que no era para ellos.
- Fuente (etiqueta): Autónomos y Emprendedor, abr. 2025
- URL: https://www.autonomosyemprendedor.es/articulo/todo-digital/kit-digital-mas-200000-autonomos-empleados-aun-han-solicitado-fondos-estan-disponibles/20250423164037042217.html

**Cierre de la pantalla:** Mecena te hace el dossier y te prepara las ayudas públicas.
**Botón:** Empezar
**Enlace secundario:** Ver fuentes

---

## 2 · Confianza y posicionamiento (A2) — antes de grabar voz o subir fotos

**Título:** El arte es tuyo; nosotros hacemos el papeleo.

**Puntos** (con icono cada uno):
1. **No tocamos tu obra.** Nunca generamos ni modificamos obra. Con tus fotos solo recortamos, enderezamos y corregimos el color.
2. **No entrenamos con tu obra.** Tus imágenes y tus textos son tuyos y solo se usan para preparar tus solicitudes.
3. **Tú tienes la última palabra.** Cada texto sale de lo que tú cuentas, y puedes cambiarlo todo antes de usarlo.
4. **Nosotros preparamos; tú presentas.** La solicitud la envías tú, con tu certificado digital o Cl@ve. Nunca presentamos nada en tu nombre.

**Botón principal:** Soy artista, empezamos
**Enlace secundario (pequeño, debajo):** ¿Tienes una pyme o eres autónomo/a? Entra aquí

> Nota: el modo creador/a es el camino por defecto; el de pyme es un enlace, no un botón al mismo nivel.
**Letra pequeña:** Puedes cambiar de modo cuando quieras desde tu perfil.

---

## 3 · Alta por voz

### 3.1 Modo creador/a
**Título:** Cuéntanos qué haces.
**Subtítulo:** Habla como si se lo contaras a alguien en tu taller. Mientras hablas, montamos tu perfil y tu dossier.
**Pistas** (chips, se van marcando al detectarse):
- Quién eres y dónde vives
- Tu disciplina y tu técnica
- Una serie o proyecto reciente
- Exposiciones, premios o formación
- Qué buscas ahora (beca, residencia, producción…)

### 3.2 Modo pyme/autónomo
**Título:** Cuéntanos a qué se dedica tu negocio.
**Subtítulo:** Habla con naturalidad. Mientras hablas, montamos el perfil de tu empresa y su memoria de capacidades.
**Pistas** (chips):
- Qué hacéis y desde cuándo
- Dónde estáis y cuántas personas sois
- Proyectos o clientes de los que estés orgulloso/a
- Facturación aproximada (si quieres)
- Qué necesitas: digitalizar, contratar, exportar…

### 3.3 Controles y estados (ambos modos)
| Elemento | Texto |
|---|---|
| Botón grabar | Empezar a hablar |
| Grabando | Te escuchamos… |
| Pausa | Pausar |
| Reanudar | Seguir hablando |
| Terminar | Ya está |
| Alternativa | Prefiero escribir |
| Placeholder del texto | Escribe aquí lo que nos contarías en voz alta… |
| Panel perfil, mientras se rellena | Tu perfil |
| Panel dossier, mientras crece | Tu dossier, en construcción |
| Campo detectado (toast breve) | Anotado: {campo} |
| Permiso de micrófono (antes del diálogo del navegador) | Para escucharte necesitamos el micrófono. Solo lo usamos mientras pulses «Empezar a hablar». |
| Micrófono denegado | No tenemos acceso al micrófono. Actívalo en los ajustes del navegador o escribe tu historia. |
| No se reconoce voz | No te hemos oído bien. Acércate un poco o prueba a escribir. |
| Navegador sin reconocimiento de voz | Este navegador no reconoce la voz. Escríbelo y hacemos lo mismo. |

### 3.4 Fotos de obra (solo creador/a)
| Elemento | Texto |
|---|---|
| Título | Fotografía tu obra |
| Subtítulo | Haz una foto de frente y cuéntanos qué es: título, año, técnica y medidas. |
| Nota de confianza | Solo enderezamos, recortamos y ajustamos el color. Tu obra no se toca. |
| Botón cámara | Hacer foto |
| Botón galería | Elegir de la galería |
| Procesando | Enderezando la foto… |
| Ficha creada | Ficha lista. Revísala cuando quieras. |
| Campos de la ficha | Título · Año · Técnica · Medidas · Serie · Concepto |
| Falta un dato | Nos falta {campo}. Dínoslo o escríbelo. |
| Comparar | Ver original |

---

## 4 · Dossier y PDF
| Elemento | Texto |
|---|---|
| Título (creador/a) | Tu dossier |
| Título (pyme) | Memoria de tu empresa |
| Secciones creador/a | Statement · Series · Obras · Trayectoria |
| Secciones pyme | Actividad · Equipo · Proyectos · Cifras · Datos de la empresa |
| Botón PDF | Descargar PDF |
| Generando PDF | Maquetando tu dossier… |
| PDF listo | Tu dossier está listo. |
| Editar | Editar texto |
| Variante por convocatoria (Pro) | Adaptar a esta convocatoria |
| Explicación variante | {convocatoria} pide {n} imágenes y máximo {mb} MB. Hemos puesto primero {serie}. |

---

## 5 · Convocatorias
| Elemento | Texto |
|---|---|
| Título feed | Ayudas y convocatorias para ti |
| Subtítulo feed (creador/a) | Ayudas públicas, becas, premios y residencias en España |
| Etiquetas de tarjeta | Importe · Plazo · Quién convoca |
| Plazo cercano | Cierra en {n} días |
| Bloque 1 | **Por qué encajas** |
| Bloque 2 | **Qué te falta** |
| Bloque 3 | Las bases, en claro |
| Bloque 4 | Documentos que necesitas |
| Fuente | Ver bases oficiales |
| Botón principal | Prepárame la solicitud |
| Cambio de modo (en el perfil, discreto) | Creador/a · Pyme/autónomo |
| Ganadores parecidos | Proyectos parecidos que ganaron · Orientativo, no es una probabilidad. |

### Borrador y tribunal
| Elemento | Texto |
|---|---|
| Generando | Escribiendo tu solicitud con tus palabras… |
| Etiqueta de cita | Lo dijiste tú |
| Aviso | Es un borrador. Revísalo: tú tienes la última palabra. |
| Botón tribunal | Pasar por el tribunal |
| Tribunal evaluando | El tribunal está leyendo tu solicitud… |
| Resultado | {puntos}/100 según los criterios de las bases |
| Por criterio | {criterio} · {peso} % · {puntos} |
| Botón mejoras | Aplicar mejoras |
| Tras mejorar | Has subido de {antes} a {después}. |
| Aviso legal | Mecena prepara; tú presentas con tu certificado digital. |

---

## 6 · Paywall (también para Persona B, B7)

**Titular:** Tu solicitud, preparada. Tú solo la presentas.
**Subtítulo:** El dossier es gratis. Lo que de verdad lleva horas lo hacemos contigo.

**Puntos:**
- Memoria, statement y presupuesto escritos con tus palabras
- Tribunal simulado con los criterios oficiales de cada convocatoria
- Convocatorias y avisos de plazo ilimitados
- Tu dossier adaptado a lo que pide cada convocatoria

**Productos:**
| Producto | Título | Precio | Línea |
|---|---|---|---|
| Pro anual | Pro anual | 35,88 €/año | Ahorras 12 € frente al mensual (2,99 €/mes) · Recomendado |
| Pro mensual | Pro mensual | 3,99 €/mes | Cancela cuando quieras |
| Solicitud premium | Solo esta solicitud | 15 € | Pago único, sin suscripción |

**Ancla:** Una consultora se lleva entre un 10 y un 15 % de tu ayuda. Con Mecena, menos que un café a la semana.
**Garantía:** Garantía: si en 90 días no has presentado 3 solicitudes, te devolvemos el dinero.
**Botón:** Continuar
**Secundario:** Restaurar compras
**Cerrar:** Ahora no
**Letra pequeña:** Pagos gestionados por RevenueCat. Mecena prepara la solicitud; la presentas tú.

**Estados**
| Estado | Texto |
|---|---|
| Cargando ofertas | Cargando planes… |
| Compra correcta | ¡Listo! Ya tienes Mecena Pro. |
| Compra única correcta | ¡Listo! Vamos con tu solicitud. |
| Cancelada | No pasa nada. Tu dossier sigue siendo tuyo y gratis. |
| Error | No hemos podido completar el pago. No se te ha cobrado nada. Inténtalo de nuevo. |
| Restaurada | Hemos recuperado tu compra. |
| Límite gratis (4.ª convocatoria) | Has visto tus 3 convocatorias gratis de este mes. Con Pro, todas. |

---

## 7 · Estados vacíos y errores
| Pantalla | Texto |
|---|---|
| Perfil vacío | Aún no sabemos nada de ti. Cuéntanoslo en un minuto. · Botón: Empezar a hablar |
| Dossier vacío (creador/a) | Tu dossier aparecerá aquí mientras hablas y fotografías tu obra. |
| Dossier vacío (pyme) | La memoria de tu empresa aparecerá aquí mientras nos cuentas a qué os dedicáis. |
| Sin obras | Aún no hay obras. Haz una foto y cuéntanos qué es. |
| Sin convocatorias | Ahora mismo no hay convocatorias abiertas que encajen contigo. Te avisamos en cuanto salga una. |
| Perfil incompleto para buscar | Cuéntanos un poco más (dónde vives y a qué te dedicas) y te enseñamos lo que encaja. |
| Sin solicitudes | Todavía no has preparado ninguna solicitud. Elige una convocatoria y empezamos. |
| Sin conexión | Sin conexión. Lo que ya tienes sigue aquí; lo nuevo, en cuanto vuelva la red. |
| Error de IA genérico | Algo ha fallado por nuestra parte. Vuelve a intentarlo; no has perdido nada. |
| Cargando genérico | Un momento… |

---

## 8 · Pie y textos legales cortos
- Mecena prepara; tú presentas con tu certificado digital o Cl@ve.
- No generamos ni modificamos obra. No entrenamos con tu obra.
- Las convocatorias enlazan siempre a sus bases oficiales.
