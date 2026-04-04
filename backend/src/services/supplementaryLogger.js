const TYPE_B_PATTERNS = [
  /\bcontact\b/i, /\bcheck with\b/i, /\bdo not\b/i, /\binternal\b/i,
  /\bsee note\b/i, /\bsupplier specific\b/i, /\bask\s+\w+/i, /\bcall\s+\w+/i,
  /\bplease\b/i, /\bdo\s+not\s+order\b/i, /\brefer\s+to\b/i,
];

function isInternalInstruction(text) {
  if (!text || text.trim() === '') return false;
  return TYPE_B_PATTERNS.some(p => p.test(text));
}

function classifySupplementary(text) {
  if (!text || text.trim() === '') return 'unknown';
  if (isInternalInstruction(text)) return 'internal_instruction';
  return 'part_specification';
}

function createChangeLog(rowIndex, original, updated, score, model) {
  return {
    rowIndex, originalValue: original, newValue: updated,
    reason: `Confidence score was ${score} (<70)`,
    confidenceScore: score, aiModel: model, timestamp: new Date().toISOString(),
  };
}

module.exports = { isInternalInstruction, classifySupplementary, createChangeLog };
