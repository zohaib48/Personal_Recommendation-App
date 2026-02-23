/**
 * Main Server File - Express Application
 * 
 * Orchestrates:
 * - Database connection
 * - Route registration
 * - Cron jobs
 * - Server startup
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { createProxyMiddleware } = require('http-proxy-middleware');
const connectDB = require('./config/database');
const SyncService = require('./services/syncService');
const flaskService = require('./services/flaskService');
const WebhookService = require('./services/webhookService');
const Merchant = require('./models/Merchant');

// Import routes
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');
const recommendationRoutes = require('./routes/recommendations');
const settingsRoutes = require('./routes/settings');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PORT = process.env.ADMIN_PORT || 3001;

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(cors({
    origin: true,                // reflect request origin (allow any)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,               // cache preflight for 24h
}));
app.options('*', cors());       // handle all OPTIONS preflight requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// lightweight handlers to avoid noisy 404s (must come before proxy)
app.get('/app/logo.png', (req, res) => res.sendStatus(204));
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

// Proxy Remix admin UI through the app server so Shopify can reach it via tunnel.
// We use a manual filter to avoid Express trimming the mount path.
const adminPaths = [
    '/app',
    '/build',
    '/assets',
    '/@vite',
    '/@react-refresh',
    '/@remix',
    '/__remix',
    '/favicon.ico',
];

const adminProxy = createProxyMiddleware({
    target: `http://localhost:${ADMIN_PORT}`,
    changeOrigin: false,
    ws: true,
    logLevel: 'warn',
    proxyTimeout: 15000,
    timeout: 15000,
    pathRewrite: (path) => path, // no rewrite
    on: {
        error: (err, req, res) => {
            console.error(`❌ Admin proxy error for ${req.method} ${req.url}:`, err.message);
            if (!res.headersSent) {
                res.status(502).json({
                    error: 'Admin UI proxy error',
                    message: err.message,
                });
            }
        },
    },
});

app.use((req, res, next) => {
    // do not proxy the static ping routes we already handled
    if (req.path === '/app/logo.png' || req.path === '/favicon.ico') {
        return next();
    }
    if (adminPaths.some((p) => req.path.startsWith(p))) {
        return adminProxy(req, res, next);
    }
    return next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Root route - handle Shopify install redirect
app.get('/', async (req, res) => {
    console.log('========== ROOT REQUEST RECEIVED ==========');
    console.log('Query params:', req.query);
    console.log('Full URL:', req.originalUrl);
    console.log('============================================');

    const { shop } = req.query;
    const queryString = new URLSearchParams(req.query).toString();

    // If shop parameter is present, redirect to auth flow
    if (shop) {
        const merchant = await Merchant.findOne({ shop, isActive: true });
        if (merchant) {
            return res.redirect(`/app${queryString ? `?${queryString}` : ''}`);
        }
        console.log(`Redirecting to /auth with qs: ${queryString}`);
        return res.redirect(`/auth${queryString ? `?${queryString}` : ''}`);
    }

    // Otherwise show a simple landing page
    return res.redirect('/app');
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'shopify-recommendation-orchestrator',
        timestamp: new Date().toISOString(),
    });
});

// Auth routes
app.use('/', authRoutes);

// Webhook routes
app.use('/', webhookRoutes);

// Recommendation API routes
app.use('/', recommendationRoutes);
// Settings & analytics
app.use('/', settingsRoutes);

// Manual sync trigger (registers MongoDB products with Flask, bypasses Shopify API)
app.post('/api/sync', express.json(), async (req, res) => {
    const Product = require('./models/Product');
    try {
        const shop = req.body.shop || req.query.shop;
        if (!shop) return res.status(400).json({ error: 'shop is required' });

        const merchant = await Merchant.findOne({ shop, isActive: true });
        if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

        if (req.body.force) {
            console.log(`🔄 Force syncing from Shopify for ${shop}...`);
            const result = await SyncService.fullSync(shop, merchant.accessToken);
            return res.json(result);
        }

        // Pull products already in MongoDB (no Shopify API call needed)
        const products = await Product.find({ merchantId: merchant._id });
        if (!products.length) {
            return res.json({ success: false, error: 'No products in MongoDB. Run OAuth install first.' });
        }

        const flaskProducts = products.map(p => ({
            id: p.shopifyProductId,
            title: p.title,
            product_type: p.productType,
            tags: p.tags,
            price: p.price,
            image: p.image,
        }));

        console.log(`🔄 Registering ${flaskProducts.length} products from MongoDB for ${shop}`);
        await flaskService.registerMerchantProducts(shop, flaskProducts);

        res.json({ success: true, productsCount: flaskProducts.length });
    } catch (error) {
        console.error('❌ Manual sync failed:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// =============================================================================
// CRON JOBS
// =============================================================================

// Daily full sync at 2 AM
cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running daily product sync...');
    try {
        await SyncService.syncAllMerchants();
        console.log('✅ Daily sync completed');
    } catch (error) {
        console.error('❌ Daily sync failed:', error);
    }
});

// =============================================================================
// AUTO-SYNC: Push MongoDB products to Flask on startup
// =============================================================================

async function autoSyncProducts() {
    const Product = require('./models/Product');
    try {
        const merchants = await Merchant.find({ isActive: true });
        if (!merchants.length) {
            console.log('ℹ️  No active merchants found — skipping auto-sync');
            return;
        }

        console.log(`🔄 Auto-syncing products for ${merchants.length} merchant(s)...`);

        for (const merchant of merchants) {
            try {
                try {
                    await WebhookService.registerWebhooks(merchant.shop, merchant.accessToken);
                } catch (err) {
                    console.warn(`   ⚠️  ${merchant.shop}: webhook refresh failed — ${err.message}`);
                }

                const products = await Product.find({ merchantId: merchant._id });
                if (!products.length) {
                    console.log(`   ⏭️  ${merchant.shop}: no products in MongoDB, skipping`);
                    continue;
                }

                const flaskProducts = products.map(p => ({
                    id: p.shopifyProductId,
                    title: p.title,
                    product_type: p.productType,
                    tags: p.tags,
                    price: p.price,
                    image: p.image,
                }));

                await flaskService.registerMerchantProducts(merchant.shop, flaskProducts);
                console.log(`   ✅ ${merchant.shop}: synced ${flaskProducts.length} products`);
            } catch (err) {
                console.error(`   ❌ ${merchant.shop}: sync failed — ${err.message}`);
            }
        }

        console.log('🔄 Auto-sync complete!');
    } catch (error) {
        console.error('❌ Auto-sync failed:', error.message);
    }
}

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer() {
    try {
        // 1. Connect to MongoDB
        await connectDB();

        // 2. Check Flask API health & auto-sync products
        try {
            const flaskHealth = await flaskService.healthCheck();
            console.log('✅ Flask API is healthy:', flaskHealth);

            // Auto-sync all merchants' products to Flask
            await autoSyncProducts();
        } catch (error) {
            console.warn('⚠️  Flask API not available:', error.message);
            console.warn('   App will start, but recommendations won\'t work until Flask is running');
        }

        // 3. Start Express server
        app.listen(PORT, () => {
            console.log('');
            console.log('🚀 ================================================');
            console.log('🚀  Shopify AI Recommendation System Started');
            console.log('🚀 ================================================');
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 http://localhost:${PORT}`);
            console.log(`📊 MongoDB: ${process.env.MONGODB_URI}`);
            console.log(`🧠 Flask API: ${process.env.FLASK_API_URL}`);
            console.log('🚀 ================================================');
            console.log('');
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer();


