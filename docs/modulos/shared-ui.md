# Componentes compartidos (`src/app/shared/ui/`)

Catálogo de las primitivas de interfaz que las pantallas de `src/app/features/` y el shell componen en lugar de reimplementar. Todos son componentes standalone; ninguno declara un color, un radio o una duración propios.

## 1. Inventario

| Selector | Clase | Archivo | Estado |
| --- | --- | --- | --- |
| `app-alert-banner` | `AlertBanner` | `alert-banner/` | Usado en dashboard, empleados, catálogos y semáforo |
| `app-animated-backdrop` | `AnimatedBackdrop` | `animated-backdrop/` | Solo login |
| `app-brand-logos` | `BrandLogos` | `brand-logos/` | Solo sidebar |
| `app-button` | `Button` | `button/` | Transversal |
| `app-data-table` | `DataTable` | `data-table/` | Empleados, catálogos, semáforo y `/ui` |
| `app-drawer` | `Drawer` | `drawer/` | Ficha, alta y edición de empleado |
| `app-kpi-card` | `KpiCard` | `kpi-card/` | Dashboard |
| `app-modal` | `Modal` | `modal/` | Dashboard, catálogos, credential-card y `/ui` |
| `app-page-header` | `PageHeader` | `page-header/` | Cabecera de pantallas |
| `app-pagination` | `Pagination` | `pagination/` | Empleados, catálogos y semáforo |
| `app-row-flag` | `RowFlag` | `row-flag/` | Empleados y semáforo (dentro de `#cell`) |
| `app-row-link` | `RowLink` | `row-link/` | Empleados y semáforo (dentro de `#cell`) |
| `app-status-pill` | `StatusPill` | `status-pill/` | Sin montar hoy: solo lo compone `EstadoExpedienteBadge`, que ninguna plantilla usa |
| `app-toast-container` | `ToastContainer` | `toast/` | Montado en `App` |
| — | `ToastService` | `toast/toast.service.ts` | Servicio raíz |

No existe ningún otro componente bajo `shared/ui/`.

## 2. Catálogo por componente

### `app-alert-banner` — `AlertBanner`

Banner de estado sobre cristal, con disco tintado e ícono de trazo en lugar de relleno sólido, para que los botones proyectados conserven contraste en los tres temas (`alert-banner.component.ts:9-16`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `variant` | `'error' \| 'warning' \| 'info' \| 'success'` | `'error'` |
| `role` | `'alert' \| 'status' \| null` | `null` (se deriva del `variant`) |
| `title` | `string \| null` | `null` |
| `message` | `string \| null` | `null` |
| `messages` | `readonly string[]` | `[]` |
| `code` | `string \| null` | `null` |
| `detail` | `string \| null` | `null` |

Sin salidas (`alert-banner.component.ts:23-29`).

Contenido proyectado:

| Slot | Dónde aterriza |
| --- | --- |
| `<ng-content />` (por defecto) | Dentro de `.alert-copy`, después de `messages` y antes de `code` (`alert-banner.component.html:44`) |
| `[alert-actions]` | Como último hijo del banner, fuera del bloque de texto (`:53`) |

`role` se resuelve así: si se pasa explícito, manda; si no, `error` y `warning` producen `role="alert"` e `info` y `success` producen `role="status"` (`alert-banner.component.ts:31-38`).

### `app-animated-backdrop` — `AnimatedBackdrop`

Fondo decorativo del login: tres auroras, cuadrícula enmascarada con haz, tres anillos y partículas. No ejecuta JavaScript; cada capa es un elemento animado por la hoja con tokens `--backdrop-*` (`animated-backdrop.component.ts:11-18`).

| Entradas | Salidas | Contenido |
| --- | --- | --- |
| Ninguna | Ninguna | Ninguno |

Host con `aria-hidden="true"` (`animated-backdrop.component.ts:23`) y `pointer-events: none` (`animated-backdrop.component.scss:13`). El número de partículas está fijado en la constante `PARTICLE_COUNT = 22` (`:9`), espejo del token `--backdrop-particles` que CSS no puede usar para dimensionar un `@for`. Con `prefers-reduced-motion` las animaciones se apagan y haz y partículas se ocultan (`animated-backdrop.component.scss:223-241`).

### `app-brand-logos` — `BrandLogos`

Los dos logotipos institucionales, siempre dentro de una caja blanca opcional, con respaldo a placeholder punteado si el archivo falta (`brand-logos.component.ts:3-13`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `variant` | `'sm' \| 'lg' \| 'mark'` | `'sm'` |
| `showCaption` | `boolean` | `false` |
| `plated` | `boolean` | `true` |

Sin salidas ni contenido (`brand-logos.component.ts:28-41`). `mark` renderiza solo el escudo de la UTN, para el rail de 76 px; en esa variante no se dibuja el segundo logo (`brand-logos.component.html:26-44`). Las rutas de imagen son `brand/logo-utn.svg` y `brand/logo-edomex.svg`, servidas desde `public/` (`brand-logos.component.ts:44-45`). Un fallo de carga activa el placeholder con el texto `LOGO UTN` / `LOGO GOB. EDOMEX` (`brand-logos.component.html:15-19, 38-42`).

### `app-button` — `Button`

El único botón del sistema: un `<button>` real, con la etiqueta proyectada y un spinner decorativo que no reemplaza el texto (`button.component.ts:9-20, 33-38`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` |
| `size` | `'md' \| 'sm'` | `'md'` |
| `type` | `'button' \| 'submit'` | `'button'` |
| `disabled` | `boolean` | `false` |
| `loading` | `boolean` | `false` |

Sin salidas. Contenido: `<ng-content />` dentro del `<button>`, admite texto, un `<svg>` o ambos (`button.component.html:18`). `loading` implica `disabled` y añade `aria-busy="true"` (`button.component.ts:38`, `button.component.html:5`). El `<button>` emite su `click` nativo; el componente no declara una salida que solo reenviaría.

### `app-data-table` — `DataTable`

Tabla semántica sobre tarjeta de cristal, con dos modos responsive y dos tratamientos de superficie (`data-table.component.ts:63-71`). Detalle completo en la sección 4.

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `columns` | `readonly TableColumn[]` | `[]` |
| `rows` | `readonly TableRow[]` | `[]` |
| `loading` | `boolean` | `false` |
| `mobileMode` | `'cards' \| 'scroll'` | `'scroll'` |
| `leadingDecoration` | `boolean` | `false` |
| `sort` | `{ key: string; direction: 'asc' \| 'desc' } \| null` | `null` |
| `actionsLabel` | `string` | `''` |
| `emptyMessage` | `string` | `'No hay registros para mostrar.'` |
| `caption` | `string` | `''` |
| `activeKey` | `string \| number \| null` | `null` |
| `rowKey` | `string` | `'id'` |
| `variant` | `'plain' \| 'ledger'` | `'plain'` |
| `density` | `'compact' \| 'standard' \| 'comfortable'` | `'standard'` |
| `clickableRows` | `boolean` | `false` |

| Salida | Tipo | Cuándo se emite |
| --- | --- | --- |
| `sortChange` | `string` | Clic en una cabecera con `sortable: true`; emite la `key` de la columna |
| `rowClick` | `TableRow` | Clic en una fila, **solo** si `clickableRows` es `true` |

Plantillas proyectadas: `#cell`, `#headCell` y `#rowActions` (sección 4.3).

### `app-drawer` — `Drawer`

Panel lateral sobre `<dialog>` nativo (`drawer.component.ts:17-23`). Detalle en la sección 5.

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `title` | `string` | `''` |
| `open` | `model<boolean>` | `false` |
| `bare` | `boolean` | `false` |
| `dismissible` | `boolean` | `true` |
| `side` | `'right' \| 'left'` | `'right'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'sm'` |

Sin salidas de tipo `output`: `open` es un `model`, por lo que se enlaza con `[(open)]` o `[open]` + `(openChange)` (`drawer.component.ts:32`).

Contenido: `<ng-content />` como cuerpo; plantilla `#actions` para el pie, solo cuando `bare` es `false` (`drawer.component.html:32-41`).

### `app-kpi-card` — `KpiCard`

Indicador de panel, genérico respecto al dominio: recibe la cifra ya formateada y decide cómo pintarla (`kpi-card.component.ts:13-24`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `label` | `string` | **requerida** |
| `value` | `string` | **requerida** |
| `tone` | `'success' \| 'danger' \| 'warning'` | `'success'` |
| `hint` | `string` | sin valor |
| `icon` | `'activos' \| 'bajas' \| 'semaforo'` | **requerida** |
| `clickable` | `boolean` | `false` |

Sin salidas ni contenido (`kpi-card.component.ts:32-43`). Con `clickable` la tarjeta entera es un `<button>` con `aria-label` compuesto (`label: value`) y el `click` burbujea al host, que es donde la pantalla lo escucha (`kpi-card.component.html:65-73`).

### `app-modal` — `Modal`

Capa de confirmación o formulario sobre `<dialog>` nativo (`modal.component.ts:16-27`). Detalle en la sección 5.

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `title` | `string` | `''` |
| `open` | `model<boolean>` | `false` |
| `dismissible` | `boolean` | `true` |
| `size` | `'md' \| 'lg'` | `'md'` |

Sin salidas; `open` es `model`. Contenido: `<ng-content />` como cuerpo y plantilla `#actions` para el pie (`modal.component.html:28-36`).

### `app-page-header` — `PageHeader`

Cabecera editorial de pantalla: overline, `h1` y subtítulo opcional, con un slot de acción a la derecha (`page-header.component.ts:3-12`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `eyebrow` | `string` | **requerida** |
| `title` | `string` | **requerida** |
| `subtitle` | `string` | sin valor |

Sin salidas. Contenido: `<ng-content />` dentro de `.actions`, con `display: contents`, de modo que un slot vacío no reserva espacio (`page-header.component.html:10-15`, `page-header.component.scss:57-59`).

### `app-pagination` — `Pagination`

Paginador compartido en dos densidades. Genera ids únicos por instancia para sus etiquetas, su selector y su campo de salto (`pagination.component.ts:9-15, 44-47`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `mode` | `'full' \| 'compact'` | `'full'` |
| `rangeText` | `string` | **requerida** |
| `pageLabel` | `string` | **requerida** |
| `page` | `number` | **requerida** |
| `totalPages` | `number` | **requerida** |
| `pageSize` | `number` | `20` |
| `pageSizeOptions` | `readonly number[]` | `[10, 20, 50, 100]` |
| `disabled` | `boolean` | `false` |
| `disableFirst` | `boolean \| null` | `null` |
| `disablePrev` | `boolean \| null` | `null` |
| `disableNext` | `boolean \| null` | `null` |
| `disableLast` | `boolean \| null` | `null` |
| `jumpError` | `string \| null` | `null` |

| Salida | Tipo |
| --- | --- |
| `pageChange` | `number` |
| `pageSizeChange` | `number` |
| `jumpSubmit` | `string` |

Sin contenido proyectado. Los cuatro `disable*` son anulables: con `null` el estado se calcula a partir de `disabled`, `page` y `totalPages` (`pagination.component.ts:51-62`). `mode="compact"` reduce el pie a rango, flechas `‹ ›` y etiqueta de página (`pagination.component.html:2-27`).

### `app-row-flag` — `RowFlag`

Marca de estado en el borde inicial de una fila: una franja absoluta y una frase solo para lectores de pantalla (`row-flag.component.ts:10-26`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `tone` | `'completo' \| 'casi_completo' \| 'incompleto' \| 'activo' \| 'baja'` | **requerida** |
| `label` | `string` | **requerida** |

Sin salidas ni contenido: la plantilla es inline (`row-flag.component.ts:29-32`). **Precondición**: la celda que lo hospeda debe estar posicionada; dentro de `app-data-table` eso solo ocurre con `[leadingDecoration]="true"`, que aplica `position: relative` a la primera celda del cuerpo (`row-flag.component.ts:16-21`, `data-table.component.scss:166-169`).

### `app-row-link` — `RowLink`

El nombre de una fila con comportamiento de `<button>` real, con objetivo de 44 px y anillo de foco propios (`row-link.component.ts:3-14`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `ariaLabel` | `string \| null` | `null` |

Sin salidas. Contenido: `<ng-content />` dentro del `<button>`, que es el texto visible (`row-link.component.ts:17-19`). Si el texto ya es el nombre completo, `ariaLabel` se omite; si hace falta una frase (`Ver la ficha de …`), se pasa.

### `app-status-pill` — `StatusPill`

Estado etiquetado de un registro: la píldora pone forma, tamaño y tinta; la pantalla proyecta la palabra y, si quiere, el ícono (`status-pill.component.ts:12-30`).

| Entrada | Tipo | Valor por defecto |
| --- | --- | --- |
| `estado` | `'completo' \| 'casi_completo' \| 'incompleto' \| 'activo' \| 'baja'` | **requerida** |

Sin salidas. Contenido: `<ng-content />` dentro del `<span class="pill">` (`status-pill.component.ts:33`). Es el único componente con `ViewEncapsulation.None`, para poder dimensionar el `<svg>` que proyecta el llamador; todas sus reglas quedan anidadas bajo `app-status-pill` (`status-pill.component.ts:24-36`, `status-pill.component.scss:1-4`). `casi_completo` es contorneado, no relleno, porque el relleno sólido dejaba el texto en 4.24:1 (`status-pill.component.ts:20-23`).

### `app-toast-container` — `ToastContainer` y `ToastService`

La cola de notificaciones vive en el servicio; el contenedor es su extremo visible y se monta **una sola vez** en `App`, fuera del outlet del router (`toast-container.component.ts:4-9`; `app.component.ts`).

`ToastService` (`toast/toast.service.ts`) es `providedIn: 'root'` y expone:

| Miembro | Firma / tipo | Comportamiento |
| --- | --- | --- |
| `toasts` | `Signal<readonly Toast[]>` | Pila visible, del más antiguo al más nuevo (`:44-48`) |
| `exitingIds` | `Signal<ReadonlySet<number>>` | Ids que están reproduciendo la salida (`:45-51`) |
| `show(toast, options?)` | `(Omit<Toast,'id'>, ToastOptions?) => number` | Agrega y devuelve el id (`:75-105`) |
| `dismiss(id)` | `(number) => void` | Inicia la salida y elimina tras `TOAST_EXIT_MS` (`:108-124`) |
| `dismissAll()` | `() => void` | Vacía la pila y cancela temporizadores (`:127-131`) |
| `isLeaving(id)` | `(number) => boolean` | Consulta de salida en curso (`:65-67`) |

`Toast` es `{ id: number; type: 'success'|'error'|'info'|'warning'; title: string; message?: string }` (`:4-12`). `ToastOptions` solo tiene `duration?: number` (`:15-21`).

Límites reales:

| Límite | Valor | Fuente |
| --- | --- | --- |
| Duración por defecto | 5000 ms | `DEFAULT_DURATION` (`:23`) |
| Duración infinita | `duration: 0` fija el toast hasta que se cierre | `:17-20, 97-102` |
| Máximo visible | 4; el más antiguo sale al agregar el quinto | `MAX_VISIBLE` (`:26-30, 79-95`) |
| Salida | `TOAST_EXIT_MS = 220`, espejo de `--motion-exit` | `:24-25` |

Contenedor: sin entradas ni salidas. La pila declara `aria-live="polite"` y `aria-atomic="false"`; solo `error` y `warning` añaden `role="alert"` a su tarjeta (`toast-container.component.ts:28-34`, `toast-container.component.html:1-7`). Cada toast tiene botón de cierre con `aria-label="Cerrar notificación"` (`toast-container.component.html:65-69`).

## 3. Reglas de composición

Derivadas del uso real en `features/` y `layout/`:

| Necesidad | Primitiva obligada | Señal en el código |
| --- | --- | --- |
| Aviso de error, advertencia, info o éxito | `app-alert-banner` con `[alert-actions]` para el botón | `dashboard-page.component.html:23-34`, `empleados-page.component.html:80-103`, `catalogos-page.component.html:20-33` |
| Acción pulsable | `app-button` con `variant` | Toda acción de la app; `/ui` prueba las cuatro variantes |
| Listado tabular | `app-data-table` + `app-pagination` como pie | `empleados-page.component.html:189-231, 253`, `semaforo-page.component.html:119-170, 190`, `catalogos-page.component.html:151-259` |
| Detalle o formulario lateral | `app-drawer`; `[bare]="true"` si la superficie pinta su propia metáfora | `ficha-drawer.component.html:6`, `alta-drawer.component.html:7`, `editar-drawer.component.html:7` |
| Confirmación o formulario centrado | `app-modal` con plantilla `#actions` | `dashboard-page.component.html:78-104`, `credential-card.component.html:55`, `catalogos-page.component.html:343-347` |
| Notificación efímera | `ToastService.show(...)`; nunca un bloque local | `empleados-page.component.ts:598`, `catalogos-page.component.ts:721` y siguientes |
| Estado de un registro dentro de una fila | `app-row-flag` para el vistazo y `app-status-pill` o texto para la palabra | `empleados-page.component.html:210`, `semaforo-page.component.html:141`, `estado-expediente.component.ts:21-38` |
| Nombre de fila abrible | `app-row-link` dentro de `#cell`; `rowClick` es solo el atajo de puntero | `empleados-page.component.html:221-226` |
| Indicador de panel | `app-kpi-card` | `dashboard-page.component.html` |
| Cabecera de pantalla | `app-page-header` con la acción proyectada | Pantallas de listado y detalle |
| Logos institucionales | `app-brand-logos` | `sidebar.component.html:10, 38, 40` |
| Fondo del login | `app-animated-backdrop`, solo en pantallas públicas | `login-page.component.html:3` |

Reglas que se desprenden de lo anterior:

1. Una pantalla no crea estilos de color propios: compone `shared/ui` y usa tokens.
2. Los botones de una celda o de un pie son `app-button`; no hay `<button class="...">` estilizado en `features/` salvo controles muy específicos ya existentes.
3. Los estados nunca se comunican solo con color: siempre hay palabra (`status-pill`, `row-flag` con `label`) o ícono.
4. `#actions` y `#rowActions` se proyectan como `<ng-template>`, no como marcado suelto: el componente decide dónde y cuándo instanciarlas.
5. Una capa (`drawer`, `modal`) se abre con su `model`, nunca manipulando `document` ni el `<dialog>` desde fuera.

## 4. `DataTable` en detalle

### 4.1 Modelo de datos

```ts
interface TableColumn {
  key: string;        // propiedad leída de cada fila
  header: string;     // texto de la columna (español: es UI)
  align?: 'start' | 'end';
  width?: string;     // cualquier longitud CSS
  sortable?: boolean; // ordenamiento del servidor, opt-in
}
type TableRow = Record<string, unknown>;
```

`data-table.component.ts:46-58`. La tabla nunca asume un modelo de dominio y nunca ordena localmente una página parcial: `sortable` solo habilita el botón de cabecera y emite `sortChange` con la `key` (`:53-54`, `data-table.component.html:59-70`).

Valores de celda: `String(value)` o cadena vacía para `null`/`undefined` (`:209-212`). Clave de fila: `row[rowKey]`, con el índice como respaldo cuando el valor falta o es cadena vacía (`:202-206`). Fila activa: comparación por cadena contra `activeKey` (`:219-225`).

### 4.2 Entradas y su efecto real

| Entrada | Efecto medible |
| --- | --- |
| `columns` | Cabeceras y celdas; `align: 'end'` añade `.is-end` con `tabular-nums` (`data-table.component.scss:104-108`) |
| `rows` | Filas del cuerpo; sin filas se renderiza `emptyMessage` en una celda con `colspan` igual al número de columnas más acciones (`data-table.component.ts:174-177`, `data-table.component.html:117-122`) |
| `loading` | Cuatro filas esqueleto (`SKELETON_ROWS = 4`, `:61, 172`) con `aria-hidden` y la tabla marcada `aria-busy` (`data-table.component.html:28, 104-116`) |
| `variant` | `ledger` añade margen reglado, reglas discontinuas, cabecera bandeada y esquina superior izquierda cuadrada (`data-table.component.scss:178-222`) |
| `density` | Reescribe una sola variable, `--table-cell-pad-y`: `compact` = `--space-2`, `standard` = `--space-3`, `comfortable` = `--space-4` (`:49-62`); el padding horizontal no cambia |
| `leadingDecoration` | Hace `position: relative` la primera celda del cuerpo, requisito de `app-row-flag`, y habilita el anillo de foco por fila con `:focus-within` (`:166-176`) |
| `sort` | Alimenta el ícono y `aria-sort` de la cabecera (`data-table.component.html:46-54, 79-86`) |
| `activeKey` + `rowKey` | Marcan `.is-active`; en modo tabla el testigo es una franja de `--space-1` con `--color-accent` en el borde inicial (`data-table.component.scss:131-142`) |
| `mobileMode` | Ver 4.4 |
| `clickableRows` | Añade cursor de puntero y habilita la emisión de `rowClick`; sin él, la fila es inerte aunque el llamador enlace el evento (`data-table.component.ts:242-255`) |
| `caption` | `<caption class="visually-hidden">`, etiqueta la tabla para tecnología asistiva sin mostrarla (`data-table.component.html:30-36`) |
| `actionsLabel` | Nombre de la columna de acciones; si está vacío, el texto queda visualmente oculto (`data-table.component.html:94-99`) |

### 4.3 Plantillas proyectadas

| Plantilla | Contexto | Para qué |
| --- | --- | --- |
| `#cell` | `{ $implicit: row, column, value }` | Renderer de toda celda del cuerpo; la pantalla ramifica por `column.key` y deja el texto plano para el resto (`data-table.component.ts:152-160`, `data-table.component.html:137-142`) |
| `#headCell` | `{ column }` | Renderer de una cabecera; existe para meter un control en el `<th>` (por ejemplo un checkbox de «seleccionar página») (`:162-170`, `:56-58`) |
| `#rowActions` | `{ $implicit: row }` | Columna final de acciones; el `<th>` solo aparece si hay plantilla (`:147-150`, `data-table.component.html:93-99, 144-148`) |

Uso típico de `#cell`, tal como está en la pantalla de empleados: `let-row="$implicit" let-column="column" let-value="value"`, ramificando por `column.key === 'num_empleado'` y `'nombre'` (`empleados-page.component.html:203-229`).

### 4.4 `mobileMode`

| Modo | Comportamiento | Implementación |
| --- | --- | --- |
| `scroll` (defecto) | Conserva la rejilla y encierra el desbordamiento horizontal; avisa con una pista visible y refuerza el borde del lado con contenido oculto | `.wrap.is-scroll` con `overflow-x: auto`; pista solo si `canScrollX()` (`data-table.component.html:1-19`, `data-table.component.scss:28-42`) |
| `cards` | Apila cada fila como tarjeta; cada celda usa `attr(data-label)` como etiqueta; el `<thead>` pasa a `sr-only`, nunca a `display: none` | `data-table.component.scss:229-337` |

Los indicadores de scroll (`canScrollX`, `canScrollLeft`, `canScrollRight`) se recalculan con un `setTimeout` diferido y un `ResizeObserver` sobre el contenedor y la tabla, ambos limpiados en `DestroyRef` (`data-table.component.ts:227-285`).

### 4.5 Estado de carga

Cuatro filas de esqueleto, no un texto «Cargando…». Cada celda contiene `<span class="skeleton skeleton-shimmer">`; el `skeleton-shimmer` global aporta el barrido (`_motion.scss:152-165`) y `prefers-reduced-motion` lo desactiva. Las filas llevan `aria-hidden="true"` y la tabla `aria-busy="true"`, de modo que el lector anuncia la carga sin leer celdas vacías.

## 5. `Drawer` y `Modal`

Comparten contrato porque comparten mecanismo: un `<dialog>` nativo abierto con `showModal()`.

| Aspecto | `Drawer` | `Modal` |
| --- | --- | --- |
| Elemento | `<dialog #dialog>` (`drawer.component.html:1`) | `<dialog #dialog>` (`modal.component.html:1`) |
| Apertura | `effect` observa `open()` y llama `dialog.showModal()` / `dialog.close()` (`drawer.component.ts:68-82`) | Igual (`modal.component.ts:49-65`) |
| Enlace | `open = model(false)` → `[(open)]` o `[open]` + `(openChange)` | Igual |
| Cierre | `close()` nativo → evento `close` → `open.set(false)` (`:84-97`) | Igual (`:67-84`) |
| Escape | Llega como `cancel`; con `dismissible() === false` se hace `preventDefault()` (`:99-104`) | Igual (`:86-91`) |
| Clic en el scrim | Solo cierra si `event.target` es el propio diálogo **y** las coordenadas caen fuera del rectángulo del panel (`:106-131`) | Igual (`:93-119`) |
| Foco | Trampa de foco y devolución del foco al elemento que abrió: comportamiento del `<dialog>` nativo; el componente no lo implementa a mano | Igual |
| Nombre accesible | `aria-labelledby` al `h2`; en `bare`, sin `h2`, `aria-label` con el `title` (`drawer.component.html:5-6`, `drawer.component.ts:52-61`) | `aria-labelledby` al `h2` (`modal.component.html:4`) |
| Botón cerrar | Solo si `dismissible`, con `aria-label="Cerrar"` | Igual |
| Anchos | `sm` 380 px, `md` 560 px, `lg` 760 px | `md` 440 px, `lg` 720 px |
| Responsive | `lg` se estrecha en tablet (`<= $bp-md`) y ocupa pantalla completa en `<= $bp-xs` (`drawer.component.scss:217-242`) | `<= $bp-xs` ocupa el ancho con margen de `--space-4` (`modal.component.scss:141-160`) |
| Animación | `@starting-style` + `transition-behavior: allow-discrete` sobre `opacity`, `transform`, `overlay` y `display` (`drawer.component.scss:24-29, 107-144`) | Igual (`modal.component.scss:21-26, 41-69`) |

`bare` (solo `Drawer`): entrega el panel completo al llamador, sin cabecera, sin pie, sin relleno de cristal y sin `backdrop-filter`; el llamador pinta su propia superficie. Es lo que usan ficha, alta y edición para dibujar escritorio, carpeta y hoja (`drawer.component.ts:33-41`, `drawer.component.scss:73-85`). En `bare` el scrim cambia a `--color-paper-scrim` (`:134-138`).

`dismissible: false` bloquea las tres salidas a la vez: `Escape`, clic en el scrim y botón ✕ (que además no se renderiza).

## 6. Accesibilidad por componente

| Componente | ARIA y comportamiento implementados |
| --- | --- |
| `AlertBanner` | `role="alert"` o `"status"` derivado del `variant`, con anulación explícita por `role`; ícono con `aria-hidden="true"` |
| `AnimatedBackdrop` | Host `aria-hidden="true"` y `pointer-events: none`: invisible al lector y al puntero |
| `BrandLogos` | Cada slot es `role="img"` con `aria-label` institucional; el `<img>` interno lleva `alt=""` para no duplicar el nombre; placeholder con el texto `LOGO UTN` / `LOGO GOB. EDOMEX` |
| `Button` | `<button>` real; `aria-busy="true"` mientras `loading`; `disabled` real; el spinner es `aria-hidden`; el texto proyectado permanece visible |
| `DataTable` | `<caption>` visualmente oculta; `scope="col"` en toda cabecera; `aria-sort` en columnas `sortable`; `aria-label` en el botón de ordenar con la dirección siguiente; `aria-busy` en carga; filas de esqueleto `aria-hidden`; `<thead>` en `sr-only` dentro de `cards`; `rowClick` es atajo de puntero, la vía de teclado es un `app-row-link` dentro de una celda |
| `Drawer` / `Modal` | `<dialog>` con `showModal()`: foco atrapado, fondo inerte y devolución de foco del plataforma; `aria-labelledby` o `aria-label`; cierre con `aria-label="Cerrar"`; `Escape` cancelable y bloqueable |
| `KpiCard` | Con `clickable`: `<button>` con `aria-label` = `«label»: «value»`; franja e ícono `aria-hidden` |
| `PageHeader` | El título es el único `<h1>` de la pantalla; overline es texto, no encabezado |
| `Pagination` | `aria-live="polite"` en el rango; `<label for>` en selector de tamaño y campo de salto; ids únicos por instancia; `aria-invalid` + `aria-describedby` cuando hay `jumpError`; el error es `role="alert"`; flechas compactas con `aria-label` |
| `RowFlag` | Franja `aria-hidden`; frase completa en `.visually-hidden`, de modo que el estado no depende del color |
| `RowLink` | `<button>` real con objetivo de 44 px (`--space-8`), anillo de foco propio y `aria-label` opcional cuando el texto no basta |
| `StatusPill` | El estado es texto proyectado (siempre legible); el ícono es responsabilidad del llamador y el componente solo lo dimensiona |
| `ToastContainer` | Pila `aria-live="polite"` con `aria-atomic="false"`; tarjetas `error` y `warning` con `role="alert"`; ícono `aria-hidden`; cierre con `aria-label="Cerrar notificación"` |

## 7. Deuda de documentación

Lo que la documentación vieja describe y el código no tiene, o al contrario:

| Afirmación | Realidad |
| --- | --- |
| `AGENTS.md` §9 y §10 mencionan un `stepper` y un «formulario multipaso» | No existe ningún `stepper` en `shared/ui/` ni en el resto de `src/`. El alta de empleado es un `Drawer` con pasos propios en `features/empleados/alta-drawer/` |
| `FRONTEND_GUIDELINES.md` §3 cita `FaltantesDrawer` | No existe ningún archivo con ese nombre en `src/`. `etiquetaCampoExpediente` sí existe (`src/app/core/empleados/expediente-campos.ts:38`) y sí se usa para etiquetar campos |
| `AGENTS.md` §9 lista `card`, `input`, `table`, `sidebar` como componentes base de `shared/ui/` | `card` e `input` no existen como componentes compartidos; la tabla se llama `data-table`; la sidebar vive en `src/app/layout/sidebar/`, no en `shared/ui/` |
| `AGENTS.md` §6 afirma que ninguna pantalla coloca logos por su cuenta | El login no usa `app-brand-logos`: escribe dos `<img src="brand/logo-utn.svg">` / `brand/logo-edomex.svg` con sus propios contenedores (`login-page.component.html:17-36`) |
| `AGENTS.md` §6 describe los logos en `src/assets/brand/` | En Angular 22 el directorio real es `public/brand/`; el propio componente lo documenta (`brand-logos.component.ts:6-8`) |
| `AGENTS.md` §6 define solo las variantes `sm` y `lg` | Existe una tercera variante, `mark`, usada por el rail de 76 px (`brand-logos.component.ts:20-31`, `sidebar.component.html:38`) |
| `AGENTS.md` §5 fija `--logo-slot-height-sm` en 46 px | El valor real es `56px` (`_primitives.scss:156`); no existe un token `--logo-slot-height-lg` distinto: también vale 56 px (`:157`) |
| `AGENTS.md` §5 usa `--logo-gap` y `--logo-slot-radius` | Los nombres reales son `--logo-gap-sm` (8 px) y `--logo-gap-lg` (18 px); los radios son `--logo-slot-radius-sm` (12 px) y `--logo-slot-radius-lg` (14 px) (`:154-160`) |
| `AGENTS.md` §5 lista `--backdrop-cta-shimmer` | Ese token no existe en `_primitives.scss` |
| `AGENTS.md` §4 no menciona `--color-border-ghost` | Existe en los tres temas y se consume en catálogos (`_theme-guinda.scss:32`, `catalogos-page.component.scss:232`) |
| `AGENTS.md` §4 presenta una tabla de valores por tema | Los valores de la tabla son correctos en su mayoría, pero omiten familias completas: `--color-surface-ghost`, `--color-skeleton-sheen`, `--color-action-sheen`, `--color-accent-ink`, `--color-state-*-ink`, `--color-scrim`, `--color-focus-ring`, `--canvas-*`, `--color-desk`, `--color-paper-ink/action` |
| `FRONTEND_GUIDELINES.md` §4 pide `.skeleton-shimmer` en todos los skeletons | La tabla lo usa; el comentario local de `data-table.component.scss:157-158` afirma que el esqueleto es estático, lo que contradice la clase aplicada en `data-table.component.html:109` y el `::after` global de `_motion.scss:152-165`. Gana el comportamiento: el barrido corre |
| `FRONTEND_GUIDELINES.md` §3 describe `app-toast-container` con limpieza en `DestroyRef` | Cierto, pero la limpieza vive en `ToastService` (`toast.service.ts:58-62`), no en el contenedor |
| Nada documenta `RowFlag`, `RowLink`, `StatusPill`, `PageHeader` | Son cuatro primitivas reales y en uso, sin sección en `AGENTS.md` ni en `FRONTEND_GUIDELINES.md` |

## Referencias

- `src/app/shared/ui/alert-banner/alert-banner.component.{ts,html,scss}`
- `src/app/shared/ui/animated-backdrop/animated-backdrop.component.{ts,html,scss}`
- `src/app/shared/ui/brand-logos/brand-logos.component.{ts,html,scss}`
- `src/app/shared/ui/button/button.component.{ts,html,scss}`
- `src/app/shared/ui/data-table/data-table.component.{ts,html,scss}`
- `src/app/shared/ui/drawer/drawer.component.{ts,html,scss}`
- `src/app/shared/ui/kpi-card/kpi-card.component.{ts,html,scss}`
- `src/app/shared/ui/modal/modal.component.{ts,html,scss}`
- `src/app/shared/ui/page-header/page-header.component.{ts,html,scss}`
- `src/app/shared/ui/pagination/pagination.component.{ts,html}`
- `src/app/shared/ui/row-flag/row-flag.component.{ts,scss}`
- `src/app/shared/ui/row-link/row-link.component.{ts,scss}`
- `src/app/shared/ui/status-pill/status-pill.component.{ts,scss}`
- `src/app/shared/ui/toast/toast.service.ts`, `toast-container.component.{ts,html,scss}`
- `src/app/app.component.ts` — montaje del contenedor de toasts fuera del outlet
- `docs/modulos/tema-y-estilos.md` — tokens que consumen estos componentes
- `src/app/features/dev/ui-kit/` — pantalla `/ui` que ejercita el kit completo
