# Paginación en dos niveles (`PaginatedBuffer`)

Primitiva transversal, no una pantalla. Vive en `src/app/core/pagination/paginated-buffer.ts` y la consume `PadronBufferStore`. Este documento explica por qué existe, qué expone exactamente y cuándo vale la pena usarla.

## 1. Propósito

Una paginación simple pide una página por clic: cada «Siguiente» es una petición nueva. El contrato del padrón permite pedir hasta 100 registros por petición, así que la interfaz puede mantener **dos tamaños distintos a la vez**: uno pequeño para la persona (20 filas) y otro grande para la red (100 registros). Moverse dentro del bloque es un `slice` local; solo al cruzar el borde del bloque sale una petición.

## 2. El problema: página lógica vs bloque de red

| Concepto | Valor en el padrón | Constante |
| --- | ---: | --- |
| Filas que ve la persona | 20 | `PAGINA_LOGICA_PADRON` (`padron-buffer.store.ts:8`) |
| Registros por petición (bloque) | 100 | `BLOQUE_MAX_PADRON` (`padron-buffer.store.ts:11`) |
| Bloques en memoria | 3 | `BLOQUES_EN_CACHE_PADRON` (`padron-buffer.store.ts:14`) |
| Vigencia de un bloque | 5 min (`5 * 60 * 1000`) | `TTL_BLOQUE_PADRON` (`padron-buffer.store.ts:17`) |

Con esos números: un bloque de 100 cubre cinco páginas lógicas, la caché retiene como máximo 300 registros y una página deja de ser fresca a los cinco minutos. El bloque es siempre el mayor múltiplo del tamaño lógico que no supera el máximo:

```text
bloque = max(porPagina, floor(maxPorBloque / porPagina) * porPagina)   // paginated-buffer.ts:504-507
```

| Tamaño lógico | Bloque pedido | Páginas por bloque |
| ---: | ---: | ---: |
| 10 | 100 | 10 |
| 20 | 100 | 5 |
| 50 | 100 | 2 |
| 100 | 100 | 1 |

La página lógica se deriva del `total` del backend, nunca de `meta.total_paginas` (que cuenta bloques):

```text
totalPaginas = max(1, ceil(total / porPagina))   // paginated-buffer.ts:155-160
```

## 3. Superficie pública de `PaginatedBuffer<T>`

`PaginatedBuffer<T>` no conoce el padrón: recibe un cargador `(pagina, porPagina) => Observable<PaginaBuffer<T>>` y expone señales; la pantalla decide cómo se ve todo (`paginated-buffer.ts:83-100`, `30-31`).

### 3.1 Señales

| Grupo | Señales |
| --- | --- |
| Ventana | `pagina`, `porPagina`, `porBloque`, `paginasPorBloque`, `bloque`, `paginaBloque` |
| Datos | `filas`, `total`, `hayDatos` |
| Rango | `desde`, `hasta`, `offsetPagina`, `offsetBloque` |
| Navegación | `totalPaginas`, `hayAnterior`, `haySiguiente` |
| Carga | `cargandoInicial`, `cargandoBloque`, `cargando`, `error`, `paginaObjetivo` |
| Diagnóstico | `bloquesEnCache` |

Declaración completa: `paginated-buffer.ts:120-203`.

### 3.2 Métodos

| Método | Qué hace | Fuente |
| --- | --- | --- |
| `iniciar(pagina = 1)` | Adopta la página **de inmediato** (enlace profundo), limpia caché y error, pide el bloque | `256-266` |
| `irAPagina(destino)` | Dentro del bloque cacheado es solo escritura de señal; fuera, una petición que conserva las filas | `274-299` |
| `primera()` / `ultima()` | Atajos sobre `irAPagina` | `301-310` |
| `recargar()` | Refresca el bloque visible y **descarta** los demás | `321-329` |
| `reintentar()` | Repite `paginaObjetivo`, no la página que quedó en pantalla | `335-340` |
| `reiniciar()` | Descarta toda la caché y vuelve a la página 1 | `343-352` |
| `cambiarPorPagina(valor)` | Normaliza, descarta caché y vuelve a la página 1 | `355-367` |
| `destruir()` | Cancela la suscripción y completa el `Subject` | `370-377` |

Reglas de borde: `irAPagina` ignora enteros menores que 1 y destinos fuera de rango; `iniciar` normaliza cualquier cosa que no sea entero positivo a 1; `cambiarPorPagina` ignora un tamaño igual al actual (`274-285`, `513-515`, `355-360`).

## 4. Cancelación

| Mecanismo | Implementación |
| --- | --- |
| Una sola petición en vuelo | Todas las solicitudes pasan por un `Subject` + `switchMap`; una nueva desuscribe la anterior (`213-249`) |
| Aborto real del transporte | `HttpClient` cancela el XHR/fetch al desuscribirse (`94-98`) |
| Respuesta tardía descartada | Cada resultado lleva `id`; `recibir` ignora si no es el último (`403-406`) |
| Acierto de caché gana a una petición en vuelo | `cancelarPendiente` (`425-435`, llamado desde `287-295`) |
| Liberación al salir de la pantalla | `destruir()` desde `DestroyRef` en el store (`padron-buffer.store.ts:84-86`) |

Un `switchMap` con `EMPTY` para la solicitud de tipo `cancelar` es lo que permite cancelar sin lanzar otra carga (`216-218`).

## 5. Caché: LRU y TTL

| Aspecto | Implementación |
| --- | --- |
| Estructura | `Map<paginaDeBloque, Bloque<T>>` en una señal (`109`) |
| Orden LRU | El orden de inserción del `Map` es el orden de uso: guardar reinserta al final y elimina el más viejo al superar `maxBloques` (`448-465`) |
| Acierto | Reinserta el bloque para marcarlo como reciente (`474-494`) |
| Bloque vencido | **No se borra**: se devuelve `null` para que se pida de nuevo, pero las filas siguen en caché y en pantalla (`482-487`) |
| TTL desactivado | `ttlMs = 0` nunca expira (`482`, `207-209`) |
| Reloj inyectable | `opciones.ahora` permite probar el TTL sin esperas (`43-44`, `210`) |
| Clave del bloque | La página **solicitada**, no la servida; una página fuera de rango puede responder vacía sin romper el mapa (`226-235`) |

`recargar()` conserva únicamente el bloque visible porque el padrón cambió: un `total` cacheado antes de la mutación contradiría el total fresco y podría llevar a la pantalla a una página del conjunto viejo (`312-320`).

## 6. Filas obsoletas mientras se recarga

Cuando hay filas en pantalla, `solicitar` activa `cargandoBloque` y no `cargandoInicial` (`379-401`). Consecuencias:

- El esqueleto se reserva para el primer load; una vez que hay filas nunca se reemplazan por esqueletos.
- Un cambio de bloque o una recarga dejan visible la página actual mientras viaja la nueva.
- Si la petición falla, las filas anteriores quedan y el error se muestra encima.
- Un bloque vencido conserva sus filas hasta que llega el reemplazo (`482-487`).

## 7. `ajustarFueraDeRango`

Si una recarga encoge el conjunto y la página visible ya no existe, el buffer retrocede a la última válida y pide ese bloque en vez de mostrar una ventana vacía (`441-446`). Se invoca al recibir cualquier bloque con éxito (`422`).

## 8. `PadronBufferStore` como aplicación

| Añade | Dónde |
| --- | --- |
| Cableado con `PadronService` y traducción de `PadronResponse` a `PaginaBuffer` | `padron-buffer.store.ts:33-44` |
| Señal de búsqueda y `aplicarBusqueda` (recorta y no reinicia con el mismo término) | `31`, `101-109` |
| `iniciar` idempotente (la pantalla puede llamarlo sin duplicar la primera carga) | `82-95` |
| Destrucción en `DestroyRef` | `84-86` |
| Reexportación de las señales que la pantalla consume | `53-80` |

| Deliberadamente **no** añade | Dónde se resuelve |
| --- | --- |
| Sincronización con la URL | En la página (`empleados-page.component.ts:351-393`) |
| Debounce de la búsqueda | En la página, 300 ms (`empleados-page.component.ts:42-43`, `363-365`) |
| Cuenta regresiva de `429` y búsqueda diferida | En la página (`empleados-page.component.ts:748-774`) |
| Mensajes de error y acciones | En la página (`empleados-page.component.ts:656-727`) |
| Presentación de filas, densidad, pestañas | En la página y en `shared/ui` |

## 9. Cuándo usarlo y cuándo no

Costos reales:

| Costo | Detalle |
| --- | --- |
| Memoria | Hasta 3 × 100 = 300 registros por pantalla, más el mapa de bloques |
| Invalidación | Una mutación exige `recargar()` o `reiniciar()`; una caché vieja miente sobre totales y páginas |
| Complejidad | Dos conceptos de página, fórmula de bloque, LRU, TTL y cancelación que hay que entender para depurar |
| Contrato | Exige que el backend acepte un `por_pagina` mayor que la página visible y devuelva `total` |

Se justifica cuando: el listado es de solo lectura o casi, el backend pagina con `total`, el tamaño máximo de página es cómodo (≥ 3 páginas lógicas) y la navegación entre páginas es frecuente. No se justifica cuando: el conjunto cabe en una página, el backend no expone `total`, la pantalla pagina con `offset`/`limit` o cada fila se edita en el lugar y el listado se invalida en cada acción.

## 10. Pruebas

| Archivo | Pruebas (`it`) | Qué cubre |
| --- | ---: | --- |
| `src/app/core/pagination/paginated-buffer.spec.ts` | 13 | Bloque de 100 con páginas de 20, aciertos sin petición, cruce de borde conservando filas, última página parcial, enlace profundo, TTL sin borrar filas, LRU de 3, cancelación de bloque reemplazado, recarga con filas visibles, reintento del destino, cambio de tamaño, conjunto que encoge, destrucción |
| `src/app/core/padron/padron-buffer.store.spec.ts` | 7 | Bloque de 100 con páginas de 20, sin petición dentro del bloque, siguiente bloque al cruzar, búsqueda que invalida, tamaño de bloque al cambiar el lógico, recarga y reintento |
| `src/app/core/padron/validacion-busqueda.spec.ts` | 7 | RN-07: vacío, dígitos ≤ 20, dígitos > 20, mixto, acentos y puntuación, longitud 150, puntuación sin letras |
| `src/app/features/empleados/empleados-page.component.spec.ts` | 33 | Tabla, alta, pestañas, densidad, cinco páginas por bloque, última parcial, salto validado, esqueleto solo inicial, vacío, `400`, debounce, tamaño de página, URL y enlace profundo, `429` con búsqueda diferida, `503`, reintento del salto, `403`, `401`, red, apertura de ficha, baja y registro |

Los conteos son los `it(` presentes en cada archivo hoy.

## 11. Decisiones y compromisos

| Decisión | Motivo |
| --- | --- |
| Bloque de 100, no de 20 | Menos peticiones por sesión de lectura, a costa de hasta 300 registros en memoria |
| `recargar()` conserva solo el bloque visible | Evita que un total viejo contradiga al nuevo; volver a un bloque anterior tras actualizar cuesta una petición |
| TTL de 5 minutos | Equilibrio entre frescura y navegación; una mutación invalida de inmediato sin esperar al TTL |
| El bloque vencido no se borra | Evita el parpadeo cada cinco minutos y conserva la última respuesta si la recarga falla |
| La URL no lleva la búsqueda | Privacidad sobre comodidad de compartir un enlace filtrado |
| `destruir()` explícito | La caché y la suscripción mueren con la pantalla; no hay estado global que limpiar |

## Referencias

- `src/app/core/pagination/paginated-buffer.ts`
- `src/app/core/pagination/paginated-buffer.spec.ts`
- `src/app/core/padron/padron-buffer.store.ts`
- `src/app/core/padron/padron-buffer.store.spec.ts`
- `src/app/core/padron/padron.service.ts`
- `src/app/core/padron/padron.models.ts`
- `src/app/features/empleados/empleados-page.component.ts`
- `src/app/features/empleados/empleados-page.component.spec.ts`
- `docs/nota-tecnica-us-05-paginacion-buffer.md`
- `docs/requerimiento-16-us-05-consultar-padron.md`
