/** Process rules derived from the model: which forms apply, deadlines, attachments and the fee estimate. */
import { SCALES, type Location, type PermitRequest } from './schema';
import { businessDaysBetween, subtractBusinessDays, subtractMonths, todayIso } from './calendar';

export type FormCode = 'F004' | 'F005' | 'F006' | 'F007' | 'F008';

export const FORMS: Record<FormCode, { title: string; file: string }> = {
  F004: { title: 'Formulario de solicitud', file: 'MMDI02.02.07.P010.F004_Formato-de-solicitud.docx' },
  F005: { title: 'Propuesta de ocupación del espacio público', file: 'MMDI02.02.07.P010.F005_Propuesta-de-Ocupacion.docx' },
  F006: { title: 'Plan de movilidad generada', file: 'MMDI02.02.07.P010.F006_Plan-de-Movilidad.docx' },
  F007: { title: 'Solicitud de concepto ambiental', file: 'MMDI02.02.07.P010.F007_Concepto-ambiental.docx' },
  F008: { title: 'Estrategia de socialización con la comunidad', file: 'MMDI02.02.07.P010.F008_Socializacion.docx' },
};

const ROAD_SPACES = new Set(['road_corridor', 'sidewalks', 'bike_lanes']);

/** A location needs a mobility plan if it affects roads, sidewalks, crossings or bike lanes. */
export const needsMobilityPlan = (l: Location) =>
  l.spaceTypes.some((t) => ROAD_SPACES.has(t)) || (l.mobility?.closures.length ?? 0) > 0;

export const isNaturalArea = (l: Location) => l.spaceTypes.includes('natural');

export function requiredForms(s: PermitRequest): FormCode[] {
  const out: FormCode[] = ['F004', 'F005'];
  if (s.locations.some(needsMobilityPlan)) out.push('F006');
  out.push('F007', 'F008');
  return out;
}

export function sortedSessions(s: PermitRequest) {
  return s.locations
    .flatMap((l, i) => l.sessions.map((j) => ({ ...j, location: l, index: i })))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export function shootRange(s: PermitRequest) {
  const sessions = sortedSessions(s);
  if (!sessions.length) return null;
  const dates = [...new Set(sessions.map((j) => j.date))];
  const shootDates = new Set(sessions.filter((j) => j.activity === 'shoot').map((j) => j.date));
  return { start: dates[0], end: dates[dates.length - 1], shootDays: shootDates.size || dates.length, dates };
}

export type Deadlines = {
  firstDay: string;
  /** Last day to file: 20 business days before the first day. */
  deadline: string;
  /** First day the request can be filed: 3 months before. */
  opensOn: string;
  businessDaysLeft: number;
  status: 'early' | 'on-time' | 'tight' | 'late';
};

export function deadlines(firstDay: string, today = todayIso()): Deadlines {
  const deadline = subtractBusinessDays(firstDay, 20);
  const opensOn = subtractMonths(firstDay, 3);
  const businessDaysLeft = today <= deadline ? businessDaysBetween(today, deadline) : -businessDaysBetween(deadline, today);
  let status: Deadlines['status'] = 'on-time';
  if (today < opensOn) status = 'early';
  else if (today > deadline) status = 'late';
  else if (businessDaysLeft <= 5) status = 'tight';
  return { firstDay, deadline, opensOn, businessDaysLeft, status };
}

export type Attachment = { text: string; form?: FormCode; required: boolean };

/** What the site cannot generate and the applicant has to attach by hand. */
export function attachments(s: PermitRequest): Attachment[] {
  const a: Attachment[] = [];
  s.locations.forEach((l, i) => {
    const n = `locación ${i + 1}${l.name ? ` (${l.name})` : ''}`;
    a.push({ text: `Plano de piso del montaje de la ${n}`, form: 'F005', required: true });
    a.push({ text: `Dos fotografías del espacio público de la ${n}`, form: 'F005', required: true });
    if (needsMobilityPlan(l)) {
      a.push({ text: `Pantallazo satelital de Google Maps con set, base y parqueo de la ${n}`, form: 'F006', required: true });
      a.push({ text: `Fotografías de las zonas de cargue, descargue y parqueo de la ${n}`, form: 'F006', required: true });
    }
    if (isNaturalArea(l)) a.push({ text: `Fotografías del área natural de la ${n}, marcando los puntos de uso`, form: 'F007', required: true });
  });
  a.push({ text: 'Evidencias de socialización con la comunidad (actas, listados de asistencia, fotos), si ya la hiciste', form: 'F008', required: false });
  if (s.exemption.type === 'academic') a.push({ text: 'Carta de la institución educativa que certifica el proyecto académico', form: 'F004', required: true });
  if (s.exemption.type === 'community') a.push({ text: 'Carta del colectivo que describe sus labores comunitarias, financiación y fines', form: 'F004', required: true });
  if (s.exemption.type === 'public_funds') a.push({ text: 'Resolución o certificación de beneficiario de fondos públicos del Distrito', form: 'F004', required: true });
  if (s.risks.effects.length || s.people.crowd > 0) a.push({ text: 'Plan de emergencias (por efectos especiales, escenas de riesgo o aglomeración)', required: true });
  if (s.locations.some((l) => l.mobility?.affectsMio)) a.push({ text: 'Autorización de Metro Cali S.A. por afectación al MIO', form: 'F006', required: true });
  a.push({ text: 'Firma del responsable en el formulario de solicitud', form: 'F004', required: true });
  return a;
}

export type Issue = { level: 'error' | 'warning'; text: string };

/** Consistency check before generating. It never blocks: the official form has the last word. */
export function review(s: PermitRequest): Issue[] {
  const out: Issue[] = [];
  const req = (v: string, t: string) => { if (!v.trim()) out.push({ level: 'error', text: t }); };
  req(s.project.name, 'Falta el nombre del proyecto.');
  req(s.project.synopsis, 'Falta la sinopsis corta.');
  req(s.project.scenes, 'Falta la descripción de las escenas a filmar.');
  for (const [k, r] of Object.entries(s.contacts)) {
    const who = k === 'production' ? 'el responsable de la filmación' : 'el responsable de la locación';
    req(r.name, `Falta el nombre de ${who}.`);
    req(r.idNumber, `Falta el documento de ${who}.`);
    req(r.phone, `Falta el teléfono de ${who}.`);
    req(r.email, `Falta el correo de ${who}.`);
  }
  if (s.notification.consent && !s.notification.email.trim() && !s.contacts.production.email.trim())
    out.push({ level: 'error', text: 'Autorizaste notificación electrónica pero no hay correo.' });
  s.locations.forEach((l, i) => {
    const n = `Locación ${i + 1}`;
    req(l.address, `${n}: falta la dirección.`);
    req(l.neighborhood, `${n}: falta el barrio o corregimiento.`);
    if (!l.spaceTypes.length) out.push({ level: 'error', text: `${n}: indica qué tipo de espacio público usarás.` });
    if (!l.areaM2) out.push({ level: 'warning', text: `${n}: el área de ocupación en m² está en cero.` });
    l.sessions.forEach((j, k) => {
      if (j.end <= j.start) out.push({ level: 'warning', text: `${n}, jornada ${k + 1}: la hora final no es posterior a la inicial.` });
    });
    if (needsMobilityPlan(l) && !l.mobility?.implementation.trim())
      out.push({ level: 'warning', text: `${n}: afecta movilidad; describe cómo implementarás el plan de manejo de tránsito.` });
  });
  if (s.risks.effects.length && !s.risks.effectsDescription.trim())
    out.push({ level: 'error', text: 'Marcaste efectos especiales pero no describiste la escena.' });
  if (s.exemption.type !== 'none' && !s.exemption.entity.trim())
    out.push({ level: 'error', text: 'Indica la institución, colectivo o convocatoria de la exención.' });
  req(s.outreach.strategies, 'Falta la estrategia de socialización con la comunidad.');
  req(s.environment.wasteStrategy, 'Falta la estrategia de manejo de residuos.');
  return out;
}

/** UVT (tax value unit) per tax year, set by DIAN. 2026: DIAN resolution of December 2025. */
export const UVT: Record<number, number> = { 2025: 49_799, 2026: 52_374 };
/** Differential factor for film shoots (art. 18, Decreto 4112.010.20.0955 de 2022). */
export const FILM_FACTOR = 12;

export type FeeEstimate = {
  amount: number;
  exempt: boolean;
  uvt: number;
  uvtYear: number;
  uvtAssumed: boolean;
  scale: { key: string; label: string; weight: number };
  squareMeterDays: number;
  breakdown: { location: string; area: number; days: number }[];
};

/**
 * Estimate of the fee for the economic use of public space.
 * VR = (A × D × Esc × UVT) / FD (Resolución 4132.030.21.1-7 de 2025, art. 6).
 * A × D is added up per location. With different scales, the one with the highest weight applies (second paragraph).
 * It is an approximation: the official amount is set by the Subdirección de Espacio Público.
 */
export function estimateFee(s: PermitRequest): FeeEstimate | null {
  const r = shootRange(s);
  if (!r) return null;
  const year = Number(r.start.slice(0, 4));
  const years = Object.keys(UVT).map(Number).sort();
  const uvtYear = UVT[year] ? year : years[years.length - 1];
  const uvt = UVT[uvtYear];
  const scales = s.locations.map((l) => SCALES.find(([k]) => k === l.scale) ?? SCALES[0]);
  const [key, label, weight] = scales.reduce((a, b) => (b[2] > a[2] ? b : a));
  const breakdown = s.locations.map((l, i) => ({
    location: l.name || `Locación ${i + 1}`,
    area: Math.max(1, l.areaM2),
    days: new Set(l.sessions.map((j) => j.date)).size,
  }));
  const squareMeterDays = breakdown.reduce((acc, d) => acc + d.area * d.days, 0);
  const exempt = s.exemption.type !== 'none';
  const amount = exempt ? 0 : Math.round((squareMeterDays * weight * uvt) / FILM_FACTOR);
  return { amount, exempt, uvt, uvtYear, uvtAssumed: uvtYear !== year, scale: { key, label, weight }, squareMeterDays, breakdown };
}

/** Formats an amount in Colombian pesos. */
export const formatCop = (n: number) => '$ ' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
