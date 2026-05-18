import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    server: {
      deps: {
        inline: [
          'react-markdown',
          'remark-gfm',
          /unified/,
          /remark/,
          /rehype/,
          /micromark/,
          /mdast/,
          /vfile/,
          /bail/,
          /trough/,
          /zwitch/,
          /devlop/,
          /decode-named-character-reference/,
          /character-entities/,
          /hast/,
          /unist/,
        ],
      },
    },
  },
})
