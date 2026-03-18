import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";

  return {
    base: "/stair/",
    logLevel: isProduction ? "warning" : "info",
    build: {
      outDir: "../web/public/stair",
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
          },
        },
      },
      minify: isProduction ? "terser" : "esbuild",
    },
    server: {
      port: 8080,
      allowedHosts: true,
    },
  };
});
