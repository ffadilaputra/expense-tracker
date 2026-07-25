import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                // Keep React itself in a separate chunk from app code, so a browser
                // that already cached the vendor chunk doesn't need to re-download
                // it every time app code changes.
                manualChunks: {
                    vendor: ['react', 'react-dom']
                }
            }
        }
    }
});
