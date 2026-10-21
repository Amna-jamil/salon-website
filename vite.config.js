import { defineConfig } from "vite";
import { salon } from "./src/salon.config.js";
import { fileURLToPath } from "node:url";

const attribute = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export default defineConfig({
  server: {
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        "**/server/**",
        "**/*.{sqlite,sqlite-wal,sqlite-shm,db,db-wal,db-shm}",
      ],
    },
  },
  build: {
    rollupOptions: {
      input: {
        website: fileURLToPath(new URL("./index.html", import.meta.url)),
        admin: fileURLToPath(new URL("./admin/index.html", import.meta.url)),
        login: fileURLToPath(
          new URL("./admin/login/index.html", import.meta.url),
        ),
      },
    },
  },
  plugins: [
    {
      name: "salon-metadata",
      transformIndexHtml(html, context) {
        if (context.filename.replaceAll("\\", "/").includes("/admin/"))
          return html;
        return html
          .replace(
            /<title>.*?<\/title>/,
            `<title>${attribute(salon.seo.title)}</title>`,
          )
          .replace(
            /(<meta name="description" content=")[^"]*/,
            `$1${attribute(salon.seo.description)}`,
          )
          .replace(
            /(<meta name="theme-color" content=")[^"]*/,
            `$1${attribute(salon.theme.ink)}`,
          )
          .replace(
            /(<link rel="icon" type="image\/svg\+xml" href=")[^"]*/,
            `$1${attribute(salon.favicon)}`,
          )
          .replace(
            "</head>",
            `${salon.demoMode ? '<meta name="robots" content="noindex, nofollow">' : ""}<meta property="og:title" content="${attribute(salon.seo.title)}"><meta property="og:description" content="${attribute(salon.seo.description)}"><meta property="og:type" content="website"></head>`,
          );
      },
    },
  ],
});
