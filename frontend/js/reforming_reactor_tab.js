// Calculation page, Reforming (6.11.0): "Reactor calculations" tab and the Reforming Base table.
// Both show the reactor sheets of ILS_Chemical Validation_Reforming (Method 2), computed on the server for every reactor
// (backend/reforming/reactor_calc.py, window.ILSReformingReactors.calc). calculation_table.js is not changed: in Reforming
// mode its switchSubtab and reconstructBaseRows are wrapped here; Isomerization / General_MB never load this file's logic.
(() => {
    if (!window.ILSProcess?.isReforming?.()) return;
    const RR = window.ILSReformingReactors;
    if (!RR?.calc) return;
    const $ = selector => document.querySelector(selector);
    const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const DECIMALS_KEY = 'ils_reforming_reactor_decimals';
    let decimals = 4;
    try { const d = Number(localStorage.getItem(DECIMALS_KEY)); if (Number.isInteger(d) && d >= 0 && d <= 8 && localStorage.getItem(DECIMALS_KEY) !== null) decimals = d; } catch (e) { }
    let lastError = '';

    // ------------------------------------------------------------ Base table = the sheet's rows 21-38 per GC line
    const BASE_COLUMNS = [
        ['DateTime', null], ['Condition', 'condition'], ['Run length (h)', 'run_length_h'], ['Reactor', null],
        ['H2 (Rx effluent, vol%)', 'h2_vol'], ['N2 (Rx effluent, vol%)', 'n2_vol'], ['Naphtha (Rx effluent, vol%)', 'naphtha_vol'],
        ['N2 (Rx effluent, NLPH)', 'n2_nlph'], ['Temperature (°C)', 'temperature'], ['Pressure (barg)', 'pressure'],
        ['Mol. Weight (DHA)', 'mw'], ['Carbon_Naphtha (wt%)', 'carbon_naphtha'], ['H2_out (g/h)', 'h2_out'],
        ['Naphtha_out (g/h)', 'naphtha_out'], ['Naphtha_in (feed, g/h)', 'naphtha_feed'], ['Naphtha/H2 (Rx effluent, mass)', 'naphtha_h2'],
        ['LHSV (1/h)', 'lhsv'], ['H2/Naphtha (mol)', 'h2_naphtha_mol'], ['Naphtha/H2 (Rx inlet, mass)', 'naphtha_h2_inlet'],
        ['H2/Naphtha (Rx inlet, mol)', 'h2_naphtha_inlet'],
    ];
    const isoDate = text => {
        const m = String(text || '').match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/);
        return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6] || '00'}` : String(text || '');
    };
    if (typeof reconstructBaseRows === 'function') {
        const generic = reconstructBaseRows;
        window.reconstructBaseRows = function (rawRows, carbon, mw) {
            const calc = RR.calcCached();
            if (!calc?.lines?.length) return generic(rawRows, carbon, mw);
            const rows = calc.lines.map(line => Object.fromEntries(BASE_COLUMNS.map(([column, key]) => {
                if (column === 'DateTime') return [column, isoDate(line.date_time)];
                if (column === 'Reactor') return [column, Number(String(line.reactor).slice(1))];
                const value = line[key];
                return [column, value === undefined ? '' : value];
            })));
            return { rows, columns: BASE_COLUMNS.map(([column]) => column) };
        };
    }

    // ------------------------------------------------------------ Reactor calculations tab
    function showPanel(tabName) {
        const panel = $('#reformingReactorPanel');
        if (panel) panel.hidden = tabName !== 'reforming_reactors';
        if (tabName === 'reforming_reactors') renderTab();
    }
    if (typeof switchSubtab === 'function') {
        const generic = switchSubtab;
        window.switchSubtab = function (tabName) { generic(tabName); showPanel(tabName); };
    }

    const fmt = (value, key) => {
        if (value === null || value === undefined || value === '') return '';
        if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(['date', 'time'].includes(key) ? 0 : decimals) : '';
        return String(value);
    };
    function reactorLines(calc, reactor) { return (calc?.lines || []).filter(line => line.reactor === reactor); }
    function selectedReactor(calc) {
        const select = $('#reformingReactorSelect');
        const reactors = calc?.reactors || [];
        const current = select?.value;
        if (select) {
            select.innerHTML = reactors.map(r => `<option value="${r.reactor}">Reactor ${r.reactor.slice(1)}${r.catalyst ? ` (${esc(r.catalyst)})` : ''} · ${r.lines} lines</option>`).join('');
            select.value = reactors.some(r => r.reactor === current) ? current : (reactors[0]?.reactor || '');
        }
        return reactors.find(r => r.reactor === select?.value) || reactors[0] || null;
    }
    function renderTab() {
        const calc = RR.calcCached();
        const thead = $('#reformingReactorThead');
        const tbody = $('#reformingReactorTbody');
        const empty = $('#reformingReactorEmpty');
        const error = $('#reformingReactorError');
        if (error) { error.textContent = lastError; error.classList.toggle('show', !!lastError); }
        if ($('#reformingYieldStart')) $('#reformingYieldStart').value = RR.calcOptions().yield_start_h;
        if ($('#reformingReactorDecCount')) $('#reformingReactorDecCount').textContent = `${decimals} dp`;
        const reactor = selectedReactor(calc);
        if (!calc || !reactor) {
            if (thead) thead.innerHTML = ''; if (tbody) tbody.innerHTML = '';
            if (empty) empty.style.display = 'block';
            if ($('#reformingReactorInfo')) $('#reformingReactorInfo').textContent = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        const lines = reactorLines(calc, reactor.reactor);
        const k = calc.constants || {};
        $('#reformingReactorTitle').textContent = `Reactor ${reactor.reactor.slice(1)}${reactor.catalyst ? ` (${reactor.catalyst})` : ''}`;
        const n = v => (typeof v === 'number' ? Number(v.toPrecision(6)) : '—');
        $('#reformingReactorInfo').innerHTML = [
            `${reactor.block} · Feed Cut-In <b>${esc(reactor.feed_cut_in || '—')}</b> · catalyst volume <b>${n(reactor.catalyst_volume)}</b> ml`,
            `Feed (Run Plan): Carbon <b>${n(k.feed_carbon)}</b> wt% · MW <b>${n(k.feed_mw)}</b> · density <b>${n(k.feed_density)}</b> g/ml`,
            `N2 effluent and H2 inlet flows from the Run Plan DOE of each line's condition`,
            `H2 / N2 vol% from the GC areas: (Area − ${k.calibration?.H2?.intercept}) / ${k.calibration?.H2?.slope} and (Area − ${k.calibration?.N2?.intercept}) / ${k.calibration?.N2?.slope}`,
            `Yields from ${n(k.yield_start_h)} h after cut-in (before: wof% = wt%)`,
            ...(calc.missing?.length ? [`<span style="color:#8b2d22"><b>Missing in the Run Plan:</b> ${esc(calc.missing.join(', '))}</span>`] : []),
        ].join(' · ');
        const section = $('#reformingReactorSection')?.value || '';
        const rows = RR.SHEET_ROWS.filter(([, , , sec]) => !section || sec === section);
        if (thead) {
            thead.innerHTML = `<tr><th class="sticky-col">Parameter</th><th>Unit</th><th>Carbon, wt%</th>${lines.map((line, i) =>
                `<th title="${esc(line.date_time)} · GC ${esc(line.gc_date_time)}">#${i + 1}<br><small>${esc(line.date)} ${esc(line.time.slice(0, 5))}</small></th>`).join('')}</tr>`;
        }
        if (tbody) {
            let lastSection = null;
            tbody.innerHTML = rows.map(([label, unit, key, sec]) => {
                const header = sec !== lastSection && !section
                    ? `<tr class="reforming-reactor-section"><td colspan="${lines.length + 3}"><b>${{ performance: 'Catalyst performance', wt: 'Components (DHA, wt%)', wof: 'Components (wof%, with H2 generation)', yields: 'Group types and yields' }[sec]}</b></td></tr>` : '';
                lastSection = sec;
                const component = typeof key === 'object' && (key.wt || key.wof);
                const factor = component ? calc.carbon_fraction?.[component] : '';
                return header + `<tr><td class="sticky-col">${esc(label)}</td><td>${esc(unit)}</td><td>${factor === '' || factor === undefined ? '' : factor}</td>${lines.map(line => {
                    const value = RR.sheetValue(line, key);
                    const text = fmt(value, key);
                    return `<td${String(text).startsWith('ERROR') ? ' class="error-cell" title="' + esc(text) + '"' : ''}>${esc(String(text).startsWith('ERROR') ? 'ERROR' : text)}</td>`;
                }).join('')}</tr>`;
            }).join('');
        }
    }

    function exportCsv() {
        const calc = RR.calcCached();
        const reactor = selectedReactor(calc);
        if (!calc || !reactor) return;
        const lines = reactorLines(calc, reactor.reactor);
        const cell = value => { const t = String(value ?? '').replace(/"/g, '""'); return /[",\n]/.test(t) ? `"${t}"` : t; };
        const out = [['Parameter', 'Unit', 'Carbon, wt%', ...lines.map((_, i) => `#${i + 1}`)].map(cell).join(',')];
        RR.SHEET_ROWS.forEach(([label, unit, key]) => {
            const component = typeof key === 'object' && (key.wt || key.wof);
            out.push([label, unit, component ? calc.carbon_fraction?.[component] ?? '' : '', ...lines.map(line => {
                const v = RR.sheetValue(line, key); return typeof v === 'number' ? v : (v ?? '');
            })].map(cell).join(','));
        });
        const blob = new Blob([String.fromCharCode(0xFEFF) + out.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Reactor_${reactor.reactor.slice(1)}${reactor.catalyst ? `_${reactor.catalyst}` : ''}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }

    // Recalculate (when the inputs changed) and refresh every Reforming table on the page
    async function refresh(force = false) {
        const outcome = await RR.calc(force);
        lastError = outcome.error || '';
        if (outcome.result && (outcome.changed || force)) {
            if (typeof loadFromOnlineState === 'function') loadFromOnlineState();     // Base table
            window.ILSReformingCarbon?.render?.();
            window.ILSReformingCarbon?.renderSummary?.();
        }
        renderTab();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const tab = $('#tabReformingReactors');
        if (tab) tab.hidden = false;     // calculation_table.js wires every .table-tab to switchSubtab (wrapped above)
        $('#reformingReactorSelect')?.addEventListener('change', renderTab);
        $('#reformingReactorSection')?.addEventListener('change', renderTab);
        $('#reformingReactorExportCsv')?.addEventListener('click', exportCsv);
        $('#reformingYieldStart')?.addEventListener('change', () => {
            const value = Number($('#reformingYieldStart').value);
            if (!Number.isFinite(value) || value < 0) return;
            RR.setCalcOptions({ yield_start_h: value });
            refresh(true);
        });
        const step = delta => { decimals = Math.min(8, Math.max(0, decimals + delta)); try { localStorage.setItem(DECIMALS_KEY, String(decimals)); } catch (e) { } renderTab(); };
        $('#reformingReactorDecDecrease')?.addEventListener('click', () => step(-1));
        $('#reformingReactorDecIncrease')?.addEventListener('click', () => step(1));
        document.head.insertAdjacentHTML('beforeend', '<style>.reforming-reactor-table .sticky-col{position:sticky;left:0;background:var(--paper,#fbf5e9);z-index:1;white-space:nowrap}'
            + '.reforming-reactor-table th.sticky-col{background:var(--navy,#071a2d);color:#fbf5e9;z-index:2}'
            + '.reforming-reactor-table .reforming-reactor-section td{background:#f1e7d6}.reforming-reactor-table .error-cell{color:#8b2d22;font-weight:700}'
            + '.reforming-yield-start{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700}</style>');
        refresh();
        window.addEventListener('focus', () => refresh());
    });

    window.ILSReformingReactorTab = { refresh, renderTab };
})();
