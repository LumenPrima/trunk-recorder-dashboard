import { TalkgroupManager } from './talkgroup-manager.js';
import { UIManager } from './ui-manager.js';

class ThemeManager {
    constructor() {
        this.currentTheme = 'light';
        this.themeToggle = document.getElementById('themeToggle');
        this.initialize();
    }

    initialize() {
        // Set initial theme from localStorage or system preference
        const savedTheme = localStorage.getItem('theme');
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.currentTheme = savedTheme || (systemDark ? 'dark' : 'light');
        this.applyTheme();

        // Set up theme toggle button
        if (this.themeToggle) {
            this.themeToggle.addEventListener('click', () => this.toggleTheme());
            this.updateToggleButton();
        }
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme();
        this.updateToggleButton();
        localStorage.setItem('theme', this.currentTheme);
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.currentTheme);
    }

    updateToggleButton() {
        if (this.themeToggle) {
            this.themeToggle.textContent = this.currentTheme === 'light' ? '🌙' : '☀️';
        }
    }
}

class RadioMonitor {
    constructor() {
        this.socket = window.socketIo;
        this.talkgroupManager = new TalkgroupManager();
        this.uiManager = new UIManager(this.talkgroupManager);
        this.themeManager = new ThemeManager();
        this.connectionState = 'disconnected';
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 5000; // 5 seconds
    }

    setupEventListeners() {
        // Set up UI event listeners
        const filterButton = document.getElementById('filterButton');
        if (filterButton) {
            filterButton.addEventListener('click', () => this.uiManager.toggleFilter());
        }

        document.querySelectorAll('.sort-button').forEach(button => {
            button.addEventListener('click', () => this.uiManager.setSort(button.dataset.sort));
        });

        ['30m', '2h', '6h', '12h'].forEach(duration => {
            const button = document.getElementById(`history${duration}Button`);
            if (button) {
                button.addEventListener('click', () => this.loadHistory(duration));
            }
        });
    }

    async initialize() {
        try {
            // Fetch talkgroup metadata
            const response = await fetch('/api/talkgroups');
            const data = await response.json();
            this.talkgroupManager.setMetadata(data);
            this.uiManager.updateUI();

            // Set up event listeners after DOM is ready
            this.setupEventListeners();
            
            // Set up connection handlers
            this.setupConnectionHandlers();
        } catch (error) {
            console.error('Initialization error:', error);
        }

        // Set up socket event handling
        this.socket.on('connect', () => {
            this.connectionState = 'connected';
            this.retryCount = 0;
            this.updateConnectionStatus();
            console.log('Socket connected');
        });

        this.socket.on('disconnect', () => {
            this.connectionState = 'disconnected';
            this.updateConnectionStatus();
            console.log('Socket disconnected');
            this.attemptReconnect();
        });

        this.socket.on('connect_error', (error) => {
            this.connectionState = 'error';
            this.updateConnectionStatus();
            console.error('Socket connection error:', error);
            this.attemptReconnect();
        });

        this.socket.on('radioEvent', (event) => {
            console.log('Received radio event:', event);
            this.talkgroupManager.handleEvent(event);
            this.uiManager.updateUI();
        });
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = `Connection: ${this.connectionState}`;
            statusElement.className = `connection-status ${this.connectionState}`;
        }
    }

    attemptReconnect() {
        if (this.retryCount >= this.maxRetries) {
            console.error('Max reconnection attempts reached');
            return;
        }

        this.retryCount++;
        console.log(`Attempting to reconnect (${this.retryCount}/${this.maxRetries})...`);

        setTimeout(() => {
            this.socket.connect();
        }, this.retryDelay);
    }

    async loadHistory(duration) {
        const button = document.getElementById(`history${duration}Button`);
        const progress = document.getElementById('loadingProgress');
        const progressFill = progress.querySelector('.progress-fill');
        const progressText = progress.querySelector('.progress-text');
        
        button.disabled = true;
        progress.style.display = 'flex';
        progress.classList.add('active');
        progressFill.style.width = '0%';
        progressText.textContent = 'Loading history...';

        try {
            const response = await fetch(`/api/history/${duration}`);
            const data = await response.json();

            // Show event count
            progressText.textContent = `Processing ${data.totalEvents.toLocaleString()} events...`;
            
            // Reset current state
            this.talkgroupManager.reset();

            // Process events in chunks to show progress
            const chunkSize = 1000;
            const chunks = Math.ceil(data.events.length / chunkSize);
            
            for (let i = 0; i < chunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, data.events.length);
                const chunk = data.events.slice(start, end);
                
                // Process chunk
                chunk.forEach(event => {
                    this.talkgroupManager.handleEvent(event);
                });

                // Update progress
                const progress = ((i + 1) / chunks * 100).toFixed(0);
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `Processing: ${progress}%`;
                
                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            this.uiManager.updateUI();
            progressText.textContent = 'Complete!';
            progressFill.style.width = '100%';
            
        } catch (error) {
            console.error('Error loading history:', error);
            progressText.textContent = 'Load Failed';
            button.textContent = 'Load Failed';
        } finally {
            setTimeout(() => {
                button.disabled = false;
                progress.style.display = 'none';
                progress.classList.remove('active');
                progressFill.style.width = '0%';
            }, 2000);
        }
    }
}

// Export RadioMonitor for module usage
export { RadioMonitor };
