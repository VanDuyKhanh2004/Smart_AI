const express = require('express');
const router = express.Router();
const { live, health, ready } = require('../controllers/healthController');

router.get('/', health);
router.get('/live', live);
router.get('/ready', ready);

module.exports = router;
