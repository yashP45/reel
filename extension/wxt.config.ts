import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
    envDir: '.',
    envPrefix: 'VITE_',
  }),
  manifest: {
    name: 'Reel — Record & Share',
    description: 'Record your screen in seconds and share a link. A Loom alternative with a faster, clearer UX.',
    version: '1.0.0',
    permissions: [
      'sidePanel',
      'tabs',
      'activeTab',
      'tabCapture',
      'desktopCapture',
      'storage',
      'offscreen',
      'scripting',
    ],
    host_permissions: ['https://*/*', 'http://*/*'],
    commands: {
      'record-tab': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Start recording (Chrome picker)',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Reel',
    },
    externally_connectable: {
      matches: ['http://localhost:3000/*', 'https://*.vercel.app/*'],
    },
    web_accessible_resources: [
      {
        resources: ['webcam-bubble.html', 'chunks/webcam-bubble-*.js'],
        matches: ['https://*/*', 'http://*/*'],
      },
    ],
  },
});
