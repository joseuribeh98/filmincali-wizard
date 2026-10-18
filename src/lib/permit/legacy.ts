/**
 * Reads requests saved before the model moved to English keys (solicitud.json files and
 * browser drafts from the first version). Anything already in the current shape passes through.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** A request from the first version has Spanish top-level keys. */
export const isLegacy = (v: unknown): v is Obj => isObj(v) && ('proyecto' in v || 'locaciones' in v || 'responsables' in v);

const VALUES: Record<string, Record<string, string>> = {
  personType: { juridica: 'legal' },
  idType: { pasaporte: 'passport' },
  activity: { montaje: 'setup', filmacion: 'shoot', desmontaje: 'teardown' },
  zone: { urbano: 'urban' },
  scale: { urbano: 'urban', anden: 'sidewalk' },
  projectType: { cine: 'film', publicidad: 'advertising', videoclip: 'music_video', otro: 'other' },
  subtype: { corto: 'short', medio: 'medium', largo: 'feature', serie: 'series', otro: 'other', corporativo: 'corporate', promocional: 'promotional', redes: 'social' },
  origin: { nacional: 'national', internacional: 'international', servicios: 'services' },
  exemption: { ninguna: 'none', academico: 'academic', comunitario: 'community', fondos: 'public_funds' },
  spaceType: { corredor_vial: 'road_corridor', andenes: 'sidewalks', parques: 'parks', alamedas: 'plazas', puentes: 'bridges', plazas_mercado: 'markets', ciclorrutas: 'bike_lanes' },
  closure: {
    veh_parcial_perm: 'vehicle_partial_permanent', veh_total_perm: 'vehicle_full_permanent',
    veh_parcial_inter: 'vehicle_partial_intermittent', veh_total_inter: 'vehicle_full_intermittent',
    pea_parcial_perm: 'pedestrian_partial_permanent', pea_total_perm: 'pedestrian_full_permanent',
    pea_parcial_inter: 'pedestrian_partial_intermittent', pea_total_inter: 'pedestrian_full_intermittent',
  },
  effect: { fuego: 'fire', lluvia: 'rain', luminicos: 'weather_lighting', disparos: 'gunfire', aire: 'compressed_air', explosiones: 'explosions', otro: 'other' },
  impact: { luz: 'light', sonido: 'sound', gases: 'emissions', vegetacion: 'vegetation', agua: 'water' },
  element: {
    automoviles: 'cars', automoviles_escena: 'picture_cars', vanes: 'vans', camiones: 'trucks', plantas: 'generators',
    moviles: 'mobile_units', camabajas: 'lowboys', carrotanques: 'tankers', maquinaria: 'heavy_machinery', motos: 'motorcycles',
    gruas: 'cranes', brazos: 'jibs', tripodes: 'tripods', luminotecnia: 'lighting_grip', andamios: 'scaffolding',
    carpas: 'tents', banos: 'portable_toilets', escenografia: 'scenery',
  },
};

const val = (kind: string, v: unknown) => (typeof v === 'string' ? VALUES[kind][v] ?? v : v);
const list = (kind: string, v: unknown) => (Array.isArray(v) ? v.map((x) => val(kind, x)) : v);
const o = (v: unknown): Obj => (isObj(v) ? v : {});

function person(p: unknown) {
  const x = o(p);
  return {
    personType: val('personType', x.tipoPersona),
    idType: val('idType', x.tipoDocumento),
    idNumber: x.documento,
    name: x.nombre,
    company: x.empresa,
    role: x.cargo,
    phone: x.telefono,
    email: x.correo,
  };
}

const noise = (v: unknown) => (isObj(v) ? { count: v.cantidad, type: v.tipo } : undefined);

function location(l: unknown) {
  const x = o(l);
  const m = isObj(x.movilidad) ? x.movilidad : null;
  const n = isObj(x.natural) ? x.natural : null;
  return {
    name: x.nombre,
    neighborhood: x.barrio,
    address: x.direccion,
    mapsUrl: x.mapsUrl,
    zone: val('zone', x.zona),
    use: x.uso,
    scale: val('scale', x.escala),
    spaceTypes: list('spaceType', x.tiposEspacio),
    areaM2: x.areaM2,
    elements: Object.fromEntries(Object.entries(o(x.elementos)).map(([k, v]) => [val('element', k), v])),
    sceneryNotes: x.escenografiaDesc,
    otherElements: x.otrosElementos,
    sessions: Array.isArray(x.jornadas)
      ? x.jornadas.map((j) => {
          const s = o(j);
          return { date: s.fecha, activity: val('activity', s.actividad), start: s.horaInicio, end: s.horaFin };
        })
      : x.jornadas,
    mobility: m && {
      closures: list('closure', m.afectaciones),
      direction: m.sentido,
      side: m.costado,
      affectsMio: m.afectaMio,
      pedestrianDetour: m.desvioPeatonal,
      transitDetour: m.desvioPublico,
      notifyTransitCompanies: m.socializarEmpresas,
      privateTrafficDetour: m.desvioParticular,
      trafficLights: m.semaforos,
      trafficLightsDetail: m.semaforosDetalle,
      implementation: m.implementacion,
      signage: m.senalizacion,
      loadingArea: m.cargueDescargue,
      parking: m.parqueo,
    },
    naturalArea: n && {
      areaName: n.nombreArea,
      activities: n.actividades,
      impacts: list('impact', n.impactos),
      impactDetail: n.impactoDetalle,
    },
  };
}

/** Converts a first-version request to the current shape. Validation happens afterwards with the schema. */
export function fromLegacy(input: unknown): unknown {
  if (!isLegacy(input)) return input;
  const s = input;
  const p = o(s.proyecto);
  const r = o(s.riesgos);
  const a = o(s.ambiental);
  const animals = isObj(r.animales) ? r.animales : null;
  const weapons = isObj(r.armas) ? r.armas : null;
  return {
    project: {
      name: p.nombre,
      type: val('projectType', p.tipo),
      typeOther: p.tipoOtro,
      subtype: val('subtype', p.subtipo),
      subtypeOther: p.subtipoOtro,
      campaign: p.campana,
      artist: p.artista,
      song: p.cancion,
      contentType: p.contenidoTipo,
      contentName: p.contenidoNombre,
      origin: val('origin', p.naturaleza),
      synopsis: p.sinopsis,
      scenes: p.escenas,
    },
    contacts: { production: person(o(s.responsables).filmacion), location: person(o(s.responsables).locacion) },
    applicantAddress: s.solicitanteDireccion,
    exemption: { type: val('exemption', o(s.exencion).tipo), entity: o(s.exencion).entidad },
    people: { crew: o(s.personas).equipo, extras: o(s.personas).extras, crowd: o(s.personas).aglomeracion },
    risks: {
      effects: list('effect', r.efectos),
      effectOther: r.efectoOtro,
      effectsDescription: r.efectosEscena,
      animals: animals && { type: animals.tipo, count: animals.cantidad, actions: animals.acciones, handling: animals.manejo },
      weapons: weapons && { types: weapons.tipos, count: weapons.cantidad, actions: weapons.acciones },
    },
    locations: Array.isArray(s.locaciones) ? s.locaciones.map(location) : s.locaciones,
    environment: {
      wasteTypes: a.residuosTipos,
      wasteStrategy: a.residuosEstrategia,
      amplification: noise(a.ruidoAmplificacion),
      generators: noise(a.ruidoPlantas),
      vehicles: noise(a.ruidoVehiculos),
      noiseMitigation: a.ruidoMitigacion,
      sensitiveSites: a.sensibles,
      acousticMeasures: a.medidasAcusticas,
    },
    outreach: { strategies: o(s.socializacion).estrategias, positiveImpact: o(s.socializacion).impactoPositivo },
    notification: { consent: o(s.notificacion).autoriza, email: o(s.notificacion).correo },
  };
}
