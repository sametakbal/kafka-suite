import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/renderer/lib/__tests__/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: [
                'src/renderer/lib/utils.ts',
                'src/renderer/lib/query.ts',
            ],
            thresholds: {
                lines: 100,
                functions: 100,
                branches: 100,
                statements: 100,
            },
            reporter: ['text', 'html'],
        },
    },
});
