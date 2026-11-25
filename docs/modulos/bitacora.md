# Módulo de bitácora

`/bitacora` es la consulta de solo lectura de los movimientos del backoffice. Lista los registros con filtros y paginación en servidor, y permite abrir el detalle de un movimiento para revisar sus snapshots e IP. No crea, modifica ni elimina registros.

## 1. Archivos

| Archivo | Contenido |
| --- | --- |
| `src/app/core/bitacora/bitacora.models.ts` | Contratos del listado, del detalle y del error |
| `src/app/core/bitacora/bitacora.service.ts` | `GET /bitacora` y `GET /bitacora/{id}` con construcción de parámetros |
| `src/app/core/bitacora/bitacora-acciones.ts` | Catálogo legible de acciones, agrupado por módulo |
| `src/app/core/bitacora/bitacora-modulos.ts` | Catálogo legible de módulos |
| `src/app/features/bitacora/bitacora-page.component.*` | Pantalla: filtros, tabla, paginación, URL, errores y apertura del detalle |
| `src/app/features/bitacora/bitacora-detalle-drawer.component.*` | Drawer de detalle con snapshots e IP |

## 2. Rutas y navegación

- Ruta: `/bitacora` dentro del `AppShell`, declarada en `src/app/app.routes.ts` con `data: { breadcrumb: 'Bitácora' }`.
- Entrada en la sección «Sistema» del sidebar (`src/app/layout/sidebar/sidebar.component.*`), después de «Catálogos».
- La entrada solo se muestra a `SUPER_ADMIN` y `SISTEMAS` (`puedeVerBitacora`); otros roles no la ven, pero si acceden por URL el backend responde `403` y la pantalla lo muestra.

## 3. Contratos HTTP

Base `${environment.apiBaseUrl}`.

### 3.1 Listado `GET /bitacora`

Parámetros enviados solo cuando aplican (tras recorte/validación en cliente):

| Parámetro | Origen en UI | Notas |
| --- | --- | --- |
| `modulo` | Campo de texto | Exacto, recortado; vacío no viaja |
| `accion` | Campo de texto | Exacto, recortado; vacío no viaja |
| `correo` | Campo de correo | Correo válido, máx. 150 | Búsqueda **exacta**; el front lo normaliza a minúsculas. |
| `buscar` | Campo de búsqueda | Recortado; debounce 300 ms; búsqueda parcial **solo por nombre**; **no se sincroniza en URL** |
| `fecha_desde` / `fecha_hasta` | Campos de fecha | `YYYY-MM-DD` |
| `orden` | Selector | Solo se envía `asc`; `desc` se omite (default del backend) |
| `pagina` | Paginador | ≥ 1 |
| `por_pagina` | Selector de tamaño | 10, 20, 50 o 100 |

Respuesta: `{ datos, meta, enlaces }` en raíz. El listado no incluye `datos_antes`, `datos_despues` ni `ip`. `meta` aporta `pagina`, `por_pagina`, `total`, `total_paginas`; la navegación se hace por número de página, no por `enlaces`.

### 3.2 Detalle `GET /bitacora/{id}`

Se solicita al abrir el drawer de una fila. Respuesta: `{ datos }` con el movimiento y además `ip`, `datos_antes`, `datos_despues` (snapshots JSON o `null`).

### 3.3 Errores

`BitacoraError` admite `mensaje` o `message` (el `403` usa `message`), además de `codigo`, `campo` y `reintentar_en_segundos`.

La pantalla traduce estados a mensajes y acciones:
- `400`: marca el campo indicado (`campo`) y conserva lo escrito.
- `401`: aviso con «Iniciar sesión».
- `403`: aviso final sin reintento.
- `404` (detalle): mensaje en drawer y opción «Recargar listado».
- `429`: cuenta regresiva con `reintentar_en_segundos`, controles deshabilitados; contador compartido entre listado y detalle.
- `503` o sin conexión (`status 0`): aviso recuperable con «Reintentar», conservando filtros y página.

## 4. Comportamiento de la pantalla

- **Estado inicial:** carga desde URL (`pagina`, `orden`, `modulo`, `accion`, `correo`, `fecha_desde`, `fecha_hasta`, `por_pagina`) y normaliza valores inválidos con `replaceUrl`.
- **Filtros:** **módulo** y **acción** con catálogos legibles (`bitacora-modulos.ts` y `bitacora-acciones.ts`), el primero plano y el segundo agrupado por módulo; **correo** del usuario en lugar de `usuario_id`; fechas inclusivas; `buscar` con debounce de 300 ms y coincidencia parcial solo sobre el nombre del usuario. Cambiar filtros, orden o tamaño reinicia a página 1. Un código fuera de catálogo que llegue en la URL se agrega como opción «Código: …» para no perderlo.
- **URL:** sincroniza filtros, orden, página y tamaño (omite defaults); `buscar` no se escribe en la URL. Cambios del usuario usan navegación normal; normalizaciones usan `replaceUrl`.
- **Tabla:** `app-data-table` en modo `ledger`, `density="compact"`, `fitWidth` y `mobileMode="cards"`, filas clicables y la descripción como control accesible (`app-row-link`) para abrir el detalle con teclado. Columnas: Fecha, Nombre, Módulo y Descripción (ya no hay columna «Acción» ni «Detalle»). La descripción es genérica y sale del catálogo de acciones —«Alta de empleado», «Baja de empleado», «Cambio de adscripción de empleado»—; el texto original queda en `title` y en el drawer. Sin scroll horizontal: `fitWidth` aplica `table-layout: fixed` con anchos porcentuales (18/26/18/38 %) y las celdas largas se truncan con elipsis. Fecha mostrada en `America/Mexico_City`.
- **Paginación:** `app-pagination` en modo `full` con tamaños 10/20/50/100; durante recarga de página se conservan filas previas.
- **Detalle:** `BitacoraDetalleDrawerComponent` se presenta como una libreta física sobre el escritorio, con el mismo lenguaje visual del expediente del empleado (`src/styles/tokens/_paper.scss`): cubierta dorada, encuadernación en espiral, hoja lisa con margen rojo, tipografía de máquina de escribir y sello del tipo de movimiento. Usa el `Drawer` en modo `bare` y `size="lg"`, con una barra propia para el título y «Cerrar».
- **Contenido del detalle:** nombre del usuario, fecha larga, descripción, acción/módulo (humanizados, con el valor técnico en `title`), usuario/correo/IP y snapshots en tablas legibles (campo/valor) con etiquetas y valores en lenguaje claro para personas no técnicas. Los datos se renderizan como texto (sin `innerHTML`). `null`/vacíos se muestran como «Sin datos» o «Sin información» según corresponda, y la IP ausente como «No registrada».
- **Usuario de la ficha:** ya no se muestra `usuario_id`. La ficha tiene dos campos: «Usuario» con el nombre y «Correo» con el valor que envía `GET /bitacora/{id}` en `correo` (o `usuario_correo`). Si el correo no llega, se imprime «Sin información».
- **IDs legibles:** `BitacoraEtiquetasService` resuelve las llaves foráneas de los snapshots (`empleado_id`, `estado_civil_id`, `nivel_estudios_id`, `area_id`, `puesto_id`, `categoria_cct_id`) contra `GET /empleados/formulario` y `GET /empleados/{id}`. En la libreta se ve el nombre (p. ej. «María Rodríguez» o «Divorciado»), nunca el número. Si la consulta falla, se muestra «(sin nombre disponible)» en lugar del ID; el catálogo se guarda en memoria durante la sesión y los nombres de empleado se cachean por ID.
- **Sin redundancias:** si un snapshot trae la llave y su descripción (`estado_civil_id` y `estado_civil`), el drawer imprime una sola fila por etiqueta y conserva el valor con nombre.

## 5. Pruebas

- `src/app/core/bitacora/bitacora.service.spec.ts`: construcción de parámetros HTTP.
- `src/app/core/bitacora/bitacora-etiquetas.service.spec.ts`: resolución de IDs a nombres y respaldo cuando falla el catálogo.
- `src/app/features/bitacora/bitacora-page.component.spec.ts`: carga, filtros/orden/paginación, estados de error, 429, detalle 404, sincronización URL y exclusión de `buscar`.
- `src/app/features/bitacora/bitacora-detalle-drawer.component.spec.ts`: estados de detalle, snapshots nulos y formato.
- `src/app/app.routes.spec.ts`: declaración de `/bitacora`.
- `src/app/layout/sidebar/sidebar.component.spec.ts`: visibilidad de la entrada por rol.
