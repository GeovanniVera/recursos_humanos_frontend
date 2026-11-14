import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
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
  construirCuerpoAlta,
  derivadosDe,
  derivarBorrador,
  esMandoMedioDe,
  evaluarBorrador,
  tipoJornadaDe,
  tipoPersonalDe,
} from '../../../core/empleados/borrador-alta';
import { flattenAreaTree } from '../../../core/catalogos/area-tree';
import { ENTIDADES_FEDERATIVAS } from '../../../core/empleados/entidades-federativas';
import {
  DOMINIO_INSTITUCIONAL,
  EXPLICACION_CURP,
  LARGO_MAXIMO_LOCAL,
  MotivoCurp,
  correoConDominio,
  hoyLocal,
  normalizarMayusculas,
  normalizarNombre,
  parteLocalCorreo,
  validarCurp,
} from '../../../core/empleados/validacion';
import { Drawer } from '../../../shared/ui/drawer/drawer.component';
import { AltaExpediente, TabExpediente } from './alta-expediente/alta-expediente.component';
import { AltaRevision, GrupoResumen } from './alta-revision/alta-revision.component';

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
 * the CURP, and the backend resolves the three values from it.
 *
 * This set is the presentation counterpart of the derivation the module owns:
 * it decides which fields emit a note and point at it with `aria-describedby`.
 */
const CAMPOS_DERIVADOS: ReadonlySet<string> = new Set([
  'fecha_nacimiento',
  'sexo',
  'entidad_nacimiento',
]);

/**
 * How long the draft outlives the close, in milliseconds.
 *
 * The drawer takes `--motion-fast` to slide out, so clearing the fields at once
 * would empty the sheet while it is still on screen. Same bookkeeping as the
 * record panel, and the timer is cancelled if the folder is opened again.
 */
const CIERRE_MS = 300;

/**
 * The four sheets of the folder. The index of each one is the section
 * `SECCION_DE_CAMPO` names, so a field and its tab cannot disagree.
 */
type TabId = 'identificacion' | 'plaza' | 'formacion' | 'revision';

interface Tab extends TabExpediente {
  readonly id: TabId;
}

const TABS: readonly Tab[] = [
  { id: 'identificacion', etiqueta: 'Identificación' },
  { id: 'plaza', etiqueta: 'Plaza' },
  { id: 'formacion', etiqueta: 'Formación' },
  { id: 'revision', etiqueta: 'Revisión' },
];

/** One option of the area `<select>`, already flattened and indented. */
interface AreaOpcion {
  readonly id: number;
  readonly nombre: string;
  readonly asignable: boolean;
  /** Non-breaking spaces that express the depth of the node in the chart. */
  readonly sangria: string;
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
 * Date formatter of the recap.
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
 * Registration of a new employee, as a folder over the desk of the roster.
 *
 * The same four sections the wizard had, now four tabs of an expediente: the
 * language of the record drawer, because a new employee is a file being written
 * and not a separate screen. Nothing of the shape of the request changed — the
 * fields, their order, their ids and their copy are the ones the wizard had, and
 * every rule behind them lives in `core/empleados/borrador-alta.ts`, so the two
 * surfaces cannot drift apart.
 *
 * Navigation is free on purpose. A wizard that blocks the step it is on hides
 * the two things the operator needs: how much is left, and where. Each tab
 * carries the count of its invalid fields, the submit always answers, and the
 * drawer moves to the first field that has to be fixed instead of refusing to
 * go on.
 *
 * A `mando_medio_superior` post fixes `tipo_personal` and `tipo_jornada` on the
 * server, so the two controls are hidden and those two values travel in the
 * body. The category is not a choice either: it is read from the post and only
 * shown, because `POST /api/empleados` prohibits `categoria_cct_id` and derives
 * it from the `puesto_id` it receives.
 */
@Component({
  selector: 'app-alta-drawer',
  imports: [AltaExpediente, AltaRevision, Drawer, FormsModule],
  templateUrl: './alta-drawer.component.html',
  styleUrl: './alta-drawer.component.scss',
})
export class AltaDrawer {
  private readonly altaService = inject(AltaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);

  /** Whether the folder is open. Two-way bound to the page that hosts it. */
  readonly open = model(false);

  /**
   * The employee that was just created.
   *
   * The drawer does not toast and does not refresh a roster: it says the act
   * happened, and the page that owns the list decides what to ask again and
   * what to announce.
   */
  readonly registrado = output<EmpleadoRegistrado>();

  /** The four sheets, in the order the folder presents them. */
  protected readonly tabs: readonly TabExpediente[] = TABS;

  /** Sheet on screen. Back to the first one when the folder closes. */
  readonly tabActiva = signal<TabId>(TABS[0].id);

  /** Draft of the request, as typed. Nothing here is trimmed until it is sent. */
  readonly modelo = signal<BorradorAlta>({ ...BORRADOR_ALTA });

  /** Last catalog answer, or `null` until the first one arrives. */
  readonly catalogos = signal<FormularioCatalogos | null>(null);

  /** `true` while the catalogs are in flight. */
  readonly cargando = signal(false);

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
   * Controls the user has already visited, or that a submit has revealed.
   *
   * A field the user never touched is not scolded: its message is computed but
   * kept out of `errores` until the control loses focus or the submit names it.
   * From then on the message follows every keystroke, so fixing the value
   * clears it at once.
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
   * message that names it.
   */
  private readonly contexto = computed<ContextoBorrador>(() => ({
    puestos: this.catalogos()?.puestos ?? [],
    categorias: this.catalogos()?.categorias_cct ?? [],
    entidades: this.entidades(),
  }));

  /**
   * Every local failure of the draft, keyed by field.
   *
   * Also the gate of the submit and the source of the badge of every tab: a
   * field that fails here would come back as a `422`, so the drawer refuses to
   * send it instead of spending a round trip on a known answer.
   */
  private readonly erroresDelBorrador = computed<Record<string, string>>(() =>
    evaluarBorrador(this.modelo(), this.contexto()),
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
   * The draft keeps the complete address, because `validarCorreo`, the recap and
   * the payload all read it whole, so the local part is derived on every render
   * instead of being stored a second time and kept in sync by hand.
   */
  readonly correoLocal = computed(() => parteLocalCorreo(this.modelo().correo_institucional));

  /** Motivo behind the local CURP message, for the `title` of the note. */
  private readonly motivosCurp = computed<readonly MotivoCurp[]>(
    () => validarCurp(this.modelo().curp).motivos,
  );

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
   * Federative entities of birth, as the screen names them.
   *
   * The frozen RENAPO table is the base because the live service does not send
   * `entidades` yet: reading the payload alone left the list empty, every lookup
   * missed and the field stayed blank while the CURP already carried the key. An
   * entry the server does send overrides the local one of the same `clave`.
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
   * area. Before an area is chosen there is nothing to offer.
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
   * and the server derives it from `puesto_id`, so the sheet only reads it.
   */
  readonly categoriaElegida = computed<CategoriaCctCatalogo | null>(() =>
    categoriaDePuesto(this.puestoElegido(), this.contexto()),
  );

  /** Read-only text of that category: what the server will store for the post. */
  readonly categoriaVisible = computed<string>(() => {
    if (this.puestoElegido() === null) {
      return CATEGORIA_SIN_PUESTO;
    }

    const categoria = this.categoriaElegida();
    return categoria === null ? CATEGORIA_SIN_ASIGNAR : textoDeCategoria(categoria);
  });

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
   * `true` when the chosen post is held by a `mando_medio_superior` category.
   *
   * It hides the two controls the server fixes, and it is the same rule the
   * evaluator reads: `core/empleados/borrador-alta.ts` owns it, so the sheet
   * cannot hide a control the gate still asks for.
   */
  readonly esMandoMedio = computed(() => esMandoMedioDe(this.modelo(), this.contexto()));

  /**
   * `tipo_personal` that will travel in the body.
   *
   * The rule lives in `core/empleados/borrador-alta.ts`: a `mando_medio_superior`
   * category hides the control and sends the only value the server accepts for
   * it, and every other category sends what the user chose.
   */
  readonly tipoPersonal = computed(() => tipoPersonalDe(this.modelo(), this.contexto()));

  /** `tipo_jornada` that will travel in the body, for the same reason. */
  readonly tipoJornada = computed(() => tipoJornadaDe(this.modelo(), this.contexto()));

  /**
   * How many invalid fields each tab owns, by index of `TABS`.
   *
   * It counts the local failures and the ones the last `422` reported, deduped
   * by field: a server sentence about a value the client also rejects is one
   * box to fix, not two. The last sheet owns no field, so its count stays at
   * zero and it never shows a badge.
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
   * A prohibited field (`categoria`, `adscripcion`, …) is not on any tab, and
   * silently dropping its message would hide the only explanation the backend
   * gave.
   */
  readonly erroresSueltos = computed<readonly string[]>(() =>
    Object.entries(this.erroresServidor())
      .filter(([campo]) => SECCION_DE_CAMPO[campo] === undefined)
      .flatMap(([, mensajes]) => mensajes),
  );

  /** Read-only recap of everything typed, grouped by section. */
  readonly resumen = computed<readonly GrupoResumen[]>(() => {
    const datos = this.modelo();

    return [
      {
        titulo: 'Identificación',
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
        titulo: 'Plaza',
        filas: [
          { etiqueta: 'Área', valor: this.nombreDeArea(datos.area_id) },
          { etiqueta: 'Puesto', valor: this.puestoElegido()?.nombre ?? SIN_DATO },
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
        titulo: 'Estudios y experiencia',
        filas: [
          {
            etiqueta: 'Nivel de estudios',
            valor: this.descripcionDe(this.niveles(), datos.nivel_estudios_id),
          },
          { etiqueta: 'Escuela de procedencia', valor: this.texto(datos.escuela_procedencia) },
          { etiqueta: 'Generación', valor: this.texto(datos.generacion) },
          { etiqueta: 'Experiencia pública (años)', valor: this.numero(datos.exp_publico_anios) },
          { etiqueta: 'Experiencia privada (años)', valor: this.numero(datos.exp_privado_anios) },
          { etiqueta: 'Trabaja en otro lugar', valor: this.texto(datos.trabaja_otro_lugar) },
          {
            etiqueta: 'Dónde trabaja',
            valor: this.pideOtroLugar() ? this.texto(datos.trabaja_otro_donde) : 'No aplica',
          },
          { etiqueta: 'Observaciones', valor: this.texto(datos.observaciones) },
        ],
      },
    ];
  });

  /** Lines of the loading block: the sheet has no fields to show yet. */
  protected readonly esqueletos = Array.from({ length: 6 }, (_, linea) => linea);

  /** Index of the sheet on screen, which is what the strip builds from. */
  readonly indiceActivo = computed(() => {
    const indice = TABS.findIndex((tab) => tab.id === this.tabActiva());
    return indice === -1 ? 0 : indice;
  });

  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private cierreTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.clearTimers());

    // Only `open` is a dependency of this effect. Everything it calls reads and
    // writes other signals — the catalogues, the loading flag, the reset timer —
    // and tracking those would make the effect restart the very request it just
    // started.
    effect(() => {
      const abierto = this.open();

      untracked(() => {
        if (!abierto) {
          this.alCerrar();
          return;
        }

        this.cancelarCierre();
        this.asegurarCatalogos();
      });
    });
  }

  // -------------------------------------------------------------------------
  // Catalogues
  // -------------------------------------------------------------------------

  /**
   * Reads the catalogues, once.
   *
   * The folder is mounted next to the roster and stays there, so the answer is
   * kept while it exists: reopening the folder is not a second visit to the
   * catalog, and the option lists are the same ones an hour later.
   */
  private asegurarCatalogos(): void {
    if (this.catalogos() !== null || this.cargando()) {
      return;
    }
    this.cargarCatalogos();
  }

  /** Reads (or re-reads) the catalogues. Also the retry of the failure block. */
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

  // -------------------------------------------------------------------------
  // Folder and tabs
  // -------------------------------------------------------------------------

  /** Moves the folder to a sheet. Never blocked: a tab that has errors opens. */
  private irATab(id: TabId): void {
    this.tabActiva.set(id);
  }

  /** A tab of the strip was chosen. The strip only knows indexes. */
  protected seleccionarIndice(indice: number): void {
    const tab = TABS[indice];
    if (tab !== undefined) {
      this.irATab(tab.id);
    }
  }

  /** Closes the folder from its own bar. */
  protected cerrar(): void {
    this.open.set(false);
  }

  // -------------------------------------------------------------------------
  // Draft
  // -------------------------------------------------------------------------

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

    // A complete CURP carries the birth date, the sex and the entity: the backend
    // resolves all three from it, so the sheet fills them instead of asking.
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
   * The control asks for what goes before the `@`; the domain is appended here,
   * so the field stays short while the draft — and therefore the body — carries
   * a complete address. Same caret guard as `guardarNormalizado`: nothing is
   * written when the resulting address is the one already stored.
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
   * types a second space would see it vanish under the cursor. On `blur` there
   * is no caret to protect, and the cleaned value is what the user reads before
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

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

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
   * note that says where it came from. That note is not conditional — every
   * derived field is locked from the first render — so the reference is always
   * emitted together with the node it points at.
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
   * with the same one, and the user reads one.
   */
  explicacionCurp(): string | null {
    if (this.errorDe('curp') === null || this.erroresServidor()['curp'] !== undefined) {
      return null;
    }
    const motivo = this.motivosCurp()[0];
    return motivo === undefined ? null : EXPLICACION_CURP[motivo];
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  /**
   * Sends the draft to the API, or says what has to be fixed first.
   *
   * The button is never gated by the draft: pressing it is how the user learns
   * what is missing. Every rule is checked here once more, and a failure does
   * not travel — the folder reveals the messages, moves to the sheet that owns
   * the first one and puts the cursor in that field, which is what the `422`
   * would have done with a wasted round trip.
   *
   * One request at a time: a second press while the first is in flight would
   * create two employees, so `enviando` is checked here as well as disabling the
   * button.
   */
  registrar(): void {
    if (this.enviando() || this.cargando() || this.errorCatalogos() !== null) {
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

    this.altaService
      .registrar(this.construirCuerpo())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.enviando.set(false)),
      )
      .subscribe({
        next: (empleado) => this.alCreado(empleado),
        error: (error: unknown) => this.manejarError(error),
      });
  }

  /**
   * Body of the request, with the two values the server derives from the post.
   *
   * Both come from the module: a `mando_medio_superior` post sends the pair the
   * server fixes for it, and every other post sends what the user chose.
   */
  private construirCuerpo(): AltaEmpleadoRequest {
    return construirCuerpoAlta(
      this.modelo(),
      this.contexto(),
      derivadosDe(this.modelo(), this.contexto()),
    );
  }

  /** Reports the created employee, closes the folder and leaves it empty. */
  private alCreado(empleado: EmpleadoRegistrado): void {
    this.registrado.emit(empleado);
    this.open.set(false);
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
   * Moves the folder to the sheet that holds the first field that failed.
   *
   * The backend writes the fields in the order it validated them, so the first
   * key with a sheet is the first thing the user has to fix.
   */
  private irAlPrimerErrorDeServidor(errores: Record<string, string[]>): void {
    for (const campo of Object.keys(errores)) {
      if (SECCION_DE_CAMPO[campo] !== undefined) {
        this.irAlCampo(campo);
        return;
      }
    }
  }

  /** Opens the sheet of a field and puts the cursor in the control itself. */
  private irAlCampo(campo: string): void {
    const seccion = SECCION_DE_CAMPO[campo];
    if (seccion === undefined) {
      return;
    }

    this.tabActiva.set(TABS[seccion].id);
    this.programarFoco(`#${campo}`);
  }

  // -------------------------------------------------------------------------
  // Messages of the draft
  // -------------------------------------------------------------------------

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

  /** Makes every failing field speak, after a submit that cannot leave. */
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
  // Reading the draft
  // -------------------------------------------------------------------------

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

  /** Text of the recap: the value, or the placeholder when it is absent. */
  private texto(valor: string): string {
    const limpio = valor.trim();
    return limpio === '' ? SIN_DATO : limpio;
  }

  /** Figure of the recap. `0` is a real answer, so it is kept. */
  private numero(valor: number | null): string {
    return valor === null ? SIN_DATO : String(valor);
  }

  /** Date of the recap, or the placeholder. */
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

  /** Name of an entity of the merged list, or `''` when it does not carry the key. */
  private nombreDeEntidad(clave: string): string {
    return this.entidades().find((entidad) => entidad.clave === clave)?.nombre ?? '';
  }

  /** Category of the recap, derived from the chosen post, or the placeholder. */
  private categoriaDelResumen(): string {
    const categoria = this.categoriaElegida();
    return categoria === null ? SIN_DATO : textoDeCategoria(categoria);
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

  // -------------------------------------------------------------------------
  // Closing
  // -------------------------------------------------------------------------

  /**
   * Closing the folder leaves it empty for the next opening.
   *
   * The tab goes back to the first sheet at once — the move is navigation, not
   * content — while the draft is cleared after the exit transition, so the
   * sheet is not wiped in front of the user. A close with a dirty draft asks
   * nothing: this folder is a scratch document, and its draft has no value once
   * it is discarded.
   */
  private alCerrar(): void {
    this.tabActiva.set(TABS[0].id);
    if (this.cierreTimer !== null) {
      return;
    }

    this.cierreTimer = setTimeout(() => {
      this.cierreTimer = null;
      if (this.open()) {
        return;
      }
      this.modelo.set({ ...BORRADOR_ALTA });
      this.tocado.set({});
      this.errores.set({});
      this.erroresServidor.set({});
      this.mensaje.set(null);
    }, CIERRE_MS);
  }

  /** A reopen inside the exit window keeps the draft that was still on screen. */
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
