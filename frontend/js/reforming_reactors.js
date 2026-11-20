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
    // Cached GC lines [{gc, reactor}] of the loaded operating file, or null when they are not read (yet)
    function lines() {
        const cached = readJson(sessionStorage, LINES_KEY);
        if (!cached || !Array.isArray(cached.lines)) return null;
        const online = onlineState();
        if (online?.path && cached.path && online.path !== cached.path) return null;
        return cached.lines;
    }
    let loading = null;
    // Reads the GC lines of the operating file once; resolves true when new lines were stored
    function load() {
        const online = onlineState();
        if (!online?.path) return Promise.resolve(false);
        const cached = readJson(sessionStorage, LINES_KEY);
        if (cached?.path === online.path && Array.isArray(cached.lines)) return Promise.resolve(false);
        if (loading) return loading;
        loading = (async () => {
            try {
                const response = await fetch('/api/reforming/operating-data', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: online.path }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Could not read the operating data file.');
                const gcLines = (data.rows || []).map(row => ({ gc: row['GC Date/Time'] || '', reactor: norm(row.Sampled_reactor) }))
                    .filter(line => line.gc);
                sessionStorage.setItem(LINES_KEY, JSON.stringify({ path: online.path, lines: gcLines }));
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
        return samples.map((sample, index) => {
            const feed = !!p.feedId && String(sample.UID || '').toUpperCase().includes(p.feedId);
            if (feed) return { reactor: '', block: '', feed: true };
            if (gcLines) {
                const line = pairs.has(index) ? gcLines[pairs.get(index)] : null;
                if (!line) return { reactor: '', error: 'ERROR: no GC line of the operating data within -10…+60 min' };
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
        const opRows = (operating.rows || []).map(row => ({ op: row, gc: time(row['GC Date/Time']), dha: null }));
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

    return { LINES_KEY, norm, isReactor, time, lines, load, pair, plan, blockOf, assign, cutInOf, doeValue, fetchOperating, completeTable };
})();
