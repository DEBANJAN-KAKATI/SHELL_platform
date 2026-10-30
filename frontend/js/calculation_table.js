const FIC_MAPPING = {
    1: "10i1FIC01", 2: "10i1FIC02", 3: "10i1FIC03", 4: "10i1FIC04",
    5: "10i2FIC01", 6: "10i2FIC02", 7: "10i2FIC03", 8: "10i2FIC04"
};
const TEMPERATURE_MAPPING = {
    1: "10i1TIC02", 2: "10i1TIC02", 3: "10i1TIC02", 4: "10i1TIC02",
    5: "10i2TIC02", 6: "10i2TIC02", 7: "10i2TIC02", 8: "10i2TIC02"
};
// Reforming runs in Reactor 1; 10i1TIC02 reads a constant 350, the bed temperature is 10i2TIC01.
const REFORMING_TEMPERATURE_TAG = "10i2TIC01";
const PRESSURE_MAPPING = {
    1: "10i1PIC01", 2: "10i1PIC01", 3: "10i1PIC01", 4: "10i1PIC01",
    5: "10i2PIC01", 6: "10i2PIC01", 7: "10i2PIC01", 8: "10i2PIC01"
};

const calcState = {
    allRows: [],
    columns: [],
    sourceFile: '',
    activeSubtab: 'base_table',
    yieldRows: [],
    yieldColumns: []
};

function doeValue(row, label) {
    return row[label] ?? row[Object.keys(row).find(key => key.replace(/\n/g, ' ').trim() === label)] ?? '';
}

function getActiveFeedCarbonAndMw() {
    let carbon = 83.61;
    let mw = 88.55;
    try {
        const raw = sessionStorage.getItem('ils_feed_properties') || sessionStorage.getItem('runPlanDashboardState');
        if (raw) {
            const data = JSON.parse(raw);
            const rows = Array.isArray(data) ? data : (data.feedRows || []);
            if (rows.length > 0 && rows[0].value !== undefined && rows[0].value !== '') {
                const c = parseFloat(rows[0].value);
                if (!isNaN(c)) carbon = c;
            }
            if (rows.length > 2 && rows[2].value !== undefined && rows[2].value !== '') {
                const m = parseFloat(rows[2].value);
                if (!isNaN(m)) mw = m;
            }
        }
    } catch (e) { }
    return { carbon, mw };
}

function parseReactorNum(val) {
    if (val === null || val === undefined || val === '') return null;
    const clean = String(val).replace(/[Rr]/g, '').trim();
    const num = parseInt(clean, 10);
    return (num >= 1 && num <= 8) ? num : null;
}

function reconstructBaseRows(rawRows, carbon, mw) {
    const finalCols = [
        'DateTime', 'Condition', 'TOS[h]', 'Reactor', 'ESTD_H2', 'ESTD_N2', 'N2[SLPH]',
        'Temperature', 'Pressure', 'Naphtha_online', 'H2_out',
        'Naphtha_out', 'Carbon_out', 'Naphtha_in', 'Naphtha/H2'
    ];

    const processed = rawRows.map(row => {
        const rNum = parseReactorNum(row.Reactor ?? row.Sampled_reactor);
        const ficCol = rNum ? FIC_MAPPING[rNum] : null;
        const tempCol = window.ILSProcess?.isReforming() ? REFORMING_TEMPERATURE_TAG : (rNum ? TEMPERATURE_MAPPING[rNum] : null);
        const pressCol = rNum ? PRESSURE_MAPPING[rNum] : null;

        const n2Slph = (ficCol && row[ficCol] !== undefined && row[ficCol] !== null && row[ficCol] !== '') ? Number(row[ficCol]) / 1000 : null;
        const temp = (tempCol && row[tempCol] !== undefined && row[tempCol] !== null && row[tempCol] !== '') ? Number(row[tempCol]) : null;
        const press = (pressCol && row[pressCol] !== undefined && row[pressCol] !== null && row[pressCol] !== '') ? Number(row[pressCol]) : null;

        const estdH2 = (row.ESTD_H2 !== undefined && row.ESTD_H2 !== null && row.ESTD_H2 !== '') ? Number(row.ESTD_H2) : null;
        const estdN2 = (row.ESTD_N2 !== undefined && row.ESTD_N2 !== null && row.ESTD_N2 !== '') ? Number(row.ESTD_N2) : null;

        let naphthaOnline = null;
        let h2Out = null;
        let naphthaOut = null;
        let carbonOut = null;
        let naphthaIn = null;
        let naphthaH2 = null;

        if (estdH2 !== null && estdN2 !== null) {
            naphthaOnline = 100 - (estdH2 + estdN2);

            if (n2Slph !== null && estdN2 !== 0) {
                const n2Ratio = estdN2 / 100;
                const h2Ratio = estdH2 / 100;
                const naphthaRatio = naphthaOnline / 100;

                h2Out = (n2Slph / n2Ratio) * h2Ratio * 0.0416 * 2;
                naphthaOut = (n2Slph / n2Ratio) * naphthaRatio * 0.0416 * mw;
                carbonOut = (naphthaOut * carbon) / 100;
                naphthaIn = (carbon !== 0) ? (carbonOut / (carbon / 100)) : naphthaOut;
            }

            if (estdH2 !== 0) {
                naphthaH2 = (naphthaOnline * mw) / (estdH2 * 2);
            }
        }

        const dateVal = row.DateTime ?? row['Date/Time'] ?? '';
        let reactorVal = row.Reactor ?? row.Sampled_reactor ?? '';
        if ((!reactorVal || String(reactorVal).trim() === '0') && typeof activeReactorAt === 'function') {
            try {
                const dashSaved = readStoredCalculationState('dhaDashboardState', ['reactorRows']);
                if (dashSaved && Array.isArray(dashSaved.reactorRows) && dashSaved.reactorRows.length) {
                    const ar = activeReactorAt(dateVal, dashSaved.reactorRows);
                    if (ar) reactorVal = ar;
                }
            } catch (e) {}
        }

        return {
            DateTime: dateVal,
            Reactor: reactorVal,
            'Date/Time': dateVal,
            Sampled_reactor: reactorVal,
            ESTD_H2: estdH2,
            ESTD_N2: estdN2,
            'N2[SLPH]': n2Slph,
            Temperature: temp,
            Pressure: press,
            Naphtha_online: naphthaOnline,
            H2_out: h2Out,
            Naphtha_out: naphthaOut,
            Carbon_out: carbonOut,
            Naphtha_in: naphthaIn,
            'Naphtha/H2': naphthaH2
        };
    });

    processed.sort((left, right) => {
        const leftTime = parseCalcDateTime(left.DateTime)?.getTime() ?? Infinity;
        const rightTime = parseCalcDateTime(right.DateTime)?.getTime() ?? Infinity;
        return leftTime === rightTime ? 0 : leftTime - rightTime;
    });
    const firstTime = processed.length ? parseCalcDateTime(processed[0].DateTime)?.getTime() : null;
    processed.forEach((row, index) => {
        const currentTime = parseCalcDateTime(row.DateTime)?.getTime();
        row['TOS[h]'] = index === 0 ? 0 : (
            firstTime !== null && currentTime !== undefined && currentTime !== null
                ? (currentTime - firstTime) / 3600000
                : null
        );
    });

    return assignBaseConditions(processed, finalCols);
}

function parseDoeBoundary(value, endOfDay) {
    const text = String(value ?? '').trim();
    if (!text && endOfDay) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return today;
    }
    const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const localDate = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (isoDate || localDate) {
        const [year, month, day] = isoDate
            ? [Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])]
            : [Number(localDate[3]), Number(localDate[2]), Number(localDate[1])];
        const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
    }
    return parseCalcDateTime(text);
}

function assignBaseConditions(rows, columns, flagAmbiguous = false) {
    const states = [sessionStorage, localStorage].map(storage => {
        try { return JSON.parse(storage.getItem('runPlanDashboardState') || 'null'); } catch (error) { return null; }
    });
    const doeRows = states.find(state => state?.doeData?.rows?.length)?.doeData.rows || [];
    const ranges = doeRows.map(row => ({
        condition: String(doeValue(row, 'Condition No.') || row.Condition || '').trim(),
        start: parseDoeBoundary(doeValue(row, 'Start Date'), false),
        end: parseDoeBoundary(doeValue(row, 'End Date'), true)
    })).filter(range => range.condition && range.start && range.end && range.start <= range.end);

    rows.forEach(row => {
        const date = parseCalcDateTime(row.DateTime ?? row['Date/Time'] ?? row['Date and Time']);
        const matches = new Set(date ? ranges.filter(range => date >= range.start && date < range.end).map(range => range.condition) : []);
        row.Condition = matches.size === 1 ? [...matches][0] : (
            flagAmbiguous && matches.size > 1 ? `ERROR: Ambiguous DOE conditions (${[...matches].join(', ')})` : ''
        );
    });
    const finalColumns = columns.filter(column => column !== 'Condition');
    const dateIndex = finalColumns.findIndex(column => ['DateTime', 'Date/Time', 'Date and Time'].includes(column));
    finalColumns.splice(dateIndex + 1, 0, 'Condition');
    return { rows, columns: finalColumns };
}

const calc$ = selector => document.querySelector(selector);

// Display precision per table (display and CSV export only — stored values keep full precision)
const CALC_DECIMALS_KEY = 'ils_calc_decimals';
const CALC_DECIMALS_MIN = 0;
const CALC_DECIMALS_MAX = 5;
const calcDecimals = (() => {
    const defaults = { base: 2, yield: 2 };
    try {
        const saved = JSON.parse(localStorage.getItem(CALC_DECIMALS_KEY) || '{}');
        ['base', 'yield'].forEach(key => {
            if (Number.isInteger(saved[key]) && saved[key] >= CALC_DECIMALS_MIN && saved[key] <= CALC_DECIMALS_MAX) {
                defaults[key] = saved[key];
            }
        });
    } catch (e) { /* ignore unavailable storage */ }
    return defaults;
})();

const formatCalcValue = value => {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number.isInteger(value) ? String(value) : value.toFixed(calcDecimals.base);
    }
    const num = Number(value);
    if (!isNaN(num) && String(value).trim() !== '' && !String(value).includes('-') && !String(value).includes(':')) {
        return Number.isInteger(num) ? String(num) : num.toFixed(calcDecimals.base);
    }
    return String(value);
};

function parseCalcDateTime(val) {
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

function parseFilterTimestamp(val) {
    if (!val) return null;
    const d = parseCalcDateTime(val) || new Date(val);
    const t = d ? d.getTime() : NaN;
    return Number.isNaN(t) ? null : t;
}

function showCalcError(msg = '') {
    const el = calc$('#calcError');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('show', Boolean(msg));
}

function updateKpis() {
    if (calc$('#kpiRecords')) calc$('#kpiRecords').textContent = calcState.allRows.length;
    if (calc$('#kpiActiveParams')) calc$('#kpiActiveParams').textContent = calcState.allRows.length ? (calcState.columns.length || 13) : 0;
    if (calc$('#kpiExcludedParams')) calc$('#kpiExcludedParams').textContent = calcState.allRows.length ? 8 : 0;
    if (calc$('#kpiSource')) {
        if (calcState.sourceFile) {
            calc$('#kpiSource').textContent = calcState.sourceFile.split(/[\\/]/).pop();
            calc$('#kpiSource').title = calcState.sourceFile;
        } else if (calcState.allRows.length) {
            calc$('#kpiSource').textContent = 'Online Sync';
        } else {
            calc$('#kpiSource').textContent = '—';
        }
    }
}

function renderReactorFilter() {
    const baseFilterEl = calc$('#calcReactorFilter');
    const yieldFilterEl = calc$('#yieldReactorFilter');

    const sortReactors = list => [...new Set(list)].sort((a, b) => {
        const numA = parseInt(String(a).replace(/\D/g, ''), 10);
        const numB = parseInt(String(b).replace(/\D/g, ''), 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return String(a).localeCompare(String(b));
    });

    const baseReactors = sortReactors(calcState.allRows.map(r => String(r.Reactor ?? r.Sampled_reactor ?? '')).filter(Boolean));
    const yieldReactors = sortReactors(calcState.yieldRows.map(r => String(r.Reactor ?? r['Active Reactor'] ?? r.Sampled_reactor ?? '')).filter(Boolean));
    const allReactors = sortReactors([...baseReactors, ...yieldReactors]);

    if (baseFilterEl) {
        const current = baseFilterEl.value;
        const opts = baseReactors.length ? baseReactors : allReactors;
        baseFilterEl.innerHTML = '<option value="">All reactors</option>' + opts.map(r => `<option value="${r}"${r === current ? ' selected' : ''}>${r}</option>`).join('');
    }

    if (yieldFilterEl) {
        const current = yieldFilterEl.value;
        const opts = yieldReactors.length ? yieldReactors : allReactors;
        yieldFilterEl.innerHTML = '<option value="">All reactors</option>' + opts.map(r => `<option value="${r}"${r === current ? ' selected' : ''}>${r}</option>`).join('');
    }
}

const columnLabels = {
    DateTime: 'Date and Time',
    'TOS(h)': 'TOS(h)',
    Reactor: 'Reactor',
    ESTD_H2: 'H2_out(vol%)',
    ESTD_N2: 'N2_out(vol%)',
    'N2[SLPH]': 'N2[SLPH]',
    Temperature: 'Temperature[°C]',
    Pressure: 'Pressure[bar]',
    Naphtha_online: 'Naphtha_online[vol%]',
    H2_out: 'H2_out[g/h]',
    Naphtha_out: 'Naphtha_out[g/h]',
    Carbon_out: 'Carbon_out[wt%]',
    Naphtha_in: 'Naphtha_in[g/h]',
    'Naphtha/H2': 'Naphtha/H2[w/w]',
    Gas: 'Gas',
    'C5+': 'C5+',
    H2_Consumption: 'H2_Consumption'
};

// Rows currently shown in the Base Table (reactor, date and search filters applied).
function getFilteredBaseRows() {
    const query = (calc$('#calcSearch')?.value || '').toLowerCase().trim();
    const reactor = calc$('#calcReactorFilter')?.value || '';
    const fromVal = calc$('#calcFrom')?.value || '';
    const toVal = calc$('#calcTo')?.value || '';

    const fromTime = parseFilterTimestamp(fromVal);
    let toTime = parseFilterTimestamp(toVal);
    if (toTime !== null && toVal.length === 16) {
        toTime += 59999;
    }

    const filtered = calcState.allRows.filter(row => {
        const rVal = String(row.Reactor ?? row.Sampled_reactor ?? '');
        if (reactor && rVal !== reactor) return false;

        if (fromTime !== null || toTime !== null) {
            const rowDt = parseCalcDateTime(row.DateTime || row['Date/Time']);
            const rowTime = rowDt ? rowDt.getTime() : null;
            if (rowTime !== null) {
                if (fromTime !== null && rowTime < fromTime) return false;
                if (toTime !== null && rowTime > toTime) return false;
            }
        }

        if (query) {
            return Object.values(row).join(' ').toLowerCase().includes(query);
        }
        return true;
    });
    return { filtered, isFiltered: Boolean(fromVal || toVal || query || reactor) };
}

// Text of a Base Table cell exactly as displayed.
function baseCellText(column, value) {
    if (['DateTime', 'Date/Time', 'Reactor', 'Sampled_reactor'].includes(column)) return String(value ?? '');
    return formatCalcValue(value);
}

// Column names such as "Unidentified(<C3)" must be escaped before going into innerHTML
function escapeCalcHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function renderBaseTable() {
    const thead = calc$('#calcThead');
    const tbody = calc$('#calcTbody');
    const empty = calc$('#calcEmpty');
    const badge = calc$('#calcDateBadge');
    if (!thead || !tbody) return;

    if (!calcState.allRows.length || !calcState.columns.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (badge) badge.textContent = '';
        scheduleYieldRefresh();
        return;
    }

    const { filtered, isFiltered } = getFilteredBaseRows();

    thead.innerHTML = calcState.columns.map(col => `<th>${escapeCalcHtml(columnLabels[col] || col)}</th>`).join('');
    tbody.innerHTML = filtered.map(row => {
        const cells = calcState.columns.map(col => {
            const val = row[col];
            if (col === 'DateTime' || col === 'Date/Time') {
                return `<td style="font-weight: 600; white-space: nowrap;">${val ?? ''}</td>`;
            }
            if (col === 'Reactor' || col === 'Sampled_reactor') {
                return `<td style="text-align: center; font-weight: 700; color: var(--primary-accent, #2563eb);">${val ?? ''}</td>`;
            }
            return `<td style="text-align: center;">${formatCalcValue(val)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
    }).join('');

    if (empty) empty.style.display = filtered.length ? 'none' : 'block';

    if (badge) {
        if (isFiltered) {
            badge.textContent = `Showing ${filtered.length} of ${calcState.allRows.length} records`;
        } else {
            badge.textContent = `${calcState.allRows.length} records`;
        }
    }
    scheduleYieldRefresh();
}

function readStoredCalculationState(key, populatedKeys) {
    try {
        const states = [sessionStorage, localStorage].map(storage => {
            try { return JSON.parse(storage.getItem(key) || 'null'); } catch (e) { return null; }
        }).filter(Boolean);
        return states.find(state => populatedKeys.some(name => Array.isArray(state[name]) && state[name].length)) || states[0] || null;
    } catch (e) {
        return null;
    }
}

function activeReactorAt(value, reactorRows) {
    if (!value || !Array.isArray(reactorRows) || !reactorRows.length) return '';
    const sampleDate = parseCalcDateTime(value);
    const sampleTime = sampleDate ? sampleDate.getTime() : null;
    if (sampleTime === null) return '';
    const timeline = reactorRows
        .map(row => {
            const dt = parseCalcDateTime(row.DateTime);
            return { time: dt ? dt.getTime() : null, row };
        })
        .filter(x => x.time !== null)
        .sort((a, b) => a.time - b.time);
    const cols = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
    for (let i = 0; i < timeline.length - 1; i += 1) {
        if (timeline[i].time <= sampleTime && sampleTime < timeline[i + 1].time) {
            return cols.filter(col => Number(timeline[i].row[col]) === 1).join(', ');
        }
    }
    return '';
}

function getComponentListRows() {
    const saved = readStoredCalculationState('dhaDashboardState', ['r2', 'table2_rows', 'table2Rows']);
    if (!saved) return [];
    let rows = [];
    if (Array.isArray(saved.r2)) rows = saved.r2;
    else if (Array.isArray(saved.table2_rows)) rows = saved.table2_rows;
    else if (Array.isArray(saved.table2Rows)) rows = saved.table2Rows;
    if (!rows.length) return [];

    if (Array.isArray(saved.reactorRows) && saved.reactorRows.length) {
        return rows.map(r => {
            if (r.Reactor || r['Active Reactor']) return r;
            const ar = activeReactorAt(r.DateTime, saved.reactorRows);
            return ar ? { ...r, 'Active Reactor': ar, Reactor: ar } : r;
        });
    }
    return rows;
}

function getComponentListColumns(rows) {
    const saved = readStoredCalculationState('dhaDashboardState', ['r2', 'table2_rows', 'table2Rows']);
    if (saved && Array.isArray(saved.c2) && saved.c2.length) return saved.c2;
    if (saved && Array.isArray(saved.table2_columns) && saved.table2_columns.length) return saved.table2_columns;
    if (saved && Array.isArray(saved.table2Columns) && saved.table2Columns.length) return saved.table2Columns;
    return rows.length ? Object.keys(rows[0]) : [];
}

function getDashboardStateAvailability() {
    return {
        componentRows: getComponentListRows().length > 0,
        baseRows: calcState.allRows.length > 0
    };
}

function formatYieldValue(value) {
    if (value === null || value === undefined || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number) || String(value).trim() === '') return String(value);
    const decimals = calcDecimals.yield;
    const factor = 10 ** decimals;
    const scaled = Math.abs(number) * factor;
    const rounded = Math.floor(scaled + 0.5 + Number.EPSILON * Math.max(1, scaled));
    return (Math.sign(number) * rounded / factor).toFixed(decimals);
}

function updateDecimalControls() {
    [['base', 'calc'], ['yield', 'yield']].forEach(([key, prefix]) => {
        const count = calc$(`#${prefix}DecCount`);
        const dec = calc$(`#${prefix}DecDecrease`);
        const inc = calc$(`#${prefix}DecIncrease`);
        if (count) count.textContent = `${calcDecimals[key]} dp`;
        if (dec) dec.disabled = calcDecimals[key] <= CALC_DECIMALS_MIN;
        if (inc) inc.disabled = calcDecimals[key] >= CALC_DECIMALS_MAX;
    });
}

function changeDecimals(key, delta) {
    const next = Math.min(CALC_DECIMALS_MAX, Math.max(CALC_DECIMALS_MIN, calcDecimals[key] + delta));
    if (next === calcDecimals[key]) return;
    calcDecimals[key] = next;
    try { localStorage.setItem(CALC_DECIMALS_KEY, JSON.stringify(calcDecimals)); } catch (e) { /* ignore */ }
    updateDecimalControls();
    if (key === 'base') renderBaseTable(); else renderYieldTable();
}

function yieldCellClass(value) {
    return String(value || '').startsWith('ERROR') ? ' class="yield-error-cell"' : '';
}

// Rows currently shown in the Yield Table (reactor, date and search filters applied).
function getFilteredYieldRows() {
    const yieldSearch = calc$('#yieldSearch')?.value;
    const calcSearch = calc$('#calcSearch')?.value;
    const query = (yieldSearch !== undefined && yieldSearch !== '' ? yieldSearch : (calcSearch || '')).toLowerCase().trim();

    const yieldFilterVal = calc$('#yieldReactorFilter')?.value;
    const calcFilterVal = calc$('#calcReactorFilter')?.value;
    const reactor = (yieldFilterVal !== undefined && yieldFilterVal !== '') ? yieldFilterVal : (calcFilterVal || '');

    const fromVal = calc$('#yieldFrom')?.value || calc$('#calcFrom')?.value || '';
    const toVal = calc$('#yieldTo')?.value || calc$('#calcTo')?.value || '';
    const fromTime = parseFilterTimestamp(fromVal);
    let toTime = parseFilterTimestamp(toVal);
    if (toTime !== null && toVal.length === 16) toTime += 59999;

    const filtered = calcState.yieldRows.filter(row => {
        const rowReactor = String(row.Reactor ?? row['Active Reactor'] ?? row.Sampled_reactor ?? '');
        if (reactor) {
            const list = rowReactor.split(',').map(value => value.trim());
            if (!list.includes(reactor)) return false;
        }
        const rowDate = parseCalcDateTime(row.DateTime);
        const rowTime = rowDate ? rowDate.getTime() : null;
        if (fromTime !== null && rowTime !== null && rowTime < fromTime) return false;
        if (toTime !== null && rowTime !== null && rowTime > toTime) return false;
        return !query || Object.values(row).join(' ').toLowerCase().includes(query);
    });
    return { filtered, isFiltered: Boolean(fromVal || toVal || query || reactor) };
}

// Text of a Yield Table cell exactly as displayed.
function yieldCellText(column, value) {
    if (['DateTime', 'Date/Time', 'Reactor', 'Active Reactor', 'Sampled_reactor', 'Component', 'Condition'].includes(column)) {
        return String(value ?? '');
    }
    return formatYieldValue(value);
}

function renderYieldTable() {
    const thead = calc$('#yieldThead');
    const tbody = calc$('#yieldTbody');
    const empty = calc$('#yieldEmpty');
    const badge = calc$('#yieldDateBadge');
    if (!thead || !tbody) return;
    if (!calcState.yieldRows.length || !calcState.yieldColumns.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (badge) badge.textContent = '';
        return;
    }

    const { filtered, isFiltered } = getFilteredYieldRows();

    thead.innerHTML = calcState.yieldColumns.map(column => `<th>${escapeCalcHtml(columnLabels[column] || column)}</th>`).join('');
    tbody.innerHTML = filtered.map(row => {
        const rowError = String(row._row_error || '').startsWith('ERROR: No matching DateTime');
        const cells = calcState.yieldColumns.map(column => {
            const value = row[column];
            if (column === 'DateTime' || column === 'Date/Time') {
                return `<td style="font-weight: 600; white-space: nowrap;"${yieldCellClass(value)}>${value ?? ''}</td>`;
            }
            if (column === 'Reactor' || column === 'Active Reactor' || column === 'Sampled_reactor') {
                return `<td style="text-align: center; font-weight: 700; color: var(--primary-accent, #2563eb);"${yieldCellClass(value)}>${value ?? ''}</td>`;
            }
            const display = ['Component', 'Condition'].includes(column) ? (value ?? '') : formatYieldValue(value);
            return `<td${yieldCellClass(value)} style="text-align: center;">${display}</td>`;
        }).join('');
        return `<tr${rowError ? ' class="yield-error-row"' : ''}>${cells}</tr>`;
    }).join('');

    if (empty) empty.style.display = filtered.length ? 'none' : 'block';
    if (badge) {
        if (isFiltered) {
            badge.textContent = `Showing ${filtered.length} of ${calcState.yieldRows.length} calculated records`;
        } else {
            badge.textContent = `${calcState.yieldRows.length} calculated records`;
        }
    }
    if (calc$('#yieldSummary')) calc$('#yieldSummary').textContent = `Showing ${filtered.length} of ${calcState.yieldRows.length} calculated records`;
}

let yieldRefreshTimer = null;
function scheduleYieldRefresh() {
    clearTimeout(yieldRefreshTimer);
    yieldRefreshTimer = setTimeout(refreshYieldTable, 80);
}

// Industrial DHA format: 15 reported components + grouping columns (by carbon number) at the end;
// Total = sum of all of them.
const INDUSTRIAL_YIELD_COLUMNS = [
    'Propane', 'i-Butane', 'n-Butane', 'i-Pentane', 'n-Pentane',
    '2,2-Dimethylbutane', '2,3-Dimethylbutane', '2-Methylpentane', '3-Methylpentane', 'n-Hexane',
    'Methylcyclopentane', '2-Methylhexane', '3-Methylhexane', 'n-Heptane', 'n-Octane',
    'C3 & Below', 'C3-C4', 'C4-C5', 'C5-C6', 'C6-C7', 'C7-C8', 'C8+'
];
const UNIDENTIFIED_GROUP_COLUMNS = ['C3 & Below', 'C3-C4', 'C4-C5', 'C5-C6', 'C6-C7', 'C7-C8', 'C8+'];

function ensureYieldTotalColumn(rows, columns) {
    let startIndex;
    let endIndex = -1;
    if (columns.includes('C8+')) {
        startIndex = columns.findIndex(column => INDUSTRIAL_YIELD_COLUMNS.includes(column));
        columns.forEach((column, index) => {
            if (INDUSTRIAL_YIELD_COLUMNS.includes(column)) endIndex = index;
        });
    } else {
        // Older saved runs: C3 & Below .. n-Octane
        const isOctaneColumn = column => ['n-octane', 'noctane', 'n_octane', 'octane'].includes(String(column).trim().toLowerCase());
        startIndex = columns.findIndex(column => String(column).trim().toLowerCase() === 'c3 & below');
        columns.forEach((column, index) => {
            if (isOctaneColumn(column)) endIndex = index;
        });
    }
    if (startIndex < 0 || endIndex < startIndex) return { rows, columns };

    const rangeColumns = columns.slice(startIndex, endIndex + 1).filter(column => column !== 'Total');
    const updatedColumns = columns.filter(column => column !== 'Total');
    const updatedEndIndex = updatedColumns.indexOf(columns[endIndex]);
    updatedColumns.splice(updatedEndIndex + 1, 0, 'Total');
    const updatedRows = rows.map(row => {
        let total = 0;
        let hasValue = false;
        let error = '';
        for (const column of rangeColumns) {
            const value = row[column];
            if (value === null || value === undefined || value === '') continue;
            if (typeof value === 'string' && value.startsWith('ERROR')) {
                error = value;
                break;
            }
            const number = Number(value);
            if (!Number.isFinite(number)) {
                error = 'ERROR: Invalid source value';
                break;
            }
            total += number;
            hasValue = true;
        }
        return { ...row, Total: error || (hasValue ? total : '') };
    });
    return { rows: updatedRows, columns: updatedColumns };
}

async function refreshYieldTable() {
    if (window.ILSProcess?.isReforming()) return; // reforming wof% is a later update
    const componentRows = getComponentListRows();
    if (!componentRows.length || !calcState.allRows.length) {
        calcState.yieldRows = [];
        calcState.yieldColumns = [];
        renderReactorFilter();
        renderYieldTable();
        const availability = getDashboardStateAvailability();
        if (calc$('#yieldSummary')) {
            calc$('#yieldSummary').textContent = !availability.componentRows
                ? 'No Table-2 Component List data loaded yet. Please process data on the Offline Analysis page.'
                : 'No Base Table data loaded yet. Please sync Online Analysis data on the Calculation page.';
        }
        return;
    }
    try {
        const response = await fetch('/api/calculate-yield-table', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                carbon_rows: componentRows,
                carbon_columns: getComponentListColumns(componentRows),
                base_rows: calcState.allRows
            })
        });
        if (!response.ok) throw new Error('Yield calculation failed');
        const data = await response.json();
        let cols = Array.isArray(data.columns) ? [...data.columns] : [];
        if (cols.length && !cols.includes('Reactor')) {
            const tosIdx = cols.indexOf('TOS(h)');
            if (tosIdx !== -1) {
                cols.splice(tosIdx + 1, 0, 'Reactor');
            } else {
                const dtIdx = cols.indexOf('DateTime');
                cols.splice(dtIdx !== -1 ? dtIdx + 1 : 0, 0, 'Reactor');
            }
        }
        const yieldData = ensureYieldTotalColumn(Array.isArray(data.rows) ? data.rows : [], cols);
        cols = yieldData.columns;
        calcState.yieldColumns = cols;
        calcState.yieldRows = yieldData.rows.map(row => {
            let r = row.Reactor ?? row['Active Reactor'] ?? row.Sampled_reactor ?? '';
            if (!r && calcState.allRows.length && row.DateTime) {
                const matched = calcState.allRows.find(b => b.DateTime === row.DateTime || b['Date/Time'] === row.DateTime);
                if (matched) {
                    r = matched.Reactor ?? matched.Sampled_reactor ?? '';
                }
            }
            if (!r && row.DateTime && typeof activeReactorAt === 'function') {
                try {
                    const dashSaved = readStoredCalculationState('dhaDashboardState', ['reactorRows']);
                    if (dashSaved && Array.isArray(dashSaved.reactorRows) && dashSaved.reactorRows.length) {
                        const ar = activeReactorAt(row.DateTime, dashSaved.reactorRows);
                        if (ar) r = ar;
                    }
                } catch (e) {}
            }
            return { ...row, Reactor: r };
        });
        const conditions = assignBaseConditions(calcState.yieldRows, calcState.yieldColumns, true);
        calcState.yieldColumns = conditions.columns;
        renderReactorFilter();
        try {
            sessionStorage.setItem('ils_yield_table_state', JSON.stringify({
                rows: calcState.yieldRows,
                columns: calcState.yieldColumns
            }));
        } catch (e) {}
        renderYieldTable();
    } catch (error) {
        calcState.yieldRows = [];
        calcState.yieldColumns = [];
        renderReactorFilter();
        renderYieldTable();
        console.error('Failed to calculate Yield-Table:', error);
    }
}

function loadFromOnlineState() {
    try {
        const storedOnlineState = readStoredCalculationState('dhaOnlineState', ['rows']);
        const raw = storedOnlineState ? JSON.stringify(storedOnlineState) : '';
        if (!raw) {
            calcState.allRows = [];
            calcState.columns = [];
            calcState.sourceFile = '';
            updateKpis();
            renderReactorFilter();
            renderBaseTable();
            if (calc$('#calcSummary')) {
                calc$('#calcSummary').textContent = 'No Online Analysis data loaded yet. Please import or load data in Online Analysis.';
            }
            return false;
        }
        const parsedOnlineState = JSON.parse(raw);
        if (!parsedOnlineState || !Array.isArray(parsedOnlineState.rows) || !parsedOnlineState.rows.length) {
            calcState.allRows = [];
            calcState.columns = [];
            calcState.sourceFile = '';
            updateKpis();
            renderReactorFilter();
            renderBaseTable();
            if (calc$('#calcSummary')) {
                calc$('#calcSummary').textContent = 'No Online Analysis data loaded yet. Please import or load data in Online Analysis.';
            }
            return false;
        }

        const { carbon, mw } = getActiveFeedCarbonAndMw();
        const reconstructed = reconstructBaseRows(parsedOnlineState.rows, carbon, mw);

        calcState.columns = reconstructed.columns;
        calcState.allRows = reconstructed.rows;
        calcState.sourceFile = parsedOnlineState.path || '';
        try {
            sessionStorage.setItem('ils_base_table_state', JSON.stringify({
                rows: calcState.allRows,
                columns: calcState.columns
            }));
        } catch (e) {}

        // Restore date filters if present
        if (parsedOnlineState.from && calc$('#calcFrom')) calc$('#calcFrom').value = parsedOnlineState.from;
        if (parsedOnlineState.to && calc$('#calcTo')) calc$('#calcTo').value = parsedOnlineState.to;

        const sharedDates = JSON.parse(sessionStorage.getItem('dhaDateTimeFilter') || 'null');
        if (sharedDates) {
            if (sharedDates.from && calc$('#calcFrom')) calc$('#calcFrom').value = sharedDates.from;
            if (sharedDates.to && calc$('#calcTo')) calc$('#calcTo').value = sharedDates.to;
        }

        if (calc$('#calcSummary')) {
            const fileName = calcState.sourceFile ? calcState.sourceFile.split(/[\\/]/).pop() : 'Online Analysis';
            calc$('#calcSummary').textContent = `Connected with Online Analysis (${fileName}) · ${calcState.allRows.length} records · Base Table reconstructed (${calcState.columns.length} columns displayed)`;
        }

        updateKpis();
        renderReactorFilter();
        renderBaseTable();
        return true;
    } catch (err) {
        console.error('Failed to load online state for Base table:', err);
        return false;
    }
}

async function syncDirectFromFile() {
    showCalcError();
    const btn = calc$('#calcSyncBtn');
    const oldText = btn ? btn.textContent : '';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Syncing...';
    }
    if (calc$('#calcStatus')) calc$('#calcStatus').textContent = 'Syncing...';

    try {
        // 1. Try reading directly from Online Analysis session storage first
        if (loadFromOnlineState()) {
            if (calc$('#calcStatus')) calc$('#calcStatus').textContent = 'Ready';
            return;
        }

        // 2. If session storage has no online data, check if backend has an active online file loaded
        const { carbon, mw } = getActiveFeedCarbonAndMw();
        const res = await fetch('/api/process-calculation-base', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                carbon: carbon,
                molecular_weight: mw
            })
        });

        let data = null;
        try {
            data = await res.json();
        } catch (parseErr) {
            console.error('Sync from Online Analysis: failed to parse server response', parseErr);
        }

        if (res.ok && data && Array.isArray(data.rows) && data.rows.length) {
            const matched = assignBaseConditions(data.rows, data.columns);
            calcState.columns = matched.columns;
            calcState.allRows = matched.rows;
            calcState.sourceFile = data.source_file || '';
            try {
                sessionStorage.setItem('ils_base_table_state', JSON.stringify({
                    rows: calcState.allRows,
                    columns: calcState.columns
                }));
            } catch (e) {}

            updateKpis();
            renderReactorFilter();
            renderBaseTable();

            if (calc$('#calcSummary')) {
                const fileName = calcState.sourceFile ? calcState.sourceFile.split(/[\\/]/).pop() : 'Online Analysis';
                calc$('#calcSummary').textContent = `Connected with Online Analysis (${fileName}) · ${data.record_count} records · Base Table reconstructed (${calcState.columns.length} active columns)`;
            }
            if (calc$('#calcStatus')) calc$('#calcStatus').textContent = 'Ready';
            return;
        }

        // Neither session storage nor backend active online file produced data.
        // Surface the backend's specific error instead of a generic message when available.
        const backendMessage = data && data.error;
        showCalcError(backendMessage || 'No Online Analysis data loaded yet. Please import or load a SystemTxt file on the Online Analysis page first.');
        if (!res.ok) console.error(`Sync from Online Analysis failed (HTTP ${res.status}):`, backendMessage || '(no error message returned)');
        if (calc$('#calcStatus')) calc$('#calcStatus').textContent = res.ok ? 'Ready' : 'Failed';
    } catch (err) {
        console.error('Sync from Online Analysis: request failed', err);
        showCalcError(err.message || 'Failed to sync with Online Analysis. Check your network connection and try again.');
        if (calc$('#calcStatus')) calc$('#calcStatus').textContent = 'Failed';
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = oldText || 'Sync from Online Analysis';
        }
    }
}

// Exports exactly what the table shows: display headers, filtered rows and displayed decimals.
function exportTableCsv(columns, rows, name, cellText) {
    if (!rows.length || !columns.length) {
        showCalcError('No data available to export.');
        return;
    }
    showCalcError();

    const csvCell = val => {
        const str = String(val ?? '').replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    };
    const header = columns.map(col => csvCell(columnLabels[col] || col)).join(',');
    const csvRows = rows.map(row =>
        columns.map(col => csvCell(cellText(col, row[col]))).join(',')
    );

    // BOM so Excel reads UTF-8 labels such as Temperature[°C] correctly.
    const csvContent = String.fromCharCode(0xFEFF) + [header, ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${name}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportBaseTableCsv() {
    exportTableCsv(calcState.columns, getFilteredBaseRows().filtered, 'Base_Table_Reactor_Conditions', baseCellText);
}

// Yield export (export only - the dashboard table is unchanged). Excel workbook with two sheets:
//  1. "Yield Table": Date and Time, Condition, TOS(h), Reactor No., 15 components, the carbon-range groups
//     (C3 & Below .. C8+), then the sample properties from Offline Analysis (Raw Data BS:BX).
//     The 4 industrial "Unidentified(...)" columns are not exported (they duplicate C3 & Below .. C8+).
//     Components are rounded to the displayed decimals so that each row closes exactly on its Total.
//  2. "Online Analysis": every Online Analysis column except those holding the GC empty marker or errors.
// [export column, Table-3 row key]
const YIELD_EXPORT_PROPERTIES = [
    ['Carbon', 'Carbon'],
    ['Hydrogen', 'Hydrogen'],
    ['Linear RON', 'Lin-RON'],
    ['Calculated RON', 'Cal-RON'],
    ['Molecular Weight', 'Molecular Weight'],
    ['Specific Gravity', 'Specific Gravity']
];
const YIELD_TEXT_COLUMNS = ['DateTime', 'Date/Time', 'Reactor', 'Reactor No.', 'Active Reactor', 'Sampled_reactor', 'Component', 'Condition'];

// Offline Table-3 rows (octane numbers + sample properties) keyed by DHA DateTime
function getTable3RowsByDateTime() {
    const saved = readStoredCalculationState('dhaDashboardState', ['r3', 'table3_rows']);
    const rows = saved ? (saved.r3 || saved.table3_rows || []) : [];
    return new Map(rows.map(row => [String(row.DateTime ?? ''), row]));
}

// Same half-up-away-from-zero rounding as the table display, in integer units of the last decimal.
function roundYieldUnits(number, factor) {
    const scaled = Math.abs(number) * factor;
    return Math.sign(number) * Math.floor(scaled + 0.5 + Number.EPSILON * Math.max(1, scaled));
}

// Rounds the component cells of one row so that their rounded values add up exactly to the rounded
// row total (largest-remainder method). Without this, 22 cells each rounded to 2 dp add up to
// 99.96-100.04 even though the unrounded components sum to 100. Only cells closest to a rounding
// boundary move, by one unit of the last decimal. Rows with an ERROR cell are left as displayed.
function closeYieldRowRounding(row, columns, decimals) {
    const factor = 10 ** decimals;
    const cells = [];
    const out = {};
    let invalid = false;
    columns.forEach(column => {
        const value = row[column];
        if (value === null || value === undefined || value === '') { out[column] = ''; return; }
        const number = Number(value);
        if (typeof value === 'string' && (value.startsWith('ERROR') || !Number.isFinite(number))) {
            out[column] = value;
            invalid = true;
            return;
        }
        const units = roundYieldUnits(number, factor);
        cells.push({ column, number, units, remainder: number * factor - units });
    });
    if (!invalid && cells.length) {
        const total = cells.reduce((sum, cell) => sum + cell.number, 0);
        let diff = roundYieldUnits(total, factor) - cells.reduce((sum, cell) => sum + cell.units, 0);
        const order = [...cells].sort((a, b) => diff > 0 ? b.remainder - a.remainder : a.remainder - b.remainder);
        for (const cell of order) {
            if (diff === 0) break;
            if (diff < 0 && cell.units <= 0 && cell.number >= 0) continue; // never push a value below zero
            cell.units += Math.sign(diff);
            diff -= Math.sign(diff);
        }
    }
    cells.forEach(cell => { out[cell.column] = cell.units / factor; });
    // Total of the exported (rounded) components; equals the platform's rounded Total.
    out.Total = invalid
        ? (columns.map(column => out[column]).find(value => typeof value === 'string' && value !== '') || '')
        : (cells.length ? cells.reduce((sum, cell) => sum + cell.units, 0) / factor : '');
    return out;
}

// Displayed Yield value as an Excel cell: numbers rounded to the displayed decimals, text unchanged.
function yieldExcelValue(column, value) {
    if (value === null || value === undefined || value === '') return null;
    if (YIELD_TEXT_COLUMNS.includes(column)) return String(value);
    const number = Number(value);
    if (!Number.isFinite(number) || String(value).trim() === '') return String(value);
    const factor = 10 ** calcDecimals.yield;
    return roundYieldUnits(number, factor) / factor;
}

function buildYieldExportSheet() {
    const rows = getFilteredYieldRows().filtered;
    const decimals = calcDecimals.yield;
    const numberFormat = decimals > 0 ? `0.${'0'.repeat(decimals)}` : '0';
    const label = column => columnLabels[column] || column;

    if (!calcState.yieldColumns.includes('C8+')) {
        // Older saved runs (previous grouping): plain export of the table as shown
        const columns = calcState.yieldColumns;
        const number_formats = {};
        columns.forEach(column => { if (!YIELD_TEXT_COLUMNS.includes(column)) number_formats[label(column)] = numberFormat; });
        return {
            name: 'Yield Table',
            columns: columns.map(label),
            rows: rows.map(row => columns.map(column => yieldExcelValue(column, row[column]))),
            number_formats
        };
    }

    const components = INDUSTRIAL_YIELD_COLUMNS; // 15 named components, then C3 & Below .. C8+
    const propertyNames = YIELD_EXPORT_PROPERTIES.map(([name]) => name);
    const columns = ['DateTime', 'Condition', 'TOS(h)', 'Reactor No.', ...components, 'Total', ...propertyNames];
    const table3 = getTable3RowsByDateTime();

    const exportRows = rows.map(row => {
        const closed = closeYieldRowRounding(row, components, decimals);
        const sample = table3.get(String(row.DateTime ?? ''));
        const properties = YIELD_EXPORT_PROPERTIES.map(([, key]) => {
            const raw = sample ? sample[key] : null;
            const number = Number(raw);
            return raw !== '' && raw !== null && raw !== undefined && Number.isFinite(number)
                ? Math.round(number * 1e6) / 1e6 : null; // DHA precision (6 dp)
        });
        return [
            yieldExcelValue('DateTime', row.DateTime),
            yieldExcelValue('Condition', row.Condition),
            yieldExcelValue('TOS(h)', row['TOS(h)']),
            yieldExcelValue('Reactor No.', row.Reactor ?? row['Active Reactor'] ?? ''),
            ...[...components, 'Total'].map(column => (closed[column] === '' ? null : closed[column])),
            ...properties
        ];
    });

    const number_formats = { 'TOS(h)': numberFormat };
    [...components, 'Total'].forEach(column => { number_formats[label(column)] = numberFormat; });
    return { name: 'Yield Table', columns: columns.map(label), rows: exportRows, number_formats };
}

// A cell the Online Analysis cannot use: the GC empty marker (ÿ), an error text or an Excel error code.
function isBadOnlineValue(value) {
    if (typeof value !== 'string') return typeof value === 'number' && !Number.isFinite(value);
    const text = value.trim();
    return text.includes('ÿ') || /error/i.test(text) || /^#(N\/A|VALUE!|DIV\/0!|REF!|NAME\?|NUM!|NULL!)/i.test(text) || /^nan$/i.test(text);
}

function buildOnlineExportSheet() {
    const state = readStoredCalculationState('dhaOnlineState', ['rows']);
    const rows = state && Array.isArray(state.rows) ? state.rows : [];
    if (!rows.length) return null;
    const candidates = (Array.isArray(state.allColumns) && state.allColumns.length ? state.allColumns
        : Array.isArray(state.columns) && state.columns.length ? state.columns : Object.keys(rows[0]));
    const columns = candidates.filter(column => {
        let hasValue = false;
        for (const row of rows) {
            const value = row[column];
            if (isBadOnlineValue(value)) return false;
            if (value !== null && value !== undefined && String(value).trim() !== '') hasValue = true;
        }
        return hasValue; // also drops columns that are empty in every row
    });
    const sorted = typeof sortDateTimeRows === 'function' ? sortDateTimeRows(rows) : rows;
    const excelValue = (column, value) => {
        if (value === null || value === undefined || String(value).trim() === '') return null;
        if (typeof value === 'number') return value;
        const text = String(value).trim();
        if (column !== 'DateTime' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) return Number(text);
        return text;
    };
    return {
        name: 'Online Analysis',
        columns,
        rows: sorted.map(row => columns.map(column => excelValue(column, row[column])))
    };
}

// "Export CSV": the Yield Table sheet only (same columns, rounding and Total as the Excel export).
function exportYieldTableCsv() {
    if (!calcState.yieldRows.length || !calcState.yieldColumns.length) {
        showCalcError('No data available to export.');
        return;
    }
    const sheet = buildYieldExportSheet();
    const decimals = calcDecimals.yield;
    const rows = sheet.rows.map(values => Object.fromEntries(sheet.columns.map((column, i) => [column, values[i]])));
    const cellText = (column, value) => {
        if (value === null || value === undefined) return '';
        if (typeof value !== 'number') return String(value);
        return sheet.number_formats && sheet.number_formats[column] ? value.toFixed(decimals) : String(value);
    };
    exportTableCsv(sheet.columns, rows, 'Yield_Table', cellText);
}

// "Export XLSX": two tabs, the Yield Table and the Online Analysis data.
async function exportYieldTableExcel() {
    if (!calcState.yieldRows.length || !calcState.yieldColumns.length) {
        showCalcError('No data available to export.');
        return;
    }
    const yieldSheet = buildYieldExportSheet();
    if (!yieldSheet.rows.length) {
        showCalcError('No data available to export.');
        return;
    }
    showCalcError();
    const sheets = [yieldSheet];
    const onlineSheet = buildOnlineExportSheet();
    if (onlineSheet) sheets.push(onlineSheet);

    const btn = calc$('#yieldExportXlsx');
    const oldText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Exporting...'; }
    try {
        const fileName = `Yield_Table_${new Date().toISOString().slice(0, 10)}.xlsx`;
        const response = await fetch('/api/export-xlsx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: fileName, sheets })
        });
        if (!response.ok) {
            let message = `Export failed (HTTP ${response.status}).`;
            try { message = (await response.json()).error || message; } catch (e) { /* not JSON */ }
            throw new Error(message);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        if (!onlineSheet) showCalcError('Exported the Yield Table only: no Online Analysis data is loaded, so the Online Analysis tab was skipped.');
    } catch (error) {
        showCalcError(error.message || 'Export failed.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = oldText || 'Export XLSX'; }
    }
}

function switchSubtab(tabName) {
    calcState.activeSubtab = tabName;
    document.querySelectorAll('.table-tabs .table-tab').forEach(btn => {
        const isActive = btn.dataset.subtab === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    const basePanel = calc$('#baseTablePanel');
    if (basePanel) {
        basePanel.hidden = (tabName !== 'base_table');
    }
    const reformingPanel = calc$('#reformingCarbonPanel');
    if (reformingPanel) {
        reformingPanel.hidden = (tabName !== 'reforming_carbon');
        if (tabName === 'reforming_carbon') window.ILSReformingCarbon?.render();
    }
    const reformingSummaryPanel = calc$('#reformingSummaryPanel');
    if (reformingSummaryPanel) {
        reformingSummaryPanel.hidden = (tabName !== 'reforming_summary');
        if (tabName === 'reforming_summary') window.ILSReformingCarbon?.renderSummary();
    }
    const yieldPanel = calc$('#yieldTablePanel');
    if (yieldPanel) {
        yieldPanel.hidden = (tabName !== 'yield_table');
        if (tabName === 'yield_table') {
            if (calc$('#calcReactorFilter') && calc$('#yieldReactorFilter') && !calc$('#yieldReactorFilter').value) {
                calc$('#yieldReactorFilter').value = calc$('#calcReactorFilter').value;
            }
            if (calc$('#calcFrom') && calc$('#yieldFrom') && !calc$('#yieldFrom').value) {
                calc$('#yieldFrom').value = calc$('#calcFrom').value;
            }
            if (calc$('#calcTo') && calc$('#yieldTo') && !calc$('#yieldTo').value) {
                calc$('#yieldTo').value = calc$('#calcTo').value;
            }
            renderReactorFilter();
            renderYieldTable();
        }
    }
}

function formatTwoDecimals(val) {
    if (val === null || val === undefined || val === '') return '—';
    const num = Number(val);
    if (!isNaN(num) && Number.isFinite(num)) {
        return num.toFixed(2);
    }
    return String(val);
}

function renderFeedProperties(feedRows) {
    if (!Array.isArray(feedRows) || !feedRows.length) return;

    // First three rows: Row 0 -> Carbon, Row 1 -> Hydrogen, Row 2 -> Molecular Weight
    const getProp = (idx, nameKey) => {
        if (feedRows.length > idx && feedRows[idx]) {
            const r = feedRows[idx];
            if (r.component && (!nameKey || r.component.toLowerCase().includes(nameKey.toLowerCase()))) {
                return r;
            }
        }
        if (nameKey) {
            const found = feedRows.find(r => r.component && r.component.toLowerCase().includes(nameKey.toLowerCase()));
            if (found) return found;
        }
        return feedRows[idx] || null;
    };

    const carbon = getProp(0, 'carbon');
    const hydrogen = getProp(1, 'hydrogen');
    const mw = getProp(2, 'molecular');

    if (carbon) {
        const valEl = calc$('#calcFeedCarbonVal');
        const unitEl = calc$('#calcFeedCarbonUnit');
        if (valEl) valEl.textContent = formatTwoDecimals(carbon.value);
        if (unitEl) unitEl.textContent = carbon.unit || '';
    }

    if (hydrogen) {
        const valEl = calc$('#calcFeedHydrogenVal');
        const unitEl = calc$('#calcFeedHydrogenUnit');
        if (valEl) valEl.textContent = formatTwoDecimals(hydrogen.value);
        if (unitEl) unitEl.textContent = hydrogen.unit || '';
    }

    if (mw) {
        const valEl = calc$('#calcFeedMWVal');
        const unitEl = calc$('#calcFeedMWUnit');
        if (valEl) valEl.textContent = formatTwoDecimals(mw.value);
        if (unitEl) unitEl.textContent = mw.unit || '';
    }
}

async function loadFeedProperties() {
    // 1. Try reading from sessionStorage first
    try {
        const explicit = sessionStorage.getItem('ils_feed_properties');
        if (explicit) {
            const parsed = JSON.parse(explicit);
            if (Array.isArray(parsed) && parsed.length) {
                renderFeedProperties(parsed);
                return;
            }
        }
        const rpStateRaw = sessionStorage.getItem('runPlanDashboardState');
        if (rpStateRaw) {
            const rpState = JSON.parse(rpStateRaw);
            if (rpState && Array.isArray(rpState.feedRows) && rpState.feedRows.length) {
                renderFeedProperties(rpState.feedRows);
                return;
            }
        }
    } catch (e) { }

    // 2. Fetch from backend API
    try {
        const res = await fetch('/api/feed-properties');
        if (res.ok) {
            const data = await res.json();
            const rows = data.rows || data.all_rows || [];
            if (Array.isArray(rows) && rows.length) {
                renderFeedProperties(rows);
                try {
                    sessionStorage.setItem('ils_feed_properties', JSON.stringify(rows));
                } catch (e) { }
            }
        }
    } catch (err) {
        console.warn('Could not load feed properties:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Attempt to load from Online Analysis session state
    const hasData = loadFromOnlineState();
    if (!hasData) {
        calcState.allRows = [];
        calcState.columns = [];
        updateKpis();
        renderReactorFilter();
        renderBaseTable();
        if (calc$('#calcSummary')) {
            calc$('#calcSummary').textContent = 'No Online Analysis data loaded yet. Please import or load data in Online Analysis.';
        }
    }

    // Load Synthetic Feed Analysis properties (Carbon, Hydrogen, Molecular Weight)
    loadFeedProperties();

    // 2. Wire event listeners
    if (calc$('#calcSearch')) calc$('#calcSearch').oninput = () => {
        renderBaseTable();
        if (calcState.activeSubtab === 'yield_table') renderYieldTable();
    };
    if (calc$('#calcReactorFilter')) calc$('#calcReactorFilter').onchange = () => {
        if (calc$('#yieldReactorFilter') && !calc$('#yieldReactorFilter').value) {
            calc$('#yieldReactorFilter').value = calc$('#calcReactorFilter').value;
        }
        renderBaseTable();
        renderYieldTable();
    };
    if (calc$('#calcFrom')) calc$('#calcFrom').oninput = () => {
        if (calc$('#yieldFrom') && !calc$('#yieldFrom').value) {
            calc$('#yieldFrom').value = calc$('#calcFrom').value;
        }
        renderBaseTable();
    };
    if (calc$('#calcTo')) calc$('#calcTo').oninput = () => {
        if (calc$('#yieldTo') && !calc$('#yieldTo').value) {
            calc$('#yieldTo').value = calc$('#calcTo').value;
        }
        renderBaseTable();
    };

    if (calc$('#yieldReactorFilter')) calc$('#yieldReactorFilter').onchange = renderYieldTable;
    if (calc$('#yieldSearch')) calc$('#yieldSearch').oninput = renderYieldTable;
    if (calc$('#yieldFrom')) calc$('#yieldFrom').oninput = renderYieldTable;
    if (calc$('#yieldTo')) calc$('#yieldTo').oninput = renderYieldTable;

    if (calc$('#calcClearDates')) {
        calc$('#calcClearDates').onclick = () => {
            if (calc$('#calcFrom')) calc$('#calcFrom').value = '';
            if (calc$('#calcTo')) calc$('#calcTo').value = '';
            if (calc$('#yieldFrom')) calc$('#yieldFrom').value = '';
            if (calc$('#yieldTo')) calc$('#yieldTo').value = '';
            renderBaseTable();
            renderYieldTable();
        };
    }

    if (calc$('#yieldClearDates')) {
        calc$('#yieldClearDates').onclick = () => {
            if (calc$('#yieldFrom')) calc$('#yieldFrom').value = '';
            if (calc$('#yieldTo')) calc$('#yieldTo').value = '';
            renderYieldTable();
        };
    }

    if (calc$('#calcSyncBtn')) {
        calc$('#calcSyncBtn').onclick = syncDirectFromFile;
    }

    if (calc$('#calcExportCsv')) {
        calc$('#calcExportCsv').onclick = exportBaseTableCsv;
    }

    if (calc$('#yieldExportCsv')) {
        calc$('#yieldExportCsv').onclick = exportYieldTableCsv;
    }
    if (calc$('#yieldExportXlsx')) {
        calc$('#yieldExportXlsx').onclick = exportYieldTableExcel;
    }

    if (calc$('#calcDecDecrease')) calc$('#calcDecDecrease').onclick = () => changeDecimals('base', -1);
    if (calc$('#calcDecIncrease')) calc$('#calcDecIncrease').onclick = () => changeDecimals('base', 1);
    if (calc$('#yieldDecDecrease')) calc$('#yieldDecDecrease').onclick = () => changeDecimals('yield', -1);
    if (calc$('#yieldDecIncrease')) calc$('#yieldDecIncrease').onclick = () => changeDecimals('yield', 1);
    updateDecimalControls();

    // Sub-tab button wiring
    document.querySelectorAll('.table-tabs .table-tab').forEach(btn => {
        btn.onclick = () => switchSubtab(btn.dataset.subtab);
    });

    // Cross-tab / storage updates
    window.addEventListener('storage', e => {
        if (e.key === 'dhaOnlineState') {
            loadFromOnlineState();
        }
        if (e.key === 'dhaDashboardState') {
            scheduleYieldRefresh();
        }
        if (e.key === 'ils_feed_properties' || e.key === 'runPlanDashboardState') {
            loadFeedProperties();
        }
    });
    window.addEventListener('focus', () => {
        loadFromOnlineState();
        scheduleYieldRefresh();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadFromOnlineState();
            scheduleYieldRefresh();
        }
    });
});
