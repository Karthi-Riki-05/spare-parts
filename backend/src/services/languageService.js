const { GoogleGenerativeAI } = require('@google/generative-ai');
const { config } = require('../config');
const { logger } = require('../utils/logger');

let genAI = null;
function getClient() {
  if (!genAI) genAI = new GoogleGenerativeAI(config.geminiApiKey);
  return genAI;
}

/**
 * Detect language of spare parts descriptions.
 * Cost: ~$0.00001 per call (negligible).
 */
async function detectLanguage(sampleRows) {
  if (config.openaiMockMode) {
    return { language: 'English', languageCode: 'en', confidence: 100, translationNeeded: false, detectedWords: [] };
  }

  try {
    const texts = sampleRows.slice(0, 5).map(row => {
      const keys = Object.keys(row);
      return keys.map(k => String(row[k] || '')).filter(v => v.length > 3).join(' ');
    }).filter(Boolean);

    if (texts.length === 0) {
      return { language: 'English', languageCode: 'en', confidence: 50, translationNeeded: false, detectedWords: [] };
    }

    const model = getClient().getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    });

    const prompt = `Detect the primary language of the descriptive text in these spare parts rows.
Ignore part numbers, model codes, and manufacturer names (these are language-neutral).
Focus on: description fields, supplementary text, any natural language words.

Texts:
${texts.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

Respond ONLY with valid JSON:
{"language":"English","languageCode":"en","confidence":0,"detectedWords":["word1","word2"],"translationNeeded":false}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    logger.info(`[LANGUAGE] Detected: ${parsed.language} (${parsed.languageCode}) confidence=${parsed.confidence}`);

    return {
      language: parsed.language || 'English',
      languageCode: parsed.languageCode || 'en',
      confidence: parsed.confidence || 0,
      translationNeeded: parsed.translationNeeded === true,
      detectedWords: parsed.detectedWords || [],
    };
  } catch (err) {
    logger.warn(`[LANGUAGE] Detection failed (defaulting to English): ${err.message}`);
    return { language: 'English', languageCode: 'en', confidence: 0, translationNeeded: false, detectedWords: [] };
  }
}

/**
 * Translate descriptive text to English.
 * NEVER translates part numbers, model codes, or manufacturer names.
 */
async function translateToEnglish(text, fromLanguage) {
  if (!text || !fromLanguage || fromLanguage === 'English' || fromLanguage === 'en') return text;

  try {
    const model = getClient().getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { temperature: 0.1 },
    });

    const prompt = `Translate this ${fromLanguage} spare parts description to English.
RULES:
- Translate descriptive words (e.g. "KUGGVÄXELMOTOR" → "Gear Motor")
- NEVER translate part numbers (e.g. "R77 DRS71M4BE1" stays as-is)
- NEVER translate manufacturer names (e.g. "SKF", "Siemens" stay as-is)
- NEVER translate alphanumeric codes
- Keep the same format and structure

Text: "${text}"

Respond with ONLY the translated text, no quotes, no explanation.`;

    const result = await model.generateContent(prompt);
    const translated = result.response.text().trim().replace(/^["']|["']$/g, '');
    return translated || text;
  } catch (err) {
    logger.warn(`[LANGUAGE] Translation to English failed: ${err.message}`);
    return text; // Graceful fallback
  }
}

/**
 * Translate from English back to target language.
 * Prefers originalText if available.
 */
async function translateFromEnglish(text, toLanguage, originalText) {
  if (!text || !toLanguage || toLanguage === 'English' || toLanguage === 'en') return text;
  if (originalText) return originalText; // Prefer stored original

  try {
    const model = getClient().getGenerativeModel({
      model: 'gemini-flash-latest',
      generationConfig: { temperature: 0.1 },
    });

    const prompt = `Translate this English spare parts description to ${toLanguage}.
RULES:
- Translate descriptive words back to ${toLanguage}
- NEVER translate part numbers, model codes, manufacturer names, or alphanumeric codes
- Keep the same format and structure

Text: "${text}"

Respond with ONLY the translated text, no quotes, no explanation.`;

    const result = await model.generateContent(prompt);
    const translated = result.response.text().trim().replace(/^["']|["']$/g, '');
    return translated || text;
  } catch (err) {
    logger.warn(`[LANGUAGE] Translation from English failed: ${err.message}`);
    return text; // Graceful fallback
  }
}

module.exports = { detectLanguage, translateToEnglish, translateFromEnglish };
