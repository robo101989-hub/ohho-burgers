import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [{
    name: 'ohho-dashboard-module',
    transformIndexHtml(html, ctx) {
      if (ctx.path.endsWith('/dashboard.html')) {
        return html.replace('</body>', '<script type="module" src="/src/dashboard.js"></script></body>');
      }
      return html;
    }
  }],
  build: {
    rollupOptions: {
      input: {
        index: resolve(process.cwd(), 'index.html'),
        dashboard: resolve(process.cwd(), 'dashboard.html'),
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
