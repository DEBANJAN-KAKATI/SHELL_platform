// ZMB (zero mass balance / blank run) of a General_MB run: import the GC export of the blank run and show its lines
// as imported (normalised mol%), like Online Analysis. Use of the ZMB values in the calculations comes later.
const ZMB_KEY = 'ils_zmb_state';
const zmb$ = (selector) => document.querySelector(selector);
const zmbState = { rows: [], columns: [], allColumns: [], path: '', summary: '' };
const formatZmbValue = (value) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : (value ?? '');
const escZmb = (value) => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function zmbError(message = '') {
    const el = zmb$('#zmbError');
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
}

async function zmbJson(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch { throw Error('Server returned an invalid response. Restart the updated dashboard.'); }
}

function zmbTime(value) {
    if (!value) return null;
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] || 0)).getTime();
    const t = new Date(text).getTime();
    return Number.isNaN(t) ? null : t;
}

function saveZmbState() {
    try {
        sessionStorage.setItem(ZMB_KEY, JSON.stringify({
            rows: zmbState.rows, columns: zmbState.columns, allColumns: zmbState.allColumns,
            path: zmb$('#zmbFile').value, summary: zmbState.summary,
            from: zmb$('#zmbFrom').value, to: zmb$('#zmbTo').value,
        }));
    } catch (e) {
        zmbError('The ZMB table is too large to keep in this browser tab; it is shown but will not be kept when you leave the page.');
    }
}

function restoreZmbState() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(ZMB_KEY) || 'null');
        if (!saved) return;
        zmbState.rows = Array.isArray(saved.rows) ? saved.rows : [];
        zmbState.columns = Array.isArray(saved.columns) ? saved.columns : [];
        zmbState.allColumns = Array.isArray(saved.allColumns) ? saved.allColumns : [...zmbState.columns];
        zmbState.summary = saved.summary || '';
        if (saved.path) zmb$('#zmbFile').value = saved.path;
        if (saved.from) zmb$('#zmbFrom').value = saved.from;
        if (saved.to) zmb$('#zmbTo').value = saved.to;
        if (zmbState.summary) zmb$('#zmbSummary').textContent = zmbState.summary;
    } catch (e) {
        sessionStorage.removeItem(ZMB_KEY);
    }
}

function renderZmbReactorFilter() {
    const current = zmb$('#zmbReactorFilter').value;
    const reactors = [...new Set(zmbState.rows.map(r => String(r.Reactor ?? '')).filter(Boolean))]
        .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
    zmb$('#zmbReactorFilter').innerHTML = '<option value="">All reactors</option>'
        + reactors.map(r => `<option value="${escZmb(r)}"${r === current ? ' selected' : ''}>${Number(r) === 0 ? '0 (bypass)' : escZmb(r)}</option>`).join('');
}

function renderZmbTable() {
    zmbState.rows = sortDateTimeRows(zmbState.rows);
    const query = zmb$('#zmbSearch').value.toLowerCase();
    const reactor = zmb$('#zmbReactorFilter').value;
    const from = zmbTime(zmb$('#zmbFrom').value);
    let to = zmbTime(zmb$('#zmbTo').value);
    if (to !== null && zmb$('#zmbTo').value.length === 16) to += 59999;
    const rows = zmbState.rows.filter(row => {
        if (reactor && String(row.Reactor) !== reactor) return false;
        const t = zmbTime(row.DateTime);
        if (t !== null && ((from !== null && t < from) || (to !== null && t > to))) return false;
        return Object.values(row).join(' ').toLowerCase().includes(query);
    });
    zmb$('#zmbThead').replaceChildren(...zmbState.columns.map(column => {
        const th = document.createElement('th');
        const label = document.createElement('span');
        label.textContent = column;
        th.appendChild(label);
        if (column !== 'DateTime') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'online-remove-column';
            btn.textContent = '×';
            btn.title = `Remove ${column} column`;
            btn.setAttribute('aria-label', `Remove ${column} column`);
            btn.onclick = () => {
                zmbState.columns = zmbState.columns.filter(c => c !== column);
                saveZmbState();
                renderZmbTable();
            };
            th.appendChild(btn);
        }
        return th;
    }));
    zmb$('#zmbTbody').innerHTML = rows.map(row => `<tr>${zmbState.columns.map(column =>
        `<td>${column === 'Reactor' || column === 'DateTime' ? escZmb(row[column]) : escZmb(formatZmbValue(row[column]))}</td>`).join('')}</tr>`).join('');
    zmb$('#zmbEmpty').style.display = rows.length ? 'none' : 'block';
    zmb$('#zmbRestoreColumns').hidden = zmbState.columns.length === zmbState.allColumns.length;
    const filtered = rows.length !== zmbState.rows.length;
    zmb$('#zmbDateBadge').textContent = zmbState.rows.length
        ? (filtered ? `Showing ${rows.length} of ${zmbState.rows.length} records` : `${zmbState.rows.length} records`) : '';
}

function syncZmbProcess() {
    const general = Boolean(window.ILSProcess?.isGeneralMB?.());
    zmb$('#zmbProcess').disabled = !general;
    zmb$('#zmbBrowse').disabled = !general;
    if (!general) zmbError('ZMB belongs to the General_MB process: choose General_MB on the Run Plan page to import a ZMB run.');
}

zmb$('#zmbBrowse').onclick = async () => {
    const btn = zmb$('#zmbBrowse');
    zmbError();
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Browsing...';
    try {
        const response = await fetch('/api/browse-zmb-file', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initial_file: zmb$('#zmbFile').value }) });
        const data = await zmbJson(response);
        if (!response.ok) throw Error(data.error);
        if (data.path) zmb$('#zmbFile').value = data.path;
    } catch (error) { zmbError(error.message); }
    finally { btn.disabled = false; btn.textContent = old; }
};

zmb$('#zmbProcess').onclick = async () => {
    const runNumber = (sessionStorage.getItem('ils_run_number') || '').trim();
    if (!runNumber) { zmbError('Please enter run number to start with'); return; }
    zmbError();
    zmb$('#zmbStatus').textContent = 'Importing...';
    zmb$('#zmbProcess').disabled = true;
    try {
        const response = await fetch('/api/process-zmb', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: zmb$('#zmbFile').value }) });
        const data = await zmbJson(response);
        if (!response.ok) throw Error(data.error);
        zmbState.rows = data.rows || [];
        zmbState.allColumns = [...(data.columns || [])];
        zmbState.columns = [...zmbState.allColumns];
        const bypass = zmbState.rows.filter(r => Number(r.Reactor) === 0 && String(r.Reactor ?? '') !== '').length;
        zmbState.summary = `${data.record_count} ZMB records loaded from ${data.source_file} · ${bypass} bypass (reactor 0) lines`
            + ((data.notes || []).length ? ` · ${data.notes.join(' · ')}` : '');
        zmb$('#zmbSummary').textContent = zmbState.summary;
        renderZmbReactorFilter();
        renderZmbTable();
        saveZmbState();
        zmb$('#zmbStatus').textContent = 'Ready';
    } catch (error) {
        zmbError(error.message);
        zmb$('#zmbStatus').textContent = 'Failed';
    } finally {
        syncZmbProcess();
    }
};

zmb$('#zmbSearch').oninput = renderZmbTable;
zmb$('#zmbReactorFilter').onchange = renderZmbTable;
zmb$('#zmbFrom').oninput = () => { saveZmbState(); renderZmbTable(); };
zmb$('#zmbTo').oninput = () => { saveZmbState(); renderZmbTable(); };
zmb$('#zmbClearDates').onclick = () => { zmb$('#zmbFrom').value = ''; zmb$('#zmbTo').value = ''; saveZmbState(); renderZmbTable(); };
zmb$('#zmbRestoreColumns').onclick = () => { zmbState.columns = [...zmbState.allColumns]; saveZmbState(); renderZmbTable(); };

restoreZmbState();
renderZmbReactorFilter();
renderZmbTable();
syncZmbProcess();
