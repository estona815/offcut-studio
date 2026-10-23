import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import offcutMcp from './mcp-vite-plugin.mjs';
export default defineConfig({ plugins: [react(), offcutMcp()], server: { host: '127.0.0.1', port: 4178, strictPort: true } });
