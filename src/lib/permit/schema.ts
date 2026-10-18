/**
 * Single model for a request to film in public space in Cali.
 * Each piece of data is asked once; the five official forms are derived from here.
 * Every repeatable entity (location, session) always has the same properties.
 *
 * Keys and enum values are in English. Labels are in Spanish because they are shown to users.
 */
import { z } from 'zod';

const text = z.string().trim().default('');
const count = z.coerce.number().int().min(0).default(0);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Usa el formato HH:MM');
const flag = z.boolean().default(false);

/** Elements that occupy public space, as listed in F005 and F006. */
export const ELEMENTS = [
  ['cars', 'Automóviles'],
  ['picture_cars', 'Automóviles en escena'],
  ['vans', 'Vanes'],
  ['buses', 'Buses'],
  ['trucks', 'Camiones'],
  ['generators', 'Plantas eléctricas'],
  ['trailers', 'Tráileres o motor home'],
  ['mobile_units', 'Móviles'],
  ['lowboys', 'Camabajas'],
  ['tankers', 'Carrotanques'],
  ['heavy_machinery', 'Maquinaria amarilla o azul'],
  ['motorcycles', 'Motos'],
  ['cranes', 'Grúas'],
  ['jibs', 'Brazos'],
  ['dolly', 'Dolly'],
  ['tripods', 'Trípodes'],
  ['lighting_grip', 'Luminotecnia y grip'],
  ['scaffolding', 'Andamios'],
  ['tents', 'Carpas'],
  ['portable_toilets', 'Baños portátiles'],
  ['scenery', 'Elementos de escenografía'],
] as const;

/** Public space scale (POT art. 247; on roads, the road hierarchy). Each one weighs differently in the fee. */
export const SCALES = [
  ['local', 'Local', 0.4],
  ['zonal', 'Zonal', 0.6],
  ['urban', 'Urbana', 0.8],
  ['regional', 'Regional', 1],
  ['sidewalk', 'Andén', 2],
] as const;

export type ElementKey = (typeof ELEMENTS)[number][0];

export const SPACE_TYPES = [
  ['road_corridor', 'Corredor vial'],
  ['sidewalks', 'Andenes, vías y pasos peatonales'],
  ['parks', 'Sistema de parques'],
  ['plazas', 'Alamedas, plazas y plazoletas'],
  ['bridges', 'Puentes peatonales y zonas bajas de puentes'],
  ['mio', 'Infraestructura del MIO'],
  ['markets', 'Plazas de mercado'],
  ['natural', 'Espacio público natural (ríos, ecoparques, áreas protegidas)'],
  ['bike_lanes', 'Ciclorrutas y ciclovías'],
] as const;
export type SpaceType = (typeof SPACE_TYPES)[number][0];

export const CLOSURES = [
  ['vehicle_partial_permanent', 'Cierre vehicular parcial permanente'],
  ['vehicle_full_permanent', 'Cierre vehicular total permanente'],
  ['vehicle_partial_intermittent', 'Cierre vehicular parcial intermitente'],
  ['vehicle_full_intermittent', 'Cierre vehicular total intermitente'],
  ['pedestrian_partial_permanent', 'Cierre peatonal parcial permanente'],
  ['pedestrian_full_permanent', 'Cierre peatonal total permanente'],
  ['pedestrian_partial_intermittent', 'Cierre peatonal parcial intermitente'],
  ['pedestrian_full_intermittent', 'Cierre peatonal total intermitente'],
] as const;

export const EFFECTS = [
  ['fire', 'Fuego'],
  ['rain', 'Lluvia (agua)'],
  ['weather_lighting', 'Climáticos lumínicos'],
  ['gunfire', 'Cargas dirigidas (disparos)'],
  ['compressed_air', 'Aire comprimido'],
  ['explosions', 'Explosiones'],
  ['other', 'Otro'],
] as const;

export const IMPACTS = [
  ['light', 'Intensidad lumínica alta'],
  ['sound', 'Intensidad sonora alta'],
  ['emissions', 'Emisión de gases alta'],
  ['vegetation', 'Alteración de vegetación o hábitat'],
  ['water', 'Cambios en un cuerpo de agua'],
] as const;

const keys = <T extends readonly (readonly [string, string])[]>(list: T) =>
  list.map(([k]) => k) as unknown as [T[number][0], ...T[number][0][]];

export const Person = z.object({
  personType: z.enum(['natural', 'legal']).default('natural'),
  /** cc: cédula de ciudadanía · nit: tax id · ce: cédula de extranjería. */
  idType: z.enum(['cc', 'nit', 'passport', 'ce']).default('cc'),
  idNumber: text,
  name: text,
  company: text,
  role: text,
  phone: text,
  email: text,
});

export const Session = z.object({
  date,
  activity: z.enum(['setup', 'shoot', 'teardown']).default('shoot'),
  start: time,
  end: time,
});

export const Mobility = z.object({
  closures: z.array(z.enum(keys(CLOSURES))).default([]),
  direction: text,
  side: text,
  affectsMio: flag,
  pedestrianDetour: flag,
  transitDetour: flag,
  notifyTransitCompanies: flag,
  privateTrafficDetour: flag,
  trafficLights: flag,
  trafficLightsDetail: text,
  implementation: text,
  signage: text,
  loadingArea: text,
  parking: text,
});

export const Location = z.object({
  name: text,
  neighborhood: text,
  address: text,
  mapsUrl: text,
  zone: z.enum(['urban', 'rural']).default('urban'),
  use: z.enum(['set', 'base']).default('set'),
  scale: z.enum(['local', 'zonal', 'urban', 'regional', 'sidewalk']).default('local'),
  spaceTypes: z.array(z.enum(keys(SPACE_TYPES))).default([]),
  areaM2: count,
  elements: z.partialRecord(z.enum(keys(ELEMENTS)), z.coerce.number().int().min(0)).default({}),
  sceneryNotes: text,
  otherElements: text,
  sessions: z.array(Session).min(1, 'Cada locación necesita al menos una jornada'),
  /** Only when there are closures or the location uses a road, sidewalk or bike lane. */
  mobility: Mobility.nullable().default(null),
  /** Only for natural public space. */
  naturalArea: z
    .object({
      areaName: text,
      activities: text,
      impacts: z.array(z.enum(keys(IMPACTS))).default([]),
      impactDetail: text,
    })
    .nullable()
    .default(null),
});

const noiseSource = z.object({ count, type: text });

export const PermitRequest = z.object({
  project: z.object({
    name: text,
    type: z.enum(['film', 'tv', 'advertising', 'web', 'music_video', 'other']).default('film'),
    typeOther: text,
    /** film: short|medium|feature · tv: series|telenovela|reality|other · advertising: spot|corporate|promotional|social|other */
    subtype: text,
    subtypeOther: text,
    campaign: text,
    artist: text,
    song: text,
    contentType: text,
    contentName: text,
    origin: z.enum(['national', 'international', 'services']).default('national'),
    synopsis: text,
    scenes: text,
  }),
  /** The two people the city contacts: who runs the shoot and who handles the location and the community. */
  contacts: z.object({ production: Person, location: Person }),
  applicantAddress: text,
  exemption: z.object({
    type: z.enum(['none', 'academic', 'community', 'public_funds']).default('none'),
    entity: text,
  }),
  people: z.object({ crew: count, extras: count, crowd: count }),
  risks: z.object({
    effects: z.array(z.enum(keys(EFFECTS))).default([]),
    effectOther: text,
    effectsDescription: text,
    animals: z.object({ type: text, count, actions: text, handling: text }).nullable().default(null),
    weapons: z.object({ types: text, count, actions: text }).nullable().default(null),
  }),
  locations: z.array(Location).min(1, 'Agrega al menos una locación'),
  environment: z.object({
    wasteTypes: text,
    wasteStrategy: text,
    amplification: noiseSource,
    generators: noiseSource,
    vehicles: noiseSource,
    noiseMitigation: text,
    sensitiveSites: text,
    acousticMeasures: text,
  }),
  outreach: z.object({ strategies: text, positiveImpact: text }),
  notification: z.object({ consent: z.boolean().default(true), email: text }),
});

export type Person = z.infer<typeof Person>;
export type Session = z.infer<typeof Session>;
export type Location = z.infer<typeof Location>;
export type Mobility = z.infer<typeof Mobility>;
export type PermitRequest = z.infer<typeof PermitRequest>;
export type PermitRequestInput = z.input<typeof PermitRequest>;
