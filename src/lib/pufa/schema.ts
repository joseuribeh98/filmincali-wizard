/**
 * Modelo único de una solicitud de permiso de rodaje en espacio público de Cali.
 * Cada dato se pide una sola vez; los cinco formatos oficiales se derivan de aquí.
 * Toda entidad repetible (locación, jornada) tiene siempre las mismas propiedades.
 */
import { z } from 'zod';

const texto = z.string().trim().default('');
const entero = z.coerce.number().int().min(0).default(0);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
const hora = z.string().regex(/^\d{2}:\d{2}$/, 'Usa el formato HH:MM');
const siNo = z.boolean().default(false);

export const ELEMENTOS = [
  ['automoviles', 'Automóviles'],
  ['automoviles_escena', 'Automóviles en escena'],
  ['vanes', 'Vanes'],
  ['buses', 'Buses'],
  ['camiones', 'Camiones'],
  ['plantas', 'Plantas eléctricas'],
  ['trailers', 'Tráileres o motor home'],
  ['moviles', 'Móviles'],
  ['camabajas', 'Camabajas'],
  ['carrotanques', 'Carrotanques'],
  ['maquinaria', 'Maquinaria amarilla o azul'],
  ['motos', 'Motos'],
  ['gruas', 'Grúas'],
  ['brazos', 'Brazos'],
  ['dolly', 'Dolly'],
  ['tripodes', 'Trípodes'],
  ['luminotecnia', 'Luminotecnia y grip'],
  ['andamios', 'Andamios'],
  ['carpas', 'Carpas'],
  ['banos', 'Baños portátiles'],
  ['escenografia', 'Elementos de escenografía'],
] as const;
export const ESCALAS = [
  ['local', 'Local', 0.4],
  ['zonal', 'Zonal', 0.6],
  ['urbano', 'Urbana', 0.8],
  ['regional', 'Regional', 1],
  ['anden', 'Andén', 2],
] as const;

export type ElementoKey = (typeof ELEMENTOS)[number][0];

export const TIPOS_ESPACIO = [
  ['corredor_vial', 'Corredor vial'],
  ['andenes', 'Andenes, vías y pasos peatonales'],
  ['parques', 'Sistema de parques'],
  ['alamedas', 'Alamedas, plazas y plazoletas'],
  ['puentes', 'Puentes peatonales y zonas bajas de puentes'],
  ['mio', 'Infraestructura del MIO'],
  ['plazas_mercado', 'Plazas de mercado'],
  ['natural', 'Espacio público natural (ríos, ecoparques, áreas protegidas)'],
  ['ciclorrutas', 'Ciclorrutas y ciclovías'],
] as const;
export type TipoEspacio = (typeof TIPOS_ESPACIO)[number][0];

export const AFECTACIONES = [
  ['veh_parcial_perm', 'Cierre vehicular parcial permanente'],
  ['veh_total_perm', 'Cierre vehicular total permanente'],
  ['veh_parcial_inter', 'Cierre vehicular parcial intermitente'],
  ['veh_total_inter', 'Cierre vehicular total intermitente'],
  ['pea_parcial_perm', 'Cierre peatonal parcial permanente'],
  ['pea_total_perm', 'Cierre peatonal total permanente'],
  ['pea_parcial_inter', 'Cierre peatonal parcial intermitente'],
  ['pea_total_inter', 'Cierre peatonal total intermitente'],
] as const;

export const EFECTOS = [
  ['fuego', 'Fuego'],
  ['lluvia', 'Lluvia (agua)'],
  ['luminicos', 'Climáticos lumínicos'],
  ['disparos', 'Cargas dirigidas (disparos)'],
  ['aire', 'Aire comprimido'],
  ['explosiones', 'Explosiones'],
  ['otro', 'Otro'],
] as const;

export const IMPACTOS = [
  ['luz', 'Intensidad lumínica alta'],
  ['sonido', 'Intensidad sonora alta'],
  ['gases', 'Emisión de gases alta'],
  ['vegetacion', 'Alteración de vegetación o hábitat'],
  ['agua', 'Cambios en un cuerpo de agua'],
] as const;

const keys = <T extends readonly (readonly [string, string])[]>(list: T) =>
  list.map(([k]) => k) as unknown as [T[number][0], ...T[number][0][]];

export const Persona = z.object({
  tipoPersona: z.enum(['natural', 'juridica']).default('natural'),
  tipoDocumento: z.enum(['cc', 'nit', 'pasaporte', 'ce']).default('cc'),
  documento: texto,
  nombre: texto,
  empresa: texto,
  cargo: texto,
  telefono: texto,
  correo: texto,
});

export const Jornada = z.object({
  fecha,
  actividad: z.enum(['montaje', 'filmacion', 'desmontaje']).default('filmacion'),
  horaInicio: hora,
  horaFin: hora,
});

export const Movilidad = z.object({
  afectaciones: z.array(z.enum(keys(AFECTACIONES))).default([]),
  sentido: texto,
  costado: texto,
  afectaMio: siNo,
  desvioPeatonal: siNo,
  desvioPublico: siNo,
  socializarEmpresas: siNo,
  desvioParticular: siNo,
  semaforos: siNo,
  semaforosDetalle: texto,
  implementacion: texto,
  senalizacion: texto,
  cargueDescargue: texto,
  parqueo: texto,
});

export const Locacion = z.object({
  nombre: texto,
  barrio: texto,
  direccion: texto,
  mapsUrl: texto,
  zona: z.enum(['urbano', 'rural']).default('urbano'),
  uso: z.enum(['set', 'base']).default('set'),
  /** Escala del espacio público (art. 247 del POT; en vías, según la jerarquía vial). Define el peso en la retribución. */
  escala: z.enum(['local', 'zonal', 'urbano', 'regional', 'anden']).default('local'),
  tiposEspacio: z.array(z.enum(keys(TIPOS_ESPACIO))).default([]),
  areaM2: entero,
  elementos: z.partialRecord(z.enum(keys(ELEMENTOS)), z.coerce.number().int().min(0)).default({}),
  escenografiaDesc: texto,
  otrosElementos: texto,
  jornadas: z.array(Jornada).min(1, 'Cada locación necesita al menos una jornada'),
  /** Solo si hay cierres o se ocupa vía, andén o ciclorruta. */
  movilidad: Movilidad.nullable().default(null),
  /** Solo si es espacio público natural. */
  natural: z
    .object({
      nombreArea: texto,
      actividades: texto,
      impactos: z.array(z.enum(keys(IMPACTOS))).default([]),
      impactoDetalle: texto,
    })
    .nullable()
    .default(null),
});

export const Solicitud = z.object({
  proyecto: z.object({
    nombre: texto,
    tipo: z.enum(['cine', 'tv', 'publicidad', 'web', 'videoclip', 'otro']).default('cine'),
    tipoOtro: texto,
    /** cine: corto|medio|largo · tv: serie|telenovela|reality|otro · publicidad: spot|corporativo|promocional|redes|otro */
    subtipo: texto,
    subtipoOtro: texto,
    campana: texto,
    artista: texto,
    cancion: texto,
    contenidoTipo: texto,
    contenidoNombre: texto,
    naturaleza: z.enum(['nacional', 'internacional', 'servicios']).default('nacional'),
    sinopsis: texto,
    escenas: texto,
  }),
  responsables: z.object({ filmacion: Persona, locacion: Persona }),
  solicitanteDireccion: texto,
  exencion: z.object({
    tipo: z.enum(['ninguna', 'academico', 'comunitario', 'fondos']).default('ninguna'),
    entidad: texto,
  }),
  personas: z.object({ equipo: entero, extras: entero, aglomeracion: entero }),
  riesgos: z.object({
    efectos: z.array(z.enum(keys(EFECTOS))).default([]),
    efectoOtro: texto,
    efectosEscena: texto,
    animales: z.object({ tipo: texto, cantidad: entero, acciones: texto, manejo: texto }).nullable().default(null),
    armas: z.object({ tipos: texto, cantidad: entero, acciones: texto }).nullable().default(null),
  }),
  locaciones: z.array(Locacion).min(1, 'Agrega al menos una locación'),
  ambiental: z.object({
    residuosTipos: texto,
    residuosEstrategia: texto,
    ruidoAmplificacion: z.object({ cantidad: entero, tipo: texto }),
    ruidoPlantas: z.object({ cantidad: entero, tipo: texto }),
    ruidoVehiculos: z.object({ cantidad: entero, tipo: texto }),
    ruidoMitigacion: texto,
    sensibles: texto,
    medidasAcusticas: texto,
  }),
  socializacion: z.object({ estrategias: texto, impactoPositivo: texto }),
  notificacion: z.object({ autoriza: z.boolean().default(true), correo: texto }),
});

export type Persona = z.infer<typeof Persona>;
export type Jornada = z.infer<typeof Jornada>;
export type Locacion = z.infer<typeof Locacion>;
export type Movilidad = z.infer<typeof Movilidad>;
export type Solicitud = z.infer<typeof Solicitud>;
export type SolicitudInput = z.input<typeof Solicitud>;
