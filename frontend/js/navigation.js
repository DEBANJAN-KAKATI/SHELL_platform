function dateTimeTimestamp(value) {
    const text = String(value ?? '').trim();
    if (!text) return Infinity;
    const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (local) {
        const date = new Date(Number(local[3]), Number(local[2]) - 1, Number(local[1]), Number(local[4] || 0), Number(local[5] || 0), Number(local[6] || 0));
        return date.getFullYear() === Number(local[3]) && date.getMonth() === Number(local[2]) - 1 && date.getDate() === Number(local[1]) ? date.getTime() : Infinity;
    }
    const timestamp = Date.parse(text.replace(' ', 'T'));
    return Number.isNaN(timestamp) ? Infinity : timestamp;
}

function sortDateTimeRows(rows, column = 'DateTime') {
    return rows.map(row => ({
        row,
        time: dateTimeTimestamp(typeof column === 'function' ? column(row) : row[column] ?? row['Date/Time'] ?? row['Date and Time'])
    })).sort((left, right) => left.time === right.time ? 0 : left.time - right.time).map(entry => entry.row);
}

// Process of the current run (Isomerization or Reforming), chosen on the Run Plan page.
// Kept per browser tab like the Run Number; cleared by the reset button.
window.ILSProcess = {
    KEY: 'ils_process',
    LABELS: { isomerization: 'Isomerization', reforming: 'Reforming' },
    get() {
        try { return sessionStorage.getItem(this.KEY) === 'reforming' ? 'reforming' : 'isomerization'; } catch { return 'isomerization'; }
    },
    set(value) {
        try { sessionStorage.setItem(this.KEY, value === 'reforming' ? 'reforming' : 'isomerization'); } catch {}
    },
    isReforming() { return this.get() === 'reforming'; },
    label() { return this.LABELS[this.get()]; },
    runPlanUrl() { return this.isReforming() ? '/frontend/run_plan_reforming.html' : '/frontend/run_plan.html'; }
};

document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('main > header');
    if (!header || document.querySelector('.analysis-tabs')) return;

    const path = window.location.pathname.toLowerCase();
    const isCustom = path.endsWith('/custom_table.html') || path.endsWith('/custom-table') || path.endsWith('/custom_table') || path.endsWith('/custom') || path.includes('/frontend/custom_table.html');
    const isCalculation = !isCustom && (path.endsWith('/calculation_table.html') || path.endsWith('/calculation-table') || path.endsWith('/calculation_table') || path.endsWith('/calculation') || path.includes('/frontend/calculation_table.html'));
    const isPlots = path.endsWith('/plots.html') || path.endsWith('/plots') || path.includes('/frontend/plots.html');
    const isPlotDashboard = path.endsWith('/plot_dashboard.html');
    const isIntegrity = path.endsWith('/data-integrity');
    const isReformingRunPlan = path.endsWith('/run_plan_reforming.html');
    const isRunPlan = isReformingRunPlan || path.endsWith('/run_plan.html') || path.endsWith('/run-plan') || path.endsWith('/run_plan') || path.includes('/frontend/run_plan.html');
    const isOnline = path.endsWith('/online_analysis.html') || path.endsWith('/online-analysis') || path.endsWith('/online_analysis');
    const isHistory = path.endsWith('/history.html') || path.endsWith('/history');
    const isOffline = !isRunPlan && !isOnline && !isCalculation && !isCustom && !isPlots && !isHistory && !isPlotDashboard && !isIntegrity;

    header.insertAdjacentHTML(
        'afterend',
        `<nav aria-label="Analysis mode" class="analysis-tabs">` +
        `<a class="analysis-tab" href="/">Runs</a>` +
        `<a aria-current="${isRunPlan ? 'page' : 'false'}" class="analysis-tab${isRunPlan ? ' active' : ''}" href="${window.ILSProcess.runPlanUrl()}">Run Plan</a>` +
        `<div class="analysis-menu${isOffline || isOnline ? ' active' : ''}">` +
        `<button type="button" class="analysis-tab${isOffline || isOnline ? ' active' : ''}" aria-label="Analysis pages" aria-expanded="false" aria-haspopup="true">Analysis <span aria-hidden="true">▾</span></button>` +
        `<div class="analysis-menu-items">` +
        `<a aria-current="${isOffline ? 'page' : 'false'}" href="/frontend/index.html">Offline Analysis</a>` +
        `<a aria-current="${isOnline ? 'page' : 'false'}" href="/frontend/online_analysis.html">Online Analysis</a>` +
        `</div></div>` +
        `<div class="analysis-menu${isCalculation || isCustom ? ' active' : ''}">` +
        `<button type="button" class="analysis-tab${isCalculation || isCustom ? ' active' : ''}" aria-label="Calculation pages" aria-expanded="false" aria-haspopup="true">Calculation <span aria-hidden="true">▾</span></button>` +
        `<div class="analysis-menu-items">` +
        `<a aria-current="${isCalculation ? 'page' : 'false'}" href="/frontend/calculation_table.html">Calculation table</a>` +
        `<a aria-current="${isCustom ? 'page' : 'false'}" href="/frontend/custom_table.html">Custom table</a>` +
        `</div></div>` +
        `<a aria-current="${isPlots ? 'page' : 'false'}" class="analysis-tab${isPlots ? ' active' : ''}" href="/frontend/plots.html">Plots</a>` +
        `<a aria-current="${isPlotDashboard ? 'page' : 'false'}" class="analysis-tab${isPlotDashboard ? ' active' : ''}" href="/frontend/plot_dashboard.html">Summary Dashboard</a>` +
        `<a aria-current="${isHistory ? 'page' : 'false'}" class="analysis-tab${isHistory ? ' active' : ''}" href="/frontend/history.html">History</a>` +
        `</nav>`
    );

    const tabs = header.nextElementSibling;
    async function addOptionalIntegrityTab() {
        try {
            const response = await fetch('/api/data-integrity/config');
            if (!response.ok || !(await response.json()).enabled) return;
            const link = document.createElement('a');
            const active = isIntegrity;
            link.className = `analysis-tab${active ? ' active' : ''}`;
            link.href = '/data-integrity';
            link.textContent = 'Data Integrity';
            link.setAttribute('aria-current', active ? 'page' : 'false');
            tabs.querySelector('a[href="/frontend/plots.html"]').before(link);
        } catch (error) { }
    }
    addOptionalIntegrityTab();
    function closeMenus(except = null) {
        tabs.querySelectorAll('.analysis-menu').forEach(menu => {
            if (menu !== except) {
                menu.classList.remove('open');
                menu.querySelector('button').setAttribute('aria-expanded', 'false');
            }
        });
    }
    tabs.querySelectorAll('.analysis-menu > button').forEach(button => {
        button.addEventListener('click', () => {
            const menu = button.parentElement;
            const open = !menu.classList.contains('open');
            closeMenus();
            menu.classList.toggle('open', open);
            button.setAttribute('aria-expanded', String(open));
        });
    });
    tabs.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const openMenu = tabs.querySelector('.analysis-menu.open');
            if (openMenu) {
                closeMenus();
                openMenu.querySelector('button').focus();
            }
        }
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.analysis-menu')) closeMenus();
    });

    // Manual Historian save button (logic lives in historian_save.js)
    if (!isPlotDashboard) {
        const historianScript = document.createElement('script');
        historianScript.src = '/frontend/js/historian_save.js';
        historianScript.onload = () => {
            const runDataScript = document.createElement('script');
            runDataScript.src = '/frontend/js/run_data.js';
            document.head.appendChild(runDataScript);
        };
        document.head.appendChild(historianScript);
    }

    // Run Number state management
    const RUN_NUMBER_KEY = 'ils_run_number';
    let saveTimeout = null;

    function saveToServer(val) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            fetch('/api/run-number', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_number: val })
            }).catch(err => console.error('Failed to save run number to backend:', err));
        }, 200);
    }

    // Ensure refresh button exists and is wired up
    let refreshBtn = document.querySelector('#pageRefresh');
    if (!refreshBtn) {
        const targetContainer = header.querySelector('.header-actions') || header;
        targetContainer.insertAdjacentHTML('beforeend', '<button aria-label="Reset dashboard and Run Number" class="page-refresh" id="pageRefresh" title="Reset dashboard and Run Number" type="button">↻</button>');
        refreshBtn = document.querySelector('#pageRefresh');
    }
    if (refreshBtn && !isPlotDashboard) {
        refreshBtn.setAttribute('title', 'Reset dashboard and Run Number');
        refreshBtn.onclick = async (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            clearTimeout(saveTimeout);

            // 1. Clear all storages
            try { sessionStorage.clear(); } catch {}
            try {
                localStorage.removeItem(RUN_NUMBER_KEY);
                localStorage.removeItem('ils_run_number_active');
                localStorage.removeItem('dhaDashboardState');
                localStorage.removeItem('dhaOnlineState');
            } catch {}

            // 2. Clear inputs in DOM immediately
            const runInput = document.getElementById('runNumberInput');
            if (runInput) {
                runInput.value = '';
                runInput.defaultValue = '';
            }
            const runDisplay = document.getElementById('runNumberDisplay');
            if (runDisplay) {
                runDisplay.value = '';
                runDisplay.placeholder = '—';
            }

            // 3. Clear errors
            const rpError = document.getElementById('runPlanError');
            if (rpError) {
                rpError.textContent = '';
                rpError.classList.remove('show');
            }
            const dashError = document.getElementById('error');
            if (dashError) {
                dashError.textContent = '';
                dashError.style.display = 'none';
            }
            const onlineError = document.getElementById('onlineError');
            if (onlineError) {
                onlineError.textContent = '';
                onlineError.classList.remove('show');
            }
            const calcError = document.getElementById('calcError');
            if (calcError) {
                calcError.textContent = '';
                calcError.classList.remove('show');
            }
            const customError = document.getElementById('customError');
            if (customError) {
                customError.textContent = '';
                customError.classList.remove('show');
            }
            const plotError = document.getElementById('plotError');
            if (plotError) {
                plotError.textContent = '';
                plotError.classList.remove('show');
            }

            // 4. Send reset to server
            try {
                await fetch('/api/run-number', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ run_number: '' })
                });
            } catch (err) {
                console.error('Failed to reset run number on server:', err);
            }

            // 5. Clean navigation replace to avoid browser restoring cached form input
            window.location.replace(window.location.pathname);
        };
    }

    // Process selector (Run Plan pages) or read-only process badge (other pages)
    let refreshProcessLock = () => {};
    const processHost = (document.getElementById('runNumberInput') || document.getElementById('runNumberDisplay'))?.closest('.run-number-group');
    if (isRunPlan) {
        if (isReformingRunPlan !== window.ILSProcess.isReforming()) {
            window.location.replace(window.ILSProcess.runPlanUrl());
            return;
        }
        if (processHost) {
            processHost.insertAdjacentHTML('afterend',
                '<div class="run-number-group process-group">' +
                '<label for="processSelect" class="run-number-label">Process</label>' +
                '<select class="input run-number-input process-select" id="processSelect" title="Process of this run">' +
                '<option value="isomerization">Isomerization</option><option value="reforming">Reforming</option>' +
                '</select></div>');
            const processSelect = document.getElementById('processSelect');
            const runField = document.getElementById('runNumberInput');
            processSelect.value = window.ILSProcess.get();
            const syncProcessLock = () => {
                const hasRun = !!(runField?.value || '').trim();
                processSelect.disabled = !hasRun;
                processSelect.title = hasRun ? 'Process of this run' : 'Enter the Run Number first';
            };
            refreshProcessLock = syncProcessLock;
            syncProcessLock();
            runField?.addEventListener('input', syncProcessLock);
            runField?.addEventListener('change', syncProcessLock);
            processSelect.addEventListener('change', () => {
                if (processSelect.value !== window.ILSProcess.get()) {
                    // The loaded Run Plan belongs to the previous process.
                    try {
                        sessionStorage.removeItem('runPlanDashboardState');
                        sessionStorage.removeItem('ils_feed_properties');
                    } catch {}
                }
                window.ILSProcess.set(processSelect.value);
                window.location.assign(window.ILSProcess.runPlanUrl());
            });
        }
    } else if (processHost) {
        processHost.insertAdjacentHTML('afterend',
            '<div class="run-number-group process-group">' +
            '<span class="run-number-label">Process</span>' +
            `<input type="text" class="input run-number-input run-number-readonly process-badge" id="processDisplay" readonly disabled title="Process selected on the Run Plan page" value="${window.ILSProcess.label()}" />` +
            '</div>');
    }

    if (isRunPlan) {
        const runInput = document.getElementById('runNumberInput');
        if (runInput) {
            // Force reset DOM value initially so browser cannot restore previous typed value
            runInput.value = '';
            runInput.defaultValue = '';

            // Check if there is an active session run number
            const activeSession = sessionStorage.getItem('ils_run_number');
            if (activeSession) {
                runInput.value = activeSession;
                localStorage.setItem(RUN_NUMBER_KEY, activeSession);
            } else {
                // If there is NO active session in this tab/window, it's a fresh start -> clear localStorage
                localStorage.removeItem(RUN_NUMBER_KEY);
                runInput.value = '';
            }

            // Sync with backend API
            fetch('/api/run-number')
                .then(r => r.json())
                .then(data => {
                    const serverVal = (data && data.run_number !== undefined && data.run_number !== null) ? String(data.run_number).trim() : '';
                    const activeNow = sessionStorage.getItem('ils_run_number');
                    if (activeNow) {
                        runInput.value = activeNow;
                    } else if (serverVal) {
                        runInput.value = serverVal;
                        sessionStorage.setItem('ils_run_number', serverVal);
                        localStorage.setItem(RUN_NUMBER_KEY, serverVal);
                    } else {
                        runInput.value = '';
                        localStorage.removeItem(RUN_NUMBER_KEY);
                    }
                    refreshProcessLock();
                })
                .catch(() => {
                    if (!sessionStorage.getItem('ils_run_number')) {
                        runInput.value = '';
                        localStorage.removeItem(RUN_NUMBER_KEY);
                    }
                });

            // Prevent browser back/forward or reload restoring stale input
            window.addEventListener('pageshow', () => {
                const activeNow = sessionStorage.getItem('ils_run_number');
                if (!activeNow && runInput) {
                    runInput.value = '';
                    runInput.defaultValue = '';
                    localStorage.removeItem(RUN_NUMBER_KEY);
                }
            });

            // Strict whole-number keyboard input filtering
            runInput.addEventListener('keydown', (e) => {
                const allowed = [
                    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
                    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'
                ];
                if (allowed.includes(e.key)) return;
                if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x', 'z'].includes(e.key.toLowerCase())) return;

                // Disallow decimals, negatives, signs, exponent 'e', and non-digit characters
                if (!/^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                }
            });

            // Enforce whole-number sanitization on input & paste
            const handleRunNumberUpdate = () => {
                const cleaned = runInput.value.replace(/[^\d]/g, '');
                if (runInput.value !== cleaned) {
                    runInput.value = cleaned;
                }
                if (cleaned) {
                    sessionStorage.setItem('ils_run_number', cleaned);
                    localStorage.setItem(RUN_NUMBER_KEY, cleaned);
                } else {
                    sessionStorage.removeItem('ils_run_number');
                    localStorage.removeItem(RUN_NUMBER_KEY);
                }
                saveToServer(cleaned);
            };

            runInput.addEventListener('input', handleRunNumberUpdate);
            runInput.addEventListener('change', handleRunNumberUpdate);
        }
    } else {
        const runDisplay = document.getElementById('runNumberDisplay');
        if (runDisplay) {
            const updateDisplay = (val) => {
                const clean = (val || '').trim();
                runDisplay.value = clean;
                runDisplay.placeholder = clean ? '' : '—';
            };
            updateDisplay('');

            const sessionVal = sessionStorage.getItem('ils_run_number');
            if (sessionVal) {
                updateDisplay(sessionVal);
            } else {
                fetch('/api/run-number')
                    .then(r => r.json())
                    .then(data => {
                        const serverVal = (data && data.run_number !== undefined && data.run_number !== null) ? String(data.run_number).trim() : '';
                        const activeNow = sessionStorage.getItem('ils_run_number');
                        if (activeNow) {
                            updateDisplay(activeNow);
                        } else if (serverVal) {
                            updateDisplay(serverVal);
                            sessionStorage.setItem('ils_run_number', serverVal);
                            localStorage.setItem(RUN_NUMBER_KEY, serverVal);
                        } else {
                            updateDisplay('');
                            localStorage.removeItem(RUN_NUMBER_KEY);
                        }
                    })
                    .catch(() => updateDisplay(''));
            }

            window.addEventListener('pageshow', () => {
                const activeNow = sessionStorage.getItem('ils_run_number');
                updateDisplay(activeNow || '');
            });

            // Listen for cross-tab storage changes
            window.addEventListener('storage', (e) => {
                if (e.key === RUN_NUMBER_KEY) {
                    updateDisplay(e.newValue || '');
                }
            });
        }
    }

    // Readiness status indicator observer: green dot when idle/ready, hourglass when background file is processing
    const readinessEl = document.querySelector('.readiness-indicator');
    const statusTextEl = document.querySelector('.readiness-indicator .pill');
    if (readinessEl && statusTextEl) {
        function updateReadinessState() {
            const txt = (statusTextEl.textContent || '').trim().toLowerCase();
            const isBusy = txt.includes('...') || txt.includes('loading') || txt.includes('processing') || txt.includes('importing') || txt.includes('browsing');
            readinessEl.classList.toggle('processing', isBusy);
        }
        updateReadinessState();
        const obs = new MutationObserver(updateReadinessState);
        obs.observe(statusTextEl, { characterData: true, childList: true, subtree: true });
    }
});

