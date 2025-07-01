import tailwindcss from "@tailwindcss/vite";
import react from '@vitejs/plugin-react-swc';
import path from "path";
import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})