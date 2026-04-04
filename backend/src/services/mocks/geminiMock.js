/**
 * Gemini mock — returns input-dependent verification results
 * so each row gets a plausible unique result instead of static Siemens data.
 */
function mockVerificationResult(rowIndex, row) {
  // If row data is provided, build a result that echoes the input
  if (row && (row.description || row.manufacturer || row.itemNumber || row.typeDesignation)) {
    const score = row.manufacturer && (row.itemNumber || row.typeDesignation) ? 85 : 45;
    return {
      rowIndex,
      internalItemNumber: '',
      description: row.description || '',
      manufacturer: row.manufacturer || '',
      itemNumber: row.itemNumber || '',
      typeDesignation: row.typeDesignation || '',
      supplementary: row.supplementary || '',
      verifiedSource: score >= 70 ? 'Manufacturer website' : 'Not found',
      verificationScore: score,
      websiteId: score >= 70 ? `https://www.example.com/product/${(row.itemNumber || row.typeDesignation || '').replace(/\s/g, '')}` : '',
      sourceType: score >= 70 ? 'official' : 'not_found',
      manufacturerWebsite: row.manufacturer ? `https://www.${row.manufacturer.toLowerCase().replace(/\s/g, '')}.com` : '',
      manufacturerInferred: !row.manufacturer,
      supplementaryUsed: false,
      supplementaryChanged: false,
      supplementaryOriginal: row.supplementary || '',
      supplementaryType: 'unknown',
      urlValidationStatus: score >= 70 ? 'valid' : 'unchecked',
    };
  }

  // Fallback for calls without row data
  return {
    rowIndex, internalItemNumber: '', description: 'Mock verified part',
    manufacturer: 'MockCo', itemNumber: 'MOCK-001', typeDesignation: '',
    supplementary: '', verifiedSource: 'Manufacturer website', verificationScore: 80,
    websiteId: 'https://example.com/mock',
    sourceType: 'official', manufacturerWebsite: 'https://www.mockco.com',
    manufacturerInferred: false, supplementaryUsed: false, supplementaryChanged: false,
    supplementaryOriginal: '', supplementaryType: 'unknown', urlValidationStatus: 'valid',
  };
}

module.exports = { mockVerificationResult };
