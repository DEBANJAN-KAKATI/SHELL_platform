// Calculation page, Reforming mode: "Reforming CARBON_TABULAR(%WGT)" tab.
// Rows come from the Offline Analysis (ils_reforming_offline); Condition comes from the
// Run Plan DOE (assignBaseConditions in calculation_table.js). The table state is saved as
// ils_reforming_carbon_state ({rows, columns}) for Data Integrity and the Historian.
window.ILSReformingCarbon = (() => {
    const active = !!window.ILSProcess?.isReforming();
    const STATE_KEY = 'ils_reforming_carbon_state';
    const SUMMARY_STATE_KEY = 'ils_reforming_summary_state';
    const DECIMALS_KEY = 'ils_reforming_decimals';
    const LEAD_COLUMNS = ['Date', 'Condition', 'TOS(h)', 'Reactor', 'UID'];
    const PROPERTY_LABELS = {
        'Total': 'Total', 'Molecular Weight': 'Molecular Weight', 'RON': 'RON',
        'Carbon': 'Carbon wt%', 'Hydrogen': 'Hydrogen wt%', 'Specific Gravity': 'Specific Gravity'
    };
    const $ = selector => document.querySelector(selector);

    let rows = [];
    let columns = []; // flat keys: LEAD_COLUMNS + 'Paraffins C1' ... + properties
    let summaryRows = [];
    const PHYSICAL = ['Molecular Weight', 'RON', 'Carbon', 'Hydrogen', 'Specific Gravity'];
    const SUMMARY_FAMILIES = ['Paraffins', 'Iso Paraffins', 'Naphthenes', 'Aromatics', 'Olefins', 'Unknowns'];
    const BASE_SUMMARY_COLUMNS = ['Date', 'Condition', 'TOS(h)', 'Reactor', 'UID', ...SUMMARY_FAMILIES, 'Total', ...PHYSICAL];
    // 6.11.0: plus the reactor calculation of the sample's GC line (H2 generation, Gas, C5+, wof%, T, P, LHSV, ratios)
    const EXTRA_COLUMNS = new Set((window.ILSReformingReactors?.SUMMARY_EXTRA || []).map(([column]) => column));
    const SUMMARY_COLUMNS = [...BASE_SUMMARY_COLUMNS, ...(window.ILSReformingReactors?.SUMMARY_EXTRA || []).map(([column]) => column)];
    let decimals = 4;
    try {
        const saved = Number(localStorage.getItem(DECIMALS_KEY));
        if (Number.isInteger(saved) && saved >= 0 && saved <= 6 && localStorage.getItem(DECIMALS_KEY) !== null) decimals = saved;
    } catch (error) {}

    const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    function readJson(storage, key) {
        try { return JSON.parse(storage.getItem(key) || 'null'); } catch (error) { return null; }
    }

    // ---------------------------------------------------------------- several reactors (6.10.1 / 6.10.2)
    // Reactor, block and TOS origin of each sample come from window.ILSReformingReactors (reforming_reactors.js, shared
    // with the Offline page): each DHA sample takes the reactor of its own GC line in the operating data.
    const RR = window.ILSReformingReactors;
    const MATCH_BEFORE_MS = 10 * 60000;   // Export Complete CSV pairing window (same as RR)
    const MATCH_AFTER_MS = 60 * 60000;
    const loadReactorLines = () => RR.load();

    // DOE condition of the sample's own reactor (DOE rows with a Reactor ID); without a reactor: the dates only
    function assignReactorConditions(sorted) {
        const { doeRows } = RR.plan();
        const ranges = doeRows.map(row => ({
            condition: String(doeValue(row, 'Condition No.') || row.Condition || '').trim(),
            reactor: RR.norm(doeValue(row, 'Reactor ID')),
            start: parseDoeBoundary(doeValue(row, 'Start Date'), false),
            end: parseDoeBoundary(doeValue(row, 'End Date'), true),
        })).filter(range => range.condition && range.start && range.end && range.start <= range.end);
        sorted.forEach(row => {
            const date = parseCalcDateTime(row.DateTime);
            const reactor = RR.isReactor(row.Reactor) ? row.Reactor : '';
            const hits = date ? ranges.filter(range => date >= range.start && date < range.end
                && (!reactor || !range.reactor || range.reactor === reactor)) : [];
            const matches = [...new Set(hits.map(range => range.condition))];
            row.Condition = row._bypass ? 'Bypass' : matches.length === 1 ? matches[0]
                : matches.length > 1 ? (reactor ? `ERROR: Ambiguous DOE conditions (${matches.join(', ')})` : '') : '';
        });
    }

    // Base table (Reforming only): the GC lines of every reactor are listed, and a line's Condition is the DOE row of
    // its own reactor, because reactors can run different conditions at the same time. calculation_table.js is not
    // changed: its date-only assignBaseConditions is wrapped here in Reforming mode (bypass lines keep the date match).
    if (active && typeof assignBaseConditions === 'function') {
        const dateOnly = assignBaseConditions;
        window.assignBaseConditions = function (rows, columns, flagAmbiguous = false) {
            const result = dateOnly(rows, columns, flagAmbiguous);
            const { doeRows } = RR.plan();
            const ranges = doeRows.map(row => ({
                condition: String(doeValue(row, 'Condition No.') || row.Condition || '').trim(),
                reactor: RR.norm(doeValue(row, 'Reactor ID')),
                start: parseDoeBoundary(doeValue(row, 'Start Date'), false),
                end: parseDoeBoundary(doeValue(row, 'End Date'), true),
            })).filter(range => range.condition && range.reactor && range.start && range.end && range.start <= range.end);
            if (!ranges.length) return result;
            (result.rows || rows).forEach(row => {
                const reactor = RR.norm(row.Reactor ?? row.Sampled_reactor);
                if (!RR.isReactor(reactor)) return;
                const date = parseCalcDateTime(row.DateTime ?? row['Date/Time'] ?? row['Date and Time']);
                const matches = [...new Set(date ? ranges.filter(range => range.reactor === reactor && date >= range.start && date < range.end)
                    .map(range => range.condition) : [])];
                row.Condition = matches.length === 1 ? matches[0]
                    : matches.length > 1 && flagAmbiguous ? `ERROR: Ambiguous DOE conditions (${matches.join(', ')})` : '';
            });
            return result;
        };
    }

    // Column groups for the two-row header: [{label, keys:[...], carbon:true|false}]
    function groupsOf(flatColumns) {
        const groups = [];
        flatColumns.forEach(key => {
            const match = key.match(/^(.*) C(\d+)$/);
            const label = match ? match[1] : (PROPERTY_LABELS[key] || key);
            const last = groups[groups.length - 1];
            if (match && last && last.carbon && last.label === label) last.keys.push(key);
            else groups.push({ label, keys: [key], carbon: !!match });
        });
        return groups;
    }

    // Display grouping only (the CSV export keeps groupsOf): the five properties after Total
    // sit under one "Physical Properties" header, like a carbon family.
    function displayGroups(dataColumns) {
        const groups = [];
        groupsOf(dataColumns).forEach(group => {
            const key = group.keys[0];
            if (!group.carbon && PHYSICAL.includes(key)) {
                const last = groups[groups.length - 1];
                if (last && last.physical) last.keys.push(key);
                else groups.push({ label: 'Physical Properties', keys: [key], physical: true });
            } else {
                groups.push(group);
            }
        });
        return groups;
    }

    const subLabel = (group, key) => group.carbon ? key.match(/ (C\d+)$/)[1] : (PROPERTY_LABELS[key] || key);

    function build() {
        const offline = readJson(sessionStorage, 'ils_reforming_offline');
        if (!offline || !Array.isArray(offline.rows) || !offline.rows.length) {
            rows = [];
            columns = [];
            summaryRows = [];
            try { sessionStorage.removeItem(SUMMARY_STATE_KEY); } catch (error) {}
            return;
        }
        const dataColumns = (offline.columns || []).filter(column => !['File Name', 'UID', 'DateTime'].includes(column));
        const sorted = sortDateTimeRows(offline.rows.map(row => ({ ...row })));
        const firstSample = sorted.map(row => parseCalcDateTime(row.DateTime)).find(Boolean);
        // Reactor of every sample from its GC line; ERROR text when it cannot be known (never a guessed reactor)
        const found = RR.assign(sorted, row => row.DateTime);
        sorted.forEach((row, index) => {
            const f = found[index];
            row._feed = !!f.feed;
            row._bypass = !!f.bypass;
            row._block = f.block || '';
            row.Reactor = f.reactor || f.error || '';
        });
        assignReactorConditions(sorted);
        rows = sorted.map(row => {
            const date = parseCalcDateTime(row.DateTime);
            const feed = row._feed;
            // TOS from the Feed Cut-In of the reactor's block (reactors of Block-1 and Block-2 can start apart)
            const origin = RR.cutInOf(row._block) ?? firstSample?.getTime() ?? null;
            const out = {
                Date: row.DateTime,
                DateTime: row.DateTime,
                Condition: feed ? 'Feed' : row.Condition,
                'TOS(h)': !feed && !row._bypass && date && origin !== null ? Math.round((date.getTime() - origin) / 36000) / 100 : null,
                Reactor: feed ? '' : row.Reactor,
                UID: row.UID,
                'File Name': row['File Name'],
            };
            dataColumns.forEach(column => { out[column] = row[column]; });
            return out;
        });
        columns = [...LEAD_COLUMNS, ...dataColumns];
        const calc = RR.calcCached();
        summaryRows = rows.map(row => {
            const summary = Object.fromEntries(SUMMARY_COLUMNS.map(column => [column, row[column] ?? '']));
            SUMMARY_FAMILIES.forEach(family => {
                summary[family] = Array.from({ length: 15 }, (_, index) => index + 1).reduce((total, number) => {
                    const value = Number(row[`${family} C${number}`]);
                    return total + (Number.isFinite(value) ? value : 0);
                }, 0);
            });
            summary.Total = SUMMARY_FAMILIES
                .reduce((total, family) => total + summary[family], 0);
            // Reactor calculation of this sample's GC line (blank until it is calculated; ERROR text when inputs are missing)
            const line = calc ? RR.lineOfSample(calc, row.UID, row.DateTime) : null;
            RR.SUMMARY_EXTRA.forEach(([column, key]) => {
                const value = line ? RR.sheetValue(line, key) : '';
                summary[column] = value === undefined || value === null ? '' : value;
            });
            // Why the calculated columns are blank (shown as "—" with a tooltip; the stored values stay blank for Plots)
            const startH = calc?.constants?.yield_start_h;
            Object.defineProperty(summary, '__calcNote', { enumerable: false, value: !calc ? 'Not calculated yet (Reactor calculations)'
                : !line ? 'No GC line of a reactor for this DHA sample (feed, bypass or outside −10..+60 min)'
                : typeof line.run_length_h === 'number' && line.run_length_h < startH ? `Yields start ${startH} h after the Feed Cut-In (as the sheet): run length ${line.run_length_h.toFixed(2)} h` : '' });
            return summary;
        });
        try {
            sessionStorage.setItem(SUMMARY_STATE_KEY, JSON.stringify({ rows: summaryRows, columns: SUMMARY_COLUMNS }));
        } catch (error) {}
        try {
            sessionStorage.setItem(STATE_KEY, JSON.stringify({ rows, columns, groups: groupsOf(dataColumns) }));
        } catch (error) {}
    }

    // Reactor filter (6.10.2): All, one reactor, "Feed / bypass" or "No reactor (ERROR)"
    function reactorKey(row) {
        if (RR.isReactor(row.Reactor)) return row.Reactor;
        if (String(row.Reactor || '').startsWith('ERROR')) return '__error__';
        return '__feed__';
    }
    function fillReactorFilter(selector, source) {
        const select = $(selector);
        if (!select) return;
        const current = select.value;
        // Every reactor of the experiment (Run Plan: role Catalyst or Inert) is listed, also before it has samples
        const counts = Object.fromEntries(RR.plan().active.map(reactor => [reactor, 0]));
        source.forEach(row => { const key = reactorKey(row); counts[key] = (counts[key] || 0) + 1; });
        const reactors = Object.keys(counts).filter(RR.isReactor).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const options = [['', `All reactors (${source.length})`], ...reactors.map(r => [r, `${r} (${counts[r]})`])];
        if (counts.__feed__) options.push(['__feed__', `Feed / bypass (${counts.__feed__})`]);
        if (counts.__error__) options.push(['__error__', `No reactor – ERROR (${counts.__error__})`]);
        select.innerHTML = options.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('');
        select.value = options.some(([value]) => value === current) ? current : '';
    }
    const reactorPasses = (selector, row) => { const value = $(selector)?.value || ''; return !value || reactorKey(row) === value; };

    function filtered() {
        const from = parseFilterTimestamp($('#reformingFrom')?.value);
        const to = parseFilterTimestamp($('#reformingTo')?.value);
        const query = ($('#reformingSearch')?.value || '').toLowerCase().trim();
        return rows.filter(row => {
            if (!reactorPasses('#reformingReactorFilter', row)) return false;
            const time = parseCalcDateTime(row.Date)?.getTime();
            if (from !== null && from !== undefined && (time === undefined || time < from)) return false;
            if (to !== null && to !== undefined && (time === undefined || time > to)) return false;
            return !query || LEAD_COLUMNS.some(column => String(row[column] ?? '').toLowerCase().includes(query));
        });
    }

    function cellText(column, value) {
        if (value === null || value === undefined || value === '') return '';
        if (column === 'TOS(h)') return Number(value).toFixed(2);
        return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : String(value);
    }

    function render() {
        build();
        fillReactorFilter('#reformingReactorFilter', rows);
        const visible = filtered();
        const dataColumns = columns.slice(LEAD_COLUMNS.length);
        const groups = displayGroups(dataColumns);
        // Dark line where a family / Total / Physical Properties starts, light line between its sub-columns.
        const cellClass = {};
        groups.forEach(group => group.keys.forEach((key, index) => { cellClass[key] = index === 0 ? 'rf-group-start' : 'rf-sub'; }));
        const thead = $('#reformingThead');
        if (thead) {
            const multi = group => group.carbon || group.physical;
            const top = LEAD_COLUMNS.map(column => `<th rowspan="2">${esc(column)}</th>`).join('') +
                groups.map(group => multi(group)
                    ? `<th colspan="${group.keys.length}" class="rf-group-start rf-group-head">${esc(group.label)}</th>`
                    : `<th rowspan="2" class="rf-group-start">${esc(group.label)}</th>`).join('');
            const bottom = groups.filter(multi)
                .map(group => group.keys.map(key => `<th class="${cellClass[key]}">${esc(subLabel(group, key))}</th>`).join('')).join('');
            thead.innerHTML = columns.length ? `<tr>${top}</tr><tr class="rf-sub-head">${bottom}</tr>` : '';
            const firstRow = thead.querySelector('tr');
            const table = $('#reformingTable');
            if (firstRow && table) table.style.setProperty('--rf-head1', `${firstRow.getBoundingClientRect().height}px`);
        }

        const tbody = $('#reformingTbody');
        if (tbody) {
            tbody.innerHTML = visible.map(row =>
                `<tr>${columns.map(column => `<td${cellClass[column] ? ` class="${cellClass[column]}"` : ''}>${esc(cellText(column, row[column]))}</td>`).join('')}</tr>`).join('');
        }
        if ($('#reformingEmpty')) $('#reformingEmpty').style.display = visible.length ? 'none' : 'block';
        if ($('#reformingDecCount')) $('#reformingDecCount').textContent = `${decimals} dp`;
        if ($('#reformingDateBadge')) {
            $('#reformingDateBadge').textContent = rows.length ? `${visible.length} of ${rows.length} samples` : '';
        }
    }

    function filteredSummary() {
        const from = parseFilterTimestamp($('#reformingSummaryFrom')?.value);
        const to = parseFilterTimestamp($('#reformingSummaryTo')?.value);
        const query = ($('#reformingSummarySearch')?.value || '').toLowerCase().trim();
        return summaryRows.filter(row => {
            if (!reactorPasses('#reformingSummaryReactorFilter', row)) return false;
            const time = parseCalcDateTime(row.Date)?.getTime();
            if (from !== null && (time === undefined || time < from)) return false;
            if (to !== null && (time === undefined || time > to)) return false;
            return !query || SUMMARY_COLUMNS.some(column => String(row[column] ?? '').toLowerCase().includes(query));
        });
    }

    function renderSummary() {
        build();
        fillReactorFilter('#reformingSummaryReactorFilter', summaryRows);
        const visible = filteredSummary();
        const thead = $('#reformingSummaryThead');
        const tbody = $('#reformingSummaryTbody');
        if (thead) thead.innerHTML = `<tr>${SUMMARY_COLUMNS.map(column => `<th>${esc(column)}</th>`).join('')}</tr>`;
        if (tbody) tbody.innerHTML = visible.map(row =>
            `<tr>${SUMMARY_COLUMNS.map(column => {
                const text = cellText(column, row[column]);
                if (text === '' && row.__calcNote && EXTRA_COLUMNS.has(column)) return `<td class="rf-not-calc" title="${esc(row.__calcNote)}">—</td>`;
                return `<td>${esc(text)}</td>`;
            }).join('')}</tr>`).join('');
        if ($('#reformingSummaryEmpty')) $('#reformingSummaryEmpty').style.display = visible.length ? 'none' : 'block';
        if ($('#reformingSummaryDateBadge')) $('#reformingSummaryDateBadge').textContent = summaryRows.length ? `${visible.length} of ${summaryRows.length} samples` : '';
        if ($('#reformingSummaryDecCount')) $('#reformingSummaryDecCount').textContent = `${decimals} dp`;
    }

    function exportSummaryCsv() {
        const visible = filteredSummary();
        if (!visible.length) { showCalcError('No reforming summary data available to export.'); return; }
        const csvCell = value => {
            const text = String(value ?? '').replace(/"/g, '""');
            return /[",\n]/.test(text) ? `"${text}"` : text;
        };
        const lines = [
            SUMMARY_COLUMNS.map(csvCell).join(','),
            ...visible.map(row => SUMMARY_COLUMNS.map(column => csvCell(cellText(column, row[column]))).join(','))
        ];
        const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reforming_Component_Summary_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    }

    function exportCsv() {
        const visible = filtered();
        if (!visible.length) {
            showCalcError('No data available to export.');
            return;
        }
        showCalcError();
        const csvCell = value => {
            const text = String(value ?? '').replace(/"/g, '""');
            return /[",\n]/.test(text) ? `"${text}"` : text;
        };
        const dataColumns = columns.slice(LEAD_COLUMNS.length);
        const top = [...LEAD_COLUMNS];
        const bottom = LEAD_COLUMNS.map(() => '');
        groupsOf(dataColumns).forEach(group => {
            group.keys.forEach((key, index) => {
                top.push(index === 0 ? group.label : '');
                bottom.push(group.carbon ? key.match(/ (C\d+)$/)[1] : '');
            });
        });
        // Excel turns a plain "dd/mm/yyyy hh:mm" into a date serial (46303.66875) that shows up as a number
        // when copied to another workbook; ="..." keeps the Date exactly as displayed. Export only.
        const dateCell = value => (value ? `="${String(value).replace(/"/g, '')}"` : '');
        const header = [top, bottom].map(line => line.map(csvCell).join(','));
        const body = visible.map(row => columns.map(column =>
            column === 'Date' ? dateCell(cellText(column, row[column])) : csvCell(cellText(column, row[column]))).join(','));
        const lines = [...header, ...body];
        const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reforming_CARBON_TABULAR_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    // "Export Complete": Raw Data layout of ILS_Chemical Validation_Reforming.xlsx. One row per
    // operating record (Online Analysis file); a DHA sample joins the record whose GC Date/Time is
    // closest before its injection (DHA file time = GC Date/Time, injection ~13 min later).
    // DHA samples without an operating record (before/after the file) are kept with blank operating data.
    async function exportComplete() {
        build();
        if (!rows.length) {
            showCalcError('No reforming DHA data to export. Process the DHA folder on the Offline Analysis page first.');
            return;
        }
        const online = readJson(sessionStorage, 'dhaOnlineState') || readJson(localStorage, 'dhaOnlineState');
        if (!online?.path) {
            showCalcError('Load the operating data (.txt) on the Online Analysis page first.');
            return;
        }
        const button = $('#reformingExportComplete');
        const oldText = button.textContent;
        button.disabled = true;
        button.textContent = 'Exporting...';
        try {
            const operating = await RR.fetchOperating();
            showCalcError();
            downloadComplete(operating);
        } catch (error) {
            showCalcError(error.message);
        } finally {
            button.disabled = false;
            button.textContent = oldText;
        }
    }

    function downloadComplete(operating) {
        const dataColumns = columns.slice(LEAD_COLUMNS.length);
        const table = RR.completeTable(operating, rows, dataColumns);
        const output = table.entries;

        const from = parseFilterTimestamp($('#reformingFrom')?.value);
        const to = parseFilterTimestamp($('#reformingTo')?.value);
        const visible = output.filter(entry => (from === null || (entry.key !== null && entry.key >= from)) &&
            (to === null || (entry.key !== null && entry.key <= to)));

        const text = value => (value === null || value === undefined || value === '' ? '' : `="${String(value).replace(/"/g, '')}"`);
        const csvCell = value => {
            const str = String(value ?? '').replace(/"/g, '""');
            return /[",\n]/.test(str) ? `"${str}"` : str;
        };

        // Operating data (valid columns only, chosen by the server), then DHA Date/Time and the carbon table.
        const { top, units } = table;
        const textColumns = new Set(['Date/Time', 'GC Date/Time']);

        const body = visible.map(({ op, dha }) => [
            ...operating.columns.map(column => (op ? (textColumns.has(column) ? text(op[column]) : csvCell(op[column])) : '')),
            dha ? text(dha.Date) : '',
            ...dataColumns.map(column => (dha ? csvCell(cellText(column, dha[column])) : '')),
        ].join(','));
        const lines = [top.map(csvCell).join(','), units.map(csvCell).join(','), ...body];
        const blob = new Blob([String.fromCharCode(0xFEFF) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reforming_Complete_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function changeDecimals(delta) {
        decimals = Math.min(6, Math.max(0, decimals + delta));
        try { localStorage.setItem(DECIMALS_KEY, String(decimals)); } catch (error) {}
        render();
        renderSummary();
    }

    if (active) {
        document.addEventListener('DOMContentLoaded', () => {
            const reformingTab = $('#tabReformingCarbon');
            const reformingSummaryTab = $('#tabReformingSummary');
            const yieldTab = $('#tabYieldTable');
            if (reformingTab) reformingTab.hidden = false;
            if (reformingSummaryTab) reformingSummaryTab.hidden = false;
            if (yieldTab) yieldTab.hidden = true;
            if (calcState.activeSubtab === 'yield_table') switchSubtab('base_table');

            $('#reformingDecDecrease').onclick = () => changeDecimals(-1);
            $('#reformingDecIncrease').onclick = () => changeDecimals(1);
            $('#reformingExportCsv').onclick = exportCsv;
            $('#reformingExportComplete').onclick = exportComplete;
            $('#reformingSummaryExportCsv').onclick = exportSummaryCsv;
            $('#reformingSearch').oninput = render;
            if ($('#reformingReactorFilter')) $('#reformingReactorFilter').onchange = render;
            if ($('#reformingSummaryReactorFilter')) $('#reformingSummaryReactorFilter').onchange = renderSummary;
            $('#reformingFrom').oninput = render;
            $('#reformingTo').oninput = render;
            $('#reformingClearDates').onclick = () => {
                $('#reformingFrom').value = '';
                $('#reformingTo').value = '';
                render();
            };
            $('#reformingSummarySearch').oninput = renderSummary;
            $('#reformingSummaryFrom').oninput = renderSummary;
            $('#reformingSummaryTo').oninput = renderSummary;
            $('#reformingSummaryClearDates').onclick = () => {
                $('#reformingSummaryFrom').value = '';
                $('#reformingSummaryTo').value = '';
                renderSummary();
            };
            $('#reformingSummaryDecDecrease').onclick = () => changeDecimals(-1);
            $('#reformingSummaryDecIncrease').onclick = () => changeDecimals(1);
            render();
            renderSummary();
            loadReactorLines().then(changed => { if (changed) { render(); renderSummary(); } });
            window.addEventListener('storage', event => {
                if (event.key === 'ils_reforming_offline' || event.key === 'runPlanDashboardState') {
                    render();
                    renderSummary();
                }
            });
            window.addEventListener('focus', () => {
                render(); renderSummary();
                loadReactorLines().then(changed => { if (changed) { render(); renderSummary(); } });
            });
        });
    }

    return { active, render, renderSummary, loadReactorLines };
})();
