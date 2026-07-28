import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  site: 'https://BIOSPHERECN.github.io',
  base: '/cosmetics-website',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'id', 'zh'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
