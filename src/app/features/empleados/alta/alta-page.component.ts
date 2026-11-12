import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AltaEmpleadoRequest,
  CatalogoAreas,
  CategoriaCctCatalogo,
  EmpleadoRegistrado,
  ErrorValidacion,
  FormularioCatalogos,
  PuestoCatalogo,
} from '../../../core/empleados/alta.models';
import { AltaService } from '../../../core/empleados/alta.service';
import {
  EXPLICACION_CURP,
  MENSAJE_CURP_INVALIDA,
  MotivoCurp,
  categoriaCompatible,
  curpFechaNacimiento,
  curpSexo,
  hoyLocal,
  normalizarCorreo,
  normalizarMayusculas,
  trabajaOtroDondeRequerido,
  validarAniosExperiencia,
  validarCorreo,
  validarCurp,
  validarFecha,
  validarGeneracion,
  validarInicioPuesto,
  validarLargo,
  validarNombre,
  validarNumEmpleado,
} from '../../../core/empleados/validacion';
import { Button } from '../../../shared/ui/button/button.component';
import { ToastService } from '../../../shared/ui/toast/toast.service';

/**
 * Own copy of the screen. Every failure below is a different situation for the
 * user, so each one gets its own sentence; a single "something went wrong"
 * would throw that distinction away. The `422` is the exception: its per-field
 * messages come from the backend, already in Spanish and specific, and they are
 * displayed verbatim.
 */
const MENSAJE_SESION = 'Tu sesión venció. Vuelve a iniciar sesión.';
const MENSAJE_PERMISO = 'No tenés permisos para dar de alta empleados.';
const MENSAJE_CATALOGOS = 'No pudimos cargar los catálogos del formulario.';
const MENSAJE_SERVICIO = 'El servicio no está disponible. Reintenta en unos segundos.';
const MENSAJE_CONEXION = 'No pudimos conectar con el servidor. Revisa tu conexión.';

/**
 * Placeholder for a value the user has not filled in yet. Never an empty cell
 * and never the string `null`: a missing CURP has to read as "not declared".
 */
const SIN_DATO = '—';

/** Steps of the wizard, in the order the contract groups the fields. */
const PASOS = ['Identificación', 'Plaza', 'Estudios y experiencia', 'Confirmación'] as const;

/** Index of the summary, the only step that submits instead of moving on. */
const PASO_CONFIRMACION = PASOS.length - 1;

/** Two non-breaking spaces per level of the chart, so a `<select>` can show depth. */
const SANGRIA = '\u00A0\u00A0';

/** Values the backend fixes for a `mando_medio` post. They are the only accepted ones. */
const PERSONAL_MANDO_MEDIO = 'No Aplica';
const JORNADA_MANDO_MEDIO = 'Mixta';

/** `trabaja_otro_lugar` values that turn `trabaja_otro_donde` on. */
const OTRO_LUGAR_NO = 'No';

/**
 * Sentence of an empty control that carries a typed value, not a choice.
 *
 * The message is the signal of the state, not the colour: every one of them
 * names what to do next.
 */
const MENSAJE_REQUERIDO_TEXTO = 'Completá este dato.';

/** Sentence of a required `<select>` still sitting on its placeholder. */
const MENSAJE_REQUERIDO_OPCION = 'Elige una opción.';

/** Sentence of the plaza when the category does not fit the chosen post. */
const MENSAJE_CATEGORIA = 'La categoría elegida no corresponde al tipo del puesto.';

/** The two fields the backend derives from a complete CURP. */
const CAMPOS_DERIVADOS = ['fecha_nacimiento', 'sexo'] as const;

/**
 * Step that owns each field of the request.
 *
 * A `422` names the fields that failed; the wizard uses this table to jump to
 * the card that holds the first one instead of leaving the user staring at a
 * summary while the message sits on another screen.
 */
const PASO_DE_CAMPO: Readonly<Record<string, number>> = {
  num_empleado: 0,
  nombre: 0,
  curp: 0,
  fecha_nacimiento: 0,
  sexo: 0,
  estado_civil_id: 0,
  municipio: 0,
  correo_institucional: 0,
  area_id: 1,
  puesto_id: 1,
  categoria_cct_id: 1,
  tipo_personal: 1,
  tipo_jornada: 1,
  fecha_inicio_puesto: 1,
  fecha_ingreso_gobierno: 1,
  nivel_estudios_id: 2,
  escuela_procedencia: 2,
  generacion: 2,
  exp_publico_anios: 2,
  exp_privado_anios: 2,
  trabaja_otro_lugar: 2,
  trabaja_otro_donde: 2,
  observaciones: 2,
};

/**
 * What the user has typed so far.
 *
 * Every field exists from the start and holds its empty value (`''` or `null`),
 * because the draft is the single source of truth of the form: a field that is
 * not on screen still keeps its value, and a `422` never resets it.
 */
interface BorradorAlta {
  num_empleado: string;
  nombre: string;
  curp: string;
  fecha_nacimiento: string;
  sexo: string;
  estado_civil_id: number | null;
  municipio: string;
  correo_institucional: string;
  area_id: number | null;
  puesto_id: number | null;
  categoria_cct_id: number | null;
  tipo_personal: string;
  tipo_jornada: string;
  fecha_inicio_puesto: string;
  fecha_ingreso_gobierno: string;
  nivel_estudios_id: number | null;
  escuela_procedencia: string;
  generacion: string;
  exp_publico_anios: number | null;
  exp_privado_anios: number | null;
  trabaja_otro_lugar: string;
  trabaja_otro_donde: string;
  observaciones: string;
}

/** Optional text fields of the request, all `string | undefined` on the wire. */
type CampoTexto =
  | 'curp'
  | 'fecha_nacimiento'
  | 'fecha_ingreso_gobierno'
  | 'escuela_procedencia'
  | 'generacion'
  | 'municipio'
  | 'sexo'
  | 'observaciones';

/** Optional numeric fields of the request. */
type CampoNumero = 'exp_publico_anios' | 'exp_privado_anios' | 'nivel_estudios_id' | 'estado_civil_id';

/** Fields chosen with a `<select>` that carries a foreign key. */
type CampoSelectNumero = 'area_id' | 'puesto_id' | 'categoria_cct_id' | 'estado_civil_id' | 'nivel_estudios_id';

/** Fields chosen with a `<select>` that carries the literal value. */
type CampoSelectTexto = 'sexo' | 'tipo_personal' | 'tipo_jornada' | 'trabaja_otro_lugar' | 'municipio';

/** One option of the area `<select>`, already flattened and indented. */
interface AreaOpcion {
  readonly id: number;
  readonly nombre: string;
  readonly asignable: boolean;
  /** Non-breaking spaces that express the depth of the node in the chart. */
  readonly sangria: string;
}

/** One row of the read-only summary. */
interface FilaResumen {
  readonly etiqueta: string;
  readonly valor: string;
}

/** One block of the read-only summary, one per step. */
interface GrupoResumen {
  readonly titulo: string;
  readonly filas: readonly FilaResumen[];
}

/** Empty draft. `trabaja_otro_lugar` starts on the backend default, `No`. */
const BORRADOR: BorradorAlta = {
  num_empleado: '',
  nombre: '',
  curp: '',
  fecha_nacimiento: '',
  sexo: '',
  estado_civil_id: null,
  municipio: '',
  correo_institucional: '',
  area_id: null,
  puesto_id: null,
  categoria_cct_id: null,
  tipo_personal: '',
  tipo_jornada: '',
  fecha_inicio_puesto: '',
  fecha_ingreso_gobierno: '',
  nivel_estudios_id: null,
  escuela_procedencia: '',
  generacion: '',
  exp_publico_anios: null,
  exp_privado_anios: null,
  trabaja_otro_lugar: OTRO_LUGAR_NO,
  trabaja_otro_donde: '',
  observaciones: '',
};

/**
 * Date formatter of the summary.
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
 * Registration of a new employee, reachable at `/empleados/alta`.
 *
 * Four steps that mirror the shape of `RegistrarEmpleadoRequest`, and a fifth
 * screen that does not exist: the last step is the summary, because the real
 * contract has no documents step and a wizard cannot ask for something the
 * backend will not store.
 *
 * The screen owns the whole draft and the whole state; `AltaService` holds
 * nothing. Every rule of `validacion.ts` is checked here as the user types, so
 * a mistake is named while the field is still under the cursor instead of after
 * a round trip. The server still owns the rules the client cannot see — the
 * institutional domain among them — and its `422` messages are already Spanish
 * and specific, so they are shown verbatim and they win over the local sentence
 * of the same field.
 *
 * A `mando_medio` post fixes `tipo_personal` and `tipo_jornada` on the server,
 * so the two controls are hidden and those two values travel in the body; the
 * category options are filtered by the type of the chosen post, because the
 * backend answers `422` when the two types differ.
 */
@Component({
  selector: 'app-alta-page',
  imports: [Button, FormsModule],
  templateUrl: './alta-page.component.html',
  styleUrl: './alta-page.component.scss',
})
export class AltaPage {
  private readonly altaService = inject(AltaService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Steps of the stepper, in order. */
  readonly pasos = PASOS;

  /** Index of the step on screen. */
  readonly paso = signal(0);

  /** Draft of the request, as typed. Nothing here is trimmed until it is sent. */
  readonly modelo = signal<BorradorAlta>({ ...BORRADOR });

  /** Last catalog answer, or `null` until the first one arrives. */
  readonly catalogos = signal<FormularioCatalogos | null>(null);

  /** `true` while the catalogs are in flight. */
  readonly cargando = signal(true);

  /** Sentence shown when the catalogs could not be read, or `null`. */
  readonly errorCatalogos = signal<string | null>(null);

  /** `true` while the registration is in flight. */
  readonly enviando = signal(false);

  /** General sentence of the last submit failure, or `null`. */
  readonly mensaje = signal<string | null>(null);

  /**
   * Local messages of the fields the user has already seen, keyed by field.
   *
   * Rebuilt from the draft on every edit: a cross-field rule (the start of the
   * post against the entry to the government, the category against the post)
   * has no single owner, so one pass over the whole draft is the only way to
   * keep every sentence true at the same time.
   */
  readonly errores = signal<Record<string, string>>({});

  /**
   * Controls the user has already visited.
   *
   * A field the user never touched is not scolded: its message is computed but
   * kept out of `errores` until the control loses focus. From then on the
   * message follows every keystroke, so fixing the value clears it at once.
   */
  readonly tocado = signal<Record<string, boolean>>({});

  /** Per-field messages of the last `422`, keyed by the name the backend uses. */
  readonly erroresServidor = signal<Record<string, string[]>>({});

  /** Upper bound of every date field: the backend rejects a future start. */
  readonly hoy = hoyLocal();

  /**
   * Every local failure of the draft, keyed by field.
   *
   * Also the gate of the steps and of the submit: a field that fails here would
   * come back as a `422`, so the screen refuses to ask.
   */
  private readonly erroresDelBorrador = computed<Record<string, string>>(() =>
    this.evaluar(this.modelo()),
  );

  /** `true` when the CURP is complete and passes every rule of the backend. */
  private readonly curpValida = computed(() => validarCurp(this.modelo().curp).valida);

  /**
   * `true` when the birth date is read from the CURP instead of typed.
   *
   * The backend resolves the date from the CURP whenever it exists, so asking
   * for it twice would be a field that the server silently overwrites.
   */
  readonly fechaDerivada = computed(
    () => this.curpValida() && curpFechaNacimiento(this.modelo().curp) !== null,
  );

  /** `true` when the sex is read from the CURP. `X` leaves it to the user. */
  readonly sexoDerivado = computed(
    () => this.curpValida() && curpSexo(this.modelo().curp) !== null,
  );

  /** Motivo behind the local CURP message, for the `title` of the note. */
  private readonly motivosCurp = computed<readonly MotivoCurp[]>(
    () => validarCurp(this.modelo().curp).motivos,
  );

  /** `true` on the summary: the primary button submits instead of moving on. */
  readonly esConfirmacion = computed(() => this.paso() === PASO_CONFIRMACION);

  /** `true` while something is happening that must lock both navigation buttons. */
  readonly bloqueado = computed(() => this.enviando() || this.cargando());

  /**
   * Areas flattened the way the API sends them, plus the indent of each node.
   *
   * The endpoint sends the chart flat with `padre_id`, so depth is computed
   * here and expressed as non-breaking spaces inside the `<option>`: a real tree
   * widget is not what the contract asks for, and a `<select>` keeps the
   * keyboard behaviour the user already knows.
   */
  readonly areas = computed<readonly AreaOpcion[]>(() => {
    const lista = this.catalogos()?.areas ?? [];
    const porId = new Map<number, CatalogoAreas>(lista.map((area) => [area.id, area]));

    return lista.map((area) => ({
      id: area.id,
      nombre: area.nombre,
      asignable: area.asignable,
      sangria: SANGRIA.repeat(this.profundidad(area, porId)),
    }));
  });

  /** Posts, as the API sends them. */
  readonly puestos = computed<readonly PuestoCatalogo[]>(() => this.catalogos()?.puestos ?? []);

  /** Post chosen on screen, or `null`. */
  readonly puestoElegido = computed<PuestoCatalogo | null>(() => {
    const id = this.modelo().puesto_id;
    if (id === null) {
      return null;
    }
    return this.puestos().find((puesto) => puesto.id === id) ?? null;
  });

  /**
   * `true` when the chosen post is `mando_medio`.
   *
   * It decides three things: the two fixed values that travel in the body, the
   * two controls that are hidden, and whether the step 2 gate asks for them.
   */
  readonly esMandoMedio = computed(() => this.puestoElegido()?.tipo_puesto === 'mando_medio');

  /**
   * Categories whose `tipo` matches the type of the chosen post.
   *
   * The backend answers `422` when the two differ, so an incompatible category
   * is not offered in the first place. Before a post is chosen there is no type
   * to match, and the list is empty.
   */
  readonly categorias = computed<readonly CategoriaCctCatalogo[]>(() => {
    const tipo = this.puestoElegido()?.tipo_puesto;
    if (tipo === undefined) {
      return [];
    }
    return (this.catalogos()?.categorias_cct ?? []).filter((categoria) => categoria.tipo === tipo);
  });

  /** Schooling levels. */
  readonly niveles = computed(() => this.catalogos()?.niveles_estudios ?? []);

  /** Marital statuses. */
  readonly estadosCiviles = computed(() => this.catalogos()?.estados_civiles ?? []);

  /** Municipalities. The name is what travels, not the id. */
  readonly municipios = computed(() => this.catalogos()?.municipios ?? []);

  /** Personal types offered by the backend. */
  readonly tiposPersonal = computed(() => this.catalogos()?.tipos_personal ?? []);

  /** Shifts offered by the backend. */
  readonly tiposJornada = computed(() => this.catalogos()?.tipos_jornada ?? []);

  /** Sexes offered by the backend. */
  readonly sexos = computed(() => this.catalogos()?.sexos ?? []);

  /** Values of `trabaja_otro_lugar`, in the order the backend sends them. */
  readonly opcionesOtroLugar = computed(() => this.catalogos()?.trabaja_otro_lugar ?? []);

  /** `true` when the "where else" field has to be on screen. */
  readonly pideOtroLugar = computed(() => this.modelo().trabaja_otro_lugar !== OTRO_LUGAR_NO);

  /**
   * `tipo_personal` that will travel in the body.
   *
   * A `mando_medio` post hides the control and sends the only value the server
   * accepts for it.
   */
  readonly tipoPersonal = computed(() =>
    this.esMandoMedio() ? PERSONAL_MANDO_MEDIO : this.modelo().tipo_personal,
  );

  /** `tipo_jornada` that will travel in the body, for the same reason. */
  readonly tipoJornada = computed(() =>
    this.esMandoMedio() ? JORNADA_MANDO_MEDIO : this.modelo().tipo_jornada,
  );

  /**
   * Whether the primary button of a step may move forward.
   *
   * A step only moves when nothing it owns fails, which is the same set of
   * rules the submit asks for: the button is the first place the user learns
   * that a mandatory field is wrong, instead of the `422` that would come back.
   * The summary has nothing to gate, because its button submits.
   */
  readonly puedeContinuar = computed(() => {
    if (this.esConfirmacion()) {
      return true;
    }
    return !this.hayErrorEnElPaso(this.paso());
  });

  /** Read-only recap of everything typed, grouped by step. */
  readonly resumen = computed<readonly GrupoResumen[]>(() => {
    const datos = this.modelo();

    return [
      {
        titulo: PASOS[0],
        filas: [
          { etiqueta: 'Número de empleado', valor: this.texto(datos.num_empleado) },
          { etiqueta: 'Nombre completo', valor: this.texto(datos.nombre) },
          { etiqueta: 'CURP', valor: this.texto(datos.curp) },
          { etiqueta: 'Fecha de nacimiento', valor: this.fecha(datos.fecha_nacimiento) },
          { etiqueta: 'Sexo', valor: this.texto(datos.sexo) },
          {
            etiqueta: 'Estado civil',
            valor: this.descripcionDe(this.estadosCiviles(), datos.estado_civil_id),
          },
          { etiqueta: 'Municipio', valor: this.texto(datos.municipio) },
          { etiqueta: 'Correo institucional', valor: this.texto(datos.correo_institucional) },
        ],
      },
      {
        titulo: PASOS[1],
        filas: [
          { etiqueta: 'Área', valor: this.nombreDeArea(datos.area_id) },
          { etiqueta: 'Puesto', valor: this.puestoElegido()?.nombre ?? SIN_DATO },
          { etiqueta: 'Categoría CCT', valor: this.claveDeCategoria(datos.categoria_cct_id) },
          { etiqueta: 'Tipo de personal', valor: this.texto(this.tipoPersonal()) },
          { etiqueta: 'Tipo de jornada', valor: this.texto(this.tipoJornada()) },
          { etiqueta: 'Fecha de inicio en el puesto', valor: this.fecha(datos.fecha_inicio_puesto) },
          {
            etiqueta: 'Fecha de ingreso al gobierno',
            valor: this.fecha(datos.fecha_ingreso_gobierno),
          },
        ],
      },
      {
        titulo: PASOS[2],
        filas: [
          {
            etiqueta: 'Nivel de estudios',
            valor: this.descripcionDe(this.niveles(), datos.nivel_estudios_id),
          },
          { etiqueta: 'Escuela de procedencia', valor: this.texto(datos.escuela_procedencia) },
          { etiqueta: 'Generación', valor: this.texto(datos.generacion) },
          { etiqueta: 'Experiencia pública (años)', valor: this.numero(datos.exp_publico_anios) },
          { etiqueta: 'Experiencia privada (años)', valor: this.numero(datos.exp_privado_anios) },
          {
            etiqueta: 'Trabaja en otro lugar',
            valor: this.texto(datos.trabaja_otro_lugar),
          },
          {
            etiqueta: 'Dónde trabaja',
            valor: this.pideOtroLugar() ? this.texto(datos.trabaja_otro_donde) : 'No aplica',
          },
          { etiqueta: 'Observaciones', valor: this.texto(datos.observaciones) },
        ],
      },
    ];
  });

  /**
   * Field messages of the last `422` that belong to no step.
   *
   * A prohibited field (`categoria`, `adscripcion`, …) is not on any card, and
   * silently dropping its message would hide the only explanation the backend
   * gave.
   */
  readonly erroresSueltos = computed<readonly string[]>(() =>
    Object.entries(this.erroresServidor())
      .filter(([campo]) => this.pasoDelCampo(campo) === null)
      .flatMap(([, mensajes]) => mensajes),
  );

  constructor() {
    this.cargarCatalogos();
  }

  /** Reads (or re-reads) the catalogs. Also the retry of the failure block. */
  cargarCatalogos(): void {
    this.cargando.set(true);
    this.errorCatalogos.set(null);

    this.altaService
      .cargarCatalogos()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.cargando.set(false)),
      )
      .subscribe({
        next: (catalogos) => this.catalogos.set(catalogos),
        error: (error: unknown) => this.errorCatalogos.set(this.mensajeDeCatalogos(error)),
      });
  }

  /**
   * Writes one field of the draft.
   *
   * Two things happen after the value lands: the message of the last `422` for
   * that field is forgotten — the server sentence was about a value that no
   * longer exists — and the local messages are recomputed, so a field the user
   * already saw turns green as soon as it is right.
   */
  guardar(campo: keyof BorradorAlta, valor: string | number | null): void {
    const siguiente = { ...this.modelo(), [campo]: valor } as BorradorAlta;

    // A complete CURP carries the birth date and the sex: the backend resolves
    // both from it, so the screen fills them instead of asking twice.
    if (campo === 'curp' && typeof valor === 'string') {
      this.derivarDeCurp(siguiente, valor);
    }

    this.modelo.set(siguiente);
    this.olvidarErrorDeServidor(campo);
    this.refrescarErrores();
  }

  /**
   * Writes a field that is always written in upper case.
   *
   * The write is skipped when normalising changes nothing: handing Angular the
   * same value would repaint the control and send the caret to the end of the
   * line in the middle of a word.
   */
  guardarNormalizado(campo: 'num_empleado' | 'curp', valor: string): void {
    const limpio = normalizarMayusculas(valor);
    this.guardar(campo, limpio === valor ? valor : limpio);
  }

  /**
   * Writes the institutional address in lower case, the way the backend
   * normalises it before comparing. Same caret guard as `guardarNormalizado`:
   * the control is only handed a new value when the normalisation changed it.
   */
  guardarCorreo(valor: string): void {
    const limpio = normalizarCorreo(valor);
    this.guardar('correo_institucional', limpio === valor ? valor : limpio);
  }

  /**
   * Marks a control as visited.
   *
   * Called on `blur`: until the user leaves the field, an empty required one is
   * not a mistake, it is a field being filled in.
   */
  tocar(campo: string): void {
    if (this.tocado()[campo] === true) {
      return;
    }
    this.tocado.update((actual) => ({ ...actual, [campo]: true }));
    this.refrescarErrores();
  }

  /** Moves to the next step when the gate of the current one is satisfied. */
  continuar(): void {
    if (this.bloqueado() || !this.puedeContinuar() || this.esConfirmacion()) {
      return;
    }
    this.paso.update((actual) => actual + 1);
  }

  /** Returns to the previous step. Everything typed travels with it. */
  atras(): void {
    if (this.bloqueado()) {
      return;
    }
    this.paso.update((actual) => Math.max(actual - 1, 0));
  }

  /** Submit of the whole form: the same button moves on, or registers. */
  avanzar(): void {
    if (this.esConfirmacion()) {
      this.registrar();
      return;
    }
    this.continuar();
  }

  /**
   * Sends the draft to the API.
   *
   * One request at a time: a second click while the first is in flight would
   * create two employees, so `enviando` is checked here as well as disabling the
   * button.
   *
   * Before leaving, every rule is checked once more. A failure does not travel:
   * the screen shows its message and moves to the card that owns the first one,
   * which is what the `422` would have done with a wasted round trip.
   */
  registrar(): void {
    if (this.enviando()) {
      return;
    }

    const primerError = this.primerError();
    if (primerError !== null) {
      this.mostrarErrores();
      const paso = this.pasoDelCampo(primerError);
      if (paso !== null) {
        this.paso.set(paso);
      }
      return;
    }

    this.enviando.set(true);
    this.mensaje.set(null);
    this.erroresServidor.set({});

    this.altaService
      .registrar(this.construirCuerpo())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: (empleado) => this.registrado(empleado),
        error: (error: unknown) => this.manejarError(error),
      });
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
   * Changes the post and drops a category that no longer fits.
   *
   * A `categoria_cct` of another type is a `422`; clearing it makes the user
   * choose again instead of sending a combination the server rejects.
   */
  cambiarPuesto(evento: Event): void {
    this.elegirNumero('puesto_id', evento);

    const actual = this.modelo().categoria_cct_id;
    if (actual !== null && !this.categorias().some((categoria) => categoria.id === actual)) {
      this.guardar('categoria_cct_id', null);
    }
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
   * Message of a field, or `null`.
   *
   * A `422` wins over the local sentence of the same field: the server saw the
   * value that was actually sent, and its message names a rule the client does
   * not know — the institutional domain, for instance.
   */
  errorDe(campo: string): string | null {
    const servidor = this.erroresServidor()[campo];
    if (Array.isArray(servidor) && servidor.length > 0) {
      return servidor.join(' ');
    }
    return this.errores()[campo] ?? null;
  }

  /**
   * `id`s of the notes that describe a field, or `null`.
   *
   * The control points at its message and, when the value was filled by the
   * form, at the note that says where it came from.
   */
  idDeError(campo: string): string | null {
    const ids: string[] = [];
    if (this.derivado(campo)) {
      ids.push(`derivado-${campo}`);
    }
    if (this.errorDe(campo) !== null) {
      ids.push(`error-${campo}`);
    }
    return ids.length === 0 ? null : ids.join(' ');
  }

  /** `true` when the form fills the field instead of the user. */
  private derivado(campo: string): boolean {
    if (campo === CAMPOS_DERIVADOS[0]) {
      return this.fechaDerivada();
    }
    if (campo === CAMPOS_DERIVADOS[1]) {
      return this.sexoDerivado();
    }
    return false;
  }

  /**
   * Technical reason behind the CURP message, for the `title` only.
   *
   * It is never a second visible sentence: the backend answers all five cases
   * with the same one, and the user reads one. A server message has a reason of
   * its own, so the local one is not offered next to it.
   */
  explicacionCurp(): string | null {
    if (this.errorDe('curp') === null || this.erroresServidor()['curp'] !== undefined) {
      return null;
    }
    const motivo = this.motivosCurp()[0];
    return motivo === undefined ? null : EXPLICACION_CURP[motivo];
  }

  /** Number the stepper prints for a stop: the index until the step is done. */
  marcaDe(indice: number): string {
    return indice < this.paso() ? '✓' : String(indice + 1);
  }

  /** `true` once the step is behind the one on screen. */
  completado(indice: number): boolean {
    return indice < this.paso();
  }

  /** Depth of an area in the chart, counted through `padre_id`. */
  private profundidad(area: CatalogoAreas, porId: ReadonlyMap<number, CatalogoAreas>): number {
    const visitadas = new Set<number>([area.id]);
    let nivel = 0;
    let padre = area.padre_id;

    // The `Set` breaks a cycle: a malformed chart must not hang the screen.
    while (padre !== null && !visitadas.has(padre)) {
      visitadas.add(padre);
      nivel += 1;
      padre = porId.get(padre)?.padre_id ?? null;
    }

    return nivel;
  }

  /**
   * Every local failure of the draft, keyed by field, in the order the steps
   * ask for them.
   *
   * One pass instead of one rule per control: several checks compare two fields
   * (`fecha_inicio_puesto` against `fecha_ingreso_gobierno`, the category against
   * the post), so a map built from the whole draft is the only way to keep them
   * coherent. The insertion order is the order of the wizard, which is what lets
   * the submit carry the user to the first thing that has to be fixed.
   */
  private evaluar(datos: BorradorAlta): Record<string, string> {
    const errores: Record<string, string> = {};
    const poner = (campo: string, mensaje: string | null): void => {
      if (mensaje !== null) {
        errores[campo] = mensaje;
      }
    };

    // --- Step 1: identification -------------------------------------------
    poner('num_empleado', validarNumEmpleado(datos.num_empleado));
    poner('nombre', validarNombre(datos.nombre));
    poner('correo_institucional', validarCorreo(datos.correo_institucional));
    poner('curp', validarCurp(datos.curp).valida ? null : MENSAJE_CURP_INVALIDA);

    // A derived date comes from a CURP that already passed every rule.
    if (!this.derivaFecha(datos.curp)) {
      poner('fecha_nacimiento', validarFecha(datos.fecha_nacimiento, { noFutura: true }));
    }

    // --- Step 2: plaza -----------------------------------------------------
    poner('area_id', datos.area_id === null ? MENSAJE_REQUERIDO_OPCION : null);
    poner('puesto_id', datos.puesto_id === null ? MENSAJE_REQUERIDO_OPCION : null);
    poner('categoria_cct_id', this.mensajeDeCategoria(datos));
    poner('fecha_inicio_puesto', this.mensajeDeInicio(datos));
    poner('fecha_ingreso_gobierno', validarFecha(datos.fecha_ingreso_gobierno, { noFutura: true }));

    // A mando medio post has no personal type nor shift to choose.
    if (!this.esMandoMedioDe(datos)) {
      poner('tipo_personal', datos.tipo_personal.trim() === '' ? MENSAJE_REQUERIDO_OPCION : null);
      poner('tipo_jornada', datos.tipo_jornada.trim() === '' ? MENSAJE_REQUERIDO_OPCION : null);
    }

    // --- Step 3: studies and experience ------------------------------------
    poner('escuela_procedencia', validarLargo(datos.escuela_procedencia, 100));
    poner('generacion', validarGeneracion(datos.generacion));
    poner('exp_publico_anios', validarAniosExperiencia(datos.exp_publico_anios));
    poner('exp_privado_anios', validarAniosExperiencia(datos.exp_privado_anios));
    poner('trabaja_otro_donde', this.mensajeDeOtroDonde(datos));
    poner('observaciones', validarLargo(datos.observaciones, 2000));

    return errores;
  }

  /** Message of the category, including whether it fits the chosen post. */
  private mensajeDeCategoria(datos: BorradorAlta): string | null {
    if (datos.categoria_cct_id === null) {
      return MENSAJE_REQUERIDO_OPCION;
    }

    const categorias = this.catalogos()?.categorias_cct ?? [];
    const puesto = this.puestoDe(datos.puesto_id);
    return categoriaCompatible(datos.categoria_cct_id, puesto, categorias)
      ? null
      : MENSAJE_CATEGORIA;
  }

  /** Message of the start of the post: present, real, not future, not early. */
  private mensajeDeInicio(datos: BorradorAlta): string | null {
    const inicio = datos.fecha_inicio_puesto.trim();
    if (inicio === '') {
      return MENSAJE_REQUERIDO_TEXTO;
    }

    return (
      validarFecha(inicio, { noFutura: true }) ??
      validarInicioPuesto(inicio, datos.fecha_ingreso_gobierno)
    );
  }

  /** Message of the "where else" detail: required, and bounded to 255. */
  private mensajeDeOtroDonde(datos: BorradorAlta): string | null {
    if (trabajaOtroDondeRequerido(datos.trabaja_otro_lugar) !== 'requerido') {
      return null;
    }

    const donde = datos.trabaja_otro_donde.trim();
    if (donde === '') {
      return MENSAJE_REQUERIDO_TEXTO;
    }
    return validarLargo(donde, 255);
  }

  /** Rebuilds the visible messages from the draft and the visited controls. */
  private refrescarErrores(): void {
    const visibles: Record<string, string> = {};

    for (const [campo, mensaje] of Object.entries(this.erroresDelBorrador())) {
      if (this.visibleAhora(campo)) {
        visibles[campo] = mensaje;
      }
    }

    this.errores.set(visibles);
  }

  /**
   * Whether a computed message may be on screen yet.
   *
   * A field the user has not left is not scolded, with one exception: a CURP
   * only speaks once it is complete, because a half-typed one fails from the
   * second keystroke and that is not a mistake yet.
   */
  private visibleAhora(campo: string): boolean {
    if (this.tocado()[campo] === true) {
      return true;
    }
    return campo === 'curp' && this.modelo().curp.length >= 18;
  }

  /** `true` when the step owns at least one failing field. */
  private hayErrorEnElPaso(paso: number): boolean {
    return Object.keys(this.erroresDelBorrador()).some(
      (campo) => this.pasoDelCampo(campo) === paso,
    );
  }

  /** First failing field, in the order the wizard asks for the fields. */
  private primerError(): string | null {
    const campos = Object.keys(this.erroresDelBorrador());
    return campos.length === 0 ? null : campos[0];
  }

  /** Makes every failing field speak, after a submit that cannot leave. */
  private mostrarErrores(): void {
    const campos = Object.keys(this.erroresDelBorrador());

    this.tocado.update((actual) => {
      const siguiente = { ...actual };
      for (const campo of campos) {
        siguiente[campo] = true;
      }
      return siguiente;
    });
    this.refrescarErrores();
  }

  /** Copies the birth date and the sex a complete CURP already carries. */
  private derivarDeCurp(destino: BorradorAlta, curp: string): void {
    if (!validarCurp(curp).valida) {
      return;
    }

    const fecha = curpFechaNacimiento(curp);
    if (fecha !== null) {
      destino.fecha_nacimiento = fecha;
    }

    // `X` means "not specified": the field keeps whatever the user typed.
    const sexo = curpSexo(curp);
    if (sexo !== null) {
      destino.sexo = sexo;
    }
  }

  /** `true` when the CURP can fill the birth date of the draft. */
  private derivaFecha(curp: string): boolean {
    return validarCurp(curp).valida && curpFechaNacimiento(curp) !== null;
  }

  /** Post of the draft, or `null` while none is chosen. */
  private puestoDe(id: number | null): PuestoCatalogo | null {
    if (id === null) {
      return null;
    }
    return (this.catalogos()?.puestos ?? []).find((puesto) => puesto.id === id) ?? null;
  }

  /** `true` when the post of the draft is `mando_medio`, read from the catalogs. */
  private esMandoMedioDe(datos: BorradorAlta): boolean {
    return this.puestoDe(datos.puesto_id)?.tipo_puesto === 'mando_medio';
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

  /** Step that holds a field, or `null` when no card shows it. */
  private pasoDelCampo(campo: string): number | null {
    const paso: number | undefined = PASO_DE_CAMPO[campo];
    return paso ?? null;
  }

  /** Body of the request: only the fields the user filled, plus the required ones. */
  private construirCuerpo(): AltaEmpleadoRequest {
    const datos = this.modelo();

    const cuerpo: AltaEmpleadoRequest = {
      num_empleado: datos.num_empleado.trim(),
      nombre: datos.nombre.trim(),
      correo_institucional: datos.correo_institucional.trim(),
      // The gate of step 2 keeps these three from being empty; if a bug ever
      // let them through, the `null` would leave and the API would answer the
      // `422` that names the field, which is better than a guess made here.
      area_id: datos.area_id as number,
      puesto_id: datos.puesto_id as number,
      categoria_cct_id: datos.categoria_cct_id as number,
      fecha_inicio_puesto: datos.fecha_inicio_puesto,
    };

    // A mando medio post sends the two values the server fixes for it; any other
    // post sends what the user chose.
    const personal = this.tipoPersonal();
    if (personal !== '') {
      cuerpo.tipo_personal = personal;
    }
    const jornada = this.tipoJornada();
    if (jornada !== '') {
      cuerpo.tipo_jornada = jornada;
    }

    this.agregarTexto(cuerpo, 'curp', datos.curp);
    this.agregarTexto(cuerpo, 'fecha_nacimiento', datos.fecha_nacimiento);
    this.agregarTexto(cuerpo, 'fecha_ingreso_gobierno', datos.fecha_ingreso_gobierno);
    this.agregarTexto(cuerpo, 'escuela_procedencia', datos.escuela_procedencia);
    this.agregarTexto(cuerpo, 'generacion', datos.generacion);
    this.agregarTexto(cuerpo, 'municipio', datos.municipio);
    this.agregarTexto(cuerpo, 'sexo', datos.sexo);
    this.agregarTexto(cuerpo, 'observaciones', datos.observaciones);

    this.agregarNumero(cuerpo, 'exp_publico_anios', datos.exp_publico_anios);
    this.agregarNumero(cuerpo, 'exp_privado_anios', datos.exp_privado_anios);
    this.agregarNumero(cuerpo, 'nivel_estudios_id', datos.nivel_estudios_id);
    this.agregarNumero(cuerpo, 'estado_civil_id', datos.estado_civil_id);

    const otroLugar = datos.trabaja_otro_lugar.trim();
    if (otroLugar !== '') {
      cuerpo.trabaja_otro_lugar = otroLugar;
    }
    // Prohibited when the answer is `No`: the field is not sent at all, not sent
    // empty.
    const otroDonde = datos.trabaja_otro_donde.trim();
    if (otroLugar !== OTRO_LUGAR_NO && otroDonde !== '') {
      cuerpo.trabaja_otro_donde = otroDonde;
    }

    return cuerpo;
  }

  /** Adds an optional text only when it carries something. */
  private agregarTexto(cuerpo: AltaEmpleadoRequest, campo: CampoTexto, valor: string): void {
    const limpio = valor.trim();
    if (limpio !== '') {
      cuerpo[campo] = limpio;
    }
  }

  /** Adds an optional number. `0` is a real answer, so only `null` is skipped. */
  private agregarNumero(cuerpo: AltaEmpleadoRequest, campo: CampoNumero, valor: number | null): void {
    if (valor !== null) {
      cuerpo[campo] = valor;
    }
  }

  /** Toast with the created number, then the roster the new employee joined. */
  private registrado(empleado: EmpleadoRegistrado): void {
    this.toast.show({
      type: 'success',
      title: 'Empleado registrado.',
      message: `Número de empleado ${empleado.num_empleado}.`,
    });

    void this.router.navigate(['/empleados/activos']);
  }

  /** Maps a failure of the registration to the messages the user reads. */
  private manejarError(error: unknown): void {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const cuerpo = error instanceof HttpErrorResponse ? (error.error as ErrorValidacion | null) : null;
    const mensaje = typeof cuerpo?.message === 'string' ? cuerpo.message : null;

    if (status === 422) {
      const errores = cuerpo?.errors;
      if (errores !== null && typeof errores === 'object') {
        this.erroresServidor.set(errores);
        this.mensaje.set(mensaje);
        this.irAlPrimerError(errores);
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
   * Moves the wizard to the card that holds the first field that failed.
   *
   * The backend writes the fields in the order it validated them, so the first
   * key with a card is the first thing the user has to fix.
   */
  private irAlPrimerError(errores: Record<string, string[]>): void {
    for (const campo of Object.keys(errores)) {
      const paso = this.pasoDelCampo(campo);
      if (paso !== null) {
        this.paso.set(paso);
        return;
      }
    }
  }

  /** Sentence of a catalog failure, per status. */
  private mensajeDeCatalogos(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;

    switch (status) {
      case 401:
        return MENSAJE_SESION;
      case 403:
        return MENSAJE_PERMISO;
      case 503:
        return MENSAJE_SERVICIO;
      default:
        return MENSAJE_CATALOGOS;
    }
  }

  /** Text of the summary: the value, or the placeholder when it is absent. */
  private texto(valor: string): string {
    const limpio = valor.trim();
    return limpio === '' ? SIN_DATO : limpio;
  }

  /** Figure of the summary. `0` is a real answer, so it is kept. */
  private numero(valor: number | null): string {
    return valor === null ? SIN_DATO : String(valor);
  }

  /** Date of the summary, or the placeholder. */
  private fecha(valor: string): string {
    const limpio = valor.trim();
    if (limpio === '') {
      return SIN_DATO;
    }

    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpio);
    if (partes === null) {
      // An unexpected shape is shown verbatim: inventing a date would be worse.
      return limpio;
    }

    const fecha = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
    return FORMATO_FECHA.format(fecha);
  }

  /** Spanish label of a catalog entry, or the placeholder. */
  private descripcionDe(
    lista: readonly { id: number; descripcion: string }[],
    id: number | null,
  ): string {
    if (id === null) {
      return SIN_DATO;
    }
    return lista.find((entrada) => entrada.id === id)?.descripcion ?? SIN_DATO;
  }

  /** Name of an area, or the placeholder. */
  private nombreDeArea(id: number | null): string {
    if (id === null) {
      return SIN_DATO;
    }
    return this.catalogos()?.areas.find((area) => area.id === id)?.nombre ?? SIN_DATO;
  }

  /** Key of a CCT category, or the placeholder. */
  private claveDeCategoria(id: number | null): string {
    if (id === null) {
      return SIN_DATO;
    }
    return this.catalogos()?.categorias_cct.find((categoria) => categoria.id === id)?.clave ?? SIN_DATO;
  }
}
