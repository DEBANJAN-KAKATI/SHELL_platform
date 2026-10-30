// Mass Balance core, shared by the Run Plan, ZMB, Online Analysis and Calculation pages when the process is
// "Mass Balance". Keeps the inputs (sessionStorage ils_mb_inputs), runs /api/mass-balance/calculate and publishes the
// results as {columns, rows} tables that Plots, Summary Dashboard, Data Integrity, Custom table and History read.
(() => {
    const KEYS = {
        inputs: 'ils_mb_inputs', imports: 'ils_mb_imports', results: 'ils_mb_results',
        reps: 'ils_mb_rep_table', summary: 'ils_mb_summary_table'
    };
    const REACTORS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const listeners = new Set();
    let state = null, imports = {}, last = null, timer = null, seq = 0;

    const read = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
    function write(key, value) {
        try { sessionStorage.setItem(key, JSON.stringify(value)); return true; }
        catch { return false; }
    }

    function emptySample(name) {
        return { name, liq: {}, c_wt_liquid_product: {}, gas: { source: 'txt', nml: {} }, gc_source: 'txt', gc: {}, excluded: {}, window: {} };
    }
    function defaults() {
        const beds = ['Top', 'Middle', 'Bottom'].map(bed => ({ bed, catalyst: null, target_mg: null, actual_mg: null, volume_ml: null }));
        return {
            common: {
                run: {}, gas: { pure_mol: {} }, zmb: { liquid: {}, excluded: {} },
                run_plan: {
                    catalysts: REACTORS.map(r => ({ reactor: Number(r), beds: JSON.parse(JSON.stringify(beds)) })),
                    conditions: Array.from({ length: 6 }, (_, i) => ({ condition: i + 1 }))
                }
            },
            samples: [emptySample('C1-S1')],
            imports: {}, options: { mixed_gas_source: '1', workbook_compatible: true, gc_map: {} },
            active: 0, ui: {}
        };
    }

    function load() {
        if (state) return state;
        const saved = read(KEYS.inputs);
        state = saved ? { ...defaults(), ...saved } : defaults();
        state.ui = state.ui || {};
        imports = read(KEYS.imports) || {};
        // The run export is imported on the Online Analysis page (same page as for the other processes).
        const online = read('dhaOnlineState') || {};
        if (online.path && online.path !== state.imports.run_path) state.imports.run_path = online.path;
        const run = state.common.run;
        run.run_number = sessionStorage.getItem('ils_run_number') || run.run_number || '';
        return state;
    }
    function save() { write(KEYS.inputs, state); write(KEYS.imports, imports); }

    function getPath(obj, path) { return String(path || '').split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
    function setPath(obj, path, value) {
        const keys = path.split('.');
        let o = obj;
        keys.slice(0, -1).forEach((k, i) => {
            if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
            o = o[k];
        });
        o[keys[keys.length - 1]] = value;
    }

    // ------------------------------------------------------------ server calls
    async function post(url, body) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
        return data;
    }

    function payload() {
        const s = load();
        const samples = s.samples.map(sample => {
            const copy = JSON.parse(JSON.stringify(sample));
            const hasWorkbookGc = Object.values(sample.gc || {}).some(reps => (reps || []).length);
            if (copy.gc_source === 'workbook' && !hasWorkbookGc) copy.gc_source = 'txt';
            if (copy.gc_source !== 'workbook') delete copy.gc;
            if (!s.imports.run_path && hasWorkbookGc) { copy.gc = sample.gc; copy.gc_source = 'workbook'; }
            if (!s.imports.run_path && (copy.gas || {}).source === 'txt') copy.gas.source = 'manual';
            return copy;
        });
        const common = JSON.parse(JSON.stringify(s.common));
        if (s.imports.zmb_path) delete common.zmb.gc;
        return { common, samples, imports: { zmb_path: s.imports.zmb_path || '', run_path: s.imports.run_path || '' }, options: s.options };
    }

    function hasInputs() {
        const s = load();
        return Boolean(s.imports.zmb_path || s.imports.run_path || s.imports.wb_path ||
            s.samples.some(x => Object.keys(x.gc || {}).length));
    }

    async function calculate() {
        const mine = ++seq;
        try {
            const data = await post('/api/mass-balance/calculate', payload());
            if (mine !== seq) return last;
            last = data;
            write(KEYS.results, { trend: data.trend, calculated_at: data.calculated_at, warnings: data.warnings,
                samples: data.results.map(r => ({ sample: r.sample, rows: r.summary.rows })) });
            if (!write(KEYS.reps, data.tables.reps) || !write(KEYS.summary, data.tables.summary))
                data.warnings = [...(data.warnings || []), 'Browser storage is full: the GC rep table could not be shared with the other pages.'];
            listeners.forEach(fn => fn(data, null));
            return data;
        } catch (error) {
            if (mine === seq) listeners.forEach(fn => fn(null, error));
            throw error;
        }
    }
    function schedule(delay = 350) { clearTimeout(timer); timer = setTimeout(() => calculate().catch(() => {}), delay); }

    async function importTxt(path) { return post('/api/mass-balance/import-txt', { path }); }
    async function importWorkbook(path) {
        const data = await post('/api/mass-balance/import-workbook', { path });
        const s = load();
        const keep = { excluded: s.common.zmb.excluded || {} };
        s.common = data.common;
        s.common.zmb.excluded = keep.excluded;
        s.common.run.run_number = sessionStorage.getItem('ils_run_number') || s.common.run.run_number || '';
        // GC reps come from the workbook only when it holds GC tables (a filled MassBal workbook) and no run export is loaded.
        s.samples = data.samples.map(x => ({ ...emptySample(x.name), ...x,
            gc_source: !s.imports.run_path && Object.keys(x.gc || {}).some(r => (x.gc[r] || []).length) ? 'workbook' : 'txt' }));
        s.active = 0;
        s.imports.wb_path = path;
        imports.workbook = { file: data.file };
        save();
        return data;
    }
    async function browse(kind, initial) {
        const data = await post('/api/mass-balance/browse-file', {
            kind, initial_file: initial || '', title: kind === 'xlsx' ? 'Select MassBal workbook' : 'Select GC export .txt'
        });
        return data.path || '';
    }

    // ------------------------------------------------------------ rendering helpers
    function esc(text) { return String(text ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
    const DIGITS = { mol: 6, g: 5, pct: 2, num: 4, int: 0 };
    function fmt(value, f) {
        if (value === null || value === undefined || value === '') return '';
        if (f === 'date' || f === 'text' || typeof value !== 'number') return String(value);
        if (!Number.isFinite(value)) return 'ERROR';
        return Math.abs(value) >= 1e6 ? value.toExponential(3) : value.toFixed(DIGITS[f] ?? 4);
    }
    function parseInput(raw, f) {
        const text = String(raw).trim();
        if (text === '') return null;
        if (f === 'date' || f === 'text') return text;
        const n = Number(text.replace(',', '.'));
        return Number.isFinite(n) ? n : text;
    }

    function cellHtml(cell) {
        const cls = [];
        if (cell.flag) cls.push('mb-' + cell.flag);
        if (cell.f === 'text' || cell.f === 'date') cls.push('mb-text');
        const title = cell.src ? ` title="${esc(cell.src)}"` : '';
        if (cell.in) {
            cls.push('mb-input');
            const kind = cell.f === 'date' ? 'date' : cell.f === 'text' ? 'text' : '';
            let value = cell.v === null || cell.v === undefined ? '' : String(cell.v);
            if (kind === 'date') value = value.replace(/^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}):00$/, '$1');   // seconds only when not :00
            return `<td class="${cls.join(' ')}"${title}><input class="mb-edit ${kind}" data-path="${esc(cell.in)}" data-f="${cell.f}" value="${esc(value)}"${kind === 'date' ? ' placeholder="YYYY-MM-DD HH:MM"' : ''}></td>`;
        }
        const text = typeof cell.v === 'string' && cell.v.startsWith('ERROR') ? cell.v : fmt(cell.v, cell.f);
        return `<td class="${cls.join(' ')}"${title}>${esc(text)}</td>`;
    }

    function sectionHtml(sec, opts = {}) {
        const rows = opts.hideZero ? sec.rows.filter(r => !r.zero) : sec.rows;
        const hidden = sec.rows.length - rows.length;
        const hasUnit = sec.rows.some(r => r.unit);
        const excluded = new Set((getPath(load(), sec.exclude_path) || []).map(Number));
        const th = col => {
            const m = /^#(\d+)$/.exec(col);
            if (!sec.exclude_path || !m) return `<th>${esc(col)}</th>`;
            const n = Number(m[1]);
            return `<th class="mb-rep${excluded.has(n) ? ' mb-excluded' : ''}" data-exclude="${esc(sec.exclude_path)}" data-rep="${n}" title="Click to ${excluded.has(n) ? 'include' : 'exclude'} this rep">${esc(col)}</th>`;
        };
        // Fixed column widths: every table with the same columns (R1…R8) lines up with the others on the page.
        // A column holding only text/dates (or an all-text first column) is left-aligned, numbers right-aligned.
        const textColumn = sec.columns.map((_, j) => rows.length > 0 && rows.every(r => !r.cells[j] || ['text', 'date'].includes(r.cells[j].f) || r.cells[j].v === null || r.cells[j].v === undefined)
            && rows.some(r => r.cells[j] && ['text', 'date'].includes(r.cells[j].f)));
        const head = sec.columns.length ? `<thead><tr><th>Parameter</th>${hasUnit ? '<th class="mb-left">Unit</th>' : ''}${sec.columns.map((col, j) => {
            const cell = th(col);
            return textColumn[j] && !cell.includes('mb-rep') ? cell.replace('<th>', '<th class="mb-left">') : cell;
        }).join('')}</tr></thead>` : '';
        const body = rows.map(r => `<tr><td>${esc(r.label)}</td>${hasUnit ? `<td class="mb-unit">${esc(r.unit || '')}</td>` : ''}${r.cells.map(cellHtml).join('')}</tr>`).join('');
        const notes = [sec.note, hidden ? `${hidden} rows with only zeros are hidden.` : ''].filter(Boolean);
        const note = notes.length ? `<div class="mb-section-note">${esc(notes.join(' '))}</div>` : '';
        const hasDate = rows.some(r => r.cells.some(cell => cell.f === 'date'));
        const widths = { label: hasDate ? 250 : 300, unit: 80, value: sec.columns.length <= 2 ? 220 : hasDate ? 148 : 120 };
        const minWidth = widths.label + (hasUnit ? widths.unit : 0) + sec.columns.length * widths.value;
        const cols = `<colgroup><col style="width:${widths.label}px">${hasUnit ? `<col style="width:${widths.unit}px">` : ''}${sec.columns.map(() => '<col>').join('')}</colgroup>`;
        const narrow = sec.columns.length <= 2 ? ' mb-narrow' : '';
        const table = sec.rows.length
            ? `<div class="table-wrap mb-table-wrap"><table class="mb-table${narrow}" style="min-width:${minWidth}px">${cols}${head}<tbody>${body}</tbody></table></div>`
            : '<div class="mb-section-empty">No data.</div>';
        const title = opts.noTitle ? '' : `<div class="card-head"><div>${opts.eyebrow ? `<div class="eyebrow">${esc(opts.eyebrow)}</div>` : ''}<h3>${esc(sec.title)}</h3></div></div>`;
        return `<div class="card mb-section">${title}${note}${table}</div>`;
    }

    // Edits in a rendered table write to the inputs and recalculate; rep headers toggle exclusion.
    function bindContainer(el) {
        el.addEventListener('change', e => {
            const input = e.target.closest('input[data-path]');
            if (!input) return;
            setPath(load(), input.dataset.path, parseInput(input.value, input.dataset.f));
            save(); schedule();
        });
        el.addEventListener('click', e => {
            const th = e.target.closest('th[data-exclude]');
            if (!th) return;
            const s = load();
            const list = new Set((getPath(s, th.dataset.exclude) || []).map(Number));
            const n = Number(th.dataset.rep);
            list.has(n) ? list.delete(n) : list.add(n);
            setPath(s, th.dataset.exclude, [...list].sort((a, b) => a - b));
            save(); calculate().catch(() => {});
        });
    }

    function result(index) {
        const s = load();
        const i = index ?? s.active ?? 0;
        return last?.results?.[i] || last?.results?.[0] || null;
    }
    function view(id, index) { return result(index)?.views?.find(v => v.id === id) || null; }

    function sampleOptions() {
        const s = load();
        return s.samples.map((x, i) => `<option value="${i}"${i === s.active ? ' selected' : ''}>${esc(x.name || 'Sample ' + (i + 1))}</option>`).join('');
    }
    function addSample() {
        const s = load();
        const prev = s.samples[s.samples.length - 1];
        const name = prev?.name && /S\d+$/.test(prev.name) ? prev.name.replace(/S(\d+)$/, (m, d) => 'S' + (Number(d) + 1)) : 'S' + (s.samples.length + 1);
        const sample = emptySample(name);
        if (prev?.c_wt_liquid_product) sample.c_wt_liquid_product = { ...prev.c_wt_liquid_product };
        if (prev?.gas?.source === 'manual') sample.gas = JSON.parse(JSON.stringify(prev.gas));
        s.samples.push(sample); s.active = s.samples.length - 1; save();
    }
    function removeSample(i) {
        const s = load();
        if (s.samples.length <= 1) return;
        s.samples.splice(i, 1); s.active = Math.min(s.active, s.samples.length - 1); save();
    }

    async function exportXlsx() {
        const response = await fetch('/api/mass-balance/export-xlsx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Export failed');
        const blob = await response.blob();
        const name = (response.headers.get('Content-Disposition') || '').match(/filename="?([^";]+)/)?.[1] || 'MassBalance.xlsx';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    // The Online Analysis page saves the run export; recalculate so every page sees the new GC reps.
    window.addEventListener('ils:online-saved', () => {
        if (!window.ILSProcess?.isMassBalance?.()) return;
        const online = read('dhaOnlineState') || {};
        const s = load();
        if (online.path && online.path !== s.imports.run_path) {
            s.imports.run_path = online.path;
            s.samples.forEach(x => { if (x.gc_source !== 'workbook') x.gc_source = 'txt'; });
            save(); schedule(100);
        }
    });

    window.MB = {
        KEYS, REACTORS, load, save, payload, calculate, schedule, hasInputs, importTxt, importWorkbook, browse,
        onResult: fn => listeners.add(fn), result, view, last: () => last, imports: () => imports,
        setImport: (k, v) => { imports[k] = v; save(); }, sectionHtml, bindContainer, sampleOptions, addSample, removeSample,
        exportXlsx, esc, fmt, getPath, setPath, emptySample
    };
})();
