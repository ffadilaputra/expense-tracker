import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.ts', 'google-apps-script/**/*.test.ts', 'tests/**/*.test.ts'],
    passWithNoTests: true
  }
});
