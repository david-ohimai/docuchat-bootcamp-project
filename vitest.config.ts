import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Unit tests never touch a real database, Redis or OpenAI.
    // These values only satisfy the config schema at import time.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef012',
      OPENAI_API_KEY: 'sk-test',
    },
  },
});
