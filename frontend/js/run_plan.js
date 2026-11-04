const $ = s => document.querySelector(s);

let activeSubtab = 'feed';
let feedRows = [];
let planData = { objective: '', rows: [] };
let doeData = { columns: [], rows: [] };
let summary = null;
// Universal Run Plan template: Feed as 4 tables (properties, liquid, group-type, gas) and the DOE Step 0 table.
let feedTables = null;
let feedShowEmpty = false;
let doeShowPretreat = false;

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

const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hasValue = v => v !== null && v !== undefined && String(v).trim() !== '';
const fmtAmount = v => {
    const n = Number(v);
    if (!hasValue(v) || !Number.isFinite(n)) return esc(v);
    return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
};
const TYPE_CLASS = { 'n-p': 'np', 'i-p': 'ip', 'n': 'n', 'a': 'a', 'o': 'o', 'ol': 'o' };

function checkBadge(check, total, unit) {
    if (!hasValue(total)) return '<span class="rp-badge muted">no values</span>';
    const ok = String(check).toUpperCase() === 'OK';
    return `<span class="rp-badge ${ok ? 'ok' : 'warn'}">${fmtAmount(total)} ${esc(unit)} · ${ok ? 'OK' : esc(check || 'check')}</span>`;
}

function barCell(value, max) {
    const n = Number(value);
    const width = hasValue(value) && Number.isFinite(n) && n > 0 && max > 0 ? Math.max(2, Math.min(100, n / max * 100)) : 0;
    return `<td class="rp-num">${hasValue(value) ? fmtAmount(value) : '<span class="rp-dash">—</span>'}${width ? `<span class="rp-bar"><i style="width:${width.toFixed(1)}%"></i></span>` : ''}</td>`;
}

function renderFeedTemplate(q) {
    const t = feedTables;
    const keep = (value, ...text) => (feedShowEmpty || hasValue(value)) && (!q || text.join(' ').toLowerCase().includes(q));

    // Feed properties: one tile per property; notes from the template as tooltip
    const props = (t.properties?.rows || []).filter(p => keep(p.value, p.label, p.value, p.unit));
    $('#feedProps').innerHTML = props.length ? props.map(p => `
        <div class="rp-prop${hasValue(p.value) ? '' : ' empty'}"${p.note ? ` title="${esc(p.note)}"` : ''}>
            <span>${esc(p.label)}</span>
            <b>${hasValue(p.value) ? fmtAmount(p.value) : '—'}${hasValue(p.unit) && p.unit !== '--' ? ` <small>${esc(p.unit)}</small>` : ''}</b>
        </div>`).join('') : '<div class="rp-empty">No feed properties match.</div>';

    // Liquid components
    const liquid = (t.liquid?.rows || []).filter(r => (r.component || feedShowEmpty) && keep(r.weight, r.component, r.type, r.carbon_no));
    const maxLiquid = Math.max(0, ...liquid.map(r => Number(r.weight)).filter(Number.isFinite));
    $('#feedLiquid').innerHTML = `
        <header><div><div class="eyebrow">LIQUID FEED</div><h4>${esc(t.liquid?.title || 'Liquid components')} <small>(${esc(t.liquid?.unit || 'wt%')})</small></h4></div>
            ${checkBadge(t.liquid?.check, t.liquid?.total, t.liquid?.unit || 'wt%')}</header>
        <table class="rp-table">
            <thead><tr><th>Component</th><th>C#</th><th>Type</th><th class="rp-num">Weight (${esc(t.liquid?.unit || 'wt%')})</th><th class="rp-num">MW (g/mol)</th></tr></thead>
            <tbody>${liquid.map(r => `<tr>
                <td>${esc(r.component) || '<span class="rp-dash">(free row)</span>'}</td>
                <td>${esc(r.carbon_no)}</td>
                <td>${hasValue(r.type) ? `<span class="rp-type t-${TYPE_CLASS[String(r.type).toLowerCase()] || 'x'}">${esc(r.type)}</span>` : ''}</td>
                ${barCell(r.weight, maxLiquid)}
                <td class="rp-num rp-muted">${fmtAmount(r.mw)}</td></tr>`).join('') || '<tr><td colspan="5" class="rp-empty">No liquid components with a weight.</td></tr>'}</tbody>
        </table>`;

    // Group-type summary
    const groups = (t.groups?.rows || []).filter(g => (g.group || feedShowEmpty) && keep(g.weight, g.group));
    const maxGroup = Math.max(0, ...groups.map(g => Number(g.weight)).filter(Number.isFinite));
    $('#feedGroups').innerHTML = `
        <header><div><div class="eyebrow">LIQUID FEED</div><h4>${esc(t.groups?.title || 'Group-type summary')} <small>(${esc(t.groups?.unit || 'wt%')})</small></h4></div>
            ${checkBadge(t.groups?.check, t.groups?.total, t.groups?.unit || 'wt%')}</header>
        <table class="rp-table">
            <thead><tr><th>Group</th><th class="rp-num">Weight (${esc(t.groups?.unit || 'wt%')})</th><th>Check</th></tr></thead>
            <tbody>${groups.map(g => `<tr><td>${esc(g.group) || '<span class="rp-dash">(free row)</span>'}</td>${barCell(g.weight, maxGroup)}<td class="rp-muted">${esc(g.check)}</td></tr>`).join('')
                || '<tr><td colspan="3" class="rp-empty">No group-type values.</td></tr>'}</tbody>
        </table>`;

    // Gas feed composition + gas feed settings
    const gas = (t.gas?.rows || []).filter(g => (g.component || feedShowEmpty) && keep(g.value, g.component));
    const maxGas = Math.max(0, ...gas.map(g => Number(g.value)).filter(Number.isFinite));
    const settings = (t.gas?.settings || []).filter(x => keep(x.value, x.label, x.value));
    $('#feedGas').innerHTML = `
        <header><div><div class="eyebrow">GAS FEED</div><h4>${esc(t.gas?.title || 'Gas feed composition')} <small>(${esc(t.gas?.unit || 'mol%')})</small></h4></div>
            ${checkBadge(t.gas?.check, t.gas?.total, t.gas?.unit || 'mol%')}</header>
        ${settings.length ? `<div class="rp-settings">${settings.map(x => `<div class="rp-chip"${x.note ? ` title="${esc(x.note)}"` : ''}><span>${esc(x.label)}</span><b>${hasValue(x.value) ? fmtAmount(x.value) : '—'}${hasValue(x.unit) && x.unit !== '--' ? ` ${esc(x.unit)}` : ''}</b></div>`).join('')}</div>` : ''}
        <table class="rp-table">
            <thead><tr><th>Component</th><th class="rp-num">Value (${esc(t.gas?.unit || 'mol%')})</th><th>Check</th></tr></thead>
            <tbody>${gas.map(g => `<tr><td>${esc(g.component) || '<span class="rp-dash">(free row)</span>'}</td>${barCell(g.value, maxGas)}<td class="rp-muted">${esc(g.check)}</td></tr>`).join('')
                || '<tr><td colspan="3" class="rp-empty">No gas composition values.</td></tr>'}</tbody>
        </table>`;

    const filled = rows => rows.filter(r => hasValue(r.weight ?? r.value)).length;
    if ($('#feedSummary')) {
        $('#feedSummary').textContent = `${filled(t.properties?.rows || [])} feed properties · ${filled(t.liquid?.rows || [])} liquid components · `
            + `${filled(t.groups?.rows || [])} group types · ${filled(t.gas?.rows || [])} gas components`
            + (feedShowEmpty ? ' · showing empty rows' : ' · empty rows hidden') + (q ? ` · matching "${q}"` : '');
    }
}

function renderFeed() {
    const q = ($('#feedSearch')?.value || '').toLowerCase().trim();
    const template = !!feedTables;
    if ($('#feedTemplate')) $('#feedTemplate').hidden = !template;
    if ($('#feedLegacy')) $('#feedLegacy').hidden = template;
    if ($('#feedShowEmptyWrap')) $('#feedShowEmptyWrap').hidden = !template;
    if (template) return renderFeedTemplate(q);
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
    const optional = new Set(['Remarks', 'Catalyst']);       // free-text columns are not "missing"
    const columns = (doeData.columns || []).filter(column => !optional.has(column));
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

function renderPretreatment() {
    const pre = doeData.pretreatment || {};
    const planned = doeData.planned || {};
    const parts = [];
    if (hasValue(planned.block_1_h)) parts.push(`Planned hours: Block-1 ${fmtAmount(planned.block_1_h)} h`);
    if (hasValue(planned.block_2_h)) parts.push(`Block-2 ${fmtAmount(planned.block_2_h)} h`);
    if (hasValue(planned.run_end)) parts.push(`Run end ${esc(planned.run_end)}`);
    const steps = (pre.rows || []).length;
    if ($('#doeBar')) $('#doeBar').hidden = !parts.length && !(pre.columns || []).length;
    if ($('#doePlanned')) $('#doePlanned').textContent = parts.join(' · ');
    if ($('#doePretreatWrap')) {
        $('#doePretreatWrap').hidden = !(pre.columns || []).length;
        $('#doePretreatWrap').lastChild.textContent = ` Show Step 0 – Pretreatment / activation (${steps} step${steps === 1 ? '' : 's'})`;
    }
    if ($('#doeShowPretreat')) $('#doeShowPretreat').checked = doeShowPretreat;
    const section = $('#doePretreat');
    if (!section) return;
    section.hidden = !doeShowPretreat || !(pre.columns || []).length;
    if (section.hidden) return;
    if ($('#doePretreatTitle')) $('#doePretreatTitle').textContent = pre.title || 'Step 0 – Pretreatment / activation';
    if ($('#doePretreatTotal')) {
        const totals = (pre.totals || []).filter(t => hasValue(t.value));
        $('#doePretreatTotal').textContent = totals.length
            ? totals.map(t => `${String(t.label).replace(/\s*\(h\)\s*$/i, '')}: ${fmtAmount(t.value)} h`).join(' · ')
            : (hasValue(pre.total_h) ? `Total ${fmtAmount(pre.total_h)} h` : '');
    }
    $('#doePretreatHead').innerHTML = (pre.columns || []).map(c => `<th>${esc(c)}</th>`).join('');
    $('#doePretreatBody').innerHTML = (pre.rows || []).map(r => `<tr>${pre.columns.map(c => `<td>${esc(fmt(r[c]))}</td>`).join('')}</tr>`).join('');
    if ($('#doePretreatEmpty')) $('#doePretreatEmpty').style.display = steps ? 'none' : 'block';
}

function renderDoe() {
    updateDoeImportStatus();
    renderPretreatment();
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
            feedTables,
            feedShowEmpty,
            doeShowPretreat,
            planData,
            doeData,
            summary,
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
        if (saved) {
            if (saved.filePath && $('#runPlanFile')) $('#runPlanFile').value = saved.filePath;
            if (Array.isArray(saved.feedRows)) feedRows = saved.feedRows;
            feedTables = saved.feedTables || null;
            feedShowEmpty = !!saved.feedShowEmpty;
            doeShowPretreat = !!saved.doeShowPretreat;
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
        feedTables = d.feed?.tables || null;
        planData = {
            objective: d.plan?.objective || '',
            info: d.plan?.info || [],
            rows: d.plan?.rows || [],
        };
        doeData = {
            columns: d.doe?.columns || [],
            rows: d.doe?.rows || [],
            pretreatment: d.doe?.pretreatment || null,
            planned: d.doe?.planned || null,
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
    if ($('#feedShowEmpty')) {
        $('#feedShowEmpty').checked = feedShowEmpty;
        $('#feedShowEmpty').onchange = () => { feedShowEmpty = $('#feedShowEmpty').checked; renderFeed(); saveState(); };
    }
    if ($('#doeShowPretreat')) $('#doeShowPretreat').onchange = () => { doeShowPretreat = $('#doeShowPretreat').checked; renderPretreatment(); saveState(); };

    // Initial render
    switchSubtab(activeSubtab);

    // Auto-process if file path exists, data not restored, and Run Number is set
    const initRunNum = (document.getElementById('runNumberInput')?.value || sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim();
    if (!hasRestored && $('#runPlanFile')?.value && initRunNum) {
        processFile($('#runPlanFile').value.trim());
    }
}

document.addEventListener('DOMContentLoaded', init);
