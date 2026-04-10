const Database = require('better-sqlite3');
const db = new Database('./backend/data/jobs.db');
const job = db.prepare("SELECT * FROM verification_jobs LIMIT 1").get();
if (job.results_json) job.resultsData = JSON.parse(job.results_json);
console.log(job.results_json ? typeof job.results_json : "null");
console.log(Array.isArray(job.resultsData.rows));

let finalResults;
try {
  finalResults = JSON.parse(job.results_json).rows || JSON.parse(job.results_json);
  console.log("FINAL RESULTS LEN:", finalResults.length);
} catch (e) {
  console.log("ERROR", e);
}
