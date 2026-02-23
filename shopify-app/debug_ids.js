
const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./server/models/Product');
const Merchant = require('./server/models/Merchant');
const UserInteraction = require('./server/models/UserInteraction');

async function debugIds() {
    console.log('🚀 Starting debug script...');
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const merchants = await Merchant.find({});
        console.log('Merchants in DB:', merchants.map(m => ({ shop: m.shop, isActive: m.isActive })));

        const ids = ['8143048441945', '8143048376409'];
        const gids = ids.map(id => `gid://shopify/Product/${id}`);

        console.log('🔍 Searching for GIDs:', gids);

        const products = await Product.find({
            shopifyProductId: { $in: gids }
        });

        const homeProductsCount = await Product.countDocuments({
            merchantId: merchants[0]._id,
            productType: 'Home'
        });
        console.log(`\nTotal 'Home' products for this merchant: ${homeProductsCount}`);

        console.log(`\nFound ${products.length} products:`);
        products.forEach(p => {
            console.log(`\n--- ${p.title} ---`);
            console.log(`ID: ${p.shopifyProductId}`);
            console.log(`Type: ${p.productType}`);
            console.log(`Tags: ${p.tags.join(', ')}`);
            console.log(`Price: ${p.price}`);
        });

        const customerId = 'guest_qdy2gdrz4lkmlhu7mzx';
        console.log(`\n🔍 Checking interactions for: ${customerId}`);
        const interaction = await UserInteraction.findOne({ customerId });

        if (interaction) {
            console.log('Interaction Data Found:');
            console.log(`- Viewed: ${interaction.viewed.map(v => v.productId).join(', ')}`);
            console.log(`- Added to Cart: ${interaction.addedToCart.map(c => c.productId).join(', ')}`);
            console.log(`- Purchased: ${interaction.purchased.map(p => p.productId).join(', ')}`);
        } else {
            console.log('No interaction data found for this customer.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugIds();
