# Módulo: Semáforo de completitud

## 1. Propósito

`/semaforo-documentos` responde una sola pregunta: **quién debe documentos, entre los activos**.
Filtra el padrón activo por el estado de completitud que calcula el backend y abre el expediente del
trabajador.

| Pieza | Archivo |
| --- | --- |
| Ruta lazy | `src/app/app.routes.ts:99-103` |
| Pantalla / plantilla | `src/app/features/semaforo/semaforo-page.component.ts` · `.html` |
| Contratos | `src/app/core/semaforo/semaforo.models.ts` |
| Servicio | `src/app/core/semaforo/semaforo.service.ts` |
| Etiquetas de estado | `src/app/features/semaforo/estado-expediente.component.ts:5-9` |

## 2. Contrato `GET /semaforo`

`SemaforoService.consultar()` solo construye la cadena de consulta; la autenticación la pone
`authInterceptor` (`semaforo.service.ts:7-22`).

| Parámetro | Tipo | Valores permitidos | Origen |
| --- | --- | --- | --- |
| `buscar` | string | número de empleado o nombre | `buscar()` |
| `estado` | `EstadoExpediente` | `completo` \| `casi_completo` \| `incompleto` | `estado()`; `undefined` = Todos |
| `pagina` | number | ≥ 1 | `pagina()` |
| `por_pagina` | number | `10`, `25`, `50`, `100` | `porPagina()`, inicial `25` |
| `ordenar_por` | `OrdenSemaforo` | `num_empleado` \| `nombre` \| `estado` \| `campos_faltantes` | `orden()`, inicial `num_empleado` |
| `direccion` | `DireccionSemaforo` | `asc` \| `desc` | `direccion()`, inicial `asc` |

Los tipos están en `semaforo.models.ts:5-6`; la consulta completa en `:7-14`.

**Descarte de parámetros vacíos** (`semaforo.service.ts:15-20`): se omite el valor `undefined`; los
strings pasan por `trim()` y se omiten si quedan `''`. Los números no se recortan. Así,
`buscar: '  '` no envía el parámetro en absoluto —no `buscar=`— y `estado: undefined` no viaja
(`semaforo.service.spec.ts:51-56`).

## 3. Forma de la respuesta

`SemaforoResponse` (`semaforo.models.ts:36-41`): `datos`, `contadores`, `meta`, `enlaces`. `meta` y
`enlaces` se reutilizan de `src/app/core/padron/padron.models.ts:32-47`.

| Bloque | Campos | Uso en pantalla |
| --- | --- | --- |
| `datos[]` | `id`, `num_empleado`, `nombre`, `area \| null`, `puesto \| null`, `semaforo` | filas de la tabla |
| `datos[].semaforo` | `estado`, `porcentaje`, `total_campos`, `campos_completos`, `campos_faltantes` | estado de la fila y columna Completitud |
| `contadores` | `total_evaluados`, `completos`, `casi_completos`, `incompletos` | cifra de cada pestaña |
| `meta` | `pagina`, `por_pagina`, `total`, `total_paginas` | rango y paginador |
| `enlaces` | `anterior`, `siguiente` | se recibe, no se usa para navegar |

`ContadoresSemaforo` en `semaforo.models.ts:30-35`. El servidor los calcula sobre el universo
autorizado y la búsqueda, **antes** del filtro de estado y de la página: por eso una pestaña puede
marcar 231 con la tabla vacía. `meta.total_paginas` es la única fuente del total de páginas
(`semaforo-page.component.ts:174`); no se deriva del largo de `datos`.

## 4. Estado del expediente: no es una columna

Se dibuja en dos lugares y ninguno depende solo del color:

1. **Carril inicial de la fila** (`semaforo-page.component.html:141-145`): `app-row-flag` con
   `tone="row.estado"` y `label="Estado del expediente: <etiqueta>"`. El carril mide `--space-1`,
   es absoluto y `aria-hidden`; la frase equivalente va en un `visually-hidden`
   (`row-flag.component.ts:30-31`). Colores por rol semántico (`row-flag.component.scss:24-34`):
   verde `completo`, ámbar `casi_completo`, rojo `incompleto`. Exige que la celda esté posicionada,
   y eso solo ocurre con `[leadingDecoration]="true"` (`row-flag.component.ts:16-21`; plantilla
   línea 124).
2. **Sello en la celda Completitud** (`semaforo-page.component.html:159-165`): `.seal` con la palabra
   del estado y, debajo, `campos_faltantes / total_campos`. Doble anillo del rol del estado con tinta
   primaria (`semaforo-page.component.scss:358-382`); con `forced-colors` se restituye como contorno
   (`:384-397`).

`EstadoExpedienteBadge` (`estado-expediente.component.ts:18-43`) envuelve `app-status-pill` y
proyecta un glifo de trazo: círculo con palomita (`completo`), guion (`casi_completo`), signo de
admiración (`incompleto`) (`:30-36`). **Hoy ninguna plantilla lo monta**: la pantalla solo importa el
mapa `ESTADOS_EXPEDIENTE` (`semaforo-page.component.ts:25,145`) y dibuja carril y sello por su
cuenta. Queda como pieza disponible, con pruebas propias (`estado-expediente.component.spec.ts`).

## 5. Pantalla

### Filtros

Cuatro pestañas que filtran un mismo listado: `role="group"` de botones con `aria-pressed`, no un
`tablist` (`semaforo-page.component.html:96-112`). Cada una lleva título, pista y contador del
servidor.

| Etiqueta | `estado` | Pista | Contador |
| --- | --- | --- | --- |
| Todos | `undefined` | Expedientes evaluados | `total_evaluados` |
| Completos | `completo` | Sin pendientes | `completos` |
| Casi completos | `casi_completo` | De 1 a 3 campos | `casi_completos` |
| Incompletos | `incompleto` | 4 campos o más | `incompletos` |

Definición en `semaforo-page.component.ts:114-134`; mientras carga, el contador imprime `—`.

### Tabla

`app-data-table` con `variant="ledger"`, `mobileMode="cards"`, `clickableRows`, `leadingDecoration`,
`activeKey` y densidad propia (`semaforo-page.component.html:119-138`). Columnas
(`semaforo-page.component.ts:146-151`):

| Clave | Encabezado | Ordenable |
| --- | --- | --- |
| `num_empleado` | No. | sí |
| `nombre` | Nombre | sí |
| `adscripcion` | Adscripción y plaza | no |
| `campos_faltantes` | Completitud (alineada al final) | sí |

`Adscripción y plaza` es una celda de dos líneas: `area.nombre` sobre `puesto.nombre`, con
`Sin adscripción` / `Sin plaza` cuando el backend manda `null` (`semaforo-page.component.ts:156-166`;
plantilla `:153-158`).

**Ordenamiento**: la tabla pinta `aria-sort` (`ascending` / `descending` / `none`) y un botón por
cabecera con `aria-label` explícito (`data-table.component.html:46-87`). `ordenar()` acepta
`estado | num_empleado | nombre | campos_faltantes`, invierte la dirección solo si se repite la
misma clave en `asc` y reinicia a página 1 (`semaforo-page.component.ts:295-301`). `estado` es
ordenable en el contrato pero **no** tiene columna que lo emita hoy.

**Densidad**: `compacta | estándar | amplia`, por omisión `estándar`; solo presentación, sin consulta
(`semaforo-page.component.ts:137-143,286-294`).

**Paginación**: `app-pagination` modo `full` con rango, selector de tamaño y salto validado contra
`1..total_paginas` (`semaforo-page.component.html:189-207`; `semaforo-page.component.ts:180-216,
340-354`). Cambiar búsqueda, filtro, orden o tamaño vuelve a la página 1.

### Carga y errores

La búsqueda espera 300 ms; un `Subject` + `switchMap` cancela la petición superada
(`semaforo-page.component.ts:218-259`). Las consultas idénticas se evitan comparando la consulta
serializada, salvo `force` (`:261-274`). Si `meta.pagina` excede `meta.total_paginas`, se corrige la
página y se repite la consulta (`:227-232`).

| Status | Mensaje | Acción ofrecida |
| --- | --- | --- |
| `401` | Tu sesión venció. Inicia sesión nuevamente. | Iniciar sesión → `/login` |
| `403` | No tienes permiso para consultar el semáforo de completitud. | ninguna (sin reintento) |
| `429` | Has realizado varias consultas. Espera un momento antes de reintentar. | Reintentar |
| otro / red | No pudimos cargar los expedientes. Revisa tu conexión e intenta nuevamente. | Reintentar |

Mapeo en `semaforo-page.component.ts:235-248`; botones en `semaforo-page.component.html:71-87`. El
cuerpo del error del servidor nunca se imprime.

### Capas que abre

| Capa | Disparador | Componente |
| --- | --- | --- |
| Ficha del expediente | clic en la fila o en el enlace del nombre | `app-ficha-drawer` (plantilla `:220-227`) |
| Edición | lápiz de la ficha, solo con `puedeEditarEmpleado(rol())` | `app-editar-drawer` (`:229-233`) |

**Alta no está montada**: la pantalla importa solo `FichaDrawer` y `EditarDrawer`
(`semaforo-page.component.ts:23-24,32-43`). La ficha tampoco pide el detalle de faltantes: recibe
`[completitud]` con el `semaforo` de la fila abierta, leído del listado y no copiado al hacer clic
(`semaforo-page.component.ts:96-102`), de modo que el avance se imprime sin segunda petición. Tras
guardar una edición o registrar una baja se fuerza una nueva consulta del listado (`:373-390`).

## 6. Acceso

- **Menú**: `Semáforo de documentos`, sección Operación
  (`src/app/layout/sidebar/sidebar.component.html:253-281`).
- **Panel general**: la capa de `Expedientes completos` navega a `/semaforo-documentos`
  (`dashboard-page.component.html:128-133`).
- **De vuelta**: `Volver al panel` → `/` (`semaforo-page.component.html:16-27`).

## 7. Permisos

La capacidad es **`E-08`** (`docs/matriz-permisos-expediente.md:44`). El cliente **no** replica la
matriz: no crea permisos, no deriva capacidades del rol y no filtra el listado. El backend autoriza;
si niega, la pantalla muestra la frase y no ofrece reintento, porque un `403` no cambia por repetir
la petición. Abrir la ficha exige `E-02`, permiso distinto que hoy puede faltar en roles que sí
listan (`docs/matriz-permisos-expediente.md:59-79`).

## 8. Estado real del alcance

| Elemento | Estado |
| --- | --- |
| Listado con búsqueda, estado, orden, tamaño y paginación | implementado |
| Contadores del servidor en las pestañas | implementado |
| Carril de estado + sello + frase para lectores de pantalla | implementado |
| Ficha con bloque de completitud | implementado |
| Edición desde el lápiz, con recarga del listado | implementado |
| `GET /semaforo/{id}/faltantes` | **no existe**: `SemaforoService` solo expone `consultar()` (`semaforo.service.ts:13-22`) y no hay componente de faltantes |
| Correo o edición masiva | no implementados (fuera de alcance) |
| `EstadoExpedienteBadge` en la tabla | no: se usa `RowFlag` + `.seal` |

## Referencias

- `src/app/app.routes.ts`
- `src/app/core/semaforo/semaforo.models.ts`
- `src/app/core/semaforo/semaforo.service.ts` · `.spec.ts`
- `src/app/features/semaforo/semaforo-page.component.ts` · `.html` · `.scss`
- `src/app/features/semaforo/estado-expediente.component.ts`
- `src/app/shared/ui/row-flag/row-flag.component.ts` · `.scss`
- `src/app/shared/ui/data-table/data-table.component.html`
- `src/app/shared/ui/pagination/pagination.component.ts`
- `src/app/layout/sidebar/sidebar.component.html`
- `docs/matriz-permisos-expediente.md`
