const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const cacheService = require('../services/cacheService');

console.log('Clearing verification cache...');
try {
  cacheService.flush();
  console.log('✅ Cache successfully cleared.');
} catch (error) {
  console.error('❌ Failed to clear cache:', error.message);
  process.exit(1);
}
