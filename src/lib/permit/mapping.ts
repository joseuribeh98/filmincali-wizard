/** Maps the model to the tags of each template (see tools/templates.py). Values are in Spanish: they go into the official forms. */
import { ELEMENTS, type Location, type Person, type PermitRequest } from './schema';
import { isNaturalArea, needsMobilityPlan, shootRange, sortedSessions, type FormCode } from './derive';
import { shortDate } from './calendar';

const CHECKED = '☒';
const UNCHECKED = '☐';
const box = (v: boolean) => (v ? CHECKED : UNCHECKED);
/** A field left blank on purpose (does not apply): keeps the line but is not flagged as pending. */
export const BLANK = '⁣';
/** Text the user still has to complete or check: rendered with a yellow highlight. */
export const TO_BE_DEFINED = 'Por definir';
const orNa = (v: string | number | undefined | null, fallback = 'No aplica') =>
  v === undefined || v === null || v === '' || v === 0 ? fallback : String(v);

const ID_LABEL = { cc: 'C.C.', nit: 'NIT', passport: 'Pasaporte', ce: 'C.E.' } as const;
const contactLine = (p: Person) =>
  [p.name, `${ID_LABEL[p.idType]} ${p.idNumber}`.trim(), p.role, p.phone, p.email].filter(Boolean).join('\n');

function person(prefix: string, p: Person) {
  return {
    [`${prefix}_natural`]: box(p.personType === 'natural'),
    [`${prefix}_legal`]: box(p.personType === 'legal'),
    [`${prefix}_nit`]: box(p.idType === 'nit'),
    [`${prefix}_cc`]: box(p.idType === 'cc'),
    [`${prefix}_passport`]: box(p.idType === 'passport'),
    [`${prefix}_ce`]: box(p.idType === 'ce'),
    [`${prefix}_id_number`]: p.idNumber,
    [`${prefix}_name`]: p.name,
    [`${prefix}_company`]: orNa(p.company),
    [`${prefix}_role`]: p.role,
    [`${prefix}_phone`]: p.phone,
    [`${prefix}_email`]: p.email,
  };
}

function common(s: PermitRequest) {
  return {
    project_name: s.project.name,
    production_line: contactLine(s.contacts.production),
    location_line: contactLine(s.contacts.location),
  };
}

function elements(l: Location) {
  const out: Record<string, string> = {};
  for (const [k] of ELEMENTS) out[`el_${k}`] = String(l.elements[k] ?? 0).padStart(2, '0');
  out.scenery_notes = l.sceneryNotes ? `: ${l.sceneryNotes}` : BLANK;
  out.other_elements = orNa(l.otherElements, 'Ninguno');
  return out;
}

function hours(l: Location) {
  const start = l.sessions.map((j) => j.start).sort()[0];
  const end = l.sessions.map((j) => j.end).sort().at(-1)!;
  return { start, end };
}

const ACTIVITY_LABEL = { setup: 'montaje', shoot: 'filmación', teardown: 'desmontaje' } as const;

const datesOf = (l: Location) => [...new Set(l.sessions.map((j) => j.date))].sort().map(shortDate).join(', ');

const scheduleOf = (l: Location) =>
  [...l.sessions]
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .map((j) => `${shortDate(j.date)} ${j.start} a ${j.end} (${ACTIVITY_LABEL[j.activity]})`)
    .join('; ');

function f004(s: PermitRequest) {
  const p = s.project;
  const sub = p.subtype;
  const r = shootRange(s);
  const fx = new Set(s.risks.effects);
  const an = s.risks.animals;
  const wp = s.risks.weapons;
  return {
    ...common(s),
    ...person('production', s.contacts.production),
    ...person('location', s.contacts.location),
    type_film: box(p.type === 'film'),
    type_tv: box(p.type === 'tv'),
    type_advertising: box(p.type === 'advertising'),
    type_web: box(p.type === 'web'),
    type_music_video: box(p.type === 'music_video'),
    type_other: box(p.type === 'other'),
    type_other_detail: p.type === 'other' ? p.typeOther : BLANK,
    film_short: box(p.type === 'film' && sub === 'short'),
    film_medium: box(p.type === 'film' && sub === 'medium'),
    film_feature: box(p.type === 'film' && sub === 'feature'),
    tv_series: box(p.type === 'tv' && sub === 'series'),
    tv_telenovela: box(p.type === 'tv' && sub === 'telenovela'),
    tv_reality: box(p.type === 'tv' && sub === 'reality'),
    tv_other: box(p.type === 'tv' && sub === 'other'),
    tv_other_detail: p.type === 'tv' && sub === 'other' ? p.subtypeOther : BLANK,
    ad_campaign: p.type === 'advertising' ? p.campaign : 'No aplica',
    ad_spot: box(p.type === 'advertising' && sub === 'spot'),
    ad_corporate: box(p.type === 'advertising' && sub === 'corporate'),
    ad_promotional: box(p.type === 'advertising' && sub === 'promotional'),
    ad_social: box(p.type === 'advertising' && sub === 'social'),
    ad_other: box(p.type === 'advertising' && sub === 'other'),
    ad_other_detail: p.type === 'advertising' && sub === 'other' ? p.subtypeOther : BLANK,
    mv_artist: p.type === 'music_video' ? p.artist : 'No aplica',
    mv_song: p.type === 'music_video' ? p.song : 'No aplica',
    web_type: p.type === 'web' ? p.contentType : 'No aplica',
    web_name: p.type === 'web' ? p.contentName : 'No aplica',
    origin_national: box(p.origin === 'national'),
    origin_international: box(p.origin === 'international'),
    origin_services: box(p.origin === 'services'),
    synopsis: p.synopsis,
    scenes: p.scenes,
    ex_institution: s.exemption.type === 'academic' ? s.exemption.entity : 'No aplica',
    ex_collective: s.exemption.type === 'community' ? s.exemption.entity : 'No aplica',
    ex_fund: s.exemption.type === 'public_funds' ? s.exemption.entity : 'No aplica',
    people_crew: String(s.people.crew),
    people_extras: String(s.people.extras),
    people_crowd: s.people.crowd ? String(s.people.crowd) : '0 (no genera aglomeración)',
    fx_fire: box(fx.has('fire')),
    fx_rain: box(fx.has('rain')),
    fx_weather_lighting: box(fx.has('weather_lighting')),
    fx_gunfire: box(fx.has('gunfire')),
    fx_compressed_air: box(fx.has('compressed_air')),
    fx_explosions: box(fx.has('explosions')),
    fx_other: box(fx.has('other')),
    fx_other_detail: fx.has('other') ? s.risks.effectOther : BLANK,
    fx_description: fx.size ? s.risks.effectsDescription : 'No aplica: la filmación no usa efectos especiales.',
    animal_type: an ? an.type : 'No aplica',
    animal_count: an ? String(an.count) : 'No aplica',
    animal_actions: an ? an.actions : 'No aplica: no hay animales en escena.',
    animal_handling: an ? an.handling : 'No aplica.',
    weapon_types: wp ? wp.types : 'No aplica',
    weapon_count: wp ? String(wp.count) : 'No aplica',
    weapon_actions: wp ? wp.actions : 'No aplica: no hay armamento en escena.',
    shoot_days: r ? String(r.shootDays) : '',
    shoot_dates: r ? (r.start === r.end ? shortDate(r.start) : `del ${shortDate(r.start)} al ${shortDate(r.end)}`) : '',
    sessions: sortedSessions(s).map((j) => ({
      date: shortDate(j.date),
      address: [j.location.address, j.location.neighborhood].filter(Boolean).join(', '),
      use: j.location.use === 'set' ? 'Set de filmación' : 'Base de producción',
      act_setup: box(j.activity === 'setup'),
      act_shoot: box(j.activity === 'shoot'),
      act_teardown: box(j.activity === 'teardown'),
      start: j.start,
      end: j.end,
    })),
    notify_yes: box(s.notification.consent),
    notify_no: box(!s.notification.consent),
    notify_email: s.notification.consent ? s.notification.email || s.contacts.production.email : BLANK,
    signature: '',
  };
}

function f005(s: PermitRequest) {
  return {
    ...common(s),
    locations: s.locations.map((l, i) => ({
      n: i + 1,
      name: l.name || l.address,
      neighborhood: l.neighborhood,
      address: l.address,
      maps: l.mapsUrl,
      dates: datesOf(l),
      schedule: scheduleOf(l),
      floor_plan: '[Pegue aquí el plano de piso del montaje: set, base de producción, zonas de equipos y parqueo]',
      area_m2: `${l.areaM2} m²`,
      ...elements(l),
    })),
  };
}

const SPACE_KEYS = ['road_corridor', 'sidewalks', 'parks', 'plazas', 'bridges', 'mio', 'markets', 'natural', 'bike_lanes'] as const;
const CLOSURE_KEYS = [
  'vehicle_partial_permanent', 'vehicle_full_permanent', 'vehicle_partial_intermittent', 'vehicle_full_intermittent',
  'pedestrian_partial_permanent', 'pedestrian_full_permanent', 'pedestrian_partial_intermittent', 'pedestrian_full_intermittent',
] as const;

function f006(s: PermitRequest) {
  return {
    ...common(s),
    locations: s.locations
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => needsMobilityPlan(l))
      .map(({ l, n }) => {
        const m = l.mobility;
        const closures = new Set(m?.closures ?? []);
        const spaces = new Set(l.spaceTypes);
        const yesNo = (k: string, v: boolean | undefined) => ({ [`${k}_yes`]: box(!!v), [`${k}_no`]: box(!v) });
        return {
          n,
          name: l.name || l.address,
          dates: datesOf(l),
          ...hours(l),
          use_set: box(l.use === 'set'),
          use_base: box(l.use === 'base'),
          zone_urban: box(l.zone === 'urban'),
          zone_rural: box(l.zone === 'rural'),
          neighborhood: l.neighborhood,
          address: l.address,
          place_description: l.name || l.address,
          ...Object.fromEntries(SPACE_KEYS.map((k) => [`space_${k}`, box(spaces.has(k))])),
          ...Object.fromEntries(CLOSURE_KEYS.map((k) => [`closure_${k}`, box(closures.has(k))])),
          direction: orNa(m?.direction),
          side: orNa(m?.side),
          maps: l.mapsUrl,
          map_screenshot: '[Pegue aquí el pantallazo de Google Maps en modo satélite con base, set y zona de parqueo]',
          ...elements(l),
          ...yesNo('mio', m?.affectsMio),
          implementation: orNa(m?.implementation, TO_BE_DEFINED),
          ...yesNo('pedestrian', m?.pedestrianDetour),
          ...yesNo('transit', m?.transitDetour),
          ...yesNo('companies', m?.notifyTransitCompanies),
          ...yesNo('private', m?.privateTrafficDetour),
          signage: orNa(m?.signage, TO_BE_DEFINED),
          loading: orNa(m?.loadingArea, TO_BE_DEFINED),
          ...yesNo('lights', m?.trafficLights),
          lights_detail: m?.trafficLights ? m.trafficLightsDetail : 'No aplica',
          parking: orNa(m?.parking, TO_BE_DEFINED),
        };
      }),
  };
}

function f007(s: PermitRequest) {
  const e = s.environment;
  const r = s.contacts.production;
  return {
    ...common(s),
    applicant_address: s.applicantAddress,
    applicant_id: `${ID_LABEL[r.idType]} ${r.idNumber}`,
    waste_types: e.wasteTypes,
    waste_strategy: e.wasteStrategy,
    people_crew: String(s.people.crew),
    people_extras: String(s.people.extras),
    people_crowd: s.people.crowd ? String(s.people.crowd) : '0',
    areas: s.locations
      .filter(isNaturalArea)
      .map((l, i) => {
        const impacts = new Set(l.naturalArea?.impacts ?? []);
        return {
          n: i + 1,
          area_name: l.naturalArea?.areaName || l.name,
          dates: datesOf(l),
          ...hours(l),
          use_set: box(l.use === 'set'),
          use_base: box(l.use === 'base'),
          zone_urban: box(l.zone === 'urban'),
          zone_rural: box(l.zone === 'rural'),
          neighborhood: l.neighborhood,
          address: l.address,
          maps: l.mapsUrl,
          activities: l.naturalArea?.activities ?? '',
          imp_light: box(impacts.has('light')),
          imp_sound: box(impacts.has('sound')),
          imp_emissions: box(impacts.has('emissions')),
          imp_vegetation: box(impacts.has('vegetation')),
          imp_water: box(impacts.has('water')),
          impact_detail: impacts.size ? l.naturalArea?.impactDetail ?? '' : 'No aplica: no se prevén impactos de este tipo.',
        };
      }),
    noise_amp_count: String(e.amplification.count),
    noise_amp_type: orNa(e.amplification.type),
    noise_gen_count: String(e.generators.count),
    noise_gen_type: orNa(e.generators.type),
    noise_veh_count: String(e.vehicles.count),
    noise_veh_type: orNa(e.vehicles.type),
    noise_other_type: BLANK,
    noise_mitigation: orNa(e.noiseMitigation),
    sensitive_sites: orNa(e.sensitiveSites, 'No se identifican instituciones sensibles cercanas.'),
    acoustic_measures: orNa(e.acousticMeasures),
  };
}

function f008(s: PermitRequest) {
  return {
    strategies: s.outreach.strategies,
    positive_impact: orNa(s.outreach.positiveImpact, 'No se contempla.'),
  };
}

export const MAPPINGS: Record<FormCode, (s: PermitRequest) => Record<string, unknown>> = {
  F004: f004,
  F005: f005,
  F006: f006,
  F007: f007,
  F008: f008,
};
