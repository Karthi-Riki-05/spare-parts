const http = require('http');

const data = JSON.stringify({
  rows: [
    {
      rowIndex: 1,
      internalItemNumber: "123",
      description: "Siemens SIMOTICS S-1FL6",
      manufacturer: "Siemens",
      itemNumber: "1FL6062-1AC61-0AA1",
      typeDesignation: "",
      supplementary: ""
    }
  ],
  batchSize: 5
});

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/verify',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});
req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});
req.write(data);
req.end();
