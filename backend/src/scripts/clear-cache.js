const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const cacheService = require('../services/cacheService');

(async () => {
  console.log('Clearing verification cache...');
  try {
    await cacheService.flush();
    console.log('✅ Cache successfully cleared.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to clear cache:', error.message);
    process.exit(1);
  }
})();
