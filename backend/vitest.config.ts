import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long',
      // A separate database: the suite drops it before every file.
      MONGODB_URI: process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/printing-galaxy-test',
      // Storage is replaced by an in-memory fake in tests/helpers.ts.
      S3_ENDPOINT: 'http://127.0.0.1:9',
      S3_FORCE_PATH_STYLE: 'true',
      REDIS_URL: '',
      WHATSAPP_TOKEN: '',
      MSG91_AUTH_KEY: '',
    },
    // One database, so files run one after another, each in a fresh process (Mongoose models
    // are registered once per process).
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
