/**
 * FlowDay - Smart Weekly Planner
 * Main Application Module
 */

const App = {
    // State
    currentWeekStart: null,
    currentDayIndex: 0, // For mobile: 0-6 (day of week)
    isMobile: false,
    tasks: [],
    schedule: [],
    insights: [],
    selectedFilter: 'all',
    draggedTask: null,
    draggedScheduled: null, // For moving scheduled tasks
    scheduledGhost: null,
    scheduledTouchTimer: null,
    justDragged: false, // Prevent click after drag
    selectedScheduledTask: null,
    pendingCellSchedule: null, // For mobile tap-to-schedule flow
    selectedChecklistTask: null, // For checklist modal
    isDraggingTask: false, // To prevent click after drag
    specialPeriods: [], // Special periods from calendar
    periodCategories: [], // Period categories
    selectedExistingTask: null, // For autocomplete task selection
    resizeTimer: null, // For debouncing resize events
    searchQuery: '', // For task search

    // Category config
    categories: {
        work: { icon: '💼', color: 'var(--cat-work)', name: 'Lavoro' },
        health: { icon: '🏃', color: 'var(--cat-health)', name: 'Salute' },
        home: { icon: '🏠', color: 'var(--cat-home)', name: 'Casa' },
        personal: { icon: '⭐', color: 'var(--cat-personal)', name: 'Personale' },
        social: { icon: '👥', color: 'var(--cat-social)', name: 'Sociale' },
        other: { icon: '📌', color: 'var(--cat-other)', name: 'Altro' }
    },

    // Time config (5:00 - 5:00 next day = 24 hours)
    dayStartHour: 5,
    slotDuration: 30, // minutes

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Detect mobile
            this.checkMobile();
            window.addEventListener('resize', () => this.handleResize());

            // Initialize database
            await DB.init();

            // Check first use
            const isFirstUse = await DB.isFirstUse();

            if (isFirstUse) {
                this.showOnboarding();
            } else {
                await this.loadApp();
            }

            // Setup event listeners
            this.setupEventListeners();

        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showNotification('Errore di inizializzazione', 'error');
        }
    },

    checkMobile() {
        this.isMobile = window.innerWidth <= 768;
    },

    handleResize() {
        const wasMobile = this.isMobile;
        this.checkMobile();
        
        // If switching between mobile/desktop, re-render grid
        if (wasMobile !== this.isMobile) {
            this.renderGrid();
            this.renderScheduledTasks();
            if (this.isMobile) {
                this.updateMobileDayDisplay();
            }
        }
    },

    /**
     * Load application data and render
     */
    async loadApp() {
        // Load theme first for immediate visual feedback
        await this.initTheme();

        // Set current week
        this.currentWeekStart = this.getWeekStart(new Date());
        
        // Set current day index for mobile (0 = Monday of current week)
        const today = new Date();
        const dayOfWeek = today.getDay();
        this.currentDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0 format

        // Load data
        this.tasks = await DB.getAllTasks();
        // Sort by order if available
        this.tasks.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        await this.loadWeekSchedule();
        
        // Load special periods and categories
        await this.loadSpecialPeriods();

        // Render UI
        this.renderWeekHeader();
        this.renderGrid();
        this.renderFilters();
        this.renderTaskList();
        this.renderScheduledTasks();
        
        // Update mobile day display
        if (this.isMobile) {
            this.updateMobileDayDisplay();
        }

        // Run algorithm analysis
        await this.refreshInsights();

        // Check backup reminder
        await this.checkBackupReminder();
    },
    
    /**
     * Load special periods from DB
     */
    async loadSpecialPeriods() {
        try {
            this.specialPeriods = await DB.getSetting('specialPeriods') || [];
            this.periodCategories = await DB.getSetting('periodCategories') || [];
        } catch (e) {
            this.specialPeriods = [];
            this.periodCategories = [];
        }
    },
    
    /**
     * Get period for a specific date
     */
    getPeriodForDate(dateStr) {
        for (const period of this.specialPeriods) {
            if (dateStr >= period.startDate && dateStr <= period.endDate) {
                const category = this.periodCategories.find(c => c.id === period.categoryId);
                return {
                    ...period,
                    color: category?.color || '#6b7280',
                    categoryName: category?.name || ''
                };
            }
        }
        return null;
    },

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Theme toggle
        document.getElementById('theme-switch')?.addEventListener('click', () => this.toggleTheme());
        
        // Suggest routine
        document.getElementById('suggest-routine-btn')?.addEventListener('click', () => this.suggestRoutine());

        // Onboarding
        document.getElementById('start-fresh')?.addEventListener('click', () => this.completeOnboarding());
        document.getElementById('import-existing')?.addEventListener('click', () => this.importFromOnboarding());

        // Navigation
        document.getElementById('prev-week')?.addEventListener('click', () => this.navigateWeek(-1));
        document.getElementById('next-week')?.addEventListener('click', () => this.navigateWeek(1));
        document.getElementById('today-btn')?.addEventListener('click', () => this.goToToday());
        
        // Mobile day navigation
        document.getElementById('prev-day')?.addEventListener('click', () => this.navigateDay(-1));
        document.getElementById('next-day')?.addEventListener('click', () => this.navigateDay(1));

        // Task creation
        document.getElementById('add-task-btn')?.addEventListener('click', () => this.openTaskModal());
        document.getElementById('close-task-modal')?.addEventListener('click', () => this.closeTaskModal());
        document.getElementById('task-form')?.addEventListener('submit', (e) => this.handleTaskSubmit(e));
        document.getElementById('task-name')?.addEventListener('input', (e) => this.handleTaskNameInput(e));

        // Task Panel
        document.getElementById('task-panel-bar')?.addEventListener('click', () => this.toggleTaskPanel());
        document.getElementById('task-search')?.addEventListener('input', (e) => this.handleTaskSearch(e));
        document.getElementById('task-search')?.addEventListener('focus', () => this.expandTaskPanel());
        
        // Filter Dropdown
        document.getElementById('filter-dropdown-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFilterDropdown();
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('filter-dropdown');
            if (dropdown && !dropdown.contains(e.target)) {
                dropdown.classList.remove('open');
            }
        });

        // Category selection
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectCategory(btn));
        });

        // Task filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => this.filterTasks(btn.dataset.filter));
        });

        // Detail modal
        document.getElementById('close-detail-modal')?.addEventListener('click', () => this.closeDetailModal());
        document.getElementById('mark-complete')?.addEventListener('click', () => this.markTaskComplete());
        document.getElementById('mark-skipped')?.addEventListener('click', () => this.markTaskSkipped());
        document.getElementById('remove-scheduled')?.addEventListener('click', () => this.removeScheduledTask());

        // Settings
        document.getElementById('settings-btn')?.addEventListener('click', () => this.openSettingsModal());
        document.getElementById('close-settings-modal')?.addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('theme-switch-settings')?.addEventListener('click', () => this.toggleTheme());
        document.getElementById('export-data')?.addEventListener('click', () => this.exportData());
        document.getElementById('import-data')?.addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file')?.addEventListener('change', (e) => this.importData(e));
        document.getElementById('clear-all-data')?.addEventListener('click', () => this.clearAllData());

        // Checklist
        document.getElementById('close-checklist-modal')?.addEventListener('click', () => this.closeChecklistModal());
        document.getElementById('checklist-add-btn')?.addEventListener('click', () => this.addChecklistItem());
        document.getElementById('checklist-new-item')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addChecklistItem();
        });

        // Insights
        document.getElementById('insights-toggle')?.addEventListener('click', () => this.toggleInsightsPanel());

        // Mobile
        document.getElementById('mobile-tasks-btn')?.addEventListener('click', () => this.toggleMobileTaskPanel());
        document.getElementById('mobile-add-btn')?.addEventListener('click', () => {
            this.closeMobileSheets();
            this.openTaskModal();
        });
        document.getElementById('mobile-insights-btn')?.addEventListener('click', () => this.toggleInsightsPanel());
        document.getElementById('mobile-today-btn')?.addEventListener('click', () => this.goToToday());
        document.getElementById('mobile-overlay')?.addEventListener('click', () => this.closeMobileSheets());

        // Notification close button
        document.getElementById('notification-close')?.addEventListener('click', () => this.hideNotification());

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('open');
                }
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
                document.getElementById('insights-panel')?.classList.remove('open');
                document.getElementById('task-panel')?.classList.remove('expanded');
            }
        });

        // Mobile swipe gestures for day navigation
        this.setupSwipeGestures();
    },

    setupSwipeGestures() {
        const gridWrapper = document.getElementById('grid-wrapper');
        if (!gridWrapper) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;

        gridWrapper.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        gridWrapper.addEventListener('touchend', (e) => {
            if (!this.isMobile) return;
            
            touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            
            const diffX = touchStartX - touchEndX;
            const diffY = Math.abs(touchStartY - touchEndY);
            
            // Only trigger if horizontal swipe is dominant
            if (Math.abs(diffX) > 50 && diffY < 100) {
                if (diffX > 0) {
                    // Swipe left - next day
                    this.navigateDay(1);
                } else {
                    // Swipe right - previous day
                    this.navigateDay(-1);
                }
            }
        }, { passive: true });
    },

    // =====================================
    // Week Navigation
    // =====================================

    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    },

    async navigateWeek(direction) {
        const newStart = new Date(this.currentWeekStart);
        newStart.setDate(newStart.getDate() + (direction * 7));
        this.currentWeekStart = newStart;
        
        await this.loadWeekSchedule();
        this.renderWeekHeader();
        this.renderGrid();
        this.renderScheduledTasks();
        
        if (this.isMobile) {
            this.updateMobileDayDisplay();
        }
    },

    goToToday() {
        this.currentWeekStart = this.getWeekStart(new Date());
        
        // Also update mobile day index
        const today = new Date();
        const dayOfWeek = today.getDay();
        this.currentDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        
        this.loadWeekSchedule().then(() => {
            this.renderWeekHeader();
            this.renderGrid();
            this.renderScheduledTasks();
            if (this.isMobile) {
                this.updateMobileDayDisplay();
            }
        });
    },

    // Mobile day navigation
    navigateDay(direction) {
        this.currentDayIndex += direction;
        
        // Handle week transitions
        if (this.currentDayIndex < 0) {
            this.currentDayIndex = 6;
            this.navigateWeek(-1);
            return;
        } else if (this.currentDayIndex > 6) {
            this.currentDayIndex = 0;
            this.navigateWeek(1);
            return;
        }
        
        this.updateMobileDayDisplay();
        this.updateMobileVisibleCells();
        this.renderScheduledTasks();
    },

    updateMobileDayDisplay() {
        const dayDisplay = document.getElementById('day-display');
        if (!dayDisplay) return;
        
        const date = new Date(this.currentWeekStart);
        date.setDate(date.getDate() + this.currentDayIndex);
        
        const options = { weekday: 'short', day: 'numeric', month: 'short' };
        dayDisplay.textContent = date.toLocaleDateString('it-IT', options);
        
        this.updateMobileVisibleCells();
    },

    updateMobileVisibleCells() {
        // Hide all cells, show only current day
        document.querySelectorAll('.grid-cell').forEach(cell => {
            const dayIndex = parseInt(cell.dataset.day);
            cell.classList.toggle('mobile-visible', dayIndex === this.currentDayIndex);
        });
    },

    async loadWeekSchedule() {
        const endDate = new Date(this.currentWeekStart);
        endDate.setDate(endDate.getDate() + 7);
        
        this.schedule = await DB.getScheduleForDateRange(
            this.formatDateLocal(this.currentWeekStart),
            this.formatDateLocal(endDate)
        );
    },

    // =====================================
    // Rendering
    // =====================================

    renderWeekHeader() {
        const weekEnd = new Date(this.currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);

        const options = { day: 'numeric', month: 'short' };
        const startStr = this.currentWeekStart.toLocaleDateString('it-IT', options);
        const endStr = weekEnd.toLocaleDateString('it-IT', options);

        document.getElementById('week-display').textContent = `${startStr} - ${endStr}`;

        // Render day headers
        const headerContainer = document.getElementById('grid-header');
        headerContainer.innerHTML = '<div class="time-column-header"></div>';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 7; i++) {
            const date = new Date(this.currentWeekStart);
            date.setDate(date.getDate() + i);

            const isToday = date.getTime() === today.getTime();
            const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

            // Check if this day is in a special period
            const dateStr = this.formatDateLocal(date);
            const period = this.getPeriodForDate(dateStr);

            const header = document.createElement('div');
            header.className = `day-header ${isToday ? 'today' : ''}`;
            
            if (period) {
                header.classList.add('in-period');
                header.style.setProperty('--period-color', period.color);
                header.title = period.categoryName;
            }
            
            header.innerHTML = `
                <div class="day-name">${dayNames[date.getDay()]}</div>
                <div class="day-date">${date.getDate()}</div>
                ${period ? `<div class="period-indicator" style="background: ${period.color}"></div>` : ''}
            `;
            headerContainer.appendChild(header);
        }
    },

    renderGrid() {
        const gridBody = document.getElementById('grid-body');
        gridBody.innerHTML = '';

        // Generate time slots (5:00 to 5:00 next day = 48 slots of 30 min)
        for (let slot = 0; slot < 48; slot++) {
            const totalMinutes = (this.dayStartHour * 60) + (slot * this.slotDuration);
            const hours = Math.floor(totalMinutes / 60) % 24;
            const minutes = totalMinutes % 60;
            const isHourStart = minutes === 0;

            const row = document.createElement('div');
            row.className = 'grid-row';

            // Time cell
            const timeCell = document.createElement('div');
            timeCell.className = `time-cell ${isHourStart ? 'hour-start' : ''}`;
            timeCell.textContent = isHourStart ? `${hours.toString().padStart(2, '0')}:00` : '';
            row.appendChild(timeCell);

            // Day cells
            for (let day = 0; day < 7; day++) {
                const cell = document.createElement('div');
                cell.className = `grid-cell ${isHourStart ? 'hour-start' : ''}`;
                
                // Add mobile-visible class for current day on mobile
                if (this.isMobile && day === this.currentDayIndex) {
                    cell.classList.add('mobile-visible');
                }
                
                cell.dataset.day = day;
                cell.dataset.slot = slot;
                cell.dataset.time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

                // Drag and drop events
                cell.addEventListener('dragover', (e) => this.handleDragOver(e));
                cell.addEventListener('dragleave', (e) => this.handleDragLeave(e));
                cell.addEventListener('drop', (e) => this.handleDrop(e));

                // Touch events for mobile
                cell.addEventListener('touchend', (e) => this.handleTouchDrop(e, cell));
                
                // Tap to add task (mobile)
                cell.addEventListener('click', (e) => this.handleCellClick(e, cell));

                row.appendChild(cell);
            }

            gridBody.appendChild(row);
        }
    },

    renderTaskList() {
        const taskList = document.getElementById('task-list');
        
        let filteredTasks = this.tasks;
        
        // Apply category filter
        if (this.selectedFilter !== 'all') {
            filteredTasks = filteredTasks.filter(t => t.category === this.selectedFilter);
        }
        
        // Apply search filter
        if (this.searchQuery) {
            filteredTasks = filteredTasks.filter(t => 
                t.name.toLowerCase().includes(this.searchQuery)
            );
        }

        // Update filter button
        this.updateFilterButton();

        if (filteredTasks.length === 0) {
            const message = this.searchQuery 
                ? `Nessun task trovato per "${this.searchQuery}"`
                : (this.selectedFilter !== 'all' ? 'Nessun task in questa categoria' : 'Nessun task creato');
            
            taskList.innerHTML = `
                <div class="task-empty">
                    <p>${message}</p>
                    <button class="btn btn-primary btn-small" onclick="App.openTaskModal()">+ Crea task</button>
                </div>
            `;
            return;
        }

        taskList.innerHTML = filteredTasks.map((task, index) => {
            const cat = this.categories[task.category] || this.categories.other;
            const checklist = task.checklist || [];
            const completedCount = checklist.filter(item => item.completed).length;
            const totalCount = checklist.length;
            
            let badgeClass = '';
            let badgeText = '';
            if (totalCount > 0) {
                if (completedCount === totalCount) {
                    badgeClass = 'all-done';
                    badgeText = `✓ ${totalCount}`;
                } else {
                    badgeClass = 'has-items';
                    badgeText = `${completedCount}/${totalCount}`;
                }
            }
            
            return `
                <div class="task-item" 
                     draggable="true" 
                     data-task-id="${task.id}"
                     data-task-index="${index}"
                     style="--task-color: ${cat.color}"
                     onclick="App.onTaskItemClick(event, '${task.id}')">
                    <span class="drag-handle" title="Trascina per riordinare">⋮⋮</span>
                    <span class="task-icon">${cat.icon}</span>
                    <span class="task-name">${this.escapeHtml(task.name)}</span>
                    ${totalCount > 0 ? `<span class="task-checklist-badge ${badgeClass}">${badgeText}</span>` : ''}
                    <span class="task-duration">${task.defaultDuration}m</span>
                    <button class="task-delete" onclick="App.deleteTask('${task.id}', event); event.stopPropagation();">×</button>
                </div>
            `;
        }).join('');

        // Add events for task items
        taskList.querySelectorAll('.task-item').forEach(item => {
            // Drag to grid events
            item.addEventListener('dragstart', (e) => this.handleDragStart(e));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));
            
            // Reorder drag events
            item.addEventListener('dragover', (e) => this.handleReorderDragOver(e, item));
            item.addEventListener('dragleave', (e) => this.handleReorderDragLeave(e, item));
            item.addEventListener('drop', (e) => this.handleReorderDrop(e, item));
            
            // Touch events for mobile
            item.addEventListener('touchstart', (e) => this.handleTouchStart(e));
            item.addEventListener('touchmove', (e) => this.handleTouchMove(e));
            item.addEventListener('touchend', (e) => this.handleTouchEnd(e));
            
            // Click handler
            item.addEventListener('click', (e) => this.handleTaskItemClick(e, item));
            
            // Track if we're dragging to prevent click
            item.addEventListener('dragstart', () => { this.isDraggingTask = true; });
            item.addEventListener('dragend', () => { 
                setTimeout(() => { this.isDraggingTask = false; }, 100);
            });
        });
    },

    // Task reorder drag handlers
    reorderDraggedTaskId: null,

    handleReorderDragOver(e, item) {
        e.preventDefault();
        const draggedId = this.draggedTask?.id || this.reorderDraggedTaskId;
        if (!draggedId) return;
        
        const targetId = item.dataset.taskId;
        if (draggedId === targetId) return;
        
        // Determine if dropping above or below
        const rect = item.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        item.classList.remove('reorder-over-top', 'reorder-over-bottom');
        if (e.clientY < midY) {
            item.classList.add('reorder-over-top');
        } else {
            item.classList.add('reorder-over-bottom');
        }
        item.classList.add('reorder-over');
    },

    handleReorderDragLeave(e, item) {
        item.classList.remove('reorder-over', 'reorder-over-top', 'reorder-over-bottom');
    },

    async handleReorderDrop(e, targetItem) {
        e.preventDefault();
        e.stopPropagation();
        
        targetItem.classList.remove('reorder-over', 'reorder-over-top', 'reorder-over-bottom');
        
        const draggedId = this.draggedTask?.id || this.reorderDraggedTaskId;
        if (!draggedId) return;
        
        const targetId = targetItem.dataset.taskId;
        if (draggedId === targetId) return;
        
        // Find indices
        const draggedIndex = this.tasks.findIndex(t => t.id === draggedId);
        const targetIndex = this.tasks.findIndex(t => t.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return;
        
        // Determine insert position
        const rect = targetItem.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertAfter = e.clientY > midY;
        
        // Remove from old position
        const [draggedTask] = this.tasks.splice(draggedIndex, 1);
        
        // Calculate new index
        let newIndex = targetIndex;
        if (draggedIndex < targetIndex) {
            newIndex = insertAfter ? targetIndex : targetIndex - 1;
        } else {
            newIndex = insertAfter ? targetIndex + 1 : targetIndex;
        }
        
        // Insert at new position
        this.tasks.splice(newIndex, 0, draggedTask);
        
        // Save order
        await this.saveTaskOrder();
        
        // Re-render
        this.renderTaskList();
        this.reorderDraggedTaskId = null;
    },

    async saveTaskOrder() {
        try {
            // Save each task with updated order
            for (let i = 0; i < this.tasks.length; i++) {
                this.tasks[i].order = i;
                await DB.updateTask(this.tasks[i]);
            }
        } catch (error) {
            console.error('Failed to save task order:', error);
        }
    },

    handleTaskItemClick(event, item) {
        // Don't open checklist if clicking delete button
        if (event.target.classList.contains('task-delete')) return;
        
        // Don't open if we just finished dragging
        if (this.isDraggingTask) return;
        
        // If there's a pending cell to schedule on (mobile flow)
        if (this.isMobile && this.pendingCellSchedule) {
            event.preventDefault();
            event.stopPropagation();
            
            const taskId = item.dataset.taskId;
            const task = this.tasks.find(t => t.id === taskId);
            
            if (task) {
                this.scheduleTaskToCell(task, this.pendingCellSchedule);
                this.pendingCellSchedule = null;
                this.closeMobileSheets();
            }
            return;
        }
        
        // Otherwise, open checklist modal
        const taskId = item.dataset.taskId;
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            this.openChecklistModal(task);
        }
    },

    // Direct onclick handler from HTML
    onTaskItemClick(event, taskId) {
        // Don't open checklist if clicking delete button
        if (event.target.classList.contains('task-delete')) return;
        
        // Don't open if we just finished dragging
        if (this.isDraggingTask) return;
        
        // If there's a pending cell to schedule on (mobile flow)
        if (this.isMobile && this.pendingCellSchedule) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                this.scheduleTaskToCell(task, this.pendingCellSchedule);
                this.pendingCellSchedule = null;
                this.closeMobileSheets();
            }
            return;
        }
        
        // Open checklist page
        window.location.href = `checklist.html?taskId=${taskId}`;
    },

    // =====================================
    // Scheduled Tasks Rendering
    // =====================================

    renderScheduledTasks() {
        // Remove existing scheduled tasks from grid
        document.querySelectorAll('.scheduled-task').forEach(el => el.remove());

        for (const scheduled of this.schedule) {
            this.renderSingleScheduledTask(scheduled);
        }
    },

    renderSingleScheduledTask(scheduled) {
        const task = this.tasks.find(t => t.id === scheduled.taskId);
        if (!task) return;

        // Find the date's day index
        const [year, month, day] = scheduled.date.split('-').map(Number);
        const scheduleDate = new Date(year, month - 1, day);
        
        const dayDiff = Math.round((scheduleDate - this.currentWeekStart) / (1000 * 60 * 60 * 24));
        if (dayDiff < 0 || dayDiff >= 7) return;

        // Determine which time to use
        const isCompleted = scheduled.status === 'completed';
        const isSkipped = scheduled.status === 'skipped';
        const hasActualTimes = scheduled.actualStartTime && scheduled.actualDuration;
        const canDrag = !isCompleted && !isSkipped;
        
        const displayStartTime = (isCompleted && hasActualTimes) ? scheduled.actualStartTime : scheduled.startTime;
        const displayDuration = (isCompleted && hasActualTimes) ? scheduled.actualDuration : scheduled.duration;

        // Calculate slot position
        const [hours, minutes] = displayStartTime.split(':').map(Number);
        let totalMinutes = hours * 60 + minutes;
        
        // Adjust for day start at 5:00
        if (hours < this.dayStartHour) {
            totalMinutes += 24 * 60;
        }
        const slotStart = Math.floor((totalMinutes - this.dayStartHour * 60) / this.slotDuration);

        // Find the cell - on mobile use day 0 (current day), on desktop use dayDiff
        const cellDay = this.isMobile ? 0 : dayDiff;
        const cell = document.querySelector(`.grid-cell[data-day="${cellDay}"][data-slot="${slotStart}"]`);
        if (!cell) return;

        const cat = this.categories[task.category] || this.categories.other;
        const slotHeight = 40; // CSS --cell-height
        const slotsNeeded = Math.ceil(displayDuration / this.slotDuration);
        const taskHeight = slotsNeeded * slotHeight - 4;

        // Build time display
        const plannedEnd = this.addMinutesToTime(scheduled.startTime, scheduled.duration);
        let timeHTML = '';
        
        if (isCompleted && hasActualTimes) {
            const actualEnd = this.addMinutesToTime(scheduled.actualStartTime, scheduled.actualDuration);
            const durationDiff = scheduled.actualDuration - scheduled.duration;
            timeHTML = `
                <div class="st-time st-actual">${scheduled.actualStartTime} - ${actualEnd} <span class="st-duration-badge ${durationDiff > 0 ? 'over' : durationDiff < 0 ? 'under' : ''}">${scheduled.actualDuration}m</span></div>
                <div class="st-time st-planned">Piano: ${scheduled.startTime} - ${plannedEnd} (${scheduled.duration}m)</div>
            `;
        } else {
            timeHTML = `<div class="st-time">${scheduled.startTime} - ${plannedEnd}</div>`;
        }

        const taskEl = document.createElement('div');
        taskEl.className = `scheduled-task ${scheduled.status || ''} ${(isCompleted && hasActualTimes) ? 'has-actual' : ''} ${canDrag ? 'draggable' : ''}`;
        taskEl.style.cssText = `
            --task-color: ${cat.color};
            height: ${taskHeight}px;
        `;
        taskEl.dataset.scheduleId = scheduled.id;
        
        if (canDrag) {
            taskEl.draggable = true;
            taskEl.innerHTML = `
                <div class="st-drag-handle">⋮⋮</div>
                <div class="st-content">
                    <div class="st-name">${cat.icon} ${this.escapeHtml(task.name)}</div>
                    ${timeHTML}
                </div>
                <div class="resize-handle"></div>
            `;
            
            // Desktop drag events
            taskEl.addEventListener('dragstart', (e) => this.handleScheduledDragStart(e, scheduled));
            taskEl.addEventListener('dragend', (e) => this.handleScheduledDragEnd(e));
            
            // Mobile touch events
            taskEl.addEventListener('touchstart', (e) => this.handleScheduledTouchStart(e, scheduled));
            taskEl.addEventListener('touchmove', (e) => this.handleScheduledTouchMove(e));
            taskEl.addEventListener('touchend', (e) => this.handleScheduledTouchEnd(e));

            // Resize handle events
            const resizeHandle = taskEl.querySelector('.resize-handle');
            resizeHandle.addEventListener('mousedown', (e) => this.handleResizeStart(e, scheduled, taskEl));
            resizeHandle.addEventListener('touchstart', (e) => this.handleResizeTouchStart(e, scheduled, taskEl));
        } else {
            taskEl.innerHTML = `
                <div class="st-name">${cat.icon} ${this.escapeHtml(task.name)}</div>
                ${timeHTML}
            `;
        }

        taskEl.addEventListener('click', (e) => {
            if (!this.justDragged) {
                this.openDetailModal(scheduled);
            }
            this.justDragged = false;
        });

        cell.appendChild(taskEl);
    },

    // =====================================
    // Scheduled Task Drag & Drop
    // =====================================

    handleScheduledDragStart(event, scheduled) {
        this.draggedScheduled = scheduled;
        event.target.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', scheduled.id);
        
        // Add class to body to enable CSS-based pointer-events control
        document.body.classList.add('is-dragging-scheduled');
    },

    handleScheduledDragEnd(event) {
        event.target.classList.remove('dragging');
        this.draggedScheduled = null;
        document.querySelectorAll('.grid-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
        
        // Remove body class
        document.body.classList.remove('is-dragging-scheduled');
    },

    // =====================================
    // Resize Scheduled Tasks
    // =====================================

    resizingTask: null,
    resizeStartY: 0,
    resizeStartHeight: 0,
    resizeTaskEl: null,

    handleResizeStart(e, scheduled, taskEl) {
        e.preventDefault();
        e.stopPropagation();
        
        this.resizingTask = scheduled;
        this.resizeTaskEl = taskEl;
        this.resizeStartY = e.clientY;
        this.resizeStartHeight = taskEl.offsetHeight;
        
        taskEl.classList.add('resizing');
        taskEl.draggable = false;
        document.body.classList.add('is-resizing');
        
        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
    },

    handleResizeMove: function(e) {
        if (!App.resizingTask || !App.resizeTaskEl) return;
        
        const deltaY = e.clientY - App.resizeStartY;
        const slotHeight = 40; // --cell-height
        const minHeight = slotHeight - 4;
        const newHeight = Math.max(minHeight, App.resizeStartHeight + deltaY);
        
        // Snap to slot increments
        const slots = Math.max(1, Math.round((newHeight + 4) / slotHeight));
        const snappedHeight = slots * slotHeight - 4;
        
        App.resizeTaskEl.style.height = snappedHeight + 'px';
    },

    handleResizeEnd: function(e) {
        if (!App.resizingTask || !App.resizeTaskEl) return;
        
        document.removeEventListener('mousemove', App.handleResizeMove);
        document.removeEventListener('mouseup', App.handleResizeEnd);
        
        const slotHeight = 40;
        const finalHeight = App.resizeTaskEl.offsetHeight + 4;
        const slots = Math.round(finalHeight / slotHeight);
        const newDuration = slots * App.slotDuration;
        
        // Update duration
        App.resizingTask.duration = newDuration;
        App.updateScheduledTask(App.resizingTask);
        
        App.resizeTaskEl.classList.remove('resizing');
        App.resizeTaskEl.draggable = true;
        document.body.classList.remove('is-resizing');
        
        App.resizingTask = null;
        App.resizeTaskEl = null;
        
        App.renderScheduledTasks();
    },

    handleResizeTouchStart(e, scheduled, taskEl) {
        e.preventDefault();
        e.stopPropagation();
        
        const touch = e.touches[0];
        this.resizingTask = scheduled;
        this.resizeTaskEl = taskEl;
        this.resizeStartY = touch.clientY;
        this.resizeStartHeight = taskEl.offsetHeight;
        
        taskEl.classList.add('resizing');
        document.body.classList.add('is-resizing');
        
        document.addEventListener('touchmove', this.handleResizeTouchMove, { passive: false });
        document.addEventListener('touchend', this.handleResizeTouchEnd);
    },

    handleResizeTouchMove: function(e) {
        if (!App.resizingTask || !App.resizeTaskEl) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const deltaY = touch.clientY - App.resizeStartY;
        const slotHeight = 40;
        const minHeight = slotHeight - 4;
        const newHeight = Math.max(minHeight, App.resizeStartHeight + deltaY);
        
        const slots = Math.max(1, Math.round((newHeight + 4) / slotHeight));
        const snappedHeight = slots * slotHeight - 4;
        
        App.resizeTaskEl.style.height = snappedHeight + 'px';
    },

    handleResizeTouchEnd: function(e) {
        if (!App.resizingTask || !App.resizeTaskEl) return;
        
        document.removeEventListener('touchmove', App.handleResizeTouchMove);
        document.removeEventListener('touchend', App.handleResizeTouchEnd);
        
        const slotHeight = 40;
        const finalHeight = App.resizeTaskEl.offsetHeight + 4;
        const slots = Math.round(finalHeight / slotHeight);
        const newDuration = slots * App.slotDuration;
        
        App.resizingTask.duration = newDuration;
        App.updateScheduledTask(App.resizingTask);
        
        App.resizeTaskEl.classList.remove('resizing');
        document.body.classList.remove('is-resizing');
        
        App.resizingTask = null;
        App.resizeTaskEl = null;
        
        App.renderScheduledTasks();
    },

    async updateScheduledTask(scheduled) {
        try {
            await DB.updateSchedule(scheduled);
            const idx = this.schedule.findIndex(s => s.id === scheduled.id);
            if (idx !== -1) {
                this.schedule[idx] = scheduled;
            }
        } catch (error) {
            console.error('Failed to update scheduled task:', error);
        }
    },

    handleScheduledTouchStart(event, scheduled) {
        // Long press to start drag
        this.scheduledTouchTimer = setTimeout(() => {
            this.draggedScheduled = scheduled;
            this.justDragged = true;
            
            const touch = event.touches[0];
            const target = event.currentTarget;
            
            // Create ghost element
            this.scheduledGhost = target.cloneNode(true);
            this.scheduledGhost.classList.add('drag-ghost');
            this.scheduledGhost.style.width = target.offsetWidth + 'px';
            this.scheduledGhost.style.left = touch.clientX - target.offsetWidth / 2 + 'px';
            this.scheduledGhost.style.top = touch.clientY - 20 + 'px';
            document.body.appendChild(this.scheduledGhost);
            
            target.classList.add('dragging');
            
            // Vibrate feedback if available
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 300);
    },

    handleScheduledTouchMove(event) {
        if (this.scheduledTouchTimer) {
            clearTimeout(this.scheduledTouchTimer);
            this.scheduledTouchTimer = null;
        }
        
        if (!this.draggedScheduled || !this.scheduledGhost) return;
        
        event.preventDefault();
        const touch = event.touches[0];
        
        // Move ghost
        this.scheduledGhost.style.left = touch.clientX - this.scheduledGhost.offsetWidth / 2 + 'px';
        this.scheduledGhost.style.top = touch.clientY - 20 + 'px';
        
        // Highlight cell under touch
        document.querySelectorAll('.grid-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = elementBelow?.closest('.grid-cell');
        if (cell) {
            cell.classList.add('drag-over');
        }
    },

    handleScheduledTouchEnd(event) {
        if (this.scheduledTouchTimer) {
            clearTimeout(this.scheduledTouchTimer);
            this.scheduledTouchTimer = null;
        }
        
        if (!this.draggedScheduled) return;
        
        // Find the cell we're over
        const touch = event.changedTouches[0];
        const elementBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const cell = elementBelow?.closest('.grid-cell');
        
        if (cell) {
            this.moveScheduledTask(this.draggedScheduled, cell);
        }
        
        // Cleanup
        if (this.scheduledGhost) {
            this.scheduledGhost.remove();
            this.scheduledGhost = null;
        }
        
        document.querySelectorAll('.scheduled-task.dragging').forEach(t => t.classList.remove('dragging'));
        document.querySelectorAll('.grid-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
        
        this.draggedScheduled = null;
    },

    async moveScheduledTask(scheduled, cell) {
        const dayIndex = parseInt(cell.dataset.day);
        const time = cell.dataset.time;

        const newDate = new Date(this.currentWeekStart);
        newDate.setDate(newDate.getDate() + dayIndex);

        // Adjust date if time is before 5:00 (belongs to next calendar day)
        const [hours] = time.split(':').map(Number);
        if (hours < this.dayStartHour) {
            newDate.setDate(newDate.getDate() + 1);
        }

        const dateStr = this.formatDateLocal(newDate);

        // Update scheduled task
        scheduled.date = dateStr;
        scheduled.startTime = time;

        try {
            await DB.updateScheduledTask(scheduled);
            this.renderScheduledTasks();
            this.showNotification('Task spostato!', 'success');
        } catch (error) {
            console.error('Failed to move task:', error);
            this.showNotification('Errore nello spostamento', 'error');
        }
    },

    renderInsights() {
        const container = document.getElementById('insights-content');
        const countBadge = document.getElementById('insights-count');
        const dot = document.getElementById('insights-dot');

        countBadge.textContent = this.insights.length;
        
        if (this.insights.length > 0) {
            dot?.classList.add('active');
        } else {
            dot?.classList.remove('active');
        }

        if (this.insights.length === 0) {
            container.innerHTML = `
                <div class="insight-empty">
                    <p>Usa l'app per qualche giorno e inizierò a darti suggerimenti personalizzati!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.insights.map(insight => {
            const typeLabels = {
                pattern: 'Pattern rilevato',
                optimization: 'Ottimizzazione',
                achievement: 'Traguardo',
                insight: 'Insight',
                info: 'Info'
            };

            return `
                <div class="insight-card">
                    <div class="insight-type">${typeLabels[insight.type] || insight.type}</div>
                    <div class="insight-text">${this.escapeHtml(insight.text)}</div>
                </div>
            `;
        }).join('');
    },

    // =====================================
    // Drag & Drop
    // =====================================

    handleDragStart(event) {
        // Find the task-item element (might be dragging from a child element)
        const taskItem = event.target.closest('.task-item');
        if (!taskItem) return;
        
        const taskId = taskItem.dataset.taskId;
        this.draggedTask = this.tasks.find(t => t.id === taskId);
        this.reorderDraggedTaskId = taskId;
        taskItem.classList.add('dragging', 'reorder-dragging');
        event.dataTransfer.effectAllowed = 'all';
        event.dataTransfer.setData('text/plain', taskId);
        
        // Add class to body to enable CSS-based pointer-events control
        document.body.classList.add('is-dragging-task');
    },

    handleDragEnd(event) {
        const taskItem = event.target.closest('.task-item');
        if (taskItem) {
            taskItem.classList.remove('dragging', 'reorder-dragging');
        }
        this.draggedTask = null;
        this.reorderDraggedTaskId = null;
        document.querySelectorAll('.drag-over, .reorder-over, .reorder-over-top, .reorder-over-bottom').forEach(el => {
            el.classList.remove('drag-over', 'reorder-over', 'reorder-over-top', 'reorder-over-bottom');
        });
        
        // Remove body class
        document.body.classList.remove('is-dragging-task');
    },

    handleDragOver(event) {
        // Always prevent default to allow drop
        event.preventDefault();
        event.stopPropagation();
        
        // Try to set dropEffect, but don't fail if it doesn't work
        try {
            event.dataTransfer.dropEffect = 'move';
        } catch(e) {
            // Some browsers don't allow setting dropEffect
        }
        
        event.currentTarget.classList.add('drag-over');
    },

    handleDragLeave(event) {
        event.currentTarget.classList.remove('drag-over');
    },

    async handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('drag-over');

        const cell = event.currentTarget;

        // Handle moving existing scheduled task
        if (this.draggedScheduled) {
            await this.moveScheduledTask(this.draggedScheduled, cell);
            this.justDragged = true;
            return;
        }

        // Handle adding new task
        if (this.draggedTask) {
            await this.scheduleTaskToCell(this.draggedTask, cell);
        }
    },

    // Touch events for mobile
    handleTouchStart(event) {
        const taskItem = event.currentTarget;
        this.draggedTask = this.tasks.find(t => t.id === taskItem.dataset.taskId);
        this.touchStartTime = Date.now();
        this.touchStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    },

    handleTouchMove(event) {
        if (!this.draggedTask) return;

        const touch = event.touches[0];
        const moveDistance = Math.sqrt(
            Math.pow(touch.clientX - this.touchStartPos.x, 2) +
            Math.pow(touch.clientY - this.touchStartPos.y, 2)
        );

        if (moveDistance > 10) {
            event.preventDefault();

            // Create ghost element
            if (!this.dragGhost) {
                const taskItem = event.currentTarget;
                this.dragGhost = taskItem.cloneNode(true);
                this.dragGhost.classList.add('drag-ghost');
                document.body.appendChild(this.dragGhost);
            }

            this.dragGhost.style.left = `${touch.clientX - 50}px`;
            this.dragGhost.style.top = `${touch.clientY - 20}px`;

            // Highlight cell under touch
            const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            if (elemBelow?.classList.contains('grid-cell')) {
                elemBelow.classList.add('drag-over');
            }
        }
    },

    handleTouchEnd(event) {
        if (this.dragGhost) {
            this.dragGhost.remove();
            this.dragGhost = null;
        }

        const touch = event.changedTouches[0];
        const cell = document.elementFromPoint(touch.clientX, touch.clientY);
        
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));

        if (cell?.classList.contains('grid-cell') && this.draggedTask) {
            this.scheduleTaskToCell(this.draggedTask, cell);
        }

        this.draggedTask = null;
    },

    handleTouchDrop(event, cell) {
        // This is called if touch ends on a cell
        if (this.draggedTask) {
            this.scheduleTaskToCell(this.draggedTask, cell);
        }
    },

    handleCellClick(event, cell) {
        // On mobile, if no task is being dragged, show quick add
        if (!this.isMobile || this.draggedTask) return;
        
        // Store the selected cell for later use
        this.selectedCell = cell;
        
        // If there are tasks, show the task panel for selection
        if (this.tasks.length > 0) {
            this.pendingCellSchedule = cell;
            this.toggleMobileTaskPanel();
        } else {
            // No tasks yet, open task creation modal
            this.openTaskModal();
        }
    },

    async scheduleTaskToCell(task, cell) {
        const dayIndex = parseInt(cell.dataset.day);
        const time = cell.dataset.time;

        const scheduleDate = new Date(this.currentWeekStart);
        scheduleDate.setDate(scheduleDate.getDate() + dayIndex);

        // Adjust date if time is before 5:00 (belongs to next calendar day)
        const [hours] = time.split(':').map(Number);
        if (hours < this.dayStartHour) {
            scheduleDate.setDate(scheduleDate.getDate() + 1);
        }

        // Use local date format to avoid timezone issues
        const dateStr = this.formatDateLocal(scheduleDate);

        const scheduledTask = {
            taskId: task.id,
            date: dateStr,
            startTime: time,
            duration: task.defaultDuration,
            status: 'pending'
        };

        try {
            const saved = await DB.addScheduledTask(scheduledTask);
            this.schedule.push(saved);
            this.renderSingleScheduledTask(saved);
            this.showNotification(`"${task.name}" pianificato!`, 'success');
        } catch (error) {
            console.error('Failed to schedule task:', error);
            this.showNotification('Errore nel salvataggio', 'error');
        }
    },

    // =====================================
    // Task Management
    // =====================================

    openTaskModal() {
        document.getElementById('task-modal').classList.add('open');
        document.getElementById('task-form').reset();
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.category-btn[data-category="personal"]').classList.add('selected');
        document.getElementById('duration-group').style.display = 'block';
        document.getElementById('task-autocomplete').innerHTML = '';
        this.selectedExistingTask = null;
        document.getElementById('task-name').focus();
    },

    closeTaskModal() {
        document.getElementById('task-modal').classList.remove('open');
        this.selectedExistingTask = null;
    },

    handleTaskNameInput(e) {
        const query = e.target.value.trim().toLowerCase();
        const autocompleteEl = document.getElementById('task-autocomplete');
        const durationGroup = document.getElementById('duration-group');
        
        if (query.length < 1) {
            autocompleteEl.innerHTML = '';
            durationGroup.style.display = 'block';
            this.selectedExistingTask = null;
            return;
        }

        const matches = this.tasks.filter(t => 
            t.name.toLowerCase().includes(query)
        ).slice(0, 5);

        if (matches.length === 0) {
            autocompleteEl.innerHTML = '';
            durationGroup.style.display = 'block';
            this.selectedExistingTask = null;
            return;
        }

        autocompleteEl.innerHTML = matches.map(task => {
            const cat = this.categories[task.category] || this.categories.other;
            return `
                <div class="autocomplete-item" data-task-id="${task.id}">
                    <span class="ac-icon">${cat.icon}</span>
                    <span class="ac-name">${this.escapeHtml(task.name)}</span>
                    <span class="ac-duration">${task.defaultDuration}m</span>
                </div>
            `;
        }).join('');

        autocompleteEl.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('click', () => this.selectExistingTask(item.dataset.taskId));
        });
    },

    selectExistingTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.selectedExistingTask = task;
        document.getElementById('task-name').value = task.name;
        document.getElementById('task-autocomplete').innerHTML = '';
        document.getElementById('duration-group').style.display = 'none';
        
        // Select the category
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector(`.category-btn[data-category="${task.category}"]`)?.classList.add('selected');
    },

    selectCategory(btn) {
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    },

    async handleTaskSubmit(event) {
        event.preventDefault();

        // If existing task selected, just close modal - task already exists
        if (this.selectedExistingTask) {
            this.closeTaskModal();
            this.showNotification(`Task "${this.selectedExistingTask.name}" già esistente`, 'info');
            return;
        }

        const name = document.getElementById('task-name').value.trim();
        const category = document.querySelector('.category-btn.selected')?.dataset.category || 'other';
        const duration = parseInt(document.getElementById('task-duration').value);

        if (!name) {
            this.showNotification('Inserisci un nome per il task', 'error');
            return;
        }

        // Check if task with same name exists
        const existing = this.tasks.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            this.showNotification(`Task "${name}" già esistente`, 'warning');
            return;
        }

        const task = {
            name,
            category,
            defaultDuration: duration
        };

        try {
            const saved = await DB.addTask(task);
            this.tasks.push(saved);
            this.renderTaskList();
            this.renderFilters();
            this.closeTaskModal();
            this.showNotification(`Task "${name}" creato!`, 'success');
        } catch (error) {
            console.error('Failed to save task:', error);
            this.showNotification('Errore nel salvataggio', 'error');
        }
    },

    async deleteTask(taskId, event) {
        event?.stopPropagation();
        
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const confirmed = await this.showConfirm({
            icon: '🗑️',
            title: 'Elimina task',
            message: `Vuoi eliminare "${task.name}"?`,
            confirmText: 'Elimina',
            cancelText: 'Annulla',
            variant: 'danger'
        });

        if (!confirmed) return;

        try {
            await DB.deleteTask(taskId);
            this.tasks = this.tasks.filter(t => t.id !== taskId);
            this.renderFilters();
            this.renderTaskList();
            this.showNotification('Task eliminato', 'success');
        } catch (error) {
            console.error('Failed to delete task:', error);
            this.showNotification('Errore nell\'eliminazione', 'error');
        }
    },

    filterTasks(filter) {
        this.selectedFilter = filter;
        this.renderFilters();
        this.renderTaskList();
        this.updateFilterButton();
        
        // Show task list after selecting filter
        document.getElementById('task-panel')?.classList.add('list-visible');
        
        // Close dropdown
        document.getElementById('filter-dropdown')?.classList.remove('open');
    },

    renderFilters() {
        const menuContainer = document.getElementById('filter-dropdown-menu');
        if (!menuContainer) return;

        // Count tasks per category
        const categoryCounts = {};
        this.tasks.forEach(t => {
            categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
        });

        const categoryOrder = ['work', 'health', 'home', 'personal', 'social', 'other'];
        const usedCategories = categoryOrder.filter(cat => categoryCounts[cat]);

        // Build dropdown options
        let html = `
            <div class="filter-option ${this.selectedFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="App.filterTasks('all')">
                <span class="option-icon">📋</span>
                <span class="option-name">Tutti</span>
                <span class="option-count">${this.tasks.length}</span>
            </div>
        `;
        
        for (const cat of usedCategories) {
            const catConfig = this.categories[cat];
            const count = categoryCounts[cat];
            html += `
                <div class="filter-option ${this.selectedFilter === cat ? 'active' : ''}" data-filter="${cat}" onclick="App.filterTasks('${cat}')">
                    <span class="option-icon">${catConfig.icon}</span>
                    <span class="option-name">${catConfig.name}</span>
                    <span class="option-count">${count}</span>
                </div>
            `;
        }

        menuContainer.innerHTML = html;
        this.updateFilterButton();

        // If current filter is now empty, reset to 'all'
        if (this.selectedFilter !== 'all' && !categoryCounts[this.selectedFilter]) {
            this.filterTasks('all');
        }
    },

    toggleFilterDropdown() {
        const dropdown = document.getElementById('filter-dropdown');
        dropdown?.classList.toggle('open');
    },

    updateFilterButton() {
        const currentEl = document.getElementById('filter-current');
        const countEl = document.getElementById('task-count');
        const panel = document.getElementById('task-panel');
        
        if (currentEl) {
            // If list is not visible yet, show prompt
            if (!panel?.classList.contains('list-visible')) {
                currentEl.textContent = 'Seleziona categoria';
            } else if (this.selectedFilter === 'all') {
                currentEl.textContent = 'Tutti';
            } else {
                const cat = this.categories[this.selectedFilter];
                currentEl.textContent = cat ? `${cat.icon} ${cat.name}` : 'Tutti';
            }
        }
        
        if (countEl) {
            countEl.textContent = this.tasks.length;
        }
    },

    // Task Panel Functions
    toggleTaskPanel() {
        const panel = document.getElementById('task-panel');
        const wasExpanded = panel.classList.contains('expanded');
        panel.classList.toggle('expanded');
        
        // If collapsing, also hide the list
        if (wasExpanded) {
            panel.classList.remove('list-visible');
            this.updateFilterButton();
        }
    },

    expandTaskPanel() {
        document.getElementById('task-panel').classList.add('expanded');
    },

    collapseTaskPanel() {
        document.getElementById('task-panel').classList.remove('expanded');
    },

    handleTaskSearch(e) {
        const query = e.target.value.trim().toLowerCase();
        this.searchQuery = query;
        this.renderTaskList();
    },

    // =====================================
    // Scheduled Task Management
    // =====================================

    openDetailModal(scheduled) {
        this.selectedScheduledTask = scheduled;
        const task = this.tasks.find(t => t.id === scheduled.taskId);
        if (!task) return;

        const cat = this.categories[task.category] || this.categories.other;
        const endTime = this.addMinutesToTime(scheduled.startTime, scheduled.duration);

        document.getElementById('detail-title').textContent = task.name;
        document.getElementById('detail-content').innerHTML = `
            <div class="detail-info">
                <div class="detail-row">
                    <span class="label">Categoria</span>
                    <span>${cat.icon} ${cat.name}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Data</span>
                    <span>${this.formatDateDisplay(scheduled.date)}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Orario pianificato</span>
                    <span>${scheduled.startTime} - ${endTime}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Durata pianificata</span>
                    <span>${scheduled.duration} minuti</span>
                </div>
                <div class="detail-row">
                    <span class="label">Stato</span>
                    <span>${this.getStatusLabel(scheduled.status)}</span>
                </div>
            </div>
        `;

        // Pre-fill actual times with planned times
        const actualStartInput = document.getElementById('actual-start');
        const actualEndInput = document.getElementById('actual-end');
        const durationDisplay = document.getElementById('actual-duration-display');
        
        actualStartInput.value = scheduled.startTime;
        actualEndInput.value = endTime;
        durationDisplay.textContent = '';

        // Add listeners for time changes
        const updateDurationDisplay = () => {
            const start = actualStartInput.value;
            const end = actualEndInput.value;
            
            if (start && end) {
                const actualDuration = this.calculateDuration(start, end);
                const diff = actualDuration - scheduled.duration;
                
                if (actualDuration > 0) {
                    let text = `Durata effettiva: ${actualDuration} minuti`;
                    let className = '';
                    
                    if (diff > 5) {
                        text += ` (+${diff} min)`;
                        className = 'warning';
                    } else if (diff < -5) {
                        text += ` (${diff} min)`;
                        className = 'success';
                    }
                    
                    durationDisplay.textContent = text;
                    durationDisplay.className = `actual-duration-display ${className}`;
                } else {
                    durationDisplay.textContent = '';
                }
            }
        };

        actualStartInput.addEventListener('change', updateDurationDisplay);
        actualEndInput.addEventListener('change', updateDurationDisplay);

        // Show/hide time inputs based on status
        const timeInputs = document.getElementById('detail-time-inputs');
        if (scheduled.status === 'completed' || scheduled.status === 'skipped') {
            timeInputs.style.display = 'none';
        } else {
            timeInputs.style.display = 'block';
        }

        // Update buttons based on status
        const completeBtn = document.getElementById('mark-complete');
        const skipBtn = document.getElementById('mark-skipped');

        if (scheduled.status === 'completed') {
            completeBtn.disabled = true;
            completeBtn.textContent = '✓ Completato';
        } else {
            completeBtn.disabled = false;
            completeBtn.textContent = '✓ Completa';
        }

        if (scheduled.status === 'skipped') {
            skipBtn.disabled = true;
        } else {
            skipBtn.disabled = false;
        }

        document.getElementById('detail-modal').classList.add('open');
    },

    formatDateDisplay(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('it-IT', { 
            weekday: 'long', 
            day: 'numeric', 
            month: 'long' 
        });
    },

    calculateDuration(startTime, endTime) {
        const startMinutes = this.timeToMinutes(startTime);
        let endMinutes = this.timeToMinutes(endTime);
        
        // Handle overnight tasks
        if (endMinutes < startMinutes) {
            endMinutes += 24 * 60;
        }
        
        return endMinutes - startMinutes;
    },

    timeToMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    },

    closeDetailModal() {
        document.getElementById('detail-modal').classList.remove('open');
        this.selectedScheduledTask = null;
    },

    getStatusLabel(status) {
        const labels = {
            pending: '⏳ In attesa',
            completed: '✅ Completato',
            skipped: '⏭️ Saltato'
        };
        return labels[status] || status;
    },

    async markTaskComplete() {
        if (!this.selectedScheduledTask) return;

        const scheduled = this.selectedScheduledTask;
        const task = this.tasks.find(t => t.id === scheduled.taskId);

        // Get actual times from inputs
        const actualStart = document.getElementById('actual-start').value;
        const actualEnd = document.getElementById('actual-end').value;
        
        let actualDuration = scheduled.duration; // Default to planned
        let actualStartTime = scheduled.startTime;
        let actualEndTime = this.addMinutesToTime(scheduled.startTime, scheduled.duration);
        let usedActualTimes = false;
        
        if (actualStart && actualEnd) {
            const calculatedDuration = this.calculateDuration(actualStart, actualEnd);
            
            if (calculatedDuration <= 0) {
                this.showNotification('Orario fine deve essere dopo orario inizio', 'error');
                return;
            }
            
            // Check if user modified the times
            if (actualStart !== scheduled.startTime || actualEnd !== this.addMinutesToTime(scheduled.startTime, scheduled.duration)) {
                actualDuration = calculatedDuration;
                actualStartTime = actualStart;
                actualEndTime = actualEnd;
                usedActualTimes = true;
            }
        }

        // Update scheduled task
        scheduled.status = 'completed';
        scheduled.completedAt = new Date().toISOString();
        scheduled.actualStartTime = actualStartTime;
        scheduled.actualEndTime = actualEndTime;
        scheduled.actualDuration = actualDuration;
        await DB.updateScheduledTask(scheduled);

        // Add to history with actual data
        await DB.addHistoryEntry({
            taskId: scheduled.taskId,
            date: scheduled.date,
            startTime: actualStartTime,
            endTime: actualEndTime,
            plannedDuration: scheduled.duration,
            actualDuration: actualDuration,
            status: 'completed'
        });

        this.renderScheduledTasks();
        this.closeDetailModal();
        
        // Show feedback about duration
        const diff = actualDuration - scheduled.duration;
        let message = `"${task?.name}" completato!`;
        
        if (usedActualTimes) {
            if (diff > 5) {
                message += ` (+${diff} min del previsto)`;
            } else if (diff < -5) {
                message += ` (${Math.abs(diff)} min in meno!)`;
            }
            this.showNotification(message, 'success');
        } else {
            this.showNotification(message + ' 💡 Inserisci i tempi reali per statistiche migliori', 'success');
        }

        await this.refreshInsights();
    },

    async markTaskSkipped() {
        if (!this.selectedScheduledTask) return;

        const scheduled = this.selectedScheduledTask;
        const task = this.tasks.find(t => t.id === scheduled.taskId);

        scheduled.status = 'skipped';
        await DB.updateScheduledTask(scheduled);

        // Add to history
        await DB.addHistoryEntry({
            taskId: scheduled.taskId,
            date: scheduled.date,
            startTime: scheduled.startTime,
            plannedDuration: scheduled.duration,
            status: 'skipped'
        });

        this.renderScheduledTasks();
        this.closeDetailModal();
        this.showNotification(`"${task?.name}" saltato`, 'success');

        await this.refreshInsights();
    },

    async removeScheduledTask() {
        if (!this.selectedScheduledTask) return;

        const confirmed = await this.showConfirm({
            icon: '📅',
            title: 'Rimuovi dal planning',
            message: 'Vuoi rimuovere questo task dalla pianificazione?',
            confirmText: 'Rimuovi',
            cancelText: 'Annulla',
            variant: 'warning'
        });

        if (!confirmed) return;

        await DB.deleteScheduledTask(this.selectedScheduledTask.id);
        this.schedule = this.schedule.filter(s => s.id !== this.selectedScheduledTask.id);
        
        this.renderScheduledTasks();
        this.closeDetailModal();
        this.showNotification('Task rimosso dal planning', 'success');
    },

    // =====================================
    // Insights
    // =====================================

    async refreshInsights() {
        const result = await Algorithm.analyze();
        this.insights = result.insights;
        this.renderInsights();
    },

    async suggestRoutine() {
        // Get the date for suggestion (current day on mobile, or selected day)
        const targetDate = new Date(this.currentWeekStart);
        targetDate.setDate(targetDate.getDate() + this.currentDayIndex);
        const dayOfWeek = targetDate.getDay();
        
        // Check if we have enough history
        const history = await DB.getAllHistory();
        if (history.length < 5) {
            this.showNotification('Completa almeno 5 task per ricevere suggerimenti', 'info');
            return;
        }

        // Get routine suggestion from algorithm
        const suggestion = await Algorithm.generateRoutineSuggestion(dayOfWeek, this.tasks);
        
        if (!suggestion || suggestion.length === 0) {
            this.showNotification('Non ho ancora abbastanza dati per questo giorno', 'info');
            return;
        }

        // Show confirmation dialog
        const taskNames = suggestion.map(s => {
            const task = this.tasks.find(t => t.id === s.taskId);
            return `• ${task?.name || 'Task'} alle ${s.suggestedTime}`;
        }).join('\n');

        const confirmed = await this.showConfirm({
            icon: '🪄',
            title: 'Routine suggerita',
            message: `Basandomi sulle tue abitudini, suggerisco:\n\n${taskNames}\n\nVuoi aggiungere questi task?`,
            confirmText: 'Aggiungi',
            cancelText: 'Annulla',
            variant: 'info'
        });

        if (!confirmed) return;

        // Add suggested tasks to schedule
        const dateStr = this.formatDateLocal(targetDate);
        let added = 0;

        for (const item of suggestion) {
            const task = this.tasks.find(t => t.id === item.taskId);
            if (!task) continue;

            // Check if already scheduled at this time
            const existing = this.schedule.find(s => 
                s.date === dateStr && 
                s.taskId === item.taskId &&
                s.startTime === item.suggestedTime
            );
            
            if (existing) continue;

            const scheduledTask = {
                taskId: item.taskId,
                date: dateStr,
                startTime: item.suggestedTime,
                duration: task.defaultDuration,
                status: 'pending'
            };

            try {
                const saved = await DB.addScheduledTask(scheduledTask);
                this.schedule.push(saved);
                added++;
            } catch (error) {
                console.error('Failed to schedule suggested task:', error);
            }
        }

        this.renderScheduledTasks();
        this.showNotification(`${added} task aggiunti alla routine!`, 'success');
    },

    toggleInsightsPanel() {
        const panel = document.getElementById('insights-panel');
        const overlay = document.getElementById('mobile-overlay');
        const isOpen = panel.classList.contains('open');
        
        if (isOpen) {
            panel.classList.remove('open');
            if (this.isMobile) {
                overlay.classList.remove('show');
            }
        } else {
            // Close other panels first on mobile
            if (this.isMobile) {
                document.getElementById('task-panel')?.classList.remove('expanded');
                overlay.classList.add('show');
            }
            panel.classList.add('open');
        }
    },

    // =====================================
    // Settings & Data Management
    // =====================================

    openSettingsModal() {
        this.updateStatsDisplay();
        document.getElementById('settings-modal').classList.add('open');
    },

    closeSettingsModal() {
        document.getElementById('settings-modal').classList.remove('open');
    },

    async updateStatsDisplay() {
        const history = await DB.getAllHistory();
        const tasks = this.tasks.length;
        const completed = history.filter(h => h.status === 'completed').length;
        const lastBackup = await DB.getLastBackupDate();

        document.getElementById('stats-summary').innerHTML = `
            <p><strong>${tasks}</strong> task creati</p>
            <p><strong>${completed}</strong> task completati nello storico</p>
            <p><strong>${history.length}</strong> voci nello storico totale</p>
            ${lastBackup ? `<p>Ultimo backup: ${new Date(lastBackup).toLocaleDateString('it-IT')}</p>` : '<p>Nessun backup effettuato</p>'}
        `;
    },

    async exportData() {
        try {
            const data = await DB.exportData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `flowday-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();

            URL.revokeObjectURL(url);
            await DB.setLastBackupDate();
            
            this.showNotification('Backup esportato!', 'success');
            this.updateStatsDisplay();
        } catch (error) {
            console.error('Export failed:', error);
            this.showNotification('Errore nell\'esportazione', 'error');
        }
    },

    async importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            const confirmed = await this.showConfirm({
                icon: '📥',
                title: 'Importa dati',
                message: 'Questo sovrascriverà tutti i dati esistenti. Vuoi continuare?',
                confirmText: 'Importa',
                cancelText: 'Annulla',
                variant: 'warning'
            });

            if (!confirmed) {
                event.target.value = '';
                return;
            }

            await DB.importData(data);
            await this.loadApp();
            
            this.showNotification('Dati importati con successo!', 'success');
            this.closeSettingsModal();
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Errore nell\'importazione. File non valido?', 'error');
        }

        event.target.value = '';
    },

    async clearAllData() {
        const firstConfirm = await this.showConfirm({
            icon: '⚠️',
            title: 'Elimina tutti i dati',
            message: 'Stai per eliminare TUTTI i dati. Questa azione è irreversibile!',
            confirmText: 'Continua',
            cancelText: 'Annulla',
            variant: 'danger'
        });

        if (!firstConfirm) return;

        const secondConfirm = await this.showConfirm({
            icon: '🗑️',
            title: 'Conferma eliminazione',
            message: 'Sei davvero sicuro? Ti consiglio di fare un backup prima.',
            confirmText: 'Elimina tutto',
            cancelText: 'Annulla',
            variant: 'danger'
        });

        if (!secondConfirm) return;

        try {
            await DB.clearAll();
            this.tasks = [];
            this.schedule = [];
            this.insights = [];
            
            this.renderTaskList();
            this.renderScheduledTasks();
            this.renderInsights();
            
            this.showNotification('Tutti i dati sono stati eliminati', 'success');
            this.closeSettingsModal();
        } catch (error) {
            console.error('Clear failed:', error);
            this.showNotification('Errore nell\'eliminazione', 'error');
        }
    },

    async checkBackupReminder() {
        const lastBackup = await DB.getLastBackupDate();
        if (!lastBackup) return;

        const daysSinceBackup = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceBackup >= 7) {
            setTimeout(() => {
                this.showNotification('💾 È passata una settimana dall\'ultimo backup!', 'info');
            }, 3000);
        }
    },

    // =====================================
    // Onboarding
    // =====================================

    showOnboarding() {
        document.getElementById('onboarding-modal').classList.add('open');
    },

    async completeOnboarding() {
        await DB.completeOnboarding();
        document.getElementById('onboarding-modal').classList.remove('open');
        await this.loadApp();
    },

    importFromOnboarding() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                await DB.importData(data);
                await DB.completeOnboarding();
                document.getElementById('onboarding-modal').classList.remove('open');
                await this.loadApp();
                this.showNotification('Dati importati con successo!', 'success');
            } catch (error) {
                console.error('Import failed:', error);
                this.showNotification('Errore nell\'importazione', 'error');
            }
        };
        input.click();
    },

    // =====================================
    // Mobile
    // =====================================

    toggleMobileTaskPanel() {
        const panel = document.getElementById('task-panel');
        const overlay = document.getElementById('mobile-overlay');
        const isOpen = panel.classList.contains('expanded');
        
        if (isOpen) {
            panel.classList.remove('expanded');
            overlay.classList.remove('show');
        } else {
            // Close other panels first
            document.getElementById('insights-panel')?.classList.remove('open');
            panel.classList.add('expanded');
            overlay.classList.add('show');
        }
    },

    closeMobileSheets() {
        document.getElementById('task-panel')?.classList.remove('expanded');
        document.getElementById('insights-panel')?.classList.remove('open');
        document.getElementById('mobile-overlay')?.classList.remove('show');
        this.pendingCellSchedule = null;
    },

    // =====================================
    // Theme Management
    // =====================================

    async initTheme() {
        const savedTheme = await DB.getSetting('theme', 'dark');
        this.applyTheme(savedTheme);
    },

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        // Update meta theme-color for mobile browsers
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.setAttribute('content', theme === 'light' ? '#f5f5f7' : '#0a0a0f');
        }
    },

    async toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        this.applyTheme(newTheme);
        await DB.setSetting('theme', newTheme);
        
        this.showNotification(`Tema ${newTheme === 'dark' ? 'scuro' : 'chiaro'} attivato`, 'success');
    },

    // =====================================
    // Utilities
    // =====================================

    addMinutesToTime(time, minutes) {
        const [h, m] = time.split(':').map(Number);
        const total = h * 60 + m + minutes;
        const newH = Math.floor(total / 60) % 24;
        const newM = total % 60;
        return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
    },

    formatDateLocal(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    showNotification(message, type = 'info') {
        const bar = document.getElementById('notification-bar');
        const iconEl = document.getElementById('notification-icon');
        const textEl = document.getElementById('notification-text');
        
        // Set icon based on type
        const icons = {
            success: '✓',
            error: '✕',
            info: 'ℹ'
        };
        
        iconEl.textContent = icons[type] || icons.info;
        textEl.textContent = message;
        bar.className = `notification-bar ${type} show`;

        // Auto-hide after 4 seconds
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        this.notificationTimeout = setTimeout(() => {
            this.hideNotification();
        }, 4000);
    },

    hideNotification() {
        const bar = document.getElementById('notification-bar');
        bar.classList.remove('show');
    },

    // Custom confirm dialog
    showConfirm(options) {
        return new Promise((resolve) => {
            const dialog = document.getElementById('confirm-dialog');
            const iconEl = document.getElementById('confirm-icon');
            const titleEl = document.getElementById('confirm-title');
            const messageEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('confirm-ok');
            const cancelBtn = document.getElementById('confirm-cancel');

            // Set content
            iconEl.textContent = options.icon || '⚠️';
            titleEl.textContent = options.title || 'Conferma';
            messageEl.textContent = options.message || 'Sei sicuro?';
            okBtn.textContent = options.confirmText || 'Conferma';
            cancelBtn.textContent = options.cancelText || 'Annulla';

            // Set variant
            dialog.className = `confirm-dialog ${options.variant || 'warning'} open`;

            // Set button style based on variant
            okBtn.className = options.variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

            // Handle responses
            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const handleBackdrop = (e) => {
                if (e.target === dialog) {
                    handleCancel();
                }
            };

            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                } else if (e.key === 'Enter') {
                    handleConfirm();
                }
            };

            const cleanup = () => {
                dialog.classList.remove('open');
                okBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                dialog.removeEventListener('click', handleBackdrop);
                document.removeEventListener('keydown', handleKeydown);
            };

            okBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            dialog.addEventListener('click', handleBackdrop);
            document.addEventListener('keydown', handleKeydown);
        });
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
