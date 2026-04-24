import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/GameParty/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/games/training-arena/**/*.ts'],
      exclude: ['src/games/training-arena/**/*.tsx', 'src/games/training-arena/data/**'],
    },
  },
})
