/**
 * FlowDay - Learning Algorithm Module
 * Analyzes user patterns and provides smart suggestions
 */

const Algorithm = {
    // Minimum data requirements for different analyses
    MIN_HISTORY_FOR_PATTERNS: 5,
    MIN_HISTORY_FOR_SUGGESTIONS: 10,
    MIN_DAYS_FOR_WEEKLY_PATTERNS: 14,

    /**
     * Analyze all data and generate insights
     */
    async analyze() {
        const tasks = await DB.getAllTasks();
        const history = await DB.getAllHistory();
        const schedule = await DB.getAll(DB.stores.schedule);
        const existingPatterns = await DB.getAllPatterns();
        
        // Load special periods
        const specialPeriods = await DB.getSetting('specialPeriods') || [];
        const periodCategories = await DB.getSetting('periodCategories') || [];

        const insights = [];

        // Only analyze if we have enough data
        if (history.length < this.MIN_HISTORY_FOR_PATTERNS) {
            return {
                insights: [{
                    type: 'info',
                    title: 'Raccolta dati',
                    text: `Continua a usare l'app! Ho bisogno di almeno ${this.MIN_HISTORY_FOR_PATTERNS} task completati per iniziare a darti suggerimenti. Attualmente: ${history.length}`,
                    priority: 0
                }],
                patterns: existingPatterns
            };
        }

        // Separate history into normal days and special period days
        const { normalHistory, periodHistory, periodBreakdown } = this.separateHistoryByPeriods(history, specialPeriods, periodCategories);

        // Analyze normal routine (days without special periods)
        const timePatterns = this.analyzeTimePatterns(normalHistory, tasks);
        const durationPatterns = this.analyzeDurationPatterns(normalHistory, tasks);
        const frequencyPatterns = this.analyzeFrequencyPatterns(normalHistory, tasks);
        const sequencePatterns = this.analyzeSequencePatterns(normalHistory, tasks);
        const completionPatterns = this.analyzeCompletionPatterns(normalHistory, tasks);

        // Generate insights from patterns
        insights.push(...this.generateTimeInsights(timePatterns, tasks));
        insights.push(...this.generateDurationInsights(durationPatterns, tasks));
        insights.push(...this.generateFrequencyInsights(frequencyPatterns, tasks));
        insights.push(...this.generateSequenceInsights(sequencePatterns, tasks));
        insights.push(...this.generateCompletionInsights(completionPatterns, tasks));
        insights.push(...this.generateOptimizationInsights(normalHistory, schedule, tasks));

        // Add insight about period statistics if available
        if (periodHistory.length > 0) {
            insights.push({
                type: 'info',
                title: 'Periodi speciali',
                text: `${periodHistory.length} task completati durante periodi speciali (esclusi dalle statistiche normali)`,
                priority: 1
            });
        }

        // Analyze patterns for each period category (if enough data)
        const periodPatterns = [];
        for (const [categoryId, categoryHistory] of Object.entries(periodBreakdown)) {
            if (categoryHistory.length >= 3) {
                const category = periodCategories.find(c => c.id === categoryId);
                const categoryName = category?.name || 'Periodo speciale';
                
                // Generate period-specific patterns
                const periodTimePatterns = this.analyzeTimePatterns(categoryHistory, tasks);
                for (const p of periodTimePatterns) {
                    p.periodCategory = categoryId;
                    p.periodCategoryName = categoryName;
                    p.id = `${p.id}_period_${categoryId}`;
                    periodPatterns.push(p);
                }
            }
        }

        // Save patterns to DB
        const allPatterns = [
            ...timePatterns,
            ...durationPatterns,
            ...frequencyPatterns,
            ...sequencePatterns,
            ...periodPatterns
        ];

        for (const pattern of allPatterns) {
            await DB.savePattern(pattern);
        }

        // Sort insights by priority
        insights.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        return {
            insights: insights.slice(0, 10), // Return top 10 insights
            patterns: allPatterns
        };
    },

    /**
     * Separate history entries into normal days and special period days
     */
    separateHistoryByPeriods(history, specialPeriods, periodCategories) {
        const normalHistory = [];
        const periodHistory = [];
        const periodBreakdown = {}; // { categoryId: [entries] }

        for (const entry of history) {
            const entryDate = entry.date;
            let foundPeriod = null;

            // Check if entry falls within any special period
            for (const period of specialPeriods) {
                if (entryDate >= period.startDate && entryDate <= period.endDate) {
                    foundPeriod = period;
                    break;
                }
            }

            if (foundPeriod) {
                periodHistory.push(entry);
                
                // Group by category
                if (!periodBreakdown[foundPeriod.categoryId]) {
                    periodBreakdown[foundPeriod.categoryId] = [];
                }
                periodBreakdown[foundPeriod.categoryId].push(entry);
            } else {
                normalHistory.push(entry);
            }
        }

        return { normalHistory, periodHistory, periodBreakdown };
    },

    /**
     * Analyze what times users typically do tasks
     */
    analyzeTimePatterns(history, tasks) {
        const patterns = [];
        const taskTimeMap = {};

        // Group history by task
        for (const entry of history) {
            if (entry.status !== 'completed') continue;
            
            if (!taskTimeMap[entry.taskId]) {
                taskTimeMap[entry.taskId] = [];
            }
            taskTimeMap[entry.taskId].push({
                time: entry.startTime,
                dayOfWeek: new Date(entry.date).getDay()
            });
        }

        // Analyze each task
        for (const [taskId, times] of Object.entries(taskTimeMap)) {
            if (times.length < 3) continue;

            const task = tasks.find(t => t.id === taskId);
            if (!task) continue;

            // Calculate average time
            const timeMinutes = times.map(t => this.timeToMinutes(t.time));
            const avgMinutes = timeMinutes.reduce((a, b) => a + b, 0) / timeMinutes.length;
            const stdDev = this.standardDeviation(timeMinutes);

            // Check if time is consistent (low std dev)
            if (stdDev < 60) { // Within 1 hour variance
                patterns.push({
                    id: `time_${taskId}`,
                    type: 'time',
                    taskId: taskId,
                    taskName: task.name,
                    averageTime: this.minutesToTime(avgMinutes),
                    variance: stdDev,
                    sampleSize: times.length,
                    confidence: Math.min(times.length / 10, 1)
                });
            }

            // Check for day-specific patterns
            const dayGroups = this.groupBy(times, 'dayOfWeek');
            for (const [day, dayTimes] of Object.entries(dayGroups)) {
                if (dayTimes.length >= 2) {
                    const dayMinutes = dayTimes.map(t => this.timeToMinutes(t.time));
                    const dayAvg = dayMinutes.reduce((a, b) => a + b, 0) / dayMinutes.length;
                    const dayStdDev = this.standardDeviation(dayMinutes);

                    if (dayStdDev < 45) { // Tighter variance for specific days
                        patterns.push({
                            id: `time_${taskId}_day${day}`,
                            type: 'time_day',
                            taskId: taskId,
                            taskName: task.name,
                            dayOfWeek: parseInt(day),
                            averageTime: this.minutesToTime(dayAvg),
                            variance: dayStdDev,
                            sampleSize: dayTimes.length,
                            confidence: Math.min(dayTimes.length / 5, 1)
                        });
                    }
                }
            }
        }

        return patterns;
    },

    /**
     * Analyze how long tasks actually take vs planned
     */
    analyzeDurationPatterns(history, tasks) {
        const patterns = [];
        const taskDurationMap = {};

        for (const entry of history) {
            if (entry.status !== 'completed' || !entry.actualDuration) continue;

            if (!taskDurationMap[entry.taskId]) {
                taskDurationMap[entry.taskId] = [];
            }
            taskDurationMap[entry.taskId].push({
                planned: entry.plannedDuration,
                actual: entry.actualDuration
            });
        }

        for (const [taskId, durations] of Object.entries(taskDurationMap)) {
            if (durations.length < 3) continue;

            const task = tasks.find(t => t.id === taskId);
            if (!task) continue;

            const actualAvg = durations.reduce((a, b) => a + b.actual, 0) / durations.length;
            const plannedAvg = durations.reduce((a, b) => a + b.planned, 0) / durations.length;
            const difference = actualAvg - plannedAvg;
            const percentDiff = (difference / plannedAvg) * 100;

            patterns.push({
                id: `duration_${taskId}`,
                type: 'duration',
                taskId: taskId,
                taskName: task.name,
                averageActual: Math.round(actualAvg),
                averagePlanned: Math.round(plannedAvg),
                difference: Math.round(difference),
                percentDifference: Math.round(percentDiff),
                sampleSize: durations.length,
                confidence: Math.min(durations.length / 10, 1)
            });
        }

        return patterns;
    },

    /**
     * Analyze how often tasks are done
     */
    analyzeFrequencyPatterns(history, tasks) {
        const patterns = [];
        const taskFrequencyMap = {};

        // Get date range
        const dates = history.map(h => new Date(h.date));
        if (dates.length < 2) return patterns;

        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));
        const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)) || 1;
        const totalWeeks = totalDays / 7;

        // Count occurrences per task
        for (const entry of history) {
            if (entry.status !== 'completed') continue;

            if (!taskFrequencyMap[entry.taskId]) {
                taskFrequencyMap[entry.taskId] = {
                    count: 0,
                    days: new Set(),
                    weekdays: {}
                };
            }

            taskFrequencyMap[entry.taskId].count++;
            taskFrequencyMap[entry.taskId].days.add(entry.date);

            const dayOfWeek = new Date(entry.date).getDay();
            taskFrequencyMap[entry.taskId].weekdays[dayOfWeek] = 
                (taskFrequencyMap[entry.taskId].weekdays[dayOfWeek] || 0) + 1;
        }

        for (const [taskId, freq] of Object.entries(taskFrequencyMap)) {
            const task = tasks.find(t => t.id === taskId);
            if (!task) continue;

            const timesPerWeek = freq.count / totalWeeks;
            
            // Find preferred days
            const preferredDays = Object.entries(freq.weekdays)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([day, count]) => ({
                    day: parseInt(day),
                    count,
                    percentage: (count / freq.count) * 100
                }));

            patterns.push({
                id: `frequency_${taskId}`,
                type: 'frequency',
                taskId: taskId,
                taskName: task.name,
                totalOccurrences: freq.count,
                uniqueDays: freq.days.size,
                timesPerWeek: Math.round(timesPerWeek * 10) / 10,
                preferredDays: preferredDays,
                sampleSize: freq.count,
                confidence: Math.min(freq.count / 15, 1)
            });
        }

        return patterns;
    },

    /**
     * Analyze task sequences (what usually follows what)
     */
    analyzeSequencePatterns(history, tasks) {
        const patterns = [];
        const sequenceMap = {};

        // Sort history by date and time
        const sortedHistory = [...history]
            .filter(h => h.status === 'completed')
            .sort((a, b) => {
                const dateComp = a.date.localeCompare(b.date);
                if (dateComp !== 0) return dateComp;
                return (a.startTime || '').localeCompare(b.startTime || '');
            });

        // Find sequences within the same day
        let lastEntry = null;
        for (const entry of sortedHistory) {
            if (lastEntry && lastEntry.date === entry.date) {
                const key = `${lastEntry.taskId}_${entry.taskId}`;
                if (!sequenceMap[key]) {
                    sequenceMap[key] = {
                        fromTaskId: lastEntry.taskId,
                        toTaskId: entry.taskId,
                        count: 0,
                        avgGap: []
                    };
                }
                sequenceMap[key].count++;

                // Calculate time gap
                if (lastEntry.endTime && entry.startTime) {
                    const gap = this.timeToMinutes(entry.startTime) - this.timeToMinutes(lastEntry.endTime);
                    if (gap >= 0 && gap < 240) { // Max 4 hours gap
                        sequenceMap[key].avgGap.push(gap);
                    }
                }
            }
            lastEntry = entry;
        }

        for (const [key, seq] of Object.entries(sequenceMap)) {
            if (seq.count < 3) continue;

            const fromTask = tasks.find(t => t.id === seq.fromTaskId);
            const toTask = tasks.find(t => t.id === seq.toTaskId);
            if (!fromTask || !toTask) continue;

            const avgGap = seq.avgGap.length > 0 
                ? seq.avgGap.reduce((a, b) => a + b, 0) / seq.avgGap.length 
                : null;

            patterns.push({
                id: `sequence_${key}`,
                type: 'sequence',
                fromTaskId: seq.fromTaskId,
                fromTaskName: fromTask.name,
                toTaskId: seq.toTaskId,
                toTaskName: toTask.name,
                count: seq.count,
                averageGap: avgGap ? Math.round(avgGap) : null,
                sampleSize: seq.count,
                confidence: Math.min(seq.count / 10, 1)
            });
        }

        return patterns.sort((a, b) => b.count - a.count).slice(0, 20);
    },

    /**
     * Analyze completion rates
     */
    analyzeCompletionPatterns(history, tasks) {
        const taskStats = {};

        for (const entry of history) {
            if (!taskStats[entry.taskId]) {
                taskStats[entry.taskId] = {
                    completed: 0,
                    skipped: 0,
                    byHour: {},
                    byDay: {}
                };
            }

            if (entry.status === 'completed') {
                taskStats[entry.taskId].completed++;
            } else if (entry.status === 'skipped') {
                taskStats[entry.taskId].skipped++;
            }

            // Track by hour
            if (entry.startTime) {
                const hour = parseInt(entry.startTime.split(':')[0]);
                if (!taskStats[entry.taskId].byHour[hour]) {
                    taskStats[entry.taskId].byHour[hour] = { completed: 0, skipped: 0 };
                }
                taskStats[entry.taskId].byHour[hour][entry.status]++;
            }

            // Track by day
            const day = new Date(entry.date).getDay();
            if (!taskStats[entry.taskId].byDay[day]) {
                taskStats[entry.taskId].byDay[day] = { completed: 0, skipped: 0 };
            }
            taskStats[entry.taskId].byDay[day][entry.status]++;
        }

        return taskStats;
    },

    /**
     * Generate insights about optimal times
     */
    generateTimeInsights(patterns, tasks) {
        const insights = [];

        for (const pattern of patterns) {
            if (pattern.type === 'time' && pattern.confidence > 0.6) {
                insights.push({
                    type: 'pattern',
                    title: 'Orario abituale',
                    text: `Di solito fai "${pattern.taskName}" alle ${pattern.averageTime}. Vuoi che lo pre-pianifichi a quest'ora?`,
                    taskId: pattern.taskId,
                    priority: pattern.confidence * 5,
                    actionable: true,
                    action: {
                        type: 'suggest_time',
                        time: pattern.averageTime
                    }
                });
            }

            if (pattern.type === 'time_day' && pattern.confidence > 0.7) {
                const dayName = this.getDayName(pattern.dayOfWeek);
                insights.push({
                    type: 'pattern',
                    title: 'Pattern settimanale',
                    text: `Il ${dayName} di solito fai "${pattern.taskName}" alle ${pattern.averageTime}.`,
                    taskId: pattern.taskId,
                    priority: pattern.confidence * 6,
                    actionable: true
                });
            }
        }

        return insights;
    },

    /**
     * Generate insights about task durations
     */
    generateDurationInsights(patterns, tasks) {
        const insights = [];

        for (const pattern of patterns) {
            if (Math.abs(pattern.percentDifference) > 20 && pattern.sampleSize >= 5) {
                if (pattern.difference > 0) {
                    insights.push({
                        type: 'optimization',
                        title: 'Durata sottostimata',
                        text: `"${pattern.taskName}" ti richiede in media ${pattern.averageActual} min, ma pianifichi ${pattern.averagePlanned} min. Considera di allocare più tempo.`,
                        taskId: pattern.taskId,
                        priority: Math.min(Math.abs(pattern.percentDifference) / 10, 8),
                        actionable: true,
                        action: {
                            type: 'adjust_duration',
                            suggestedDuration: pattern.averageActual
                        }
                    });
                } else if (pattern.difference < -15) {
                    insights.push({
                        type: 'optimization',
                        title: 'Durata sovrastimata',
                        text: `Completi "${pattern.taskName}" in ${pattern.averageActual} min invece dei ${pattern.averagePlanned} pianificati. Hai ${Math.abs(pattern.difference)} min extra!`,
                        taskId: pattern.taskId,
                        priority: Math.min(Math.abs(pattern.percentDifference) / 15, 6),
                        actionable: true
                    });
                }
            }
        }

        return insights;
    },

    /**
     * Generate insights about frequency
     */
    generateFrequencyInsights(patterns, tasks) {
        const insights = [];

        for (const pattern of patterns) {
            if (pattern.preferredDays.length > 0 && pattern.preferredDays[0].percentage > 40) {
                const topDays = pattern.preferredDays
                    .filter(d => d.percentage > 25)
                    .map(d => this.getDayName(d.day))
                    .join(', ');

                if (topDays) {
                    insights.push({
                        type: 'pattern',
                        title: 'Giorni preferiti',
                        text: `"${pattern.taskName}" lo fai principalmente: ${topDays} (${Math.round(pattern.timesPerWeek)}x a settimana).`,
                        taskId: pattern.taskId,
                        priority: pattern.confidence * 4
                    });
                }
            }
        }

        return insights;
    },

    /**
     * Generate insights about sequences
     */
    generateSequenceInsights(patterns, tasks) {
        const insights = [];

        const topSequences = patterns.filter(p => p.confidence > 0.5).slice(0, 3);

        for (const seq of topSequences) {
            let text = `Dopo "${seq.fromTaskName}" di solito fai "${seq.toTaskName}"`;
            if (seq.averageGap !== null) {
                if (seq.averageGap < 15) {
                    text += ' subito dopo.';
                } else {
                    text += ` (dopo ~${seq.averageGap} min).`;
                }
            } else {
                text += '.';
            }

            insights.push({
                type: 'pattern',
                title: 'Sequenza abituale',
                text: text,
                priority: seq.confidence * 5,
                actionable: true,
                action: {
                    type: 'suggest_sequence',
                    fromTaskId: seq.fromTaskId,
                    toTaskId: seq.toTaskId,
                    gap: seq.averageGap
                }
            });
        }

        return insights;
    },

    /**
     * Generate insights about completion rates
     */
    generateCompletionInsights(completionStats, tasks) {
        const insights = [];

        for (const [taskId, stats] of Object.entries(completionStats)) {
            const total = stats.completed + stats.skipped;
            if (total < 5) continue;

            const task = tasks.find(t => t.id === taskId);
            if (!task) continue;

            const completionRate = stats.completed / total;

            // Low completion rate
            if (completionRate < 0.5 && total >= 8) {
                // Find best time
                let bestHour = null;
                let bestRate = 0;

                for (const [hour, hourStats] of Object.entries(stats.byHour)) {
                    const hourTotal = hourStats.completed + hourStats.skipped;
                    if (hourTotal >= 2) {
                        const hourRate = hourStats.completed / hourTotal;
                        if (hourRate > bestRate) {
                            bestRate = hourRate;
                            bestHour = parseInt(hour);
                        }
                    }
                }

                if (bestHour !== null && bestRate > completionRate + 0.2) {
                    insights.push({
                        type: 'optimization',
                        title: 'Orario migliore',
                        text: `"${task.name}" lo completi solo il ${Math.round(completionRate * 100)}% delle volte, ma alle ${bestHour}:00 il tasso sale al ${Math.round(bestRate * 100)}%.`,
                        taskId: taskId,
                        priority: 7,
                        actionable: true,
                        action: {
                            type: 'suggest_better_time',
                            hour: bestHour
                        }
                    });
                }

                // Find best day
                let bestDay = null;
                let bestDayRate = 0;

                for (const [day, dayStats] of Object.entries(stats.byDay)) {
                    const dayTotal = dayStats.completed + dayStats.skipped;
                    if (dayTotal >= 2) {
                        const dayRate = dayStats.completed / dayTotal;
                        if (dayRate > bestDayRate) {
                            bestDayRate = dayRate;
                            bestDay = parseInt(day);
                        }
                    }
                }

                if (bestDay !== null && bestDayRate > completionRate + 0.25) {
                    insights.push({
                        type: 'optimization',
                        title: 'Giorno migliore',
                        text: `"${task.name}": il ${this.getDayName(bestDay)} hai ${Math.round(bestDayRate * 100)}% di completamento vs ${Math.round(completionRate * 100)}% generale.`,
                        taskId: taskId,
                        priority: 6
                    });
                }
            }

            // High completion streak
            if (completionRate > 0.9 && total >= 10) {
                insights.push({
                    type: 'achievement',
                    title: 'Ottimo lavoro! 🎉',
                    text: `Hai completato "${task.name}" il ${Math.round(completionRate * 100)}% delle volte. Continua così!`,
                    taskId: taskId,
                    priority: 3
                });
            }
        }

        return insights;
    },

    /**
     * Generate general optimization insights
     */
    generateOptimizationInsights(history, schedule, tasks) {
        const insights = [];

        // Analyze gaps in schedule
        const gapAnalysis = this.analyzeScheduleGaps(schedule);
        if (gapAnalysis.averageGap > 45) {
            insights.push({
                type: 'optimization',
                title: 'Tempi morti',
                text: `Hai in media ${Math.round(gapAnalysis.averageGap)} minuti di gap tra i task. Prova a raggruppare attività simili.`,
                priority: 5
            });
        }

        // Find most productive time
        const productivityByHour = this.analyzeProductivityByHour(history);
        if (productivityByHour.bestHour !== null) {
            insights.push({
                type: 'insight',
                title: 'Fascia più produttiva',
                text: `Sei più produttivo tra le ${productivityByHour.bestHour}:00 e le ${productivityByHour.bestHour + 2}:00. Pianifica task importanti in questa fascia!`,
                priority: 6
            });
        }

        // Analyze weekend vs weekday
        const weekAnalysis = this.analyzeWeekdayVsWeekend(history);
        if (weekAnalysis.significant) {
            insights.push({
                type: 'insight',
                title: 'Pattern settimanale',
                text: weekAnalysis.message,
                priority: 4
            });
        }

        return insights;
    },

    /**
     * Pre-fill routine based on learned patterns
     * @param {number|Date} dayOrDate - Day of week (0-6) or Date object
     * @param {Array} tasks - Optional tasks array (to avoid re-fetching)
     */
    async generateRoutineSuggestion(dayOrDate, tasks = null) {
        const patterns = await DB.getAllPatterns();
        if (!tasks) {
            tasks = await DB.getAllTasks();
        }
        
        // Handle both day number and date object
        const dayOfWeek = typeof dayOrDate === 'number' 
            ? dayOrDate 
            : new Date(dayOrDate).getDay();

        const suggestions = [];

        // Get frequency patterns to know what tasks to suggest
        const frequencyPatterns = patterns.filter(p => p.type === 'frequency');
        const timePatterns = patterns.filter(p => p.type === 'time' || p.type === 'time_day');

        for (const freqPattern of frequencyPatterns) {
            // Check if this task is typically done on this day
            const dayPref = freqPattern.preferredDays?.find(d => d.day === dayOfWeek);
            if (!dayPref || dayPref.percentage < 20) continue;

            const task = tasks.find(t => t.id === freqPattern.taskId);
            if (!task) continue;

            // Find the best time for this task
            let suggestedTime = null;

            // First check day-specific time pattern
            const dayTimePattern = timePatterns.find(
                p => p.type === 'time_day' && p.taskId === freqPattern.taskId && p.dayOfWeek === dayOfWeek
            );
            if (dayTimePattern) {
                suggestedTime = dayTimePattern.averageTime;
            }

            // Fall back to general time pattern
            if (!suggestedTime) {
                const generalTimePattern = timePatterns.find(
                    p => p.type === 'time' && p.taskId === freqPattern.taskId
                );
                if (generalTimePattern) {
                    suggestedTime = generalTimePattern.averageTime;
                }
            }

            if (suggestedTime) {
                suggestions.push({
                    taskId: task.id,
                    taskName: task.name,
                    category: task.category,
                    suggestedTime: suggestedTime,
                    duration: task.defaultDuration,
                    confidence: freqPattern.confidence * (dayTimePattern ? 1.2 : 1),
                    reason: dayTimePattern 
                        ? `Di solito lo fai il ${this.getDayName(dayOfWeek)} alle ${suggestedTime}`
                        : `Orario abituale: ${suggestedTime}`
                });
            }
        }

        // Sort by time and confidence
        suggestions.sort((a, b) => {
            const timeComp = a.suggestedTime.localeCompare(b.suggestedTime);
            if (timeComp !== 0) return timeComp;
            return b.confidence - a.confidence;
        });

        return suggestions;
    },

    // =====================================
    // Helper functions
    // =====================================

    analyzeScheduleGaps(schedule) {
        const gapsByDay = {};

        for (const item of schedule) {
            if (!gapsByDay[item.date]) {
                gapsByDay[item.date] = [];
            }
            gapsByDay[item.date].push(item);
        }

        const gaps = [];
        for (const [date, items] of Object.entries(gapsByDay)) {
            const sorted = items.sort((a, b) => a.startTime.localeCompare(b.startTime));
            for (let i = 1; i < sorted.length; i++) {
                const prevEnd = this.addMinutesToTime(sorted[i - 1].startTime, sorted[i - 1].duration);
                const gap = this.timeToMinutes(sorted[i].startTime) - this.timeToMinutes(prevEnd);
                if (gap > 0 && gap < 480) {
                    gaps.push(gap);
                }
            }
        }

        return {
            averageGap: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
            totalGaps: gaps.length
        };
    },

    analyzeProductivityByHour(history) {
        const hourStats = {};

        for (const entry of history) {
            if (entry.status !== 'completed' || !entry.startTime) continue;

            const hour = parseInt(entry.startTime.split(':')[0]);
            if (!hourStats[hour]) {
                hourStats[hour] = 0;
            }
            hourStats[hour]++;
        }

        let bestHour = null;
        let maxCount = 0;

        for (const [hour, count] of Object.entries(hourStats)) {
            if (count > maxCount) {
                maxCount = count;
                bestHour = parseInt(hour);
            }
        }

        return {
            bestHour: maxCount >= 5 ? bestHour : null,
            hourStats
        };
    },

    analyzeWeekdayVsWeekend(history) {
        let weekdayCompleted = 0;
        let weekdayTotal = 0;
        let weekendCompleted = 0;
        let weekendTotal = 0;

        for (const entry of history) {
            const day = new Date(entry.date).getDay();
            const isWeekend = day === 0 || day === 6;

            if (isWeekend) {
                weekendTotal++;
                if (entry.status === 'completed') weekendCompleted++;
            } else {
                weekdayTotal++;
                if (entry.status === 'completed') weekdayCompleted++;
            }
        }

        const weekdayRate = weekdayTotal > 0 ? weekdayCompleted / weekdayTotal : 0;
        const weekendRate = weekendTotal > 0 ? weekendCompleted / weekendTotal : 0;

        const diff = Math.abs(weekdayRate - weekendRate);

        return {
            significant: diff > 0.15 && weekdayTotal >= 10 && weekendTotal >= 5,
            message: weekdayRate > weekendRate
                ? `Completi il ${Math.round((weekdayRate - weekendRate) * 100)}% in più di task nei giorni feriali.`
                : `Sei più produttivo nel weekend (+${Math.round((weekendRate - weekdayRate) * 100)}% completamenti).`
        };
    },

    timeToMinutes(time) {
        if (!time) return 0;
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    },

    minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60) % 24;
        const mins = Math.round(minutes % 60);
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    },

    addMinutesToTime(time, minutes) {
        const totalMinutes = this.timeToMinutes(time) + minutes;
        return this.minutesToTime(totalMinutes);
    },

    standardDeviation(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
    },

    groupBy(array, key) {
        return array.reduce((result, item) => {
            const keyValue = item[key];
            if (!result[keyValue]) {
                result[keyValue] = [];
            }
            result[keyValue].push(item);
            return result;
        }, {});
    },

    getDayName(dayIndex) {
        const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        return days[dayIndex];
    },

    getDayNameShort(dayIndex) {
        const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        return days[dayIndex];
    }
};
