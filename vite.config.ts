import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from any sub-path (e.g. https://user.github.io/Fractal-v2/)
  base: './',
  server: {
    port: 3000,
    open: false,
    host: true,
    allowedHosts: true,
    watch: {
      ignored: ['**/_reference/**', '**/.git/**']
    }
  },
  optimizeDeps: {
    exclude: ['three']
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
});
