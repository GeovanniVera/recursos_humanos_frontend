# Sistema de Recursos Humanos · UTN

Frontend del back office de Recursos Humanos de la Universidad Tecnológica de
Nezahualcóyotl. Angular 22 sobre el sistema de tokens descrito en
[`AGENTS.md`](./AGENTS.md) — ese documento es la fuente de verdad del diseño, y
este README la fuente de verdad de cómo se corre.

## Requisitos

- **Node** `^22.22.3 || ^24.15.0 || >=26.0.0` (el rango lo impone Angular 22)
- **npm** 10 o superior

## Levantar el proyecto

```bash
npm ci
npm start          # http://localhost:4200
```

La aplicación habla con `http://localhost:8080/api`. Ese backend vive en su
propio repositorio (Laravel + Docker) y hay que levantarlo aparte:

```bash
docker compose up            # en el repositorio del backend
```

Los códigos de acceso del login se leen en **Mailpit**: `http://localhost:8025`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | Servidor de desarrollo en `:4200` |
| `npm run build` | Build de producción. **Antes corre `lint:styles`** |
| `npm test` | Vitest en modo watch |
| `npm run verify` | lint + build + tests. **Es lo que se corre antes de pushear** |
| `npm run lint:styles` | Stylelint sobre todos los `.scss` |
| `npm run brand:vectorize` | Regenera el SVG del logo desde el PNG fuente |

`npm run build` ejecuta el lint primero mediante un hook `prebuild`: un color
crudo en un componente **rompe el build**, no genera una advertencia.

## Cómo está organizado

```
src/
  styles/
    styles.scss              # tokens, base del documento y fondo del tema
    tokens/                  # única carpeta donde se permiten valores literales
  app/
    core/                    # servicios sin vista
      auth/                  # token, sesión, guardas
      dashboard/ padron/ empleados/   # un servicio por contrato del backend
      http/                  # interceptor que adjunta el Bearer
      layout/                # estado del sidebar
      theme/                 # data-theme y persistencia
    layout/                  # app-shell, sidebar, topbar
    shared/ui/               # componentes reutilizables sin dominio
    features/                # pantallas
```

### Rutas

| Ruta | Pantalla |
| --- | --- |
| `/login` | Acceso sin contraseña: correo institucional + código de 6 dígitos |
| `/` | Panel general con tres indicadores |
| `/empleados` | Índice de la sección |
| `/empleados/activos` | Listado de la plantilla vigente, con búsqueda y paginación |
| `/empleados/alta` | Formulario de alta, en cuatro pasos |
| `/empleados/baja` | Pendiente de contrato |
| `/semaforo-documentos` | Pendiente de contrato |
| `/ajustes` | Selector de tema |
| `/tokens`, `/ui` | Pantallas internas de control, sin enlace en el menú |

## Reglas del sistema de diseño

Tres niveles de token: **primitivos** → **semánticos por tema** → **componentes**.
Un componente solo consume tokens semánticos y nunca declara un color, radio,
sombra, duración o curva propios.

- Los tres temas (`guinda`, `light`, `dark`) comparten nombres, no valores, y se
  aplican con `data-theme` en `<html>`.
- El **login queda siempre en `light`**: la preferencia del usuario aplica
  adentro del sistema, no a la puerta de entrada.
- Si falta un token, se crea primero en `src/styles/tokens/`. Nunca se escribe
  el valor dentro del componente — `stylelint` lo rechaza.

Las capturas del lienzo de diseño (`docs/design/`) **no se versionan**: son
material de referencia del autor. Si clonás el repositorio y la carpeta está
vacía, es esperado.

## Docker

La imagen compila el bundle y lo sirve con nginx.

```bash
docker build --build-arg API_BASE_URL=https://api.ejemplo.mx/api -t utn-rh .
docker compose up
```

`API_BASE_URL` es un argumento de build, no de runtime: Angular resuelve los
entornos en tiempo de compilación. El Dockerfile reescribe
`src/environments/environment.prod.ts` dentro de la imagen; el archivo del
repositorio es el valor por defecto.

## Convenciones

- **Commits convencionales** (`feat:`, `fix:`, `chore:`, `docs:`). Sin
  atribución a herramientas.
- **Una acción principal por vista.** El botón primario es único; el resto son
  secundarios o fantasma.
- **Estados por forma además de color**: todo mensaje de error lleva ícono o
  palabra, nunca solo rojo.
- **Nada de `new Date('YYYY-MM-DD')`** para fechas del backend: interpreta UTC y
  corre el día en México. Usar el helper que parsea la cadena.

## Estado del proyecto

Implementado y cubierto por tests: tokens y temas, shell, login, panel, padrón,
ficha en drawer, alta con validación espejo del backend (CURP completa) y baja.

Pendiente: semáforo de documentos, listado de bajas (falta endpoint), botón
`Editar` de la ficha, y prueba de punta a punta de alta y baja contra el backend.
