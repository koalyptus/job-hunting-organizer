import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],

  manifest: {
    name: 'JHO — Job Hunting Organizer',
    description:
      'Track applications from LinkedIn, Seek and Indeed into job-hunting-organizer, and review campaign status from the popup.',
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: [
      // Local MCP bridge (jho mcp --http). See docs/mcp-http-transport.md.
      'http://localhost:7331/*',
      'http://127.0.0.1:7331/*',
      // Job boards the content script injects "[Track in JHO]" into.
      'https://www.linkedin.com/*',
      'https://www.seek.com.au/*',
      'https://www.seek.co.nz/*',
      'https://au.indeed.com/*',
      'https://www.indeed.com/*',
    ],
  },

  // Tailwind v4 runs as a first-party Vite plugin; no postcss config needed.
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
