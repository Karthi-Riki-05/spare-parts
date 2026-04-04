const { getSheetNames } = require('../services/excelService');

async function handleGetSheets(req, res, next) {
  try {
    const names = await getSheetNames(req.body.fileData);
    res.json({ sheets: names.map((name, index) => ({ index, name })) });
  } catch (error) { next(error); }
}

module.exports = { handleGetSheets };
