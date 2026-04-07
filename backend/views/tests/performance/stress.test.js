import { describe, test, expect } from 'vitest';
const request = require('supertest');
const { app } = require('../../src/server');
const fs = require('fs');
const path = require('path');

describe('Backend Performance Tests', () => {
  let fixtureBase64;

  try {
    const fixturePath = path.join(__dirname, '../fixtures/company-a-sample.xlsx');
    if (fs.existsSync(fixturePath)) {
      fixtureBase64 = fs.readFileSync(fixturePath).toString('base64');
    }
  } catch {}

  test('health endpoint: median response < 10ms', async () => {
    const times = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await request(app).get('/api/health').expect(200);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(`Health — Median: ${median.toFixed(1)}ms, P95: ${p95.toFixed(1)}ms`);
    expect(median).toBeLessThan(10);
    expect(p95).toBeLessThan(50);
  });

  test('detect-format: responds under 3s with mock AI', async () => {
    if (!fixtureBase64) return;
    const start = performance.now();
    const res = await request(app)
      .post('/api/detect-format')
      .send({ fileData: fixtureBase64, sheetIndex: 0 });
    const elapsed = performance.now() - start;
    console.log(`detect-format: ${elapsed.toFixed(0)}ms`);
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(3000);
  });

  test('normalize: 5 Format B rows under 10s with mock AI', async () => {
    const fixtureBPath = path.join(__dirname, '../fixtures/company-b-sample.xlsx');
    if (!fs.existsSync(fixtureBPath)) return;
    const b64 = fs.readFileSync(fixtureBPath).toString('base64');
    const start = performance.now();
    const res = await request(app)
      .post('/api/normalize')
      .send({ fileData: b64, sheetIndex: 0, format: 'B' });
    const elapsed = performance.now() - start;
    console.log(`normalize (5-row Format B): ${elapsed.toFixed(0)}ms`);
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(10000);
  });

  test('concurrent requests: 10 simultaneous health checks', async () => {
    const promises = Array.from({ length: 10 }, () =>
      request(app).get('/api/health')
    );
    const start = performance.now();
    const responses = await Promise.all(promises);
    const elapsed = performance.now() - start;
    const allOk = responses.every(r => r.status === 200);
    console.log(`10 concurrent health checks: ${elapsed.toFixed(0)}ms total`);
    expect(allOk).toBe(true);
    expect(elapsed).toBeLessThan(2000);
  });

  test('memory: no heap growth after 50 requests', async () => {
    const initialHeap = process.memoryUsage().heapUsed;
    for (let i = 0; i < 50; i++) {
      await request(app).get('/api/health');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    const finalHeap = process.memoryUsage().heapUsed;
    const growthMB = (finalHeap - initialHeap) / 1024 / 1024;
    console.log(`Heap growth after 50 requests: ${growthMB.toFixed(2)}MB`);
    expect(growthMB).toBeLessThan(10);
  });
});
