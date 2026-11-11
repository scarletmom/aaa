// Copies linkproxy's workflow engine into lib/engine so this server runs workflows exactly as the editor does.
const fs = require("node:fs");
const path = require("node:path");

const FILES = ["engine.js", "nodes.js", "helpers.js", "conditions.js", "files.js"];
const source = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "linkproxy", "lib"));
const target = path.join(__dirname, "..", "lib", "engine");

for (const file of FILES) {
  if (!fs.existsSync(path.join(source, file))) {
    console.error(`Missing ${path.join(source, file)}. Pass linkproxy's lib folder as the first argument.`);
    process.exit(1);
  }
}
fs.mkdirSync(target, { recursive: true });
for (const file of FILES) fs.copyFileSync(path.join(source, file), path.join(target, file));
console.log(`Copied ${FILES.length} files from ${source}`);
