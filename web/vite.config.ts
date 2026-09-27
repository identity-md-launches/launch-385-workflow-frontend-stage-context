import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-only middleware: serves /imd-deployment.json and /abi/<Name>.json from the same handoff
 * data the production manifest script uses, so `npm run dev` reads the same deployment
 * configuration as the static export. It does nothing during `vite build`.
 */
function imdDeploymentDev(): Plugin {
  return {
    name: 'imd-deployment-dev',
    apply: 'serve',
    async configureServer(server) {
      const lib = await import('./scripts/manifest-lib.mjs');
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        try {
          if (url === '/imd-deployment.json') {
            res.setHeader('content-type', 'application/json');
            res.end(lib.manifestJson(lib.buildManifest({ assets: [] })));
            return;
          }
          const abi = /^\/abi\/([A-Za-z0-9_]+)\.json$/.exec(url);
          if (abi) {
            res.setHeader('content-type', 'application/json');
            res.end(readFileSync(join(lib.abiSourceDir, `${abi[1]}.json`)));
            return;
          }
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  // Relative base: the export must work from an IPFS gateway subpath or an ENS name.
  base: './',
  plugins: [react(), imdDeploymentDev()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    modulePreload: { polyfill: false },
  },
});
