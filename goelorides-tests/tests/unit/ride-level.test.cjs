const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../../js/goelo-ride-level.js'), 'utf8'), context);
const compare = context.GoeloRideLevel.compare;

test('compares distance and climbing independently', () => {
  assert.match(compare({ kmRaw: 40, dplusRaw: 200 }, 30, 300), /plus de kilomètres que/);
  assert.match(compare({ kmRaw: 20, dplusRaw: 400 }, 30, 300), /plus de dénivelé que/);
  assert.match(compare({ kmRaw: 40, dplusRaw: 400 }, 30, 300), /plus de kilomètres et plus de dénivelé/);
});
test('within usual values still asks the rider to consider pace and duration', () => {
  assert.match(compare({ kmRaw: '16,8', dplusRaw: 200 }, 30, 300), /dans tes habitudes.*allure/);
});
test('missing values cannot produce a reassuring comparison', () => {
  assert.match(compare({ kmRaw: 20, dplusRaw: null }, 30, 300), /n’est pas renseigné/);
  assert.match(compare({ kmRaw: 20, dplusRaw: 200 }, '', 300), /Indique/);
  assert.match(compare({ kmRaw: 20, dplusRaw: 200 }, 30, ''), /Indique/);
  assert.match(compare({ kmRaw: 20, dplusRaw: 200 }, -30, 300), /Indique/);
});
test('zero climbing is valid and does not hide the effort of a hilly route', () => {
  assert.match(compare({ kmRaw: 20, dplusRaw: 200 }, 30, 0), /plus de dénivelé/);
});
