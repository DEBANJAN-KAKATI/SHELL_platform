// Calculation → Mass Balance (General_MB, 6.9.10): plain tables like the Isomerization calculation table.
// Reactor table = balances per liquid sample (or DOE condition) and reactor; Component table = in / out / net /
// conversion / selectivity / yield / yield wof% of any component, any reference reactant(s), carbon / mass / mole basis.
// The engine is mb_core.js (shared with the Plots page); nothing assumes a particular chemistry.
(() => {
    const MB = window.ILSMB;
    const KEY = 'ils_mass_balance_state';
    const $ = (s) => document.querySelector(s);
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const isNum = MB.isNum;
    const fmtG = (v) => isNum(v) ? (v === 0 ? '0' : Math.abs(v) >= 1 ? v.toFixed(3) : v.toPrecision(3)) : '';
    const fmt = (v, d = 2) => isNum(v) ? v.toFixed(d) : '';

    const saved = MB.settings();
    const state = { data: null, reactor: '', options: saved.options, comp: saved.comp };
    try { state.reactor = (JSON.parse(sessionStorage.getItem(KEY) || 'null') || {}).reactor || ''; } catch (e) {}

    const refs = () => MB.refsOf(state.data, state.comp);
    const selected = () => MB.selectedOf(state.data, state.comp);
    const results = () => (state.data?.results || []).filter(r => !state.reactor || r.reactor === state.reactor);

    function save() {
        try {
            sessionStorage.setItem(KEY, JSON.stringify({ options: state.options, comp: state.comp, reactor: state.reactor,
                summary: reactorRows(), components: componentRows() }));
        } catch (e) {}
    }
    function error(msg = '') { const el = $('#mbError'); el.textContent = msg; el.classList.toggle('show', Boolean(msg)); }

    async function calculate() {
        $('#mbStatus').textContent = 'Calculating...';
        try {
            const { data, ready } = await MB.request(state.options);
            state.data = data;
            const missing = [!ready.runPlan && 'load the Run Plan (Run Plan page)', !ready.gas && 'import the GC export (Online Analysis → Gas)',
                             !ready.liquid && 'enter liquid samples (Online Analysis → Liquid) for the carbon and mass balance'].filter(Boolean);
            error(!window.ILSProcess?.isGeneralMB?.() ? 'The Mass Balance belongs to the General_MB process: choose General_MB on the Run Plan page.'
                : missing.length && !data ? `Missing: ${missing.join('; ')}.` : '');
            $('#mbReactorSummary').textContent = missing.length && data ? `Still missing: ${missing.join('; ')}.`
                : 'Carbon balance = (C gas out + C liquid out) / (C gas in + C liquid in); Mass balance = (gas out + HC + aqueous) / (gas in + liquid feed), without the internal standard. Hover a balance for its numbers.';
        } catch (e) {
            state.data = null;
            error(`Mass balance failed: ${e.message}`);
        } finally { $('#mbStatus').textContent = 'Ready'; }
        render();
    }

    // ------------------------------------------------------------ cells
    function cell(v, kind = 'num', title = '') {
        if (typeof v === 'string' && v.startsWith('ERROR')) {
            const short = /no liquid sample/.test(v) ? 'ERROR: no liquid sample' : v.replace(/ \(Online Analysis → Liquid\)/, '');
            return `<td class="mb-err" title="${esc(v)}">${esc(short)}</td>`;
        }
        if (kind === 'txt') return `<td class="txt">${esc(v ?? '')}</td>`;
        const text = kind === 'g' ? fmtG(v) : kind === 0 ? fmt(v, 0) : kind === 1 ? fmt(v, 1) : fmt(v, 2);
        return `<td${title ? ` title="${esc(title)}"` : ''}>${text}</td>`;
    }

    // ------------------------------------------------------------ reactor table
    function reactorSpec() {
        const ref = refs().join(' + ') || 'Reference';
        return [
            ['Sample', 'sample', 'txt'], ['Condition', 'condition', 'txt'], ['Reactor', 'reactor', 'txt'], ['TOS (h)', 'tos_h', 1], ['GC lines', 'lines', 0],
            ['C in gas feed (g C/h)', 'c_gas_in_g_h', 'g'], ['C in liquid feed (g C/h)', 'c_liq_in_g_h', 'g'],
            ['C in gas product (g C/h)', 'c_gas_out_g_h', 'g'], ['C in liquid product (g C/h)', 'c_liq_out_g_h', 'g'],
            ['Carbon balance (%)', 'c_balance_pct', 2], ['Gas-phase C balance (%)', 'gas_c_balance_pct', 2],
            ['Gas feed (g/h)', 'gas_in_g_h', 'g'], ['Liquid feed (g/h)', 'liq_in_g_h', 'g'], ['Gas product (g/h)', 'gas_out_g_h', 'g'],
            ['HC product (g/h)', 'hc_out_g_h', 'g'], ['Aqueous product (g/h)', 'aq_out_g_h', 'g'], ['Mass balance (%)', 'mass_balance_pct', 2],
            ['C recovered in liquid (%)', 'c_out_liquid_share_pct', 1],
            [`${ref} conversion (%)`, r => r.components ? MB.refConversion(MB.entries(r), { basis: state.comp.basis, refs: refs() }) : null, 2],
        ];
    }
    function reactorRows() {
        return results().map(r => Object.fromEntries(reactorSpec().map(([label, key]) => [label, typeof key === 'function' ? key(r) : r[key]])));
    }
    function renderReactorTable() {
        const spec = reactorSpec(), rows = results();
        $('#mbReactorTable').innerHTML = `<thead><tr>${spec.map(([label], i) => `<th class="${i < 3 ? 'txt' : ''}">${esc(label)}</th>`).join('')}</tr></thead><tbody>`
            + rows.map(r => `<tr>${spec.map(([, key, kind]) => {
                const v = typeof key === 'function' ? key(r) : r[key];
                return cell(v, kind, typeof key === 'string' ? r.explain?.[key] || '' : '');
            }).join('')}</tr>`).join('') + '</tbody>';
        $('#mbReactorEmpty').style.display = rows.length ? 'none' : 'block';
        const opts = [...new Set((state.data?.results || []).map(r => r.reactor))];
        $('#mbReactorFilter').innerHTML = '<option value="">All reactors</option>' + opts.map(r => `<option${r === state.reactor ? ' selected' : ''}>${r}</option>`).join('');
    }

    // ------------------------------------------------------------ component table
    function componentRows() {
        if (!state.data) return [];
        const names = selected(), metrics = state.comp.metrics, opts = { basis: state.comp.basis, refs: refs() };
        return results().filter(r => r.components).map(r => {
            const ents = MB.entries(r);
            const row = { Sample: r.sample, Condition: r.condition, Reactor: r.reactor };
            names.forEach(n => {
                const m = MB.metrics(ents, n, { ...opts, feed: MB.feedOf(r) });
                metrics.forEach(k => { row[`${n} · ${MB.METRICS[k]} (${MB.unitOf(k, state.comp.basis)})`] = m.isRef && (k === 'sel' || k === 'yld') ? 'ref.' : m[k]; });
            });
            return row;
        });
    }
    function renderComponentTable() {
        const names = selected(), metrics = state.comp.metrics, opts = { basis: state.comp.basis, refs: refs() };
        const rows = results().filter(r => r.components);
        if (!names.length || !metrics.length) {
            $('#mbCompTable').innerHTML = '';
            $('#mbCompEmpty').textContent = 'Choose at least one component and one value.';
            $('#mbCompEmpty').style.display = 'block';
            return;
        }
        $('#mbCompTable').innerHTML = `<thead><tr><th colspan="3" class="txt"></th>${names.map(n => `<th colspan="${metrics.length}" class="mb-grp">${esc(n)}${refs().includes(n) ? ' (ref.)' : ''}</th>`).join('')}</tr>`
            + `<tr><th class="txt">Sample</th><th class="txt">Condition</th><th class="txt">Reactor</th>${names.map(() => metrics.map(k =>
                `<th>${MB.METRICS[k]} (${MB.unitOf(k, state.comp.basis)})</th>`).join('')).join('')}</tr></thead><tbody>`
            + rows.map(r => {
                const ents = MB.entries(r);
                return `<tr><td class="txt">${esc(r.sample)}</td><td class="txt">${esc(r.condition)}</td><td class="txt">${r.reactor}</td>` + names.map(n => {
                    const m = MB.metrics(ents, n, { ...opts, feed: MB.feedOf(r) });
                    return metrics.map(k => {
                        if (m.isRef && (k === 'sel' || k === 'yld')) return '<td class="mb-ref">ref.</td>';
                        const v = m[k];
                        return `<td${m.explain[k] ? ` title="${esc(m.explain[k])}"` : ''}>${['in', 'out', 'net'].includes(k) ? fmtG(v) : fmt(v, 2)}</td>`;
                    }).join('');
                }).join('') + '</tr>';
            }).join('') + '</tbody>';
        $('#mbCompEmpty').style.display = rows.length ? 'none' : 'block';
        $('#mbCompEmpty').textContent = 'No mass balance yet.';
        $('#mbCompSummary').textContent = `${MB.BASIS[state.comp.basis].label} basis · reference: ${refs().join(' + ') || '— (choose one for selectivity and yield)'} · `
            + 'Conversion = (in − out) / in (consumed components only); Selectivity = (out − in) / reference converted; '
            + 'Yield = (out − in) / reference fed; Yield wof% = out / total feed (mass). Hover a value for its numbers.';
    }

    // ------------------------------------------------------------ filters (same as the Offline Analysis component filter)
    function filterMenu(id, label, items, chosen, onChange, actions = []) {
        const host = document.getElementById(id);
        const groups = {};
        items.forEach(it => { (groups[it.group || ''] = groups[it.group || ''] || []).push(it); });
        host.innerHTML = `<button type="button" class="btn secondary filter-button">${esc(label)}: ${chosen.length} <span>▾</span></button>`
            + `<div class="filter-menu mb-filter-menu">${Object.entries(groups).map(([g, list]) => (g ? `<div class="mb-filter-group">${esc(g)}</div>` : '')
                + list.map(it => `<label><input type="checkbox" value="${esc(it.value)}"${chosen.includes(it.value) ? ' checked' : ''}>${esc(it.label)}</label>`).join('')).join('')}`
            + (actions.length ? `<div class="filter-menu-actions">${actions.map(([key, text]) => `<button type="button" class="filter-link" data-act="${key}">${text}</button>`).join('')}</div>` : '')
            + '</div>';
        const menu = host.querySelector('.filter-menu');
        host.querySelector('.filter-button').onclick = (e) => { e.stopPropagation(); const open = menu.classList.contains('open');
            document.querySelectorAll('.mb-filter-menu.open').forEach(m => m.classList.remove('open')); menu.classList.toggle('open', !open); };
        menu.onclick = (e) => e.stopPropagation();
        menu.querySelectorAll('input').forEach(cb => cb.onchange = () => onChange([...menu.querySelectorAll('input:checked')].map(x => x.value)));
        menu.querySelectorAll('[data-act]').forEach(b => b.onclick = () => onChange(b.dataset.act));
    }
    document.addEventListener('click', () => document.querySelectorAll('.mb-filter-menu.open').forEach(m => m.classList.remove('open')));

    function renderFilters() {
        const u = MB.universe(state.data), r = refs();
        const group = (c) => c.kind === 'liquid' ? 'Liquid' : c.kind === 'lump' ? 'Gas by carbon number' : r.includes(c.name) ? 'Reference'
            : c.fed && !c.formed ? 'In the feed' : c.formed ? 'Formed' : 'Other';
        const order = ['Reference', 'In the feed', 'Formed', 'Other', 'Liquid', 'Gas by carbon number'];
        const items = u.map(c => ({ value: c.name, label: c.kind === 'gas' && c.nC != null ? `${c.name} (C${c.nC})` : c.name, group: group(c) }))
            .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.group === 'Gas by carbon number' ? 0 : a.label.localeCompare(b.label)));
        const reopen = (id) => { const m = document.querySelector(`#${id} .filter-menu`); if (m) m.classList.add('open'); };
        filterMenu('mbCompFilter', 'Components', items, selected(), (v) => {
            state.comp.selected = v === 'all' ? items.map(i => i.value) : v === 'none' ? [] : v === 'default' ? null : v;
            render(); reopen('mbCompFilter');
        }, [['all', 'Select all'], ['none', 'Clear'], ['default', 'Default']]);
        const fed = u.filter(c => c.fed && c.kind !== 'lump').map(c => ({ value: c.name, label: c.name }));
        filterMenu('mbRefFilter', 'Reference', fed, r, (v) => { state.comp.refs = Array.isArray(v) && v.length ? v : null; render(); reopen('mbRefFilter'); });
        filterMenu('mbMetricFilter', 'Values', Object.entries(MB.METRICS).map(([k, l]) => ({ value: k, label: l })), state.comp.metrics, (v) => {
            state.comp.metrics = Object.keys(MB.METRICS).filter(k => v.includes(k)); render(); reopen('mbMetricFilter');
        });
        $('#mbCompBasis').value = state.comp.basis;
        $('#mbIs').value = state.options.is || state.data?.internal_standard || 'Argon';
        $('#mbBasis').value = state.options.basis;
        $('#mbWindow').value = state.options.window_h;
        $('#mbWindowWrap').hidden = state.options.basis !== 'window';
    }

    function render() {
        renderFilters();
        renderReactorTable();
        renderComponentTable();
        $('#kpiMbRows').textContent = results().length;
        $('#kpiMbComps').textContent = (state.data?.components || []).length;
        $('#kpiMbRef').textContent = refs().join(' + ') || '—';
        $('#kpiMbIs').textContent = state.data?.internal_standard || '—';
        save();
    }

    // ------------------------------------------------------------ events
    const recalc = () => { save(); calculate(); };
    $('#mbIs').onchange = () => { state.options.is = $('#mbIs').value; recalc(); };
    $('#mbBasis').onchange = () => { state.options.basis = $('#mbBasis').value; recalc(); };
    $('#mbWindow').onchange = () => { state.options.window_h = Number($('#mbWindow').value) || 2; recalc(); };
    $('#mbReactorFilter').onchange = () => { state.reactor = $('#mbReactorFilter').value; render(); };
    $('#mbCompBasis').onchange = () => { state.comp.basis = $('#mbCompBasis').value; render(); };
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
    document.querySelectorAll('[data-export]').forEach(btn => btn.onclick = () =>
        btn.dataset.export === 'reactors' ? downloadCsv(reactorRows(), 'Reactor_table') : downloadCsv(componentRows(), `Component_table_${state.comp.basis}`));

    calculate();
})();
