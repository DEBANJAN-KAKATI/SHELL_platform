// Reforming Run Plan page. Writes the same session keys as the isomerization Run Plan
// (runPlanDashboardState, ils_feed_properties) so the Offline / Calculation pages can map
// samples to DOE conditions; reforming-only tables are stored alongside them.
const $ = s => document.querySelector(s);

const SUBTABS = ['feed', 'feedDha', 'plan', 'conditions', 'doe'];
let activeSubtab = 'feed';
let plan = null; // last /api/reforming/process-run-plan response
let editing = false;
let editSnapshot = null;

const showError = (message = '') => {
    const el = $('#runPlanError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', !!message);
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const fmt = value => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
    }
    return String(value);
};

async function getJson(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw new Error('Server returned an invalid response. Check backend connection.'); }
}

function renderTable(id, columns, rows, labels = {}) {
    const thead = $(`#${id}Thead`);
    const tbody = $(`#${id}Tbody`);
    if (!thead || !tbody) return;
    thead.innerHTML = columns.map((column, i) =>
        `<th style="text-align:${i === 0 ? 'left;padding-left:16px' : 'center'}">${escapeHtml(labels[column] || column)}</th>`).join('');
    tbody.innerHTML = rows.map(row => `<tr>${columns.map((column, i) =>
        `<td style="text-align:${i === 0 ? 'left;padding-left:16px;font-weight:600' : 'center'};${column === 'Catalyst' ? 'font-weight:700;color:var(--burnt)' : ''}">${escapeHtml(fmt(row[column]))}</td>`).join('')}</tr>`).join('');
    $(`#${id}Empty`).style.display = rows.length ? 'none' : 'block';
}

function editorInput(value, key, rowIndex, options = {}) {
    const type = options.type || 'text';
    const readonly = options.readonly ? ' readonly class="runplan-editor-input editor-readonly"' : ' class="runplan-editor-input"';
    return `<input${readonly} type="${type}" data-editor-key="${escapeHtml(key)}" data-editor-row="${rowIndex}" value="${escapeHtml(value ?? '')}">`;
}

function renderPlanEditor() {
    const block = plan?.plan || {};
    const columns = ['parameter', 'units', ...(block.catalyst_columns || [])];
    const rows = block.rows || [];
    const thead = $('#planThead');
    const tbody = $('#planTbody');
    if (!thead || !tbody) return;
    thead.innerHTML = columns.map(column => {
        const label = column === 'parameter' ? 'Parameter' : column === 'units' ? 'Units' : column;
        const action = editing && !['parameter', 'units'].includes(column)
            ? ` <button class="runplan-delete" type="button" data-delete-catalyst="${escapeHtml(column)}">Remove</button>` : '';
        return `<th>${escapeHtml(label)}${action}</th>`;
    }).join('') +
        '<th>Action</th>';
    tbody.innerHTML = rows.map((row, rowIndex) => `<tr>${columns.map(column => {
        const value = row[column] ?? '';
        const readonly = column === 'parameter' || column === 'units';
        return `<td class="${readonly ? 'editor-label' : ''}">${editing ? editorInput(value, column, rowIndex, { readonly }) : escapeHtml(fmt(value))}</td>`;
    }).join('')}<td></td></tr>`).join('');
    $('#planEmpty').style.display = rows.length ? 'none' : 'block';
}

function renderConditionsEditor() {
    const block = plan?.conditions || { columns: [], rows: [] };
    const columns = block.columns || [];
    const rows = block.rows || [];
    const thead = $('#conditionsThead');
    const tbody = $('#conditionsTbody');
    if (!thead || !tbody) return;
    const conditionColumns = columns.slice(2);
    thead.innerHTML = columns.map(column => {
        const action = editing && conditionColumns.includes(column)
            ? ` <button class="runplan-delete" type="button" data-delete-condition="${escapeHtml(column)}">Remove</button>` : '';
        return `<th>${escapeHtml(column)}${action}</th>`;
    }).join('');
    tbody.innerHTML = rows.map((row, rowIndex) => `<tr>${columns.map(column => {
        const value = row[column] ?? '';
        const readonly = column === 'Op.Conditions' || column === 'Units';
        return `<td class="${readonly ? 'editor-label' : ''}">${editing ? editorInput(value, column, rowIndex, { readonly }) : escapeHtml(fmt(value))}</td>`;
    }).join('')}</tr>`).join('');
    $('#conditionsEmpty').style.display = rows.length ? 'none' : 'block';
}

function render() {
    const d = plan || {};
    const feedRows = d.feed?.rows || [];
    renderTable('feed', ['component', 'group', 'unit', 'value', 'note'], feedRows,
        { component: 'Property', group: 'Source', unit: 'Unit', value: 'Value', note: 'Note' });
    $('#feedSummary').textContent = `${feedRows.length} feed properties`;

    const dha = d.feed_dha || { columns: [], rows: [] };
    renderTable('feedDha', dha.columns || [], dha.rows || []);
    $('#feedDhaSummary').textContent = dha.rows?.length ? 'Feed composition by carbon number (wt%)' : 'No Feed DHA sheet in the workbook';

    const planBlock = d.plan || {};
    const catalystColumns = planBlock.catalyst_columns || [];
    if (editing) renderPlanEditor();
    else renderTable('plan', ['parameter', 'units', ...catalystColumns], planBlock.rows || [], { parameter: 'Parameter', units: 'Units' });
    $('#planSummary').textContent = catalystColumns.length
        ? `${catalystColumns.length} catalysts loaded in Reactor 1 and tested one after the other`
        : '';
    $('#planObjectiveText').textContent = planBlock.objective || 'No objective statement found in the selected workbook.';
    $('#infoTbody').innerHTML = (planBlock.info || []).map((row, rowIndex) =>
        `<tr><td style="text-align:left;padding-left:16px;font-weight:600">${escapeHtml(row.parameter)}</td><td style="text-align:center">${escapeHtml(row.units)}</td><td style="text-align:center">${editing ? editorInput(row.value, 'value', rowIndex) : escapeHtml(fmt(row.value))}</td></tr>`).join('');

    const conditions = d.conditions || { columns: [], rows: [] };
    if (editing) renderConditionsEditor();
    else renderTable('conditions', conditions.columns || [], conditions.rows || []);
    $('#conditionsSummary').textContent = `${Math.max(0, (conditions.columns || []).length - 2)} operating conditions`;

    const doe = d.doe || { columns: [], rows: [] };
    const doeRows = sortDateTimeRows(doe.rows || [], 'Start Date');
    renderTable('doe', doe.columns || [], doeRows);
    const missingDates = doeRows.filter(row => !String(row['Start Date'] ?? '').trim() || !String(row['End Date'] ?? '').trim());
    const summary = $('#doeSummary');
    summary.style.color = missingDates.length ? '#b91c1c' : '';
    summary.textContent = missingDates.length
        ? `⚠ ${missingDates.length} of ${doeRows.length} conditions have no Start/End Date; their samples cannot be mapped to a condition yet.`
        : `Showing all ${doeRows.length} conditions`;

    const s = d.summary || {};
    $('#kpiFeed').textContent = s.feed_count ?? feedRows.length;
    $('#kpiCatalysts').textContent = s.catalyst_count ?? catalystColumns.length;
    $('#kpiDoe').textContent = s.doe_count ?? doeRows.length;
    $('#kpiReactors').textContent = (s.reactors || ['R1']).join(', ');
}

function setEditorButtons() {
    const buttons = {
        editRunPlan: !editing,
        saveRunPlan: editing,
        cancelRunPlanEdit: editing,
        addCatalyst: editing,
        editConditions: !editing,
        saveConditions: editing,
        cancelConditionsEdit: editing,
        addCondition: editing,
    };
    Object.entries(buttons).forEach(([id, visible]) => {
        const element = $(`#${id}`);
        if (element) element.hidden = !visible;
    });
}

function clonePlan() {
    return JSON.parse(JSON.stringify(plan || {}));
}

function beginEditing() {
    if (!plan) return;
    editSnapshot = clonePlan();
    editing = true;
    setEditorButtons();
    render();
}

function cancelEditing() {
    if (editSnapshot) plan = editSnapshot;
    editSnapshot = null;
    editing = false;
    setEditorButtons();
    render();
}

function valueAsNumber(value) {
    const number = Number(value);
    return String(value).trim() !== '' && Number.isFinite(number) ? number : value;
}

function readEditorValues() {
    document.querySelectorAll('[data-editor-key][data-editor-row]').forEach(input => {
        const rowIndex = Number(input.dataset.editorRow);
        const key = input.dataset.editorKey;
        const value = valueAsNumber(input.value);
        if (input.closest('#planTable')) plan.plan.rows[rowIndex][key] = value;
        if (input.closest('#conditionsTable')) plan.conditions.rows[rowIndex][key] = value;
        if (input.closest('#infoTable')) plan.plan.info[rowIndex][key] = value;
    });
}

function parseDateValue(value) {
    const date = new Date(String(value || '').replace(' ', 'T'));
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatPlanDate(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function conditionNumber(value, fallback) {
    const match = String(value ?? '').match(/\d+/);
    return match ? Number(match[0]) : fallback;
}

function regenerateDoe() {
    const conditionRows = plan.conditions?.rows || [];
    const conditionColumns = plan.conditions?.columns || [];
    const conditionNames = conditionColumns.slice(2);
    const conditions = conditionNames.map(name => {
        const condition = { 'Op.Conditions': name };
        conditionRows.forEach(row => {
            if (row['Op.Conditions']) condition[row['Op.Conditions']] = row[name] ?? '';
        });
        return condition;
    });
    const catalystRows = plan.plan?.rows || [];
    const catalystColumns = plan.plan?.catalyst_columns || [];
    const catalystNames = catalystColumns.map(column => {
        const row = catalystRows.find(item => String(item.parameter).toLowerCase() === 'catalyst');
        return String(row?.[column] || column).trim();
    }).filter(Boolean);
    if (!conditions.length || !catalystNames.length) return;

    const oldRows = plan.doe?.rows || [];
    const oldByKey = new Map(oldRows.map(row => [`${row.Catalyst}|${row['Condition No.']}`, row]));
    const feedCutIn = (plan.plan?.info || []).find(row => String(row.parameter).toLowerCase() === 'feed cut-in')?.value;
    let cursor = parseDateValue(feedCutIn);
    const newRows = [];
    catalystNames.forEach(catalyst => conditions.forEach((condition, index) => {
        const number = conditionNumber(condition['Op.Conditions'], index + 1);
        const match = oldByKey.get(`${catalyst}|${number}`);
        const row = { ...(match || {}) };
        row['Condition No.'] = number;
        row.Catalyst = catalyst;
        row['Reactor ID'] = row['Reactor ID'] || 'R1';
        const conditionValue = name => {
            const key = Object.keys(condition).find(column => String(column).toLowerCase().replace(/[^a-z]/g, '') === name);
            return key ? condition[key] : undefined;
        };
        row['Temperature (°C)'] = conditionValue('temperature') ?? row['Temperature (°C)'] ?? '';
        row['Pressure (barg)'] = conditionValue('pressure') ?? row['Pressure (barg)'] ?? '';
        row['LHSV (/h)'] = conditionValue('lhsv') ?? row['LHSV (/h)'] ?? '';
        row['H2/Naphtha (mol.basis)'] = conditionValue('h2naphtha') ?? row['H2/Naphtha (mol.basis)'] ?? '';
        row['Duration (h)'] = conditionValue('duration') ?? row['Duration (h)'] ?? '';
        if (cursor) row['Start Date'] = formatPlanDate(cursor);
        if (cursor) {
            const duration = Number(row['Duration (h)']);
            const end = new Date(cursor.getTime() + (Number.isFinite(duration) ? duration : 0) * 3600000);
            row['End Date'] = formatPlanDate(end);
        }
        if (row['End Date']) cursor = parseDateValue(row['End Date']) || cursor;
        newRows.push(row);
    }));
    plan.doe = { columns: plan.doe?.columns || [], rows: newRows, count: newRows.length };
}

function saveEdits() {
    readEditorValues();
    regenerateDoe();
    editing = false;
    editSnapshot = null;
    setEditorButtons();
    render();
    saveState();
    $('#runPlanStatus').textContent = 'Run Plan Saved';
}

function saveConditionEdits() {
    saveEdits();
}

function addCatalyst() {
    const block = plan?.plan;
    if (!block) return;
    readEditorValues();
    const next = `Catalyst ${block.catalyst_columns.length + 1}`;
    block.catalyst_columns.push(next);
    block.rows.forEach(row => { row[next] = ''; });
    block.count = block.rows.length;
    render();
}

function addCondition() {
    const block = plan?.conditions;
    if (!block) return;
    readEditorValues();
    const number = block.columns.length - 1;
    const name = `Condition ${number}`;
    block.columns.push(name);
    block.rows.forEach(row => { row[name] = ''; });
    block.count = block.columns.filter(column => /^Condition/i.test(column)).length;
    render();
}

function switchSubtab(name) {
    if (editing) readEditorValues();
    activeSubtab = SUBTABS.includes(name) ? name : 'feed';
    document.querySelectorAll('.table-tabs .table-tab').forEach(button => {
        const on = button.dataset.subtab === activeSubtab;
        button.classList.toggle('active', on);
        button.setAttribute('aria-selected', String(on));
    });
    SUBTABS.forEach(tab => { $(`#${tab}Panel`).hidden = tab !== activeSubtab; });
    saveState();
}

function saveState() {
    try {
        const d = plan || {};
        const feedRows = d.feed?.rows || [];
        const runNumber = currentRunNumber();
        const state = {
            process: 'reforming',
            runNumber,
            activeSubtab,
            filePath: $('#runPlanFile')?.value || '',
            feedRows,
            planData: { objective: d.plan?.objective || '', rows: d.plan?.rows || [] },
            doeData: { columns: d.doe?.columns || [], rows: d.doe?.rows || [] },
            summary: d.summary || null,
            reforming: plan,
        };
        sessionStorage.setItem('runPlanDashboardState', JSON.stringify(state));
        if (runNumber) localStorage.setItem(`ils_reforming_run_plan_${runNumber}`, JSON.stringify(state));
        if (feedRows.length) sessionStorage.setItem('ils_feed_properties', JSON.stringify(feedRows));
    } catch (error) {}
}

function restoreState() {
    try {
        const runNumber = currentRunNumber();
        const sessionSaved = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null');
        const saved = sessionSaved && (!runNumber || !sessionSaved.runNumber || sessionSaved.runNumber === runNumber)
            ? sessionSaved
            : JSON.parse(runNumber ? localStorage.getItem(`ils_reforming_run_plan_${runNumber}`) || 'null' : 'null');
        if (!saved || saved.process !== 'reforming') return false;
        if (saved.filePath) $('#runPlanFile').value = saved.filePath;
        plan = saved.reforming || null;
        activeSubtab = saved.activeSubtab || 'feed';
        return !!plan;
    } catch (error) {
        return false;
    }
}

function currentRunNumber() {
    return ($('#runNumberInput')?.value || sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim();
}

async function processFile(path) {
    if (!currentRunNumber()) {
        showError('Please enter run number to start with');
        const runInput = $('#runNumberInput');
        if (runInput) {
            runInput.focus();
            runInput.classList.add('input-attention');
            setTimeout(() => runInput.classList.remove('input-attention'), 1500);
        }
        return;
    }
    if (!path) {
        showError('Please specify a Reforming Run Plan Excel file path.');
        return;
    }
    showError();
    const button = $('#runPlanProcess');
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = 'Processing...';
    $('#runPlanStatus').textContent = 'Loading...';
    try {
        const response = await fetch('/api/reforming/process-run-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        });
        const d = await getJson(response);
        if (!response.ok) throw new Error(d.error || 'Failed to process the Reforming Run Plan workbook.');
        plan = d;
        render();
        $('#runPlanStatus').textContent = 'Run Plan Loaded';
        saveState();
    } catch (error) {
        showError(error.message);
        $('#runPlanStatus').textContent = 'Failed';
    } finally {
        button.disabled = false;
        button.textContent = oldText;
    }
}

async function init() {
    if (!window.ILSProcess?.isReforming()) return; // navigation.js redirects to run_plan.html
    const restored = restoreState();
    if (!restored) {
        // A Run Plan loaded under the other process must not leak into reforming pages.
        try {
            const saved = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null');
            if (saved && saved.process !== 'reforming') {
                sessionStorage.removeItem('runPlanDashboardState');
                sessionStorage.removeItem('ils_feed_properties');
            }
        } catch (error) {}
        try {
            const settings = await getJson(await fetch('/api/reforming/settings'));
            if (settings.default_run_plan_file) $('#runPlanFile').value = settings.default_run_plan_file;
        } catch (error) {}
    }

    document.querySelectorAll('.table-tabs .table-tab').forEach(button => {
        button.onclick = () => switchSubtab(button.dataset.subtab);
    });
    $('#editRunPlan').onclick = beginEditing;
    $('#saveRunPlan').onclick = saveEdits;
    $('#cancelRunPlanEdit').onclick = cancelEditing;
    $('#editConditions').onclick = beginEditing;
    $('#saveConditions').onclick = saveConditionEdits;
    $('#cancelConditionsEdit').onclick = cancelEditing;
    $('#addCatalyst').onclick = addCatalyst;
    $('#addCondition').onclick = addCondition;

    $('#planThead').addEventListener('click', event => {
        const button = event.target.closest('[data-delete-catalyst]');
        if (!button || !editing) return;
        readEditorValues();
        const column = button.dataset.deleteCatalyst;
        plan.plan.catalyst_columns = plan.plan.catalyst_columns.filter(item => item !== column);
        plan.plan.rows.forEach(row => { delete row[column]; });
        render();
    });
    $('#conditionsThead').addEventListener('click', event => {
        const button = event.target.closest('[data-delete-condition]');
        if (!button || !editing) return;
        readEditorValues();
        const column = button.dataset.deleteCondition;
        plan.conditions.columns = plan.conditions.columns.filter(item => item !== column);
        plan.conditions.rows.forEach(row => { delete row[column]; });
        render();
    });

    const browse = $('#runPlanBrowse');
    browse.onclick = async () => {
        if (browse.disabled) return;
        showError();
        const old = browse.textContent;
        browse.disabled = true;
        browse.textContent = 'Browsing...';
        try {
            const response = await fetch('/api/browse-run-plan-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initial_file: $('#runPlanFile').value || '' }),
            });
            const d = await getJson(response);
            if (!response.ok) throw new Error(d.error || 'Browsing failed');
            if (!d.cancelled && d.path) {
                $('#runPlanFile').value = d.path;
                saveState();
            }
        } catch (error) {
            showError(error.message);
        } finally {
            browse.disabled = false;
            browse.textContent = old;
        }
    };
    $('#runPlanProcess').onclick = () => processFile($('#runPlanFile').value.trim());

    render();
    switchSubtab(activeSubtab);
    if (restored) $('#runPlanStatus').textContent = 'Run Plan Loaded';
    else if ($('#runPlanFile').value && currentRunNumber()) processFile($('#runPlanFile').value.trim());
}

document.addEventListener('DOMContentLoaded', init);
