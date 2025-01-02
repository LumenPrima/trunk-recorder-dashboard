#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '#' | sed 's/\r$//' | awk '/=/ {print $1}')
fi

# Validate required environment variables
if [ -z "$MONGODB_URI" ]; then
  echo "Error: MONGODB_URI environment variable is required"
  exit 1
fi

# MongoDB connection details
DATABASE="${DB_NAME:-trunk_recorder}"
COLLECTION="${COLLECTION_NAME:-radio_events}"

# Time window for deduplication (in seconds)
TIME_WINDOW=5

# Debugging flag (default: false)
DEBUG=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --debug)
      DEBUG=true
      shift
      ;;
    *)
      break
      ;;
  esac
done

# Debugging: Log arguments received
if [ "$DEBUG" = true ]; then
  echo "Arguments received: $@" >> ./script_debug.log
fi

# Validate input arguments
if [ $# -lt 3 ]; then
  echo "Usage: $0 [--debug] <shortName> <radioID> <eventType> [talkgroup|source] [patchedTalkgroups]"
  exit 1
fi

# Assign arguments to variables
SHORT_NAME="$1"
RADIO_ID="$2"
EVENT_TYPE="$3"
TALKGROUP_OR_SOURCE="$4"
PATCHED_TALKGROUPS="$5"

# Debugging: Log parsed arguments
if [ "$DEBUG" = true ]; then
  echo "Short Name: $SHORT_NAME, Radio ID: $RADIO_ID, Event Type: $EVENT_TYPE, Talkgroup/Source: $TALKGROUP_OR_SOURCE, Patched Talkgroups: $PATCHED_TALKGROUPS" >> ./script_debug.log
fi

# Create JSON document for MongoDB
JSON_DOC=$(jq -n \
  --arg shortName "$SHORT_NAME" \
  --arg radioID "$RADIO_ID" \
  --arg eventType "$EVENT_TYPE" \
  --arg talkgroupOrSource "$TALKGROUP_OR_SOURCE" \
  --arg patchedTalkgroups "$PATCHED_TALKGROUPS" \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    shortName: $shortName,
    radioID: $radioID,
    eventType: $eventType,
    talkgroupOrSource: $talkgroupOrSource,
    patchedTalkgroups: $patchedTalkgroups,
    timestamp: $timestamp
  }')

# Debugging: Log JSON document
if [ "$DEBUG" = true ]; then
  echo "JSON Document: $JSON_DOC" >> ./script_debug.log
fi

# Calculate the timestamp for the time window
TIME_WINDOW_START=$(date -u -d "5 seconds ago" +"%Y-%m-%dT%H:%M:%SZ")
if [ "$DEBUG" = true ]; then
  echo "Time Window Start: $TIME_WINDOW_START" >> ./script_debug.log
fi

# Perform atomic upsert operation
UPSERT_RESULT=$(echo "$JSON_DOC" | mongosh "$MONGODB_URI" --quiet --eval "
  db = db.getSiblingDB('$DATABASE');
  db.$COLLECTION.findOneAndUpdate(
    {
      shortName: '$SHORT_NAME',
      radioID: '$RADIO_ID',
      eventType: '$EVENT_TYPE',
      talkgroupOrSource: '$TALKGROUP_OR_SOURCE',
      timestamp: {
        \$gte: '$TIME_WINDOW_START'
      }
    },
    {
      \$setOnInsert: $JSON_DOC
    },
    {
      upsert: true,
      returnDocument: 'after'
    }
  );
")

# Log the upsert result if in debug mode
if [ "$DEBUG" = true ]; then
  echo "Upsert Result: $UPSERT_RESULT" >> ./script_debug.log
fi

# Check if the operation was successful
if [ $? -eq 0 ]; then
  if [ "$DEBUG" = true ]; then
    echo "Event logged successfully to MongoDB." >> ./script_debug.log
  fi
else
  if [ "$DEBUG" = true ]; then
    echo "Error: Failed to log event to MongoDB." >> ./script_debug.log
  fi
  exit 1
fi
