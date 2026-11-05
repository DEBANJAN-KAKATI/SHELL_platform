const ONLINE_STATE_SCHEMA_VERSION = 3;
const onlineState = {
    rows: [],
    rawRows: [],
    columns: [],
    allColumns: [],
    reactorMapActive: false,
    reactorRows: [],
    // Units of the GC values: 'mol' (as imported) or a conversion from /api/online-units (mass, volume, carbon)
    unit: 'mol',
    converted: null,
    hiddenConverted: [],
    arMol: '',
    arWt: ''
};
const online$ = (selector) => document.querySelector(selector);
const formatOnlineValue = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : (value ?? '');

function parseOnlineDateTime(val) {
    if (!val) return null;
    const str = String(val).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (isoMatch) {
        return new Date(
            Number(isoMatch[1]),
            Number(isoMatch[2]) - 1,
            Number(isoMatch[3]),
            Number(isoMatch[4]),
            Number(isoMatch[5]),
            Number(isoMatch[6] || 0)
        );
    }
    const dmyMatch = str.match(/^(\d{2})[./-](\d{2})[./-](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (dmyMatch) {
        return new Date(
            Number(dmyMatch[3]),
            Number(dmyMatch[2]) - 1,
            Number(dmyMatch[1]),
            Number(dmyMatch[4]),
            Number(dmyMatch[5]),
            Number(dmyMatch[6] || 0)
        );
    }
    const d = new Date(str.replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? null : d;
}

function computeReactorForDateTime(dtStr, reactorRows) {
    if (!dtStr || !Array.isArray(reactorRows) || !reactorRows.length) return null;
    const dt = parseOnlineDateTime(dtStr);
    if (!dt) return null;

    const targetDt = new Date(dt.getTime() - 60 * 60 * 1000);
    const targetYear = targetDt.getFullYear();
    const targetMonth = targetDt.getMonth();
    const targetDay = targetDt.getDate();
    const targetHour = targetDt.getHours();

    const reactorCols = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
    const dateMatches = [];
    const hourMatches = [];

    for (let i = 0; i < reactorRows.length; i += 1) {
        const rRow = reactorRows[i];
        const rDt = parseOnlineDateTime(rRow.DateTime);
        if (!rDt) continue;
        if (
            rDt.getFullYear() === targetYear &&
            rDt.getMonth() === targetMonth &&
            rDt.getDate() === targetDay &&
            rDt.getHours() === targetHour
        ) {
            dateMatches.push(rRow);
        } else if (rDt.getHours() === targetHour) {
            hourMatches.push(rRow);
        }
    }

    const matches = dateMatches.length ? dateMatches : hourMatches;
    if (!matches.length) return null;

    const votes = {};
    for (let i = 0; i < matches.length; i += 1) {
        const m = matches[i];
        for (let c = 0; c < reactorCols.length; c += 1) {
            const col = reactorCols[c];
            if (Number(m[col]) === 1) {
                votes[col] = (votes[col] || 0) + 1;
            }
        }
    }

    const entries = Object.entries(votes);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
}

function getStoredReactorRows() {
    try {
        const saved = JSON.parse(sessionStorage.getItem('dhaDashboardState') || 'null');
        if (saved && Array.isArray(saved.reactorRows) && saved.reactorRows.length > 0) {
            return saved.reactorRows;
        }
    } catch (e) {}
    return null;
}

async function fetchReactorMapData() {
    let rows = getStoredReactorRows();
    if (rows && rows.length) {
        onlineState.reactorRows = rows;
        return rows;
    }
    try {
        const sRes = await fetch('/api/settings');
        const sData = await onlineJson(sRes);
        const folder = sData.default_reactor_source_directory;
        if (folder) {
            const pRes = await fetch('/api/process-reactor-map', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: folder })
            });
            const pData = await onlineJson(pRes);
            if (pRes.ok && Array.isArray(pData.rows)) {
                let saved = {};
                try { saved = JSON.parse(sessionStorage.getItem('dhaDashboardState') || '{}'); } catch(e){}
                saved.reactorRows = pData.rows;
                sessionStorage.setItem('dhaDashboardState', JSON.stringify(saved));
                onlineState.reactorRows = pData.rows;
                return pData.rows;
            }
        }
    } catch (e) {}
    return null;
}

function applyReactorMapMapping(rows, reactorRows) {
    if (!Array.isArray(rows)) return [];
    if (!Array.isArray(reactorRows) || !reactorRows.length) return rows.map(r => ({ ...r }));
    return rows.map(row => {
        const rCopy = { ...row };
        const mapped = computeReactorForDateTime(row.DateTime, reactorRows);
        if (mapped) {
            rCopy.Reactor = mapped;
        }
        return rCopy;
    });
}

// ---------------------------------------------------------------- Units (mol% → g/h, Nl/h, g C/h)
const ONLINE_UNIT_FORMULAS = {
    mass: 'm_i [g/h] = y_i·MW_i / (y_Ar·39.948) · F_Ar,r   with   F_Ar,r = 01i14FI01 · FIC_r / ΣFIC · w_Ar   (y = ESTD mol%)',
    volume: 'V_i [Nl/h] = y_i/100 · V_out   with   V_out = FIC_r[NmL/h]/1000 · y_Ar,feed / y_Ar   (argon balance)',
    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS)',
};
const escOnline = (value) => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function formatConvertedValue(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value ?? '';
    const a = Math.abs(value);
    if (a === 0) return '0';
    if (a >= 100) return value.toFixed(2);
    if (a >= 1) return value.toFixed(4);
    return String(Number(value.toPrecision(4)));
}

const formatBasisValue = (value) => (typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(4))) : '–');

function onlineRunPlanContext() {
    try {
        const rp = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null') || {};
        const info = rp.planData?.info || [];
        const cutIn = info.find(i => String(i.parameter).trim().toLowerCase() === 'feed cut-in')?.value || '';
        return { feedGas: rp.feedTables?.gas?.rows || [], feedCutIn: cutIn };
    } catch (e) {
        return { feedGas: [], feedCutIn: '' };
    }
}

function compactUnitRows(rows) {
    const keep = key => key === 'DateTime' || key === 'Reactor' || key.startsWith('ESTD_') || key === '01i14FI01'
        || /^01i14FIC0\d$/.test(key) || /^02i2FIC0\d$/.test(key);
    return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => keep(key))));
}

let unitRequest = 0;
async function refreshOnlineUnits() {
    const unit = onlineState.unit;
    renderUnitsBar();
    if (unit === 'mol' || !onlineState.rows.length) {
        onlineState.converted = null;
        renderOnlineTable();
        return;
    }
    const ticket = ++unitRequest;
    const ctx = onlineRunPlanContext();
    online$('#onlineStatus').textContent = 'Converting...';
    try {
        const response = await fetch('/api/online-units', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                unit, rows: compactUnitRows(onlineState.rows), feed_gas: ctx.feedGas, feed_cut_in: ctx.feedCutIn,
                ar_mol_pct: onlineState.arMol === '' ? null : Number(onlineState.arMol),
                ar_wt_pct: onlineState.arWt === '' ? null : Number(onlineState.arWt),
            }),
        });
        const data = await onlineJson(response);
        if (!response.ok) throw Error(data.error);
        if (ticket !== unitRequest) return;
        onlineState.converted = data;
        onlineError();
    } catch (error) {
        if (ticket !== unitRequest) return;
        onlineState.converted = null;
        onlineError(`Unit conversion failed: ${error.message}`);
    } finally {
        if (ticket === unitRequest) online$('#onlineStatus').textContent = 'Ready';
    }
    renderUnitsBar();
    renderOnlineTable();
}

function renderUnitsBar() {
    const bar = online$('#onlineUnitsBar');
    if (!bar) return;
    const unit = onlineState.unit;
    if (online$('#onlineUnit')) online$('#onlineUnit').value = unit;
    bar.hidden = unit === 'mol';
    if (unit === 'mol') return;
    const data = onlineState.converted;
    const basis = data?.basis || {};
    const arMol = online$('#onlineArMol'), arWt = online$('#onlineArWt');
    if (arMol && document.activeElement !== arMol) arMol.value = onlineState.arMol;
    if (arWt && document.activeElement !== arWt) arWt.value = onlineState.arWt;
    const fromPlan = basis.ar_source !== 'entered';
    if (arMol) arMol.placeholder = basis.ar_feed_mol_pct != null && fromPlan ? `${formatBasisValue(basis.ar_feed_mol_pct)} (Run Plan)` : 'Run Plan';
    if (arWt) arWt.placeholder = basis.ar_feed_wt_pct != null && fromPlan ? `${formatBasisValue(basis.ar_feed_wt_pct)} (Run Plan)` : 'Run Plan';
    const parts = [];
    if (data) {
        parts.push(`<b>${escOnline(data.label)}</b> · ${data.ok_count} line${data.ok_count === 1 ? '' : 's'} calculated`
            + (data.error_count ? `, <span class="online-cell-error">${data.error_count} with ERROR</span> (see Status)` : ''));
        parts.push(`Ar in feed gas: ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
            + `${basis.ar_feed_wt_pct != null ? formatBasisValue(basis.ar_feed_wt_pct) + ' wt%' : '–'} (${escOnline(basis.ar_source || '')})`);
        if ((basis.excluded_feed_gas || []).length) parts.push(`no MW, left out of the feed gas mass: ${escOnline(basis.excluded_feed_gas.join(', '))}`);
        if (basis.tos_zero) parts.push(`TOS from ${escOnline(basis.tos_zero)} (${escOnline(basis.tos_zero_source)})`);
    } else {
        parts.push(onlineState.rows.length ? 'Converting…' : 'Import a SystemTxt file first.');
    }
    online$('#onlineUnitsBasis').innerHTML = parts.join(' · ');
    // One line on the closed block: Ar basis and how many lines could be calculated
    online$('#onlineUnitsSummary').innerHTML = data
        ? `· Ar ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
          + `${basis.ar_feed_wt_pct != null ? formatBasisValue(basis.ar_feed_wt_pct) + ' wt%' : '–'} · ${data.ok_count} calculated`
          + (data.error_count ? `, <span class="online-cell-error">${data.error_count} ERROR</span>` : '')
        : '';
    online$('#onlineUnitsFormula').textContent = ONLINE_UNIT_FORMULAS[unit] || '';
    online$('#onlineMwBody').innerHTML = (data?.components || []).map(c => `<tr><td>${escOnline(c.component)}</td>`
        + `<td>${c.mw ?? '–'}</td><td>${c.carbon_atoms ?? '–'}</td><td>${escOnline(c.source)}</td></tr>`).join('');
}

function currentOnlineView() {
    if (onlineState.unit !== 'mol' && onlineState.converted) {
        const hidden = new Set(onlineState.hiddenConverted);
        const all = onlineState.converted.columns;
        return { rows: onlineState.converted.rows, columns: all.filter(c => !hidden.has(c)), all, converted: true };
    }
    return { rows: onlineState.rows, columns: onlineState.columns, all: onlineState.allColumns, converted: false };
}

function onlineCellHtml(column, row, converted) {
    const value = row[column];
    if (column === 'Reactor') return `<td>${escOnline(String(value ?? ''))}</td>`;
    if (!converted) return `<td>${formatOnlineValue(value)}</td>`;
    if (column === 'Status') {
        const ok = value === 'OK';
        return `<td class="${ok ? 'online-status-ok' : 'online-status-error'}">${escOnline(value)}</td>`;
    }
    if (typeof value === 'string' && value.startsWith('ERROR')) return `<td><span class="online-cell-error">${escOnline(value)}</span></td>`;
    if (column === 'TOS (h)' && typeof value === 'number') return `<td>${value.toFixed(2)}</td>`;
    return `<td>${escOnline(formatConvertedValue(value))}</td>`;
}

function updateToggleButtonVisuals() {
    const btn = online$('#onlineReactorMapToggle');
    const dot = online$('#onlineToggleDot');
    const txt = online$('#onlineToggleText');
    if (!btn || !dot || !txt) return;

    const on = Boolean(onlineState.reactorMapActive);
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    dot.className = `reactor-dot ${on ? 'open' : 'closed'}`;
    txt.textContent = on ? 'ON' : 'OFF';
}

function saveOnlineState() {
    const from = online$('#onlineFrom')?.value || '';
    const to = online$('#onlineTo')?.value || '';
    const state = JSON.stringify({
            schemaVersion: ONLINE_STATE_SCHEMA_VERSION,
            rows: onlineState.rows,
            rawRows: onlineState.rawRows,
            columns: onlineState.columns,
            allColumns: onlineState.allColumns,
            reactorMapActive: onlineState.reactorMapActive,
            unit: onlineState.unit,
            hiddenConverted: onlineState.hiddenConverted,
            arMol: onlineState.arMol,
            arWt: onlineState.arWt,
            path: online$('#onlineFile').value,
            summary: online$('#onlineSummary').textContent,
            from: from,
            to: to
        });
    sessionStorage.setItem('dhaOnlineState', state);
    localStorage.setItem('dhaOnlineState', state);
    sessionStorage.setItem('dhaDateTimeFilter', JSON.stringify({ from, to }));
}

function restoreOnlineState() {
    let shouldRefreshSchema = false;
    try {
        const saved = JSON.parse(sessionStorage.getItem('dhaOnlineState') || localStorage.getItem('dhaOnlineState') || 'null');
        if (saved) {
            shouldRefreshSchema = saved.schemaVersion !== ONLINE_STATE_SCHEMA_VERSION && Boolean(saved.path);
            if (Array.isArray(saved.rawRows)) {
                onlineState.rawRows = saved.rawRows;
            } else if (Array.isArray(saved.rows)) {
                onlineState.rawRows = saved.rows;
            }
            onlineState.reactorMapActive = Boolean(saved.reactorMapActive);
            if (['mol', 'mass', 'volume', 'carbon'].includes(saved.unit)) onlineState.unit = saved.unit;
            if (Array.isArray(saved.hiddenConverted)) onlineState.hiddenConverted = saved.hiddenConverted;
            onlineState.arMol = saved.arMol ?? '';
            onlineState.arWt = saved.arWt ?? '';
            if (Array.isArray(saved.rows)) onlineState.rows = saved.rows;
            if (Array.isArray(saved.columns)) onlineState.columns = saved.columns;
            onlineState.allColumns = Array.isArray(saved.allColumns) ? saved.allColumns : [...onlineState.columns];
            if (saved.path) online$('#onlineFile').value = saved.path;
            if (saved.summary) online$('#onlineSummary').textContent = saved.summary;
            if (saved.from && online$('#onlineFrom')) online$('#onlineFrom').value = saved.from;
            if (saved.to && online$('#onlineTo')) online$('#onlineTo').value = saved.to;
        }
        const sharedDates = JSON.parse(sessionStorage.getItem('dhaDateTimeFilter') || 'null');
        if (sharedDates) {
            if (sharedDates.from && online$('#onlineFrom')) online$('#onlineFrom').value = sharedDates.from;
            if (sharedDates.to && online$('#onlineTo')) online$('#onlineTo').value = sharedDates.to;
        }
    } catch (error) {
        sessionStorage.removeItem('dhaOnlineState');
    }
    return shouldRefreshSchema;
}

function onlineError(message = '') {
    const element = online$('#onlineError');
    element.textContent = message;
    element.classList.toggle('show', Boolean(message));
}

function parseFilterTimestamp(val) {
    if (!val) return null;
    const d = parseOnlineDateTime(val) || new Date(val);
    const t = d ? d.getTime() : NaN;
    return Number.isNaN(t) ? null : t;
}

function renderOnlineTable() {
    onlineState.rawRows = sortDateTimeRows(onlineState.rawRows);
    onlineState.rows = sortDateTimeRows(onlineState.rows);
    const query = online$('#onlineSearch').value.toLowerCase();
    const reactor = online$('#onlineReactorFilter').value;
    const fromVal = online$('#onlineFrom')?.value || '';
    const toVal = online$('#onlineTo')?.value || '';

    const fromTime = parseFilterTimestamp(fromVal);
    let toTime = parseFilterTimestamp(toVal);
    if (toTime !== null && toVal.length === 16) {
        toTime += 59999;
    }

    const view = currentOnlineView();
    const rows = view.rows.filter((row) => {
        if (reactor && String(row.Reactor) !== reactor) return false;

        if (fromTime !== null || toTime !== null) {
            const rowDt = parseOnlineDateTime(row.DateTime);
            const rowTime = rowDt ? rowDt.getTime() : null;
            if (rowTime !== null) {
                if (fromTime !== null && rowTime < fromTime) return false;
                if (toTime !== null && rowTime > toTime) return false;
            }
        }

        return Object.values(row).join(' ').toLowerCase().includes(query);
    });

    const header = online$('#onlineThead');
    header.replaceChildren(...view.columns.map((column) => {
        const cell = document.createElement('th');
        const label = document.createElement('span');
        label.textContent = column;
        cell.appendChild(label);
        if (column !== 'DateTime') {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'online-remove-column';
            removeButton.textContent = '×';
            removeButton.title = `Remove ${column} column`;
            removeButton.setAttribute('aria-label', `Remove ${column} column`);
            removeButton.onclick = () => {
                if (view.converted) onlineState.hiddenConverted = [...new Set([...onlineState.hiddenConverted, column])];
                else onlineState.columns = onlineState.columns.filter((visibleColumn) => visibleColumn !== column);
                saveOnlineState();
                renderOnlineTable();
            };
            cell.appendChild(removeButton);
        }
        return cell;
    }));
    online$('#onlineTbody').innerHTML = rows.map((row) => `<tr>${view.columns.map((column) => onlineCellHtml(column, row, view.converted)).join('')}</tr>`).join('');
    online$('#onlineEmpty').style.display = rows.length ? 'none' : 'block';

    const restoreButton = online$('#onlineRestoreColumns');
    if (restoreButton) restoreButton.hidden = view.converted ? !onlineState.hiddenConverted.length : onlineState.columns.length === onlineState.allColumns.length;

    const badge = online$('#onlineDateBadge');
    if (badge) {
        if (fromVal || toVal) {
            badge.textContent = `Showing ${rows.length} of ${view.rows.length} records`;
        } else {
            badge.textContent = view.rows.length ? `${view.rows.length} records` : '';
        }
    }
}

function renderReactorFilter() {
    const reactors = [...new Set(onlineState.rows.map((row) => String(row.Reactor ?? '')).filter(Boolean))].sort();
    const current = online$('#onlineReactorFilter').value;
    online$('#onlineReactorFilter').innerHTML = '<option value="">All reactors</option>' + reactors.map((reactor) => `<option value="${reactor}"${reactor === current ? ' selected' : ''}>${reactor}</option>`).join('');
}

async function onlineJson(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw Error('Server returned an invalid response. Restart the updated dashboard.'); }
}

online$('#onlineBrowse').onclick = async () => {
    const btn = online$('#onlineBrowse');
    if (btn.disabled) return;
    onlineError();
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Browsing...';
    try {
        const response = await fetch('/api/browse-online-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initial_file: online$('#onlineFile').value }) });
        const data = await onlineJson(response);
        if (!response.ok) throw Error(data.error);
        if (data.path) online$('#onlineFile').value = data.path;
    } catch (error) { onlineError(error.message); }
    finally {
        btn.disabled = false;
        btn.textContent = old;
    }
};

online$('#onlineProcess').onclick = async () => {
    const runNum = (sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim();
    if (!runNum) {
        onlineError("Please enter run number to start with");
        return;
    }
    onlineError();
    online$('#onlineStatus').textContent = 'Importing...';
    online$('#onlineProcess').disabled = true;
    try {
        const response = await fetch('/api/process-online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: online$('#onlineFile').value }) });
        const data = await onlineJson(response);
        if (!response.ok) throw Error(data.error);

        onlineState.rawRows = data.rows;
        onlineState.allColumns = [...data.columns];
        onlineState.columns = [...data.columns];

        if (onlineState.reactorMapActive) {
            let reactorRows = onlineState.reactorRows.length ? onlineState.reactorRows : getStoredReactorRows();
            if (!reactorRows || !reactorRows.length) {
                reactorRows = await fetchReactorMapData();
            }
            onlineState.rows = applyReactorMapMapping(onlineState.rawRows, reactorRows || []);
        } else {
            onlineState.rows = onlineState.rawRows.map(r => ({ ...r }));
        }

        const sharedDates = JSON.parse(sessionStorage.getItem('dhaDateTimeFilter') || 'null');
        if (sharedDates) {
            if (sharedDates.from && online$('#onlineFrom') && !online$('#onlineFrom').value) online$('#onlineFrom').value = sharedDates.from;
            if (sharedDates.to && online$('#onlineTo') && !online$('#onlineTo').value) online$('#onlineTo').value = sharedDates.to;
        }

        renderReactorFilter();
        online$('#onlineSummary').textContent = `${data.record_count} records loaded from ${data.source_file}`
            + ((data.notes || []).length ? ` · ${data.notes.join(' · ')}` : '');
        saveOnlineState();
        renderOnlineTable();
        online$('#onlineStatus').textContent = 'Ready';
        if (onlineState.unit !== 'mol') await refreshOnlineUnits();
    } catch (error) {
        onlineError(error.message);
        online$('#onlineStatus').textContent = 'Failed';
    } finally {
        online$('#onlineProcess').disabled = false;
    }
};

online$('#onlineReactorMapToggle').onclick = async () => {
    onlineError();
    onlineState.reactorMapActive = !onlineState.reactorMapActive;
    updateToggleButtonVisuals();

    if (onlineState.reactorMapActive) {
        let reactorRows = onlineState.reactorRows.length ? onlineState.reactorRows : getStoredReactorRows();
        if (!reactorRows || !reactorRows.length) {
            online$('#onlineStatus').textContent = 'Loading Reactor Map...';
            reactorRows = await fetchReactorMapData();
            online$('#onlineStatus').textContent = 'Ready';
        }

        if (!reactorRows || !reactorRows.length) {
            onlineError('Reactor Map data is not loaded yet. Please process Reactor Map in Offline Analysis first or configure source folder.');
            onlineState.rows = applyReactorMapMapping(onlineState.rawRows, []);
        } else {
            onlineState.rows = applyReactorMapMapping(onlineState.rawRows, reactorRows);
        }
    } else {
        onlineState.rows = onlineState.rawRows.map(r => ({ ...r }));
    }

    renderReactorFilter();
    renderOnlineTable();
    saveOnlineState();
    if (onlineState.unit !== 'mol') refreshOnlineUnits();
};

online$('#onlineSearch').oninput = renderOnlineTable;
if (online$('#onlineUnit')) online$('#onlineUnit').onchange = () => {
    onlineState.unit = online$('#onlineUnit').value;
    onlineState.converted = null;
    saveOnlineState();
    refreshOnlineUnits();
};
let unitInputTimer = null;
['#onlineArMol', '#onlineArWt'].forEach((selector) => {
    const input = online$(selector);
    if (!input) return;
    input.oninput = () => {
        onlineState[selector === '#onlineArMol' ? 'arMol' : 'arWt'] = input.value.trim();
        saveOnlineState();
        clearTimeout(unitInputTimer);
        unitInputTimer = setTimeout(refreshOnlineUnits, 400);
    };
});
online$('#onlineReactorFilter').onchange = renderOnlineTable;
online$('#onlineRestoreColumns').onclick = () => {
    if (onlineState.unit !== 'mol' && onlineState.converted) onlineState.hiddenConverted = [];
    else onlineState.columns = [...onlineState.allColumns];
    saveOnlineState();
    renderOnlineTable();
};
if (online$('#onlineFrom')) online$('#onlineFrom').oninput = () => { saveOnlineState(); renderOnlineTable(); };
if (online$('#onlineTo')) online$('#onlineTo').oninput = () => { saveOnlineState(); renderOnlineTable(); };
if (online$('#onlineClearDates')) online$('#onlineClearDates').onclick = () => {
    if (online$('#onlineFrom')) online$('#onlineFrom').value = '';
    if (online$('#onlineTo')) online$('#onlineTo').value = '';
    sessionStorage.removeItem('dhaDateTimeFilter');
    saveOnlineState();
    renderOnlineTable();
};

const shouldRefreshOnlineSchema = restoreOnlineState();
const initialStored = getStoredReactorRows();
if (initialStored) onlineState.reactorRows = initialStored;
if (onlineState.reactorMapActive && onlineState.rawRows.length) {
    onlineState.rows = applyReactorMapMapping(onlineState.rawRows, onlineState.reactorRows);
}
updateToggleButtonVisuals();
renderReactorFilter();
renderOnlineTable();
renderUnitsBar();
if (onlineState.unit !== 'mol' && onlineState.rows.length) refreshOnlineUnits();
if (shouldRefreshOnlineSchema) {
    online$('#onlineProcess').click();
}