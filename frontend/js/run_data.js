(() => {
    if (window.ILSRunData) return;

    const historian = window.ILSHistorian;
    const sourceKeys = ['runPlanDashboardState', 'dhaDashboardState', 'dhaOnlineState',
        'ils_base_table_state', 'ils_yield_table_state', 'ils_custom_columns', 'ils_custom_table_state',
        'ils_reforming_offline', 'ils_reforming_carbon_state', 'ils_reforming_summary_state', 'ils_mb_inputs', 'ils_mb_results'];

    async function request(url, options) {
        const response = await fetch(url, options);
        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.error || 'RunData request failed');
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    function message(text) {
        const status = document.querySelector('#runDataStatus');
        if (status) status.textContent = text;
        else historian.toast(text, 'info');
    }

    async function listRuns() {
        return (await request('/api/run-data/runs')).runs;
    }

    async function saveCurrentRun() {
        const button = document.querySelector('#saveRunDetails');
        const payload = historian.collectPayload();
        if (!sourceKeys.some(key => payload.raw_state[key])) {
            historian.toast('Load source data before saving Run Details.', 'info');
            return;
        }
        if (button) { button.disabled = true; button.textContent = 'Saving...'; }
        try {
            const body = {
                run_number: payload.run_number,
                metadata: payload.metadata,
                raw_state: payload.raw_state
            };
            const save = () => request('/api/run-data/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            let result;
            try {
                result = await save();
            } catch (error) {
                if (error.status !== 409 || !error.data?.existing_runs?.length) throw error;
                const latest = error.data.existing_runs[0];
                const date = new Date(latest.saved_at).toLocaleString();
                const choice = await historian.showModal({
                    title: `Run ${error.data.run_number} already saved`,
                    message: `Replace the latest file (saved ${date}), or save a new version? Earlier versions will be kept.`,
                    buttons: [
                        { label: 'Cancel', value: 'cancel' },
                        { label: 'Replace latest file', value: 'replace' },
                        { label: 'Save new version', value: 'new_version', cls: 'primary' }
                    ]
                });
                if (choice !== 'replace' && choice !== 'new_version') {
                    historian.toast('Save cancelled. Existing RunData files left unchanged.', 'info');
                    return;
                }
                body.save_mode = choice;
                if (choice === 'replace') body.replace_id = latest.id;
                result = await save();
            }
            const action = body.save_mode === 'replace' ? 'latest file replaced' : body.save_mode === 'new_version' ? 'saved as a new version' : 'saved to RunData';
            historian.toast(`Run ${result.run_number || 'draft'} ${action}.`);
            if (document.querySelector('#savedRunSelect')) await refreshRuns(result.id);
            return result;
        } catch (error) {
            historian.toast(error.message, 'error');
        } finally {
            if (button) { button.disabled = false; button.textContent = 'Save Run Details'; }
        }
    }

    async function refreshRuns(preferredId = '') {
        const select = document.querySelector('#savedRunSelect');
        if (!select) return;
        try {
            const runs = await listRuns();
            const pickerButton = select.querySelector('button');
            select.replaceChildren(...(pickerButton ? [pickerButton] : []), new Option('Populate Run', ''));
            runs.forEach(run => {
                const date = new Date(run.saved_at).toLocaleString();
                select.add(new Option(`Populate Run-${run.run_number || 'draft'} (${date})`, run.id));
            });
            if (preferredId && runs.some(run => run.id === preferredId)) select.value = preferredId;
            select.disabled = !runs.length;
            select.onchange = updateSelection;
            updateSelection();
            message(runs.length ? '' : 'No runs saved yet');
        } catch (error) {
            message(error.message);
        }
    }

    let selectionVersion = 0;

    async function updateSelection() {
        const version = ++selectionVersion;
        const selected = !!document.querySelector('#savedRunSelect')?.value;
        document.querySelector('#loadRunBtn').disabled = !selected;
        const detail = document.querySelector('.run-home-detail');
        if (detail) detail.hidden = !selected;
        const panel = document.querySelector('#runMetadata');
        panel.hidden = true;
        panel.replaceChildren();
        if (!selected) return;
        message('Loading run metadata...');
        try {
            const run = await selectedRun();
            if (version !== selectionVersion) return;
            showMetadata(run);
            message(`Run ${run.run_number || 'draft'} selected`);
        } catch (error) {
            if (version === selectionVersion) message(error.message);
        }
    }

    async function selectedRun() {
        const id = document.querySelector('#savedRunSelect')?.value;
        if (!id) return null;
        return request(`/api/run-data/runs/${encodeURIComponent(id)}`);
    }

    function showMetadata(run) {
        const panel = document.querySelector('#runMetadata');
        panel.replaceChildren();
        const info = run.metadata || {};
        const items = [
            ['Run Number', run.run_number || 'Draft'],
            ['Last edited by', `${run.last_edited_by || 'Unknown'}${run.editor_source ? ` (${run.editor_source})` : ''}`],
            ['Last edited', new Date(run.last_edited_at || run.saved_at).toLocaleString()],
            ['Objective', info.experiment?.objective || '—'],
            ['Data Sources', Object.keys(run.raw_state || {}).length + ' saved state entries'],
            ...Object.entries(info.source_files || {}).filter(([, value]) => value).map(([key, value]) => [key.replaceAll('_', ' '), value])
        ];
        items.forEach(([label, value]) => {
            const item = document.createElement('div');
            item.className = 'run-meta-item';
            const title = document.createElement('span');
            title.textContent = label;
            const detail = document.createElement('strong');
            detail.textContent = value;
            item.append(title, detail);
            panel.append(item);
        });
        panel.hidden = false;
    }

    async function loadSelectedRun() {
        if (!document.querySelector('#savedRunSelect')?.value) return;
        const choice = await historian.showModal({
            title: 'Load saved run',
            message: 'This will replace the data currently open in this browser tab. Continue?',
            buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Load run', value: 'load', cls: 'primary' }]
        });
        if (choice !== 'load') return;
        try {
            const run = await selectedRun();
            await historian.applySavedState(run);
            const allowed = new Set(['/frontend/run_plan.html', '/frontend/index.html',
                '/frontend/online_analysis.html', '/frontend/calculation_table.html',
                '/frontend/custom_table.html', '/frontend/plots.html', '/plots',
                '/frontend/history.html', '/history']);
            const path = run.metadata?.saved_from_page;
            window.location.assign(allowed.has(path) ? path : '/frontend/run_plan.html');
        } catch (error) {
            message(error.message);
        }
    }

    async function startFresh() {
        if (sourceKeys.some(key => sessionStorage.getItem(key)) ||
            ['dhaDashboardState', 'dhaOnlineState'].some(key => localStorage.getItem(key))) {
            const choice = await historian.showModal({
                title: 'Start with fresh data',
                message: 'Unsaved data in this browser tab will be cleared. Saved RunData snapshots will remain available.',
                buttons: [{ label: 'Cancel', value: 'cancel' }, { label: 'Start fresh', value: 'start', cls: 'primary' }]
            });
            if (choice !== 'start') return;
        }
        sessionStorage.clear();
        ['ils_run_number', 'ils_run_number_active', 'dhaDashboardState', 'dhaOnlineState'].forEach(key => localStorage.removeItem(key));
        try {
            await request('/api/run-number', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ run_number: '' })
            });
        } catch (error) {
            message(error.message);
            return;
        }
        window.location.assign('/frontend/run_plan.html');
    }

    function mount() {
        const actions = document.querySelector('main > header .header-actions');
        let button = document.querySelector('#saveRunDetails');
        if (!button && actions) {
            button = document.createElement('button');
            button.type = 'button';
            button.id = 'saveRunDetails';
            button.className = 'btn secondary historian-save-btn';
            button.textContent = 'Save Run Details';
            actions.insertBefore(button, actions.querySelector('#historianSave') || actions.querySelector('#pageRefresh'));
        }
        if (button) button.onclick = saveCurrentRun;
        if (document.querySelector('#savedRunSelect')) {
            document.querySelector('#loadRunBtn').onclick = loadSelectedRun;
            document.querySelector('#startFreshBtn').onclick = startFresh;
            refreshRuns();
        }
    }

    window.ILSRunData = { saveCurrentRun, listRuns, refreshRuns, startFresh };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
    else mount();
})();