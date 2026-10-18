import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import example from '../src/lib/permit/example.json';
import {
  buildPackage, deadlines, estimateFee, fromLegacy, holidays, PermitRequest, requiredForms, subtractBusinessDays,
} from '../src/lib/permit';

const loadTemplate = (code: string) => readFile(`public/templates/${code}.docx`);
const text = (bytes: Uint8Array) =>
  new PizZip(bytes).file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');

describe('calendar', () => {
  it('knows the 2026 Colombian holidays', () => {
    const h = holidays(2026);
    for (const d of ['2026-01-01', '2026-01-12', '2026-04-02', '2026-04-03', '2026-05-18', '2026-06-08', '2026-06-15', '2026-07-20', '2026-08-07', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25'])
      expect(h.has(d), d).toBe(true);
  });
  it('subtracts 20 business days skipping holidays', () => {
    expect(subtractBusinessDays('2026-12-05', 20)).toBe('2026-11-06');
  });
  it('classifies the deadline status', () => {
    expect(deadlines('2026-12-05', '2026-10-15').status).toBe('on-time');
    expect(deadlines('2026-12-05', '2026-11-20').status).toBe('late');
    expect(deadlines('2027-06-01', '2026-10-15').status).toBe('early');
  });
});

describe('generation', () => {
  it('asks for a mobility plan only when a road is affected', () => {
    const s = PermitRequest.parse(example);
    expect(requiredForms(s)).toEqual(['F004', 'F005', 'F006', 'F007', 'F008']);
    const offRoad = structuredClone(s);
    offRoad.locations = [offRoad.locations[1]];
    expect(requiredForms(offRoad)).not.toContain('F006');
  });

  it('fills the five forms without leftover tags', async () => {
    const pkg = await buildPackage(example, loadTemplate, '2026-10-15');
    expect(pkg.files).toHaveLength(5);
    for (const f of pkg.files) {
      const t = text(f.bytes);
      expect(t, f.code).not.toMatch(/\{[#/^]?[a-z_0-9]+(\|\d+)?\}/);
      expect(t, f.code).not.toMatch(/[⁣]/);
    }
    const f004 = text(pkg.files[0].bytes);
    expect(f004).toContain('Brisa de Río (videoclip de ejemplo)');
    expect(f004).toContain('☒Videos musicales');
    expect(f004.match(/Hora Inicial/g)).toHaveLength(4); // 4 sessions
    const f006 = text(pkg.files.find((f) => f.code === 'F006')!.bytes);
    expect(f006.match(/Espacio público \d+:/g)).toHaveLength(1);
    const f007 = text(pkg.files.find((f) => f.code === 'F007')!.bytes);
    expect(f007).toContain('Nombre del área natural 1: Río Pance');
    expect(pkg.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('keeps the form line and highlights what is pending', async () => {
    const data = structuredClone(example);
    data.contacts.production.phone = '';
    const pkg = await buildPackage(data, loadTemplate, '2026-10-15');
    const xml = new PizZip(pkg.files[0].bytes).file('word/document.xml')!.asText();
    const t = xml.replace(/<[^>]+>/g, '');
    // The value stays on the original line and the empty phone becomes a highlighted line.
    expect(t).toMatch(/Nombre completo: Ana Ejemplo_{10,}/);
    expect(t).toMatch(/Teléfono de contacto: _{40,}/);
    const highlights = xml.match(/<w:highlight w:val="yellow"\/>/g) ?? [];
    expect(highlights.length).toBe(2); // phone and signature
  });
});

describe('fee', () => {
  it('applies VR = (A × D × Esc × UVT) / 12 with the heaviest scale', () => {
    const e = estimateFee(PermitRequest.parse(example))!;
    // (120 m² × 1 day + 40 m² × 1 day) × 2 (sidewalk) × 52,374 / 12
    expect(e.squareMeterDays).toBe(160);
    expect(e.scale.weight).toBe(2);
    expect(e.amount).toBe(Math.round((160 * 2 * 52_374) / 12));
  });
});

describe('first-version files', () => {
  it('reads a request saved with Spanish keys', async () => {
    const legacy = {
      proyecto: { nombre: 'Corto', tipo: 'cine', subtipo: 'corto', naturaleza: 'nacional', sinopsis: 's', escenas: 'e' },
      responsables: {
        filmacion: { tipoPersona: 'juridica', tipoDocumento: 'nit', documento: '1', nombre: 'A', cargo: 'P', telefono: '3', correo: 'a@b.co' },
        locacion: { tipoPersona: 'natural', tipoDocumento: 'pasaporte', documento: '2', nombre: 'B', telefono: '4', correo: 'b@b.co' },
      },
      exencion: { tipo: 'academico', entidad: 'Universidad' },
      personas: { equipo: 5, extras: 0, aglomeracion: 0 },
      riesgos: { efectos: ['lluvia'], efectosEscena: 'Lluvia artificial' },
      locaciones: [{
        nombre: 'Parque', barrio: 'Centro', direccion: 'Calle 1', zona: 'urbano', escala: 'anden', tiposEspacio: ['andenes', 'parques'],
        areaM2: 30, elementos: { vanes: 1, plantas: 2 },
        jornadas: [{ fecha: '2026-12-05', actividad: 'montaje', horaInicio: '07:00', horaFin: '09:00' }],
        movilidad: { afectaciones: ['pea_parcial_inter'], implementacion: 'Conos' },
      }],
      ambiental: { residuosEstrategia: 'Reciclaje', ruidoAmplificacion: { cantidad: 0 }, ruidoPlantas: { cantidad: 2 }, ruidoVehiculos: { cantidad: 1 } },
      socializacion: { estrategias: 'Volanteo' },
      notificacion: { autoriza: true, correo: 'a@b.co' },
    };
    const s = PermitRequest.parse(fromLegacy(legacy));
    expect(s.project).toMatchObject({ type: 'film', subtype: 'short', origin: 'national' });
    expect(s.contacts.production).toMatchObject({ personType: 'legal', idType: 'nit', email: 'a@b.co' });
    expect(s.contacts.location.idType).toBe('passport');
    expect(s.exemption).toEqual({ type: 'academic', entity: 'Universidad' });
    expect(s.risks.effects).toEqual(['rain']);
    const l = s.locations[0];
    expect(l).toMatchObject({ zone: 'urban', scale: 'sidewalk', spaceTypes: ['sidewalks', 'parks'], elements: { vans: 1, generators: 2 } });
    expect(l.sessions[0]).toEqual({ date: '2026-12-05', activity: 'setup', start: '07:00', end: '09:00' });
    expect(l.mobility?.closures).toEqual(['pedestrian_partial_intermittent']);
    expect(s.environment.generators.count).toBe(2);
    const pkg = await buildPackage(legacy, loadTemplate, '2026-10-15');
    expect(pkg.files.map((f) => f.code)).toEqual(['F004', 'F005', 'F006', 'F007', 'F008']);
  });
});
