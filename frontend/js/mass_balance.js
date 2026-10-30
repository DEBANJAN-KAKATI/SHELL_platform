// Mass Balance page: imports (ZMB/run .txt, MassBal workbook), editable inputs, calculated tabs, plots, export.
// The calculation runs on the server (/api/mass-balance/calculate); this file keeps the inputs and renders the views.
(() => {
    const KEYS = { inputs: 'ils_mb_inputs', imports: 'ils_mb_imports', results: 'ils_mb_results' };
    const REACTORS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const COLORS = { 1: '#eb5e28', 2: '#2563eb', 3: '#059669', 4: '#7c3aed', 5: '#d97706', 6: '#0891b2', 7: '#db2777', 8: '#475569' };
    const $ = sel => document.querySelector(sel);
    const charts = {};
    let state = null, imports = {}, last = null, calcTimer = null, calcSeq = 0;

    // ------------------------------------------------------------ state
    function read(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
    function write(key, value) {
        try { sessionStorage.setItem(key, JSON.stringify(value)); }
        catch (e) { showError('The browser storage is full; the latest change is kept on this page only.'); }
    }
    function emptySample(name) {
        return { name, liq: {}, c_wt_liquid_product: {}, gas: { source: 'txt', nml: {} }, gc_source: 'txt', gc: {}, excluded: {}, window: {} };
    }
    function defaults() {
        return {
            common: { run: {}, run_plan: {}, zmb: { liquid: {}, excluded: {} }, gas: { pure_mol: {} } },
            samples: [emptySample('C1-S1')],
            imports: {}, options: { mixed_gas_source: '1', workbook_compatible: true, gc_map: {} },
            active: 0, tab: 'import', reactor: '1'
        };
    }
    function save() { write(KEYS.inputs, state); write(KEYS.imports, imports); }

    function fromRunPlan() {
        // Run start and liquid-feed carbon default to the shared Run Plan (Feed Cut-In, Feed E2 Carbon).
        const rp = read('runPlanDashboardState') || {};
        const run = state.common.run, plan = state.common.run_plan;
        run.run_number = run.run_number || sessionStorage.getItem('ils_run_number') || '';
        const cutIn = (rp.planData?.info || []).find(x => String(x.parameter).toLowerCase() === 'feed cut-in');
        if (!run.start && cutIn?.value) run.start = String(cutIn.value);
        const carbon = (rp.feedRows || []).find(x => /^carbon\b/i.test(String(x.component || '')));
        if ((plan.liquid_feed_carbon_wt === undefined || plan.liquid_feed_carbon_wt === null || plan.liquid_feed_carbon_wt === '') && carbon && carbon.value !== '')
            plan.liquid_feed_carbon_wt = Number.isFinite(Number(carbon.value)) ? Number(carbon.value) : null;
    }

    function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
    function setPath(obj, path, value) {
        const keys = path.split('.');
        let o = obj;
        keys.slice(0, -1).forEach((k, i) => {
            if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) && Array.isArray(o) ? [] : {};
            o = o[k];
        });
        o[keys[keys.length - 1]] = value;
    }

    // ------------------------------------------------------------ helpers
    function status(text) { const el = $('#mbStatus'); if (el) el.textContent = text; }
    function showError(text) { const el = $('#mbError'); el.textContent = text || ''; el.classList.toggle('show', !!text); }
    async function post(url, body) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
        return data;
    }
    function esc(text) { return String(text ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
    const DIGITS = { mol: 6, g: 5, pct: 2, num: 4, int: 0 };
    function fmt(value, f) {
        if (value === null || value === undefined || value === '') return '';
        if (f === 'date' || f === 'text' || typeof value !== 'number') return String(value);
        if (!Number.isFinite(value)) return 'ERROR';
        const d = DIGITS[f] ?? 4;
        return Math.abs(value) >= 1e6 ? value.toExponential(3) : value.toFixed(d);
    }
    function parseInput(raw, f) {
        const text = String(raw).trim();
        if (text === '') return null;
        if (f === 'date' || f === 'text') return text;
        const n = Number(text.replace(',', '.'));
        return Number.isFinite(n) ? n : text;
    }

    // ------------------------------------------------------------ imports
    async function browse(targetId, kind) {
        try {
            const data = await post('/api/mass-balance/browse-file', { kind, initial_file: $('#' + targetId).value, title: kind === 'xlsx' ? 'Select MassBal workbook' : 'Select GC export .txt' });
            if (data.path) $('#' + targetId).value = data.path;
        } catch (e) { showError(e.message); }
    }

    function exportSummaryHtml(s) {
        if (!s) return '';
        const streams = Object.entries(s.streams || {}).map(([k, v]) => `${k === '0' ? 'Bypass' : 'R' + k}: ${v}`).join(' · ');
        const warn = (s.warnings || []).map(w => `<div class="warn">${esc(w)}</div>`).join('');
        return `<b>${esc(s.file)}</b> · ${s.kind === 'run' ? 'run export' : 'ZMB export'} · ${s.columns} columns · ${s.row_count} rows<br>` +
            `GC injections ${esc(streams)}<br>First ${esc(s.first_gc || '—')} · last ${esc(s.last_gc || '—')}${warn}`;
    }

    async function importTxt(which) {
        const path = $(which === 'zmb' ? '#zmbPath' : '#runPath').value.trim();
        if (!path) return showError('Enter the path of the .txt export first.');
        showError(''); status('Importing...');
        try {
            const summary = await post('/api/mass-balance/import-txt', { path });
            if (which === 'zmb' && summary.kind === 'run') summary.warnings = [...(summary.warnings || []), 'This file has feed-flow columns, so it looks like a run export.'];
            if (which === 'run' && summary.kind === 'zmb') summary.warnings = [...(summary.warnings || []), 'This file has no 01i14FIC/01i14FI01 columns: feed flows must be entered by hand.'];
            imports[which] = summary;
            state.imports[which === 'zmb' ? 'zmb_path' : 'run_path'] = path;
            if (which === 'run') state.samples.forEach(s => { if (s.gc_source !== 'workbook') s.gc_source = 'txt'; });
            renderImports(); save(); await calculate();
        } catch (e) { showError(e.message); status('Ready'); }
    }

    async function importWorkbook() {
        const path = $('#wbPath').value.trim();
        if (!path) return showError('Enter the path of the MassBal workbook first.');
        showError(''); status('Loading workbook...');
        try {
            const data = await post('/api/mass-balance/import-workbook', { path });
            const keepZmbGc = state.imports.zmb_path ? state.common.zmb : null;
            state.common = data.common;
            state.common.zmb.excluded = keepZmbGc?.excluded || {};
            state.common.run.run_number = state.common.run.run_number || sessionStorage.getItem('ils_run_number') || '';
            state.samples = data.samples.map(s => ({ ...emptySample(s.name), ...s, gc_source: state.imports.run_path ? 'txt' : 'workbook' }));
            state.active = 0;
            state.imports.wb_path = path;
            imports.workbook = { file: data.file, samples: data.samples.length };
            renderImports(); save(); await calculate();
        } catch (e) { showError(e.message); status('Ready'); }
    }

    function renderImports() {
        $('#zmbPath').value = state.imports.zmb_path || '';
        $('#runPath').value = state.imports.run_path || '';
        $('#wbPath').value = state.imports.wb_path || '';
        $('#zmbSummary').innerHTML = imports.zmb ? exportSummaryHtml(imports.zmb) : 'GC blocks of each reactor and the bypass come from this file (ESTD values).';
        $('#runSummary').innerHTML = imports.run ? exportSummaryHtml(imports.run) : 'Each sample takes the GC injections of its window and the means of 01i14FIC0r / 01i14FI01.';
        if (imports.workbook) $('#wbSummary').innerHTML = `<b>${esc(imports.workbook.file)}</b> loaded: run, ZMB liquid reps, feed gas, sample ${esc(state.samples[0]?.name)}.`;
        $('#optMixSource').value = state.options.mixed_gas_source || '1';
        $('#optCompat').checked = state.options.workbook_compatible !== false;
        renderSamples(); renderPreview();
    }

    function renderPreview() {
        const summary = imports.run || imports.zmb;
        $('#previewCard').hidden = !summary;
        if (!summary) return;
        $('#previewTitle').textContent = `Export rows · ${summary.file}`;
        const select = $('#previewStream');
        const current = select.value;
        select.innerHTML = '<option value="">All streams</option>' + Object.keys(summary.streams || {}).map(k => `<option value="${k}">${k === '0' ? 'Bypass' : 'R' + k}</option>`).join('');
        select.value = current;
        const cols = ['line', 'time', 'gc_time', 'stream', 'H2', 'N2', 'Argon', 'Ethylene', 'Acetylene', 'gc_total', '10i1TIC02', '10i2TIC02', '10i1PIC01', '01i14FI01'];
        const rows = (summary.preview || []).filter(r => select.value === '' || String(r.stream) === select.value);
        $('#previewTable').innerHTML = `<thead><tr>${cols.map(c => `<th>${esc(c === 'gc_total' ? 'GC total' : c)}</th>`).join('')}</tr></thead><tbody>` +
            rows.map(r => `<tr>${cols.map(c => `<td>${esc(typeof r[c] === 'number' && c !== 'line' && c !== 'stream' ? fmt(r[c], 'num') : r[c] ?? '')}</td>`).join('')}</tr>`).join('') + '</tbody>';
    }

    // ------------------------------------------------------------ samples
    function renderSamples() {
        const head = '<thead><tr><th>Sample</th><th>GC reps from</th><th>Feed flows from</th><th>Window start (optional)</th><th>Window end (optional)</th><th>Window used (R1)</th><th></th></tr></thead>';
        const used = i => (last?.results?.[i]?.window?.['1'] || []).map(x => x || '—').join(' → ');
        const body = state.samples.map((s, i) => `<tr class="${i === state.active ? 'mb-active-row' : ''}">
            <td><input class="mb-edit text" data-sample="${i}" data-key="name" value="${esc(s.name)}"></td>
            <td><select class="mb-edit" data-sample="${i}" data-key="gc_source"><option value="txt"${s.gc_source !== 'workbook' ? ' selected' : ''}>run export (.txt)</option>
                <option value="workbook"${s.gc_source === 'workbook' ? ' selected' : ''}${Object.keys(s.gc || {}).length ? '' : ' disabled'}>workbook R*_MB</option></select></td>
            <td><select class="mb-edit" data-sample="${i}" data-key="gas.source"><option value="txt"${(s.gas || {}).source !== 'manual' ? ' selected' : ''}>run export (.txt)</option>
                <option value="manual"${(s.gas || {}).source === 'manual' ? ' selected' : ''}>entered by hand</option></select></td>
            <td><input class="mb-edit date" data-sample="${i}" data-key="window.start" value="${esc(s.window?.start || '')}" placeholder="previous sample / Run Start"></td>
            <td><input class="mb-edit date" data-sample="${i}" data-key="window.finish" value="${esc(s.window?.finish || '')}" placeholder="collection finished"></td>
            <td class="mb-text">${esc(used(i))}</td>
            <td>${state.samples.length > 1 ? `<button class="mb-delete" data-remove="${i}" type="button">Remove</button>` : ''}</td></tr>`).join('');
        $('#sampleTable').innerHTML = head + '<tbody>' + body + '</tbody>';
        const select = $('#mbSample');
        select.innerHTML = state.samples.map((s, i) => `<option value="${i}">${esc(s.name || 'Sample ' + (i + 1))}</option>`).join('');
        select.value = String(state.active);
    }

    // ------------------------------------------------------------ calculation
    function payload() {
        const samples = state.samples.map(s => {
            const copy = JSON.parse(JSON.stringify(s));
            if (copy.gc_source !== 'workbook') delete copy.gc;
            if (!state.imports.run_path && copy.gc_source === 'txt' && Object.keys(s.gc || {}).length) { copy.gc = s.gc; copy.gc_source = 'workbook'; }
            if (!state.imports.run_path && (copy.gas || {}).source === 'txt') copy.gas.source = 'manual';
            return copy;
        });
        const common = JSON.parse(JSON.stringify(state.common));
        if (state.imports.zmb_path) delete common.zmb.gc;
        return { common, samples, imports: { zmb_path: state.imports.zmb_path || '', run_path: state.imports.run_path || '' }, options: state.options };
    }

    function scheduleCalculate() { clearTimeout(calcTimer); calcTimer = setTimeout(calculate, 350); }

    async function calculate() {
        const seq = ++calcSeq;
        status('Processing...');
        try {
            const data = await post('/api/mass-balance/calculate', payload());
            if (seq !== calcSeq) return;
            last = data;
            showError('');
            $('#mbWarnings').hidden = !(data.warnings || []).length;
            $('#mbWarnings').textContent = (data.warnings || []).join(' ');
            write(KEYS.results, { trend: data.trend, calculated_at: data.calculated_at,
                samples: data.results.map(r => ({ sample: r.sample, rows: r.summary.rows })) });
            render();
            status('Ready');
        } catch (e) {
            if (seq === calcSeq) { showError(e.message); status('Ready'); }
        }
    }

    // ------------------------------------------------------------ rendering
    function cellHtml(cell) {
        const cls = [];
        if (cell.flag === 'outlier') cls.push('mb-outlier');
        if (cell.flag === 'excluded') cls.push('mb-excluded');
        if (cell.flag === 'kpi') cls.push('mb-kpi');
        if (cell.flag === 'pass') cls.push('mb-pass');
        if (cell.flag === 'fail') cls.push('mb-fail');
        if (cell.f === 'text' || cell.f === 'date') cls.push('mb-text');
        const title = cell.src ? ` title="${esc(cell.src)}"` : '';
        if (cell.in) {
            cls.push('mb-input');
            const kind = cell.f === 'date' ? 'date' : cell.f === 'text' ? 'text' : '';
            const value = cell.v === null || cell.v === undefined ? '' : (typeof cell.v === 'number' ? String(cell.v) : cell.v);
            return `<td class="${cls.join(' ')}"${title}><input class="mb-edit ${kind}" data-path="${esc(cell.in)}" data-f="${cell.f}" value="${esc(value)}"${kind === 'date' ? ' placeholder="YYYY-MM-DD HH:MM"' : ''}></td>`;
        }
        const text = typeof cell.v === 'string' && cell.v.startsWith('ERROR') ? cell.v : fmt(cell.v, cell.f);
        return `<td class="${cls.join(' ')}"${title}>${esc(text)}</td>`;
    }

    function sectionHtml(section) {
        const hasUnit = section.rows.some(r => r.unit);
        const excluded = new Set((getPath(state, section.exclude_path || '') || []).map(Number));
        const repCol = (col, j) => {
            const m = /^#(\d+)$/.exec(col);
            if (!section.exclude_path || !m) return `<th>${esc(col)}</th>`;
            const n = Number(m[1]);
            return `<th class="mb-rep${excluded.has(n) ? ' mb-excluded' : ''}" data-exclude="${esc(section.exclude_path)}" data-rep="${n}" title="Click to ${excluded.has(n) ? 'include' : 'exclude'} this rep">${esc(col)}</th>`;
        };
        const head = section.columns.length
            ? `<thead><tr><th>Parameter</th>${hasUnit ? '<th>Unit</th>' : ''}${section.columns.map(repCol).join('')}</tr></thead>` : '';
        const body = section.rows.map(r => `<tr><td>${esc(r.label)}</td>${hasUnit ? `<td class="mb-unit">${esc(r.unit || '')}</td>` : ''}${r.cells.map(cellHtml).join('')}</tr>`).join('');
        const note = section.note ? `<div class="mb-section-note">${esc(section.note)}</div>` : '';
        const narrow = section.columns.length <= 2 ? ' mb-narrow' : '';
        const table = section.rows.length ? `<div class="table-wrap mb-table-wrap"><table class="mb-table${narrow}">${head}<tbody>${body}</tbody></table></div>` : '<div class="mb-section-empty">No data.</div>';
        return `<div class="card mb-section"><div class="card-head"><div><h3>${esc(section.title)}</h3></div></div>${note}${table}</div>`;
    }

    function currentResult() { return last?.results?.[state.active] || last?.results?.[0] || null; }

    function render() {
        renderSamples(); renderKpis(); renderArSuggestion();
        const tab = state.tab;
        document.querySelectorAll('#mbTabs .table-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.mb-panel').forEach(p => {
            p.hidden = !(p.dataset.panel === tab || (p.dataset.panel === 'view' && !['import', 'plots'].includes(tab)));
        });
        $('#mbReactorField').hidden = tab !== 'reactors';
        $('#mbReactor').value = state.reactor;
        if (tab === 'plots') return renderPlots();
        if (tab === 'import') return;
        const result = currentResult();
        if (!result) { $('#mbView').innerHTML = '<div class="card mb-section"><div class="mb-section-empty">Import the exports or a workbook to calculate.</div></div>'; return; }
        const id = tab === 'reactors' ? 'r' + state.reactor : tab;
        const view = result.views.find(v => v.id === id);
        $('#mbView').innerHTML = view ? view.sections.map(sectionHtml).join('') : '';
    }

    function renderKpis() {
        const result = currentResult();
        const rows = result?.summary?.rows || [];
        const withData = rows.filter(r => r.rep_count > 0);
        const range = key => {
            const v = withData.map(r => r[key]).filter(x => typeof x === 'number');
            return v.length ? `${Math.min(...v).toFixed(1)} – ${Math.max(...v).toFixed(1)}` : '—';
        };
        $('#mbKpis').innerHTML = [
            ['Reactors with GC data', withData.length ? withData.map(r => 'R' + r.reactor).join(' ') : '—', `${result?.sample || ''} · GC from ${result?.gc_source || '—'}`],
            ['Carbon balance [%]', range('carbon_balance'), 'C-Balance C9'],
            ['Mass balance closure [%]', range('mass_balance'), 'R*_MB C13'],
            ['Acetylene conversion [%]', range('acetylene_conversion'), 'C-Balance C19'],
        ].map(([label, value, note]) => `<div class="kpi"><span>${esc(label)}</span><b>${esc(value)}</b><small>${esc(note)}</small></div>`).join('');
    }

    function renderArSuggestion() {
        const v = last?.zmb_suggestion;
        $('#arSuggestion').innerHTML = typeof v === 'number'
            ? `ZMB measured Argon (mean ESTD of the reactor streams): <b>${v.toFixed(3)} mol%</b> · verified Ar entered: <b>${state.common.gas?.ar_mol ?? '—'}</b> ` +
              `<button class="btn secondary" id="useAr" type="button">Use ${v.toFixed(2)} and ${(100 - v).toFixed(2)} as verified Ar / mixed gas</button>`
            : 'Import the ZMB export to see the measured Argon.';
    }

    // ------------------------------------------------------------ GC map
    async function renderGcMap() {
        try {
            const response = await fetch('/api/mass-balance/gc-map');
            const data = await response.json();
            const map = { ...data.map, ...(state.options.gc_map || {}) };
            const gases = [...new Set([...(imports.run?.configured_gases || []), ...(imports.run?.gases || [])])];
            $('#gcMapTable').innerHTML = '<thead><tr><th>R*_MB row</th><th>Export gas (ESTD)</th></tr></thead><tbody>' + data.rows.map(row =>
                `<tr><td>${esc(row)}</td><td><input class="mb-edit text" list="gcGases" data-gcrow="${esc(row)}" value="${esc(map[row] || '')}" placeholder="0 (no peak)"></td></tr>`).join('') +
                `</tbody><datalist id="gcGases">${gases.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;
        } catch (e) { /* the map editor is optional */ }
    }

    // ------------------------------------------------------------ plots
    function chart(id, config) {
        if (charts[id]) charts[id].destroy();
        if (typeof Chart === 'undefined') return;
        charts[id] = new Chart(document.getElementById(id), config);
    }
    function renderPlots() {
        const result = currentResult();
        if (!result) return;
        const rows = result.summary.rows.filter(r => r.rep_count > 0);
        chart('plotBalance', { type: 'bar', data: { labels: rows.map(r => 'R' + r.reactor), datasets: [
            { label: 'Carbon balance [%]', data: rows.map(r => r.carbon_balance), backgroundColor: '#c95512' },
            { label: 'Mass balance closure [%]', data: rows.map(r => r.mass_balance), backgroundColor: '#071a2d' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { title: { display: true, text: '%' } } } } });
        // GC reps without a timestamp (typed into the workbook) are plotted against the rep number.
        const withTime = REACTORS.some(r => (result.summary.tos_by_rep[r] || []).some(x => x !== null));
        const byRep = key => REACTORS.filter(r => result.reactors[r].rep_count > 0).map(r => ({
            label: 'R' + r, borderColor: COLORS[r], backgroundColor: COLORS[r], showLine: true, tension: 0,
            data: result.summary[key][r].map((y, j) => ({ x: withTime ? result.summary.tos_by_rep[r][j] : j + 1, y })).filter(p => p.y !== null && p.x !== null)
        }));
        const xy = (label, xLabel = 'TOS [h]') => ({ responsive: true, maintainAspectRatio: false,
            scales: { x: { type: 'linear', title: { display: true, text: xLabel } }, y: { title: { display: true, text: label } } } });
        const repAxis = withTime ? 'TOS [h]' : 'GC rep #';
        chart('plotCbalRep', { type: 'scatter', data: { datasets: byRep('carbon_balance_by_rep') }, options: xy("Gas-phase C'Bal [%]", repAxis) });
        chart('plotAcRep', { type: 'scatter', data: { datasets: byRep('acetylene_conversion_by_rep') }, options: xy('Acetylene conversion [%]', repAxis) });
        const metric = $('#trendMetric').value;
        const trend = last.trend || [];
        chart('plotTrend', { type: 'scatter', data: { datasets: REACTORS.map(r => ({
            label: 'R' + r, borderColor: COLORS[r], backgroundColor: COLORS[r], showLine: true,
            data: trend.filter(t => String(t.reactor) === r && t.rep_count > 0 && t[metric] !== null && t.tos_h !== null).map(t => ({ x: t.tos_h, y: t[metric] }))
        })).filter(d => d.data.length) }, options: xy($('#trendMetric').selectedOptions[0].textContent) });
    }

    // ------------------------------------------------------------ export
    async function exportXlsx() {
        status('Exporting...');
        try {
            const response = await fetch('/api/mass-balance/export-xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Export failed');
            const blob = await response.blob();
            const name = (response.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)/)?.[1] || 'MassBalance.xlsx';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = name; a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            status('Ready');
        } catch (e) { showError(e.message); status('Ready'); }
    }

    // ------------------------------------------------------------ events
    function bind() {
        document.querySelectorAll('[data-browse]').forEach(b => b.addEventListener('click', () => browse(b.dataset.browse, b.dataset.kind)));
        $('#zmbImport').addEventListener('click', () => importTxt('zmb'));
        $('#runImport').addEventListener('click', () => importTxt('run'));
        $('#wbImport').addEventListener('click', importWorkbook);
        $('#mbRecalc').addEventListener('click', calculate);
        $('#mbExport').addEventListener('click', exportXlsx);
        $('#previewStream').addEventListener('change', renderPreview);
        $('#trendMetric').addEventListener('change', renderPlots);
        $('#mbTabs').addEventListener('click', e => {
            const b = e.target.closest('.table-tab'); if (!b) return;
            state.tab = b.dataset.tab; save(); render();
        });
        $('#mbSample').addEventListener('change', e => { state.active = Number(e.target.value); save(); render(); });
        $('#mbReactor').addEventListener('change', e => { state.reactor = e.target.value; save(); render(); });
        $('#sampleAdd').addEventListener('click', () => {
            const n = state.samples.length + 1;
            const prev = state.samples[state.samples.length - 1];
            const sample = emptySample(prev?.name ? prev.name.replace(/S(\d+)$/, (m, d) => 'S' + (Number(d) + 1)) : 'S' + n);
            if (prev?.c_wt_liquid_product) sample.c_wt_liquid_product = { ...prev.c_wt_liquid_product };
            if (prev?.gas?.source === 'manual') sample.gas = JSON.parse(JSON.stringify(prev.gas));
            state.samples.push(sample); state.active = state.samples.length - 1; save(); renderSamples(); scheduleCalculate();
        });
        $('#sampleTable').addEventListener('click', e => {
            const b = e.target.closest('[data-remove]'); if (!b) return;
            state.samples.splice(Number(b.dataset.remove), 1);
            state.active = Math.min(state.active, state.samples.length - 1); save(); renderSamples(); scheduleCalculate();
        });
        $('#sampleTable').addEventListener('change', e => {
            const el = e.target.closest('[data-sample]'); if (!el) return;
            const sample = state.samples[Number(el.dataset.sample)];
            setPath(sample, el.dataset.key, el.value.trim() === '' ? null : el.value.trim());
            if (el.dataset.key === 'gas.source' && el.value === 'manual' && last?.results?.[Number(el.dataset.sample)]) {
                const flows = last.results[Number(el.dataset.sample)].gas_flows || {};   // start the manual values from the txt means
                sample.gas.fi01 = sample.gas.fi01 ?? flows.fi01; sample.gas.nml = { ...(flows.nml || {}), ...(sample.gas.nml || {}) };
            }
            save(); scheduleCalculate();
        });
        $('#optMixSource').addEventListener('change', e => { state.options.mixed_gas_source = e.target.value; save(); scheduleCalculate(); });
        $('#optCompat').addEventListener('change', e => { state.options.workbook_compatible = e.target.checked; save(); scheduleCalculate(); });
        $('#arSuggestion').addEventListener('click', e => {
            if (e.target.id !== 'useAr' || typeof last?.zmb_suggestion !== 'number') return;
            const v = Number(last.zmb_suggestion.toFixed(2));
            state.common.gas.ar_mol = v; state.common.gas.mix_mol = Number((100 - v).toFixed(2)); save(); calculate();
        });
        document.querySelector('.mb-gcmap').addEventListener('toggle', e => { if (e.target.open) renderGcMap(); });
        $('#gcMapTable').addEventListener('change', e => {
            const el = e.target.closest('[data-gcrow]'); if (!el) return;
            state.options.gc_map = { ...(state.options.gc_map || {}), [el.dataset.gcrow]: el.value.trim() || null }; save(); scheduleCalculate();
        });
        $('#gcMapSave').addEventListener('click', async () => {
            try {
                const map = {};
                document.querySelectorAll('[data-gcrow]').forEach(el => { map[el.dataset.gcrow] = el.value.trim() || null; });
                await post('/api/mass-balance/gc-map', { map });
                state.options.gc_map = {}; save(); status('GC map saved'); setTimeout(() => status('Ready'), 1500);
            } catch (err) { showError(err.message); }
        });
        $('#gcMapReset').addEventListener('click', () => { state.options.gc_map = {}; save(); renderGcMap(); scheduleCalculate(); });
        $('#mbView').addEventListener('change', e => {
            const el = e.target.closest('input[data-path]'); if (!el) return;
            setPath(state, el.dataset.path, parseInput(el.value, el.dataset.f)); save(); scheduleCalculate();
        });
        $('#mbView').addEventListener('click', e => {
            const th = e.target.closest('th[data-exclude]'); if (!th) return;
            const list = new Set((getPath(state, th.dataset.exclude) || []).map(Number));
            const n = Number(th.dataset.rep);
            list.has(n) ? list.delete(n) : list.add(n);
            setPath(state, th.dataset.exclude, [...list].sort((a, b) => a - b)); save(); calculate();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        state = { ...defaults(), ...(read(KEYS.inputs) || {}) };
        imports = read(KEYS.imports) || {};
        fromRunPlan();
        $('#mbProcessWarning').hidden = !!window.ILSProcess?.isMassBalance?.();
        bind(); renderImports(); render();
        if (state.imports.zmb_path || state.imports.run_path || state.imports.wb_path) calculate();
    });
})();
