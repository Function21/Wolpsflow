import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      fs: path.resolve(__dirname, "src/lib/empty-fs.ts")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    sourcemap: true
  }
});