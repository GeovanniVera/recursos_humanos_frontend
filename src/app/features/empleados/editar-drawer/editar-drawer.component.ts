import { GradosAcademicos } from '../grados-academicos/grados-academicos.component';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, finalize, forkJoin, map, switchMap } from 'rxjs';
import { FormularioCatalogos } from '../../../core/empleados/alta.models';
import { AltaService } from '../../../core/empleados/alta.service';
import {
  JORNADA_MANDO_MEDIO,
  MANDO_MEDIO_SUPERIOR,
  PERSONAL_MANDO_MEDIO,
} from '../../../core/empleados/borrador-alta';
import {
  AdscripcionHistorialItem,
  CambiarAdscripcionRequest,
  CorregirNumEmpleadoRequest,
  EdicionEmpleadoRequest,
  EdicionError,
  EmpleoExternoRequest,
  GradoAcademicoRequest,
  RectificarIdentidadRequest,
} from '../../../core/empleados/editar.models';
import { EditarEmpleadoService } from '../../../core/empleados/editar.service';
import {
  FichaEmpleado,
  FichaEmpleadoResponse,
  FichaError,
} from '../../../core/empleados/ficha.models';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import {
  AltaExpediente,
  TabExpediente,
} from '../alta-drawer/alta-expediente/alta-expediente.component';

/**
 * Own copy of the panel. Every failure below is a different situation for the
 * user, so each one gets its own sentence. The `422` is the exception: its
 * per-field messages come from the backend, already in Spanish and specific, and
 * they are displayed verbatim.
 */
const MENSAJE_SESION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MENSAJE_PERMISO = 'No tienes permisos para editar empleados.';
const MENSAJE_NO_ENCONTRADO = 'No encontramos ese trabajador.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintenta en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión.';

/**
 * The record changed between the read and the save.
 *
 * The screen sent the `actualizado_en` it had on screen and the server answered
 * that the record moved: another administrator saved first. The only honest move
 * is reading the record again, so the sentence says so and the folder offers it.
 */
const MENSAJE_CONFLICTO =
  'El expediente cambió desde que lo abriste. Recarga la ficha y vuelve a intentar.';

/** What the folder says when it was opened without a worker. */
const MENSAJE_SIN_TRABAJADOR = 'Elige un trabajador para editar su ficha.';

/** Title of the folder while there is no record to name. */
const TITULO_PANEL = 'Editar empleado';

/** What an empty field of the record reads. */
const SIN_DATO = 'Sin registro';

/** How long the draft outlives the close, in milliseconds. */
const CIERRE_MS = 300;

/** Note limit of the acts that ask for a motive, as the contract states it. */
const MAX_NOTA = 1000;

/** The three sheets of the edit. */
type TabId = 'identificacion' | 'plaza' | 'formacion';

interface Tab extends TabExpediente {
  readonly id: TabId;
}

const TABS: readonly Tab[] = [
  { id: 'identificacion', etiqueta: 'Identificación' },
  { id: 'plaza', etiqueta: 'Plaza' },
  { id: 'formacion', etiqueta: 'Formación' },
];

/**
 * Field of the scalar edition that each sheet owns.
 *
 * The strip paints a badge per sheet; the server answers per field, so the two
 * vocabularies meet in this map instead of guessing from the name.
 */
const CAMPOS_POR_TAB: Readonly<Record<TabId, readonly string[]>> = {
  identificacion: ['estado_civil_id'],
  plaza: [],
  formacion: ['exp_publico_anios', 'exp_privado_anios', 'observaciones'],
};

/** Sheet of the second level the folder can open. */
export type VistaL2 =
  'identidad' | 'num-empleado' | 'historial-adscripciones' | 'cambio-adscripcion';

const TITULOS_L2: Readonly<Record<VistaL2, string>> = {
  identidad: 'Rectificación de identidad',
  'num-empleado': 'Corrección del número de empleado',
  'historial-adscripciones': 'Historial de adscripciones',
  'cambio-adscripcion': 'Cambio de adscripción',
};

/** What the failure block of the load offers the user. */
type AccionFallo = 'reintentar' | 'ninguna';

/** Failure of the load, already translated into copy and into an action. */
interface FalloEdicion {
  status: number;
  mensaje: string;
  detalle: string | null;
  accion: AccionFallo;
}

/** One read-only value of the sheet, with the state the grammar paints. */
interface ValorFicha {
  valor: string;
  vacio: boolean;
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Correction of one worker, as a folder over the desk of whatever page mounts it.
 *
 * The drawer reads the record once and keeps three things apart:
 *
 * - the **record**, which is the truth and is never edited in place;
 * - the **draft of the four scalars**, which is what the user types and what the
 *   dirty check compares against the record;
 * - the **folders**, which are not drafts at all: every grade or external job is
 *   saved on its own endpoint and the answer replaces the whole record.
 *
 * Which scalars are editable is not this screen's decision: it reads
 * `edicion.campos_editables`, the policy the server applies to the actor. A
 * control that is not in that list is not offered, and a field that did not
 * change never travels, so a role with a narrow matrix cannot be rejected for a
 * field it never touched.
 */
@Component({
  selector: 'app-editar-drawer',
  imports: [AltaExpediente, Drawer, FormsModule, GradosAcademicos],
  templateUrl: './editar-drawer.component.html',
  styleUrl: './editar-drawer.component.scss',
})
export class EditarDrawer {
  private readonly editarService = inject(EditarEmpleadoService);
  private readonly altaService = inject(AltaService);
  private readonly destroyRef = inject(DestroyRef);

  /** Internal key of the worker to edit. `null` means "nothing chosen yet". */
  readonly empleadoId = input<number | null>(null);

  /** Whether the folder is open. Two-way bound to the page that hosts it. */
  readonly open = model(false);

  /** The record as the server left it after a successful save. */
  readonly actualizado = output<FichaEmpleado>();

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  protected readonly tabs: readonly Tab[] = TABS;

  readonly tabActiva = signal<TabId>(TABS[0].id);

  readonly registroActual = signal<FichaEmpleado | null>(null);

  readonly catalogos = signal<FormularioCatalogos | null>(null);

  readonly cargando = signal(false);

  readonly fallo = signal<FalloEdicion | null>(null);

  readonly enviando = signal(false);

  readonly mensaje = signal<string | null>(null);

  readonly erroresServidor = signal<Record<string, string[]>>({});

  /** `true` when the last save was refused because the record moved. */
  readonly conflicto = signal(false);

  /** `true` right after a save landed; the sheet confirms it instead of closing. */
  readonly guardado = signal(false);

  /** Sheet of the second level that is open, or `null`. */
  readonly vistaL2 = signal<VistaL2 | null>(null);

  /** Lines standing in for the record while it loads. */
  protected readonly esqueletos = Array.from({ length: 8 }, (_, linea) => linea);

  /** Upper bound of the notes of the second level, for the live counter. */
  readonly maxNota = MAX_NOTA;

  // -------------------------------------------------------------------------
  // Draft of the four scalars
  // -------------------------------------------------------------------------

  readonly estadoCivilId = signal<number | null>(null);
  readonly expPublico = signal<number>(0);
  readonly expPrivado = signal<number>(0);
  readonly observaciones = signal('');

  // -------------------------------------------------------------------------
  // Folder forms
  // -------------------------------------------------------------------------

  readonly gradoAbierto = signal(false);
  readonly gradoEditandoId = signal<number | null>(null);
  readonly gradoNivel = signal<number | null>(null);
  readonly gradoTitulo = signal('');
  readonly gradoEscuela = signal('');
  readonly gradoGeneracion = signal('');
  readonly gradoCedula = signal('');
  readonly gradoMaximo = signal(false);
  readonly gradoErrores = signal<Record<string, string[]>>({});
  readonly guardandoGrado = signal(false);

  readonly empleoAbierto = signal(false);
  readonly empleoEditandoId = signal<number | null>(null);
  readonly empleoInstitucion = signal('');
  readonly empleoPuesto = signal('');
  readonly empleoHorario = signal('');
  readonly empleoObservaciones = signal('');
  readonly empleoVigente = signal(true);
  readonly empleoErrores = signal<Record<string, string[]>>({});
  readonly guardandoEmpleo = signal(false);

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  /** Fields the actor may write, as the server declared them. */
  private readonly camposEditables = computed<ReadonlySet<string>>(
    () => new Set(this.registroActual()?.edicion.campos_editables ?? []),
  );

  /** Whether the actor may write one field. */
  puedeEditar(campo: string): boolean {
    return this.camposEditables().has(campo);
  }

  /** The record's four scalars, which is what the draft is compared against. */
  private readonly original = computed(() => {
    const ficha = this.registroActual();

    return {
      estado_civil_id: ficha?.identificacion.estado_civil_id ?? null,
      exp_publico_anios: ficha?.experiencia.exp_publico_anios ?? 0,
      exp_privado_anios: ficha?.experiencia.exp_privado_anios ?? 0,
      observaciones: (ficha?.gestion_interna.observaciones ?? '').trim() || null,
    };
  });

  /**
   * Only the scalars that really changed.
   *
   * Sending the whole universe would overwrite a field another screen changed
   * and would be rejected for any field the actor's matrix does not include.
   */
  private readonly cambios = computed<EdicionEmpleadoRequest>(() => {
    const original = this.original();
    const cambios: EdicionEmpleadoRequest = {};

    if (original.estado_civil_id !== this.estadoCivilId()) {
      cambios.estado_civil_id = this.estadoCivilId();
    }
    if (original.exp_publico_anios !== this.expPublico()) {
      cambios.exp_publico_anios = this.expPublico();
    }
    if (original.exp_privado_anios !== this.expPrivado()) {
      cambios.exp_privado_anios = this.expPrivado();
    }

    const observaciones = this.observaciones().trim() || null;
    if (original.observaciones !== observaciones) {
      cambios.observaciones = observaciones;
    }

    return cambios;
  });

  /** `true` when there is something to send. */
  readonly hayCambios = computed(() => Object.keys(this.cambios()).length > 0);

  /** Whether the bar may send. */
  readonly puedeGuardar = computed(
    () =>
      this.registroActual() !== null &&
      this.fallo() === null &&
      !this.cargando() &&
      !this.enviando() &&
      this.hayCambios(),
  );

  /** Fields of the draft that the current actor cannot write. */
  readonly camposBloqueados = computed<readonly string[]>(() =>
    Object.keys(this.cambios()).filter((campo) => !this.puedeEditar(campo)),
  );

  /** Marital statuses, the choices of `estado_civil_id`. */
  readonly estadosCiviles = computed(() => this.catalogos()?.estados_civiles ?? []);

  /** Schooling levels, the choices of the grade form. */
  readonly niveles = computed(() => this.catalogos()?.niveles_estudios ?? []);

  readonly grados = computed(() => this.registroActual()?.grados_academicos ?? []);

  readonly gradosPresentacion = computed(() =>
    this.grados().map((g) => ({ ...g, clave: String(g.id) })),
  );

  readonly empleos = computed(() => this.registroActual()?.empleos_externos ?? []);

  /** Index of the sheet on screen, which is what the strip builds from. */
  readonly indiceActivo = computed(() => {
    const indice = TABS.findIndex((tab) => tab.id === this.tabActiva());
    return indice === -1 ? 0 : indice;
  });

  /** Name of the document, at the top of the desk. */
  readonly titulo = computed(() => {
    const nombre = (this.registroActual()?.identificacion.nombre ?? '').trim();
    return nombre === '' ? TITULO_PANEL : `Editar · ${nombre}`;
  });

  /** Folio of the record, printed as the foot of every annex. */
  readonly folio = computed(() => this.registroActual()?.identificacion.num_empleado ?? '—');

  /** Name of the open annex, or an empty string. */
  readonly tituloAnexo = computed(() => {
    const vista = this.vistaL2();
    return vista === null ? '' : TITULOS_L2[vista];
  });

  /** Invalid fields each sheet owns, by index of `TABS`. */
  readonly erroresPorTab = computed<readonly number[]>(() => {
    const servidor = this.erroresServidor();

    return TABS.map(
      (tab) => CAMPOS_POR_TAB[tab.id].filter((campo) => (servidor[campo] ?? []).length > 0).length,
    );
  });

  /** Messages of the last `422` that belong to no control of the scalar form. */
  readonly erroresSueltos = computed<readonly string[]>(() => {
    const conocidos = new Set(Object.values(CAMPOS_POR_TAB).flat());

    return Object.entries(this.erroresServidor())
      .filter(([campo]) => !conocidos.has(campo))
      .flatMap(([, mensajes]) => mensajes);
  });

  /** Every read-only value of the sheet, read from the record. */
  private readonly valores = computed<Readonly<Record<string, string>>>(() => {
    const ficha = this.registroActual();
    const identificacion = ficha?.identificacion;
    const plaza = ficha?.plaza;

    const crudo: Record<string, string | null> = {
      num_empleado: identificacion?.num_empleado ?? null,
      nombre: identificacion?.nombre ?? null,
      curp: identificacion?.curp ?? null,
      fecha_nacimiento: this.fecha(identificacion?.fecha_nacimiento ?? null),
      sexo: identificacion?.sexo ?? null,
      entidad_nacimiento: identificacion?.entidad_nacimiento ?? null,
      correo_institucional: ficha?.contacto.correo_institucional ?? null,
      area: plaza?.area ?? null,
      puesto: plaza?.puesto ?? null,
      categoria_cct: plaza?.categoria_cct_clave ?? null,
      tipo_personal: plaza?.tipo_personal ?? null,
      tipo_jornada: plaza?.tipo_jornada ?? null,
      fecha_inicio_puesto: this.fecha(plaza?.fecha_inicio_puesto ?? null),
      fecha_ingreso_gobierno: this.fecha(plaza?.fecha_ingreso_gobierno ?? null),
    };

    return Object.fromEntries(
      Object.entries(crudo).map(([campo, valor]) => [campo, (valor ?? '').trim()]),
    );
  });

  // -------------------------------------------------------------------------
  // Second level
  // -------------------------------------------------------------------------

  readonly entidades = computed(() => this.catalogos()?.entidades ?? []);

  readonly identidadNombre = signal('');
  readonly identidadCurp = signal('');
  readonly identidadFecha = signal('');
  readonly identidadSexo = signal('');
  readonly identidadEntidad = signal('');
  readonly identidadCorreo = signal('');
  readonly identidadMotivo = signal('');
  readonly identidadErrores = signal<Record<string, string[]>>({});
  readonly guardandoIdentidad = signal(false);

  readonly numNuevo = signal('');
  readonly numMotivo = signal('');
  readonly numConfirmado = signal(false);
  readonly numErrores = signal<Record<string, string[]>>({});
  readonly guardandoNum = signal(false);

  readonly adscArea = signal<number | null>(null);
  readonly adscPuesto = signal<number | null>(null);
  readonly adscTipoPersonal = signal('');
  readonly adscTipoJornada = signal('');
  readonly adscNota = signal('');
  readonly adscErrores = signal<Record<string, string[]>>({});
  readonly guardandoAdsc = signal(false);

  /**
   * Values the server fixes for a management post, exposed for the read-only
   * sentence of the annex. They come from `core/empleados/borrador-alta.ts`, so
   * the sheet and the rules cannot disagree on the literals.
   */
  protected readonly personalMandoMedio = PERSONAL_MANDO_MEDIO;
  protected readonly jornadaMandoMedio = JORNADA_MANDO_MEDIO;

  readonly historial = signal<readonly AdscripcionHistorialItem[]>([]);
  readonly cargandoHistorial = signal(false);
  readonly errorHistorial = signal<string | null>(null);

  /** Areas the assignment may use: active and able to hold staff. */
  readonly areasAsignables = computed(() =>
    (this.catalogos()?.areas ?? []).filter((area) => area.asignable),
  );

  /** Posts offered by the chosen area. */
  readonly puestosDelArea = computed(() => {
    const area = this.adscArea();
    if (area === null) {
      return [];
    }

    return (this.catalogos()?.puestos ?? []).filter((puesto) => puesto.area_ids.includes(area));
  });

  /**
   * CCT category derived from the chosen post.
   *
   * It is shown as a read value and never sent: the server derives it again, and
   * the contract rejects it when it arrives in the body.
   */
  readonly categoriaDelPuesto = computed(() => {
    const puesto = this.puestosDelArea().find((candidato) => candidato.id === this.adscPuesto());
    if (puesto === undefined) {
      return null;
    }

    return (
      (this.catalogos()?.categorias_cct ?? []).find(
        (categoria) => categoria.id === puesto.categoria_cct_id,
      ) ?? null
    );
  });

  readonly puedeGuardarIdentidad = computed(
    () => !this.guardandoIdentidad() && this.identidadMotivo().trim().length >= 10,
  );

  /** `true` when the chosen post belongs to a middle-management CCT category. */
  readonly adscEsMandoMedio = computed(
    () => this.categoriaDelPuesto()?.tipo === MANDO_MEDIO_SUPERIOR,
  );

  /**
   * Options of `tipo_personal`.
   *
   * The catalogue also carries `No Aplica`, which is never a choice: it is the
   * value the server fixes for a management post, and that control is hidden
   * there. Offering it to an administrative or teaching category would let the
   * operator send a pair the server rejects.
   */
  readonly tiposPersonalAdsc = computed(() =>
    (this.catalogos()?.tipos_personal ?? []).filter((tipo) => tipo !== PERSONAL_MANDO_MEDIO),
  );

  /** Shifts offered by the backend. */
  readonly tiposJornadaAdsc = computed(() => this.catalogos()?.tipos_jornada ?? []);

  readonly puedeGuardarNum = computed(
    () =>
      !this.guardandoNum() &&
      this.numConfirmado() &&
      this.numNuevo().trim().length > 0 &&
      this.numMotivo().trim().length >= 15,
  );

  readonly puedeGuardarAdsc = computed(
    () =>
      !this.guardandoAdsc() &&
      this.adscArea() !== null &&
      this.adscPuesto() !== null &&
      (this.adscEsMandoMedio() ||
        (this.adscTipoPersonal().trim() !== '' && this.adscTipoJornada().trim() !== '')),
  );

  private readonly peticiones = new Subject<number | null>();
  private cierreTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelarCierre());

    this.peticiones
      .pipe(
        switchMap((id) => {
          if (id === null) {
            this.cargando.set(false);
            return EMPTY;
          }

          this.cargando.set(true);
          this.fallo.set(null);

          return forkJoin({
            catalogos: this.altaService.cargarCatalogos(),
            ficha: this.editarService.consultar(id),
          }).pipe(
            map(({ catalogos, ficha }) => ({ catalogos, ficha: ficha.data })),
            catchError((error: unknown) => {
              this.fallo.set(this.describirFallo(error));
              return EMPTY;
            }),
            finalize(() => this.cargando.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ catalogos, ficha }) => {
        this.catalogos.set(catalogos);
        this.establecerRegistro(ficha, true);
      });

    effect(() => {
      const abierto = this.open();
      const id = this.empleadoId();

      untracked(() => {
        if (!abierto) {
          this.alCerrar();
          return;
        }
        this.cancelarCierre();
        this.alAbrir(id);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Reading the record
  // -------------------------------------------------------------------------

  /** Read-only value of the sheet, in the record drawer's grammar. */
  valorDe(campo: string): ValorFicha {
    const limpio = this.valores()[campo] ?? '';
    return limpio === '' ? { valor: SIN_DATO, vacio: true } : { valor: limpio, vacio: false };
  }

  reintentar(): void {
    this.conflicto.set(false);
    this.peticiones.next(this.empleadoId());
  }

  /**
   * Installs a record and, when asked, resets the scalar draft to it.
   *
   * A folder operation answers with the whole record but does not touch the four
   * scalars, so it must not wipe what the user is typing in them: that is why
   * `reiniciarBorrador` is false for those answers.
   */
  private establecerRegistro(ficha: FichaEmpleado, reiniciarBorrador: boolean): void {
    this.registroActual.set(ficha);

    if (!reiniciarBorrador) {
      return;
    }

    this.estadoCivilId.set(ficha.identificacion.estado_civil_id);
    this.expPublico.set(ficha.experiencia.exp_publico_anios ?? 0);
    this.expPrivado.set(ficha.experiencia.exp_privado_anios ?? 0);
    this.observaciones.set(ficha.gestion_interna.observaciones ?? '');
    this.erroresServidor.set({});
    this.mensaje.set(null);
    this.conflicto.set(false);
    this.guardado.set(false);
    this.vistaL2.set(null);
    this.cerrarFormularios();
  }

  // -------------------------------------------------------------------------
  // Tabs and the second level
  // -------------------------------------------------------------------------

  seleccionarIndice(indice: number): void {
    const tab = TABS[indice];
    if (tab !== undefined) {
      this.tabActiva.set(tab.id);
    }
  }

  abrirNivel2(vista: VistaL2): void {
    this.mensaje.set(null);
    this.guardado.set(false);
    this.vistaL2.set(vista);

    if (vista === 'identidad') {
      this.precargarIdentidad();
    } else if (vista === 'num-empleado') {
      this.precargarNumero();
    } else if (vista === 'cambio-adscripcion') {
      this.precargarAdscripcion();
    } else {
      this.cargarHistorial();
    }
  }

  cerrarNivel2(): void {
    this.vistaL2.set(null);
  }

  // -------------------------------------------------------------------------
  // Anexo · rectificación de identidad (E-10)
  // -------------------------------------------------------------------------

  private precargarIdentidad(): void {
    const ficha = this.registroActual();
    if (ficha === null) {
      return;
    }

    const identificacion = ficha.identificacion;
    const entidad = this.entidades().find(
      (candidata) => candidata.nombre === identificacion.entidad_nacimiento,
    );

    this.identidadNombre.set(identificacion.nombre ?? '');
    this.identidadCurp.set(identificacion.curp ?? '');
    this.identidadFecha.set(identificacion.fecha_nacimiento ?? '');
    this.identidadSexo.set(identificacion.sexo ?? '');
    this.identidadEntidad.set(entidad?.clave ?? '');
    this.identidadCorreo.set(ficha.contacto.correo_institucional ?? '');
    this.identidadMotivo.set('');
    this.identidadErrores.set({});
  }

  guardarIdentidad(): void {
    const id = this.empleadoId();
    if (id === null || !this.puedeGuardarIdentidad()) {
      return;
    }

    const datos: RectificarIdentidadRequest = {
      nombre: this.identidadNombre().trim(),
      curp: this.identidadCurp().trim() || null,
      fecha_nacimiento: this.identidadFecha().trim() || null,
      sexo: this.identidadSexo().trim() || null,
      entidad_nacimiento: this.identidadEntidad().trim() || null,
      correo_institucional: this.identidadCorreo().trim() || null,
      motivo_rectificacion: this.identidadMotivo().trim(),
    };

    this.actoAuditado(
      this.editarService.rectificarIdentidad(id, datos),
      this.guardandoIdentidad,
      this.identidadErrores,
      'identificacion',
    );
  }

  // -------------------------------------------------------------------------
  // Anexo · corrección del número de empleado (E-11)
  // -------------------------------------------------------------------------

  private precargarNumero(): void {
    this.numNuevo.set('');
    this.numMotivo.set('');
    this.numConfirmado.set(false);
    this.numErrores.set({});
  }

  guardarNumEmpleado(): void {
    const id = this.empleadoId();
    if (id === null || !this.puedeGuardarNum()) {
      return;
    }

    const datos: CorregirNumEmpleadoRequest = {
      num_empleado: this.numNuevo().trim(),
      motivo_correccion: this.numMotivo().trim(),
    };

    this.actoAuditado(
      this.editarService.corregirNumEmpleado(id, datos),
      this.guardandoNum,
      this.numErrores,
      'identificacion',
    );
  }

  // -------------------------------------------------------------------------
  // Anexo · cambio de adscripción
  // -------------------------------------------------------------------------

  private precargarAdscripcion(): void {
    const plaza = this.registroActual()?.plaza;

    this.adscArea.set(plaza?.area_id ?? null);
    this.adscPuesto.set(plaza?.puesto_id ?? null);
    this.adscNota.set('');
    this.adscErrores.set({});

    if (this.adscEsMandoMedio()) {
      // A management post fixes both values on the server. They come from the
      // constants instead of the stored row, so a legacy record that disagrees
      // cannot make the sheet claim a pair the server would reject.
      this.adscTipoPersonal.set(PERSONAL_MANDO_MEDIO);
      this.adscTipoJornada.set(JORNADA_MANDO_MEDIO);
    } else {
      this.adscTipoPersonal.set(plaza?.tipo_personal ?? '');
      this.adscTipoJornada.set(plaza?.tipo_jornada ?? '');
    }
  }

  /**
   * A different area offers a different set of posts.
   *
   * Keeping the chosen post would leave a pair the server rejects, so it is
   * dropped as soon as the area moves. The working condition belonged to that
   * post, so it goes with it.
   */
  elegirArea(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.adscArea.set(valor === '' ? null : Number(valor));
    this.adscPuesto.set(null);
    this.adscTipoPersonal.set('');
    this.adscTipoJornada.set('');
  }

  elegirPuesto(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.adscPuesto.set(valor === '' ? null : Number(valor));
    this.resolverCondicionLaboral();
  }

  /**
   * Working condition of the post just chosen.
   *
   * A management post fixes it, so the two values are written right away; any
   * other post resets them, because the operator declares the new condition
   * instead of silently keeping the one of the previous post.
   */
  private resolverCondicionLaboral(): void {
    if (this.adscEsMandoMedio()) {
      this.adscTipoPersonal.set(PERSONAL_MANDO_MEDIO);
      this.adscTipoJornada.set(JORNADA_MANDO_MEDIO);
      return;
    }

    this.adscTipoPersonal.set('');
    this.adscTipoJornada.set('');
  }

  guardarAdscripcion(): void {
    const id = this.empleadoId();
    const area = this.adscArea();
    const puesto = this.adscPuesto();

    if (id === null || area === null || puesto === null || !this.puedeGuardarAdsc()) {
      return;
    }

    const datos: CambiarAdscripcionRequest = {
      area_id: area,
      puesto_id: puesto,
      tipo_personal: this.adscEsMandoMedio()
        ? PERSONAL_MANDO_MEDIO
        : this.adscTipoPersonal().trim(),
      tipo_jornada: this.adscEsMandoMedio() ? JORNADA_MANDO_MEDIO : this.adscTipoJornada().trim(),
      nota: this.adscNota().trim() || null,
    };

    this.actoAuditado(
      this.editarService.cambiarAdscripcion(id, datos),
      this.guardandoAdsc,
      this.adscErrores,
      'plaza',
      // El historial que se había leído ya no describe la plaza abierta.
      () => this.historial.set([]),
    );
  }

  // -------------------------------------------------------------------------
  // Anexo · historial de adscripciones
  // -------------------------------------------------------------------------

  cargarHistorial(): void {
    const id = this.empleadoId();
    if (id === null) {
      return;
    }

    this.cargandoHistorial.set(true);
    this.errorHistorial.set(null);

    this.editarService
      .historialAdscripciones(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.cargandoHistorial.set(false)),
      )
      .subscribe({
        next: (respuesta) => this.historial.set(respuesta.data),
        error: () => this.errorHistorial.set(MENSAJE_SERVICIO),
      });
  }

  reintentarHistorial(): void {
    this.cargarHistorial();
  }

  // -------------------------------------------------------------------------
  // Shared audited-act plumbing
  // -------------------------------------------------------------------------

  /**
   * Runs an audited act of the second level.
   *
   * The answer is the whole record, so the folder is refreshed, the page is told
   * and the annex closes back to the sheet that owns the data it changed.
   */
  private actoAuditado(
    peticion: Observable<FichaEmpleadoResponse>,
    ocupado: WritableSignal<boolean>,
    errores: WritableSignal<Record<string, string[]>>,
    tab: TabId,
    extra?: () => void,
  ): void {
    ocupado.set(true);
    errores.set({});
    this.mensaje.set(null);
    this.guardado.set(false);

    peticion
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => ocupado.set(false)),
      )
      .subscribe({
        next: (respuesta) => {
          this.establecerRegistro(respuesta.data, true);
          this.actualizado.emit(respuesta.data);
          extra?.();
          this.tabActiva.set(tab);
          this.vistaL2.set(null);
          this.guardado.set(true);
        },
        error: (error: unknown) => this.manejarErrorActo(error, errores),
      });
  }

  private manejarErrorActo(
    error: unknown,
    errores: WritableSignal<Record<string, string[]>>,
  ): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as EdicionError | null) : null;
    const mensaje =
      typeof cuerpo?.mensaje === 'string'
        ? cuerpo.mensaje
        : typeof cuerpo?.message === 'string'
          ? cuerpo.message
          : null;

    if (status === 422) {
      errores.set(cuerpo?.errors ?? {});
      const primero = Object.values(cuerpo?.errors ?? {})[0]?.[0];
      this.mensaje.set(primero ?? mensaje ?? 'Revisa los datos del formulario.');
      return;
    }

    switch (status) {
      case 401:
        this.mensaje.set(MENSAJE_SESION);
        return;
      case 403:
        this.mensaje.set(mensaje ?? MENSAJE_PERMISO);
        return;
      case 409:
        this.mensaje.set(mensaje ?? MENSAJE_SERVICIO);
        return;
      case 503:
        this.mensaje.set(MENSAJE_SERVICIO);
        return;
      default:
        this.mensaje.set(MENSAJE_CONEXION);
    }
  }

  /** Message of one field of the identity sheet, or `null`. */
  errorIdentidad(campo: string): string | null {
    return this.mensajeDe(this.identidadErrores(), campo);
  }

  /** Message of one field of the number sheet, or `null`. */
  errorNumero(campo: string): string | null {
    return this.mensajeDe(this.numErrores(), campo);
  }

  /** Message of one field of the assignment sheet, or `null`. */
  errorAdscripcion(campo: string): string | null {
    return this.mensajeDe(this.adscErrores(), campo);
  }

  private mensajeDe(errores: Record<string, string[]>, campo: string): string | null {
    const mensajes = errores[campo];
    return mensajes !== undefined && mensajes.length > 0 ? mensajes.join(' ') : null;
  }

  /** Calendar day of a list, or the placeholder when absent. */
  fechaCorta(valor: string | null): string {
    const formateada = this.fecha(valor);
    return formateada === '' ? SIN_DATO : formateada;
  }

  cerrar(): void {
    this.open.set(false);
  }

  // -------------------------------------------------------------------------
  // Scalar save
  // -------------------------------------------------------------------------

  guardarCambios(): void {
    const id = this.empleadoId();
    if (id === null || !this.puedeGuardar()) {
      return;
    }

    const bloqueados = this.camposBloqueados();
    if (bloqueados.length > 0) {
      // No debería ocurrir: el control ni siquiera se ofrece. Si ocurre, es un
      // fallo de la pantalla y se dice, en vez de gastar un 422 del servidor.
      this.mensaje.set('Tu rol no puede modificar uno de los campos cambiados.');
      return;
    }

    this.enviando.set(true);
    this.mensaje.set(null);
    this.erroresServidor.set({});
    this.conflicto.set(false);
    this.guardado.set(false);

    this.editarService
      .actualizar(id, {
        ...this.cambios(),
        updated_at: this.registroActual()?.actualizado_en ?? null,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: (respuesta) => this.alGuardado(respuesta.data),
        error: (error: unknown) => this.manejarErrorGuardado(error),
      });
  }

  /**
   * A scalar save landed.
   *
   * The folder stays open: it has three sheets and two folders, and closing on
   * the first save would send the user back to the roster in the middle of the
   * work. The record is replaced, the draft restarts from it, and the page is
   * told so it can refresh the roster row.
   */
  private alGuardado(ficha: FichaEmpleado): void {
    this.establecerRegistro(ficha, true);
    this.actualizado.emit(ficha);
    this.guardado.set(true);
  }

  private manejarErrorGuardado(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as EdicionError | null) : null;
    const codigo = typeof cuerpo?.codigo === 'string' ? cuerpo.codigo : null;
    const mensajeBackend =
      typeof cuerpo?.mensaje === 'string'
        ? cuerpo.mensaje
        : typeof cuerpo?.message === 'string'
          ? cuerpo.message
          : null;

    if (status === 422) {
      this.erroresServidor.set(cuerpo?.errors ?? {});
      this.mensaje.set(mensajeBackend);
      return;
    }

    if (status === 409) {
      this.conflicto.set(codigo === 'conflicto_concurrencia');
      this.mensaje.set(
        codigo === 'conflicto_concurrencia'
          ? MENSAJE_CONFLICTO
          : (mensajeBackend ?? MENSAJE_SERVICIO),
      );
      return;
    }

    switch (status) {
      case 401:
        this.mensaje.set(MENSAJE_SESION);
        return;
      case 403:
        this.mensaje.set(mensajeBackend ?? MENSAJE_PERMISO);
        return;
      case 503:
        this.mensaje.set(MENSAJE_SERVICIO);
        return;
      default:
        this.mensaje.set(MENSAJE_CONEXION);
    }
  }

  // -------------------------------------------------------------------------
  // Academic folder
  // -------------------------------------------------------------------------

  nuevoGrado(): void {
    this.limpiarGrado();
    this.gradoAbierto.set(true);
  }

  editarGrado(grado: FichaEmpleado['grados_academicos'][number]): void {
    this.gradoEditandoId.set(grado.id);
    this.gradoNivel.set(grado.nivel_estudios_id);
    this.gradoTitulo.set(grado.titulo_o_carrera ?? '');
    this.gradoEscuela.set(grado.escuela_procedencia ?? '');
    this.gradoGeneracion.set(grado.generacion ?? '');
    this.gradoCedula.set(grado.cedula_profesional ?? '');
    this.gradoMaximo.set(grado.es_maximo);
    this.gradoErrores.set({});
    this.gradoAbierto.set(true);
  }

  cancelarGrado(): void {
    this.gradoAbierto.set(false);
    this.limpiarGrado();
  }

  guardarGrado(): void {
    const id = this.empleadoId();
    const nivel = this.gradoNivel();
    if (id === null || nivel === null || this.guardandoGrado()) {
      return;
    }

    const datos: GradoAcademicoRequest = {
      nivel_estudios_id: nivel,
      titulo_o_carrera: this.gradoTitulo().trim(),
      escuela_procedencia: this.gradoEscuela().trim(),
      generacion: this.gradoGeneracion().trim() || null,
      cedula_profesional: this.gradoCedula().trim() || null,
      es_maximo: this.gradoMaximo(),
    };

    const editando = this.gradoEditandoId();
    const peticion =
      editando === null
        ? this.editarService.agregarGrado(id, datos)
        : this.editarService.actualizarGrado(id, editando, datos);

    this.guardarCarpeta(peticion, this.guardandoGrado, this.gradoErrores, () =>
      this.cancelarGrado(),
    );
  }

  eliminarGrado(grado: FichaEmpleado['grados_academicos'][number]): void {
    const id = this.empleadoId();
    if (id === null || this.guardandoGrado()) {
      return;
    }

    this.guardarCarpeta(
      this.editarService.eliminarGrado(id, grado.id),
      this.guardandoGrado,
      this.gradoErrores,
      () => undefined,
    );
  }

  marcarGradoMaximo(grado: FichaEmpleado['grados_academicos'][number]): void {
    const id = this.empleadoId();
    if (id === null || grado.es_maximo || this.guardandoGrado()) {
      return;
    }

    this.guardarCarpeta(
      this.editarService.actualizarGrado(id, grado.id, { es_maximo: true }),
      this.guardandoGrado,
      this.gradoErrores,
      () => undefined,
    );
  }

  /** Message of one grade field, or `null`. */
  errorGrado(campo: string): string | null {
    const mensajes = this.gradoErrores()[campo];
    return mensajes !== undefined && mensajes.length > 0 ? mensajes.join(' ') : null;
  }

  private limpiarGrado(): void {
    this.gradoEditandoId.set(null);
    this.gradoNivel.set(null);
    this.gradoTitulo.set('');
    this.gradoEscuela.set('');
    this.gradoGeneracion.set('');
    this.gradoCedula.set('');
    this.gradoMaximo.set(false);
    this.gradoErrores.set({});
  }

  // -------------------------------------------------------------------------
  // External jobs folder
  // -------------------------------------------------------------------------

  nuevoEmpleo(): void {
    this.limpiarEmpleo();
    this.empleoAbierto.set(true);
  }

  editarEmpleo(empleo: FichaEmpleado['empleos_externos'][number]): void {
    this.empleoEditandoId.set(empleo.id);
    this.empleoInstitucion.set(empleo.institucion_o_empresa);
    this.empleoPuesto.set(empleo.puesto_o_actividad ?? '');
    this.empleoHorario.set(empleo.horario_o_jornada ?? '');
    this.empleoObservaciones.set(empleo.observaciones ?? '');
    this.empleoVigente.set(empleo.vigente);
    this.empleoErrores.set({});
    this.empleoAbierto.set(true);
  }

  cancelarEmpleo(): void {
    this.empleoAbierto.set(false);
    this.limpiarEmpleo();
  }

  guardarEmpleo(): void {
    const id = this.empleadoId();
    if (id === null || this.guardandoEmpleo()) {
      return;
    }

    const datos: EmpleoExternoRequest = {
      institucion_o_empresa: this.empleoInstitucion().trim(),
      puesto_o_actividad: this.empleoPuesto().trim(),
      horario_o_jornada: this.empleoHorario().trim(),
      vigente: this.empleoVigente(),
      observaciones: this.empleoObservaciones().trim() || null,
    };

    const editando = this.empleoEditandoId();
    const peticion =
      editando === null
        ? this.editarService.agregarEmpleoExterno(id, datos)
        : this.editarService.actualizarEmpleoExterno(id, editando, datos);

    this.guardarCarpeta(peticion, this.guardandoEmpleo, this.empleoErrores, () =>
      this.cancelarEmpleo(),
    );
  }

  eliminarEmpleo(empleo: FichaEmpleado['empleos_externos'][number]): void {
    const id = this.empleadoId();
    if (id === null || this.guardandoEmpleo()) {
      return;
    }

    this.guardarCarpeta(
      this.editarService.eliminarEmpleoExterno(id, empleo.id),
      this.guardandoEmpleo,
      this.empleoErrores,
      () => undefined,
    );
  }

  alternarVigencia(empleo: FichaEmpleado['empleos_externos'][number]): void {
    const id = this.empleadoId();
    if (id === null || this.guardandoEmpleo()) {
      return;
    }

    this.guardarCarpeta(
      this.editarService.actualizarEmpleoExterno(id, empleo.id, { vigente: !empleo.vigente }),
      this.guardandoEmpleo,
      this.empleoErrores,
      () => undefined,
    );
  }

  /** Message of one external-job field, or `null`. */
  errorEmpleo(campo: string): string | null {
    const mensajes = this.empleoErrores()[campo];
    return mensajes !== undefined && mensajes.length > 0 ? mensajes.join(' ') : null;
  }

  private limpiarEmpleo(): void {
    this.empleoEditandoId.set(null);
    this.empleoInstitucion.set('');
    this.empleoPuesto.set('');
    this.empleoHorario.set('');
    this.empleoObservaciones.set('');
    this.empleoVigente.set(true);
    this.empleoErrores.set({});
  }

  // -------------------------------------------------------------------------
  // Shared folder plumbing
  // -------------------------------------------------------------------------

  /**
   * Runs one folder operation.
   *
   * The answer is the whole record, so the folder list is replaced in place and
   * the scalar draft is left alone. A `422` lands on the form that asked; any
   * other failure gets the folder's general sentence.
   */
  private guardarCarpeta(
    peticion: Observable<{ data: FichaEmpleado }>,
    ocupado: WritableSignal<boolean>,
    errores: WritableSignal<Record<string, string[]>>,
    alTerminar: () => void,
  ): void {
    ocupado.set(true);
    errores.set({});
    this.mensaje.set(null);
    this.guardado.set(false);

    peticion
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => ocupado.set(false)),
      )
      .subscribe({
        next: (respuesta) => {
          this.establecerRegistro(respuesta.data, false);
          alTerminar();
        },
        error: (error: unknown) => {
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          const cuerpo =
            error instanceof HttpErrorResponse ? (error.error as EdicionError | null) : null;

          if (status === 422 && cuerpo?.errors !== undefined) {
            errores.set(cuerpo.errors);
            return;
          }

          const texto = cuerpo?.mensaje ?? cuerpo?.message ?? null;
          this.mensaje.set(texto ?? (status === 0 ? MENSAJE_CONEXION : MENSAJE_SERVICIO));
        },
      });
  }

  private cerrarFormularios(): void {
    this.gradoAbierto.set(false);
    this.limpiarGrado();
    this.empleoAbierto.set(false);
    this.limpiarEmpleo();
  }

  // -------------------------------------------------------------------------
  // Failures of the load
  // -------------------------------------------------------------------------

  private fecha(valor: string | null): string {
    const limpio = (valor ?? '').trim();
    if (limpio === '') {
      return '';
    }

    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio);
    if (partes === null) {
      return limpio;
    }

    const fecha = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
    return FORMATO_FECHA.format(fecha);
  }

  private describirFallo(error: unknown): FalloEdicion {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as FichaError | null) : null;
    const detalle = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

    switch (status) {
      case 401:
        return { status, mensaje: MENSAJE_SESION, detalle: null, accion: 'ninguna' };
      case 403:
        return { status, mensaje: MENSAJE_PERMISO, detalle, accion: 'ninguna' };
      case 404:
        return { status, mensaje: MENSAJE_NO_ENCONTRADO, detalle, accion: 'ninguna' };
      case 503:
        return { status, mensaje: MENSAJE_SERVICIO, detalle, accion: 'reintentar' };
      default:
        return {
          status,
          mensaje: status === 0 ? MENSAJE_CONEXION : MENSAJE_SERVICIO,
          detalle,
          accion: 'reintentar',
        };
    }
  }

  // -------------------------------------------------------------------------
  // Opening and closing
  // -------------------------------------------------------------------------

  private alAbrir(id: number | null): void {
    this.tabActiva.set(TABS[0].id);
    this.vistaL2.set(null);
    this.erroresServidor.set({});
    this.mensaje.set(null);
    this.conflicto.set(false);
    this.guardado.set(false);
    this.cargando.set(false);
    this.registroActual.set(null);
    this.catalogos.set(null);
    this.cerrarFormularios();

    if (id === null) {
      this.fallo.set({
        status: 0,
        mensaje: MENSAJE_SIN_TRABAJADOR,
        detalle: null,
        accion: 'ninguna',
      });
      return;
    }

    this.fallo.set(null);
    this.peticiones.next(id);
  }

  private alCerrar(): void {
    this.tabActiva.set(TABS[0].id);
    this.vistaL2.set(null);
    this.peticiones.next(null);

    if (this.cierreTimer !== null) {
      return;
    }

    this.cierreTimer = setTimeout(() => {
      this.cierreTimer = null;
      if (this.open()) {
        return;
      }
      this.registroActual.set(null);
      this.catalogos.set(null);
      this.fallo.set(null);
      this.erroresServidor.set({});
      this.mensaje.set(null);
      this.conflicto.set(false);
      this.guardado.set(false);
      this.cerrarFormularios();
    }, CIERRE_MS);
  }

  private cancelarCierre(): void {
    if (this.cierreTimer !== null) {
      clearTimeout(this.cierreTimer);
      this.cierreTimer = null;
    }
  }
}
