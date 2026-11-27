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
    // 6.12.1: the information line and the data checks are hidden until "Show details" is pressed
    let detailsOpen = false;
    function showDetails(count) {
        const info = $('#reformingReactorInfo');
        const checks = $('#reformingReactorChecks');
        if (info) info.style.display = detailsOpen ? '' : 'none';
        if (checks) checks.style.display = detailsOpen && count ? '' : 'none';
        const button = $('#reformingReactorDetails');
        if (button) {
            button.textContent = detailsOpen ? 'Hide details' : `Show details${count ? ` (${count} check${count > 1 ? 's' : ''})` : ''}`;
            button.setAttribute('aria-expanded', String(detailsOpen));
        }
    }

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
                // A GC line without its DHA sample (e.g. the last line of a run): the DHA-based values are "—", not ERROR
                if (!line.dha_uid && String(value ?? '').startsWith('ERROR')) return [column, '—'];
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
    // Why a cell of the sheet is empty: no DHA sample for the line, or a yield row before the yield start (12 h after cut-in)
    function blankNote(line, sec, k) {
        if (!line.dha_uid && sec !== 'performance') return 'No DHA sample for this GC line';
        if ((sec === 'yields' || sec === 'wof') && typeof line.run_length_h === 'number' && line.run_length_h < k.yield_start_h) {
            return `Yields start ${k.yield_start_h} h after the Feed Cut-In (as the sheet): run length ${line.run_length_h.toFixed(2)} h`;
        }
        return '';
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
            showDetails(0);
            return;
        }
        if (empty) empty.style.display = 'none';
        const lines = reactorLines(calc, reactor.reactor);
        const k = calc.constants || {};
        $('#reformingReactorTitle').textContent = `Reactor ${reactor.reactor.slice(1)}${reactor.catalyst ? ` (${reactor.catalyst})` : ''}`;
        const n = v => (typeof v === 'number' ? Number(v.toPrecision(6)) : '—');
        $('#reformingReactorInfo').innerHTML = [
            `${reactor.block} · Feed Cut-In <b>${esc(reactor.feed_cut_in || '—')}</b> · catalyst volume <b>${n(reactor.catalyst_volume)}</b> ml`,
            `Feed (Run Plan): Carbon <b>${n(k.feed_carbon)}</b> wt%${k.feed_carbon_normalised ? ` (normalised 100·C/(C+H) from C ${n(k.feed_carbon_measured)} / H ${n(k.feed_hydrogen_measured)})` : ''} · MW <b>${n(k.feed_mw)}</b> · density <b>${n(k.feed_density)}</b> g/ml`,
            `N2 effluent and H2 inlet flows from the Run Plan DOE of each line's condition`,
            `H2 / N2 vol% from the GC areas: (Area − ${k.calibration?.H2?.intercept}) / ${k.calibration?.H2?.slope} and (Area − ${k.calibration?.N2?.intercept}) / ${k.calibration?.N2?.slope}`,
            `Yields from ${n(k.yield_start_h)} h after cut-in (before: wof% = wt%, yields "—")`,
            ...(lines.some(l => l.reactor_source && l.reactor_source !== 'export') ? [`<b>*</b> ${lines.filter(l => l.reactor_source && l.reactor_source !== 'export').length} lines exported with Sampled_reactor 0 but holding naphtha: reactor taken from the GC sampling cycle`] : []),
            ...(lines.some(l => l.gas_source && l.gas_source !== 'Area') ? [`<b>e</b> ${lines.filter(l => l.gas_source && l.gas_source !== 'Area').length} lines without GC areas: H2 / N2 vol% from ESTD ÷ GC response factor (H2 ${Number(calc.response_factors?.H2).toPrecision(6)}, N2 ${Number(calc.response_factors?.N2).toPrecision(6)}), the same values`] : []),
            ...(lines.some(l => l.condition_note) ? [`<b>c</b> ${lines.filter(l => l.condition_note).length} lines after the planned end of the last DOE condition: that condition is kept`] : []),
            ...(calc.missing?.length ? [`<span style="color:#8b2d22"><b>Missing in the Run Plan:</b> ${esc(calc.missing.join(', '))}</span>`] : []),
        ].join(' · ');
        // Data checks of the operating file (6.11.3): what the sheets could not use as written, nothing is stopped by it
        let checks = $('#reformingReactorChecks');
        if (!checks) {
            $('#reformingReactorInfo').insertAdjacentHTML('afterend', '<div id="reformingReactorChecks" class="rf-checks"></div>');
            checks = $('#reformingReactorChecks');
        }
        const items = calc.data_checks || [];
        checks.innerHTML = items.length ? `<b>Data checks of the operating data (${items.length})</b><ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '';
        showDetails(items.length);
        const section = $('#reformingReactorSection')?.value || '';
        const rows = RR.SHEET_ROWS.filter(([, , , sec]) => !section || sec === section);
        if (thead) {
            const marks = line => {
                const notes = [], sup = [];
                if (line.reactor_source && line.reactor_source !== 'export') { notes.push(`reactor from the ${line.reactor_source}`); sup.push('*'); }
                if (line.gas_source && line.gas_source !== 'Area') { notes.push(`H2 / N2 from ${line.gas_source}`); sup.push('e'); }
                if (line.condition_note) { notes.push(`condition ${line.condition} ${line.condition_note}`); sup.push('c'); }
                return { title: notes.map(n => ` · ${n}`).join(''), sup: sup.length ? `<sup>${sup.join('')}</sup>` : '' };
            };
            thead.innerHTML = `<tr><th class="sticky-col">Parameter</th><th>Unit</th><th>Carbon, wt%</th>${lines.map((line, i) => {
                const m = marks(line);
                return `<th title="${esc(line.date_time)} · GC ${esc(line.gc_date_time)}${esc(m.title)}">#${i + 1}${m.sup}<br><small>${esc(line.date)} ${esc(line.time.slice(0, 5))}</small></th>`;
            }).join('')}</tr>`;
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
                    const note = blankNote(line, sec, k);
                    if (String(text).startsWith('ERROR')) {
                        return !line.dha_uid ? `<td class="rf-not-calc" title="No DHA sample for this GC line">—</td>`
                            : `<td class="error-cell" title="${esc(text)}">ERROR</td>`;
                    }
                    if (text === '' && note) return `<td class="rf-not-calc" title="${esc(note)}">—</td>`;
                    return `<td>${esc(text)}</td>`;
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
        $('#reformingReactorExportCsv')?.insertAdjacentHTML('beforebegin', '<button type="button" class="btn secondary" id="reformingReactorDetails" aria-expanded="false" '
            + 'title="Feed constants, calibration, markers and the data checks of the operating data">Show details</button>');
        $('#reformingReactorDetails')?.addEventListener('click', () => { detailsOpen = !detailsOpen; renderTab(); });
        showDetails(0);
        $('#reformingYieldStart')?.addEventListener('change', () => {
            const value = Number($('#reformingYieldStart').value);
            if (!Number.isFinite(value) || value < 0) return;
            RR.setCalcOptions({ yield_start_h: value });
            refresh(true);
        });
        const step = delta => { decimals = Math.min(8, Math.max(0, decimals + delta)); try { localStorage.setItem(DECIMALS_KEY, String(decimals)); } catch (e) { } renderTab(); };
        $('#reformingReactorDecDecrease')?.addEventListener('click', () => step(-1));
        $('#reformingReactorDecIncrease')?.addEventListener('click', () => step(1));
        // Header row stays on top of the sticky Parameter column when scrolling either way (dashboard.css gives every
        // .online-table first cell z-index 3, which painted the body over the header)
        document.head.insertAdjacentHTML('beforeend', '<style>#reformingReactorTable td.sticky-col{position:sticky;left:0;background:var(--paper,#fbf5e9);z-index:2;white-space:nowrap}'
            + '#reformingReactorTable thead th{position:sticky;top:0;z-index:4;background:#000;color:#fff}'
            + '#reformingReactorTable thead th.sticky-col{left:0;z-index:6;white-space:nowrap}'
            + '#reformingReactorTable tr.reforming-reactor-section td{position:static}'
            + '.rf-not-calc{color:#9a8f80!important;font-weight:400}'
            + '.rf-checks{margin:0 0 10px;padding:8px 12px;border:1px solid #e0b35a;border-left:4px solid #c98a1b;background:#fdf3df;border-radius:6px;font-size:12.5px;color:#5b4210}'
            + '.rf-checks ul{margin:4px 0 0 18px;padding:0}.rf-checks li{margin:2px 0}'
            + '.reforming-reactor-table .reforming-reactor-section td{background:#f1e7d6}.reforming-reactor-table .error-cell{color:#8b2d22;font-weight:700}'
            + '.reforming-yield-start{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700}</style>');
        refresh();
        window.addEventListener('focus', () => refresh());
    });

    window.ILSReformingReactorTab = { refresh, renderTab };
})();
