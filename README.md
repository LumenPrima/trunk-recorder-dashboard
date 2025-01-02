# Trunk Recorder Dashboard

> **⚠️ Disclaimer**: This is a proof of concept project and is not intended for production use. The current implementation may have limitations in scalability, reliability, and usability. Use at your own risk and expect potential issues with performance, error handling, and data consistency.

## Overview
A real-time radio monitoring dashboard that visualizes radio activity across different talkgroups. The application connects to a trunk_recorder MongoDB database to track radio events and displays them with contextual information from a RadioReference.com talkgroup metadata file. Features color-coded event tracking, activity statistics, visual feedback for recent events, filtering capabilities, and multiple sorting options.

## Screenshots

### Initial Dashboard
![Initial Dashboard State](docs/images/DataonStartup.png)

The dashboard starts with a clean slate and then populates seen talkgroups with metadata from an available radioreference.com csv file, organized with:
- Category and operational badges
- Talkgroup descriptions and metadata
- Ready to track radio activity

### Active Dashboard
![Active Dashboard State](docs/images/DataPopulated.png)

As radio activity occurs, the dashboard updates in real-time showing:
- Color-coded event types for different activities
- Active radio indicators with timing information
- Call frequency statistics and event counts
- Visual feedback for recent events

The dashboard maintains a history of recent events, showing:
- Call frequency statistics
- Total event counts
- Last activity timestamps
- Active radio tracking

## Prerequisites

### Required Software
- [trunk-recorder](https://github.com/robotastic/trunk-recorder) - For capturing radio system data
- `jq` - For JSON processing in scripts
- `mongosh` - MongoDB Shell for database operations
- A valid [RadioReference.com](https://www.radioreference.com) account to download system talkgroup data

### MongoDB Setup
1. Install MongoDB Community Edition:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install mongodb-org

   # macOS with Homebrew
   brew tap mongodb/brew
   brew install mongodb-community
   ```

2. Start MongoDB service:
   ```bash
   # Ubuntu/Debian
   sudo systemctl start mongod

   # macOS
   brew services start mongodb-community
   ```

3. Create database and user:
   ```bash
   # Connect to MongoDB shell
   mongosh

   # Create database and switch to it
   use trunk_recorder

   # Create user for application
   db.createUser({
     user: "trunkrecorder",
     pwd: "your_secure_password",
     roles: [
       { role: "readWrite", db: "trunk_recorder" }
     ]
   })

   # Create user for logging script
   db.createUser({
     user: "eventlogger",
     pwd: "another_secure_password",
     roles: [
       { role: "readWrite", db: "trunk_recorder" }
     ]
   })
   ```

4. Configure connection strings:
   - For the application (.env file):
     ```
     MONGODB_URI=mongodb://trunkrecorder:your_secure_password@localhost:27017/trunk_recorder
     ```
   - For the logging script (.env file):
     ```
     MONGODB_URI=mongodb://eventlogger:another_secure_password@localhost:27017/trunk_recorder
     ```

5. Enable authentication:
   ```bash
   # Edit MongoDB configuration
   sudo nano /etc/mongod.conf

   # Add/modify security section
   security:
     authorization: enabled
   ```

6. Restart MongoDB service:
   ```bash
   # Ubuntu/Debian
   sudo systemctl restart mongod

   # macOS
   brew services restart mongodb-community
   ```

### Talkgroup Data
The application requires a CSV file containing talkgroup metadata for your radio system. This file can be downloaded from RadioReference.com for your specific area's radio system. The downloaded file should be named according to your trunk-recorder configuration (default: `trs_tg_6643.csv`).

### Trunk Recorder Configuration
The included `config.json` configures trunk-recorder to monitor multiple P25 radio systems. Key configuration includes:

- SDR device settings (frequency, gain settings)
- System definitions for each radio system:
  - Control channel frequencies
  - Talkgroup metadata file
  - Logging configuration
  - Audio recording settings

Example system configuration:
```json
{
    "shortName": "butco",
    "control_channels": [853062500,853037500,853287500,853537500],
    "type": "p25",
    "modulation": "qpsk",
    "talkgroupsFile": "trs_tg_6643.csv",
    "transmissionArchive": true,
    "compressWav": false,
    "digitalLevels": 3,
    "minDuration": 0.3,
    "unitScript": "./log_mongo.sh"
}
```

### Event Logging
The `log_mongo.sh` script handles logging radio events to MongoDB. It's called by trunk-recorder for each radio event and includes:

- Event deduplication within a 5-second window
- Timestamp recording
- System identification
- Radio and talkgroup tracking
- Debug logging capabilities

To enable debug logging:
```bash
chmod +x log_mongo.sh
./log_mongo.sh --debug <shortName> <radioID> <eventType> [talkgroup|source]
```

## Utility Scripts

### analyze-history.js
A utility script that analyzes historical radio events to provide insights about:
- Event volume and frequency
- Data size and memory impact
- Event type distribution
- Active talkgroups and radios
- Performance metrics

Usage:
```bash
node analyze-history.js
```

### capture.js
A debugging utility that captures live radio events for a specified duration. Useful for:
- Verifying event format and content
- Debugging event processing
- Testing MongoDB connectivity
- Monitoring real-time activity

Usage:
```bash
node capture.js
```

## Features

### Real-time Event Monitoring
- Live updates of radio activities across talkgroups
- Color-coded event types:
  - Call (Blue with glow)
  - Join (Green)
  - Location (Cyan)
  - Data (Purple)
  - Answer Request (Orange)
  - Acknowledgment Response (Teal)
  - On (Yellow)
  - Default (Gray)

### Visual Feedback
- Activity glow effects on talkgroup cards (30-second fade)
- Color-matched glow based on event type
- Hover tooltips showing radio details
- Timestamp display for latest activity

### Statistics & Metrics
- Total call count per talkgroup
- Call frequency calculation (calls per minute)
- 5-minute rolling window for frequency calculation
- Last activity timestamp

### Filtering, Sorting & Organization
- County-based filtering with quick selection buttons:
  - All (shows all counties)
  - Hamilton County (hamco)
  - Warren County (warco)
  - Butler County (butco)
  - Montgomery County (monco)
- Toggle between all talkgroups and active-only view
- Active filter shows only talkgroups with call history
- Multiple sorting options:
  - ID (default): Sort by talkgroup number
  - Calls: Sort by total number of calls
  - Frequency: Sort by calls per minute
  - Recent: Sort by most recent activity
- Compact, information-dense card layout
- Grouped radio indicators per talkgroup

### Historical Data Loading
- Multiple time range options:
  - Last 30 minutes
  - Last 2 hours
  - Last 6 hours
  - Last 12 hours
- Progress indicator with event count
- Automatic data processing in chunks
- Real-time loading feedback

### Metadata Integration
- Talkgroup names and descriptions
- Category and tag information
- County/department identification

## Architecture

### Backend (server.js)
- **Framework**: Express.js
- **Real-time Communication**: Socket.IO
- **Database**: MongoDB
- **Connection**: Configured via environment variables

#### MongoDB Structure
- **Database**: trunk_recorder
- **Collection**: radio_events
- **Event Types**: 
  - `on`: Radio activation
  - `join`: Radio joining talkgroup
  - `off`: Radio deactivation
  - `call`: Radio initiating call

### Frontend
#### Structure
- `public/index.html`: Main HTML structure
- `public/styles/main.css`: All application styles
- `public/js/`: JavaScript modules
  - `app.js`: Main application initialization
  - `talkgroup-manager.js`: Data and state management
  - `ui-manager.js`: UI rendering and updates

#### Features
- Modular JavaScript architecture
- Real-time updates via WebSocket
- Responsive card-based UI design
- Interactive tooltips for radio information
- Historical data loading with multiple time ranges
- Active talkgroup filtering
- Multiple sorting options for talkgroups

## Data Formats

### Talkgroup Metadata Format
The RadioReference.com CSV export should contain the following columns:
```
Decimal,Hex,Alpha Tag,Mode,Description,Tag,Category
```

Example entry:
```
9000,2328,"09 HELP","D","Emergency Calling to COM PSAPs","Emergency Ops","Butler County (09) Common"
```

#### Fields:
- **Decimal**: Numeric talkgroup ID
- **Hex**: Hexadecimal representation
- **Alpha Tag**: Human-readable talkgroup name
- **Mode**: Operating mode (e.g., "D" for digital)
- **Description**: Detailed talkgroup purpose
- **Tag**: Operational classification
- **Category**: Organizational grouping

### Radio Events
Events received from MongoDB change stream:
```javascript
{
  eventType: string,        // 'on', 'join', 'off', 'call'
  radioID: string,         // Unique radio identifier
  talkgroupOrSource: string // Talkgroup ID
}
```

## API Endpoints

### GET /api/talkgroups
Returns JSON object mapping talkgroup IDs to their metadata:
```javascript
{
  "9000": {
    "hex": "2328",
    "alphaTag": "09 HELP",
    "mode": "D",
    "description": "Emergency Calling to COM PSAPs",
    "tag": "Emergency Ops",
    "category": "Butler County (09) Common"
  },
  // ... additional talkgroups
}
```

## WebSocket Events

### radioEvent
Emitted when radio activity is detected:
```javascript
{
  eventType: string,
  radioID: string,
  talkgroupOrSource: string,
  talkgroupInfo: {
    hex: string,
    alphaTag: string,
    mode: string,
    description: string,
    tag: string,
    category: string
  }
}
```

## UI Components

### Talkgroup Cards
Each talkgroup is displayed as a card containing:
- Alpha Tag as title
- Description
- Category badge
- Operational tag badge
- Active radio indicators
- Tooltips showing radio IDs

### Styling
- Light background (#f5f5f5)
- Card-based layout with shadows
- Color-coded badges for categories and tags
- Interactive hover effects for radio indicators
- Responsive design for various screen sizes

## Installation & Setup

1. Clone the repository:
```bash
git clone https://github.com/LumenPrima/trunk-recorder-dashboard.git
cd trunk-recorder-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the `.env` file with your MongoDB connection details and desired port

4. Start the server:
```bash
npm start
```

5. Access the application at http://localhost:3000 (or your configured port)

## Development

To run the server in development mode:
```bash
npm run dev
```

## Project Structure

```
trunk-recorder-dashboard/
├── docs/
│   └── images/          # Screenshots and images
├── public/
│   ├── index.html      # Main HTML file
│   ├── js/            # Frontend JavaScript modules
│   │   ├── app.js
│   │   ├── talkgroup-manager.js
│   │   └── ui-manager.js
│   └── styles/        # CSS styles
│       └── main.css
├── .env.example       # Environment variables template
├── .gitignore        # Git ignore rules
├── README.md         # Project documentation
├── analyze-history.js # Event analysis utility
├── capture.js        # Event capture utility
├── config.json       # Trunk-recorder configuration
├── log_mongo.sh      # Event logging script
├── package.json      # Project metadata and dependencies
├── server.js         # Express server implementation
└── trs_tg_6643.csv   # RadioReference talkgroup data
```

## Dependencies

```json
{
  "chalk": "^5.4.1",
  "dotenv": "^16.3.1",
  "express": "^4.21.2",
  "mongodb": "^6.12.0",
  "socket.io": "^4.8.1",
  "socket.io-client": "^4.8.1"
}
```

## Future Enhancement Areas

1. Data Persistence & History
- Event logging
- Timeline view
- Historical replay
- Usage pattern analytics

2. UI/UX Improvements
- Dark mode theme
- Mobile responsiveness
- Advanced sorting/filtering
- Search functionality

3. Monitoring & Analytics
- Activity metrics dashboard
- Call duration statistics
- Usage reports
- Heat maps

4. Additional Features
- User authentication
- Custom talkgroup labels
- Favorites system
- Export functionality
- Geolocation tracking

5. Performance & Security
- Rate limiting
- Connection pooling
- Error handling
- Data validation
- SSL/TLS encryption
- Request logging
