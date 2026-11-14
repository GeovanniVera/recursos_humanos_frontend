# Nota técnica — entidad de nacimiento derivada de la CURP

## 1. Contexto

El alta de empleados captura hoy un **municipio** mediante un selector de 141 opciones
agrupadas por entidad. Ese dato no se puede verificar contra ningún documento oficial: la
persona lo elige de una lista y el expediente queda con un valor que nadie puede auditar.

La CURP sí lo contiene. Los caracteres 12 y 13 (índices 11 y 12, base 0) codifican la entidad
federativa de nacimiento según el catálogo de RENAPO. Derivar el dato desde ahí elimina una
decisión manual y ata el expediente a un documento verificable.

Este documento fija el **contrato entre el frontend y el backend**. El repositorio
`recursos_humanos_frontend` solo puede implementar la parte de interfaz: no contiene base de
datos, migraciones ni API. Todo lo marcado como *pendiente de backend* debe implementarse en
el repositorio del servicio (Laravel, `http://localhost:8080/api`).

## 2. Alcance

| Parte | Dónde vive | Estado |
|---|---|---|
| Catálogo de entidades, columna, migración de datos, borrado de municipios | Repositorio backend | Pendiente de backend |
| Endpoint de catálogo, DTO y validación de negocio | Repositorio backend | Pendiente de backend |
| Campo de solo lectura, autocompletado reactivo desde la CURP | `recursos_humanos_frontend` | Implementado |

## 3. Catálogo de entidades federativas

32 entidades más `NE` para nacimiento en el extranjero. La clave es de dos caracteres y es la
llave primaria; el nombre es el texto que se muestra.

| Clave | Nombre | Clave | Nombre |
|---|---|---|---|
| `AS` | Aguascalientes | `NT` | Nayarit |
| `BC` | Baja California | `NL` | Nuevo León |
| `BS` | Baja California Sur | `OC` | Oaxaca |
| `CC` | Campeche | `PL` | Puebla |
| `CL` | Coahuila | `QT` | Querétaro |
| `CM` | Colima | `QR` | Quintana Roo |
| `CS` | Chiapas | `SP` | San Luis Potosí |
| `CH` | Chihuahua | `SL` | Sinaloa |
| `DF` | Ciudad de México | `SR` | Sonora |
| `DG` | Durango | `TC` | Tabasco |
| `GT` | Guanajuato | `TS` | Tamaulipas |
| `GR` | Guerrero | `TL` | Tlaxcala |
| `HG` | Hidalgo | `VZ` | Veracruz |
| `JC` | Jalisco | `YN` | Yucatán |
| `MC` | Estado de México | `ZS` | Zacatecas |
| `MN` | Michoacán | `NE` | Nacido en el extranjero |
| `MS` | Morelos | | |

`DF` es la clave histórica de la Ciudad de México y sigue siendo la que emite RENAPO en la
CURP. No se sustituye por otra: la CURP de una persona nacida en la capital trae `DF` aunque
el nombre del catálogo diga «Ciudad de México».

## 4. Esquema y migración

### 4.1 Catálogo

```sql
CREATE TABLE cat_entidades_federativas (
  clave  CHAR(2)      NOT NULL,
  nombre VARCHAR(60)  NOT NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Se siembra con las 33 filas de la sección 3. El catálogo es de solo lectura: no lo edita
ninguna pantalla de administración.

### 4.2 Columna en empleados

Se agrega **nullable** primero. La restricción de nulidad solo se aplica después de migrar
los datos, porque una tabla con registros existentes no admite una columna `NOT NULL` sin
valor por defecto.

```sql
ALTER TABLE empleados
  ADD COLUMN entidad_nacimiento CHAR(2) NULL AFTER curp;
```

Índice recomendado, si el padrón se filtra por entidad:

```sql
CREATE INDEX empleados_entidad_nacimiento_index ON empleados (entidad_nacimiento);
```

### 4.3 Migración de los datos existentes

Los caracteres 12 y 13 de la CURP son `SUBSTRING(curp, 12, 2)` en SQL, que es 1-based.

```sql
UPDATE empleados
SET entidad_nacimiento = UPPER(SUBSTRING(curp, 12, 2))
WHERE curp IS NOT NULL
  AND CHAR_LENGTH(curp) = 18
  AND UPPER(SUBSTRING(curp, 12, 2)) IN (SELECT clave FROM cat_entidades_federativas);
```

**El filtro del catálogo no es opcional.** Si el `UPDATE` escribe cualquier par de caracteres,
la llave foránea del paso 4.4 va a rechazar filas y la migración se detiene a mitad de camino.

Antes de aplicar la llave foránea hay que confirmar que no quedaron claves huérfanas:

```sql
SELECT COUNT(*) AS huerfanas
FROM empleados e
LEFT JOIN cat_entidades_federativas c ON c.clave = e.entidad_nacimiento
WHERE e.entidad_nacimiento IS NOT NULL
  AND c.clave IS NULL;
```

El resultado tiene que ser `0`. Si no lo es, hay CURP mal capturadas en producción y hay que
decidir caso por caso: corregir la CURP o dejar la entidad en `NULL`.

### 4.4 Llave foránea y depuración

```sql
ALTER TABLE empleados
  ADD CONSTRAINT empleados_entidad_nacimiento_foreign
  FOREIGN KEY (entidad_nacimiento) REFERENCES cat_entidades_federativas (clave)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE empleados DROP FOREIGN KEY empleados_municipio_id_foreign;
ALTER TABLE empleados DROP COLUMN municipio_id;

DROP TABLE catalogo_municipios;
```

Los nombres exactos de la llave y de la columna de municipio deben confirmarse contra el
esquema real antes de ejecutar: este documento no puede leerlo.

## 5. Contrato de API

### 5.1 Catálogo

`GET /api/empleados/formulario` — la clave `municipios` se sustituye por `entidades`:

```json
{
  "entidades": [
    { "clave": "DF", "nombre": "Ciudad de México" },
    { "clave": "MC", "nombre": "Estado de México" },
    { "clave": "NE", "nombre": "Nacido en el extranjero" }
  ]
}
```

El frontend consume el catálogo dentro de este payload, no por un endpoint separado: es como
ya viajan `areas`, `puestos`, `estados_civiles` y el resto. Si el servicio prefiere exponer
`GET /api/entidades-federativas` aparte, es una decisión de backend válida, pero obliga a una
segunda petición en el arranque del formulario.

**Estado actual.** `entidades` es **opcional**: hoy el servicio todavía no lo devuelve y sigue
mandando `municipios`. Mientras no lo haga, el frontend resuelve el nombre con su propia tabla
RENAPO en `src/app/core/empleados/entidades-federativas.ts`, combinada con lo que llegue del
payload: la tabla local es la base y la entrada del servidor de la misma `clave` la reemplaza.
Esa tabla es un respaldo de presentación, no una fuente de verdad: **hay que borrarla en cuanto
el endpoint devuelva el catálogo completo**; si se queda, quedan dos copias del mismo estándar y
la que se olvide de actualizar será la del bundle.

### 5.2 Alta

`POST /api/empleados` — el campo `municipio` (nombre del municipio) se sustituye por:

```json
{ "curp": "MCCR850312HDFRRN04", "entidad_nacimiento": "DF" }
```

`entidad_nacimiento` viaja como la **clave de dos caracteres**, no como el nombre. Enviar el
nombre es un error de contrato y debe rechazarse.

### 5.3 Ficha

`GET /api/empleados/{id}` — dentro de `identificacion`, `municipio` se sustituye por:

```json
{ "identificacion": { "curp": "MCCR850312HDFRRN04", "entidad_nacimiento": "Ciudad de México" } }
```

En la **respuesta** el campo lleva el nombre legible, que es lo que la ficha muestra y lo que
antes hacía `municipio`. La asimetría es deliberada: se escribe una clave para garantizar
integridad referencial y se lee un nombre para no obligar a la interfaz a resolverlo.

La clave `entidad_nacimiento` debe aparecer además en `campos_faltantes` cuando esté vacía,
porque el frontend la mapea con `ETIQUETAS_CAMPO_EXPEDIENTE`.

## 6. Regla de validación de negocio

El servicio de alta y actualización rechaza la petición cuando:

1. La clave recibida no existe en `cat_entidades_federativas` — incluida `NE`, que **sí** es
   válida.
2. La clave no coincide con los caracteres 12 y 13 de la CURP enviada.
3. Se recibe `entidad_nacimiento` sin `curp`, o con una CURP de longitud distinta de 18.

La respuesta es un `422` con el envelope habitual del servicio. La comparación se hace sobre
la CURP normalizada (sin espacios, en mayúsculas), igual que el resto de las reglas.

La validación es **server-side y no negociable**: la comprobación del frontend existe para
avisar temprano, no para autorizar. Un cliente puede enviar cualquier cosa.

## 7. Comportamiento del frontend

Implementado en el drawer de edición
(`src/app/features/empleados/editar-drawer/editar-drawer.component`) y en el de alta
(`src/app/features/empleados/alta-drawer/alta-drawer.component`):

- El campo se muestra como `<input readonly>`, nunca editable. Se usa `readonly` y no
  `disabled` porque un control deshabilitado queda fuera del recorrido de teclado y no lo
  anuncian los lectores de pantalla, y este campo existe justamente para informar.
- Al capturar el carácter 13 de la CURP se extraen los caracteres 12 y 13, se busca la clave
  en el catálogo y se muestra el nombre.
- Si la CURP se borra, tiene menos de 13 caracteres o la clave no está en el catálogo, el
  campo se limpia solo y no viaja en la petición.
- La extracción vive en `curpClaveEntidad()` (`src/app/core/empleados/validacion.ts`), función
  pura sin dependencia de Angular ni del catálogo: solo conoce la forma de la CURP.

## 8. Orden de despliegue y riesgo

La migración borra una columna y una tabla. Es destructiva e irreversible sin respaldo.

1. Desplegar el catálogo y la columna nullable con el backfill. Nada se rompe todavía: el
   frontend anterior sigue funcionando contra `municipio`.
2. Verificar el conteo de huérfanas de la sección 4.3. Debe ser `0`.
3. Desplegar el backend nuevo (endpoint, DTO y validación) y el frontend nuevo.
4. Recién entonces ejecutar el borrado de la llave foránea, la columna y la tabla.

Invertir los pasos 3 y 4 deja al frontend anterior pidiendo `municipios` a un catálogo que ya
no existe, y el formulario se queda sin opciones sin decir por qué.

Antes del paso 4 hay que confirmar que ningún otro consumidor lee `catalogo_municipios`: un
reporte, una vista de base de datos o un proceso nocturno no aparecen en el `grep` del
repositorio.

## 9. Lista de verificación

- [ ] `cat_entidades_federativas` existe con 33 filas y `clave` como llave primaria.
- [ ] `empleados.entidad_nacimiento` existe y está poblada para toda CURP válida.
- [ ] El conteo de claves huérfanas es `0` antes de crear la llave foránea.
- [ ] El alta rechaza con `422` una entidad que no coincide con la CURP.
- [ ] El alta rechaza con `422` una entidad fuera del catálogo.
- [ ] El alta acepta `NE` cuando la CURP lo trae.
- [ ] `GET /empleados/formulario` devuelve `entidades` y ya no devuelve `municipios`.
- [ ] `GET /empleados/{id}` devuelve el nombre legible en `identificacion.entidad_nacimiento`.
- [ ] No queda ninguna referencia a municipios en la base de datos ni en el backend.
- [ ] El frontend no contiene la cadena `municipio` en `src/`. En esta nota aparece
      únicamente para describir el esquema que se retira.
