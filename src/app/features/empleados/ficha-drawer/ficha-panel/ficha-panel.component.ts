import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import {
  BajaEmpleadoRequest,
  BajaError,
  MotivoBaja,
} from '../../../../core/empleados/baja.models';
import { BajaService } from '../../../../core/empleados/baja.service';
import { FichaEmpleado, HistorialBaja } from '../../../../core/empleados/ficha.models';

/**
 * The four destinations of the second level of the record.
 *
 * Two of them speak to the server (the absence log and the termination); the
 * other two are the shape of the screen the day their endpoints exist, and say
 * so instead of faking a list or a request.
 */
export type VistaFicha = 'historial-bajas' | 'baja' | 'reactivacion' | 'adscripciones';

/**
 * Own copy of the layer. Every failure below is a different situation for the
 * user, so each one gets its own sentence; a single "something went wrong"
 * would throw that distinction away.
 *
 * The `409` is the exception: its sentence is the endpoint's own and already
 * Spanish and specific, so it is shown verbatim.
 */
const MESSAGE_SESSION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MESSAGE_ACCESS = 'Tu acceso ya no está vigente. Vuelve a iniciar sesión.';
const MESSAGE_PERMISSION = 'No tienes permisos para dar de baja.';
const MESSAGE_CONNECTION = 'No pudimos conectar con el servidor. Revisa tu conexión.';
const MESSAGE_SERVER = 'No pudimos registrar la baja. Intenta más tarde.';
const MESSAGE_MOTIVOS = 'No pudimos cargar los motivos. Cierra y vuelve a abrir.';

/** Fallback of a `409` whose body carries no sentence. */
const MESSAGE_CONFLICT = 'El trabajador ya está dado de baja.';
/** The POST answers the route's own 404 when the worker no longer exists. */
const MESSAGE_GONE = 'Ese trabajador ya no existe. Cierra el panel y recarga la lista.';

/** Both limits are the contract's, not a guess: `nota` is `max:1000`. */
const MAX_NOTA = 1000;

/** Fields of the request that have a control on screen, for a `422`. */
const CAMPOS_CONOCIDOS = ['motivo_id', 'nota'] as const;

/**
 * The only two motives a termination from this screen may use.
 *
 * `MotivoBaja` carries no `tipo`, so the kind is read from `clave` — the one
 * mapping the deleted modal already used: `BAJA_DEFINITIVA` closes the post and
 * `BAJA_TEMPORAL` is a leave. Anything else is hidden: a motive this screen
 * cannot explain is a motive the operator cannot be asked to choose.
 */
const CLAVE_DEFINITIVA = 'BAJA_DEFINITIVA';
const CLAVE_LICENCIA = 'BAJA_TEMPORAL';

/** What a date nobody registered reads. */
const NO_VALUE = 'Sin registro';

/** Lines of the loading block of the absence log. */
const SKELETON_LINES = 6;

/** One line of the absence log, already formatted for the timeline. */
interface EntradaHistorial {
  id: number;
  tipo: string;
  desde: string;
  hasta: string | null;
  nota: string | null;
  reactivacion: string | null;
  vigente: boolean;
}

/**
 * Second level of the record: a paper panel over the folder.
 *
 * It is its own component for one measurable reason: the styles of the whole
 * level do not fit in the 7 kB budget of the folder's sheet, and this panel is
 * a different surface with its own vocabulary anyway. The parent keeps the
 * folder, dims it and makes it inert; this component keeps the panel.
 *
 * It is a view over data it does not own: the record, the absence log and the
 * folio arrive as inputs. The termination is the only act it performs, and it
 * reports it upward — the record reload, the roster refresh and the stamp are
 * the folder's business.
 */
@Component({
  selector: 'app-ficha-panel',
  templateUrl: './ficha-panel.component.html',
  styleUrl: './ficha-panel.component.scss',
})
export class FichaPanel {
  private readonly bajaService = inject(BajaService);
  private readonly destroyRef = inject(DestroyRef);

  /** Whether the panel is over the folder. False still renders it, out of view. */
  readonly abierta = input(false);

  /** Which destination is open, or `null` while the panel is closed. */
  readonly vista = input<VistaFicha | null>(null);

  /** Internal key of the worker the panel acts on. */
  readonly empleadoId = input<number | null>(null);

  /** Record on screen, for the subject of the act and its current state. */
  readonly ficha = input<FichaEmpleado | null>(null);

  /** Absence log of the record, loaded by the folder alongside it. */
  readonly bajas = input<readonly HistorialBaja[]>([]);

  /** `true` while the absence log is in flight. */
  readonly cargandoHistorial = input(false);

  /** Sentence of the log's last failure, or `null`. */
  readonly errorHistorial = input<string | null>(null);

  /** Whether the open period is a leave, as the folder already reads it. */
  readonly esLicencia = input(false);

  /** Folio of the record, printed as the foot of every annex. */
  readonly folio = input('0000');

  /** The panel asks to be closed — the folder owns the way out. */
  readonly volver = output<void>();

  /** Asks the folder for the absence log again, after a failure. */
  readonly reintentarHistorial = output<void>();

  /** Fired only with a `200`: the record has to be read again. */
  readonly bajaRegistrada = output<void>();

  /** Catalog answer, or `null` until the first successful read. */
  readonly motivos = signal<readonly MotivoBaja[] | null>(null);

  /** `true` while the catalog is in flight. */
  readonly cargandoMotivos = signal(false);

  /** Sentence of a catalog failure, or `null`. */
  readonly errorMotivos = signal<string | null>(null);

  /** Motive chosen on screen, or `null`. */
  readonly motivoId = signal<number | null>(null);

  /** Note as typed. Trimmed only when it is sent. */
  readonly nota = signal('');

  /** `true` while the termination is in flight. */
  readonly enviando = signal(false);

  /** General sentence of the last submit failure, or `null`. */
  readonly mensaje = signal<string | null>(null);

  /** Per-field messages of the last `422`, keyed by the name the backend uses. */
  readonly errores = signal<Record<string, string[]>>({});

  /** `true` when the backend says the worker is already terminated. */
  readonly conflicto = signal(false);

  /** `true` when leaving would throw away a typed note. */
  readonly descartable = signal(false);

  /** Upper bound of the note, for the live counter. */
  readonly maxNota = MAX_NOTA;

  /** Lines of the loading block. */
  protected readonly esqueletos = Array.from({ length: SKELETON_LINES }, (_, linea) => linea);

  /** Root of the panel: what receives focus when the level opens. */
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panelRef');

  /** Name of the destination on screen. */
  protected readonly titulo = computed(() => {
    switch (this.vista()) {
      case 'historial-bajas':
        return 'Historial de bajas';
      case 'baja':
        return 'Formato de baja';
      case 'reactivacion':
        return 'Formato de reactivación';
      case 'adscripciones':
        return 'Historial de adscripciones';
      default:
        return 'Anexo';
    }
  });

  /** The worker the document is about, as the sheet names it. */
  protected readonly nombre = computed(
    () => this.ficha()?.identificacion.nombre?.trim() || 'Ficha del trabajador',
  );

  /** Subject of the act: `{num_empleado} — {nombre}`, the way the operator sees it. */
  protected readonly quien = computed(() => {
    const identificacion = this.ficha()?.identificacion;
    if (identificacion === undefined) {
      return '';
    }
    return `${identificacion.num_empleado} — ${identificacion.nombre}`;
  });

  /** Whether the open destination is a form, which is what can be discarded. */
  protected readonly esFormulario = computed(
    () => this.vista() === 'baja' || this.vista() === 'reactivacion',
  );

  /** The two kinds this screen may ask for, with the labels the backend sends. */
  protected readonly opciones = computed<readonly MotivoBaja[]>(() =>
    (this.motivos() ?? []).filter(
      (motivo) => motivo.clave === CLAVE_DEFINITIVA || motivo.clave === CLAVE_LICENCIA,
    ),
  );

  /**
   * Client gate of the submit: a motive and a note that is not only spaces.
   *
   * Everything else is the server's: re-implementing its rules here would give
   * the user a different answer than the one that will actually decide.
   */
  protected readonly puedeEnviar = computed(
    () =>
      !this.enviando() &&
      !this.cargandoMotivos() &&
      this.motivos() !== null &&
      this.motivoId() !== null &&
      this.nota().trim().length > 0,
  );

  /**
   * Label of the secondary action.
   *
   * After a `409` the only useful move is leaving, so the button says so out
   * loud instead of promising a cancel that changes nothing.
   */
  protected readonly etiquetaSecundaria = computed(() => (this.conflicto() ? 'Cerrar' : 'Cancelar'));

  /** Accessible description of the note: its counter first, then its error. */
  protected readonly descripcionNota = computed(() =>
    this.errorDe('nota') === null ? 'panel-nota-contador' : 'panel-nota-contador error-nota',
  );

  /** Sentence of the alert, whichever source it came from. */
  protected readonly errorGeneral = computed(() => this.mensaje() ?? this.errorMotivos());

  /** The log, already formatted: dates as `dd/mm/aaaa`, type in the operator's words. */
  protected readonly historial = computed<readonly EntradaHistorial[]>(() =>
    this.bajas().map((baja) => ({
      id: baja.id,
      tipo: this.tipoDe(baja),
      desde: this.fecha(baja.desde),
      hasta: baja.hasta === null ? null : this.fecha(baja.hasta),
      nota: baja.nota?.trim() || null,
      reactivacion: baja.nota_reactivacion?.trim() || null,
      vigente: baja.vigente,
    })),
  );

  /** The motive the record carries, which is what a reactivation would reopen. */
  protected readonly motivoActual = computed(
    () => this.ficha()?.gestion_interna.motivo_baja?.trim() || NO_VALUE,
  );

  /** The day the termination took effect, as the record carries it. */
  protected readonly fechaBaja = computed(() => this.fecha(this.ficha()?.gestion_interna.fecha_baja ?? null));

  /**
   * What a reactivation would mean, which depends on how the worker left.
   *
   * A leave returns the worker to the roster; a definitive termination closed
   * the relationship, and only the institution can authorise a re-entry.
   */
  protected readonly avisoReactivacion = computed(() =>
    this.esLicencia()
      ? 'La reactivación devuelve al trabajador al padrón de activos y le restablece el acceso al sistema.'
      : 'La baja definitiva cerró la relación laboral: un reingreso no se reabre desde esta pantalla, tiene que autorizarlo la institución.',
  );

  /**
   * Tracks the open/closed transition.
   *
   * A plain field, not a signal: the effect below must not re-run because of a
   * bookkeeping value, only because the panel opened.
   */
  private abiertaAntes = false;

  constructor() {
    effect(() => {
      const isOpen = this.abierta();

      if (!isOpen) {
        this.abiertaAntes = false;
        return;
      }

      if (this.abiertaAntes) {
        return;
      }

      this.abiertaAntes = true;
      // A new attempt starts clean: a note typed for the previous act must
      // never travel with the next one.
      this.reiniciar();

      if (this.vista() === 'baja') {
        this.cargarMotivos();
      }
    });
  }

  /** Moves focus into the panel. The folder calls this after rendering it. */
  enfocar(): void {
    this.panelRef()?.nativeElement.focus();
  }

  /** Reads the chosen motive. The empty option means "not chosen". */
  protected elegirMotivo(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.motivoId.set(valor === '' ? null : Number(valor));
    this.olvidarError('motivo_id');
  }

  /** Writes the note and forgets the message the previous failure left on it. */
  protected escribirNota(evento: Event): void {
    this.nota.set((evento.target as HTMLTextAreaElement).value);
    this.olvidarError('nota');
  }

  /**
   * The way out, unless the note on screen would be lost.
   *
   * Leaving a form with a typed note asks first: the banner is the only place
   * where the operator gets to say yes to losing it.
   */
  protected intentarVolver(): void {
    if (this.esFormulario() && this.nota().trim() !== '') {
      this.descartable.set(true);
      return;
    }

    this.salir();
  }

  /** Gives up the draft and leaves. */
  protected descartar(): void {
    this.reiniciar();
    this.salir();
  }

  /** Keeps the draft: the banner disappears and the form stays as it was. */
  protected seguirEditando(): void {
    this.descartable.set(false);
  }

  /** Message of a field, or `null`. The messages are shown joined, verbatim. */
  protected errorDe(campo: string): string | null {
    const mensajes = this.errores()[campo];
    return Array.isArray(mensajes) && mensajes.length > 0 ? mensajes.join(' ') : null;
  }

  /** `id` of the message of a field, so the control can point at it. */
  protected idDeError(campo: string): string | null {
    return this.errorDe(campo) === null ? null : `error-${campo}`;
  }

  /**
   * Sends the termination.
   *
   * One request at a time: a second click while the first is in flight would
   * ask the backend to terminate the same worker twice.
   */
  protected darDeBaja(): void {
    const id = this.empleadoId();
    const motivoId = this.motivoId();
    const nota = this.nota().trim();

    if (id === null || motivoId === null || nota === '' || this.enviando()) {
      return;
    }

    const datos: BajaEmpleadoRequest = { motivo_id: motivoId, nota };

    this.enviando.set(true);
    this.mensaje.set(null);
    this.errores.set({});
    this.conflicto.set(false);

    this.bajaService
      .darDeBaja(id, datos)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: () => {
          this.reiniciar();
          this.bajaRegistrada.emit();
        },
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /** Formats a date of the API as `dd/mm/aaaa`, or the placeholder when absent. */
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

    return `${parts[3]}/${parts[2]}/${parts[1]}`;
  }

  /**
   * Reads the catalog, once per instance.
   *
   * A second open reuses the list; a failed read leaves nothing cached, so the
   * next open asks again instead of keeping an empty `<select>` forever.
   */
  private cargarMotivos(): void {
    if (this.motivos() !== null || this.cargandoMotivos()) {
      return;
    }

    this.cargandoMotivos.set(true);
    this.errorMotivos.set(null);

    this.bajaService
      .cargarMotivos()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.cargandoMotivos.set(false)),
      )
      .subscribe({
        next: (motivos) => this.motivos.set(motivos),
        error: () => this.errorMotivos.set(MESSAGE_MOTIVOS),
      });
  }

  /** Clears the draft and the previous failures of a new attempt. */
  private reiniciar(): void {
    this.motivoId.set(null);
    this.nota.set('');
    this.errores.set({});
    this.mensaje.set(null);
    this.conflicto.set(false);
    this.descartable.set(false);
  }

  /** Matlab of a period, in the words of the operator. */
  private tipoDe(baja: HistorialBaja): string {
    const etiqueta =
      baja.tipo === 'licencia'
        ? 'Licencia'
        : baja.tipo === 'definitiva'
          ? 'Baja definitiva'
          : (baja.motivo?.trim() ?? 'Baja');

    return baja.vigente ? `${etiqueta} (vigente)` : etiqueta;
  }

  /**
   * Places every `422` message where the user can act on it.
   *
   * `nota` and `motivo_id` sit next to their own control; a message that names
   * any other field has no control to sit beside, so it goes to the alert —
   * dropping it would hide the only explanation the backend gave.
   */
  private manejarValidacion(
    errores: Record<string, string[]> | undefined,
    mensajeLaravel: string | null,
  ): void {
    const recibidos = errores ?? {};
    this.errores.set(recibidos);

    const sueltos = this.mensajesSueltos(recibidos);
    const reconocido = CAMPOS_CONOCIDOS.some((campo) => this.errorDe(campo) !== null);

    this.mensaje.set(sueltos ?? (reconocido ? null : mensajeLaravel));
  }

  /** Messages of the fields that have no control on screen. */
  private mensajesSueltos(errores: Record<string, string[]>): string | null {
    const sueltos = Object.entries(errores)
      .filter(([campo]) => !(CAMPOS_CONOCIDOS as readonly string[]).includes(campo))
      .flatMap(([, mensajes]) => mensajes);

    return sueltos.length > 0 ? sueltos.join(' ') : null;
  }

  /** Maps a failure of the termination to the messages the user reads. */
  private manejarError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as BajaError | null) : null;
    const codigo = typeof cuerpo?.codigo === 'string' ? cuerpo.codigo : null;
    const mensajeBackend = typeof cuerpo?.mensaje === 'string' ? cuerpo.mensaje : null;
    const mensajeLaravel = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

    switch (status) {
      case 401:
        // The body says `Unauthenticated.`, which is not copy: English, and it
        // names a protocol rather than the situation.
        this.mensaje.set(MESSAGE_SESSION);
        return;
      case 403:
        // A revoked access destroys the token on the backend; a role without
        // `E-05` keeps it. The two need different sentences.
        this.mensaje.set(codigo === 'permiso_denegado' ? MESSAGE_PERMISSION : MESSAGE_ACCESS);
        return;
      case 409:
        // Already terminated: the sentence is the endpoint's, and it is shown as
        // it arrives. The panel stays open, with nothing left to submit.
        this.conflicto.set(true);
        this.mensaje.set(mensajeBackend ?? MESSAGE_CONFLICT);
        return;
      case 404:
        // The route's own 404 (`No query results for model…`), not the ficha's
        // controlled one: the worker is gone, not a validation problem.
        this.mensaje.set(MESSAGE_GONE);
        return;
      case 422:
        this.manejarValidacion(cuerpo?.errors, mensajeLaravel);
        return;
      case 500:
        this.mensaje.set(mensajeBackend ?? MESSAGE_SERVER);
        return;
      default:
        this.mensaje.set(MESSAGE_CONNECTION);
    }
  }

  /** Forgets the message of one field, after the value behind it changed. */
  private olvidarError(campo: string): void {
    const actuales = this.errores();
    if (!(campo in actuales)) {
      return;
    }

    const resto: Record<string, string[]> = { ...actuales };
    delete resto[campo];
    this.errores.set(resto);
  }

  /** Announces the way out to the folder, which owns the close. */
  private salir(): void {
    this.descartable.set(false);
    this.volver.emit();
  }
}
