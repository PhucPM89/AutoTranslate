"use strict";

const path = require("path");
const esbuild = require("esbuild");

esbuild.buildSync({
  entryPoints: [path.join(__dirname, "..", "client", "admin-upload.js")],
  outfile: path.join(__dirname, "..", "public", "admin-upload.js"),
  bundle: true,
  minify: true,
  sourcemap: false,
  platform: "browser",
  target: ["es2020"]
});
