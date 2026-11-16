# Documentación técnica — Sistema de Recursos Humanos UTN

Fuente de verdad del **frontend** de Recursos Humanos de la Universidad Tecnológica de
Nezahualcóyotl. Describe el proyecto tal como está en la rama `develop` hoy, verificada
contra el código, no contra notas anteriores.

## Cómo se lee

Los documentos están ordenados por **módulo**, no por historia de usuario. Cada uno
cubre su dominio completo: los servicios de `core/`, las pantallas de `features/` y los
contratos HTTP que los conectan.

Regla de precedencia cuando algo no coincide:

```text
el código  >  docs/modulos/  >  AGENTS.md y FRONTEND_GUIDELINES.md  >  docs/historico/
```

Si encontrás una contradicción, gana el código y la documentación se corrige. No al revés.

## Entradas

| Si querés entender… | Leé |
| --- | --- |
| Cómo está armado el proyecto y por qué | [`arquitectura.md`](./arquitectura.md) |
| Qué hace un módulo y qué endpoints consume | `modulos/<módulo>.md` |
| Cómo se ve cualquier cosa y con qué tokens | [`modulos/tema-y-estilos.md`](./modulos/tema-y-estilos.md) |
| Qué componente reusar en vez de escribir uno | [`modulos/shared-ui.md`](./modulos/shared-ui.md) |
| Un pendiente abierto entre frontend y backend | `nota-tecnica-*.md`, `matriz-*.md` |

## Módulos

| Documento | Dominio | Cuando lo necesitás |
| --- | --- | --- |
| [`modulos/auth.md`](./modulos/auth.md) | Login OTP, sesión Bearer, guards, roles | Tocar el acceso o la autorización |
| [`modulos/empleados.md`](./modulos/empleados.md) | Ficha, alta, edición, baja, validación CURP | Cualquier cambio sobre el expediente |
| [`modulos/padron.md`](./modulos/padron.md) | `/empleados`: pestañas por estatus, búsqueda, filas | La vista de entrada al expediente |
| [`modulos/paginacion.md`](./modulos/paginacion.md) | `PaginatedBuffer`: página lógica vs bloque de red | Paginar contra un backend con bloques grandes |
| [`modulos/semaforo.md`](./modulos/semaforo.md) | `/semaforo-documentos`: completitud | Quién debe documentos |
| [`modulos/catalogos.md`](./modulos/catalogos.md) | `/admin/catalogos`: puestos, categorías, áreas | Administrar catálogos |
| [`modulos/dashboard.md`](./modulos/dashboard.md) | `/`: tres indicadores | El panel general |
| [`modulos/shell.md`](./modulos/shell.md) | `app-shell`, sidebar de 3 modos, topbar | Navegación y layout |
| [`modulos/tema-y-estilos.md`](./modulos/tema-y-estilos.md) | Los 4 niveles de token, 3 temas, motion | Cualquier decisión visual |
| [`modulos/shared-ui.md`](./modulos/shared-ui.md) | Catálogo de las 15 primitivas | Antes de crear un componente |

## Documentos que no son de implementación

No describen el código: son autoridad de producto o contratos entre repositorios. La
documentación de módulos los referencia pero no los reemplaza.

| Documento | Qué es | Estado |
| --- | --- | --- |
| [`requerimiento-16-us-05-consultar-padron.md`](./requerimiento-16-us-05-consultar-padron.md) | Requerimiento de producto del padrón: actores, reglas de negocio, criterios de aceptación | Vigente. `validacion-busqueda.ts` es su espejo en código |
| [`nota-tecnica-entidad-nacimiento-curp.md`](./nota-tecnica-entidad-nacimiento-curp.md) | Diseño cross-repo para derivar la entidad de nacimiento desde la CURP | **Abierta.** `entidades-federativas.ts` sigue siendo un fallback temporal |
| [`matriz-permisos-expediente.md`](./matriz-permisos-expediente.md) | Permisos que el backend debe configurar para que padrón, semáforo y expediente coincidan | Vigente, dirigida al backend |

## Documentación en otros repositorios

Este frontend no está solo. Los contratos que consume viven en:

- **Backend** — `../recursos_humanos_backoffice_backend`. Ahí está el reporte completo de
  edición de empleado (US-08), que antes era un puntero de 32 líneas en este repo.
- **Lienzo de diseño** — `docs/design/` está en `.gitignore` y no se versiona. Si clonás
  el repositorio y la carpeta no existe, es lo esperado.

## Estructura de este directorio

```text
docs/
  README.md                        este índice
  arquitectura.md                  capas, routing, HTTP, entornos, build
  modulos/                         un documento por dominio
  requerimiento-16-*.md            autoridad de producto
  nota-tecnica-entidad-*.md        pendiente cross-repo
  matriz-permisos-expediente.md    contrato dirigido al backend
  historico/                       registro congelado; ver su README
```

## Cómo se mantiene

- Un cambio de contrato HTTP se refleja **en el mismo commit** que el código, en el
  documento de su módulo.
- Un endpoint nuevo no se documenta hasta que exista en el código. Nada de contratos
  futuros fuera de las notas técnicas, que son explícitamente propuestas.
- Agregar un módulo nuevo significa agregar su archivo y su fila en las dos tablas de
  arriba.
- `docs/historico/` no se edita nunca.

## Discrepancias conocidas en la documentación del repositorio

Detectadas al escribir estos documentos. Están listadas porque todavía no están
corregidas en sus archivos originales; mientras tanto, esta carpeta es la que manda.

| Archivo | Dice | El código hace |
| --- | --- | --- |
| `AGENTS.md` §1 | Tema por defecto `guinda` | `light` (`theme.service.ts:9`) |
| `AGENTS.md` §2, §6 | Logos en `src/assets/brand/` | `public/brand/logo-utn.svg`, `logo-edomex.svg` |
| `AGENTS.md` §3 | Tres niveles de token | Cuatro: falta `_paper.scss` |
| `AGENTS.md` §1 | Tipografías Sora y JetBrains Mono | Además Archivo Narrow y Courier Prime |
| `AGENTS.md` §6 | `app-brand-logos` con variantes `sm` y `lg` | Además `mark`, y el login pinta logos con `<img>` directo |
| `AGENTS.md` §9, §10 | Componentes `stepper`, `card`, `input` | No existen |
| `AGENTS.md` §11 | `stylelint-declaration-strict-value` activo | No se usa: plugin incompatible con Stylelint 18 |
| `AGENTS.md` §5 | `--logo-slot-height-sm: 46px`, `--logo-gap`, `--backdrop-cta-shimmer` | 56px, `--logo-gap-sm`/`-lg`, el shimmer no existe |
| `README.md` | Rutas `/empleados/alta` y `/empleados/:id/editar` | Son drawers; las rutas solo redirigen a `activos` |
| `README.md` | `/semaforo-documentos` pendiente de contrato | Implementado |
| `README.md` | — | Falta `/admin/catalogos` |
| `README.md` | — | No aclara que `.env` no afecta a `npm start` |
| `FRONTEND_GUIDELINES.md` §3 | `FaltantesDrawer` | No existe |
| `FRONTEND_GUIDELINES.md` §2 | Breakpoints de fuente única | `sidebar-state.service.ts` duplica los valores en `matchMedia` |
