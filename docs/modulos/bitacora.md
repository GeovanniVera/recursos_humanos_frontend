# Módulo de bitácora

`/bitacora` es la consulta de solo lectura de los movimientos del backoffice. Lista los registros con filtros y paginación en servidor, y permite abrir el detalle de un movimiento para revisar sus snapshots e IP. No crea, modifica ni elimina registros.

## 1. Archivos

| Archivo | Contenido |
| --- | --- |
| `src/app/core/bitacora/bitacora.models.ts` | Contratos del listado, del detalle y del error |
| `src/app/core/bitacora/bitacora.service.ts` | `GET /bitacora` y `GET /bitacora/{id}` con construcción de parámetros |
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
| `usuario_id` | Campo numérico | Entero ≥ 1 |
| `buscar` | Campo de búsqueda | Recortado; debounce 300 ms; **no se sincroniza en URL** |
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

- **Estado inicial:** carga desde URL (`pagina`, `orden`, `modulo`, `accion`, `usuario_id`, `fecha_desde`, `fecha_hasta`, `por_pagina`) y normaliza valores inválidos con `replaceUrl`.
- **Filtros:** módulo/acción/usuario con validación en cliente (patrones y rangos) antes de consultar; fechas inclusivas; `buscar` con debounce de 300 ms. Cambiar filtros, orden o tamaño reinicia a página 1.
- **URL:** sincroniza filtros, orden, página y tamaño (omite defaults); `buscar` no se escribe en la URL. Cambios del usuario usan navegación normal; normalizaciones usan `replaceUrl`.
- **Tabla:** `app-data-table` en modo `ledger`, `density="compact"`, `mobileMode="cards"`, filas clicables y botón «Ver detalle» por accesibilidad de teclado. Fecha mostrada en `America/Mexico_City`.
- **Paginación:** `app-pagination` en modo `full` con tamaños 10/20/50/100; durante recarga de página se conservan filas previas.
- **Detalle:** `BitacoraDetalleDrawerComponent` muestra actor, acción, módulo, usuario/IP y snapshots en tablas legibles (campo/valor) con etiquetas y valores en lenguaje claro para personas no técnicas. Los datos se renderizan como texto (sin `innerHTML`). `null`/vacíos se muestran como «Sin datos» o «Sin información» según corresponda, y la IP ausente como «No registrada».

## 5. Pruebas

- `src/app/core/bitacora/bitacora.service.spec.ts`: construcción de parámetros HTTP.
- `src/app/features/bitacora/bitacora-page.component.spec.ts`: carga, filtros/orden/paginación, estados de error, 429, detalle 404, sincronización URL y exclusión de `buscar`.
- `src/app/features/bitacora/bitacora-detalle-drawer.component.spec.ts`: estados de detalle, snapshots nulos y formato.
- `src/app/app.routes.spec.ts`: declaración de `/bitacora`.
- `src/app/layout/sidebar/sidebar.component.spec.ts`: visibilidad de la entrada por rol.
