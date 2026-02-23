/**
 * Database Configuration - MongoDB Connection
 * 
 * Establishes and maintains connection to MongoDB database.
 * Handles connection errors and provides connection status.
 */

const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shopify-recommendations';

        await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 30000, // Increase timeout to 30s
            socketTimeoutMS: 45000,
            // useNewUrlParser and useUnifiedTopology are deprecated in Mongoose 6+ and are no longer needed.
        });

        console.log('✅ MongoDB Connected Successfully');
        console.log(`📊 Database: ${mongoose.connection.name}`);

    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error.message);
        process.exit(1);
    }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB Disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB Error:', err);
});

module.exports = connectDB;
