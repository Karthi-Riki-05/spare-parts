/**
 * ERS. Semantic Handler
 * In Swedish industrial data, "ERS." means "ersätter" = "supersedes/replaces".
 * Example: "6ES7 953-8LL31-0AA0 ERS.6ES7 953-8LL20-0AA0"
 * means new part supersedes old part.
 */
function handleErsPrefix(row) {
  const fields = ['typeDesignation', 'itemNumber'];
  const result = { ...row };

  for (const field of fields) {
    const val = result[field];
    if (!val || typeof val !== 'string') continue;

    // Match " ERS." or " ERS " pattern (with space before)
    const ersMatch = val.match(/^(.+?)\s+ERS\.?\s*(.+)$/i);
    if (!ersMatch) continue;

    const canonical = ersMatch[1].trim();
    const superseded = ersMatch[2].trim();
    if (!superseded) continue;

    result[field] = canonical;

    const supersededNote = `(supersedes: ${superseded})`;
    if (!result.supplementary || !result.supplementary.trim()) {
      result.supplementary = supersededNote;
    } else if (!result.supplementary.includes('supersedes')) {
      result.supplementary = `${result.supplementary} | ${supersededNote}`;
    }
  }

  return result;
}

module.exports = { handleErsPrefix };
