import { defineConfig } from 'vitest/config';
import path from 'path';

const srcPath = path.resolve(__dirname, './src').replace(/\\/g, '/');
const resolveSrcPlugin = {
  name: 'resolve-root-src',
  resolveId(source: string, importer?: string) {
    const isTestFile = importer
      ? importer.includes(`${path.sep}src${path.sep}tests`) || importer.includes(`${path.sep}tests${path.sep}`)
      : false;
    if (isTestFile && source.startsWith('../')) {
      const resolved = path.resolve(path.dirname(importer), source);
      return resolved.endsWith('.ts') ? resolved : `${resolved}.ts`;
    }
    if (source.startsWith('/src/')) {
      return path.resolve(__dirname, `.${source}`);
    }
    const normalized = source.replace(/\\/g, '/');
    if (normalized.startsWith(srcPath)) {
      const withExt = normalized.endsWith('.ts') ? normalized : `${normalized}.ts`;
      return withExt;
    }
    return null;
  }
};

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],
    deps: {
      registerNodeLoader: true
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules',
        'dist',
        'src/tests',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/db/seed-demo.ts',
        'src/db/init-database.ts'
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        moduleResolution: 'node',
        allowImportingTsExtensions: true
      }
    }
  },
  resolve: {
    alias: [
      { find: '@', replacement: srcPath },
      { find: /^\/src\//, replacement: `${srcPath}/` },
      { find: 'src', replacement: srcPath }
    ]
  },
  plugins: [resolveSrcPlugin]
});

