const knownBrands = [
  'Siemens', 'ABB', 'SKF', 'Bosch', 'Festo', 'Atlas Copco',
  'Schneider', 'Rockwell', 'Bleichert', 'Hydac', 'Interroll',
  'Lecab', 'Loramendi', 'Marposs', 'Renold', 'Wheelabrator',
  'Phoenix Contact', 'Omron', 'Parker', 'Danfoss', 'SEW',
  'Sick', 'Balluff', 'IFM', 'Turck', 'Pepperl', 'Rexroth',
  'Mitsubishi', 'Fanuc', 'Yaskawa', 'Lenze', 'Nord', 'Weidmuller',
];

function detectFormatHeuristic(sampleRows) {
  if (!sampleRows || sampleRows.length === 0) {
    return { format: 'A', confidence: 92, reasoning: 'No data to analyze — defaulting to Format A.' };
  }

  const headers = Object.keys(sampleRows[0] || {});
  if (headers.length === 0) {
    return { format: 'A', confidence: 92, reasoning: 'No columns found — defaulting to Format A.' };
  }

  // Count fill rates per column
  const fillRates = headers.map(h => {
    const filled = sampleRows.filter(r => {
      const v = r[h];
      return v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '—';
    }).length;
    return { col: h, rate: filled / sampleRows.length };
  });

  const populatedCols = fillRates.filter(c => c.rate > 0.4);

  // If only 1-2 columns have data → Format B or C
  if (populatedCols.length <= 2) {
    const allText = sampleRows
      .flatMap(r => Object.values(r))
      .map(v => String(v ?? ''))
      .join(' ');

    const hasBrand = knownBrands.some(b =>
      new RegExp(`\\b${b}\\b`, 'i').test(allText)
    );

    return {
      format: hasBrand ? 'B' : 'C',
      confidence: 85,
      reasoning: hasBrand
        ? 'Data concentrated in few columns with brand names embedded — Format B (single-column).'
        : 'Data concentrated in few columns without identifiable brands — Format C (incomplete).',
    };
  }

  // 3+ columns with data — check manufacturer column fill rate
  const mfrCol = fillRates.find(c => {
    // In raw col_X format, try col_2 (typical manufacturer position)
    // Also check if header text contains manufacturer-related words
    return c.col === 'col_2';
  });

  if (mfrCol && mfrCol.rate < 0.25) {
    return {
      format: 'C',
      confidence: 83,
      reasoning: 'Multiple columns present but manufacturer column is mostly empty — Format C (incomplete).',
    };
  }

  return {
    format: 'A',
    confidence: 92,
    reasoning: 'Data is organized in separate columns matching the expected format.',
  };
}

function buildMockDetection(sampleRows) {
  const heuristic = detectFormatHeuristic(sampleRows);
  const headers = Object.keys((sampleRows && sampleRows[0]) || {});
  return {
    ...heuristic,
    suggestedMapping: {
      internalItemNumber: headers[0] || 'col_0',
      description: headers[1] || 'col_1',
      manufacturer: headers[2] || 'col_2',
      itemNumber: headers[3] || 'col_3',
      typeDesignation: headers[4] || 'col_4',
      supplementary: headers[5] || 'col_5',
    },
  };
}

const mockFormatDetection = {
  format: 'A', confidence: 92,
  reasoning: 'Data is organized in separate columns matching the expected format.',
  suggestedMapping: { internalItemNumber: 'col_0', description: 'col_1', manufacturer: 'col_2', itemNumber: 'col_3', typeDesignation: 'col_4', supplementary: 'col_5' },
  rowCount: 5, sheetIndex: 0,
};

// Mock normalization parses text heuristically instead of returning static data
function mockNormalizeRow(rawText) {
  const knownBrands = [
    'Siemens', 'ABB', 'SKF', 'Bosch', 'Festo', 'Atlas Copco',
    'Schneider', 'Rockwell', 'Hydac', 'Omron', 'Parker', 'Danfoss',
    'SEW', 'Sick', 'Balluff', 'IFM', 'Turck', 'Rexroth', 'Phoenix Contact',
    'Mitsubishi', 'Fanuc', 'Yaskawa', 'Lenze', 'Nord', 'Weidmuller',
    'Pepperl', 'Renold', 'Interroll', 'Marposs', 'Lecab',
  ];
  const text = String(rawText || '');
  let manufacturer = '';
  for (const brand of knownBrands) {
    if (new RegExp(`\\b${brand}\\b`, 'i').test(text)) {
      manufacturer = brand;
      break;
    }
  }
  // Extract alphanumeric codes as type_designation
  const codeMatch = text.match(/\b([A-Z0-9]{2,}[-/.][A-Z0-9]+[-/.A-Z0-9]*)\b/i);
  const typeDesignation = codeMatch ? codeMatch[1] : '';
  // Description = first meaningful words (strip brand and code)
  let description = text
    .replace(new RegExp(`\\b${manufacturer}\\b`, 'i'), '')
    .replace(typeDesignation, '')
    .replace(/[,\s]+/g, ' ')
    .trim()
    .split(' ').slice(0, 4).join(' ') || text.slice(0, 30);

  return {
    description, manufacturer,
    item_number: '', type_designation: typeDesignation, supplementary: '',
    swedish_found: false, ers_removed: false,
  };
}

const mockNormalization = {
  description: 'Ball bearing, sealed', manufacturer: 'SKF',
  item_number: '62304-2RS1', type_designation: '', supplementary: '',
  swedish_found: true, ers_removed: false,
};

module.exports = { mockFormatDetection, mockNormalization, mockNormalizeRow, buildMockDetection };
