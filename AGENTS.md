# AGENTS.md

Guía para personas y agentes de IA que trabajen en este repositorio (Angular).
Lee este archivo completo y la guía técnica obligatoria [FRONTEND_GUIDELINES.md](./FRONTEND_GUIDELINES.md) antes de crear o modificar cualquier vista, componente o estilo.

> **Lectura obligatoria:** Toda regla de arquitectura Angular (Zoneless/Signals), breakpoints responsive, primitivas compartidas de `src/app/shared/ui/`, presupuesto CSS (`< 7.00 kB`), rendimiento GPU/Motion, accesibilidad (`inert`, `forced-colors`, `prefers-reduced-motion`) y redacción en tuteo mexicano se rige por [FRONTEND_GUIDELINES.md](./FRONTEND_GUIDELINES.md).

## 1. Producto y principio central

**Producto:** Sistema de Recursos Humanos de la Universidad Tecnológica de Nezahualcóyotl (UTN).
Identidad institucional: logo de la UTN y logo del Gobierno del Estado de México.


El diseño está definido por **tokens fijos e intercambiables**. Los componentes
nunca guardan un color, tamaño, sombra o tiempo propio: lo piden por nombre y el
tema decide el valor.

- Temas: `guinda` (por defecto), `light`, `dark`.
- Los tres temas comparten **los mismos nombres de token**. Solo cambian los valores.
- Paleta base: rojo guinda, dorado y blanco. Tipografía: Sora (mono: JetBrains Mono).
- Estética: cristal translúcido (glassmorphism) con animaciones y transiciones como
  parte central de la experiencia.

## 2. Fuente de verdad

| Qué | Dónde |
| --- | --- |
| Arquitectura, UX, responsive y rendimiento | [FRONTEND_GUIDELINES.md](./FRONTEND_GUIDELINES.md) (**lectura obligatoria**) |
| Breakpoints responsive | `src/styles/_breakpoints.scss` |
| Tokens primitivos | `src/styles/tokens/_primitives.scss` |
| Tokens semánticos por tema | `src/styles/tokens/_theme-guinda.scss`, `_theme-light.scss`, `_theme-dark.scss` |
| Movimiento y utilidades | `src/styles/tokens/_motion.scss` |
| Logos institucionales | `src/assets/brand/` (SVG; ver sección 6) |
| Referencia visual | `docs/design/` (capturas del lienzo de diseño) |

Si un valor de esta guía contradice el archivo de tokens, **manda el archivo de tokens**.

## 3. Arquitectura de tokens (3 niveles)

1. **Primitivos**: valores crudos (`--guinda-700`, `--gold-400`, `--space-4`).
2. **Semánticos**: roles con significado (`--color-text-primary`). Aquí se intercambia el tema.
3. **Componentes**: consumen **solo** tokens semánticos, nunca primitivos.

Convención de nombres: `--categoría-rol-variante`.
Ejemplos: `--color-surface-glass`, `--radius-lg`, `--motion-base`.

El tema se aplica con un atributo en la raíz: `<html data-theme="guinda|light|dark">`.

## 4. Tokens semánticos de color

| Token | Guinda | Light | Dark |
| --- | --- | --- | --- |
| `--color-bg-canvas` | `#6B0F26` | `#FFFFFF` | `#17030B` |
| `--color-surface-glass` | `rgba(255,255,255,.08)` | `rgba(255,255,255,.72)` | `rgba(255,255,255,.05)` |
| `--color-surface-overlay` | `rgba(70,8,28,.6)` | `rgba(255,255,255,.92)` | `rgba(30,5,14,.8)` |
| `--color-border-default` | `rgba(255,255,255,.2)` | `rgba(142,27,45,.14)` | `rgba(255,255,255,.12)` |
| `--color-text-primary` | `#FFFFFF` | `#4A0A1D` | `#F7ECEE` |
| `--color-text-secondary` | `#F1DDA0` | `#7A1A2E` | `#D9B8C0` |
| `--color-action-primary` | `#FFFFFF` | `#8E1B2D` | `#E8C766` |
| `--color-action-on-primary` | `#5C0A1F` | `#FFFFFF` | `#2B0613` |
| `--color-accent` | `#E8C766` | `#B8941F` | `#E8C766` |
| `--color-state-error` | `#FFF1F2` | `#B30D28` | `#FFF1F2` |
| `--color-state-success` | `#7EE2B8` | `#0F7B55` | `#7EE2B8` |
| `--color-state-info` | `#8CC8FF` | `#1D6FB8` | `#8CC8FF` |
| `--color-state-warning` | `#FFB547` | `#B26A00` | `#FFB547` |

Notas:
- El fondo de cada tema es un degradado suave sobre `--color-bg-canvas`, con dos halos
  (dorado y rojo) que flotan despacio.
- `--color-border-ghost` es la versión «sin línea» de `--color-border-default`: un control
  que solo dibuja su borde al pasar el puntero o al enfocarse (los selectores y campos que
  viven dentro de una celda de tabla).
- En `light`, **el dorado no se usa como color de texto** (no cumple contraste). Solo en
  rellenos, líneas y degradados.
- Sobre guinda, el **error no se pinta con rojo**: usa superficie rosa clara
  (`--color-state-error`) con texto guinda oscuro e ícono con ✕. Cada estado se distingue
  por ícono y forma, no solo por color.

## 5. Otros tokens

**Tipografía** (tamaño / peso)
- `--text-display` 40/700 · `--text-title` 28/600 · `--text-heading` 20/700
- `--text-body` 13/400 · `--text-label` 11/600 (+6 % tracking) · `--text-overline` 10/600 (+12 %)

**Espaciado**: `--space-1…6` = 4, 8, 12, 16, 20, 24 · `--space-7` 32 · `--space-8` 44.

**Radios**: `--radius-sm` 10 · `--radius-md` 12 · `--radius-lg` 18 · `--radius-xl` 22 ·
`--radius-2xl` 28 · `--radius-pill` 999.

**Efectos**: `--blur-glass` 20 px · borde de 1 px · `--shadow-sm|md|lg` ·
`--scrim` guinda al 55 % · elevación en hover `-6px` · anillo de foco 4 px (acento al 25 %).

**Logos** (ver sección 6)
- `--logo-slot-bg` `#FFFFFF` en los tres temas · `--logo-slot-radius` 12 px (sidebar) y 14 px (login)
- `--logo-slot-height-sm` 46 px (sidebar) · `--logo-slot-height-lg` 56 px (login) · `--logo-slot-min-width` 150 px (login)
- `--logo-gap` 8 px (sidebar) y 18 px (login) · placeholder: borde 1.5 px punteado

**Fondo animado** (solo login y pantallas públicas; ver sección 7)
- `--backdrop-aurora-1|2|3` 16 s · 20 s · 24 s (luces dorada, roja y blanca)
- `--backdrop-ring` 3 anillos, 9 s, desfase 3 s · `--backdrop-sweep` haz dorado, 9 s
- `--backdrop-particles` 22 puntos, 9–18 s · `--backdrop-grid` 56 px con máscara radial
- `--backdrop-cta-shimmer` 3.2 s con desfase 1.5 s

**Movimiento**
- `--motion-fast` 300 ms · `--motion-base` 600 ms · `--motion-slow` 900 ms
- `--motion-ease`: `cubic-bezier(.2, .8, .2, 1)` (única curva permitida)
- `--motion-stagger`: 70–100 ms entre elementos de una lista
- Entradas: `rise` (sube 20 px + fundido), `drawer` (desde la derecha 70 px + fundido),
  `modal` (sube 24 px, escala .95 → 1).
- Respetar siempre `prefers-reduced-motion`: sin desplazamientos ni escalas, solo fundido.

## 6. Identidad institucional (logos)

- Los logos oficiales se guardan en `src/assets/brand/` como **SVG** (o PNG con fondo transparente).
- Siempre se colocan dentro de un contenedor blanco (`--logo-slot-bg`), en cualquier tema.
- **No** se recolorean, deforman, recortan ni se redibujan. Si falta un archivo, se usa el
  placeholder (caja blanca con borde punteado y la etiqueta `LOGO UTN` / `LOGO GOB. EDOMEX`).
- Ubicaciones: arriba de la sidebar (dos cajas lado a lado, con el texto "Sistema de Recursos
  Humanos" debajo) y en el encabezado del login (separados por una línea vertical).
- Se implementan en un único componente, `app-brand-logos`, con las variantes `sm` y `lg`.
  Ninguna pantalla coloca logos por su cuenta.

## 7. Acceso (login) y fondo animado

- Acceso **sin contraseña**, en dos pasos: correo institucional y código de 6 dígitos.
- Indicador de dos puntos: el activo se alarga y se vuelve dorado.
- Código: reenvío tras 30 s y enlace "Cambiar correo". Caducidad de 10 minutos
  (**por confirmar**: es un supuesto de diseño).
- Error de código: casillas con borde rosa claro, vibración corta y mensaje con ícono
  (ver `--color-state-error`).
- El fondo animado es exclusivo del login: luces que se desplazan, cuadrícula con haz dorado,
  anillos que se expanden, partículas que suben y un destello en el botón principal.
- Se implementa en el componente `app-animated-backdrop`. Los dashboards **no** lo usan:
  solo llevan los halos suaves del fondo.
- Con `prefers-reduced-motion` el fondo queda estático.
- Textos de ejemplo (por ejemplo `nombre@correo-institucional`) son ficticios y deben
  sustituirse por los datos reales.

## 8. Reglas obligatorias

1. **Prohibido** escribir colores (`#fff`, `rgb()`, `hsl()`), sombras, radios, `blur`,
   `transition` o `animation` con valores directos fuera de `src/styles/tokens/`.
2. Un componente solo consume tokens **semánticos**. Nunca primitivos.
3. Si falta un token, **créalo primero** en el nivel semántico (en los tres temas) y luego úsalo.
   No lo inventes dentro del componente.
4. Cada componente nuevo debe verse y leerse bien en los **tres temas**.
5. Contraste mínimo de texto 4.5:1 (3:1 desde 24 px) en los tres temas.
6. Elementos interactivos reales (`<button>`, `<a>`, `<input>` con `<label>`), objetivo
   táctil mínimo 44 px, `aria-label` en botones con solo ícono.
7. Una sola acción principal por vista o capa (botón de `--color-action-primary`).
8. Íconos en SVG de trazo. Sin emojis en la interfaz.
9. No introducir nuevas fuentes, curvas de animación ni duraciones.

## 9. Estructura sugerida (Angular)

```
src/
  styles/
    tokens/
      _primitives.scss
      _theme-guinda.scss
      _theme-light.scss
      _theme-dark.scss
      _motion.scss
    styles.scss              # importa los tokens y aplica el fondo del tema
  app/
    core/
      theme/theme.service.ts # aplica data-theme en <html> y lo persiste
    shared/
      ui/                    # componentes base: button, card, input, table,
                             #   modal, drawer, toast, sidebar, stepper,
                             #   brand-logos, animated-backdrop
    features/                # pantallas; solo componen componentes de shared/ui
assets/brand/                # logos oficiales (SVG)
docs/design/                 # referencia visual
```

Criterios:
- Componentes **standalone**, con estilos propios que solo usan `var(--token)`.
- Las pantallas de `features/` no tienen estilos de color propios: componen `shared/ui`.
- `ThemeService` expone el tema como `signal` y es el único que escribe `data-theme`.
- Si se usa Angular Material o CDK, enlazar sus variables a los tokens propios en vez de
  sobrescribir estilos componente por componente.

## 10. Componentes base y tokens que consumen

| Componente | Tokens principales |
| --- | --- |
| Sidebar (menú jerárquico, desplegable) | `surface-glass`, `border-default`, `text-primary`, `action-primary` (activo), `logo-slot-*` |
| Tarjeta KPI | `surface-glass`, `text-primary`, `accent`, `radius-lg`, `shadow-sm` |
| Tabla | `surface-glass`, `text-secondary` (cabecera), `accent` (fila activa) |
| Campo de texto | `border-default`, `accent` (foco), `state-error`, `radius-md` |
| Botón primario | `action-primary`, `action-on-primary`, `radius-pill` |
| Modal y drawer | `surface-overlay`, `scrim`, `radius-2xl`, entradas `modal` / `drawer` |
| Toast y banner | `state-*`, `text-primary`, `radius-lg`, `motion-base` |
| Formulario multipaso | `action-primary`, `accent` (progreso), `surface-glass` |
| Logos institucionales | `logo-slot-*`, `radius-md` |
| Login por correo + código OTP | `surface-glass` (más luminoso), `accent` (foco), `state-error`, `backdrop-*`, `logo-slot-*` |

## 11. Validación automática

Las reglas se hacen cumplir con herramientas, no solo con este documento.

- **Stylelint**: `color-no-hex` activo en todo el proyecto salvo `src/styles/tokens/`.
- **stylelint-declaration-strict-value**: exigir `var(--…)` en `color`, `background`,
  `border-color`, `box-shadow`, `border-radius`, `transition` y `animation`.
- El pipeline debe **fallar** si alguna regla incumple.
- Revisión visual: probar cada pantalla nueva en los tres temas antes de abrir el PR.

## 12. Lista de verificación antes de entregar

- [ ] No hay valores directos fuera de `src/styles/tokens/`.
- [ ] Solo se usan tokens semánticos.
- [ ] Probado en `guinda`, `light` y `dark`.
- [ ] Contraste de texto verificado.
- [ ] Animaciones con tokens de movimiento y `prefers-reduced-motion` respetado.
- [ ] Estados de error, éxito, información y advertencia usan `--color-state-*` con ícono.
- [ ] Teclado y lectores de pantalla: foco visible, etiquetas y `aria-label` completos.
- [ ] Logos reales sin alterar, dentro de contenedor blanco y desde `app-brand-logos`.
- [ ] El fondo animado solo aparece en login y respeta `prefers-reduced-motion`.

## 13. Pantallas de referencia

El lienzo de diseño incluye: dashboard (guinda, light y dark) con espacio para logos, tabla con
drawer de empleado, formulario multipaso, login institucional UTN (correo y código OTP con
fondo animado), login base, estados del sistema, drawer y modales, y la especificación de tokens.
Pendiente: las sidebars de empleados y formulario aún muestran el logo genérico. Guarda capturas de cada una en
`docs/design/` y enlázalas aquí.

## 14. Historial de cambios

- 2026-11-13: se incorpora y enlaza [FRONTEND_GUIDELINES.md](./FRONTEND_GUIDELINES.md) como guía técnica obligatoria tras completar las 4 etapas de mejora UX/UI, responsive, motion y rendimiento.
- 2026-11-11: se añade identidad institucional (logos UTN y Gobierno del Estado de México),
  login institucional con fondo animado, tokens `logo-*` y `backdrop-*`, y reglas de acceso.
- 2026-11-11: versión inicial del sistema de diseño (tokens, tres temas, componentes).
