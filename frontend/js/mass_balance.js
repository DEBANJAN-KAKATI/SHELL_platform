// Calculation → Mass Balance (General_MB, 6.9.6): carbon balance, mass balance, conversion, selectivity and yield per
// liquid sample and reactor, from Online Analysis (Gas + Liquid tabs) and the Run Plan. Calculated by /api/mass-balance.
(() => {
    const KEY = 'ils_mass_balance_state';
    const $ = (s) => document.querySelector(s);
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    const fmt = (v, d = 1) => isNum(v) ? v.toFixed(d) : '–';
    const fmtG = (v) => isNum(v) ? (Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3)) : '–';

    // Reactor colours follow the reactor (fixed slot per reactor, validated categorical palette)
    const REACTOR_COLORS = { R1: '#2a78d6', R2: '#eb6834', R3: '#1baf7a', R4: '#eda100', R5: '#e87ba4', R6: '#008300', R7: '#6250d6', R8: '#e34948' };
    const GROUP_COLORS = { 'Ethylene': '#2a78d6', 'Ethane': '#eb6834', 'Methane': '#1baf7a', 'C3': '#eda100', 'C4+ (gas)': '#e87ba4',
        'CO + CO2': '#008300', 'Other gas': '#6250d6', 'Not in the gas product': '#c9c3b8' };
    const INK = '#071a2d', SLATE = '#52514e', GRID = 'rgba(7,26,45,.08)';

    const state = { data: null, selected: '', reactors: null, tab: 'table',
                    options: { is: '', reactant: '', product: '', basis: 'condition-skip', window_h: 2 }, compReactor: '' };

    function load() {
        try {
            const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
            if (!s) return;
            Object.assign(state.options, s.options || {});
            ['selected', 'tab', 'compReactor'].forEach(k => { if (s[k]) state[k] = s[k]; });
            if (Array.isArray(s.reactors)) state.reactors = s.reactors;
        } catch (e) { sessionStorage.removeItem(KEY); }
    }
    function save() {
        try {
            sessionStorage.setItem(KEY, JSON.stringify({ options: state.options, selected: state.selected, reactors: state.reactors,
                tab: state.tab, compReactor: state.compReactor,
                summary: summaryRows() }));
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
            options: { reactant: state.options.reactant || null, product: state.options.product || null,
                       basis: state.options.basis === 'window' ? 'window' : 'condition',
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
            const all = reactors;
            let cur = state.reactors ? state.reactors.filter(r => all.includes(r)) : [...all];
            cur = cur.includes(btn.dataset.reactor) ? cur.filter(r => r !== btn.dataset.reactor) : [...cur, btn.dataset.reactor];
            state.reactors = cur.length === all.length ? null : (cur.length ? cur : null);
            save(); render();
        });
        const d = state.data;
        $('#mbIs').value = state.options.is || d?.internal_standard || 'Argon';
        $('#mbReactant').innerHTML = (d?.reactant_options || []).map(n => `<option${n === d.reactant ? ' selected' : ''}>${esc(n)}</option>`).join('');
        $('#mbProduct').innerHTML = (d?.product_options || []).map(n => `<option${n === d.product ? ' selected' : ''}>${esc(n)}</option>`).join('');
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

    function kpi(label, value, key, row, unit = '%', digits = 1) {
        const err = typeof value === 'string' && value.startsWith('ERROR');
        return `<button type="button" class="mb-kpi${err ? ' err' : ''}" data-explain="${esc(row.reactor)}|${key}" title="${esc(err ? value : 'Show how it is calculated')}">`
            + `<span>${label}</span><b>${err ? '—' : fmt(value, digits)}${err ? '' : `<small>${unit}</small>`}</b>`
            + (err ? `<em>${esc(value.replace(/^ERROR:\s*/, '').replace(/ \(Online Analysis → Liquid\)/, ''))}</em>` : '') + '</button>';
    }

    function card(r, d) {
        const cb = r.c_balance_pct;
        const cbNum = isNum(cb);
        const st = balanceStatus(cbNum ? cb : null);
        const gasCb = r.gas_c_balance_pct;
        const head = `<div class="mb-card-head"><i style="background:${REACTOR_COLORS[r.reactor]}"></i><b>${r.reactor}</b>`
            + `<span>${esc(r.role || '')}${r.role ? ' · ' : ''}${esc(r.condition)}</span>`
            + `<small>TOS ${fmt(r.tos_h, 1)} h · ${r.lines ?? 0} GC lines</small></div>`;
        if (r.errors?.length && !isNum(r.gas_c_balance_pct)) {
            return `<article class="mb-card">${head}<div class="mb-card-err">${esc(r.errors.join(' · '))}</div></article>`;
        }
        const hero = cbNum
            ? `<button type="button" class="mb-hero-num ${st}" data-explain="${r.reactor}|c_balance_pct"><span>Carbon balance</span><b>${fmt(cb, 1)}<small>%</small></b>`
              + `<em class="mb-badge ${st}">${STATUS[st][0]} ${STATUS[st][1]} <small>${STATUS[st][2]}</small></em></button>`
            : `<div class="mb-hero-num missing"><span>Carbon balance</span><b>—</b><em class="mb-badge todo">Needs liquid: ${esc(String(cb).replace(/^ERROR:\s*/, ''))}</em>`
              + `<a class="mb-link" href="/frontend/online_analysis.html">Open Liquid tab →</a></div>`;
        const split = isNum(r.c_out_liquid_share_pct)
            ? `<div class="mb-split" title="Carbon recovered: gas ${fmt(r.c_out_gas_share_pct, 0)} %, liquid ${fmt(r.c_out_liquid_share_pct, 0)} %">`
              + `<span class="gas" style="width:${r.c_out_gas_share_pct}%"></span><span class="liq" style="width:${r.c_out_liquid_share_pct}%"></span></div>`
              + `<div class="mb-split-legend"><span><i class="gas"></i>Gas ${fmtG(r.c_gas_out_g_h)} g C/h</span><span><i class="liq"></i>Liquid ${fmtG(r.c_liq_out_g_h)} g C/h</span></div>`
            : `<div class="mb-split-legend"><span><i class="gas"></i>C in gas product ${fmtG(r.c_gas_out_g_h)} g C/h</span></div>`;
        return `<article class="mb-card">${head}${hero}${split}<div class="mb-kpis">`
            + kpi(`${esc(d.reactant || 'Reactant')} conversion`, r.conversion_pct, 'conversion_pct', r)
            + kpi(`${esc(d.product || 'Product')} selectivity`, r.selectivity_pct, 'selectivity_pct', r)
            + kpi(`${esc(d.product || 'Product')} yield`, r.product_yield_pct, 'product_yield_pct', r)
            + kpi('Mass balance', r.mass_balance_pct, 'mass_balance_pct', r)
            + kpi('C4+ yield', r.c4_yield_pct, 'c4_yield_pct', r)
            + kpi('Gas-phase C balance', gasCb, 'gas_c_balance_pct', r)
            + '</div></article>';
    }

    function renderCards(view) {
        const rows = shownRows(view);
        $('#mbCards').innerHTML = rows.length ? rows.map(r => card(r, state.data)).join('')
            : '<div class="mb-empty">No results yet: the checklist above shows what is missing.</div>';
    }

    // ------------------------------------------------------------ explain popover
    const EXPLAIN_TEXT = {
        c_balance_pct: 'Carbon balance = (C gas product + C liquid product) / (C gas feed + C liquid feed) × 100',
        gas_c_balance_pct: 'Gas-phase carbon balance = C gas product / C gas feed × 100',
        mass_balance_pct: 'Mass balance closure = (gas out w/o IS + HC product + aqueous) / (gas in w/o IS + liquid feed) × 100',
        conversion_pct: 'Conversion = (reactant in − reactant out) / reactant in × 100 (feed from the bypass lines, scaled with the internal standard)',
        selectivity_pct: 'Carbon selectivity = C of the product formed (out − in) / C of the reactant converted × 100',
        product_yield_pct: 'Carbon yield = C of the product formed / C of the reactant fed × 100 (= conversion × selectivity)',
        c4_yield_pct: 'C4+ yield (workbook) = ((HC product + C4+ gas out) − (C4+ gas in + liquid feed)) / (C4+ gas in + liquid feed) × 100',
    };
    function explain(target) {
        const [reactor, key] = target.dataset.explain.split('|');
        const r = shownRows(currentView()).find(x => x.reactor === reactor);
        if (!r) return;
        const v = r[key];
        const box = $('#mbExplain');
        box.innerHTML = `<button type="button" class="mb-explain-close" aria-label="Close">×</button><b>${esc(reactor)} · ${esc(r.sample)} · ${esc(r.condition)}</b>`
            + `<p>${esc(EXPLAIN_TEXT[key] || key)}</p>`
            + (r.explain?.[key] ? `<code>${esc(r.explain[key])}</code>` : '')
            + `<p class="mb-explain-value">= ${typeof v === 'string' ? esc(v) : `${fmt(v, 2)} %`}</p>`
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
    });

    // ------------------------------------------------------------ tables
    function cell(v, digits = 4, key = '', reactor = '') {
        if (typeof v === 'string' && v.startsWith('ERROR')) return `<td class="err" title="${esc(v)}">${esc(v.replace(/ \(Online Analysis → Liquid\)/, ''))}</td>`;
        const click = key ? ` data-explain="${reactor}|${key}" class="click"` : '';
        return `<td${click}>${isNum(v) ? (digits === 'g' ? fmtG(v) : v.toFixed(digits)) : '–'}</td>`;
    }

    const NOT_GAS = 'Not in the gas product';
    const valueOf = (r, key) => typeof key === 'function' ? key(r) : r[key];
    const comp = (r, name, field) => (r.components || []).find(c => c.component === name)?.[field];
    // Converted carbon not found as a gas molecule (liquid, heavier products, deposits); "Liquid (net)" not counted
    function notInGas(r, mode) {
        if (!r[mode] || !Object.keys(r[mode]).length) return null;
        const total = Object.entries(r[mode]).filter(([g, v]) => g !== 'Liquid (net)' && isNum(v)).reduce((a, [, v]) => a + v, 0);
        return (mode === 'selectivity' ? 100 : (isNum(r.conversion_pct) ? r.conversion_pct : null)) - total;
    }
    let lastCTable = { rows: [], spec: [] };

    function renderCTable(view) {
        const rows = shownRows(view);
        const d = state.data || {};
        const groups = (d.groups || []).filter(g => rows.some(r => isNum(r.selectivity?.[g])));
        const spec = [
            ['Sample', null], ['Condition', 'condition', 'txt'], ['TOS [h]', 'tos_h', 1], ['GC lines averaged', 'lines', 0],
            ['Carbon in', null], ['C in liquid feed [g C/h]', 'c_liq_in_g_h', 'g'], ['C in gas feed [g C/h]', 'c_gas_in_g_h', 'g'],
            ['Carbon out', null], ['C in liquid product [g C/h]', 'c_liq_out_g_h', 'g'], ['C in gas product [g C/h]', 'c_gas_out_g_h', 'g'],
            ['Carbon balance [%]', 'c_balance_pct', 2, true], ['Gas-phase carbon balance [%]', 'gas_c_balance_pct', 2, true],
            ['Mass', null], ['Liquid feed [g/h]', 'liq_in_g_h', 'g'], ['Gas feed w/o IS [g/h]', 'gas_in_g_h', 'g'],
            ['HC product [g/h]', 'hc_out_g_h', 'g'], ['Aqueous product [g/h]', 'aq_out_g_h', 'g'], ['Gas product w/o IS [g/h]', 'gas_out_g_h', 'g'],
            ['Mass balance closure [%]', 'mass_balance_pct', 2, true],
            ['C4+', null], ['C4+ in gas feed [g/h]', 'c4_gas_in_g_h', 'g'], ['C4+ in gas product [g/h]', 'c4_gas_out_g_h', 'g'], ['C4+ yield [%]', 'c4_yield_pct', 2, true],
            [`${d.reactant || 'Reactant'} and ${d.product || 'product'}`, null], [`${d.reactant || 'Reactant'} conversion [%]`, 'conversion_pct', 2, true],
            [`${d.product || 'Product'} selectivity, carbon [%]`, 'selectivity_pct', 2, true], [`${d.product || 'Product'} yield, carbon [%]`, 'product_yield_pct', 2, true],
            [`${d.product || 'Product'} selectivity, workbook (Nl/h) [%]`, 'selectivity_workbook_pct', 2],
            [`${d.reactant || 'Reactant'} in / out`, null],
            [`${d.reactant || 'Reactant'} in [g/h]`, r => comp(r, d.reactant, 'in_g_h'), 'g'], [`${d.reactant || 'Reactant'} out [g/h]`, r => comp(r, d.reactant, 'out_g_h'), 'g'],
            [`${d.product || 'Product'} in [g/h]`, r => comp(r, d.product, 'in_g_h'), 'g'], [`${d.product || 'Product'} out [g/h]`, r => comp(r, d.product, 'out_g_h'), 'g'],
            [`C of ${d.reactant || 'reactant'} converted [g C/h]`, 'converted_c_g_h', 'g'],
            [`Carbon selectivity by product (where the converted ${d.reactant || 'reactant'} carbon went) [%]`, null],
            ...groups.map(g => [g, r => r.selectivity?.[g], 2]),
            [NOT_GAS, r => notInGas(r, 'selectivity'), 2],
            [`Carbon yield by product (share of the fed ${d.reactant || 'reactant'} carbon) [%]`, null],
            ...groups.map(g => [g, r => r.yield?.[g], 2]),
            [NOT_GAS, r => notInGas(r, 'yield'), 2],
            ['Carbon recovered', null],
            ['in the gas product [%]', 'c_out_gas_share_pct', 1], ['in the liquid product [%]', 'c_out_liquid_share_pct', 1],
        ];
        lastCTable = { rows, spec };
        $('#mbCTable').innerHTML = `<thead><tr><th>Quantity</th>${rows.map(r => `<th><i class="mb-dot" style="background:${REACTOR_COLORS[r.reactor]}"></i>${r.reactor}</th>`).join('')}</tr></thead><tbody>`
            + spec.map(([label, key, digits, explainable]) => key === null
                ? `<tr class="mb-section"><td colspan="${rows.length + 1}">${esc(label)}</td></tr>`
                : `<tr${explainable ? ' class="mb-key"' : ''}><td>${esc(label)}</td>${rows.map(r => digits === 'txt' ? `<td class="txt">${esc(r[key])}</td>`
                    : cell(valueOf(r, key), digits, explainable ? key : '', r.reactor)).join('')}</tr>`).join('')
            + '</tbody>';
    }

    function summaryRows() {
        return (state.data?.results || []).map(r => ({
            Sample: r.sample, Condition: r.condition, Reactor: r.reactor, Role: r.role, 'TOS (h)': r.tos_h, 'GC lines': r.lines,
            'Carbon balance (%)': r.c_balance_pct, 'Gas-phase C balance (%)': r.gas_c_balance_pct, 'Mass balance (%)': r.mass_balance_pct,
            [`${state.data.reactant} conversion (%)`]: r.conversion_pct, [`${state.data.product} selectivity (%)`]: r.selectivity_pct,
            [`${state.data.product} yield (%)`]: r.product_yield_pct, 'C4+ yield (%)': r.c4_yield_pct,
            [`${state.data.product} selectivity, workbook (%)`]: r.selectivity_workbook_pct,
            'C in gas feed (g C/h)': r.c_gas_in_g_h, 'C in liquid feed (g C/h)': r.c_liq_in_g_h,
            'C in gas product (g C/h)': r.c_gas_out_g_h, 'C in liquid product (g C/h)': r.c_liq_out_g_h,
            'C recovered in gas (%)': r.c_out_gas_share_pct, 'C recovered in liquid (%)': r.c_out_liquid_share_pct,
        }));
    }

    function renderSummary() {
        const rows = summaryRows();
        if (!rows.length) { $('#mbSummaryTable').innerHTML = '<tbody><tr><td>No results.</td></tr></tbody>'; return; }
        const cols = Object.keys(rows[0]);
        $('#mbSummaryTable').innerHTML = `<thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
            + rows.map((r, i) => `<tr class="${viewKey(state.data.results[i]) === state.selected ? 'sel' : ''}" data-key="${esc(viewKey(state.data.results[i]))}">${cols.map(c => {
                const v = r[c];
                if (c === 'Reactor') return `<td class="txt"><i class="mb-dot" style="background:${REACTOR_COLORS[v]}"></i>${esc(v)}</td>`;
                if (typeof v === 'string') return v.startsWith('ERROR') ? `<td class="err" title="${esc(v)}">ERROR</td>` : `<td class="txt">${esc(v)}</td>`;
                const st = /balance/.test(c) && isNum(v) ? balanceStatus(v) : '';
                return `<td class="${st ? `st-${st}` : ''}">${isNum(v) ? (/g C\/h/.test(c) ? fmtG(v) : v.toFixed(c === 'GC lines' ? 0 : c === 'TOS (h)' ? 1 : 2)) : '–'}</td>`;
            }).join('')}</tr>`).join('') + '</tbody>';
        $('#mbSummaryTable').querySelectorAll('tr[data-key]').forEach(tr => tr.onclick = () => {
            state.selected = tr.dataset.key; state.reactors = null; save(); render();
            window.scrollTo({ top: $('#mbCards').offsetTop - 120, behavior: 'smooth' });
        });
    }

    function injectionRows() {
        const d = state.data || {};
        return (d.trends || []).filter(t => !state.reactors || state.reactors.includes(t.reactor)).map(t => ({
            DateTime: t.datetime, 'TOS (h)': t.tos_h, Reactor: t.reactor, Condition: t.condition,
            'Gas-phase C balance (%)': t.gas_c_balance, [`${d.reactant} conversion (%)`]: t.conversion,
            [`${d.product} selectivity (%)`]: t.selectivity }));
    }

    function renderInjections() {
        const rows = injectionRows();
        $('#mbInjNote').textContent = `Workbook Summary "by TOS": one row per GC injection of the reactors shown (${rows.length} injections, all conditions). Gas-phase carbon balance and conversion use the feed of the same injection.`;
        if (!rows.length) { $('#mbInjTable').innerHTML = '<tbody><tr><td>No calculated GC lines.</td></tr></tbody>'; return; }
        const cols = Object.keys(rows[0]);
        $('#mbInjTable').innerHTML = `<thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
            + rows.map(r => `<tr>${cols.map(c => {
                const v = r[c];
                if (c === 'Reactor') return `<td class="txt"><i class="mb-dot" style="background:${REACTOR_COLORS[v]}"></i>${esc(v)}</td>`;
                if (typeof v === 'string' || v === null || v === undefined) return `<td class="txt">${esc(v ?? '–')}</td>`;
                const st = /balance/.test(c) ? balanceStatus(v) : '';
                return `<td class="${st ? `st-${st}` : ''}">${v.toFixed(c === 'TOS (h)' ? 2 : 2)}</td>`;
            }).join('')}</tr>`).join('') + '</tbody>';
    }

    function componentRows(view) {
        const rows = shownRows(view).filter(r => r.components);
        const r = rows.find(x => x.reactor === state.compReactor) || rows[0];
        if (!r) return [];
        return r.components.filter(c => isNum(c.in_g_h) && c.in_g_h > 0 || isNum(c.out_g_h) && c.out_g_h > 0).map(c => ({
            Molecule: c.component, Group: c.group === 'reactant' ? 'reactant' : (c.group || '—'), 'C atoms': c.carbon_atoms,
            'In [g/h]': c.in_g_h, 'Out [g/h]': c.out_g_h, 'Change [g/h]': (c.out_g_h || 0) - (c.in_g_h || 0),
            'C in [g C/h]': c.c_in_g_h, 'C out [g C/h]': c.c_out_g_h, 'Out [Nl/h]': c.out_nl_h }));
    }

    function renderComponents(view) {
        const rows = shownRows(view).filter(r => r.components);
        if (!rows.length) { $('#mbCompTable').innerHTML = ''; $('#mbCompReactor').innerHTML = ''; return; }
        if (!rows.some(r => r.reactor === state.compReactor)) state.compReactor = rows[0].reactor;
        $('#mbCompReactor').innerHTML = rows.map(r => `<option${r.reactor === state.compReactor ? ' selected' : ''}>${r.reactor}</option>`).join('');
        const r = rows.find(x => x.reactor === state.compReactor);
        $('#mbCompTable').innerHTML = '<thead><tr><th>Molecule</th><th>Group</th><th>C atoms</th><th>In [g/h]</th><th>Out [g/h]</th><th>Change [g/h]</th><th>C in [g C/h]</th><th>C out [g C/h]</th><th>Out [Nl/h]</th></tr></thead><tbody>'
            + r.components.filter(c => isNum(c.in_g_h) && c.in_g_h > 0 || isNum(c.out_g_h) && c.out_g_h > 0).map(c => {
                const delta = (c.out_g_h || 0) - (c.in_g_h || 0);
                return `<tr><td class="txt">${esc(c.component)}</td><td class="txt">${esc(c.group === 'reactant' ? 'reactant' : (c.group || '—'))}</td><td>${c.carbon_atoms ?? '–'}</td>`
                    + `<td>${fmtG(c.in_g_h)}</td><td>${fmtG(c.out_g_h)}</td><td class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : ''}${fmtG(delta)}</td>`
                    + `<td>${fmtG(c.c_in_g_h)}</td><td>${fmtG(c.c_out_g_h)}</td><td>${fmtG(c.out_nl_h)}</td></tr>`;
            }).join('') + '</tbody>';
    }

    function renderPane() {
        document.querySelectorAll('.mb-tabs [data-tab]').forEach(b => { const on = b.dataset.tab === state.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
        document.querySelectorAll('.mb-pane').forEach(p => { p.hidden = p.dataset.pane !== state.tab; });
        const view = currentView();
        if (state.tab === 'injections') renderInjections();
        if (state.tab === 'table') renderCTable(view);
        if (state.tab === 'summary') renderSummary();
        if (state.tab === 'components') renderComponents(view);
    }

    function render() {
        renderControls();
        const view = currentView();
        renderCards(view);
        renderPane();
        save();
    }

    // ------------------------------------------------------------ events
    $('#mbSample').onchange = () => { state.selected = $('#mbSample').value; state.reactors = null; save(); render(); };
    document.querySelectorAll('.mb-tabs [data-tab]').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; save(); renderPane(); });
    $('#mbCompReactor').onchange = () => { state.compReactor = $('#mbCompReactor').value; save(); renderPane(); };
    const recalc = () => { save(); calculate(); };
    $('#mbIs').onchange = () => { state.options.is = $('#mbIs').value; recalc(); };
    $('#mbReactant').onchange = () => { state.options.reactant = $('#mbReactant').value; recalc(); };
    $('#mbProduct').onchange = () => { state.options.product = $('#mbProduct').value; recalc(); };
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
    function cTableRows() {
        const { rows, spec } = lastCTable;
        let section = '';
        return spec.flatMap(([label, key]) => {
            if (key === null) { section = label; return []; }
            return [{ Section: section, Quantity: label, ...Object.fromEntries(rows.map(r => [r.reactor, valueOf(r, key) ?? ''])) }];
        });
    }
    document.querySelectorAll('[data-export]').forEach(btn => btn.onclick = () => {
        const kind = btn.dataset.export;
        const view = currentView();
        if (kind === 'table') downloadCsv(cTableRows(), `C-Balance_${(view?.sample || '').replace(/\W+/g, '_')}`);
        if (kind === 'summary') downloadCsv(summaryRows(), 'Summary');
        if (kind === 'injections') downloadCsv(injectionRows(), 'Summary_per_injection');
        if (kind === 'components') downloadCsv(componentRows(view), `Molecules_${state.compReactor}`);
    });

    load();
    calculate();
})();
