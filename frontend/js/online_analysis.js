const ONLINE_STATE_SCHEMA_VERSION = 3;
const onlineState = {
    rows: [],
    rawRows: [],
    columns: [],
    allColumns: [],
    reactorMapActive: false,
    reactorRows: []
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

    const rows = onlineState.rows.filter((row) => {
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
    header.replaceChildren(...onlineState.columns.map((column) => {
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
                onlineState.columns = onlineState.columns.filter((visibleColumn) => visibleColumn !== column);
                saveOnlineState();
                renderOnlineTable();
            };
            cell.appendChild(removeButton);
        }
        return cell;
    }));
    online$('#onlineTbody').innerHTML = rows.map((row) => `<tr>${onlineState.columns.map((column) => `<td>${column === 'Reactor' ? String(row[column] ?? '') : formatOnlineValue(row[column])}</td>`).join('')}</tr>`).join('');
    online$('#onlineEmpty').style.display = rows.length ? 'none' : 'block';

    const restoreButton = online$('#onlineRestoreColumns');
    if (restoreButton) restoreButton.hidden = onlineState.columns.length === onlineState.allColumns.length;

    const badge = online$('#onlineDateBadge');
    if (badge) {
        if (fromVal || toVal) {
            badge.textContent = `Showing ${rows.length} of ${onlineState.rows.length} records`;
        } else {
            badge.textContent = onlineState.rows.length ? `${onlineState.rows.length} records` : '';
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
        online$('#onlineSummary').textContent = `${data.record_count} records loaded from ${data.source_file}`;
        saveOnlineState();
        renderOnlineTable();
        online$('#onlineStatus').textContent = 'Ready';
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
};

online$('#onlineSearch').oninput = renderOnlineTable;
online$('#onlineReactorFilter').onchange = renderOnlineTable;
online$('#onlineRestoreColumns').onclick = () => {
    onlineState.columns = [...onlineState.allColumns];
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
if (shouldRefreshOnlineSchema) {
    online$('#onlineProcess').click();
}