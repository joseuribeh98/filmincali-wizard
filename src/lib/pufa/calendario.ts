/**
 * Días hábiles en Colombia: lunes a viernes sin festivos.
 * Festivos según la Ley 51 de 1983 (Ley Emiliani): algunos se trasladan al lunes siguiente.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
function pascua(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, mes, dia);
}

/** Traslada al lunes siguiente si no cae en lunes. */
const lunes = (d: Date) => {
  const dow = d.getUTCDay();
  return dow === 1 ? d : addDays(d, (8 - dow) % 7);
};

const cache = new Map<number, Set<string>>();

export function festivos(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const p = pascua(y);
  const fijos = [utc(y, 1, 1), utc(y, 5, 1), utc(y, 7, 20), utc(y, 8, 7), utc(y, 12, 8), utc(y, 12, 25)];
  const emiliani = [
    utc(y, 1, 6), utc(y, 3, 19), utc(y, 6, 29), utc(y, 8, 15),
    utc(y, 10, 12), utc(y, 11, 1), utc(y, 11, 11),
  ].map(lunes);
  const religiosos = [
    addDays(p, -3), // Jueves Santo
    addDays(p, -2), // Viernes Santo
    lunes(addDays(p, 39)), // Ascensión
    lunes(addDays(p, 60)), // Corpus Christi
    lunes(addDays(p, 68)), // Sagrado Corazón
  ];
  const set = new Set([...fijos, ...emiliani, ...religiosos].map(iso));
  cache.set(y, set);
  return set;
}

export function esHabil(fechaIso: string): boolean {
  const d = new Date(fechaIso + 'T00:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !festivos(d.getUTCFullYear()).has(fechaIso);
}

/** Resta n días hábiles a una fecha (no cuenta la fecha de partida). */
export function restarHabiles(fechaIso: string, n: number): string {
  let d = new Date(fechaIso + 'T00:00:00Z');
  let quedan = n;
  while (quedan > 0) {
    d = addDays(d, -1);
    if (esHabil(iso(d))) quedan--;
  }
  return iso(d);
}

/** Días hábiles entre dos fechas, sin contar `desde` y contando `hasta`. */
export function habilesEntre(desde: string, hasta: string): number {
  let d = new Date(desde + 'T00:00:00Z');
  const fin = new Date(hasta + 'T00:00:00Z');
  let n = 0;
  while (d < fin) {
    d = addDays(d, 1);
    if (esHabil(iso(d))) n++;
  }
  return n;
}

export function restarMeses(fechaIso: string, meses: number): string {
  const d = new Date(fechaIso + 'T00:00:00Z');
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return iso(d);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 2026-11-12 → "12/11/2026" (como se escribe en los formatos). */
export const fechaCorta = (f: string) => f.split('-').reverse().join('/');

/** 2026-11-12 → "jueves 12 de noviembre de 2026". */
export function fechaLarga(f: string): string {
  const d = new Date(f + 'T00:00:00Z');
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export const hoyIso = () => {
  // Fecha en Bogotá (UTC-5, sin horario de verano).
  return iso(new Date(Date.now() - 5 * 3_600_000));
};
