import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = `http://localhost:${process.env.PORT || 5678}`;

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: Number(process.env.WEB_PORT) || 5173,
    proxy: { "/api": api, "/hook": api, "/resolve": api, "/healthz": api, "/media": api },
  },
});
