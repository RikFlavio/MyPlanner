/**
 * FlowDay - IndexedDB Database Module
 * Handles all data persistence with IndexedDB
 */

const DB = {
    name: 'FlowDayDB',
    version: 1,
    db: null,

    // Store names
    stores: {
        tasks: 'tasks',
        schedule: 'schedule',
        history: 'history',
        patterns: 'patterns',
        settings: 'settings'
    },

    /**
     * Initialize the database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onerror = () => {
                console.error('Database error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tasks store - user-created task templates
                if (!db.objectStoreNames.contains(this.stores.tasks)) {
                    const taskStore = db.createObjectStore(this.stores.tasks, { keyPath: 'id' });
                    taskStore.createIndex('category', 'category', { unique: false });
                    taskStore.createIndex('name', 'name', { unique: false });
                }

                // Schedule store - scheduled instances of tasks
                if (!db.objectStoreNames.contains(this.stores.schedule)) {
                    const scheduleStore = db.createObjectStore(this.stores.schedule, { keyPath: 'id' });
                    scheduleStore.createIndex('taskId', 'taskId', { unique: false });
                    scheduleStore.createIndex('date', 'date', { unique: false });
                    scheduleStore.createIndex('dateTime', ['date', 'startTime'], { unique: false });
                }

                // History store - completed/skipped task records
                if (!db.objectStoreNames.contains(this.stores.history)) {
                    const historyStore = db.createObjectStore(this.stores.history, { keyPath: 'id' });
                    historyStore.createIndex('taskId', 'taskId', { unique: false });
                    historyStore.createIndex('date', 'date', { unique: false });
                    historyStore.createIndex('status', 'status', { unique: false });
                }

                // Patterns store - learned patterns from algorithm
                if (!db.objectStoreNames.contains(this.stores.patterns)) {
                    const patternStore = db.createObjectStore(this.stores.patterns, { keyPath: 'id' });
                    patternStore.createIndex('taskId', 'taskId', { unique: false });
                    patternStore.createIndex('type', 'type', { unique: false });
                }

                // Settings store - user preferences
                if (!db.objectStoreNames.contains(this.stores.settings)) {
                    db.createObjectStore(this.stores.settings, { keyPath: 'key' });
                }

                console.log('Database schema created/updated');
            };
        });
    },

    /**
     * Generic add operation
     */
    async add(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic put (update) operation
     */
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic get operation
     */
    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic getAll operation
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Generic delete operation
     */
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get by index
     */
    async getByIndex(storeName, indexName, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get schedule for a date range
     */
    async getScheduleForDateRange(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.stores.schedule, 'readonly');
            const store = transaction.objectStore(this.stores.schedule);
            const index = store.index('date');
            const range = IDBKeyRange.bound(startDate, endDate);
            const request = index.getAll(range);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Get history for a date range
     */
    async getHistoryForDateRange(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(this.stores.history, 'readonly');
            const store = transaction.objectStore(this.stores.history);
            const index = store.index('date');
            const range = IDBKeyRange.bound(startDate, endDate);
            const request = index.getAll(range);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear a store
     */
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * Clear all data
     */
    async clearAll() {
        for (const storeName of Object.values(this.stores)) {
            await this.clearStore(storeName);
        }
        return true;
    },

    /**
     * Export all data as JSON
     */
    async exportData() {
        const data = {
            version: this.version,
            exportDate: new Date().toISOString(),
            tasks: await this.getAll(this.stores.tasks),
            schedule: await this.getAll(this.stores.schedule),
            history: await this.getAll(this.stores.history),
            patterns: await this.getAll(this.stores.patterns),
            settings: await this.getAll(this.stores.settings)
        };
        return data;
    },

    /**
     * Import data from JSON
     */
    async importData(data) {
        if (!data || !data.tasks) {
            throw new Error('Invalid data format');
        }

        // Clear existing data
        await this.clearAll();

        // Import each store
        for (const task of data.tasks || []) {
            await this.add(this.stores.tasks, task);
        }
        for (const schedule of data.schedule || []) {
            await this.add(this.stores.schedule, schedule);
        }
        for (const history of data.history || []) {
            await this.add(this.stores.history, history);
        }
        for (const pattern of data.patterns || []) {
            await this.add(this.stores.patterns, pattern);
        }
        for (const setting of data.settings || []) {
            await this.put(this.stores.settings, setting);
        }

        return true;
    },

    /**
     * Get setting value
     */
    async getSetting(key, defaultValue = null) {
        const result = await this.get(this.stores.settings, key);
        return result ? result.value : defaultValue;
    },

    /**
     * Set setting value
     */
    async setSetting(key, value) {
        return this.put(this.stores.settings, { key, value });
    },

    // =====================================
    // Task-specific operations
    // =====================================

    async addTask(task) {
        task.id = task.id || this.generateId();
        task.createdAt = task.createdAt || new Date().toISOString();
        return this.add(this.stores.tasks, task);
    },

    async updateTask(task) {
        task.updatedAt = new Date().toISOString();
        return this.put(this.stores.tasks, task);
    },

    async deleteTask(id) {
        return this.delete(this.stores.tasks, id);
    },

    async getAllTasks() {
        return this.getAll(this.stores.tasks);
    },

    // =====================================
    // Schedule-specific operations
    // =====================================

    async addScheduledTask(scheduledTask) {
        scheduledTask.id = scheduledTask.id || this.generateId();
        scheduledTask.createdAt = new Date().toISOString();
        scheduledTask.status = 'pending';
        return this.add(this.stores.schedule, scheduledTask);
    },

    async updateScheduledTask(scheduledTask) {
        scheduledTask.updatedAt = new Date().toISOString();
        return this.put(this.stores.schedule, scheduledTask);
    },

    async deleteScheduledTask(id) {
        return this.delete(this.stores.schedule, id);
    },

    async getScheduleForWeek(weekStartDate) {
        const endDate = new Date(weekStartDate);
        endDate.setDate(endDate.getDate() + 7);
        return this.getScheduleForDateRange(
            weekStartDate.toISOString().split('T')[0],
            endDate.toISOString().split('T')[0]
        );
    },

    // =====================================
    // History-specific operations
    // =====================================

    async addHistoryEntry(entry) {
        entry.id = entry.id || this.generateId();
        entry.recordedAt = new Date().toISOString();
        return this.add(this.stores.history, entry);
    },

    async getTaskHistory(taskId) {
        return this.getByIndex(this.stores.history, 'taskId', taskId);
    },

    async getAllHistory() {
        return this.getAll(this.stores.history);
    },

    // =====================================
    // Pattern-specific operations
    // =====================================

    async savePattern(pattern) {
        pattern.id = pattern.id || this.generateId();
        pattern.updatedAt = new Date().toISOString();
        return this.put(this.stores.patterns, pattern);
    },

    async getPatternsByTaskId(taskId) {
        return this.getByIndex(this.stores.patterns, 'taskId', taskId);
    },

    async getAllPatterns() {
        return this.getAll(this.stores.patterns);
    },

    // =====================================
    // Utility functions
    // =====================================

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Check if this is first time use
     */
    async isFirstUse() {
        const hasOnboarded = await this.getSetting('hasOnboarded', false);
        return !hasOnboarded;
    },

    /**
     * Mark onboarding complete
     */
    async completeOnboarding() {
        return this.setSetting('hasOnboarded', true);
    },

    /**
     * Get last backup date
     */
    async getLastBackupDate() {
        return this.getSetting('lastBackupDate', null);
    },

    /**
     * Set last backup date
     */
    async setLastBackupDate() {
        return this.setSetting('lastBackupDate', new Date().toISOString());
    }
};
