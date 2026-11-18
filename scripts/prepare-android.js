const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'www');
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'sw.js']) {
  fs.copyFileSync(path.join(root, file), path.join(target, file));
}
fs.cpSync(path.join(root, 'assets'), path.join(target, 'assets'), { recursive: true });
process.argv[2] = path.join(target, 'vendor');
require('./build-vendor.js');
console.log('Prepared offline Android web assets in www/.');
