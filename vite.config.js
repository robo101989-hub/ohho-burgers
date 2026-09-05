import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), 'index.html'),
        menu: resolve(process.cwd(), 'menu.html'),
        about: resolve(process.cwd(), 'about.html'),
        contact: resolve(process.cwd(), 'contact.html'),
        franchise: resolve(process.cwd(), 'franchise.html'),
        locations: resolve(process.cwd(), 'locations.html'),
        privacy: resolve(process.cwd(), 'privacy.html'),
        refunds: resolve(process.cwd(), 'refunds.html'),
        terms: resolve(process.cwd(), 'terms.html')
      }
    }
  }
});
