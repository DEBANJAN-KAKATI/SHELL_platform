const $ = s => document.querySelector(s);

let activeSubtab = 'feed';
let feedRows = [];
let planData = { objective: '', rows: [] };
let doeData = { columns: [], rows: [] };
let summary = null;

const showError = (m = '') => {
    const el = $('#runPlanError');
    if (!el) return;
    el.textContent = m;
    el.classList.toggle('show', !!m);
};

const fmt = v => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number' && Number.isFinite(v)) {
        return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    const num = Number(v);
    if (!isNaN(num) && String(v).trim() !== '' && !String(v).includes('-') && !String(v).includes(':')) {
        return Number.isInteger(num) ? String(num) : num.toFixed(2);
    }
    return String(v);
};

const doeValue = (row, label) => row[label] ?? row[Object.keys(row).find(key => key.replace(/\n/g, ' ').trim() === label)] ?? '';

async function getJson(r) {
    const t = await r.text();
    try {
        return JSON.parse(t);
    } catch {
        throw new Error('Server returned an invalid response. Check backend connection.');
    }
}

function updateKpis(s) {
    if (!s) return;
    if ($('#kpiFeed')) $('#kpiFeed').textContent = s.feed_count ?? feedRows.length;
    if ($('#kpiPlan')) $('#kpiPlan').textContent = s.plan_count ?? planData.rows.length;
    if ($('#kpiDoe')) $('#kpiDoe').textContent = s.doe_count ?? doeData.rows.length;
    if ($('#kpiReactors')) $('#kpiReactors').textContent = s.active_reactors?.length ?? s.reactor_count ?? 8;
}

function updateReactorFilterOptions(reactors) {
    const sel = $('#doeReactorFilter');
    if (!sel) return;
    const current = sel.value;
    const list = Array.isArray(reactors) && reactors.length ? reactors : ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
    sel.innerHTML = '<option value="">All Reactors</option>' + list.map(r => `<option value="${r}">Reactor: ${r}</option>`).join('');
    if (list.includes(current)) sel.value = current;
}

function updateConditionFilterOptions() {
    const sel = $('#doeConditionFilter');
    if (!sel) return;
    const current = sel.value;
    const conditions = [...new Set(doeData.rows.map(row => String(doeValue(row, 'Condition No.') ?? '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    sel.replaceChildren(new Option('All Conditions', ''));
    conditions.forEach(condition => sel.add(new Option(`Condition ${condition}`, condition)));
    if (conditions.includes(current)) sel.value = current;
}

function renderFeed() {
    const q = ($('#feedSearch')?.value || '').toLowerCase().trim();
    let rows = feedRows;
    if (q) {
        rows = rows.filter(r => Object.values(r).join(' ').toLowerCase().includes(q));
    }
    const tbody = $('#feedTbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td style="text-align: left; font-weight: 600; padding-left: 16px;">${r.component || ''}</td>
            <td style="text-align: center;">${fmt(r.carbon_no)}</td>
            <td style="text-align: center;">${r.group || ''}</td>
            <td style="text-align: center;">${r.unit || ''}</td>
            <td style="text-align: center; font-weight: 600;">${fmt(r.value)}</td>
        </tr>
    `).join('');
    if ($('#feedEmpty')) $('#feedEmpty').style.display = rows.length ? 'none' : 'block';
    if ($('#feedSummary')) {
        $('#feedSummary').textContent = q 
            ? `Showing ${rows.length} of ${feedRows.length} feed entries matching "${q}"`
            : `Showing all ${feedRows.length} feed components and properties`;
    }
}

function renderPlan() {
    const objText = planData.objective || '';
    if ($('#planObjectiveText')) {
        $('#planObjectiveText').textContent = objText || 'No objective statement found in selected workbook.';
    }

    const q = ($('#planSearch')?.value || '').toLowerCase().trim();
    let rows = planData.rows || [];
    if (q) {
        rows = rows.filter(r => Object.values(r).join(' ').toLowerCase().includes(q));
    }
    const tbody = $('#planTbody');
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => `
        <tr>
            <td style="text-align: left; font-weight: 600; padding-left: 16px;">${r.parameter || ''}</td>
            <td style="text-align: center; color: var(--slate);">${r.units || '--'}</td>
            <td style="text-align: center;">${fmt(r.r1)}</td>
            <td style="text-align: center;">${fmt(r.r2)}</td>
            <td style="text-align: center;">${fmt(r.r3)}</td>
            <td style="text-align: center;">${fmt(r.r4)}</td>
            <td style="text-align: center;">${fmt(r.r5)}</td>
            <td style="text-align: center;">${fmt(r.r6)}</td>
            <td style="text-align: center;">${fmt(r.r7)}</td>
            <td style="text-align: center;">${fmt(r.r8)}</td>
        </tr>
    `).join('');
    if ($('#planEmpty')) $('#planEmpty').style.display = rows.length ? 'none' : 'block';
    if ($('#planSummary')) {
        $('#planSummary').textContent = q
            ? `Showing ${rows.length} of ${planData.rows.length} parameters matching "${q}"`
            : `Loading configuration across Reactors R1 to R8 (${planData.rows.length} parameters)`;
    }
}

function updateDoeImportStatus() {
    const status = $('#doeImportStatus');
    if (!status) return;
    status.style.color = '';
    const rows = doeData.rows || [];
    if (!rows.length) {
        status.textContent = summary ? 'Import completed: no DOE rows found.' : 'No DOE data imported.';
        return;
    }
    const columns = doeData.columns || [];
    const missingColumns = new Set();
    rows.forEach(row => {
        columns.forEach(column => {
            const value = row[column];
            if (value === null || value === undefined || String(value).trim() === '') {
                missingColumns.add(column);
            }
        });
    });
    status.style.color = missingColumns.size ? '#b91c1c' : '';
    status.textContent = missingColumns.size
        ? `\u26A0 Missing: ${[...missingColumns].join(', ')}.`
        : 'Import completed: no missing DOE values.';
    if (missingColumns.has('End Date')) {
        const today = new Date();
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        status.textContent += ` Assumption: blank End Date = today (${date}), end of day.`;
    }
}

function renderDoe() {
    updateDoeImportStatus();
    const conditionFilter = $('#doeConditionFilter')?.value || '';
    const reactorFilter = $('#doeReactorFilter')?.value || '';
    const cols = doeData.columns || [];
    doeData.rows = sortDateTimeRows(doeData.rows || [], 'Start Date');
    let rows = doeData.rows;

    if (reactorFilter) {
        rows = rows.filter(r => String(doeValue(r, 'Reactor ID') || '').trim() === reactorFilter);
    }
    if (conditionFilter) {
        rows = rows.filter(r => String(doeValue(r, 'Condition No.') ?? '').trim() === conditionFilter);
    }

    const thead = $('#doeThead');
    const tbody = $('#doeTbody');
    if (!thead || !tbody) return;

    thead.innerHTML = cols.map((c, i) => {
        const isLast = i === cols.length - 1;
        return `<th style="text-align: ${isLast ? 'left; padding-left: 16px;' : 'center'};">${c}</th>`;
    }).join('');

    tbody.innerHTML = rows.map(r => `
        <tr>
            ${cols.map((c, i) => {
                const val = r[c] ?? '';
                const isHighlight = c === 'Reactor ID';
                const isLast = i === cols.length - 1;
                return `<td style="text-align: ${isLast ? 'left; padding-left: 16px;' : 'center'}; ${isHighlight ? 'font-weight: 700; color: var(--burnt);' : ''}">${fmt(val)}</td>`;
            }).join('')}
        </tr>
    `).join('');


    if ($('#doeEmpty')) $('#doeEmpty').style.display = rows.length ? 'none' : 'block';
    if ($('#doeSummary')) {
        const filterParts = [];
        if (reactorFilter) filterParts.push(`Reactor: ${reactorFilter}`);
        if (conditionFilter) filterParts.push(`Condition: ${conditionFilter}`);
        $('#doeSummary').textContent = filterParts.length
            ? `Showing ${rows.length} of ${doeData.rows.length} conditions (${filterParts.join(' · ')})`
            : `Showing all ${doeData.rows.length} conditions across condition blocks`;
    }
}

function switchSubtab(name) {
    activeSubtab = name;
    document.querySelectorAll('.table-tabs .table-tab').forEach(btn => {
        const on = btn.dataset.subtab === name;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', String(on));
    });

    if ($('#feedPanel')) $('#feedPanel').hidden = name !== 'feed';
    if ($('#planPanel')) $('#planPanel').hidden = name !== 'plan';
    if ($('#doePanel')) $('#doePanel').hidden = name !== 'doe';

    if (name === 'feed') renderFeed();
    else if (name === 'plan') renderPlan();
    else if (name === 'doe') renderDoe();

    saveState();
}

function saveState() {
    try {
        const state = {
            activeSubtab,
            filePath: $('#runPlanFile')?.value || '',
            feedRows,
            planData,
            doeData,
            summary,
            process: window.ILSProcess?.get?.() || 'isomerization',
            feedSearch: $('#feedSearch')?.value || '',
            planSearch: $('#planSearch')?.value || '',
            doeCondition: $('#doeConditionFilter')?.value || '',
            doeReactor: $('#doeReactorFilter')?.value || '',
        };
        sessionStorage.setItem('runPlanDashboardState', JSON.stringify(state));
        if (Array.isArray(feedRows) && feedRows.length) {
            sessionStorage.setItem('ils_feed_properties', JSON.stringify(feedRows));
        }
    } catch (e) {}
}

function restoreState() {
    try {
        const raw = sessionStorage.getItem('runPlanDashboardState');
        if (!raw) return false;
        const saved = JSON.parse(raw);
        if (saved && (!saved.process || saved.process === (window.ILSProcess?.get?.() || 'isomerization'))) {
            if (saved.filePath && $('#runPlanFile')) $('#runPlanFile').value = saved.filePath;
            if (Array.isArray(saved.feedRows)) feedRows = saved.feedRows;
            if (saved.planData) planData = saved.planData;
            if (saved.doeData) doeData = saved.doeData;
            updateConditionFilterOptions();
            if (saved.summary) {
                summary = saved.summary;
                updateKpis(summary);
                updateReactorFilterOptions(summary.reactors);
            }
            if (saved.feedSearch && $('#feedSearch')) $('#feedSearch').value = saved.feedSearch;
            if (saved.planSearch && $('#planSearch')) $('#planSearch').value = saved.planSearch;
            if (saved.doeCondition && $('#doeConditionFilter')) $('#doeConditionFilter').value = saved.doeCondition;
            if (saved.doeReactor && $('#doeReactorFilter')) $('#doeReactorFilter').value = saved.doeReactor;
            if (saved.activeSubtab) activeSubtab = saved.activeSubtab;
            updateDoeImportStatus();
            return true;
        }
    } catch (e) {
        sessionStorage.removeItem('runPlanDashboardState');
    }
    return false;
}

async function processFile(path) {
    const runNum = (document.getElementById('runNumberInput')?.value || sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim();
    if (!runNum) {
        showError("Please enter run number to start with");
        const runInput = document.getElementById('runNumberInput');
        if (runInput) {
            runInput.focus();
            runInput.classList.add('input-attention');
            setTimeout(() => runInput.classList.remove('input-attention'), 1500);
        }
        return;
    }
    if (!path) {
        showError('Please specify a Run Plan Excel file path.');
        return;
    }
    showError();
    const btn = $('#runPlanProcess');
    const oldText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Processing...';
    }
    if ($('#runPlanStatus')) $('#runPlanStatus').textContent = 'Loading...';

    try {
        const resp = await fetch('/api/process-run-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        const d = await getJson(resp);
        if (!resp.ok) throw new Error(d.error || 'Failed to process Run Plan workbook.');

        feedRows = d.feed?.rows || [];
        planData = {
            objective: d.plan?.objective || '',
            info: d.plan?.info || [],
            rows: d.plan?.rows || [],
        };
        doeData = {
            columns: d.doe?.columns || [],
            rows: d.doe?.rows || [],
        };
        updateConditionFilterOptions();
        summary = {
            ...d.summary,
            plan_count: planData.rows.length,
        };
        updateDoeImportStatus();

        updateKpis(summary);
        updateReactorFilterOptions(summary.reactors);
        if ($('#runPlanStatus')) $('#runPlanStatus').textContent = 'Run Plan Loaded';

        switchSubtab(activeSubtab);
        saveState();
    } catch (err) {
        showError(err.message);
        if ($('#runPlanStatus')) $('#runPlanStatus').textContent = 'Failed';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }
}

async function init() {
    const hasRestored = restoreState();
    try {
        const r = await fetch('/api/settings');
        const s = await getJson(r);
        if (!hasRestored && s.default_run_plan_file && $('#runPlanFile')) {
            $('#runPlanFile').value = s.default_run_plan_file;
        }
    } catch (e) {}

    // Sub-tab button bindings
    document.querySelectorAll('.table-tabs .table-tab').forEach(tabBtn => {
        tabBtn.onclick = () => switchSubtab(tabBtn.dataset.subtab);
    });

    // Browse button
    const browseBtn = $('#runPlanBrowse');
    if (browseBtn) {
        browseBtn.onclick = async () => {
            if (browseBtn.disabled) return;
            showError();
            const old = browseBtn.textContent;
            browseBtn.disabled = true;
            browseBtn.textContent = 'Browsing...';
            try {
                const cur = $('#runPlanFile')?.value || '';
                const r = await fetch('/api/browse-run-plan-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initial_file: cur }),
                });
                const d = await getJson(r);
                if (!r.ok) throw new Error(d.error || 'Browsing failed');
                if (!d.cancelled && d.path && $('#runPlanFile')) {
                    $('#runPlanFile').value = d.path;
                    saveState();
                }
            } catch (err) {
                showError(err.message);
            } finally {
                browseBtn.disabled = false;
                browseBtn.textContent = old;
            }
        };
    }

    // Process button
    const procBtn = $('#runPlanProcess');
    if (procBtn) {
        procBtn.onclick = () => {
            const path = $('#runPlanFile')?.value?.trim();
            processFile(path);
        };
    }

    // Live search bindings
    if ($('#feedSearch')) $('#feedSearch').oninput = () => { renderFeed(); saveState(); };
    if ($('#planSearch')) $('#planSearch').oninput = () => { renderPlan(); saveState(); };
    if ($('#doeConditionFilter')) $('#doeConditionFilter').onchange = () => { renderDoe(); saveState(); };
    if ($('#doeReactorFilter')) $('#doeReactorFilter').onchange = () => { renderDoe(); saveState(); };

    // Initial render
    switchSubtab(activeSubtab);

    // Auto-process if file path exists, data not restored, and Run Number is set
    const initRunNum = (document.getElementById('runNumberInput')?.value || sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim();
    if (!hasRestored && $('#runPlanFile')?.value && initRunNum) {
        processFile($('#runPlanFile').value.trim());
    }
}

document.addEventListener('DOMContentLoaded', init);
