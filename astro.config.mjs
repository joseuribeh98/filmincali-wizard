// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://filmincali.joseuribe.dev',
  output: 'static',
  integrations: [preact(), sitemap({ filter: (page) => !page.endsWith('/404/') })],
  build: { inlineStylesheets: 'always' },
  vite: {
    json: { stringify: false },
    optimizeDeps: { include: ['docxtemplater', 'pizzip', 'jszip', 'zod'] },
  },
});
