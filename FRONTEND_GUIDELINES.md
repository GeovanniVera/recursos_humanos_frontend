# FRONTEND_GUIDELINES.md — Guía técnica de arquitectura, UI y calidad

> **Lectura obligatoria** para cualquier desarrollador o asistente de IA antes de crear o modificar vistas, estilos, servicios o componentes en `recursos_humanos_frontend`.
> Complementa a [AGENTS.md](./AGENTS.md) (fuente de verdad de tokens e identidad visual).

---

## 1. Stack, arquitectura y presupuestos

- **Framework y reactividad**: Angular `^22.2` con componentes **standalone**, configuración **zoneless** (`src/app/app.config.ts`) y gestión de estado basada en **Signals** (`signal`, `computed`, `effect`, `input`, `output`, `model`).
- **Estilo estricto mediante tokens (`stylelint.config.mjs`)**:
  - Prohibido declarar hexadecimales (`color-no-hex`), funciones `rgb()`/`rgba()`/`hsl()`/`hsla()` o valores literales en `color`, `background`, `background-color`, `border-color`, `box-shadow` y `border-radius` fuera de `src/styles/tokens/**/*.scss`. Todos deben usar `var(--...)`.
  - Prohibido escribir duraciones literales (`ms` o `s`) en propiedades `animation*` o `transition*`.
  - Los componentes consumen exclusivamente **tokens semánticos** (nunca primitivos como `--guinda-700` directamente). Si falta un rol semántico, se define en los tres archivos de tema (`_theme-guinda.scss`, `_theme-light.scss`, `_theme-dark.scss`).
- **Compatibilidad multitema**: Todo componente nuevo o modificado debe mantener contraste legible (mínimo 4.5:1 en texto normal, 3:1 en texto grande) y coherencia visual en los 3 temas: `guinda` (defecto), `light` y `dark`.
  - En `light`, el dorado (`--color-accent`) no debe usarse como color de texto.
  - En `guinda`, los estados de error usan superficie clara (`--color-state-error`) + texto oscuro (`--color-state-error-ink`) e ícono descriptivo, nunca relleno rojo sólido.
- **Presupuesto CSS (`angular.json`)**: El límite por hoja de estilos de componente (`anyComponentStyle`) es **`7kB` warning / `10kB` error**. Mantén cada `.component.scss` **por debajo de `7.00 kB`** evitando selectores redundantes y reutilizando primitivas compartidas en `src/app/shared/ui/`.

---

## 2. Responsive, layout y breakpoints

- **Breakpoint único del sistema (`src/styles/_breakpoints.scss`)**:
  Importa `@use '<ruta-relativa>/styles/breakpoints' as bp;` y utiliza únicamente los breakpoints definidos con el mixin `@include bp.down(...)`:
  - `bp.$bp-lg`: `1199px` (escritorio compacto / laptop)
  - `bp.$bp-md`: `1023px` (tablet, incluye `768×1024`)
  - `bp.$bp-sm`: `767px` (móvil, incluye `390×844` y drawer off-canvas)
  - `bp.$bp-xs`: `479px` (móvil pequeño, `360–375px`)
  - Prohibido introducir media queries con medidas sueltas (`760px`, `640px`, etc.).
- **Contención de desbordamientos**:
  - Toda vista raíz `.page` (y contenedores flex/grid internos con texto o tablas) debe declarar `min-width: 0;`.
  - Todo grid dinámico `auto-fit` / `auto-fill` debe protegerse con `minmax(min(100%, <ancho>), 1fr)` para no forzar scroll horizontal en pantallas estrechas.
- **Unidades de alto**: Usar `100dvh` en lugar de `100vh` en shell, drawers, modales y contenedores de pantalla completa para respetar barras dinámicas de navegadores móviles.
- **Navegación adaptativa (`AppShell`, `Sidebar`, `Topbar`, `SidebarStateService`)**:
  - En tablet (`<= bp.$bp-md`), el `Sidebar` deriva su estado colapsado (`effectiveCollapsed`) a rail de `76px` **sin sobrescribir** la preferencia de escritorio guardada en `localStorage`.
  - En móvil (`<= bp.$bp-sm`), el `Sidebar` actúa como drawer off-canvas con scrim, botón táctil (`44×44 px`) en `Topbar`, cierre automático al navegar / clic fuera / `Escape` (devolviendo foco al botón de menú) y `[attr.inert]` cuando está cerrado.
  - Los tooltips del rail (`76px`) solo se muestran en rail colapsado de escritorio/tablet (`collapsed() && !isMobile()`), nunca dentro del drawer móvil.

---

## 3. Primitivas compartidas obligatorias (`src/app/shared/ui/`)

Antes de crear marcado o estilos locales en `features/`, reutiliza las primitivas existentes:

| Necesidad | Componente / Helper | Reglas clave de uso |
| :--- | :--- | :--- |
| **Alertas y avisos** | `<app-alert-banner>` (`alert-banner`) | Variantes `error \| warning \| info \| success`. Asigna automáticamente `role="alert"` (`error`/`warning`) o `role="status"` (`info`/`success`). **Prohibido** crear bloques `.alert` o `.notice` locales en `.scss` de módulo. |
| **Tablas de datos** | `<app-data-table>` (`data-table`) | Declarar siempre `[rowKey]` para tracking por identidad (`trackRow`). Elegir `[mobileMode]="'cards'"` en listados de consulta (`EmpleadosPage`, `SemaforoPage`) o `[mobileMode]="'scroll'"` en tablas densas con controles por celda (`CatalogosPage`). En modo `'cards'`, el `<thead>` usa patrón `sr-only` (nunca `display: none`). |
| **Paginación** | `<app-pagination>` (`pagination`) | Modos `mode="full"` (pie de tabla con rango, selector de tamaño y salto de página) o `mode="compact"`. Genera IDs únicos por instancia para evitar colisiones. |
| **Botones** | `<app-button>` (`button`) | Usar `[loading]="..."` para acciones asíncronas: muestra un `.spinner` SVG decorativo integrado conservando visible el texto proyectado sin saltos bruscos de ancho. |
| **Tarjetas KPI** | `<app-kpi-card>` (`kpi-card`) | Estados interactivos `:hover` encapsulados bajo `@media (hover: hover)` para evitar hover pegajoso en pantallas táctiles. |
| **Modales y Drawers** | `<app-modal>` / `<app-drawer>` (`modal`, `drawer`) | Animados con CSS moderno (`@starting-style` + `transition-behavior: allow-discrete`). **Nunca** envolver su contenido interno en `@if (open())` si destruye el DOM antes de terminar el cierre; cuando limpien estado al cerrarse, cancelar las peticiones HTTP en curso al instante y diferir el reset de señales/formularios ~`300ms` (`--motion-fast`) limpiando el timer en `DestroyRef` (y cancelándolo si se reabre antes). |
| **Notificaciones** | `ToastService` + `<app-toast-container>` (`toast`) | Gestiona temporizadores de salida y entrada desde `ToastService` con limpieza automática en `DestroyRef`. |
| **Etiquetas de expediente** | `etiquetaCampoExpediente` (`src/app/core/empleados/expediente-campos.ts`) | Fuente única para mapear claves del backend (`curp`, `fecha_ingreso_gobierno`, `entidad_nacimiento`, etc.) hacia español legible en `FichaDrawer`, `FaltantesDrawer` o vistas equivalentes. Prohibido mostrar claves crudas al usuario. |
| **Identidad y fondo login** | `<app-brand-logos>`, `<app-animated-backdrop>` | Logos oficiales UTN/Edomex siempre vía `<app-brand-logos>`; `<app-animated-backdrop>` es exclusivo de vistas públicas/login (nunca en el shell del dashboard). |

---

## 4. Rendimiento GPU y Motion Design

- **Capas `backdrop-filter: blur()` limitadas a 5**: Reservar `backdrop-filter: blur(var(--blur-glass))` exclusivamente para las **5 superficies flotantes principales**:
  1. `Sidebar` (`src/app/layout/sidebar/sidebar.component.scss`)
  2. `Topbar` (`src/app/layout/topbar/topbar.component.scss`)
  3. `Modal` (`src/app/shared/ui/modal/modal.component.scss`)
  4. `Drawer` (`src/app/shared/ui/drawer/drawer.component.scss`)
  5. `ToastContainer` (`src/app/shared/ui/toast/toast-container.component.scss`)
  **Nunca** aplicar `backdrop-filter` en tarjetas, filas de tabla, alertas ni fondos decorativos internos.
- **Propiedades compuestas en GPU**: Animar únicamente `transform` y `opacity` (p. ej. `scaleX` en barras de progreso, `translateY`/`translateX` en entradas `.enter-stage`, `.enter-rise`, `.pill-indicator`, gradientes radiales pre-difuminados en lugar de `filter: blur()` animado).
- **Estados de carga (skeletons)**: Usar la clase utilitaria `.skeleton-shimmer` (`src/styles/tokens/_motion.scss`, alimentada por `--color-skeleton-sheen`) en skeletons de tablas, tarjetas, formularios y drawers, evitando textos planos tipo `"Cargando…"`.
- **Ciclo de vida de timers**: Todo `setTimeout` o `setInterval` en componentes o servicios debe almacenar su identificador y limpiarse explícitamente mediante `DestroyRef.onDestroy(...)` (y al reiniciar el flujo correspondiente).
- **Scroll programático bajo Topbar sticky**: Todo encabezado de sección, tarjeta o campo (`scrollIntoView`) susceptible de recibir foco o scroll programático (como en formularios multipaso) debe declarar `scroll-margin-top` suficiente (p. ej. `calc(var(--space-8) * 2)`) para que el `<app-topbar>` sticky no lo cubra.

---

## 5. Accesibilidad y redacción (Copy UX)

- **Movimiento reducido**: Toda nueva animación o microinteracción debe respetar `@media (prefers-reduced-motion: reduce)` usando tokens de `_motion.scss` (`--enter-*`, `--button-hover-lift`, `.skeleton-shimmer::after`), desactivando desplazamientos, escalas y brillos continuos pero conservando visibilidad y transiciones de opacidad limpias.
- **Foco y alto contraste**:
  - Preservar el anillo global `:focus-visible` (`src/styles/styles.scss`) y añadir soporte explícito `@media (forced-colors: active)` en controles personalizados o con estados visuales especiales (como OTP, botones o toggles de tema).
  - Aplicar `[attr.inert]` en paneles ocultos, drawers cerrados o navegación colapsada inaccesible.
  - Todo botón solo-ícono debe llevar `aria-label` descriptivo; objetivos táctiles interactivos de mínimo `44 px` (`--space-8`).
- **Tuteo mexicano estricto**: Toda la interfaz, mensajes de validación, errores, confirmaciones y documentación orientada al usuario final debe redactarse en **tuteo consistente en español de México** (*tienes, quieres, vuelve, reintenta, elige, completa, revisa, ingresa, selecciona*). Queda estrictamente prohibido el voseo (*tenés, querés, elegí, completá, reintentá*).

---

## 6. Rutas y flujo de validación

- **Rutas de desarrollo**: Vistas de inspección interna como `/tokens` y `/ui` deben permanecer protegidas tras `!environment.produccion` en `src/app/app.routes.ts` para nunca exponerse en compilaciones productivas (`Dockerfile` / `ng build`).
- **Verificación obligatoria antes de concluir cualquier tarea**:
  Ejecutar en `recursos_humanos_frontend/`:
  ```bash
  npm run verify
  ```
  El comando valida:
  1. `stylelint "src/**/*.scss"` (0 errores de tokens/estilos).
  2. `ng build` (0 warnings de budget y compilación productiva limpia).
  3. `npm test -- --watch=false` (suite Vitest/jsdom completa en verde).
  Si el cambio afecta layout, overlays, temas o flujos críticos, reconstruir y validar visualmente en desktop, tablet y móvil.
