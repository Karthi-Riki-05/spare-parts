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
  const item = (row.itemNumber || '').trim();
  const type = (row.typeDesignation || '').trim();
  if (!item && type) {
    return { ...row, itemNumber: type, typeDesignation: '' };
  }
  return row;
}

function applyAllDeduplication(row) {
  let result = normalizeCanonicalField(row);
  result = deduplicateOriginal(result);
  return result;
}

// Req 2b: enforce original C/D layout on verified result.
// If the model duplicated the same value into both itemNumber and typeDesignation,
// keep only the field that was populated in the original input data.
function mirrorOriginalLayout(verified, original) {
  const origItem = (original.itemNumber || '').trim();
  const origType = (original.typeDesignation || '').trim();
  const verItem = (verified.itemNumber || '').trim();
  const verType = (verified.typeDesignation || '').trim();

  if (verItem && verType && verItem.toLowerCase() === verType.toLowerCase()) {
    if (origItem && !origType) return { ...verified, typeDesignation: '' };
    if (!origItem && origType) return { ...verified, itemNumber: '' };
    return { ...verified, typeDesignation: '' };
  }
  return verified;
}

module.exports = { deduplicateOriginal, deduplicateVerified, normalizeCanonicalField, applyAllDeduplication, mirrorOriginalLayout };
