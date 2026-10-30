import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return undefined;
          if (/\/node_modules\/(recharts|d3-[^/]+|victory-vendor|internmap|react-smooth)\//.test(id)) {
            return "charts-vendor";
          }
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
            return "react-vendor";
          }
          return "vendor";
        },
      },
    },
  },
});
