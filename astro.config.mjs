// @ts-check
import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from 'astro/config';
import { generateRadixColorsSassFunctions } from "./lib/plugins/sass/radix-ui-colors/generateRadixColorsSassCustomFunction";
import remarkEmdash from './lib/plugins/remark/emdash.js';
import rawFonts from './lib/plugins/vite/rawFonts.js';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    mode: 'directory',
    workerEntryPoint: {
      path: 'src/worker-entry.ts',
      namedExports: ['SignalingServer']
    },
    platformProxy: {
      enabled: true,
    }
  }),
  markdown: {
    remarkPlugins: [remarkEmdash],
  },
  vite: {
    plugins: [rawFonts(['.woff'])],
    ssr: {
      external: [
        'astro/container',
        'crypto',
        'fs',
        'path',
        'sharp',
        'esbuild',
      ].flatMap(id => [id, `node:${id}`]),
    },
    css: {
      preprocessorOptions: {
        scss: {
          functions: {
            ...generateRadixColorsSassFunctions
          }
        }
      }
    },
  },
});