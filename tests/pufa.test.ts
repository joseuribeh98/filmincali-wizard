import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import ejemplo from '../src/lib/pufa/ejemplo.json';
import { generarPaquete, plazos, festivos, restarHabiles, Solicitud, formatosRequeridos } from '../src/lib/pufa';

const cargar = (c: string) => readFile(`public/plantillas/${c}.docx`);
const texto = (bytes: Uint8Array) =>
  new PizZip(bytes).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');

describe('calendario', () => {
  it('conoce festivos colombianos 2026', () => {
    const f = festivos(2026);
    for (const d of ['2026-01-01', '2026-01-12', '2026-04-02', '2026-04-03', '2026-05-18', '2026-06-08', '2026-06-15', '2026-07-20', '2026-08-07', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25'])
      expect(f.has(d), d).toBe(true);
  });
  it('resta 20 hábiles saltando festivos', () => {
    expect(restarHabiles('2026-12-05', 20)).toBe('2026-11-06');
  });
  it('clasifica el estado del plazo', () => {
    expect(plazos('2026-12-05', '2026-10-15').estado).toBe('a-tiempo');
    expect(plazos('2026-12-05', '2026-11-20').estado).toBe('tarde');
    expect(plazos('2027-06-01', '2026-10-15').estado).toBe('temprano');
  });
});

describe('generación', () => {
  it('pide plan de movilidad solo si hay afectación vial', () => {
    const s = Solicitud.parse(ejemplo);
    expect(formatosRequeridos(s)).toEqual(['F004', 'F005', 'F006', 'F007', 'F008']);
    const sinVia = structuredClone(s);
    sinVia.locaciones = [sinVia.locaciones[1]];
    expect(formatosRequeridos(sinVia)).not.toContain('F006');
  });

  it('llena los cinco formatos sin dejar tags', async () => {
    const r = await generarPaquete(ejemplo, cargar, '2026-10-15');
    expect(r.archivos).toHaveLength(5);
    for (const a of r.archivos) {
      const t = texto(a.bytes);
      expect(t, a.codigo).not.toMatch(/\{[#/^]?[a-z_0-9]+(\|\d+)?\}/);
      expect(t, a.codigo).not.toMatch(/[\ue000\ue001\u2063]/);
    }
    const f004 = texto(r.archivos[0].bytes);
    expect(f004).toContain('Brisa de Río (videoclip de ejemplo)');
    expect(f004).toContain('☒Videos musicales');
    expect(f004.match(/Hora Inicial/g)).toHaveLength(4); // 4 jornadas
    const f006 = texto(r.archivos.find((a) => a.codigo === 'F006')!.bytes);
    expect(f006.match(/Espacio público \d+:/g)).toHaveLength(1);
    const f007 = texto(r.archivos.find((a) => a.codigo === 'F007')!.bytes);
    expect(f007).toContain('Nombre del área natural 1: Río Pance');
    expect(r.avisos.filter((a) => a.nivel === 'error')).toEqual([]);
  });

  it('conserva la línea del formato y resalta lo pendiente', async () => {
    const datos = structuredClone(ejemplo);
    datos.responsables.filmacion.telefono = '';
    const r = await generarPaquete(datos, cargar, '2026-10-15');
    const xml = new PizZip(r.archivos[0].bytes).file('word/document.xml')!.asText();
    const t = xml.replace(/<[^>]+>/g, '');
    // El valor sigue en la línea original y el teléfono vacío queda como línea resaltada.
    expect(t).toMatch(/Nombre completo: Ana Ejemplo_{10,}/);
    expect(t).toMatch(/Teléfono de contacto: _{40,}/);
    const resaltados = xml.match(/<w:highlight w:val="yellow"\/>/g) ?? [];
    expect(resaltados.length).toBe(2); // teléfono y firma
  });
});

describe('retribución', () => {
  it('aplica VR = (A × D × Esc × UVT) / 12 con la escala de mayor peso', async () => {
    const { estimarRetribucion } = await import('../src/lib/pufa');
    const e = estimarRetribucion(Solicitud.parse(ejemplo))!;
    // (120 m² × 1 día + 40 m² × 1 día) × 2 (andén) × 52.374 / 12
    expect(e.metrosDia).toBe(160);
    expect(e.escala.peso).toBe(2);
    expect(e.valor).toBe(Math.round((160 * 2 * 52_374) / 12));
  });
});
