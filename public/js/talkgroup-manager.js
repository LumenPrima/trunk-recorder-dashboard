export class TalkgroupManager {
    constructor() {
        this.talkgroups = {};
        this.metadata = {};
        this.timestamps = {};
        this.radioStates = {};
        this.glowStates = {};
        this.callStats = {};
        this.shortNameFilter = null;
    }

    setMetadata(metadata) {
        this.metadata = metadata;
    }

    reset() {
        Object.keys(this.talkgroups).forEach(key => {
            this.talkgroups[key] = new Set();
            this.radioStates[key] = {};
            this.callStats[key] = {
                count: 0,
                timestamps: []
            };
        });
    }

    handleEvent(event) {
        const talkgroup = event.talkgroupOrSource;
        const radioId = event.radioID;

        if (!this.talkgroups[talkgroup]) {
            this.talkgroups[talkgroup] = new Set();
            this.radioStates[talkgroup] = {};
            this.callStats[talkgroup] = {
                count: 0,
                timestamps: []
            };
        }

        if (event.eventType === 'call') {
            this.callStats[talkgroup].count++;
            this.callStats[talkgroup].timestamps.push(new Date(event.timestamp || Date.now()));
            this.cleanupOldTimestamps(talkgroup);
        }

        if (event.eventType === 'off') {
            this.talkgroups[talkgroup].delete(radioId);
            delete this.radioStates[talkgroup][radioId];
        } else {
            this.talkgroups[talkgroup].add(radioId);
            this.radioStates[talkgroup][radioId] = {
                eventType: event.eventType,
                shortName: event.shortName
            };
        }

        this.timestamps[talkgroup] = event.timestamp;
        this.glowStates[talkgroup] = event.eventType;

        // Remove glow after 30 seconds
        setTimeout(() => {
            delete this.glowStates[talkgroup];
        }, 30000);
    }

    cleanupOldTimestamps(talkgroup) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        this.callStats[talkgroup].timestamps = this.callStats[talkgroup].timestamps.filter(
            ts => ts > fiveMinutesAgo
        );
    }

    calculateFrequency(talkgroup) {
        const stats = this.callStats[talkgroup];
        if (!stats || !stats.timestamps.length) return '0.0';
        
        const now = new Date();
        const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
        const recentTimestamps = stats.timestamps.filter(ts => ts >= fiveMinutesAgo);
        
        if (!recentTimestamps.length) return '0.0';
        
        const timeSpanMinutes = Math.min(5, (now - recentTimestamps[0]) / (1000 * 60));
        const frequency = recentTimestamps.length / timeSpanMinutes;
        
        return frequency.toFixed(1);
    }

    setShortNameFilter(shortName) {
        this.shortNameFilter = shortName;
    }

    clearShortNameFilter() {
        this.shortNameFilter = null;
    }

    getTalkgroupEntries(showActiveOnly = false, sortBy = 'id') {
        let entries = Object.entries(this.talkgroups);
        
        // Filter by shortName if set
        if (this.shortNameFilter) {
            entries = entries.filter(([talkgroup]) => {
                // Look through all events for this talkgroup to find matching shortName
                const radioStates = this.radioStates[talkgroup];
                if (!radioStates) return false;
                
                // Check if any radio in this talkgroup has the matching shortName
                return Object.values(radioStates).some(state => 
                    state.shortName === this.shortNameFilter
                );
            });
        }
        
        // Filter active only if requested
        if (showActiveOnly) {
            entries = entries.filter(([talkgroup]) => {
                const stats = this.callStats[talkgroup];
                return stats && stats.count > 0;
            });
        }

        // Sort entries based on selected method
        switch (sortBy) {
            case 'calls':
                entries.sort(([a], [b]) => 
                    (this.callStats[b]?.count || 0) - (this.callStats[a]?.count || 0)
                );
                break;
            case 'recent':
                entries.sort(([a], [b]) => {
                    const timeA = this.timestamps[a] ? new Date(this.timestamps[a]) : new Date(0);
                    const timeB = this.timestamps[b] ? new Date(this.timestamps[b]) : new Date(0);
                    return timeB - timeA;
                });
                break;
            case 'frequency':
                entries.sort(([a], [b]) => 
                    parseFloat(this.calculateFrequency(b)) - parseFloat(this.calculateFrequency(a))
                );
                break;
            case 'id':
            default:
                entries.sort(([a], [b]) => parseInt(a) - parseInt(b));
                break;
        }

        return entries;
    }

    getMetadata(talkgroup) {
        return this.metadata[talkgroup] || {};
    }

    getTimestamp(talkgroup) {
        return this.timestamps[talkgroup];
    }

    getGlowState(talkgroup) {
        return this.glowStates[talkgroup];
    }

    getRadioState(talkgroup, radioId) {
        return this.radioStates[talkgroup]?.[radioId]?.eventType;
    }

    getCallStats(talkgroup) {
        return this.callStats[talkgroup] || { count: 0 };
    }
}
