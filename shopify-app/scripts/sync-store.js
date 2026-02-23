require('dotenv').config();
const mongoose = require('mongoose');
const Merchant = require('../server/models/Merchant');
const SyncService = require('../server/services/syncService');

async function runSync() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is required in .env');
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('📦 Connected to MongoDB');

        // Find active merchant
        const merchant = await Merchant.findOne({ isActive: true }).sort({ updatedAt: -1 });
        if (!merchant) throw new Error('No active merchant found');

        console.log(`🔄 Starting full sync for ${merchant.shop}...`);

        const result = await SyncService.fullSync(merchant.shop, merchant.accessToken);

        console.log('✅ Sync executed successfully!', result);
        process.exit(0);
    } catch (error) {
        console.error('❌ Sync failed:', error);
        process.exit(1);
    }
}

runSync();
