const mongoose = require('mongoose');
require('dotenv').config();

console.log('🔍 Testing MongoDB Connection...\n');
console.log('Connection String:', process.env.MONGODB_URI.replace(/:[^:@]+@/, ':****@'));

mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
})
    .then(() => {
        console.log('\n✅ SUCCESS! MongoDB connected');
        console.log('Database:', mongoose.connection.db.databaseName);
        process.exit(0);
    })
    .catch((err) => {
        console.error('\n❌ FAILED! Error:', err.message);
        console.error('\nTroubleshooting:');
        console.error('1. Change DNS to 8.8.8.8 (Google DNS)');
        console.error('2. Check Network Access in MongoDB Atlas');
        console.error('3. Try mobile hotspot or VPN');
        console.error('4. Verify credentials are correct');
        process.exit(1);
    });

setTimeout(() => {
    console.log('\n⏱️  Connection timeout - check your network');
    process.exit(1);
}, 15000);