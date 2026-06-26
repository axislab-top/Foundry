const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(__dirname, '..', 'dist');
const entryPath = path.join(distDir, 'index.cjs');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const content = "'use strict';\nmodule.exports = require('../dist-cjs/index.js');\n";
fs.writeFileSync(entryPath, content, 'utf8');
