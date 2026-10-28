const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../../js/allrides.js'), 'utf8');
const start = source.indexOf('  async function uploadGpxFile(');
const end = source.indexOf('  function closeCreateModal()', start);

test('le GPX multipart conserve ses octets avec un type explicite pour les fichiers iPhone', async () => {
  const context = { Blob, window: { crypto: globalThis.crypto }, GPX_BUCKET: 'rides-gpx', sanitizeGpxFilename: name => name };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  const xml = '<?xml version="1.0"?><gpx><name>Goëlo</name></gpx>';
  for (const type of ['', 'application/octet-stream', 'text/plain', 'application/gpx+xml']) {
    const original = new File([xml], 'parcours.gpx', { type });
    const storage = {
      async upload(objectPath, body, options) {
        assert.match(objectPath, /^admin-id\//);
        assert.equal(options.upsert, false);
        assert.equal(body.type, 'application/gpx+xml');
        assert.deepEqual(new Uint8Array(await body.arrayBuffer()), new Uint8Array(await original.arrayBuffer()));
        // Le SDK transmet les Blob dans une pièce multipart dont le type est celui du Blob.
        const multipart = new FormData();
        multipart.append('file', body);
        assert.match(await new Response(multipart).text(), /Content-Type: application\/gpx\+xml/);
        return { data: { path: objectPath }, error: null };
      },
      getPublicUrl: objectPath => ({ data: { publicUrl: 'https://files.example.test/' + objectPath } })
    };
    const result = await context.uploadGpxFile({ storage: { from: bucket => { assert.equal(bucket, 'rides-gpx'); return storage; } } }, original, 'admin-id');
    assert.match(result.url, /^https:\/\/files.example.test\/admin-id\//);
    assert.equal(original.type, type);
  }
});
