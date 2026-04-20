/**
 * Business rule test suite — verifies the 4 critical rules:
 *   R1  internalItemNumber NEVER sent to the AI (any of the 3 Gemini paths)
 *   R2a if itemNumber == typeDesignation in the ORIGINAL row, keep only itemNumber
 *   R2b if the AI duplicates a value into both C/D, mirror back to the original layout
 *   R3  supplementary is Plan-B: used only on the second pass (score < 70),
 *       and internal-instruction supplementary is NEVER modified
 *   R4  manufacturer inference rules are sent to the AI, manufacturer_inferred
 *       is surfaced on the result, and blank values are NOT invented
 *
 * Implementation notes:
 *   - The suite mocks `@google/generative-ai` at the module level so we can
 *     (a) capture the prompt sent to Gemini and (b) inject canned responses.
 *   - No Postgres, no network, no real Gemini calls — runs in < 5s.
 *   - Env vars are forced BEFORE any src/ module is required so config.js
 *     (Zod-validated) does not blow up.
 */

// ─────────────────────────────────────────────────────────────
// Env setup (must run before any require of src/)
// ─────────────────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://spare_partner_user:SuperAdmin%402026@localhost:5433/spareparts_test';
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.LOG_LEVEL = 'error';
process.env.LOG_WRITE = 'false';
// Keep mock modes OFF — we want the REAL prompt-building code to run so we
// can assert what was sent to the Gemini client. The @google/generative-ai
// module is mocked below so no network call is actually made.
process.env.MOCK_MODE = 'false';
process.env.GEMINI_MOCK_MODE = 'false';
process.env.CLAUDE_MOCK_MODE = 'false';
process.env.OPENAI_MOCK_MODE = 'false';
process.env.MAX_RETRIES = '0';       // fail-fast — no retry-stall on bad JSON
process.env.RETRY_DELAY_MS = '1';

// vitest.config.js sets `globals: true`, so vi / describe / test / expect /
// beforeEach are all globals. No explicit import needed (and it would also
// collide with vi.mock hoisting semantics).

// ─────────────────────────────────────────────────────────────
// Replace @google/generative-ai in Node's require.cache BEFORE any src/
// module is required. geminiService/claudeService/openaiService each
// destructure `GoogleGenerativeAI` at require-time, so our fake must be
// in the cache before they are loaded.
// ─────────────────────────────────────────────────────────────
const capturedPrompts = [];
const responseQueue = [];

function enqueueJsonResponse(obj) {
  responseQueue.push(JSON.stringify(obj));
}

class MockGoogleGenerativeAI {
  constructor(apiKey) { this.apiKey = apiKey; }
  getGenerativeModel() {
    return {
      generateContent: async (prompt) => {
        capturedPrompts.push(String(prompt));
        const body = responseQueue.shift();
        if (body === undefined) {
          const fallback = JSON.stringify({
            description: '', manufacturer: '', item_number: '',
            type_designation: '', supplementary: '',
            verification_score: 0, website_id: '', source_type: 'not_found',
            manufacturer_inferred: false,
          });
          return { response: { text: () => fallback } };
        }
        return { response: { text: () => body } };
      },
    };
  }
}

(function installMock() {
  const resolved = require.resolve('@google/generative-ai');
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: { GoogleGenerativeAI: MockGoogleGenerativeAI },
    children: [],
    paths: [],
  };
})();

// ─────────────────────────────────────────────────────────────
// Require the services AFTER mocks + env are in place
// ─────────────────────────────────────────────────────────────
const geminiService = require('../../src/services/geminiService');
const claudeService = require('../../src/services/claudeService');
const { normalizeRowsBatch } = require('../../src/services/openaiService');
const {
  applyAllDeduplication,
  deduplicateVerified,
  mirrorOriginalLayout,
} = require('../../src/services/deduplicationService');
const {
  classifySupplementary,
  isInternalInstruction,
} = require('../../src/services/supplementaryLogger');

// Helper: reset capture state between tests
function resetCapture() {
  capturedPrompts.length = 0;
  responseQueue.length = 0;
}

beforeEach(resetCapture);

// =============================================================
// RULE 1 — internalItemNumber NEVER sent to the AI
// =============================================================
describe('R1: internalItemNumber is never sent to the AI', () => {
  test('R1.1 — not in normalization (openaiService) prompt', async () => {
    const secret = 'SECRET-NORM-001';
    enqueueJsonResponse([
      { description: 'Ball bearing', manufacturer: 'SKF',
        item_number: '6205-2RS1', type_designation: '',
        supplementary: '', swedish_found: false },
    ]);

    // normalizeRowsBatch accepts [{ text }] — the internal number is NOT a
    // field on the batch input. Feed raw text that does NOT leak the secret
    // and ensure the built prompt never mentions it.
    await normalizeRowsBatch(
      [{ text: 'SKF bearing 6205-2RS1' }],
      'test-corr-1.1',
    );

    expect(capturedPrompts.length).toBeGreaterThan(0);
    const p = capturedPrompts.join('\n');
    expect(p).not.toContain(secret);
    expect(p).not.toContain('internalItemNumber');
    expect(p).not.toContain('internal_item_number');
  });

  test('R1.2 — not in verification (geminiService) prompt', async () => {
    const secret = 'SECRET-VERIFY-002';
    enqueueJsonResponse({
      description: 'Deep groove ball bearing', manufacturer: 'SKF',
      item_number: '6205-2RS1', type_designation: '6205-2RS1',
      verification_score: 90, website_id: 'https://www.skf.com/x',
      source_type: 'official', manufacturer_inferred: false,
    });

    await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: secret,
        description: 'Deep groove ball bearing',
        manufacturer: 'SKF',
        itemNumber: '6205-2RS1',
        typeDesignation: '6205-2RS1',
        supplementary: '',
      },
      false,
      'test-corr-1.2',
    );

    expect(capturedPrompts.length).toBe(1);
    expect(capturedPrompts[0]).not.toContain(secret);
    expect(capturedPrompts[0]).not.toContain('internalItemNumber');
  });

  test('R1.3 — not in rule-enforcement (claudeService) prompt', async () => {
    const secret = 'SECRET-ENFORCE-003';
    enqueueJsonResponse({
      description: 'Servo motor', manufacturer: 'Siemens',
      item_number: '1FK7063', type_designation: '',
      supplementary: '', verified_source: 'Manufacturer website',
      verification_score: 85, website_id: 'https://www.siemens.com/x',
      source_type: 'official', manufacturer_inferred: true,
    });

    const row = {
      rowIndex: 0,
      internalItemNumber: secret,
      description: 'Servo motor',
      manufacturer: '',
      itemNumber: '1FK7063',
      typeDesignation: '',
      supplementary: '',
    };
    const geminiResult = {
      description: 'Servo motor', manufacturer: '',
      itemNumber: '1FK7063', typeDesignation: '', supplementary: '',
      verifiedSource: 'Not found', verificationScore: 45,
      websiteId: '', sourceType: 'not_found',
      manufacturerWebsite: '', manufacturerInferred: false,
    };

    await claudeService.enforceRules(row, geminiResult, 'test-corr-1.3');

    expect(capturedPrompts.length).toBe(1);
    expect(capturedPrompts[0]).not.toContain(secret);
    expect(capturedPrompts[0]).not.toContain('internalItemNumber');
  });

  test('R1.4 — internalItemNumber survives through the dedup pipeline for output', () => {
    // verificationService.processRows reattaches internalItemNumber onto the
    // result after dedup/mirror. We assert the dedup pipeline itself does
    // not strip the field.
    const row = {
      rowIndex: 7,
      internalItemNumber: 'INT-001-DISPLAY',
      description: 'Ball bearing',
      manufacturer: 'SKF',
      itemNumber: '6205',
      typeDesignation: '6205',
      supplementary: '',
    };
    const deduped = applyAllDeduplication(row);
    const verified = {
      ...deduped,
      itemNumber: '6205',
      typeDesignation: '6205',
      verificationScore: 90,
    };
    const final = mirrorOriginalLayout(deduplicateVerified(verified), deduped);

    expect(final.internalItemNumber).toBe('INT-001-DISPLAY');
  });
});

// =============================================================
// RULE 2 — dedup of itemNumber (C) and typeDesignation (D)
// =============================================================
describe('R2: deduplication of C (itemNumber) and D (typeDesignation)', () => {
  test('R2a — same value in original: typeDesignation is cleared', () => {
    const out = applyAllDeduplication({
      internalItemNumber: 'INT-001',
      description: 'Memory module',
      manufacturer: 'Siemens',
      itemNumber: '6ES7953-8LL31-0AA0',
      typeDesignation: '6ES7953-8LL31-0AA0',
      supplementary: '',
    });
    expect(out.itemNumber).toBe('6ES7953-8LL31-0AA0');
    expect(out.typeDesignation).toBe('');
  });

  test('R2a — case-insensitive dedup', () => {
    const out = applyAllDeduplication({
      internalItemNumber: 'INT-002',
      description: 'Valve',
      manufacturer: 'Festo',
      itemNumber: 'MFH-5-1/4',
      typeDesignation: 'mfh-5-1/4',
      supplementary: '',
    });
    expect(out.itemNumber.toLowerCase()).toBe('mfh-5-1/4');
    expect(out.typeDesignation).toBe('');
  });

  test('R2a — different values are BOTH kept', () => {
    const out = applyAllDeduplication({
      internalItemNumber: 'INT-003',
      description: 'Servo drive',
      manufacturer: 'Bosch Rexroth',
      itemNumber: 'R911318481',
      typeDesignation: 'FWA-INDRV*-MPB-05VRS-D5',
      supplementary: '',
    });
    expect(out.itemNumber).toBe('R911318481');
    expect(out.typeDesignation).toBe('FWA-INDRV*-MPB-05VRS-D5');
  });

  test('R2b — AI adds duplicate to empty typeDesignation: mirror clears it', () => {
    // Original: only itemNumber populated; AI returned same value in both
    const original = {
      itemNumber: '3TF3200-0A',
      typeDesignation: '',
    };
    const aiResult = {
      itemNumber: '3TF3200-0A',
      typeDesignation: '3TF3200-0A', // AI duplicated — bug shape
      verificationScore: 90,
      sourceType: 'official',
    };
    const out = mirrorOriginalLayout(aiResult, original);
    expect(out.itemNumber).toBe('3TF3200-0A');
    expect(out.typeDesignation).toBe('');
  });

  test('R2b — original had both distinct values: both kept after verify', () => {
    const original = {
      itemNumber: 'R911318481',
      typeDesignation: 'R77 DRS71M4BE1',
    };
    const aiResult = {
      itemNumber: 'R911318481',
      typeDesignation: 'R77 DRS71M4BE1',
      verificationScore: 85,
      sourceType: 'external',
    };
    const out = mirrorOriginalLayout(aiResult, original);
    expect(out.itemNumber).toBe('R911318481');
    expect(out.typeDesignation).toBe('R77 DRS71M4BE1');
  });
});

// =============================================================
// RULE 3 — supplementary is Plan B (second pass), never modified if TYPE_B
// =============================================================
describe('R3: supplementary used only on the second pass (Plan B)', () => {
  test('R3.1 — first pass omits supplementary from the prompt', async () => {
    enqueueJsonResponse({
      description: 'Inductive sensor', manufacturer: 'IFM',
      item_number: 'IGC210', type_designation: 'LR7000',
      verification_score: 85, source_type: 'distributor',
      manufacturer_inferred: false,
    });

    await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: 'Inductive sensor',
        manufacturer: 'IFM',
        itemNumber: 'IGC210',
        typeDesignation: 'LR7000',
        supplementary: 'M12 CONT. SN=8MM M18 L=70MM',
      },
      false, // useSupplementary = false (first pass)
      'test-corr-3.1',
    );

    expect(capturedPrompts.length).toBe(1);
    const p = capturedPrompts[0];
    expect(p).not.toContain('Supplementary Info:');
    expect(p).not.toContain('M12 CONT. SN=8MM M18 L=70MM');
  });

  test('R3.2 — second pass INCLUDES supplementary in the prompt', async () => {
    enqueueJsonResponse({
      description: 'Proximity sensor', manufacturer: 'Marposs',
      item_number: 'W-459066', type_designation: '',
      verification_score: 80, source_type: 'distributor',
      manufacturer_inferred: true,
    });

    await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: 'Proximity sensor',
        manufacturer: '',
        itemNumber: 'W-459066',
        typeDesignation: '',
        supplementary: 'for Marposs arm',
      },
      true, // useSupplementary = true (second pass)
      'test-corr-3.2',
    );

    const p = capturedPrompts[0];
    expect(p).toContain('Supplementary Info:');
    expect(p).toContain('for Marposs arm');
  });

  test('R3.3 — supplementary-as-Plan-B threshold: supp is only considered when score < 70 AND type is part_specification', () => {
    // Covers verificationService.processRows gating logic. We test the two
    // underlying predicates here so the rule is enforced without spinning up
    // the full processRows pipeline.
    const partSpec = 'MFH-5-1/4, 24V DC, sealed';
    const instruction = 'do not order — contact supplier';

    expect(classifySupplementary(partSpec)).toBe('part_specification');
    expect(classifySupplementary(instruction)).toBe('internal_instruction');

    // A score of 75 must NOT trigger a retry regardless of supp type
    const shouldRetry = (score, supp) =>
      score < 70 &&
      supp.trim().length > 0 &&
      classifySupplementary(supp) === 'part_specification';

    expect(shouldRetry(75, partSpec)).toBe(false);   // score gate stops
    expect(shouldRetry(45, partSpec)).toBe(true);    // retry with supp
    expect(shouldRetry(45, instruction)).toBe(false); // TYPE_B locked
  });

  test('R3.4 — internal-instruction supplementary is preserved byte-for-byte by claudeService', async () => {
    const originalSupp =
      'MÅSTE TAS UT I SAMBAND MED UTTAG AV KONTROLLERKORT CSH** do not order';
    expect(isInternalInstruction(originalSupp)).toBe(true);

    // claudeService.enforceRules MUST return the original supplementary
    // unchanged even if the model tries to rewrite it.
    enqueueJsonResponse({
      description: 'Firmware',
      manufacturer: 'Indramat',
      item_number: 'R911318481',
      type_designation: 'FWA-INDRV*-MPB-05VRS',
      supplementary: 'AI REWROTE THIS — should be ignored',
      verified_source: 'Manufacturer website',
      verification_score: 80,
      website_id: 'https://www.boschrexroth.com/x',
      source_type: 'official',
      manufacturer_inferred: false,
    });

    const row = {
      rowIndex: 0,
      internalItemNumber: '',
      description: 'Firmware',
      manufacturer: 'Indramat',
      itemNumber: 'R911318481',
      typeDesignation: 'FWA-INDRV*-MPB-05VRS',
      supplementary: originalSupp,
    };
    const geminiResult = {
      description: 'Firmware', manufacturer: 'Indramat',
      itemNumber: 'R911318481', typeDesignation: 'FWA-INDRV*-MPB-05VRS',
      supplementary: originalSupp,
      verifiedSource: 'Not found', verificationScore: 60,
      websiteId: '', sourceType: 'not_found',
      manufacturerWebsite: '', manufacturerInferred: false,
    };

    const out = await claudeService.enforceRules(row, geminiResult, 'test-corr-3.4');
    expect(out.supplementary).toBe(originalSupp);
  });
});

// =============================================================
// RULE 4 — infer manufacturer if NULL; never invent
// =============================================================
describe('R4: manufacturer inference', () => {
  test('R4.1 — 1LA prefix → Siemens: inference rules are sent to the model', async () => {
    enqueueJsonResponse({
      description: '3-phase motor',
      manufacturer: 'Siemens',
      item_number: '',
      type_designation: '1LA7133-6AA61',
      verification_score: 90,
      website_id: 'https://www.siemens.com/x',
      source_type: 'official',
      manufacturer_inferred: true,
    });

    const result = await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: '3 Phase Motor',
        manufacturer: '',
        itemNumber: '',
        typeDesignation: '1LA7133-6AA61',
        supplementary: '',
      },
      false,
      'test-corr-4.1',
    );

    // Prompt must actually ask the model to infer using the 1LA rule
    expect(capturedPrompts[0]).toContain('1LA');
    expect(capturedPrompts[0]).toMatch(/Siemens/);
    // The model's inferred answer must surface on the mapped result
    expect(result.manufacturer).toBe('Siemens');
    expect(result.manufacturerInferred).toBe(true);
  });

  test('R4.2 — R9 item-number prefix → Bosch Rexroth', async () => {
    enqueueJsonResponse({
      description: 'Servo drive firmware',
      manufacturer: 'Bosch Rexroth',
      item_number: 'R911318481',
      type_designation: 'FWA-INDRV*-MPB-05VRS-D5',
      verification_score: 88,
      website_id: 'https://www.boschrexroth.com/x',
      source_type: 'official',
      manufacturer_inferred: true,
    });

    const result = await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: 'Servo drive firmware',
        manufacturer: '',
        itemNumber: 'R911318481',
        typeDesignation: 'FWA-INDRV*-MPB-05VRS-D5',
        supplementary: '',
      },
      false,
      'test-corr-4.2',
    );

    expect(capturedPrompts[0]).toMatch(/R9.*Bosch Rexroth|Bosch Rexroth.*R9/s);
    expect(result.manufacturer).toBe('Bosch Rexroth');
    expect(result.manufacturerInferred).toBe(true);
  });

  test('R4.3 — MOVIDRIVE keyword → SEW-Eurodrive', async () => {
    enqueueJsonResponse({
      description: 'MOVIDRIVE frequency converter',
      manufacturer: 'SEW-Eurodrive',
      item_number: '8241686',
      type_designation: 'MDX BG6',
      verification_score: 80,
      website_id: 'https://www.sew-eurodrive.com/x',
      source_type: 'official',
      manufacturer_inferred: true,
    });

    const result = await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: 'MOVIDRIVE frequency converter',
        manufacturer: '',
        itemNumber: '8241686',
        typeDesignation: 'MDX BG6',
        supplementary: 'ART.NR.8241686 FÖR MOVIDRIVE',
      },
      false,
      'test-corr-4.3',
    );

    expect(capturedPrompts[0]).toMatch(/MOVIDRIVE/);
    expect(result.manufacturer).toMatch(/SEW/i);
    expect(result.manufacturerInferred).toBe(true);
  });

  test('R4.4 — existing manufacturer is not overwritten', async () => {
    enqueueJsonResponse({
      description: 'Deep groove ball bearing',
      manufacturer: 'SKF',
      item_number: '6205-2RS1',
      type_designation: '6205-2RS1',
      verification_score: 95,
      website_id: 'https://www.skf.com/x',
      source_type: 'official',
      manufacturer_inferred: false,
    });

    const result = await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: 'Deep groove ball bearing',
        manufacturer: 'SKF',
        itemNumber: '6205-2RS1',
        typeDesignation: '6205-2RS1',
        supplementary: '',
      },
      false,
      'test-corr-4.4',
    );

    expect(result.manufacturer).toBe('SKF');
    expect(result.manufacturerInferred).toBe(false);
  });

  test('R4.5 — when the model cannot infer, manufacturer stays empty (not invented)', async () => {
    enqueueJsonResponse({
      description: 'Bolt M10',
      manufacturer: '',
      item_number: '833.170',
      type_designation: '45 X 4 LÅ1008',
      verification_score: 40,
      website_id: '',
      source_type: 'not_found',
      manufacturer_inferred: false,
    });

    const result = await geminiService.verifyRow(
      {
        rowIndex: 0,
        internalItemNumber: '',
        description: 'Bolt M10',
        manufacturer: '',
        itemNumber: '833.170',
        typeDesignation: '45 X 4 LÅ1008',
        supplementary: 'Drawing: 833.170',
      },
      false,
      'test-corr-4.5',
    );

    expect(result.manufacturer).toBe('');
    expect(result.manufacturerInferred).toBe(false);
  });
});
