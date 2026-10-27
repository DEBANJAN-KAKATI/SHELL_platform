(() => {
    const h$ = s => document.querySelector(s);
    const TABLES = [
        { key: 'run_plan.plan', title: 'Plan', section: 'Run Plan' },
        { key: 'calculation.base_table', title: 'Base Table', section: 'Calculation table' },
        { key: 'calculation.yield_table', title: 'Yield Table', section: 'Calculation table' }
    ];

    // Plan section groupings (Parameter column values that are section headers)
    const PLAN_SECTIONS = {
        'condition parameters': 'CONDITION PARAMETERS',
        'catalyst parameters': 'CATALYST PARAMETERS',
        'feed parameters': 'FEED PARAMETERS',
        'process parameters': 'PROCESS PARAMETERS',
        'reactor parameters': 'REACTOR PARAMETERS',
    };

    const state = {
        runs: [],
        activeTable: TABLES[0].key,
        result: null,
        reactors: new Set(),
        conditions: new Set()
    };

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const isNum = v => typeof v === 'number' && Number.isFinite(v);
    const fmt = v => {
        if (v === null || v === undefined || v === '') return '—';
        if (isNum(v)) return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(4)));
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    };
    const fmtDelta = v => (isNum(v) ? (v > 0 ? '+' : '') + fmt(v) : '');
    const fmtPct = v => (isNum(v) ? (v > 0 ? '+' : '') + v.toFixed(2) + '%' : '');
    const STATUS_LABEL = { same: 'same', both: 'in both', changed: 'changed', only_a: 'only in A', only_b: 'only in B', missing: 'not saved' };
    const badge = s => `<span class="history-badge ${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
    const runLabel = r => (String(r ?? '').startsWith('Current') ? String(r) : `Run-${r}`);

    function showError(m = '') {
        const el = h$('#historyError');
        el.textContent = m;
        el.classList.toggle('show', !!m);
    }
    const setStatus = t => { h$('#historyStatus').textContent = t; };

    async function getJson(r) {
        const t = await r.text();
        try { return JSON.parse(t); } catch { throw new Error('Server returned an invalid response.'); }
    }

    // ------------------------------------------------------------- Step 1: datasets
    async function loadRuns() {
        showError();
        setStatus('Loading...');
        try {
            const d = await getJson(await fetch('/api/historian/runs'));
            state.runs = d.runs || [];
            h$('#histRuns').innerHTML = state.runs.length
                ? state.runs.map(r => `<span class="history-run-chip${r.error ? ' bad' : ''}" title="${esc(r.error || `${r.file} · saved ${r.saved_at || '?'}`)}">${esc(runLabel(r.run_number))}</span>`).join('')
                : '<div class="history-empty">No Runs saved yet. Use "Save to Historian" on any dashboard page.</div>';
            fillRunSelects();
            setStatus('Ready');
        } catch (e) {
            showError(e.message);
            setStatus('Failed');
        }
    }

    function fillRunSelects() {
        const valid = state.runs.filter(r => !r.error);
        const opts = valid.map(r => `<option value="${esc(r.run_number)}">${esc(runLabel(r.run_number))}${r.saved_at ? ' · ' + esc(r.saved_at.slice(0, 16).replace('T', ' ')) : ''}</option>`).join('');
        const selA = h$('#histRunA'), selB = h$('#histRunB');
        const prevA = selA.value, prevB = selB.value;
        const current = h$('#histMode').value === 'current';
        selA.innerHTML = current ? '<option value="__current__">Current dashboard session</option>' : (opts || '<option value="">No saved Runs</option>');
        selB.innerHTML = opts || '<option value="">No saved Runs</option>';
        selA.disabled = current;
        h$('#histLoadA').disabled = current || !valid.length;
        if (!current) {
            if (valid.some(r => r.run_number === prevA)) selA.value = prevA;
            else if (valid.length > 1) selA.value = valid[valid.length - 2].run_number;
        }
        if (valid.some(r => r.run_number === prevB)) selB.value = prevB;
        else if (valid.length) selB.value = valid[valid.length - 1].run_number;
    }

    function datasetA() {
        if (h$('#histMode').value === 'current') {
            if (!window.ILSHistorian) throw new Error('Historian helper not loaded yet. Try again.');
            return { current: window.ILSHistorian.collectPayload() };
        }
        if (!h$('#histRunA').value) throw new Error('Select Dataset A.');
        return { run: h$('#histRunA').value };
    }

    function datasetB() {
        if (!h$('#histRunB').value) throw new Error('Select Dataset B.');
        return { run: h$('#histRunB').value };
    }

    // ------------------------------------------------------------- Step 2: filters
    const filters = () => ({
        reactor: h$('#histReactor').value,
        condition: h$('#histCondition').value,
    });

    function updateFilterOptions(opts) {
        // Reactors
        (opts?.reactors || []).forEach(r => state.reactors.add(r));
        const selR = h$('#histReactor');
        const prevR = selR.value;
        const rList = [...state.reactors].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
        selR.innerHTML = '<option value="">All reactors</option>' + rList.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
        if (rList.includes(prevR)) selR.value = prevR;

        // Conditions
        (opts?.conditions || []).forEach(c => state.conditions.add(String(c)));
        const selC = h$('#histCondition');
        const prevC = selC.value;
        const cList = [...state.conditions].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
        selC.innerHTML = '<option value="">All conditions</option>' + cList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
        if (cList.includes(prevC)) selC.value = prevC;
    }

    // ------------------------------------------------------------- Step 3: comparison
    async function runCompare() {
        showError();
        setStatus('Comparing...');
        try {
            const r = await fetch('/api/historian/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    a: datasetA(), b: datasetB(), table_key: state.activeTable,
                    key_columns: null, filters: filters()
                })
            });
            const d = await getJson(r);
            if (!r.ok) throw new Error(d.error || 'Comparison failed.');
            state.result = d;
            if (d.table_key) state.activeTable = d.table_key;
            h$('#histResults').hidden = false;

            // Update comparison header banner
            const lblA = runLabel(d.run_a), lblB = runLabel(d.run_b);
            h$('#histCompareTitle').textContent = `Run Comparison: ${lblA} \u2194 ${lblB}`;

            renderTabs();
            renderMeta();
            if (d.table) {
                updateFilterOptions(d.table.filter_options);
                renderTable();
            } else {
                h$('#histTableTitle').textContent = 'No comparison tables saved';
                ['#histSummary', '#histColStats', '#histDetail'].forEach(id => { h$(id).innerHTML = ''; });
                h$('#histDetailNote').textContent = 'Neither dataset contains the Plan, Base Table or Yield Table.';
            }
            setStatus('Ready');
        } catch (e) {
            showError(e.message);
            setStatus('Failed');
        }
    }

    function renderTabs() {
        const byKey = Object.fromEntries((state.result?.tables || []).map(t => [t.key, t]));
        document.querySelectorAll('#histTabs .table-tab').forEach(btn => {
            const info = byKey[btn.dataset.table] || { status: 'missing' };
            const meta = TABLES.find(t => t.key === btn.dataset.table);
            const on = btn.dataset.table === state.activeTable;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-selected', String(on));
            btn.disabled = info.status === 'missing';
            btn.innerHTML = `${esc(meta.title)} ${info.status === 'both' ? '' : badge(info.status)}`;
        });
    }

    function renderTable() {
        const d = state.result;
        const t = d.table;
        if (!t) return;
        const meta = TABLES.find(x => x.key === d.table_key) || { title: d.table_key, section: '' };
        h$('#histTableEyebrow').textContent = `STEP 3 · ${meta.section.toUpperCase()}`;
        h$('#histTableTitle').textContent = `${meta.title}`;

        const c = t.row_status_counts || {};
        const tiles = [
            ['Rows A', t.row_count_a === t.total_rows_a ? t.row_count_a : `${t.row_count_a} / ${t.total_rows_a}`],
            ['Rows B', t.row_count_b === t.total_rows_b ? t.row_count_b : `${t.row_count_b} / ${t.total_rows_b}`],
            ['Same', c.same || 0],
            ['Changed', c.changed || 0],
            ['Only in A', c.only_a || 0],
            ['Only in B', c.only_b || 0]
        ];
        h$('#histSummary').innerHTML = tiles.map(([k, v]) => `<div class="kpi"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

        const f = t.filters_applied || {};
        const notes = [`Rows matched by: ${t.row_matching === 'key' ? t.key_columns.join(' + ') : 'row order'}`];
        if (f.reactor) notes.push(`Reactor: ${f.reactor}`);
        if (!t.present_in_a) notes.push('Table not saved in A');
        if (!t.present_in_b) notes.push('Table not saved in B');
        if (t.truncated) notes.push('Row list truncated');
        h$('#histDetailNote').textContent = notes.join('  ·  ');

        // Column averages
        const stats = (t.column_stats || []).filter(s => s.numeric || s.changed_rows);
        h$('#histColStats').innerHTML = stats.length
            ? `<table class="history-table"><thead><tr><th>Column</th><th>Mean ${esc(runLabel(d.run_a))}</th><th>Mean ${esc(runLabel(d.run_b))}</th><th>Δ mean (B−A)</th><th>Δ %</th><th>Changed rows</th></tr></thead><tbody>` +
              stats.map(s => `<tr class="${s.changed_rows ? 'st-changed' : ''}"><td>${esc(s.column)}</td><td class="num">${esc(fmt(s.mean_a))}</td><td class="num">${esc(fmt(s.mean_b))}</td><td class="num">${esc(fmtDelta(s.mean_delta))}</td><td class="num">${esc(fmtPct(s.mean_pct))}</td><td class="num">${esc(s.changed_rows)}</td></tr>`).join('') +
              '</tbody></table>'
            : '<div class="history-empty">No numeric columns.</div>';

        renderRows();
    }

    function renderRows() {
        const d = state.result;
        const t = d?.table;
        if (!t) return;
        const only = h$('#histRowDiffOnly').checked;
        const LIMIT = 2000;
        const rows = sortDateTimeRows(t.rows.filter(r => !only || r.status !== 'same'), row => row.key.DateTime ?? row.key['Date/Time'] ?? row.key['Start Date']);
        const keyCols = t.key_columns;
        const lblA = runLabel(d.run_a), lblB = runLabel(d.run_b);

        if (!rows.length) {
            h$('#histDetail').innerHTML = '<div class="history-empty">No rows to show for the current filter.</div>';
            return;
        }

        const isPlain = state.activeTable === 'run_plan.plan';

        if (isPlain) {
            // Plan layout: Parameter | Units | Run-A | Run-B (with section headers)
            renderPlanTable(rows, keyCols, lblA, lblB, LIMIT);
        } else {
            // Base/Yield layout: key columns then compare columns A | B (no delta)
            renderDataTable(rows, keyCols, t.compare_columns || [], lblA, lblB, LIMIT);
        }
    }

    function renderPlanTable(rows, keyCols, lblA, lblB, LIMIT) {
        // Detect which columns are "Parameter" and "Units" vs reactor value columns
        // Plan rows: key cols are typically ["Parameter"], compare cols include "Units", "R1".."R8"
        const d = state.result;
        const t = d.table;
        const allCols = t.compare_columns || [];

        // Separate Units from value columns
        const unitCol = allCols.find(c => c.toLowerCase() === 'units') || null;
        const valueCols = allCols.filter(c => c !== unitCol);

        // Build run-A group header
        const runAspan = valueCols.length;
        const runBspan = valueCols.length;

        // Table head: two-row header with run group labels
        let html = `<table class="history-table hist-plan-table">`;

        // Group header row
        html += `<thead><tr>`;
        keyCols.forEach(k => { html += `<th rowspan="2" class="hist-col-param">${esc(k)}</th>`; });
        if (unitCol) html += `<th rowspan="2" class="hist-col-units">${esc(unitCol)}</th>`;
        html += `<th colspan="${runAspan}" class="hist-col-run-header hist-col-run-a">${esc(lblA)}</th>`;
        html += `<th colspan="${runBspan}" class="hist-col-run-header hist-col-run-b">${esc(lblB)}</th>`;
        html += `</tr><tr>`;
        valueCols.forEach(() => { html += `<th class="hist-col-run-a hist-val-header">${esc(lblA)}</th>`; });
        valueCols.forEach(() => { html += `<th class="hist-col-run-b hist-val-header">${esc(lblB)}</th>`; });
        html += `</tr></thead><tbody>`;

        const displayed = rows.slice(0, LIMIT);
        for (const r of displayed) {
            const paramVal = keyCols.length ? String(r.key[keyCols[0]] ?? '') : '';
            const sectionKey = paramVal.trim().toLowerCase();
            if (PLAN_SECTIONS[sectionKey]) {
                // Section header row
                const totalSpan = keyCols.length + (unitCol ? 1 : 0) + runAspan + runBspan;
                html += `<tr class="hist-section-row"><td colspan="${totalSpan}">${esc(PLAN_SECTIONS[sectionKey])}</td></tr>`;
                continue;
            }
            const rowCls = r.status === 'changed' ? ' st-changed' : r.status === 'only_a' || r.status === 'only_b' ? ' st-onlyone' : '';
            html += `<tr class="hist-data-row${rowCls}">`;
            keyCols.forEach(k => { html += `<td class="hist-col-param">${esc(fmt(r.key[k]))}</td>`; });
            if (unitCol) {
                const uv = r.values[unitCol];
                html += `<td class="hist-col-units">${esc(fmt(uv ? uv.a ?? uv.b : null))}</td>`;
            }
            valueCols.forEach(col => {
                const v = r.values[col] || {};
                const cls = v.changed ? ' cell-changed' : '';
                html += `<td class="num hist-col-run-a${cls}">${esc(fmt(v.a))}</td>`;
            });
            valueCols.forEach(col => {
                const v = r.values[col] || {};
                const cls = v.changed ? ' cell-changed' : '';
                html += `<td class="num hist-col-run-b${cls}">${esc(fmt(v.b))}</td>`;
            });
            html += `</tr>`;
        }

        html += `</tbody></table>`;
        if (rows.length > LIMIT) html += `<div class="history-note">Showing first ${LIMIT} of ${rows.length} rows.</div>`;
        h$('#histDetail').innerHTML = html;
    }

    function renderDataTable(rows, keyCols, compareCols, lblA, lblB, LIMIT) {
        // Base/Yield layout: key columns | value-A columns | value-B columns
        // Show as: [key cols] | [each compare col: A | B]
        // Or use flat layout: [key...] | [col A] | [col B] per column
        // Use the picture layout: Parameter | Units equivalent | Run-A vals | Run-B vals

        // Try to detect a "parameter-like" key and a "units" col in compare cols
        const unitCol = compareCols.find(c => c.toLowerCase() === 'units') || null;
        const valueCols = compareCols.filter(c => c !== unitCol);

        let html = `<table class="history-table hist-plan-table">`;

        // Group header
        const runAspan = valueCols.length;
        const runBspan = valueCols.length;
        html += `<thead><tr>`;
        keyCols.forEach(k => { html += `<th rowspan="2" class="hist-col-param">${esc(k)}</th>`; });
        if (unitCol) html += `<th rowspan="2" class="hist-col-units">${esc(unitCol)}</th>`;
        html += `<th colspan="${runAspan}" class="hist-col-run-header hist-col-run-a">${esc(lblA)}</th>`;
        html += `<th colspan="${runBspan}" class="hist-col-run-header hist-col-run-b">${esc(lblB)}</th>`;
        html += `</tr><tr>`;
        valueCols.forEach(col => { html += `<th class="hist-col-run-a hist-val-header">${esc(col)}</th>`; });
        valueCols.forEach(col => { html += `<th class="hist-col-run-b hist-val-header">${esc(col)}</th>`; });
        html += `</tr></thead><tbody>`;

        const displayed = rows.slice(0, LIMIT);
        for (const r of displayed) {
            const rowCls = r.status === 'changed' ? ' st-changed' : r.status === 'only_a' || r.status === 'only_b' ? ' st-onlyone' : '';
            html += `<tr class="hist-data-row${rowCls}">`;
            keyCols.forEach(k => { html += `<td class="hist-col-param">${esc(fmt(r.key[k]))}</td>`; });
            if (unitCol) {
                const uv = r.values[unitCol];
                html += `<td class="hist-col-units">${esc(fmt(uv ? uv.a ?? uv.b : null))}</td>`;
            }
            valueCols.forEach(col => {
                const v = r.values[col] || {};
                const cls = v.changed ? ' cell-changed' : '';
                html += `<td class="num hist-col-run-a${cls}">${esc(fmt(v.a))}</td>`;
            });
            valueCols.forEach(col => {
                const v = r.values[col] || {};
                const cls = v.changed ? ' cell-changed' : '';
                html += `<td class="num hist-col-run-b${cls}">${esc(fmt(v.b))}</td>`;
            });
            html += `</tr>`;
        }

        html += `</tbody></table>`;
        if (rows.length > LIMIT) html += `<div class="history-note">Showing first ${LIMIT} of ${rows.length} rows.</div>`;
        h$('#histDetail').innerHTML = html;
    }

    function renderMeta() {
        const d = state.result;
        const rows = (d?.metadata || []).filter(m => m.key !== 'client_saved_at' && !m.key.startsWith('custom_column_definitions'));
        const lblA = runLabel(d.run_a), lblB = runLabel(d.run_b);
        h$('#histMeta').innerHTML = rows.length
            ? `<table class="history-table"><thead><tr><th>Field</th><th>${esc(lblA)}</th><th>${esc(lblB)}</th></tr></thead><tbody>` +
              rows.map(m => `<tr class="${m.same ? '' : 'st-changed'}"><td>${esc(m.key)}</td><td>${esc(fmt(m.a))}</td><td>${esc(fmt(m.b))}</td></tr>`).join('') +
              '</tbody></table>'
            : '<div class="history-empty">No metadata.</div>';
    }

    // ------------------------------------------------------------- restore
    async function loadAIntoDashboard() {
        const run = h$('#histRunA').value;
        if (!run || !window.ILSHistorian) return;
        showError();
        try {
            const r = await fetch(`/api/historian/runs/${encodeURIComponent(run)}`);
            const d = await getJson(r);
            if (!r.ok) throw new Error(d.error || 'Could not load Run.');
            if (await window.ILSHistorian.restoreToDashboard(d)) {
                const disp = h$('#runNumberDisplay');
                if (disp) disp.value = d.run_number;
                window.ILSHistorian.toast(`Run ${d.run_number} loaded. Open the dashboard pages to view the saved results.`);
            }
        } catch (e) {
            showError(e.message);
        }
    }

    let filterTimer = null;
    const onFilterChange = () => {
        if (!state.result) return;
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => runCompare(), 250);
    };

    const onRowFilterChange = () => {
        if (!state.result) return;
        renderRows();
    };

    h$('#histRefresh').onclick = loadRuns;
    h$('#histMode').onchange = fillRunSelects;
    h$('#histCompare').onclick = () => { state.reactors = new Set(); state.conditions = new Set(); runCompare(); };
    h$('#histLoadA').onclick = loadAIntoDashboard;
    h$('#histReactor').onchange = onFilterChange;
    h$('#histCondition').onchange = onFilterChange;
    h$('#histResetFilters').onclick = () => {
        h$('#histReactor').value = '';
        h$('#histCondition').value = '';
        onFilterChange();
    };
    h$('#histRowDiffOnly').onchange = onRowFilterChange;
    document.querySelectorAll('#histTabs .table-tab').forEach(btn => {
        btn.onclick = () => {
            if (btn.disabled) return;
            state.activeTable = btn.dataset.table;
            runCompare();
        };
    });
    loadRuns();
})();
