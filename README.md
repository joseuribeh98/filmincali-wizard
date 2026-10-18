# filmincali.joseuribe.dev

Asistente independiente para preparar el permiso de rodaje en espacio público de Cali. Cada dato se escribe una vez y sale el paquete con los formatos oficiales F004 a F008 llenos, los plazos y la lista de anexos. Incluye una skill para agentes con la misma lógica.

No es un sitio de la Alcaldía ni de la Comisión Fílmica.

Repositorio: https://github.com/joseuribeh98/filmincali-wizard

## Privacidad

- No hay backend. Los .docx se generan en el navegador con docxtemplater; la única petición de red del asistente es a `/plantillas/*.docx` del mismo dominio.
- Sin analítica, sin cookies y sin scripts de terceros. Las fuentes y las fotos se sirven desde el propio sitio.
- La solicitud se guarda solo en `localStorage` (clave `filmincali:solicitud:v1`). «Empezar de cero» la borra.
- `public/_headers` publica una Content-Security-Policy con `connect-src 'self'`, así que el navegador bloquea cualquier envío a otro dominio.
- El script de la skill (`scripts/generar.mjs`) se empaqueta sin minificar y no usa red.

## Estructura

- `src/lib/pufa/`: el núcleo. `schema.ts` (modelo único con Zod), `derivar.ts` (formatos que aplican, plazos, anexos, avisos), `calendario.ts` (días hábiles con festivos de Colombia), `mapear.ts` (modelo → tags de cada plantilla), `generar.ts` (docxtemplater + zip, sirve en navegador y Node).
- `src/components/`: el asistente en Preact.
- `src/cli/generar.ts`: CLI de la skill.
- `tools/originales/`: los formatos tal como los publica filmincali.com.co.
- `tools/plantillas.py`: convierte los originales en plantillas (`public/plantillas/`). Solo reemplaza espacios en blanco y casillas, y marca los bloques que el formato pide repetir.
- `tools/skill/` y `tools/build-skill.mjs`: empaquetan la skill en `public/skill/permiso-rodaje-cali.zip`.

## Comandos

```sh
npm install
npm run dev          # http://localhost:4321
npm test             # genera el ejemplo y verifica que no queden tags
npm run build        # empaqueta la skill y construye el sitio en dist/
npm run plantillas   # regenera las plantillas (requiere python-docx)
```

## Cuando la Alcaldía cambie un formato

1. Reemplaza el archivo en `tools/originales/`.
2. Revisa los índices de párrafo en `tools/plantillas.py` (el script falla si un párrafo esperado ya no tiene espacios en blanco).
3. `npm run plantillas && npm test`.

## Despliegue

Es un sitio estático: `npm run build` deja todo en `dist/`, listo para cualquier hosting estático. Los encabezados de seguridad están en `public/_headers`, el formato que leen Cloudflare Pages y Netlify. `npm run deploy` publica con Wrangler en Cloudflare Pages según `wrangler.jsonc`.

## Licencia

MIT. Ver `LICENSE`.
