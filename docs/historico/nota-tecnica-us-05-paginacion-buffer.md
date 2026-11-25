# Nota técnica — US-05: consultar el padrón con paginación en dos niveles

## 1. Contexto

La pantalla `/empleados/activos` es la vista de entrada al expediente: lista a las personas
activas y desde ahí se inicia cualquier trámite. El backend expone `GET /api/padron`, que ya
pagina en el servidor con un máximo de 100 registros por petición (RN-08) y devuelve un
`total` sobre el conjunto filtrado.

El problema de una paginación ingenua es el costo por clic: cada `Siguiente` sería una
petición nueva. Esta entrega mantiene la página lógica pequeña para la persona y pide bloques
grandes para la red: la UI muestra 20 filas, el navegador pide 100 registros y sirve cinco
páginas de esa misma respuesta. Moverse dentro del bloque es un `slice` local; solo al cruzar
el borde del bloque sale una petición.

## 2. Contrato consumido

| Aspecto | Valor |
|---|---|
| Endpoint | `GET /api/padron` |
| Parámetros | `buscar`, `pagina`, `por_pagina` |
| `pagina` | 1-based, sobre el bloque solicitado |
| `por_pagina` | 1–100; 20 por defecto en el backend |
| Respuesta | `datos[]`, `meta { pagina, por_pagina, total, total_paginas }`, `enlaces` |
| Orden | `num_empleado`, `id` (determinista) |
| Errores | `400` criterio inválido, `401` sesión, `403` permiso, `429` límite, `503` servicio |

El cliente no usa `offset`/`limit`: el contrato es de páginas de backend. `meta.pagina`,
`meta.por_pagina` y `meta.total_paginas` describen **el bloque pedido**, no la página lógica.
Por eso la UI deriva sus páginas de `meta.total` y nunca de `meta.total_paginas`.

## 3. Dos niveles: página lógica y bloque de red

| Tamaño lógico | Bloque pedido | Páginas por bloque | Peticiones para 250 registros |
|---:|---:|---:|---:|
| 10 | 100 | 10 | 3 |
| 20 (por defecto) | 100 | 5 | 3 |
| 50 | 100 | 2 | 3 |
| 100 | 100 | 1 | 3 |

El bloque es siempre el **mayor múltiplo del tamaño lógico que no supere 100**:

```text
bloque = floor(100 / porPagina) * porPagina
```

Así cada bloque es exactamente divisible entre páginas lógicas y no quedan restos que
desalineen el `slice`. Con la página por defecto (20), un bloque de 100 cubre cinco páginas.

La página lógica se calcula desde el `total` del backend:

```text
totalPaginas = max(1, ceil(total / porPagina))
```

`totalPaginas` es lo que ve la persona y lo que viaja en la URL; `meta.total_paginas` queda
fuera de la UI porque cuenta bloques, no páginas.

## 4. El buffer (`PaginatedBuffer<T>`)

Archivo: `src/app/core/pagination/paginated-buffer.ts`.

Es genérico y no conoce el padrón: recibe un cargador `(pagina, porPagina) => Observable<…>` y
expone señales (página, filas, total, desde/hasta, indicadores de carga, error). La pantalla
decide cómo se ve cada cosa.

### 4.1 Estados de carga

| Situación | Señal | Efecto visual |
|---|---|---|
| Primera carga, sin filas | `cargandoInicial` | Esqueleto de la tabla |
| Cambio de bloque, con filas | `cargandoBloque` | Filas actuales intactas + línea `role="status"` con `aria-live="polite"` |
| Caché acertada | ninguna | Cambio local, sin petición |
| Error | `error` + `paginaObjetivo` | Aviso con acción; la página visible no se mueve |

Regla: **el esqueleto se reserva para el primer load**. Una vez que hay filas, nunca se
reemplazan por esqueletos; se conserva lo que la persona está leyendo.

### 4.2 Caché: TTL y LRU

| Parámetro | Valor | Constante |
|---|---|---|
| TTL por bloque | 5 minutos | `TTL_BLOQUE_PADRON` |
| Bloques en memoria | 3 (hasta 300 registros) | `BLOQUES_EN_CACHE_PADRON` |
| Bloque máximo | 100 | `BLOQUE_MAX_PADRON` |
| Página lógica | 20 | `PAGINA_LOGICA_PADRON` |

- El mapa de bloques usa el orden de inserción como orden LRU: cada acierto reinserta el
  bloque al final y el más viejo se descarta al superar los tres.
- Un bloque vencido **no se borra**: se conserva como las filas que la pantalla muestra
  mientras llega su reemplazo. Si la recarga falla, la última respuesta sigue visible en lugar
  de dejar la lista en blanco.
- Un acierto de caché cancela cualquier bloque en vuelo, para que una respuesta tardía de la
  página 6 no pise la página 5 que la persona acaba de abrir.

### 4.3 Cancelación

El equivalente Angular de `AbortController` es la suscripción: cada solicitud entra a un
`switchMap`, así que una nueva solicitud desuscribe la anterior; `HttpClient` aborta el XHR
subyacente al desuscribirse. `destruir()` (llamado desde `DestroyRef` en el store) libera la
última suscripción cuando la pantalla se va. Además, cada resultado lleva un `id` y se
descarta si ya no es el último, de modo que una respuesta tardía no puede escribir señales.

### 4.4 Invalidación

| Evento | Método | Caché | Página |
|---|---|---|---|
| Cambia el término (no vacío → otro) | `reiniciar()` | Se descarta completa | Vuelve a 1 |
| Cambia el tamaño de página | `cambiarPorPagina()` | Se descarta completa | Vuelve a 1 |
| Actualizar / tras una baja | `recargar()` | Conserva **solo** el bloque visible | Se mantiene |
| Reintentar | `reintentar()` | Sin cambios | Reintenta `paginaObjetivo` |

`recargar()` descarta los bloques que no se ven porque el padrón cambió: un `total` cacheado
antes de la mutación contradiría el total fresco y podría llevar a la pantalla a una página del
conjunto viejo. El bloque visible se conserva porque son las filas que la persona está leyendo.
Si el conjunto encogió y la página actual ya no existe, el buffer retrocede a la última válida y
pide ese bloque.

### 4.5 Enlaces profundos y fallos

- `iniciar(pagina)` adopta la página de la URL de inmediato y pide el bloque que la contiene,
  así una recarga del navegador abre donde dice.
- Si un salto falla, la página visible no se mueve y `paginaObjetivo` recuerda el destino: el
  botón **Reintentar** vuelve a pedir ese bloque, no el que quedó en pantalla.
- Una página fuera de rango se ignora en el buffer, de modo que una URL inventada no gasta una
  petición.

## 5. Store del padrón

Archivo: `src/app/core/padron/padron-buffer.store.ts`.

`PadronBufferStore` está provisto **por la pantalla** (`providers: [PadronBufferStore]`), no en
la raíz: filtro, página y bloques pertenecen a una visita. Enlaza el `PadronService` con el
buffer y traduce la respuesta de la API al tipo `PaginaBuffer`:

```text
items   ← respuesta.datos
pagina  ← respuesta.meta.pagina
tamano  ← respuesta.meta.por_pagina
total   ← respuesta.meta.total
```

`aplicarBusqueda()` normaliza el término con `trim()` y no reinicia si es el mismo que ya se
está aplicando.

## 6. La pantalla

Archivos:
`src/app/features/empleados/empleados-page.component.{ts,html,scss}`.

### 6.1 Controles

- **Buscar**: campo con `label` real, `aria-describedby`, mensaje de error con ícono.
- **Actualizar**: recarga el bloque visible conservando las filas.
- **Filas por página**: `select` con `10, 20, 50, 100`, por defecto 20.
- **Primera / Anterior / Siguiente / Última** y **Ir a página** con rango validado.
- Todos los controles que pedirían un bloque se deshabilitan durante una carga o una espera de
  `429`.

### 6.2 URL

Solo se sincroniza `?pagina=`:

- Página 1 elimina el parámetro (URL canónica limpia).
- Un cambio de página empuja una entrada de historial, para que el botón **Atrás** funcione.
- Normalizar un valor inválido (`0`, `abc`, `06`) o corregir la URL tras un salto fallido usa
  `replaceUrl`, sin agregar historial.
- El término de búsqueda **nunca** se escribe en la URL: el backend evita registrarlo en claro en
  su auditoría, y la URL lo dejaría en el historial del navegador.

Un efecto observa la página del buffer y la escribe en la URL; la suscripción a
`queryParamMap` hace el camino inverso. Un guard (`paginaEnUrl`) evita el eco entre ambos.

### 6.3 Validación de la búsqueda (RN-07)

Archivo: `src/app/core/padron/validacion-busqueda.ts`.

Espejo en cliente de la regla del backend:

| Término | Resultado |
|---|---|
| Vacío o solo espacios | Válido: padrón completo |
| Solo dígitos, ≤ 20 | Válido: número de empleado |
| Solo dígitos, > 20 | Error: máximo 20 dígitos |
| Letras, espacios, apóstrofo, guion, punto, ≤ 150 | Válido: nombre parcial |
| Dígitos y letras mezclados | Error: un número es solo dígitos; un nombre no lleva números |
| Metacarácteres (`%`, `_`, `\`, `@`, comillas…) | Error de formato |
| Nombre > 150 | Error de longitud |

La validación se evalúa en cada `input`, así que el formato se explica mientras se escribe. Un
término inválido no viaja. Si el backend fuera más estricto y respondiera `400`, se muestra
**su** mensaje, el término queda en el campo y no se ofrece reintento: la respuesta no va a
cambiar sin editar el criterio.

La búsqueda se debounce a 300 ms para no pedir un bloque por tecla.

### 6.4 Errores

| Estado | Mensaje | Acción |
|---|---|---|
| `400` | El `mensaje` del contrato | Ninguna; se corrige el término |
| `401` | «Tu sesión venció…» | Iniciar sesión (limpia el token) |
| `403` | «No tenés permisos…» | Ninguna; se muestra el `codigo` |
| `429` | Espera indicada por el backend | Reintentar bloqueado con cuenta regresiva |
| `503` | «El servicio no está disponible…» | Reintentar |
| `0` (red) | «No pudimos conectar…» | Reintentar |
| Otro | Servicio no disponible | Reintentar |

Cada caso se distingue por texto, ícono (✕) y acción, no solo por color.

Durante un `429` la navegación queda congelada. Si la persona escribe mientras espera, el
término se guarda y se aplica al terminar la cuenta: la espera silencia la red, no pierde lo
escrito.

### 6.5 Presentación

Solo tokens semánticos (`--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--motion-*`), sin
valores crudos. Verificado en los tres temas (`guinda`, `light`, `dark`) y con
`prefers-reduced-motion`: el indicador de bloque es estático, no pulsa.

## 7. Pruebas

| Archivo | Pruebas | Qué cubre |
|---|---:|---|
| `src/app/core/pagination/paginated-buffer.spec.ts` | 13 | Bloques y páginas, aciertos sin petición, cruce de borde, última página parcial, enlace profundo, TTL sin borrar filas, LRU de 3, cancelación, recarga, reintento del destino, cambio de tamaño, conjunto que encoge, destrucción |
| `src/app/core/padron/padron-buffer.store.spec.ts` | 7 | Parámetros del endpoint, cortes locales, siguiente bloque, búsqueda que invalida, tamaño lógico, recarga y reintento |
| `src/app/core/padron/validacion-busqueda.spec.ts` | 7 | RN-07 completa: vacío, dígitos, longitud, mixto, acentos y puntuación |
| `src/app/features/empleados/empleados-page.component.spec.ts` | 23 | Tabla, alta, estados, cinco páginas por bloque, última parcial, flechas decorativas de primera/última, salto validado, esqueleto solo inicial, vacío, `400`, debounce, tamaño de página, URL y enlace profundo, `429`, `503`, reintento del salto, `403`, `401`, red, drawer y baja |

La suite completa queda en **274 pruebas en 36 archivos, todas en verde**. `npm run lint:styles`
pasa y `ng build` compila sin advertencias de presupuesto.

## 8. Decisiones y compromisos

- **Bloque de 100, no de 20.** Menos peticiones por sesión de lectura, a costa de hasta 300
  registros en memoria. El contrato ya acota la respuesta a 100, así que no se amplía la
  superficie de datos.
- **`recargar()` conserva solo el bloque visible.** Evita que un total viejo contradiga al nuevo
  y que un paso atrás caiga en una página del conjunto anterior. El costo es que volver a un
  bloque anterior después de actualizar cuesta una petición.
- **TTL de 5 minutos.** Equilibrio entre frescura y navegación fluida; una baja o un alta
  invalidan de inmediato, sin esperar al TTL.
- **La URL no lleva la búsqueda.** Privacidad sobre comodidad de compartir un enlace filtrado.
- **El cliente valida RN-07, pero no la reemplaza.** El backend sigue siendo la autoridad; el
  espejo solo evita un viaje obvio y explica el formato antes.

## 9. Archivos de la entrega

| Pieza | Archivo |
|---|---|
| Buffer genérico | `src/app/core/pagination/paginated-buffer.ts` |
| Store del padrón | `src/app/core/padron/padron-buffer.store.ts` |
| Validación RN-07 | `src/app/core/padron/validacion-busqueda.ts` |
| Pantalla | `src/app/features/empleados/empleados-page.component.{ts,html,scss}` |
| Pruebas | los cuatro `*.spec.ts` de la tabla anterior |

## 10. Fuera de alcance / siguientes pasos

- Prefetch del bloque siguiente: se evaluó y se dejó fuera para no gastar cuota del límite de
  60 consultas por minuto sin una señal de uso.
- Persistir la caché entre visitas: hoy vive en memoria y muere con la pantalla.
- Exportación, filtros por área y ordenamiento configurable: siguen fuera de US-05.
