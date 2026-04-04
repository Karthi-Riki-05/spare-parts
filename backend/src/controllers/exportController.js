const { buildVerifiedExcel } = require('../services/excelService');

async function handleExport(req, res, next) {
  try {
    const { results, originalData, fileName, originalFormat } = req.body;
    const format = originalFormat || results[0]?._originalFormat || 'A';
    const buffer = await buildVerifiedExcel(results, originalData, format);
    const baseName = fileName.replace(/\.xlsx?$/i, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="verified_${baseName}.xlsx"`);
    res.send(buffer);
  } catch (error) { next(error); }
}

module.exports = { handleExport };
