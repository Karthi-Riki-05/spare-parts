async function validateUrl(url) {
  if (!url || url.trim() === '') return { status: 'broken', finalUrl: null };
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (res.status === 200) return { status: 'valid', finalUrl: url };
    if (res.status >= 300 && res.status < 400) return { status: 'redirected', finalUrl: res.headers.get('location') || url };
    return { status: 'broken', finalUrl: null };
  } catch { return { status: 'timeout', finalUrl: null }; }
}

async function validateBatch(urls) {
  const pLimit = (await import('p-limit')).default;
  const limit = pLimit(5);
  return Promise.all(urls.map(url => limit(() => validateUrl(url))));
}

module.exports = { validateUrl, validateBatch };
