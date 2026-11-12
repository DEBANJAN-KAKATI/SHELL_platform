// Calculation → Mass Balance (General_MB, 6.9.9): a chemistry-independent mass balance table, built like the
// Isomerization tables. The backend (/api/mass-balance) returns, per liquid sample (or DOE condition) and reactor, the
// gas in / out of every molecule (bypass feed scaled with the internal standard, reactor product), the liquid feed and
// product and the balances. Everything chemistry-specific is chosen on the page: which components to show, which are the
// reference reactant(s), the metrics (in, out, net, conversion, selectivity, yield, yield wof%) and the basis
// (carbon, mass, mole). Nothing assumes a particular reaction.
(() => {
    const KEY = 'ils_mass_balance_state';
    const $ = (s) => document.querySelector(s);
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const fmt = (v, d = 1) => isNum(v) ? v.toFixed(d) : '–';
    const fmtG = (v) => isNum(v) ? (v === 0 ? '0' : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3)) : '–';
    const REACTOR_COLORS = { R1: '#2a78d6', R2: '#eb6834', R3: '#1baf7a', R4: '#eda100', R5: '#e87ba4', R6: '#008300', R7: '#6250d6', R8: '#e34948' };
    const MW_C = 12.011;
    const LIQUID = 'Liquid hydrocarbons';

    const METRICS = {
        in: { label: 'In', unit: 'flow' }, out: { label: 'Out', unit: 'flow' }, net: { label: 'Net (out − in)', unit: 'flow' },
        conv: { label: 'Conversion', unit: '%' }, sel: { label: 'Selectivity', unit: '%' }, yld: { label: 'Yield', unit: '%' },
        wof: { label: 'Yield wof%', unit: 'wt% on feed' },
    };
    const BASIS = { carbon: { label: 'Carbon', unit: 'g C/h' }, mass: { label: 'Mass', unit: 'g/h' }, mole: { label: 'Mole', unit: 'mmol/h' } };
    const DEFAULT_METRICS = ['in', 'out', 'conv', 'sel', 'yld'];

    const state = { data: null, selected: '', reactors: null, tab: 'components',
                    options: { is: '', basis: 'condition-skip', window_h: 2 },
                    comp: { selected: null, refs: null, metrics: DEFAULT_METRICS, basis: 'carbon', layout: 'samples' } };

    function load() {
        try {
            const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
            if (!s) return;
            Object.assign(state.options, s.options || {});
            if (s.comp) Object.assign(state.comp, s.comp);
            ['selected', 'tab'].forEach(k => { if (s[k]) state[k] = s[k]; });
            if (!['components', 'balances', 'summary', 'injections'].includes(state.tab)) state.tab = 'components';
            if (Array.isArray(s.reactors)) state.reactors = s.reactors;
        } catch (e) { sessionStorage.removeItem(KEY); }
    }
    function save() {
        try {
            sessionStorage.setItem(KEY, JSON.stringify({ options: state.options, comp: state.comp, selected: state.selected,
                reactors: state.reactors, tab: state.tab, summary: summaryRows(), components: componentSampleRows() }));
        } catch (e) {}
    }
    const read = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
    function error(msg = '') { const el = $('#mbError'); el.textContent = msg; el.classList.toggle('show', Boolean(msg)); }

    // ------------------------------------------------------------ inputs from the other pages
    function inputs() {
        const rp = read('runPlanDashboardState') || {};
        const online = read('dhaOnlineState') || read('dhaOnlineState') || {};
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
        return { rp, rows, liquid, online, body: {
            rows, feed_gas: t.gas?.rows || [], doe_rows: doeRows, molecular_weights: mw,
            feed_cut_in: info.find(i => String(i.parameter).trim().toLowerCase() === 'feed cut-in')?.value || '',
            internal_standard: state.options.is || online.internalStandard || 'Argon',
            liquid: { feed_carbon: liquid.feedCarbon ?? '', results: liquid.results || [] },
            reactor_roles: roles,
            options: { basis: state.options.basis === 'window' ? 'window' : 'condition',
                       skip_first: state.options.basis !== 'condition-all', window_h: Number(state.options.window_h) || 2 },
        } };
    }

    function readiness(inp) {
        const items = [
            ['Run Plan', Boolean(inp.rp?.doeData?.rows?.length), '/frontend/run_plan.html', 'load the Run Plan'],
            ['Online gas data', inp.rows.length > 0, '/frontend/online_analysis.html', 'import the export (Online Analysis → Gas)'],
            ['Liquid samples', (inp.liquid.results || []).length > 0, '/frontend/online_analysis.html', 'enter samples (Online Analysis → Liquid)'],
        ];
        $('#mbReady').innerHTML = items.map(([label, ok, href, todo]) =>
            `<a class="mb-ready-item ${ok ? 'ok' : 'todo'}" href="${href}"><span>${ok ? '✓' : '○'}</span> ${label}${ok ? '' : ` <small>— ${todo}</small>`}</a>`).join('');
        return items[0][1] && items[1][1];
    }

    let ticket = 0;
    async function calculate() {
        const inp = inputs();
        if (!window.ILSProcess?.isGeneralMB?.()) {
            error('The Mass Balance belongs to the General_MB process: choose General_MB on the Run Plan page.');
        }
        if (!readiness(inp)) { state.data = null; render(); return; }
        const my = ++ticket;
        $('#mbStatus').textContent = 'Calculating...';
        try {
            const res = await fetch('/api/mass-balance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inp.body) });
            const data = await res.json();
            if (!res.ok) throw Error(data.error || 'Calculation failed');
            if (my !== ticket) return;
            state.data = data;
            if (window.ILSProcess?.isGeneralMB?.()) error();
        } catch (e) {
            if (my !== ticket) return;
            state.data = null;
            error(`Mass balance failed: ${e.message}`);
        } finally {
            if (my === ticket) $('#mbStatus').textContent = 'Ready';
        }
        render();
    }

    // ------------------------------------------------------------ selection
    // A liquid sample groups every reactor sampled together (blocks can be in different conditions); without a liquid
    // sample the view is one DOE condition.
    const viewKey = (r) => r.sample === 'gas only' ? `gas only|${r.condition}` : r.sample;
    function views() {
        const out = new Map();
        (state.data?.results || []).forEach(r => {
            const k = viewKey(r);
            if (!out.has(k)) out.set(k, { key: k, sample: r.sample, condition: r.condition, rows: [] });
            out.get(k).rows.push(r);
        });
        return [...out.values()];
    }
    function currentView() {
        const list = views();
        return list.find(v => v.key === state.selected) || list[0] || null;
    }
    function shownRows(view) {
        if (!view) return [];
        return view.rows.filter(r => !state.reactors || state.reactors.includes(r.reactor));
    }

    // ------------------------------------------------------------ the component engine (chemistry-independent)
    const meta = () => Object.fromEntries((state.data?.components || []).map(c => [c.component, c]));

    // Gas components of a result row + the liquid as one entry + carbon-number lumps, each with in / out per basis
    function entries(r) {
        const out = {};
        const m = meta();
        (r.components || []).forEach(c => {
            out[c.component] = { kind: 'gas', nC: c.carbon_atoms, mw: c.mw, inM: c.in_g_h || 0, outM: c.out_g_h || 0,
                                 inC: c.c_in_g_h || 0, outC: c.c_out_g_h || 0 };
        });
        if (r.has_liquid) {
            out[LIQUID] = { kind: 'liquid', nC: null, mw: null, inM: r.liq_in_g_h, outM: isNum(r.hc_out_g_h) ? r.hc_out_g_h : null,
                            inC: r.c_liq_in_g_h, outC: r.c_liq_out_g_h };
        }
        // Lumps by carbon number (gas): "Gas C2", "Gas C≥4" …
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
        void m;
        return out;
    }

    function qty(e, side, basis) {
        if (!e) return null;
        if (basis === 'carbon') return side === 'in' ? e.inC : e.outC;
        if (basis === 'mass') return side === 'in' ? e.inM : e.outM;
        if (e.kind === 'lump') return side === 'in' ? e.inMol : e.outMol;
        if (!e.mw) return null;                                           // liquid: no molar mass → no mole basis
        const g = side === 'in' ? e.inM : e.outM;
        return isNum(g) ? g / e.mw * 1000 : null;
    }

    // All metrics of one component in one result row. Reference reactants define selectivity and yield.
    function metricsOf(r, name, ents = entries(r)) {
        const b = state.comp.basis;
        const e = ents[name];
        const refs = refList().filter(n => ents[n]);
        const inV = qty(e, 'in', b), outV = qty(e, 'out', b);
        const res = { in: inV, out: outV, net: isNum(inV) && isNum(outV) ? outV - inV : null, conv: null, sel: null, yld: null, wof: null, explain: {} };
        if (!e) return res;
        // Conversion only for a component that is consumed (out < in); a formed component has none
        if (isNum(inV) && inV > 0 && isNum(outV) && outV < inV) {
            res.conv = 100 * (inV - outV) / inV;
            res.explain.conv = `(${fmtG(inV)} − ${fmtG(outV)}) / ${fmtG(inV)} ${BASIS[b].unit}`;
        }
        const refIn = refs.reduce((a, n) => a + (qty(ents[n], 'in', b) || 0), 0);
        const converted = refs.reduce((a, n) => a + (qty(ents[n], 'in', b) || 0) - (qty(ents[n], 'out', b) || 0), 0);
        const isRef = refs.includes(name) || (e.members || []).some(n => refs.includes(n));
        if (!isRef && isNum(res.net) && refs.length) {
            if (converted > 0) {
                res.sel = 100 * res.net / converted;
                res.explain.sel = `net ${name} ${fmtG(res.net)} / converted ${refs.join(' + ')} ${fmtG(converted)} ${BASIS[b].unit}`;
            }
            if (refIn > 0) {
                res.yld = 100 * res.net / refIn;
                res.explain.yld = `net ${name} ${fmtG(res.net)} / fed ${refs.join(' + ')} ${fmtG(refIn)} ${BASIS[b].unit}`;
            }
        }
        const feed = (r.gas_in_g_h || 0) + (isNum(r.liq_in_g_h) ? r.liq_in_g_h : 0);
        if (isNum(e.outM) && feed > 0) {
            res.wof = 100 * e.outM / feed;
            res.explain.wof = `${name} out ${fmtG(e.outM)} g/h / total feed ${fmtG(feed)} g/h (gas w/o IS + liquid)`;
        }
        res.isRef = isRef;
        return res;
    }

    // Components available in the current results, grouped like the isomerization component filter
    function universe() {
        const all = new Map();
        (state.data?.results || []).forEach(r => Object.entries(entries(r)).forEach(([n, e]) => {
            const cur = all.get(n) || { name: n, kind: e.kind, nC: e.nC, fed: false, formed: false, c: 0 };
            if ((e.inC || 0) > 0 || (e.inM || 0) > 0) cur.fed = true;
            if ((e.outC || 0) > (e.inC || 0)) cur.formed = true;
            cur.c += Math.abs((e.outC || 0) - (e.inC || 0));
            all.set(n, cur);
        }));
        return [...all.values()];
    }
    function refList() {
        if (Array.isArray(state.comp.refs) && state.comp.refs.length) return state.comp.refs;
        return state.data?.reactant ? [state.data.reactant] : [];
    }
    function selectedList() {
        const u = universe();
        const names = new Set(u.map(c => c.name));
        if (Array.isArray(state.comp.selected)) return state.comp.selected.filter(n => names.has(n));
        // Default: the reference reactant(s), the six molecules with the largest carbon change, the liquid
        const top = u.filter(c => c.kind === 'gas' && !refList().includes(c.name)).sort((a, b) => b.c - a.c).slice(0, 6).map(c => c.name);
        return [...refList(), ...top, ...(names.has(LIQUID) ? [LIQUID] : [])].filter(n => names.has(n));
    }
    const firstProduct = () => selectedList().find(n => !refList().includes(n) && n !== LIQUID);

    function renderControls() {
        const list = views();
        const view = currentView();
        state.selected = view?.key || '';
        $('#mbSample').innerHTML = list.map(v => {
            const conds = [...new Set(v.rows.map(r => r.condition))].join(', ');
            const label = v.sample === 'gas only' ? `${v.condition} · gas only (no liquid sample)` : `${v.sample} · ${conds}`;
            return `<option value="${esc(v.key)}"${v.key === state.selected ? ' selected' : ''}>${esc(label)}</option>`;
        }).join('') || '<option>—</option>';
        const reactors = view ? view.rows.map(r => r.reactor) : [];
        $('#mbReactorChips').innerHTML = reactors.map(r => {
            const on = !state.reactors || state.reactors.includes(r);
            return `<button type="button" class="mb-chip${on ? ' on' : ''}" data-reactor="${r}" aria-pressed="${on}"><i style="background:${REACTOR_COLORS[r]}"></i>${r}</button>`;
        }).join('');
        $('#mbReactorChips').querySelectorAll('[data-reactor]').forEach(btn => btn.onclick = () => {
            let cur = state.reactors ? state.reactors.filter(r => reactors.includes(r)) : [...reactors];
            cur = cur.includes(btn.dataset.reactor) ? cur.filter(r => r !== btn.dataset.reactor) : [...cur, btn.dataset.reactor];
            state.reactors = cur.length === reactors.length ? null : (cur.length ? cur : null);
            save(); render();
        });
        $('#mbIs').value = state.options.is || state.data?.internal_standard || 'Argon';
        $('#mbBasis').value = state.options.basis;
        $('#mbWindow').value = state.options.window_h;
        $('#mbWindowWrap').hidden = state.options.basis !== 'window';
    }

    // ------------------------------------------------------------ reactor score cards
    const STATUS = { good: ['✓', 'Good', 'within ±5 %'], warning: ['!', 'Check', '5–10 % off'], serious: ['✕', 'Off', 'more than 10 % off'] };
    function balanceStatus(v) {
        if (!isNum(v)) return null;
        const d = Math.abs(v - 100);
        return d <= 5 ? 'good' : d <= 10 ? 'warning' : 'serious';
    }
    function kpi(label, value, explainKey, row, unit = '%') {
        const err = typeof value === 'string' && value.startsWith('ERROR');
        const missing = value === null || value === undefined;
        return `<button type="button" class="mb-kpi${err || missing ? ' err' : ''}" data-explain="${esc(row.reactor)}|${esc(explainKey)}" title="${esc(err ? value : 'Show how it is calculated')}">`
            + `<span>${esc(label)}</span><b>${err || missing ? '—' : fmt(value, 1)}${err || missing ? '' : `<small>${unit}</small>`}</b>`
            + (err ? `<em>${esc(value.replace(/^ERROR:\s*/, '').replace(/ \(Online Analysis → Liquid\)/, ''))}</em>` : '') + '</button>';
    }
    function card(r) {
        const cb = r.c_balance_pct, cbNum = isNum(cb), st = balanceStatus(cbNum ? cb : null);
        const head = `<div class="mb-card-head"><i style="background:${REACTOR_COLORS[r.reactor]}"></i><b>${r.reactor}</b>`
            + `<span>${esc(r.role || '')}${r.role ? ' · ' : ''}${esc(r.condition)}</span>`
            + `<small>TOS ${fmt(r.tos_h, 1)} h · ${r.lines ?? 0} GC lines</small></div>`;
        if (r.errors?.length && !isNum(r.gas_c_balance_pct)) return `<article class="mb-card">${head}<div class="mb-card-err">${esc(r.errors.join(' · '))}</div></article>`;
        const hero = cbNum
            ? `<button type="button" class="mb-hero-num ${st}" data-explain="${r.reactor}|c_balance_pct"><span>Carbon balance</span><b>${fmt(cb, 1)}<small>%</small></b>`
              + `<em class="mb-badge ${st}">${STATUS[st][0]} ${STATUS[st][1]} <small>${STATUS[st][2]}</small></em></button>`
            : `<div class="mb-hero-num missing"><span>Carbon balance</span><b>—</b><em class="mb-badge todo">Needs liquid: ${esc(String(cb).replace(/^ERROR:\s*/, ''))}</em>`
              + `<a class="mb-link" href="/frontend/online_analysis.html">Open Liquid tab →</a></div>`;
        const split = isNum(r.c_out_liquid_share_pct)
            ? `<div class="mb-split"><span class="gas" style="width:${r.c_out_gas_share_pct}%"></span><span class="liq" style="width:${r.c_out_liquid_share_pct}%"></span></div>`
              + `<div class="mb-split-legend"><span><i class="gas"></i>Gas ${fmtG(r.c_gas_out_g_h)} g C/h</span><span><i class="liq"></i>Liquid ${fmtG(r.c_liq_out_g_h)} g C/h</span></div>`
            : `<div class="mb-split-legend"><span><i class="gas"></i>C in gas product ${fmtG(r.c_gas_out_g_h)} g C/h</span></div>`;
        const ents = entries(r);
        const refs = refList();
        const refName = refs.join(' + ') || 'reactant';
        const p = firstProduct();
        const pm = p ? metricsOf(r, p, ents) : null;
        const conv = refs.length === 1 ? metricsOf(r, refs[0], ents).conv : refConversion(r, ents);
        return `<article class="mb-card">${head}${hero}${split}<div class="mb-kpis">`
            + kpi(`${refName} conversion`, conv, `m:conv:${refs[0] || ''}`, r)
            + kpi(`${p || 'Product'} selectivity`, pm?.sel ?? null, `m:sel:${p || ''}`, r)
            + kpi(`${p || 'Product'} yield`, pm?.yld ?? null, `m:yld:${p || ''}`, r)
            + kpi('Mass balance', r.mass_balance_pct, 'mass_balance_pct', r)
            + kpi('Gas-phase C balance', r.gas_c_balance_pct, 'gas_c_balance_pct', r)
            + kpi('C recovered in liquid', r.c_out_liquid_share_pct, 'c_out_liquid_share_pct', r)
            + '</div></article>';
    }
    function refConversion(r, ents) {
        const b = state.comp.basis;
        const refs = refList().filter(n => ents[n]);
        const inV = refs.reduce((a, n) => a + (qty(ents[n], 'in', b) || 0), 0);
        const outV = refs.reduce((a, n) => a + (qty(ents[n], 'out', b) || 0), 0);
        return inV > 0 ? 100 * (inV - outV) / inV : null;
    }
    function renderCards(view) {
        const rows = shownRows(view);
        $('#mbCards').innerHTML = rows.length ? rows.map(card).join('') : '<div class="mb-empty">No results yet: the checklist above shows what is missing.</div>';
        const p = firstProduct();
        $('#mbCardNote').textContent = `Conversion of ${refList().join(' + ') || '—'} (reference) · selectivity and yield of ${p || '—'} (first selected product) · ${BASIS[state.comp.basis].label.toLowerCase()} basis. Change them in the Components table below.`;
    }

    // ------------------------------------------------------------ explain popover
    const EXPLAIN_TEXT = {
        c_balance_pct: 'Carbon balance = (C gas product + C liquid product) / (C gas feed + C liquid feed) × 100',
        gas_c_balance_pct: 'Gas-phase carbon balance = C gas product / C gas feed × 100',
        mass_balance_pct: 'Mass balance closure = (gas out w/o IS + HC product + aqueous) / (gas in w/o IS + liquid feed) × 100',
        c_out_liquid_share_pct: 'Share of the recovered carbon found in the liquid product = C liquid / (C gas + C liquid) × 100',
        conv: 'Conversion = (in − out) / in × 100',
        sel: 'Selectivity = net formed (out − in) / reference reactant(s) converted × 100',
        yld: 'Yield = net formed (out − in) / reference reactant(s) fed × 100  (= conversion × selectivity)',
        wof: 'Yield wof% = component out / total feed × 100 (mass, as the Isomerization yield table)',
    };
    function explain(target) {
        const [reactor, key] = target.dataset.explain.split('|');
        const r = (state.data?.results || []).find(x => x.reactor === reactor && (target.dataset.row ? viewKey(x) + x.reactor === target.dataset.row : shownRows(currentView()).includes(x)));
        if (!r) return;
        let text, value, formula = '';
        if (key.startsWith('m:')) {
            const [, metric, name] = key.split(':');
            const m = metric === 'conv' && refList().length > 1 && !name ? null : metricsOf(r, name);
            text = `${name} · ${EXPLAIN_TEXT[metric]} (${BASIS[state.comp.basis].label.toLowerCase()} basis${metric === 'sel' || metric === 'yld' ? `, reference: ${refList().join(' + ')}` : ''})`;
            value = m?.[metric]; formula = m?.explain?.[metric] || '';
        } else {
            text = EXPLAIN_TEXT[key] || key; value = r[key]; formula = r.explain?.[key] || '';
        }
        const box = $('#mbExplain');
        box.innerHTML = `<button type="button" class="mb-explain-close" aria-label="Close">×</button><b>${esc(reactor)} · ${esc(r.sample)} · ${esc(r.condition)}</b>`
            + `<p>${esc(text)}</p>` + (formula ? `<code>${esc(formula)}</code>` : '')
            + `<p class="mb-explain-value">= ${typeof value === 'string' ? esc(value) : isNum(value) ? `${fmt(value, 2)} %` : 'not defined (nothing fed / nothing converted)'}</p>`
            + `<small>GC lines: ${r.lines ?? 0} (${esc(r.first_line || '')} → ${esc(r.last_line || '')}), ${r.line_basis === 'window' ? 'around the sample' : 'whole condition'}</small>`;
        box.hidden = false;
        const rect = target.getBoundingClientRect();
        box.style.top = `${window.scrollY + rect.bottom + 8}px`;
        box.style.left = `${Math.max(12, Math.min(window.innerWidth - 440, window.scrollX + rect.left))}px`;
        box.querySelector('.mb-explain-close').onclick = () => { box.hidden = true; };
    }
    document.addEventListener('click', (e) => {
        const t = e.target.closest('[data-explain]');
        if (t) { explain(t); return; }
        if (!e.target.closest('#mbExplain')) $('#mbExplain').hidden = true;
        if (!e.target.closest('.mb-pick')) document.querySelectorAll('.mb-pick.open').forEach(p => p.classList.remove('open'));
    });

    // ------------------------------------------------------------ Components tab: pickers
    function pickerHtml(id, label, items, chosen, opts = {}) {
        const groups = {};
        items.forEach(it => { (groups[it.group] = groups[it.group] || []).push(it); });
        return `<div class="mb-pick" id="${id}"><button type="button" class="mb-pick-btn">${esc(label)} <b>${chosen.length}</b> <span aria-hidden="true">▾</span></button>`
            + `<div class="mb-pick-menu"><input class="input mb-pick-search" type="search" placeholder="Search">`
            + `<div class="mb-pick-actions">${opts.actions || ''}</div><div class="mb-pick-list">`
            + Object.entries(groups).map(([g, list]) => `<div class="mb-pick-group">${esc(g)}</div>` + list.map(it =>
                `<label data-name="${esc(it.name.toLowerCase())}"><input type="checkbox" value="${esc(it.name)}"${chosen.includes(it.name) ? ' checked' : ''}>`
                + `<span>${esc(it.name)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</label>`).join('')).join('')
            + '</div></div></div>';
    }
    function bindPicker(id, onChange, actions = {}) {
        const el = document.getElementById(id);
        if (!el) return;
        el.querySelector('.mb-pick-btn').onclick = (e) => { e.stopPropagation(); const open = el.classList.contains('open');
            document.querySelectorAll('.mb-pick.open').forEach(p => p.classList.remove('open')); el.classList.toggle('open', !open);
            if (!open) el.querySelector('.mb-pick-search').focus(); };
        el.querySelector('.mb-pick-search').oninput = (e) => {
            const q = e.target.value.toLowerCase();
            el.querySelectorAll('label[data-name]').forEach(l => { l.hidden = !l.dataset.name.includes(q); });
        };
        el.querySelectorAll('input[type=checkbox]').forEach(cb => cb.onchange = () =>
            onChange([...el.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value), true));
        Object.entries(actions).forEach(([act, fn]) => { const b = el.querySelector(`[data-act="${act}"]`); if (b) b.onclick = () => fn(); });
    }

    function componentItems() {
        const u = universe();
        const refs = refList();
        const group = (c) => c.kind === 'liquid' ? 'Liquid' : c.kind === 'lump' ? 'Lumps by carbon number (gas)' : refs.includes(c.name) ? 'Reference reactant(s)'
            : c.fed && !c.formed ? 'In the feed' : c.formed ? 'Formed' : 'Other';
        const order = ['Reference reactant(s)', 'In the feed', 'Formed', 'Other', 'Liquid', 'Lumps by carbon number (gas)'];
        return u.map(c => ({ name: c.name, group: group(c), hint: c.kind === 'gas' ? `C${c.nC ?? '?'}` : '' }))
            .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.group.startsWith('Lumps') ? 0 : a.name.localeCompare(b.name)));
    }

    function renderComponentControls() {
        const items = componentItems();
        const chosen = selectedList();
        const fedItems = universe().filter(c => c.fed && c.kind !== 'lump').map(c => ({ name: c.name, group: c.kind === 'liquid' ? 'Liquid' : 'In the feed',
            hint: c.kind === 'gas' ? `C${c.nC ?? '?'}` : '' }));
        $('#mbCompControls').innerHTML =
            `<div class="mb-ctl"><span>Components</span>${pickerHtml('mbPickComp', 'Components', items, chosen,
                { actions: '<button type="button" class="filter-link" data-act="all">All</button><button type="button" class="filter-link" data-act="none">None</button><button type="button" class="filter-link" data-act="default">Default</button>' })}</div>`
            + `<div class="mb-ctl"><span>Reference reactant(s) <i title="Selectivity and yield are relative to the reactant(s) converted / fed">ⓘ</i></span>${pickerHtml('mbPickRef', 'Reference', fedItems, refList())}</div>`
            + `<div class="mb-ctl"><span>Show</span><div class="mb-seg" id="mbMetrics">${Object.entries(METRICS).map(([k, m]) =>
                `<button type="button" data-metric="${k}" class="${state.comp.metrics.includes(k) ? 'active' : ''}">${m.label}</button>`).join('')}</div></div>`
            + `<div class="mb-ctl"><span>Basis</span><div class="mb-seg" id="mbBasisSeg">${Object.entries(BASIS).map(([k, bs]) =>
                `<button type="button" data-basis="${k}" class="${state.comp.basis === k ? 'active' : ''}">${bs.label}</button>`).join('')}</div></div>`
            + `<div class="mb-ctl"><span>Rows</span><div class="mb-seg" id="mbLayoutSeg">`
            + `<button type="button" data-layout="samples" class="${state.comp.layout === 'samples' ? 'active' : ''}">Samples × reactors</button>`
            + `<button type="button" data-layout="components" class="${state.comp.layout === 'components' ? 'active' : ''}">Components (this sample)</button></div></div>`;
        bindPicker('mbPickComp', (list) => { state.comp.selected = list; save(); renderComponentTable(); renderCards(currentView()); updatePickCount('mbPickComp', list.length); }, {
            all: () => { state.comp.selected = items.map(i => i.name); save(); renderPane(); renderCards(currentView()); },
            none: () => { state.comp.selected = []; save(); renderPane(); renderCards(currentView()); },
            default: () => { state.comp.selected = null; save(); renderPane(); renderCards(currentView()); },
        });
        bindPicker('mbPickRef', (list) => { state.comp.refs = list.length ? list : null; save(); renderComponentTable(); renderCards(currentView()); updatePickCount('mbPickRef', list.length); });
        $('#mbMetrics').querySelectorAll('[data-metric]').forEach(b => b.onclick = () => {
            const k = b.dataset.metric;
            const cur = state.comp.metrics.includes(k) ? state.comp.metrics.filter(x => x !== k) : [...state.comp.metrics, k];
            state.comp.metrics = Object.keys(METRICS).filter(x => cur.includes(x));
            save(); renderComponentControls(); renderComponentTable();
        });
        $('#mbBasisSeg').querySelectorAll('[data-basis]').forEach(b => b.onclick = () => { state.comp.basis = b.dataset.basis; save(); renderComponentControls(); renderComponentTable(); renderCards(currentView()); });
        $('#mbLayoutSeg').querySelectorAll('[data-layout]').forEach(b => b.onclick = () => { state.comp.layout = b.dataset.layout; save(); renderComponentControls(); renderComponentTable(); });
    }
    function updatePickCount(id, n) { const b = document.querySelector(`#${id} .mb-pick-btn b`); if (b) b.textContent = n; }

    // ------------------------------------------------------------ Components tab: table
    const unitOf = (k) => METRICS[k].unit === 'flow' ? BASIS[state.comp.basis].unit : METRICS[k].unit;
    function metricCell(r, name, k, m) {
        const v = m[k];
        if (k === 'sel' || k === 'yld') { if (m.isRef) return '<td class="ref" title="reference reactant">ref.</td>'; }
        if (!isNum(v)) return `<td class="na" title="${k === 'conv' ? 'not consumed (not in the feed, or formed)' : k === 'sel' ? 'nothing converted / no reference' : ''}">–</td>`;
        const pct = ['conv', 'sel', 'yld', 'wof'].includes(k);
        const cls = k === 'net' ? (v > 0 ? 'up' : v < 0 ? 'down' : '') : '';
        const click = pct ? ` data-explain="${r.reactor}|m:${k}:${esc(name)}" data-row="${esc(viewKey(r) + r.reactor)}"` : '';
        return `<td class="${cls}${pct ? ' click' : ''}"${click}>${pct ? v.toFixed(2) : (k === 'net' && v > 0 ? '+' : '') + fmtG(v)}</td>`;
    }
    function resultRowsShown() {
        return (state.data?.results || []).filter(r => r.components && (!state.reactors || state.reactors.includes(r.reactor)));
    }
    function renderComponentTable() {
        const names = selectedList();
        const metrics = state.comp.metrics;
        const table = $('#mbCompTable');
        if (!names.length || !metrics.length) { table.innerHTML = '<tbody><tr><td class="mb-empty-cell">Choose at least one component and one metric.</td></tr></tbody>'; return; }
        if (state.comp.layout === 'samples') {
            const rows = resultRowsShown();
            table.innerHTML = `<thead><tr class="mb-group-row"><th colspan="3" class="grp sticky-a">Sample</th>${names.map(n => `<th colspan="${metrics.length}" class="grp">${esc(n)}${refList().includes(n) ? ' <small>ref.</small>' : ''}</th>`).join('')}</tr>`
                + `<tr><th class="txt sticky-a">Sample</th><th class="txt sticky-b">Reactor</th><th class="txt sticky-c">Condition</th>${names.map(() => metrics.map(k => `<th>${METRICS[k].label}<br><small>${unitOf(k)}</small></th>`).join('')).join('')}</tr></thead><tbody>`
                + rows.map(r => {
                    const ents = entries(r);
                    return `<tr class="${viewKey(r) === state.selected ? 'sel' : ''}"><td class="txt sticky-a">${esc(r.sample)}</td><td class="txt sticky-b"><i class="mb-dot" style="background:${REACTOR_COLORS[r.reactor]}"></i>${r.reactor}</td><td class="txt sticky-c">${esc(r.condition)}</td>`
                        + names.map(n => { const m = metricsOf(r, n, ents); return metrics.map(k => metricCell(r, n, k, m)).join(''); }).join('') + '</tr>';
                }).join('') + '</tbody>';
        } else {
            const rows = shownRows(currentView()).filter(r => r.components);
            table.innerHTML = `<thead><tr class="mb-group-row"><th class="grp sticky-a">Component</th>${rows.map(r => `<th colspan="${metrics.length}" class="grp"><i class="mb-dot" style="background:${REACTOR_COLORS[r.reactor]}"></i>${r.reactor} · ${esc(r.condition)}</th>`).join('')}</tr>`
                + `<tr><th class="txt sticky-a">Component</th>${rows.map(() => metrics.map(k => `<th>${METRICS[k].label}<br><small>${unitOf(k)}</small></th>`).join('')).join('')}</tr></thead><tbody>`
                + names.map(n => `<tr><td class="txt sticky-a"><b>${esc(n)}</b>${refList().includes(n) ? ' <small class="mb-ref">ref.</small>' : ''}</td>`
                    + rows.map(r => { const m = metricsOf(r, n); return metrics.map(k => metricCell(r, n, k, m)).join(''); }).join('') + '</tr>').join('') + '</tbody>';
        }
        $('#mbCompNote').textContent = `${BASIS[state.comp.basis].label} basis · reference: ${refList().join(' + ') || '— (choose one for selectivity and yield)'} · `
            + 'Selectivity and yield are net (out − in), so a product already in the feed only counts what was formed. Click a % value to see its formula.';
    }
    function componentSampleRows() {
        if (!state.data) return [];
        const names = selectedList(), metrics = state.comp.metrics;
        return (state.data.results || []).filter(r => r.components).map(r => {
            const ents = entries(r);
            const row = { Sample: r.sample, Reactor: r.reactor, Condition: r.condition, Basis: state.comp.basis, Reference: refList().join(' + ') };
            names.forEach(n => { const m = metricsOf(r, n, ents); metrics.forEach(k => { row[`${n} · ${METRICS[k].label} [${unitOf(k)}]`] = m[k] ?? ''; }); });
            return row;
        });
    }

    // ------------------------------------------------------------ Balances tab (chemistry-independent)
    function renderBalances(view) {
        const rows = shownRows(view);
        const sections = [
            { title: 'Carbon balance', note: '(C gas out + C liquid out) / (C gas in + C liquid in)', rows: [
                ['C in gas feed', 'c_gas_in_g_h', 'g', 'g C/h'], ['C in liquid feed', 'c_liq_in_g_h', 'g', 'g C/h'],
                ['C in gas product', 'c_gas_out_g_h', 'g', 'g C/h'], ['C in liquid product', 'c_liq_out_g_h', 'g', 'g C/h'],
                ['Carbon balance', 'c_balance_pct', 1, '%', 'balance'], ['Gas-phase carbon balance', 'gas_c_balance_pct', 1, '%', 'balance']] },
            { title: 'Mass balance', note: '(gas out + HC + aqueous) / (gas in + liquid feed), without the internal standard', rows: [
                ['Gas feed', 'gas_in_g_h', 'g', 'g/h'], ['Liquid feed', 'liq_in_g_h', 'g', 'g/h'], ['Gas product', 'gas_out_g_h', 'g', 'g/h'],
                ['HC product', 'hc_out_g_h', 'g', 'g/h'], ['Aqueous product', 'aq_out_g_h', 'g', 'g/h'], ['Mass balance closure', 'mass_balance_pct', 1, '%', 'balance']] },
            { title: 'Carbon recovered · basis', note: 'where the carbon out was found, and which GC lines were averaged', rows: [
                ['C in the gas product', 'c_out_gas_share_pct', 1, '%'], ['C in the liquid product', 'c_out_liquid_share_pct', 1, '%'],
                ['Internal standard to reactor', 'is_flow_g_h', 'g', 'g/h'], ['TOS', 'tos_h', 1, 'h'], ['GC lines', 'lines', 0, ''],
                ['First line', 'first_line', 'txt', ''], ['Last line', 'last_line', 'txt', '']] },
        ];
        if (!rows.length) { $('#mbBalances').innerHTML = '<div class="mb-empty">No results for this sample.</div>'; return; }
        const head = `<thead><tr><th></th>${rows.map(r => `<th><i class="mb-dot" style="background:${REACTOR_COLORS[r.reactor]}"></i>${r.reactor}</th>`).join('')}</tr></thead>`;
        const cellOf = (r, key, digits, kind) => {
            const v = r[key];
            if (digits === 'txt') { const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/); return `<td class="txt" title="${esc(v ?? '')}">${esc(m ? `${m[3]}.${m[2]} ${m[4]}` : (v || '–'))}</td>`; }
            if (typeof v === 'string' && v.startsWith('ERROR')) return `<td class="err" title="${esc(v)}">${esc(v.replace(/^ERROR:\s*/, '').replace(/ \(Online Analysis → Liquid\)/, ''))}</td>`;
            const text = isNum(v) ? (digits === 'g' ? fmtG(v) : v.toFixed(digits)) : '–';
            const st = kind === 'balance' && isNum(v) ? balanceStatus(v) : '';
            const click = ['c_balance_pct', 'gas_c_balance_pct', 'mass_balance_pct'].includes(key) ? ` data-explain="${r.reactor}|${key}"` : '';
            return `<td class="${click ? 'click' : ''}"${click}>${st ? `<span class="mb-pill ${st}">${text}</span>` : text}</td>`;
        };
        $('#mbBalances').innerHTML = sections.map(sec => `<section class="mb-sec"><h4>${esc(sec.title)}</h4><p>${esc(sec.note)}</p>`
            + `<table class="mb-sec-table">${head}<tbody>${sec.rows.map(([label, key, digits, unit, kind]) =>
                `<tr class="${kind ? 'mb-key' : ''}"><td class="lbl">${esc(label)}${unit ? ` <small>${esc(unit)}</small>` : ''}</td>${rows.map(r => cellOf(r, key, digits, kind)).join('')}</tr>`).join('')}</tbody></table></section>`).join('');
    }
    function balanceRows(view) {
        return shownRows(view).map(r => ({ Sample: r.sample, Reactor: r.reactor, Condition: r.condition,
            'C in gas feed (g C/h)': r.c_gas_in_g_h, 'C in liquid feed (g C/h)': r.c_liq_in_g_h, 'C in gas product (g C/h)': r.c_gas_out_g_h,
            'C in liquid product (g C/h)': r.c_liq_out_g_h, 'Carbon balance (%)': r.c_balance_pct, 'Gas-phase C balance (%)': r.gas_c_balance_pct,
            'Gas feed (g/h)': r.gas_in_g_h, 'Liquid feed (g/h)': r.liq_in_g_h, 'Gas product (g/h)': r.gas_out_g_h, 'HC product (g/h)': r.hc_out_g_h,
            'Aqueous product (g/h)': r.aq_out_g_h, 'Mass balance (%)': r.mass_balance_pct }));
    }

    // ------------------------------------------------------------ Summary (all samples)
    function summaryRows() {
        if (!state.data) return [];
        const refs = refList(), p = firstProduct();
        return (state.data.results || []).map(r => {
            const ents = r.components ? entries(r) : {};
            const pm = p && r.components ? metricsOf(r, p, ents) : {};
            return { Sample: r.sample, Condition: r.condition, Reactor: r.reactor, Role: r.role, 'TOS (h)': r.tos_h, 'GC lines': r.lines,
                'Carbon balance (%)': r.c_balance_pct, 'Gas-phase C balance (%)': r.gas_c_balance_pct, 'Mass balance (%)': r.mass_balance_pct,
                [`${refs.join(' + ') || 'Reference'} conversion (%)`]: r.components ? refConversion(r, ents) : null,
                [`${p || 'Product'} selectivity (%)`]: pm.sel ?? null, [`${p || 'Product'} yield (%)`]: pm.yld ?? null,
                'C in gas feed (g C/h)': r.c_gas_in_g_h, 'C in liquid feed (g C/h)': r.c_liq_in_g_h,
                'C in gas product (g C/h)': r.c_gas_out_g_h, 'C in liquid product (g C/h)': r.c_liq_out_g_h,
                'C recovered in gas (%)': r.c_out_gas_share_pct, 'C recovered in liquid (%)': r.c_out_liquid_share_pct };
        });
    }
    function renderSummary() {
        const rows = summaryRows();
        if (!rows.length) { $('#mbSummaryTable').innerHTML = '<tbody><tr><td>No results.</td></tr></tbody>'; return; }
        const cols = Object.keys(rows[0]);
        const groupOf = (c) => /^(Sample|Condition|Reactor|Role|TOS|GC lines)/.test(c) ? 'Sample' : /balance/i.test(c) ? 'Balances'
            : /recovered/.test(c) ? 'Carbon recovered' : /g C\/h/.test(c) ? 'Carbon flows' : 'Conversion · selectivity · yield';
        const spans = [];
        cols.forEach(c => { const g = groupOf(c); if (spans.length && spans[spans.length - 1][0] === g) spans[spans.length - 1][1] += 1; else spans.push([g, 1]); });
        const short = (c) => c.replace(' (%)', '').replace(' (g C/h)', '').replace(' (h)', ' [h]');
        $('#mbSummaryTable').innerHTML = `<thead><tr class="mb-group-row">${spans.map(([g, n]) => `<th colspan="${n}" class="grp">${esc(g)}${g === 'Carbon flows' ? ' <small>g C/h</small>' : g === 'Sample' ? '' : ' <small>%</small>'}</th>`).join('')}</tr>`
            + `<tr>${cols.map(c => `<th class="${/^(Sample|Condition|Reactor|Role)$/.test(c) ? 'txt' : ''}">${esc(short(c))}</th>`).join('')}</tr></thead><tbody>`
            + rows.map((r, i) => `<tr class="${viewKey(state.data.results[i]) === state.selected ? 'sel' : ''}" data-key="${esc(viewKey(state.data.results[i]))}">${cols.map(c => {
                const v = r[c];
                if (c === 'Reactor') return `<td class="txt"><i class="mb-dot" style="background:${REACTOR_COLORS[v]}"></i>${esc(v)}</td>`;
                if (typeof v === 'string') return v.startsWith('ERROR') ? `<td class="err" title="${esc(v)}">${/liquid/i.test(v) ? 'needs liquid' : 'error'}</td>` : `<td class="txt">${esc(v)}</td>`;
                const st = /balance/.test(c) && isNum(v) ? balanceStatus(v) : '';
                const text = isNum(v) ? (/g C\/h/.test(c) ? fmtG(v) : v.toFixed(c === 'GC lines' ? 0 : 1)) : '–';
                return `<td>${st ? `<span class="mb-pill ${st}">${text}</span>` : text}</td>`;
            }).join('')}</tr>`).join('') + '</tbody>';
        $('#mbSummaryTable').querySelectorAll('tr[data-key]').forEach(tr => tr.onclick = () => {
            state.selected = tr.dataset.key; state.reactors = null; save(); render();
            window.scrollTo({ top: $('#mbCards').offsetTop - 120, behavior: 'smooth' });
        });
    }

    // ------------------------------------------------------------ per GC injection (gas only)
    function injectionRows() {
        if (!state.data) return [];
        const m = meta(), b = state.comp.basis, refs = refList();
        const names = selectedList().filter(n => n !== LIQUID && !n.startsWith('Gas C') && !refs.includes(n)).slice(0, 6);
        const q = (n, g) => { const c = m[n]; if (!c || !isNum(g)) return 0; return b === 'mass' ? g : b === 'carbon' ? MW_C * (c.carbon_atoms || 0) / c.mw * g : g / c.mw * 1000; };
        return (state.data.trends || []).filter(t => !state.reactors || state.reactors.includes(t.reactor)).map(t => {
            const inR = refs.reduce((a, n) => a + q(n, t.in?.[n]), 0), outR = refs.reduce((a, n) => a + q(n, t.out?.[n]), 0);
            const conv = inR > 0 ? 100 * (inR - outR) / inR : null;
            const row = { DateTime: t.datetime, 'TOS (h)': t.tos_h, Reactor: t.reactor, Condition: t.condition,
                          'Gas-phase C balance (%)': t.gas_c_balance, [`${refs.join(' + ') || 'Reference'} conversion (%)`]: conv };
            names.forEach(n => { const net = q(n, t.out?.[n]) - q(n, t.in?.[n]); row[`${n} selectivity (%)`] = inR - outR > 0 ? 100 * net / (inR - outR) : null; });
            return row;
        });
    }
    function renderInjections() {
        const rows = injectionRows();
        $('#mbInjNote').textContent = `One row per GC injection (${rows.length}, all conditions, gas only). Conversion of the reference and selectivity of the selected products use the feed of the same injection, ${BASIS[state.comp.basis].label.toLowerCase()} basis.`;
        if (!rows.length) { $('#mbInjTable').innerHTML = '<tbody><tr><td>No calculated GC lines.</td></tr></tbody>'; return; }
        const cols = Object.keys(rows[0]);
        $('#mbInjTable').innerHTML = `<thead><tr>${cols.map(c => `<th class="${/^(DateTime|Reactor|Condition)$/.test(c) ? 'txt' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>`
            + rows.map(r => `<tr>${cols.map(c => {
                const v = r[c];
                if (c === 'Reactor') return `<td class="txt"><i class="mb-dot" style="background:${REACTOR_COLORS[v]}"></i>${esc(v)}</td>`;
                if (typeof v === 'string' || v === null || v === undefined) return `<td class="txt">${esc(v ?? '–')}</td>`;
                const st = /balance/.test(c) ? balanceStatus(v) : '';
                return `<td>${st ? `<span class="mb-pill ${st}">${v.toFixed(1)}</span>` : v.toFixed(2)}</td>`;
            }).join('')}</tr>`).join('') + '</tbody>';
    }

    // ------------------------------------------------------------ tabs, render, events
    function renderPane() {
        document.querySelectorAll('.mb-tabs [data-tab]').forEach(b => { const on = b.dataset.tab === state.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
        document.querySelectorAll('.mb-pane').forEach(p => { p.hidden = p.dataset.pane !== state.tab; });
        const view = currentView();
        if (state.tab === 'components') { renderComponentControls(); renderComponentTable(); }
        if (state.tab === 'balances') renderBalances(view);
        if (state.tab === 'summary') renderSummary();
        if (state.tab === 'injections') renderInjections();
    }
    function render() {
        renderControls();
        renderCards(currentView());
        renderPane();
        save();
    }

    $('#mbSample').onchange = () => { state.selected = $('#mbSample').value; state.reactors = null; save(); render(); };
    document.querySelectorAll('.mb-tabs [data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; save(); renderPane(); });
    const recalc = () => { save(); calculate(); };
    $('#mbIs').onchange = () => { state.options.is = $('#mbIs').value; recalc(); };
    $('#mbBasis').onchange = () => { state.options.basis = $('#mbBasis').value; recalc(); };
    $('#mbWindow').onchange = () => { state.options.window_h = Number($('#mbWindow').value) || 2; recalc(); };
    function downloadCsv(rows, name) {
        if (!rows.length) return;
        const cols = Object.keys(rows[0]);
        const q = (v) => { const t = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
        const csv = [cols.map(q).join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = `MassBalance_Run${sessionStorage.getItem('ils_run_number') || ''}_${name}.csv`;
        a.click();
    }
    document.querySelectorAll('[data-export]').forEach(btn => btn.onclick = () => {
        const kind = btn.dataset.export;
        if (kind === 'components') downloadCsv(componentSampleRows(), `Components_${state.comp.basis}`);
        if (kind === 'balances') downloadCsv(balanceRows(currentView()), 'Balances');
        if (kind === 'summary') downloadCsv(summaryRows(), 'Summary');
        if (kind === 'injections') downloadCsv(injectionRows(), 'Per_injection');
    });

    load();
    calculate();
})();
