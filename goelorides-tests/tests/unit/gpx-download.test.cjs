const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(fetch) {
  const downloads = [];
  const context = {
    Blob, fetch, setTimeout() {},
    URL: { createObjectURL(blob) { downloads.push(blob); return 'blob:trace'; }, revokeObjectURL() {} },
    document: { createElement() { return { click() {}, remove() {} }; }, body: { appendChild() {} } }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../js/goelo-gpx.js'), 'utf8'), context);
  return { api: context.GoeloGpx, downloads };
}

const points = [[48.65, -2.83, 22], [48.66, -2.84, 31]];

test('missing original GPX downloads the saved map geometry as GPX 1.1', async () => {
  const { api, downloads } = setup(async () => ({ ok: false, status: 404 }));
  const result = await api.downloadGpx({ fileRef: 'absent.gpx', title: 'Goëlo & côte <verte>', embeddedPoints: points });
  assert.equal(result.ok, true);
  assert.equal(result.fallback, 'embedded_points');
  const xml = await downloads[0].text();
  assert.match(xml, /xmlns="http:\/\/www.topografix.com\/GPX\/1\/1"/);
  assert.match(xml, /Goëlo &amp; côte &lt;verte&gt;/);
  assert.match(xml, /<trkpt lat="48.65" lon="-2.83"><ele>22<\/ele>/);
  assert.equal((xml.match(/<trkpt /g) || []).length, 2);
});

test('existing original is downloaded without replacing its content', async () => {
  const original = new Blob(['original GPX']);
  const { api, downloads } = setup(async () => ({ ok: true, blob: async () => original }));
  const result = await api.downloadGpx({ fileRef: 'present.gpx', embeddedPoints: points });
  assert.equal(result.ok, true);
  assert.equal(await downloads[0].text(), 'original GPX');
});

test('saved geometry also works without a filename or on network failure', async () => {
  const { api, downloads } = setup(async () => { throw new Error('network'); });
  for (const fileRef of ['', 'missing.gpx']) {
    assert.equal((await api.downloadGpx({ fileRef, embeddedPoints: points })).ok, true);
  }
  assert.equal(downloads.length, 2);
});

test('invalid coordinates cannot become a misleading replacement GPX', async () => {
  const { api, downloads } = setup(async () => ({ ok: false, status: 404 }));
  const result = await api.downloadGpx({ fileRef: 'absent.gpx', embeddedPoints: [[null, null], [91, 0], [48, -2]] });
  assert.equal(result.ok, false);
  assert.equal(downloads.length, 0);
});

test('GPX filenames containing hashes and spaces remain a single URL path', () => {
  const { api } = setup();
  assert.equal(api.resolveGpxUrl('Goëlo #4.gpx'), 'gpx/Go%C3%ABlo%20%234.gpx');
});
