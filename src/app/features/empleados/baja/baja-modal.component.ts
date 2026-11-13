import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  BajaEmpleadoRequest,
  BajaEmpleadoResponse,
  BajaError,
  EmpleadoDadoDeBaja,
  MotivoBaja,
} from '../../../core/empleados/baja.models';
import { BajaService } from '../../../core/empleados/baja.service';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
import { Button } from '../../../shared/ui/button/button.component';
import { Modal } from '../../../shared/ui/modal/modal.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';

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
 * Termination of a worker, in a layer over the record.
 *
 * The act is the server's: this layer only asks for the motive and the note and
 * posts them. The date and the actor are decided there, which is why the body
 * carries two fields and no more.
 *
 * The motive catalog is read once per instance and kept: a second open shows the
 * same list without another round trip, and a failed read is retried on the next
 * open because nothing was cached.
 */
@Component({
  selector: 'app-baja-modal',
  imports: [AlertBanner, Button, FormsModule, Modal],
  templateUrl: './baja-modal.component.html',
  styleUrl: './baja-modal.component.scss',
})
export class BajaModal {
  private readonly bajaService = inject(BajaService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  /** Internal key of the worker to terminate. */
  readonly empleadoId = input<number | null>(null);

  /**
   * Human label of the worker (`num_empleado — nombre`), when the caller has it.
   *
   * It is text and not a record on purpose: the layer names the subject without
   * depending on the shape of the record of another screen.
   */
  readonly empleadoEtiqueta = input<string | null>(null);

  /** Whether the layer is open. Two-way bound to the panel that hosts it. */
  readonly open = model(false);

  /** Fired only with a `200`: the roster has to read itself again. */
  readonly bajaRegistrada = output<EmpleadoDadoDeBaja>();

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

  /**
   * `true` when the backend says the worker is already terminated.
   *
   * The layer stays open so the user reads why, and the only action left is the
   * way out: retrying cannot change the answer.
   */
  readonly conflicto = signal(false);

  /** Upper bound of the note, for the live counter. */
  readonly maxNota = MAX_NOTA;

  /** Options of the `<select>`; empty while the catalog is missing. */
  readonly opciones = computed<readonly MotivoBaja[]>(() => this.motivos() ?? []);

  /** Motive chosen on screen, resolved against the catalogue. */
  readonly motivoElegido = computed<MotivoBaja | null>(() => {
    const id = this.motivoId();
    if (id === null) {
      return null;
    }
    return this.opciones().find((motivo) => motivo.id === id) ?? null;
  });

  /** `true` when the chosen motive closes the post. */
  readonly esDefinitiva = computed(() => this.motivoElegido()?.clave === 'BAJA_DEFINITIVA');

  /**
   * What the chosen motive does, in the operator's words.
   *
   * Derived from `clave` because the catalogue does not expose `cierra_plaza`.
   * An unknown claver shows nothing instead of guessing an effect.
   */
  readonly efecto = computed<string | null>(() => {
    const clave = this.motivoElegido()?.clave;

    if (clave === 'BAJA_TEMPORAL') {
      return 'No cierra el puesto ni la antigüedad: el trabajador conserva su plaza. Se le corta el acceso al sistema.';
    }

    if (clave === 'BAJA_DEFINITIVA') {
      return 'Cierra el puesto y fija la fecha de fin en la institución. No se puede deshacer con las herramientas actuales.';
    }

    return null;
  });

  /** Sentence of the alert, whichever source it came from. */
  readonly aviso = computed(() => this.mensaje() ?? this.errorMotivos());

  /**
   * Client gate of the submit: a motive and a note that is not only spaces.
   *
   * Everything else is the server's: re-implementing its rules here would give
   * the user a different answer than the one that will actually decide.
   */
  readonly puedeEnviar = computed(
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
  readonly etiquetaSecundaria = computed(() => (this.conflicto() ? 'Cerrar' : 'Cancelar'));

  /** Accessible description of the note: its counter first, then its error. */
  readonly descripcionNota = computed(() =>
    this.errorDe('nota') === null ? 'baja-nota-contador' : 'baja-nota-contador error-nota',
  );

  /**
   * Tracks the open/closed transition.
   *
   * A plain field, not a signal: the effect below must not re-run because of a
   * bookkeeping value, only because `open` changed.
   */
  private abierta = false;

  constructor() {
    effect(() => {
      const isOpen = this.open();

      if (!isOpen) {
        this.abierta = false;
        return;
      }

      if (this.abierta) {
        return;
      }

      this.abierta = true;
      // A new attempt starts clean: a note typed for the previous worker must
      // never travel with the next one.
      this.reiniciar();
      this.cargarMotivos();
    });
  }

  /** Reads the chosen motive. The empty option means "not chosen". */
  protected elegirMotivo(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value;
    this.motivoId.set(valor === '' ? null : Number(valor));
    this.olvidarError('motivo_id');
  }

  /** Writes the note and forgets the message the previous failure left on it. */
  protected escribirNota(valor: string): void {
    this.nota.set(valor);
    this.olvidarError('nota');
  }

  /** The way out. The modal closes itself through the model. */
  protected cerrar(): void {
    this.open.set(false);
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
        next: (response) => this.registrada(response),
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /**
   * Reads the motive catalog, once per instance.
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
  }

  /** Success: toast, output, closed layer and an empty form for the next one. */
  private registrada(response: BajaEmpleadoResponse): void {
    this.toast.show({
      type: 'success',
      title: response.mensaje,
      message: `${response.empleado.nombre} quedó dado de baja.`,
    });

    this.motivoId.set(null);
    this.nota.set('');
    this.errores.set({});
    this.mensaje.set(null);

    this.bajaRegistrada.emit(response.empleado);
    this.open.set(false);
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
        // controlled one: the worker is gone, not a validation problem. Showing
        // Laravel's sentence would tell the operator nothing.
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
}
