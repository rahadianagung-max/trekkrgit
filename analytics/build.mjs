import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";

await build({
  entryPoints: ["src/app.jsx"],
  bundle: true, minify: true, format: "iife", outfile: "app.js",
});

const app = readFileSync("app.js", "utf8");
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Trekkr · Sabermetrics</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Saira+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>html,body{margin:0;padding:0;background:#fff;-webkit-text-size-adjust:100%}</style>
</head>
<body>
  <div id="root"></div>
  <script>${app}</script>
</body>
</html>
`;
writeFileSync("index.html", html);
console.log("built self-contained index.html (" + html.length + " bytes)");
