// Tells navigateWithHistory() (in common.js) "we are on the home screen"
// whenever it records a back-history entry before opening a note.
window.getCurrentNavLocation = function () { return { view: 'menu' }; };

function rememberMenuLocation(tabName) {
    const activeTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
    if (activeTag) {
        sessionStorage.setItem('lastSelectedTag', activeTag.dataset.tagId);
    }
    if (tabName) {
        sessionStorage.setItem('lastSelectedTab', tabName);
    }
}

// Apply font size setting to scale all rem units
function applyFontSize(percentage) {
    document.documentElement.style.fontSize = percentage;
}
window.applyFontSize = applyFontSize;

// Computes, for every task in `data`, the total number of descendant
// sub-tasks (children, grandchildren, etc.), keyed by the task's own TaskId.
function getTaskIdKey(value) {
    if (value === null || typeof value === 'undefined') return null;
    const key = String(value);
    return key || null;
}

function computeSubtaskCounts(data) {
    const childrenByParentId = new Map();
    for (const t of data) {
        const parentId = t ? getTaskIdKey(t.ParentId) : null;
        if (parentId) {
            if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
            childrenByParentId.get(parentId).push(t);
        }
    }

    const counts = new Map();
    const countDescendants = (taskId, visited) => {
        if (counts.has(taskId)) return counts.get(taskId);
        if (visited.has(taskId)) return 0; // guard against a cyclical ParentId chain
        visited.add(taskId);
        const kids = childrenByParentId.get(taskId) || [];
        let total = kids.length;
        for (const kid of kids) {
            const kidTaskId = getTaskIdKey(kid.TaskId);
            if (kidTaskId) total += countDescendants(kidTaskId, visited);
        }
        counts.set(taskId, total);
        return total;
    };

    for (const t of data) {
        const taskId = t ? getTaskIdKey(t.TaskId) : null;
        if (taskId && !counts.has(taskId)) {
            countDescendants(taskId, new Set());
        }
    }
    return counts;
}

function renderSubtaskIndicator(count) {
    const label = count === 1 ? '1 sub-task' : `${count} sub-tasks`;
    return `<span class="task-subtask-indicator" title="${label}">${count}</span>`;
}

function showTab(tabName) {
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => {
        content.classList.remove('active-content');
    });

    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.classList.remove('active');
    });

    document.getElementById(tabName + '-content').classList.add('active-content');

    // Set active tab button (handle both click events and programmatic calls)
    const targetTabButton = document.querySelector(`.tab-button[data-tab-name="${tabName}"]`);
    if (targetTabButton) {
        targetTabButton.classList.add('active');
    } else if (typeof event !== 'undefined' && event.currentTarget && tabName !== 'dashboard') {
        // Fallback for click events
        event.currentTarget.classList.add('active');
    }

    // The Home nav item lives in the sidebar (styled like a tag), not the tab
    // bar, so it has its own active-state toggle.
    const homeNavItem = document.getElementById('home-nav-item');
    if (homeNavItem) {
        homeNavItem.classList.toggle('active-tag', tabName === 'dashboard');
    }

    // The Home page isn't filtered by tag, so selecting it shouldn't leave a
    // tag looking selected underneath it.
    if (tabName === 'dashboard') {
        const activeTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
        if (activeTag) activeTag.classList.remove('active-tag');
    }

    // The Home page is a distinct, standalone page — hide the Notes/Tasks/
    // Done/Decisions tab row while it's active instead of showing both at once.
    const tabNav = document.querySelector('.tab-nav');
    if (tabNav) {
        tabNav.style.display = (tabName === 'dashboard') ? 'none' : '';
    }

    // Store the selected tab in sessionStorage
    sessionStorage.setItem('lastSelectedTab', tabName);

    updateFilterPaletteToggleVisibility(tabName);

    // Reset navigation state when tab changes
    resetNavigationState();

    const activeTag = document.querySelector('.tag-item.active-tag');
    const tagIdToFilterBy = activeTag ? activeTag.dataset.tagId : 'all';

    switch (tabName) {
        case 'dashboard':
            break; // the Home page iframe loads and saves itself
        case 'home':
            loadProjectData();
            break;
        case 'notes':
            execute('loadNotesByTag', tagIdToFilterBy); // Load notes for "All Tags" by default
            break;
        case 'todo':
            execute('loadTasksByTag', tagIdToFilterBy); // Load incomplete tasks for the currently selected tag
            break;
        case 'done':
            execute('loadDoneTasksByTag', tagIdToFilterBy); // Load completed tasks for the currently selected tag
            break;
        case 'decisions':
            execute('loadDecisionsByTag', tagIdToFilterBy); // Load decisions for the currently selected tag
            break;
        case 'graph':
            loadGraphGoals(tagIdToFilterBy); // Show goal notes for the currently selected tag
            break;
    }


}

// Expose showTab to window so it can be called from HTML onclick
window.showTab = showTab;

// The filter palette applies to the notes list and the Tasks list, so its
// toggle button is only shown while one of those tabs is active.
function updateFilterPaletteToggleVisibility(tabName) {
    const filterToggle = document.getElementById('filter-palette-toggle');
    if (filterToggle) {
        filterToggle.style.display = (tabName === 'notes' || tabName === 'todo') ? '' : 'none';
    }
    const notesSortControl = document.getElementById('notes-sort-control');
    if (notesSortControl) {
        notesSortControl.classList.toggle('visible', tabName === 'notes');
        if (tabName !== 'notes') closeNotesSortMenu();
    }
}

// Which filter palette belongs to the currently active tab.
function activeFilterPaletteId() {
    const activeTabButton = document.querySelector('.tab-button.active');
    const tabName = activeTabButton ? activeTabButton.getAttribute('data-tab-name') : 'notes';
    return tabName === 'todo' ? 'todo-filter-palette' : 'notes-filter-palette';
}

function toggleFilterPalette() {
    const paletteId = activeFilterPaletteId();
    const palette = document.getElementById(paletteId);
    const toggle = document.getElementById('filter-palette-toggle');
    if (!palette || !toggle) return;
    const open = palette.classList.toggle('open');
    toggle.classList.toggle('active', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-controls', paletteId);
    if (open && paletteId === 'todo-filter-palette') {
        rebuildTasksPersonFilterOptions();
    }
    if (!open) {
        if (paletteId === 'todo-filter-palette') {
            clearTasksFilters();
        } else {
            clearNotesFilters();
        }
    }
}

// Expose toggleFilterPalette to window so it can be called from HTML onclick
window.toggleFilterPalette = toggleFilterPalette;

function updateHomeTabVisibility(show) {
    const homeTabButton = document.getElementById('home-tab-button');
    if (homeTabButton) {
        homeTabButton.style.display = show ? '' : 'none';
    }

    const tasksTabButton = document.querySelector('.tab-button[data-tab-name="todo"]');
    if (tasksTabButton) {
        tasksTabButton.style.display = show ? 'none' : '';
    }

    // If hiding the home tab and it's currently active, switch to notes
    if (!show) {
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab && activeTab.dataset.tabName === 'home') {
            showTab('notes');
        }
    } else {
        // Projects show their tasks in the Home tab instead.
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab && activeTab.dataset.tabName === 'todo') {
            showTab('home');
        }
    }
}

// =========================================================================
// Project Home Tab
// =========================================================================

let projectAutoSaveTimer = null;
let projectTaskMetricsRequest = 0;
let projectTaskMetricsTasks = [];
let projectTaskMetricsTag = null;
let projectTaskMetricsLoadingTag = null;
let projectGoalsRequest = 0;
let projectSelectedGoalId = null;
const projectTaskStateOverrides = new Map();
const PROJECT_TASK_STATE_OVERRIDE_TTL = 30000;
let projectImportanceValue = '';

function resizeProjectObjective() {
    const objectiveEl = document.getElementById('project-objective');
    if (!objectiveEl) return;
    objectiveEl.style.height = 'auto';
    objectiveEl.style.height = objectiveEl.scrollHeight + 'px';
}

function loadProjectData() {
    const activeTag = document.querySelector('#projects-list .tag-item.active-tag');
    if (!activeTag) return;
    projectSelectedGoalId = null;
    updateProjectGoalSelection();
    execute('loadProject', activeTag.dataset.tagId);
    loadTaskProgressBar(activeTag.dataset.tagId);
    // Also load goals for this project to show beneath the task progress bar
    loadProjectGoals(activeTag.dataset.tagId);

}

window.loadProjectResponse = function(data) {
    const titleEl = document.getElementById('project-title');
    const objectiveEl = document.getElementById('project-objective');
    const hiddenDeadline = document.getElementById('project-deadline');

    if (titleEl) titleEl.value = data.Title || data.title || '';
    if (objectiveEl) objectiveEl.value = data.Objective || '';
    projectImportanceValue = data.Importance || '';
    resizeProjectObjective();

    const deadline = data.Deadline || '';
    // Set hidden input
    if (hiddenDeadline) hiddenDeadline.value = deadline;

    // Keep legacy datepicker state in sync (if used elsewhere)
    setDeadlineDatepicker(deadline);
};

function saveProjectData() {
    const activeTag = document.querySelector('#projects-list .tag-item.active-tag');
    if (!activeTag) return;
    const title = encodeURIComponent(document.getElementById('project-title').value || '');
    const objective = encodeURIComponent(document.getElementById('project-objective').value || '');
    const importance = encodeURIComponent(projectImportanceValue);
    const deadline = document.getElementById('project-deadline').value || '';
    execute('saveProject', activeTag.dataset.tagId + '|' + title + '|' + objective + '|' + importance + '|' + deadline);
}

function getProjectGoalId(goal) {
    const goalId = goal && (goal.Id ?? goal.id);
    return goalId === null || typeof goalId === 'undefined' ? null : String(goalId);
}

function filterProjectTasksForGoal(tasks) {
    if (!Array.isArray(tasks)) return [];
    if (projectSelectedGoalId === null) return tasks;
    return tasks.filter(item => String(getProjectTaskNoteId(item)) === projectSelectedGoalId);
}

function updateProjectGoalSelection() {
    document.querySelectorAll('#project-goals-list .project-goal-item').forEach(item => {
        const isSelected = item.dataset.goalId === projectSelectedGoalId;
        item.classList.toggle('goal-filter-active', isSelected);
        const filterButton = item.querySelector('.goal-left');
        if (filterButton) filterButton.setAttribute('aria-pressed', String(isSelected));
    });
}

async function selectProjectGoal(goal) {
    const goalId = getProjectGoalId(goal);
    const activeProject = document.querySelector('#projects-list .tag-item.active-tag');
    if (!goalId || !activeProject) return;

    projectSelectedGoalId = projectSelectedGoalId === goalId ? null : goalId;
    updateProjectGoalSelection();

    const tagId = activeProject.dataset.tagId;
    const cachedTasks = projectTaskMetricsTag === tagId ? projectTaskMetricsTasks : undefined;
    await loadTaskProgressBar(tagId, {
        showLoading: true,
        tasks: cachedTasks,
    });
}

async function loadTaskProgressBar(tagId, options = {}) {
    const gaugeBar = document.getElementById('project-gauge-progress-bar');
    const gaugePct = document.getElementById('project-gauge-progress-pct');
    const tasksLeftEl = document.getElementById('project-gauge-tasks-left-number');
    const actionsList = document.getElementById('project-actions-list');
    const renderActions = options.renderActions !== false;
    if (!gaugeBar || !gaugePct || !tasksLeftEl) return;
    const requestId = ++projectTaskMetricsRequest;
    const shouldShowLoading = options.showLoading === true ||
        (options.showLoading !== false && projectTaskMetricsLoadingTag !== tagId);
    projectTaskMetricsLoadingTag = tagId;
    if (shouldShowLoading) {
        gaugeBar.innerHTML = '';
        gaugePct.textContent = '0%';
        tasksLeftEl.textContent = '0';
        if (renderActions && actionsList) {
            actionsList.innerHTML = '<div class="task-list-loading" aria-hidden="true"></div>';
        }
    }

    try {
        const hasProvidedTasks = Array.isArray(options.tasks);
        // Fetch directly in Tauri so the response is not also dispatched to
        // the regular Tasks tab while the project Actions list is rendering.
        let tasks = hasProvidedTasks ? options.tasks :
            window.__TAURI__ && window.__TAURI__.core
            ? await window.__TAURI__.core.invoke('load_tasks_by_tag', { tag: tagId })
            : await execute('loadTasksByTag', tagId);
        if (requestId !== projectTaskMetricsRequest) return;
        if (!hasProvidedTasks) {
            tasks = applyProjectTaskStateOverrides(tasks);
            projectTaskMetricsTasks = Array.isArray(tasks) ? tasks : [];
            projectTaskMetricsTag = tagId;
        }
        const visibleTasks = filterProjectTasksForGoal(tasks);

        if (visibleTasks.length === 0) {
            if (renderActions && actionsList) {
                await renderTaskList(visibleTasks, 'project-actions-list', null, 'No actions',
                    () => requestId === projectTaskMetricsRequest);
            }
            if (requestId !== projectTaskMetricsRequest) return;
            gaugeBar.innerHTML = '';
            gaugePct.textContent = '0%';
            tasksLeftEl.textContent = '0';
            return;
        }

        let notStarted = 0;
        let inProgress = 0;
        let completed = 0;

        for (const item of visibleTasks) {
            const line = item.task_line || item.TaskLine || '';
            const prefixMatch = line.match(/^(\s*[-\/\|]\s)/);
            if (prefixMatch) {
                const prefix = prefixMatch[0].trim();
                if (prefix === '|') completed++;
                else if (prefix === '/') inProgress++;
                else if (prefix === '-') notStarted++;
                continue;
            }

            // Fall back to TaskType for legacy rows without a task marker.
            const taskType = String(item.TaskType || item.task_type || '').toLowerCase();
            if (taskType === 'completed' || taskType === 'done') completed++;
            else if (taskType === 'in_progress') inProgress++;
            else if (taskType === 'pending' || taskType === 'todo') notStarted++;
        }

        const total = notStarted + inProgress + completed;
        if (requestId !== projectTaskMetricsRequest) return;
        if (total === 0) {
            if (renderActions && actionsList) {
                await renderTaskList(visibleTasks, 'project-actions-list', null, 'No actions',
                    () => requestId === projectTaskMetricsRequest);
            }
            if (requestId !== projectTaskMetricsRequest) return;
            gaugeBar.innerHTML = '';
            gaugePct.textContent = '0%';
            tasksLeftEl.textContent = '0';
            return;
        }

        const completedPct = (completed / total) * 100;
        const inProgressPct = (inProgress / total) * 100;
        const notStartedPct = (notStarted / total) * 100;

        gaugeBar.innerHTML =
            (completedPct > 0 ? `<div class="task-progress-segment completed" style="width:${completedPct}%;height:100%"></div>` : '') +
            (inProgressPct > 0 ? `<div class="task-progress-segment in-progress" style="width:${inProgressPct}%;height:100%"></div>` : '') +
            (notStartedPct > 0 ? `<div class="task-progress-segment not-started" style="width:${notStartedPct}%;height:100%"></div>` : '');
        gaugePct.textContent = `${Math.round(completedPct)}%`;
        tasksLeftEl.textContent = String(total - completed);

        if (renderActions && actionsList) {
            await renderTaskList(visibleTasks, 'project-actions-list', null, 'No actions',
                () => requestId === projectTaskMetricsRequest);
        }
        if (requestId !== projectTaskMetricsRequest) return;

    } catch (err) {
        if (requestId !== projectTaskMetricsRequest) return;
        console.error('Failed to load task progress bar:', err);
        gaugeBar.innerHTML = '';
        gaugePct.textContent = '0%';
        tasksLeftEl.textContent = '0';
        if (renderActions && actionsList) {
            actionsList.innerHTML = '<div class="task-list-error">Unable to load actions</div>';
        }
    }
}

// Load and render project goals (notes of type 'G') for the given tag
async function loadProjectGoals(tagId) {
    const container = document.getElementById('project-goals-container');
    const listEl = document.getElementById('project-goals-list');
    if (!container || !listEl) return;
    const requestId = ++projectGoalsRequest;
    try {
        // Use the same backend pattern as other loaders; includeContent:false to keep payload small
        const notes = typeof window.__TAURI__ !== 'undefined'
            ? await window.__TAURI__.core.invoke('load_notes_by_tag', { tag: tagId, includeContent: false })
            : await execute('loadNotesByTag', tagId);
        if (requestId !== projectGoalsRequest) return;

        const goals = Array.isArray(notes) ? notes.filter(n => (n.NoteType || n.Type || n.note_type) === 'G') : [];

        if (!goals || goals.length === 0) {
            listEl.innerHTML = '<div class="project-goals-empty">No goals for this project</div>';
            return;
        }

        // Render a compact list of goals with separate filter and open controls.
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        ul.style.margin = '0';

        goals.slice(0, 10).forEach(goal => {
            const li = document.createElement('li');
            li.className = 'project-goal-item';
            const goalId = getProjectGoalId(goal);
            if (goalId) li.dataset.goalId = goalId;

            const titleText = goal.Title || goal.title || '(untitled)';

            const left = document.createElement('button');
            left.type = 'button';
            left.className = 'goal-left';
            left.setAttribute('aria-label', `Show actions for goal: ${titleText}`);
            left.setAttribute('aria-pressed', 'false');
            const goalIcon = document.createElement('span');
            goalIcon.className = 'goal-icon';
            goalIcon.setAttribute('aria-hidden', 'true');
            goalIcon.innerHTML = '<i class="fas fa-bullseye"></i>';
            const titleSpan = document.createElement('span');
            titleSpan.className = 'goal-title';
            titleSpan.textContent = titleText;
            left.appendChild(goalIcon);
            left.appendChild(titleSpan);

            const right = document.createElement('button');
            right.type = 'button';
            right.className = 'goal-right';
            right.setAttribute('aria-label', `Open goal: ${titleText}`);
            right.innerHTML = '<i class="fas fa-chevron-right"></i>';

            li.appendChild(left);
            li.appendChild(right);

            const openGoal = () => {
                try {
                    // Preserve the project Home context for the editor's back arrow.
                    rememberMenuLocation('home');
                    navigateWithHistory('editor', goal.Id || goal.id || goal.DocId || goal.doc_id);
                } catch (err) {
                    console.error('navigate to goal note failed', err);
                }
            };

            left.addEventListener('click', () => selectProjectGoal(goal));
            right.addEventListener('click', openGoal);

            ul.appendChild(li);
        });

        if (requestId !== projectGoalsRequest) return;
        listEl.innerHTML = '';
        listEl.appendChild(ul);
        updateProjectGoalSelection();
    } catch (e) {
        if (requestId !== projectGoalsRequest) return;
        console.error('Failed to load project goals:', e);
        listEl.innerHTML = '<div class="project-goals-empty">Unable to load goals right now.</div>';
    }
}

// Expose for testing/debug if needed
window.loadProjectGoals = loadProjectGoals;


function scheduleProjectAutoSave() {
    if (projectAutoSaveTimer) clearTimeout(projectAutoSaveTimer);
    projectAutoSaveTimer = setTimeout(saveProjectData, 500);
}

window.saveProjectResponse = function(data) {
    // Saved successfully, nothing to do
};

// Custom datepicker logic
let datepickerViewDate = new Date();
let datepickerSelectedDate = null;

function setDeadlineDatepicker(dateStr) {
    const hiddenInput = document.getElementById('project-deadline');
    const displayText = document.getElementById('deadline-display-text');
    const clearBtn = document.getElementById('deadline-clear');

    if (dateStr) {
        const parts = dateStr.split('-');
        datepickerSelectedDate = new Date(parts[0], parts[1] - 1, parts[2]);
        datepickerViewDate = new Date(datepickerSelectedDate);
        if (hiddenInput) hiddenInput.value = dateStr;
        if (displayText) {
            displayText.textContent = datepickerSelectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            displayText.classList.remove('placeholder');
        }
        if (clearBtn) clearBtn.style.display = '';
    } else {
        datepickerSelectedDate = null;
        datepickerViewDate = new Date();
        if (hiddenInput) hiddenInput.value = '';
        if (displayText) {
            displayText.textContent = 'No deadline set';
            displayText.classList.add('placeholder');
        }
        if (clearBtn) clearBtn.style.display = 'none';
    }
    renderDatepickerDays();
    try { if (typeof updateDeadlineGaugeDisplay === 'function') updateDeadlineGaugeDisplay(); } catch (e) {}
}

function renderDatepickerDays() {
    const daysContainer = document.getElementById('deadline-days');
    const titleEl = document.getElementById('deadline-month-title');
    if (!daysContainer) return;

    const year = datepickerViewDate.getFullYear();
    const month = datepickerViewDate.getMonth();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    if (titleEl) titleEl.textContent = monthNames[month] + ' ' + year;

    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay() - 1; // Monday = 0
    if (startDay < 0) startDay = 6;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    daysContainer.innerHTML = '';

    // Previous month trailing days
    for (let i = startDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datepicker-day other-month';
        btn.textContent = day;
        const d = new Date(year, month - 1, day);
        btn.addEventListener('click', function() { selectDatepickerDay(d); });
        daysContainer.appendChild(btn);
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datepicker-day';
        btn.textContent = day;
        const d = new Date(year, month, day);
        if (d.getTime() === today.getTime()) btn.classList.add('today');
        if (datepickerSelectedDate && d.getTime() === datepickerSelectedDate.getTime()) btn.classList.add('selected');
        btn.addEventListener('click', function() { selectDatepickerDay(d); });
        daysContainer.appendChild(btn);
    }

    // Next month leading days
    const totalCells = daysContainer.children.length;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datepicker-day other-month';
        btn.textContent = day;
        const d = new Date(year, month + 1, day);
        btn.addEventListener('click', function() { selectDatepickerDay(d); });
        daysContainer.appendChild(btn);
    }
}

// Update the small gauge's due-date text to show days remaining
function updateDeadlineGaugeDisplay() {
    const hidden = document.getElementById('project-deadline');
    const display = document.getElementById('project-gauge-due-text');
    if (!display) return;
    const val = hidden ? hidden.value : '';
    if (!val) { display.textContent = '—'; return; }
    try {
        const parts = val.split('-');
        const due = new Date(parts[0], parts[1]-1, parts[2]);
        const today = new Date(); today.setHours(0,0,0,0);
        const diffMs = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffMs / (1000*60*60*24));
        display.textContent = String(diffDays);
    } catch (e) {
        display.textContent = val;
    }
}

function selectDatepickerDay(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setDeadlineDatepicker(yyyy + '-' + mm + '-' + dd);
    try { if (typeof updateDeadlineGaugeDisplay === 'function') updateDeadlineGaugeDisplay(); } catch(e) {}
    closeDeadlineDatepicker();
    scheduleProjectAutoSave();
}

function closeDeadlineDatepicker() {
    const dropdown = document.getElementById('deadline-dropdown');
    if (dropdown) dropdown.classList.remove('open');
}

function initializeDatepicker() {
    const display = document.getElementById('deadline-display');
    const dropdown = document.getElementById('deadline-dropdown');
    const prevBtn = document.getElementById('deadline-prev');
    const nextBtn = document.getElementById('deadline-next');
    const todayBtn = document.getElementById('deadline-today-btn');
    const clearBtn = document.getElementById('deadline-clear');

    if (display) {
        display.addEventListener('click', function(e) {
            if (e.target.closest('.datepicker-clear')) return;
            if (dropdown) dropdown.classList.toggle('open');
            renderDatepickerDays();
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            setDeadlineDatepicker('');
            closeDeadlineDatepicker();
            scheduleProjectAutoSave();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            datepickerViewDate.setMonth(datepickerViewDate.getMonth() - 1);
            renderDatepickerDays();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            datepickerViewDate.setMonth(datepickerViewDate.getMonth() + 1);
            renderDatepickerDays();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            selectDatepickerDay(new Date(new Date().setHours(0, 0, 0, 0)));
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('#deadline-datepicker')) {
            closeDeadlineDatepicker();
        }
    });

    renderDatepickerDays();
}

// Attach auto-save listeners once DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const titleEl = document.getElementById('project-title');
    const objectiveEl = document.getElementById('project-objective');
    if (titleEl) {
        titleEl.addEventListener('input', scheduleProjectAutoSave);
        titleEl.addEventListener('blur', scheduleProjectAutoSave);
    }
    if (objectiveEl) {
        objectiveEl.addEventListener('input', function() {
            resizeProjectObjective();
            scheduleProjectAutoSave();
        });
        resizeProjectObjective();
    }
    window.addEventListener('resize', resizeProjectObjective);
    initializeDatepicker();

    // Update gauge due display and wire edit/clear buttons
    try {
        if (typeof updateDeadlineGaugeDisplay === 'function') updateDeadlineGaugeDisplay();
        const editBtn = document.getElementById('project-gauge-due-edit');
        if (editBtn) editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const display = document.getElementById('deadline-display');
            if (display) display.click();
        });
        const clearBtn = document.getElementById('project-gauge-due-clear');
        if (clearBtn) clearBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            setDeadlineDatepicker('');
            scheduleProjectAutoSave();
        });
    } catch (e) { console.error(e); }

    initializeLeftPaneResizer();
});

function initializeLeftPaneResizer() {
    const resizer = document.getElementById('left-pane-resizer');
    if (!resizer) return;
    const MIN_W = 160;
    const MAX_W = 600;
    let dragging = false;

    function applyWidth(px) {
        const clamped = Math.max(MIN_W, Math.min(MAX_W, px));
        document.documentElement.style.setProperty('--left-pane-width', clamped + 'px');
        return clamped;
    }

    resizer.addEventListener('mousedown', function(e) {
        dragging = true;
        resizer.classList.add('dragging');
        document.body.classList.add('resizing-left-pane');
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        applyWidth(e.clientX);
    });

    document.addEventListener('mouseup', function(e) {
        if (!dragging) return;
        dragging = false;
        resizer.classList.remove('dragging');
        document.body.classList.remove('resizing-left-pane');
        const finalW = applyWidth(e.clientX);
        try { localStorage.setItem('leftPaneWidth', String(finalW)); } catch (err) {}
    });
}

function showSettings() {
    console.log("=== SHOW SETTINGS CALLED ===");
    console.log("About to call loadView('settings')");
    loadView('settings');
    console.log("loadView call completed");
}

// Expose showSettings to window so it can be called from HTML onclick
window.showSettings = showSettings;
console.log("showSettings exposed to window:", typeof window.showSettings);

function getTime(data) {
    document.getElementById("message").innerText = data
}

function loadNote(data) {

}

// Removed displayTasksInMenu function

// Cache for feature availability to avoid repeated backend calls
let cachedUrgentEnabled = null;
let cachedDueDateEnabled = null;
let featureCacheTimestamp = null;
const FEATURE_CACHE_TTL = 60000; // Cache for 60 seconds

/**
 * Check if features are enabled (with caching)
 * @returns {Promise<{urgentEnabled: boolean, dueDateEnabled: boolean}>}
 */
async function checkFeaturesWithCache() {
    // Return cached values if still valid
    const now = Date.now();
    if (cachedUrgentEnabled !== null && cachedDueDateEnabled !== null && 
        featureCacheTimestamp && (now - featureCacheTimestamp) < FEATURE_CACHE_TTL) {
        return { urgentEnabled: cachedUrgentEnabled, dueDateEnabled: cachedDueDateEnabled };
    }

    // Check features
    let urgentEnabled = false;
    let dueDateEnabled = false;

    // Try to use window.isFeatureEnabled if available
    if (typeof window.isFeatureEnabled === 'function') {
        try {
            [urgentEnabled, dueDateEnabled] = await Promise.all([
                window.isFeatureEnabled('urgentTasks'),
                window.isFeatureEnabled('taskDueDates')
            ]);
        } catch (error) {
            console.error('Error checking features:', error);
        }
    } else if (typeof window.processMessage === 'function') {
        // Fallback: call backend directly
        try {
            const urgentMessage = `isFeatureEnabled|urgentTasks`;
            const dueDateMessage = `isFeatureEnabled|taskDueDates`;
            
            const [urgentResponse, dueDateResponse] = await Promise.all([
                window.processMessage(urgentMessage),
                window.processMessage(dueDateMessage)
            ]);
            
            if (urgentResponse && typeof urgentResponse === 'string') {
                const parts = urgentResponse.split('|||');
                if (parts.length >= 2 && parts[0] === 'isFeatureEnabledResponse') {
                    const data = JSON.parse(parts[1]);
                    urgentEnabled = data.enabled === true;
                }
            }
            
            if (dueDateResponse && typeof dueDateResponse === 'string') {
                const parts = dueDateResponse.split('|||');
                if (parts.length >= 2 && parts[0] === 'isFeatureEnabledResponse') {
                    const data = JSON.parse(parts[1]);
                    dueDateEnabled = data.enabled === true;
                }
            }
        } catch (error) {
            console.error('Error checking features via backend:', error);
        }
    }

    // Cache the results
    cachedUrgentEnabled = urgentEnabled;
    cachedDueDateEnabled = dueDateEnabled;
    featureCacheTimestamp = now;

    return { urgentEnabled, dueDateEnabled };
}

// stripDateAndUrgentMarker now lives in common.js (shared with the editor).

const PROJECT_TASK_STATE_ORDER = ['pending', 'progress', 'complete'];
const PROJECT_TASK_STATE_MARKERS = {
    pending: '-',
    progress: '/',
    complete: '|'
};
const PROJECT_TASK_STATE_LABELS = {
    pending: 'Not started',
    progress: 'In progress',
    complete: 'Done'
};
const PROJECT_TASK_NOTE_STATES = {
    pending: 'todo',
    progress: 'in_progress',
    complete: 'done'
};
const projectTaskStateUpdates = new Map();

function getProjectTaskValue(item, ...keys) {
    for (const key of keys) {
        if (item && item[key] !== null && typeof item[key] !== 'undefined') {
            return item[key];
        }
    }
    return null;
}

function getProjectTaskLine(item) {
    return getProjectTaskValue(item, 'TaskLine', 'task_line', 'taskLine') || '';
}

function getProjectTaskId(item) {
    return getTaskIdKey(getProjectTaskValue(item, 'TaskId', 'task_id', 'taskId'));
}

function getProjectTaskNoteId(item) {
    return getProjectTaskValue(item, 'NoteId', 'note_id', 'noteId');
}

function projectTaskStateFromLine(line) {
    const match = String(line || '').match(/^\s*([-\/|])\s/);
    if (!match) return null;
    if (match[1] === '-') return 'pending';
    if (match[1] === '/') return 'progress';
    return 'complete';
}

function projectTaskStateFromItem(item) {
    const lineState = projectTaskStateFromLine(getProjectTaskLine(item));
    if (lineState) return lineState;

    switch (String(getProjectTaskValue(item, 'TaskType', 'task_type', 'taskType') || '').toLowerCase()) {
        case 'in_progress':
        case 'progress':
            return 'progress';
        case 'completed':
        case 'complete':
        case 'done':
            return 'complete';
        case 'pending':
        case 'todo':
            return 'pending';
        default:
            return null;
    }
}

function projectTaskMetadataFromLine(line) {
    const trimmed = String(line || '').replace(/\r$/, '').trimEnd();
    if (!trimmed.endsWith('}')) return null;

    const openBrace = trimmed.lastIndexOf('{');
    if (openBrace < 0) return null;

    try {
        const metadata = JSON.parse(trimmed.slice(openBrace));
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
        if (!metadata._id && !metadata._noteId) return null;
        return { metadata, openBrace };
    } catch {
        return null;
    }
}

function projectTaskLineWithoutMetadata(line) {
    const text = String(line || '').replace(/\r$/, '').trimEnd();
    const parsed = projectTaskMetadataFromLine(text);
    return parsed ? text.slice(0, parsed.openBrace).trimEnd() : text;
}

// Use the visible task text for legacy task rows that do not have a stable id.
// The indent remains part of the key so equally named parent and child tasks do
// not accidentally update one another.
function projectTaskMatchKey(line) {
    const withoutMetadata = projectTaskLineWithoutMetadata(line);
    const match = withoutMetadata.match(/^(\s*)([-\/|])\s(.*)$/);
    if (!match) return null;

    let text = match[3].replace(/!/g, '');
    if (typeof stripDateAndUrgentMarker === 'function') {
        text = stripDateAndUrgentMarker(text);
    }
    return `${match[1].length}:${text.replace(/\s+/g, ' ').trim()}`;
}

function getProjectActionExpansionKey(item) {
    const taskId = getProjectTaskId(item);
    if (taskId) return `id:${taskId}`;
    const matchKey = projectTaskMatchKey(getProjectTaskLine(item));
    if (!matchKey) return null;
    const noteId = getProjectTaskNoteId(item);
    return noteId === null || typeof noteId === 'undefined'
        ? `line:${matchKey}`
        : `note:${noteId}|line:${matchKey}`;
}

function applyProjectTaskStateOverrides(tasks) {
    if (!Array.isArray(tasks) || projectTaskStateOverrides.size === 0) return tasks;

    const now = Date.now();
    for (const [key, override] of projectTaskStateOverrides) {
        if (override.expiresAt <= now) {
            projectTaskStateOverrides.delete(key);
        }
    }

    for (const item of tasks) {
        const key = getProjectActionExpansionKey(item);
        const override = key ? projectTaskStateOverrides.get(key) : null;
        if (!override) continue;

        if (projectTaskStateFromItem(item) === override.state) {
            projectTaskStateOverrides.delete(key);
            continue;
        }

        const currentLine = getProjectTaskLine(item);
        const updatedLine = replaceProjectTaskState(currentLine, override.state);
        if (updatedLine !== currentLine) {
            item.TaskLine = updatedLine;
        } else {
            item.TaskType = PROJECT_TASK_NOTE_STATES[override.state];
        }
    }

    return tasks;
}

function findProjectTaskLineIndex(lines, item) {
    const taskId = getProjectTaskId(item);
    if (taskId) {
        for (let index = 1; index < lines.length; index++) {
            const metadata = projectTaskMetadataFromLine(lines[index]);
            if (metadata && metadata.metadata._id === taskId) return index;
        }
    }

    const matchKey = projectTaskMatchKey(getProjectTaskLine(item));
    if (!matchKey) return -1;

    const matches = [];
    lines.forEach((line, index) => {
        if (index === 0) return;
        if (projectTaskMatchKey(line) === matchKey) matches.push(index);
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
        console.error('Cannot uniquely identify project task line:', getProjectTaskLine(item));
    }
    return -1;
}

function replaceProjectTaskState(line, state) {
    const marker = PROJECT_TASK_STATE_MARKERS[state];
    if (!marker) return null;
    return String(line).replace(/^(\s*)[-\/|](\s)/, `$1${marker}$2`);
}

function getProjectTaskParentId(item) {
    return getTaskIdKey(getProjectTaskValue(item, 'ParentId', 'parent_id', 'parentId'));
}

function buildProjectTaskLineHierarchy(lines) {
    const parentAtLevel = [null, null, null, null];
    const lineIndexByTaskId = new Map();
    const parentIdByTaskId = new Map();

    lines.forEach((line, index) => {
        const match = String(line || '').match(/^(\s*)[-\/|]\s/);
        if (!match) return;

        const metadata = projectTaskMetadataFromLine(line);
        const taskId = metadata && getTaskIdKey(metadata.metadata._id);
        const indentLevel = Math.min(Math.floor(match[1].length / 2), 3);
        const parentId = indentLevel > 0 ? parentAtLevel[indentLevel - 1] : null;

        if (taskId) {
            lineIndexByTaskId.set(taskId, index);
            parentIdByTaskId.set(taskId, parentId);
        }

        parentAtLevel[indentLevel] = taskId;
        for (let level = indentLevel + 1; level < parentAtLevel.length; level++) {
            parentAtLevel[level] = null;
        }
    });

    return { lineIndexByTaskId, parentIdByTaskId };
}

function promoteProjectTaskAncestors(lines, hierarchy, item, state) {
    if (state === 'pending') return [];

    const promotedTaskIds = [];
    const visited = new Set();
    let parentId = getProjectTaskParentId(item);
    const taskId = getProjectTaskId(item);
    if (!parentId && taskId) parentId = hierarchy.parentIdByTaskId.get(taskId) || null;

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parentIndex = hierarchy.lineIndexByTaskId.get(parentId);
        if (parentIndex === undefined) {
            throw new Error(`Source parent task line could not be found: ${parentId}`);
        }

        if (projectTaskStateFromLine(lines[parentIndex]) !== 'progress') {
            const updatedLine = replaceProjectTaskState(lines[parentIndex], 'progress');
            if (!updatedLine) throw new Error('Source parent task line has no state marker');
            lines[parentIndex] = updatedLine;
            promotedTaskIds.push(parentId);
        }

        parentId = hierarchy.parentIdByTaskId.get(parentId) || null;
    }

    return promotedTaskIds;
}

function updateProjectTaskRowState(taskId, state) {
    if (!taskId) return;
    const row = Array.from(document.querySelectorAll('#project-actions-list .project-action-row'))
        .find(candidate => candidate.dataset.taskId === taskId);
    if (!row) return;
    const toggle = row.querySelector('.project-task-state-toggle');
    if (toggle) updateProjectTaskToggle(toggle, state);
}

function updateProjectTaskItemState(item, state) {
    const currentLine = getProjectTaskLine(item);
    const updatedLine = replaceProjectTaskState(currentLine, state);
    if (updatedLine) item.TaskLine = updatedLine;
    item.TaskType = PROJECT_TASK_NOTE_STATES[state];

    const taskId = getProjectTaskId(item);
    if (taskId) {
        projectTaskStateOverrides.set(getProjectActionExpansionKey(item), {
            state,
            expiresAt: Date.now() + PROJECT_TASK_STATE_OVERRIDE_TTL,
        });
        updateProjectTaskRowState(taskId, state);
    }
}

function projectTaskStateLabel(state) {
    return PROJECT_TASK_STATE_LABELS[state] || 'Unknown';
}

function updateProjectTaskToggle(toggle, state) {
    if (!toggle || !PROJECT_TASK_STATE_MARKERS[state]) return;
    const nextState = PROJECT_TASK_STATE_ORDER[
        (PROJECT_TASK_STATE_ORDER.indexOf(state) + 1) % PROJECT_TASK_STATE_ORDER.length
    ];
    toggle.dataset.state = state;
    toggle.innerHTML = renderTaskIcon(state);
    toggle.setAttribute(
        'aria-label',
        `Task status: ${projectTaskStateLabel(state)}. Click to mark ${projectTaskStateLabel(nextState)}.`
    );
    toggle.title = `Status: ${projectTaskStateLabel(state)} (click for ${projectTaskStateLabel(nextState)})`;
}

function nextProjectTaskState(state) {
    const index = PROJECT_TASK_STATE_ORDER.indexOf(state);
    if (index < 0) return null;
    return PROJECT_TASK_STATE_ORDER[(index + 1) % PROJECT_TASK_STATE_ORDER.length];
}

function isProjectNoteTask(item) {
    const taskId = getProjectTaskId(item);
    const linkedNoteId = getTaskIdKey(
        getProjectTaskValue(item, 'LinkedNoteId', 'linked_note_id', 'linkedNoteId')
    );
    return !!taskId && taskId === linkedNoteId;
}

async function cycleProjectTaskState(item, toggle) {
    if (!item || !toggle) return;

    const noteIdValue = getProjectTaskNoteId(item);
    const noteId = Number(noteIdValue);
    if (!Number.isSafeInteger(noteId) || noteId <= 0) {
        console.error('Cannot update project task without a valid note id:', item);
        return;
    }

    const currentState = projectTaskStateFromItem(item);
    if (!currentState) {
        console.error('Cannot update project task with an unknown state:', item);
        return;
    }

    // Saving a task writes the complete source note. Queue updates per note so
    // two subtasks cannot load the same old snapshot and overwrite each other.
    const updateKey = String(noteId);
    const previousUpdate = projectTaskStateUpdates.get(updateKey);
    toggle.disabled = true;
    toggle.setAttribute('aria-busy', 'true');
    const runUpdate = async () => {
        try {
            const latestState = projectTaskStateFromItem(item) || currentState;
            let nextState = nextProjectTaskState(latestState);
            if (!nextState) throw new Error('Unable to determine next task state');

            if (isProjectNoteTask(item)) {
                const response = await execute(
                    'setNoteType',
                    `${noteId}|T|${PROJECT_TASK_NOTE_STATES[nextState]}`
                );
                if (response === undefined || (response && response.error)) {
                    throw new Error(response && response.error ? response.error : 'Task note state update failed');
                }
            } else {
                const loadedNote = await execute('loadNote', String(noteId));
                const content = loadedNote && (loadedNote.Content || loadedNote.content);
                if (typeof content !== 'string') {
                    throw new Error('Source note could not be loaded');
                }

                const lines = content.split(/\r?\n/);
                const lineIndex = findProjectTaskLineIndex(lines, item);
                if (lineIndex < 0) {
                    throw new Error('Source task line could not be found');
                }

                const sourceState = projectTaskStateFromLine(lines[lineIndex]);
                if (sourceState) {
                    nextState = nextProjectTaskState(sourceState);
                }
                const updatedLine = replaceProjectTaskState(lines[lineIndex], nextState);
                if (!updatedLine) throw new Error('Source task line has no state marker');
                lines[lineIndex] = updatedLine;

                const hierarchy = buildProjectTaskLineHierarchy(lines);
                const promotedTaskIds = promoteProjectTaskAncestors(lines, hierarchy, item, nextState);
                const updatedContent = lines.join('\n');
                const encoded = btoa(unescape(encodeURIComponent(updatedContent)));
                const response = await execute('saveNote', `${noteId}|||${encoded}`);
                if (response === undefined || (response && response.error)) {
                    throw new Error(response && response.error ? response.error : 'Source note save failed');
                }

                for (const promotedTaskId of promotedTaskIds) {
                    const promotedItem = Array.isArray(projectTaskMetricsTasks)
                        ? projectTaskMetricsTasks.find(candidate => getProjectTaskId(candidate) === promotedTaskId)
                        : null;
                    if (promotedItem) updateProjectTaskItemState(promotedItem, 'progress');
                    else updateProjectTaskRowState(promotedTaskId, 'progress');
                }
            }

            updateProjectTaskItemState(item, nextState);
            updateProjectTaskToggle(toggle, nextState);

            const activeProject = document.querySelector('#projects-list .tag-item.active-tag');
            if (activeProject) {
                // The Actions tree already contains this updated task. Reuse
                // that in-memory list so a status click never waits on another
                // native database request or rebuilds the whole tree.
                const tagId = activeProject.dataset.tagId;
                const cachedTasks = projectTaskMetricsTag === tagId ? projectTaskMetricsTasks : null;
                await loadTaskProgressBar(tagId, { renderActions: false, tasks: cachedTasks });
            }
        } catch (error) {
            console.error('Failed to cycle project task state:', error);
        } finally {
            toggle.disabled = false;
            toggle.removeAttribute('aria-busy');
        }
    };
    const update = previousUpdate
        ? previousUpdate.then(runUpdate, (error) => {
            console.error('Previous project task update failed:', error);
            return runUpdate();
        })
        : runUpdate();

    projectTaskStateUpdates.set(updateKey, update);
    try {
        await update;
    } finally {
        if (projectTaskStateUpdates.get(updateKey) === update) {
            projectTaskStateUpdates.delete(updateKey);
        }
    }
}

/**
 * Format due date for display
 * @param {string} dueDate - ISO date string (YYYY-MM-DD) or null
 * @returns {string} - Formatted date string
 */
function formatDueDate(dueDate) {
    if (!dueDate) return null;
    
    try {
        const date = new Date(dueDate + 'T00:00:00'); // Add time to avoid timezone issues
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateOnly = new Date(date);
        dateOnly.setHours(0, 0, 0, 0);
        
        const diffTime = dateOnly - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // Format date
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        
        // Add relative indicator
        if (diffDays < 0) {
            return `${month} ${day}, ${year} (overdue)`;
        } else if (diffDays === 0) {
            return `Today (${month} ${day})`;
        } else if (diffDays === 1) {
            return `Tomorrow (${month} ${day})`;
        } else if (diffDays <= 7) {
            return `${diffDays} days (${month} ${day})`;
        } else {
            return `${month} ${day}, ${year}`;
        }
    } catch (error) {
        console.warn('Error formatting due date:', error);
        return dueDate;
    }
}

function getDateGroupKey(dueDate) {
    if (!dueDate) return { key: 'no-date', label: 'No Due Date', order: Infinity };
    try {
        const date = new Date(dueDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dateOnly = new Date(date);
        dateOnly.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dateOnly - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return { key: 'overdue', label: 'Overdue', order: 0 };
        if (diffDays === 0) return { key: 'today', label: 'Today', order: 1 };
        if (diffDays === 1) return { key: 'tomorrow', label: 'Tomorrow', order: 2 };
        if (diffDays <= 7) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return { key: `day-${dueDate}`, label: dayNames[date.getDay()], order: 3 + diffDays / 10 };
        }
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
        return { key: label, label, order: 100 + date.getFullYear() * 12 + date.getMonth() };
    } catch {
        return { key: 'no-date', label: 'No Due Date', order: Infinity };
    }
}

function createTaskListItem(item, options = {}) {
    const row = document.createElement(options.element || 'li');
    row.className = options.className || 'task-list-item';
    row.dataset.noteId = item.NoteId;
    const taskId = getTaskIdKey(item.TaskId);
    if (taskId) row.dataset.taskId = taskId;
    if (typeof options.onClick === 'function') row.onclick = options.onClick;

    // Urgent slot — always present on the left for alignment
    const urgentSlotLeft = document.createElement('span');
    urgentSlotLeft.className = 'task-urgent-slot-left';
    if (item.IsUrgent) {
        const urgentLabel = document.createElement('span');
        urgentLabel.className = 'task-label task-label-urgent';
        urgentLabel.textContent = '!';
        urgentLabel.title = 'Important';
        urgentSlotLeft.appendChild(urgentLabel);
    }
    row.appendChild(urgentSlotLeft);

    const taskLine = item.TaskLine;
    let actualTaskContent = taskLine;
    let iconType = options.defaultIconType || 'pending';

    if (item.TaskType === 'question') {
        const questionMatch = taskLine.match(/^(\s*[Qq]\.\s)/);
        if (questionMatch) {
            actualTaskContent = taskLine.substring(questionMatch[0].length);
            iconType = 'question';
        }
    } else {
        const prefixMatch = taskLine.match(/^(\s*[-\/\|]\s)/);
        if (prefixMatch) {
            actualTaskContent = taskLine.substring(prefixMatch[0].length);
            const prefix = prefixMatch[0].trim();
            if (prefix === '-') iconType = 'pending';
            else if (prefix === '/') iconType = 'progress';
            else if (prefix === '|') iconType = 'complete';
        }
    }

    actualTaskContent = stripDateAndUrgentMarker(actualTaskContent);

    const mentionedNames = extractMentionNames(actualTaskContent);
    actualTaskContent = stripMentions(actualTaskContent);

    if (typeof options.onStateToggle === 'function' && projectTaskStateFromItem(item)) {
        const stateToggle = document.createElement('button');
        stateToggle.type = 'button';
        stateToggle.className = 'project-task-state-toggle';
        const state = projectTaskStateFromItem(item) || (
            iconType === 'progress' ? 'progress' :
            iconType === 'complete' ? 'complete' : 'pending'
        );
        updateProjectTaskToggle(stateToggle, state);
        stateToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            options.onStateToggle(event, stateToggle);
        });
        row.appendChild(stateToggle);
    } else {
        row.insertAdjacentHTML('beforeend', renderTaskIcon(iconType));
    }

    const taskTextContainer = document.createElement('span');
    taskTextContainer.className = 'task-text-container';
    const taskContentSpan = document.createElement('span');
    taskContentSpan.className = 'task-content-text';
    taskContentSpan.textContent = actualTaskContent;
    taskTextContainer.appendChild(taskContentSpan);

    const subtaskCount = options.subtaskCount;
    let subtaskIndicator = null;
    if (subtaskCount) {
        subtaskIndicator = options.subtaskIndicator || null;
        if (!subtaskIndicator) {
            const indicatorContainer = document.createElement('span');
            indicatorContainer.innerHTML = renderSubtaskIndicator(subtaskCount);
            subtaskIndicator = indicatorContainer.firstElementChild;
        }
        if (!options.subtaskIndicatorOutsideText && subtaskIndicator) {
            taskTextContainer.appendChild(subtaskIndicator);
        }
    }

    row.appendChild(taskTextContainer);
    if (options.subtaskIndicatorOutsideText && subtaskIndicator) {
        row.appendChild(subtaskIndicator);
    }
    if (mentionedNames.length > 0) {
        row.insertAdjacentHTML('beforeend', renderTaskPeopleSlot(mentionedNames));
    }

    return row;
}

function createProjectSubtaskIndicator(count) {
    const indicator = document.createElement('span');
    indicator.className = 'task-subtask-indicator project-action-toggle';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.title = count === 1 ? 'Expand 1 sub-action' : `Expand ${count} sub-actions`;

    const icon = document.createElement('i');
    icon.className = 'fas fa-chevron-right';
    const countText = document.createElement('span');
    countText.textContent = String(count);
    indicator.appendChild(icon);
    indicator.appendChild(countText);
    return indicator;
}

function buildTaskChildrenIndex(data) {
    const childrenByParentId = new Map();
    for (const item of data || []) {
        if (!item || typeof item.TaskLine !== 'string' || typeof item.NoteId === 'undefined') {
            continue;
        }
        const parentId = getTaskIdKey(item.ParentId);
        if (!parentId) continue;
        if (!childrenByParentId.has(parentId)) childrenByParentId.set(parentId, []);
        childrenByParentId.get(parentId).push(item);
    }
    return childrenByParentId;
}

function renderProjectActionNode(
    item,
    childrenByParentId,
    subtaskCountByParentId,
    ancestorIds = new Set(),
    expandedKeys = new Set(),
) {
    if (!item || typeof item.TaskLine !== 'string' || typeof item.NoteId === 'undefined') {
        return null;
    }

    const taskId = getTaskIdKey(item.TaskId);
    if (taskId && ancestorIds.has(taskId)) {
        console.warn('Skipping cyclical project action branch for task:', taskId);
        return null;
    }

    const nextAncestorIds = new Set(ancestorIds);
    if (taskId) nextAncestorIds.add(taskId);

    const childNodes = [];
    if (taskId) {
        const childItems = childrenByParentId.get(taskId) || [];
        for (const child of childItems) {
            const childNode = renderProjectActionNode(
                child,
                childrenByParentId,
                subtaskCountByParentId,
                nextAncestorIds,
                expandedKeys,
            );
            if (childNode) childNodes.push(childNode);
        }
    }

    const node = document.createElement('li');
    node.className = 'project-action-node';

    const hasChildren = childNodes.length > 0;
    let childrenList = null;
    const expansionKey = getProjectActionExpansionKey(item);
    let expanded = hasChildren && expansionKey ? expandedKeys.has(expansionKey) : false;
    const indicator = hasChildren
        ? createProjectSubtaskIndicator(subtaskCountByParentId.get(taskId) || childNodes.length)
        : null;

    const toggleChildren = () => {
        if (!childrenList) return;
        expanded = !expanded;
        childrenList.hidden = !expanded;
        childrenList.setAttribute('aria-hidden', String(!expanded));
        row.setAttribute('aria-expanded', String(expanded));
        row.classList.toggle('project-action-expanded', expanded);

        const icon = indicator ? indicator.querySelector('i') : null;
        if (icon) icon.className = expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
        if (indicator) {
            const count = subtaskCountByParentId.get(taskId) || childNodes.length;
            indicator.title = expanded
                ? (count === 1 ? 'Collapse 1 sub-action' : `Collapse ${count} sub-actions`)
                : (count === 1 ? 'Expand 1 sub-action' : `Expand ${count} sub-actions`);
        }
    };

    const row = createTaskListItem(item, {
        element: 'div',
        className: `task-list-item project-action-row ${hasChildren ? 'project-action-parent' : 'project-action-leaf'}`,
        subtaskCount: hasChildren ? (subtaskCountByParentId.get(taskId) || childNodes.length) : 0,
        subtaskIndicator: indicator,
        subtaskIndicatorOutsideText: true,
        onStateToggle: (event, stateToggle) => cycleProjectTaskState(item, stateToggle),
        onClick: hasChildren ? toggleChildren : null
    });
    if (expansionKey) row.dataset.projectActionKey = expansionKey;

    if (hasChildren) {
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-expanded', String(expanded));
        row.classList.toggle('project-action-expanded', expanded);
        row.title = 'Click to expand or collapse sub-actions';
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                toggleChildren();
            }
        });

        childrenList = document.createElement('ul');
        childrenList.className = 'project-action-children';
        childrenList.hidden = !expanded;
        childrenList.setAttribute('aria-hidden', String(!expanded));
        childNodes.forEach(childNode => childrenList.appendChild(childNode));
        if (expanded && indicator) {
            const icon = indicator.querySelector('i');
            if (icon) icon.className = 'fas fa-chevron-down';
            const count = subtaskCountByParentId.get(taskId) || childNodes.length;
            indicator.title = count === 1
                ? 'Collapse 1 sub-action'
                : `Collapse ${count} sub-actions`;
        }
    }

    node.appendChild(row);
    if (childrenList) node.appendChild(childrenList);
    return node;
}

async function renderTaskList(data, targetId = 'todo-tasks-list', personName, emptyMessage = null, canRender = null) {
    console.log("renderTaskList called with:", data, "target:", targetId);
    const tasksContent = document.getElementById(targetId);
    if (!tasksContent) {
        console.error(`Element '${targetId}' not found.`);
        return;
    }
    const isProjectActionsList = targetId === 'project-actions-list';
    const expandedProjectActionKeys = isProjectActionsList
        ? new Set(Array.from(tasksContent.querySelectorAll('.project-action-row[aria-expanded="true"]'))
            .map(row => row.dataset.projectActionKey ||
                (row.dataset.taskId ? `id:${row.dataset.taskId}` : null))
            .filter(Boolean))
        : new Set();
    const existingProjectActionOrder = isProjectActionsList
        ? new Map(Array.from(tasksContent.querySelectorAll('.project-action-row'))
            .map((row, index) => [
                row.dataset.projectActionKey ||
                (row.dataset.taskId ? `id:${row.dataset.taskId}` : null),
                index,
            ])
            .filter(([key]) => key))
        : new Map();
    const compareProjectActionOrder = (a, b) => {
        const aOrder = existingProjectActionOrder.get(getProjectActionExpansionKey(a));
        const bOrder = existingProjectActionOrder.get(getProjectActionExpansionKey(b));
        if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
        if (aOrder !== undefined) return -1;
        if (bOrder !== undefined) return 1;
        return 0;
    };

    // Warm the people/icon cache before rendering rows, so each task's
    // right-aligned avatar strip can show uploaded icons on first paint
    // instead of only default colored initials.
    await rebuildTasksPersonFilterOptions();
    if (typeof canRender === 'function' && !canRender()) return;
    const personFilter = typeof personName === 'undefined' ? tasksListFilter.person : personName;

    // Clear content
    tasksContent.innerHTML = "";
    
    // Reset entry navigation when content changes
    resetEntryNavigation();

    if (data && Array.isArray(data) && data.length > 0) {
        console.log("loadTasksByTag: Received", data.length, "tasks");
        // Project actions retain completed tasks so their state controls can
        // cycle back to pending; the regular task list stays open-only.
        const filteredData = data.filter(item => {
            if (!item || typeof item.TaskLine !== 'string') {
                return false;
            }
            // Include questions (TaskType === 'question')
            if (item.TaskType === 'question') {
                return true;
            }
            const prefixMatch = item.TaskLine.match(/^(\s*[-\/\|]\s)/);
            if (prefixMatch) {
                const prefix = prefixMatch[0].trim();
                const isIncomplete = prefix !== '|';
                console.log("Task:", item.TaskLine.substring(0, 30), "prefix:", prefix, "isIncomplete:", isIncomplete);
                return isProjectActionsList || isIncomplete;
            }
            // If no prefix match, it's not a valid task line, so exclude it
            console.log("Task with no prefix match:", item.TaskLine.substring(0, 30));
            return false;
        }).filter(item => !getTaskIdKey(item.ParentId))
          .filter(item => taskLineMentionsPerson(item.TaskLine, personFilter));
        console.log(
            "loadTasksByTag: Filtered to",
            filteredData.length,
            isProjectActionsList ? "project actions" : "incomplete top-level tasks"
        );

        // Total number of descendant sub-tasks (of any status) per TaskId,
        // so top-level rows can show how many sub-tasks they have.
        const subtaskCountByParentId = computeSubtaskCounts(data);
        const projectChildrenByParentId = isProjectActionsList ? buildTaskChildrenIndex(data) : null;
        if (projectChildrenByParentId) {
            projectChildrenByParentId.forEach(children => children.sort(compareProjectActionOrder));
        }

        // The project Home actions list keeps the source order stable so
        // changing a task's status never moves it to another position.
        if (!isProjectActionsList) {
            // Check features once up front — also drives which sort order to apply
            const { urgentEnabled, dueDateEnabled } = await checkFeaturesWithCache();
            const hasCoreFeatures = urgentEnabled || dueDateEnabled;

            if (hasCoreFeatures) {
                // Core+ ordering: bucket by (status, important, due-in-7-days).
                // 0: in-progress + important + due≤7d    4: not-started + important + due≤7d
                // 1: in-progress + due≤7d                5: not-started + due≤7d
                // 2: in-progress + important             6: not-started + important
                // 3: in-progress                         7: not-started
                // Questions keep their legacy spot between in-progress and not-started.
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const sevenDaysOut = new Date(today);
                sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

                const isDueSoon = (dueDate) => {
                    if (!dueDate) return false;
                    const d = new Date(dueDate + 'T00:00:00');
                    if (isNaN(d.getTime())) return false;
                    d.setHours(0, 0, 0, 0);
                    return d <= sevenDaysOut;
                };

                const getBucket = (item) => {
                    if (item.TaskType === 'question') return 3.5;
                    const prefixMatch = item.TaskLine.match(/^(\s*[-\/\|]\s)/);
                    const prefix = prefixMatch ? prefixMatch[0].trim() : '';
                    const inProgress = prefix === '/';
                    const important = !!item.IsUrgent;
                    const dueSoon = isDueSoon(item.DueDate);
                    const base = inProgress ? 0 : 4;
                    if (important && dueSoon) return base + 0;
                    if (dueSoon) return base + 1;
                    if (important) return base + 2;
                    return base + 3;
                };

                filteredData.sort((a, b) => getBucket(a) - getBucket(b));
            } else {
                // Legacy sort for unlicensed/free: urgent → in-progress → questions → not-started
                filteredData.sort((a, b) => {
                    const aIsUrgent = a.IsUrgent ? 1 : 0;
                    const bIsUrgent = b.IsUrgent ? 1 : 0;
                    if (aIsUrgent !== bIsUrgent) {
                        return bIsUrgent - aIsUrgent;
                    }

                    if (a.TaskType === 'question' && b.TaskType !== 'question') {
                        const bPrefixMatch = b.TaskLine.match(/^(\s*[-\/\|]\s)/);
                        const bPrefix = bPrefixMatch ? bPrefixMatch[0].trim() : '';
                        if (bPrefix === '/') return 1;
                        if (bPrefix === '-') return -1;
                    }
                    if (a.TaskType !== 'question' && b.TaskType === 'question') {
                        const aPrefixMatch = a.TaskLine.match(/^(\s*[-\/\|]\s)/);
                        const aPrefix = aPrefixMatch ? aPrefixMatch[0].trim() : '';
                        if (aPrefix === '/') return -1;
                        if (aPrefix === '-') return 1;
                    }

                    const aPrefixMatch = a.TaskLine.match(/^(\s*[-\/\|]\s)/);
                    const bPrefixMatch = b.TaskLine.match(/^(\s*[-\/\|]\s)/);
                    const aPrefix = aPrefixMatch ? aPrefixMatch[0].trim() : '';
                    const bPrefix = bPrefixMatch ? bPrefixMatch[0].trim() : '';

                    if (aPrefix === '/' && bPrefix === '-') return -1;
                    if (aPrefix === '-' && bPrefix === '/') return 1;
                    return 0;
                });
            }
        }

        if (filteredData.length > 0) {
            const ul = document.createElement('ul');
            ul.style.paddingLeft = '0';
            ul.style.listStyleType = 'none';
            if (isProjectActionsList) ul.className = 'project-action-tree';

            // Group tasks by date bucket
            const groups = new Map();
            for (const item of filteredData) {
                const bucket = getDateGroupKey(item.DueDate);
                if (!groups.has(bucket.key)) {
                    groups.set(bucket.key, { label: bucket.label, order: bucket.order, tasks: [] });
                }
                groups.get(bucket.key).tasks.push(item);
            }

            const sortedGroups = Array.from(groups.values()).sort((a, b) => a.order - b.order);

            for (const group of sortedGroups) {
                const headerLi = document.createElement('li');
                headerLi.className = 'task-group-header';
                headerLi.textContent = group.label;
                ul.appendChild(headerLi);

                if (!isProjectActionsList) {
                    // Within each group: urgent first, then in-progress before pending
                    group.tasks.sort((a, b) => {
                        const aU = a.IsUrgent ? 0 : 1;
                        const bU = b.IsUrgent ? 0 : 1;
                        if (aU !== bU) return aU - bU;
                        const statusOrder = (t) => {
                            if (t.TaskType === 'question') return 2;
                            const m = t.TaskLine.match(/^(\s*[-\/\|]\s)/);
                            const p = m ? m[0].trim() : '';
                            return p === '/' ? 0 : p === '-' ? 1 : 2;
                        };
                        return statusOrder(a) - statusOrder(b);
                    });
                }

                if (isProjectActionsList) {
                    group.tasks.sort(compareProjectActionOrder);
                    for (const item of group.tasks) {
                        const node = renderProjectActionNode(
                            item,
                            projectChildrenByParentId,
                            subtaskCountByParentId,
                            new Set(),
                            expandedProjectActionKeys,
                        );
                        if (node) ul.appendChild(node);
                    }
                    continue;
                }

                for (const item of group.tasks) {
                    if (!item || typeof item.TaskLine !== 'string' || typeof item.NoteId === 'undefined') {
                        console.warn('Skipping malformed task item in loadTasksByTag:', item);
                        continue;
                    }

                    const li = createTaskListItem(item, {
                        subtaskCount: item.TaskId
                            ? subtaskCountByParentId.get(getTaskIdKey(item.TaskId))
                            : undefined,
                        onClick: function () {
                        const activeTag = document.querySelector('.tag-item.active-tag');
                        const selectedTagId = activeTag ? activeTag.dataset.tagId : 'all';
                        sessionStorage.setItem('lastSelectedTag', selectedTagId);
                        const activeTabButton = document.querySelector('.tab-button.active');
                        const selectedTab = activeTabButton ? activeTabButton.getAttribute('data-tab-name') || 'todo' : 'todo';
                        sessionStorage.setItem('lastSelectedTab', selectedTab);
                        navigateWithHistory('editor', item.NoteId);
                        }
                    });

                    ul.appendChild(li);
                }
            }
            tasksContent.appendChild(ul);
        } else {
            // Display the icon for no tasks
            const noTasksDiv = document.createElement('div');
            noTasksDiv.className = 'no-notes-container';
            noTasksDiv.innerHTML = '<span style="display: inline-block; width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--color-text); background: transparent;"></span>'
                + (emptyMessage ? `<span class="task-list-empty-message">${escapeHTML(emptyMessage)}</span>` : '');
            tasksContent.appendChild(noTasksDiv);
        }
    } else {
        // Display the icon for no tasks
        const noTasksDiv = document.createElement('div');
        noTasksDiv.className = 'no-notes-container';
        noTasksDiv.innerHTML = '<span style="display: inline-block; width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--color-text); background: transparent;"></span>'
            + (emptyMessage ? `<span class="task-list-empty-message">${escapeHTML(emptyMessage)}</span>` : '');
        tasksContent.appendChild(noTasksDiv);
    }
}

async function loadTasksByTag(data) {
    return renderTaskList(data);
}

async function loadDoneTasksByTag(data) {
    console.log("loadDoneTasksByTag called with:", data);
    const tasksContent = document.getElementById("done-content");
    if (!tasksContent) {
        console.error("Element 'done-content' not found.");
        return;
    }

    // Warm the people/icon cache before rendering rows (see loadTasksByTag).
    await rebuildTasksPersonFilterOptions();

    // Clear content
    tasksContent.innerHTML = "";
    
    // Reset entry navigation when content changes
    resetEntryNavigation();

    if (data && Array.isArray(data) && data.length > 0) {
        // Filter to show only completed tasks
        const filteredData = data.filter(item => {
            if (!item || typeof item.TaskLine !== 'string') {
                return false;
            }
            const prefixMatch = item.TaskLine.match(/^(\s*[-\/\|]\s)/);
            if (prefixMatch) {
                const prefix = prefixMatch[0].trim();
                // Only show completed tasks (prefix === '|')
                return prefix === '|';
            }
            return false;
        }).filter(item => !getTaskIdKey(item.ParentId))
          .filter(item => taskLineMentionsPerson(item.TaskLine, tasksListFilter.person));

        // Total number of descendant sub-tasks (of any status) per TaskId,
        // so top-level rows can show how many sub-tasks they have.
        const subtaskCountByParentId = computeSubtaskCounts(data);

        if (filteredData.length > 0) {
            const ul = document.createElement('ul');
            ul.style.paddingLeft = '0';
            ul.style.listStyleType = 'none';

            // Group tasks by date bucket
            const groups = new Map();
            for (const item of filteredData) {
                const bucket = getDateGroupKey(item.DueDate);
                if (!groups.has(bucket.key)) {
                    groups.set(bucket.key, { label: bucket.label, order: bucket.order, tasks: [] });
                }
                groups.get(bucket.key).tasks.push(item);
            }

            const sortedGroups = Array.from(groups.values()).sort((a, b) => a.order - b.order);

            for (const group of sortedGroups) {
                const headerLi = document.createElement('li');
                headerLi.className = 'task-group-header';
                headerLi.textContent = group.label;
                ul.appendChild(headerLi);

                for (const item of group.tasks) {
                    if (!item || typeof item.TaskLine !== 'string' || typeof item.NoteId === 'undefined') {
                        console.warn('Skipping malformed task item in loadDoneTasksByTag:', item);
                        continue;
                    }

                    const li = createTaskListItem(item, {
                        defaultIconType: 'complete',
                        subtaskCount: item.TaskId
                            ? subtaskCountByParentId.get(getTaskIdKey(item.TaskId))
                            : undefined,
                        onClick: function () {
                        const activeTag = document.querySelector('.tag-item.active-tag');
                        const selectedTagId = activeTag ? activeTag.dataset.tagId : 'all';
                        sessionStorage.setItem('lastSelectedTag', selectedTagId);
                        const activeTabButton = document.querySelector('.tab-button.active');
                        const selectedTab = activeTabButton ? activeTabButton.getAttribute('data-tab-name') || 'done' : 'done';
                        sessionStorage.setItem('lastSelectedTab', selectedTab);
                        navigateWithHistory('editor', item.NoteId);
                        }
                    });

                    ul.appendChild(li);
                }
            }
            tasksContent.appendChild(ul);
        } else {
            // Display the icon for no tasks (using done task icon)
            const noTasksDiv = document.createElement('div');
            noTasksDiv.className = 'no-notes-container';
            noTasksDiv.style.flexDirection = 'column';
            noTasksDiv.style.gap = '12px';
            const iconSize = 48;
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#66CB37';
            const largeIcon = `<svg class="task-icon" width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16" style="display: block;">
                <circle cx="8" cy="8" r="7" fill="${primaryColor}"/>
            </svg>`;
            noTasksDiv.innerHTML = largeIcon + '<span style="color: var(--color-text-secondary); font-size: 0.95em;">no complete tasks</span>';
            tasksContent.appendChild(noTasksDiv);
        }
    } else {
        // Display the icon for no tasks (using done task icon)
        const noTasksDiv = document.createElement('div');
        noTasksDiv.className = 'no-notes-container';
        noTasksDiv.style.flexDirection = 'column';
        noTasksDiv.style.gap = '12px';
        const iconSize = 48;
        const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#66CB37';
        const largeIcon = `<svg class="task-icon" width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16" style="display: block;">
            <circle cx="8" cy="8" r="7" fill="${primaryColor}"/>
        </svg>`;
        noTasksDiv.innerHTML = largeIcon + '<span style="color: var(--color-text-secondary); font-size: 0.95em;">no complete tasks</span>';
        tasksContent.appendChild(noTasksDiv);
    }
}

// Expose loadDoneTasksByTag to window so it can be called from execute()
window.loadDoneTasksByTag = loadDoneTasksByTag;

// Render exclamation icon (same as editor)
function renderExclamationIcon() {
    const size = 26;
    const goldColor = '#e6b800'; // Medium gold for balanced contrast
    return `<svg class="important-icon" width="${size}" height="${size}" viewBox="0 0 24 24">
        <circle class="important-icon-circle" cx="12" cy="12" r="10" fill="${goldColor}"/>
        <rect x="10.5" y="6" width="3" height="7" rx="1.5" fill="currentColor"/>
        <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
    </svg>`;
}

// Escape HTML to prevent XSS
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Parse inline content (simple version - just escape HTML for now)
function parseInline(text) {
    return escapeHTML(text);
}

function loadDecisionsByTag(data) {
    console.log("loadDecisionsByTag called with:", data);
    const decisionsContent = document.getElementById("decisions-content");
    if (!decisionsContent) {
        console.error("Element 'decisions-content' not found.");
        return;
    }

    // Clear content
    decisionsContent.innerHTML = "";
    
    // Reset entry navigation when content changes
    resetEntryNavigation();

    if (data && Array.isArray(data) && data.length > 0) {
        data.forEach(item => {
            if (!item || typeof item.DecisionLine !== 'string' || typeof item.NoteId === 'undefined') {
                console.warn('Skipping malformed decision item in loadDecisionsByTag:', item);
                return;
            }

            const decisionLine = item.DecisionLine;
            // Strip "! " prefix from decision line
            let actualDecisionContent = decisionLine;
            const prefixMatch = decisionLine.match(/^(\s*!\s)/);
            if (prefixMatch) {
                actualDecisionContent = decisionLine.substring(prefixMatch[0].length);
            }

            // Create important-block div (same structure as editor)
            const importantBlock = document.createElement('div');
            importantBlock.className = 'important-block';
            importantBlock.dataset.noteId = item.NoteId;
            importantBlock.style.cursor = 'pointer';
            importantBlock.onclick = function () {
                // Store the currently selected tag and tab before navigating to editor
                const activeTag = document.querySelector('.tag-item.active-tag');
                const selectedTagId = activeTag ? activeTag.dataset.tagId : 'all';
                sessionStorage.setItem('lastSelectedTag', selectedTagId);
                
                // Get the currently active tab
                const activeTabButton = document.querySelector('.tab-button.active');
                const selectedTab = activeTabButton ? activeTabButton.getAttribute('data-tab-name') || 'decisions' : 'decisions';
                sessionStorage.setItem('lastSelectedTab', selectedTab);
                
                navigateWithHistory('editor', item.NoteId);
            };

            // Add icon using a temporary container to parse SVG
            const iconContainer = document.createElement('div');
            iconContainer.innerHTML = renderExclamationIcon();
            const iconElement = iconContainer.firstElementChild;
            if (iconElement) {
                importantBlock.appendChild(iconElement);
            }

            // Add content div
            const contentDiv = document.createElement('div');
            contentDiv.className = 'important-content';
            contentDiv.innerHTML = parseInline(actualDecisionContent);

            // Add note title if available
            if (item.NoteTitle) {
                const noteTitleSpan = document.createElement('span');
                noteTitleSpan.className = 'task-note-title';
                noteTitleSpan.style.display = 'block';
                noteTitleSpan.style.marginTop = '4px';
                noteTitleSpan.style.fontSize = '0.85em';
                noteTitleSpan.style.color = 'var(--color-text-secondary)';
                noteTitleSpan.textContent = item.NoteTitle;
                contentDiv.appendChild(noteTitleSpan);
            }

            importantBlock.appendChild(contentDiv);
            decisionsContent.appendChild(importantBlock);
        });
    } else {
        // Display the icon for no decisions
        const noDecisionsDiv = document.createElement('div');
        noDecisionsDiv.className = 'no-notes-container';
        noDecisionsDiv.innerHTML = '<span style="display: inline-block; width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--color-text); background: transparent;"></span>';
        decisionsContent.appendChild(noDecisionsDiv);
    }
}

// Expose loadDecisionsByTag to window so it can be called from execute()
window.loadDecisionsByTag = loadDecisionsByTag;

// Search decisions
function searchDecisions(searchTerm) {
    const filteredDecisions = originalDecisionsData.filter(decision =>
        decision.DecisionLine.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (decision.NoteTitle && decision.NoteTitle.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    loadDecisionsByTag(filteredDecisions);
}

// Removed loadTasksForTag function

function formatDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const year = date.getFullYear().toString().slice(-2);
    return `${day} ${month} '${year}`;
}

// ----- Notes list filter palette -----
// The status filter is single-select; tag filters are multi-select and narrow
// the list to notes carrying every selected tag. Tag chips are rebuilt from
// the tags on the currently loaded notes, excluding the tag already selected
// in the left panel.
let notesListData = [];
const notesListFilter = { status: 'all', tags: new Set() };
let notesListSort = 'updated';
let customNoteOrderEnabled = false;
let customTagOrderEnabled = false;
let tagsCustomOrder = [];
let activeTagDragName = null;
let activeTagDragElement = null;
let activeTagDragPointerId = null;
let tagDragStartX = 0;
let tagDragStartY = 0;
let tagDragMoved = false;
let tagDropTarget = null;
let tagDropBefore = false;
let tagDropIndex = null;
let tagsCustomOrderSave = Promise.resolve();
let suppressNextTagClick = false;
let tagDragClickResetTimer = null;
// Each left-panel tag (including "all") owns an independent saved order.
let notesCustomOrders = new Map();
let activeCustomDragId = null;
let activeCustomDragElement = null;
let activeCustomDragPointerId = null;
let customDragStartX = 0;
let customDragStartY = 0;
let customDragMoved = false;
let customDropTarget = null;
let customDropBefore = false;
let customDropIndex = null;
let notesCustomOrderSave = Promise.resolve();
let notesSortModeSave = Promise.resolve();
let savedNotesSortMode = null;
let suppressNextCustomSortClick = false;
let customDragClickResetTimer = null;
const NOTES_SORT_LABELS = {
    updated: 'Last edited',
    alphabetical: 'Alphabetical',
    custom: 'Custom order',
};
const NOTES_SORT_ICONS = {
    updated: 'fa-clock-rotate-left',
    alphabetical: 'fa-arrow-down-a-z',
    custom: 'fa-grip-vertical',
};

function normalizeNotesSortMode(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(NOTES_SORT_LABELS, value)
        ? value
        : null;
}

function getNoteIdKey(noteOrId) {
    const value = noteOrId && typeof noteOrId === 'object'
        ? (noteOrId.Id ?? noteOrId.id)
        : noteOrId;
    if (value === null || typeof value === 'undefined') return null;
    const key = String(value);
    return key || null;
}

function parseNotesCustomOrder(value) {
    let parsed = value;
    if (typeof value === 'string') {
        if (!value.trim()) return [];
        try {
            parsed = JSON.parse(value);
        } catch (error) {
            console.warn('Ignoring invalid saved note order:', error);
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed
        .map(getNoteIdKey)
        .filter(id => {
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
}

function getSelectedTagKey() {
    const activeTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
    return activeTag?.dataset.tagId || 'all';
}

function parseNotesCustomOrders(value) {
    let parsed = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return new Map();
        try {
            parsed = JSON.parse(trimmed);
        } catch (error) {
            try {
                parsed = JSON.parse(decodeURIComponent(trimmed));
            } catch {
                console.warn('Ignoring invalid saved note orders:', error);
                return new Map();
            }
        }
    }

    if (Array.isArray(parsed)) {
        // Migrate the original workspace-wide array to the All Tags order.
        return new Map([['all', parseNotesCustomOrder(parsed)]]);
    }
    if (!parsed || typeof parsed !== 'object') return new Map();

    const orders = new Map();
    Object.entries(parsed).forEach(([tagKey, order]) => {
        orders.set(tagKey, parseNotesCustomOrder(order));
    });
    return orders;
}

function getSelectedNotesCustomOrder() {
    return notesCustomOrders.get(getSelectedTagKey()) || [];
}

function persistNotesCustomOrder() {
    const serializable = Object.create(null);
    notesCustomOrders.forEach((order, tagKey) => {
        serializable[tagKey] = parseNotesCustomOrder(order);
    });
    const serialized = encodeURIComponent(JSON.stringify(serializable));
    notesCustomOrderSave = notesCustomOrderSave
        .catch(error => {
            console.error('Failed to save custom note order:', error);
        })
        .then(() => execute('saveSettings', `notesCustomOrder|||${serialized}`))
        .catch(error => {
            console.error('Failed to save custom note order:', error);
        });
}

function removeNoteFromCustomOrder(noteId) {
    const noteIdKey = getNoteIdKey(noteId);
    if (!noteIdKey) return;

    let changed = false;
    notesCustomOrders.forEach((order, tagKey) => {
        const filteredOrder = order.filter(id => id !== noteIdKey);
        if (filteredOrder.length !== order.length) {
            notesCustomOrders.set(tagKey, filteredOrder);
            changed = true;
        }
    });
    if (changed) persistNotesCustomOrder();
}

function compareNoteTitles(a, b) {
    const aTitle = typeof a?.Title === 'string' ? a.Title : '';
    const bTitle = typeof b?.Title === 'string' ? b.Title : '';
    return aTitle.localeCompare(bTitle, undefined, { sensitivity: 'base' });
}

function compareNoteUpdatedDates(a, b) {
    const aTime = Date.parse(typeof a?.Updated === 'string' ? a.Updated : '');
    const bTime = Date.parse(typeof b?.Updated === 'string' ? b.Updated : '');
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);

    if (aValid && bValid && aTime !== bTime) return bTime - aTime;
    if (aValid !== bValid) return aValid ? -1 : 1;
    return compareNoteTitles(a, b);
}

function sortNotesList(items) {
    const selectedNotesCustomOrder = getSelectedNotesCustomOrder();
    const customRanks = notesListSort === 'custom' && customNoteOrderEnabled
        ? new Map(selectedNotesCustomOrder.map((id, index) => [id, index]))
        : null;

    return [...items].sort((a, b) => {
        if (customRanks) {
            const aRank = customRanks.get(getNoteIdKey(a));
            const bRank = customRanks.get(getNoteIdKey(b));
            if (aRank !== undefined || bRank !== undefined) {
                if (aRank === undefined) return 1;
                if (bRank === undefined) return -1;
                if (aRank !== bRank) return aRank - bRank;
            }
            return compareNoteUpdatedDates(a, b);
        }
        if (notesListSort === 'alphabetical') {
            const titleOrder = compareNoteTitles(a, b);
            return titleOrder || compareNoteUpdatedDates(a, b);
        }
        return compareNoteUpdatedDates(a, b);
    });
}

function updateNotesSortMenu() {
    const sortToggle = document.getElementById('notes-sort-toggle');
    const sortMenu = document.getElementById('notes-sort-menu');
    if (!customNoteOrderEnabled && notesListSort === 'custom') {
        notesListSort = 'updated';
    }
    const label = NOTES_SORT_LABELS[notesListSort] || NOTES_SORT_LABELS.updated;
    if (sortToggle) {
        sortToggle.title = `Sort notes: ${label}`;
        sortToggle.setAttribute('aria-label', `Sort notes: ${label}`);
        const icon = sortToggle.querySelector('i');
        if (icon) {
            icon.className = `fa-solid ${NOTES_SORT_ICONS[notesListSort] || NOTES_SORT_ICONS.updated}`;
        }
    }
    if (sortMenu) {
        const customOption = sortMenu.querySelector('[data-sort="custom"]');
        if (customOption) customOption.hidden = !customNoteOrderEnabled;
        sortMenu.querySelectorAll('.notes-sort-option').forEach(option => {
            const isSelected = option.dataset.sort === notesListSort;
            option.setAttribute('aria-checked', isSelected);
        });
    }
}

function setCustomNoteOrderAvailability(enabled) {
    const wasEnabled = customNoteOrderEnabled;
    customNoteOrderEnabled = enabled === true;
    if (customNoteOrderEnabled && savedNotesSortMode === 'custom') {
        notesListSort = 'custom';
    } else if (!customNoteOrderEnabled && notesListSort === 'custom') {
        notesListSort = 'updated';
    }
    updateNotesSortMenu();

    if (wasEnabled !== customNoteOrderEnabled && notesListData.length > 0) {
        renderNotesList(filterNotesList(notesListData));
    }
}

function closeNotesSortMenu() {
    const sortMenu = document.getElementById('notes-sort-menu');
    const sortToggle = document.getElementById('notes-sort-toggle');
    if (!sortMenu || !sortToggle) return;
    sortMenu.classList.remove('open');
    sortToggle.setAttribute('aria-expanded', 'false');
}

function toggleNotesSortMenu() {
    const sortMenu = document.getElementById('notes-sort-menu');
    const sortToggle = document.getElementById('notes-sort-toggle');
    if (!sortMenu || !sortToggle) return;
    const open = sortMenu.classList.toggle('open');
    sortToggle.setAttribute('aria-expanded', open);
    if (open) {
        const selectedOption = sortMenu.querySelector(`[data-sort="${notesListSort}"]`);
        if (selectedOption) selectedOption.focus();
    }
}

window.toggleNotesSortMenu = toggleNotesSortMenu;

function setNotesSort(sort) {
    if (sort === 'custom' && customNoteOrderEnabled) {
        notesListSort = 'custom';
    } else if (sort === 'alphabetical') {
        notesListSort = 'alphabetical';
    } else {
        notesListSort = 'updated';
    }
    savedNotesSortMode = notesListSort;
    notesSortModeSave = notesSortModeSave
        .catch(error => {
            console.error('Failed to save note sort mode:', error);
        })
        .then(() => execute('saveSettings', `notesSortMode|||${notesListSort}`))
        .catch(error => {
            console.error('Failed to save note sort mode:', error);
        });
    updateNotesSortMenu();
    closeNotesSortMenu();
    renderNotesList(filterNotesList(notesListData));
}

window.setNotesSort = setNotesSort;

function setNotesStatusFilter(status) {
    notesListFilter.status = status;
    document.querySelectorAll('#filter-status-options .filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.status === status);
    });
    renderNotesList(filterNotesList(notesListData));
}

// Expose setNotesStatusFilter to window so it can be called from HTML onclick
window.setNotesStatusFilter = setNotesStatusFilter;

function toggleNotesTagFilter(tagName) {
    if (notesListFilter.tags.has(tagName)) {
        notesListFilter.tags.delete(tagName);
    } else {
        notesListFilter.tags.add(tagName);
    }
    document.querySelectorAll('#filter-tag-options .filter-pill').forEach(pill => {
        pill.classList.toggle('active', notesListFilter.tags.has(pill.dataset.tag));
    });
    renderNotesList(filterNotesList(notesListData));
}

// Reset both filters and show the unfiltered list (used when the palette closes)
function clearNotesFilters() {
    notesListFilter.tags.clear();
    document.querySelectorAll('#filter-tag-options .filter-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    setNotesStatusFilter('all'); // updates the status pills and re-renders the list
}

function filterNotesList(items) {
    return items.filter(item => {
        if (notesListFilter.status !== 'all' && item.TaskStatus !== notesListFilter.status) {
            return false;
        }
        const itemTags = item.Tags || [];
        for (const tag of notesListFilter.tags) {
            if (!itemTags.includes(tag)) return false;
        }
        return true;
    });
}

function rebuildNotesTagFilterOptions() {
    const container = document.getElementById('filter-tag-options');
    if (!container) return;

    const activeTag = document.querySelector('.tag-item.active-tag');
    const selectedTagId = activeTag ? activeTag.dataset.tagId : 'all';
    const tagNames = [...new Set(notesListData.flatMap(item => item.Tags || []))]
        .filter(name => name !== selectedTagId)
        .sort((a, b) => a.localeCompare(b));

    // Drop selections for tags no longer present in the loaded notes
    notesListFilter.tags.forEach(tag => {
        if (!tagNames.includes(tag)) notesListFilter.tags.delete(tag);
    });

    container.innerHTML = '';
    if (tagNames.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'filter-empty';
        empty.textContent = 'No other tags';
        container.appendChild(empty);
        return;
    }
    tagNames.forEach(name => {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'filter-pill' + (notesListFilter.tags.has(name) ? ' active' : '');
        pill.dataset.tag = name;
        pill.textContent = name;
        pill.onclick = () => toggleNotesTagFilter(name);
        container.appendChild(pill);
    });
}

function clearCustomSortDragState() {
    document.removeEventListener('pointermove', handleCustomSortPointerMove);
    document.removeEventListener('pointerup', finishCustomSortDrag);
    document.removeEventListener('pointercancel', finishCustomSortDrag);

    const content = document.getElementById('content');
    if (content) {
        content.querySelectorAll('.custom-sort-drop-target').forEach(item => {
            item.classList.remove('custom-sort-drop-target');
        });
        content.querySelectorAll('.notes-drop-indicator').forEach(indicator => {
            indicator.remove();
        });
    }
    if (activeCustomDragElement) {
        activeCustomDragElement.classList.remove('custom-sort-dragging');
    }
    document.body.classList.remove('custom-sort-drag-active');
    activeCustomDragId = null;
    activeCustomDragElement = null;
    activeCustomDragPointerId = null;
    customDragMoved = false;
    customDropTarget = null;
    customDropBefore = false;
    customDropIndex = null;
    if (suppressNextCustomSortClick) {
        if (customDragClickResetTimer) clearTimeout(customDragClickResetTimer);
        customDragClickResetTimer = setTimeout(() => {
            suppressNextCustomSortClick = false;
            customDragClickResetTimer = null;
        }, 750);
    }
}

function findCustomDropPosition(clientX, clientY) {
    const content = document.getElementById('content');
    if (!content || !content.classList.contains('custom-sort-active')) return null;

    const contentBounds = content.getBoundingClientRect();
    if (
        clientX < contentBounds.left ||
        clientX > contentBounds.right ||
        clientY < contentBounds.top ||
        clientY > contentBounds.bottom
    ) {
        return null;
    }

    const rows = Array.from(content.querySelectorAll('.list-item'));
    if (rows.length === 0) return null;

    let insertionIndex = rows.length;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowBounds = row.getBoundingClientRect();
        if (clientY < rowBounds.top + rowBounds.height / 2) {
            insertionIndex = index;
            break;
        }
    }

    const target = rows[Math.min(insertionIndex, rows.length - 1)];
    return {
        target,
        insertionIndex,
        before: insertionIndex < rows.length,
    };
}

function updateCustomDropIndicator(clientX, clientY) {
    const content = document.getElementById('content');
    const position = findCustomDropPosition(clientX, clientY);
    if (!content || !position) {
        if (customDropTarget) {
            customDropTarget.classList.remove('custom-sort-drop-target');
        }
        customDropTarget = null;
        customDropBefore = false;
        customDropIndex = null;
        content?.querySelectorAll('.notes-drop-indicator').forEach(indicator => {
            indicator.remove();
        });
        return;
    }

    if (customDropTarget !== position.target) {
        customDropTarget?.classList.remove('custom-sort-drop-target');
        customDropTarget = position.target;
        customDropTarget.classList.add('custom-sort-drop-target');
    }
    customDropBefore = position.before;
    customDropIndex = position.insertionIndex;

    let indicator = content.querySelector('.notes-drop-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'notes-drop-indicator';
        indicator.className = 'notes-drop-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        content.appendChild(indicator);
    }
    const targetBounds = position.target.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const lineY = (position.before ? targetBounds.top : targetBounds.bottom) - contentBounds.top;
    indicator.style.top = `${Math.round(lineY)}px`;
    indicator.dataset.before = String(position.before);
}

function handleCustomSortPointerMove(event) {
    if (!activeCustomDragId || event.pointerId !== activeCustomDragPointerId) return;

    if (!customDragMoved) {
        const distance = Math.hypot(event.clientX - customDragStartX, event.clientY - customDragStartY);
        if (distance < 4) return;
        customDragMoved = true;
        suppressNextCustomSortClick = true;
    }

    event.preventDefault();
    activeCustomDragElement?.classList.add('custom-sort-dragging');
    document.body.classList.add('custom-sort-drag-active');
    updateCustomDropIndicator(event.clientX, event.clientY);
}

function finishCustomSortDrag(event) {
    if (!activeCustomDragId || event.pointerId !== activeCustomDragPointerId) return;

    const draggedId = activeCustomDragId;
    const insertionIndex = customDropIndex;
    const shouldReorder = customDragMoved && Number.isInteger(insertionIndex);
    clearCustomSortDragState();
    if (shouldReorder) {
        reorderVisibleNotes(draggedId, insertionIndex);
    }
}

function startCustomSortDrag(event, element, noteId) {
    if (activeCustomDragId) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;

    activeCustomDragId = noteId;
    activeCustomDragElement = element;
    activeCustomDragPointerId = event.pointerId;
    customDragStartX = event.clientX;
    customDragStartY = event.clientY;
    customDragMoved = false;
    event.preventDefault();
    event.stopPropagation();
    document.addEventListener('pointermove', handleCustomSortPointerMove, { passive: false });
    document.addEventListener('pointerup', finishCustomSortDrag);
    document.addEventListener('pointercancel', finishCustomSortDrag);
}

function reorderVisibleNotes(draggedId, insertionIndex) {
    if (!customNoteOrderEnabled || notesListSort !== 'custom') return;

    const visibleIds = sortNotesList(filterNotesList(notesListData))
        .map(getNoteIdKey)
        .filter(Boolean);
    const sourceIndex = visibleIds.indexOf(draggedId);
    if (sourceIndex < 0 || !Number.isInteger(insertionIndex)) return;

    const reorderedVisibleIds = visibleIds.filter(id => id !== draggedId);
    const adjustedInsertionIndex = Math.max(
        0,
        Math.min(
            reorderedVisibleIds.length,
            insertionIndex - (sourceIndex < insertionIndex ? 1 : 0),
        ),
    );
    reorderedVisibleIds.splice(adjustedInsertionIndex, 0, draggedId);

    const visibleIdSet = new Set(visibleIds);
    const selectedTagKey = getSelectedTagKey();
    const selectedNotesCustomOrder = getSelectedNotesCustomOrder();
    const mergedOrder = [...selectedNotesCustomOrder];
    // Keep hidden notes in their existing slots when reordering a filtered view.
    const visibleOrderSlots = mergedOrder.reduce((slots, id, index) => {
        if (visibleIdSet.has(id)) slots.push(index);
        return slots;
    }, []);

    if (visibleOrderSlots.length > 0) {
        visibleOrderSlots.forEach((slot, index) => {
            mergedOrder[slot] = reorderedVisibleIds[index];
        });
        const additionalVisibleIds = reorderedVisibleIds.slice(visibleOrderSlots.length);
        if (additionalVisibleIds.length > 0) {
            mergedOrder.splice(visibleOrderSlots[visibleOrderSlots.length - 1] + 1, 0, ...additionalVisibleIds);
        }
    } else {
        mergedOrder.push(...reorderedVisibleIds);
    }

    notesCustomOrders.set(selectedTagKey, parseNotesCustomOrder(mergedOrder));
    persistNotesCustomOrder();
    renderNotesList(filterNotesList(notesListData));
}

function attachCustomSortHandlers(element, item) {
    const noteId = getNoteIdKey(item);
    if (!noteId) return;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'notes-reorder-handle';
    handle.draggable = false;
    handle.setAttribute('aria-label', `Reorder note: ${item.Title || 'Untitled'}`);
    handle.setAttribute('aria-grabbed', 'false');
    handle.title = 'Drag to reorder';
    handle.innerHTML = '<i class="fas fa-grip-vertical" aria-hidden="true"></i>';
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('pointerdown', event => startCustomSortDrag(event, element, noteId));

    element.prepend(handle);
}

// ----- Tasks list "People" filter -----
// Single-select (unlike the notes tag filter): pick one person to narrow the
// currently-loaded task list down to tasks that @mention them. Cleared when
// the filter palette closes.
const tasksListFilter = { person: null };
const personIconDataUrlCache = Object.create(null);

// True when `personName` is null (no filter active) or `taskLine` contains an
// @mention of that exact name (case-insensitive, matching the backend's
// case-insensitive extraction in extract_mentions/ensure_people).
function taskLineMentionsPerson(taskLine, personName) {
    if (!personName) return true;
    const escaped = personName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?<!\\w)@' + escaped + '(?![A-Za-z0-9_-])', 'i');
    return re.test(taskLine || '');
}

// Unique @mention names in `text`, in the order they first appear, deduped
// case-insensitively (matches the backend's case-insensitive extraction in
// extract_mentions/ensure_people). Names are returned as typed.
function extractMentionNames(text) {
    const names = [];
    const re = /(?<!\w)@([A-Za-z0-9_-]+)/g;
    let match;
    while ((match = re.exec(text || '')) !== null) {
        const name = match[1];
        if (!names.some(n => n.toLowerCase() === name.toLowerCase())) {
            names.push(name);
        }
    }
    return names;
}

// Removes @mention tokens from task display text — in the task list, who's
// tagged is shown as avatars in the row's people slot (see
// renderTaskPeopleSlot), so repeating "@Name" inline in the text would just
// be noise. Mirrors stripDateAndUrgentMarker's role for due-date/"!" tokens.
function stripMentions(text) {
    return (text || '')
        .replace(/(?<!\w)@([A-Za-z0-9_-]+)/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Right-aligned avatar strip for everyone @mentioned in a task, appended
// after .task-text-container so flexbox pushes it to the end of the row.
// Icons are drawn from personIconDataUrlCache, warmed by
// rebuildTasksPersonFilterOptions() before the list renders — a name not yet
// in the workspace's people list still gets a default colored-initial avatar.
function renderTaskPeopleSlot(names) {
    if (!names || names.length === 0) return '';
    const chips = names.map(name => {
        const avatar = renderPersonAvatarHTML({ Name: name }, personIconDataUrlCache[name.toLowerCase()]);
        return `<span class="task-person-chip">${avatar}<span class="task-person-name">${escapeHtml(name)}</span></span>`;
    }).join('');
    return `<span class="task-people-slot">${chips}</span>`;
}

function reloadTasksAndDoneForActiveTag() {
    const activeTag = document.querySelector('.tag-item.active-tag');
    const tagIdToFilterBy = activeTag ? activeTag.dataset.tagId : 'all';
    execute('loadTasksByTag', tagIdToFilterBy);
    execute('loadDoneTasksByTag', tagIdToFilterBy);
}

function setTasksPersonFilter(personName) {
    tasksListFilter.person = (tasksListFilter.person === personName) ? null : personName;
    document.querySelectorAll('#todo-filter-person-options .filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.person === tasksListFilter.person);
    });
    reloadTasksAndDoneForActiveTag();
}
window.setTasksPersonFilter = setTasksPersonFilter;

// Reset the person filter and show the unfiltered list (used when the palette closes)
function clearTasksFilters() {
    tasksListFilter.person = null;
    document.querySelectorAll('#todo-filter-person-options .filter-pill').forEach(pill => {
        pill.classList.remove('active');
    });
    reloadTasksAndDoneForActiveTag();
}

// Rebuilds the "People" filter pills from the workspace's people list
// (not from occurrences in the currently loaded tasks — the list is the
// same one editable in Settings, so it reflects everyone ever @mentioned).
async function rebuildTasksPersonFilterOptions() {
    const container = document.getElementById('todo-filter-person-options');
    if (!container) return;
    if (!(window.__TAURI__ && window.__TAURI__.core)) return;
    const invoke = window.__TAURI__.core.invoke;

    let people = [];
    try {
        people = (await invoke('load_people')) || [];
    } catch (e) {
        console.error('load_people failed', e);
    }

    // Drop the selection if that person no longer exists (shouldn't normally
    // happen since the people list is add-only, but keep the UI honest).
    if (tasksListFilter.person && !people.some(p => p.Name === tasksListFilter.person)) {
        tasksListFilter.person = null;
    }

    container.innerHTML = '';
    if (people.length === 0) {
        const empty = document.createElement('span');
        empty.className = 'filter-empty';
        empty.textContent = 'No people tagged yet — use @name in a task';
        container.appendChild(empty);
        return;
    }

    for (const person of people) {
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'filter-pill' + (tasksListFilter.person === person.Name ? ' active' : '');
        pill.dataset.person = person.Name;
        pill.onclick = () => setTasksPersonFilter(person.Name);

        let iconUrl = personIconDataUrlCache[person.Name.toLowerCase()];
        if (!iconUrl && person.Icon) {
            try {
                iconUrl = await invoke('get_person_icon_data_url', { filename: person.Icon });
                personIconDataUrlCache[person.Name.toLowerCase()] = iconUrl;
            } catch (e) {
                console.error('get_person_icon_data_url failed for', person.Name, e);
            }
        }
        pill.innerHTML = renderPersonAvatarHTML(person, iconUrl) + ' ' + escapeHtml(person.Name);
        container.appendChild(pill);
    }
}

function loadNotesByTag(data) {
    console.log("loadNotes called with:", data);

    // Data should already be parsed by the message handler
    if (!Array.isArray(data)) {
        console.warn("Expected array data for loadNotesByTag, got:", typeof data);
        data = [];
    }

    notesListData = data;
    rebuildNotesTagFilterOptions();
    renderNotesList(filterNotesList(data));
}

function renderNotesList(data) {
    const contentDiv = document.getElementById("content"); // This is now inside notes-content
    const customSortActive = notesListSort === 'custom' && customNoteOrderEnabled;
    clearCustomSortDragState();
    contentDiv.classList.toggle('custom-sort-active', customSortActive);
    contentDiv.innerHTML = "";

    // Reset entry navigation when content changes
    resetEntryNavigation();

    const sortedData = sortNotesList(Array.isArray(data) ? data : []);
    if (sortedData.length > 0) {
        sortedData.forEach(item => {
            const element = document.createElement("div");
            element.className = "list-item";
            element.setAttribute("data-id", getNoteIdKey(item) || "");
            element.onclick = function (event) {
                if (suppressNextCustomSortClick) {
                    suppressNextCustomSortClick = false;
                    if (customDragClickResetTimer) {
                        clearTimeout(customDragClickResetTimer);
                        customDragClickResetTimer = null;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                // Store the currently selected tag and tab before navigating to editor
                const activeTag = document.querySelector('.tag-item.active-tag');
                const selectedTagId = activeTag ? activeTag.dataset.tagId : 'all';
                sessionStorage.setItem('lastSelectedTag', selectedTagId);
                
                // Get the currently active tab
                const activeTabButton = document.querySelector('.tab-button.active');
                const selectedTab = activeTabButton ? activeTabButton.getAttribute('data-tab-name') || 'notes' : 'notes';
                sessionStorage.setItem('lastSelectedTab', selectedTab);
                
                navigateWithHistory('editor', item.Id);
            };

            const contentContainer = document.createElement("div");
            contentContainer.className = "list-item-content";

            const titleSpan = document.createElement("span");
            titleSpan.className = "list-item-title";
            titleSpan.textContent = item.Title;

            const dateSpan = document.createElement("span");
            dateSpan.className = "list-item-date";
            dateSpan.textContent = formatDate(item.Updated);

            // If the note is itself a task, show a status marker after the date.
            if (item.TaskStatus) {
                const iconType = { pending: 'pending', in_progress: 'progress', completed: 'complete' }[item.TaskStatus];
                if (iconType) {
                    const statusSpan = document.createElement("span");
                    statusSpan.className = "list-item-task-status";
                    const labels = { pending: 'To do', in_progress: 'In progress', completed: 'Done' };
                    statusSpan.title = 'Task: ' + labels[item.TaskStatus];
                    statusSpan.innerHTML = renderTaskIcon(iconType);
                    dateSpan.appendChild(statusSpan);
                }
            }

            contentContainer.appendChild(titleSpan);
            contentContainer.appendChild(dateSpan);

            const deleteIcon = document.createElement("i");
            deleteIcon.className = "fas fa-trash delete-icon";
            deleteIcon.onclick = function (event) {
                event.stopPropagation();
                showDeleteModal(item.Id);
            };

            element.appendChild(contentContainer);
            element.appendChild(deleteIcon);
            if (customSortActive) {
                attachCustomSortHandlers(element, item);
            }
            contentDiv.appendChild(element);
        });
    } else {
        contentDiv.innerHTML = `<div class="no-notes-container"><i class="far fa-note-sticky"></i></div>`; // Changed icon to fa-note-sticky
    }
}

// Graph tab state: the fetched goals/notes/references (rebuilt whenever the
// tab reloads — tag change, note edit, etc.) and the current highlighted
// node. Only one node is highlighted at a time; for a child (task/link) node,
// only the path from its goal down to it stays expanded — highlighting a node
// collapses any other branch. `graphNavIndex` (rebuilt on every render) maps
// each node's key to its parent/sibling/first-child keys, for arrow-key nav.
let graphData = null; // { goals, notesById, docToNoteId }
let graphHighlightedKey = null;
let graphNavIndex = new Map();

function openGraphNote(noteId) {
    const activeTag = document.querySelector('.tag-item.active-tag');
    sessionStorage.setItem('lastSelectedTag', activeTag ? activeTag.dataset.tagId : 'all');
    sessionStorage.setItem('lastSelectedTab', 'graph');
    navigateWithHistory('editor', noteId);
}

function graphStatusToIcon(status) {
    return status === 'in_progress' ? 'progress'
        : status === 'completed' ? 'complete'
        : status === 'question' ? 'question'
        : 'pending';
}

// Parse a note's body into a forest of items, unifying task lines, questions
// and whole-line `[[docId]]` note-links, nested by indentation (two spaces
// per level). Each item: { kind:'task'|'link', text?, state?, docId?,
// noteRef?, children:[] }.
function parseGraphBody(content) {
    const flat = [];
    (content || '').split(/\r?\n/).forEach(raw => {
        const trimmed = raw.replace(/^\s+/, '');
        if (!trimmed) return;
        const indent = Math.floor((raw.length - trimmed.length) / 2);

        const linkM = trimmed.match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/);
        if (linkM) {
            flat.push({ kind: 'link', docId: linkM[1].trim(), indent, children: [] });
            return;
        }

        let state = null;
        let text = null;
        const taskM = trimmed.match(/^([-\/|])\s+(.*)$/);
        const qM = trimmed.match(/^[Qq]\.\s+(.*)$/);
        if (taskM) {
            state = taskM[1] === '/' ? 'progress' : taskM[1] === '|' ? 'complete' : 'pending';
            text = taskM[2];
        } else if (qM) {
            state = 'question';
            text = qM[1];
        } else {
            return; // not a task or link line
        }

        // Peel the trailing {"_id":...,"_noteId":...} metadata, capturing any
        // note reference it carries.
        let noteRef = null;
        const jsonM = text.match(/\s*(\{.*\})\s*$/);
        if (jsonM) {
            try {
                const meta = JSON.parse(jsonM[1]);
                if (meta && (meta._id || meta._noteId)) {
                    text = text.slice(0, jsonM.index);
                    if (meta._noteId) noteRef = meta._noteId;
                }
            } catch (e) { /* not metadata — leave the text as-is */ }
        }
        text = stripDateAndUrgentMarker(text).trim();
        flat.push({ kind: 'task', state, text, noteRef, indent, children: [] });
    });

    // Nest items by indentation into a tree.
    const roots = [];
    const stack = [];
    flat.forEach(item => {
        while (stack.length && stack[stack.length - 1].indent >= item.indent) stack.pop();
        if (stack.length) stack[stack.length - 1].children.push(item);
        else roots.push(item);
        stack.push(item);
    });
    return roots;
}

// Build the logical node for one parsed item (and its subtree), following any
// reference into the linked note's body. `ownerNoteId` is the note the item
// lives in (opened via the item's own note otherwise); `visited` guards
// cycles. `key` is a path of child indices from the item's goal, stable
// across re-renders as long as the underlying data hasn't changed — it's how
// a node's expand/select state survives a re-render.
function buildGraphItemNode(item, ownerNoteId, visited, key, notesById, docToNoteId) {
    let title, iconType, refNoteId = null;
    if (item.kind === 'link') {
        refNoteId = docToNoteId.get(item.docId);
        const refNote = refNoteId != null ? notesById.get(refNoteId) : null;
        title = refNote ? refNote.Title : '(missing note)';
        // A linked task-note shows its task-status icon; a plain note link
        // shows no icon.
        iconType = refNote && refNote.TaskStatus ? graphStatusToIcon(refNote.TaskStatus) : null;
    } else {
        title = item.text;
        iconType = item.state;
        if (item.noteRef) refNoteId = docToNoteId.get(item.noteRef);
    }
    const isRef = refNoteId != null;
    const openTarget = isRef ? refNoteId : ownerNoteId;

    const children = [];
    // Inline children (nested by indentation within the same note).
    item.children.forEach(c => {
        children.push(buildGraphItemNode(c, ownerNoteId, visited, key + '-' + children.length, notesById, docToNoteId));
    });
    // Followed reference: pull the tasks out of the linked note's body.
    if (isRef && !visited.has(refNoteId)) {
        visited.add(refNoteId);
        const refNote = notesById.get(refNoteId);
        if (refNote) {
            parseGraphBody(refNote.Content).forEach(c => {
                children.push(buildGraphItemNode(c, refNoteId, visited, key + '-' + children.length, notesById, docToNoteId));
            });
        }
        visited.delete(refNoteId);
    }

    return { key, title, iconType, isRef, openTarget, children, isGoal: false };
}

function buildGraphGoalTree(goal, notesById, docToNoteId) {
    const key = 'g' + goal.Id;
    const visited = new Set([goal.Id]);
    const children = [];
    parseGraphBody(goal.Content).forEach(item => {
        children.push(buildGraphItemNode(item, goal.Id, visited, key + '-' + children.length, notesById, docToNoteId));
    });
    return { key, title: goal.Title, openTarget: goal.Id, children, isGoal: true };
}

// A node's children are visible if it's a goal (always shows its immediate
// children), it's exactly the highlighted node, or it's an ancestor of the
// highlighted node (so the drill-down path stays visible as you go deeper).
function isGraphNodeExpanded(node) {
    if (node.isGoal) return true;
    if (!graphHighlightedKey) return false;
    return graphHighlightedKey === node.key || graphHighlightedKey.startsWith(node.key + '-');
}

// Walk the forest of goal trees, recording each node's parent key, its
// siblings' keys (in order, including itself), and its first child's key —
// everything arrow-key navigation needs to move between nodes.
function indexGraphNav(nodes, parentKey, navIndex) {
    const siblingKeys = nodes.map(n => n.key);
    nodes.forEach(n => {
        navIndex.set(n.key, {
            parentKey,
            siblingKeys,
            firstChildKey: n.children.length > 0 ? n.children[0].key : null,
        });
        indexGraphNav(n.children, n.key, navIndex);
    });
}

// Render a child (task/link) node as a box plus, if expanded, its children
// column. Clicking the box highlights it, re-rendering so only its drill-down
// path stays expanded; clicking it again (already highlighted) moves the
// highlight back up to its parent. The hover-revealed icon opens its note
// directly instead, without changing the highlight.
function renderGraphChildNode(node) {
    const wrap = document.createElement("div");
    wrap.className = "graph-node";

    const box = document.createElement("div");
    box.className = node.isRef ? "graph-task-box graph-task-ref" : "graph-task-box";
    box.setAttribute("data-graph-key", node.key);
    if (node.iconType) box.insertAdjacentHTML('beforeend', renderTaskIcon(node.iconType));
    const span = document.createElement("span");
    span.className = "graph-task-text";
    span.textContent = node.title;
    box.appendChild(span);

    const expanded = isGraphNodeExpanded(node);
    // A node with children that aren't currently shown gets a small chevron
    // so it's clear there's more to drill into — otherwise a collapsed
    // branch looks indistinguishable from a childless leaf.
    if (node.children.length > 0 && !expanded) {
        const indicator = document.createElement("i");
        indicator.className = "fas fa-chevron-right graph-children-indicator";
        indicator.title = "Has hidden children";
        box.appendChild(indicator);
    }

    if (node.openTarget != null) {
        const openIcon = document.createElement("i");
        openIcon.className = "fas fa-arrow-up-right-from-square graph-open-icon";
        openIcon.title = "Open note";
        openIcon.onclick = function (event) {
            event.stopPropagation();
            openGraphNote(node.openTarget);
        };
        box.appendChild(openIcon);
    }

    if (graphHighlightedKey === node.key) box.classList.add("graph-node-selected");
    box.onclick = function () {
        if (graphHighlightedKey === node.key) {
            const info = graphNavIndex.get(node.key);
            graphHighlightedKey = info ? info.parentKey : null;
        } else {
            graphHighlightedKey = node.key;
        }
        renderGraphCanvas();
    };
    wrap.appendChild(box);

    if (expanded && node.children.length > 0) {
        const childCol = document.createElement("div");
        childCol.className = "graph-children";
        node.children.forEach(c => childCol.appendChild(renderGraphChildNode(c)));
        wrap.appendChild(childCol);
    }
    return wrap;
}

function renderGraphGoalRow(tree) {
    const row = document.createElement("div");
    row.className = "graph-row";

    // SVG overlay for the connector lines (populated after layout).
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'graph-connectors');
    row.appendChild(svg);

    const box = document.createElement("div");
    box.className = "graph-goal-box";
    box.setAttribute("data-id", tree.openTarget);
    box.setAttribute("data-graph-key", tree.key);
    if (graphHighlightedKey === tree.key) box.classList.add("graph-node-selected");
    box.textContent = tree.title;
    box.onclick = function () { openGraphNote(tree.openTarget); };
    row.appendChild(box);

    if (tree.children.length > 0) {
        const childCol = document.createElement("div");
        childCol.className = "graph-children";
        tree.children.forEach(c => childCol.appendChild(renderGraphChildNode(c)));
        row.appendChild(childCol);
    }

    return row;
}

// Scroll the currently highlighted node's box into view — needed since
// arrow-key navigation can move the highlight somewhere the previous layout
// had scrolled out of view.
function scrollGraphHighlightIntoView() {
    if (!graphHighlightedKey) return;
    const el = document.querySelector(`#graph-content [data-graph-key="${graphHighlightedKey}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// (Re)render the Graph tab from the cached `graphData` and the current
// `graphHighlightedKey`, without refetching — used both for the initial load
// and for every highlight change (click or arrow key).
function renderGraphCanvas() {
    const container = document.getElementById("graph-content");
    if (!container || !graphData) return;

    const trees = graphData.goals.map(goal => buildGraphGoalTree(goal, graphData.notesById, graphData.docToNoteId));

    graphNavIndex = new Map();
    indexGraphNav(trees, null, graphNavIndex);

    const canvas = document.createElement("div");
    canvas.className = "graph-canvas";
    trees.forEach(tree => canvas.appendChild(renderGraphGoalRow(tree)));

    container.innerHTML = "";
    container.appendChild(canvas);
    scrollGraphHighlightIntoView();

    // Draw the connectors once the browser has laid the boxes out.
    requestAnimationFrame(drawAllGraphConnectors);
}

// Move the highlight per an arrow key: Right into the first child, Left back
// to the parent, Up/Down to the previous/next sibling. A boundary (e.g.
// Right on a childless node, Up on the first sibling) is a no-op.
function handleGraphArrowKey(key) {
    if (!graphHighlightedKey) return;
    const info = graphNavIndex.get(graphHighlightedKey);
    if (!info) return;

    let nextKey = null;
    if (key === 'ArrowRight') {
        nextKey = info.firstChildKey;
    } else if (key === 'ArrowLeft') {
        nextKey = info.parentKey;
    } else {
        const idx = info.siblingKeys.indexOf(graphHighlightedKey);
        const delta = key === 'ArrowUp' ? -1 : 1;
        nextKey = info.siblingKeys[idx + delta] || null;
    }
    if (nextKey == null) return;

    graphHighlightedKey = nextKey;
    renderGraphCanvas();
}

// Arrow-key navigation only applies while the Graph tab is active and focus
// isn't in a text input elsewhere on the page. Stops the event immediately so
// the sidebar's own arrow-key tab/tag/entry navigation (registered later on
// `document`, see `handleMenuKeyDown`) doesn't also see it and steal focus
// away from the Graph tab.
document.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const graphContent = document.getElementById('graph-content');
    if (!graphContent || !graphContent.classList.contains('active-content') || !graphData) return;
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    handleGraphArrowKey(event.key);
});

// Load the Graph tab: each goal note (NoteType === 'G') for the selected tag
// as a row — the goal box on the left, and a tree branching to its right built
// from the goal's body: its tasks (nested by indentation), and any references
// (`[[docId]]` note-links or a task's `_noteId`) followed into the linked note
// to pull out that note's tasks in turn. Only the goal and its immediate
// children show by default; clicking a child drills into its own children —
// see `renderGraphChildNode`.
async function loadGraphGoals(tagId) {
    const container = document.getElementById("graph-content");
    if (!container) return;

    const tag = tagId || 'all';
    let goalNotes = [];
    let allNotes = [];
    try {
        if (IS_TAURI) {
            // Goals are filtered by the selected tag; every note's body is loaded
            // ('all', with content) so references can be followed into notes that
            // may sit under a different tag.
            [goalNotes, allNotes] = await Promise.all([
                window.__TAURI__.core.invoke('load_notes_by_tag', { tag, includeContent: true }),
                window.__TAURI__.core.invoke('load_notes_by_tag', { tag: 'all', includeContent: true })
            ]);
        }
    } catch (err) {
        console.error("Failed to load graph data:", err);
    }

    // The Note model serializes `note_type` as PascalCase `NoteType`.
    const goals = Array.isArray(goalNotes)
        ? goalNotes.filter(n => (n.NoteType || n.Type || n.note_type) === 'G')
        : [];

    if (goals.length === 0) {
        graphData = null;
        graphHighlightedKey = null;
        container.innerHTML = `<div class="no-notes-container graph-empty">`
            + `<i class="far fa-circle"></i>`
            + `<span>No goals to show yet. Switch a note to be a Goal `
            + `(using the Note / Task / Goal control in the editor) to see it here.</span>`
            + `</div>`;
        return;
    }

    // Index every note by its numeric id, so a reference can be followed into
    // the linked note's body.
    const notesById = new Map();
    if (Array.isArray(allNotes)) allNotes.forEach(n => notesById.set(n.Id, n));

    // References point at notes by document id — either a `[[docId]]` note-link
    // or a task line's `_noteId`. Collect every referenced doc id across all
    // bodies and resolve them to numeric ids up front, so rendering can follow
    // them synchronously.
    const docToNoteId = new Map();
    if (IS_TAURI && Array.isArray(allNotes)) {
        const docIds = new Set();
        allNotes.forEach(n => {
            const c = n.Content || '';
            let m;
            const linkRe = /\[\[([^\]|\n]+)/g;
            while ((m = linkRe.exec(c))) docIds.add(m[1].trim());
            const noteIdRe = /"_noteId"\s*:\s*"([^"]+)"/g;
            while ((m = noteIdRe.exec(c))) docIds.add(m[1]);
        });
        await Promise.all([...docIds].map(async docId => {
            try {
                const id = await window.__TAURI__.core.invoke('resolve_note_by_doc_id', { docId });
                if (id != null) docToNoteId.set(docId, id);
            } catch (e) {
                console.error("Failed to resolve linked note", docId, e);
            }
        }));
    }

    graphData = { goals, notesById, docToNoteId };
    // Highlight the first goal by default whenever the tab (re)loads.
    graphHighlightedKey = 'g' + goals[0].Id;
    renderGraphCanvas();
}
window.loadGraphGoals = loadGraphGoals;

// Draw the goal→task and task→sub-task connector lines for one row's whole
// subtree onto its SVG overlay.
function drawGraphConnectors(row) {
    const svg = row.querySelector(':scope > svg.graph-connectors');
    if (!svg) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const rowRect = row.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${rowRect.width} ${rowRect.height}`);

    const color = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-border').trim() || '#ccc';

    // One trunk line leaves the parent's right edge and runs to a shared
    // branch point halfway to its children; from there a single vertical
    // spine spans the children's vertical range, with a short horizontal
    // spur off to each child. This reads as one line splitting into its
    // children rather than a separate line per child.
    const drawGroupConnector = function (fromBox, childBoxes) {
        if (childBoxes.length === 0) return;
        const fr = fromBox.getBoundingClientRect();
        const sx = fr.right - rowRect.left;
        const sy = fr.top + fr.height / 2 - rowRect.top;

        const childPoints = childBoxes.map(box => {
            const r = box.getBoundingClientRect();
            return { x: r.left - rowRect.left, y: r.top + r.height / 2 - rowRect.top };
        });

        // All children share the same left edge (they're stacked in one
        // column), so a single branch x-position works for every spur.
        const branchX = (sx + childPoints[0].x) / 2;
        const minY = Math.min(sy, ...childPoints.map(p => p.y));
        const maxY = Math.max(sy, ...childPoints.map(p => p.y));

        let d = `M ${sx} ${sy} H ${branchX}`;
        if (maxY > minY) d += ` M ${branchX} ${minY} V ${maxY}`;
        childPoints.forEach(p => { d += ` M ${branchX} ${p.y} H ${p.x}`; });

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
    };

    // Every box that owns a children column links to each direct child's box.
    // The goal box sits directly under the row; task boxes under a .graph-node.
    const parents = [row, ...row.querySelectorAll('.graph-node')];
    parents.forEach(parent => {
        const box = parent.querySelector(':scope > .graph-goal-box, :scope > .graph-task-box');
        const childCol = parent.querySelector(':scope > .graph-children');
        if (!box || !childCol) return;
        const childBoxes = Array.from(childCol.children)
            .map(childNode => childNode.querySelector(':scope > .graph-task-box'))
            .filter(Boolean);
        drawGroupConnector(box, childBoxes);
    });
}

function drawAllGraphConnectors() {
    document.querySelectorAll('#graph-content .graph-row').forEach(drawGraphConnectors);
}

// Keep the connectors aligned when the window (and thus box positions) changes.
window.addEventListener('resize', function () {
    const graph = document.getElementById('graph-content');
    if (graph && graph.classList.contains('active-content')) {
        drawAllGraphConnectors();
    }
});

function deleteNoteResponse(data) {
    console.log("deleteNoteResponse called with:", data);
    if (data && data.status === 200) {
        const noteId = data.id;
        removeNoteFromCustomOrder(noteId);

        // Remove note from notes list
        const noteElement = document.querySelector(`.list-item[data-id="${noteId}"]`);
        if (noteElement) {
            noteElement.remove();
            console.log(`Note with ID ${noteId} has been deleted from UI.`);

            // If no notes left, show the empty state
            const contentDiv = document.getElementById("content");
            if (contentDiv && contentDiv.children.length === 0) {
                contentDiv.innerHTML = `<div class="no-notes-container"><i class="far fa-note-sticky"></i></div>`;
            }
        } else {
            console.warn(`Note with ID ${noteId} not found in the DOM.`);
        }

        // Remove all tasks associated with this note from both todo and done tabs
        const taskElements = document.querySelectorAll(`.task-list-item[data-note-id="${noteId}"]`);
        if (taskElements.length > 0) {
            console.log(`Removing ${taskElements.length} tasks associated with note ${noteId}`);
            taskElements.forEach(taskElement => taskElement.remove());

            // Check if todo tab is now empty
            const todoContent = document.getElementById("todo-tasks-list");
            const todoList = todoContent ? todoContent.querySelector('ul') : null;
            if (todoList && todoList.children.length === 0) {
                todoContent.innerHTML = `<div class="no-notes-container"><span style="display: inline-block; width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--color-text); background: transparent;"></span></div>`;
            }

            // Check if done tab is now empty
            const doneContent = document.getElementById("done-content");
            const doneList = doneContent ? doneContent.querySelector('ul') : null;
            if (doneList && doneList.children.length === 0) {
                const iconSize = 48;
                const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#66CB37';
                const largeIcon = `<svg class="task-icon" width="${iconSize}" height="${iconSize}" viewBox="0 0 16 16" style="display: block;">
                    <circle cx="8" cy="8" r="7" fill="${primaryColor}"/>
                </svg>`;
                doneContent.innerHTML = `<div class="no-notes-container" style="flex-direction: column; gap: 12px;">${largeIcon}<span style="color: var(--color-text-secondary); font-size: 0.95em;">no complete tasks</span></div>`;
            }
        }

        // Update the stored original data arrays to remove deleted note's data
        if (originalNotesData.length > 0) {
            originalNotesData = originalNotesData.filter(note => note.Id !== noteId);
        }
        if (originalTasksData.length > 0) {
            originalTasksData = originalTasksData.filter(task => task.NoteId !== noteId);
        }

        // Store currently selected tag before refreshing
        const activeTag = document.querySelector('.tag-item.active-tag');
        previouslySelectedTag = activeTag ? activeTag.dataset.tagId : 'all';
        pendingTagSelectionCheck = true;

        // Refresh the tag list to remove any orphaned tags
        execute('getTags', '');
    } else {
        console.error("Failed to delete note. Status:", data ? data.status : "Unknown");
    }
}

// Expose deleteNoteResponse to window so it can be called from common.js
window.deleteNoteResponse = deleteNoteResponse;

function getTagName(tagOrName) {
    const value = tagOrName && typeof tagOrName === 'object'
        ? (tagOrName.Name ?? tagOrName.name)
        : tagOrName;
    if (value === null || typeof value === 'undefined') return '';
    return String(value);
}

function isFavouriteTag(tag) {
    return tag?.IsFavourite === true || tag?.isFavourite === true;
}

function parseTagsCustomOrder(value) {
    let parsed = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
            parsed = JSON.parse(trimmed);
        } catch (error) {
            try {
                parsed = JSON.parse(decodeURIComponent(trimmed));
            } catch {
                console.warn('Ignoring invalid saved tag order:', error);
                return [];
            }
        }
    }

    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    return parsed
        .map(getTagName)
        .filter(name => {
            if (!name || seen.has(name)) return false;
            seen.add(name);
            return true;
        });
}

function getRegularTagNames() {
    return (Array.isArray(originalTagsData) ? originalTagsData : [])
        .filter(tag => !isFavouriteTag(tag))
        .map(getTagName)
        .filter(Boolean);
}

function getOrderedRegularTagNames() {
    const names = getRegularTagNames();
    const knownNames = new Set(names);
    const savedNames = tagsCustomOrder.filter(name => knownNames.has(name));
    const savedNameSet = new Set(savedNames);
    return [
        ...savedNames,
        ...names.filter(name => !savedNameSet.has(name)),
    ];
}

function sortRegularTagsForDisplay(tags) {
    if (!customTagOrderEnabled) return tags;

    const ranks = new Map(tagsCustomOrder.map((name, index) => [name, index]));
    return [...tags].sort((a, b) => {
        const aName = getTagName(a);
        const bName = getTagName(b);
        const aRank = ranks.get(aName);
        const bRank = ranks.get(bName);

        if (aRank !== undefined || bRank !== undefined) {
            if (aRank === undefined) return 1;
            if (bRank === undefined) return -1;
            if (aRank !== bRank) return aRank - bRank;
        }
        return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });
}

function persistTagsCustomOrder() {
    const serialized = encodeURIComponent(JSON.stringify(parseTagsCustomOrder(tagsCustomOrder)));
    tagsCustomOrderSave = tagsCustomOrderSave
        .catch(error => {
            console.error('Failed to save custom tag order:', error);
        })
        .then(() => execute('saveSettings', `tagsCustomOrder|||${serialized}`))
        .catch(error => {
            console.error('Failed to save custom tag order:', error);
        });
}

function rerenderTagsPreservingSelection() {
    const activeTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
    if (activeTag?.dataset.tagId) {
        sessionStorage.setItem('lastSelectedTag', activeTag.dataset.tagId);
    }
    if (Array.isArray(originalTagsData)) {
        getTags(originalTagsData);
    }
}

function getVisibleTagRows() {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return [];
    return Array.from(tagList.querySelectorAll('.tag-item[data-tag-id]'))
        .filter(row => row.dataset.tagId !== 'all' && row.style.display !== 'none');
}

function clearTagDragState() {
    document.removeEventListener('pointermove', handleTagDragPointerMove);
    document.removeEventListener('pointerup', finishTagDrag);
    document.removeEventListener('pointercancel', finishTagDrag);

    const tagList = document.getElementById('tag-list');
    if (tagList) {
        tagList.querySelectorAll('.tag-sort-drop-target').forEach(item => {
            item.classList.remove('tag-sort-drop-target');
        });
        tagList.querySelectorAll('.tag-drop-indicator').forEach(indicator => {
            indicator.remove();
        });
    }
    activeTagDragElement?.classList.remove('tag-sort-dragging');
    document.body.classList.remove('tag-sort-drag-active');
    activeTagDragName = null;
    activeTagDragElement = null;
    activeTagDragPointerId = null;
    tagDragMoved = false;
    tagDropTarget = null;
    tagDropBefore = false;
    tagDropIndex = null;
    if (suppressNextTagClick) {
        if (tagDragClickResetTimer) clearTimeout(tagDragClickResetTimer);
        tagDragClickResetTimer = setTimeout(() => {
            suppressNextTagClick = false;
            tagDragClickResetTimer = null;
        }, 750);
    }
}

function findTagDropPosition(clientX, clientY) {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return null;

    const listBounds = tagList.getBoundingClientRect();
    if (
        clientX < listBounds.left ||
        clientX > listBounds.right ||
        clientY < listBounds.top ||
        clientY > listBounds.bottom
    ) {
        return null;
    }

    const rows = getVisibleTagRows();
    if (rows.length === 0) return null;

    let insertionIndex = rows.length;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowBounds = row.getBoundingClientRect();
        if (clientY < rowBounds.top + rowBounds.height / 2) {
            insertionIndex = index;
            break;
        }
    }

    const target = rows[Math.min(insertionIndex, rows.length - 1)];
    return {
        target,
        insertionIndex,
        before: insertionIndex < rows.length,
    };
}

function updateTagDropIndicator(clientX, clientY) {
    const tagList = document.getElementById('tag-list');
    const position = findTagDropPosition(clientX, clientY);
    if (!tagList || !position) {
        tagDropTarget?.classList.remove('tag-sort-drop-target');
        tagDropTarget = null;
        tagDropBefore = false;
        tagDropIndex = null;
        tagList?.querySelectorAll('.tag-drop-indicator').forEach(indicator => indicator.remove());
        return;
    }

    if (tagDropTarget !== position.target) {
        tagDropTarget?.classList.remove('tag-sort-drop-target');
        tagDropTarget = position.target;
        tagDropTarget.classList.add('tag-sort-drop-target');
    }
    tagDropBefore = position.before;
    tagDropIndex = position.insertionIndex;

    let indicator = tagList.querySelector('.tag-drop-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'tag-drop-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        tagList.appendChild(indicator);
    }
    const targetBounds = position.target.getBoundingClientRect();
    const listBounds = tagList.getBoundingClientRect();
    const lineY = (position.before ? targetBounds.top : targetBounds.bottom) - listBounds.top;
    indicator.style.top = `${Math.round(lineY)}px`;
}

function handleTagDragPointerMove(event) {
    if (!activeTagDragName || event.pointerId !== activeTagDragPointerId) return;

    if (!tagDragMoved) {
        const distance = Math.hypot(event.clientX - tagDragStartX, event.clientY - tagDragStartY);
        if (distance < 4) return;
        tagDragMoved = true;
        suppressNextTagClick = true;
    }

    event.preventDefault();
    activeTagDragElement?.classList.add('tag-sort-dragging');
    document.body.classList.add('tag-sort-drag-active');
    updateTagDropIndicator(event.clientX, event.clientY);
}

function finishTagDrag(event) {
    if (!activeTagDragName || event.pointerId !== activeTagDragPointerId) return;

    const draggedName = activeTagDragName;
    const insertionIndex = tagDropIndex;
    const shouldReorder = tagDragMoved && Number.isInteger(insertionIndex);
    clearTagDragState();
    if (shouldReorder) {
        reorderVisibleTags(draggedName, insertionIndex);
    }
}

function startTagDrag(event, element, tagName) {
    if (!customTagOrderEnabled || activeTagDragName) return;
    if (event.button !== 0 && event.pointerType !== 'touch') return;

    activeTagDragName = tagName;
    activeTagDragElement = element;
    activeTagDragPointerId = event.pointerId;
    tagDragStartX = event.clientX;
    tagDragStartY = event.clientY;
    tagDragMoved = false;
    event.preventDefault();
    event.stopPropagation();
    document.addEventListener('pointermove', handleTagDragPointerMove, { passive: false });
    document.addEventListener('pointerup', finishTagDrag);
    document.addEventListener('pointercancel', finishTagDrag);
}

function reorderVisibleTags(draggedName, insertionIndex) {
    if (!customTagOrderEnabled) return;

    const visibleNames = getVisibleTagRows().map(row => getTagName(row.dataset.tagId));
    const sourceIndex = visibleNames.indexOf(draggedName);
    if (sourceIndex < 0 || !Number.isInteger(insertionIndex)) return;

    const reorderedVisibleNames = visibleNames.filter(name => name !== draggedName);
    const adjustedInsertionIndex = Math.max(
        0,
        Math.min(
            reorderedVisibleNames.length,
            insertionIndex - (sourceIndex < insertionIndex ? 1 : 0),
        ),
    );
    reorderedVisibleNames.splice(adjustedInsertionIndex, 0, draggedName);

    const currentOrder = getOrderedRegularTagNames();
    const visibleNameSet = new Set(visibleNames);
    const mergedOrder = [...currentOrder];
    const visibleOrderSlots = mergedOrder.reduce((slots, name, index) => {
        if (visibleNameSet.has(name)) slots.push(index);
        return slots;
    }, []);

    if (visibleOrderSlots.length > 0) {
        visibleOrderSlots.forEach((slot, index) => {
            mergedOrder[slot] = reorderedVisibleNames[index];
        });
        const additionalVisibleNames = reorderedVisibleNames.slice(visibleOrderSlots.length);
        if (additionalVisibleNames.length > 0) {
            mergedOrder.splice(visibleOrderSlots[visibleOrderSlots.length - 1] + 1, 0, ...additionalVisibleNames);
        }
    } else {
        mergedOrder.push(...reorderedVisibleNames);
    }

    tagsCustomOrder = parseTagsCustomOrder(mergedOrder);
    persistTagsCustomOrder();
    rerenderTagsPreservingSelection();
}

function attachTagReorderHandlers(element, item) {
    const tagName = getTagName(item);
    if (!tagName) return;

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'tags-reorder-handle tag-reorder-handle';
    handle.draggable = false;
    handle.setAttribute('aria-label', `Reorder tag: ${tagName}`);
    handle.setAttribute('aria-grabbed', 'false');
    handle.title = 'Drag to reorder';
    handle.innerHTML = '<i class="fas fa-grip-vertical" aria-hidden="true"></i>';
    handle.addEventListener('click', event => event.stopPropagation());
    handle.addEventListener('pointerdown', event => startTagDrag(event, element, tagName));
    element.prepend(handle);
}

function setCustomTagOrderAvailability(enabled) {
    const wasEnabled = customTagOrderEnabled;
    customTagOrderEnabled = enabled === true;
    if (!customTagOrderEnabled) clearTagDragState();

    const tagList = document.getElementById('tag-list');
    if (tagList) {
        tagList.classList.toggle('custom-tag-order-enabled', customTagOrderEnabled);
    }

    if (wasEnabled !== customTagOrderEnabled && Array.isArray(originalTagsData) && originalTagsData.length > 0) {
        rerenderTagsPreservingSelection();
    }
}


function getTags(tagsData) {
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║                                                  ║");
    console.log("║         GET TAGS FUNCTION CALLED                 ║");
    console.log("║                                                  ║");
    console.log("╚══════════════════════════════════════════════════╝");
    console.log("→ Entry point");
    console.log("  Timestamp:", new Date().toISOString());
    console.log("  Arguments received:", arguments.length);
    console.log("  Argument 0 (tagsData):", tagsData);
    console.log("  Tags data type:", typeof tagsData);
    console.log("  Is array:", Array.isArray(tagsData));
    console.log("  Tags count:", tagsData ? tagsData.length : 0);

    if (tagsData && Array.isArray(tagsData)) {
        console.log("→ Tag data details:");
        tagsData.forEach((tag, i) => {
            console.log(`  [${i}]:`, JSON.stringify(tag));
        });
    }

    console.log("→ Looking for tag-list element in DOM");
    const tagList = document.getElementById('tag-list');
    console.log("  getElementById('tag-list') returned:", tagList);
    console.log("  Element exists:", !!tagList);
    console.log("  Element type:", tagList ? tagList.tagName : 'N/A');
    console.log("  Element class:", tagList ? tagList.className : 'N/A');

    if (!tagList) {
        console.error("✗ CRITICAL: Tag list element not found!");
        console.error("  Searched for: 'tag-list'");
        console.error("  All elements with id:", document.querySelectorAll('[id]'));
        return;
    }

    // Tag refreshes replace the project rows. Keep an already selected tag
    // selected so an external-change notification cannot strand the Home tab
    // without an active project.
    const activeTagBeforeRefresh = document.querySelector(
        '#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag',
    );
    const activeTagIdBeforeRefresh = activeTagBeforeRefresh?.dataset.tagId || null;
    const storedTagId = sessionStorage.getItem('lastSelectedTag');
    const preserveActiveTag = activeTagIdBeforeRefresh &&
        !(activeTagIdBeforeRefresh === 'all' && storedTagId);

    originalTagsData = Array.isArray(tagsData) ? tagsData : [];
    clearTagDragState();

    console.log("→ Current tag list contents:");
    console.log("  Inner HTML length:", tagList.innerHTML.length);
    console.log("  Child count:", tagList.children.length);
    console.log("  Children:", Array.from(tagList.children).map(c => c.textContent));

    // Remove previously dynamically loaded tags (all <li> elements except the one for 'All Tags')
    console.log("→ Removing existing dynamic tags");
    const dynamicTags = tagList.querySelectorAll('li.tag-item:not([data-tag-id="all"])');
    console.log("  Found", dynamicTags.length, "dynamic tags to remove");
    dynamicTags.forEach((tag, i) => {
        console.log(`  Removing tag ${i}:`, tag.textContent);
        tag.remove();
    });
    console.log("  ✓ Removal complete");

    // Clear and populate the Projects section (favourite tags)
    const projectsList = document.getElementById('projects-list');
    const projectsSection = document.getElementById('projects-section');
    projectsList.innerHTML = '';

    if (originalTagsData.length > 0) {
        const favourites = originalTagsData.filter(isFavouriteTag);
        const nonFavourites = sortRegularTagsForDisplay(
            originalTagsData.filter(item => !isFavouriteTag(item)),
        );

        // Show/hide Projects section
        projectsSection.style.display = favourites.length > 0 ? '' : 'none';

        // Render favourite tags as projects
        favourites.forEach((item) => {
            const listItem = document.createElement('li');
            listItem.className = 'tag-item project-item favourite-tag';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tag-name';
            nameSpan.textContent = item.Name;

            const favBtn = document.createElement('span');
            favBtn.className = 'tag-fav-btn';
            favBtn.innerHTML = '<i class="fas fa-star"></i>';
            favBtn.title = 'Remove from projects';
            favBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                execute('toggleTagFavourite', item.Name);
            });

            listItem.appendChild(nameSpan);
            listItem.appendChild(favBtn);
            listItem.dataset.tagId = item.Name;
            projectsList.appendChild(listItem);
        });

        // Render non-favourite tags in the regular list
        console.log("→ Adding", nonFavourites.length, "tags to the list");
        nonFavourites.forEach((item, index) => {
            console.log(`  [${index}] Processing tag:`, item);
            console.log(`    - Name:`, item.Name);
            console.log(`    - Id:`, item.Id);

            console.log(`    - Creating <li> element...`);
            const listItem = document.createElement('li');
            console.log(`    - Setting className to 'tag-item'...`);
            listItem.className = 'tag-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tag-name';
            nameSpan.textContent = item.Name;

            const favBtn = document.createElement('span');
            favBtn.className = 'tag-fav-btn';
            favBtn.innerHTML = '<i class="far fa-star"></i>';
            favBtn.title = 'Add to projects';
            favBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                execute('toggleTagFavourite', item.Name);
            });

            listItem.appendChild(nameSpan);
            listItem.appendChild(favBtn);

            console.log(`    - Setting data-tag-id to '${item.Name}'...`);
            listItem.dataset.tagId = item.Name;
            console.log(`    - Appending to tagList...`);
            tagList.appendChild(listItem);
            if (customTagOrderEnabled) {
                attachTagReorderHandlers(listItem, item);
            }
            console.log(`    ✓ Tag ${index} added successfully`);

            // Verify it was added
            const lastChild = tagList.lastElementChild;
            console.log(`    - Verification: Last child text:`, lastChild ? lastChild.textContent : 'N/A');
        });
        console.log("  ✓ All tags added successfully");
    } else {
        projectsSection.style.display = 'none';
        console.log("  ℹ No tags to add (empty or null data)");
    }

    if (preserveActiveTag) {
        const refreshedActiveTag = Array.from(document.querySelectorAll(
            '#tag-list .tag-item[data-tag-id], #projects-list .tag-item[data-tag-id]',
        )).find(tag => tag.dataset.tagId === activeTagIdBeforeRefresh);
        if (refreshedActiveTag) {
            document.querySelectorAll(
                '#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag',
            ).forEach(tag => tag.classList.remove('active-tag'));
            refreshedActiveTag.classList.add('active-tag');
            updateHomeTabVisibility(refreshedActiveTag.classList.contains('project-item'));
            if (storedTagId) {
                sessionStorage.removeItem('lastSelectedTag');
            }
        }
    }

    console.log("→ Final tag list state:");
    console.log("  Child count:", tagList.children.length);
    console.log("  All children:");
    Array.from(tagList.children).forEach((child, i) => {
        console.log(`    [${i}] ${child.textContent} (data-tag-id: ${child.dataset.tagId})`);
    });
    
    // Reset tag navigation if currently focused on tags (tags may have changed)
    if (keyboardNavState.focusType === 'tag') {
        const tags = getAllTags();
        if (keyboardNavState.tagIndex >= tags.length) {
            keyboardNavState.tagIndex = Math.max(0, tags.length - 1);
        }
    } else if (keyboardNavState.focusType === null) {
        // Initialize navigation state to focus on active tag if nothing is focused
        const activeTag = tagList.querySelector('.tag-item.active-tag');
        if (activeTag) {
            const tags = getAllTags();
            const tagIndex = tags.indexOf(activeTag);
            if (tagIndex >= 0) {
                keyboardNavState.focusType = 'tag';
                keyboardNavState.tagIndex = tagIndex;
            }
        }
    }

    // After rendering tags, check if we need to verify selection after deletion
    if (pendingTagSelectionCheck) {
        console.log("→ Checking tag selection after deletion");
        console.log("  Previously selected tag:", previouslySelectedTag);
        pendingTagSelectionCheck = false;

        // Check if previously selected tag still exists (in either list)
        const previousTag = tagList.querySelector(`.tag-item[data-tag-id="${previouslySelectedTag}"]`)
            || projectsList.querySelector(`.tag-item[data-tag-id="${previouslySelectedTag}"]`);
        console.log("  Previous tag still exists:", !!previousTag);

        if (!previousTag) {
            console.log("  → Previously selected tag was removed, selecting 'All Tags'");
            // Tag was removed, select "All Tags"
            const allTagsItem = tagList.querySelector('.tag-item[data-tag-id="all"]');
            if (allTagsItem) {
                // Remove active from any other tags
                const currentActive = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
                if (currentActive) {
                    currentActive.classList.remove('active-tag');
                }
                // Set "All Tags" as active
                allTagsItem.classList.add('active-tag');
                updateHomeTabVisibility(false);

                // Reload notes/tasks for "All Tags"
                const activeTabButton = document.querySelector('.tab-button.active');
                const activeTabName = activeTabButton ? activeTabButton.dataset.tabName : 'notes';

                console.log("  → Reloading", activeTabName, "for 'All Tags'");
                if (activeTabName === 'notes') {
                    execute('loadNotesByTag', 'all');
                } else if (activeTabName === 'todo') {
                    execute('loadTasksByTag', 'all');
                } else if (activeTabName === 'done') {
                    execute('loadDoneTasksByTag', 'all');
                } else if (activeTabName === 'decisions') {
                    execute('loadDecisionsByTag', 'all');
                }
            }
        } else {
            console.log("  → Tag still exists, re-applying active class");
            // Tag still exists, make sure it's marked as active
            const currentActive = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
            if (currentActive) {
                currentActive.classList.remove('active-tag');
            }
            previousTag.classList.add('active-tag');

            // Update Home tab visibility based on whether the restored tag is a project
            const isProject = previousTag.classList.contains('project-item');
            updateHomeTabVisibility(isProject);
            if (isProject) {
                showTab('home');
            }
        }

        previouslySelectedTag = null;
    }

    // Restore tag selection from sessionStorage if available (when returning from editor)
    if (!pendingTagSelectionCheck && !preserveActiveTag) {
        const lastSelectedTag = sessionStorage.getItem('lastSelectedTag');
        if (lastSelectedTag) {
            console.log("→ Restoring tag selection from sessionStorage:", lastSelectedTag);
            // Search both regular tags and projects lists
            const tagToSelect = tagList.querySelector(`.tag-item[data-tag-id="${lastSelectedTag}"]`)
                || projectsList.querySelector(`.tag-item[data-tag-id="${lastSelectedTag}"]`);
            if (tagToSelect) {
                // Remove active class from current selection across both lists
                const currentActive = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
                if (currentActive) {
                    currentActive.classList.remove('active-tag');
                }
                // Select the restored tag
                tagToSelect.classList.add('active-tag');

                // Show Home tab and select it if this is a project
                const isProject = tagToSelect.classList.contains('project-item');
                updateHomeTabVisibility(isProject);
                if (isProject) {
                    showTab('home');
                } else {
                    // Load content for the restored tag
                    const activeTabButton = document.querySelector('.tab-button.active');
                    const activeTabName = activeTabButton ? activeTabButton.dataset.tabName : 'notes';

                    if (activeTabName === 'notes') {
                        execute('loadNotesByTag', lastSelectedTag);
                    } else if (activeTabName === 'todo') {
                        execute('loadTasksByTag', lastSelectedTag);
                    } else if (activeTabName === 'done') {
                        execute('loadDoneTasksByTag', lastSelectedTag);
                    } else if (activeTabName === 'decisions') {
                        execute('loadDecisionsByTag', lastSelectedTag);
                    }
                }

                // Clear the stored tag so it doesn't interfere with future navigation
                sessionStorage.removeItem('lastSelectedTag');
            } else {
                // Tag no longer exists, clear it and default to 'all'
                console.log("  → Stored tag no longer exists, defaulting to 'all'");
                sessionStorage.removeItem('lastSelectedTag');
            }
        }
    }

    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║      GET TAGS FUNCTION COMPLETE                  ║");
    console.log("╚══════════════════════════════════════════════════╝");
}

function toggleTagFavouriteResponse(data) {
    console.log("Toggle favourite response:", data);
    // Remember the currently active tag so it stays selected after refresh
    const activeTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
    if (activeTag) {
        sessionStorage.setItem('lastSelectedTag', activeTag.dataset.tagId);
    }
    // Refresh the tag list so the order and icons update
    execute('getTags', '');
}

window.toggleTagFavouriteResponse = toggleTagFavouriteResponse;

// Expose getTags to window so it can be called from execute()
window.getTags = getTags;

// Load settings and apply dark mode
function loadSettings(settingsData) {
    console.log("loadSettings called with data:", settingsData);
    if (!settingsData) return;

    try {
        // Check if settingsData is already an array or needs parsing
        let settingsArray;
        if (typeof settingsData === 'string') {
            settingsArray = JSON.parse(settingsData);
        } else {
            settingsArray = settingsData;
        }

        // Convert array of {Key, Value} objects to a simple key-value object
        const settings = {};
        settingsArray.forEach(setting => {
            settings[setting.Key] = setting.Value;
        });

        console.log("Processed settings:", settings);
        if (typeof window.applyFontPreferences === 'function') {
            window.applyFontPreferences(settings.bodyFont, settings.headingFont);
        }

        let notesListSettingsChanged = false;
        let tagsListSettingsChanged = false;
        if (Object.prototype.hasOwnProperty.call(settings, 'notesCustomOrder')) {
            notesCustomOrders = parseNotesCustomOrders(settings.notesCustomOrder);
            notesListSettingsChanged = true;
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'tagsCustomOrder')) {
            tagsCustomOrder = parseTagsCustomOrder(settings.tagsCustomOrder);
            tagsListSettingsChanged = true;
        }
        if (Object.prototype.hasOwnProperty.call(settings, 'notesSortMode')) {
            const savedMode = normalizeNotesSortMode(settings.notesSortMode);
            if (savedMode) {
                savedNotesSortMode = savedMode;
                if (savedMode !== 'custom' || customNoteOrderEnabled) {
                    notesListSort = savedMode;
                }
                notesListSettingsChanged = true;
            }
        }
        if (notesListSettingsChanged) {
            updateNotesSortMenu();
            if (notesListData.length > 0) {
                renderNotesList(filterNotesList(notesListData));
            }
        }
        if (tagsListSettingsChanged && Array.isArray(originalTagsData) && originalTagsData.length > 0) {
            rerenderTagsPreservingSelection();
        }

        // Apply font size setting
        if (settings.fontSize) {
            console.log("Applying font size to menu:", settings.fontSize);
            if (typeof window.applyFontSize === 'function') {
                window.applyFontSize(settings.fontSize);
            } else if (typeof window.setFontSize === 'function') {
                window.setFontSize(settings.fontSize);
            }
        }

        // Apply dark mode setting (check feature availability first)
        if (settings.darkMode !== undefined) {
            // Convert string to boolean
            const isDarkMode = settings.darkMode === 'true';
            console.log("Applying dark mode to menu:", isDarkMode);
            
            // Check feature availability before applying
            if (isDarkMode && typeof window.isFeatureEnabled === 'function') {
                window.isFeatureEnabled('darkMode').then(enabled => {
                    if (enabled && typeof setDarkMode === 'function') {
                        setDarkMode(true);
                    } else if (!enabled && typeof setDarkMode === 'function') {
                        // Feature not available, disable dark mode (setting stays in DB)
                        setDarkMode(false);
                    }
                });
            } else if (typeof setDarkMode === 'function') {
                // If feature check not available, apply setting (for backwards compatibility)
                setDarkMode(isDarkMode);
            }
        }
        
        // Apply highlight color setting
        // Helper function to get theme-specific color
        function getThemeColor(highlightColorValue, theme) {
            const DEFAULT_LIGHT_COLOR = '#6b7280';
            const DEFAULT_DARK_COLOR = '#d1d5db';
            
            if (!highlightColorValue) {
                return theme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR;
            }
            
            try {
                const colors = JSON.parse(highlightColorValue);
                if (colors.light && colors.dark) {
                    return colors[theme] || (theme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR);
                }
            } catch (e) {
                // Not JSON format - treat as old single color
                return highlightColorValue;
            }
            
            return theme === 'dark' ? DEFAULT_DARK_COLOR : DEFAULT_LIGHT_COLOR;
        }
        
        // Helper function to darken color
        function darkenColor(hex, percent) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result) return hex;
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            const newR = Math.max(0, Math.floor(r * (1 - percent)));
            const newG = Math.max(0, Math.floor(g * (1 - percent)));
            const newB = Math.max(0, Math.floor(b * (1 - percent)));
            return '#' + [newR, newG, newB].map(x => {
                const hex = x.toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
        }
        
        // Get current theme
        function getCurrentTheme() {
            return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        }

        // Readable text/icon colour to sit on top of the highlight colour
        function getContrastColor(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            if (!result) return '#ffffff';
            const toLinear = c => {
                c = parseInt(c, 16) / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            };
            const luminance = 0.2126 * toLinear(result[1]) + 0.7152 * toLinear(result[2]) + 0.0722 * toLinear(result[3]);
            const contrastWithWhite = 1.05 / (luminance + 0.05);
            const contrastWithBlack = (luminance + 0.05) / 0.05;
            return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#1a202c';
        }

        const highlightColorValue = settings.highlightColor || null;
        const currentTheme = getCurrentTheme();
        const lightColor = getThemeColor(highlightColorValue, 'light');
        const darkColor = getThemeColor(highlightColorValue, 'dark');
        const highlightColor = getThemeColor(highlightColorValue, currentTheme);
        
        console.log("Applying highlight color to menu:", highlightColor, "for theme:", currentTheme);
        
        if (typeof window.applyHighlightColor === 'function') {
            window.applyHighlightColor(highlightColor, currentTheme);
        } else {
            // Fallback: apply directly via CSS variables with theme-specific colors
            const lightHoverColor = darkenColor(lightColor, 0.2);
            const lightDarkVariant = darkenColor(lightColor, 0.35);
            const darkHoverColor = darkenColor(darkColor, 0.2);
            const darkDarkVariant = darkenColor(darkColor, 0.35);
            const lightOnPrimary = getContrastColor(lightColor);
            const darkOnPrimary = getContrastColor(darkColor);

            // Create or update dynamic color override style
            let colorOverrideStyle = document.getElementById('dynamic-color-override');
            if (!colorOverrideStyle) {
                colorOverrideStyle = document.createElement('style');
                colorOverrideStyle.id = 'dynamic-color-override';
                document.head.appendChild(colorOverrideStyle);
            }

            // Update the style to override both :root and [data-theme="dark"]
            colorOverrideStyle.textContent = `
                :root {
                    --color-primary: ${lightColor} !important;
                    --color-primary-hover: ${lightHoverColor} !important;
                    --color-primary-dark: ${lightDarkVariant} !important;
                    --color-on-primary: ${lightOnPrimary} !important;
                }
                [data-theme="dark"] {
                    --color-primary: ${darkColor} !important;
                    --color-primary-hover: ${darkHoverColor} !important;
                    --color-primary-dark: ${darkDarkVariant} !important;
                    --color-on-primary: ${darkOnPrimary} !important;
                }
            `;
        }

        const customColorsAreEnabled = typeof window.isCustomColorsEnabled === 'function'
            ? window.isCustomColorsEnabled(settings)
            : false;
        const normalizedCustomColors = typeof window.normalizeCustomColors === 'function'
            ? window.normalizeCustomColors(settings.customColors)
            : null;
        window.currentCustomColorsValue = customColorsAreEnabled && normalizedCustomColors
            ? JSON.stringify(normalizedCustomColors)
            : null;
        if (typeof window.applyCustomColors === 'function') {
            window.applyCustomColors(window.currentCustomColorsValue || '');
        }
    } catch (error) {
        console.error("Error parsing settings in menu:", error);
    }
}

// Expose loadSettings to window so it can be called from execute()
window.loadSettings = loadSettings;

// Handle license status to cache feature availability
function getLicenseStatus(data) {
    console.log("getLicenseStatus called in menu with data:", data);
    if (!data) return;

    try {
        // Update feature availability cache directly if present in the response
        // This ensures the cache is populated before tasks are loaded
        if (data.featureAvailability) {
            // Update the cache directly using the setFeatureAvailabilityCache function
            if (typeof window.setFeatureAvailabilityCache === 'function') {
                window.setFeatureAvailabilityCache(data.featureAvailability);
            }
            
            // Also update our local cache if we have the values
            if (data.featureAvailability.urgentTasks !== undefined) {
                cachedUrgentEnabled = data.featureAvailability.urgentTasks === true;
            }
            if (data.featureAvailability.taskDueDates !== undefined) {
                cachedDueDateEnabled = data.featureAvailability.taskDueDates === true;
            }
            featureCacheTimestamp = Date.now();
        }

        const availability = data.featureAvailability && typeof data.featureAvailability === 'object'
            ? data.featureAvailability
            : {};
        const hasCustomNoteOrderFlag = Object.prototype.hasOwnProperty.call(availability, 'customNoteOrder');
        const customSortEnabled = hasCustomNoteOrderFlag
            ? availability.customNoteOrder === true
            : String(data.licenseType || '').toLowerCase() === 'pro';
        const hasCustomTagOrderFlag = Object.prototype.hasOwnProperty.call(availability, 'customTagOrder');
        const tagOrderEnabled = hasCustomTagOrderFlag
            ? availability.customTagOrder === true
            : hasCustomNoteOrderFlag
                ? availability.customNoteOrder === true
                : String(data.licenseType || '').toLowerCase() === 'pro';
        setCustomNoteOrderAvailability(customSortEnabled);
        setCustomTagOrderAvailability(tagOrderEnabled);
    } catch (error) {
        console.error("Error processing license status in menu:", error);
    }
}

// Expose getLicenseStatus to window so it can be called from execute()
window.getLicenseStatus = getLicenseStatus;

function handleTagClick(event) {
    if (suppressNextTagClick) {
        suppressNextTagClick = false;
        if (tagDragClickResetTimer) {
            clearTimeout(tagDragClickResetTimer);
            tagDragClickResetTimer = null;
        }
        event.preventDefault();
        event.stopPropagation();
        return;
    }

    const clickedItem = event.target.closest('.tag-item');
    if (!clickedItem) return;

    const tagList = document.getElementById('tag-list');
    const allTagsItem = tagList.querySelector('.tag-item[data-tag-id="all"]');
    // Find active tag across both lists
    const currentActiveTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
    let tagIdToFilterBy = 'all';

    if (clickedItem === currentActiveTag) {
        if (clickedItem !== allTagsItem) {
            clickedItem.classList.remove('active-tag');
            if (allTagsItem) {
                allTagsItem.classList.add('active-tag');
            }
            tagIdToFilterBy = 'all';
        } else {
            tagIdToFilterBy = clickedItem.dataset.tagId;
        }
    } else {
        if (currentActiveTag) {
            currentActiveTag.classList.remove('active-tag');
        }
        clickedItem.classList.add('active-tag');
        tagIdToFilterBy = clickedItem.dataset.tagId;
    }

    // Update navigation state to match clicked tag
    const tags = getAllTags();
    const tagIndex = tags.indexOf(clickedItem);
    if (tagIndex >= 0) {
        keyboardNavState.focusType = 'tag';
        keyboardNavState.tagIndex = tagIndex;
    }

    // Show/hide Home tab based on whether a project (favourite) is now active
    const newActiveTag = document.querySelector('#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag');
    const isProjectActive = newActiveTag ? newActiveTag.classList.contains('project-item') : false;
    updateHomeTabVisibility(isProjectActive);

    const activeTabButton = document.querySelector('.tab-button.active');
    // The Home page's nav item isn't a .tab-button (see handleTagClick's use
    // of activeTabName below), so fall back to checking its tab-content directly.
    const dashboardContent = document.getElementById('dashboard-content');
    const isDashboardActive = dashboardContent && dashboardContent.classList.contains('active-content');
    const activeTabName = activeTabButton ? activeTabButton.dataset.tabName : (isDashboardActive ? 'dashboard' : '');

    // If a project is active, always default to the Home tab
    if (isProjectActive) {
        showTab('home');
        return;
    }

    if (activeTabName === 'notes' || activeTabName === 'home' || activeTabName === 'dashboard') {
        console.log('Tag changed, reloading notes for tag ID:', tagIdToFilterBy);
        execute('loadNotesByTag', tagIdToFilterBy);
        if (activeTabName === 'home' || activeTabName === 'dashboard') {
            showTab('notes');
            return;
        }
    } else if (activeTabName === 'todo') {
        console.log('Tag changed, reloading todo tasks for tag ID:', tagIdToFilterBy);
        execute('loadTasksByTag', tagIdToFilterBy);
    } else if (activeTabName === 'done') {
        console.log('Tag changed, reloading done tasks for tag ID:', tagIdToFilterBy);
        execute('loadDoneTasksByTag', tagIdToFilterBy);
    } else if (activeTabName === 'decisions') {
        console.log('Tag changed, reloading decisions for tag ID:', tagIdToFilterBy);
        execute('loadDecisionsByTag', tagIdToFilterBy);
    } else if (activeTabName === 'graph') {
        console.log('Tag changed, reloading graph goals for tag ID:', tagIdToFilterBy);
        loadGraphGoals(tagIdToFilterBy);
    } else {
        console.log('Tag changed, no active tab identified (or unknown tab name). Defaulting to notes for tag ID:', tagIdToFilterBy);
        execute('loadNotesByTag', tagIdToFilterBy);
    }
}

function initializeTagSelection() {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return;

    tagList.addEventListener('click', handleTagClick);

    const projectsList = document.getElementById('projects-list');
    if (projectsList) {
        projectsList.addEventListener('click', handleTagClick);
    }

    const activeTag = tagList.querySelector('.tag-item.active-tag');
    const allTagsItem = tagList.querySelector('.tag-item[data-tag-id="all"]');
    if (!activeTag && allTagsItem) {
        allTagsItem.classList.add('active-tag');
    }
}

// Search functionality variables
let originalNotesData = [];
let originalTasksData = [];
let originalDecisionsData = [];
let originalTagsData = [];
let isSearchActive = false;

// Tag refresh tracking variables
let pendingTagSelectionCheck = false;
let previouslySelectedTag = null;

// Keyboard navigation state
let keyboardNavState = {
    focusType: null, // 'tab', 'tag', 'entry', or null
    tabIndex: 0,
    tagIndex: 0,
    entryIndex: 0
};

// Show search header
function showSearchHeader() {
    console.log('showSearchHeader called');
    const searchHeader = document.getElementById('search-header');
    const searchInput = document.getElementById('search-input');

    if (!searchHeader) {
        console.error('Search header element not found!');
        return;
    }

    searchHeader.classList.add('visible');
    isSearchActive = true;

    // Clear any previous search
    searchInput.value = '';

    // Focus the search input
    setTimeout(() => {
        searchInput.focus();
    }, 100);
    console.log('Search header shown');
}

// Hide search header
function hideSearchHeader() {
    console.log('hideSearchHeader called');
    const searchHeader = document.getElementById('search-header');
    const searchInput = document.getElementById('search-input');

    if (!searchHeader) {
        console.error('Search header element not found!');
        return;
    }

    searchHeader.classList.remove('visible');
    isSearchActive = false;

    // Clear search and restore original data
    searchInput.value = '';
    restoreOriginalData();
    console.log('Search header hidden');
}

// Toggle search panel (for the search icon)
function toggleSearchPanel() {
    console.log('toggleSearchPanel called, isSearchActive:', isSearchActive);
    if (isSearchActive) {
        hideSearchHeader();
    } else {
        showSearchHeader();
    }
}

// Restore original data when search is cleared
function restoreOriginalData() {
    const activeTab = document.querySelector('.tab-button.active');
    const activeTabName = activeTab ? activeTab.dataset.tabName : 'notes';

    // Always restore tags when clearing search
    restoreOriginalTags();

    if (activeTabName === 'notes' && originalNotesData.length > 0) {
        // Call the original function directly to avoid recursion
        originalLoadNotesByTagFunc(originalNotesData);
    } else if ((activeTabName === 'todo' || activeTabName === 'done') && originalTasksData.length > 0) {
        // Call the original function directly to avoid recursion
        originalLoadTasksByTagFunc(originalTasksData);
    } else if (activeTabName === 'decisions' && originalDecisionsData.length > 0) {
        loadDecisionsByTag(originalDecisionsData);
    } else {
        // Reload from current tag
        const activeTag = document.querySelector('.tag-item.active-tag');
        const tagIdToFilterBy = activeTag ? activeTag.dataset.tagId : 'all';

        if (activeTabName === 'notes') {
            execute('loadNotesByTag', tagIdToFilterBy);
        } else if (activeTabName === 'todo') {
            execute('loadTasksByTag', tagIdToFilterBy);
        } else if (activeTabName === 'done') {
            execute('loadDoneTasksByTag', tagIdToFilterBy);
        } else if (activeTabName === 'decisions') {
            execute('loadDecisionsByTag', tagIdToFilterBy);
        }
    }
}

// Search function
function performSearch(searchTerm) {
    if (!searchTerm.trim()) {
        restoreOriginalData();
        restoreOriginalTags();
        return;
    }

    // Check if search starts with # for tag filtering
    if (searchTerm.startsWith('#')) {
        searchTags(searchTerm.substring(1)); // Remove the # and search tags
        return;
    }

    const activeTab = document.querySelector('.tab-button.active');
    const activeTabName = activeTab ? activeTab.dataset.tabName : 'notes';

    // Restore tags when doing regular search
    restoreOriginalTags();

    if (activeTabName === 'notes') {
        searchNotes(searchTerm);
    } else if (activeTabName === 'todo' || activeTabName === 'done') {
        searchTasks(searchTerm);
    } else if (activeTabName === 'decisions') {
        searchDecisions(searchTerm);
    }
}

// Search notes using FTS5 backend search
async function searchNotes(searchTerm) {
    if (searchTerm.length >= 2) {
        try {
            const results = await execute('searchNotes', searchTerm);
            if (Array.isArray(results)) {
                originalLoadNotesByTagFunc(results);
                return;
            }
        } catch (err) {
            console.error('FTS search error, falling back to local:', err);
        }
    }
    // Fallback: local title+content filter for short queries or errors
    const filteredNotes = originalNotesData.filter(note =>
        note.Title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (note.Content && note.Content.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    originalLoadNotesByTagFunc(filteredNotes);
}

// Search tasks
function searchTasks(searchTerm) {
    const activeTab = document.querySelector('.tab-button.active');
    const activeTabName = activeTab ? activeTab.dataset.tabName : 'todo';
    
    let filteredTasks = originalTasksData.filter(task =>
        task.TaskLine.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (task.NoteTitle && task.NoteTitle.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    // Filter based on active tab
    if (activeTabName === 'todo') {
        // Show only incomplete tasks (pending or in progress)
        filteredTasks = filteredTasks.filter(item => {
            if (!item || typeof item.TaskLine !== 'string') {
                return false;
            }
            const prefixMatch = item.TaskLine.match(/^(\s*[-\/\|]\s)/);
            if (prefixMatch) {
                const prefix = prefixMatch[0].trim();
                // Only show incomplete tasks (prefix === '-' or '/', not '|')
                return prefix !== '|';
            }
            return true;
        });
        // Call the original function directly to avoid recursion
        originalLoadTasksByTagFunc(filteredTasks);
    } else if (activeTabName === 'done') {
        // Show only completed tasks
        filteredTasks = filteredTasks.filter(item => {
            if (!item || typeof item.TaskLine !== 'string') {
                return false;
            }
            const prefixMatch = item.TaskLine.match(/^(\s*[-\/\|]\s)/);
            if (prefixMatch) {
                const prefix = prefixMatch[0].trim();
                // Only show completed tasks (prefix === '|')
                return prefix === '|';
            }
            return false;
        });
        // Call loadDoneTasksByTag for done tab
        loadDoneTasksByTag(filteredTasks);
    }
}

// Search tags
function searchTags(searchTerm) {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return;

    // Get all tag items except "All Tags"
    const allTagItems = tagList.querySelectorAll('.tag-item');

    if (!searchTerm.trim()) {
        // Show all tags if search is empty
        allTagItems.forEach(tag => {
            tag.style.display = '';
        });
        return;
    }

    let visibleTags = [];

    allTagItems.forEach(tag => {
        const tagText = tag.textContent.toLowerCase();
        const searchTermLower = searchTerm.toLowerCase();

        if (tagText.includes(searchTermLower)) {
            tag.style.display = '';
            visibleTags.push(tag);
        } else {
            tag.style.display = 'none';
        }
    });

    // If only one tag is visible, automatically select it
    if (visibleTags.length === 1) {
        const currentActiveTag = tagList.querySelector('.tag-item.active-tag');
        if (currentActiveTag) {
            currentActiveTag.classList.remove('active-tag');
        }

        const singleTag = visibleTags[0];
        singleTag.classList.add('active-tag');

        // Load notes/tasks for this tag
        const tagIdToFilterBy = singleTag.dataset.tagId;
        const activeTabButton = document.querySelector('.tab-button.active');
        const activeTabName = activeTabButton ? activeTabButton.dataset.tabName : 'notes';

        if (activeTabName === 'notes') {
            execute('loadNotesByTag', tagIdToFilterBy);
        } else if (activeTabName === 'todo') {
            execute('loadTasksByTag', tagIdToFilterBy);
        } else if (activeTabName === 'done') {
            execute('loadDoneTasksByTag', tagIdToFilterBy);
        } else if (activeTabName === 'decisions') {
            execute('loadDecisionsByTag', tagIdToFilterBy);
        }
    }
}

// Restore original tags visibility
function restoreOriginalTags() {
    const tagList = document.getElementById('tag-list');
    if (!tagList) return;

    const allTagItems = tagList.querySelectorAll('.tag-item');
    allTagItems.forEach(tag => {
        tag.style.display = '';
    });
}

// Keyboard navigation helper functions
function resetNavigationState() {
    keyboardNavState.focusType = null;
    keyboardNavState.tabIndex = 0;
    keyboardNavState.tagIndex = 0;
    keyboardNavState.entryIndex = 0;
}

function resetEntryNavigation() {
    // Reset only entry navigation when content changes
    if (keyboardNavState.focusType === 'entry') {
        keyboardNavState.focusType = null;
    }
    keyboardNavState.entryIndex = 0;
}

function getAllTabs() {
    return Array.from(document.querySelectorAll('.tab-button')).filter(tab => tab.style.display !== 'none');
}

function getAllTags() {
    // Return projects first, then regular tags (matches visual order)
    const projects = Array.from(document.querySelectorAll('#projects-list .tag-item'));
    const tags = Array.from(document.querySelectorAll('#tag-list .tag-item'));
    return [...projects, ...tags];
}

function getCurrentEntries() {
    const activeTab = document.querySelector('.tab-button.active');
    if (!activeTab) return [];
    
    const activeTabName = activeTab.getAttribute('data-tab-name');
    const tabContent = document.getElementById(activeTabName + '-content');
    if (!tabContent) return [];
    
    // Get entries based on tab type
    if (activeTabName === 'notes') {
        return Array.from(tabContent.querySelectorAll('.list-item'));
    } else if (activeTabName === 'todo' || activeTabName === 'done') {
        return Array.from(tabContent.querySelectorAll('.task-list-item'));
    } else if (activeTabName === 'decisions') {
        return Array.from(tabContent.querySelectorAll('.important-block'));
    }
    
    return [];
}

function focusElement(element, focusType, index) {
    if (!element) return false;
    
    keyboardNavState.focusType = focusType;
    if (focusType === 'tab') {
        keyboardNavState.tabIndex = index;
        // Update visual state for tabs
        const tabs = getAllTabs();
        tabs.forEach(tab => tab.classList.remove('active'));
        element.classList.add('active');
        
        // Activate the tab content (switch to that tab)
        const tabName = element.getAttribute('data-tab-name');
        if (tabName) {
            // Don't reset navigation state here since we're navigating with keyboard
            // Just switch the tab content
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => {
                content.classList.remove('active-content');
            });
            
            const tabContent = document.getElementById(tabName + '-content');
            if (tabContent) {
                tabContent.classList.add('active-content');
            }
            
            // Store the selected tab in sessionStorage
            sessionStorage.setItem('lastSelectedTab', tabName);

            updateFilterPaletteToggleVisibility(tabName);

            // Load content for the active tag and this tab
            const activeTag = document.querySelector('.tag-item.active-tag');
            const tagIdToFilterBy = activeTag ? activeTag.dataset.tagId : 'all';
            
            switch (tabName) {
                case 'notes':
                    execute('loadNotesByTag', tagIdToFilterBy);
                    break;
                case 'todo':
                    execute('loadTasksByTag', tagIdToFilterBy);
                    break;
                case 'done':
                    execute('loadDoneTasksByTag', tagIdToFilterBy);
                    break;
                case 'decisions':
                    execute('loadDecisionsByTag', tagIdToFilterBy);
                    break;
            }
            
            // After loading content, automatically focus the first entry if available
            // Use setTimeout to wait for content to load (content loads asynchronously)
            setTimeout(() => {
                const entries = getCurrentEntries();
                if (entries.length > 0) {
                    focusElement(entries[0], 'entry', 0);
                } else {
                    // No entries, keep focus on tab
                    keyboardNavState.focusType = 'tab';
                }
            }, 200);
        }
    } else if (focusType === 'tag') {
        keyboardNavState.tagIndex = index;
        // Update visual state for tags
        const tags = getAllTags();
        tags.forEach(tag => {
            tag.classList.remove('active-tag');
            // Remove keyboard focus styles
            tag.style.backgroundColor = '';
            tag.style.backdropFilter = '';
            tag.style.webkitBackdropFilter = '';
            tag.style.border = '';
            tag.style.boxShadow = '';
        });
        
        // Add active-tag class for the selected tag
        element.classList.add('active-tag');
        
        // Also apply hover styles to show keyboard focus (matching mouseover)
        // Check if dark theme is active
        const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
        
        if (isDarkTheme) {
            // Dark theme hover styles
            element.style.backgroundColor = 'rgba(45, 55, 72, 0.2)';
            element.style.backdropFilter = 'blur(8px)';
            element.style.webkitBackdropFilter = 'blur(12px)';
            element.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            element.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.3), 0 0 5px rgba(255, 255, 255, 0.1) inset';
        } else {
            // Light theme hover styles
            element.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            element.style.backdropFilter = 'blur(8px)';
            element.style.webkitBackdropFilter = 'blur(12px)';
            element.style.border = '1px solid rgba(0, 0, 0, 0.1)';
            element.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.15), 0 0 5px rgba(255, 255, 255, 0.5) inset';
        }
    } else if (focusType === 'entry') {
        keyboardNavState.entryIndex = index;
        // Remove highlight from all entries
        const entries = getCurrentEntries();
        entries.forEach(entry => {
            entry.classList.remove('keyboard-focused');
            // Reset all hover styles
            entry.style.backgroundColor = '';
            entry.style.backdropFilter = '';
            entry.style.webkitBackdropFilter = '';
            entry.style.border = '';
            entry.style.boxShadow = '';
        });
        // Add highlight to focused entry (matching hover styles)
        element.classList.add('keyboard-focused');
        
        // Check if dark theme is active
        const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
        
        if (isDarkTheme) {
            // Dark theme hover styles
            element.style.backgroundColor = 'rgba(45, 55, 72, 0.2)';
            element.style.backdropFilter = 'blur(8px)';
            element.style.webkitBackdropFilter = 'blur(12px)';
            element.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            element.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.3), 0 0 5px rgba(255, 255, 255, 0.1) inset';
        } else {
            // Light theme hover styles
            element.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            element.style.backdropFilter = 'blur(8px)';
            element.style.webkitBackdropFilter = 'blur(12px)';
            element.style.border = '1px solid rgba(0, 0, 0, 0.1)';
            element.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.15), 0 0 5px rgba(255, 255, 255, 0.5) inset';
        }
    }
    
    // Scroll element into view
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    return true;
}

function activateElement(element) {
    if (!element) return false;
    
    // Trigger click handler
    if (element.onclick) {
        element.onclick();
    } else if (element.click) {
        element.click();
    }
    
    return true;
}

function handleArrowNavigation(key) {
    console.log('handleArrowNavigation called with key:', key);
    console.log('Current navigation state:', JSON.stringify(keyboardNavState));
    
    // Don't navigate if search input is focused
    const searchInput = document.getElementById('search-input');
    if (searchInput && document.activeElement === searchInput) {
        console.log('Search input is focused, returning false');
        return false;
    }
    
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        console.log('Handling Left/Right navigation');
        // Navigate tabs and tags
        const tabs = getAllTabs();
        const tags = getAllTags();
        
        if (tabs.length === 0 && tags.length === 0) return false;
        
        let currentFocusType = keyboardNavState.focusType;
        
        // If focused on an entry, always navigate tabs (ignore entry focus)
        if (currentFocusType === 'entry') {
            currentFocusType = 'tab';
            // Use the currently active tab as the starting point
            const activeTab = document.querySelector('.tab-button.active');
            if (activeTab) {
                const activeTabName = activeTab.getAttribute('data-tab-name');
                const tabIndex = tabs.findIndex(tab => tab.getAttribute('data-tab-name') === activeTabName);
                if (tabIndex >= 0) {
                    keyboardNavState.tabIndex = tabIndex;
                }
            }
        }
        
        // Determine current position and handle navigation
        if (currentFocusType === 'tab') {
            // Currently on a tab - navigate to next/previous tab or wrap to tags
            let nextTabIndex;
            if (key === 'ArrowLeft') {
                nextTabIndex = (keyboardNavState.tabIndex - 1 + tabs.length) % tabs.length;
                // If wrapping from first tab to last, move to last tag
                if (keyboardNavState.tabIndex === 0 && nextTabIndex === tabs.length - 1) {
                    if (tags.length > 0) {
                        const lastTagIndex = tags.length - 1;
                        return focusElement(tags[lastTagIndex], 'tag', lastTagIndex);
                    }
                }
            } else {
                // ArrowRight
                nextTabIndex = (keyboardNavState.tabIndex + 1) % tabs.length;
                // If wrapping from last tab to first, move to first tag
                if (nextTabIndex === 0 && keyboardNavState.tabIndex === tabs.length - 1) {
                    if (tags.length > 0) {
                        return focusElement(tags[0], 'tag', 0);
                    }
                }
            }
            return focusElement(tabs[nextTabIndex], 'tab', nextTabIndex);
        } else if (currentFocusType === 'tag') {
            // Currently on a tag - navigate to next/previous tag or move to tabs
            if (key === 'ArrowLeft') {
                // Move to previous tag, or wrap to last tab
                if (keyboardNavState.tagIndex === 0) {
                    // Wrap to last tab
                    if (tabs.length > 0) {
                        const lastTabIndex = tabs.length - 1;
                        return focusElement(tabs[lastTabIndex], 'tab', lastTabIndex);
                    }
                } else {
                    const prevTagIndex = keyboardNavState.tagIndex - 1;
                    return focusElement(tags[prevTagIndex], 'tag', prevTagIndex);
                }
            } else {
                // ArrowRight - move to first tab
                if (tabs.length > 0) {
                    return focusElement(tabs[0], 'tab', 0);
                } else {
                    // No tabs, just move to next tag
                    const nextTagIndex = (keyboardNavState.tagIndex + 1) % tags.length;
                    return focusElement(tags[nextTagIndex], 'tag', nextTagIndex);
                }
            }
        } else {
            // No focus - start from first tab or first tag if no tabs
            if (tabs.length > 0) {
                return focusElement(tabs[0], 'tab', 0);
            } else if (tags.length > 0) {
                return focusElement(tags[0], 'tag', 0);
            }
        }
        
        return false;
    } else if (key === 'ArrowUp' || key === 'ArrowDown') {
        console.log('Handling Up/Down navigation');
        // Navigate entries or tags depending on context
        const entries = getCurrentEntries();
        const tags = getAllTags();
        console.log('Entries count:', entries.length, 'Tags count:', tags.length);
        console.log('Current focus type:', keyboardNavState.focusType);
        
        // If currently focused on tags, navigate tags
        if (keyboardNavState.focusType === 'tag') {
            console.log('Currently focused on tags, navigating tags');
            let currentIndex = keyboardNavState.tagIndex;
            if (key === 'ArrowUp') {
                currentIndex = Math.max(0, currentIndex - 1);
            } else {
                currentIndex = Math.min(tags.length - 1, currentIndex + 1);
            }
            const tag = tags[currentIndex];
            console.log('Focusing tag at index:', currentIndex, 'tag:', tag ? tag.textContent : 'null');
            const result = focusElement(tag, 'tag', currentIndex);
            console.log('focusElement returned:', result);
            return result;
        }
        
        // If currently focused on a tab, navigate entries in that tab
        if (keyboardNavState.focusType === 'tab') {
            console.log('Currently focused on tab, navigating entries');
            // If there are entries, navigate entries
            if (entries.length > 0) {
                let currentIndex = keyboardNavState.entryIndex;
                
                // If not currently focused on entries, start at first/last
                if (keyboardNavState.focusType !== 'entry') {
                    currentIndex = key === 'ArrowUp' ? entries.length - 1 : 0;
                } else {
                    // Move to next/previous entry
                    if (key === 'ArrowUp') {
                        currentIndex = Math.max(0, currentIndex - 1);
                    } else {
                        currentIndex = Math.min(entries.length - 1, currentIndex + 1);
                    }
                }
                
                const entry = entries[currentIndex];
                console.log('Focusing entry at index:', currentIndex);
                return focusElement(entry, 'entry', currentIndex);
            } else {
                console.log('No entries in current tab');
                return false;
            }
        }
        
        // If currently focused on entries, continue navigating entries
        if (keyboardNavState.focusType === 'entry') {
            console.log('Currently focused on entry, navigating entries');
            if (entries.length > 0) {
                let currentIndex = keyboardNavState.entryIndex;
                
                // Move to next/previous entry
                if (key === 'ArrowUp') {
                    currentIndex = Math.max(0, currentIndex - 1);
                } else {
                    currentIndex = Math.min(entries.length - 1, currentIndex + 1);
                }
                
                const entry = entries[currentIndex];
                console.log('Focusing entry at index:', currentIndex);
                return focusElement(entry, 'entry', currentIndex);
            }
        }
        
        // If there are entries and no specific focus, navigate entries
        if (entries.length > 0) {
            console.log('No specific focus, navigating entries');
            let currentIndex = keyboardNavState.entryIndex;
            
            // Start at first/last
            currentIndex = key === 'ArrowUp' ? entries.length - 1 : 0;
            
            const entry = entries[currentIndex];
            return focusElement(entry, 'entry', currentIndex);
        }
        
        // No entries available, navigate tags instead
        if (tags.length > 0) {
            console.log('No entries, navigating tags instead');
            let currentIndex = keyboardNavState.tagIndex;
            
            // If not currently focused on tags, start at first/last
            if (keyboardNavState.focusType !== 'tag') {
                currentIndex = key === 'ArrowUp' ? tags.length - 1 : 0;
                console.log('Not focused on tags, starting at index:', currentIndex);
            } else {
                // Move to next/previous tag
                if (key === 'ArrowUp') {
                    currentIndex = Math.max(0, currentIndex - 1);
                } else {
                    currentIndex = Math.min(tags.length - 1, currentIndex + 1);
                }
                console.log('Moving tag index to:', currentIndex);
            }
            
            const tag = tags[currentIndex];
            console.log('Focusing tag:', tag ? tag.textContent : 'null');
            const result = focusElement(tag, 'tag', currentIndex);
            console.log('focusElement returned:', result);
            return result;
        }
        
        console.log('No tags available, returning false');
        return false;
    }
    
    console.log('Key not handled, returning false');
    return false;
}

function handleEnterKey() {
    // Don't activate if search input is focused
    const searchInput = document.getElementById('search-input');
    if (searchInput && document.activeElement === searchInput) {
        return false;
    }
    
    const focusType = keyboardNavState.focusType;
    
    if (focusType === 'tab') {
        const tabs = getAllTabs();
        const tab = tabs[keyboardNavState.tabIndex];
        if (tab) {
            const tabName = tab.getAttribute('data-tab-name');
            if (tabName) {
                showTab(tabName);
                return true;
            }
        }
    } else if (focusType === 'tag') {
        const tags = getAllTags();
        const tag = tags[keyboardNavState.tagIndex];
        if (tag) {
            // Get the tag ID from the focused tag
            const tagIdToFilterBy = tag.dataset.tagId || 'all';
            
            // Update visual state - remove active from all tags, add to focused tag
            const tagList = document.getElementById('tag-list');
            if (tagList) {
                const allTags = getAllTags();
                allTags.forEach(t => {
                    t.classList.remove('active-tag');
                    // Remove hover/keyboard focus styles
                    t.style.backgroundColor = '';
                    t.style.backdropFilter = '';
                    t.style.webkitBackdropFilter = '';
                    t.style.border = '';
                    t.style.boxShadow = '';
                });
                tag.classList.add('active-tag');
                // Don't apply hover styles here - active-tag class has its own styling
            }
            
            // Update navigation state to match selected tag
            const tagIndex = tags.indexOf(tag);
            if (tagIndex >= 0) {
                keyboardNavState.focusType = 'tag';
                keyboardNavState.tagIndex = tagIndex;
            }
            
            // Reload content for the selected tag
            const activeTabButton = document.querySelector('.tab-button.active');
            const activeTabName = activeTabButton ? activeTabButton.dataset.tabName : 'notes';
            
            console.log('Enter pressed on tag, loading content for tagId:', tagIdToFilterBy);
            
            if (activeTabName === 'notes') {
                execute('loadNotesByTag', tagIdToFilterBy);
            } else if (activeTabName === 'todo') {
                execute('loadTasksByTag', tagIdToFilterBy);
            } else if (activeTabName === 'done') {
                execute('loadDoneTasksByTag', tagIdToFilterBy);
            } else if (activeTabName === 'decisions') {
                execute('loadDecisionsByTag', tagIdToFilterBy);
            } else if (activeTabName === 'graph') {
                loadGraphGoals(tagIdToFilterBy);
            } else {
                execute('loadNotesByTag', tagIdToFilterBy);
            }

            return true;
        }
    } else if (focusType === 'entry') {
        const entries = getCurrentEntries();
        const entry = entries[keyboardNavState.entryIndex];
        if (entry) {
            // Trigger entry click
            if (entry.onclick) {
                entry.onclick();
            } else if (entry.click) {
                entry.click();
            }
            return true;
        }
    }
    
    return false;
}

// Add keydown event listener exactly like in editor.html
console.log('=== REGISTERING KEYDOWN EVENT LISTENER ===');
document.addEventListener('keydown', function (event) {
    console.log('=== MENU KEYDOWN EVENT ===');
    console.log('Key:', event.key);
    console.log('CtrlKey:', event.ctrlKey);
    console.log('isSearchActive:', isSearchActive);

    // Check if search is open and handle Escape
    if (isSearchActive && event.key === 'Escape') {
        console.log('ESCAPE: Hiding search header');
        event.preventDefault();
        hideSearchHeader();
        return;
    }

    console.log('Calling handleMenuKeyDown...');
    handleMenuKeyDown(event);
});

function handleMenuKeyDown(event) {
    console.log('=== HANDLE MENU KEYDOWN ===');
    console.log('CtrlKey check:', event.ctrlKey);

    // Handle Ctrl key combinations
    if (event.ctrlKey) {
        console.log('CTRL KEY DETECTED - checking specific keys...');

        if (event.key === 'f' || event.key === 'F') {
            event.preventDefault();
            console.log('Ctrl+F intercepted - browser find disabled');
            return;
        }
        if (event.key === 'g' || event.key === 'G') {
            console.log('CTRL+G DETECTED!');
            event.preventDefault();
            console.log('Ctrl+G intercepted - browser find next disabled');
            return;
        }
        if (event.key === 'h' || event.key === 'H') {
            console.log('CTRL+H DETECTED!');
            event.preventDefault();
            console.log('Ctrl+H intercepted - browser find and replace disabled');
            return;
        }
        if (event.key === 'n' || event.key === 'N') {
            console.log('CTRL+N DETECTED!');
            // Check if we're on the notes tab
            const activeTabButton = document.querySelector('.tab-button.active');
            const activeTabName = activeTabButton ? activeTabButton.getAttribute('data-tab-name') : null;
            
            if (activeTabName === 'notes') {
                console.log('On notes tab - creating new note');
                event.preventDefault();
                navigateWithHistory('editor', '*');
            } else {
                console.log('Not on notes tab - ignoring Ctrl+N');
            }
            return;
        }
    }
    
    // Handle arrow keys for navigation
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        console.log('Arrow key detected:', event.key);
        // Don't navigate if search input is focused
        const searchInput = document.getElementById('search-input');
        if (searchInput && document.activeElement === searchInput) {
            console.log('Search input is focused, ignoring arrow key');
            return;
        }
        
        console.log('Calling handleArrowNavigation with key:', event.key);
        const result = handleArrowNavigation(event.key);
        console.log('handleArrowNavigation returned:', result);
        if (result) {
            event.preventDefault();
            return;
        }
    }
    
    // Handle Enter key for activation
    if (event.key === 'Enter') {
        // Don't activate if search input is focused
        const searchInput = document.getElementById('search-input');
        if (searchInput && document.activeElement === searchInput) {
            return;
        }
        
        if (handleEnterKey()) {
            event.preventDefault();
            return;
        }
    }
}

// Initialize search functionality
function initializeSearch() {
    console.log('initializeSearch called');
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchClose = document.getElementById('search-close');

    if (!searchInput) {
        console.error('Search input not found!');
        return;
    }

    // Search input event listener with debounce for FTS
    let menuSearchTimer = null;
    searchInput.addEventListener('input', function () {
        const value = this.value;
        if (menuSearchTimer) clearTimeout(menuSearchTimer);
        menuSearchTimer = setTimeout(() => performSearch(value), 150);
    });

    // Search input keydown listener for Escape
    searchInput.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            hideSearchHeader();
        }
    });

    // Clear button
    searchClear.addEventListener('click', function () {
        searchInput.value = '';
        performSearch('');
        searchInput.focus();
    });

    // Close button
    searchClose.addEventListener('click', function () {
        hideSearchHeader();
    });
    console.log('Search initialization complete');
}

// Store original function references before we modify them
const originalLoadNotesByTagFunc = window.loadNotesByTag || loadNotesByTag;
const originalLoadTasksByTagFunc = window.loadTasksByTag || loadTasksByTag;
const originalLoadDecisionsByTagFunc = window.loadDecisionsByTag || loadDecisionsByTag;

// Override loadNotesByTag to store original data
function loadNotesWithDataStorage(data) {
    console.log('loadNotesWithDataStorage called with data:', data);
    // Store original data for search functionality
    if (!isSearchActive) {
        originalNotesData = Array.isArray(data) ? [...data] : [];
        console.log('Stored original notes data:', originalNotesData.length, 'items');
    }
    // Call the original function using the reference we stored
    originalLoadNotesByTagFunc.call(this, data);
}

// Override loadTasksByTag to store original data  
function loadTasksWithDataStorage(data) {
    console.log('loadTasksWithDataStorage called with data:', data);
    // Store original data for search functionality
    if (!isSearchActive) {
        originalTasksData = Array.isArray(data) ? [...data] : [];
        console.log('Stored original tasks data:', originalTasksData.length, 'items');
    }
    // Call the original function using the reference we stored
    originalLoadTasksByTagFunc.call(this, data);
}

// Override loadDecisionsByTag to store original data
function loadDecisionsWithDataStorage(data) {
    console.log('loadDecisionsWithDataStorage called with data:', data);
    // Store original data for search functionality
    if (!isSearchActive) {
        originalDecisionsData = Array.isArray(data) ? [...data] : [];
        console.log('Stored original decisions data:', originalDecisionsData.length, 'items');
    }
    // Call the original function using the reference we stored
    originalLoadDecisionsByTagFunc.call(this, data);
}

// Replace the global functions
window.loadNotesByTag = loadNotesWithDataStorage;
window.loadTasksByTag = loadTasksWithDataStorage;
window.loadDecisionsByTag = loadDecisionsWithDataStorage;

// Delete modal functionality
let pendingDeleteNoteId = null;

function showDeleteModal(noteId) {
    pendingDeleteNoteId = noteId;
    const modal = document.getElementById('delete-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    pendingDeleteNoteId = null;
}

function confirmDelete() {
    if (pendingDeleteNoteId !== null) {
        execute('deleteNote', pendingDeleteNoteId);
        hideDeleteModal();
    }
}

// Expose delete modal functions to window
window.showDeleteModal = showDeleteModal;
window.hideDeleteModal = hideDeleteModal;
window.confirmDelete = confirmDelete;

function preventTabScrollBounce() {
    const tabNav = document.querySelector('.tab-nav');
    if (tabNav) {
        tabNav.addEventListener('wheel', function(e) {
            // Prevent scroll events on tab navigation from bubbling up
            e.preventDefault();
        }, { passive: false });
    }

    // Also prevent bounce when scrolling over content that can't scroll
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tabContent => {
        tabContent.addEventListener('wheel', function(e) {
            const isScrollable = tabContent.scrollHeight > tabContent.clientHeight;
            const isAtTop = tabContent.scrollTop === 0;
            const isAtBottom = tabContent.scrollTop + tabContent.clientHeight >= tabContent.scrollHeight;

            // If not scrollable, or trying to scroll past boundaries, prevent default
            if (!isScrollable || (isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
                e.preventDefault();
            }
        }, { passive: false });
    });
}

function initializeMenuPage() {
    console.log('=== INITIALIZING MENU PAGE ===');
    initializeTagSelection();
    initializeSearch();
    preventTabScrollBounce();
    updateNotesSortMenu();

    document.addEventListener('click', function (event) {
        const sortControl = document.getElementById('notes-sort-control');
        if (sortControl && !sortControl.contains(event.target)) {
            closeNotesSortMenu();
        }
    });
    document.addEventListener('keydown', function (event) {
        const sortMenu = document.getElementById('notes-sort-menu');
        if (event.key === 'Escape' && sortMenu && sortMenu.classList.contains('open')) {
            closeNotesSortMenu();
            document.getElementById('notes-sort-toggle')?.focus();
        }
    });

    // Initialize delete modal buttons
    const modalCancel = document.getElementById('modal-cancel');
    const modalConfirm = document.getElementById('modal-confirm');
    const deleteModal = document.getElementById('delete-modal');

    if (modalCancel) {
        modalCancel.addEventListener('click', hideDeleteModal);
    }

    if (modalConfirm) {
        modalConfirm.addEventListener('click', confirmDelete);
    }

    // Close modal when clicking on overlay
    if (deleteModal) {
        deleteModal.addEventListener('click', function(event) {
            if (event.target === deleteModal) {
                hideDeleteModal();
            }
        });
    }

    execute('loadSettings', ''); // Load settings including dark mode
    execute('getLicenseStatus', ''); // Load license status and populate feature availability cache
    // Restore the last selected tab, or default to 'notes'
    // Home tab (legacy, per-project overview) can't be restored without an
    // active project, fall back to notes. The dashboard Home page has its own
    // branch below since it isn't a .tab-button and needs no project.
    // Graph tab is temporarily hidden, so fall back to notes if it was last selected.
    let lastSelectedTab = sessionStorage.getItem('lastSelectedTab') || 'notes';
    if (lastSelectedTab === 'home' || lastSelectedTab === 'graph') {
        lastSelectedTab = 'notes';
    }

    if (lastSelectedTab === 'dashboard') {
        // Home isn't a .tab-button (it lives in the sidebar), so it can't go
        // through the generic tabButton/tabContent restore below — showTab
        // already knows how to activate it correctly.
        showTab('dashboard');
    } else {
        // Remove active class from all tabs and buttons
        document.querySelectorAll('.tab-button').forEach(button => button.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active-content'));

        // Activate the restored tab
        const tabButton = document.querySelector(`.tab-button[data-tab-name="${lastSelectedTab}"]`);
        const tabContent = document.getElementById(`${lastSelectedTab}-content`);

        if (tabButton && tabContent) {
            tabButton.classList.add('active');
            tabContent.classList.add('active-content');

            updateFilterPaletteToggleVisibility(lastSelectedTab);

            // Load the appropriate content for the restored tab
            const activeTag = document.querySelector('.tag-item.active-tag');
            const tagIdToFilterBy = activeTag ? activeTag.dataset.tagId : 'all';

            switch (lastSelectedTab) {
                case 'notes':
                    execute('loadNotesByTag', tagIdToFilterBy);
                    break;
                case 'todo':
                    execute('loadTasksByTag', tagIdToFilterBy);
                    break;
                case 'done':
                    execute('loadDoneTasksByTag', tagIdToFilterBy);
                    break;
                case 'decisions':
                    execute('loadDecisionsByTag', tagIdToFilterBy);
                    break;
                case 'graph':
                    loadGraphGoals(tagIdToFilterBy);
                    break;
                default:
                    execute('loadNotesByTag', tagIdToFilterBy);
            }
        } else {
            // Fallback to default 'notes' tab if restored tab is invalid
            document.querySelector('.tab-button[onclick*="showTab(\'notes\')"]').classList.add('active');
            document.getElementById('notes-content').classList.add('active-content');
            execute('loadNotesByTag', 'all');
        }
    }

    execute('getTags', '');   // Request C# to send tags. C# will call JS populateTagList(data).
    
    // Initialize keyboard navigation to focus on active tag
    setTimeout(() => {
        const activeTag = document.querySelector('.tag-item.active-tag');
        if (activeTag) {
            const tags = getAllTags();
            const tagIndex = tags.indexOf(activeTag);
            if (tagIndex >= 0) {
                keyboardNavState.focusType = 'tag';
                keyboardNavState.tagIndex = tagIndex;
            }
        }
    }, 100);
    
    console.log('=== MENU PAGE INITIALIZATION COMPLETE ===');
}

// Handle external .margin file changes detected by the file watcher
window.onNoteExternalChange = async function(changeType, payload) {
    console.log('[watcher] External change:', changeType, payload);

    const lastTab = sessionStorage.getItem('lastSelectedTab') || 'notes';
    const activeTag = document.querySelector(
        '#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag',
    );
    const tagId = activeTag ? activeTag.dataset.tagId : 'all';
    const projectHomeIsActive = lastTab === 'home' &&
        activeTag?.classList.contains('project-item');

    // Refresh tags (a new/modified note may have added/removed tags)
    const tagsRefresh = execute('getTags', '');

    // Home is derived from the task cache, so refresh it explicitly after the
    // tag list has finished replacing its project rows.
    if (projectHomeIsActive) {
        try {
            await tagsRefresh;
        } catch (error) {
            console.error('[watcher] Failed to refresh project tags:', error);
            return;
        }
        const currentActiveTag = document.querySelector(
            '#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag',
        );
        if (sessionStorage.getItem('lastSelectedTab') !== 'home' ||
            currentActiveTag?.dataset.tagId !== tagId) {
            return;
        }
        const refreshedProject = Array.from(document.querySelectorAll(
            '#projects-list .tag-item[data-tag-id]',
        )).find(project => project.dataset.tagId === tagId);
        if (refreshedProject?.classList.contains('project-item')) {
            if (!refreshedProject.classList.contains('active-tag')) {
                document.querySelectorAll(
                    '#tag-list .tag-item.active-tag, #projects-list .tag-item.active-tag',
                ).forEach(tag => tag.classList.remove('active-tag'));
                refreshedProject.classList.add('active-tag');
            }
            // Note changes cannot alter the project's own metadata. Refresh
            // only the derived task and goal panels so editing the project
            // brief does not get interrupted by a file-watcher event.
            await Promise.all([
                loadTaskProgressBar(tagId),
                loadProjectGoals(tagId),
            ]);
        }
        return;
    }

    switch (lastTab) {
        case 'notes':
            execute('loadNotesByTag', tagId);
            break;
        case 'todo':
            execute('loadTasksByTag', tagId);
            break;
        case 'done':
            execute('loadDoneTasksByTag', tagId);
            break;
        case 'decisions':
            execute('loadDecisionsByTag', tagId);
            break;
        case 'graph':
            loadGraphGoals(tagId);
            break;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMenuPage);
} else {
    // DOM is already loaded, initialize immediately
    initializeMenuPage();
}