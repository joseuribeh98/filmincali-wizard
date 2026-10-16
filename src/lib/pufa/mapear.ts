/** Traduce el modelo a los tags de cada plantilla (tools/plantillas.py). */
import { ELEMENTOS, type Locacion, type Persona, type Solicitud } from './schema';
import { esNatural, jornadasOrdenadas, necesitaMovilidad, rangoRodaje, type CodigoFormato } from './derivar';
import { fechaCorta } from './calendario';

const X = '☒';
const O = '☐';
const cb = (v: boolean) => (v ? X : O);
const na = (v: string | number | undefined | null, vacio = 'No aplica') =>
  v === undefined || v === null || v === '' || v === 0 ? vacio : String(v);

const DOC = { cc: 'C.C.', nit: 'NIT', pasaporte: 'Pasaporte', ce: 'C.E.' } as const;
const linea = (p: Persona) =>
  [p.nombre, `${DOC[p.tipoDocumento]} ${p.documento}`.trim(), p.cargo, p.telefono, p.correo].filter(Boolean).join('\n');

function persona(prefix: string, p: Persona) {
  return {
    [`${prefix}_natural`]: cb(p.tipoPersona === 'natural'),
    [`${prefix}_juridica`]: cb(p.tipoPersona === 'juridica'),
    [`${prefix}_nit`]: cb(p.tipoDocumento === 'nit'),
    [`${prefix}_cc`]: cb(p.tipoDocumento === 'cc'),
    [`${prefix}_pasaporte`]: cb(p.tipoDocumento === 'pasaporte'),
    [`${prefix}_ce`]: cb(p.tipoDocumento === 'ce'),
    [`${prefix}_documento`]: p.documento,
    [`${prefix}_nombre`]: p.nombre,
    [`${prefix}_empresa`]: na(p.empresa),
    [`${prefix}_cargo`]: p.cargo,
    [`${prefix}_telefono`]: p.telefono,
    [`${prefix}_correo`]: p.correo,
  };
}

function comunes(s: Solicitud) {
  return {
    proyecto_nombre: s.proyecto.nombre,
    resp1_linea: linea(s.responsables.filmacion),
    resp2_linea: linea(s.responsables.locacion),
  };
}

function elementos(l: Locacion) {
  const out: Record<string, string> = {};
  for (const [k] of ELEMENTOS) out[`el_${k}`] = String(l.elementos[k] ?? 0).padStart(2, '0');
  out.escenografia_desc = l.escenografiaDesc ? `: ${l.escenografiaDesc}` : '';
  out.otros_elementos = na(l.otrosElementos, 'Ninguno');
  return out;
}

function horario(l: Locacion) {
  const ini = l.jornadas.map((j) => j.horaInicio).sort()[0];
  const fin = l.jornadas.map((j) => j.horaFin).sort().at(-1)!;
  return { hora_inicio: ini, hora_fin: fin };
}

const fechasDe = (l: Locacion) => [...new Set(l.jornadas.map((j) => j.fecha))].sort().map(fechaCorta).join(', ');

const detalleJornadas = (l: Locacion) =>
  [...l.jornadas]
    .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio))
    .map((j) => `${fechaCorta(j.fecha)} ${j.horaInicio} a ${j.horaFin} (${j.actividad})`)
    .join('; ');

function f004(s: Solicitud) {
  const p = s.proyecto;
  const sub = p.subtipo;
  const r = rangoRodaje(s);
  const fx = new Set(s.riesgos.efectos);
  const an = s.riesgos.animales;
  const ar = s.riesgos.armas;
  return {
    ...comunes(s),
    ...persona('r1', s.responsables.filmacion),
    ...persona('r2', s.responsables.locacion),
    tipo_cine: cb(p.tipo === 'cine'),
    tipo_tv: cb(p.tipo === 'tv'),
    tipo_publicidad: cb(p.tipo === 'publicidad'),
    tipo_web: cb(p.tipo === 'web'),
    tipo_videoclip: cb(p.tipo === 'videoclip'),
    tipo_otro: cb(p.tipo === 'otro'),
    tipo_otro_cual: p.tipo === 'otro' ? p.tipoOtro : '',
    cine_corto: cb(p.tipo === 'cine' && sub === 'corto'),
    cine_medio: cb(p.tipo === 'cine' && sub === 'medio'),
    cine_largo: cb(p.tipo === 'cine' && sub === 'largo'),
    tv_serie: cb(p.tipo === 'tv' && sub === 'serie'),
    tv_telenovela: cb(p.tipo === 'tv' && sub === 'telenovela'),
    tv_reality: cb(p.tipo === 'tv' && sub === 'reality'),
    tv_otro: cb(p.tipo === 'tv' && sub === 'otro'),
    tv_otro_cual: p.tipo === 'tv' && sub === 'otro' ? p.subtipoOtro : '',
    pub_campana: p.tipo === 'publicidad' ? p.campana : 'No aplica',
    pub_spot: cb(p.tipo === 'publicidad' && sub === 'spot'),
    pub_corporativo: cb(p.tipo === 'publicidad' && sub === 'corporativo'),
    pub_promocional: cb(p.tipo === 'publicidad' && sub === 'promocional'),
    pub_redes: cb(p.tipo === 'publicidad' && sub === 'redes'),
    pub_otro: cb(p.tipo === 'publicidad' && sub === 'otro'),
    pub_otro_cual: p.tipo === 'publicidad' && sub === 'otro' ? p.subtipoOtro : '',
    vc_artista: p.tipo === 'videoclip' ? p.artista : 'No aplica',
    vc_cancion: p.tipo === 'videoclip' ? p.cancion : 'No aplica',
    web_tipo: p.tipo === 'web' ? p.contenidoTipo : 'No aplica',
    web_nombre: p.tipo === 'web' ? p.contenidoNombre : 'No aplica',
    nat_nacional: cb(p.naturaleza === 'nacional'),
    nat_internacional: cb(p.naturaleza === 'internacional'),
    nat_servicios: cb(p.naturaleza === 'servicios'),
    sinopsis: p.sinopsis,
    escenas: p.escenas,
    ex_institucion: s.exencion.tipo === 'academico' ? s.exencion.entidad : 'No aplica',
    ex_colectivo: s.exencion.tipo === 'comunitario' ? s.exencion.entidad : 'No aplica',
    ex_fondo: s.exencion.tipo === 'fondos' ? s.exencion.entidad : 'No aplica',
    personas_equipo: String(s.personas.equipo),
    personas_extras: String(s.personas.extras),
    personas_aglomeracion: s.personas.aglomeracion ? String(s.personas.aglomeracion) : '0 (no genera aglomeración)',
    fx_fuego: cb(fx.has('fuego')),
    fx_lluvia: cb(fx.has('lluvia')),
    fx_luminicos: cb(fx.has('luminicos')),
    fx_disparos: cb(fx.has('disparos')),
    fx_aire: cb(fx.has('aire')),
    fx_explosiones: cb(fx.has('explosiones')),
    fx_otro: cb(fx.has('otro')),
    fx_otro_cual: fx.has('otro') ? s.riesgos.efectoOtro : '',
    fx_escena: fx.size ? s.riesgos.efectosEscena : 'No aplica: la filmación no usa efectos especiales.',
    an_tipo: an ? an.tipo : 'No aplica',
    an_cantidad: an ? String(an.cantidad) : 'No aplica',
    an_acciones: an ? an.acciones : 'No aplica: no hay animales en escena.',
    an_manejo: an ? an.manejo : 'No aplica.',
    ar_tipos: ar ? ar.tipos : 'No aplica',
    ar_cantidad: ar ? String(ar.cantidad) : 'No aplica',
    ar_acciones: ar ? ar.acciones : 'No aplica: no hay armamento en escena.',
    rodaje_dias: r ? String(r.diasRodaje) : '',
    rodaje_fechas: r ? (r.inicio === r.fin ? fechaCorta(r.inicio) : `del ${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)}`) : '',
    jornadas: jornadasOrdenadas(s).map((j) => ({
      fecha: fechaCorta(j.fecha),
      direccion: [j.locacion.direccion, j.locacion.barrio].filter(Boolean).join(', '),
      uso: j.locacion.uso === 'set' ? 'Set de filmación' : 'Base de producción',
      act_montaje: cb(j.actividad === 'montaje'),
      act_filmacion: cb(j.actividad === 'filmacion'),
      act_desmontaje: cb(j.actividad === 'desmontaje'),
      hora_inicio: j.horaInicio,
      hora_fin: j.horaFin,
    })),
    notif_si: cb(s.notificacion.autoriza),
    notif_no: cb(!s.notificacion.autoriza),
    notif_correo: s.notificacion.autoriza ? s.notificacion.correo || s.responsables.filmacion.correo : '',
    firma: '______________________',
  };
}

function f005(s: Solicitud) {
  return {
    ...comunes(s),
    locaciones: s.locaciones.map((l, i) => ({
      n: i + 1,
      nombre: l.nombre || l.direccion,
      barrio: l.barrio,
      direccion: l.direccion,
      maps: l.mapsUrl,
      fechas: fechasDe(l),
      horario: detalleJornadas(l),
      plano: '[Pegue aquí el plano de piso del montaje: set, base de producción, zonas de equipos y parqueo]',
      area_m2: `${l.areaM2} m²`,
      ...elementos(l),
    })),
  };
}

function f006(s: Solicitud) {
  return {
    ...comunes(s),
    locaciones: s.locaciones
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => necesitaMovilidad(l))
      .map(({ l, n }) => {
        const m = l.movilidad;
        const af = new Set(m?.afectaciones ?? []);
        const esp = new Set(l.tiposEspacio);
        const sn = (k: string, v: boolean | undefined) => ({ [`${k}_si`]: cb(!!v), [`${k}_no`]: cb(!v) });
        return {
          n,
          nombre: l.nombre || l.direccion,
          fechas: fechasDe(l),
          ...horario(l),
          uso_set: cb(l.uso === 'set'),
          uso_base: cb(l.uso === 'base'),
          zona_urbano: cb(l.zona === 'urbano'),
          zona_rural: cb(l.zona === 'rural'),
          barrio: l.barrio,
          direccion: l.direccion,
          descripcion_lugar: l.nombre || l.direccion,
          ...Object.fromEntries(
            ['corredor_vial', 'andenes', 'parques', 'alamedas', 'puentes', 'mio', 'plazas_mercado', 'natural', 'ciclorrutas'].map((k) => [`esp_${k}`, cb(esp.has(k as never))]),
          ),
          ...Object.fromEntries(
            ['veh_parcial_perm', 'veh_total_perm', 'veh_parcial_inter', 'veh_total_inter', 'pea_parcial_perm', 'pea_total_perm', 'pea_parcial_inter', 'pea_total_inter'].map((k) => [`af_${k}`, cb(af.has(k as never))]),
          ),
          sentido: na(m?.sentido),
          costado: na(m?.costado),
          maps: l.mapsUrl,
          esquema: '[Pegue aquí el pantallazo de Google Maps en modo satélite con base, set y zona de parqueo]',
          ...elementos(l),
          ...sn('mio', m?.afectaMio),
          implementacion: na(m?.implementacion, 'Por definir'),
          ...sn('peatonal', m?.desvioPeatonal),
          ...sn('publico', m?.desvioPublico),
          ...sn('socializar', m?.socializarEmpresas),
          ...sn('particular', m?.desvioParticular),
          senalizacion: na(m?.senalizacion, 'Por definir'),
          cargue: na(m?.cargueDescargue, 'Por definir'),
          ...sn('semaforos', m?.semaforos),
          semaforos_detalle: m?.semaforos ? m.semaforosDetalle : 'No aplica',
          parqueo: na(m?.parqueo, 'Por definir'),
        };
      }),
  };
}

function f007(s: Solicitud) {
  const a = s.ambiental;
  const r = s.responsables.filmacion;
  return {
    ...comunes(s),
    solicitante_direccion: s.solicitanteDireccion,
    solicitante_documento: `${DOC[r.tipoDocumento]} ${r.documento}`,
    residuos_tipos: a.residuosTipos,
    residuos_estrategia: a.residuosEstrategia,
    personas_equipo: String(s.personas.equipo),
    personas_extras: String(s.personas.extras),
    personas_aglomeracion: s.personas.aglomeracion ? String(s.personas.aglomeracion) : '0',
    areas: s.locaciones
      .filter(esNatural)
      .map((l, i) => {
        const imp = new Set(l.natural?.impactos ?? []);
        return {
          n: i + 1,
          nombre_area: l.natural?.nombreArea || l.nombre,
          fechas: fechasDe(l),
          ...horario(l),
          uso_set: cb(l.uso === 'set'),
          uso_base: cb(l.uso === 'base'),
          zona_urbano: cb(l.zona === 'urbano'),
          zona_rural: cb(l.zona === 'rural'),
          barrio: l.barrio,
          direccion: l.direccion,
          maps: l.mapsUrl,
          actividades: l.natural?.actividades ?? '',
          imp_luz: cb(imp.has('luz')),
          imp_sonido: cb(imp.has('sonido')),
          imp_gases: cb(imp.has('gases')),
          imp_vegetacion: cb(imp.has('vegetacion')),
          imp_agua: cb(imp.has('agua')),
          impacto_detalle: imp.size ? l.natural?.impactoDetalle ?? '' : 'No aplica: no se prevén impactos de este tipo.',
        };
      }),
    ruido_amp_cantidad: String(a.ruidoAmplificacion.cantidad),
    ruido_amp_tipo: na(a.ruidoAmplificacion.tipo),
    ruido_plantas_cantidad: String(a.ruidoPlantas.cantidad),
    ruido_plantas_tipo: na(a.ruidoPlantas.tipo),
    ruido_veh_cantidad: String(a.ruidoVehiculos.cantidad),
    ruido_veh_tipo: na(a.ruidoVehiculos.tipo),
    ruido_otro_tipo: '',
    ruido_mitigacion: na(a.ruidoMitigacion),
    sensibles: na(a.sensibles, 'No se identifican instituciones sensibles cercanas.'),
    medidas_acusticas: na(a.medidasAcusticas),
  };
}

function f008(s: Solicitud) {
  return {
    estrategias: s.socializacion.estrategias,
    impacto_positivo: na(s.socializacion.impactoPositivo, 'No se contempla.'),
  };
}

export const MAPEOS: Record<CodigoFormato, (s: Solicitud) => Record<string, unknown>> = {
  F004: f004,
  F005: f005,
  F006: f006,
  F007: f007,
  F008: f008,
};
