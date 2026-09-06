import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "lab",
        short_name: "lab",
        description: "Advanced AI Web Interface with ToolHub & GraphMem",
        theme_color: "#09090b",
        background_color: "#09090b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: "index.html",
      }
    })
  ],
  build: {
    // Нарезаем монолит на легкие чанки для мгновенной парсинга на iOS/iPadOS
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@lenml/tokenizer-gemini')) {
            return 'tokenizer-gemini';
          }
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
            return 'monaco-editor';
          }
          if (id.includes('katex')) {
            return 'katex';
          }
          if (id.includes('node_modules')) {
            return 'vendor-core';
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})