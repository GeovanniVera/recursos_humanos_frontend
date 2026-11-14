import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, finalize, switchMap } from 'rxjs';
import { etiquetaCampoExpediente } from '../../../core/empleados/expediente-campos';
import {
  EstadoExpediente,
  FichaEmpleado,
  FichaError,
  HistorialBaja,
} from '../../../core/empleados/ficha.models';
import { FichaService } from '../../../core/empleados/ficha.service';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { FichaPanel, VistaFicha } from './ficha-panel/ficha-panel.component';

/**
 * Own copy of the panel. Every failure is a different situation for the user,
 * so each one gets its own sentence; a single "something went wrong" would
 * throw that distinction away. The `404` sentence is ours and not the body's:
 * the same status also comes from the route itself (a non-numeric id never
 * reaches the API) and Laravel answers a different body there, so trusting the
 * body would print two sentences for one situation. The body's own sentence is
 * still shown verbatim under it, for support.
 */
const MESSAGE_SESSION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MESSAGE_PERMISSION = 'No tienes permisos para ver esta ficha.';
const MESSAGE_BAJAS_PERMISSION = 'No tienes permisos para ver el historial de bajas.';
const MESSAGE_NOT_FOUND = 'No encontramos ese trabajador.';
const MESSAGE_CONNECTION = 'No pudimos conectar con el servidor. Revisa tu conexión.';

/**
 * What an empty field reads.
 *
 * Never an empty cell and never the string `null`: a field the record does not
 * carry has to say so. It is not the same as a field the backend reported as
 * missing — that one reads `Falta capturar`, because a missing field is a task
 * and an empty one is only a fact.
 */
const NO_VALUE = 'Sin registro';

/** What a field the backend listed as missing reads. */
const MISSING_VALUE = 'Falta capturar';

/** What the list of missing fields reads when there is nothing to list. */
const NO_MISSING = 'Ninguno';

/** The name the panel falls back to while there is no record yet. */
const PANEL_TITLE = 'Ficha del trabajador';

/** What the alert offers the user: another try, or nothing at all. */
type FichaErrorAction = 'reintentar' | 'ninguna';

/** Failure of the record, already translated into copy and into an action. */
interface FichaFailure {
  /** HTTP status, or `0` when the request never reached the server. */
  status: number;
  /** Sentence the user reads. */
  mensaje: string;
  /** Contract value from the body (`permiso_denegado`), shown muted. */
  detalle: string | null;
  accion: FichaErrorAction;
}

/** The four sheets of the folder, in the order the tabs present them. */
type TabId = 'ficha' | 'plaza' | 'formacion' | 'estado';

interface Tab {
  id: TabId;
  etiqueta: string;
}

/**
 * Field of the record a backend key fills.
 *
 * `estado_civil` and `estado_civil_id`, `nivel_estudios` and
 * `nivel_estudios_id` are the same box on the sheet: two keys, one slot. The
 * slot is what the screen marks and counts, so a backend that reports both
 * spellings still produces one missing field, not two.
 */
type CampoSlot =
  | 'curp'
  | 'fecha_nacimiento'
  | 'estado_civil'
  | 'entidad_nacimiento'
  | 'fecha_ingreso_gobierno'
  | 'nivel_estudios'
  | 'escuela_procedencia'
  | 'generacion';

interface CampoExpediente {
  slot: CampoSlot;
  tab: TabId;
}

/**
 * Where each missing-field key of `estado_expediente.campos_faltantes` belongs.
 *
 * A key outside this map is ignored on purpose: the backend may grow a field
 * before this screen learns it, and an unknown key must not put a red dot on a
 * box that does not exist. Its label still comes from `etiquetaCampoExpediente`,
 * so the list of missing fields in `Estado` names it in Spanish.
 */
const CAMPOS_EXPEDIENTE: Readonly<Record<string, CampoExpediente>> = {
  curp: { slot: 'curp', tab: 'ficha' },
  fecha_nacimiento: { slot: 'fecha_nacimiento', tab: 'ficha' },
  estado_civil: { slot: 'estado_civil', tab: 'ficha' },
  estado_civil_id: { slot: 'estado_civil', tab: 'ficha' },
  entidad_nacimiento: { slot: 'entidad_nacimiento', tab: 'ficha' },
  fecha_ingreso_gobierno: { slot: 'fecha_ingreso_gobierno', tab: 'plaza' },
  nivel_estudios: { slot: 'nivel_estudios', tab: 'formacion' },
  nivel_estudios_id: { slot: 'nivel_estudios', tab: 'formacion' },
  escuela_procedencia: { slot: 'escuela_procedencia', tab: 'formacion' },
  generacion: { slot: 'generacion', tab: 'formacion' },
};

/** One line of the grid of a sheet: a section subtitle or a filled field. */
interface FilaFicha {
  tipo: 'subtitulo' | 'campo';
  etiqueta: string;
  valor: string;
  /** `true` when the record carries nothing: the value prints as a placeholder. */
  vacio: boolean;
  /** Field of the missing-field contract this box fills, when it has one. */
  slot: CampoSlot | null;
  /** A field that takes the whole width of the grid. */
  completo: boolean;
}

/** The seal of a sheet: the word, and whether it reads well or badly. */
interface Sello {
  texto: string;
  tono: 'ok' | 'mal';
}

/**
 * Date formatter of the record.
 *
 * `timeZone: 'UTC'` is not decoration: the API sends a calendar day
 * (`YYYY-MM-DD`), which is parsed as UTC midnight, and formatting it in a local
 * zone west of UTC would print the previous day. Parsing and formatting in UTC
 * keeps the day the backend wrote, for every user of every timezone.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Lines standing in for the record while it loads. */
const SKELETON_LINES = 8;

/**
 * How long the seal stays marked after a termination, in milliseconds.
 *
 * The animation itself is `--motion-fast`; this is only the bookkeeping mark, so
 * it is reset after the entry has certainly played and a later reload does not
 * slam a seal that nobody just pressed.
 */
const SLAM_RESET_MS = 900;

/**
 * The full record of one worker, on paper.
 *
 * A desk, a manila folder and a sheet: the only surface of the system that does
 * not use the glass vocabulary, and the reason `app-drawer` has a `bare` mode.
 * The panel is a view and nothing else: it owns the request, its loading state
 * and its failure, and the roster only tells it which id to open. Closing
 * clears the record on purpose — reopening asks again, because a plaza or a
 * file state can change between two visits and a cached panel would state
 * yesterday's truth.
 */
@Component({
  selector: 'app-ficha-drawer',
  imports: [Drawer, FichaPanel],
  templateUrl: './ficha-drawer.component.html',
  styleUrl: './ficha-drawer.component.scss',
})
export class FichaDrawer {
  private readonly fichaService = inject(FichaService);
  private readonly destroyRef = inject(DestroyRef);

  /** Internal key of the worker to show. `null` means "nothing selected yet". */
  readonly empleadoId = input<number | null>(null);

  /** Whether the panel is open. Two-way bound to the page that hosts it. */
  readonly open = model(false);

  /** Whether inline editing is enabled by a backing contract/workflow. */
  readonly puedeEditar = input(false);

  /** Emits the loaded worker id when edition is triggered and available. */
  readonly editarSolicitado = output<number>();

  /**
   * Fired when the termination layer reports a `200`.
   *
   * The panel does not know how to refresh a roster: it only says that the act
   * happened, and the page that owns the list decides what to ask again.
   */
  readonly bajaRegistrada = output<void>();

  /** Record of the last successful request, or `null`. */
  readonly ficha = signal<FichaEmpleado | null>(null);

  /** `true` while a record is in flight. */
  readonly loading = signal(false);

  /** Last failure, or `null`. */
  readonly error = signal<FichaFailure | null>(null);

  /**
   * Chronological absence/termination history of the loaded worker.
   *
   * The sheet does not print it yet: the second level of the record owns the
   * list. It is loaded here because the seal of `Estado` reads it — a period
   * that is currently open tells a leave apart from a termination.
   */
  readonly bajas = signal<HistorialBaja[]>([]);

  /**
   * Last failure of the absence log, or `null`.
   *
   * It is not printed by the folder: the second level of the record owns the
   * list, and an alert about a list the folder does not show would be noise over
   * a record that did load. The annex reads this signal for its own state.
   */
  readonly errorBajas = signal<FichaFailure | null>(null);

  /** `true` while the absence log of the loaded worker is in flight. */
  readonly cargandoBajas = signal(false);

  /** The four sheets, in the order the folder presents them. */
  protected readonly tabs: readonly Tab[] = [
    { id: 'ficha', etiqueta: 'Ficha' },
    { id: 'plaza', etiqueta: 'Plaza' },
    { id: 'formacion', etiqueta: 'Formación' },
    { id: 'estado', etiqueta: 'Estado' },
  ];

  /** Sheet on screen. Reset to the first one when the panel closes. */
  protected readonly tabActiva = signal<TabId>('ficha');

  /** Destination of the second level that is open, or `null`. */
  protected readonly vistaL2 = signal<VistaFicha | null>(null);

  /** `true` right after a termination: the seal of `Estado` is pressed again. */
  protected readonly golpeSello = signal(false);

  /**
   * Whether the termination can be asked for right now.
   *
   * The same rule the `Estado` sheet reads: a worker who is not active has
   * nothing to terminate, and a record still travelling cannot be acted on.
   */
  protected readonly puedeDarBaja = computed(
    () => !this.loading() && this.ficha()?.gestion_interna.activo === true,
  );

  /** Count on the action that opens the log, empty while the log is travelling. */
  protected readonly textoHistorial = computed(() =>
    this.cargandoBajas() ? '' : ` (${this.bajas().length})`,
  );

  /** Lines of the loading block. */
  protected readonly esqueletos = Array.from({ length: SKELETON_LINES }, (_, linea) => linea);

  /** What a field the backend listed as missing reads. */
  protected readonly textoFaltante = MISSING_VALUE;

  /**
   * Every request the panel wants to send.
   *
   * `switchMap` keeps one in flight: a newer open cancels the one it supersedes,
   * so a slow answer for the previous worker never lands over the current one.
   */
  private readonly requests = new Subject<number | null>();
  private readonly bajaRequests = new Subject<number | null>();
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private selloTimer: ReturnType<typeof setTimeout> | null = null;

  /** Buttons of the tab strip, for the roving focus of the arrow keys. */
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabRef');

  /** The annex over the folder: what receives the focus when it opens. */
  private readonly panelRef = viewChild(FichaPanel);

  private readonly injector = inject(Injector);

  /** Action that opened the annex, so focus can come back to it. */
  private focoOrigen: HTMLElement | null = null;

  /** Name at the top of the desk: the worker's, or the panel's while it loads. */
  protected readonly nombre = computed(() => {
    const nombre = this.ficha()?.identificacion.nombre;
    return (nombre ?? '').trim() || PANEL_TITLE;
  });

  /** The line under the title of the sheet: the tab says which one it is. */
  protected readonly meta = computed(() => {
    const record = this.ficha();
    if (record === null) {
      return null;
    }
    switch (this.tabActiva()) {
      case 'ficha':
        return `No. de empleado ${this.texto(record.identificacion.num_empleado)}`;
      case 'plaza':
        return this.texto(record.plaza.area);
      default:
        return null;
    }
  });

  /**
   * Slots the backend reported as missing, as canonical boxes of the sheet.
   *
   * A key the map does not know is dropped here: it has no box to mark.
   */
  private readonly slotsFaltantes = computed<ReadonlySet<CampoSlot>>(() => {
    const slots = new Set<CampoSlot>();
    for (const clave of this.clavesFaltantes()) {
      const campo = CAMPOS_EXPEDIENTE[clave];
      if (campo !== undefined) {
        slots.add(campo.slot);
      }
    }
    return slots;
  });

  /** How many missing fields each tab owns, for the badge of its tab. */
  protected readonly faltantesPorTab = computed<Readonly<Record<TabId, number>>>(() => {
    const conteo: Record<TabId, number> = { ficha: 0, plaza: 0, formacion: 0, estado: 0 };
    const vistos = new Set<CampoSlot>();

    for (const clave of this.clavesFaltantes()) {
      const campo = CAMPOS_EXPEDIENTE[clave];
      if (campo === undefined || vistos.has(campo.slot)) {
        continue;
      }
      vistos.add(campo.slot);
      conteo[campo.tab] += 1;
    }

    return conteo;
  });

  /** Missing fields with their Spanish label, as `Estado` lists them. */
  protected readonly etiquetaFaltantes = computed(() => {
    const claves = this.clavesFaltantes();
    if (claves.length === 0) {
      return NO_MISSING;
    }
    return claves.map((clave) => etiquetaCampoExpediente(clave)).join(', ');
  });

  /** `Folio 0012`, padded so the numbers of a series line up. */
  protected readonly folio = computed(() => {
    const id = this.ficha()?.id;
    return typeof id === 'number' ? String(id).padStart(4, '0') : '0000';
  });

  /** Which sheet of the folder is on screen, from one to four. */
  protected readonly hoja = computed(
    () => this.tabs.findIndex((tab) => tab.id === this.tabActiva()) + 1,
  );

  /** Lines of the sheet on screen. */
  protected readonly filas = computed<readonly FilaFicha[]>(() => {
    switch (this.tabActiva()) {
      case 'ficha':
        return this.filasFicha();
      case 'plaza':
        return this.filasPlaza();
      case 'formacion':
        return this.filasFormacion();
      case 'estado':
        return this.filasEstado();
    }
  });

  /** Seal of the sheet on screen. Only `Ficha` and `Estado` carry one. */
  protected readonly sello = computed<Sello | null>(() => {
    switch (this.tabActiva()) {
      case 'ficha':
        return this.selloExpediente();
      case 'estado':
        return this.selloEstado();
      default:
        return null;
    }
  });

  /** Whether the backend listed the field of this row as missing. */
  protected readonly esFaltante = (fila: FilaFicha): boolean =>
    fila.slot !== null && this.slotsFaltantes().has(fila.slot);

  /** The sentence under the title of the `Estado` sheet. */
  private readonly selloExpediente = computed<Sello>(() => {
    const expediente = this.ficha()?.gestion_interna.estado_expediente;
    const total = expediente?.total_faltantes ?? 0;

    if (expediente === undefined || expediente.estado === 'completo') {
      return { texto: 'EXPEDIENTE COMPLETO', tono: 'ok' };
    }

    // One missing field is a singular noun: `FALTAN 1 DATOS` would be copy that
    // nobody writes, and the seal is read as a sentence.
    return {
      texto: total === 1 ? 'FALTA 1 DATO' : `FALTAN ${total} DATOS`,
      tono: 'mal',
    };
  });

  /** The seal of the employment state, which is not the state of the file. */
  private readonly selloEstado = computed<Sello>(() => {
    const gestion = this.ficha()?.gestion_interna;

    if (gestion === undefined || gestion.activo) {
      return { texto: 'ACTIVO', tono: 'ok' };
    }

    return { texto: this.esLicencia() ? 'LICENCIA' : 'BAJA', tono: 'mal' };
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimers());

    this.requests
      .pipe(
        switchMap((id) => (id === null ? EMPTY : this.request(id))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (ficha) => {
          this.ficha.set(ficha);
          this.error.set(null);
        },
      });

    this.bajaRequests
      .pipe(
        switchMap((id) => (id === null ? EMPTY : this.requestBajas(id))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (bajas) => this.bajas.set(bajas),
      });

    effect(() => {
      const isOpen = this.open();
      const id = this.empleadoId();

      if (!isOpen) {
        // Cancel any in-flight request immediately, while keeping the current
        // snapshot during the drawer's 300ms exit transition.
        this.requests.next(null);
        this.bajaRequests.next(null);
        this.loading.set(false);
        this.cargandoBajas.set(false);
        // The folder opens on its first sheet every time: the second visit to a
        // worker is a new reading of the record, not a continuation. The annex
        // goes with it: a level over a closed folder is a level nobody can see.
        this.tabActiva.set('ficha');
        this.vistaL2.set(null);
        this.focoOrigen = null;
        this.scheduleClearOnClose();
        return;
      }

      this.clearCloseTimer();
      if (id !== null) {
        this.load(id);
      }
    });
  }

  /** Moves the folder to a sheet. */
  protected seleccionar(id: TabId): void {
    this.tabActiva.set(id);
  }

  /**
   * Arrow keys move through the strip and open the sheet they land on.
   *
   * Roving `tabindex` is what makes the strip one stop for Tab and arrows: only
   * the selected tab is reachable with Tab, and everything else is a step away.
   */
  protected alTeclear(event: KeyboardEvent): void {
    const indiceActual = this.tabs.findIndex((tab) => tab.id === this.tabActiva());
    const total = this.tabs.length;
    let destino: number;

    switch (event.key) {
      case 'ArrowRight':
        destino = (indiceActual + 1) % total;
        break;
      case 'ArrowLeft':
        destino = (indiceActual - 1 + total) % total;
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = total - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.seleccionar(this.tabs[destino].id);
    this.tabButtons()[destino]?.nativeElement.focus();
  }

  /** Closes the panel from its own bar. */
  protected cerrar(): void {
    this.open.set(false);
  }

  /** Emits edit request when an edit workflow is wired via `puedeEditar`. */
  protected solicitarEdicion(): void {
    const id = this.ficha()?.id;
    if (id === undefined || !this.puedeEditar()) {
      return;
    }
    this.editarSolicitado.emit(id);
    this.open.set(false);
  }

  /** Retry of the sheet: asks for the record on screen again. */
  protected reintentar(): void {
    const id = this.empleadoId();
    if (id !== null) {
      this.load(id);
    }
  }

  // -------------------------------------------------------------------------
  // Second level
  // -------------------------------------------------------------------------

  /**
   * Opens one destination of the annex.
   *
   * The action is the origin of the focus, taken from the event and not from
   * `document.activeElement`: Safari does not focus a button on click, and the
   * way back has to land on the door the operator actually used.
   */
  protected abrirVista(vista: VistaFicha, evento: Event): void {
    const origen = evento.currentTarget;
    this.focoOrigen = origen instanceof HTMLElement ? origen : null;
    this.vistaL2.set(vista);

    afterNextRender(() => this.panelRef()?.enfocar(), { injector: this.injector });
  }

  /** Closes the annex and hands the focus back to the action that opened it. */
  protected cerrarVista(): void {
    this.vistaL2.set(null);

    afterNextRender(() => this.devolverFoco(), { injector: this.injector });
  }

  /** Retry of the absence log, from the annex that shows it. */
  protected reintentarBajas(): void {
    const id = this.empleadoId();
    if (id !== null) {
      this.bajaRequests.next(id);
    }
  }

  /**
   * A termination just landed.
   *
   * The annex closes, the record is read again — the state, the seal and the
   * presence log all changed — and the roster is told, because the endpoint
   * filters inactive workers out and the row has to disappear.
   */
  protected alRegistrarBaja(): void {
    const id = this.empleadoId();

    this.vistaL2.set(null);
    this.sellar();
    if (id !== null) {
      this.load(id);
    }
    this.bajaRegistrada.emit();

    afterNextRender(() => this.devolverFoco(), { injector: this.injector });
  }

  /** Presses the seal of `Estado` again, and lets the mark go once it played. */
  private sellar(): void {
    this.golpeSello.set(true);
    this.clearSelloTimer();
    this.selloTimer = setTimeout(() => {
      this.selloTimer = null;
      this.golpeSello.set(false);
    }, SLAM_RESET_MS);
  }

  /**
   * Gives the focus back to the action that opened the annex.
   *
   * That action can be gone by the time the annex closes — a termination
   * replaces `Dar de baja` with `Reactivar` — so the strip of the folder takes
   * the focus when the original node is no longer in the document.
   */
  private devolverFoco(): void {
    const origen = this.focoOrigen;
    this.focoOrigen = null;

    if (origen !== null && origen.isConnected) {
      origen.focus();
      return;
    }

    const indice = this.tabs.findIndex((tab) => tab.id === this.tabActiva());
    this.tabButtons()[indice]?.nativeElement.focus();
  }

  /** Formats a date of the API, or the placeholder when there is none. */
  protected fecha(value: string | null): string {
    const raw = value?.trim();
    if (!raw) {
      return NO_VALUE;
    }

    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (parts === null) {
      // An unexpected shape is shown verbatim: inventing a date would be worse
      // than showing the string the backend sent.
      return raw;
    }

    const date = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
    return DATE_FORMAT.format(date);
  }

  /** Prints a string of the record, or the placeholder when it is absent. */
  protected texto(value: string | null): string {
    const raw = value?.trim();
    return raw ? raw : NO_VALUE;
  }

  /** Prints a figure of the record. `0` is a real answer, so it is kept. */
  protected numero(value: number | null): string {
    return typeof value === 'number' ? String(value) : NO_VALUE;
  }

  /** Word of the traffic light, in the case the backend does not send. */
  protected etiquetaExpediente(estado: EstadoExpediente): string {
    switch (estado) {
      case 'completo':
        return 'Completo';
      case 'casi_completo':
        return 'Casi completo';
      case 'incompleto':
        return 'Incompleto';
    }
  }

  // -------------------------------------------------------------------------
  // Sheets
  // -------------------------------------------------------------------------

  private readonly filasFicha = computed<readonly FilaFicha[]>(() => {
    const record = this.ficha();
    const identificacion = record?.identificacion;
    const contacto = record?.contacto;

    return [
      this.subtitulo('Identificación'),
      this.filaTexto('Nombre completo', identificacion?.nombre ?? null, null, true),
      this.filaTexto('CURP', identificacion?.curp ?? null, 'curp', true),
      this.filaFecha('Fecha de nacimiento', identificacion?.fecha_nacimiento ?? null, 'fecha_nacimiento'),
      this.filaTexto('Sexo', identificacion?.sexo ?? null),
      this.filaTexto('Estado civil', identificacion?.estado_civil ?? null, 'estado_civil'),
      this.filaTexto(
        'Entidad de nacimiento',
        identificacion?.entidad_nacimiento ?? null,
        'entidad_nacimiento',
      ),
      this.subtitulo('Contacto'),
      this.filaTexto('Correo institucional', contacto?.correo_institucional ?? null, null, true),
    ];
  });

  private readonly filasPlaza = computed<readonly FilaFicha[]>(() => {
    const plaza = this.ficha()?.plaza;

    return [
      this.filaTexto('Área', plaza?.area ?? null, null, true),
      this.filaTexto('Puesto', plaza?.puesto ?? null),
      this.filaTexto('Tipo de puesto', this.capitalizar(plaza?.tipo_puesto ?? null)),
      this.filaTexto('Categoría CCT', plaza?.categoria_cct_clave ?? null),
      this.filaTexto('Tipo de personal', plaza?.tipo_personal ?? null),
      this.filaTexto('Jornada', plaza?.tipo_jornada ?? null),
      this.filaTexto('Antigüedad', plaza?.antiguedad.texto ?? null),
      this.filaFecha('Inicio en el puesto', plaza?.fecha_inicio_puesto ?? null),
      this.filaFecha('Ingreso a la institución', plaza?.fecha_ingreso_institucion ?? null),
      this.filaFecha(
        'Fecha de ingreso al gobierno',
        plaza?.fecha_ingreso_gobierno ?? null,
        'fecha_ingreso_gobierno',
      ),
    ];
  });

  private readonly filasFormacion = computed<readonly FilaFicha[]>(() => {
    const estudios = this.ficha()?.estudios;
    const experiencia = this.ficha()?.experiencia;

    return [
      this.subtitulo('Estudios'),
      this.filaTexto('Nivel de estudios', estudios?.nivel_estudios ?? null, 'nivel_estudios'),
      this.filaTexto('Generación', estudios?.generacion ?? null, 'generacion'),
      this.filaTexto('Escuela de procedencia', estudios?.escuela_procedencia ?? null, 'escuela_procedencia', true),
      this.subtitulo('Experiencia laboral'),
      this.filaNumero('Sector público', experiencia?.exp_publico_anios ?? null),
      this.filaNumero('Sector privado', experiencia?.exp_privado_anios ?? null),
      this.filaTexto('¿Trabaja en otro lugar?', experiencia?.trabaja_otro_lugar ?? null),
      this.filaTexto('¿Dónde?', experiencia?.trabaja_otro_donde ?? null),
    ];
  });

  private readonly filasEstado = computed<readonly FilaFicha[]>(() => {
    const gestion = this.ficha()?.gestion_interna;
    const filas: FilaFicha[] = [];

    // The three fields of a baja explain the state, so they come first and only
    // when there is one: an active worker is not a worker with empty baja data.
    if (gestion !== undefined && !gestion.activo) {
      filas.push(
        this.filaFecha('Fecha de baja', gestion.fecha_baja),
        this.filaTexto('Motivo', gestion.motivo_baja),
        this.filaTexto('Nota', gestion.nota_baja, null, true),
        this.filaTexto('Observaciones', gestion.observaciones, null, true),
      );
    }

    const expediente = gestion?.estado_expediente;
    const estado = expediente === undefined ? NO_VALUE : this.etiquetaExpediente(expediente.estado);
    const total = expediente?.total_faltantes ?? 0;
    const pendientes =
      total === 0 ? estado : `${estado} · ${total === 1 ? 'falta 1 campo' : `faltan ${total} campos`}`;

    filas.push(
      this.filaTexto('Estado del expediente', pendientes, null, true),
      this.filaTexto('Campos faltantes', this.etiquetaFaltantes(), null, true),
    );

    return filas;
  });

  // -------------------------------------------------------------------------
  // Rows
  // -------------------------------------------------------------------------

  private subtitulo(etiqueta: string): FilaFicha {
    return { tipo: 'subtitulo', etiqueta, valor: '', vacio: false, slot: null, completo: true };
  }

  /** A row whose value is text, printed as it arrives. */
  private filaTexto(
    etiqueta: string,
    valor: string | null,
    slot: CampoSlot | null = null,
    completo = false,
  ): FilaFicha {
    const vacio = (valor ?? '').trim() === '';
    return {
      tipo: 'campo',
      etiqueta,
      valor: vacio ? NO_VALUE : this.texto(valor),
      vacio,
      slot,
      completo,
    };
  }

  /** A row whose value is a calendar day of the API. */
  private filaFecha(
    etiqueta: string,
    valor: string | null,
    slot: CampoSlot | null = null,
    completo = false,
  ): FilaFicha {
    const vacio = (valor ?? '').trim() === '';
    return {
      tipo: 'campo',
      etiqueta,
      valor: vacio ? NO_VALUE : this.fecha(valor),
      vacio,
      slot,
      completo,
    };
  }

  /** A row whose value is a figure. `0` is a real answer, so it is kept. */
  private filaNumero(etiqueta: string, valor: number | null, completo = false): FilaFicha {
    const vacio = typeof valor !== 'number';
    return {
      tipo: 'campo',
      etiqueta,
      valor: vacio ? NO_VALUE : this.numero(valor),
      vacio,
      slot: null,
      completo,
    };
  }

  /** First letter up: the backend sends raw labels (`Confianza`, `Base`). */
  private capitalizar(value: string | null): string | null {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // -------------------------------------------------------------------------
  // Data
  // -------------------------------------------------------------------------

  /** Keys of the missing fields, as the backend spells them. */
  private clavesFaltantes(): string[] {
    const claves = this.ficha()?.gestion_interna.estado_expediente.campos_faltantes;
    if (!Array.isArray(claves)) {
      return [];
    }
    return claves.map((clave) => clave.trim()).filter((clave) => clave !== '');
  }

  /**
   * Whether the worker is on a leave instead of terminated.
   *
   * The open period of the absence log is the fact; `motivo_baja` is the label
   * the backend prints on the record, and it is read only when the log did not
   * arrive or has nothing open. The annex reads the same answer to choose the
   * sentence of its reactivation form.
   */
  protected readonly esLicencia = computed(() => {
    const vigente = this.bajas().find((baja) => baja.vigente);
    if (vigente !== undefined) {
      return vigente.tipo === 'licencia';
    }

    const motivo = this.ficha()?.gestion_interna.motivo_baja ?? '';
    return /licencia/i.test(motivo);
  });

  private clearCloseTimer(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  private clearSelloTimer(): void {
    if (this.selloTimer !== null) {
      clearTimeout(this.selloTimer);
      this.selloTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearCloseTimer();
    this.clearSelloTimer();
  }

  private scheduleClearOnClose(): void {
    this.clearCloseTimer();
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (!this.open()) {
        this.ficha.set(null);
        this.error.set(null);
        this.bajas.set([]);
        this.errorBajas.set(null);
      }
    }, 300);
  }

  /** Clears what the previous record showed and asks for the new one. */
  private load(id: number): void {
    this.ficha.set(null);
    this.bajas.set([]);
    this.requests.next(id);
    this.bajaRequests.next(id);
  }

  /**
   * One request, with `loading` and the failure mapped as it comes back.
   *
   * On failure the record stays empty: the sheet explains what went wrong, and
   * keeping the previous worker's data under a different heading would attribute
   * someone else's plaza to the id on screen.
   */
  private request(id: number): Observable<FichaEmpleado> {
    this.loading.set(true);
    this.error.set(null);

    return this.fichaService.consultar(id).pipe(
      catchError((error: unknown) => {
        this.error.set(this.mapHttpError(error, 'ficha'));
        return EMPTY;
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  /** Loads the chronological absence log alongside the main record. */
  private requestBajas(id: number): Observable<HistorialBaja[]> {
    this.cargandoBajas.set(true);
    this.errorBajas.set(null);

    return this.fichaService.consultarBajas(id).pipe(
      catchError((error: unknown) => {
        // The log refines a seal of the `Estado` sheet and is the body of the
        // annex: its failure belongs to the annex, which is the only place that
        // shows the list. The record the user asked for is not covered by it.
        this.errorBajas.set(this.mapHttpError(error, 'bajas'));
        return EMPTY;
      }),
      finalize(() => this.cargandoBajas.set(false)),
    );
  }

  /** Maps an HTTP failure to the sentence and the action the user gets. */
  private mapHttpError(error: unknown, scope: 'ficha' | 'bajas'): FichaFailure {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const code = this.errorCode(error);

    switch (status) {
      case 401:
        // The body says `Unauthenticated.`, which is not copy: English, and it
        // names a protocol rather than the situation.
        return { status, mensaje: MESSAGE_SESSION, detalle: null, accion: 'ninguna' };
      case 403:
        return {
          status,
          mensaje: scope === 'bajas' ? MESSAGE_BAJAS_PERMISSION : MESSAGE_PERMISSION,
          detalle: code,
          accion: 'ninguna',
        };
      case 404:
        return {
          status,
          mensaje: MESSAGE_NOT_FOUND,
          detalle: this.bodyMessage(error),
          accion: 'ninguna',
        };
      default:
        return {
          status,
          mensaje: MESSAGE_CONNECTION,
          detalle: null,
          accion: 'reintentar',
        };
    }
  }

  /** Reads `codigo` out of the error body without trusting its shape. */
  private errorCode(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const body = error.error as FichaError | null;
    return typeof body?.codigo === 'string' ? body.codigo : null;
  }

  /** Reads the backend sentence out of the error body, when it carries one. */
  private bodyMessage(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }
    const body = error.error as FichaError | null;
    return typeof body?.message === 'string' ? body.message : null;
  }
}
