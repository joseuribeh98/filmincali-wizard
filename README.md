# filmincali.joseuribe.dev

An independent tool to prepare the permit for filming in public space in Cali, Colombia. You enter each piece of data once and get the official forms F004 to F008 filled in, the filing deadlines and the list of attachments. It also ships an agent skill with the same logic.

It is not a website of the Alcaldía de Cali or the Comisión Fílmica. The interface and the generated documents are in Spanish because they are meant for production teams in Cali; the code is in English.

Repository: https://github.com/joseuribeh98/filmincali-wizard

## Privacy

- There is no backend. The .docx files are generated in the browser with docxtemplater; the only network request the wizard makes is to `/templates/*.docx` on the same domain.
- No analytics, no cookies and no third-party scripts. Fonts and photos are served from the site itself.
- The request is stored only in `localStorage` (key `filmincali:request:v2`). «Empezar de cero» clears it.
- `public/_headers` sets a Content-Security-Policy with `connect-src 'self'`, so the browser blocks any request to another domain.
- The skill script (`scripts/generate.mjs`) is bundled unminified and makes no network calls.

## Structure

- `src/lib/permit/`: the core. `schema.ts` (single Zod model), `derive.ts` (which forms apply, deadlines, attachments, review, fee estimate), `calendar.ts` (Colombian business days and holidays), `mapping.ts` (model to template tags), `generate.ts` (docxtemplater and zip; runs in the browser and in Node), `legacy.ts` (reads requests saved by the first version, which used Spanish keys).
- `src/components/`: the Preact wizard.
- `src/cli/generate.ts`: the skill CLI.
- `tools/originals/`: the forms as published on filmincali.com.co.
- `tools/templates.py`: turns the originals into templates (`public/templates/`). It only replaces blanks and checkboxes, keeps the length of each blank line, and marks the blocks the form asks to repeat.
- `tools/skill/` and `tools/build-skill.mjs`: bundle the skill into `public/skill/permiso-rodaje-cali.zip`. The skill instructions stay in Spanish because the agent works with Spanish-speaking users.

Page routes (`/agentes/`, `/skill/`) and section anchors (`#solicitud`, `#excepciones`) are public URLs, so they stay in Spanish.

## Commands

```sh
npm install
npm run dev          # http://localhost:4321
npm test             # fills the example and checks that no tags are left
npm run build        # bundles the skill and builds the site into dist/
npm run templates    # regenerates the templates (requires python-docx)
```

## When the Alcaldía changes a form

1. Replace the file in `tools/originals/`.
2. Check the paragraph indexes in `tools/templates.py` (the script fails if an expected paragraph no longer has blanks).
3. `npm run templates && npm test`.

## Deployment

It is a static site: `npm run build` puts everything in `dist/`, ready for any static host. Security headers live in `public/_headers`, the format read by Cloudflare Pages and Netlify. `npm run deploy` publishes to Cloudflare Pages with Wrangler, using `wrangler.jsonc`.

## License

MIT. See `LICENSE`.
