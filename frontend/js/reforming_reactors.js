// Reforming with several reactors, catalyst and inert (6.10.2): the reactor, block and TOS origin of every DHA sample.
// Shared by the Offline Analysis page (Active Reactor column) and the Calculation page (Reforming tables).
//
// The DHA files carry no reactor. The operating data (.txt of Online Analysis) has one line per GC injection with its
// GC Date/Time and Sampled_reactor. A DHA sample is matched to the GC line whose GC Date/Time is within -10..+60 min of
// the DHA time (closest pairs first, each line used once; the rule of Export Complete CSV). The online table's own
// Date/Time is NOT used: it is ~17-20 min before GC Date/Time while the reactor changes every ~27 min, so the nearest
// Date/Time is usually the next reactor's line. The lines are read once per file and cached in sessionStorage.
window.ILSReformingReactors = (() => {
    const LINES_KEY = 'ils_reforming_reactor_lines';
    // 6.11.2: lines carry the server's assigned reactor (lines exported with Sampled_reactor 0 get the GC-cycle reactor);
    // caches written before (no version) are read again
    const LINES_VERSION = 3;
    const CALC_VERSION = 3;
    const BEFORE_MS = 10 * 60000;
    const AFTER_MS = 60 * 60000;
    const readJson = (storage, key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (e) { return null; } };

    // 'R6', '6', '6.0' -> 'R6'; 0 -> 'R0' (bypass); anything else -> ''
    function norm(value) {
        const match = String(value ?? '').trim().match(/^R?\s*(\d+)(?:\.0+)?$/i);
        if (!match) return '';
        return `R${Number(match[1])}`;
    }
    const isReactor = (value) => /^R[1-9]\d*$/.test(String(value || ''));

    // dd.mm.yyyy / dd/mm/yyyy / yyyy-mm-dd, with hh:mm[:ss]; also Date objects and Excel-like ISO strings
    function time(value) {
        if (value === null || value === undefined || value === '') return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
        const text = String(value).trim();
        let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
        m = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
        const parsed = Date.parse(text);
        return Number.isNaN(parsed) ? null : parsed;
    }

    function onlineState() {
        return readJson(sessionStorage, 'dhaOnlineState') || readJson(localStorage, 'dhaOnlineState');
    }
    // 6.11.3: signature of the loaded operating data (path + content). The file can change under the same name (a newer
    // export, Sampled_reactor filled in by hand): the cached GC lines and calculation are then read again. FNV-1a of the
    // stored Online Analysis state, recomputed only when that text changes.
    let sigMemo = { raw: null, sig: '' };
    function onlineSig() {
        const raw = sessionStorage.getItem('dhaOnlineState') || localStorage.getItem('dhaOnlineState') || '';
        if (raw === sigMemo.raw) return sigMemo.sig;
        let hash = 0x811c9dc5;
        for (let i = 0; i < raw.length; i++) { hash ^= raw.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
        sigMemo = { raw, sig: `${raw.length}:${hash.toString(16)}` };
        return sigMemo.sig;
    }
    // Cached GC lines [{gc, reactor}] of the loaded operating file, or null when they are not read (yet)
    function lines() {
        const cached = readJson(sessionStorage, LINES_KEY);
        if (!cached || !Array.isArray(cached.lines) || cached.v !== LINES_VERSION) return null;
        const online = onlineState();
        if (online?.path && cached.path && online.path !== cached.path) return null;
        if (online && cached.sig && cached.sig !== onlineSig()) return null;
        return cached.lines;
    }
    let loading = null;
    // Reads the GC lines of the operating file once; resolves true when new lines were stored
    function load() {
        const online = onlineState();
        if (!online?.path) return Promise.resolve(false);
        const cached = readJson(sessionStorage, LINES_KEY);
        if (cached?.path === online.path && Array.isArray(cached.lines) && cached.v === LINES_VERSION && cached.sig === onlineSig()) return Promise.resolve(false);
        if (loading) return loading;
        loading = (async () => {
            try {
                const response = await fetch('/api/reforming/operating-data', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: online.path }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Could not read the operating data file.');
                // A row without its own Date/Time (GC values pasted under the export) is not an operating line (6.11.3)
                const gcLines = (data.rows || []).filter(row => String(row['Date/Time'] || '').trim()).map(row => ({ gc: row['GC Date/Time'] || '',
                    reactor: norm(row['Reactor (assigned)'] !== undefined && row['Reactor (assigned)'] !== '' ? row['Reactor (assigned)'] : row.Sampled_reactor),
                    source: row['Reactor source'] || '' }))
                    .filter(line => line.gc);
                sessionStorage.setItem(LINES_KEY, JSON.stringify({ path: online.path, sig: onlineSig(), v: LINES_VERSION, lines: gcLines }));
                return true;
            } catch (error) {
                console.warn('Reforming: GC lines not read from the operating data:', error);
                return false;
            } finally {
                loading = null;
            }
        })();
        return loading;
    }

    // Closest (sample, line) pairs first; Map sampleIndex -> lineIndex
    function pair(sampleTimes, lineTimes) {
        const pairs = [];
        lineTimes.forEach((gc, i) => sampleTimes.forEach((at, j) => {
            if (gc === null || at === null) return;
            const diff = at - gc;
            if (diff >= -BEFORE_MS && diff <= AFTER_MS) pairs.push({ i, j, gap: Math.abs(diff) });
        }));
        const used = new Set();
        const result = new Map();
        pairs.sort((a, b) => a.gap - b.gap).forEach(({ i, j }) => {
            if (used.has(i) || result.has(j)) return;
            used.add(i);
            result.set(j, i);
        });
        return result;
    }

    const doeValue = (row, label) => row[label] ?? row[Object.keys(row).find(key => key.replace(/\n/g, ' ').trim() === label)] ?? '';

    // Run Plan facts: active reactors, Feed SL ID, DOE rows, Feed Cut-In per block
    function plan() {
        const state = readJson(sessionStorage, 'runPlanDashboardState') || readJson(localStorage, 'runPlanDashboardState') || {};
        const info = {};
        (state.planData?.info || []).forEach(item => { info[String(item.parameter).trim().toLowerCase()] = item.value; });
        const doeRows = state.doeData?.rows || [];
        // Active reactors of the loading plan, else the reactors named in the DOE
        let active = (state.summary?.active_reactors || []).map(norm).filter(isReactor);
        if (!active.length) active = [...new Set(doeRows.map(row => norm(doeValue(row, 'Reactor ID'))).filter(isReactor))];
        return { info, active, doeRows, cutIns: blockCutIns(state, info, doeRows), feedId: String(info['feed sl id'] || '').trim().toUpperCase() };
    }

    // Feed Cut-In of every block, from the saved Run Plan (same rule as the server's single "Feed Cut-In": the pre-run
    // "Feed cut-in (date, time)" of the block, else the block's first DOE start). When the Plan sheet has a typed
    // "Feed Cut-In" (it then differs from the value derived for its block), that typed value applies to every block.
    function blockCutIns(state, info, doeRows) {
        const settings = state.doeData?.pretreatment?.settings?.['Feed cut-in (date, time)'] || {};
        const blocks = new Set([...Object.keys(settings), ...doeRows.map(row => String(doeValue(row, 'Block') || '').trim()).filter(Boolean)]);
        const cutIns = {};
        blocks.forEach(block => {
            let value = settings[block];
            if (value === undefined || value === null || value === '') {
                const first = doeRows.find(row => String(doeValue(row, 'Block') || '').trim() === block && doeValue(row, 'Start Date'));
                value = first ? doeValue(first, 'Start Date') : '';
            }
            if (value !== '' && value !== null && value !== undefined) cutIns[block] = value;
        });
        const single = time(info['feed cut-in']);
        if (single !== null && Object.keys(cutIns).length && !Object.values(cutIns).some(v => time(v) === single)) return {};
        return cutIns;
    }

    // Block of a reactor: from its DOE rows, else R1-R4 = Block-1, R5-R8 = Block-2
    function blockOf(reactor, doeRows) {
        if (!isReactor(reactor)) return '';
        const row = (doeRows || []).find(r => norm(doeValue(r, 'Reactor ID')) === reactor && String(doeValue(r, 'Block') || '').trim());
        if (row) return String(doeValue(row, 'Block')).trim();
        return Number(reactor.slice(1)) <= 4 ? 'Block-1' : 'Block-2';
    }

    // For each sample (objects with a date field): {reactor, block, bypass, feed, error}
    function assign(samples, dateOf) {
        const p = plan();
        const gcLines = lines();
        const pairs = gcLines ? pair(samples.map(s => time(dateOf(s))), gcLines.map(line => time(line.gc))) : null;
        // Last GC line of the operating data: samples after it (+60 min) wait for a newer export, they are not errors
        const lastGc = gcLines && gcLines.length ? Math.max(...gcLines.map(line => time(line.gc) ?? -Infinity)) : null;
        const fmt = ms => { const d = new Date(ms); const two = n => String(n).padStart(2, '0');
            return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`; };
        return samples.map((sample, index) => {
            const feed = !!p.feedId && String(sample.UID || '').toUpperCase().includes(p.feedId);
            if (feed) return { reactor: '', block: '', feed: true };
            if (gcLines) {
                const line = pairs.has(index) ? gcLines[pairs.get(index)] : null;
                if (!line) {
                    const at = time(dateOf(sample));
                    if (lastGc !== null && at !== null && at > lastGc + AFTER_MS) {
                        return { reactor: '', pending: true, error: `Waiting for operating data (the .txt ends ${fmt(lastGc)})` };
                    }
                    return { reactor: '', error: 'ERROR: no GC line of the operating data within -10…+60 min' };
                }
                if (line.reactor === 'R0') return { reactor: '', bypass: true };
                if (!isReactor(line.reactor)) return { reactor: '', error: 'ERROR: GC line without Sampled_reactor' };
                return { reactor: line.reactor, block: blockOf(line.reactor, p.doeRows) };
            }
            if (p.active.length === 1) return { reactor: p.active[0], block: blockOf(p.active[0], p.doeRows) };
            if (!p.active.length) return { reactor: 'R1', block: 'Block-1' };   // no reactor in the Run Plan at all: as before
            return { reactor: '', error: `ERROR: reactor unknown (${p.active.join(', ')} active) – load the operating data (.txt) on Online Analysis` };
        });
    }

    // Time zero of TOS for a block: the block's Feed Cut-In, else the Run Plan's single Feed Cut-In
    function cutInOf(block) {
        const p = plan();
        return time(p.cutIns[block]) ?? time(p.info['feed cut-in']);
    }

    // ---------------------------------------------------------------- Reforming "complete" raw data (6.10.3)
    // The Raw Data layout of ILS_Chemical Validation_Reforming.xlsx: one row per operating record of the .txt; a DHA sample
    // joins the record whose GC Date/Time is within -10..+60 min (closest pairs first, each used once); DHA samples
    // without a record are kept with blank operating data. Used by "Export Complete CSV" (Calculation, Reforming tab) and
    // the "Final Raw_Data" sheet of the Export Complete workbook, so both always hold the same rows.
    async function fetchOperating() {
        const online = onlineState();
        if (!online?.path) throw new Error('Load the operating data (.txt) on the Online Analysis page first.');
        const response = await fetch('/api/reforming/operating-data', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: online.path }),
        });
        let data;
        try { data = JSON.parse(await response.text()); } catch (error) {
            throw new Error('The dashboard server is running older code. Close the dashboard window and start run_dashboard.bat again, then retry.');
        }
        if (!response.ok) throw new Error(data.error || 'Could not read the operating data file.');
        return data;
    }
    // dhaRows: Reforming CARBON_TABULAR rows (Date + flat columns 'Paraffins C1' … 'Specific Gravity');
    // returns {top, units, opColumns, dataColumns, entries: [{op, dha, key}]} sorted by time
    function completeTable(operating, dhaRows, dataColumns) {
        // rows without their own Date/Time stay in the table but take no DHA sample (6.11.3)
        const opRows = (operating.rows || []).map(row => ({ op: row, gc: String(row['Date/Time'] || '').trim() ? time(row['GC Date/Time']) : null, dha: null }));
        const dha = dhaRows.map(row => ({ row, at: time(row.Date ?? row.DateTime), used: false }));
        pair(dha.map(d => d.at), opRows.map(o => o.gc)).forEach((i, j) => { opRows[i].dha = dha[j].row; dha[j].used = true; });
        const entries = [
            ...opRows.map(e => ({ op: e.op, dha: e.dha, key: e.dha ? time(e.dha.Date ?? e.dha.DateTime) : e.gc })),
            ...dha.filter(d => !d.used).map(d => ({ op: null, dha: d.row, key: d.at })),
        ].sort((a, b) => (a.key ?? Infinity) - (b.key ?? Infinity));
        // Two header rows: family / property name over its first column, then C1…C15 and units
        const top = [...operating.columns, 'DHA Date/Time'];
        const units = top.map(() => '');
        let lastFamily = null;
        dataColumns.forEach(key => {
            const match = key.match(/^(.*) (C\d+)$/);
            const family = match ? match[1] : null;
            top.push(match ? (family !== lastFamily ? family : '') : key);
            units.push(match ? match[2] : (['Carbon', 'Hydrogen'].includes(key) ? 'wt%' : ''));
            lastFamily = family;
        });
        return { top, units, opColumns: operating.columns, dataColumns, entries };
    }

    // ---------------------------------------------------------------- reactor calculation (6.11.0)
    // The "Reactor n (catalyst)" sheets of ILS_Chemical Validation_Reforming (Method 2), computed on the server
    // (backend/reforming/reactor_calc.py) for every reactor, one result per GC line. Cached per operating file, DHA set,
    // Run Plan and "yields from" setting; the Calculation page, Summary, Plots and Export Complete read the cache.
    const CALC_KEY = 'ils_reforming_calc';
    const CALC_OPTIONS_KEY = 'ils_reforming_calc_options';
    let calcMemo = null;
    let calcLoading = null;
    function calcOptions() {
        const saved = readJson(sessionStorage, CALC_OPTIONS_KEY) || {};
        const start = Number(saved.yield_start_h);
        return { yield_start_h: Number.isFinite(start) && start >= 0 ? start : 12 };
    }
    function setCalcOptions(options) {
        try { sessionStorage.setItem(CALC_OPTIONS_KEY, JSON.stringify({ ...calcOptions(), ...options })); } catch (e) { }
    }
    function calcInputs() {
        const online = onlineState();
        const offline = readJson(sessionStorage, 'ils_reforming_offline');
        const runPlan = readJson(sessionStorage, 'runPlanDashboardState') || readJson(localStorage, 'runPlanDashboardState') || {};
        const plan = { feedRows: runPlan.feedRows, feedTables: runPlan.feedTables, planData: runPlan.planData, doeData: runPlan.doeData };
        const options = calcOptions();
        const sig = JSON.stringify([CALC_VERSION, online?.path || '', onlineSig(), offline?.processed_at || '', (offline?.rows || []).length,
            JSON.stringify(plan).length, options.yield_start_h]);
        return { path: online?.path || '', samples: offline?.rows || [], plan, options, sig };
    }
    // Cached result for the current inputs, or null
    function calcCached() {
        const { sig } = calcInputs();
        if (calcMemo?.sig === sig) return calcMemo.result;
        const saved = readJson(sessionStorage, CALC_KEY);
        if (saved?.sig === sig) { calcMemo = saved; return saved.result; }
        return null;
    }
    // Runs the calculation when the inputs changed; resolves {result, changed} or {error}
    async function calc(force = false) {
        const inputs = calcInputs();
        if (!inputs.path) return { error: 'Load the operating data (.txt) on Analysis → Online Analysis.' };
        if (!inputs.samples.length) return { error: 'Process the Reforming DHA folder on Analysis → Offline Analysis.' };
        if (!force && calcCached()) return { result: calcCached(), changed: false };
        if (calcLoading) return calcLoading;
        calcLoading = (async () => {
            try {
                const response = await fetch('/api/reforming/reactor-calc', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: inputs.path, samples: inputs.samples, run_plan: inputs.plan, yield_start_h: inputs.options.yield_start_h }),
                });
                const data = await response.json();
                if (!response.ok) return { error: data.error || 'Reactor calculation failed.' };
                calcMemo = { sig: inputs.sig, result: data };
                try { sessionStorage.setItem(CALC_KEY, JSON.stringify(calcMemo)); } catch (e) { /* large runs: memory only */ }
                return { result: data, changed: true };
            } catch (error) {
                return { error: `Reactor calculation failed: ${error.message}` };
            } finally {
                calcLoading = null;
            }
        })();
        return calcLoading;
    }
    // Result line of a DHA sample (same pairing as the server), or null
    function lineOfSample(result, uid, dateTime) {
        return (result?.lines || []).find(line => line.dha_uid === uid && String(line.dha_date_time) === String(dateTime)) || null;
    }
    async function fetchOperatingTable() {
        const online = onlineState();
        if (!online?.path) throw new Error('Load the operating data (.txt) on the Online Analysis page first.');
        const response = await fetch('/api/reforming/operating-table', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: online.path }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not read the operating data file.');
        return data;
    }

    // Layout of the reactor sheet: [label, unit, key | {wt|wof|family_wt|family_wof: name}, section]
    const FAMILY_ORDER = ['Paraffins', 'Iso Paraffins', 'Naphthenes', 'Aromatics', 'Olefins', 'Unknowns'];
    const FAMILY_SHORT = { Paraffins: 'P', 'Iso Paraffins': 'iP', Naphthenes: 'N', Aromatics: 'A', Olefins: 'O', Unknowns: 'U' };
    const componentRows = (kind, unit) => FAMILY_ORDER.flatMap(f => Array.from({ length: 15 }, (_, i) =>
        [`C${i + 1} (${FAMILY_SHORT[f]})`, unit, { [kind]: `${f} C${i + 1}` }, kind]));
    const SHEET_ROWS = [
        ['Date', '--', 'date', 'performance'], ['Injection Time', '--', 'time', 'performance'],
        ['GC Date/Time', '--', 'gc_date_time', 'performance'], ['Condition', '--', 'condition', 'performance'],
        ['DHA sample', '--', 'dha_uid', 'performance'],
        ['Duration', 'hrs', 'duration_h', 'performance'], ['Run length', 'hr', 'run_length_h', 'performance'],
        ['Pressure', 'barg', 'pressure', 'performance'], ['Temperature', 'oC', 'temperature', 'performance'],
        ['LHSV', 'h-1', 'lhsv', 'performance'], ['H2/Naphtha', 'mol. Basis', 'h2_naphtha_mol', 'performance'],
        ['N2 (Rx effluent)', 'NLPH', 'n2_nlph', 'performance'], ['H2 (Rx effluent)', '% vol', 'h2_vol', 'performance'],
        ['N2 (Rx effluent)', '% vol', 'n2_vol', 'performance'], ['Naphtha (Rx effluent)', '% vol', 'naphtha_vol', 'performance'],
        ['Total', '% vol', 'total_vol', 'performance'], ['Mol. Weight', '--', 'mw', 'performance'],
        ['Carbon_Naphtha (Rx effluent)', 'wt%', 'carbon_naphtha', 'performance'],
        ['Hydrogen_Naphtha (Rx effluent)', 'wt%', 'hydrogen_naphtha', 'performance'],
        ['H2 (Rx effluent)', 'gms/hr', 'h2_out', 'performance'], ['Naphtha (Rx effluent)', 'gms/hr', 'naphtha_out', 'performance'],
        ['Naphtha (Feed Rate)', 'gms/hr', 'naphtha_feed', 'performance'],
        ['Naphtha/H2 (Rx effluent)', 'mass basis', 'naphtha_h2', 'performance'],
        ['Estimated RON', '--', 'ron', 'performance'], ['Specific Gravity (Online DHA)', '--', 'sg', 'performance'],
        ...componentRows('wt', 'wt%'), ['Total', 'wt%', 'total_wt', 'wt'],
        ...componentRows('wof', 'wof%'), ['Total', 'wof%', 'total_wof', 'wof'],
        ...FAMILY_ORDER.map(f => [f, 'wt%', { family_wt: f }, 'yields']), ['Total', 'wt%', 'family_wt_total', 'yields'],
        ['H2 generation', 'wof%', 'h2_generation', 'yields'], ['Gas Yield (C1-C4)', 'wof%', 'gas_yield', 'yields'],
        ['C5+ yield', 'wof%', 'c5_yield', 'yields'], ['Total', 'wof%', 'yield_total', 'yields'],
        ...FAMILY_ORDER.map(f => [f, 'wof%', { family_wof: f }, 'yields']), ['Total', 'wof%', 'family_wof_total', 'yields'],
        ['Total including H2 generation', 'wof%', 'total_incl_h2', 'yields'],
        ['Naphtha/H2 (Rx inlet)', 'mass  basis', 'naphtha_h2_inlet', 'yields'], ['H2/Naphtha (Rx inlet)', 'mole basis', 'h2_naphtha_inlet', 'yields'],
    ];
    function sheetValue(line, key) {
        if (typeof key === 'string') return line[key];
        const [kind, name] = Object.entries(key)[0];
        return line[kind]?.[name];
    }
    // Per-sample values added to the Reforming Component Summary (and so to Plots): [column, key]
    const SUMMARY_EXTRA = [
        ['Run length (h)', 'run_length_h'], ['Temperature (°C)', 'temperature'], ['Pressure (barg)', 'pressure'],
        ['LHSV (1/h)', 'lhsv'], ['H2/Naphtha (mol)', 'h2_naphtha_mol'], ['Naphtha/H2 (Rx effluent, mass)', 'naphtha_h2'],
        ['Naphtha/H2 (Rx inlet, mass)', 'naphtha_h2_inlet'], ['H2/Naphtha (Rx inlet, mol)', 'h2_naphtha_inlet'],
        ['Naphtha feed (g/h)', 'naphtha_feed'], ['H2 generation (wof%)', 'h2_generation'], ['Gas Yield C1-C4 (wof%)', 'gas_yield'],
        ['C5+ yield (wof%)', 'c5_yield'], ['Total yield (wof%)', 'yield_total'],
        ...FAMILY_ORDER.map(f => [`${f} (wof%)`, { family_wof: f }]),
        ['Total families (wof%)', 'family_wof_total'], ['Total incl. H2 generation (wof%)', 'total_incl_h2'],
    ];

    // 6.11.3: DOE ranges of a reactor; its last condition carries on after its planned End (the DOE is updated when a
    // condition changes, not for every new line), as the server's reactor calculation (reactor_calc.condition_at)
    function openLastConditions(ranges) {
        const last = {};
        ranges.forEach(range => { if (range.reactor && (!last[range.reactor] || range.start > last[range.reactor].start)) last[range.reactor] = range; });
        Object.values(last).forEach(range => { range.end = new Date(8640000000000000); range.carried = true; });
        return ranges;
    }
    return { LINES_KEY, norm, isReactor, time, lines, load, onlineSig, openLastConditions, pair, plan, blockOf, assign, cutInOf, doeValue, fetchOperating, completeTable,
             calc, calcCached, calcOptions, setCalcOptions, lineOfSample, fetchOperatingTable, SHEET_ROWS, SUMMARY_EXTRA, sheetValue, FAMILY_ORDER };
})();
