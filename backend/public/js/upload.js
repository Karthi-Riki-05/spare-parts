var Upload = window.Upload = {};

document.addEventListener('DOMContentLoaded', function() {
  var drop = document.getElementById('drop-area'), input = document.getElementById('file-input');
  if (!drop || !input) return;
  drop.addEventListener('dragover', function(e) { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', function() { drop.classList.remove('drag-over'); });
  drop.addEventListener('drop', function(e) { e.preventDefault(); drop.classList.remove('drag-over'); if (e.dataTransfer.files[0]) Upload.handleFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', function(e) { if (e.target.files[0]) Upload.handleFile(e.target.files[0]); });
});

Upload.handleFile = async function(file) {
  var ext = file.name.split('.').pop().toLowerCase();
  if (ext !== 'xlsx' && ext !== 'xls') { document.getElementById('upload-error').textContent = 'Only .xlsx/.xls files'; App.show('upload-error'); return; }
  App.hide('upload-error'); App.updateProgress('Reading file...', '', 10);
  App.state.fileBase64 = await Upload.toBase64(file);
  App.state.fileName = file.name;
  try {
    App.updateProgress('Detecting sheets...', '', 20);
    var res = await fetch('/api/get-sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileData: App.state.fileBase64 }) });
    var data = await res.json(); App.hide('upload-zone');
    if (data.sheets && data.sheets.length > 1) { App.state.sheetNames = data.sheets; App.showSheetSelector(data.sheets); }
    else { await Upload.processSheet(0); }
  } catch (e) { App.updateProgress('Error: ' + e.message, '', 0); }
};

Upload.processSheet = async function(sheetIndex) {
  App.state.selectedSheet = sheetIndex; App.updateProgress('Detecting format...', '', 30);
  try {
    var res = await fetch('/api/detect-format', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileData: App.state.fileBase64, sheetIndex: sheetIndex }) });
    var fmt = await res.json(); App.state.formatResult = fmt;
    var badge = document.getElementById('format-badge');
    var labels = { A: 'Format A (Correct)', B: 'Format B (Single-column)', C: 'Format C (Incomplete)' };
    badge.textContent = labels[fmt.format] || 'Unknown'; badge.className = 'badge format-' + (fmt.format || '').toLowerCase();
    App.setText('format-confidence', 'Confidence: ' + fmt.confidence + '%');
    if (fmt.confidence < 80) App.show('btn-manual-map');
    App.show('format-section'); App.setText('action-filename', App.state.fileName);
    App.setText('action-format-badge', badge.textContent);
    document.getElementById('action-format-badge').className = badge.className + ' small';
    await Upload.normalizeData(fmt);
  } catch (e) { App.updateProgress('Detection failed: ' + e.message, '', 0); }
};

Upload.normalizeData = async function(fmt) {
  App.updateProgress('Normalizing...', '', 50);
  try {
    var res = await fetch('/api/normalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileData: App.state.fileBase64, sheetIndex: App.state.selectedSheet, format: fmt.format, mapping: fmt.suggestedMapping }) });
    var data = await res.json();
    App.state.normalizedRows = data.rows || []; App.state.originalData = data.originalData || []; App.state.rawData = data.rawRows || [];
    App.setText('action-rowcount', App.state.normalizedRows.length + ' rows');
    App.setText('row-count-info', App.state.normalizedRows.length + ' rows detected');
    App.updateStats({ totalRows: App.state.normalizedRows.length });
    var cnt = App.state.normalizedRows.length;
    if (cnt > 5000) { App.showLargeFileWarning(cnt, Upload.showWorkspace); }
    else { Upload.showWorkspace(); }
  } catch (e) { App.updateProgress('Normalization failed: ' + e.message, '', 0); }
};

Upload.showWorkspace = function() {
  App.show('app-workspace'); App.show('table-section'); App.hide('progress-section');
  Table.render(App.state.normalizedRows, false);
};

Upload.toBase64 = function(file) {
  return new Promise(function(resolve, reject) {
    var r = new FileReader(); r.onload = function(e) { resolve(e.target.result.split(',')[1]); }; r.onerror = reject; r.readAsDataURL(file);
  });
};
