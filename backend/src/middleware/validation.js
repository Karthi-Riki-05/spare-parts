const { z } = require('zod');

const columnMappingSchema = z.object({
  internalItemNumber: z.string(),
  description: z.string(),
  manufacturer: z.string(),
  itemNumber: z.string(),
  typeDesignation: z.string(),
  supplementary: z.string(),
  sparePartCategory: z.string().optional(),
});

const normalizedRowSchema = z.object({
  internalItemNumber: z.string(),
  description: z.string(),
  manufacturer: z.string(),
  itemNumber: z.string(),
  typeDesignation: z.string(),
  supplementary: z.string(),
  sparePartCategory: z.string().optional(),
  _originalFormat: z.enum(['A', 'B', 'C']).optional(),
  rowIndex: z.number(),
});

const detectFormatSchema = z.object({
  fileData: z.string().min(1),
  sheetIndex: z.number().int().min(0).optional().default(0),
});

const getSheetsSchema = z.object({
  fileData: z.string().min(1),
});

const normalizeSchema = z.object({
  fileData: z.string().min(1),
  sheetIndex: z.number().int().min(0).optional().default(0),
  format: z.enum(['A', 'B', 'C']),
  mapping: columnMappingSchema.optional(),
});

const manualMapSchema = z.object({
  fileData: z.string().min(1),
  sheetIndex: z.number().int().min(0).optional().default(0),
  mapping: columnMappingSchema,
});

const verifySchema = z.object({
  rows: z.array(normalizedRowSchema).min(1).max(10000),
  batchSize: z.number().int().min(1).max(20).optional().default(5),
  originalHeaders: z.record(z.string()).nullable().optional(),
});

const exportSchema = z.object({
  results: z.array(z.any()),
  originalData: z.array(z.any()),
  fileName: z.string().default('verified.xlsx'),
  originalFormat: z.enum(['A', 'B', 'C']).optional(),
});

function validateRequest(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Validation failed', details: result.error.flatten().fieldErrors });
      return;
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  detectFormatSchema, getSheetsSchema, normalizeSchema,
  manualMapSchema, verifySchema, exportSchema, validateRequest,
};
