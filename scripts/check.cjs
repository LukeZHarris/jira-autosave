const assert = require('node:assert/strict');
const fs = require('node:fs');
const m = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
assert.equal(m.manifest_version, 3);
assert.equal(m.version, require('../package.json').version);
assert.deepEqual(m.content_scripts[0].matches, ['https://*.atlassian.net/*']);
assert.ok(!m.permissions && !m.host_permissions && !m.background && !m.update_url);
for (const file of [...m.content_scripts[0].js, ...m.content_scripts[0].css, ...Object.values(m.icons)]) assert.ok(fs.existsSync(file), file);
for (const [size, file] of Object.entries(m.icons)) {
  const png = fs.readFileSync(file);
  assert.equal(png.readUInt32BE(16), Number(size));
  assert.equal(png.readUInt32BE(20), Number(size));
}
console.log('Manifest, runtime assets, icon dimensions and permission boundaries OK.');
