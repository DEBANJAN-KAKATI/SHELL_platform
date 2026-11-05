(() => {
    if (window.ILSHistorian) return;

    const STATE_KEYS = [
        'runPlanDashboardState', 'ils_feed_properties', 'dhaDashboardState', 'dhaOnlineState',
        'dhaDateTimeFilter', 'ils_base_table_state', 'ils_yield_table_state', 'ils_custom_columns',
        'ils_custom_table_state', 'ils_plot_preferences',
        'ils_process', 'ils_reforming_offline', 'ils_reforming_carbon_state', 'ils_reforming_summary_state'
    ];
    // Existing pages also mirror these two keys in localStorage and read them as a fallback.
    const LOCAL_FALLBACK_KEYS = ['dhaDashboardState', 'dhaOnlineState'];
    const PLACEHOLDERS = ['', 'none', 'null', 'unknown', 'undefined', 'nan', 'na', 'n/a', '-'];

    function readRaw(key) {
        let v = null;
        try { v = sessionStorage.getItem(key); } catch (e) {}
        if (!v && LOCAL_FALLBACK_KEYS.includes(key)) {
            try { v = localStorage.getItem(key); } catch (e) {}
        }
        return v;
    }

    function readJson(key) {
        const raw = readRaw(key);
        if (!raw) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    }

    function currentRunNumber() {
        let v = '';
        try { v = sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || ''; } catch (e) {}
        if (!v) v = document.getElementById('runNumberInput')?.value || document.getElementById('runNumberDisplay')?.value || '';
        v = String(v).trim();
        return PLACEHOLDERS.includes(v.toLowerCase()) ? '' : v;
    }

    function columnsOf(rows, preferred) {
        const cols = Array.isArray(preferred) ? preferred.filter(c => c !== null && c !== undefined && c !== '') : [];
        const seen = new Set(cols);
        (rows || []).forEach(r => {
            if (r && typeof r === 'object') Object.keys(r).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } });
        });
        return cols;
    }

    function collectPayload() {
        const tables = [];
        const kpis = [];
        const addTable = (key, title, section, rows, columns) => {
            if (!Array.isArray(rows) || !rows.length) return;
            tables.push({ key, title, section, rows, columns: columnsOf(rows, columns) });
        };
        const addKpi = (key, label, section, value) => {
            if (value === undefined || value === null || value === '') return;
            kpis.push({ key, label, section, value });
        };

        const rp = readJson('runPlanDashboardState') || {};
        const rpSummary = rp.summary || {};
        addTable('run_plan.feed', 'Run Plan · Feed', 'Run Plan', Array.isArray(rp.feedRows) ? rp.feedRows : readJson('ils_feed_properties'));
        const planLabels = { parameter: 'Parameter', units: 'Units', r1: 'R1', r2: 'R2', r3: 'R3', r4: 'R4', r5: 'R5', r6: 'R6', r7: 'R7', r8: 'R8' };
        const planRows = (rp.planData?.rows || []).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [planLabels[k] || k, v])));
        addTable('run_plan.plan', 'Plan', 'Run Plan', planRows, Object.values(planLabels));
        addTable('run_plan.doe', 'Run Plan · DOE', 'Run Plan', rp.doeData?.rows, rp.doeData?.columns);
        addKpi('run_plan.feed_count', 'Feed Components', 'Run Plan', rpSummary.feed_count);
        addKpi('run_plan.plan_count', 'Plan Parameters', 'Run Plan', rp.planData?.rows?.length);
        addKpi('run_plan.doe_count', 'DOE Conditions', 'Run Plan', rpSummary.doe_count);
        addKpi('run_plan.reactor_count', 'Active Reactors', 'Run Plan', rpSummary.reactor_count);

        const off = readJson('dhaDashboardState') || {};
        addTable('offline.table1_carbon_number', 'Offline · Table-1 Carbon-number', 'Offline Analysis', off.r1);
        addTable('offline.table2_component_list', 'Offline · Table-2 Component-list', 'Offline Analysis', off.r2, off.c2);
        addTable('offline.table3_octane', 'Offline · Table-3 Octane', 'Offline Analysis', off.r3);
        addTable('offline.reactor_map', 'Offline · Reactor Map', 'Offline Analysis', off.reactorRows);
        Object.entries(off.summary || {}).forEach(([k, v]) => {
            if (typeof v === 'number') addKpi(`offline.${k}`, k.replace(/_/g, ' '), 'Offline Analysis', v);
        });

        const onl = readJson('dhaOnlineState') || {};
        addTable('online.analysis', 'Online Analysis', 'Online Analysis', onl.rows, onl.columns);
        addKpi('online.record_count', 'Online Records', 'Online Analysis', Array.isArray(onl.rows) ? onl.rows.length : null);

        const base = readJson('ils_base_table_state') || {};
        addTable('calculation.base_table', 'Calculation · Base table', 'Calculation table', base.rows, base.columns);
        addKpi('calculation.base_records', 'Base Table Records', 'Calculation table', Array.isArray(base.rows) ? base.rows.length : null);
        addKpi('calculation.base_columns', 'Base Table Parameters', 'Calculation table', Array.isArray(base.rows) && base.rows.length ? (base.columns || []).length : null);

        const yld = readJson('ils_yield_table_state') || {};
        addTable('calculation.yield_table', 'Calculation · Yield Table (wof%)', 'Calculation table', yld.rows, yld.columns);
        addKpi('calculation.yield_records', 'Yield Table Records', 'Calculation table', Array.isArray(yld.rows) ? yld.rows.length : null);

        const reforming = readJson('ils_reforming_carbon_state') || {};
        addTable('calculation.reforming_carbon', 'Calculation · Reforming CARBON_TABULAR(%WGT)', 'Calculation table', reforming.rows, reforming.columns);
        const reformingSummary = readJson('ils_reforming_summary_state') || {};
        addTable('calculation.reforming_summary', 'Calculation · Reforming Component Summary', 'Calculation table', reformingSummary.rows, reformingSummary.columns);

        // Custom table computed rows only exist in memory while the Custom table page is open.
        if (typeof customState !== 'undefined' && Array.isArray(customState.computedRows) && customState.computedRows.length) {
            const removed = customState.removedColumns instanceof Set ? customState.removedColumns : new Set();
            const cols = [...(customState.baseColumns || []), ...(customState.customColumns || []).map(c => c.name)].filter(c => !removed.has(c));
            addTable('custom.custom_table', 'Custom table', 'Custom table', customState.computedRows, cols);
        }

        const raw_state = {};
        STATE_KEYS.forEach(k => { const v = readRaw(k); if (v) raw_state[k] = v; });

        const metadata = {
            client_saved_at: new Date().toISOString(),
            saved_from_page: window.location.pathname,
            source_files: {
                run_plan_file: rp.filePath || rpSummary.file_path || '',
                online_file: onl.path || '',
                offline_xls_folder: document.getElementById('folder')?.value || '',
                reactor_map_folder: document.getElementById('reactorFolder')?.value || ''
            },
            experiment: {
                objective: rp.planData?.objective || '',
                reactors: rpSummary.reactors || [],
                datetime_filter: readJson('dhaDateTimeFilter') || {},
                offline_selected_reactor: off.selectedReactor || '',
                online_summary: onl.summary || ''
            },
            custom_column_definitions: readJson('ils_custom_columns') || []
        };

        return { run_number: currentRunNumber(), metadata, tables, kpis, raw_state };
    }

    // ---------------------------------------------------------------- UI helpers
    function ensureStyles() {
        if (document.getElementById('historianCss')) return;
        const link = document.createElement('link');
        link.id = 'historianCss';
        link.rel = 'stylesheet';
        link.href = '/frontend/css/historian.css';
        document.head.appendChild(link);
    }

    function showModal({ title, message, buttons }) {
        ensureStyles();
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'historian-modal-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            const box = document.createElement('div');
            box.className = 'historian-modal';
            const h = document.createElement('h3');
            h.textContent = title;
            const p = document.createElement('p');
            p.textContent = message;
            const actions = document.createElement('div');
            actions.className = 'historian-modal-actions';
            const close = value => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
            const onKey = e => { if (e.key === 'Escape') close('cancel'); };
            buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `btn ${b.cls || 'secondary'}`;
                btn.textContent = b.label;
                btn.onclick = () => close(b.value);
                actions.appendChild(btn);
            });
            box.append(h, p, actions);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            document.addEventListener('keydown', onKey);
            actions.querySelector('button:last-child')?.focus();
        });
    }

    function toast(message, kind = 'ok') {
        ensureStyles();
        const el = document.createElement('div');
        el.className = `historian-toast ${kind}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    }

    async function postSave(payload, overwrite) {
        const r = await fetch('/api/historian/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ run_number: payload.run_number, payload, overwrite })
        });
        let d = {};
        try { d = await r.json(); } catch (e) {}
        return { status: r.status, data: d };
    }

    async function saveToHistorian() {
        const btn = document.getElementById('historianSave');
        const runNum = currentRunNumber();
        if (!runNum) {
            await showModal({
                title: 'Run Number missing',
                message: 'Run Number is missing. Enter a Run Number on the Run Plan page before saving to Historian. Nothing was saved.',
                buttons: [{ label: 'OK', value: 'ok', cls: 'primary' }]
            });
            return;
        }
        const payload = collectPayload();
        if (!payload.tables.length) {
            await showModal({
                title: 'Nothing to save',
                message: `No dashboard results are loaded for Run ${runNum}. Process data first, then save to Historian.`,
                buttons: [{ label: 'OK', value: 'ok', cls: 'primary' }]
            });
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
        try {
            let res = await postSave(payload, false);
            if (res.status === 409 && res.data.exists) {
                const choice = await showModal({
                    title: 'Run already in Historian',
                    message: `A Historian file already exists for Run ${res.data.run_number}.\nDo you want to replace the existing file?`,
                    buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Replace', value: 'replace', cls: 'primary' }]
                });
                if (choice !== 'replace') {
                    toast(`Save cancelled. Existing Run ${res.data.run_number} file left unchanged.`, 'info');
                    return;
                }
                res = await postSave(payload, true);
            }
            if (res.status === 200) {
                toast(`Run ${res.data.run_number} ${res.data.replaced ? 'replaced' : 'saved'} in Historian (${res.data.table_count} tables, ${res.data.kpi_count} KPIs).`);
            } else {
                await showModal({
                    title: 'Save failed',
                    message: res.data.error || 'Historian save failed.',
                    buttons: [{ label: 'OK', value: 'ok', cls: 'primary' }]
                });
            }
        } catch (e) {
            toast(`Historian save failed: ${e.message}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save to Historian'; }
        }
    }

    async function applySavedState(run) {
        const state = run.raw_state || {};
        STATE_KEYS.forEach(k => {
            try {
                if (state[k] !== undefined) sessionStorage.setItem(k, state[k]); else sessionStorage.removeItem(k);
                if (LOCAL_FALLBACK_KEYS.includes(k)) {
                    if (state[k] !== undefined) localStorage.setItem(k, state[k]); else localStorage.removeItem(k);
                }
            } catch (e) {}
        });
        const rn = String(run.run_number || '');
        try { sessionStorage.setItem('ils_run_number', rn); localStorage.setItem('ils_run_number', rn); } catch (e) {}
        if (/^\d+$/.test(rn)) {
            try {
                await fetch('/api/run-number', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ run_number: rn }) });
            } catch (e) {}
        }
        return true;
    }

    // Write a saved run's original dashboard state back into this browser session.
    async function restoreToDashboard(run) {
        const choice = await showModal({
            title: `Load Run ${run.run_number} into dashboard`,
            message: 'This replaces the results currently loaded in this browser session with the saved Historian results. Continue?',
            buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Load', value: 'load', cls: 'primary' }]
        });
        if (choice !== 'load') return false;
        return applySavedState(run);
    }

    function mountButton() {
        const actions = document.querySelector('main > header .header-actions');
        if (!actions || document.getElementById('historianSave')) return;
        ensureStyles();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'historianSave';
        btn.className = 'btn primary historian-save-btn';
        btn.title = 'Save all current dashboard results for this Run Number to the Historian folder';
        btn.textContent = 'Save to Historian';
        btn.onclick = saveToHistorian;
        const refresh = actions.querySelector('#pageRefresh');
        actions.insertBefore(btn, refresh || null);
    }

    window.ILSHistorian = { collectPayload, currentRunNumber, saveToHistorian, restoreToDashboard, applySavedState, showModal, toast };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
    else mountButton();
})();
