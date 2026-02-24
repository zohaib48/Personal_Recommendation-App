const express = require('express');
const router = express.Router();
const authenticateAdminSession = require('../middleware/adminSessionAuth');
const {
  getSettings,
  saveSettings,
  getDashboard,
} = require('../services/settingsService');

const resolveShop = (req) => {
  return (
    req.authenticatedShop ||
    req.query?.shop ||
    req.body?.shop ||
    ''
  );
};

router.use(['/api/settings', '/api/dashboard'], authenticateAdminSession);

// GET /api/settings?shop=domain
router.get('/api/settings', async (req, res) => {
  try {
    const shop = resolveShop(req);
    if (!shop) return res.status(400).json({ error: 'shop is required' });
    const settings = await getSettings(shop);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/settings
router.post('/api/settings', express.json(), async (req, res) => {
  try {
    const { mode, display, filters, weights, design } = req.body;
    const shop = resolveShop(req);
    if (!shop) return res.status(400).json({ error: 'shop is required' });
    const settings = await saveSettings(shop, { mode, display, filters, weights, design });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/dashboard
router.get('/api/dashboard', async (req, res) => {
  try {
    const shop = resolveShop(req);
    if (!shop) return res.status(400).json({ error: 'shop is required' });
    const data = await getDashboard(shop);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
