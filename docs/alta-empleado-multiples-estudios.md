# Alta de empleado — múltiples registros de formación

El reporte compartido de diagnóstico, contrato, archivos, pruebas e integridad está en [alta-empleado-multiples-estudios.md](../../recursos_humanos_backoffice_backend/docs/alta-empleado-multiples-estudios.md).

Resultados: 132 pruebas backend y 843 aserciones en MariaDB aislada; 485 pruebas frontend con npm run verify aprobado. Alta real con dos grados comprobada en el entorno aislado de localhost:4201/8081; ficha y edición recuperan ambos. Sin registros ficticios en desarrollo ni migraciones nuevas.

La revisión visual móvil/tablet está pendiente: el navegador no aplicó los tamaños solicitados. No se declara la suite backend completa como ejecutada.

Evidencia del registro ficticio de pruebas: [ficha con ambos grados](evidence/alta-multiples-estudios/ficha-dos-grados.png), [edición en claro](evidence/alta-multiples-estudios/edicion-light.png).
