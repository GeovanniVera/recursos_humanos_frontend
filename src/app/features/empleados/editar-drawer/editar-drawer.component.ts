import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
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
import { EMPTY, Subject, catchError, finalize, forkJoin, map, switchMap } from 'rxjs';
import {
  EntidadCatalogo,
  ErrorValidacion,
  FormularioCatalogos,
} from '../../../core/empleados/alta.models';
import { AltaService } from '../../../core/empleados/alta.service';
import {
  BORRADOR_ALTA,
  BorradorAlta,
  CampoSelectNumero,
  CampoSelectTexto,
  ContextoBorrador,
  OTRO_LUGAR_NO,
  SECCION_DE_CAMPO,
  claveDeEntidad,
  evaluarBorrador,
} from '../../../core/empleados/borrador-alta';
import {
  CAMPOS_EDITABLES,
  EdicionEmpleado,
  EditarEmpleadoService,
} from '../../../core/empleados/editar.service';
import { ENTIDADES_FEDERATIVAS } from '../../../core/empleados/entidades-federativas';
import { FichaEmpleado, FichaError } from '../../../core/empleados/ficha.models';
import { curpClaveEntidad } from '../../../core/empleados/validacion';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { HistorialCampo } from './historial-campo/historial-campo.component';
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
 * What the folder says when it was opened without a worker.
 *
 * The drawer is mounted once, next to the roster, and gains its id with the row
 * it is asked to open: opening it with nothing selected is a mistake of the
 * caller, not a state of the record, and it is said instead of showing an empty
 * form that would then save over nobody.
 */
const MENSAJE_SIN_TRABAJADOR = 'Elige un trabajador para editar su ficha.';

/** Title of the folder while there is no record to name. */
const TITULO_PANEL = 'Editar empleado';

/**
 * What an empty field of the record reads.
 *
 * The record drawer's read-only grammar, not the alta's placeholder: this sheet
 * prints values of a document that already exists, and a field the record does
 * not carry has to say so.
 */
const SIN_DATO = 'Sin registro';

/**
 * How long the draft outlives the close, in milliseconds.
 *
 * The drawer takes `--motion-fast` to slide out, so clearing the fields at once
 * would empty the sheet while it is still on screen. Same bookkeeping as the
 * alta folder, and the timer is cancelled if the drawer is reopened.
 */
const CIERRE_MS = 300;

/** The allowlist as a set: it is asked once per keystroke of every control. */
const EDITABLES: ReadonlySet<string> = new Set(CAMPOS_EDITABLES);

/**
 * The three sheets of the edit. The index of each one is the section
 * `SECCION_DE_CAMPO` names, so a field and its tab cannot disagree.
 */
type TabId = 'identificacion' | 'plaza' | 'formacion';

interface Tab extends TabExpediente {
  readonly id: TabId;
}

const TABS: readonly Tab[] = [
  { id: 'identificacion', etiqueta: 'Identificación' },
  { id: 'plaza', etiqueta: 'Plaza' },
  { id: 'formacion', etiqueta: 'Formación' },
];

/** What the failure block of the load offers the user. */
type AccionFallo = 'reintentar' | 'ninguna';

/** Failure of the load, already translated into copy and into an action. */
interface FalloEdicion {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Sentence the user reads. */
  mensaje: string;
  /** Body sentence of the backend (`Trabajador no encontrado.`), shown muted. */
  detalle: string | null;
  accion: AccionFallo;
}

/** One read-only value of the sheet, with the state the grammar paints. */
interface ValorFicha {
  /** What the sheet prints: the value, or the placeholder. */
  valor: string;
  /** `true` when the record carries nothing: the value prints soft. */
  vacio: boolean;
}

/**
 * Date formatter of the sheet.
 *
 * `timeZone: 'UTC'` is not decoration: the API speaks calendar days
 * (`YYYY-MM-DD`), which are parsed as UTC midnight, and formatting them in a
 * local zone west of UTC would print the previous day.
 */
const FORMATO_FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Edition of one worker, as a folder over the desk of whatever page mounts it.
 *
 * The third drawer of the roster, next to the record and the alta, and the only
 * one of the three that is a form: the record reads, the alta writes a new file,
 * this one rewrites nine fields of an existing one. It takes an id and emits —
 * it never navigates, never toasts and never assumes which screen hosts it, so a
 * second page can mount the same folder without a second copy of these rules.
 *
 * The allowlist is the whole contract: `CAMPOS_EDITABLES` decides which controls
 * exist and which values only inform. Everything outside it is protected — the
 * draft still carries those values, because the request and the evaluator read
 * the whole record, but no control offers them and `evaluarBorrador` is asked to
 * stay quiet about them: a legacy value that fails a current rule cannot be
 * fixed here, so scolding the user for it would name a control that does not
 * exist and would block a save that has nothing to do with it.
 */
@Component({
  selector: 'app-editar-drawer',
  imports: [AltaExpediente, Drawer, FormsModule, HistorialCampo],
  templateUrl: './editar-drawer.component.html',
  styleUrl: './editar-drawer.component.scss',
})
export class EditarDrawer {
  private readonly editarService = inject(EditarEmpleadoService);
  private readonly altaService = inject(AltaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);

  /** Internal key of the worker to edit. `null` means "nothing chosen yet". */
  readonly empleadoId = input<number | null>(null);

  /** Whether the folder is open. Two-way bound to the page that hosts it. */
  readonly open = model(false);

  /**
   * The record as the server left it after a successful save.
   *
   * The folder does not refresh a roster and does not toast: it says the act
   * happened, and the page decides what to ask again and what to announce.
   */
  readonly actualizado = output<FichaEmpleado>();

  /** The three sheets, in the order the folder presents them. */
  protected readonly tabs: readonly Tab[] = TABS;

  /** Sheet on screen. Back to the first one when the folder closes. */
  readonly tabActiva = signal<TabId>(TABS[0].id);

  /** Record the sheet is printing, or `null` until the first answer. */
  readonly registroActual = signal<FichaEmpleado | null>(null);

  /** Draft of the request, as typed. Nothing here is trimmed until it is sent. */
  readonly modelo = signal<BorradorAlta>({ ...BORRADOR_ALTA });

  /** Last catalog answer, or `null`. */
  readonly catalogos = signal<FormularioCatalogos | null>(null);

  /** `true` while the record and the catalogues are in flight. */
  readonly cargando = signal(false);

  /** Last failure of the load, or `null`. */
  readonly fallo = signal<FalloEdicion | null>(null);

  /** `true` while the save is in flight. */
  readonly enviando = signal(false);

  /** General sentence of the last save failure, or `null`. */
  readonly mensaje = signal<string | null>(null);

  /**
   * Local messages of the fields the user has already seen, keyed by field.
   *
   * Rebuilt from the draft on every edit: a cross-field rule (the "where else"
   * detail against the answer that prohibits it) has no single owner, so one
   * pass over the whole draft is the only way to keep every sentence true at the
   * same time.
   */
  readonly errores = signal<Record<string, string>>({});

  /**
   * Controls the user has already visited, or that a jump has revealed.
   *
   * A field the user never touched is not scolded: its message is computed but
   * kept out of `errores` until the control loses focus. From then on the
   * message follows every keystroke, so fixing the value clears it at once.
   */
  readonly tocado = signal<Record<string, boolean>>({});

  /** Per-field messages of the last `422`, keyed by the name the backend uses. */
  readonly erroresServidor = signal<Record<string, string[]>>({});

  /**
   * Counter bumped after a successful save.
   *
   * The history panel only reloads on change, so it reads the value it did not
   * cause: without the bump, an open panel would keep showing the levels of the
   * record as it was before the user edited it. Same signal the edit page uses.
   */
  readonly historialRevision = signal(0);

  /** Lines standing in for the record while it loads. */
  protected readonly esqueletos = Array.from({ length: 8 }, (_, linea) => linea);

  /**
   * The catalogue slices the draft rules read.
   *
   * Built from the whole payload, not from the computeds the template binds: the
   * rules resolve `puesto_id` against every post of the catalogue, because a post
   * the current area does not offer still has — or lacks — a category. The values
   * are protected here, but the evaluator reads them to decide that a post with
   * no category is not this screen's problem either way.
   */
  private readonly contexto = computed<ContextoBorrador>(() => ({
    puestos: this.catalogos()?.puestos ?? [],
    categorias: this.catalogos()?.categorias_cct ?? [],
    entidades: this.entidades(),
  }));

  /**
   * Federative entities of birth, as the screen names them.
   *
   * The frozen RENAPO table is the base because the live service does not send
   * `entidades` yet: reading the payload alone left the list empty, every lookup
   * missed and the derived key stayed blank while the CURP already carried it.
   */
  readonly entidades = computed<readonly EntidadCatalogo[]>(() => {
    const delServidor = this.catalogos()?.entidades ?? [];
    if (delServidor.length === 0) {
      return ENTIDADES_FEDERATIVAS;
    }

    const porClave = new Map(delServidor.map((entidad) => [entidad.clave, entidad]));
    return ENTIDADES_FEDERATIVAS.map((entidad) => porClave.get(entidad.clave) ?? entidad);
  });

  /**
   * Fields this folder protects, and whose local rules therefore never speak.
   *
   * Every key of the draft outside the allowlist: a legacy value of the record
   * cannot be fixed here, so its message is not produced at all.
   */
  private readonly camposProtegidos = computed<readonly string[]>(() =>
    Object.keys(BORRADOR_ALTA).filter((campo) => !EDITABLES.has(campo)),
  );

  /**
   * Every local failure of the draft, keyed by field.
   *
   * Also the gate of the save and the source of the badge of every tab: a field
   * that fails here would come back as a `422`, so the folder refuses to send it
   * instead of spending a round trip on a known answer.
   */
  private readonly erroresDelBorrador = computed<Record<string, string>>(() =>
    evaluarBorrador(this.modelo(), this.contexto(), {
      camposProtegidos: this.camposProtegidos(),
    }),
  );

  /** Marital statuses, the choices of `estado_civil_id`. */
  readonly estadosCiviles = computed(() => this.catalogos()?.estados_civiles ?? []);

  /** Schooling levels, the choices of `nivel_estudios_id`. */
  readonly niveles = computed(() => this.catalogos()?.niveles_estudios ?? []);

  /** Values of `trabaja_otro_lugar`, in the order the backend sends them. */
  readonly opcionesOtroLugar = computed(() => this.catalogos()?.trabaja_otro_lugar ?? []);

  /** `true` when the "where else" detail has a value to carry. */
  readonly pideOtroLugar = computed(() => this.modelo().trabaja_otro_lugar !== OTRO_LUGAR_NO);

  /**
   * How many invalid fields each tab owns, by index of `TABS`.
   *
   * It counts the local failures and the ones the last `422` reported, deduped by
   * field: a server sentence about a value the client also rejects is one box to
   * fix, not two.
   */
  readonly erroresPorTab = computed<readonly number[]>(() => {
    const conteo = TABS.map(() => 0);
    const vistos = new Set<string>();

    for (const campo of [
      ...Object.keys(this.erroresDelBorrador()),
      ...Object.keys(this.erroresServidor()),
    ]) {
      if (vistos.has(campo)) {
        continue;
      }
      vistos.add(campo);

      const seccion = SECCION_DE_CAMPO[campo];
      if (seccion !== undefined) {
        conteo[seccion] += 1;
      }
    }

    return conteo;
  });

  /**
   * Field messages of the last `422` that belong to no sheet.
   *
   * A prohibited field (`nombre`, `curp`, …) has no control here, and silently
   * dropping its message would hide the only explanation the backend gave.
   */
  readonly erroresSueltos = computed<readonly string[]>(() =>
    Object.entries(this.erroresServidor())
      .filter(([campo]) => SECCION_DE_CAMPO[campo] === undefined)
      .flatMap(([, mensajes]) => mensajes),
  );

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

  /** Whether the bar may send: there is a record, it is not travelling, and no failure blocks it. */
  readonly puedeGuardar = computed(
    () =>
      this.registroActual() !== null &&
      this.fallo() === null &&
      !this.cargando() &&
      !this.enviando(),
  );

  /**
   * Every read-only value of the sheet, read from the record and never from the
   * draft.
   *
   * The record is the document: it holds readable labels (`area`, `puesto`,
   * `entidad_nacimiento`) that the draft only keeps as keys, and it is the truth
   * the sheet is a copy of. The draft is a second copy of the same values, made
   * only to build the request, so a screen painted from it would have to guess
   * which of the two is right.
   */
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

  /**
   * Every request the folder wants to send.
   *
   * `switchMap` keeps one in flight: a newer open cancels the one it supersedes,
   * so a slow answer for the previous worker never lands over the current one.
   */
  private readonly peticiones = new Subject<number | null>();
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private cierreTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimers());

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
        // The catalogues land first: the entity key of the draft is derived from
        // the CURP against them, so preloading before they exist would derive an
        // empty key for a record that does carry one.
        this.catalogos.set(catalogos);
        this.precargar(ficha);
      });

    // Only `open` and the id are dependencies of this effect. Everything it
    // calls reads and writes other signals — the draft, the loading flag, the
    // reset timer — and tracking those would make the effect restart the very
    // request it just started.
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

  /** Reads the record (and the catalogues it is printed with) again. */
  reintentar(): void {
    this.peticiones.next(this.empleadoId());
  }

  /** Read-only value of the sheet, in the record drawer's grammar. */
  valorDe(campo: string): ValorFicha {
    const limpio = this.valores()[campo] ?? '';
    return limpio === '' ? { valor: SIN_DATO, vacio: true } : { valor: limpio, vacio: false };
  }

  /**
   * Fills the draft from the record, exactly as the edit page does.
   *
   * `fecha_nacimiento` and `sexo` come from the record and are never blanked and
   * never re-derived: the backend resolves both from the CURP it received, and a
   * document that already travelled is not re-interpreted by this screen. The
   * entity of birth is the exception — the draft keeps the two-character key the
   * request carries, and the record only answers the readable name, so the key is
   * derived from the CURP against the catalogue, which is the authority on which
   * key exists.
   */
  private precargar(ficha: FichaEmpleado): void {
    this.registroActual.set(ficha);
    this.modelo.set({
      ...BORRADOR_ALTA,
      ...ficha.identificacion,
      correo_institucional: ficha.contacto.correo_institucional ?? '',
      area_id: ficha.plaza.area_id,
      puesto_id: ficha.plaza.puesto_id,
      tipo_personal: ficha.plaza.tipo_personal ?? '',
      tipo_jornada: ficha.plaza.tipo_jornada ?? '',
      fecha_inicio_puesto: ficha.plaza.fecha_inicio_puesto ?? '',
      fecha_ingreso_gobierno: ficha.plaza.fecha_ingreso_gobierno ?? '',
      curp: ficha.identificacion.curp ?? '',
      fecha_nacimiento: ficha.identificacion.fecha_nacimiento ?? '',
      sexo: ficha.identificacion.sexo ?? '',
      entidad_nacimiento: claveDeEntidad(
        curpClaveEntidad(ficha.identificacion.curp ?? ''),
        this.entidades(),
      ),
      nivel_estudios_id: ficha.estudios.nivel_estudios_id,
      escuela_procedencia: ficha.estudios.escuela_procedencia ?? '',
      generacion: ficha.estudios.generacion ?? '',
      exp_publico_anios: ficha.experiencia.exp_publico_anios,
      exp_privado_anios: ficha.experiencia.exp_privado_anios,
      trabaja_otro_lugar: ficha.experiencia.trabaja_otro_lugar ?? '',
      trabaja_otro_donde: ficha.experiencia.trabaja_otro_donde ?? '',
      observaciones: ficha.gestion_interna.observaciones ?? '',
    });
  }

  /**
   * Body of the `PATCH`: the allowlist and nothing else.
   *
   * The record travels in the draft so the rules can read it, but only these nine
   * keys may be written. A blank string is sent as `null`, which is the way the
   * endpoint clears a field; the name, the CURP and the entity are not part of
   * the body at all, so they cannot travel by accident.
   */
  private cuerpoEdicion(): EdicionEmpleado {
    const datos = this.modelo();
    return Object.fromEntries(
      CAMPOS_EDITABLES.map((campo) => {
        const valor = datos[campo];
        return [campo, typeof valor === 'string' ? valor.trim() || null : valor];
      }),
    ) as EdicionEmpleado;
  }

  // -------------------------------------------------------------------------
  // Draft
  // -------------------------------------------------------------------------

  /**
   * Writes one field of the draft.
   *
   * The allowlist is checked here as well as in the template: a write to a
   * protected field is a bug of the screen, and the draft is the only thing that
   * decides what the request carries.
   */
  guardar(campo: keyof BorradorAlta, valor: string | number | null): void {
    if (!EDITABLES.has(campo)) {
      return;
    }

    this.modelo.update((actual) => ({ ...actual, [campo]: valor }) as BorradorAlta);
    this.olvidarErrorDeServidor(campo);
    this.refrescarErrores();
  }

  /**
   * Reads a numeric `<select>`.
   *
   * Selects carry ids and foreign keys; the empty option means "not chosen" and
   * travels as `null`, never as `0`.
   */
  elegirNumero(campo: CampoSelectNumero, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.guardar(campo, valor === '' ? null : Number(valor));
  }

  /** Reads a `<select>` that carries the literal value of the contract. */
  elegirTexto(campo: CampoSelectTexto, evento: Event): void {
    this.guardar(campo, (evento.target as HTMLSelectElement).value);
  }

  /**
   * Changes `trabaja_otro_lugar`.
   *
   * Going back to `No` clears the detail: the backend prohibits that field in
   * that case, so it must not travel, and a stale sentence from a previous
   * answer must not come back if the user switches again.
   */
  cambiarOtroLugar(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.guardar('trabaja_otro_lugar', valor);
    if (valor === OTRO_LUGAR_NO) {
      this.guardar('trabaja_otro_donde', '');
    }
  }

  /**
   * Marks a control as visited.
   *
   * Called on `blur`: until the user leaves the field, an empty one is not a
   * mistake, it is a field being filled in.
   */
  tocar(campo: string): void {
    if (this.tocado()[campo] === true) {
      return;
    }
    this.tocado.update((actual) => ({ ...actual, [campo]: true }));
    this.refrescarErrores();
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  /**
   * Message of a field, or `null`.
   *
   * A `422` wins over the local sentence of the same field: the server saw the
   * value that was actually sent, and its message names a rule the client does
   * not know.
   */
  errorDe(campo: string): string | null {
    const servidor = this.erroresServidor()[campo];
    if (Array.isArray(servidor) && servidor.length > 0) {
      return servidor.join(' ');
    }
    return this.errores()[campo] ?? null;
  }

  /** `id` of the note that describes a field, or `null` when it says nothing. */
  idDeError(campo: string): string | null {
    return this.errorDe(campo) === null ? null : `error-${campo}`;
  }

  // -------------------------------------------------------------------------
  // Folder and tabs
  // -------------------------------------------------------------------------

  /** A tab of the strip was chosen. The strip only knows indexes. */
  protected seleccionarIndice(indice: number): void {
    const tab = TABS[indice];
    if (tab !== undefined) {
      this.tabActiva.set(tab.id);
    }
  }

  /** Closes the folder from its own bar. */
  cerrar(): void {
    this.open.set(false);
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  /**
   * Sends the allowlist to the API, or says what has to be fixed first.
   *
   * The button is never gated by the draft: pressing it is how the user learns
   * what is missing. Every rule is checked here once more, and a failure does not
   * travel — the folder reveals the messages, moves to the sheet that owns the
   * first one and puts the cursor in that field, which is what the `422` would
   * have done with a wasted round trip.
   *
   * One request at a time: a second press while the first is in flight would
   * save twice, so `enviando` is checked here as well as disabling the button.
   */
  guardarCambios(): void {
    const id = this.empleadoId();
    if (id === null || !this.puedeGuardar()) {
      return;
    }

    const fallidos = Object.keys(this.erroresDelBorrador());
    if (fallidos.length > 0) {
      this.revelarErrores(fallidos);
      this.irAlCampo(fallidos[0]);
      return;
    }

    this.enviando.set(true);
    this.mensaje.set(null);
    this.erroresServidor.set({});

    this.editarService
      .actualizar(id, this.cuerpoEdicion())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: (respuesta) => this.alGuardado(respuesta.data),
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /**
   * A save just landed.
   *
   * The record is the returned one — the server is the authority on what it
   * stored — the history panel is told to read its field again, and the page that
   * hosts the folder is told what changed. Nothing else is refreshed here: the
   * roster and its counts belong to the page.
   */
  private alGuardado(ficha: FichaEmpleado): void {
    this.precargar(ficha);
    this.historialRevision.update((n) => n + 1);
    this.actualizado.emit(ficha);
    this.open.set(false);
  }

  /** Maps a failure of the save to the messages the user reads. */
  private manejarError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo =
      error instanceof HttpErrorResponse ? (error.error as ErrorValidacion | null) : null;
    const mensaje = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

    if (status === 422) {
      const errores = cuerpo?.errors;
      if (errores !== null && typeof errores === 'object') {
        this.erroresServidor.set(errores);
        this.mensaje.set(mensaje);
        this.irAlPrimerErrorDeServidor(errores);
        return;
      }
    }

    switch (status) {
      case 401:
        this.mensaje.set(MENSAJE_SESION);
        return;
      case 403:
        this.mensaje.set(mensaje ?? MENSAJE_PERMISO);
        return;
      case 503:
        this.mensaje.set(MENSAJE_SERVICIO);
        return;
      default:
        this.mensaje.set(MENSAJE_CONEXION);
    }
  }

  /**
   * Moves the folder to the sheet that holds the first field that failed, and
   * reveals it.
   *
   * The backend writes the fields in the order it validated them, so the first
   * key with a sheet is the first thing the user has to fix.
   */
  private irAlPrimerErrorDeServidor(errores: Record<string, string[]>): void {
    const conSeccion = Object.keys(errores).filter(
      (campo) => SECCION_DE_CAMPO[campo] !== undefined,
    );

    this.revelarErrores(conSeccion);
    if (conSeccion.length > 0) {
      this.irAlCampo(conSeccion[0]);
    }
  }

  /** Opens the sheet of a field and puts the cursor in the control itself. */
  private irAlCampo(campo: string): void {
    const seccion = SECCION_DE_CAMPO[campo];
    const tab = seccion === undefined ? undefined : TABS[seccion];
    if (tab === undefined) {
      return;
    }

    this.tabActiva.set(tab.id);
    this.programarFoco(`#${campo}`);
  }

  // -------------------------------------------------------------------------
  // Messages of the draft
  // -------------------------------------------------------------------------

  /** Rebuilds the visible messages from the draft and the visited controls. */
  private refrescarErrores(): void {
    const visibles: Record<string, string> = {};

    for (const [campo, mensaje] of Object.entries(this.erroresDelBorrador())) {
      if (this.tocado()[campo] === true) {
        visibles[campo] = mensaje;
      }
    }

    this.errores.set(visibles);
  }

  /** Makes the fields that failed speak, after a submit that cannot leave. */
  private revelarErrores(campos: readonly string[]): void {
    this.tocado.update((actual) => {
      const siguiente = { ...actual };
      for (const campo of campos) {
        siguiente[campo] = true;
      }
      return siguiente;
    });
    this.refrescarErrores();
  }

  /** Forgets the `422` message of one field, after the value behind it changed. */
  private olvidarErrorDeServidor(campo: string): void {
    const actuales = this.erroresServidor();
    if (!(campo in actuales)) {
      return;
    }

    const resto: Record<string, string[]> = { ...actuales };
    delete resto[campo];
    this.erroresServidor.set(resto);
  }

  // -------------------------------------------------------------------------
  // Reading and failures of the load
  // -------------------------------------------------------------------------

  /** Date of the sheet, or `''` when the record carries none. */
  private fecha(valor: string | null): string {
    const limpio = (valor ?? '').trim();
    if (limpio === '') {
      return '';
    }

    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio);
    if (partes === null) {
      // An unexpected shape is shown verbatim: inventing a date would be worse.
      return limpio;
    }

    const fecha = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
    return FORMATO_FECHA.format(fecha);
  }

  /** Maps a failure of the load to the sentence and the action the user gets. */
  private describirFallo(error: unknown): FalloEdicion {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as FichaError | null) : null;
    const detalle = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

    switch (status) {
      case 401:
        // The body says `Unauthenticated.`, which is not copy: English, and it
        // names a protocol rather than the situation.
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

  /**
   * Opening the folder starts every visit from the record as it is now.
   *
   * The transient state of a previous visit — the messages of a `422`, the
   * controls the user had visited, the general sentence — belongs to that visit
   * and is dropped, and the record is asked again: the plaza or the file state of
   * a worker can change between two openings, and a cached sheet would state
   * yesterday's truth.
   */
  private alAbrir(id: number | null): void {
    this.tabActiva.set(TABS[0].id);
    this.tocado.set({});
    this.errores.set({});
    this.erroresServidor.set({});
    this.mensaje.set(null);
    this.historialRevision.set(0);
    this.fallo.set(null);
    this.registroActual.set(null);
    this.modelo.set({ ...BORRADOR_ALTA });

    if (id === null) {
      this.fallo.set({
        status: 0,
        mensaje: MENSAJE_SIN_TRABAJADOR,
        detalle: null,
        accion: 'ninguna',
      });
      return;
    }

    this.peticiones.next(id);
  }

  /**
   * Closing the folder leaves it empty for the next opening.
   *
   * The tab goes back to the first sheet at once — the move is navigation, not
   * content — while the draft is cleared after the exit transition, so the sheet
   * is not wiped in front of the user. A close with a dirty draft asks nothing:
   * this folder is a scratch document, and its draft has no value once discarded.
   */
  private alCerrar(): void {
    this.tabActiva.set(TABS[0].id);
    this.peticiones.next(null);

    if (this.cierreTimer !== null) {
      return;
    }

    this.cierreTimer = setTimeout(() => {
      this.cierreTimer = null;
      if (this.open()) {
        return;
      }
      this.modelo.set({ ...BORRADOR_ALTA });
      this.registroActual.set(null);
      this.catalogos.set(null);
      this.fallo.set(null);
      this.tocado.set({});
      this.errores.set({});
      this.erroresServidor.set({});
      this.mensaje.set(null);
    }, CIERRE_MS);
  }

  /** A reopen inside the exit window keeps the record that was still on screen. */
  private cancelarCierre(): void {
    if (this.cierreTimer !== null) {
      clearTimeout(this.cierreTimer);
      this.cierreTimer = null;
    }
  }

  /**
   * Moves the focus (and the scroll) to a control once the sheet that holds it
   * is on screen.
   *
   * A `setTimeout(0)` because the tab switch is what creates the control: the
   * node does not exist yet when the jump is decided.
   */
  private programarFoco(selector: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.clearFocusTimer();

    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      const hostEl = this.elementRef.nativeElement as HTMLElement;
      const target = hostEl.querySelector<HTMLElement>(selector);
      if (target === null) {
        return;
      }

      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      if (typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      }
    }, 0);
  }

  private clearFocusTimer(): void {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearFocusTimer();
    this.cancelarCierre();
  }
}
