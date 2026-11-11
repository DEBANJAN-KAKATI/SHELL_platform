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

// ---------------------------------------------------------------- Liquid pump check (ZMB reps)
// One tab per repeat; per reactor: collection started / finished (→ duration, TOS in h), TL collected mass [g] typed
// in, liquid flow rate = mass / TOS [g/h]. Verified liquid flow = average over the reps (workbook ZMB rows 4–13).
const ZMB_PUMP_KEY = 'ils_zmb_pump';
const PUMP_REACTORS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
const pump = { reps: [{ rows: {} }], active: 0 };

function loadPump() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(ZMB_PUMP_KEY) || 'null');
        if (saved && Array.isArray(saved.reps) && saved.reps.length) {
            pump.reps = saved.reps.map(r => ({ rows: r.rows || {} }));
            pump.active = Math.min(Math.max(0, saved.active || 0), pump.reps.length - 1);
        }
    } catch (e) { sessionStorage.removeItem(ZMB_PUMP_KEY); }
}

function savePump() {
    try { sessionStorage.setItem(ZMB_PUMP_KEY, JSON.stringify({ reps: pump.reps, active: pump.active, results: pumpResults() })); } catch (e) {}
}

function activeReactors() {
    try {
        const rp = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null');
        const list = rp?.summary?.active_reactors;
        return Array.isArray(list) && list.length ? new Set(list.map(String)) : null;
    } catch (e) { return null; }
}

const pumpNumber = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

// One reactor of one rep → {minutes, hours, flow, error}
function pumpRow(row = {}) {
    const start = zmbTime(row.start), end = zmbTime(row.end), mass = pumpNumber(row.mass);
    const out = { minutes: null, hours: null, flow: null, error: '' };
    if (start !== null && end !== null) {
        if (end <= start) { out.error = 'ERROR: finished is not after started'; return out; }
        out.minutes = (end - start) / 60000;
        out.hours = out.minutes / 60;
    }
    if (row.mass !== '' && row.mass !== undefined && row.mass !== null && mass === null) out.error = 'ERROR: mass is not a number';
    else if (mass !== null && mass < 0) out.error = 'ERROR: negative mass';
    else if (mass !== null && out.hours === null) out.error = 'ERROR: enter both collection times';
    else if (mass !== null) out.flow = mass / out.hours;
    return out;
}

// Verified liquid flow per reactor = average of the reps' flow rates
function pumpResults() {
    return PUMP_REACTORS.map(reactor => {
        const flows = pump.reps.map(rep => pumpRow(rep.rows[reactor]).flow).filter(v => v !== null);
        return { reactor, verified_flow_g_h: flows.length ? flows.reduce((a, b) => a + b, 0) / flows.length : null,
                 reps: flows.length, flows };
    });
}

const fmtPump = (v, d = 4) => (v === null || v === undefined) ? '' : String(Number(v.toFixed(d)));

function renderPumpTabs() {
    const filled = rep => PUMP_REACTORS.filter(r => pumpRow(rep.rows[r]).flow !== null).length;
    zmb$('#zmbRepTabs').innerHTML = pump.reps.map((rep, i) =>
        `<button type="button" role="tab" class="zmb-rep-tab${i === pump.active ? ' active' : ''}" data-rep="${i}" aria-selected="${i === pump.active}">`
        + `Rep ${i + 1}<small>${filled(rep)}/8</small></button>`).join('')
        + '<button type="button" class="zmb-rep-tab add" id="zmbAddRep" title="Add a repeat">+ Add rep</button>';
    zmb$('#zmbRepTabs').querySelectorAll('[data-rep]').forEach(btn => btn.onclick = () => {
        pump.active = Number(btn.dataset.rep);
        savePump();
        renderPump();
    });
    zmb$('#zmbAddRep').onclick = () => {
        pump.reps.push({ rows: {} });
        pump.active = pump.reps.length - 1;
        savePump();
        renderPump();
    };
    zmb$('#zmbRemoveRep').disabled = pump.reps.length <= 1;
}

function renderPumpRow(reactor, used) {
    const row = pump.reps[pump.active].rows[reactor] || {};
    const calc = pumpRow(row);
    return `<tr data-reactor="${reactor}" class="${used ? '' : 'unused'}" title="${used ? '' : 'Not used in the Run Plan'}">`
        + `<td><b>${reactor}</b></td>`
        + `<td><input class="input" type="datetime-local" step="60" data-field="start" value="${escZmb(row.start || '')}"></td>`
        + `<td><input class="input" type="datetime-local" step="60" data-field="end" value="${escZmb(row.end || '')}"></td>`
        + `<td class="num" data-out="minutes">${fmtPump(calc.minutes, 1)}</td>`
        + `<td class="num" data-out="hours">${fmtPump(calc.hours, 4)}</td>`
        + `<td class="num"><input class="input" type="number" step="any" min="0" data-field="mass" value="${escZmb(row.mass ?? '')}"></td>`
        + `<td class="num" data-out="flow">${calc.error ? `<span class="zmb-err">${escZmb(calc.error)}</span>` : fmtPump(calc.flow, 4)}</td></tr>`;
}

function renderVerified() {
    zmb$('#zmbVerifiedBody').innerHTML = pumpResults().map(r =>
        `<tr><td>${r.reactor}</td><td>${r.verified_flow_g_h === null ? '–' : fmtPump(r.verified_flow_g_h, 4)}</td><td>${r.reps || ''}</td></tr>`).join('');
}

function renderPump() {
    const used = activeReactors();
    renderPumpTabs();
    zmb$('#zmbPumpBody').innerHTML = PUMP_REACTORS.map(r => renderPumpRow(r, !used || used.has(r))).join('');
    zmb$('#zmbPumpBody').querySelectorAll('input[data-field]').forEach(input => {
        input.addEventListener(input.type === 'number' ? 'input' : 'change', () => {
            const reactor = input.closest('tr').dataset.reactor;
            const rows = pump.reps[pump.active].rows;
            rows[reactor] = { ...(rows[reactor] || {}), [input.dataset.field]: input.value };
            const calc = pumpRow(rows[reactor]);
            const tr = input.closest('tr');
            tr.querySelector('[data-out="minutes"]').textContent = fmtPump(calc.minutes, 1);
            tr.querySelector('[data-out="hours"]').textContent = fmtPump(calc.hours, 4);
            tr.querySelector('[data-out="flow"]').innerHTML = calc.error ? `<span class="zmb-err">${escZmb(calc.error)}</span>` : fmtPump(calc.flow, 4);
            savePump();
            renderVerified();
            renderPumpTabs();
        });
    });
    renderVerified();
}

zmb$('#zmbApplyTimes').onclick = () => {
    const start = zmb$('#zmbApplyStart').value, end = zmb$('#zmbApplyEnd').value;
    if (!start && !end) { zmbError('Enter a start and/or end time to apply to all reactors.'); return; }
    zmbError();
    const used = activeReactors();
    const rows = pump.reps[pump.active].rows;
    PUMP_REACTORS.filter(r => !used || used.has(r)).forEach(r => {
        rows[r] = { ...(rows[r] || {}), ...(start ? { start } : {}), ...(end ? { end } : {}) };
    });
    savePump();
    renderPump();
};

zmb$('#zmbRemoveRep').onclick = () => {
    if (pump.reps.length <= 1) return;
    if (!window.confirm(`Remove Rep ${pump.active + 1} and its entries?`)) return;
    pump.reps.splice(pump.active, 1);
    pump.active = Math.max(0, pump.active - 1);
    savePump();
    renderPump();
};

restoreZmbState();
loadPump();
renderPump();
renderZmbReactorFilter();
renderZmbTable();
syncZmbProcess();
