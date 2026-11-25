# Módulo de padrón

`/empleados` es la vista de entrada al expediente: lista a todo el personal con pestañas por estatus y desde ahí se abre cualquier trámite. La lectura es de solo lectura; el listado no crea, no modifica y no elimina filas.

## 1. Archivos

| Archivo | Contenido |
| --- | --- |
| `src/app/core/padron/padron.models.ts` | `PadronResponse`, `PadronMeta`, `EmpleadoPadron`, `PadronError` |
| `src/app/core/padron/padron.service.ts` | `GET /padron` y la construcción de parámetros |
| `src/app/core/padron/validacion-busqueda.ts` | Espejo en cliente de RN-07 |
| `src/app/core/padron/padron-buffer.store.ts` | Store provisto por la pantalla; traduce la respuesta a `PaginaBuffer` |
| `src/app/core/pagination/paginated-buffer.ts` | Primitiva de paginación en dos niveles (ver `paginacion.md`) |
| `src/app/features/empleados/empleados-page.component.*` | Pantalla, controles, URL, estados y drawers |

## 2. Contrato `GET /padron`

Base `${environment.apiBaseUrl}` = `http://localhost:8080/api`; ruta `${base}/padron` (`padron.service.ts:30`).

### 2.1 Parámetros

| Parámetro | Tipo | Cuándo viaja | Fuente |
| --- | --- | --- | --- |
| `buscar` | string | Solo si `trim()` no queda vacío; se envía ya recortado | `padron.service.ts:44-47` |
| `pagina` | integer | Solo si `params.pagina !== undefined` | `padron.service.ts:48-50` |
| `por_pagina` | integer | Solo si `params.porPagina !== undefined` | `padron.service.ts:51-53` |

Un término vacío **no** se envía como `buscar=`: el backend leería una búsqueda de la cadena vacía y la búsqueda exige la capacidad `E-12`, así que un `buscar=` vacío cambiaría un listado por un `403` (`padron.service.ts:42-47`).

### 2.2 Respuesta

`PadronResponse` llega **en la raíz**, sin sobre `data` (`padron.models.ts:49-54`):

| Campo | Forma |
| --- | --- |
| `datos[]` | `id`, `num_empleado`, `nombre`, `area` (`{ id, nombre }` o `null`), `estado` (`'Activo' \| 'Baja'`) (`padron.models.ts:9-29`) |
| `meta` | `pagina`, `por_pagina`, `total`, `total_paginas` (`padron.models.ts:31-37`) |
| `enlaces` | `anterior`, `siguiente` (URLs o `null`); se conservan por contrato pero **no** se usan para navegar (`padron.models.ts:39-47`) |

`meta` describe el **bloque** pedido, no la página lógica. Por eso la UI deriva sus páginas de `total` y nunca de `meta.total_paginas` (`padron.models.ts:31-37`; ver `paginacion.md`).

`PadronError` usa `mensaje` —no `message`— y puede traer `codigo` y `reintentar_en_segundos` (`padron.models.ts:56-69`). Leer `message` dejaría todos los fallos sin texto.

## 3. Búsqueda: RN-07

La autoridad de la regla es `docs/requerimiento-16-us-05-consultar-padron.md` (RN-07 y «Detalle de la búsqueda»). El espejo en cliente vive en `src/app/core/padron/validacion-busqueda.ts:11-40`; el backend sigue siendo quien decide, y el espejo solo evita gastar una de las 60 consultas por minuto y explica el formato mientras se escribe.

| Término | Resultado | Línea |
| --- | --- | --- |
| Vacío o solo espacios | Válido: padrón completo | `12-17` |
| Solo dígitos, ≤ 20 | Válido: número de empleado exacto | `19-22` |
| Solo dígitos, > 20 | «El número de empleado no puede superar los 20 dígitos.» | `21` |
| Dígitos y letras mezclados | «Un número de empleado es solo dígitos; un nombre no puede contener números.» | `24-27` |
| Nombre > 150 | «El nombre no puede superar los 150 caracteres.» | `29-31` |
| Letras (con acentos y marcas), espacios, apóstrofo, guion y punto, con al menos una letra | Válido | `33-37` |
| Puntuación sin una sola letra, `%`, `_`, `\`, `@`, comillas u otro metacaracter | «El nombre solo admite letras, espacios, apóstrofo, guion o punto.» | `35-37` |

Orden de las comprobaciones: vacío → solo dígitos (longitud) → contiene algún dígito (mixto) → longitud 150 → alfabeto. Un término inválido no viaja.

## 4. Pantalla `EmpleadosPage`

### 4.1 Tabla y columnas

Tres columnas (`empleados-page.component.ts:272-276`):

| `key` | Encabezado | Alineación |
| --- | --- | --- |
| `num_empleado` | Núm. empleado | `end` |
| `nombre` | Nombre | — |
| `area` | Área | — |

`estado` no es columna: viaja en la fila y se pinta como bandera inicial y sello (`empleados-page.component.ts:286-294`, `empleados-page.component.html:210-218`). Un área ausente se imprime `—` (`SIN_DATO`, `empleados-page.component.ts:48-53`). La tabla usa `mobileMode="cards"`, `rowKey="id"` y `clickableRows` (`empleados-page.component.html:189-202`).

### 4.2 Búsqueda con debounce

El campo valida en cada `input` y agenda la búsqueda con `debounceTime(300)`; la constante es `RETRASO_BUSQUEDA = 300` ms (`empleados-page.component.ts:42-43`, `363-365`, `415-424`). El mensaje de formato aparece de inmediato, antes del debounce (`421`). Un término inválido no cancela el debounce pero se descarta al evaluar (`627-643`).

### 4.3 Sincronización con `?pagina=`

| Regla | Implementación |
| --- | --- |
| Solo se sincroniza la página; el término nunca entra a la URL | `empleados-page.component.ts:102-105` |
| Página 1 elimina el parámetro | `sincronizarUrl`, `826-833` |
| Cambio de página empuja historial | `sincronizarUrl(pagina, false)` desde el efecto, `373-380` |
| Normalizar la URL (`0`, `abc`, `06`) usa `replaceUrl` | Constructor, `357-361` |
| Un salto fallido devuelve la URL a la página visible sin agregar historial | Efecto, `384-393` |
| El guard `paginaEnUrl` evita el eco entre efecto y `queryParamMap` | `265-266`, `800-820` |
| Durante un `429` la navegación queda congelada y la URL se corrige con `replaceUrl` | `809-815` |

La página inicial se lee de `route.snapshot.queryParamMap` y se pasa a `store.iniciar(paginaInicial)` (`351-355`).

### 4.4 Pestañas de estado

`filtrosEstado` declara cuatro (`empleados-page.component.ts:188-193`):

| `id` | Etiqueta | `disponible` | Estado real |
| --- | --- | --- | --- |
| `todos` | Todos | `false` | Pendiente del contrato |
| `activo` | Activos | `true` | Única operativa; es la lista ya visible |
| `baja_definitiva` | Bajas definitivas | `false` | Pendiente |
| `licencia` | Licencias | `false` | Pendiente |

Las tres pendientes se dibujan con `aria-disabled` y `aria-describedby` hacia la explicación (`empleados-page.component.html:139-170`). `filtrarEstado` ignora las no disponibles en vez de filtrar las filas ya cargadas: filtrar en cliente contaría y paginaría un bloque como si fuera el padrón entero, y la línea de rango y el paginador mentirían (`empleados-page.component.ts:521-535`). El contador de cada pestaña está reservado y vacío a propósito (`empleados-page.component.html:152-157`).

### 4.5 Densidad

`densidad` es solo presentación: `compact`, `standard` y `comfortable`, con `standard` por defecto (`empleados-page.component.ts:164-177`). Cambiarla repinta; no consulta, no descarta caché y no reinicia la página (`511-519`). El control vive en el pie de la hoja con `aria-pressed` (`empleados-page.component.html:239-250`).

### 4.6 `429` con cuenta regresiva y búsqueda diferida

| Paso | Implementación |
| --- | --- |
| El backend dice cuántos segundos esperar; se adopta su número, no una suposición | `segundosDeEspera`, `empleados-page.component.ts:738-746` |
| La espera se cuenta con `setInterval` de 1 s y se limpia en `DestroyRef` | `iniciarEspera`, `749-761`; `412` |
| Todos los controles que pedirían un bloque se deshabilitan mientras `espera() > 0` | `controlesDeshabilitados`, `332-349` |
| Un término escrito durante la espera se guarda y se aplica al terminar | `busquedaDiferida`, `635-640`, `763-774` |
| Si el `429` no trae número, se muestra un mensaje sin cuenta y se permite reintentar | `696-709`, `38-39` |

### 4.7 Toast

`ToastService` se usa en dos eventos: alta exitosa («Empleado registrado.» + número) y edición exitosa («Empleado actualizado correctamente.» + número). En ambos casos la pantalla recarga el bloque visible (`empleados-page.component.ts:597-624`). Una baja no hace toast: solo recarga (`579-582`).

## 5. `PadronBufferStore`

No es `providedIn: 'root'`: lo provee la pantalla (`empleados-page.component.ts:122-124`), porque filtro, página y bloques pertenecen a una visita (`padron-buffer.store.ts:19-27`). El mecanismo completo está en `paginacion.md`.

| Aspecto | Implementación |
| --- | --- |
| Constantes | `PAGINA_LOGICA_PADRON = 20`, `BLOQUE_MAX_PADRON = 100`, `BLOQUES_EN_CACHE_PADRON = 3`, `TTL_BLOQUE_PADRON = 5 * 60 * 1000` (`padron-buffer.store.ts:7-17`) |
| Traducción de la respuesta | `items ← datos`, `pagina ← meta.pagina`, `porPagina ← meta.por_pagina`, `total ← meta.total` (`33-44`) |
| Búsqueda | `aplicarBusqueda` normaliza con `trim()` y no reinicia si es el mismo término (`101-109`) |
| Inicio | `iniciar(pagina)` es idempotente: la primera llamada gana (`89-95`) |
| Destrucción | `DestroyRef.onDestroy` llama a `buffer.destruir()` (`84-86`) |
| URL | **No** la toca: la sincronización vive en la página (`empleados-page.component.ts:351-393`) |

El store reexpone las señales del buffer (página, filas, total, rango, carga, error, bloque) y añade tres métodos que el buffer no tiene tal cual: `aplicarBusqueda`, `iniciar` idempotente y el cableado con `PadronService` (`padron-buffer.store.ts:53-135`).

## 6. Estados y errores

| Estado | Qué se ve | Fuente |
| --- | --- | --- |
| Primera carga, sin filas | Esqueleto de la tabla (`cargandoInicial`) | `empleados-page.component.html:196` |
| Cambio de bloque con filas | Filas intactas + línea `role="status"` «Cargando la página N…» | `112-117` |
| Vacío | Tres causas: fallo sin datos, búsqueda sin coincidencias, padrón sin activos | `mensajeVacio`, `empleados-page.component.ts:296-304` |
| `400` | Mensaje del backend; el término queda en el campo; acción `ninguna` | `666-679` |
| `401` | «Tu sesión venció…» + acción «Iniciar sesión» que limpia el token | `680-687`, `566-570` |
| `403` | «No tienes permisos para consultar el padrón.» + `codigo` visible | `688-695` |
| `429` | Mensaje con la espera anunciada; reintento bloqueado por la cuenta | `696-709` |
| `503` | «El servicio no está disponible…» + «Reintentar» al bloque que falló | `710-717`, `435-441` |
| `0` (red) | «No pudimos conectar con el servidor…» + reintento | `718-725` |
| Otro | «El servicio no está disponible…» + reintento | `718-725` |

Cada caso se distingue por texto, ícono ✕ y acción, no solo por color; el `role="alert"` anuncia el fallo al renderizar (`empleados-page.component.html:74-104`).

## 7. Acciones por fila

| Acción | Cómo | Condición |
| --- | --- | --- |
| Abrir ficha | Clic en la fila o botón del nombre; ambos terminan en `abrirFicha` | Siempre |
| Abrir edición | Lápiz dentro de la ficha → `editarEmpleado(id)` | `puedeEditarEmpleado` (`ADMIN`, `SUPER_ADMIN`, `SISTEMAS`) |
| Abrir alta | Botón «Nuevo empleado» del encabezado | No tiene condición de rol en el cliente |

`abrirFicha` lee el `id` de la fila devuelta por la tabla, no lo recalcula desde la página (`empleados-page.component.ts:537-553`). `abrirFichaDesdeNombre` detiene la propagación para no disparar dos veces la misma acción (`555-564`). `editarEmpleado` cierra la ficha, fija el id y abre el tercer drawer (`139-143`).

## 8. Pendientes del requerimiento 16

| Pieza | Estado |
| --- | --- |
| Pestaña «Bajas definitivas» | **Pendiente**: `disponible: false`; requiere `?estado=` y `contadores` del servidor |
| Pestañas «Todos», «Licencias» y «Bajas definitivas» | Implementadas: `GET /api/empleados?estatus=` filtra en SQL |
| Contadores por estado en las pestañas | Implementados: `contadores` en la respuesta, sin filtro de pestaña |
| Filtros por área, puesto, categoría o jornada | **Pendiente**: no existen parámetros en el contrato actual |
| Ordenamiento configurable por columnas | **Pendiente** |
| Exportación a CSV/Excel/PDF | **Pendiente** |

## Referencias

- `docs/requerimiento-16-us-05-consultar-padron.md`
- `docs/nota-tecnica-us-05-paginacion-buffer.md`
- `src/app/core/padron/padron.models.ts`
- `src/app/core/padron/padron.service.ts`
- `src/app/core/padron/validacion-busqueda.ts`
- `src/app/core/padron/padron-buffer.store.ts`
- `src/app/core/pagination/paginated-buffer.ts`
- `src/app/features/empleados/empleados-page.component.ts`
- `src/app/features/empleados/empleados-page.component.html`
- `src/app/app.routes.ts`
