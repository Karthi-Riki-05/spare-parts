var Table = window.Table = { _edits: {} };

var COLS_VERIFIED = ['Internal Item #','Description','Manufacturer','Item Number','Type Designation','Supplementary','Verified Source','Score','Website ID','Source Type'];
var COLS_NORMAL = ['Internal Item #','Description','Manufacturer','Item Number','Type Designation','Supplementary'];
var FIELD_MAP = ['internalItemNumber','description','manufacturer','itemNumber','typeDesignation','supplementary','verifiedSource','verificationScore','websiteId','sourceType'];

Table.render = function(rows, isVerified) {
  var cols = isVerified ? COLS_VERIFIED : COLS_NORMAL;
  var thead = document.getElementById('table-head');
  var tbody = document.getElementById('table-body');
  thead.innerHTML = '<tr>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
  tbody.innerHTML = '';
  rows.forEach(function(row, idx) {
    var tr = document.createElement('tr');
    cols.forEach(function(_, ci) {
      var field = FIELD_MAP[ci];
      var val = Table._edits[idx + '_' + ci] !== undefined ? Table._edits[idx + '_' + ci] : (row[field] != null ? String(row[field]) : '');
      var td = document.createElement('td');
      td.title = val;
      if (isVerified && ci === 7) {
        var score = parseInt(val, 10) || 0;
        td.className = score >= 90 ? 'score-hi' : score >= 70 ? 'score-md' : score >= 50 ? 'score-lo' : score > 0 ? 'score-vl' : 'score-na';
      }
      if (isVerified && ci === 6 && val && val !== 'Not found') td.className = 'source-web';
      if (!val && ci !== 4 && ci !== 5) { td.className = 'cell-empty'; td.textContent = '—'; }
      else if (isVerified && ci === 8 && val && val.startsWith('http')) { var a = document.createElement('a'); a.href = val; a.target = '_blank'; a.rel = 'noopener'; a.textContent = val; td.appendChild(a); }
      else { td.textContent = val; }
      if (ci !== 0) td.addEventListener('click', function() { Table.startEdit(td, idx, ci, val); });
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  App.setText('table-showing', 'Showing ' + rows.length + ' rows');
  App.show('table-section');
};

Table.startEdit = function(td, rowIdx, colIdx, currentVal) {
  if (td.querySelector('input')) return;
  var input = document.createElement('input'); input.type = 'text'; input.className = 'cell-edit-input'; input.value = currentVal;
  td.innerHTML = ''; td.appendChild(input); input.focus(); input.select();
  function save() {
    var v = input.value; Table._edits[rowIdx + '_' + colIdx] = v;
    if (App.state.verificationResults[rowIdx]) { var f = FIELD_MAP[colIdx]; App.state.verificationResults[rowIdx][f] = v; }
    td.textContent = v || '—'; if (!v) td.classList.add('cell-empty'); else td.classList.remove('cell-empty');
  }
  function cancel() { td.textContent = currentVal || '—'; }
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); cancel(); } });
  input.addEventListener('blur', save);
};
