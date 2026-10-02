import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/lookbook/index.jsx"],
  outfile: "assets/lookbook.js",
  bundle: true,
  format: "iife",
  target: "es2018",
  jsx: "automatic",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(options);
  console.log("Build complete.");
}