// Bundles @imgly/background-removal (+ onnxruntime-web wasm build) into one ES module,
// and copies the matching offline model/wasm data, so background removal works with NO internet.
const fs = require('node:fs'), path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'vendor');
const nm = p => path.join(root, 'node_modules', p);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'bg-removal'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'bg-data'), { recursive: true });
esbuild.buildSync({
  entryPoints: [nm('@imgly/background-removal/dist/index.mjs')],
  bundle: true, format: 'esm', platform: 'browser', minify: true, target: 'es2020',
  outfile: path.join(outDir, 'bg-removal/index.js'),
  alias: { 'onnxruntime-web': nm('onnxruntime-web/dist/esm/ort.wasm.min.js') },
  external: ['fs', 'path', 'os', 'worker_threads', 'perf_hooks', 'child_process', 'crypto'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'error'
});
const dataDist = nm('@imgly/background-removal-data/dist');
const all = JSON.parse(fs.readFileSync(path.join(dataDist, 'resources.json'), 'utf8'));
const keep = ['/models/medium', '/models/small', '/onnxruntime-web/ort-wasm-simd.wasm', '/onnxruntime-web/ort-wasm.wasm'];
const res = {};
for (const k of keep) {
  res[k] = all[k];
  for (const c of all[k].chunks) fs.copyFileSync(path.join(dataDist, c.hash), path.join(outDir, 'bg-data', c.hash));
}
fs.writeFileSync(path.join(outDir, 'bg-data/resources.json'), JSON.stringify(res));
const mb = fs.readdirSync(path.join(outDir, 'bg-data')).reduce((s, f) => s + fs.statSync(path.join(outDir, 'bg-data', f)).size, 0) / 1048576;
console.log(`Built offline background-removal vendor files (${mb.toFixed(0)} MB) in ${outDir}`);
