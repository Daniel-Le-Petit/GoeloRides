const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../../js/goelo-activity-export.js'), 'utf8'), context);
const exporter = context.window.GoeloActivityExport;

test('CSV UTF-8, métadonnées, guillemets, retours et formules', () => {
  const csv = exporter.toCsv([{ created_at: '2026-10-28', event_type: 'RIDE_VIEWED', id: '1', title: 'Goëlo; "vélo"\nroute', metadata: { visitor_session_id: 'visitor', participation_result: 'joined' }, label: '=1+1' }]);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert(csv.includes('"Goëlo; ""vélo""\nroute"'));
  assert(csv.includes('"\'=1+1"'));
  assert(csv.includes('""participation_result"":""joined""'));
  assert(csv.endsWith('\r\n'));
});

test('historique paginé au-delà de la limite du Dashboard, ordre et date de coupure stables', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index) }));
  const ranges = [], cutoffs = [], orders = [];
  const sb = { from(table) { assert.equal(table, 'activity_feed_human'); return { select() { return this; }, lte(key, value) { assert.equal(key, 'created_at'); cutoffs.push(value); return this; }, order(key) { orders.push(key); return this; }, async range(start, end) { ranges.push([start, end]); return { data: rows.slice(start, end + 1) }; } }; } };
  const result = await exporter.collect(sb);
  assert.equal(result.rows.length, 1001);
  assert.equal(result.partial, false);
  assert.deepEqual(ranges, [[0,499],[500,999],[1000,1499]]);
  assert.equal(new Set(cutoffs).size, 1);
  assert.deepEqual(orders, ['created_at','id','created_at','id','created_at','id']);
});

test('une erreur serveur ne produit pas silencieusement un historique incomplet', async () => {
  const sb = { from: () => ({ select() { return this; }, lte() { return this; }, order() { return this; }, range: async () => ({ error: new Error('refusé') }) }) };
  await assert.rejects(exporter.collect(sb), /refusé/);
});
