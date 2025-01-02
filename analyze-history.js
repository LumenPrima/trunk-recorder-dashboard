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

async function analyzeTimeRange(hours) {
    const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    console.log(`\nAnalyzing ${hours} hour(s) of history...`);
    
    try {
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);
        
        const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
        
        // Get total count and size
        const totalEvents = await collection.countDocuments({
            timestamp: { $gte: startTime.toISOString() }
        });

        // Sample events to calculate average size
        const sampleEvents = await collection.find({
            timestamp: { $gte: startTime.toISOString() }
        }).limit(100).toArray();

        const avgEventSize = sampleEvents.reduce((size, event) => 
            size + Buffer.byteLength(JSON.stringify(event)), 0) / sampleEvents.length;

        const totalSizeMB = (totalEvents * avgEventSize) / (1024 * 1024);

        // Analyze event distribution
        const eventTypes = {};
        const talkgroups = new Set();
        const radios = new Set();
        
        sampleEvents.forEach(event => {
            eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
            if (event.talkgroupOrSource) talkgroups.add(event.talkgroupOrSource);
            if (event.radioID) radios.add(event.radioID);
        });

        // Calculate event frequency
        const timeSpanMinutes = hours * 60;
        const eventsPerMinute = totalEvents / timeSpanMinutes;
        
        console.log(`Results for ${hours} hour(s):`);
        console.log(`Total Events: ${totalEvents.toLocaleString()}`);
        console.log(`Estimated Size: ${totalSizeMB.toFixed(2)} MB`);
        console.log(`Average Event Size: ${avgEventSize.toFixed(2)} bytes`);
        console.log(`Events per Minute: ${eventsPerMinute.toFixed(2)}`);
        console.log(`\nEvent Types Distribution (from sample):`);
        Object.entries(eventTypes).forEach(([type, count]) => {
            console.log(`  ${type}: ${count} (${((count/sampleEvents.length)*100).toFixed(1)}%)`);
        });
        console.log(`\nUnique Talkgroups in Sample: ${talkgroups.size}`);
        console.log(`Unique Radios in Sample: ${radios.size}`);
        
        // Memory impact estimation
        const estimatedMemoryMB = totalSizeMB * 2; // Rough estimate for in-memory structures
        console.log(`\nEstimated Memory Impact: ${estimatedMemoryMB.toFixed(2)} MB`);
        
        // Browser impact estimation
        const estimatedDOMNodes = totalEvents * 3; // Rough estimate for DOM nodes per event
        console.log(`Estimated DOM Nodes: ${estimatedDOMNodes.toLocaleString()}`);
        
        // Network transfer estimation
        console.log(`Estimated Network Transfer: ${totalSizeMB.toFixed(2)} MB`);
        
        // Load time estimation (assuming 1000 events/sec processing)
        const estimatedLoadSeconds = totalEvents / 1000;
        console.log(`Estimated Load Time: ${estimatedLoadSeconds.toFixed(1)} seconds`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
    }
}

// Analyze 2-hour range
analyzeTimeRange(2).catch(console.error);
