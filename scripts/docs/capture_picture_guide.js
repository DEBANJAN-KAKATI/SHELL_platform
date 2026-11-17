// Picture guide: walk through each process, mark the guide steps with numbers, blur all data, save PNG + steps JSON.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2]; const R = '/home/user/SHELL_platform'; const B = 'http://localhost:5078';
const RP_ISO = R + '/tests/fixtures/run_plan/RunPlan_Isomerisation_Rheinland.xlsx';
const RP_MB = R + '/tests/fixtures/run_plan/RunPlan_MassBalance_R08_filled.xlsx';
const RP_REF = process.argv[3];
const EXPORT_MB = R + '/tests/fixtures/online/Result_R08-Ci-S4-27-Oct-24_1_3.txt';
const EXPORT_ISO = R + '/tests/fixtures/online/R3-C2-S1_9-06-23.txt';
const BLUR = `tbody td, .kpi b, #runNumberDisplay, #runNumberInput, #processDisplay + x, #runPlanFile, #onlineFile, #zmbFile, #folder, #reactorFolder,
  #onlineSummary, #zmbSummary, .online-table thead th span, .mb-grp, .liq-feed-pill, .online-mb-card dl, .online-mb-cond-head, .online-mb-cond-window,
  canvas, #runMetadata, #liqFeedCarbon, #liqCutInNote, #liqAllCarbon, #onlineUnitsSummary, #onlineDateBadge, #zmbDateBadge, .mb-filter-menu label, .filter-menu label, #onlineFlowNote, #onlineUnitsBasis, #runPlanKpis b, #doeImportStatus, #plotMbComp, #plotMbRef, #plotYSelect, #plotXSelect, #kpiPlotX, #kpiPlotY, #plotChartTitle, #plotEyebrow, #plotLegend, #conditionLegend,
  #liqSampleTabs, #liqSampleName, #liqAllStart, #liqAllEnd, #zmbApplyStart, #zmbApplyEnd, .liq-check-miss, #mbCompSummary, #mbReactorSummary, #feedSummary, #doeSummary,
  #prerunTotals, #planObjectiveBanner p, .zmb-verified tbody, #calcFeedStrip .calc-feed-value, #savedRunSelect, .plot-dashboard-card img, #boardGrid img
  { filter: blur(5px) !important; }`;
const results = [];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { try { localStorage.setItem('ils_guide_off', '1'); } catch (e) {} });
  const wait = (ms) => page.waitForTimeout(ms);

  async function shot(id, process, title, intro, opts = {}) {
    await wait(opts.wait || 600);
    const data = await page.evaluate(({ BLUR, only, extra }) => {
      document.querySelectorAll('.ils-guide-prompt,.pg-mark').forEach(e => e.remove());
      if (!document.querySelector('#pgBlur')) { const st = document.createElement('style'); st.id = 'pgBlur'; st.textContent = BLUR; document.head.appendChild(st); }
      window.scrollTo(0, 0);
      let steps = window.ILSGuide.visibleSteps(window.ILSGuide.pageKey());
      if (only) steps = steps.filter(s => only.includes(s.selector));
      steps = steps.concat((extra || []).map(([selector, t, x]) => ({ selector, title: t, text: x, el: document.querySelector(selector) })).filter(s => s.el));
      const box = { top: 1e9, bottom: 0 };
      const out = steps.map((s, i) => {
        const r = s.el.getBoundingClientRect();
        const top = r.top + scrollY, left = r.left + scrollX;
        const ring = document.createElement('div'); ring.className = 'pg-mark';
        Object.assign(ring.style, { position: 'absolute', zIndex: 99990, top: `${top - 3}px`, left: `${left - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px`, border: '2.5px solid #c95512', borderRadius: '7px', pointerEvents: 'none' });
        const dot = document.createElement('div'); dot.className = 'pg-mark'; dot.textContent = i + 1;
        Object.assign(dot.style, { position: 'absolute', zIndex: 99991, top: `${Math.max(2, top - 13)}px`, left: `${Math.max(2, left - 13)}px`, width: '24px', height: '24px', borderRadius: '50%', background: '#c95512', color: '#fff',
          font: '700 13px Arial', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px #fff', pointerEvents: 'none' });
        document.body.append(ring, dot);
        box.top = Math.min(box.top, top - 20); box.bottom = Math.max(box.bottom, top + r.height + 20);
        return { n: i + 1, title: s.title, text: s.text };
      });
      return { steps: out, top: Math.max(0, box.top), bottom: Math.min(document.documentElement.scrollHeight, box.bottom), width: document.documentElement.scrollWidth };
    }, { BLUR, only: opts.only || null, extra: opts.extra || null });
    const top = opts.fromTop ? 0 : Math.max(0, Math.floor(data.top - 60));
    const bottom = Math.min(Math.ceil(data.bottom + 40), top + (opts.maxH || 1500));
    await page.screenshot({ path: `${OUT}/img/${id}.png`, fullPage: true, clip: { x: 0, y: top, width: 1440, height: Math.max(300, bottom - top) } });
    results.push({ id, process, title, intro, steps: data.steps });
    console.log(id, data.steps.length);
  }
  async function runPlan(processTab, file) {
    await page.goto(B + '/frontend/run_plan.html'); await wait(900);
    await page.fill('#runNumberInput', '1'); await page.dispatchEvent('#runNumberInput', 'input'); await wait(300);
    await page.click(`.process-tab[data-process="${processTab}"]`); await wait(1500); await page.waitForLoadState('load');
    await page.fill('#runPlanFile', file); await page.click('#runPlanProcess'); await wait(2400);
  }

  // ---------------- Getting started (common)
  await page.goto(B + '/'); await wait(1500);
  await shot('runs', 'start', 'Runs page', 'The dashboard opens here. Load a saved run or start a new one.', { fromTop: true });

  // ---------------- Isomerization
  await runPlan('isomerization', RP_ISO);
  await shot('iso_runplan', 'iso', 'Run Plan', 'Enter the Run Number, keep the Isomerization tab, load the Run Plan workbook and check its tabs.', { fromTop: true, maxH: 1300 });
  await page.click('#tabDoe'); await wait(500);
  await shot('iso_doe', 'iso', 'Run Plan → DOE', 'The test conditions; their start and end define the condition of every analysis.', { only: ['#tabDoe', '#doeReactorFilter'] });
  await page.goto(B + '/frontend/index.html'); await wait(1200);
  await shot('iso_offline', 'iso', 'Analysis → Offline', 'Process the folder of offline DHA reports; the tables fill below.', { fromTop: true, maxH: 1100 });
  await page.goto(B + '/frontend/online_analysis.html'); await wait(1000);
  await page.fill('#onlineFile', EXPORT_ISO); await page.click('#onlineProcess'); await wait(2500);
  await shot('iso_online', 'iso', 'Analysis → Online', 'Import the GC / process export; every line gets its reactor and condition.', { fromTop: true, maxH: 1200 });
  await page.goto(B + '/frontend/calculation_table.html'); await wait(1800);
  await shot('iso_calc', 'iso', 'Calculation → Calculation table', 'Base table and Yield table (wof%) are built from the online and offline data.', { fromTop: true, maxH: 1300 });
  await page.goto(B + '/frontend/custom_table.html'); await wait(1500);
  await shot('iso_custom', 'iso', 'Calculation → Custom table', 'Add your own columns with Excel-like formulas.', { fromTop: true, maxH: 1400 });
  await page.goto(B + '/data-integrity'); await wait(1800);
  await shot('iso_integrity', 'iso', 'Data Integrity', 'Statistics and potential outliers per condition, reactor and parameter.', { fromTop: true, maxH: 1400 });
  await page.goto(B + '/frontend/plots.html'); await wait(2500);
  await shot('iso_plots', 'iso', 'Plots', 'Choose X and Y, filter reactors and conditions, export or add to the Summary Dashboard.', { fromTop: true, maxH: 1700 });
  await page.click('#plotAddDashboard').catch(() => {}); await wait(1500);
  await page.goto(B + '/frontend/plot_dashboard.html'); await wait(1500);
  await shot('iso_dashboard', 'iso', 'Summary Dashboard', 'Twelve plot slots and one table on an A4 page.', { fromTop: true, maxH: 1100 });
  await page.goto(B + '/frontend/history.html'); await wait(1500);
  await shot('iso_history', 'iso', 'History', 'Open or compare runs saved with "Save to Historian".', { fromTop: true, maxH: 1100 });

  // ---------------- Reforming
  if (RP_REF) {
    await runPlan('reforming', RP_REF);
    await shot('ref_runplan', 'ref', 'Run Plan (Reforming)', 'Click the Reforming tab after the Run Number, then load the Run Plan.', { fromTop: true, maxH: 1100,
      only: ['#runNumberInput', '.process-tabs', '#runPlanFile', '#runPlanProcess', '#runPlanKpis', '#tabFeed', '#tabPlan', '#tabDoe', '#tabPrerun'] });
    await page.goto(B + '/frontend/index.html'); await wait(1200);
    await shot('ref_offline', 'ref', 'Analysis → Offline (Reforming)', 'Process the reforming DHA reports: Table-1 splits the unknown peaks by carbon number, Table-2 lists every unknown peak with the reason.', { fromTop: true, maxH: 1100 });
    await page.goto(B + '/frontend/calculation_table.html'); await wait(1500);
    await shot('ref_calc', 'ref', 'Calculation (Reforming)', 'The Reforming CARBON_TABULAR tab replaces the yield table; Export Complete joins the operating data.', { fromTop: true, maxH: 1100,
      only: ['#tabBaseTable', '#tabReformingCarbon', '#calcReactorFilter', '#calcExportCsv', '#calcFrom', '#calcSyncBtn'] });
  }

  // ---------------- General_MB
  await runPlan('general_mb', RP_MB);
  await shot('mb_runplan', 'mb', 'Run Plan (General_MB)', 'Click the General_MB tab, load the Run Plan with DOE conditions, gas flows, Feed Cut-In and molecular weights.', { fromTop: true, maxH: 1100,
    only: ['#runNumberInput', '.process-tabs', '#runPlanFile', '#runPlanProcess', '#runPlanKpis', '#tabFeed', '#tabPlan', '#tabDoe', '#tabPrerun'] });
  await page.goto(B + '/frontend/online_analysis.html'); await wait(1000);
  await page.fill('#onlineFile', EXPORT_MB); await page.click('#onlineProcess'); await wait(2500);
  await page.selectOption('#onlineInternalStandard', 'Argon'); await wait(1500);
  await page.selectOption('#onlineUnit', 'mass'); await wait(1800);
  await shot('mb_online', 'mb', 'Analysis → Online → Gas', 'Import the export, choose the internal standard and the unit; the side panel shows the feed gas per condition.', { fromTop: true, maxH: 1400 });
  await page.goto(B + '/frontend/zmb.html'); await wait(1000);
  await page.fill('#zmbFile', EXPORT_MB); await page.click('#zmbProcess'); await wait(2000);
  await page.fill('#zmbApplyStart', '2024-10-23T10:00'); await page.fill('#zmbApplyEnd', '2024-10-23T11:00'); await page.click('#zmbApplyTimes'); await wait(300);
  for (const [r, m] of [['R1', '0.50'], ['R5', '0.49'], ['R6', '0.51']]) await page.fill(`#zmbPumpBody tr[data-reactor="${r}"] input[data-field="mass"]`, m).catch(() => {});
  await shot('mb_zmb', 'mb', 'Analysis → ZMB', 'Import the blank-run export and enter the liquid pump check; the verified liquid flow is the liquid feed of the mass balance.', { fromTop: true, maxH: 1300 });
  await page.goto(B + '/frontend/online_analysis.html'); await wait(1500);
  await page.click('#onlineTabLiquid'); await wait(400);
  await page.fill('#liqFeedCarbon', '85'); await page.fill('#liqAllStart', '2024-10-24T20:00'); await page.fill('#liqAllEnd', '2024-10-24T20:06'); await page.click('#liqApplyTimes'); await wait(300);
  for (const [r, t] of [['R1', '0.048'], ['R5', '0.049'], ['R6', '0.047']]) { await page.fill(`#liqMainBody tr[data-reactor="${r}"] input[data-field="tlp"]`, t).catch(() => {}); await page.fill(`#liqMainBody tr[data-reactor="${r}"] input[data-field="c"]`, '85').catch(() => {}); }
  await wait(500);
  await shot('mb_liquid', 'mb', 'Analysis → Online → Liquid', 'Enter the liquid samples: one tab per sample, one row per reactor.', { fromTop: true, maxH: 1300 });
  await page.goto(B + '/frontend/mass_balance.html'); await wait(2800);
  await shot('mb_massbalance', 'mb', 'Calculation → Mass Balance', 'The reactor table gives the balances; the component table gives conversion, selectivity and yield of the components you choose.', { fromTop: true, maxH: 1400 });
  await page.click('#mbCompFilter .filter-button'); await wait(300);
  await shot('mb_components', 'mb', 'Component table: choosing components', 'The component list groups the reference, feed components, formed components, the liquid and carbon-number lumps.', { only: ['#mbCompFilter', '#mbRefFilter', '#mbMetricFilter', '#mbCompBasis'], maxH: 900 });
  await page.mouse.click(5, 600);
  await page.goto(B + '/frontend/plots.html'); await wait(3500);
  await shot('mb_plots', 'mb', 'Plots (General_MB)', 'The extra row plots any component and value per GC analysis or per sample, or the carbon and selectivity bar charts.', { fromTop: true, maxH: 1700 });
  await page.selectOption('#plotMbChart', 'carbon'); await wait(1500);
  await shot('mb_plots_bars', 'mb', 'Plots: carbon in → out', 'Bar chart per sample and reactor: carbon fed (left bar) and recovered (right bar).', { only: ['#plotMbControls', '#plotMbChart', '#plotAddDashboard', '#plotExportBtn'], extra: [['#canvasWrapper', 'Chart', 'Equal bars mean a closed carbon balance.']], maxH: 1500 });
  fs.writeFileSync(`${OUT}/steps.json`, JSON.stringify(results, null, 1));
  await browser.close();
})();
