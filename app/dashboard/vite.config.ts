import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";
import { visualizer } from "rollup-plugin-visualizer";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  build: {
    outDir: "build",
    assetsDir: "statics",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("@chakra-ui") ||
            id.includes("@emotion") ||
            id.includes("framer-motion")
          ) {
            return "chakra";
          }
          if (
            id.includes("jsoneditor") ||
            id.includes("ace-builds") ||
            id.includes("brace")
          ) {
            return "editor";
          }
          if (id.includes("react-datepicker") || id.includes("date-fns")) {
            return "datepicker";
          }
          if (id.includes("react-query") || id.includes("@tanstack")) {
            return "query";
          }
          return "vendor";
        },
      },
    },
  },
  plugins: [
    tsconfigPaths(),
    react({ include: "**/*.tsx" }),
    svgr(),
    visualizer({ filename: "build/stats.html", gzipSize: true }),
  ],
});
