# Ampliar el estándar de datos a toda España

> Encargo para el compañero que lo coja. Contexto: [DATA-STANDARD.md](DATA-STANDARD.md) y el código en `src/features/normalize/`.
> El build cierra el **sábado 14/11/2026 a las 19:00**: haz las tareas en este orden y para donde te pille el tiempo.

## Situación actual

La estructura ya es estatal: las 17 comunidades más Ceuta y Melilla, todas las provincias (con los códigos de región de la BDNS y los INE), beneficiarios, CNAE, importes, edades, criterios y documentos funcionan en toda España.

Solo para Galicia hay:

| Qué | Efecto fuera de Galicia |
|---|---|
| Municipios (313 concellos) | Un perfil de "Getafe" no se reconoce: hay que poner provincia o comunidad |
| Festivos autonómicos | Un plazo en días hábiles de otra comunidad puede salir 1–2 días largo |
| Sinónimos de disciplinas en gallego | "il·lustració" o "eskultura" no se reconocen |
| Certificado ATRIGA | Falta el equivalente de Hacienda foral (País Vasco y Navarra) y de la ATC canaria |

## 1. Ya (unos 30 min)

Con esto el filtro es correcto en toda España y no solo "no rompe".

### 1a. Municipios de toda España

- **Fuente**: el mismo fichero del INE que ya se usó para Galicia, `https://www.ine.es/daco/daco42/codmun/diccionario26.xlsx` (columnas `CODAUTO, CPRO, CMUN, DC, NOMBRE`; 8.132 filas). No hace falta openpyxl: el xlsx es un zip con XML y se lee con `zipfile` + `xml.etree`.
- **Dónde**: `data/taxonomy/territories.json`. Cada municipio es un nodo `{ id: "mun:<CPRO><CMUN>", parent: <NUTS3 de su provincia>, level: "municipality", name, ine, names: [] }`.
- **Provincia → NUTS3**: el mapa está en `territories.json` (campo `ine` de los nodos `province`). Ojo con dos casos:
  - **Baleares (07) y Canarias (35, 38)**: sus NUTS3 son islas, no provincias, y el INE no dice a qué isla pertenece cada municipio. Lo más rápido es colgarlos del nodo de la comunidad (`ES53`, `ES70`). Si sobra tiempo, se cuelgan de cada isla.
  - **Nombres del INE con artículo invertido** ("Rozas de Madrid, Las"): genera también la forma "Las Rozas de Madrid", como ya se hizo con los concellos gallegos.
- **Regla anti-ambigüedad**, que es lo importante. Con 8.000 municipios hay decenas de "Villanueva…", "Santiago…" o "San Martín…", y municipios que se llaman igual que su provincia ("Valencia", "Toledo", "Soria").
  - En `src/features/normalize/territory.ts`, al construir el matcher, deja **fuera del escaneo** (`exactOnly`) a todos los municipios que no sean de Galicia. Así, dentro de un texto libre solo se detectan municipios fuera de Galicia si el texto los nombra exactamente o lleva prefijo ("municipio de", "ayuntamiento de"), y la convocatoria "Residentes en Galicia" no pasa a mencionar un pueblo de Burgos.
  - Cuando un nombre exacto tiene varios candidatos de nivel municipio, el desempate lo hace la provincia del perfil. `profileTerritory` en `profile.ts` ya resuelve ciudad + provincia; añade: "si la ciudad tiene varios candidatos, quédate con el que esté dentro de la provincia o comunidad del perfil".
  - Si la ambigüedad persiste (un perfil con solo `city: "Villanueva de la Torre"` y sin provincia), quédate con la provincia o comunidad del perfil y emite el aviso `territory-ambiguous`. Hay que añadirlo a `WarningCode` en `types.ts`.
- **Tamaño**: el JSON pasa a unos 700 KB. `src/features/normalize` solo debe importarse desde servidor (rutas API, servicios, scripts), nunca desde un componente `"use client"`.
- **Tests** (`tests/normalize/territory.test.ts`): actualiza el test de taxonomía que espera 313 municipios para que espere 8.132 (y 313 en Galicia). Añade casos: "Getafe" ⊂ ES300, "Las Rozas de Madrid" y "Rozas de Madrid, Las", "Valencia" sigue siendo la provincia por defecto, y "Residentes en Galicia" no detecta municipios de fuera.

### 1b. Certificados forales y canarios

En `data/taxonomy/documents.json`, añade:
- `certificado-hacienda-foral`: "Hacienda Foral", "Diputación Foral de Bizkaia/Gipuzkoa/Álava", "Ogasuna", "Hacienda Tributaria de Navarra".
- `certificado-atc`: "Agencia Tributaria Canaria", "ATC".

Y añade un test en `tests/normalize/ranges-docs-criteria.test.ts`.

### 1c. Festivos de todas las comunidades, 2026–2027

- **Fuente**: BOE, *Resolución de la Dirección General de Trabajo por la que se publica la relación de fiestas laborales para el año 2026* (anexo con una columna por comunidad) y la de 2027 si ya está publicada (sale en octubre del año anterior; si no, deja solo 2026).
- **Dónde**: en `data/taxonomy/holidays.json`, dentro de `regional`, una clave por código NUTS2 (`ES61` Andalucía, `ES24` Aragón, `ES51` Cataluña…), con el mismo formato que `ES11`. Solo días laborables (lunes a viernes) que no estén ya en `national`. Incluye el Jueves Santo y los traslados al lunes que fije cada comunidad.
- **Código**: ninguno. `normalizeCall` y `normalizeBdnsRecord` ya aplican los festivos de la comunidad de la convocatoria.
- **Tests**: un caso por comunidad grande en `money-dates.test.ts`. Por ejemplo, un plazo que cruce el 28 de febrero de 2026 en Andalucía (`ES61`) debe saltarse ese día.
- **Antes de commitear**: cambia en `DATA-STANDARD.md` §f la línea de "Limits" y actualiza `sources` en `holidays.json`.

## 2. Si sobra tiempo: disciplinas en catalán y euskera

Solo merece la pena si metéis convocatorias de esas comunidades en el dataset.

- En `data/taxonomy/disciplines.json`, añade sinónimos en catalán/valenciano y euskera a las 51 disciplinas (p. ej. "il·lustració", "escultura", "fotografia", "arts visuals", "arts escèniques"; "argazkigintza", "eskultura", "margolaritza", "arte eszenikoak").
- No hace falta tocar el código: el matcher ya ignora tildes y mayúsculas, y el punto volado de "l·l" se convierte en espacio.
- El test de taxonomía impide que un sinónimo apunte a dos familias: si salta, quita el sinónimo ambiguo.

## 3. No tocar

- El dataset (`data/calls/**`, WP-05) y la demo siguen en Galicia: es lo que pide WP-05 y el pitch.
- Que el estándar sea estatal os deja decir "funciona en toda España" sin mentir.

## Cómo verificar

```bash
npm run typecheck && npm test
```

Todo debe seguir en verde. No toques `src/contracts/**`: si hace falta un campo nuevo, va como contract change request en la PR.
