require('dotenv').config();
const express = require('express');
const http = require('http');
const { MongoClient } = require('mongodb');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

// Validate required environment variables
if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI environment variable is required');
    process.exit(1);
}

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve socket.io client
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.js'));
});

const MONGO_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'trunk_recorder';
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'radio_events';

// Read and parse the talkgroup CSV file
const talkgroupsMap = new Map();
const csvContent = fs.readFileSync(path.join(__dirname, 'trs_tg_6643.csv'), 'utf-8');
const csvLines = csvContent.split('\n').slice(1); // Skip header

csvLines.forEach(line => {
    if (line.trim()) {
        const [decimal, hex, alphaTag, mode, description, tag, category] = line.split(',').map(field => field.replace(/"/g, ''));
        talkgroupsMap.set(decimal, {
            hex,
            alphaTag: alphaTag.trim(),
            mode,
            description: description.trim(),
            tag: tag.trim(),
            category: category.trim()
        });
    }
});

// Endpoint to get talkgroup metadata
app.get('/api/talkgroups', (req, res) => {
    const talkgroupsObject = Object.fromEntries(talkgroupsMap);
    res.json(talkgroupsObject);
});

// Endpoint to get talkgroup-specific history
app.get('/api/talkgroup/:id/history', async (req, res) => {
    try {
        const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        const talkgroupId = req.params.id;
        // Get last 24 hours of events for this talkgroup
        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000)
            .toISOString()
            .replace(/\.\d{3}Z$/, 'Z');

        // First get the most recent 200 records
        const recentEvents = await collection
            .find({
                talkgroupOrSource: talkgroupId
            })
            .sort({ timestamp: -1 })
            .limit(200)
            .toArray();

        // Then get events from last 24 hours
        const dayEvents = await collection
            .find({
                talkgroupOrSource: talkgroupId,
                timestamp: { $gte: startTime }
            })
            .sort({ timestamp: -1 })
            .toArray();

        // Use whichever result set is smaller
        const events = recentEvents.length <= dayEvents.length ? recentEvents : dayEvents;

        // Add metadata to events
        events.forEach(event => {
            const talkgroupInfo = talkgroupsMap.get(event.talkgroupOrSource?.toString());
            if (talkgroupInfo) {
                event.talkgroupInfo = talkgroupInfo;
            }
        });

        // Get unique radios that have been affiliated
        const uniqueRadios = [...new Set(events.map(event => event.radioID))];

        res.json({
            talkgroupId,
            totalEvents: events.length,
            uniqueRadios,
            events: events
        });
        await client.close();
    } catch (error) {
        console.error('Error fetching talkgroup history:', error);
        res.status(500).json({ error: 'Failed to fetch talkgroup history' });
    }
});

// Endpoint to get historical events
app.get('/api/history/:duration', async (req, res) => {
    try {
        const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        let minutes;
        const duration = req.params.duration;
        if (duration === '30m') {
            minutes = 30;
        } else if (duration === '2h') {
            minutes = 120;
        } else if (duration === '6h') {
            minutes = 360;
        } else if (duration === '12h') {
            minutes = 720;
        } else {
            throw new Error(`Invalid duration parameter: ${duration}`);
        }

        const startTime = new Date(Date.now() - minutes * 60 * 1000)
            .toISOString()
            .replace(/\.\d{3}Z$/, 'Z'); // Remove milliseconds to match log_mongo.sh format
        
        const events = await collection
            .find({
                timestamp: { $gte: startTime },
                eventType: { $nin: ['location'] }
            })
            .sort({ timestamp: 1 })
            .toArray();

        // Add metadata to events
        events.forEach(event => {
            const talkgroupInfo = talkgroupsMap.get(event.talkgroupOrSource?.toString());
            if (talkgroupInfo) {
                event.talkgroupInfo = talkgroupInfo;
            }
        });

        res.json({
            duration: minutes,
            totalEvents: events.length,
            events: events
        });
        await client.close();
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Serve static files
app.use(express.static('public'));

// Connect to MongoDB and set up change stream
async function connectToMongo() {
    const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    let messageCount = 0;
    
    // Setup periodic status reporting
    setInterval(() => {
        console.log(`[Status] Processed ${messageCount} messages in the last 30 seconds`);
        messageCount = 0; // Reset counter
    }, 30000);

    const changeStream = collection.watch();
    
    changeStream.on('change', (change) => {
        if (change.operationType === 'insert') {
            const event = change.fullDocument;
            messageCount++;
            // Add talkgroup metadata to the event
            const talkgroupInfo = talkgroupsMap.get(event.talkgroupOrSource?.toString());
            if (talkgroupInfo) {
                event.talkgroupInfo = talkgroupInfo;
            }
            io.emit('radioEvent', event);
        }
    });

    changeStream.on('error', (error) => {
        console.error('Change stream error:', error);
    });

    changeStream.on('close', () => {
        console.log('Change stream closed');
    });
}

connectToMongo().catch(console.error);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
