function areEqual(a, b) { return a.trim().toLowerCase() === b.trim().toLowerCase(); }

function deduplicateOriginal(row) {
  if (row.itemNumber && row.typeDesignation && areEqual(row.itemNumber, row.typeDesignation)) {
    return { ...row, typeDesignation: '' };
  }
  return row;
}

function deduplicateVerified(result) {
  if (result.itemNumber && result.typeDesignation && areEqual(result.itemNumber, result.typeDesignation)) {
    return { ...result, typeDesignation: '' };
  }
  return result;
}

function normalizeCanonicalField(row) {
  if (!row.itemNumber.trim() && row.typeDesignation.trim()) {
    return { ...row, itemNumber: row.typeDesignation, typeDesignation: '' };
  }
  return row;
}

function applyAllDeduplication(row) {
  let result = normalizeCanonicalField(row);
  result = deduplicateOriginal(result);
  return result;
}

module.exports = { deduplicateOriginal, deduplicateVerified, normalizeCanonicalField, applyAllDeduplication };
