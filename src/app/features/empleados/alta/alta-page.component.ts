import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, map, tap } from 'rxjs';
import {
  EditarEmpleadoService,
  CAMPOS_EDITABLES,
  EdicionEmpleado,
} from '../../../core/empleados/editar.service';
import { FichaEmpleado } from '../../../core/empleados/ficha.models';
import { HistorialCampo } from './historial-campo.component';
import { flattenAreaTree } from '../../../core/catalogos/area-tree';
import {
  AltaEmpleadoRequest,
  CategoriaCctCatalogo,
  EmpleadoRegistrado,
  EntidadCatalogo,
  ErrorValidacion,
  FormularioCatalogos,
  PuestoCatalogo,
} from '../../../core/empleados/alta.models';
import { AltaService } from '../../../core/empleados/alta.service';
import {
  BORRADOR_ALTA,
  BorradorAlta,
  CampoSelectNumero,
  CampoSelectTexto,
  ContextoBorrador,
  OTRO_LUGAR_NO,
  PERSONAL_MANDO_MEDIO,
  SECCION_DE_CAMPO,
  categoriaDePuesto,
  claveDeEntidad,
  construirCuerpoAlta,
  derivarBorrador,
  esMandoMedioDe,
  evaluarBorrador,
  tipoJornadaDe,
  tipoPersonalDe,
} from '../../../core/empleados/borrador-alta';
import { ENTIDADES_FEDERATIVAS } from '../../../core/empleados/entidades-federativas';
import {
  DOMINIO_INSTITUCIONAL,
  EXPLICACION_CURP,
  LARGO_MAXIMO_LOCAL,
  MotivoCurp,
  correoConDominio,
  curpClaveEntidad,
  hoyLocal,
  normalizarMayusculas,
  normalizarNombre,
  parteLocalCorreo,
  validarCurp,
} from '../../../core/empleados/validacion';
import { AlertBanner } from '../../../shared/ui/alert-banner/alert-banner.component';
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
const MENSAJE_PERMISO = 'No tienes permisos para dar de alta empleados.';
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

/** Read-only value of the category while no post is chosen. */
const CATEGORIA_SIN_PUESTO = 'Se asigna al elegir el puesto.';

/** Read-only value of the category when the catalogue does not carry it. */
const CATEGORIA_SIN_ASIGNAR = 'Sin categoría asignada.';

/**
 * The fields the form derives instead of asking.
 *
 * `fecha_nacimiento` and `sexo` come from the CURP; `entidad_nacimiento` comes
 * from characters 12 and 13 of the same value. All three are locked from the
 * first render, with or without a document already typed: the user only writes
 * the CURP, and the backend resolves the three values from it, so there is no
 * state in which one of them is the user's to fill.
 *
 * `core/empleados/borrador-alta.ts` lists which field the *rules* derive; this set
 * is the presentation counterpart: the fields whose note and `aria-describedby`
 * the template emits, and the reason none of them is ever scolded for being empty.
 */
const CAMPOS_DERIVADOS: ReadonlySet<string> = new Set([
  'fecha_nacimiento',
  'sexo',
  'entidad_nacimiento',
]);

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

/**
 * `clave · descripcion` of a category, the way every screen prints it.
 *
 * The description is nullable in the catalogue, so a row without one falls back
 * to the key instead of printing `null`.
 */
function textoDeCategoria(categoria: CategoriaCctCatalogo): string {
  return categoria.descripcion === null
    ? categoria.clave
    : `${categoria.clave} · ${categoria.descripcion}`;
}

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
 * A `mando_medio_superior` post fixes `tipo_personal` and `tipo_jornada` on the
 * server, so the two controls are hidden and those two values travel in the body.
 * The category is not a choice either: it is read from the post and only shown,
 * because `POST /api/empleados` prohibits `categoria_cct_id` and derives it from
 * the `puesto_id` it receives.
 */
@Component({
  selector: 'app-alta-page',
  imports: [AlertBanner, Button, FormsModule, HistorialCampo],
  templateUrl: './alta-page.component.html',
  styleUrl: './alta-page.component.scss',
})
export class AltaPage {
  private readonly altaService = inject(AltaService);
  private readonly editarService = inject(EditarEmpleadoService);
  private readonly route = inject(ActivatedRoute, { optional: true });
  readonly empleadoId = Number(this.route?.snapshot.paramMap.get('id')) || null;
  readonly editando = this.empleadoId !== null;
  readonly registroActual = signal<FichaEmpleado | null>(null);

  /**
   * Counter bumped after a successful save.
   *
   * The history panel only reloads on change, so it reads the value it did not
   * cause: without the bump, an open panel would keep showing the levels of the
   * record as it was before the user edited it.
   */
  readonly historialRevision = signal(0);
  soloLectura(campo: string): boolean {
    return this.editando && !(CAMPOS_EDITABLES as readonly string[]).includes(campo);
  }
  etiquetaProtegida(campo: string): string {
    const f = this.registroActual();
    if (!f) return 'Sin dato';
    const etiquetas: Record<string, string | null> = {
      area_id: f.plaza.area,
      puesto_id: f.plaza.puesto,
      sexo: f.identificacion.sexo,
      tipo_personal: f.plaza.tipo_personal,
      tipo_jornada: f.plaza.tipo_jornada,
    };
    return etiquetas[campo] ?? 'Sin dato';
  }
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly limpiarAlDestruir = this.destroyRef.onDestroy(() => {
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
  });

  /** Placeholder count for the loading skeleton grid. */
  protected readonly skeletons = Array.from({ length: 6 }, (_, index) => index);

  /** Steps of the stepper, in order. */
  readonly pasos = PASOS;

  /** Index of the step on screen. */
  readonly paso = signal(0);

  /** Draft of the request, as typed. Nothing here is trimmed until it is sent. */
  readonly modelo = signal<BorradorAlta>({ ...BORRADOR_ALTA });

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
   * post against the entry to the government) has no single owner, so one pass
   * over the whole draft is the only way to keep every sentence true at the same
   * time.
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
   * The catalogue slices the draft rules read.
   *
   * Built from the whole payload, not from the computeds the template binds: the
   * rules resolve `puesto_id` against every post of the catalogue, because a post
   * the current area does not offer still has — or lacks — a category, and a
   * filtered list would turn that answer into "unknown post" and silence the
   * message that names it. `entidades` is the merged list the entity of birth is
   * validated against.
   */
  private readonly contexto = computed<ContextoBorrador>(() => ({
    puestos: this.catalogos()?.puestos ?? [],
    categorias: this.catalogos()?.categorias_cct ?? [],
    entidades: this.entidades(),
  }));

  /**
   * Fields this route protects, and whose local rules therefore never speak.
   *
   * In edition the allowlist decides what may be written; a legacy value outside
   * it cannot be fixed on this screen, so a sentence about it would point at a
   * control that does not exist and would block a save it has nothing to do with.
   * In the alta route the list is empty: every field is the user's.
   */
  private readonly camposProtegidos = computed<readonly string[]>(() =>
    this.editando
      ? Object.keys(BORRADOR_ALTA).filter(
          (campo) => !(CAMPOS_EDITABLES as readonly string[]).includes(campo),
        )
      : [],
  );

  /**
   * Every local failure of the draft, keyed by field.
   *
   * Also the gate of the steps and of the submit: a field that fails here would
   * come back as a `422`, so the screen refuses to ask.
   */
  private readonly erroresDelBorrador = computed<Record<string, string>>(() =>
    evaluarBorrador(this.modelo(), this.contexto(), {
      camposProtegidos: this.camposProtegidos(),
    }),
  );

  /**
   * Domain the form appends to what the user types, with its `@`.
   *
   * The field shows it as a suffix and the body carries it as part of the value,
   * so both read one constant instead of two copies of the same domain.
   */
  readonly sufijoCorreo = `@${DOMINIO_INSTITUCIONAL}`;

  /** Room left for the local part, once the domain and its `@` are discounted. */
  readonly largoLocalCorreo = LARGO_MAXIMO_LOCAL;

  /**
   * What the institutional address field shows: everything before the `@`.
   *
   * The draft keeps the complete address, because `validarCorreo`, the summary and
   * the payload all read it whole, so the local part is derived on every render
   * instead of being stored a second time and kept in sync by hand.
   */
  readonly correoLocal = computed(() => parteLocalCorreo(this.modelo().correo_institucional));

  /** Motivo behind the local CURP message, for the `title` of the note. */
  private readonly motivosCurp = computed<readonly MotivoCurp[]>(
    () => validarCurp(this.modelo().curp).motivos,
  );

  /** `true` on the summary: the primary button submits instead of moving on. */
  readonly esConfirmacion = computed(() => this.paso() === PASO_CONFIRMACION);

  /** `true` while something is happening that must lock both navigation buttons. */
  readonly bloqueado = computed(() => this.enviando() || this.cargando());

  /**
   * Areas as a forest, flattened with the indent of each node.
   *
   * The walk itself lives in `core/catalogos/area-tree.ts`: the catalogs screen
   * needs the same depth, and two copies of a hierarchy would drift apart. Here
   * only the presentation differs — a `<select>` shows depth as non-breaking
   * spaces, so it can be read without any stylesheet.
   */
  readonly areas = computed<readonly AreaOpcion[]>(() =>
    flattenAreaTree(this.catalogos()?.areas ?? []).map(({ area, depth }) => ({
      id: area.id,
      nombre: area.nombre,
      asignable: area.asignable,
      sangria: SANGRIA.repeat(depth),
    })),
  );

  /** Area name by id, to label the post selector. */
  private readonly areaPorId = computed<ReadonlyMap<number, string>>(
    () => new Map((this.catalogos()?.areas ?? []).map((area) => [area.id, area.nombre])),
  );

  /**
   * Label of a post in the selector.
   *
   * Up to 36 posts share a name ("Profesor de Asignatura"), so without the area
   * the operator chooses blind. A post is offered by every area of its pivot, and
   * one with an empty pivot has no area to name: it is labelled as such, because
   * the server rejects it anywhere.
   */
  etiquetaPuesto(puesto: PuestoCatalogo): string {
    if (puesto.area_ids.length === 0) {
      return `${puesto.nombre} · sin área asignada`;
    }

    const areas = puesto.area_ids
      .map((id) => this.areaPorId().get(id))
      .filter((nombre): nombre is string => nombre !== undefined);

    return areas.length === 0 ? puesto.nombre : `${puesto.nombre} · ${areas.join(', ')}`;
  }

  /**
   * Federative entities of birth, as the screen names them.
   *
   * The frozen RENAPO table is the base because the live service does not send
   * `entidades` yet: reading the payload alone left the list empty, every lookup
   * missed and the field stayed blank while the CURP already carried the key. An
   * entry the server does send overrides the local one of the same `clave`, so a
   * payload that arrives late — or that lists only part of the catalog — still
   * names every key instead of blanking the ones it omits.
   *
   * `ENTIDADES_FEDERATIVAS` is deleted the day `GET /api/empleados/formulario`
   * answers with the whole catalog, and this computed goes back to reading the
   * payload alone.
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
   * Readable name of the entity derived from the CURP, or `''` when there is none.
   *
   * The draft keeps the key, because that is what travels; the name is resolved
   * here on every read, so a catalogue that arrives late still labels the field.
   */
  readonly entidadNacimientoNombre = computed<string>(() => {
    const clave = this.modelo().entidad_nacimiento;
    return clave === '' ? '' : this.nombreDeEntidad(clave);
  });

  /**
   * Posts offered by the selector.
   *
   * A post belongs to the areas of its `area_puesto` pivot, and the server
   * answers `422` when the pair does not exist, so the list follows the chosen
   * area. Before an area is chosen there is nothing to offer — and a post with an
   * empty pivot is offered nowhere, because it belongs to no area at all.
   */
  readonly puestos = computed<readonly PuestoCatalogo[]>(() => {
    const areaId = this.modelo().area_id;

    if (areaId === null) {
      return [];
    }

    return (this.catalogos()?.puestos ?? []).filter((puesto) => puesto.area_ids.includes(areaId));
  });

  /** Post chosen on screen, or `null`. */
  readonly puestoElegido = computed<PuestoCatalogo | null>(() => {
    const id = this.modelo().puesto_id;
    if (id === null) {
      return null;
    }
    return this.puestos().find((puesto) => puesto.id === id) ?? null;
  });

  /**
   * Category derived from the chosen post, or `null`.
   *
   * The category is not a user choice: `puestos.categoria_cct_id` points at it
   * and the server derives it from `puesto_id`, so the screen only reads it.
   */
  readonly categoriaElegida = computed<CategoriaCctCatalogo | null>(() =>
    categoriaDePuesto(this.puestoElegido(), this.contexto()),
  );

  /** Read-only text of that category: what the server will store for the post. */
  readonly categoriaVisible = computed<string>(() => {
    if (this.editando) {
      const plaza = this.registroActual()?.plaza;
      const categoria = this.catalogos()?.categorias_cct.find(
        (c) => c.id === plaza?.categoria_cct_id,
      );
      return categoria ? textoDeCategoria(categoria) : (plaza?.categoria_cct_clave ?? SIN_DATO);
    }
    if (this.puestoElegido() === null) {
      return CATEGORIA_SIN_PUESTO;
    }

    const categoria = this.categoriaElegida();
    return categoria === null ? CATEGORIA_SIN_ASIGNAR : textoDeCategoria(categoria);
  });

  /**
   * `true` when the category derived from the post is `mando_medio_superior`.
   *
   * It decides three things: the two fixed values that travel in the body, the
   * two controls that are hidden, and whether the step 2 gate asks for them.
   * The rule itself lives in `core/empleados/borrador-alta.ts`: the evaluator
   * reads it from there, and a second copy here could hide the two controls
   * while the gate still asked for them.
   */
  readonly esMandoMedio = computed(() => esMandoMedioDe(this.modelo(), this.contexto()));

  /** Schooling levels. */
  readonly niveles = computed(() => this.catalogos()?.niveles_estudios ?? []);

  /**
   * Options of `tipo_personal`.
   *
   * The catalogue also carries `No Aplica`, which is never a choice: it is the
   * value the server fixes for a `mando_medio_superior` category, and that
   * control is hidden there. Offering it to an administrative or teaching
   * category would let the user send a pair the server rejects.
   */
  readonly tiposPersonal = computed(() =>
    (this.catalogos()?.tipos_personal ?? []).filter((tipo) => tipo !== PERSONAL_MANDO_MEDIO),
  );

  /** Marital statuses. */
  readonly estadosCiviles = computed(() => this.catalogos()?.estados_civiles ?? []);

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
   * A `mando_medio_superior` category hides the control and sends the only value
   * the server accepts for it; administrative and teaching categories send what
   * the user chose. In edition nothing is re-derived: the record already holds
   * the value and the allowlist decides what may be written. Both rules live in
   * `core/empleados/borrador-alta.ts`, where the drawer reads them too.
   */
  readonly tipoPersonal = computed(() =>
    this.editando ? this.modelo().tipo_personal : tipoPersonalDe(this.modelo(), this.contexto()),
  );

  /** `tipo_jornada` that will travel in the body, for the same reason. */
  readonly tipoJornada = computed(() =>
    this.editando ? this.modelo().tipo_jornada : tipoJornadaDe(this.modelo(), this.contexto()),
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
          { etiqueta: 'Entidad de nacimiento', valor: this.texto(this.entidadNacimientoNombre()) },
          { etiqueta: 'Correo institucional', valor: this.texto(datos.correo_institucional) },
        ],
      },
      {
        titulo: PASOS[1],
        filas: [
          { etiqueta: 'Área', valor: this.nombreDeArea(datos.area_id) },
          {
            etiqueta: 'Puesto',
            valor: this.editando
              ? (this.registroActual()?.plaza.puesto ?? SIN_DATO)
              : (this.puestoElegido()?.nombre ?? SIN_DATO),
          },
          { etiqueta: 'Categoría CCT', valor: this.categoriaDelResumen() },
          { etiqueta: 'Tipo de personal', valor: this.texto(this.tipoPersonal()) },
          { etiqueta: 'Tipo de jornada', valor: this.texto(this.tipoJornada()) },
          {
            etiqueta: 'Fecha de inicio en el puesto',
            valor: this.fecha(datos.fecha_inicio_puesto),
          },
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

  private precargar(f: FichaEmpleado): void {
    this.registroActual.set(f);
    this.modelo.set({
      ...BORRADOR_ALTA,
      ...f.identificacion,
      correo_institucional: f.contacto.correo_institucional ?? '',
      area_id: f.plaza.area_id,
      puesto_id: f.plaza.puesto_id,
      tipo_personal: f.plaza.tipo_personal ?? '',
      tipo_jornada: f.plaza.tipo_jornada ?? '',
      fecha_inicio_puesto: f.plaza.fecha_inicio_puesto ?? '',
      fecha_ingreso_gobierno: f.plaza.fecha_ingreso_gobierno ?? '',
      curp: f.identificacion.curp ?? '',
      fecha_nacimiento: f.identificacion.fecha_nacimiento ?? '',
      sexo: f.identificacion.sexo ?? '',
      // The ficha answers the readable name; the draft keeps the key, because
      // that is what travels and what the backend compares against the CURP. It
      // is derived from the CURP for the same reason the alta form derives it:
      // the document is the only authority on which entity the person is from.
      entidad_nacimiento: claveDeEntidad(
        curpClaveEntidad(f.identificacion.curp ?? ''),
        this.entidades(),
      ),
      nivel_estudios_id: f.estudios.nivel_estudios_id,
      escuela_procedencia: f.estudios.escuela_procedencia ?? '',
      generacion: f.estudios.generacion ?? '',
      exp_publico_anios: f.experiencia.exp_publico_anios,
      exp_privado_anios: f.experiencia.exp_privado_anios,
      trabaja_otro_lugar: f.experiencia.trabaja_otro_lugar ?? '',
      trabaja_otro_donde: f.experiencia.trabaja_otro_donde ?? '',
      observaciones: f.gestion_interna.observaciones ?? '',
    });
  }

  private cuerpoEdicion(): EdicionEmpleado {
    const datos = this.modelo();
    return Object.fromEntries(
      CAMPOS_EDITABLES.map((k) => {
        const v = datos[k];
        return [k, typeof v === 'string' ? v.trim() || null : v];
      }),
    ) as EdicionEmpleado;
  }

  /** Reads (or re-reads) the catalogs. Also the retry of the failure block. */
  cargarCatalogos(): void {
    this.cargando.set(true);
    this.errorCatalogos.set(null);

    const carga = this.editando
      ? forkJoin({
          catalogos: this.altaService.cargarCatalogos(),
          ficha: this.editarService.consultar(this.empleadoId!),
        }).pipe(
          map(({ catalogos, ficha }) => {
            this.precargar(ficha.data);
            return catalogos;
          }),
        )
      : this.altaService.cargarCatalogos();
    carga
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
    if (this.soloLectura(campo)) return;
    const siguiente = { ...this.modelo(), [campo]: valor } as BorradorAlta;

    // A complete CURP carries the birth date, the sex and the entity: the backend
    // resolves all three from it, so the screen fills them instead of asking.
    this.modelo.set(
      campo === 'curp' && typeof valor === 'string'
        ? derivarBorrador(siguiente, valor, this.contexto())
        : siguiente,
    );
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
   * Writes the institutional address from the local part the user types.
   *
   * The control asks for what goes before the `@`; the domain is appended here, so
   * the field stays short while the draft — and therefore the body — carries a
   * complete address. Same caret guard as `guardarNormalizado`: nothing is written
   * when the resulting address is the one already stored, because handing Angular
   * a new value repaints the control and would send the caret to the end of the
   * line in the middle of a word.
   */
  guardarCorreo(valor: string): void {
    const completo = correoConDominio(valor);
    if (completo === this.modelo().correo_institucional) {
      return;
    }
    this.guardar('correo_institucional', completo);
  }

  /**
   * Rewrites the name the way it is stored, once the user leaves the field.
   *
   * Collapsing the blanks on every keystroke would fight the caret: a user who
   * types a second space would see it vanish under the cursor. On `blur` there is
   * no caret to protect, and the cleaned value is what the user reads before
   * moving on, so the correction is visible instead of silent.
   */
  salirDeNombre(): void {
    const limpio = normalizarNombre(this.modelo().nombre);
    if (limpio !== this.modelo().nombre) {
      this.guardar('nombre', limpio);
    }
    this.tocar('nombre');
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
    this.programarFoco(null);
  }

  /** Returns to the previous step. Everything typed travels with it. */
  atras(): void {
    if (this.bloqueado()) {
      return;
    }
    this.paso.update((actual) => Math.max(actual - 1, 0));
    this.programarFoco(null);
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
    if (this.enviando() || this.cargando() || this.errorCatalogos()) {
      return;
    }

    const primerError = this.primerError();
    if (primerError !== null) {
      this.mostrarErrores();
      const paso = this.pasoDelCampo(primerError);
      if (paso !== null) {
        this.paso.set(paso);
      }
      this.programarFoco(`#${primerError}`);
      return;
    }

    this.enviando.set(true);
    this.mensaje.set(null);
    this.erroresServidor.set({});

    const peticion = this.editando
      ? this.editarService.actualizar(this.empleadoId!, this.cuerpoEdicion()).pipe(
          tap((r) => {
            this.precargar(r.data);
            this.historialRevision.update((n) => n + 1);
          }),
          map((r) => ({
            id: r.data.id,
            num_empleado: r.data.identificacion.num_empleado,
            nombre: r.data.identificacion.nombre,
          })),
        )
      : this.altaService.registrar(this.construirCuerpo());
    peticion
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
   * Changes the area and drops a post that does not belong to it.
   *
   * The post selector follows the area, so a post of the previous one would sit
   * in the model while the control no longer offers it — and the server would
   * answer `422`. Its category is derived from the post, so it leaves with it.
   */
  cambiarArea(evento: Event): void {
    this.elegirNumero('area_id', evento);

    const actual = this.modelo().puesto_id;
    if (actual !== null && !this.puestos().some((puesto) => puesto.id === actual)) {
      this.guardar('puesto_id', null);
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
   * The control points at its message and, when the form fills the value, at the
   * note that says where it came from. That note is no longer conditional — every
   * derived field is locked from the first render, with or without a CURP — so
   * the reference is always emitted together with the node it points at.
   */
  idDeError(campo: string): string | null {
    const ids: string[] = [];
    if (CAMPOS_DERIVADOS.has(campo)) {
      ids.push(`derivado-${campo}`);
    }
    if (this.errorDe(campo) !== null) {
      ids.push(`error-${campo}`);
    }
    return ids.length === 0 ? null : ids.join(' ');
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

  /** Section that holds a field, or `null` when no card shows it. */
  private pasoDelCampo(campo: string): number | null {
    const paso: number | undefined = SECCION_DE_CAMPO[campo];
    return paso ?? null;
  }

  /**
   * Body of the request, with the two values the server derives from the post.
   *
   * `tipo_personal` and `tipo_jornada` are resolved here because they depend on
   * the route: the alta fills them from the category of the post, and the edition
   * sends what the record already holds. The draft itself keeps what the user —
   * or the record — put there.
   */
  private construirCuerpo(): AltaEmpleadoRequest {
    return construirCuerpoAlta(this.modelo(), this.contexto(), {
      tipoPersonal: this.tipoPersonal(),
      tipoJornada: this.tipoJornada(),
    });
  }

  /** Toast with the created number, then the roster the new employee joined. */
  private registrado(empleado: EmpleadoRegistrado): void {
    this.toast.show({
      type: 'success',
      title: this.editando ? 'Empleado actualizado correctamente.' : 'Empleado registrado.',
      message: `Número de empleado ${empleado.num_empleado}.`,
    });

    void this.router.navigate(['/empleados/activos']);
  }

  /** Maps a failure of the registration to the messages the user reads. */
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
        this.programarFoco(`#${campo}`);
        return;
      }
    }
  }

  /**
   * Moves focus and scrolls into view after Angular renders the new step or
   * error card, keeping `DestroyRef` safe against unmounts.
   */
  private programarFoco(selector: string | null): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.focusTimer !== null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }

    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      const hostEl = this.elementRef.nativeElement as HTMLElement;
      const target =
        (selector !== null ? hostEl.querySelector<HTMLElement>(selector) : null) ??
        this.stepHeading()?.nativeElement ??
        null;

      if (target === null) {
        return;
      }

      if (typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
      }

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const scrollTarget =
        selector !== null ? target : (target.closest<HTMLElement>('.card') ?? target);
      if (typeof scrollTarget.scrollIntoView === 'function') {
        scrollTarget.scrollIntoView({
          block: selector !== null ? 'nearest' : 'start',
          behavior: reduced ? 'auto' : 'smooth',
        });
      }
    }, 0);
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
    if (this.editando) return this.registroActual()?.plaza.area ?? SIN_DATO;
    if (id === null) {
      return SIN_DATO;
    }
    return this.catalogos()?.areas.find((area) => area.id === id)?.nombre ?? SIN_DATO;
  }

  /** Name of an entity of the merged list, or `''` when it does not carry the key. */
  private nombreDeEntidad(clave: string): string {
    return this.entidades().find((entidad) => entidad.clave === clave)?.nombre ?? '';
  }

  /** Category of the summary, derived from the chosen post, or the placeholder. */
  private categoriaDelResumen(): string {
    if (this.editando) return this.registroActual()?.plaza.categoria_cct_clave ?? SIN_DATO;
    const categoria = this.categoriaElegida();
    return categoria === null ? SIN_DATO : textoDeCategoria(categoria);
  }
}
