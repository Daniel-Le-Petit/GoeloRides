/** Export en lecture seule des activités accessibles à l’administrateur. */
(function (global) {
  'use strict';
  var PAGE_SIZE = 500;
  var MAX_ROWS = 100000;

  function csvCell(value) {
    var text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Éviter l’exécution de formules lors de l’ouverture dans un tableur.
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function toCsv(rows) {
    var columns = ['created_at', 'event_type', 'id'];
    rows.forEach(function (row) {
      Object.keys(row).forEach(function (key) { if (columns.indexOf(key) === -1) columns.push(key); });
    });
    return '\uFEFF' + [columns.map(csvCell).join(';')].concat(rows.map(function (row) {
      return columns.map(function (key) { return csvCell(row[key]); }).join(';');
    })).join('\r\n') + '\r\n';
  }

  async function collect(sb, progress) {
    var rows = [];
    var cutoff = new Date().toISOString();
    for (var offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
      var result = await sb.from('activity_feed_human').select('*')
        .lte('created_at', cutoff).order('created_at', { ascending: false })
        .order('id', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error('Réponse d’export invalide.');
      rows = rows.concat(result.data);
      if (progress) progress(rows.length);
      if (result.data.length < PAGE_SIZE) return { rows: rows, partial: false };
    }
    return { rows: rows, partial: true };
  }

  global.GoeloActivityExport = { toCsv: toCsv, collect: collect };
})(window);
