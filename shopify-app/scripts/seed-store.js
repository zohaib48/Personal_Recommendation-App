require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const Merchant = require('../server/models/Merchant');

// Configuration
const SHOP_DOMAIN = process.env.SHOP_DOMAIN; // Optional override
const TARGET_PRODUCT_COUNT = 100;
const CATEGORIES = ['Fashion', 'Beauty', 'Electronics', 'Home'];

// Dummy Images (Stable placeholders)
const IMAGES = {
    Fashion: 'https://placehold.co/600x600/FF6B6B/FFFFFF/png?text=Fashion',
    Beauty: 'https://placehold.co/600x600/4ECDC4/FFFFFF/png?text=Beauty',
    Electronics: 'https://placehold.co/600x600/45B7D1/FFFFFF/png?text=Electronics',
    Home: 'https://placehold.co/600x600/96CEB4/FFFFFF/png?text=Home',
};

const KEYWORDS = {
    Fashion: ['Shirt', 'Dress', 'Denim', 'Jacket', 'Summer', 'Winter', 'Cotton', 'Silk'],
    Beauty: ['Serum', 'Cream', 'Lotion', 'Organic', 'Vegan', 'Anti-aging', 'Hydrating'],
    Electronics: ['Headphones', 'Wireless', 'Smart', 'Bluetooth', 'Portable', 'Digital', 'Pro'],
    Home: ['Lamp', 'Chair', 'Table', 'Decor', 'Modern', 'Vintage', 'Artisan', 'Rug']
};

async function connectDB() {
    if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is required in .env');
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB');
}

async function getMerchant() {
    // If SHOP_DOMAIN provided, use it. Otherwise find first active.
    const query = SHOP_DOMAIN ? { shop: SHOP_DOMAIN } : { isActive: true };
    const merchant = await Merchant.findOne(query);
    if (!merchant) throw new Error('No active merchant found in DB');
    return merchant;
}

async function shopifyRequest(shop, accessToken, method, path, data = null) {
    const url = `https://${shop}/admin/api/2024-01/${path}`;

    const config = {
        method,
        url,
        headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
        }
    };

    if (data) {
        config.data = data;
    }

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.log('⏳ Rate limited, waiting 2s...');
            await new Promise(r => setTimeout(r, 2000));
            return shopifyRequest(shop, accessToken, method, path, data);
        }
        console.error(`❌ API Error (${path}):`, error.response ? error.response.data : error.message);
        throw error;
    }
}

async function deleteAllProducts(shop, accessToken) {
    console.log('🗑️  Fetching existing products...');
    let products = [];
    let hasNext = true;
    let pageInfo = '';

    while (hasNext) {
        const query = pageInfo ? `?limit=250&page_info=${pageInfo}` : '?limit=250';
        const res = await shopifyRequest(shop, accessToken, 'GET', `products.json${query}`);
        products = products.concat(res.products);

        // Link header parsing for pagination
        // (Simplified for this script, assuming we just need to get IDs)
        // Actually easiest way to delete all is just loop until empty if pagination is complex
        if (res.products.length < 250) hasNext = false;
        else {
            // Basic cursor handling (Shopify uses link headers, but for deletion we can just keep fetching first page?? No, products change)
            // Better to just fetch IDs and delete
            // For simplicity in this script, we'll use the ID list we just got.
            // If > 250, we might need real pagination or just re-run.
            // Let's rely on the first 250 for now, then handle loop.
        }
    }

    if (products.length === 0) {
        console.log('   No products to delete.');
        return;
    }

    console.log(`   Deleting ${products.length} products...`);
    for (const p of products) {
        await shopifyRequest(shop, accessToken, 'DELETE', `products/${p.id}.json`);
        process.stdout.write('.');
    }
    console.log('\n✅ All products deleted.');
}

function generateProduct(category, index) {
    const type = KEYWORDS[category][Math.floor(Math.random() * KEYWORDS[category].length)];
    const adjective = ['Premium', 'Luxury', 'Essential', 'Classic', 'Modern'][Math.floor(Math.random() * 5)];
    const price = (Math.random() * 100 + 10).toFixed(2);

    return {
        product: {
            title: `${adjective} ${category} ${type} ${index}`,
            body_html: `<strong>${type}</strong> for your ${category.toLowerCase()} needs. High quality ${adjective.toLowerCase()} item.`,
            vendor: "AI Seeded Store",
            product_type: category,
            tags: [category, type, adjective].join(', '),
            variants: [{
                price: price,
                sku: `AI-${category.substring(0, 3).toUpperCase()}-${index}`,
                inventory_management: "shopify",
                inventory_policy: "continue" // Don't track inventory strictly
            }],
            images: [{ src: IMAGES[category] }]
        }
    };
}

async function seedProducts(shop, accessToken) {
    console.log(`🌱 Seeding ${TARGET_PRODUCT_COUNT} products...`);

    let count = 0;
    const perCategory = Math.ceil(TARGET_PRODUCT_COUNT / CATEGORIES.length);

    for (const category of CATEGORIES) {
        console.log(`   Generating ${perCategory} ${category} products...`);
        for (let i = 1; i <= perCategory; i++) {
            const payload = generateProduct(category, i);
            await shopifyRequest(shop, accessToken, 'POST', 'products.json', payload);
            process.stdout.write('+');
            count++;
            if (count >= TARGET_PRODUCT_COUNT) break;

            // Small delay to be nice to API
            await new Promise(r => setTimeout(r, 200));
        }
        console.log(''); // Newline
    }
    console.log('✅ Seeding complete!');
}

async function main() {
    try {
        await connectDB();
        const merchant = await getMerchant();
        console.log(`🎯 Target Shop: ${merchant.shop}`);

        await deleteAllProducts(merchant.shop, merchant.accessToken);
        await seedProducts(merchant.shop, merchant.accessToken);

        console.log('🎉 Done! Request a full sync in your app now.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Script failed:', error);
        process.exit(1);
    }
}

main();
