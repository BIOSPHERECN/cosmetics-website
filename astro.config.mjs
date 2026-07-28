import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  site: 'https://cosmetics-website.pages.dev',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'id', 'zh'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
