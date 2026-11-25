# Sistema de tema y estilos

Capa de tokens, temas y movimiento del frontend de Recursos Humanos (UTN). Describe los archivos que existen hoy en `src/styles/` y cómo los consume la aplicación en tiempo de ejecución.

## 1. Propósito

Un componente pide un **rol semántico** y no guarda valores propios: nunca declara un color, un radio, una sombra ni una duración literal. El tema decide el valor.

| Regla | Consecuencia práctica |
| --- | --- |
| El componente consume `var(--rol-semantico)` | Cambiar de tema no toca una sola hoja de componente |
| Los valores crudos viven en `src/styles/tokens/` | Ese directorio es la única excepción de `stylelint` |
| Los tres temas comparten nombres de token | Un nombre que falta en un tema se ve como un hueco, no como un color distinto |
| El tema se aplica con `[data-theme]` en `<html>` | Los archivos de tema usan un selector de atributo, por lo que también sirven para previsualizar un tema dentro de otro (`ajustes-page.component.html`) |

## 2. Los cuatro niveles reales (y la capa de movimiento)

`AGENTS.md` §3 describe tres niveles (primitivos, semánticos, componentes). El código tiene **cuatro niveles de token** —primitivos, tipografía, papel y temas— más una capa de movimiento, repartidos en cinco grupos de archivo con responsabilidades distintas. Ese es también el orden de importación real:

| # | Archivo | Posición en `styles.scss` | Qué posee |
| --- | --- | --- | --- |
| 1 | `src/styles/tokens/_primitives.scss` | `styles.scss:8` | Valores crudos: paleta, espacio, radios, medidas, sombras, tiempos de fondo |
| 2 | `src/styles/tokens/_typography.scss` | `styles.scss:9` | Escala tipográfica **invariante al tema**, expuesta como shorthands `font` |
| 3 | `src/styles/tokens/_paper.scss` | `styles.scss:10` | Mundo «papel» del expediente: hoja, carpeta, sello, tinta, escritorio |
| 4 | `src/styles/tokens/_theme-{guinda,light,dark}.scss` | `styles.scss:11-13` | Roles semánticos por tema |
| 5 | `src/styles/tokens/_motion.scss` | `styles.scss:14` | Duraciones, curva única, keyframes y utilidades de entrada |

El comentario de cabecera lo declara explícitamente: `primitives -> shared typography -> themes -> motion -> base element styles` (`styles.scss:1-6`). El bloque base vive en el mismo archivo (`styles.scss:16-79`: `box-sizing`, fondo del `body`, `:focus-visible`, `.visually-hidden`).

La distinción que `AGENTS.md` no hace es la importante: **tipografía y papel no son «primitivos»**. Son capas propias que se declaran en `:root` porque no cambian con el tema, pero se consumen como roles semánticos (`font: var(--text-body)`, `background: var(--color-paper)`).

## 3. `_primitives.scss`

Todo se declara en un único `:root` (`_primitives.scss:8`). Categorías y convención de nombre:

| Categoría | Convención | Ejemplos |
| --- | --- | --- |
| Escala de marca | `--<familia>-<paso>` | `--guinda-950 … --guinda-400` (`:10-17`), `--guinda-ink` (`:20`) |
| Alfa de marca | `--<familia>-a<opacidad>` | `--guinda-a60`, `--guinda-a80`, `--guinda-a14` (`:35-37`) |
| Blanco con alfa | `--white-a<opacidad>` | `--white-a05`, `--white-a08`, `--white-a20`, `--white-a72` (`:54-59`) |
| Dorado | `--gold-<paso>` | `--gold-200`, `--gold-400`, `--gold-600` (`:40-42`) |
| Neutros y rosa | `--rose-<paso>`, `--white`, `--transparent` | `:45-51` |
| Estado | `--<tono>-<paso>` | `--mint-400/700`, `--sky-400/700`, `--amber-400/700` (`:62-67`) |
| Familias tipográficas | `--font-<rol>` | `--font-sans`, `--font-mono` (`:70-71`) |
| Espacio | `--space-1 … --space-8` | 4, 8, 12, 16, 20, 24, 32, 44 px (`:74-81`) |
| Medidas de layout | `--<pieza>-width` / `--<pieza>-min-width` | `--sidebar-width: 280px`, `--sidebar-width-collapsed: 76px`, `--content-max-width: 1120px` (`:84-92`) |
| Anchos de capa | `--drawer-width-{sm,md,lg}`, `--modal-width-{md,lg}`, `--toast-width` | 380 / 560 / 760, 440 / 720, 400 px (`:96-103`) |
| Radios | `--radius-<tamaño>` | `--radius-none`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl`, `-pill` (`:108-114`) |
| Efectos | `--<efecto>` | `--blur-glass: 20px`, `--border-width: 1px`, `--scrim`, `--hover-lift`, `--focus-ring-width` (`:117-122`) |
| Controles | `--control-height-{sm,md}`, `--otp-box-size`, `--login-card-width`, `--field-min-width` | `:126-139` |
| Elevación | `--shadow-{sm,md,lg}` | `:143-145` |
| Slots de logo | `--logo-slot-*`, `--logo-gap-*` | `:150-160` |
| Paradas de lienzo | `--<tema>-canvas-*` | `--guinda-canvas-hi/lo`, `--light-canvas-*`, `--dark-canvas-*` (`:164-170`) |
| Fondo animado | `--backdrop-*` | tiempos (`:173-182`), geometría (`:185-196`), colores (`:199-205`) |

Convención general: `--categoría-rol-variante`; el tamaño va al final (`--radius-lg`, `--drawer-width-md`). Las opacidades se codifican en el nombre (`a08` = 8 %).

Dos valores existen solo porque `stylelint` prohíbe la alternativa: `--transparent` (`:46-48`, porque `background: none` no pasa la regla de `background`) y `--radius-none` (`:106-108`, porque `border-radius: 0` tampoco pasa).

## 4. `_typography.scss`

Escala invariante al tema, en `:root` (`_typography.scss:11-17`). El shorthand siempre es `weight size/line-height family` (`:6-8`).

| Token | Valor | Uso |
| --- | --- | --- |
| `--text-display` | `700 40px/1.1 var(--font-sans)` | Cifra de KPI (`kpi-card.component.scss:119`) |
| `--text-title` | `600 28px/1.2` | `h1` de pantalla (`page-header.component.scss:43`) |
| `--text-heading` | `700 20px/1.3` | Título de modal y drawer |
| `--text-body` | `400 13px/1.6` | Texto corriente; también `body` global (`styles.scss:29`) |
| `--text-label` | `600 11px/1.4` | Etiquetas y cabecera de tabla |
| `--text-overline` | `600 10px/1.4` | Overlines y pistas |

Tracking separado, porque el shorthand `font` no lo transporta (`:8`): `--tracking-label: 0.06em` y `--tracking-overline: 0.12em` (`:19-20`).

Tres roles adicionales fuera de la escala editorial:

| Token | Valor | Motivo declarado |
| --- | --- | --- |
| `--text-field` | `400 15px/1.45` | 13 px es correcto para leer, 15 px para escribir en un campo (`:22-25`) |
| `--text-nav-branch` | `600 13px/1.4` | Rama de navegación, más pesada que la hoja (`:27-31`) |
| `--text-nav-item` | `400 13px/1.4` | Hoja de navegación |
| `--font-typewriter` | `'Courier Prime', 'Courier New', Courier, monospace` | Voz de archivo; solo para el expediente y el overline del `page-header` (`:33-37`) |

**Familias reales.** `AGENTS.md` §1 solo menciona Sora y JetBrains Mono. El código carga cuatro familias desde Google Fonts en `index.html:10-15`:

| Familia | Pesos | Dónde se declara |
| --- | --- | --- |
| Sora | 400, 600, 700 | `--font-sans` (`_primitives.scss:70`) |
| JetBrains Mono | 400, 600 | `--font-mono` (`:71`) |
| Archivo Narrow | 500, 700 | `--font-paper` (`_paper.scss:83`) |
| Courier Prime | 400, 700 | `--font-typewriter` (`_typography.scss:37`) → `--font-paper-mono` (`_paper.scss:84`) |

## 5. `_paper.scss`: la capa no documentada

El expediente es la única superficie del sistema con vocabulario propio: una carpeta manila sobre un escritorio, una hoja marfil dentro, tinta encima. No es cristal y no intenta serlo. La cabecera del archivo explica que la primera versión usaba colores ajenos a la paleta y que el efecto sobrevive **solo con la paleta de marca**; lo que hacía falta eran roles, no colores nuevos (`_paper.scss:1-25`).

Metáfora por bloques:

| Bloque | Roles | Valores |
| --- | --- | --- |
| La hoja (`:28-42`) | `--color-paper`, `--color-paper-text`, `--color-paper-muted`, `--color-paper-line`, `--color-paper-empty`, `--color-paper-value` | marfil, tinta guinda, línea rosa, valor vacío |
| La carpeta (`:44-51`) | `--color-manila`, `--color-manila-dark`, `--color-manila-edge`, `--color-manila-ink` | dorado 400/600 + tinta guinda 900 |
| El sello (`:53-60`) | `--color-stamp`, `--color-stamp-ok`, `--color-stamp-on`, `--color-stamp-soft` | rojo institucional, verde, blanco |
| Fondo (`:62-68`) | `--color-paper-scrim`, `--color-paper-flash` | scrim global y destello dorado al 55 % |
| Radios (`:70-77`) | `--radius-paper-xs … -xl` | 4, 6, 8, 9, 14 px |
| Tipo (`:79-84`) | `--font-paper`, `--font-paper-mono` | Archivo Narrow / typewriter |
| Proporciones (`:86-89`) | `--paper-gutter`, `--paper-indent` | 46 px / 34 px |
| Elevación y textura (`:91-107`) | `--shadow-paper-sheet`, `-cover`, `-drawer`, `-panel`, `-clip`, `--paper-cover-texture` | sombras guinda y rayado de la carpeta |

**Qué es invariante y qué no.** Casi todo vive en `:root`. Solo cuatro roles cambian con el tema, y están declarados en los tres archivos de tema:

| Rol | Guinda | Light | Dark |
| --- | --- | --- | --- |
| `--color-desk` | `--guinda-850` (`_theme-guinda.scss:83`) | `--rose-100` (`_theme-light.scss:91`) | `--guinda-950` (`_theme-dark.scss:75`) |
| `--color-paper-ink` | `--gold-200` (`:84`) | `--guinda-ink` (`:92`) | `--gold-200` (`:76`) |
| `--color-paper-action` | `--gold-400` (`:85`) | `--guinda-500` (`:93`) | `--gold-400` (`:77`) |
| `--color-paper-action-ink` | `--guinda-900` (`:86`) | `--white` (`:94`) | `--guinda-950` (`:78`) |

La razón está escrita en el archivo: una hoja es una hoja en todos los temas; lo que cambia es **el escritorio sobre el que descansa, la tinta de ese escritorio y el color de acción** (`_paper.scss:15-17`). Por eso la capa es separada de los tres temas: si la hoja se redefiniera por tema, el expediente dejaría de leerse como el mismo documento al cambiar de apariencia.

Nota de contrato: la geometría que sostiene la metáfora **no** se expresa con `--space-*`; un margen de 46 px no es «seis espacios» y ajustarlo a 24 px aplana la referencia. Esas medidas se escriben como píxeles en el componente, lo que el contrato permite porque vigila color, radio, sombra y movimiento, no longitudes (`_paper.scss:19-24`).

Consumidores reales: `ficha-drawer`, `ficha-panel`, `alta-drawer`, `alta-expediente`, `alta-revision`, `editar-drawer` y el fondo del `drawer` en modo `bare` (`drawer.component.scss:137`).

## 6. Los tres temas

Se aplican con un selector de atributo, no con `:root`: `[data-theme='guinda']` (`_theme-guinda.scss:6`), `[data-theme='light']` (`_theme-light.scss:7`), `[data-theme='dark']` (`_theme-dark.scss:6`). Eso permite previsualizar un tema dentro de otro, que es lo que hace `ajustes-page.component.html`.

Familias de rol y valores por tema:

| Familia | Token | Guinda | Light | Dark |
| --- | --- | --- | --- | --- |
| Superficie | `--color-bg-canvas` | `--guinda-700` | `--white` | `--guinda-950` |
| | `--color-surface-glass` | `--white-a08` | `--white-a72` | `--white-a05` |
| | `--color-surface-overlay` | `--guinda-a60` | `--white-a92` | `--guinda-a80` |
| | `--color-surface-ghost` | `--transparent` | `--transparent` | `--transparent` |
| | `--color-skeleton-sheen` | degradado blanco 20 % | degradado blanco 72 % | degradado blanco 12 % |
| Borde | `--color-border-default` | `--white-a20` | `--guinda-a14` | `--white-a12` |
| | `--color-border-ghost` | `--transparent` | `--transparent` | `--transparent` |
| Texto | `--color-text-primary` | `--white` | `--guinda-ink` | `--rose-100` |
| | `--color-text-secondary` | `--gold-200` | `--guinda-600` | `--rose-300` |
| | `--color-text-overline` | `--gold-400` | `--guinda-500` | `--gold-400` |
| Acción | `--color-action-primary` | `--white` | `--guinda-500` | `--gold-400` |
| | `--color-action-on-primary` | `--guinda-800` | `--white` | `--guinda-900` |
| | `--color-action-sheen` | `--gold-400` | `--white-a20` | `--white-a20` |
| Acento | `--color-accent` | `--gold-400` | `--gold-600` | `--gold-400` |
| | `--color-accent-ink` | `--guinda-ink` | `--guinda-ink` | `--guinda-900` |
| Estado | `--color-state-error` | `--rose-50` | `--guinda-400` | `--rose-50` |
| | `--color-state-error-ink` | `--guinda-900` | `--white` | `--guinda-900` |
| | `--color-state-{success,info,warning}` | `--mint-400`, `--sky-400`, `--amber-400` | `--mint-700`, `--sky-700`, `--amber-700` | `--mint-400`, `--sky-400`, `--amber-400` |
| | `--color-state-*-ink` | `--guinda-900` | `--white` | `--guinda-900` |
| Overlay/foco | `--color-scrim` | `--scrim` | `--scrim` | `--scrim` |
| | `--color-focus-ring` | `rgba(232,199,102,.25)` | `rgba(184,148,31,.25)` | `rgba(232,199,102,.25)` |

Además, cada tema declara `--canvas-gradient` (tres capas: halo superior derecho, lavado inferior, degradado diagonal), `color-scheme`, y —solo `light`— sobrescribe `--shadow-sm/md/lg` (`_theme-light.scss:85-87`).

### Trampas que el código ya codifica

| Trampa | Dónde está escrita | Qué implica |
| --- | --- | --- |
| En `light`, el dorado no se usa como texto | `_theme-light.scss:3-4` y `:38-39` | Por eso existe `--color-text-overline` aparte de `--color-accent`; `--color-accent` en `light` es `--gold-600` |
| Sobre guinda, el error no es rojo | `_theme-guinda.scss:53-56` | `--color-state-error` es superficie rosa clara y `--color-state-error-ink` es guinda oscuro |
| El sheen del botón cambia de material | `_theme-guinda.scss:44-46`, `_theme-dark.scss:42-43` | Dorado sobre relleno blanco; velo blanco sobre relleno de color |
| Los estados llevan tinta propia | `_theme-guinda.scss:61-65` | Un glifo dentro de un relleno de estado usa `--color-state-*-ink`, nunca `--color-text-primary` |
| `light` no es blanco puro en el lienzo | `_theme-light.scss:75-77` | `--color-bg-canvas` es `--white`, pero el fondo real es `--canvas-gradient` |

`--color-border-ghost` **existe** en los tres temas (`_theme-guinda.scss:32`, `_theme-light.scss:33`, `_theme-dark.scss:32`) y su valor es `--transparent` en todos. Es el equivalente de «sin línea» a `--color-surface-ghost`: un control que solo dibuja su borde al pasar el puntero o al enfocarse. Consumidores: `catalogos-page.component.scss:232` y `:267`, `diagnostico-banner.component.scss:88`.

## 7. `_motion.scss`

| Token | Valor | Uso |
| --- | --- | --- |
| `--motion-fast` | 300 ms | Transiciones de control, salida/entrada de capas |
| `--motion-exit` | 220 ms | Salida de toast (`toast.service.ts:24-25` lo replica como `TOAST_EXIT_MS`) |
| `--motion-base` | 600 ms | Entrada `rise` y `drawer` |
| `--motion-slow` | 900 ms | Movimientos largos |
| `--motion-spin` | 750 ms | Spinner de botón |
| `--motion-shimmer` | 1.6 s | Barrido de skeleton |
| `--motion-flash` | 2 s | Destello de campo señalado en el expediente |
| `--motion-ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | **Única curva permitida** (`:16`) |
| `--motion-stagger` | 80 ms | Punto medio del rango 70-100 ms del lienzo (`:17-18`) |
| `--motion-pill-ease` / `--motion-pill-snap` | `cubic-bezier(0.34,1.35,0.64,1)` / 260 ms | Indicador elástico de navegación |
| `--motion-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Microinteracciones con rebote |
| `--icon-active-scale` | 1.15 | Ícono activo |
| `--button-hover-lift` | -2 px | Elevación de botón |
| `--button-active-scale` | 0.98 | Presión |
| `--enter-rise-y` / `--enter-drawer-x` / `--enter-drawer-x-left` | 20 px / 70 px / -70 px | Desplazamientos de entrada |
| `--enter-modal-y` / `--enter-modal-scale` | 24 px / 0.95 | Entrada de modal |
| `--enter-toast-x` / `--exit-toast-x` | 32 px / 32 px | Entrada y salida de toast |
| `--stage-fade-y` | 10 px | Entrada genérica de sección |

Keyframes (`:41-132`): `rise`, `drawer`, `modal`, `stage-fade-up`, `button-spin`, `toast-enter`, `toast-exit`, `skeleton-shimmer` y `paper-flash`. El barrido del destello del expediente es `paper-flash`: solo viaja el relleno, nada se desplaza ni escala, para que la hoja inferior no se mueva (`:122-132`).

Utilidades de entrada (`:136-171`), con la duración siempre tomada de tokens:

| Clase | Animación | Duración |
| --- | --- | --- |
| `.enter-rise` | `rise` | `--motion-base` |
| `.enter-drawer` | `drawer` | `--motion-base` |
| `.enter-modal` | `modal` | `--motion-fast` |
| `.enter-stage` | `stage-fade-up` | `--motion-fast` |
| `.skeleton-shimmer` | `skeleton-shimmer` sobre `::after` | `--motion-shimmer`, infinito |
| `.paper-flash` | `paper-flash` | `--motion-flash` |

`prefers-reduced-motion` (`:185-211`): pone a cero todos los desplazamientos y escalas de entrada, apaga `--icon-active-scale` y `--button-hover-lift`, oculta el `::after` del skeleton y convierte `paper-flash` en un relleno estático (el aviso es información, no decoración, `:191-196`). En `forced-colors` el destello se reafirma como contorno (`:175-180`).

## 8. `_breakpoints.scss`

Cuatro variables y un mixin (`_breakpoints.scss:6-15`):

| Variable | Valor | Rango que cubre |
| --- | --- | --- |
| `$bp-lg` | 1199 px | Escritorio compacto / laptop |
| `$bp-md` | 1023 px | Tablet, incluye 768×1024 |
| `$bp-sm` | 767 px | Móvil, incluye 390×844 y drawer off-canvas |
| `$bp-xs` | 479 px | Móvil pequeño, 360-375 px |

```scss
@use '../../styles/breakpoints' as bp;

@include bp.down(bp.$bp-sm) { ... }   // @media (max-width: 767px)
```

### Situación real de consumo

Hay 24 llamadas a `bp.down()` repartidas en 20 hojas (14 con `$bp-sm`, 9 con `$bp-xs`, 1 con `$bp-md`). Lo que se usa de verdad:

| Breakpoint | Consumidores | Observación |
| --- | --- | --- |
| `$bp-sm` | `app-shell`, `topbar`, `sidebar`, `page-header`, `data-table`, `pagination`, `editar-drawer`, `ficha-drawer`, `ficha-panel`, `alta-drawer`, `alta-expediente`, `empleados-page`, `catalogos-page`, `semaforo-page` y más | Es el breakpoint dominante: cambio a una columna y tarjetas apiladas |
| `$bp-md` | Solo `drawer.component.scss:217` | Ajuste de ancho del drawer `lg` en tablet |
| `$bp-xs` | `drawer`, `modal`, `brand-logos`, `empleados-page`, `catalogos-page`, `diagnostico-banner`, `semaforo-page`, `login-page`, `otp-input` | Pantalla completa y padding reducido |
| `$bp-lg` | **Cero consumidores** | Variable declarada y nunca importada por ninguna hoja; hoy es código muerto |

### Duplicación conocida con `SidebarStateService`

`src/app/core/layout/sidebar-state.service.ts:4-5` define las mismas fronteras con `matchMedia`, en literales y en otra convención (rango cerrado en lugar de `max-width`):

| Servicio | Consulta | Equivalente SCSS |
| --- | --- | --- |
| `TABLET_MEDIA_QUERY` | `(min-width: 768px) and (max-width: 1023px)` | `$bp-md` (mitad superior) |
| `MOBILE_MEDIA_QUERY` | `(max-width: 767px)` | `$bp-sm` |

Las dos definiciones coinciden hoy, pero no comparten fuente: cambiar `$bp-md` o `$bp-sm` deja el comportamiento de JavaScript desalineado del CSS sin que nada falle. La unificación pendiente es exponer las fronteras como una sola fuente (variables CSS leídas por `matchMedia`, o constantes TypeScript espejo con una prueba que las compare).

## 9. Tema en tiempo de ejecución

`ThemeService` (`src/app/core/theme/theme.service.ts`) es la fuente de verdad del tema activo.

| Elemento | Valor real | Línea |
| --- | --- | --- |
| Tipo `Theme` | `'guinda' \| 'light' \| 'dark'` | `:4` |
| `DEFAULT_THEME` | **`'light'`** | `:9` |
| `THEMES` (orden del selector) | `['guinda', 'light', 'dark']` | `:10` |
| Clave de `localStorage` | `'utn-rh.theme'` | `:6` |
| Señal privada | `_theme = signal<Theme>(readInitialTheme())` | `:22` |
| Vista pública | `theme = this._theme.asReadonly()` | `:25` |
| Escritura del atributo | `effect` → `documentElement.setAttribute('data-theme', theme)` + `persist(theme)` | `:33-37` |
| Mutador | `setTheme(theme)` | `:40-42` |
| Lectura inicial | `localStorage` validado contra `THEMES`, si no, `DEFAULT_THEME` | `:45-55` |
| Persistencia | `localStorage.setItem`, con `try/catch` (modo privado) | `:57-63` |

El comentario del archivo justifica el valor por defecto: `light` es el tema legible bajo la luz dura de una oficina, y los otros dos están a un clic en `/ajustes` (`:7-9`).

**Arranque.** `provideAppInitializer(() => inject(ThemeService))` en `app.config.ts:22-24` instancia el servicio antes del primer render, de modo que el atributo almacenado se aplique aunque ninguna pantalla inyecte el servicio.

**Doble escritura antes del arranque.** `index.html:2` declara `data-theme="light"` de forma estática y un script síncrono en línea (`index.html:16-33`) lee `'utn-rh.theme'` y escribe el atributo antes del primer pintado. Es un segundo escritor del atributo, fuera de `ThemeService`. La afirmación de `AGENTS.md` §9 («`ThemeService` … es el único que escribe `data-theme`») no se cumple: el script de `index.html` también lo hace, a propósito, para evitar el parpadeo del tema por defecto en cada recarga.

## 10. Cumplimiento automático

`stylelint.config.mjs` implementa §11 de `AGENTS.md` con cuatro reglas nativas, sin plugins:

| Regla | Configuración | Qué atrapa |
| --- | --- | --- |
| `color-no-hex` | `true` | `#fff`, `#6B0F26`, `#00000080` |
| `function-disallowed-list` | `['rgb','rgba','hsl','hsla']` | Cualquier color funcional literal |
| `declaration-property-value-allowed-list` | `color`: `/^var\(--/`, `inherit`, `currentColor`; `background`, `background-color`, `border-color`, `box-shadow`, `border-radius`: `/^var\(--/` | Valores literales en esas propiedades |
| `declaration-property-value-disallowed-list` | `/^animation/` y `/^transition/` contra `/\b\d+(\.\d+)?m?s\b/` | Duraciones literales dentro de shorthands |

`overrides` (`stylelint.config.mjs`, bloque final) desactiva las cuatro reglas solo en `src/styles/tokens/**/*.scss`, que es la capa donde los valores crudos son legales por diseño.

### Lo que no se vigila, y por qué

| Regla de `AGENTS.md` | Estado real |
| --- | --- |
| «Exigir `var(--…)` en `transition` y `animation`» (§11) | **No se exige.** La lista permitida no puede aplicarse a un shorthand que mezcla token con palabras clave; por eso solo se prohíben duraciones literales (`stylelint.config.mjs:11-13`) |
| `stylelint-declaration-strict-value` | **No se usa.** El comentario del archivo lo dice: el plugin 1.13 no puede registrar su nombre de regla bajo stylelint 18; las cuatro reglas nativas dan la misma garantía (`:19-21`) |
| `border`, `font` y `animation` como shorthands | No tienen lista permitida: quedan cubiertos solo por el veto de hexadecimales/funciones y el de duraciones (`:15-17`) |
| Longitudes (`padding`, `gap`, `width`, `font-size`) | **No se vigilan.** Por eso `_paper.scss:19-24` puede declarar píxeles de geometría en componentes y `page-header.component.scss:32-36` puede fijar `font-size: 11px` |
| Contraste 4.5:1 / 3:1 | Sin verificación automática; es revisión visual y de diseño |
| Prueba en los tres temas | Sin verificación automática; `/tokens` y `/ui` existen para hacerla manual |

El pipeline falla en `npm run prebuild` → `npm run lint:styles` (`stylelint "src/**/*.scss"`), encadenado antes de `ng build` (`package.json`).

## 11. Reglas prácticas al agregar un valor visual

Derivadas del cumplimiento real, no de la intención:

1. Si el valor es un color, un radio, una sombra, un `background` o un `border-color`, **no se escribe en el componente**: `stylelint` lo rechaza. Se crea o se reutiliza un token.
2. Si el rol no existe, se agrega primero en los tres archivos de tema (`_theme-guinda.scss`, `_theme-light.scss`, `_theme-dark.scss`) o en `_paper.scss` si pertenece al mundo del expediente. Un rol en un solo tema es un hueco.
3. Si el valor es una duración o una curva, se usa un token de `_motion.scss`. Las duraciones literales en `animation`/`transition` fallan el lint.
4. Si es tipografía, se usa un shorthand `font` (`--text-*`) o `--font-*`; no se declara familia suelta salvo en el mundo papel, que tiene las suyas.
5. Si es un tamaño, un margen o un gap, `--space-*` es la primera opción; los píxeles solo se justifican cuando la medida sostiene una metáfora (margen de hoja) y el comentario lo explica.
6. Si es una media query, se usa `bp.down(bp.$bp-*)`. No se introducen medidas sueltas.
7. Toda animación nueva respeta `prefers-reduced-motion` y se apoya en `transform`/`opacity`.
8. El componente se prueba en `guinda`, `light` y `dark`, y el contraste se verifica a mano.
9. Un botón principal por vista o capa; los estados se distinguen por ícono y forma, no solo por color.
10. `background: none` y `border-radius: 0` no son válidos: se usan `--transparent` y `--radius-none`.

## 12. Pantallas internas

Ambas viven en `src/app/features/dev/` y solo se registran cuando `!environment.produccion` (`app.routes.ts:13-31`). Están dentro del `AppShell`, así que heredan `authGuard` y la navegación normal.

| Ruta | Componente | Qué permite inspeccionar |
| --- | --- | --- |
| `/tokens` | `TokenPreview` (`features/dev/token-preview/`) | Selector de los tres temas con `aria-pressed`; 11 muestras de color semántico (`swatches`, `token-preview.component.ts:21-33`); la escala tipográfica completa con JetBrains Mono de muestra (`token-preview.component.html:37-46`) |
| `/ui` | `UiKit` (`features/dev/ui-kit/`) | Botón en sus cuatro variantes, dos tamaños, `loading` y `disabled`; toasts de los cuatro tipos, uno fijado y «cerrar todas»; tabla de datos con `#rowActions`, `activeKey`, estados de carga y vacío; modal `md` y `lg`; drawer a la derecha y a la izquierda |

`/tokens` es la forma prevista de verificar que un rol semántico resuelve en los tres temas. `/ui` es la forma prevista de verificar componentes con teclado y con lector de pantalla. Ninguna se compila en producción.

## Referencias

- `src/styles/styles.scss:1-14` — orden de importación real
- `src/styles/tokens/_primitives.scss` — valores crudos y convención de nombres
- `src/styles/tokens/_typography.scss` — escala tipográfica y familias
- `src/styles/tokens/_paper.scss` — capa del expediente
- `src/styles/tokens/_theme-guinda.scss`, `_theme-light.scss`, `_theme-dark.scss` — roles por tema
- `src/styles/tokens/_motion.scss` — duraciones, keyframes, movimiento reducido
- `src/styles/_breakpoints.scss` — variables y mixin `down()`
- `src/app/core/theme/theme.service.ts` — tema en runtime
- `src/app/app.config.ts:19-25` — inicializador del tema
- `src/index.html:2, 10-15, 16-33` — tema estático, fuentes y script previo al arranque
- `stylelint.config.mjs` — reglas efectivas y sus límites
- `src/app/features/dev/token-preview/`, `src/app/features/dev/ui-kit/` — pantallas de inspección
- `docs/modulos/shared-ui.md` — catálogo de componentes que consumen estos tokens
