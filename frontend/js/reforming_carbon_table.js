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
    const SUMMARY_COLUMNS = ['Date', 'Condition', 'TOS(h)', 'Reactor', 'UID', ...SUMMARY_FAMILIES, 'Total', ...PHYSICAL];
    let decimals = 4;
    try {
        const saved = Number(localStorage.getItem(DECIMALS_KEY));
        if (Number.isInteger(saved) && saved >= 0 && saved <= 6 && localStorage.getItem(DECIMALS_KEY) !== null) decimals = saved;
    } catch (error) {}

    const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

    function readJson(storage, key) {
        try { return JSON.parse(storage.getItem(key) || 'null'); } catch (error) { return null; }
    }

    function runPlanInfo() {
        const plan = readJson(sessionStorage, 'runPlanDashboardState');
        const info = {};
        (plan?.planData?.info || []).forEach(item => { info[String(item.parameter).trim().toLowerCase()] = item.value; });
        const reactor = plan?.summary?.active_reactors?.[0]
            || plan?.doeData?.rows?.map(row => String(row['Reactor ID'] || row[Object.keys(row).find(key => key.replace(/\n/g, ' ').trim() === 'Reactor ID')] || '').trim()).find(Boolean)
            || 'R1';
        return { info, reactor };
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
        const { info, reactor } = runPlanInfo();
        const cutIn = parseCalcDateTime(info['feed cut-in']);
        const feedId = String(info['feed sl id'] || '').trim().toUpperCase();

        const sorted = sortDateTimeRows(offline.rows.map(row => ({ ...row })));
        const firstSample = sorted.map(row => parseCalcDateTime(row.DateTime)).find(Boolean);
        const origin = cutIn || firstSample;
        const isFeed = row => !!feedId && String(row.UID || '').toUpperCase().includes(feedId);

        const withConditions = assignBaseConditions(sorted, ['DateTime', 'Condition']).rows;
        rows = withConditions.map(row => {
            const date = parseCalcDateTime(row.DateTime);
            const feed = isFeed(row);
            const out = {
                Date: row.DateTime,
                DateTime: row.DateTime,
                Condition: feed ? 'Feed' : row.Condition,
                'TOS(h)': !feed && date && origin ? Math.round((date - origin) / 36000) / 100 : null,
                Reactor: feed ? '' : reactor,
                UID: row.UID,
                'File Name': row['File Name'],
            };
            dataColumns.forEach(column => { out[column] = row[column]; });
            return out;
        });
        columns = [...LEAD_COLUMNS, ...dataColumns];
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
            return summary;
        });
        try {
            sessionStorage.setItem(SUMMARY_STATE_KEY, JSON.stringify({ rows: summaryRows, columns: SUMMARY_COLUMNS }));
        } catch (error) {}
        try {
            sessionStorage.setItem(STATE_KEY, JSON.stringify({ rows, columns, groups: groupsOf(dataColumns) }));
        } catch (error) {}
    }

    function filtered() {
        const from = parseFilterTimestamp($('#reformingFrom')?.value);
        const to = parseFilterTimestamp($('#reformingTo')?.value);
        const query = ($('#reformingSearch')?.value || '').toLowerCase().trim();
        return rows.filter(row => {
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
            const time = parseCalcDateTime(row.Date)?.getTime();
            if (from !== null && (time === undefined || time < from)) return false;
            if (to !== null && (time === undefined || time > to)) return false;
            return !query || SUMMARY_COLUMNS.some(column => String(row[column] ?? '').toLowerCase().includes(query));
        });
    }

    function renderSummary() {
        build();
        const visible = filteredSummary();
        const thead = $('#reformingSummaryThead');
        const tbody = $('#reformingSummaryTbody');
        if (thead) thead.innerHTML = `<tr>${SUMMARY_COLUMNS.map(column => `<th>${esc(column)}</th>`).join('')}</tr>`;
        if (tbody) tbody.innerHTML = visible.map(row =>
            `<tr>${SUMMARY_COLUMNS.map(column => `<td>${esc(cellText(column, row[column]))}</td>`).join('')}</tr>`).join('');
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
    const MATCH_BEFORE_MS = 10 * 60000;
    const MATCH_AFTER_MS = 60 * 60000;

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
            const response = await fetch('/api/reforming/operating-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: online.path }),
            });
            let operating;
            try {
                operating = JSON.parse(await response.text());
            } catch (error) {
                throw new Error('The dashboard server is running older code. Close the dashboard window and start run_dashboard.bat again, then retry Export Complete.');
            }
            if (!response.ok) throw new Error(operating.error || 'Could not read the operating data file.');
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
        const time = value => parseCalcDateTime(value)?.getTime() ?? null;
        const opRows = operating.rows.map(row => ({ op: row, gc: time(row['GC Date/Time']), dha: null }));
        const dhaRows = rows.map(row => ({ row, at: time(row.Date), used: false }));

        // Closest pairs first; each record and each DHA sample is used once.
        const pairs = [];
        opRows.forEach((op, i) => dhaRows.forEach((dha, j) => {
            if (op.gc === null || dha.at === null) return;
            const diff = dha.at - op.gc;
            if (diff >= -MATCH_BEFORE_MS && diff <= MATCH_AFTER_MS) pairs.push({ i, j, gap: Math.abs(diff) });
        }));
        pairs.sort((a, b) => a.gap - b.gap).forEach(({ i, j }) => {
            if (opRows[i].dha || dhaRows[j].used) return;
            opRows[i].dha = dhaRows[j].row;
            dhaRows[j].used = true;
        });
        const output = [
            ...opRows.map(entry => ({ op: entry.op, dha: entry.dha, key: entry.dha ? time(entry.dha.Date) : entry.gc })),
            ...dhaRows.filter(dha => !dha.used).map(dha => ({ op: null, dha: dha.row, key: dha.at })),
        ].sort((a, b) => (a.key ?? Infinity) - (b.key ?? Infinity));

        const from = parseFilterTimestamp($('#reformingFrom')?.value);
        const to = parseFilterTimestamp($('#reformingTo')?.value);
        const visible = output.filter(entry => (from === null || (entry.key !== null && entry.key >= from)) &&
            (to === null || (entry.key !== null && entry.key <= to)));

        const dataColumns = columns.slice(LEAD_COLUMNS.length);
        const groups = groupsOf(dataColumns);
        const text = value => (value === null || value === undefined || value === '' ? '' : `="${String(value).replace(/"/g, '')}"`);
        const csvCell = value => {
            const str = String(value ?? '').replace(/"/g, '""');
            return /[",\n]/.test(str) ? `"${str}"` : str;
        };

        // Operating data (valid columns only, chosen by the server), then DHA Date/Time and the carbon table.
        const top = [...operating.columns, 'DHA Date/Time'];
        const units = top.map(() => '');
        groups.forEach(group => group.keys.forEach((key, index) => {
            top.push(index === 0 ? (group.carbon ? group.label : key) : '');
            units.push(group.carbon ? key.match(/ (C\d+)$/)[1] : (['Carbon', 'Hydrogen'].includes(key) ? 'wt%' : ''));
        }));
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
            window.addEventListener('storage', event => {
                if (event.key === 'ils_reforming_offline' || event.key === 'runPlanDashboardState') {
                    render();
                    renderSummary();
                }
            });
            window.addEventListener('focus', () => { render(); renderSummary(); });
        });
    }

    return { active, render, renderSummary };
})();
