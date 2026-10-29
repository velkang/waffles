import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
const apiOrigin = process.env.WAFFLES_API_ORIGIN ?? "http://127.0.0.1:8787";
export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/v1": { target: apiOrigin, ws: true },
      "/health": apiOrigin,
    },
  },
});
