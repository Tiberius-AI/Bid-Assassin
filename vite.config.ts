import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    css: {
      postcss: "./postcss.config.js",
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      proxy: {
        "/api/anthropic": {
          target: "https://api.anthropic.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ""),
          headers: {
            "x-api-key": env.VITE_ANTHROPIC_API_KEY || "",
            "anthropic-version": "2023-06-01",
          },
        },
        "/api/openai-dev": {
          target: "https://api.openai.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openai-dev/, "/v1/chat/completions"),
          headers: {
            Authorization: `Bearer ${env.VITE_OPENAI_API_KEY || ""}`,
          },
        },
      },
    },
  };
});
