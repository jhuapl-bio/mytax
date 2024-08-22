class Storage {
    constructor() {
        this.activeConnections = new Map();
        this.ws = null,
        this.queue = null,
        this.orchestrator = null,
        this.activeConnections = new Map() 
        // Add other properties as needed
    }

    // Other methods related to storage can be defined here
}

// Exporting an instance ensures singleton behavior
export const storage = new Storage();