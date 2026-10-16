/** Reglas del trámite que se derivan del modelo: qué formatos aplican, plazos y anexos. */
import { ESCALAS, type Locacion, type Solicitud } from './schema';
import { habilesEntre, hoyIso, restarHabiles, restarMeses } from './calendario';

export type CodigoFormato = 'F004' | 'F005' | 'F006' | 'F007' | 'F008';

export const FORMATOS: Record<CodigoFormato, { titulo: string; archivo: string }> = {
  F004: { titulo: 'Formulario de solicitud', archivo: 'MMDI02.02.07.P010.F004_Formato-de-solicitud.docx' },
  F005: { titulo: 'Propuesta de ocupación del espacio público', archivo: 'MMDI02.02.07.P010.F005_Propuesta-de-Ocupacion.docx' },
  F006: { titulo: 'Plan de movilidad generada', archivo: 'MMDI02.02.07.P010.F006_Plan-de-Movilidad.docx' },
  F007: { titulo: 'Solicitud de concepto ambiental', archivo: 'MMDI02.02.07.P010.F007_Concepto-ambiental.docx' },
  F008: { titulo: 'Estrategia de socialización con la comunidad', archivo: 'MMDI02.02.07.P010.F008_Socializacion.docx' },
};

const ESPACIOS_VIALES = new Set(['corredor_vial', 'andenes', 'ciclorrutas']);

/** Una locación necesita plan de movilidad si afecta vías, andenes, pasos peatonales o ciclorrutas. */
export const necesitaMovilidad = (l: Locacion) =>
  l.tiposEspacio.some((t) => ESPACIOS_VIALES.has(t)) || (l.movilidad?.afectaciones.length ?? 0) > 0;

export const esNatural = (l: Locacion) => l.tiposEspacio.includes('natural');

export function formatosRequeridos(s: Solicitud): CodigoFormato[] {
  const out: CodigoFormato[] = ['F004', 'F005'];
  if (s.locaciones.some(necesitaMovilidad)) out.push('F006');
  out.push('F007', 'F008');
  return out;
}

export function jornadasOrdenadas(s: Solicitud) {
  return s.locaciones
    .flatMap((l, i) => l.jornadas.map((j) => ({ ...j, locacion: l, indice: i })))
    .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
}

export function rangoRodaje(s: Solicitud) {
  const js = jornadasOrdenadas(s);
  if (!js.length) return null;
  const fechas = [...new Set(js.map((j) => j.fecha))];
  const filmacion = new Set(js.filter((j) => j.actividad === 'filmacion').map((j) => j.fecha));
  return { inicio: fechas[0], fin: fechas[fechas.length - 1], diasRodaje: filmacion.size || fechas.length, fechas };
}

export type Plazos = {
  primerDia: string;
  /** Último día para radicar: 20 días hábiles antes del primer día. */
  limite: string;
  /** Primer día en que se puede radicar: 3 meses antes. */
  apertura: string;
  habilesRestantes: number;
  estado: 'temprano' | 'a-tiempo' | 'justo' | 'tarde';
};

export function plazos(primerDia: string, hoy = hoyIso()): Plazos {
  const limite = restarHabiles(primerDia, 20);
  const apertura = restarMeses(primerDia, 3);
  const habilesRestantes = hoy <= limite ? habilesEntre(hoy, limite) : -habilesEntre(limite, hoy);
  let estado: Plazos['estado'] = 'a-tiempo';
  if (hoy < apertura) estado = 'temprano';
  else if (hoy > limite) estado = 'tarde';
  else if (habilesRestantes <= 5) estado = 'justo';
  return { primerDia, limite, apertura, habilesRestantes, estado };
}

export type Anexo = { texto: string; formato?: CodigoFormato; obligatorio: boolean };

/** Lo que el sitio no puede generar y hay que adjuntar a mano. */
export function anexos(s: Solicitud): Anexo[] {
  const a: Anexo[] = [];
  s.locaciones.forEach((l, i) => {
    const n = `locación ${i + 1}${l.nombre ? ` (${l.nombre})` : ''}`;
    a.push({ texto: `Plano de piso del montaje de la ${n}`, formato: 'F005', obligatorio: true });
    a.push({ texto: `Dos fotografías del espacio público de la ${n}`, formato: 'F005', obligatorio: true });
    if (necesitaMovilidad(l)) {
      a.push({ texto: `Pantallazo satelital de Google Maps con set, base y parqueo de la ${n}`, formato: 'F006', obligatorio: true });
      a.push({ texto: `Fotografías de las zonas de cargue, descargue y parqueo de la ${n}`, formato: 'F006', obligatorio: true });
    }
    if (esNatural(l)) a.push({ texto: `Fotografías del área natural de la ${n}, marcando los puntos de uso`, formato: 'F007', obligatorio: true });
  });
  a.push({ texto: 'Evidencias de socialización con la comunidad (actas, listados de asistencia, fotos), si ya la hiciste', formato: 'F008', obligatorio: false });
  if (s.exencion.tipo === 'academico') a.push({ texto: 'Carta de la institución educativa que certifica el proyecto académico', formato: 'F004', obligatorio: true });
  if (s.exencion.tipo === 'comunitario') a.push({ texto: 'Carta del colectivo que describe sus labores comunitarias, financiación y fines', formato: 'F004', obligatorio: true });
  if (s.exencion.tipo === 'fondos') a.push({ texto: 'Resolución o certificación de beneficiario de fondos públicos del Distrito', formato: 'F004', obligatorio: true });
  if (s.riesgos.efectos.length || s.personas.aglomeracion > 0) a.push({ texto: 'Plan de emergencias (por efectos especiales, escenas de riesgo o aglomeración)', obligatorio: true });
  if (s.locaciones.some((l) => l.movilidad?.afectaMio)) a.push({ texto: 'Autorización de Metro Cali S.A. por afectación al MIO', formato: 'F006', obligatorio: true });
  a.push({ texto: 'Firma del responsable en el formulario de solicitud', formato: 'F004', obligatorio: true });
  return a;
}

export type Aviso = { nivel: 'error' | 'alerta'; texto: string };

/** Revisión de coherencia antes de generar. No bloquea: el formato oficial manda. */
export function revisar(s: Solicitud): Aviso[] {
  const out: Aviso[] = [];
  const req = (v: string, t: string) => { if (!v.trim()) out.push({ nivel: 'error', texto: t }); };
  req(s.proyecto.nombre, 'Falta el nombre del proyecto.');
  req(s.proyecto.sinopsis, 'Falta la sinopsis corta.');
  req(s.proyecto.escenas, 'Falta la descripción de las escenas a filmar.');
  for (const [k, r] of Object.entries(s.responsables)) {
    const quien = k === 'filmacion' ? 'el responsable de la filmación' : 'el responsable de la locación';
    req(r.nombre, `Falta el nombre de ${quien}.`);
    req(r.documento, `Falta el documento de ${quien}.`);
    req(r.telefono, `Falta el teléfono de ${quien}.`);
    req(r.correo, `Falta el correo de ${quien}.`);
  }
  if (s.notificacion.autoriza && !s.notificacion.correo.trim() && !s.responsables.filmacion.correo.trim())
    out.push({ nivel: 'error', texto: 'Autorizaste notificación electrónica pero no hay correo.' });
  s.locaciones.forEach((l, i) => {
    const n = `Locación ${i + 1}`;
    req(l.direccion, `${n}: falta la dirección.`);
    req(l.barrio, `${n}: falta el barrio o corregimiento.`);
    if (!l.tiposEspacio.length) out.push({ nivel: 'error', texto: `${n}: indica qué tipo de espacio público usarás.` });
    if (!l.areaM2) out.push({ nivel: 'alerta', texto: `${n}: el área de ocupación en m² está en cero.` });
    l.jornadas.forEach((j, k) => {
      if (j.horaFin <= j.horaInicio) out.push({ nivel: 'alerta', texto: `${n}, jornada ${k + 1}: la hora final no es posterior a la inicial.` });
    });
    if (necesitaMovilidad(l) && !l.movilidad?.implementacion.trim())
      out.push({ nivel: 'alerta', texto: `${n}: afecta movilidad; describe cómo implementarás el plan de manejo de tránsito.` });
  });
  if (s.riesgos.efectos.length && !s.riesgos.efectosEscena.trim())
    out.push({ nivel: 'error', texto: 'Marcaste efectos especiales pero no describiste la escena.' });
  if (s.exencion.tipo !== 'ninguna' && !s.exencion.entidad.trim())
    out.push({ nivel: 'error', texto: 'Indica la institución, colectivo o convocatoria de la exención.' });
  req(s.socializacion.estrategias, 'Falta la estrategia de socialización con la comunidad.');
  req(s.ambiental.residuosEstrategia, 'Falta la estrategia de manejo de residuos.');
  return out;
}

/** UVT por año gravable (DIAN). 2026: Resolución DIAN de diciembre de 2025. */
export const UVT: Record<number, number> = { 2025: 49_799, 2026: 52_374 };
/** Factor diferenciador para filmaciones (art. 18, Decreto 4112.010.20.0955 de 2022). */
export const FACTOR_DIFERENCIADOR = 12;

export type Estimacion = {
  valor: number;
  exento: boolean;
  uvt: number;
  anioUvt: number;
  uvtSupuesta: boolean;
  escala: { clave: string; nombre: string; peso: number };
  metrosDia: number;
  detalle: { locacion: string; area: number; dias: number }[];
};

/**
 * Estimación de la retribución por aprovechamiento económico del espacio público.
 * VR = (A × D × Esc × UVT) / FD (Resolución 4132.030.21.1-7 de 2025, art. 6).
 * A × D se suma por locación. Si hay escalas distintas se usa la de mayor peso (parágrafo segundo).
 * Es una aproximación: el valor oficial lo liquida la Subdirección de Espacio Público.
 */
export function estimarRetribucion(s: Solicitud): Estimacion | null {
  const r = rangoRodaje(s);
  if (!r) return null;
  const anio = Number(r.inicio.slice(0, 4));
  const anios = Object.keys(UVT).map(Number).sort();
  const anioUvt = UVT[anio] ? anio : anios[anios.length - 1];
  const uvt = UVT[anioUvt];
  const pesos = s.locaciones.map((l) => ESCALAS.find(([k]) => k === l.escala) ?? ESCALAS[0]);
  const [clave, nombre, peso] = pesos.reduce((a, b) => (b[2] > a[2] ? b : a));
  const detalle = s.locaciones.map((l, i) => ({
    locacion: l.nombre || `Locación ${i + 1}`,
    area: Math.max(1, l.areaM2),
    dias: new Set(l.jornadas.map((j) => j.fecha)).size,
  }));
  const metrosDia = detalle.reduce((acc, d) => acc + d.area * d.dias, 0);
  const exento = s.exencion.tipo !== 'ninguna';
  const valor = exento ? 0 : Math.round((metrosDia * peso * uvt) / FACTOR_DIFERENCIADOR);
  return { valor, exento, uvt, anioUvt, uvtSupuesta: anioUvt !== anio, escala: { clave, nombre, peso }, metrosDia, detalle };
}

export const pesos = (n: number) => '$ ' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
