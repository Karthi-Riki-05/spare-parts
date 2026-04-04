document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('btn-download');
  if (btn) btn.addEventListener('click', async function() {
    if (!App.state.verificationResults || !App.state.verificationResults.length) return;
    btn.textContent = 'Exporting...'; btn.disabled = true;
    try {
      var res = await fetch('/api/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: App.state.verificationResults, originalData: App.state.originalData, fileName: App.state.fileName || 'verified.xlsx' })
      });
      if (!res.ok) throw new Error('Export failed');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var name = (App.state.fileName || 'parts').replace(/\.[^.]+$/, '');
      a.href = url; a.download = 'verified_' + name + '.xlsx';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { alert('Export error: ' + e.message); }
    finally { btn.innerHTML = '&#8681; Download'; btn.disabled = false; }
  });
});
