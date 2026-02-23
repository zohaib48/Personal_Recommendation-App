require('dotenv').config();
const mongoose = require('mongoose');
const Merchant = require('../server/models/Merchant');

async function checkAuth() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is required in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');

    const merchants = await Merchant.find({});
    console.log(`Found ${merchants.length} merchants:`);

    merchants.forEach(m => {
        console.log(`- Shop: ${m.shop}`);
        console.log(`  Active: ${m.isActive}`);
        console.log(`  Updated: ${m.updatedAt}`);
        console.log(`  Token: ${m.accessToken.substring(0, 10)}...`);
        console.log('---');
    });

    process.exit(0);
}

checkAuth().catch(console.error);
