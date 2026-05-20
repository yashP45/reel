import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Reel — Record & Share',
    description: 'Record your screen in seconds and share a link. A Loom alternative with a faster, clearer UX.',
    version: '1.0.0',
    permissions: [
      'sidePanel',
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
        description: 'Record current tab',
      },
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Open Reel',
    },
  },
});
