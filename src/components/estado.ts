/** Estado del asistente: una solicitud vacía con la misma forma que el modelo. */
import type { Jornada, Locacion, Movilidad, Persona, SolicitudInput } from '../lib/pufa/schema';

export const personaVacia = (): Persona => ({
  tipoPersona: 'natural', tipoDocumento: 'cc', documento: '', nombre: '', empresa: '', cargo: '', telefono: '', correo: '',
});

export const jornadaVacia = (fecha = ''): Jornada => ({ fecha, actividad: 'filmacion', horaInicio: '08:00', horaFin: '18:00' });

export const movilidadVacia = (): Movilidad => ({
  afectaciones: [], sentido: '', costado: '', afectaMio: false, desvioPeatonal: false, desvioPublico: false,
  socializarEmpresas: false, desvioParticular: false, semaforos: false, semaforosDetalle: '', implementacion: '',
  senalizacion: '', cargueDescargue: '', parqueo: '',
});

export const naturalVacio = () => ({ nombreArea: '', actividades: '', impactos: [] as string[], impactoDetalle: '' });

export const locacionVacia = (): Locacion => ({
  nombre: '', barrio: '', direccion: '', mapsUrl: '', zona: 'urbano', uso: 'set', escala: 'local', tiposEspacio: [], areaM2: 0,
  elementos: {}, escenografiaDesc: '', otrosElementos: '', jornadas: [jornadaVacia()], movilidad: null, natural: null,
});

export type Estado = {
  proyecto: {
    nombre: string; tipo: string; tipoOtro: string; subtipo: string; subtipoOtro: string; campana: string;
    artista: string; cancion: string; contenidoTipo: string; contenidoNombre: string; naturaleza: string;
    sinopsis: string; escenas: string;
  };
  responsables: { filmacion: Persona; locacion: Persona };
  solicitanteDireccion: string;
  exencion: { tipo: string; entidad: string };
  personas: { equipo: number; extras: number; aglomeracion: number };
  riesgos: {
    efectos: string[]; efectoOtro: string; efectosEscena: string;
    animales: { tipo: string; cantidad: number; acciones: string; manejo: string } | null;
    armas: { tipos: string; cantidad: number; acciones: string } | null;
  };
  locaciones: Locacion[];
  ambiental: {
    residuosTipos: string; residuosEstrategia: string;
    ruidoAmplificacion: { cantidad: number; tipo: string };
    ruidoPlantas: { cantidad: number; tipo: string };
    ruidoVehiculos: { cantidad: number; tipo: string };
    ruidoMitigacion: string; sensibles: string; medidasAcusticas: string;
  };
  socializacion: { estrategias: string; impactoPositivo: string };
  notificacion: { autoriza: boolean; correo: string };
};

export const estadoVacio = (): Estado => ({
  proyecto: {
    nombre: '', tipo: 'cine', tipoOtro: '', subtipo: '', subtipoOtro: '', campana: '', artista: '', cancion: '',
    contenidoTipo: '', contenidoNombre: '', naturaleza: 'nacional', sinopsis: '', escenas: '',
  },
  responsables: { filmacion: personaVacia(), locacion: personaVacia() },
  solicitanteDireccion: '',
  exencion: { tipo: 'ninguna', entidad: '' },
  personas: { equipo: 0, extras: 0, aglomeracion: 0 },
  riesgos: { efectos: [], efectoOtro: '', efectosEscena: '', animales: null, armas: null },
  locaciones: [locacionVacia()],
  ambiental: {
    residuosTipos: '', residuosEstrategia: '',
    ruidoAmplificacion: { cantidad: 0, tipo: '' }, ruidoPlantas: { cantidad: 0, tipo: '' }, ruidoVehiculos: { cantidad: 0, tipo: '' },
    ruidoMitigacion: '', sensibles: '', medidasAcusticas: '',
  },
  socializacion: { estrategias: '', impactoPositivo: '' },
  notificacion: { autoriza: true, correo: '' },
});

/** Mezcla profunda de un JSON cargado sobre el estado vacío, para tolerar campos faltantes. */
export function hidratar(data: unknown): Estado {
  const base = estadoVacio() as unknown as Record<string, unknown>;
  const merge = (a: unknown, b: unknown): unknown => {
    if (Array.isArray(b)) return b;
    if (b && typeof b === 'object' && a && typeof a === 'object' && !Array.isArray(a)) {
      const out: Record<string, unknown> = { ...(a as object) };
      for (const [k, v] of Object.entries(b)) out[k] = merge((a as Record<string, unknown>)[k], v);
      return out;
    }
    return b === undefined ? a : b;
  };
  const e = merge(base, data) as Estado;
  e.locaciones = (e.locaciones?.length ? e.locaciones : [locacionVacia()]).map(
    (l) => merge(locacionVacia(), l) as Locacion,
  );
  return e;
}

export const comoSolicitud = (e: Estado) => e as unknown as SolicitudInput;

type Ruta = (string | number)[];

export function asignar<T>(obj: T, ruta: Ruta, valor: unknown): T {
  const copia = structuredClone(obj) as Record<string | number, unknown>;
  let cur = copia as Record<string | number, unknown>;
  for (let i = 0; i < ruta.length - 1; i++) cur = cur[ruta[i]] as Record<string | number, unknown>;
  cur[ruta[ruta.length - 1]] = valor;
  return copia as T;
}

export function leer(obj: unknown, ruta: Ruta): unknown {
  return ruta.reduce<unknown>((acc, k) => (acc as Record<string | number, unknown>)?.[k], obj);
}
