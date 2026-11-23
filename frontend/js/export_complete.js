// Export Complete (6.10.0): one Excel workbook with everything of the run, each table in its own sheet:
// Run Plan (Feed, Plan, DOE, Pre-run, feed tables), Analysis (Offline tables, Reactor Map, Online, ZMB, Liquid),
// Calculation (Base, Yield, Custom, Reforming, Mass Balance) and Plots (settings, the plot on screen and the Summary
// Dashboard plots as images). Reforming (6.11.0) has its own tab list: Run Plan (Feed, Plan, DOE, Pre-run), Offline
// Table-1/2/3, Online Analysis (whole .txt), Final Raw_Data, one "Reactor n (catalyst)" sheet per reactor, Plots. Every sheet of the process is written even when nothing was imported for it: it then
// says what was not imported and where to import it, so the workbook always has the same tabs.
// The button sits in the header of the Calculation pages, Plots and the Summary Dashboard.
(() => {
    if (window.ILSExportComplete) return;
    const read = (key, local = false) => {
        try {
            const raw = sessionStorage.getItem(key) || (local ? localStorage.getItem(key) : null);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    };
    const proc = () => window.ILSProcess?.get?.() || 'isomerization';
    const isMB = () => proc() === 'general_mb';
    const isRef = () => proc() === 'reforming';

    function columnsOf(rows, preferred) {
        const cols = Array.isArray(preferred) ? preferred.filter(c => c !== null && c !== undefined && c !== '').map(String) : [];
        const seen = new Set(cols);
        (rows || []).forEach(r => {
            if (r && typeof r === 'object' && !Array.isArray(r)) Object.keys(r).forEach(k => { if (!seen.has(k)) { seen.add(k); cols.push(k); } });
        });
        return cols;
    }
    const cell = (v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'boolean') return String(v);
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
    };
    // A sheet from row objects (or arrays with a column list)
    function table(name, title, rows, columns, missing) {
        rows = Array.isArray(rows) ? rows : [];
        const cols = columnsOf(rows, columns);
        if (!rows.length || !cols.length) {
            return { name, title, notes: [`Not imported: ${missing}`], columns: ['Status'], rows: [['No data in this run']], _count: 0 };
        }
        return {
            name, title, columns: cols, _count: rows.length,
            rows: rows.map(r => Array.isArray(r) ? r.map(cell) : cols.map(c => cell(r?.[c]))),
        };
    }
    function keyValue(name, title, pairs, missing) {
        const rows = pairs.filter(([, v]) => v !== undefined && v !== null && v !== '');
        if (!rows.length) return table(name, title, [], [], missing);
        return { name, title, columns: ['Item', 'Value'], rows: rows.map(([k, v]) => [k, cell(v)]), _count: rows.length };
    }

    function runPlanSheets() {
        const rp = read('runPlanDashboardState') || {};
        const need = 'load the Run Plan workbook on the Run Plan page.';
        const t = rp.feedTables || {};
        const plan = rp.planData || {};
        const planLabels = { parameter: 'Parameter', units: 'Units', r1: 'R1', r2: 'R2', r3: 'R3', r4: 'R4', r5: 'R5', r6: 'R6', r7: 'R7', r8: 'R8' };
        const planRows = (plan.rows || []).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [planLabels[k] || k, v])));
        const pre = rp.doeData?.pretreatment || {};
        const preRows = (pre.rows || []).map(r => Array.isArray(r) ? Object.fromEntries((pre.columns || []).map((c, i) => [c, r[i]])) : r);
        const info = (plan.info || []).map(i => [i.parameter, i.value]);
        return [
            keyValue('RunPlan Info', 'Run Plan · general information', [
                ['Run Plan file', rp.filePath || rp.summary?.file_path], ['Objective', plan.objective], ...info,
                ['Active reactors', (rp.summary?.active_reactors || []).join(', ')], ['DOE conditions', rp.summary?.doe_count],
            ], need),
            table('RunPlan Feed', 'Run Plan · Feed (all properties and components)', rp.feedRows || read('ils_feed_properties'), null, need),
            table('RunPlan Feed props', 'Run Plan · Feed properties', t.properties?.rows, null, need),
            table('RunPlan Liquid comp', 'Run Plan · Liquid feed composition (wt%)', t.liquid?.rows, null, need),
            table('RunPlan Gas comp', 'Run Plan · Gas feed composition (mol%)', t.gas?.rows, null, need),
            table('RunPlan MW', 'Run Plan · Molecular weights', t.mw?.rows, null, need),
            table('RunPlan Plan', 'Run Plan · Catalyst loading plan', planRows, Object.values(planLabels), need),
            table('RunPlan DOE', 'Run Plan · Design of experiments', rp.doeData?.rows, rp.doeData?.columns, need),
            table('RunPlan Pre-run', 'Run Plan · Pre-run steps (Step 0)', preRows, pre.columns, need + ' (the Pre-run table is optional)'),
        ];
    }

    function analysisSheets() {
        const sheets = [];
        const off = read('dhaDashboardState', true) || {};
        const offNeed = 'process the DHA folder on Analysis → Offline Analysis.';
        sheets.push(
            table('Offline T1 Carbon', 'Offline Analysis · Table-1 carbon number (CARBON_TABULAR %wt)', off.r1, null, offNeed),
            table('Offline T2 Components', 'Offline Analysis · Table-2 component list', off.r2, off.c2, offNeed),
            table('Offline T3 Octane', 'Offline Analysis · Table-3 octane numbers', off.r3, null, offNeed),
            table('Offline Reactor Map', 'Offline Analysis · Reactor Map (valve states)', off.reactorRows, null, 'process the Reactor Map folder on Offline Analysis.'),
        );
        const onl = read('dhaOnlineState', true) || {};
        const onlineRows = Array.isArray(onl.rows) && typeof onlineConditionOf === 'function' && (onl.columns || []).includes('Condition')
            ? onl.rows.map(row => ({ ...row, Condition: onlineConditionOf(row) })) : onl.rows;
        sheets.push(table('Online Analysis', `Online Analysis · ${isRef() ? 'operating data' : 'GC / process export'} (mol% as imported)`,
            onlineRows, onl.columns, 'import the export file on Analysis → Online Analysis.'));
        if (isMB()) {
            const mb = onl.mbPanels || {};
            const isName = mb.internal_standard || onl.internalStandard || 'IS';
            const isNeed = 'choose the Internal Standard (Argon or N2) on Online Analysis.';
            sheets.push(
                table('Online Feed gas IS', `Online · Feed gas composition from the bypass (${isName})`, (mb.feed_gas_is || []).map(f => ({
                    Condition: f.condition, Start: f.start, End: f.end, Reactors: (f.reactors || []).join(', '), 'Bypass lines': f.bypass_lines,
                    [`${isName} mol%`]: f.is_mol_pct, [`${isName} wt%`]: f.is_wt_pct, 'Mixed gas mol%': f.mixed_mol_pct, 'Sum mol%': f.sum_mol_pct,
                    'Mixed gas MW': f.mixed_mw, [`${isName} RSD %`]: f.is_rsd_pct, Error: f.error || '' })), null, isNeed),
                table('Online Avg IS flow', `Online · Average ${isName} flow to each reactor (g/h)`, (mb.avg_is_flow || []).map(r => ({
                    Condition: r.condition, ...Object.fromEntries(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'].map(k => [k, r[k] ?? ''])) })), null, isNeed),
            );
            const liquid = read('ils_liquid_state') || {};
            sheets.push(table('Online Liquid', 'Online · Liquid product per sample', (liquid.results || []).map(r => ({
                Sample: r.sample, Reactor: r.reactor, Condition: r.condition, 'Collection started': r.start, 'Collection finished': r.end,
                'Duration (min)': r.duration_min, 'TOS (h)': r.tos_h, 'TLP mass (g)': r.tlp_g, 'HC phase (g)': r.hc_g, 'Aqueous phase (g)': r.aq_g,
                'Decantation loss (%)': r.decant_loss_pct, 'Carbon (wt%)': r.c_wt_pct, 'HC product (g/h)': r.hc_flow_g_h,
                'Aqueous product (g/h)': r.aq_flow_g_h, 'C in liquid product (g C/h)': r.c_out_g_h, 'Liquid feed (g/h)': r.feed_flow_g_h,
                'Liquid feed source': r.feed_flow_source, 'Liquid feed carbon (wt%)': r.feed_c_wt_pct, 'C in liquid feed (g C/h)': r.c_in_g_h,
                'Hydrogen (wt%)': r.h, 'Oxygen (wt%)': r.o, 'Nitrogen (ppmw)': r.n, 'Sulfur (ppmw)': r.s, 'Density (g/mL)': r.density,
                'Monoaromatics (wt%)': r.mono, 'Diaromatics (wt%)': r.di, 'Tri+ aromatics (wt%)': r.tri, Error: r.error })), null,
                'enter the liquid samples on Online Analysis → Liquid.'));
            const zmb = read('ils_zmb_state') || {};
            sheets.push(table('ZMB GC lines', 'ZMB · Blank-run GC lines (mol%)', zmb.rows, zmb.columns, 'import the ZMB export on Analysis → ZMB.'));
            const pump = read('ils_zmb_pump') || {};
            const pumpRows = [];
            (pump.reps || []).forEach((rep, i) => Object.entries(rep.rows || {}).forEach(([reactor, row]) => {
                if (row && (row.start || row.end || (row.mass !== undefined && row.mass !== ''))) {
                    pumpRows.push({ Rep: i + 1, Reactor: reactor, 'Collection started': row.start || '', 'Collection finished': row.end || '', 'TL collected mass (g)': row.mass ?? '' });
                }
            }));
            sheets.push(
                table('ZMB Pump check', 'ZMB · Liquid pump check (repeats)', pumpRows, null, 'enter the pump-check repeats on Analysis → ZMB.'),
                table('ZMB Verified flow', 'ZMB · Verified liquid flow (g/h)', (pump.results || []).filter(r => r.verified_flow_g_h !== null)
                    .map(r => ({ Reactor: r.reactor, 'Verified liquid flow (g/h)': r.verified_flow_g_h, Reps: r.reps })), null, 'enter the pump-check repeats on Analysis → ZMB.'),
            );
        }
        return sheets;
    }

    // Reforming: "Final Raw_Data" (6.10.3) = the rows of "Export Complete CSV" (Calculation → Reforming tab): every
    // operating record of the .txt with its DHA sample joined (GC Date/Time -10..+60 min), DHA samples without a record
    // kept; two header rows (family / property name, then C1…C15 and units) from cell A1, all rows (no date filter).
    // The join lives in reforming_reactors.js, loaded here on pages that do not have it (Plots, Summary Dashboard).
    function reformingModule() {
        if (window.ILSReformingReactors) return Promise.resolve(window.ILSReformingReactors);
        return new Promise(resolve => {
            const script = document.createElement('script');
            script.src = '/frontend/js/reforming_reactors.js?v=4';
            script.onload = () => resolve(window.ILSReformingReactors || null);
            script.onerror = () => resolve(null);
            document.head.appendChild(script);
        });
    }
    async function reformingRawSheet() {
        const name = 'Final Raw_Data';
        const title = 'Final Raw_Data · operating data with the DHA sample of each GC line (as Export Complete CSV)';
        const missing = why => ({ name, title, notes: [`Not imported: ${why}`], columns: ['Status'], rows: [['No data in this run']], _count: 0 });
        const carbon = read('ils_reforming_carbon_state') || {};
        if (!Array.isArray(carbon.rows) || !carbon.rows.length) {
            return missing('process the DHA folder on Offline Analysis, then open Calculation → Reforming CARBON_TABULAR once.');
        }
        if (!(read('dhaOnlineState', true) || {}).path) return missing('load the operating data (.txt) on Analysis → Online Analysis.');
        const RR = await reformingModule();
        if (!RR?.completeTable) return missing('the Reforming module could not be loaded; reload the page and export again.');
        let operating;
        try { operating = await RR.fetchOperating(); } catch (error) { return missing(error.message); }
        const lead = ['Date', 'Condition', 'TOS(h)', 'Reactor', 'UID'];
        const dataColumns = (carbon.columns || []).filter(column => !lead.includes(column));
        const table = RR.completeTable(operating, carbon.rows, dataColumns);
        // Numbers stay numbers in Excel; dates and text stay as written in the file
        const value = v => {
            if (v === null || v === undefined || v === '') return null;
            if (typeof v === 'number') return Number.isFinite(v) ? v : null;
            const text = String(v).trim();
            return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text) ? Number(text) : text;
        };
        const textColumns = new Set(['Date/Time', 'GC Date/Time']);
        const rows = table.entries.map(({ op, dha }) => [
            ...table.opColumns.map(column => (op ? (textColumns.has(column) ? (op[column] || null) : value(op[column])) : null)),
            dha ? (dha.Date || dha.DateTime || null) : null,
            ...dataColumns.map(column => (dha ? value(dha[column]) : null)),
        ]);
        return { name, columns: table.top, subheader: table.units, rows, _count: rows.length, _title: title };
    }

    function calculationSheets() {
        const need = 'open Calculation → Calculation table (it is built from the Offline and Online data).';
        const base = read('ils_base_table_state') || {};
        const sheets = [table('Calc Base table', 'Calculation · Base table', base.rows, base.columns, need)];
        if (isRef()) {
            const rc = read('ils_reforming_carbon_state') || {};
            const rs = read('ils_reforming_summary_state') || {};
            sheets.push(
                table('Calc Reforming Carbon', 'Calculation · Reforming CARBON_TABULAR(%WGT)', rc.rows, rc.columns, need),
                table('Calc Reforming Summary', 'Calculation · Reforming component summary', rs.rows, rs.columns, need),
            );
        } else {
            const yld = read('ils_yield_table_state') || {};
            sheets.push(table('Calc Yield wof%', 'Calculation · Yield table (wof%)', yld.rows, yld.columns, need));
        }
        // Custom table: in memory while its page is open, else the last computed copy
        let custom = read('ils_custom_table_state') || {};
        let customCols = null;
        if (typeof customState !== 'undefined' && Array.isArray(customState.computedRows) && customState.computedRows.length) {
            const removed = customState.removedColumns instanceof Set ? customState.removedColumns : new Set();
            customCols = [...(customState.baseColumns || []), ...(customState.customColumns || []).map(c => c.name)].filter(c => !removed.has(c));
            custom = { rows: customState.computedRows };
        }
        sheets.push(table('Calc Custom table', 'Calculation · Custom table', custom.rows, customCols, 'add columns on Calculation → Custom table.'));
        const defs = read('ils_custom_columns') || [];
        if (Array.isArray(defs) && defs.length) {
            sheets.push(table('Calc Custom formulas', 'Calculation · Custom table formulas', defs.map(d => ({ Column: d.name, Formula: d.formula, Unit: d.unit, Decimals: d.decimals })), null, ''));
        }
        if (isMB()) {
            const mb = read('ils_mass_balance_state') || {};
            const mbNeed = 'open Calculation → Mass Balance once the Run Plan and the Online export are loaded.';
            sheets.push(
                table('Calc MB Reactors', 'Calculation · Mass balance reactor table', mb.summary, null, mbNeed),
                table('Calc MB Components', 'Calculation · Mass balance component table', mb.components, null, mbNeed),
            );
        }
        return sheets;
    }

    function plotSheets() {
        const prefs = read('ils_plot_preferences') || {};
        const extra = read('ils_plot_extra') || {};
        const settings = keyValue('Plots Settings', 'Plots · settings of the Plots page', [
            ['X axis', prefs.selectedX], ['Y axis', prefs.selectedY],
            ['Reactors', (prefs.selectedReactors || []).join(', ')], ['Conditions', (prefs.selectedConditions || []).join(', ')],
            ['From', prefs.fromDate], ['To', prefs.toDate], ['Moving average', prefs.showTrend ? `on (${prefs.trendWindow || 3} points)` : 'off'],
            ['Additional graph', extra.open ? extra.graph : 'closed (standard X–Y plot)'], ['Excluded points', (prefs.excludedPointKeys || []).length],
        ], 'open the Plots page and choose X and Y.');
        const images = [];
        const canvas = document.getElementById('scatterCanvas');
        if (canvas && canvas.width && canvas.height && canvas.offsetParent !== null) {
            try {
                images.push({ title: `Plots page · ${document.getElementById('plotChartTitle')?.textContent || 'current plot'}`, data_url: whiteBackground(canvas) });
            } catch (e) { }
        }
        const board = read('ils_plot_dashboard_state') || {};
        (board.plots || []).forEach((plot, i) => {
            if (plot?.image) images.push({ title: `Summary Dashboard slot ${i + 1} · ${plot.title || ''}`, data_url: plot.image });
        });
        const plotsSheet = images.length
            ? { name: 'Plots', title: 'Plots · the plot on the Plots page and the Summary Dashboard plots', columns: [], rows: [], images, _count: images.length }
            : { name: 'Plots', title: 'Plots', notes: ['Not plotted yet: add plots with Plots → Add to Dashboard (or export from the Plots page to include the plot on screen).'], columns: ['Status'], rows: [['No plots in this run']], _count: 0 };
        const tableSnap = board.table;
        const sheets = [settings, plotsSheet];
        if (tableSnap && Array.isArray(tableSnap.rows) && tableSnap.rows.length) {
            sheets.push(table('Dashboard table', `Summary Dashboard · ${tableSnap.title || 'table'}`, tableSnap.rows, tableSnap.columns, ''));
        }
        return sheets;
    }
    function whiteBackground(canvas) {
        const out = document.createElement('canvas');
        out.width = canvas.width; out.height = canvas.height;
        const ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(canvas, 0, 0);
        return out.toDataURL('image/png');
    }

    function runNumber() {
        try { return (sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim(); } catch (e) { return ''; }
    }

    // ---------------------------------------------------------------- Reforming workbook (6.11.0)
    // Only these tabs, in this order: Run Plan (Feed, Plan, DOE, Pre-run) · Offline Analysis (Table-1, -2, -3) ·
    // Online Analysis (the whole .txt) · Final Raw_Data · one sheet per reactor laid out as the "Reactor n (catalyst)"
    // sheets of ILS_Chemical Validation_Reforming · Plots. Isomerization / General_MB keep the layout above.
    const numeric = v => {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        const text = String(v).trim();
        return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text) ? Number(text) : text;
    };
    async function reformingOnlineSheet(RR) {
        const name = 'Online Analysis', title = 'Online Analysis · the operating data file (.txt) as written, every column';
        try {
            const data = await RR.fetchOperatingTable();
            return { name, title, columns: data.columns, rows: data.rows.map(row => data.columns.map(c => numeric(row[c]))), _count: data.rows.length };
        } catch (error) {
            return table(name, title, [], [], error.message);
        }
    }
    function reactorSheets(RR, calc) {
        if (!calc?.reactors?.length) {
            return [table('Reactor calculations', 'Reactor calculations', [], [],
                'load the Run Plan, the Reforming DHA folder (Offline) and the operating data (Online), then open the Calculation table.')];
        }
        const k = calc.constants || {};
        const fmt = v => (typeof v === 'number' ? Number(v.toPrecision(10)) : '—');
        return calc.reactors.map(reactor => {
            const lines = calc.lines.filter(line => line.reactor === reactor.reactor);
            const name = `Reactor ${reactor.reactor.slice(1)}${reactor.catalyst ? ` (${reactor.catalyst})` : ''}`.slice(0, 31);
            const rows = RR.SHEET_ROWS.map(([label, unit, key]) => {
                const component = typeof key === 'object' && (key.wt || key.wof);
                return [label, unit, component ? calc.carbon_fraction?.[component] ?? null : null,
                    ...lines.map(line => { const v = RR.sheetValue(line, key); return typeof v === 'number' ? (Number.isFinite(v) ? v : null) : (v === '' ? null : v ?? null); })];
            });
            return {
                name, title: `${name} · catalyst performance (ILS reactor sheet)`,
                notes: [
                    `Carbon_Online DHA (feed) ${fmt(k.feed_carbon)} wt% · Hydrogen ${fmt(k.feed_hydrogen)} wt%${k.feed_carbon_normalised ? ` (normalised 100·C/(C+H) from C ${fmt(k.feed_carbon_measured)} / H ${fmt(k.feed_hydrogen_measured)})` : ''} · Molecular Weight ${fmt(k.feed_mw)} · Density ${fmt(k.feed_density)} g/ml (Run Plan Feed)`,
                    `Feed Cut-In ${reactor.feed_cut_in || '—'} · ${reactor.block} · catalyst volume ${fmt(reactor.catalyst_volume)} ml · H2 flow (inlet) ${fmt(reactor.h2_inlet_g_h)} g/h (Run Plan DOE)`,
                    `H2 / N2 vol% = (GC Area − intercept) / slope: H2 ${k.calibration?.H2?.intercept} / ${k.calibration?.H2?.slope}, N2 ${k.calibration?.N2?.intercept} / ${k.calibration?.N2?.slope} · yields from ${fmt(k.yield_start_h)} h after cut-in`,
                ],
                columns: ['Parameter', 'Unit', 'Carbon, wt%', ...lines.map((_, i) => `#${i + 1}`)],
                rows, _count: lines.length,
            };
        });
    }
    async function reformingWorkbook() {
        const RR = await reformingModule();
        const runPlan = runPlanSheets().filter(sheet => ['RunPlan Feed', 'RunPlan Plan', 'RunPlan DOE', 'RunPlan Pre-run'].includes(sheet.name));
        const off = read('dhaDashboardState', true) || {};
        const offNeed = 'process the DHA folder on Analysis → Offline Analysis.';
        const offline = [
            table('Offline Table-1', 'Offline Analysis · Table-1 carbon-number table (Unknowns by Carbon#)', off.r1, null, offNeed),
            table('Offline Table-2', 'Offline Analysis · Table-2 unknown peaks (Carbon# assignment)', off.r2, off.c2, offNeed),
            table('Offline Table-3', 'Offline Analysis · Table-3 properties', off.r3, null, offNeed),
        ];
        let calc = null;
        if (RR?.calc) {
            const outcome = await RR.calc();
            calc = outcome.result || null;
        }
        const plots = plotSheets().filter(sheet => sheet.name === 'Plots');
        return [...runPlan, ...offline, RR ? await reformingOnlineSheet(RR) : table('Online Analysis', 'Online Analysis', [], [], 'reload the page and export again.'),
                await reformingRawSheet(), ...(RR ? reactorSheets(RR, calc) : []), ...plots]
            .map(({ _count, _title, ...sheet }) => sheet);
    }

    async function buildSheets() {
        if (isRef()) return reformingWorkbook();
        const groups = [['Run Plan', runPlanSheets()], ['Analysis', analysisSheets()], ['Calculation', calculationSheets()], ['Plots', plotSheets()]];
        const index = [];
        groups.forEach(([section, sheets]) => sheets.forEach(sh => index.push({
            Section: section, Sheet: sh.name, Content: sh._title || sh.title || sh.name,
            Status: sh._count ? 'Included' : 'Not imported', 'Rows / plots': sh._count,
        })));
        const summary = {
            name: 'Summary',
            title: `ILS Dashboard · Export Complete · Run ${runNumber() || '(no Run Number)'}`,
            notes: [
                `Process: ${window.ILSProcess?.label?.() || proc()} · exported ${new Date().toLocaleString()}`,
                'One sheet per table. Sheets marked "Not imported" say where to import their data.',
            ],
            columns: ['Section', 'Sheet', 'Content', 'Status', 'Rows / plots'],
            rows: index.map(r => [r.Section, r.Sheet, r.Content, r.Status, r['Rows / plots']]),
        };
        return [summary, ...groups.flatMap(([, sheets]) => sheets)].map(({ _count, _title, ...sheet }) => sheet);
    }

    async function exportComplete(button) {
        const label = button?.textContent;
        if (button) { button.disabled = true; button.textContent = 'Exporting...'; }
        try {
            const run = runNumber();
            const stamp = new Date().toISOString().slice(0, 10);
            const name = `ILS_Run${run || ''}_${proc()}_Complete_${stamp}.xlsx`;
            const response = await fetch('/api/export-xlsx', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file_name: name, sheets: await buildSheets() }),
            });
            if (!response.ok) {
                let message = `Export failed (${response.status})`;
                try { message = (await response.json()).error || message; } catch (e) { }
                throw new Error(message);
            }
            const blob = await response.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(link.href), 5000);
            window.ILSHistorian?.toast?.(`Exported ${name}`);
        } catch (error) {
            if (window.ILSHistorian?.showModal) {
                window.ILSHistorian.showModal({ title: 'Export Complete', message: error.message, buttons: [{ label: 'OK', value: true, primary: true }] });
            } else {
                alert(error.message);
            }
        } finally {
            if (button) { button.disabled = false; button.textContent = label; }
        }
    }

    function addButton() {
        const actions = document.querySelector('main > header .header-actions');
        if (!actions || document.getElementById('exportCompleteBtn')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'exportCompleteBtn';
        button.className = 'btn primary export-complete-btn';
        button.textContent = 'Export Complete';
        button.title = 'Download one Excel workbook with the Run Plan, the Analysis data, the Calculation tables and the Plots, each table in its own sheet';
        button.style.cssText = 'height:38px;padding:0 14px;font-size:12px;white-space:nowrap';
        button.onclick = () => exportComplete(button);
        const runGroup = actions.querySelector('.run-number-group');
        runGroup ? actions.insertBefore(button, runGroup) : actions.prepend(button);
    }

    window.ILSExportComplete = { buildSheets, exportComplete, addButton };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();
})();
