App.startVerification = async function() {
  if (!App.state.normalizedRows.length) return;
  App.hide('btn-verify'); App.show('btn-stop'); App.show('progress-section'); App.show('log-section');
  App.setHtml('log-entries', '');
  App.state.abortController = new AbortController();
  var startTime = Date.now();
  try {
    var res = await fetch('/api/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: App.state.normalizedRows, batchSize: 5 }),
      signal: App.state.abortController.signal
    });
    var reader = res.body.getReader(), decoder = new TextDecoder(), buffer = '';
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith('data:')) continue;
        try {
          var evt = JSON.parse(line.slice(5));
          if (evt.type === 'progress') {
            var elapsed = (Date.now() - startTime) / 1000;
            var rate = evt.completed > 0 ? elapsed / evt.completed : 0;
            var remaining = rate > 0 ? Math.ceil(rate * (evt.total - evt.completed)) : 0;
            App.updateProgress('Batch ' + evt.batch + '/' + evt.totalBatches + ' — row ' + evt.completed + '/' + evt.total, remaining > 0 ? '~' + remaining + 's remaining' : '', (evt.completed / evt.total) * 100);
          }
          if (evt.type === 'row_complete') {
            var r = evt.result;
            App.addLog('Row ' + (r.rowIndex + 1) + ': ' + r.manufacturer + ' ' + r.itemNumber + ' — Score: ' + r.verificationScore + ' — ' + r.verifiedSource, r.verificationScore >= 70 ? 'success' : 'fail');
            if (r.supplementaryChanged) App.addLog('Supplementary: "' + r.supplementaryOriginal + '" → "' + r.supplementary + '" (score ' + r.verificationScore + ')', 'change');
          }
          if (evt.type === 'complete') {
            var resp = evt.response;
            App.state.verificationResults = resp.results; App.state.stats = resp.stats; App.state.changeLogs = resp.changeLogs || [];
            App.updateStats(resp.stats); App.updateProgress('Verification complete!', resp.stats.webVerified + ' rows verified', 100);
            document.getElementById('progress-message').style.color = 'var(--accent-green)';
            Table.render(resp.results, true); App.show('btn-download');
          }
          if (evt.type === 'error') App.addLog('Row ' + (evt.rowIndex + 1) + ': ' + evt.message, 'fail');
        } catch (pe) {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') { App.addLog('Error: ' + e.message, 'fail'); App.updateProgress('Failed', e.message, 0); }
  } finally { App.hide('btn-stop'); App.show('btn-verify'); }
};
