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
    // General_MB (6.5.0): internal standard measured in the bypass lines ('' = none → mol% only)
    internalStandard: '',
    mbPanels: null
};
const isGeneralMB = () => Boolean(window.ILSProcess?.isGeneralMB?.());
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
        // General_MB: a bypass line (Sampled_reactor 0 in the export) stays the bypass with the Reactor Map ON
        if (isGeneralMB() && String(row.Reactor ?? '').trim() !== '' && Number(row.Reactor) === 0) return rCopy;
        const mapped = computeReactorForDateTime(row.DateTime, reactorRows);
        if (mapped) {
            rCopy.Reactor = mapped;
        }
        return rCopy;
    });
}

// ---------------------------------------------------------------- Units (mol% → g/h, Nl/h, g C/h)
const ONLINE_UNIT_FORMULAS_IS = {
    mass: 'm_i [g/h] = y_i·MW_i / (y_IS·MW_IS) · F_IS,r   with   F_IS,r = 01i14FI01 · FIC_r / ΣFIC · w_IS,   or without 01i14FI01: F_IS,r = FIC_r/1000 / 22.414 · y_IS,feed/100 · MW_IS   (y = ESTD mol%; y_IS,feed and w_IS from the bypass lines of the condition; FIC from the export or the Run Plan DOE)',
    volume: 'V_i [Nl/h] = y_i/100 · V_out   with   V_out = FIC_r[NmL/h]/1000 · y_IS,feed / y_IS   (internal standard balance; y_IS,feed from the bypass lines)',
    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS; m_i as for the mass flow rates)',
    feed: 'Feed gas (bypass, per condition): y_IS,feed = avg ESTD_IS; y_mix,feed = avg Σ ESTD of every other gas; MW_mix = Σ avg_j·MW_j / Σ avg_j; w_IS = y_IS·MW_IS / (y_IS·MW_IS + y_mix·MW_mix)',
};
const ONLINE_UNIT_FORMULAS = {
    mass: 'm_i [g/h] = y_i·MW_i / (y_Ar·39.948) · F_Ar,r   with   F_Ar,r = 01i14FI01 · FIC_r / ΣFIC · w_Ar,   or without 01i14FI01: F_Ar,r = FIC_r/1000 / 22.414 · y_Ar,feed/100 · 39.948   (y = ESTD mol%; FIC from the export or the Run Plan DOE; Ar from the Run Plan)',
    volume: 'V_i [Nl/h] = y_i/100 · V_out   with   V_out = FIC_r[NmL/h]/1000 · y_Ar,feed / y_Ar   (argon balance)',
    carbon: 'C_i [g C/h] = 12.011 · nC_i / MW_i · m_i   (carbon of each molecule over TOS; m_i as for the mass flow rates)',
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
        // DOE gas flow per reactor and condition (template "Total gas (Nl/h)", older files "Gas Flow (NmL/h)")
        const doeRows = (rp.doeData?.rows || []).map(row => Object.fromEntries(Object.entries(row).filter(([key]) =>
            /^(Reactor ID|Start Date|End Date|Condition No\.|Block)$/.test(key) || /^duration/i.test(key)
            || /^total gas/i.test(key) || /^gas flow/i.test(key))));
        // Molar masses and carbon numbers from the Run Plan (6.9.1): Molecular weights table first, then the gas feed
        // table, then the liquid components; the server uses built-in standards only for components not listed here.
        const t = rp.feedTables || {};
        const mw = [
            ...(t.mw?.rows || []).map(r => ({ component: r.component, mw: r.mw, carbon_no: r.carbon_no, source: 'Run Plan · Molecular weights' })),
            ...(t.gas?.rows || []).map(r => ({ component: r.component, mw: r.mw, carbon_no: r.carbon_no, source: 'Run Plan · Gas feed composition' })),
            ...(t.liquid?.rows || []).map(r => ({ component: r.component, mw: r.mw, carbon_no: r.carbon_no, source: 'Run Plan · Liquid components' })),
        ].filter(r => r.component && r.mw !== '' && r.mw != null);
        return { feedGas: t.gas?.rows || [], feedCutIn: cutIn, doeRows, molecularWeights: mw };
    } catch (e) {
        return { feedGas: [], feedCutIn: '', doeRows: [], molecularWeights: [] };
    }
}

function compactUnitRows(rows) {
    const keep = key => key === 'DateTime' || key === 'Reactor' || key.startsWith('ESTD_') || key === '01i14FI01'
        || /^01i14FIC0\d$/.test(key) || /^02i2FIC0\d$/.test(key);
    return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => keep(key))));
}

let unitRequest = 0;
async function refreshOnlineUnits() {
    syncGeneralMBControls();
    const unit = onlineState.unit;
    const internalStandard = isGeneralMB() ? onlineState.internalStandard : '';
    renderUnitsBar();
    if (!internalStandard) onlineState.mbPanels = null;
    renderMbPanels();
    if ((unit === 'mol' && !internalStandard) || !onlineState.rows.length) {
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
                // mol% with an Internal Standard: the side panel needs the bypass values (table stays in mol%)
                unit: unit === 'mol' ? 'mass' : unit, rows: compactUnitRows(onlineState.rows), feed_gas: ctx.feedGas,
                feed_cut_in: ctx.feedCutIn, doe_rows: ctx.doeRows, internal_standard: internalStandard || null,
                molecular_weights: ctx.molecularWeights,
            }),
        });
        const data = await onlineJson(response);
        if (!response.ok) throw Error(data.error);
        if (ticket !== unitRequest) return;
        onlineState.converted = unit === 'mol' ? null : data;
        onlineState.mbPanels = internalStandard ? {
            internal_standard: internalStandard, feed_gas_is: data.feed_gas_is || [], avg_is_flow: data.avg_is_flow || [],
            basis: data.basis || {},
        } : null;
        onlineError();
        saveOnlineState();
    } catch (error) {
        if (ticket !== unitRequest) return;
        onlineState.converted = null;
        onlineState.mbPanels = null;
        onlineError(`Unit conversion failed: ${error.message}`);
    } finally {
        if (ticket === unitRequest) online$('#onlineStatus').textContent = 'Ready';
    }
    renderUnitsBar();
    renderMbPanels();
    renderOnlineTable();
}

// ---------------------------------------------------------------- General_MB controls and side panel
function syncGeneralMBControls() {
    const general = isGeneralMB();
    const isSelect = online$('#onlineInternalStandard');
    const unitSelect = online$('#onlineUnit');
    if (online$('#onlineIsWrap')) online$('#onlineIsWrap').hidden = !general;
    if (online$('#onlineUnitWrap')) online$('#onlineUnitWrap').hidden = !general;
    // Isomerization / Reforming: mol% only. General_MB without an Internal Standard: mol% only.
    if (!general || !onlineState.internalStandard) onlineState.unit = 'mol';
    if (isSelect) isSelect.value = general ? onlineState.internalStandard : '';
    if (unitSelect) {
        [...unitSelect.options].forEach(option => {
            option.disabled = option.value !== 'mol' && !onlineState.internalStandard;
            option.title = option.disabled ? 'Choose an Internal Standard (Argon or N2) first' : '';
        });
        unitSelect.value = onlineState.unit;
        unitSelect.title = onlineState.internalStandard ? '' : 'Choose an Internal Standard (Argon or N2) to convert to g/h, Nl/h or g C/h';
    }
}

const fmtMb = (value, digits = 4) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '–');

function renderMbPanels() {
    const side = online$('#onlineMbSide');
    const layout = online$('#onlineMbLayout');
    if (!side) return;
    const panels = isGeneralMB() && onlineState.internalStandard ? onlineState.mbPanels : null;
    const show = isGeneralMB() && Boolean(onlineState.internalStandard) && onlineState.rows.length > 0;
    side.hidden = !show;
    layout?.classList.toggle('with-side', show);
    if (!show) return;
    const is = onlineState.internalStandard;
    const other = is === 'Argon' ? 'N2 included' : 'Argon included';
    const feed = panels?.feed_gas_is || [];
    const basis = panels?.basis || {};
    let feedHtml;
    if (!panels) feedHtml = '<div class="online-mb-note">Calculating…</div>';
    else if (basis.no_conditions) feedHtml = '<div class="online-mb-error">ERROR: no Run Plan DOE conditions (Condition No., Reactor ID, Start Date). Load the Run Plan of this run on the Run Plan page.</div>';
    else feedHtml = feed.map(f => {
        const window = `${escOnline(f.start)} → ${escOnline(f.end || 'end of data')} · ${escOnline((f.reactors || []).join(', '))}`;
        if (!f.bypass_lines) return `<div class="online-mb-cond"><div class="online-mb-cond-head">${escOnline(f.condition)}</div>`
            + `<div class="online-mb-cond-window">${window}</div><div class="online-mb-error">ERROR: ${escOnline(f.error)}</div></div>`;
        const rp = typeof f.run_plan_argon_mol_pct === 'number' && is === 'Argon'
            ? `<dt>Run Plan Argon (check)</dt><dd>${fmtMb(f.run_plan_argon_mol_pct, 2)} mol%`
              + (f.is_mol_pct ? ` <small>(${(100 * (f.run_plan_argon_mol_pct - f.is_mol_pct) / f.is_mol_pct).toFixed(1)} %)</small>` : '') + '</dd>'
            : '';
        return `<div class="online-mb-cond"><div class="online-mb-cond-head">${escOnline(f.condition)} · ${f.bypass_lines} bypass line${f.bypass_lines === 1 ? '' : 's'}</div>`
            + `<div class="online-mb-cond-window">${window}</div>`
            + `<dl class="online-mb-kv">`
            + `<dt>${escOnline(is)} (IS)</dt><dd><b>${fmtMb(f.is_mol_pct)}</b> mol%</dd>`
            + `<dt>${escOnline(is)} (IS) mass fraction</dt><dd><b>${fmtMb(f.is_wt_pct)}</b> wt%</dd>`
            + `<dt>Mixed gas (${other})</dt><dd><b>${fmtMb(f.mixed_mol_pct)}</b> mol%</dd>`
            + `<dt>Sum</dt><dd>${fmtMb(f.sum_mol_pct)} mol%</dd>`
            + `<dt>Mixed gas MW</dt><dd>${fmtMb(f.mixed_mw, 3)} g/mol</dd>`
            + (f.is_rsd_pct != null ? `<dt>${escOnline(is)} spread (RSD)</dt><dd>${fmtMb(f.is_rsd_pct, 2)} %</dd>` : '')
            + rp + `</dl>`
            + (f.error ? `<div class="online-mb-error">ERROR: ${escOnline(f.error)}</div>` : '')
            + ((f.no_mw || []).length ? `<div class="online-mb-warn">No MW, left out of the mixed gas MW: ${escOnline(f.no_mw.join(', '))}</div>` : '')
            + `</div>`;
    }).join('') || '<div class="online-mb-note">No conditions.</div>';
    online$('#onlineFeedGasCards').innerHTML = feedHtml;
    online$('#onlineIsFlowTitle').textContent = `Average ${is} flow to reactor [g/h]`;
    const flows = panels?.avg_is_flow || [];
    online$('#onlineIsFlowCards').innerHTML = !panels ? '<div class="online-mb-note">Calculating…</div>' : (flows.map(row => {
        const cells = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'].filter(r => row[r] !== null && row[r] !== undefined);
        const items = cells.map(r => typeof row[r] === 'number'
            ? `<dt>${r} <small>(${row.lines?.[r] ?? 0} lines)</small></dt><dd><b>${fmtMb(row[r])}</b></dd>`
            : `<dt>${r}</dt><dd class="online-mb-error" title="${escOnline(row[r])}">${escOnline(String(row[r]).replace(/^ERROR: /, 'ERROR: '))}</dd>`).join('');
        return `<div class="online-mb-cond"><div class="online-mb-cond-head">${escOnline(row.condition)}</div>`
            + (items ? `<dl class="online-mb-kv">${items}</dl>` : '<div class="online-mb-note">No reactor lines in this condition.</div>') + '</div>';
    }).join('') || '<div class="online-mb-note">No conditions.</div>');
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
    const parts = [];
    if (data) {
        parts.push(`<b>${escOnline(data.label)}</b> · ${data.ok_count} line${data.ok_count === 1 ? '' : 's'} calculated`
            + (data.error_count ? `, <span class="online-cell-error">${data.error_count} with ERROR</span> (see Status)` : ''));
        if (basis.internal_standard) {
            parts.push(`Internal Standard: ${escOnline(basis.internal_standard)} – ${escOnline(basis.ar_source || '')} (side panel)`
                + (data.bypass_count ? ` · ${data.bypass_count} bypass lines` : ''));
            if (basis.run_plan_argon_mol_pct != null) parts.push(`Run Plan Argon (comparison only): ${formatBasisValue(basis.run_plan_argon_mol_pct)} mol%`);
        } else {
            parts.push(`Ar in feed gas: ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
                + `${basis.ar_feed_wt_pct != null ? formatBasisValue(basis.ar_feed_wt_pct) + ' wt%' : '–'} (${escOnline(basis.ar_source || '')})`);
        }
        if ((basis.excluded_feed_gas || []).length) parts.push(`no MW, left out of the feed gas mass: ${escOnline(basis.excluded_feed_gas.join(', '))}`);
        if (basis.tos_zero) parts.push(`TOS from ${escOnline(basis.tos_zero)} (${escOnline(basis.tos_zero_source)})`);
    } else {
        parts.push(onlineState.rows.length ? 'Converting…' : 'Import a SystemTxt file first.');
    }
    online$('#onlineUnitsBasis').innerHTML = parts.join(' · ');
    // Gas feed: where the flows of the calculated lines came from, and what is missing
    const sources = Object.entries(basis.flow_sources || {}).map(([k, n]) => `${escOnline(k)}: ${n}`).join(', ');
    const flowNote = [];
    if (data && !basis.export_has_flows) flowNote.push('This export has no gas flow columns.');
    if (basis.doe_flows) flowNote.push(`Run Plan DOE gas flows: ${basis.doe_flows} rows`);
    if (sources) flowNote.push(`Flow source of the calculated lines – ${sources}`);
    if (basis.flows_missing || basis.flows_needed) flowNote.push('<span class="online-cell-error">Gas feed missing: load the Run Plan with the DOE gas flow of every condition (start date, duration, Total gas Nl/h).</span>');
    if (basis.argon_missing) flowNote.push('<span class="online-cell-error">Ar missing: load the Run Plan with Argon in Feed → Gas feed composition.</span>');
    if ((basis.mw_missing || []).length) flowNote.push(`<span class="online-cell-error">No MW in the Run Plan for: ${escOnline(basis.mw_missing.join(', '))} – add them to Run Plan → Feed → Molecular weights.</span>`);
    if ((basis.mw_built_in || []).length) flowNote.push(`Built-in MW used (not in the Run Plan): ${escOnline(basis.mw_built_in.join(', '))}`);
    if (data && !basis.mw_from_run_plan) flowNote.push('<span class="online-cell-error">This Run Plan has no molecular weights: add them with scripts/run_plan_examples/add_molecular_weights.py.</span>');
    if (basis.no_conditions) flowNote.push('<span class="online-cell-error">No Run Plan DOE conditions: the bypass lines cannot be grouped per condition.</span>');
    if ((basis.no_bypass || []).length) flowNote.push(`<span class="online-cell-error">No bypass (reactor 0) line in: ${escOnline(basis.no_bypass.join(', '))}</span>`);
    online$('#onlineFlowNote').innerHTML = flowNote.join(' · ');
    const missingInputs = [basis.argon_missing ? 'Ar in feed gas' : '', (basis.flows_missing || basis.flows_needed) ? 'DOE gas flows' : '',
        basis.no_conditions ? 'DOE conditions' : '', (basis.mw_missing || []).length ? 'MW of ' + basis.mw_missing.join(', ') : ''].filter(Boolean);
    bar.classList.toggle('needs-input', missingInputs.length > 0);
    if (missingInputs.length && !bar.dataset.autoOpened) { bar.open = true; bar.dataset.autoOpened = '1'; }
    // One line on the closed block: Ar basis and how many lines could be calculated
    const isPart = basis.internal_standard
        ? `· IS ${escOnline(basis.internal_standard)} from the bypass lines`
        : `· Ar ${basis.ar_feed_mol_pct != null ? formatBasisValue(basis.ar_feed_mol_pct) + ' mol%' : '–'} / `
          + `${basis.ar_feed_wt_pct != null ? formatBasisValue(basis.ar_feed_wt_pct) + ' wt%' : '–'}`;
    online$('#onlineUnitsSummary').innerHTML = data
        ? (missingInputs.length ? `· <span class="online-cell-error">${missingInputs.join(' and ')} missing in the Run Plan</span> ` : '')
          + `${isPart} · ${data.ok_count} calculated`
          + (data.bypass_count ? `, ${data.bypass_count} bypass` : '')
          + (data.error_count ? `, <span class="online-cell-error">${data.error_count} ERROR</span>` : '')
        : '';
    online$('#onlineUnitsFormula').textContent = basis.internal_standard
        ? `${ONLINE_UNIT_FORMULAS_IS[unit] || ''}   ·   ${ONLINE_UNIT_FORMULAS_IS.feed}` : (ONLINE_UNIT_FORMULAS[unit] || '');
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
        const cls = value === 'OK' ? 'online-status-ok' : String(value ?? '').startsWith('BYPASS') ? 'online-status-bypass' : 'online-status-error';
        return `<td class="${cls}">${escOnline(value)}</td>`;
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
            internalStandard: onlineState.internalStandard,
            mbPanels: onlineState.mbPanels,
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
            if (['Argon', 'N2'].includes(saved.internalStandard)) onlineState.internalStandard = saved.internalStandard;
            if (saved.mbPanels && typeof saved.mbPanels === 'object') onlineState.mbPanels = saved.mbPanels;
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
        if (onlineState.unit !== 'mol' || (isGeneralMB() && onlineState.internalStandard)) await refreshOnlineUnits();
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
    if (onlineState.unit !== 'mol' || (isGeneralMB() && onlineState.internalStandard)) refreshOnlineUnits();
};

online$('#onlineSearch').oninput = renderOnlineTable;
if (online$('#onlineInternalStandard')) online$('#onlineInternalStandard').onchange = () => {
    onlineState.internalStandard = online$('#onlineInternalStandard').value;
    onlineState.converted = null;
    onlineState.mbPanels = null;
    onlineState.hiddenConverted = [];
    syncGeneralMBControls();
    saveOnlineState();
    refreshOnlineUnits();
};
if (online$('#onlineUnit')) online$('#onlineUnit').onchange = () => {
    onlineState.unit = online$('#onlineUnit').value;
    syncGeneralMBControls();
    onlineState.converted = null;
    saveOnlineState();
    refreshOnlineUnits();
};
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
syncGeneralMBControls();
renderUnitsBar();
renderMbPanels();
if ((onlineState.unit !== 'mol' || (isGeneralMB() && onlineState.internalStandard)) && onlineState.rows.length) refreshOnlineUnits();
if (shouldRefreshOnlineSchema) {
    online$('#onlineProcess').click();
}