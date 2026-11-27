// ILS step-by-step guide (6.9.11): a short tour on every page that highlights each control and says what it does.
// The round "?" at the bottom right starts it (6.10.0; next to it "Next" opens the next workflow page); on the first visit of a page a small prompt offers it. Steps whose control is not on
// the page (another process, hidden tab) are skipped. window.ILSGuide.visibleSteps() is also used to build the picture
// documentation, so the texts below are the single source for both.
(() => {
    if (window.ILSGuide) return;
    const $ = (s) => document.querySelector(s);
    const isMB = () => Boolean(window.ILSProcess?.isGeneralMB?.());
    const isReforming = () => Boolean(window.ILSProcess?.isReforming?.());

    // ------------------------------------------------------------ texts
    const HEADER = [
        ['.analysis-tabs', 'Menu bar', 'Work from left to right: Runs → Run Plan → Analysis → Calculation → Plots → Data Integrity → Summary Dashboard → History. Analysis and Calculation open a small menu.'],
        ['#runNumberDisplay', 'Run Number', 'The Run Number of this browser tab. It is entered on the Run Plan page and shown here read-only.'],
        ['#processDisplay', 'Process', 'The process chosen on the Run Plan page (Isomerization, Reforming or General_MB). It decides which tables and calculations appear.'],
        ['#saveRunDetails', 'Save Run Details', 'Saves everything loaded in this tab (sources, tables, entries, plot settings) as a snapshot you can reload later from Runs.'],
        ['#historianSave', 'Save to Historian', 'Writes the run into its own database file so History can compare it with other runs.'],
        ['#pageRefresh', 'Reset (↻)', 'Clears this browser tab and the Run Number to start again. Saved runs are not touched.'],
        ['#ilsNextBtn', 'Next', 'Opens the next page of the workflow: Run Plan → Offline → Online → Calculation table → Plots.'],
        ['#ilsGuideBtn', 'Guide (?)', 'Starts this tour again on any page.'],
    ];
    const TOURS = {
        runs: [
            ['#savedRunSelect', 'Saved runs', 'Every run saved with "Save Run Details". Pick one to see its details.'],
            ['#runMetadata', 'Run details', 'Run Number, process, date and what the snapshot contains.'],
            ['#loadRunBtn', 'Load run', 'Loads the chosen run into this tab and opens the page it was saved from.'],
            ['#startFreshBtn', 'Start Fresh', 'Empties this tab for a new run and opens the dashboard. Next step: the Run Plan page.'],
            ['#ilsNextBtn', 'Next', 'Every page has a Next button: it leads through Run Plan → Analysis (Offline → Online) → Calculation table → Plots.'],
            ['#ilsGuideBtn', 'Guide (?)', 'Every page has this button at the bottom right: it walks you through the controls of that page.'],
        ],
        run_plan: [
            ['#runNumberInput', '1 · Run Number', 'Type the Run Number first. All pages use it, and the process tabs unlock.'],
            ['.process-tabs', '2 · Process', 'Choose Isomerization, Reforming or General_MB (mass balance). Switching clears the loaded Run Plan.'],
            ['#runPlanFile', '3 · Run Plan file', 'Path of the RunPlan.xlsx workbook (Plan, DOE and Feed sheets).'],
            ['#runPlanBrowse', 'Browse', 'Opens a file picker to choose the workbook.'],
            ['#runPlanProcess', '4 · Load', 'Reads the workbook. The counters below show what was found.'],
            ['#runPlanKpis', 'Summary', 'Number of feed rows, plan rows, DOE conditions and active reactors.'],
            ['#tabFeed', 'Feed', 'Feed properties, liquid composition and gas feed composition. Totals are checked to 100 %.'],
            ['#tabPlan', 'Plan', 'Objective and catalyst loading per reactor, with the role of each reactor (catalyst, inert, not used).'],
            ['#tabDoe', 'DOE', 'Test conditions per block and reactor: start, end or duration, temperature, pressure and flows. They define the condition windows used everywhere.'],
            ['#tabPrerun', 'Pre-run', 'The steps before the first condition (drying, reduction, feed cut-in) with one chart per reactor block.'],
            ['#feedShowEmpty', 'Show empty rows', 'Shows the full template including empty rows.'],
            ['#doeReactorFilter', 'DOE filters', 'Show the conditions of one reactor or one condition only.'],
            ...HEADER,
        ],
        offline: [
            ['#folder', '1 · DHA folder', 'Path of the folder with the offline DHA report files (.XLS).'],
            ['#browse', 'Browse', 'Opens a folder picker.'],
            ['#process', '2 · Process files', 'Reads every report: carbon-number table, component list and octane numbers.'],
            ['#kpis', 'Summary', 'Files found, processed and failed.'],
            ['.table-tabs', '3 · Tables', 'Table-1 carbon numbers, Table-2 component list, Table-3 octane numbers, and the Reactor Map (valve states per reactor).'],
            ['#componentFilter', 'Components', 'Choose which component families Table-1 shows.'],
            ['#reactorFilterWrap', 'Active reactor', 'Show the samples of one reactor only.'],
            ['#mapReactors', 'Map reactors', 'Refreshes the reactor of every sample from the Reactor Map.'],
            ['#search', 'Search', 'Filters the rows by any text.'],
            ['#reactorFolder', 'Reactor Map folder', 'Folder of the valve-state CSV files; Process Reactor Map reads them.'],
        ],
        online: [
            ['#onlinePhaseTabs', 'Gas | Liquid', 'General_MB: Gas is the imported export; Liquid is where the liquid samples are entered.'],
            ['#onlineFile', '1 · Export file', 'Path of the tab-delimited GC / process export (SystemTxt .txt).'],
            ['#onlineBrowse', 'Browse', 'Opens a file picker.'],
            ['#rfOperatingFolder', 'Folder (Reforming)', 'Pick the folder that holds all the operating exports (.txt). Import merges them: one line per operating record, the readable copy of duplicates, sorted by GC Date/Time. The green panel lists the files used and any time no export covers.'],
            ['#onlineProcess', '2 · Import file', 'Reads the export: one row per GC analysis with its time, reactor and process values.'],
            ['#onlineSummary', 'Import summary', 'How many records were loaded and any notes about the file.'],
            ['#onlineIsWrap', '3 · Internal Standard', 'General_MB: choose Argon or N2. The bypass lines give the feed gas; the side panel shows it per condition.'],
            ['#onlineUnitWrap', '4 · Units', 'mol% as imported, or mass (g/h), volume (Nl/h) and carbon (g C/h) flows calculated with the internal standard.'],
            ['#onlineReactorMapToggle', 'Reactor Map', 'ON assigns the reactor of each line from the valve-state map instead of the export.'],
            ['#onlineReactorFilter', 'Reactor filter', 'Show the lines of one reactor (0 = bypass).'],
            ['#onlineSearch', 'Search', 'Filters the rows by any text.'],
            ['#onlineFrom', 'Date range', 'Limits the table to a time window; Clear dates removes it.'],
            ['#onlineThead', 'Columns', 'The Condition column comes from the Run Plan DOE. Click × on a column to hide it; Restore columns brings them back.'],
            ['#onlineMbSide', 'Side panel', 'Feed gas composition from the bypass lines and the average internal-standard flow to each reactor, per condition.'],
            ['#onlineUnitsBar', 'Conversion basis', 'Formulas, flow sources and molar masses used. It turns red when the Run Plan lacks something.'],
        ],
        online_liquid: [
            ['#liqFeedCarbon', '1 · Liquid feed carbon', 'Carbon wt% of the liquid feed. Typed once per run; needed for the carbon balance.'],
            ['#liqFeedFlows', 'Liquid feed flow', 'Per reactor, from the ZMB pump check, else from the Run Plan DOE. Nothing to type.'],
            ['#liqSampleTabs', '2 · Samples', 'One tab per liquid sample. "+ New sample" adds the next one; the counter shows how many reactors are complete.'],
            ['#liqSampleName', 'Sample name', 'Name of this sample, e.g. C1-S1.'],
            ['#liqAllStart', '3 · Collection window', 'Start and finish of the collection; "Apply times" copies them to every reactor.'],
            ['#liqAllCarbon', 'Carbon for all', 'One carbon wt% for every reactor of this sample; "Apply" fills it in.'],
            ['#liqTwoPhase', 'Two phases seen', 'Tick when the liquid separated: then type the hydrocarbon and aqueous masses instead of only the total.'],
            ['#liqShowAll', 'Show unused reactors', 'Also lists reactors that are not used in the Run Plan.'],
            ['#liqChecklist', 'Ready check', 'How many reactors are ready for the mass and the carbon balance, and what is still missing.'],
            ['#liqMainBody', '4 · Per reactor', 'Type TLP mass and carbon wt%. Duration, TOS, product flows and carbon are calculated. Enter moves down; a block copied from Excel can be pasted.'],
            ['.liq-extra', 'More analyses', 'Optional hydrogen, oxygen, nitrogen, sulfur, density and aromatics of the product.'],
            ['#liqRemoveSample', 'Remove sample', 'Deletes the open sample and its entries.'],
        ],
        zmb: [
            ['#zmbFile', '1 · ZMB export', 'Path of the GC export of the blank run before the experiment.'],
            ['#zmbProcess', 'Import file', 'Reads it and shows the lines in mol% below (display only).'],
            ['#zmbRepTabs', '2 · Repeats', 'One tab per pump-check repeat; "+ Add rep" adds one.'],
            ['#zmbApplyStart', '3 · Times for all', 'Start and end of the collection, copied to every reactor with "Apply to all reactors".'],
            ['#zmbPumpBody', '4 · Collected mass', 'Type the liquid collected per reactor; duration and flow (g/h) are calculated.'],
            ['.zmb-verified', 'Verified liquid flow', 'Average flow over the repeats. The mass balance uses it as the liquid feed.'],
            ['#zmbRemoveRep', 'Remove this rep', 'Deletes the open repeat.'],
            ['#zmbReactorFilter', 'GC lines filter', 'Filter the imported blank-run lines by reactor (0 = bypass).'],
        ],
        calculation: [
            ['#calcKpis', 'Summary', 'Records, parameters and the source of the base table.'],
            ['#tabBaseTable', 'Base table', 'Reactor conditions and flows derived from the online data and the Run Plan feed properties.'],
            ['#tabYieldTable', 'Yield table (wof%)', 'Each DHA sample scaled to the reactor outlet; Gas, C5+ and H2 consumption added.'],
            ['#tabReformingCarbon', 'Reforming table', 'Reforming: carbon-number table per sample with TOS and condition.'],
            ['#calcReactorFilter', 'Reactor filter', 'Show one reactor.'],
            ['#calcDecDecrease', 'Decimals', 'Fewer or more decimal places.'],
            ['#calcExportCsv', 'Export CSV', 'Downloads the table.'],
            ['#calcFrom', 'Date range', 'Limits the table to a time window.'],
            ['#calcFeedStrip', 'Feed properties', 'Carbon, hydrogen and molar mass of the feed used in the formulas (from the Run Plan).'],
            ['#calcSyncBtn', 'Sync', 'Rebuilds the table from the latest Online Analysis data.'],
        ],
        custom: [
            ['#btnSyncBase', '1 · Sync', 'Loads the latest base, offline and online data as the starting columns.'],
            ['#customColName', '2 · New column', 'Name, unit and decimals of the column you want to add.'],
            ['#customFormulaInput', '3 · Formula', 'Excel-like formula using the tags on the right, e.g. a ratio of two columns.'],
            ['#tagSearchBox', 'Tags', 'Search and click a tag to insert it into the formula.'],
            ['#samplePreviewBox', 'Preview', 'The result for a few rows before you apply.'],
            ['#btnApplyCol', '4 · Apply', 'Adds the column to the table.'],
            ['#activeColumnsWrap', 'Your columns', 'Edit or remove the columns you added.'],
            ['#btnExportCsv', 'Export CSV', 'Downloads the table.'],
            ['#btnSaveTemplate', 'Template', 'Saves your formulas as a JSON template to reuse in another run.'],
        ],
        mass_balance: [
            ['.kpis', 'Summary', 'Samples × reactors, components, reference reactant and internal standard of this calculation.'],
            ['#mbIs', 'Internal standard', 'Gas used as the reference for all flows (Argon or N2).'],
            ['#mbBasis', 'GC lines averaged', 'Which gas analyses are averaged for a sample: the whole condition without the first line, all lines, or only around the liquid sample.'],
            ['#mbReactorFilter', 'Reactor filter', 'Show one reactor in both tables.'],
            ['#mbReactorTable', '1 · Reactor table', 'One row per sample and reactor: carbon in and out, carbon balance, mass balance, flows and conversion. Hover a balance to see its numbers.'],
            ['#mbCompFilter', '2 · Components', 'Pick the components to show; lumps by carbon number and the liquid are also listed.'],
            ['#mbRefFilter', 'Reference', 'The reactant(s) that selectivity and yield are calculated against.'],
            ['#mbMetricFilter', 'Values', 'In, Out, Net, Conversion, Selectivity, Yield, Yield wof%.'],
            ['#mbCompBasis', 'Basis', 'Carbon (g C/h), mass (g/h) or mole (mmol/h).'],
            ['#mbCompTable', '3 · Component table', 'The chosen values per component, sample and reactor. Hover a value for its formula.'],
        ],
        integrity: [
            ['#integritySource', '1 · Data', 'Choose the loaded table to check (base or yield).'],
            ['#integrityParameters', 'Parameters', 'Columns to check.'],
            ['#integrityThreshold', 'Sensitivity', 'How far a value may be from the median before it is flagged (robust score).'],
            ['#integrityAnalyze', '2 · Analyze', 'Calculates statistics and potential outliers per run, condition, reactor and parameter. The data is never changed.'],
            ['#integrityStats', 'Statistics', 'Mean, median, spread and counts per group; export or add to the Summary Dashboard.'],
            ['#integrityFlags', 'Flags', 'Values flagged as potential outliers, with the reason.'],
        ],
        plots: [
            ['#plotExtraToggle', 'Additional graphs', 'Opens more chart types when you need them: group type (PIONA) per sample, carbon-number distribution of a sample, average per condition and, for General_MB, the mass balance graphs. Closed, the page shows the standard X–Y plot.'],
            ['#plotExtraGraph', 'Graph', 'Choose the additional graph. Mass balance graphs (General_MB) also show component, value, basis and reference reactant.'],
            ['#plotMbControls', 'Mass balance options', 'General_MB: the component, the value (in, out, conversion, selectivity, yield), the basis and the reference reactant.'],
            ['#plotExtraSample', 'Sample', 'The DHA sample shown in the carbon-number distribution.'],
            ['#plotExtraScale', 'Scale', 'As measured (wt%) or normalised to 100 %.'],
            ['#plotXSelect', '1 · X axis', 'The value on the horizontal axis, usually time on stream.'],
            ['#plotSwapAxes', 'Swap X/Y', 'Exchanges the two axes.'],
            ['#plotYSelect', '2 · Y axis', 'The value to plot.'],
            ['#plotReactorFilter', 'Reactors', 'Choose the reactors shown; colours identify reactors.'],
            ['#plotConditionFilter', 'Conditions', 'Choose the Run Plan conditions; marker shapes identify conditions.'],
            ['#plotFrom', 'Date range', 'Limits the points to a time window.'],
            ['#plotConnectPoints', 'Moving average', 'Adds a dashed moving-average trend per reactor and condition.'],
            ['#plotConnectReactors', 'Connect points', 'Draws one line per reactor through its points.'],
            ['#plotPaperSize', 'Plot size', 'Paper size for the exported image (300 DPI).'],
            ['#plotExportBtn', 'Export PNG', 'Downloads the plot as an image.'],
            ['#plotAddDashboard', '3 · Add to Dashboard', 'Puts this plot into the next free slot of the Summary Dashboard.'],
            ['#plotExcludePoints', 'Exclude points', 'Tick, then click points to leave them out; undo and restore buttons next to it.'],
            ['#xAxisLimitBtn', 'Axis limits', 'Set minimum and maximum of the axes. Click an axis title on the chart to rename it.'],
            ['#plotLegend', 'Legend', 'Click a reactor to hide or show it.'],
        ],
        dashboard: [
            ['#boardGrid', '1 · Plot slots', 'Twelve slots filled from Plots → Add to Dashboard. Click a plot to enlarge it; the bin icon frees the slot.'],
            ['#boardAddTable', '2 · Add table', 'Adds one table (yield, base, custom, plan or DOE) with chosen columns and filters.'],
            ['#boardPrint', '3 · Print / PDF', 'Prints the board on A4 or saves it as PDF.'],
            ['#pageRefresh', 'Clear dashboard', 'Removes all plots and the table (asks first).'],
        ],
        history: [
            ['#histRefresh', 'Refresh', 'Reloads the list of runs saved to the Historian.'],
            ['#histMode', '1 · Mode', 'View one run, or compare two runs.'],
            ['#histRunA', '2 · Runs', 'Choose dataset A (and B to compare).'],
            ['#histCompare', '3 · Show', 'Shows the saved tables, or the differences between the two runs.'],
            ['#histLoadA', 'Load into dashboard', 'Loads run A back into the dashboard pages.'],
            ['#histReactor', 'Filters', 'Limit the comparison to a reactor or condition; "differences only" hides equal rows.'],
            ['#histTabs', 'Tables', 'One tab per saved table.'],
        ],
    };

    function pageKey() {
        const path = location.pathname.toLowerCase();
        if (path === '/' || path.endsWith('run_data_home.html')) return 'runs';
        if (path.includes('run_plan') || path.endsWith('/run-plan')) return 'run_plan';
        if (path.includes('online_analysis')) return $('#onlineLiquidPanel') && !$('#onlineLiquidPanel').hidden ? 'online_liquid' : 'online';
        if (path.includes('zmb')) return 'zmb';
        if (path.includes('mass_balance') || path.endsWith('/mass-balance')) return 'mass_balance';
        if (path.includes('custom_table')) return 'custom';
        if (path.includes('calculation_table')) return 'calculation';
        if (path.includes('data-integrity')) return 'integrity';
        if (path.includes('plot_dashboard')) return 'dashboard';
        if (path.includes('plots')) return 'plots';
        if (path.includes('history')) return 'history';
        if (path.includes('index.html') || path.endsWith('/frontend/')) return 'offline';
        return '';
    }

    const visible = (el) => el && el.getClientRects().length > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
    function visibleSteps(key = pageKey()) {
        return (TOURS[key] || []).map(([selector, title, text]) => ({ selector, title, text, el: document.querySelector(selector) }))
            .filter(s => visible(s.el));
    }

    // ------------------------------------------------------------ tour UI
    let tour = null;
    function css() {
        if ($('#ilsGuideCss')) return;
        const link = document.createElement('link');
        link.id = 'ilsGuideCss'; link.rel = 'stylesheet'; link.href = '/frontend/css/guide.css?v=2';
        document.head.appendChild(link);
    }
    function end() {
        if (!tour) return;
        tour.box.remove(); tour.card.remove();
        document.removeEventListener('keydown', tour.keys);
        window.removeEventListener('resize', tour.place);
        tour = null;
        try { localStorage.setItem(`ils_guide_seen:${pageKey()}`, '1'); } catch (e) {}
    }
    function start(key = pageKey()) {
        end(); css();
        document.querySelector('.ils-guide-prompt')?.remove();
        const steps = visibleSteps(key);
        if (!steps.length) return;
        const box = document.createElement('div'); box.className = 'ils-guide-spot';
        const card = document.createElement('div'); card.className = 'ils-guide-card'; card.setAttribute('role', 'dialog');
        document.body.append(box, card);
        tour = { steps, i: 0, box, card };
        tour.place = () => show(tour.i, false);
        tour.keys = (e) => { if (e.key === 'Escape') end(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
        document.addEventListener('keydown', tour.keys);
        window.addEventListener('resize', tour.place);
        show(0, true);
    }
    function go(d) { if (!tour) return; const n = tour.i + d; if (n < 0) return; if (n >= tour.steps.length) { end(); return; } show(n, true); }
    function show(i, scroll) {
        tour.i = i;
        const s = tour.steps[i];
        if (scroll) s.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        const r = s.el.getBoundingClientRect();
        const pad = 6;
        Object.assign(tour.box.style, { top: `${r.top - pad + scrollY}px`, left: `${r.left - pad + scrollX}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        tour.card.innerHTML = `<div class="ils-guide-count">${i + 1} / ${tour.steps.length}</div><h4></h4><p></p>`
            + '<div class="ils-guide-actions"><button type="button" data-g="skip">Skip tour</button><span></span>'
            + `<button type="button" data-g="back"${i ? '' : ' disabled'}>Back</button><button type="button" data-g="next" class="primary">${i === tour.steps.length - 1 ? 'Done' : 'Next'}</button></div>`;
        tour.card.querySelector('h4').textContent = s.title;
        tour.card.querySelector('p').textContent = s.text;
        tour.card.querySelector('[data-g="skip"]').onclick = end;
        tour.card.querySelector('[data-g="back"]').onclick = () => go(-1);
        tour.card.querySelector('[data-g="next"]').onclick = () => go(1);
        const cw = 340, ch = tour.card.offsetHeight || 170;
        let top = r.bottom + 14, left = Math.min(Math.max(12, r.left), innerWidth - cw - 12);
        if (top + ch > innerHeight - 8) top = r.top - ch - 14;
        if (top < 8) { top = Math.min(innerHeight - ch - 8, r.top + 14); left = Math.min(r.right + 14, innerWidth - cw - 12); }
        Object.assign(tour.card.style, { top: `${top + scrollY}px`, left: `${left + scrollX}px` });
        tour.card.querySelector('[data-g="next"]').focus({ preventScroll: true });
    }

    // ------------------------------------------------------------ floating buttons (6.10.0)
    // "?" (this page's tour) and "Next" (the next page of the workflow) sit at the bottom right of every page.
    // Workflow: Run Plan → Analysis (Offline → Online) → Calculation table → Plots; General_MB adds ZMB and Mass Balance.
    function workflow() {
        const steps = [
            { key: 'run_plan', label: 'Run Plan', href: '/frontend/run_plan.html' },
            { key: 'offline', label: 'Offline Analysis', href: '/frontend/index.html' },
            { key: 'online', label: 'Online Analysis', href: '/frontend/online_analysis.html' },
        ];
        if (isMB()) steps.push({ key: 'zmb', label: 'ZMB', href: '/frontend/zmb.html' });
        steps.push({ key: 'calculation', label: 'Calculation table', href: '/frontend/calculation_table.html' });
        if (isMB()) steps.push({ key: 'mass_balance', label: 'Mass Balance', href: '/frontend/mass_balance.html' });
        steps.push({ key: 'plots', label: 'Plots', href: '/frontend/plots.html' });
        return steps;
    }
    function nextStep(key = pageKey()) {
        const steps = workflow();
        const k = key === 'online_liquid' ? 'online' : key;
        if (k === 'runs') return { step: steps[0], index: -1, total: steps.length };
        const i = steps.findIndex(s => s.key === k);
        if (i < 0 || i === steps.length - 1) return null;
        return { step: steps[i + 1], index: i, total: steps.length };
    }
    function addButton() {
        if ($('#ilsGuideBtn') || !pageKey()) return;
        const dock = document.createElement('div');
        dock.className = 'ils-guide-dock';
        const next = nextStep();
        if (next) {
            const a = document.createElement('a');
            a.id = 'ilsNextBtn'; a.className = 'ils-next-btn'; a.href = next.step.href;
            const where = next.index < 0 ? 'Start' : `Step ${next.index + 1} of ${next.total} done`;
            a.title = `${where} · next: ${next.step.label}`;
            a.setAttribute('aria-label', `Next step: ${next.step.label}`);
            a.innerHTML = '<span class="ils-next-label">Next</span><span class="ils-next-page"></span><span aria-hidden="true">→</span>';
            a.querySelector('.ils-next-page').textContent = next.step.label;
            dock.appendChild(a);
        }
        const btn = document.createElement('button');
        btn.type = 'button'; btn.id = 'ilsGuideBtn'; btn.className = 'ils-guide-btn';
        btn.title = 'Step-by-step guide of this page'; btn.setAttribute('aria-label', 'Step-by-step guide of this page');
        btn.textContent = '?';
        btn.onclick = () => start();
        dock.appendChild(btn);
        document.body.appendChild(dock);
    }
    function firstVisitPrompt() {
        const key = pageKey();
        try { if (!key || localStorage.getItem(`ils_guide_seen:${key}`) || localStorage.getItem('ils_guide_off')) return; } catch (e) { return; }
        css();
        const el = document.createElement('div');
        el.className = 'ils-guide-prompt';
        el.innerHTML = '<b>New to this page?</b><span>Take the short step-by-step guide.</span>'
            + '<button type="button" class="primary" data-g="go">Start guide</button><button type="button" data-g="later">Not now</button>'
            + '<button type="button" data-g="off" title="Do not offer the guide again">Don\'t show again</button>';
        document.body.appendChild(el);
        el.querySelector('[data-g="go"]').onclick = () => start();
        el.querySelector('[data-g="later"]').onclick = () => { el.remove(); try { localStorage.setItem(`ils_guide_seen:${key}`, '1'); } catch (e) {} };
        el.querySelector('[data-g="off"]').onclick = () => { el.remove(); try { localStorage.setItem('ils_guide_off', '1'); } catch (e) {} };
    }

    window.ILSGuide = { start, end, visibleSteps, pageKey, workflow, nextStep, tours: TOURS };
    const init = () => { css(); addButton(); setTimeout(firstVisitPrompt, 1200); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
