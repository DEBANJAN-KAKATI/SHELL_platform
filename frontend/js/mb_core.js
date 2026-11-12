// General_MB mass balance engine shared by Calculation → Mass Balance and Plots (6.9.10). Chemistry-independent:
// /api/mass-balance returns the gas in / out of every molecule per liquid sample (or DOE condition) and reactor and per
// GC injection; conversion, selectivity, yield, yield wof% on a carbon / mass / mole basis are computed here for any
// component and any reference reactant(s) the user chooses.
(() => {
    if (window.ILSMB) return;
    const MW_C = 12.011;
    const LIQUID = 'Liquid hydrocarbons';
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    const METRICS = { conv: 'Conversion', sel: 'Selectivity', yld: 'Yield', wof: 'Yield wof%', in: 'In', out: 'Out', net: 'Net (out − in)' };
    const BASIS = { carbon: { label: 'Carbon', unit: 'g C/h' }, mass: { label: 'Mass', unit: 'g/h' }, mole: { label: 'Mole', unit: 'mmol/h' } };
    const unitOf = (metric, basis) => ['in', 'out', 'net'].includes(metric) ? BASIS[basis].unit : metric === 'wof' ? 'wt% on feed' : '%';

    // Saved page choices (Mass Balance page): internal standard, GC line basis, reference(s), basis, components
    function settings() {
        const s = read('ils_mass_balance_state') || {};
        return { options: { is: '', basis: 'condition-skip', window_h: 2, ...(s.options || {}) },
                 comp: { selected: null, refs: null, metrics: ['in', 'out', 'conv', 'sel', 'yld'], basis: 'carbon', ...(s.comp || {}) } };
    }

    function inputs(options = settings().options) {
        const rp = read('runPlanDashboardState') || {};
        const online = read('dhaOnlineState') || {};
        const liquid = read('ils_liquid_state') || {};
        const info = rp.planData?.info || [];
        const t = rp.feedTables || {};
        const doeRows = (rp.doeData?.rows || []).map(row => Object.fromEntries(Object.entries(row).filter(([key]) =>
            /^(Reactor ID|Start Date|End Date|Condition No\.|Block)$/.test(key) || /^duration/i.test(key)
            || /^total gas/i.test(key) || /^gas flow/i.test(key))));
        const mw = [
            ...(t.mw?.rows || []).map(r => ({ component: r.component, mw: r.mw, carbon_no: r.carbon_no, source: 'Run Plan · Molecular weights' })),
            ...(t.gas?.rows || []).map(r => ({ component: r.component, mw: r.mw, carbon_no: r.carbon_no, source: 'Run Plan · Gas feed composition' })),
            ...(t.liquid?.rows || []).map(r => ({ component: r.component, mw: r.mw, carbon_no: r.carbon_no, source: 'Run Plan · Liquid components' })),
        ].filter(r => r.component && r.mw !== '' && r.mw != null);
        const roleRow = (rp.planData?.rows || []).find(r => String(r.parameter || '').trim().toLowerCase() === 'reactor role');
        const roles = roleRow ? Object.fromEntries(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'].map(k => [k.toUpperCase(), roleRow[k] || ''])) : {};
        const keep = key => key === 'DateTime' || key === 'Reactor' || key.startsWith('ESTD_') || key === '01i14FI01'
            || /^01i14FIC0\d$/.test(key) || /^02i2FIC0\d$/.test(key);
        const rows = (online.rows || []).map(row => Object.fromEntries(Object.entries(row).filter(([k]) => keep(k))));
        return {
            ready: { runPlan: Boolean(rp.doeData?.rows?.length), gas: rows.length > 0, liquid: (liquid.results || []).length > 0 },
            body: {
                rows, feed_gas: t.gas?.rows || [], doe_rows: doeRows, molecular_weights: mw,
                feed_cut_in: info.find(i => String(i.parameter).trim().toLowerCase() === 'feed cut-in')?.value || '',
                internal_standard: options.is || online.internalStandard || 'Argon',
                liquid: { feed_carbon: liquid.feedCarbon ?? '', results: liquid.results || [] }, reactor_roles: roles,
                options: { basis: options.basis === 'window' ? 'window' : 'condition', skip_first: options.basis !== 'condition-all',
                           window_h: Number(options.window_h) || 2 },
            },
        };
    }

    async function request(options) {
        const inp = inputs(options);
        if (!inp.ready.runPlan || !inp.ready.gas) return { data: null, ready: inp.ready };
        const res = await fetch('/api/mass-balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inp.body) });
        const data = await res.json();
        if (!res.ok) throw Error(data.error || 'Mass balance calculation failed');
        return { data, ready: inp.ready };
    }

    // Components of one result (gas molecules, the liquid as one entry, carbon-number lumps of the gas)
    function entries(r) {
        const out = {};
        (r.components || []).forEach(c => {
            out[c.component] = { kind: 'gas', nC: c.carbon_atoms, mw: c.mw, inM: c.in_g_h || 0, outM: c.out_g_h || 0, inC: c.c_in_g_h || 0, outC: c.c_out_g_h || 0 };
        });
        if (r.has_liquid) {
            out[LIQUID] = { kind: 'liquid', nC: null, mw: null, inM: r.liq_in_g_h, outM: isNum(r.hc_out_g_h) ? r.hc_out_g_h : null, inC: r.c_liq_in_g_h, outC: r.c_liq_out_g_h };
        }
        addLumps(out);
        return out;
    }
    function addLumps(out) {
        const gas = Object.entries(out).filter(([, e]) => e.kind === 'gas' && e.nC);
        const maxC = Math.max(0, ...gas.map(([, e]) => e.nC));
        const lump = (name, test) => {
            const members = gas.filter(([, e]) => test(e.nC));
            if (!members.length) return;
            const sum = (k) => members.reduce((a, [, e]) => a + (e[k] || 0), 0);
            out[name] = { kind: 'lump', members: members.map(([n]) => n), inM: sum('inM'), outM: sum('outM'), inC: sum('inC'), outC: sum('outC'),
                          inMol: members.reduce((a, [, e]) => a + (e.mw ? e.inM / e.mw * 1000 : 0), 0),
                          outMol: members.reduce((a, [, e]) => a + (e.mw ? e.outM / e.mw * 1000 : 0), 0) };
        };
        for (let n = 1; n <= maxC; n++) lump(`Gas C${n}`, c => c === n);
        for (let n = 2; n <= maxC; n++) lump(`Gas C${n}+`, c => c >= n);
    }
    // One GC injection as entries (gas only), from its in / out g/h and the component list
    function lineEntries(t, components) {
        const out = {};
        (components || []).forEach(c => {
            const inM = t.in?.[c.component] || 0, outM = t.out?.[c.component];
            if (!inM && !isNum(outM)) return;
            const k = c.mw ? MW_C * (c.carbon_atoms || 0) / c.mw : 0;
            out[c.component] = { kind: 'gas', nC: c.carbon_atoms, mw: c.mw, inM, outM: outM || 0, inC: inM * k, outC: (outM || 0) * k };
        });
        addLumps(out);
        return out;
    }

    function qty(e, side, basis) {
        if (!e) return null;
        if (basis === 'carbon') return side === 'in' ? e.inC : e.outC;
        if (basis === 'mass') return side === 'in' ? e.inM : e.outM;
        if (e.kind === 'lump') return side === 'in' ? e.inMol : e.outMol;
        if (!e.mw) return null;
        const g = side === 'in' ? e.inM : e.outM;
        return isNum(g) ? g / e.mw * 1000 : null;
    }

    // Every metric of one component; feed = total feed in g/h for yield wof%
    function metrics(ents, name, { basis = 'carbon', refs = [], feed = null } = {}) {
        const e = ents[name];
        const r = refs.filter(n => ents[n]);
        const inV = qty(e, 'in', basis), outV = qty(e, 'out', basis);
        const res = { in: inV, out: outV, net: isNum(inV) && isNum(outV) ? outV - inV : null, conv: null, sel: null, yld: null, wof: null, explain: {}, isRef: false };
        if (!e) return res;
        const u = BASIS[basis].unit;
        const f = (v) => isNum(v) ? (v === 0 ? '0' : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3)) : '–';
        if (isNum(inV) && inV > 0 && isNum(outV) && outV < inV) {       // only a consumed component has a conversion
            res.conv = 100 * (inV - outV) / inV;
            res.explain.conv = `(in ${f(inV)} − out ${f(outV)}) / in ${f(inV)} ${u}`;
        }
        const refIn = r.reduce((a, n) => a + (qty(ents[n], 'in', basis) || 0), 0);
        const converted = r.reduce((a, n) => a + (qty(ents[n], 'in', basis) || 0) - (qty(ents[n], 'out', basis) || 0), 0);
        res.isRef = r.includes(name) || (e.members || []).some(n => r.includes(n));
        if (!res.isRef && isNum(res.net) && r.length) {
            if (converted > 0) { res.sel = 100 * res.net / converted; res.explain.sel = `net ${f(res.net)} / ${r.join(' + ')} converted ${f(converted)} ${u}`; }
            if (refIn > 0) { res.yld = 100 * res.net / refIn; res.explain.yld = `net ${f(res.net)} / ${r.join(' + ')} fed ${f(refIn)} ${u}`; }
        }
        if (isNum(e.outM) && feed > 0) { res.wof = 100 * e.outM / feed; res.explain.wof = `out ${f(e.outM)} g/h / total feed ${f(feed)} g/h`; }
        return res;
    }
    function refConversion(ents, { basis = 'carbon', refs = [] } = {}) {
        const r = refs.filter(n => ents[n]);
        const inV = r.reduce((a, n) => a + (qty(ents[n], 'in', basis) || 0), 0);
        const outV = r.reduce((a, n) => a + (qty(ents[n], 'out', basis) || 0), 0);
        return inV > 0 ? 100 * (inV - outV) / inV : null;
    }
    const feedOf = (r) => (r.gas_in_g_h || 0) + (isNum(r.liq_in_g_h) ? r.liq_in_g_h : 0);

    // Reference reactant(s) and default component list
    function refsOf(data, comp) { return Array.isArray(comp?.refs) && comp.refs.length ? comp.refs : (data?.reactant ? [data.reactant] : []); }
    function universe(data) {
        const all = new Map();
        (data?.results || []).filter(r => r.components).forEach(r => Object.entries(entries(r)).forEach(([n, e]) => {
            const cur = all.get(n) || { name: n, kind: e.kind, nC: e.nC, fed: false, formed: false, c: 0 };
            if ((e.inC || 0) > 0 || (e.inM || 0) > 0) cur.fed = true;
            if ((e.outC || 0) > (e.inC || 0)) cur.formed = true;
            cur.c += Math.abs((e.outC || 0) - (e.inC || 0));
            all.set(n, cur);
        }));
        return [...all.values()];
    }
    function selectedOf(data, comp) {
        const u = universe(data), names = new Set(u.map(c => c.name)), refs = refsOf(data, comp);
        if (Array.isArray(comp?.selected)) return comp.selected.filter(n => names.has(n));
        const top = u.filter(c => c.kind === 'gas' && !refs.includes(c.name)).sort((a, b) => b.c - a.c).slice(0, 6).map(c => c.name);
        return [...refs, ...top, ...(names.has(LIQUID) ? [LIQUID] : [])].filter(n => names.has(n));
    }

    window.ILSMB = { MW_C, LIQUID, METRICS, BASIS, unitOf, isNum, settings, inputs, request, entries, lineEntries, qty, metrics,
                     refConversion, feedOf, refsOf, universe, selectedOf };
})();
