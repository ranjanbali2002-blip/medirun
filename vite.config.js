import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),   // landing page → served at /
        app:  resolve(__dirname, "app.html"),     // React app   → served at /app.html
      },
    },
  },
});
