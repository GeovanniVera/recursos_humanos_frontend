# Módulo: Catálogos

## 1. Propósito

`/admin/catalogos` administra los datos que alimentan el alta y la ficha del trabajador: **puestos**,
**categorías del CCT** y **áreas** del organigrama. El módulo es **solo de asociación**: no crea,
renombra ni desactiva nada, porque el backend no expone esos verbos
(`catalogos.service.ts:26-29`). Lo que sí cambia es qué áreas pertenecen a un puesto y qué categoría
declara. La ruta lazy vive en `src/app/app.routes.ts:104-113`; el módulo son
`src/app/core/catalogos/` (servicio, contratos, árbol) y `src/app/features/admin/catalogos/`
(pantalla y banner de hallazgos).

## 2. Contratos de `CatalogosService`

| Método | Verbo y ruta | Request | Response en el cable | Lo que ve la pantalla |
| --- | --- | --- | --- | --- |
| `puestos()` | `GET /catalogos/puestos` | query `sin_area=1`, `sin_empleados=1`, `activo=1\|0` | `{ data: PuestoCatalogo[] }` | `PuestoCatalogo[]` |
| `editarPuesto()` | `PATCH /catalogos/puestos/{id}` | `{ categoria_cct_id }` | `{ data: PuestoCatalogo }` | `PuestoCatalogo` |
| `asignarArea()` | `POST /catalogos/puestos/asignar-area` | `{ puesto_ids[], area_id }` | `{ creados, puestos }` **raíz** | `AsignarAreaResponse` |
| `desasociarArea()` | `DELETE /catalogos/puestos/{p}/{a}` | sin cuerpo | `{ desasociado }` **raíz** | `DesasociarAreaResponse` |
| `categorias()` | `GET /catalogos/categorias` | — | `{ data: CategoriaCatalogo[] }` | `CategoriaCatalogo[]` |
| `areas()` | `GET /catalogos/areas` | — | `{ data: AreaCatalogo[] }` | `AreaCatalogo[]` |
| `diagnostico()` | `GET /catalogos/diagnostico` | — | `CatalogoDiagnostico` **raíz** | `CatalogoDiagnostico` |

Implementación en `catalogos.service.ts:50-119`; sobre tipado en `catalogos.models.ts:21-24`.

### La asimetría del sobre (`data`)

Cuatro métodos desenvuelven `{ data }` con `map((r) => r.data)`: `puestos`, `editarPuesto`,
`categorias`, `areas`. Tres devuelven el cuerpo tal cual, porque **está en la raíz**: `asignarArea`,
`desasociarArea` y `diagnostico`.

El servicio es el **único** punto donde se desenvuelve, para que ninguna pantalla conozca cómo anida
Laravel (`catalogos.service.ts:31-35`). Copiar el patrón equivocado entrega `undefined` justo donde la
pantalla espera un número: `creados`, `desasociado` o los cinco contadores. Los contratos lo fijan
uno por uno: `catalogos.models.ts:89-101`, `:103-111`, `:161-173`.

> El comentario de clase (`catalogos.service.ts:32-34`) dice que son **dos** rutas fuera del sobre y
> nombra solo `puestos/asignar-area` y `diagnostico`. Son **tres**: el `DELETE .../areas/{area}`
> también responde plano (`catalogos.service.spec.ts:182-196`).

## 3. Puestos

`PuestoCatalogo` (`catalogos.models.ts:49-55`): `id`, `nombre`, `activo`, `categoria`
(`PuestoCategoria | null`), `areas` (`PuestoArea[]`). `categoria: null` = no declara ninguna;
`areas: []` = sin asignar. `PuestoCategoria` (`:27-32`) trae `id`, `clave`, `tipo`, `descripcion`;
`PuestoArea` (`:35-38`) solo `id` y `nombre`. La fila **no** trae contadores de uso: por eso "sin
empleados" no se calcula en cliente (`catalogos.models.ts:9-14`).

### Filtros del servidor

`PuestosFiltros` (`:64-71`) se traduce en `paramsDePuestos()` (`catalogos.service.ts:128-142`):

| Filtro | Parámetro | Se envía cuando |
| --- | --- | --- |
| sin área | `sin_area=1` | el selector de área vale `sin-area` |
| sin empleados | `sin_empleados=1` | el chip de diagnóstico está activo |
| estado | `activo=1` \| `activo=0` | el selector vale `activos` / `inactivos` |

**`area_id` no existe en el contrato.** Una área concreta se filtra en el cliente sobre
`puesto.areas` (`catalogos-page.component.ts:298-303`); el spec fija que el parámetro nunca se
inventa (`catalogos.service.spec.ts:129-130`). Omitir un filtro es "sin estrechar", distinto de
enviar `activo=0`.

### Límite del `PATCH`

`EditarPuestoRequest` tiene **un solo campo**: `categoria_cct_id` (`catalogos.models.ts:73-81`);
cualquier otro es `prohibited` y responde `422`. Por eso la tabla no ofrece editar nombre ni estado.

## 4. Categorías

`CategoriaCatalogo` (`catalogos.models.ts:119-126`): `id`, `clave`, `tipo`, `descripcion`
(`string | null`), `activo`. La tabla es de **solo lectura**, con nota en la plantilla
(`catalogos-page.component.html:280-283`). Solo se ofrecen categorías activas para un puesto
(`catalogos-page.component.ts:272-275`); si un puesto declara una ya desactivada, se muestra como
opción marcada con `(inactiva)` en vez de imprimir otra (`catalogos-page.component.html:209-218`;
helper en `catalogos-page.component.ts:866-872`).

### La edición optimista (con reversa y toast)

Es la única escritura optimista y vive en la columna `Categoría` de la tabla de puestos, no en la
pestaña de categorías. Mecanismo real en `editarPuestoEnLinea()`
(`catalogos-page.component.ts:1044-1081`):

1. Se rechaza si la fila ya tiene una petición en vuelo (clave `puesto-{id}`, `:1051-1053`).
2. La fila se pinta **de inmediato** con el parche (`:1055`), que difiere del cuerpo enviado porque
   el servidor resuelve la categoría completa desde el id (`:1037-1043`); el `<select>` queda
   deshabilitado mientras `ocupado('puesto-{id}')` (`catalogos-page.component.html:195`).
3. Al responder `200`, la fila se reemplaza por la **del servidor** y se refresca el diagnóstico
   (`:1065-1068`).
4. Si falla, se escribe de vuelta el `puesto` original —no el parche— y se emite un toast
   `No se guardó el cambio.` con el mensaje traducido (`:1069-1079`). No se refresca nada.

La razón está en el código: un `<select>` que el usuario ya movió no se puede revertir si el modelo
no se mueve con él (`catalogos-page.component.ts:143-147`).

## 5. Áreas

`AreaCatalogo` (`catalogos.models.ts:136-146`): `id`, `padre_id` (`number | null`), `nombre`, `tipo_area?`,
`naturaleza?`, `orden?`, `asignable`, `activo`. El organigrama llega como **bosque plano**, nunca anidado, con varios orígenes.

### `flattenAreaTree()` — el recorrido

`src/app/core/catalogos/area-tree.ts:40-81`. Recibe cualquier forma `{ id, padre_id, nombre }`
(`:16-20`) y devuelve `{ area, depth }[]` (`:23-26`).

| Paso | Líneas | Qué hace |
| --- | --- | --- |
| 1–2 | `:43-47` | Lista vacía → `[]`; si no, índice `Map<id, area>` para saber si un padre existe. |
| 3 | `:49-55` | Agrupa por padre en `Map<number \| null, T[]>`. El padre se normaliza: si `padre_id !== null` **y** existe en el índice se usa; si no, la clave es `null`. |
| 4 | `:57-58` | Comparador `porNombre`: copia y ordena con `localeCompare(nombre, 'es')`. Ordenar es obligatorio porque el payload no es estable (`orden` empata en 0, `:6-8`). |
| 5 | `:63-74` | DFS desde `null` en `depth 0`; cada nodo visitado se registra en `visitadas` y se recursa con `depth + 1`. |
| 6 | `:76-78` | Lo no alcanzado se agrega al final, ordenado por nombre, **en `depth 0`**. |

Defensas: un **`padre_id` colgante** (`:51`) se trata como `null`, así el nodo es raíz y **conserva
a sus hijos**; **los ciclos** los corta `visitadas` (`:65-67`), y un ciclo A→B→A cae en el paso 6 con
sus nodos planos; **lo inalcanzable** se anexa en `depth 0` (`:76-78`), sin recursión, de modo que una
cadena huérfana se aplana y no se pierde ninguna fila.

Consumo: `areasPlanas` (`catalogos-page.component.ts:261`), opciones con sangría (`:264-270`) y filas
con `depth` (`:356-364`), dibujadas como escalones (`catalogos-page.component.html:319-333`).

## 6. Asignación y desasociación

**Asignar (masiva)** — `catalogos-page.component.ts:703-741`: la selección **cruza páginas**
(`:210-211`) y el modal exige un área (plantilla `:343-386`). El endpoint es **idempotente**:
reenviar pares existentes responde `creados: 0`, nunca `409` (`catalogos.models.ts:89-101`), y el
toast lo dice ("No se creó ninguna asociación…", `:1142-1150`). La respuesta trae `puestos` ya
actualizados: la tabla **reemplaza** esas filas en vez de pedir la lista (`:720-732, 1090-1098`) y
solo relee el diagnóstico (`:729-731`).

**Desasociar** — `DELETE /puestos/{puesto}/areas/{area}` por chip de área, sin confirmación porque es
reversible (`:772-779`). `desasociado: false` = el par no existía: no-op, la fila no se toca
(`:802-805`). Antes de parchear se relee la fila del snapshot, porque la lista pudo moverse mientras
la petición estaba en vuelo (`:806-812`). `409 puesto_con_empleados` → toast `No se quitó el área.`
(`:815-821`). En ambos casos se refresca el diagnóstico (`:731`, `:813`).

## 7. Diagnóstico

`CatalogoDiagnostico` (`catalogos.models.ts:167-173`): **cero es la buena noticia**, así que ningún
contador es opcional.

| Campo | Qué cuenta |
| --- | --- |
| `puestos_sin_area` | puestos con `areas: []` |
| `puestos_sin_empleados` | puestos que nadie ocupa |
| `categorias_sin_uso` | categorías sin puesto que las declare |
| `empleados_sin_area` | empleados en un puesto sin área |
| `puestos_con_clasificacion_contradicha` | `{ puesto, tipo_puesto, empleados_en_contra }[]` |

`DiagnosticoBanner` es presentacional: recibe el diagnóstico y emite qué revisar, sin pedir nada
(`diagnostico-banner.component.ts:7-30`). `sinHallazgos` exige los cuatro contadores en `0` **y** el
arreglo vacío (`:38-51`); entonces el banner pasa de `role="alert"` a `role="status"` y a verde
(`diagnostico-banner.component.html:2-22`). Cada `Revisar` lo decide la pantalla
(`catalogos-page.component.ts:558-575`): `sin-area`/`sin-empleados` ponen el filtro y consultan;
`contradiccion` estrecha en cliente; `categorias_sin_uso` abre la pestaña Categorías;
`empleados_sin_area` reutiliza el filtro de puestos sin área, donde se corrige la causa.

## 8. Paginación: es del cliente

**Esta pantalla pagina en el cliente, no contra el servidor.** `POR_PAGINA = 20`
(`catalogos-page.component.ts:62-63`) y el corte es un `slice` sobre la lista filtrada (`:320-323`).
Los tres endpoints de listado devuelven la lista **completa**: cada página y cada contador se
calculan localmente (`:124-133`), y los catálogos son pequeños, así que pedir ventanas al servidor no
aportaría nada. Consecuencias: `totalPaginas` (`:312-314`), `paginaActual` acotada cuando un filtro
encoge la lista (`:317`), rango `Mostrando 1–20 de N` (`:370-379`) y paginador `compact`
(`catalogos-page.component.html:261-268`). Los filtros que sí van al servidor (`sin_area`,
`sin_empleados`, `activo`) provocan un `GET` y reemplazan el snapshot (`:981-1003`).

## 9. Errores

Las cuatro lecturas iniciales son una unidad: si una falla se descarta el lote y se conserva el
snapshot anterior, para que el banner no cuente algo distinto de lo que muestran las tablas
(`catalogos-page.component.ts:476-500, 942-973`). Mapeo de errores en `:1190-1207`; render en
`catalogos-page.component.html:19-34`.

| Situación | Lo que ve el usuario | Acción |
| --- | --- | --- |
| `401` | Tu sesión venció. Vuelve a iniciar sesión. | Iniciar sesión (limpia sesión local) |
| `403` | No tienes permiso para administrar los catálogos. | ninguna; las pestañas se ocultan (`bloqueado`, `:436`) |
| `503` | El servicio no está disponible. Reintenta en unos segundos. | Reintentar |
| otro / red | No pudimos conectar con el servidor. Revisa tu conexión. | Reintentar |

### `409 puesto_con_empleados`

En escrituras, el **código del contrato manda sobre el status** (`:1215-1241`):

- `puesto_con_empleados` → `Ese puesto tiene empleados activos: no se puede cambiar de categoría ni
  quitarle un área.` (`:52-53, 1219-1221`), en toast; la fila no cambia.
- `409` sin código conocido → la frase del cuerpo, o `El servidor rechazó el cambio: el dato sigue en
  uso.` (`:1231-1235`). `422` → la frase del cuerpo, o `El servidor rechazó los datos enviados.`
  (`:1236-1238`).

## Referencias

- `src/app/app.routes.ts`
- `src/app/core/catalogos/`: `catalogos.models.ts`, `catalogos.service.ts` (+ `.spec.ts`), `area-tree.ts`
- `src/app/features/admin/catalogos/`: `catalogos-page.component.ts` y `.html`, más
  `diagnostico-banner/diagnostico-banner.component.ts` y `.html`
- `src/app/layout/sidebar/sidebar.component.html`
