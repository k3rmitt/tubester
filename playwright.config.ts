import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173/tubester/',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx peerjs --port 9000 --path /peer',
      port: 9000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173/tubester/',
      reuseExistingServer: !process.env.CI,
      env: { VITE_PEER_HOST: '127.0.0.1', VITE_PEER_PORT: '9000', VITE_PEER_PATH: '/peer', VITE_PEER_SECURE: 'false' },
    },
  ],
});
