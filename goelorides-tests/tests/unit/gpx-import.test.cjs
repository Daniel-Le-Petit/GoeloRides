const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function importer() {
  const context = {};
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../js/goelo-gpx-import.js'), 'utf8'), context);
  return context.GoeloGpxImport;
}

test('la distance est géographique et le dénivelé cumule les montées', () => {
  const result = importer().analyzeSegments([[[0, 0, 0], [0.01, 0, 10], [0.02, 0, 5], [0.03, 0, 20]]]);
  assert.equal(result.distanceKm, 3.3);
  assert.equal(result.elevationGain, 25);
  assert.equal(result.pointCount, 4);
  assert.equal(result.geometry.type, 'LineString');
});

test('deux traces éloignées ne sont pas reliées artificiellement dans le calcul', () => {
  const segments = [[[0, 0, 10], [0.01, 0, 15]], [[100, 0, 200], [100.01, 0, 210]]];
  const original = JSON.stringify(segments);
  const result = importer().analyzeSegments(segments);
  assert.equal(result.distanceKm, 2.2);
  assert.equal(result.elevationGain, 15);
  assert.equal(result.geometry.type, 'MultiLineString');
  assert.equal(result.segmentCount, 2);
  assert.equal(JSON.stringify(segments), original);
});

test('les petites oscillations d’altitude ne gonflent pas l’estimation de dénivelé', () => {
  const result = importer().analyzeSegments([[[0, 0, 10], [0.01, 0, 11], [0.02, 0, 10], [0.03, 0, 12], [0.04, 0, 10]]]);
  assert.equal(result.elevationGain, 0);
});

test('des altitudes absentes ou incomplètes restent inconnues plutôt que de devenir zéro', () => {
  const GPX = importer();
  for (const segment of [[[0, 0], [0.01, 0]], [[0, 0, 10], [0.01, 0, null]]]) {
    assert.equal(GPX.analyzeSegments([segment]).elevationGain, null);
  }
});

test('les traces sans parcours mesurable et les coordonnées invalides sont refusées', () => {
  const GPX = importer();
  assert.throws(() => GPX.analyzeSegments([]), /deux points/);
  assert.throws(() => GPX.analyzeSegments([[[0, 0], [0, 0]]]), /mesurable/);
  for (const invalid of [[181, 0], [0, 91], [NaN, 0]]) {
    assert.throws(() => GPX.analyzeSegments([[[0, 0], invalid]]), /coordonnées invalides/);
  }
});

test('les fichiers trop grands et les mauvaises extensions sont refusés avant lecture', async () => {
  const GPX = importer();
  let read = false;
  const text = async () => { read = true; return ''; };
  await assert.rejects(GPX.readFile({ name: 'trace.gpx', size: GPX.MAX_FILE_SIZE + 1, text }), /10 Mo/);
  await assert.rejects(GPX.readFile({ name: 'trace.txt', size: 50, text }), /format .gpx/);
  await assert.rejects(GPX.readFile({ name: 'trace.gpx', size: 0, text }), /vide/);
  assert.equal(read, false);
});

test('l’aperçu dessine chaque segment séparément sans valeur infinie', () => {
  const GPX = importer();
  const result = GPX.analyzeSegments([[[0, 0], [0, 0.01]], [[10, 10], [10, 10.01]]]);
  const svg = GPX.svgPreview(result.geometry);
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});
