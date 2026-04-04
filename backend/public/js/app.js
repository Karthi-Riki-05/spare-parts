var App = window.App = {
  state: { fileBase64: null, fileName: '', sheetNames: [], selectedSheet: 0, normalizedRows: [], originalData: [], rawData: [], verificationResults: [], stats: null, changeLogs: [], formatResult: null, abortController: null },
  show: function(id) { var e = document.getElementById(id); if (e) e.classList.remove('hidden'); },
  hide: function(id) { var e = document.getElementById(id); if (e) e.classList.add('hidden'); },
  setText: function(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; },
  setHtml: function(id, h) { var e = document.getElementById(id); if (e) e.innerHTML = h; },

  updateStats: function(s) {
    if (!s) return;
    App.setText('stat-total', s.totalRows || 0); App.setText('stat-verified', s.webVerified || 0);
    App.setText('stat-empty', s.emptyCells || 0); App.setText('stat-score90', s.scoreAbove90 || 0);
    App.setText('stat-score50', s.score50to89 || 0); App.setText('stat-score-low', s.scoreBelow50 || 0);
    App.setText('stat-official', s.officialSourceFound || 0); App.setText('stat-external', s.externalSourceFound || 0);
    App.setText('stat-notfound', s.notFound || 0);
  },

  updateProgress: function(msg, sub, pct) {
    App.show('progress-section'); App.setText('progress-message', msg); App.setText('progress-submsg', sub || '');
    var f = document.getElementById('progress-bar-fill'); if (f) f.style.width = Math.min(100, Math.max(0, pct)) + '%';
  },

  addLog: function(text, type) {
    type = type || 'success';
    var c = document.getElementById('log-entries'); if (!c) return;
    App.show('log-section');
    var d = document.createElement('div'); d.className = 'log-entry ' + type;
    d.textContent = (type === 'success' ? '✓ ' : type === 'fail' ? '✗ ' : '✎ ') + text;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
  },

  showSheetSelector: function(sheets) {
    var sel = document.getElementById('sheet-select');
    sel.innerHTML = sheets.map(function(s) { return '<option value="' + s.index + '">' + s.name + '</option>'; }).join('');
    App.show('sheet-selector');
  },
  confirmSheet: function() {
    App.state.selectedSheet = parseInt(document.getElementById('sheet-select').value, 10);
    App.hide('sheet-selector'); Upload.processSheet(App.state.selectedSheet);
  },

  showLargeFileWarning: function(cnt, cb) {
    App.setHtml('large-file-msg', 'This file contains <strong>' + cnt.toLocaleString() + '</strong> rows. Processing may take ~' + Math.ceil(cnt / 60) + ' minutes.');
    if (cnt > 10000) App.show('large-file-hint');
    App.show('large-file-modal'); App._lfCb = cb;
  },
  confirmLargeFile: function() { App.hide('large-file-modal'); if (App._lfCb) App._lfCb(); },
  cancelLargeFile: function() { App.hide('large-file-modal'); App.reset(); },

  openMapping: function() {
    var rows = App.state.rawData; if (!rows || !rows.length) return;
    var headers = Object.keys(rows[0]);
    var fields = ['Description', 'Manufacturer', 'Item Number', 'Type Designation', 'Supplementary'];
    var fieldKeys = { Description: 'description', Manufacturer: 'manufacturer', 'Item Number': 'itemNumber', 'Type Designation': 'typeDesignation', Supplementary: 'supplementary' };
    document.getElementById('mapping-grid').innerHTML = fields.map(function(f) {
      return '<div class="mapping-row"><span class="mapping-label">' + f + ':</span><select class="select-input" data-field="' + fieldKeys[f] + '"><option value="">-- select --</option>' + headers.map(function(h) { return '<option value="' + h + '">' + h + '</option>'; }).join('') + '</select><span class="text-muted small">' + rows.slice(0, 2).map(function(r) { return r[headers[0]] || ''; }).join(', ') + '</span></div>';
    }).join('');
    App.show('mapping-modal');
  },
  applyManualMapping: async function() {
    var selects = document.querySelectorAll('#mapping-grid select[data-field]');
    var mapping = { internalItemNumber: 'col_0' };
    selects.forEach(function(s) { mapping[s.dataset.field] = s.value; });
    App.hide('mapping-modal'); App.updateProgress('Applying mapping...', '', 40);
    try {
      var res = await fetch('/api/manual-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileData: App.state.fileBase64, sheetIndex: App.state.selectedSheet, mapping: mapping }) });
      var data = await res.json();
      App.state.normalizedRows = data.rows || []; App.state.originalData = data.originalData || [];
      App.show('app-workspace'); App.show('table-section'); App.hide('progress-section');
      App.updateStats({ totalRows: App.state.normalizedRows.length }); App.setText('action-rowcount', App.state.normalizedRows.length + ' rows');
      Table.render(App.state.normalizedRows, false);
    } catch (e) { App.updateProgress('Mapping failed: ' + e.message, '', 0); }
  },
  closeMapping: function() { App.hide('mapping-modal'); },

  reset: function() {
    App.state = { fileBase64: null, fileName: '', sheetNames: [], selectedSheet: 0, normalizedRows: [], originalData: [], rawData: [], verificationResults: [], stats: null, changeLogs: [], formatResult: null, abortController: null };
    document.getElementById('file-input').value = '';
    ['sheet-selector','format-section','app-workspace','progress-section','log-section','table-section','large-file-modal','mapping-modal'].forEach(App.hide);
    App.show('upload-zone'); App.hide('btn-stop'); App.show('btn-verify'); App.hide('btn-download');
    App.setHtml('log-entries', ''); App.setHtml('table-head', ''); App.setHtml('table-body', '');
  },

  cancelVerification: function() {
    if (App.state.abortController) App.state.abortController.abort();
    App.updateProgress('Verification stopped.', '', 0);
    App.hide('btn-stop'); App.show('btn-verify'); App.addLog('Cancelled by user', 'fail');
  }
};
