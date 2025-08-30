// Backend/copy-frontend.js
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "frontend");
const dest = path.resolve(__dirname, "public");

function copyRecursive(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    console.log("No ../frontend found; skipping copy.");
    return;
  }
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
  console.log("✔ Copied frontend → Backend/public");
}

copyRecursive(src, dest);
