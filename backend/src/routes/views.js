const { Router } = require('express');
const router = Router();

router.get('/', (req, res) => {
  res.render('index', { title: 'Spare Parts Web Verifier' });
});

router.get('/docs', (req, res) => {
  res.render('docs', { title: 'Documentation — Spare Parts Web Verifier' });
});

module.exports = router;
