# Módulo shell (layout)

Contenedor de toda pantalla autenticada: una rejilla de dos columnas con el drawer de navegación a la izquierda y, a la derecha, la topbar más el contenido enrutado. El estado responsive vive en `SidebarStateService`; los breadcrumbs se derivan del árbol de rutas, no se escriben a mano.

## 1. Composición

```
src/app/layout/
  app-shell/app-shell.component.*    # rejilla + scrim + RouterOutlet dentro de <main>
  sidebar/sidebar.component.*        # drawer de tres modos
  sidebar/credential-card/           # tarjeta de sesión al pie del drawer
  sidebar/role-label.ts              # código de rol → etiqueta legible
  topbar/topbar.component.*          # breadcrumbs, botón móvil, reloj
src/app/core/layout/sidebar-state.service.ts
```

`AppShell` declara un único host hook: `(document:keydown.escape) → onEscape()` (`app-shell.component.ts:21-23`).

## 2. AppShell

Plantilla (`app-shell.component.html:1-21`):

| Elemento | Condición / efecto |
| --- | --- |
| `.shell` | Grid `var(--sidebar-width) 1fr`, con `min-height: 100dvh`; `is-collapsed` cambia la columna a `var(--sidebar-width-collapsed)` (`app-shell.component.scss:9-21`) |
| `.scrim` | Solo si `isMobile() && mobileOpen()`; `aria-hidden="true"`, cierra al clic |
| `<app-sidebar id="app-sidebar-drawer">` | `[attr.inert]` y `aria-hidden="true"` cuando es móvil y está cerrado |
| `.content` | Columna flex: `<app-topbar />` + `<main class="stage"><router-outlet /></main>` |

Estado que el shell posee, siempre por delegación a `SidebarStateService`:

- `collapsed` = `effectiveCollapsed` (rail efectivo, no la preferencia guardada).
- `isMobile`, `mobileOpen`.
- `topbar = viewChild(Topbar)`, usado solo para devolver el foco al botón de menú.

`closeMobile(restoreFocus)` (`app-shell.component.ts:34-39`) cierra el drawer y, si se pide, llama a `Topbar.focusMenuButton()`. `onEscape()` solo actúa si `isMobile() && mobileOpen()` (líneas 41-45). En móvil, el shell pasa a una sola columna con `gap: 0` y sin padding superior (`app-shell.component.scss:67-78`).

## 3. Sidebar: tres modos

| Modo | Condición | Render |
| --- | --- | --- |
| Escritorio full | `>= 1024px` y `_collapsed === false` | 280 px, etiquetas, submenú desplegable inline, control de plegado sobre el borde |
| Escritorio rail | `>= 1024px` y `_collapsed === true` | 76 px, solo iconos, tooltips flotantes, rama `Empleados` como botón con popover |
| Tablet rail forzado | `768px–1023px` | 76 px por `effectiveCollapsed = true`; el control de plegado no se renderiza y `Ctrl+B` se ignora |
| Móvil off-canvas | `<= 767px` | Drawer de etiquetas completas, botón de cierre, scrim, `inert` cerrado |

Decisiones del componente verificables en `sidebar.component.ts`:

- `isRailMode()` = `collapsed() && !isMobile()` (línea 423-425). Los tooltips y el popover del rail solo existen ahí.
- El header cambia de marca: en móvil y en full usa `variant="sm"` con `showCaption`; en rail usa `variant="mark"` (`sidebar.component.html:9-41`). Los tres casos pasan `[plated]="false"`.
- El control de plegado (`sidebar.component.html:44-75`) **no** se renderiza en móvil ni en tablet, y declara `aria-controls="sidebar-nav"` y `aria-expanded="!collapsed()"`.

### Empleados como destino único

- `Empleados` es un enlace más, igual que el semáforo o los catálogos: `routerLink="/empleados"`.
- Ya **no** hay submenú, ni panel colapsable, ni popover de rail. El listado absorbió el padrón y las bajas en una sola pantalla con pestañas, así que anidar una segunda dirección duplicaría un filtro que la página ya gobierna.
- No hay entrada de alta: el alta es un drawer del listado.

### Indicador deslizante

`.pill-indicator` es un `div` `aria-hidden` posicionado con `translate3d(...)` y ancho/alto en px (`sidebar.component.html:86-93`). La animación es de dos pasos: primero se estira para unir origen y destino, y a los 130 ms se contrae al destino (`sidebar.component.ts:588-605`). Se recalcula:

- tras cada `NavigationEnd`, con un aplazamiento de 20 ms para dejar que `RouterLinkActive` pinte (líneas 143-153, 538-551);
- en `transitionend` del host cuando cambian `width` o `transform` (líneas 395-402);
- con un `ResizeObserver` sobre `#sidebar-nav` (líneas 522-536);
- al cambiar de modo, desde un `effect` (líneas 157-165).

Si no hay `.item.is-active`, el indicador se oculta (líneas 623-628).

### Foco y teclado

| Comportamiento | Dónde |
| --- | --- |
| Al abrir el drawer móvil, el foco va al botón de cierre | `sidebar.component.ts:167-178` |
| `Escape` cierra tooltip y popover devolviendo el foco al ancla | líneas 313-316, 301-310 |
| Al abrir el popover del rail, el foco entra al primer enlace | líneas 294-297 |
| `pointerdown` en documento cierra el popover ajeno | líneas 183-188, 450-465 |
| `Ctrl+B` / `Cmd+B` alterna full/rail en escritorio | líneas 241-256 |

La atajo se ignora si el foco está en `input`, `textarea`, `select` o `contenteditable`, en tablet, o con el drawer móvil abierto. No hay `tabindex` móvil (roving tabindex): la navegación usa el orden natural del DOM dentro del `nav`.

### Pie del drawer

`SidebarCredentialCard` (`credential-card.component.ts`) es presentacional: recibe `name`, `initials`, `role`, `collapsed` y `tooltipId`, y emite `signOut` solo después de confirmar en un `Modal`. `Sidebar.cerrarSesion()` (líneas 655-662) navega a `/login` en `finalize`, para que un logout fallido también expulse.

## 4. Topbar

| Zona | Comportamiento |
| --- | --- |
| Botón de menú | Solo en móvil. `width`/`height: var(--space-8)` = 44 px (`topbar.component.scss:35-37`). `aria-controls="app-sidebar-drawer"`, `aria-expanded`, `aria-label` que alterna entre "Abrir menú" y "Cerrar menú" |
| Breadcrumbs | `nav aria-label="Ruta de navegación"` con `<ol>`; el último paso es `span aria-current="page"`, los anteriores son enlaces con un separador `aria-hidden` |
| Nota de atajo | `p.shortcut` con "Archivero: Ctrl+B"; visible solo si `showShortcut()` = `!isMobile() && !isTablet()` (`topbar.component.ts:61`) |
| Reloj | `<time [attr.datetime]="iso()">` con `clock()` |

Construcción del trail (`topbar.component.ts:132-159`): recorre `ActivatedRouteSnapshot` desde la raíz con `firstChild`, acumula los segmentos de `node.url` y, para cada nodo cuyo `data.breadcrumb` sea string, empuja `{ label, url: '/' + segmentos }`. Antepone `Inicio → /`. Si el primer y el último paso apuntan a la misma URL (caso de `/`), elimina `Inicio` (líneas 154-156). Se recalcula en cada `NavigationEnd` (líneas 89-91).

Reloj: `Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })` para la hora y `Intl.DateTimeFormat('es-MX', { weekday: 'long' })` para el día; el resultado es `10:24 AM · Miércoles` con la inicial en mayúscula (líneas 66-78). Un `setTimeout` alinea la primera actualización con el siguiente minuto exacto y luego un `setInterval` de 60 s (líneas 99-109). Ambos se limpian en `DestroyRef.onDestroy`.

## 5. SidebarStateService

| Signal | Tipo | Origen |
| --- | --- | --- |
| `collapsed` | `Signal<boolean>` | Preferencia explícita del usuario; semilla leída de `localStorage` (`sidebar-state.service.ts:20, 120-126`) |
| `isTablet` | `Signal<boolean>` | `matchMedia('(min-width: 768px) and (max-width: 1023px)')` (líneas 4, 55) |
| `isMobile` | `Signal<boolean>` | `matchMedia('(max-width: 767px)')` (líneas 5, 56) |
| `mobileOpen` | `Signal<boolean>` | Estado del drawer; no se persiste |
| `effectiveCollapsed` | `computed<boolean>` | Móvil → `false`; tablet → `true`; escritorio → `collapsed` (líneas 44-52) |

Métodos: `toggle()`, `setCollapsed(value)`, `openMobile()`, `closeMobile()`, `toggleMobile()`. `openMobile` y `toggleMobile` no hacen nada fuera de móvil (líneas 85-102).

Persistencia: clave `utn-rh.sidebar-collapsed`, escrita por un `effect` que solo depende de `_collapsed` (líneas 3, 58-65). Consecuencias deliberadas:

- `effectiveCollapsed` **no** se escribe en `localStorage`: entrar en tablet no destruye la preferencia de escritorio.
- Un segundo `effect` cierra el drawer móvil al salir del rango móvil (líneas 67-71).
- El tema no vive aquí: `ThemeService` es el único que escribe `utn-rh.theme` y `data-theme`.

Anchos: `--sidebar-width: 280px` y `--sidebar-width-collapsed: 76px` (`src/styles/tokens/_primitives.scss:84,88`).

## 6. Responsive: SCSS frente a matchMedia

Breakpoints del sistema (`src/styles/_breakpoints.scss:6-9`):

| Token | Valor | Uso actual |
| --- | --- | --- |
| `$bp-lg` | `1199px` | Definido, **sin consumidores** en ningún `.scss` |
| `$bp-md` | `1023px` | `shared/ui/drawer`, y equivalente al límite superior de tablet |
| `$bp-sm` | `767px` | `app-shell`, `topbar`, `sidebar` |
| `$bp-xs` | `479px` | Varias pantallas y primitivas |

Los valores de JavaScript están **duplicados a mano** como cadenas en `sidebar-state.service.ts:4-5` (`768–1023` y `max-width: 767`), no derivados del SCSS. Hoy coinciden con `$bp-md` y `$bp-sm` en los límites que importan: el SCSS usa `@include bp.down(bp.$bp-sm)` (`max-width: 767px`) y JS usa `max-width: 767px`; para tablet, JS exige `min-width: 768px` y `max-width: 1023px`, que es el complemento exacto de ambos mixins.

Discrepancia a vigilar: `$bp-lg: 1199px` describe un "escritorio compacto" que el shell ignora por completo. Para JS, a partir de 1024 px ya es escritorio pleno con rail opcional. Mientras `$bp-lg` no tenga consumidores no hay conflicto visual, pero si se empieza a usar en estilos del shell, entre 1024 y 1199 px el CSS y el estado de JavaScript discreparán. Cualquier cambio de breakpoint debe tocar los dos lugares.

## 7. Accesibilidad implementada

| Atributo / patrón | Dónde |
| --- | --- |
| `nav aria-label="Menú principal"` y `nav aria-label="Ruta de navegación"` | `sidebar.component.html:81`, `topbar.component.html:27` |
| `aria-expanded` + `aria-controls` en plegado, rama y botón móvil | `sidebar.component.html:55-59, 156-160, 182-183`; `topbar.component.html:6-8` |
| `aria-current="page"` en destinos activos | varios `routerLinkActive` con `ariaCurrentWhenActive="page"` |
| `aria-hidden="true"` en iconos SVG, separadores, indicador y scrim | todo el marcado decorativo |
| `inert` + `aria-hidden` en drawer cerrado y submenú cerrado | `app-shell.component.html:9-10`; `sidebar.component.html:221-222` |
| Tooltip del rail con `role="tooltip"` y `aria-describedby` en el ítem | `sidebar.component.html:417-425` |
| Popover del rail con `role="group"` y `aria-label="Empleados"` | `sidebar.component.html:381-386` |
| Devolución de foco al botón de menú al cerrar el drawer | `app-shell.component.ts:34-39` |
| Foco al primer enlace al abrir el popover | `sidebar.component.ts:294-297` |

No hay `aria-live` en el shell ni gestión de foco tipo roving `tabindex`: la navegación por teclado sigue el orden del DOM. Tampoco existe un `<h1>` en el shell; el título de cada pantalla lo aporta `PageHeader`.

## Referencias

- `src/app/layout/app-shell/app-shell.component.ts`
- `src/app/layout/app-shell/app-shell.component.html`
- `src/app/layout/app-shell/app-shell.component.scss`
- `src/app/layout/sidebar/sidebar.component.ts`
- `src/app/layout/sidebar/sidebar.component.html`
- `src/app/layout/sidebar/sidebar.component.scss`
- `src/app/layout/sidebar/credential-card/credential-card.component.ts`
- `src/app/layout/sidebar/role-label.ts`
- `src/app/layout/topbar/topbar.component.ts`
- `src/app/layout/topbar/topbar.component.html`
- `src/app/layout/topbar/topbar.component.scss`
- `src/app/core/layout/sidebar-state.service.ts`
- `src/styles/_breakpoints.scss`
- `src/styles/tokens/_primitives.scss`
