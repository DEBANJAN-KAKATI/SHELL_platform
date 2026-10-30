/**
 * Plots Page - Scatter Plot Visualization for DHA Data Dashboard
 * Yield Table and Base Table X vs Y scatter visualization with multi-select reactor filter
 * and datetime range filter.
 * Supports per-reactor distinct colors and geometric point symbols.
 * Allows selecting single Y-axis parameter from either Yield Table or Base Table tags.
 */

(function () {
    'use strict';

    const $ = selector => document.querySelector(selector);
    const $$ = selector => Array.from(document.querySelectorAll(selector));

    // Standard Reactor Visual Configuration: all markers are circles, distinguished by
    // border color and fill transparency (alpha) per reactor.
    const REACTOR_THEME = {
        'R1': {
            label: 'R1',
            border: '#eb5e28',          // Warm Terracotta
            bg: 'rgba(235, 94, 40, 0.92)',
            pointStyle: 'circle',
            symbolName: 'Circle · 92% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#eb5e28" fill-opacity="0.92" stroke="#eb5e28" stroke-width="1.5" />'
        },
        'R2': {
            label: 'R2',
            border: '#2563eb',          // Royal Blue
            bg: 'rgba(37, 99, 235, 0.80)',
            pointStyle: 'circle',
            symbolName: 'Circle · 80% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#2563eb" fill-opacity="0.80" stroke="#2563eb" stroke-width="1.5" />'
        },
        'R3': {
            label: 'R3',
            border: '#059669',          // Emerald Green
            bg: 'rgba(5, 150, 105, 0.68)',
            pointStyle: 'circle',
            symbolName: 'Circle · 68% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#059669" fill-opacity="0.68" stroke="#059669" stroke-width="1.5" />'
        },
        'R4': {
            label: 'R4',
            border: '#7c3aed',          // Violet Purple
            bg: 'rgba(124, 58, 237, 0.56)',
            pointStyle: 'circle',
            symbolName: 'Circle · 56% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#7c3aed" fill-opacity="0.56" stroke="#7c3aed" stroke-width="1.5" />'
        },
        'R5': {
            label: 'R5',
            border: '#d97706',          // Amber Ochre
            bg: 'rgba(217, 119, 6, 0.44)',
            pointStyle: 'circle',
            symbolName: 'Circle · 44% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#d97706" fill-opacity="0.44" stroke="#d97706" stroke-width="1.5" />'
        },
        'R6': {
            label: 'R6',
            border: '#0891b2',          // Cyan Teal
            bg: 'rgba(8, 145, 178, 0.32)',
            pointStyle: 'circle',
            symbolName: 'Circle · 32% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#0891b2" fill-opacity="0.32" stroke="#0891b2" stroke-width="1.5" />'
        },
        'R7': {
            label: 'R7',
            border: '#db2777',          // Deep Rose
            bg: 'rgba(219, 39, 119, 0.22)',
            pointStyle: 'circle',
            symbolName: 'Circle · 22% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#db2777" fill-opacity="0.22" stroke="#db2777" stroke-width="1.5" />'
        },
        'R8': {
            label: 'R8',
            border: '#475569',          // Slate Charcoal
            bg: 'rgba(71, 85, 105, 0.14)',
            pointStyle: 'circle',
            symbolName: 'Circle · 14% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#475569" fill-opacity="0.14" stroke="#475569" stroke-width="1.5" />'
        },
        'Default': {
            label: 'Other',
            border: '#c15f3e',
            bg: 'rgba(193, 95, 62, 0.5)',
            pointStyle: 'circle',
            symbolName: 'Circle · 50% fill',
            svg: '<circle cx="8" cy="8" r="5.5" fill="#c15f3e" fill-opacity="0.5" stroke="#c15f3e" stroke-width="1.5" />'
        }
    };

    const STANDARD_REACTORS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];

    const CONDITION_MARKERS = [
        { style: 'circle', svg: '<circle cx="8" cy="8" r="5" />' },
        { style: 'triangle', svg: '<path d="M8 2 14 13H2Z" />' },
        { style: 'rect', svg: '<rect x="3" y="3" width="10" height="10" />' },
        { style: 'rectRot', svg: '<path d="M8 1 15 8 8 15 1 8Z" />' },
        { style: 'star', svg: '<path d="M8 1 9.7 5.6 14.5 5.6 10.6 8.7 12.1 14 8 11 3.9 14 5.4 8.7 1.5 5.6 6.3 5.6Z" />' },
        { style: 'cross', svg: '<path d="M6 2H10V6H14V10H10V14H6V10H2V6H6Z" />' },
        { style: 'crossRot', svg: '<path d="M4 2 8 6 12 2 14 4 10 8 14 12 12 14 8 10 4 14 2 12 6 8 2 4Z" />' },
        { style: 'rectRounded', svg: '<rect x="2.5" y="2.5" width="11" height="11" rx="3" />' },
        { style: 'triangle', rotation: 180, svg: '<path d="M8 14 2 3H14Z" />' },
        { style: 'rectRounded', rotation: 45, svg: '<rect x="3" y="3" width="10" height="10" rx="2" transform="rotate(45 8 8)" />' }
    ];

    const FIC_MAPPING = {
        1: '10i1FIC01', 2: '10i1FIC02', 3: '10i1FIC03', 4: '10i1FIC04',
        5: '10i2FIC01', 6: '10i2FIC02', 7: '10i2FIC03', 8: '10i2FIC04'
    };
    const TEMPERATURE_MAPPING = {
        1: '10i1TIC02', 2: '10i1TIC02', 3: '10i1TIC02', 4: '10i1TIC02',
        5: '10i2TIC02', 6: '10i2TIC02', 7: '10i2TIC02', 8: '10i2TIC02'
    };
    const PRESSURE_MAPPING = {
        1: '10i1PIC01', 2: '10i1PIC01', 3: '10i1PIC01', 4: '10i1PIC01',
        5: '10i2PIC01', 6: '10i2PIC01', 7: '10i2PIC01', 8: '10i2PIC01'
    };

    // Base Table column tags under Calculation Table page
    const BASE_TABLE_NUMERIC_COLS = [
        'Temperature',
        'Pressure',
        'N2[SLPH]',
        'Naphtha_online',
        'H2_out',
        'Naphtha_out',
        'Carbon_out',
        'Naphtha_in',
        'Naphtha/H2',
        'ESTD_H2',
        'ESTD_N2',
        'TOS[h]'
    ];

    const BASE_TABLE_LABELS = {
        'Temperature': 'Temperature [°C]',
        'Pressure': 'Pressure [bar]',
        'N2[SLPH]': 'N2 [SLPH]',
        'Naphtha_online': 'Naphtha_online [mol%]',
        'H2_out': 'H2_out [g/h]',
        'Naphtha_out': 'Naphtha_out [g/h]',
        'Carbon_out': 'Carbon_out [wt%]',
        'Naphtha_in': 'Naphtha_in [g/h]',
        'Naphtha/H2': 'Naphtha/H2 [w/w]',
        'ESTD_H2': 'ESTD_H2 [mol%]',
        'ESTD_N2': 'ESTD_N2 [mol%]',
        'TOS[h]': 'TOS [h]'
    };

    // Table-3 Octane Table column tags from Offline Analysis
    const TABLE3_NUMERIC_COLS = [
        'Lin-RON',
        'Lin-MON',
        'Cal-RON',
        'Cal-MON',
        'TOS(h)'
    ];

    const TABLE3_LABELS = {
        'Lin-RON': 'Lin-RON',
        'Lin-MON': 'Lin-MON',
        'Cal-RON': 'Cal-RON',
        'Cal-MON': 'Cal-MON',
        'TOS(h)': 'TOS(h)'
    };

    const REFORMING_SUMMARY_LABELS = {
        'Paraffins': 'Paraffins (wt%)',
        'Iso Paraffins': 'Iso Paraffins (wt%)',
        'Naphthenes': 'Naphthenes (wt%)',
        'Aromatics': 'Aromatics (wt%)',
        'Olefins': 'Olefins (wt%)',
        'Unknowns': 'Unknowns (wt%)',
        'Total': 'Total (wt%)'
    };

    function getParamLabel(param) {
        if (!param) return '—';
        return BASE_TABLE_LABELS[param] || TABLE3_LABELS[param] || REFORMING_SUMMARY_LABELS[param] || param;
    }

    // Internal state - strictly single Y axis
    const plotState = {
        rows: [],
        columns: [],
        baseRows: [],
        table3Rows: [],
        customColumns: [],
        chart: null,
        availableColumns: [],
        selectedX: 'TOS(h)',
        selectedY: '',
        allKnownReactors: [...STANDARD_REACTORS],
        selectedReactors: new Set([...STANDARD_REACTORS]),
        conditionRanges: new Map(),
        conditionMarkers: new Map(),
        selectedConditions: null,
        fromDate: '',
        toDate: '',
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null,
        xTitle: '',
        yTitle: '',
        showTrend: false,
        trendWindow: 3,
        connectReactors: false,
        paperSize: 'auto',
        excludeMode: false,
        excludedPointKeys: []
    };

    function showError(message) {
        const errorEl = $('#plotError');
        if (!errorEl) return;
        if (!message) {
            errorEl.style.display = 'none';
            errorEl.textContent = '';
        } else {
            errorEl.style.display = 'block';
            errorEl.textContent = message;
        }
    }

    function setStatus(text, ready = true) {
        const statusEl = $('#plotStatus');
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.className = ready ? 'pill' : 'pill pending';
        }
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

    function normalizeReactor(val) {
        if (val === null || val === undefined || val === '') return '';
        const s = String(val).trim();
        if (s === '0' || s === '0.0' || s.toLowerCase() === 'none' || s.toLowerCase() === 'unknown') return '';
        const match = s.match(/^[Rr]?([1-8])$/i);
        if (match) return 'R' + match[1];
        if (s.toUpperCase().startsWith('R')) return s.toUpperCase();
        return s;
    }

    function parseDate(dtStr) {
        if (!dtStr) return null;
        const text = String(dtStr).trim();
        const dmyMatch = text.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
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
        const iso = Date.parse(text.replace(' ', 'T'));
        return isNaN(iso) ? null : new Date(iso);
    }

    function parseConditionBoundary(value, endOfDay) {
        const text = String(value ?? '').trim();
        const isoDate = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        const localDate = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
        if (isoDate || localDate) {
            const [year, month, day] = isoDate
                ? [Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3])]
                : [Number(localDate[3]), Number(localDate[2]), Number(localDate[1])];
            const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
            return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
        }
        return parseDate(text);
    }

    function loadConditionRanges() {
        let rows = [];
        try {
            const saved = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || '{}');
            if (Array.isArray(saved.doeData?.rows)) rows = saved.doeData.rows;
        } catch (e) { }

        const ranges = new Map();
        rows.forEach(row => {
            const doeValue = label => row[label] ?? row[Object.keys(row).find(key => key.replace(/\n/g, ' ').trim() === label)] ?? '';
            const condition = String(doeValue('Condition No.') ?? '').trim();
            if (!condition) return;
            if (!ranges.has(condition)) ranges.set(condition, []);
            const start = parseConditionBoundary(doeValue('Start Date'), false);
            const end = parseConditionBoundary(doeValue('End Date'), true);
            if (start && end && start <= end) ranges.get(condition).push({ start, end });
        });
        const validConditions = [...ranges].filter(([, intervals]) => intervals.length).map(([condition]) => condition);
        plotState.selectedConditions = plotState.selectedConditions === null
            ? new Set(validConditions)
            : new Set([...plotState.selectedConditions].filter(condition => validConditions.includes(condition)));
        plotState.conditionRanges = ranges;
        plotState.conditionMarkers = new Map(validConditions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((condition, index) => [condition, { ...CONDITION_MARKERS[index % CONDITION_MARKERS.length], hollow: Math.floor(index / CONDITION_MARKERS.length) % 2 === 1 }]));
        populateConditionFilter();
    }

    function matchingConditions(value) {
        const date = parseDate(value);
        if (!date) return [];
        return [...plotState.selectedConditions]
            .filter(condition => (plotState.conditionRanges.get(condition) || []).some(({ start, end }) => date >= start && date <= end))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }

    function populateConditionFilter() {
        const list = $('#conditionCheckboxList');
        const button = $('#plotConditionBtn');
        if (!list || !button) return;
        list.replaceChildren();
        const conditions = [...plotState.conditionRanges.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        conditions.forEach(condition => {
            const hasRange = plotState.conditionRanges.get(condition).length > 0;
            const label = document.createElement('label');
            label.className = 'reactor-check-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = condition;
            checkbox.disabled = !hasRange;
            checkbox.checked = hasRange && plotState.selectedConditions.has(condition);
            const text = document.createElement('span');
            text.textContent = `Condition ${condition}`;
            label.append(checkbox, text);
            if (!hasRange) {
                label.style.opacity = '0.55';
                label.style.cursor = 'not-allowed';
                const missing = document.createElement('span');
                missing.className = 'reactor-count-badge';
                missing.textContent = 'No date range';
                label.append(missing);
            }
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) plotState.selectedConditions.add(condition);
                else plotState.selectedConditions.delete(condition);
                updateConditionButtonLabel();
                renderPlot();
            });
            list.append(label);
        });
        button.disabled = !conditions.length;
        updateConditionButtonLabel();
    }

    function updateConditionButtonLabel() {
        const text = $('#plotConditionBtnText');
        if (!text) return;
        const available = [...plotState.conditionRanges.values()].filter(intervals => intervals.length).length;
        const selected = plotState.selectedConditions.size;
        text.textContent = !available ? 'No dated conditions' : selected === available
            ? `All Conditions (${available})` : selected === 0
                ? 'No Conditions Selected' : `${selected} of ${available} Conditions`;
    }

    function findMatchingDateTime(dtStr, candidateList) {
        if (!dtStr || !candidateList || !candidateList.length) return null;
        const targetDate = parseDate(dtStr);
        if (!targetDate) return null;
        const targetTime = targetDate.getTime();
        let closest = null;
        let minDiff = 3600 * 1000 + 1; // 1-hour window
        for (const cand of candidateList) {
            const cDate = parseDate(cand.DateTime ?? cand['Date/Time']);
            if (cDate) {
                const diff = Math.abs(cDate.getTime() - targetTime);
                if (diff <= 3600 * 1000 && diff < minDiff) {
                    minDiff = diff;
                    closest = cand;
                }
            }
        }
        return closest;
    }

    function activeReactorAt(value, reactorRows) {
        if (!value || !Array.isArray(reactorRows) || !reactorRows.length) return '';
        const sampleDate = parseDate(value);
        const sampleTime = sampleDate ? sampleDate.getTime() : null;
        if (sampleTime === null) return '';
        const timeline = reactorRows
            .map(row => {
                const dt = parseDate(row.DateTime);
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

    function reconstructBaseRows(rawRows, carbon, mw, reactorRows) {
        return rawRows.map(row => {
            const dateVal = row.DateTime ?? row['Date/Time'] ?? '';
            let reactorVal = normalizeReactor(row.Reactor ?? row.Sampled_reactor);
            if (!reactorVal && reactorRows && reactorRows.length) {
                const ar = activeReactorAt(dateVal, reactorRows);
                if (ar) reactorVal = normalizeReactor(ar);
            }

            const rNum = parseReactorNum(reactorVal);
            const ficCol = rNum ? FIC_MAPPING[rNum] : null;
            const tempCol = rNum ? TEMPERATURE_MAPPING[rNum] : null;
            const pressCol = rNum ? PRESSURE_MAPPING[rNum] : null;

            const rawN2Slph = (row['N2[SLPH]'] !== undefined && row['N2[SLPH]'] !== null && row['N2[SLPH]'] !== '')
                ? Number(row['N2[SLPH]'])
                : ((ficCol && row[ficCol] !== undefined && row[ficCol] !== null && row[ficCol] !== '')
                    ? Number(row[ficCol])
                    : (row['FIC_' + rNum] !== undefined ? Number(row['FIC_' + rNum]) : null));
            const n2Slph = rawN2Slph !== null ? rawN2Slph / 1000 : null;

            const temp = (row.Temperature !== undefined && row.Temperature !== null && row.Temperature !== '')
                ? Number(row.Temperature)
                : ((tempCol && row[tempCol] !== undefined && row[tempCol] !== null && row[tempCol] !== '')
                    ? Number(row[tempCol])
                    : (row['TI_' + rNum] !== undefined ? Number(row['TI_' + rNum]) : null));

            const press = (row.Pressure !== undefined && row.Pressure !== null && row.Pressure !== '')
                ? Number(row.Pressure)
                : ((pressCol && row[pressCol] !== undefined && row[pressCol] !== null && row[pressCol] !== '')
                    ? Number(row[pressCol])
                    : (row['PI_' + rNum] !== undefined ? Number(row['PI_' + rNum]) : null));

            const estdH2 = (row.ESTD_H2 !== undefined && row.ESTD_H2 !== null && row.ESTD_H2 !== '') ? Number(row.ESTD_H2) : null;
            const estdN2 = (row.ESTD_N2 !== undefined && row.ESTD_N2 !== null && row.ESTD_N2 !== '') ? Number(row.ESTD_N2) : null;

            let naphthaOnline = (row.Naphtha_online !== undefined && row.Naphtha_online !== null && row.Naphtha_online !== '')
                ? Number(row.Naphtha_online)
                : null;
            let h2Out = (row.H2_out !== undefined && row.H2_out !== null && row.H2_out !== '')
                ? Number(row.H2_out)
                : null;
            let naphthaOut = (row.Naphtha_out !== undefined && row.Naphtha_out !== null && row.Naphtha_out !== '')
                ? Number(row.Naphtha_out)
                : null;
            let carbonOut = (row.Carbon_out !== undefined && row.Carbon_out !== null && row.Carbon_out !== '')
                ? Number(row.Carbon_out)
                : null;
            let naphthaIn = (row.Naphtha_in !== undefined && row.Naphtha_in !== null && row.Naphtha_in !== '')
                ? Number(row.Naphtha_in)
                : null;
            let naphthaH2 = (row['Naphtha/H2'] !== undefined && row['Naphtha/H2'] !== null && row['Naphtha/H2'] !== '')
                ? Number(row['Naphtha/H2'])
                : null;

            if (naphthaOnline === null && estdH2 !== null && estdN2 !== null) {
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
            }

            if (naphthaH2 === null) {
                if (estdH2 !== 0 && estdH2 !== null && naphthaOnline !== null) {
                    naphthaH2 = (naphthaOnline * mw) / (estdH2 * 2);
                } else if (naphthaIn !== null && h2Out !== null && h2Out !== 0) {
                    naphthaH2 = naphthaIn / h2Out;
                }
            }

            return {
                DateTime: dateVal,
                'TOS[h]': row['TOS[h]'] ?? row.TOS ?? '',
                Reactor: reactorVal,
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
    }

    function getBaseTableRows() {
        // 1. Try ils_base_table_state
        try {
            const raw = sessionStorage.getItem('ils_base_table_state');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed.rows) && parsed.rows.length > 0) {
                    return parsed.rows;
                }
            }
        } catch (e) { }

        // 2. Try reconstruct from dhaOnlineState
        try {
            let onlineRows = [];
            const onlineRaw = sessionStorage.getItem('dhaOnlineState') || localStorage.getItem('dhaOnlineState');
            if (onlineRaw) {
                const onlineState = JSON.parse(onlineRaw);
                onlineRows = onlineState.rows || [];
            }
            if (onlineRows.length > 0) {
                let reactorRows = [];
                const dashRaw = sessionStorage.getItem('dhaDashboardState') || localStorage.getItem('dhaDashboardState');
                if (dashRaw) {
                    const dashState = JSON.parse(dashRaw);
                    reactorRows = dashState.reactorRows || [];
                }
                const { carbon, mw } = getActiveFeedCarbonAndMw();
                return reconstructBaseRows(onlineRows, carbon, mw, reactorRows);
            }
        } catch (e) { }

        return [];
    }

    function mergeBaseTableValues(yieldRows, baseRows) {
        if (!Array.isArray(yieldRows) || !yieldRows.length) return [];
        if (!Array.isArray(baseRows) || !baseRows.length) return yieldRows;

        return yieldRows.map(row => {
            const matched = findMatchingDateTime(row.DateTime, baseRows);
            if (matched) {
                BASE_TABLE_NUMERIC_COLS.forEach(col => {
                    if (row[col] === undefined || row[col] === null || row[col] === '') {
                        if (matched[col] !== undefined && matched[col] !== null) {
                            row[col] = matched[col];
                        }
                    }
                });
                if ((row['TOS(h)'] === undefined || row['TOS(h)'] === '') && matched['TOS[h]'] !== undefined) {
                    row['TOS(h)'] = matched['TOS[h]'];
                }
            }
            return row;
        });
    }

    function getCustomTable() {
        try {
            const saved = JSON.parse(sessionStorage.getItem('ils_custom_table_state') || '{}');
            if (Array.isArray(saved.columns) && Array.isArray(saved.rows)) return saved;
        } catch (e) { }
        return { columns: [], rows: [] };
    }

    function mergeCustomValues(rows, customTable) {
        if (!customTable.rows.length || !customTable.columns.length) return rows;
        return rows.map(row => {
            const reactor = getRowReactor(row);
            const candidates = reactor === 'Unknown' ? customTable.rows : customTable.rows.filter(candidate => getRowReactor(candidate) === reactor);
            const matched = findMatchingDateTime(row.DateTime || row['Date/Time'], candidates);
            if (!matched) return row;
            const merged = { ...row };
            customTable.columns.forEach(col => {
                if (!BASE_TABLE_NUMERIC_COLS.includes(col) && matched[col] !== undefined) merged[col] = matched[col];
            });
            return merged;
        });
    }

    function withTos(rows) {
        let cumulative = 0.0, prevTime = null;
        return rows.map((row, idx) => {
            if (row['TOS(h)'] !== undefined && row['TOS(h)'] !== null && row['TOS(h)'] !== '') return row;
            const t = parseDate(row.DateTime);
            let tos = 0.0;
            if (idx === 0) {
                tos = 0.0;
                prevTime = t ? t.getTime() : null;
            } else if (t !== null && prevTime !== null) {
                const diff = (t.getTime() - prevTime) / 3600000;
                cumulative += diff;
                tos = Math.round(cumulative * 100) / 100;
                prevTime = t.getTime();
            } else {
                tos = 0.0;
            }
            return { ...row, 'TOS(h)': tos };
        });
    }

    function getTable3Rows() {
        try {
            const raw = sessionStorage.getItem('dhaDashboardState') || localStorage.getItem('dhaDashboardState');
            if (raw) {
                const state = JSON.parse(raw);
                const r3 = state.r3 || state.table3_rows || state.table3Rows || [];
                if (Array.isArray(r3) && r3.length > 0) {
                    return withTos(r3);
                }
            }
        } catch (e) {
            console.warn('Failed to retrieve Table-3 rows:', e);
        }
        return [];
    }

    function mergeTable3Values(targetRows, table3Rows) {
        if (!Array.isArray(targetRows) || !targetRows.length) return [];
        if (!Array.isArray(table3Rows) || !table3Rows.length) return targetRows;

        const colsToCopy = ['Lin-RON', 'Lin-MON', 'Cal-RON', 'Cal-MON', 'TOS(h)'];

        return targetRows.map(row => {
            let matched = null;
            if (row['File Name']) {
                matched = table3Rows.find(t => t['File Name'] === row['File Name']);
            }
            if (!matched && row.UID) {
                matched = table3Rows.find(t => t.UID === row.UID);
            }
            if (!matched && row.DateTime) {
                const rVal = getRowReactor(row);
                const candidates = (rVal && rVal !== 'Unknown')
                    ? table3Rows.filter(t => {
                        const tr = normalizeReactor(t.Reactor || t['Active Reactor']);
                        return !tr || tr === rVal;
                    })
                    : table3Rows;
                matched = findMatchingDateTime(row.DateTime, candidates.length ? candidates : table3Rows);
            }

            if (matched) {
                colsToCopy.forEach(col => {
                    if (matched[col] !== undefined && matched[col] !== null && matched[col] !== '') {
                        if (row[col] === undefined || row[col] === null || row[col] === '') {
                            row[col] = matched[col];
                        }
                    }
                });
                if ((row['TOS(h)'] === undefined || row['TOS(h)'] === '') && matched['TOS(h)'] !== undefined) {
                    row['TOS(h)'] = matched['TOS(h)'];
                }
            }
            return row;
        });
    }

    function getRowReactor(row) {
        const val = row.Reactor ?? row['Active Reactor'] ?? row.Sampled_reactor;
        const norm = normalizeReactor(val);
        return norm || 'Unknown';
    }

    /**
     * Enrich rows with Reactor from multiple sources if missing
     */
    function enrichRowsWithReactors(rows) {
        if (!Array.isArray(rows) || !rows.length) return rows;

        let reactorTimeline = [];
        let componentRows = [];
        try {
            const dashRaw = sessionStorage.getItem('dhaDashboardState') || localStorage.getItem('dhaDashboardState');
            if (dashRaw) {
                const parsed = JSON.parse(dashRaw);
                if (Array.isArray(parsed.reactorRows)) reactorTimeline = parsed.reactorRows;
                if (Array.isArray(parsed.r2)) componentRows = parsed.r2;
            }
        } catch (e) { }

        let onlineRows = [];
        try {
            const onlineRaw = sessionStorage.getItem('dhaOnlineState') || localStorage.getItem('dhaOnlineState');
            if (onlineRaw) {
                const onlineState = JSON.parse(onlineRaw);
                onlineRows = onlineState.rows || [];
            }
        } catch (e) { }

        return rows.map(row => {
            let r = normalizeReactor(row.Reactor || row['Active Reactor'] || row.Sampled_reactor);
            if (r) {
                row.Reactor = r;
                return row;
            }

            if (reactorTimeline.length && row.DateTime) {
                const ar = activeReactorAt(row.DateTime, reactorTimeline);
                if (ar) {
                    const normAr = normalizeReactor(ar);
                    if (normAr) {
                        row.Reactor = normAr;
                        return row;
                    }
                }
            }

            if (onlineRows.length && row.DateTime) {
                const matched = findMatchingDateTime(row.DateTime, onlineRows);
                if (matched) {
                    const matchedR = normalizeReactor(matched.Reactor || matched.Sampled_reactor);
                    if (matchedR) {
                        row.Reactor = matchedR;
                        return row;
                    }
                }
            }

            if (componentRows.length && row.DateTime) {
                const matched = findMatchingDateTime(row.DateTime, componentRows);
                if (matched) {
                    const matchedR = normalizeReactor(matched.Reactor || matched['Active Reactor']);
                    if (matchedR) {
                        row.Reactor = matchedR;
                        return row;
                    }
                }
            }

            return row;
        });
    }

    function isValidNumber(val) {
        if (val === null || val === undefined || val === '') return false;
        if (typeof val === 'string' && val.startsWith('ERROR')) return false;
        const num = Number(val);
        return Number.isFinite(num);
    }

    /**
     * Load Yield Table Data from sessionStorage or fallback calculate,
     * and enrich with Base Table columns.
     */
    async function loadYieldData() {
        setStatus('Loading...', false);
        showError('');
        loadConditionRanges();

        // Get Base Table rows
        const baseRows = getBaseTableRows();
        plotState.baseRows = baseRows;

        // Get Table-3 Octane rows
        const table3Rows = getTable3Rows();
        plotState.table3Rows = table3Rows;
        const customTable = getCustomTable();
        plotState.customColumns = customTable.columns.filter(col => !BASE_TABLE_NUMERIC_COLS.includes(col));

        // Reforming plots use the date-wise C1-C15 family totals from the
        // Calculation Table summary, rather than individual carbon-number columns.
        if (window.ILSProcess?.isReforming()) {
            try {
                const rawSummary = sessionStorage.getItem('ils_reforming_summary_state');
                const summary = rawSummary ? JSON.parse(rawSummary) : null;
                if (Array.isArray(summary?.rows) && summary.rows.length) {
                    plotState.rows = summary.rows.map(row => ({
                        ...row,
                        DateTime: row.DateTime || row.Date,
                        Reactor: row.Reactor || 'R1'
                    }));
                    plotState.columns = summary.columns || Object.keys(plotState.rows[0]);
                    onDataLoaded();
                    return;
                }
            } catch (error) {
                console.warn('Failed to parse Reforming Component Summary:', error);
            }
        }

        // Mass Balance plots use the GC-rep and sample tables published by mb_core.js.
        if (window.ILSProcess?.isMassBalance?.()) {
            try {
                const reps = JSON.parse(sessionStorage.getItem('ils_mb_rep_table') || 'null');
                const samples = JSON.parse(sessionStorage.getItem('ils_mb_summary_table') || 'null');
                const hidden = new Set(['Run', 'Sample', 'Condition', 'Excluded']);
                const strip = row => Object.fromEntries(Object.entries(row).filter(([key]) => !hidden.has(key)));
                const rows = [...(reps?.rows || []).filter(row => row.Excluded !== 'yes'), ...(samples?.rows || [])].map(strip);
                if (rows.length) {
                    plotState.rows = rows;
                    plotState.columns = [...new Set([...(reps?.columns || []), ...(samples?.columns || [])])].filter(c => !hidden.has(c));
                    // GC reps typed into a workbook have no time: plot them against the rep number.
                    const repsHaveTime = rows.some(row => row['GC rep'] !== undefined && isValidNumber(row['TOS(h)']));
                    if (!repsHaveTime && (!plotState.selectedX || plotState.selectedX === 'TOS(h)')) plotState.selectedX = 'GC rep';
                    onDataLoaded();
                    return;
                }
            } catch (error) {
                console.warn('Failed to read the Mass Balance tables:', error);
            }
            showEmptyNotice(true);
            setStatus('No Data', true);
            return;
        }

        // 1. Try reading from cached ils_yield_table_state
        try {
            const rawCached = sessionStorage.getItem('ils_yield_table_state');
            if (rawCached) {
                const cached = JSON.parse(rawCached);
                if (Array.isArray(cached.rows) && cached.rows.length > 0) {
                    let enriched = enrichRowsWithReactors(cached.rows);
                    if (baseRows.length > 0) {
                        enriched = mergeBaseTableValues(enriched, baseRows);
                    }
                    if (table3Rows.length > 0) {
                        enriched = mergeTable3Values(enriched, table3Rows);
                    }
                    plotState.rows = mergeCustomValues(enriched, customTable);
                    plotState.columns = cached.columns || Object.keys(plotState.rows[0]);
                    onDataLoaded();
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to parse ils_yield_table_state:', e);
        }

        // 2. Fallback: calculate on the fly from offline and online state
        try {
            let componentRows = [];
            let componentColumns = [];
            let reactorRows = [];
            const dashRaw = sessionStorage.getItem('dhaDashboardState') || localStorage.getItem('dhaDashboardState');
            if (dashRaw) {
                const dashState = JSON.parse(dashRaw);
                componentRows = dashState.r2 || dashState.table2_rows || dashState.table2Rows || [];
                componentColumns = dashState.c2 || dashState.table2_columns || dashState.table2Columns || [];
                reactorRows = dashState.reactorRows || [];
            }

            let onlineRows = [];
            const onlineRaw = sessionStorage.getItem('dhaOnlineState') || localStorage.getItem('dhaOnlineState');
            if (onlineRaw) {
                const onlineState = JSON.parse(onlineRaw);
                onlineRows = onlineState.rows || [];
            }

            if (componentRows.length > 0 && onlineRows.length > 0) {
                const { carbon, mw } = getActiveFeedCarbonAndMw();
                const computedBaseRows = reconstructBaseRows(onlineRows, carbon, mw, reactorRows);
                plotState.baseRows = computedBaseRows;

                const res = await fetch('/api/calculate-yield-table', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        carbon_rows: componentRows,
                        carbon_columns: componentColumns.length ? componentColumns : Object.keys(componentRows[0]),
                        base_rows: computedBaseRows
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    let enriched = enrichRowsWithReactors(data.rows || []);
                    if (computedBaseRows.length > 0) {
                        enriched = mergeBaseTableValues(enriched, computedBaseRows);
                    }
                    if (table3Rows.length > 0) {
                        enriched = mergeTable3Values(enriched, table3Rows);
                    }
                    plotState.rows = mergeCustomValues(enriched, customTable);
                    plotState.columns = data.columns || [];
                    try {
                        sessionStorage.setItem('ils_yield_table_state', JSON.stringify({
                            rows: plotState.rows,
                            columns: plotState.columns
                        }));
                    } catch (e) { }

                    if (plotState.rows.length > 0) {
                        onDataLoaded();
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to compute yield table for plots:', e);
        }

        // 3. Fallback: If no yield table rows but Base Table rows exist, plot Base Table directly!
        if (baseRows && baseRows.length > 0) {
            let enriched = enrichRowsWithReactors(baseRows);
            if (table3Rows.length > 0) {
                enriched = mergeTable3Values(enriched, table3Rows);
            }
            plotState.rows = mergeCustomValues(enriched, customTable);
            plotState.columns = Object.keys(enriched[0]);
            onDataLoaded();
            return;
        }

        // 4. Fallback: If no yield table and no base table, but Table-3 rows exist, plot Table-3 directly!
        if (table3Rows && table3Rows.length > 0) {
            let enriched = enrichRowsWithReactors(table3Rows);
            plotState.rows = mergeCustomValues(enriched, customTable);
            plotState.columns = Object.keys(enriched[0]);
            onDataLoaded();
            return;
        }

        if (customTable.rows.length) {
            plotState.rows = enrichRowsWithReactors(customTable.rows);
            plotState.columns = Object.keys(plotState.rows[0]);
            onDataLoaded();
            return;
        }

        // 5. No data available
        showEmptyNotice(true);
        setStatus('No Data', true);
    }

    function showEmptyNotice(show) {
        const emptyEl = $('#plotEmpty');
        const canvasEl = $('#scatterCanvas');
        const legendEl = $('#plotLegend');
        if (emptyEl) emptyEl.style.display = show ? 'block' : 'none';
        if (canvasEl) canvasEl.style.display = show ? 'none' : 'block';
        if (legendEl) legendEl.style.display = show ? 'none' : 'flex';
        if (show) {
            $('#kpiPlotPoints').textContent = '0';
            $('#kpiPlotReactors').textContent = '0';
            $('#kpiPlotX').textContent = '—';
            $('#kpiPlotY').textContent = '—';
        }
    }

    function onDataLoaded() {
        showEmptyNotice(false);
        setStatus('Ready', true);

        // Identify available numeric/time columns for plotting
        const nonPlottable = new Set(['File Name', 'UID', '_row_error', 'Reactor', 'Active Reactor', 'Sampled_reactor', 'Component', 'DateTime', 'Date/Time']);
        const rowKeys = plotState.rows.length ? Object.keys(plotState.rows[0]) : [];
        const rawCols = (plotState.columns && plotState.columns.length > 0)
            ? [...new Set([...plotState.columns, ...rowKeys])]
            : rowKeys;

        // Ensure Base Table numeric columns that exist in rows are included
        const existingBaseCols = BASE_TABLE_NUMERIC_COLS.filter(c => rowKeys.includes(c));
        // Ensure Table-3 numeric columns that exist in rows are included
        const existingTable3Cols = TABLE3_NUMERIC_COLS.filter(c => rowKeys.includes(c));
        const combined = [...new Set([...rawCols, ...existingBaseCols, ...existingTable3Cols])];

        plotState.availableColumns = combined.filter(c => !nonPlottable.has(c) &&
            (!plotState.customColumns.includes(c) || plotState.rows.some(row => isValidNumber(row[c]))));

        // Populate X and single Y dropdowns
        populateDropdowns();

        // Populate multi-select reactor filter
        populateMultiSelectReactorFilter();

        // Render plot
        renderPlot();
    }

    /**
     * Populate X and Y dropdowns with mutual exclusion enforcement
     */
    function populateDropdowns() {
        const xSelect = $('#plotXSelect');
        const ySelect = $('#plotYSelect');
        if (!xSelect || !ySelect) return;

        const cols = plotState.availableColumns;
        if (!cols.length) {
            xSelect.innerHTML = '<option value="">No numeric columns available</option>';
            ySelect.innerHTML = '<option value="">No numeric columns available</option>';
            return;
        }

        // Set default selections
        if (!plotState.selectedX || !cols.includes(plotState.selectedX)) {
            if (cols.includes('TOS(h)')) {
                plotState.selectedX = 'TOS(h)';
            } else if (cols.includes('TOS[h]')) {
                plotState.selectedX = 'TOS[h]';
            } else {
                plotState.selectedX = cols[0];
            }
        }

        if (!plotState.selectedY || !cols.includes(plotState.selectedY) || plotState.selectedY === plotState.selectedX) {
            const preferred = ['Lin-RON', 'Cal-RON', 'n-Hexane', 'C5+', 'Gas', 'H2_Consumption', 'Propane', 'Temperature', 'Pressure', "Gas C'Bal [%]"];
            const foundPref = preferred.find(p => cols.includes(p) && p !== plotState.selectedX);
            plotState.selectedY = foundPref || cols.find(c => c !== plotState.selectedX) || cols[0];
        }

        renderDropdownOptions();
    }

    function renderDropdownOptions() {
        const xSelect = $('#plotXSelect');
        const ySelect = $('#plotYSelect');
        if (!xSelect || !ySelect) return;

        const cols = plotState.availableColumns;
        const currentX = plotState.selectedX;
        const currentY = plotState.selectedY;

        // Separate Base Table, custom calculations, Table-3, and Yield Table columns for organized optgroups
        const baseColsAvailable = BASE_TABLE_NUMERIC_COLS.filter(c => cols.includes(c));
        const customColsAvailable = plotState.customColumns.filter(c => cols.includes(c));
        const table3ColsAvailable = TABLE3_NUMERIC_COLS.filter(c => cols.includes(c));
        const yieldColsAvailable = cols.filter(c => !baseColsAvailable.includes(c) && !customColsAvailable.includes(c) && !TABLE3_NUMERIC_COLS.includes(c));

        function generateOptionsHtml(currentSelected, currentDisabled) {
            let html = '';

            // Group 1: Table-3 Octane Table columns
            if (table3ColsAvailable.length > 0) {
                html += `<optgroup label="Table-3 Octane Table (Offline Analysis)">`;
                table3ColsAvailable.forEach(col => {
                    const isSelected = col === currentSelected ? ' selected' : '';
                    const isDisabled = col === currentDisabled ? ' disabled' : '';
                    const label = TABLE3_LABELS[col] || col;
                    html += `<option value="${col}"${isSelected}${isDisabled}>${label}</option>`;
                });
                html += `</optgroup>`;
            }

            // Group 2: Base Table tags
            if (baseColsAvailable.length > 0) {
                html += `<optgroup label="Base Table (Calculation Table)">`;
                baseColsAvailable.forEach(col => {
                    const isSelected = col === currentSelected ? ' selected' : '';
                    const isDisabled = col === currentDisabled ? ' disabled' : '';
                    const label = BASE_TABLE_LABELS[col] || col;
                    html += `<option value="${col}"${isSelected}${isDisabled}>${label}</option>`;
                });
                html += `</optgroup>`;
            }

            // Group 3: Custom Calculated Table tags
            if (customColsAvailable.length > 0) {
                html += `<optgroup label="Custom Calculated Table">`;
                customColsAvailable.forEach(col => {
                    const isSelected = col === currentSelected ? ' selected' : '';
                    const isDisabled = col === currentDisabled ? ' disabled' : '';
                    const option = document.createElement('option');
                    option.value = col;
                    option.textContent = col;
                    option.selected = !!isSelected;
                    option.disabled = !!isDisabled;
                    html += option.outerHTML;
                });
                html += `</optgroup>`;
            }

            // Group 4: Yield Table components
            if (yieldColsAvailable.length > 0) {
                html += `<optgroup label="Yield Table Parameters">`;
                yieldColsAvailable.forEach(col => {
                    const isSelected = col === currentSelected ? ' selected' : '';
                    const isDisabled = col === currentDisabled ? ' disabled' : '';
                    // Escape names such as "Unidentified(<C3)"
                    const text = String(col).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    html += `<option value="${col}"${isSelected}${isDisabled}>${text}</option>`;
                });
                html += `</optgroup>`;
            }

            return html;
        }

        xSelect.innerHTML = generateOptionsHtml(currentX, currentY);
        ySelect.innerHTML = generateOptionsHtml(currentY, currentX);

        // Update KPIs
        if ($('#kpiPlotX')) $('#kpiPlotX').textContent = getParamLabel(currentX);
        if ($('#kpiPlotY')) $('#kpiPlotY').textContent = getParamLabel(currentY);
    }

    /**
     * Populate Multi-Select Reactor Filter (Checkboxes, Select All, Clear)
     */
    function populateMultiSelectReactorFilter() {
        const listContainer = $('#reactorCheckboxList');
        const btnText = $('#plotReactorBtnText');
        if (!listContainer) return;

        // Count data points per reactor
        const reactorCounts = {};
        plotState.rows.forEach(r => {
            const rVal = getRowReactor(r);
            if (rVal && rVal !== 'Unknown') {
                reactorCounts[rVal] = (reactorCounts[rVal] || 0) + 1;
            }
        });

        const allReactors = new Set([...STANDARD_REACTORS, ...Object.keys(reactorCounts)]);
        const sorted = Array.from(allReactors).sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
            const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
            return na - nb;
        });

        plotState.allKnownReactors = sorted;

        // Initialize selectedReactors to all known reactors if empty
        if (!plotState.selectedReactors || plotState.selectedReactors.size === 0) {
            plotState.selectedReactors = new Set(sorted);
        }

        // Render checkbox list
        let html = '';
        sorted.forEach(r => {
            const count = reactorCounts[r] || 0;
            const theme = REACTOR_THEME[r] || REACTOR_THEME.Default;
            const isChecked = plotState.selectedReactors.has(r) ? ' checked' : '';
            const countLabel = count > 0 ? `${count} pts` : '0 pts';

            html += `
                <label class="reactor-check-item">
                    <input type="checkbox" value="${r}"${isChecked}>
                    <svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align: middle;" aria-hidden="true">${theme.svg}</svg>
                    <span class="reactor-name"><b>${r}</b></span>
                    <span class="reactor-count-badge">${countLabel}</span>
                </label>
            `;
        });

        listContainer.innerHTML = html;
        updateReactorButtonLabel();

        // Wire change events on checkboxes
        $$('#reactorCheckboxList input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', function () {
                const rVal = this.value;
                if (this.checked) {
                    plotState.selectedReactors.add(rVal);
                } else {
                    plotState.selectedReactors.delete(rVal);
                }
                updateReactorButtonLabel();
                renderPlot();
            });
        });
    }

    function updateReactorButtonLabel() {
        const btnText = $('#plotReactorBtnText');
        if (!btnText) return;

        const total = plotState.allKnownReactors.length;
        const selected = Array.from(plotState.selectedReactors);

        if (selected.length === total) {
            btnText.textContent = `All Reactors (${total})`;
        } else if (selected.length === 0) {
            btnText.textContent = 'No Reactors Selected';
        } else if (selected.length === 1) {
            btnText.textContent = `Reactor: ${selected[0]}`;
        } else if (selected.length <= 3) {
            btnText.textContent = `Reactors: ${selected.join(', ')}`;
        } else {
            btnText.textContent = `${selected.length} of ${total} Reactors`;
        }
    }

    /**
     * Filter rows based on Multi-Selected Reactors and DateTime range
     */
    function getFilteredRows() {
        let rows = plotState.rows;

        // 1. Multi-Select Reactor filter
        if (plotState.selectedReactors && plotState.selectedReactors.size > 0) {
            rows = rows.filter(r => {
                const rVal = getRowReactor(r);
                if (rVal === 'Unknown') {
                    // If all standard reactors are selected, include unassigned rows under R1
                    return plotState.selectedReactors.has('R1');
                }
                return plotState.selectedReactors.has(rVal);
            });
        } else {
            return []; // No reactors selected
        }

        // 2. DateTime filter
        const fromDate = plotState.fromDate ? new Date(plotState.fromDate) : null;
        const toDate = plotState.toDate ? new Date(plotState.toDate) : null;

        if (fromDate || toDate) {
            rows = rows.filter(r => {
                const dt = parseDate(r.DateTime);
                if (!dt) return false;
                if (fromDate && dt < fromDate) return false;
                if (toDate && dt > toDate) return false;
                return true;
            });
        }

        if ([...plotState.conditionRanges.values()].some(intervals => intervals.length)) {
            if (!plotState.selectedConditions.size) return [];
            rows = rows.filter(row => matchingConditions(row.DateTime || row['Date/Time']).length > 0);
        }

        return rows;
    }

    function movingAverage(points, windowSize) {
        const sorted = [...points].sort((first, second) => first.x - second.x);
        const unique = [];
        sorted.forEach(point => {
            const last = unique[unique.length - 1];
            if (last && last.x === point.x) {
                last.sum += point.y;
                last.count++;
            } else {
                unique.push({ x: point.x, sum: point.y, count: 1 });
            }
        });
        if (unique.length < windowSize) return [];
        const half = Math.floor(windowSize / 2);
        return unique.map((point, index) => {
            const neighbors = unique.slice(Math.max(0, index - half), Math.min(unique.length, index + half + 1));
            const windowValues = neighbors.map(neighbor => neighbor.sum / neighbor.count);
            const average = windowValues.reduce((sum, value) => sum + value, 0) / windowValues.length;
            return { x: point.x, y: average };
        });
    }

    function trendStatistics(points) {
        const average = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        const standardDeviation = points.length > 1
            ? Math.sqrt(points.reduce((sum, point) => sum + (point.y - average) ** 2, 0) / (points.length - 1))
            : 0;
        return { average, standardDeviation };
    }

    const trendLineTooltip = {
        id: 'ilsTrendLineTooltip',
        afterEvent(chart, args) {
            const event = args.event;
            if (event.type === 'mouseout' || !args.inChartArea) return;
            const scatterHits = chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, false)
                .filter(hit => !chart.data.datasets[hit.datasetIndex].data[hit.index].trend);
            if (scatterHits.length) {
                chart.tooltip.setActiveElements(scatterHits, { x: event.x, y: event.y });
                args.changed = true;
                return;
            }
            let hitIndex = -1;
            const ctx = chart.ctx;
            chart.data.datasets.forEach((dataset, index) => {
                if (hitIndex !== -1 || !dataset.trendStatistics || !chart.isDatasetVisible(index)) return;
                const line = chart.getDatasetMeta(index).dataset;
                if (!line) return;
                ctx.save();
                ctx.beginPath();
                ctx.lineWidth = 14;
                line.path(ctx);
                const ratio = chart.currentDevicePixelRatio;
                if (ctx.isPointInStroke(event.x * ratio, event.y * ratio)) hitIndex = index;
                ctx.restore();
            });
            chart.tooltip.setActiveElements(hitIndex === -1 ? [] : [{ datasetIndex: hitIndex, index: 0 }], { x: event.x, y: event.y });
            args.changed = true;
        }
    };

    function updateExclusionControls() {
        const count = plotState.excludedPointKeys.length;
        $('#plotExcludedCount').textContent = `${count} excluded`;
        $('#plotUndoExclusion').disabled = count === 0;
        $('#plotRestorePoints').disabled = count === 0;
        $('#scatterCanvas').style.cursor = plotState.excludeMode ? 'crosshair' : '';
    }

    /**
     * Render the Scatter Plot using Chart.js with single Y axis
     */
    function renderPlot() {
        const xCol = plotState.selectedX;
        const yCol = plotState.selectedY;

        if (!xCol || !yCol || xCol === yCol) {
            return;
        }

        try {
            sessionStorage.setItem('ils_plot_preferences', JSON.stringify({
                selectedX: xCol, selectedY: yCol,
                selectedReactors: [...plotState.selectedReactors],
                selectedConditions: [...plotState.selectedConditions],
                fromDate: plotState.fromDate, toDate: plotState.toDate,
                xMin: plotState.xMin, xMax: plotState.xMax, yMin: plotState.yMin, yMax: plotState.yMax,
                xTitle: plotState.xTitle, yTitle: plotState.yTitle,
                showTrend: plotState.showTrend, trendWindow: plotState.trendWindow,
                connectReactors: plotState.connectReactors,
                paperSize: plotState.paperSize,
                excludedPointKeys: plotState.excludedPointKeys
            }));
        } catch (e) { }

        updateExclusionControls();
        const filteredRows = getFilteredRows();
        const excludedKeys = new Set(plotState.excludedPointKeys);
        const rowIndexes = new Map(plotState.rows.map((row, index) => [row, index]));

        // Group points by reactor
        const reactorGroups = {};
        let totalPlottedPoints = 0;

        filteredRows.forEach(row => {
            const valX = row[xCol];
            const valY = row[yCol];

            if (!isValidNumber(valX) || !isValidNumber(valY)) return;

            const pointKey = JSON.stringify([
                row.UID || row['File Name'] || '',
                row.DateTime || row['Date/Time'] || '',
                getRowReactor(row),
                rowIndexes.get(row)
            ]);
            if (excludedKeys.has(pointKey)) return;

            let rName = getRowReactor(row);
            if (rName === 'Unknown') {
                rName = 'R1';
            }

            if (!reactorGroups[rName]) {
                reactorGroups[rName] = [];
            }

            reactorGroups[rName].push({
                x: Number(valX),
                y: Number(valY),
                pointKey,
                dt: row.DateTime || '',
                reactor: rName,
                condition: matchingConditions(row.DateTime || row['Date/Time'])[0] || '',
                tos: (row['TOS(h)'] !== undefined) ? row['TOS(h)'] : (row['TOS[h]'] !== undefined ? row['TOS[h]'] : '')
            });
            totalPlottedPoints++;
        });

        // Update KPIs
        if ($('#kpiPlotPoints')) $('#kpiPlotPoints').textContent = totalPlottedPoints;
        const activeReactors = Object.keys(reactorGroups);
        if ($('#kpiPlotReactors')) $('#kpiPlotReactors').textContent = activeReactors.length;
        if ($('#kpiPlotX')) $('#kpiPlotX').textContent = getParamLabel(xCol);
        if ($('#kpiPlotY')) $('#kpiPlotY').textContent = getParamLabel(yCol);

        // Update Chart Title and Eyebrow
        const yLabel = plotState.yTitle || getParamLabel(yCol);
        const xLabel = plotState.xTitle || getParamLabel(xCol);

        $('#plotChartTitle').textContent = `${yLabel} vs ${xLabel}`;
        $('#plotEyebrow').textContent = `SCATTER PLOT · ${yCol.toUpperCase()} VS ${xCol.toUpperCase()}`;

        const filterBadge = $('#plotBadge');
        if (filterBadge) {
            const parts = [];
            const total = plotState.allKnownReactors.length;
            if (plotState.selectedReactors.size === total) {
                parts.push('All Reactors');
            } else if (plotState.selectedReactors.size === 0) {
                parts.push('No Reactors Selected');
            } else {
                parts.push(`${plotState.selectedReactors.size} Reactors Active`);
            }
            if (plotState.fromDate || plotState.toDate) parts.push('Date Filter Active');
            filterBadge.textContent = parts.join(' · ');
            filterBadge.style.display = 'inline-block';
        }

        // Sort active reactors
        const sortedReactors = activeReactors.sort((a, b) => {
            const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
            const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
            return na - nb;
        });

        // Scatter markers retain reactor colors and condition shapes.
        const scatterDatasets = sortedReactors.map(rName => {
            const theme = REACTOR_THEME[rName] || REACTOR_THEME.Default;
            return {
                label: rName,
            reactor: rName,
                data: reactorGroups[rName],
            showLine: false,
                pointStyle: context => plotState.conditionMarkers.get(context.raw?.condition)?.style || theme.pointStyle,
                pointRotation: context => plotState.conditionMarkers.get(context.raw?.condition)?.rotation || 0,
                pointRadius: 6,
                pointHoverRadius: 9,
                pointBorderWidth: 2,
                pointBorderColor: theme.border,
                pointBackgroundColor: context => plotState.conditionMarkers.get(context.raw?.condition)?.hollow ? '#ffffff' : theme.bg,
                borderColor: theme.border,             // Distinct color border
                backgroundColor: theme.bg,             // Distinct color fill
                pointHoverBackgroundColor: '#ffffff',
                pointHoverBorderColor: theme.border,
                pointHoverBorderWidth: 2.5
            };
        });

        const trendDatasets = [];
        if (plotState.showTrend) {
            sortedReactors.forEach(rName => {
                const theme = REACTOR_THEME[rName] || REACTOR_THEME.Default;
                const groups = new Map();
                reactorGroups[rName].forEach(point => {
                    const condition = point.condition;
                    if (!groups.has(condition)) groups.set(condition, []);
                    groups.get(condition).push(point);
                });
                groups.forEach((points, condition) => {
                    const averaged = movingAverage(points, plotState.trendWindow);
                    if (!averaged.length) return;
                    trendDatasets.push({
                        label: `${rName} · ${condition ? `Condition ${condition}` : 'All data'} · MA(${plotState.trendWindow})`,
                        reactor: rName,
                        trendStatistics: trendStatistics(points),
                        data: averaged.map(point => ({ ...point, reactor: rName, condition, trend: true })),
                        showLine: true,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        pointHitRadius: 0,
                        borderWidth: 2,
                        borderColor: theme.border,
                        borderDash: [6, 4],
                        tension: 0.25,
                        fill: false
                    });
                });
            });
        }
        // Reactor-wise connector: one line per reactor through all its points (all conditions), ordered by X like an Excel series
        const connectorDatasets = [];
        if (plotState.connectReactors) {
            sortedReactors.forEach(rName => {
                const points = reactorGroups[rName];
                if (points.length < 2) return;
                const theme = REACTOR_THEME[rName] || REACTOR_THEME.Default;
                const ordered = [...points].sort((first, second) => first.x - second.x);
                connectorDatasets.push({
                    label: `${rName} · all conditions`,
                    reactor: rName,
                    connector: true,
                    trendStatistics: trendStatistics(points),
                    data: ordered.map(point => ({ x: point.x, y: point.y, reactor: rName, trend: true })),
                    showLine: true,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    pointHitRadius: 0,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                    cubicInterpolationMode: 'monotone',
                    fill: false
                });
            });
        }
        const datasets = [...scatterDatasets, ...trendDatasets, ...connectorDatasets];

        // Render or Update Chart
        const canvas = $('#scatterCanvas');
        if (!canvas) return;

        if (plotState.chart) {
            plotState.chart.destroy();
            plotState.chart = null;
        }

        if (typeof Chart === 'undefined') {
            showError('Chart.js library failed to load.');
            return;
        }

        Chart.Tooltip.positioners.ilsTrendOrPoint = function (items, position) {
            if (items.length && this.chart.data.datasets[items[0].datasetIndex].trendStatistics) return position;
            return Chart.Tooltip.positioners.average.call(this, items, position);
        };

        const ctx = canvas.getContext('2d');
        plotState.chart = new Chart(ctx, {
            type: 'scatter',
            plugins: [trendLineTooltip],
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick(event, elements, chart) {
                    if (!plotState.excludeMode) return;
                    const hit = elements.find(element => {
                        const point = chart.data.datasets[element.datasetIndex].data[element.index];
                        return point.pointKey && !point.trend;
                    });
                    if (!hit) return;
                    const point = chart.data.datasets[hit.datasetIndex].data[hit.index];
                    if (!plotState.excludedPointKeys.includes(point.pointKey)) {
                        plotState.excludedPointKeys.push(point.pointKey);
                        requestAnimationFrame(renderPlot);
                    }
                },
                devicePixelRatio: plotState.paperSize === 'auto' ? window.devicePixelRatio : 300 / 96,
                animation: {
                    duration: 250
                },
                plugins: {
                    legend: {
                        display: false // We use our custom interactive legend with SVG symbols
                    },
                    tooltip: {
                        position: 'ilsTrendOrPoint',
                        backgroundColor: 'rgba(7, 26, 45, 0.94)',
                        titleColor: '#ffffff',
                        bodyColor: '#f1f5f9',
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: {
                            weight: '700',
                            size: 13
                        },
                        bodyFont: {
                            size: 12
                        },
                        callbacks: {
                            title: function (items) {
                                if (!items.length) return '';
                                const pt = items[0].raw;
                                if (pt.trend) return '';
                                return `Reactor ${pt.reactor}${pt.condition ? ` · Condition ${pt.condition}` : ''}${pt.dt ? ` · ${pt.dt}` : ''}`;
                            },
                            label: function (item) {
                                const pt = item.raw;
                                if (pt.trend) {
                                    const statistics = item.dataset.trendStatistics;
                                    if (item.dataset.connector) {
                                        return [`Reactor ${pt.reactor} · all conditions`, `${yLabel} average: ${statistics.average.toFixed(3)}`, `Standard deviation: ${statistics.standardDeviation.toFixed(3)}`];
                                    }
                                    return [`Average: ${statistics.average.toFixed(3)}`, `Standard deviation: ${statistics.standardDeviation.toFixed(3)}`];
                                }
                                const lines = [
                                    `${xLabel}: ${pt.x.toFixed(3)}`,
                                    `${yLabel}: ${pt.y.toFixed(3)}`
                                ];
                                if (pt.tos !== '' && pt.tos !== undefined && xCol !== 'TOS(h)' && xCol !== 'TOS[h]') {
                                    lines.push(`TOS: ${Number(pt.tos).toFixed(2)} h`);
                                }
                                return lines;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        position: 'bottom',
                        min: plotState.xMin !== null ? plotState.xMin : undefined,
                        max: plotState.xMax !== null ? plotState.xMax : undefined,
                        title: {
                            display: true,
                            text: xLabel,
                            color: '#071a2d',
                            font: {
                                size: 13,
                                weight: '700',
                                family: 'ui-sans-serif, system-ui, -apple-system, sans-serif'
                            },
                            padding: { top: 8 }
                        },
                        grid: {
                            color: 'rgba(7, 26, 45, 0.06)'
                        },
                        ticks: {
                            color: '#475569',
                            font: { size: 11 }
                        }
                    },
                    y: {
                        type: 'linear',
                        position: 'left',
                        min: plotState.yMin !== null ? plotState.yMin : undefined,
                        max: plotState.yMax !== null ? plotState.yMax : undefined,
                        title: {
                            display: true,
                            text: yLabel,
                            color: '#071a2d',
                            font: {
                                size: 13,
                                weight: '700',
                                family: 'ui-sans-serif, system-ui, -apple-system, sans-serif'
                            },
                            padding: { bottom: 8 }
                        },
                        grid: {
                            color: 'rgba(7, 26, 45, 0.06)'
                        },
                        ticks: {
                            color: '#475569',
                            font: { size: 11 }
                        }
                    }
                }
            }
        });

        // Update custom interactive legend with symbols & colors
        renderCustomLegend(sortedReactors, reactorGroups);
        renderConditionLegend(scatterDatasets);
    }

    function renderConditionLegend(datasets) {
        const legend = $('#conditionLegend');
        if (!legend) return;
        const counts = new Map();
        datasets.forEach(dataset => dataset.data.forEach(point => {
            if (point.condition) counts.set(point.condition, (counts.get(point.condition) || 0) + 1);
        }));
        const hasTrend = plotState.chart.data.datasets.some(dataset => dataset.showLine && !dataset.connector);
        const hasConnector = plotState.chart.data.datasets.some(dataset => dataset.connector);
        legend.hidden = counts.size === 0 && !hasTrend && !hasConnector;
        legend.replaceChildren();
        if (counts.size) {
            const title = document.createElement('span');
            title.className = 'legend-title';
            title.textContent = 'Conditions (shape):';
            legend.append(title);
        }
        [...counts.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach(condition => {
            const marker = plotState.conditionMarkers.get(condition);
            const chip = document.createElement('span');
            chip.className = 'legend-chip condition-legend-chip';
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 16 16');
            icon.setAttribute('width', '16');
            icon.setAttribute('height', '16');
            icon.setAttribute('fill', marker.hollow ? '#ffffff' : '#475569');
            icon.setAttribute('stroke', '#475569');
            icon.setAttribute('stroke-width', '1.5');
            icon.innerHTML = marker.svg;
            const text = document.createElement('span');
            text.textContent = `Condition ${condition} (${counts.get(condition)})`;
            chip.append(icon, text);
            legend.append(chip);
        });
        if (hasTrend) {
            const chip = document.createElement('span');
            chip.className = 'legend-chip condition-legend-chip';
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 16');
            icon.setAttribute('width', '24');
            icon.setAttribute('height', '16');
            icon.innerHTML = '<path d="M1 8H23" fill="none" stroke="#475569" stroke-width="2" stroke-dasharray="6 4" />';
            const text = document.createElement('span');
            text.textContent = `Centered moving average (${plotState.trendWindow} points)`;
            chip.append(icon, text);
            legend.append(chip);
        }
        if (hasConnector) {
            const chip = document.createElement('span');
            chip.className = 'legend-chip condition-legend-chip';
            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 16');
            icon.setAttribute('width', '24');
            icon.setAttribute('height', '16');
            icon.innerHTML = '<path d="M1 8H23" fill="none" stroke="#475569" stroke-width="2" />';
            const text = document.createElement('span');
            text.textContent = 'Reactor-wise line (all conditions)';
            chip.append(icon, text);
            legend.append(chip);
        }
    }

    /**
     * Render Custom Interactive Legend displaying both distinct geometric symbol and color
     */
    function renderCustomLegend(reactors, reactorGroups) {
        const legendContainer = $('#plotLegend');
        if (!legendContainer) return;

        if (!reactors.length) {
            legendContainer.innerHTML = '<span class="legend-title">No reactor data match active filters</span>';
            return;
        }

        let html = '<span class="legend-title">Reactors:</span>';
        reactors.forEach((rName, idx) => {
            const count = (reactorGroups[rName] || []).length;
            const theme = REACTOR_THEME[rName] || REACTOR_THEME.Default;
            const isVisible = plotState.chart ? plotState.chart.isDatasetVisible(idx) : true;
            const dimmedClass = isVisible ? '' : ' dimmed';

            html += `
                <div class="legend-chip${dimmedClass}" data-dataset-index="${idx}" title="Click to toggle visibility of ${rName} (reactor color)">
                    <svg viewBox="0 0 16 16" width="14" height="14" style="vertical-align: middle; flex-shrink: 0;" aria-hidden="true">${theme.svg}</svg>
                    <span><b>${rName}</b> (${count})</span>
                </div>
            `;
        });

        legendContainer.innerHTML = html;

        // Wire click handlers on legend chips
        legendContainer.querySelectorAll('.legend-chip').forEach(chip => {
            chip.addEventListener('click', function () {
                const datasetIndex = parseInt(this.getAttribute('data-dataset-index'), 10);
                if (plotState.chart && !isNaN(datasetIndex)) {
                    const visible = !plotState.chart.isDatasetVisible(datasetIndex);
                    const reactor = plotState.chart.data.datasets[datasetIndex].reactor;
                    plotState.chart.data.datasets.forEach((dataset, index) => {
                        if (dataset.reactor === reactor) plotState.chart.setDatasetVisibility(index, visible);
                    });
                    plotState.chart.update();
                    this.classList.toggle('dimmed', !visible);
                }
            });
        });
    }

    /**
     * Sync the axis limit popover inputs with current plotState values
     */
    function syncAxisLimitInputs() {
        const xMinInput = $('#xAxisMin');
        const xMaxInput = $('#xAxisMax');
        const yMinInput = $('#yAxisMin');
        const yMaxInput = $('#yAxisMax');
        if (xMinInput) xMinInput.value = plotState.xMin !== null ? plotState.xMin : '';
        if (xMaxInput) xMaxInput.value = plotState.xMax !== null ? plotState.xMax : '';
        if (yMinInput) yMinInput.value = plotState.yMin !== null ? plotState.yMin : '';
        if (yMaxInput) yMaxInput.value = plotState.yMax !== null ? plotState.yMax : '';
    }

    /**
     * Wire the X/Y axis limit popover buttons (open/close, apply, reset)
     */
    function setupAxisLimitControls() {
        function wireAxis(axisKey, btnId, menuId, minId, maxId, resetId, applyId) {
            const btn = $(btnId);
            const menu = $(menuId);
            const minInput = $(minId);
            const maxInput = $(maxId);
            const resetBtn = $(resetId);
            const applyBtn = $(applyId);
            if (!btn || !menu) return;

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const isOpen = menu.classList.toggle('open');
                btn.classList.toggle('open', isOpen);
                btn.setAttribute('aria-expanded', String(isOpen));
            });

            menu.addEventListener('click', function (e) {
                e.stopPropagation();
            });

            document.addEventListener('click', function () {
                menu.classList.remove('open');
                btn.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
            });

            if (applyBtn) {
                applyBtn.addEventListener('click', function () {
                    const minVal = minInput && minInput.value !== '' ? Number(minInput.value) : null;
                    const maxVal = maxInput && maxInput.value !== '' ? Number(maxInput.value) : null;
                    plotState[`${axisKey}Min`] = (minVal !== null && !isNaN(minVal)) ? minVal : null;
                    plotState[`${axisKey}Max`] = (maxVal !== null && !isNaN(maxVal)) ? maxVal : null;
                    menu.classList.remove('open');
                    btn.classList.remove('open');
                    btn.setAttribute('aria-expanded', 'false');
                    renderPlot();
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', function () {
                    plotState[`${axisKey}Min`] = null;
                    plotState[`${axisKey}Max`] = null;
                    if (minInput) minInput.value = '';
                    if (maxInput) maxInput.value = '';
                    renderPlot();
                });
            }
        }

        wireAxis('x', '#xAxisLimitBtn', '#xAxisLimitMenu', '#xAxisMin', '#xAxisMax', '#xAxisLimitReset', '#xAxisLimitApply');
        wireAxis('y', '#yAxisLimitBtn', '#yAxisLimitMenu', '#yAxisMin', '#yAxisMax', '#yAxisLimitReset', '#yAxisLimitApply');
    }

    /**
     * Setup Event Listeners
     */
    function setupEvents() {
        const xSelect = $('#plotXSelect');
        const ySelect = $('#plotYSelect');
        const swapAxesBtn = $('#plotSwapAxes');
        const reactorFilter = $('#plotReactorFilter');
        const reactorBtn = $('#plotReactorBtn');
        const reactorMenu = $('#plotReactorMenu');
        const selectAllBtn = $('#selectAllReactors');
        const clearAllBtn = $('#clearAllReactors');
        const conditionBtn = $('#plotConditionBtn');
        const conditionMenu = $('#plotConditionMenu');
        const selectAllConditions = $('#selectAllConditions');
        const clearAllConditions = $('#clearAllConditions');
        const fromInput = $('#plotFrom');
        const toInput = $('#plotTo');
        const clearDatesBtn = $('#plotClearDates');
        const exportBtn = $('#plotExportBtn');
        const pageRefreshBtn = $('#pageRefresh');
        const connectInput = $('#plotConnectPoints');
        const sizeSelect = $('#plotPaperSize');
        const canvas = $('#scatterCanvas');
        const titleEditor = $('#axisTitleEditor');

        $('#plotExcludePoints')?.addEventListener('change', event => {
            plotState.excludeMode = event.target.checked;
            updateExclusionControls();
        });
        $('#plotUndoExclusion')?.addEventListener('click', () => {
            plotState.excludedPointKeys.pop();
            renderPlot();
        });
        $('#plotRestorePoints')?.addEventListener('click', () => {
            plotState.excludedPointKeys = [];
            renderPlot();
        });

        if (connectInput) connectInput.addEventListener('change', () => {
            plotState.showTrend = connectInput.checked;
            $('#plotTrendWindowGroup').hidden = !connectInput.checked;
            renderPlot();
        });

        $('#plotConnectReactors')?.addEventListener('change', event => {
            plotState.connectReactors = event.target.checked;
            renderPlot();
        });

        $('#plotTrendWindow')?.addEventListener('change', event => {
            plotState.trendWindow = Number(event.target.value);
            renderPlot();
        });

        if (sizeSelect) sizeSelect.addEventListener('change', () => {
            plotState.paperSize = sizeSelect.value;
            const wrapper = $('#canvasWrapper');
            const match = /^(110x110|150x97|200x130|170x110)$/.test(plotState.paperSize);
            wrapper.classList.toggle('paper-size', match);
            wrapper.style.width = match ? `${plotState.paperSize.split('x')[0]}mm` : '';
            wrapper.style.height = match ? `${plotState.paperSize.split('x')[1]}mm` : '';
            renderPlot();
        });

        if (canvas && titleEditor) {
            let editingAxis = null;
            const hitAxisTitle = event => {
                if (!plotState.chart) return null;
                const rect = canvas.getBoundingClientRect();
                const px = (event.clientX - rect.left) * plotState.chart.width / rect.width;
                const py = (event.clientY - rect.top) * plotState.chart.height / rect.height;
                const x = plotState.chart.scales.x;
                const y = plotState.chart.scales.y;
                if (Math.abs(px - (x.left + x.right) / 2) < 100 && py >= x.bottom - 26 && py <= x.bottom) return 'x';
                if (Math.abs(py - (y.top + y.bottom) / 2) < 100 && px >= y.left && px <= y.left + 26) return 'y';
                return null;
            };
            canvas.addEventListener('pointermove', event => {
                canvas.style.cursor = hitAxisTitle(event) ? 'text' : plotState.excludeMode ? 'crosshair' : '';
            });
            canvas.addEventListener('click', event => {
                editingAxis = hitAxisTitle(event);
                if (!editingAxis) return;
                titleEditor.value = plotState[`${editingAxis}Title`] || getParamLabel(plotState[editingAxis === 'x' ? 'selectedX' : 'selectedY']);
                titleEditor.hidden = false;
                titleEditor.style.left = editingAxis === 'x' ? '50%' : '4px';
                titleEditor.style.top = editingAxis === 'x' ? '' : '50%';
                titleEditor.style.bottom = editingAxis === 'x' ? '4px' : '';
                titleEditor.style.transform = editingAxis === 'x' ? 'translateX(-50%)' : 'translateY(-50%)';
                titleEditor.focus();
                titleEditor.select();
            });
            titleEditor.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    editingAxis = null;
                    titleEditor.hidden = true;
                } else if (event.key === 'Enter') titleEditor.blur();
            });
            titleEditor.addEventListener('blur', () => {
                if (!editingAxis) return;
                plotState[`${editingAxis}Title`] = titleEditor.value.trim();
                editingAxis = null;
                titleEditor.hidden = true;
                renderPlot();
            });
        }

        // Mutual exclusion between single X and single Y
        if (xSelect) {
            xSelect.addEventListener('change', function () {
                const newX = this.value;
                if (!newX) return;
                plotState.selectedX = newX;
                plotState.xTitle = '';

                if (plotState.selectedY === newX) {
                    const alt = plotState.availableColumns.find(c => c !== newX);
                    plotState.selectedY = alt || '';
                }

                renderDropdownOptions();
                renderPlot();
            });
        }

        if (ySelect) {
            ySelect.addEventListener('change', function () {
                const newY = this.value;
                if (!newY) return;
                plotState.selectedY = newY;
                plotState.yTitle = '';

                if (plotState.selectedX === newY) {
                    const alt = plotState.availableColumns.find(c => c !== newY);
                    plotState.selectedX = alt || '';
                }

                renderDropdownOptions();
                renderPlot();
            });
        }

        // Swap X and Y axis selections
        if (swapAxesBtn) {
            swapAxesBtn.addEventListener('click', function () {
                const currentX = plotState.selectedX;
                const currentY = plotState.selectedY;
                if (!currentX || !currentY) return;
                plotState.selectedX = currentY;
                plotState.selectedY = currentX;
                [plotState.xTitle, plotState.yTitle] = [plotState.yTitle, plotState.xTitle];

                const currentXMin = plotState.xMin, currentXMax = plotState.xMax;
                plotState.xMin = plotState.yMin;
                plotState.xMax = plotState.yMax;
                plotState.yMin = currentXMin;
                plotState.yMax = currentXMax;
                syncAxisLimitInputs();

                renderDropdownOptions();
                renderPlot();
            });
        }

        setupAxisLimitControls();

        // Multi-Select Reactor Dropdown Button & Menu
        if (reactorBtn && reactorMenu) {
            reactorBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (conditionMenu && conditionBtn) {
                    conditionMenu.classList.remove('open');
                    conditionBtn.classList.remove('open');
                    conditionBtn.setAttribute('aria-expanded', 'false');
                }
                const list = $('#reactorCheckboxList');
                if (!list || !list.children.length) {
                    populateMultiSelectReactorFilter();
                }
                const isOpen = reactorMenu.classList.toggle('open');
                reactorBtn.classList.toggle('open', isOpen);
                reactorBtn.setAttribute('aria-expanded', String(isOpen));
            });

            reactorMenu.addEventListener('click', function (e) {
                e.stopPropagation();
            });

            document.addEventListener('click', function () {
                reactorMenu.classList.remove('open');
                reactorBtn.classList.remove('open');
                reactorBtn.setAttribute('aria-expanded', 'false');
            });
        }

        // Select All / Clear All Reactors
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', function () {
                $$('#reactorCheckboxList input[type="checkbox"]').forEach(cb => {
                    cb.checked = true;
                    plotState.selectedReactors.add(cb.value);
                });
                updateReactorButtonLabel();
                renderPlot();
            });
        }

        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', function () {
                $$('#reactorCheckboxList input[type="checkbox"]').forEach(cb => {
                    cb.checked = false;
                });
                plotState.selectedReactors.clear();
                updateReactorButtonLabel();
                renderPlot();
            });
        }

        if (conditionBtn && conditionMenu) {
            conditionBtn.addEventListener('click', event => {
                event.stopPropagation();
                if (reactorMenu && reactorBtn) {
                    reactorMenu.classList.remove('open');
                    reactorBtn.classList.remove('open');
                    reactorBtn.setAttribute('aria-expanded', 'false');
                }
                const isOpen = conditionMenu.classList.toggle('open');
                conditionBtn.classList.toggle('open', isOpen);
                conditionBtn.setAttribute('aria-expanded', String(isOpen));
            });
            conditionMenu.addEventListener('click', event => event.stopPropagation());
            document.addEventListener('click', () => {
                conditionMenu.classList.remove('open');
                conditionBtn.classList.remove('open');
                conditionBtn.setAttribute('aria-expanded', 'false');
            });
        }
        if (selectAllConditions) selectAllConditions.addEventListener('click', () => {
            plotState.selectedConditions = new Set([...plotState.conditionRanges].filter(([, intervals]) => intervals.length).map(([condition]) => condition));
            populateConditionFilter();
            renderPlot();
        });
        if (clearAllConditions) clearAllConditions.addEventListener('click', () => {
            plotState.selectedConditions.clear();
            populateConditionFilter();
            renderPlot();
        });

        // DateTime filters
        if (fromInput) {
            fromInput.addEventListener('change', function () {
                plotState.fromDate = this.value;
                renderPlot();
            });
        }

        if (toInput) {
            toInput.addEventListener('change', function () {
                plotState.toDate = this.value;
                renderPlot();
            });
        }

        if (clearDatesBtn) {
            clearDatesBtn.addEventListener('click', function () {
                if (fromInput) fromInput.value = '';
                if (toInput) toInput.value = '';
                plotState.fromDate = '';
                plotState.toDate = '';
                renderPlot();
            });
        }

        // Export Chart to PNG
        $('#plotAddDashboard')?.addEventListener('click', () => window.ILSPlotDashboard.addChart(plotState.chart));
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                const canvas = $('#scatterCanvas');
                if (!canvas || !plotState.chart) {
                    alert('No plot available to export.');
                    return;
                }
                try {
                    const link = document.createElement('a');
                    const xClean = (plotState.selectedX || 'X').replace(/[^a-zA-Z0-9_-]/g, '_');
                    const yClean = (plotState.selectedY || 'Y').replace(/[^a-zA-Z0-9_-]/g, '_');
                    link.download = `scatter_${yClean}_vs_${xClean}.png`;
                    link.href = canvas.toDataURL('image/png');
                    link.click();
                } catch (e) {
                    console.error('Failed to export plot PNG:', e);
                    alert('Could not export chart as PNG.');
                }
            });
        }

        // Page refresh / Reset
        if (pageRefreshBtn) {
            pageRefreshBtn.addEventListener('click', function () {
                loadYieldData();
            });
        }

        // Listen for storage changes from other tabs
        window.addEventListener('storage', function (e) {
            if (e.key === 'ils_yield_table_state' || e.key === 'ils_base_table_state' || e.key === 'ils_custom_table_state' || e.key === 'ils_reforming_summary_state' || e.key === 'runPlanDashboardState' || e.key === 'dhaOnlineState' || e.key === 'dhaDashboardState') {
                loadYieldData();
            }
        });
    }

    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', function () {
        try {
            const saved = JSON.parse(sessionStorage.getItem('ils_plot_preferences') || 'null');
            if (saved) {
                plotState.selectedX = saved.selectedX || plotState.selectedX;
                plotState.selectedY = saved.selectedY || plotState.selectedY;
                if (Array.isArray(saved.selectedReactors)) plotState.selectedReactors = new Set(saved.selectedReactors);
                if (Array.isArray(saved.selectedConditions)) plotState.selectedConditions = new Set(saved.selectedConditions);
                for (const key of ['fromDate', 'toDate', 'xTitle', 'yTitle']) plotState[key] = saved[key] || '';
                for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) plotState[key] = Number.isFinite(saved[key]) ? saved[key] : null;
                plotState.showTrend = !!saved.showTrend;
                plotState.connectReactors = !!saved.connectReactors;
                if (Array.isArray(saved.excludedPointKeys)) {
                    plotState.excludedPointKeys = [...new Set(saved.excludedPointKeys.filter(key => typeof key === 'string'))];
                }
                if ([3, 5, 7].includes(saved.trendWindow)) plotState.trendWindow = saved.trendWindow;
                if (['auto', '110x110', '150x97', '200x130', '170x110'].includes(saved.paperSize)) plotState.paperSize = saved.paperSize;
                else if (['150x150', '150x120'].includes(saved.paperSize)) plotState.paperSize = '150x97';
                else if (['200x200', '200x150'].includes(saved.paperSize)) plotState.paperSize = '200x130';
                else if (['10x10', '50x50', '85x85', '85x55', '100x100'].includes(saved.paperSize)) plotState.paperSize = '110x110';
                $('#plotFrom').value = plotState.fromDate;
                $('#plotTo').value = plotState.toDate;
                $('#plotConnectPoints').checked = plotState.showTrend;
                $('#plotConnectReactors').checked = plotState.connectReactors;
                $('#plotTrendWindowGroup').hidden = !plotState.showTrend;
                $('#plotTrendWindow').value = String(plotState.trendWindow);
                $('#plotPaperSize').value = plotState.paperSize;
                if (plotState.paperSize !== 'auto') {
                    const wrapper = $('#canvasWrapper');
                    const [width, height] = plotState.paperSize.split('x');
                    wrapper.classList.add('paper-size');
                    wrapper.style.width = `${width}mm`;
                    wrapper.style.height = `${height}mm`;
                }
                syncAxisLimitInputs();
            }
        } catch (e) { }
        setupEvents();
        window.lucide?.createIcons();
        updateExclusionControls();
        loadYieldData();
    });

})();
