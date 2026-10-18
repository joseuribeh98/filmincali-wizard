/** Wizard state: an empty request with the same shape as the model. */
import type { Location, Mobility, Person, PermitRequestInput, Session } from '../lib/permit/schema';
import { fromLegacy } from '../lib/permit/legacy';

export const emptyPerson = (): Person => ({
  personType: 'natural', idType: 'cc', idNumber: '', name: '', company: '', role: '', phone: '', email: '',
});

export const emptySession = (date = ''): Session => ({ date, activity: 'shoot', start: '08:00', end: '18:00' });

export const emptyMobility = (): Mobility => ({
  closures: [], direction: '', side: '', affectsMio: false, pedestrianDetour: false, transitDetour: false,
  notifyTransitCompanies: false, privateTrafficDetour: false, trafficLights: false, trafficLightsDetail: '', implementation: '',
  signage: '', loadingArea: '', parking: '',
});

export const emptyNaturalArea = () => ({ areaName: '', activities: '', impacts: [] as string[], impactDetail: '' });

export const emptyLocation = (): Location => ({
  name: '', neighborhood: '', address: '', mapsUrl: '', zone: 'urban', use: 'set', scale: 'local', spaceTypes: [], areaM2: 0,
  elements: {}, sceneryNotes: '', otherElements: '', sessions: [emptySession()], mobility: null, naturalArea: null,
});

type NoiseSource = { count: number; type: string };

export type WizardState = {
  project: {
    name: string; type: string; typeOther: string; subtype: string; subtypeOther: string; campaign: string;
    artist: string; song: string; contentType: string; contentName: string; origin: string;
    synopsis: string; scenes: string;
  };
  contacts: { production: Person; location: Person };
  applicantAddress: string;
  exemption: { type: string; entity: string };
  people: { crew: number; extras: number; crowd: number };
  risks: {
    effects: string[]; effectOther: string; effectsDescription: string;
    animals: { type: string; count: number; actions: string; handling: string } | null;
    weapons: { types: string; count: number; actions: string } | null;
  };
  locations: Location[];
  environment: {
    wasteTypes: string; wasteStrategy: string;
    amplification: NoiseSource; generators: NoiseSource; vehicles: NoiseSource;
    noiseMitigation: string; sensitiveSites: string; acousticMeasures: string;
  };
  outreach: { strategies: string; positiveImpact: string };
  notification: { consent: boolean; email: string };
};

export const emptyState = (): WizardState => ({
  project: {
    name: '', type: 'film', typeOther: '', subtype: '', subtypeOther: '', campaign: '', artist: '', song: '',
    contentType: '', contentName: '', origin: 'national', synopsis: '', scenes: '',
  },
  contacts: { production: emptyPerson(), location: emptyPerson() },
  applicantAddress: '',
  exemption: { type: 'none', entity: '' },
  people: { crew: 0, extras: 0, crowd: 0 },
  risks: { effects: [], effectOther: '', effectsDescription: '', animals: null, weapons: null },
  locations: [emptyLocation()],
  environment: {
    wasteTypes: '', wasteStrategy: '',
    amplification: { count: 0, type: '' }, generators: { count: 0, type: '' }, vehicles: { count: 0, type: '' },
    noiseMitigation: '', sensitiveSites: '', acousticMeasures: '',
  },
  outreach: { strategies: '', positiveImpact: '' },
  notification: { consent: true, email: '' },
});

/**
 * Deep-merges a loaded JSON over the empty state so missing fields are tolerated.
 * Files from the first version (Spanish keys) are converted first.
 */
export function hydrate(data: unknown): WizardState {
  const base = emptyState() as unknown as Record<string, unknown>;
  const merge = (a: unknown, b: unknown): unknown => {
    if (Array.isArray(b)) return b;
    if (b && typeof b === 'object' && a && typeof a === 'object' && !Array.isArray(a)) {
      const out: Record<string, unknown> = { ...(a as object) };
      for (const [k, v] of Object.entries(b)) out[k] = merge((a as Record<string, unknown>)[k], v);
      return out;
    }
    return b === undefined ? a : b;
  };
  const s = merge(base, fromLegacy(data)) as WizardState;
  s.locations = (s.locations?.length ? s.locations : [emptyLocation()]).map(
    (l) => merge(emptyLocation(), l) as Location,
  );
  return s;
}

export const asRequest = (s: WizardState) => s as unknown as PermitRequestInput;

export type Path = (string | number)[];

export function setIn<T>(obj: T, path: Path, value: unknown): T {
  const copy = structuredClone(obj) as Record<string | number, unknown>;
  let cur = copy as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
  cur[path[path.length - 1]] = value;
  return copy as T;
}

export function getIn(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((acc, k) => (acc as Record<string | number, unknown>)?.[k], obj);
}
