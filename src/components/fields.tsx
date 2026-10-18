/** Wizard controls. All of them write into the state by path. */
import type { ComponentChildren } from 'preact';
import { getIn, type Path } from './state';

export type { Path };
export type Setter = (path: Path, value: unknown) => void;
type Base = { s: unknown; set: Setter; path: Path; label: string; hint?: ComponentChildren };

const idFor = (path: Path) => 'f-' + path.join('-');

export function TextField({ s, set, path, label, hint, type = 'text', placeholder, width }: Base & { type?: 'text' | 'email' | 'tel' | 'url'; placeholder?: string; width?: 'short' | 'medium' }) {
  const id = idFor(path);
  return (
    <label class={`field ${width ?? ''}`} for={id}>
      <span>{label}</span>
      <input id={id} {...({ type } as Record<string, string>)} value={(getIn(s, path) as string) ?? ''} placeholder={placeholder}
        onInput={(ev) => set(path, (ev.currentTarget as HTMLInputElement).value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function NumberField({ s, set, path, label, hint, suffix }: Base & { suffix?: string }) {
  const id = idFor(path);
  return (
    <label class="field short" for={id}>
      <span>{label}</span>
      <span class="with-suffix">
        <input id={id} type="number" min={0} inputMode="numeric" value={String((getIn(s, path) as number) ?? 0)}
          onInput={(ev) => set(path, Math.max(0, Number((ev.currentTarget as HTMLInputElement).value) || 0))} />
        {suffix && <span>{suffix}</span>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function TextArea({ s, set, path, label, hint, placeholder }: Base & { placeholder?: string }) {
  const id = idFor(path);
  return (
    <label class="field wide" for={id}>
      <span>{label}</span>
      {hint && <small>{hint}</small>}
      <textarea id={id} value={(getIn(s, path) as string) ?? ''} placeholder={placeholder}
        onInput={(ev) => set(path, (ev.currentTarget as HTMLTextAreaElement).value)} />
    </label>
  );
}

export function RadioGroup({ s, set, path, label, options, hint, inline }: Base & { options: readonly (readonly [string, string])[]; inline?: boolean }) {
  const current = getIn(s, path);
  const name = path.join('-');
  return (
    <fieldset class={`group ${inline ? 'inline' : ''}`}>
      <legend>{label}</legend>
      {hint && <small>{hint}</small>}
      <div class="options">
        {options.map(([v, t]) => (
          <label class="choice" key={v}>
            <input type="radio" name={name} checked={current === v} onChange={() => set(path, v)} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxGroup({ s, set, path, label, options, hint }: Base & { options: readonly (readonly [string, string])[] }) {
  const current = new Set((getIn(s, path) as string[]) ?? []);
  return (
    <fieldset class="group">
      <legend>{label}</legend>
      {hint && <small>{hint}</small>}
      <div class="options columns">
        {options.map(([v, t]) => (
          <label class="choice" key={v}>
            <input type="checkbox" checked={current.has(v)} onChange={(ev) => {
              const next = new Set(current);
              (ev.currentTarget as HTMLInputElement).checked ? next.add(v) : next.delete(v);
              set(path, [...next]);
            }} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function YesNo({ s, set, path, label, hint }: Base) {
  const v = !!getIn(s, path);
  return (
    <label class="choice yes-no">
      <input type="checkbox" checked={v} onChange={(ev) => set(path, (ev.currentTarget as HTMLInputElement).checked)} />
      <span><strong>{label}</strong>{hint && <small> {hint}</small>}</span>
    </label>
  );
}

/** Turns an optional block on or off (animals, weapons, mobility…). */
export function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label class="choice switch">
      <input type="checkbox" checked={on} onChange={(ev) => onChange((ev.currentTarget as HTMLInputElement).checked)} />
      <span><strong>{label}</strong>{hint && <small> {hint}</small>}</span>
    </label>
  );
}
