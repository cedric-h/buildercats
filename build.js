// should be equivalent (modulo plugins) to command:
// esbuild main.ts --bundle --outfile=pub/main.js
require('esbuild').build({
  entryPoints: ["main.ts"],
  outfile: "pub/main.js",
  bundle: true,
  plugins: [require('esbuild-plugin-glsl').glsl({ minify: true })]
}).catch(() => process.exit(1))
