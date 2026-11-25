# Alta de empleado — empleos externos

El diagnóstico, contrato, inventario y resultados están en el [reporte técnico compartido](../../recursos_humanos_backoffice_backend/docs/alta-empleado-empleos-externos.md).

Alta y edición conservan sus archivos separados. Solo alta incorpora empleos pendientes. Formación múltiple y edición permanecen sin cambios.

Resultados: 140 pruebas backend con 948 aserciones en MariaDB aislada; npm run verify aprobado con 491 pruebas frontend en 48 archivos. Integración real con dos empleos y dos estudios verificada en localhost:4202/8082, sin datos ficticios en desarrollo. Revisión visual móvil/tablet pendiente por limitación del viewport.

Evidencias ficticias de la base aislada:

- [Alta con dos empleos en light](evidence/alta-empleos-externos/alta-light.jpg)
- [Editor de alta en guinda](evidence/alta-empleos-externos/alta-guinda.jpg)
- [Validación en dark](evidence/alta-empleos-externos/alta-dark-validacion.jpg)
- [Recuperación en edición sin modificarla](evidence/alta-empleos-externos/edicion-recuperada.jpg)
