require('dotenv').config();
const { MongoClient } = require('mongodb');

// Validate required environment variables
if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI environment variable is required');
    process.exit(1);
}

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'trunk_recorder';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'radio_events';
const CAPTURE_DURATION = process.env.CAPTURE_DURATION || 15000; // 15 seconds

async function captureEvents() {
    const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    console.log('Connecting to MongoDB...');
    
    try {
        await client.connect();
        console.log('Connected successfully');
        
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);
        const events = [];
        
        console.log(`\nCapturing events for ${CAPTURE_DURATION/1000} seconds...`);
        
        // Set up change stream
        const changeStream = collection.watch();
        
        // Capture events for specified duration
        const capturePromise = new Promise((resolve) => {
            changeStream.on('change', (change) => {
                if (change.operationType === 'insert') {
                    events.push(change.fullDocument);
                }
            });
            
            setTimeout(() => {
                changeStream.close();
                resolve();
            }, CAPTURE_DURATION);
        });
        
        await capturePromise;
        
        // Output captured events
        console.log('\nCaptured Events:');
        console.log(JSON.stringify(events, null, 2));
        console.log(`\nTotal events captured: ${events.length}`);
        
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
        console.log('\nConnection closed');
    }
}

captureEvents().catch(console.error);
