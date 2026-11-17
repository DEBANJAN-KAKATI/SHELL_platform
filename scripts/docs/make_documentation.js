const fs = require('fs');
const toc=require('./toc.json');
const { Tab, TabStopType, TabStopPosition, Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
  HeadingLevel, LevelFormat, Footer, Header, PageNumber, TableOfContents, PageBreak, BorderStyle } = require('docx');

const NAVY = '0E2841', GREY = '5A5A5A', YELLOW = 'FCCE07', LIGHT = 'F2F4F7';
const W = 9026; // A4 text width (1" margins)
const p = (text, o = {}) => new Paragraph({ spacing: { after: 120, line: 300 }, ...o, children: Array.isArray(text) ? text : [new TextRun(text)] });
const b = (t) => new TextRun({ text: t, bold: true });
const r = (t) => new TextRun(t);
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const bul = (t, lvl = 0) => new Paragraph({ numbering: { reference: 'bul', level: lvl }, spacing: { after: 80, line: 280 }, children: Array.isArray(t) ? t : [new TextRun(t)] });
const num = (t, ref = 'num') => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 80, line: 280 }, children: Array.isArray(t) ? t : [new TextRun(t)] });
const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CED6' };
const borders = { top: border, bottom: border, left: border, right: border };
function table(rows, widths) {
  const total = widths.reduce((a, c) => a + c, 0);
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths,
    rows: rows.map((row, i) => new TableRow({ tableHeader: i === 0, children: row.map((cell, j) => new TableCell({
      borders, width: { size: widths[j], type: WidthType.DXA },
      shading: i === 0 ? { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' } : (i % 2 === 0 ? { fill: LIGHT, type: ShadingType.CLEAR, color: 'auto' } : undefined),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: cell, bold: i === 0, color: i === 0 ? 'FFFFFF' : '222222', size: 19 })] })]
    })) })) });
}
const cap = (t) => new Paragraph({ keepNext: true, spacing: { before: 160, after: 80 }, children: [new TextRun({ text: t, bold: true, size: 19, color: GREY })] });
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });
const note = (t) => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [new TableCell({
  borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
  width: { size: W, type: WidthType.DXA }, shading: { fill: 'FFF8D6', type: ShadingType.CLEAR, color: 'auto' }, margins: { top: 120, bottom: 120, left: 160, right: 160 },
  children: [new Paragraph({ spacing: { after: 0, line: 280 }, children: [new TextRun({ text: t, size: 20 })] })] })] })] });

const c = [];
// ---------- title page
c.push(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'ILS DASHBOARD', bold: true, size: 56, color: NAVY })] }));
c.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'User and Technical Documentation', size: 36, color: NAVY })] }));
c.push(new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: 'Digital data integration and visualisation platform for HTE catalyst testing', size: 24, color: GREY })] }));
c.push(p([b('Version: '), r('6.9.11 (November 2026)')]));
c.push(p([b('Prepared by: '), r('Debanjan Kakati, Digitalization Intern (Practice School – II, BITS Pilani, Goa Campus)')]));
c.push(p([b('Mentor: '), r('Sankar Sasmal'), r('     '), b('Line manager: '), r('Shamayita Kanungo')]));
c.push(gap());
c.push(note('Confidentiality: this document describes how the platform works and how to use it. It intentionally contains no experimental data, run identifiers, catalyst names, feed or gas compositions, operating conditions or numerical results. Screens and examples are described in general terms only.'));
c.push(new Paragraph({ children: [new PageBreak()] }));
c.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Contents', bold: true, size: 32, color: NAVY })] }));
toc.forEach(([h, pg]) => { const sub = /^\d+\.\d/.test(h); c.push(new Paragraph({ spacing: { after: 70 }, indent: { left: sub ? 400 : 0 }, tabStops: [{ type: TabStopType.RIGHT, position: W, leader: 'dot' }], children: [new TextRun({ text: h, bold: !sub }), new TextRun({ children: [new Tab(), String(pg)] })] })); });
c.push(new Paragraph({ children: [new PageBreak()] }));

// ---------- 1
c.push(h1('1. Purpose and scope'));
c.push(p('The ILS Dashboard brings together the information of a multi-reactor catalyst testing unit — the run plan, offline hydrocarbon analysis reports, online gas analysis and process exports — and turns it into checked tables, calculations, plots and printable summaries. It replaces the manual collection and copying of data between spreadsheets.'));
c.push(p('This document has two parts: a user guide (Sections 3 to 9) for scientists and technicians who run the dashboard, the formula reference (Section 10) with every calculation as an equation, and a technical part (Sections 11 to 15) for the person who maintains or extends it.'));
c.push(h2('1.1 Who uses it'));
c.push(table([['Role', 'Typical tasks'],
  ['Scientist / project lead', 'Load the run plan, review analysis results, build plots and summaries, compare runs'],
  ['Technician', 'Import analysis files during a run, check data quality, save the run'],
  ['Maintainer', 'Install updates, add calculations or columns, keep the reference documentation current']], [2600, 6426]));

// ---------- 2
c.push(h1('2. System overview'));
c.push(p('The dashboard is a local web application. A small server written in Python (Flask framework, pandas for tables, openpyxl and xlrd for Excel files) runs on the lab computer, and the user works in a normal web browser. No database server, cloud service or extra licence is needed. All files stay on the lab computer or on the network folders the user selects.'));
c.push(cap('Table 1: Architecture'));
c.push(table([['Layer', 'What it does', 'Where'],
  ['Launcher', 'Finds or installs Python, installs the packages (also offline), starts the server and opens the browser', 'run_dashboard.bat, run_app.py'],
  ['Import services', 'Read the run plan, analysis reports and exports; standardise columns, timestamps and reactor numbers', 'backend/services, backend/loaders'],
  ['Calculation services', 'Base and yield tables, unit conversion, custom formulas, data integrity statistics', 'backend/services, backend/calculations'],
  ['Web pages', 'Run Plan, Analysis, Calculation, Data Integrity, Plots, Summary Dashboard, History', 'frontend/ (HTML, JavaScript, CSS)'],
  ['Storage', 'Working data in the browser tab; saved runs as compressed snapshots and as one database file per run', 'RunData/, Historian/']], [1900, 4526, 2600]));
c.push(gap());
c.push(p('The same template and pages are used for every experiment. A process tab on the Run Plan page (Isomerization, Reforming or General_MB) decides which process-specific tables and calculations are shown.'));

// ---------- 3
c.push(h1('3. Installation and start'));
c.push(h2('3.1 Starting the dashboard'));
c.push(num('Open the dashboard folder and double-click run_dashboard.bat.', 'n1'));
c.push(num('The launcher uses an existing Python environment if one works; otherwise it uses an installed Python, and only if none exists it downloads a private copy.', 'n1'));
c.push(num('Packages are installed only the first time or after the requirements change. If the network blocks downloads, place a "wheels" folder with the packages next to the launcher; installation then works offline.', 'n1'));
c.push(num('The browser opens the dashboard. The menu bar shows the version (for example v6.9.10) on the right.', 'n1'));
c.push(h2('3.2 Good to know'));
c.push(bul('If the default port is busy, the launcher uses the next free port and prints the address.'));
c.push(bul('If a dashboard from the same folder is already running, the launcher opens it instead of starting a second one. After an update, close the old dashboard window first.'));
c.push(bul('Use one browser tab for a run: working data is kept per tab. The ↻ button resets the tab and the Run Number.'));
c.push(bul('Every page has a "? Guide" button: it highlights the controls of the page one by one and explains them. The companion "Step-by-step picture guide" shows the same steps with screenshots for each process.'));
c.push(bul('Optional login for sharing on a network: set the DASHBOARD_USER and DASHBOARD_PASS environment variables before starting.'));

// ---------- 4
c.push(h1('4. Daily workflow'));
c.push(p('A run is worked through from left to right along the menu bar.'));
c.push(cap('Table 2: Workflow'));
c.push(table([['Step', 'Page', 'What to do'],
  ['1', 'Run Plan', 'Enter the Run Number, click the process tab, load the run-plan workbook and check Feed, Plan, DOE and Pre-run'],
  ['2', 'Analysis → Offline', 'Select the folder of hydrocarbon analysis reports and process it; optionally load the reactor valve-state map'],
  ['3', 'Analysis → Online (Gas)', 'Import the combined gas-analysis and process export; for General_MB choose the internal standard and units'],
  ['4', 'Analysis → ZMB (General_MB)', 'Import the blank-run export and enter the liquid pump check (verified liquid feed flow)'],
  ['5', 'Analysis → Online (Liquid, General_MB)', 'Enter the liquid samples: collection window, liquid product masses and carbon content'],
  ['6', 'Calculation', 'Isomerization: base, yield and custom tables. General_MB: Mass Balance page (reactor table and component table)'],
  ['7', 'Data Integrity', 'Review statistics and outlier flags per condition, reactor and parameter'],
  ['8', 'Plots / Summary Dashboard', 'Create plots by reactor and condition (General_MB: any component and value, carbon in → out, selectivity / yield bars); arrange up to twelve plots and one table on an A4 page'],
  ['9', 'Save', 'Save Run Details (snapshot) or Save to Historian (run database); reload or compare runs later from Runs and History']], [700, 2600, 5726]));

// ---------- 5
c.push(h1('5. Process tabs'));
c.push(p('The three tabs sit next to the Run Number on the Run Plan page. They are locked until a Run Number is entered. Switching the process clears the loaded run plan, so that a plan is never used under the wrong process. All other pages show the process as a read-only badge.'));
c.push(cap('Table 3: Processes'));
c.push(table([['Process', 'Use', 'What changes'],
  ['Isomerization', 'Default', 'Detailed hydrocarbon tables, octane values, base and yield tables, plots; Online Analysis in mole percent'],
  ['Reforming', 'Reforming runs', 'Carbon-number tables with unidentified peaks assigned by rule, reforming calculation tabs and export, optional sync from a shared folder'],
  ['General_MB', 'Mass balance runs', 'As Isomerization, plus the internal-standard gas flows, the liquid entry and the blank run on the Analysis pages (Section 7), the Mass Balance calculation page (Section 8) and mass balance plots']], [1900, 1700, 5426]));

// ---------- 6
c.push(h1('6. The run-plan template'));
c.push(p('One Excel template describes every experiment. The dashboard recognises it automatically; older run-plan files are still read with their fixed layout.'));
c.push(cap('Table 4: Template sheets'));
c.push(table([['Sheet', 'Content', 'Checks in the dashboard'],
  ['Plan', 'Run identification, objective, feed reference and the catalyst loading plan per reactor, including the role of each reactor (catalyst, inert, not used)', 'Active reactors counted from the roles'],
  ['DOE', 'Test conditions per reactor block and reactor: start and end, duration, temperature, pressure, space velocity and feed flows; the pre-run programme (Step 0)', 'Only filled conditions are shown; dates drive condition assignment and time on stream'],
  ['Feed', 'Four tables: feed properties, liquid composition, group-type summary and gas composition, plus gas feed settings', 'Totals checked to 100 %; empty rows hidden']], [1300, 4826, 2900]));
c.push(h2('6.1 Pre-run'));
c.push(p('The pre-run (for example drying, reduction and feed cut-in) is entered step by step in the DOE sheet: phase, gas, start and target temperature, ramp rate, hold time and pressure. The template calculates start and end times per block and draws a temperature and pressure profile. The Pre-run tab of the dashboard shows the same table and one chart per reactor block. The feed cut-in time becomes the start of time on stream.'));
c.push(h2('6.2 What the run plan must contain for a mass balance'));
c.push(bul('DOE conditions with condition number, block, reactor, start and end (or duration).'));
c.push(bul('The total gas flow of each reactor and condition, used when the online export has no flow columns.'));
c.push(bul('The feed cut-in time.'));
c.push(bul('The measured (not the target) gas feed composition, for comparison. The liquid analysis is not needed in the run plan; it comes later with the liquid product data.'));

// ---------- 7
c.push(h1('7. Online Analysis and the General_MB mass balance'));
c.push(p('The Online Analysis page imports the combined export of the gas chromatograph and the process control system. Each line is one gas analysis with its time, the reactor that was sampled and the process values at that moment. Reactors can also be assigned from the valve-state map (Reactor Map switch).'));
c.push(h2('7.1 Internal standard method'));
c.push(p('In General_MB the gas analysis is converted into flows with the internal standard method. A gas that does not react (argon or nitrogen) is part of the feed gas, so its flow to each reactor is known. Comparing every component with the internal standard in the same analysis gives the flow of that component.'));
c.push(cap('Table 5: Calculation steps (symbols: y = mole percent in the analysis, MW = molar mass, F = flow)'));
c.push(table([['Quantity', 'How it is obtained'],
  ['Feed gas composition', 'Average of the bypass (reactor 0) analysis lines inside each test condition: internal-standard mole percent and mole percent of all other gases'],
  ['Internal-standard mass fraction w_IS', 'y_IS·MW_IS / (y_IS·MW_IS + y_mix·MW_mix), with MW_mix from the bypass composition'],
  ['Internal-standard flow to reactor F_IS', 'Total gas feed × reactor share × w_IS when the export has the total feed; otherwise reactor gas volume ÷ molar volume × y_IS × MW_IS'],
  ['Mass flow of component i (g/h)', 'y_i·MW_i / (y_IS·MW_IS) × F_IS'],
  ['Volumetric flow (Nl/h)', 'Reactor gas volume × y_IS,feed / y_IS in the line, times y_i / 100'],
  ['Carbon flow (g C/h)', 'Carbon atoms of i × 12.011 / MW_i × mass flow of i']], [2900, 6126]));
c.push(gap());
c.push(h2('7.2 Using it'));
c.push(num('Choose General_MB on the Run Plan page and load the run plan.', 'n2'));
c.push(num('On Online Analysis import the export. The Internal Standard is "—", so the table is in mole percent.', 'n2'));
c.push(num('Choose Argon or N2. A side panel appears next to the table with the feed gas composition per condition and the average internal-standard flow per reactor.', 'n2'));
c.push(num('Choose the unit: mass, volumetric or carbon flow. Bypass lines are marked "BYPASS"; each reactor line shows its condition, status and flow source.', 'n2'));
c.push(num('The collapsed Conversion basis block at the bottom lists the formulas, the flow sources and the molar masses used.', 'n2'));
c.push(h2('7.3 Status messages'));
c.push(p('A line that cannot be calculated is never shown as zero. Its Status column says why:'));
c.push(table([['Message', 'Meaning and remedy'],
  ['no Run Plan DOE condition at this time', 'The run plan has no condition for that reactor and time: complete the DOE dates'],
  ['no bypass (reactor 0) line in condition …', 'The feed gas was not analysed during that condition'],
  ['no … peak – internal standard', 'The internal standard is missing in that analysis'],
  ['no gas feed to the reactor', 'The export shows zero flow (gas off) or neither export nor run plan has a flow'],
  ['no MW for …', 'A lumped peak without a defined molecule cannot be converted']], [3600, 5426]));

c.push(h2('7.4 Condition of every line'));
c.push(p('The Online table has a Condition column for every process. A line gets the condition number of the run-plan DOE window of its reactor that contains the line time (start to end, else start plus duration, else up to the next condition). Lines outside every window stay blank. Bypass lines show the condition of each reactor block when the blocks differ.'));
c.push(h2('7.5 Liquid tab (General_MB)'));
c.push(p('Online Analysis has two tabs in General_MB: Gas (the imported export) and Liquid. The liquid side of the mass balance is typed here, because it comes from the laboratory and not from an export.'));
c.push(table([['Input', 'Where and how often'],
  ['Carbon content of the liquid feed (wt%)', 'Once per run'],
  ['Sample collection started / finished', 'Per sample; one time for all reactors with "Apply times"'],
  ['Total liquid product mass (g)', 'Per reactor; with "Two phases seen" the hydrocarbon and aqueous phase masses instead'],
  ['Carbon content of the hydrocarbon product (wt%)', 'Per reactor, or one value for all'],
  ['Hydrogen, oxygen, nitrogen, sulfur, density, aromatics', 'Optional, in a collapsed table']], [3800, 5226]));
c.push(gap());
c.push(p('The tab calculates the duration, time on stream, decantation loss, the product flows over the sampling duration and the carbon in the liquid product and feed. The liquid feed flow is taken from the blank-run pump check, else from the run plan. Each reactor shows whether it is ready for the mass and the carbon balance, and a checklist names what is still missing. Entry is quick: one tab per sample, Enter moves to the next reactor, and a block copied from Excel can be pasted into any cell.'));
c.push(h2('7.6 Blank run (ZMB)'));
c.push(p('Analysis → ZMB imports the gas-analysis export of the blank run done before the experiment and shows it like the Online table. Its liquid pump check (one tab per repeat, collection times and collected mass per reactor) gives the verified liquid feed flow, which the mass balance uses.'));

// ---------- 8 mass balance
c.push(h1('8. Mass balance calculation (General_MB)'));
c.push(p('Calculation → Mass Balance is one page with two tables, in the same plain style as the other calculation tables. It works for any chemistry: no reaction, reactant or product is fixed in the program. The user chooses what to look at, and the defaults are taken from the data (the component whose carbon is consumed most is the default reference reactant).'));
c.push(h2('8.1 Reactor table'));
c.push(p('One row per liquid sample and reactor. A test condition without a liquid sample is shown as "gas only": its gas values are calculated, and the balances that need the liquid show an explicit error.'));
c.push(table([['Column group', 'Content'],
  ['Basis', 'Sample, condition, reactor, time on stream, number of gas analyses averaged'],
  ['Carbon', 'Carbon in the gas feed, liquid feed, gas product and liquid product; carbon balance; gas-phase carbon balance; share of the carbon found in the liquid'],
  ['Mass', 'Gas feed and gas product (without the internal standard), liquid feed, hydrocarbon and aqueous product; mass balance closure'],
  ['Reference', 'Conversion of the reference reactant(s)']], [2200, 6826]));
c.push(gap());
c.push(p('The gas analyses averaged for a sample are, by default, all calculated lines of that reactor in the condition except the first one after the change; the user can include all lines or only the lines within a chosen time around the liquid sample. The internal standard can be changed in the table header.'));
c.push(h2('8.2 Component table'));
c.push(p('Like the component filter of the offline analysis, the user picks which components to show, the reference reactant(s), the values and the basis. Components are grouped as reference, in the feed, formed, liquid (liquid feed in, hydrocarbon product out) and gas lumps by carbon number.'));
c.push(cap('Table 6: Values of the component table (basis carbon, mass or mole)'));
c.push(table([['Value', 'Definition'],
  ['In, Out, Net', 'Flow of the component into and out of the reactor, and their difference'],
  ['Conversion', '(in − out) / in × 100; only for a component that is consumed'],
  ['Selectivity', '(out − in) of the component / reference reactant(s) converted × 100'],
  ['Yield', '(out − in) of the component / reference reactant(s) fed × 100 (= conversion × selectivity)'],
  ['Yield wof%', 'Component out / total feed × 100, by mass, as in the isomerization yield table']], [2200, 6826]));
c.push(gap());
c.push(p('Selectivity and yield are net values, so a product that is already in the feed only counts what was formed. Hovering over a value shows its formula with the numbers used. Both tables can be exported to CSV and are saved with the run.'));
c.push(h2('8.3 Mass balance plots'));
c.push(p('On the Plots page, General_MB adds a row of choices: the data (per gas analysis, per sample, or the calculation tables), the chart, the component, the value, the basis and the reference reactant. The X–Y chart is the normal scatter plot with reactor colours, condition shapes, moving average and export, and X can be time on stream or any other value. Two bar charts show the carbon in and out per sample and reactor, and the selectivity or yield split over the chosen components.'));

// ---------- 9
c.push(h1('9. Calculations, quality checks and reporting'));
c.push(bul([b('Base table: '), r('time on stream from the feed cut-in, flows derived from the analysis, feed properties from the run plan.')]));
c.push(bul([b('Yield table: '), r('each analysis result is matched to the nearest process record within a fixed window (same reactor preferred); missing matches are shown as errors.')]));
c.push(bul([b('Custom table: '), r('Excel-like formulas on any column, evaluated by a restricted engine (no arbitrary code), with circular-reference detection and a cell inspector that shows every input.')]));
c.push(bul([b('Data Integrity: '), r('statistics and median-based outlier flags per run, condition, reactor and parameter; the data itself is never changed.')]));
c.push(bul([b('Plots: '), r('colours by reactor, marker shapes by condition, optional moving average, print-quality image export; mass balance values and charts in General_MB (Section 8.3).')]));
c.push(bul([b('Summary Dashboard: '), r('twelve plot slots and one table on an A4 page for printing or PDF.')]));
c.push(bul([b('Saving: '), r('Save Run Details writes a compressed snapshot; saving the same Run Number again offers cancel, replace or new version. Save to Historian writes one database file per run; History compares tables between runs.')]));

// ---------- Formula reference (inserted by build): every calculation of the dashboard, page by page
const { Math: OMath, MathRun, MathFraction, MathSubScript, MathSuperScript, MathSubSuperScript } = require('docx');
// token DSL: 'text' | ['f', num, den] fraction | ['s', base, sub] subscript | ['p', base, sup] superscript
function mtok(tok) {
  if (typeof tok === 'string') return [new MathRun(tok)];
  const [k, a, b] = tok;
  const arr = (x) => (Array.isArray(x) && typeof x[0] !== 'string' ? x : (Array.isArray(x) && ['f', 's', 'p'].includes(x[0]) ? [x] : (Array.isArray(x) ? x : [x])));
  const many = (x) => (typeof x === 'string' ? [new MathRun(x)] : (['f', 's', 'p'].includes(x[0]) ? mtok(x) : x.flatMap(mtok)));
  if (k === 'f') return [new MathFraction({ numerator: many(a), denominator: many(b) })];
  if (k === 's') return [new MathSubScript({ children: many(a), subScript: many(b) })];
  if (k === 'p') return [new MathSuperScript({ children: many(a), superScript: many(b) })];
  void arr; return [];
}
const S = (base, sub) => ['s', base, sub];
const F = (n, d) => ['f', n, d];
const eqn = (label, tokens, after = '') => new Paragraph({ spacing: { before: 60, after: 100 }, indent: { left: 360 },
  children: [new TextRun({ text: label ? `${label}   ` : '', size: 19, color: GREY }), new OMath({ children: tokens.flatMap(mtok) }),
             ...(after ? [new TextRun({ text: `   ${after}`, size: 19, color: GREY })] : [])] });
const steps = (list) => list.map(t => bul(t));
const sym = (rows) => table([['Symbol', 'Meaning', 'Where it comes from'], ...rows], [1500, 4526, 3000]);

c.push(h1('10. Formula reference'));
c.push(p('This chapter lists every value the dashboard calculates, page by page, as an equation with its symbols, where each input comes from, and how to get the result on the page. Flows are per hour; percentages are multiplied by 100. A value that cannot be calculated is shown as an explicit ERROR message, never as zero.'));
c.push(note('Common symbols: t = date and time of a record; Δt = duration in hours; y = mole percent in a gas analysis (ESTD value of the export); MW = molar mass (g/mol); n_C = number of carbon atoms; m or F = mass flow (g/h); V = volume flow (Nl/h); C = carbon flow (g C/h); IS = internal standard; r = reactor; i, j = components.'));

// 10.1 Run Plan
c.push(h2('10.1 Run Plan: flows, conditions and pre-run'));
c.push(p('The template calculates the planned flows from the flow-calculation basis on the Plan sheet; the dashboard reads the results. Conditions and the pre-run give the time windows used everywhere else.'));
c.push(eqn('(1) H2 flow', [S('V', 'H2'), ' = ', F([S('m', 'H2')], [S('M', 'H2')]), ' × ', S('V', 'm'), ',   ', S('V', 'm'), ' = 22.4 × ', F('293', '273'), ' L/mol']));
c.push(eqn('(2) Liquid feed, WHSV basis', [S('F', 'liq'), ' = WHSV × ', S('m', 'cat'), ' × ', S('f', 'corr')]));
c.push(eqn('(3) Liquid feed, LHSV basis', [S('F', 'liq'), ' = LHSV × ', S('V', 'cat'), ' × ', S('ρ', 'feed')]));
c.push(eqn('(4) Total gas, H2/HC basis', [S('V', 'gas'), ' = ', S('V', 'H2'), ' + ', S('V', 'N2,dil')]));
c.push(eqn('(5) Total gas, gas/oil basis', [S('V', 'gas'), ' = GoR × ', F([S('F', 'liq')], [S('ρ', 'feed')]), ' ÷ ', F([S('x', 'active')], '100')]));
c.push(eqn('(6) Condition end', [S('t', 'end'), ' = ', S('t', 'start'), ' + Duration'], 'used when the End date is empty; without a duration the condition ends at the next condition of the reactor'));
c.push(eqn('(7) Time on stream', ['TOS = ', F(['t − ', S('t', 'cut')], '1 h')]));
c.push(eqn('(8) Pre-run ramp', [S('Δt', 'ramp'), ' = ', F('ΔT', 'ramp rate'), ',   ', S('Δt', 'step'), ' = ', S('Δt', 'ramp'), ' + ', S('Δt', 'hold')], 'ΔT = absolute difference between target and start temperature'));
c.push(eqn('(9) Pre-run timeline', [S('h', 'start,k'), ' = ', S('Σ', 'm<k'), S('Δt', 'step,m'), ',   ', S('h', 'end,k'), ' = ', S('h', 'start,k'), ' + ', S('Δt', 'step,k')], 'm = earlier steps of the same block; dates = pre-run start + h / 24'));
c.push(sym([[ 'm_H2, M_H2', 'Hydrogen flow (g/h) and molar mass', 'DOE H2 flow; Plan flow basis'], ['m_cat, V_cat', 'Catalyst mass / volume of the reactor', 'Plan catalyst loading'],
  ['f_corr', 'WHSV correction factor', 'Plan flow basis'], ['ρ_feed', 'Liquid feed density', 'Feed sheet'], ['GoR, x_active', 'Gas/oil ratio and active gas fraction', 'DOE; Feed gas settings'],
  ['t_cut', 'Feed cut-in time', 'Plan → Feed Cut-In']]));
c.push(p('How to get it: fill the DOE and the Plan flow basis in Excel; the Check column says what is missing. Load the file on the Run Plan page; DOE shows the flows, Pre-run the timeline and charts. Feed tables must add up to 100 ± 0.5 %.'));

// 10.2 Offline / Isomerization calculation table
c.push(h2('10.2 Offline Analysis and Calculation table (Isomerization)'));
c.push(p('Offline Analysis reads the report values as they are (component tables and octane numbers). The Calculation table derives the reactor outlet and the yields from the online data and the feed properties of the run plan.'));
c.push(eqn('(10) Base TOS', [S('TOS', 'base'), ' = ', F(['t − ', S('t', 'first record')], '1 h')]));
c.push(eqn('(11) Naphtha in the analysis', [S('y', 'naphtha'), ' = 100 − (', S('y', 'H2'), ' + ', S('y', 'N2'), ')']));
c.push(eqn('(12) Hydrogen out', [S('H2', 'out'), ' = ', F([S('V', 'N2')], [S('y', 'N2'), '/100']), ' × ', F([S('y', 'H2')], '100'), ' × 0.0416 × 2']));
c.push(eqn('(13) Naphtha out', [S('N', 'out'), ' = ', F([S('V', 'N2')], [S('y', 'N2'), '/100']), ' × ', F([S('y', 'naphtha')], '100'), ' × 0.0416 × ', S('MW', 'feed')]));
c.push(eqn('(14) Carbon out and naphtha in', [S('C', 'out'), ' = ', S('N', 'out'), ' × ', F([S('w', 'C,feed')], '100'), ',   ', S('N', 'inlet'), ' = ', F([S('C', 'out')], [S('w', 'C,feed'), '/100'])]));
c.push(eqn('(15) Naphtha / H2', [F([S('y', 'naphtha'), ' × ', S('MW', 'feed')], [S('y', 'H2'), ' × 2'])]));
c.push(eqn('(16) Yield of component i (wof%)', [S('Y', 'i'), ' = ', S('w', 'i'), ' × ', F([S('N', 'out')], [S('N', 'inlet')])]));
c.push(eqn('(17) Lumps', ['C5⁺ = Total − Gas,   ', S('H2', 'consumption'), ' = Total − 100'], 'Gas = sum of the light-gas columns (C3 & below, butanes); Total = sum of the columns from C3 & below to n-octane'));
c.push(sym([['V_N2', 'Nitrogen (dilution) flow, Nl/h', 'Online export'], ['y_H2, y_N2', 'H2 and N2 mole percent of the analysis', 'Online export (ESTD)'],
  ['0.0416', 'mol per Nl (1 / 24.04)', 'constant'], ['MW_feed, w_C,feed', 'Feed molar mass and carbon wt%', 'Run Plan → Feed'], ['w_i', 'Component wt% of the DHA sample', 'Offline Table-2']]));
c.push(p('Matching for the yield: each DHA sample takes the base record of the same reactor closest in time within ±60 minutes (equal distance: the earlier one); no match gives an ERROR row. How to get it: process the DHA folder on Offline Analysis, import the online export, then open Calculation → Base table and Yield Table and press Sync if needed.'));

// 10.3 Online General_MB
c.push(h2('10.3 Online Analysis: internal-standard flows (General_MB)'));
c.push(eqn('(18) Feed gas composition of a condition', [S('y', 'j,feed'), ' = ', F('1', S('N', 'b')), ' Σ ', S('y', 'j,b')], 'b = bypass (reactor 0) lines inside the condition window'));
c.push(eqn('(19) Mixed-gas molar mass', [S('MW', 'mix'), ' = ', F(['Σ ', S('y', 'j,feed'), ' · ', S('MW', 'j')], ['Σ ', S('y', 'j,feed')]), ',   ', S('y', 'mix,feed'), ' = Σ ', S('y', 'j,feed')], 'j = every gas except the IS that has a molar mass'));
c.push(eqn('(20) IS mass fraction of the feed gas', [S('w', 'IS'), ' = ', F([S('y', 'IS,feed'), ' · ', S('MW', 'IS')], [S('y', 'IS,feed'), ' · ', S('MW', 'IS'), ' + ', S('y', 'mix,feed'), ' · ', S('MW', 'mix')])]));
c.push(eqn('(21) Gas feed to reactor r', [S('F', 'r'), ' = ', S('F', 'total'), ' × ', F([S('V', 'r')], ['Σ ', S('V', 'k')])]));
c.push(eqn('(22a) IS flow to reactor r', [S('F', 'IS,r'), ' = ', S('F', 'r'), ' × ', S('w', 'IS')], 'when the export has the total gas feed'));
c.push(eqn('(22b)', [S('F', 'IS,r'), ' = ', F([S('V', 'r')], [S('V', 'm')]), ' × ', F([S('y', 'IS,feed')], '100'), ' × ', S('MW', 'IS')], 'otherwise (volume route)'));
c.push(eqn('(23) Mass flow of component i', [S('m', 'i'), ' = ', F([S('y', 'i'), ' · ', S('MW', 'i')], [S('y', 'IS'), ' · ', S('MW', 'IS')]), ' × ', S('F', 'IS,r')]));
c.push(eqn('(24) Volume flow', [S('V', 'out'), ' = ', S('V', 'r'), ' × ', F([S('y', 'IS,feed')], [S('y', 'IS')]), ',   ', S('V', 'i'), ' = ', F([S('y', 'i')], '100'), ' × ', S('V', 'out')]));
c.push(eqn('(25) Carbon flow', [S('C', 'i'), ' = ', F(['12.011 × ', S('n', 'C,i')], [S('MW', 'i')]), ' × ', S('m', 'i')]));
c.push(sym([['y_i, y_IS', 'Mole percent of i and of the IS in the reactor line', 'Online export (ESTD)'], ['F_total', 'Total gas feed, g/h', 'Export (01i14FI01)'],
  ['V_r, V_k', 'Gas feed of reactor r and of every reactor, Nl/h', 'Export (01i14FIC0r), else Run Plan DOE total gas'], ['V_m', 'Molar volume 22.414 Nl/mol', 'constant'],
  ['MW_i, n_C,i', 'Molar mass and carbon atoms', 'Run Plan → Feed → Molecular weights']]));
c.push(p('How to get it: choose General_MB, import the export, choose Argon or N2 as Internal Standard (side panel: feed gas composition and IS flow per reactor), then choose the unit g/h, Nl/h or g C/h. The Condition column uses equation (6) for the reactor of the line.'));

// 10.4 Liquid tab and ZMB
c.push(h2('10.4 Liquid tab and ZMB pump check (General_MB)'));
c.push(eqn('(26) Sampling duration and TOS', [S('Δt', 's'), ' = ', S('t', 'finished'), ' − ', S('t', 'started'), ',   ', S('TOS', 's'), ' = ', F([S('t', 'started'), ' + ', S('t', 'finished')], '2'), ' − ', S('t', 'cut')]));
c.push(eqn('(27) Decantation loss', ['L = 100 − 100 × ', F([S('m', 'HC'), ' + ', S('m', 'aq')], [S('m', 'TLP')])]));
c.push(eqn('(28) Liquid product flows', [S('F', 'HC'), ' = ', F([S('m', 'TLP'), ' − ', S('m', 'aq')], [S('Δt', 's')]), ',   ', S('F', 'aq'), ' = ', F([S('m', 'aq')], [S('Δt', 's')])], 'one phase: aqueous mass = 0'));
c.push(eqn('(29) Carbon in the liquids', [S('C', 'liq,out'), ' = ', S('F', 'HC'), ' × ', F([S('c', 'HC')], '100'), ',   ', S('C', 'liq,feed'), ' = ', S('F', 'liq,feed'), ' × ', F([S('c', 'feed')], '100')]));
c.push(eqn('(30) ZMB repeat k', [S('F', 'k'), ' = ', F([S('m', 'k')], [S('t', 'end,k'), ' − ', S('t', 'start,k')]), ',   ', S('F', 'liq,feed'), ' = ', F('1', 'n'), ' Σ ', S('F', 'k')], 'verified liquid flow = average of the n repeats'));
c.push(sym([['m_TLP, m_HC, m_aq', 'Total liquid product, hydrocarbon and aqueous phase masses, g', 'Liquid tab (typed)'], ['c_HC, c_feed', 'Carbon wt% of the HC product and of the liquid feed', 'Liquid tab (typed)'],
  ['F_liq,feed', 'Liquid feed flow, g/h', 'ZMB pump check (30), else Run Plan DOE (2)/(3)'], ['m_k', 'Liquid collected in ZMB repeat k, g', 'ZMB page (typed)']]));
c.push(p('How to get it: on ZMB enter the start, end and mass of every repeat (verified flow appears on the right). On Online Analysis → Liquid enter the carbon wt% of the liquid feed once, then per sample the collection window, the TLP (or both phases) and the carbon wt%; the row shows the results and whether the reactor is ready for the mass and carbon balance.'));

// 10.5 Mass balance
c.push(h2('10.5 Mass Balance page (General_MB)'));
c.push(p('For each liquid sample and reactor, the gas values are first averaged over the chosen GC lines (N lines of the reactor in the condition; by default without the first line after the change).'));
c.push(eqn('(31) Average over the GC lines', [S('X', 'avg'), ' = ', F('1', 'N'), ' Σ ', S('X', 'l')], 'for every flow X; l = the N GC lines averaged'));
c.push(eqn('(32) Gas feed of component j', [S('F', 'j,feed'), ' = ', S('F', 'IS,r'), ' × ', F([S('y', 'j,feed'), ' · ', S('MW', 'j')], [S('y', 'IS,feed'), ' · ', S('MW', 'IS')])]));
c.push(eqn('(33) Gas feed and gas product without the IS', [S('G', 'feed'), ' = Σ ', S('F', 'j,feed'), ',   ', S('G', 'out'), ' = Σ ', S('m', 'i')], 'j, i = every component except the IS'));
c.push(eqn('(34) Mass balance closure', ['MB = ', F([S('G', 'out'), ' + ', S('F', 'HC'), ' + ', S('F', 'aq')], [S('G', 'feed'), ' + ', S('F', 'liq,feed')]), ' × 100']));
c.push(eqn('(35) Carbon in the gas', [S('C', 'gas,feed'), ' = Σ ', F(['12.011 ', S('n', 'C,j')], [S('MW', 'j')]), ' ', S('F', 'j,feed'), ',   ', S('C', 'gas,out'), ' = Σ ', S('C', 'i')]));
c.push(eqn('(36) Carbon balance', ['CB = ', F([S('C', 'gas,out'), ' + ', S('C', 'liq,out')], [S('C', 'gas,feed'), ' + ', S('C', 'liq,feed')]), ' × 100']));
c.push(eqn('(36b) Gas-phase carbon balance', [S('CB', 'gas'), ' = ', F([S('C', 'gas,out')], [S('C', 'gas,feed')]), ' × 100']));
c.push(eqn('(37) Carbon recovered in the liquid', [F([S('C', 'liq,out')], [S('C', 'gas,out'), ' + ', S('C', 'liq,out')]), ' × 100']));
c.push(p('Component table: every value uses one basis Q chosen by the user. Q is the carbon flow C (g C/h), the mass flow m (g/h) or the molar flow n (mmol/h); "feed" and "out" are the gas feed (32) and the product (23) of the same component. R is the set of reference reactant(s) chosen by the user.'));
c.push(eqn('(38) Basis', [S('n', 'i'), ' = ', F([S('m', 'i')], [S('MW', 'i')]), ' × 1000,   ', S('C', 'i'), ' = ', F(['12.011 ', S('n', 'C,i')], [S('MW', 'i')]), ' × ', S('m', 'i'), ',   Net = ', S('Q', 'out'), ' − ', S('Q', 'feed')]));
c.push(eqn('(39) Conversion', [S('X', 'i'), ' = ', F([S('Q', 'i,feed'), ' − ', S('Q', 'i,out')], [S('Q', 'i,feed')]), ' × 100'], 'shown only for a consumed component (out < feed)'));
c.push(eqn('(40) Selectivity', [S('S', 'i'), ' = ', F([S('Q', 'i,out'), ' − ', S('Q', 'i,feed')], [S('Σ', 'r'), '(', S('Q', 'r,feed'), ' − ', S('Q', 'r,out'), ')']), ' × 100'], 'r = the reference reactant(s)'));
c.push(eqn('(41) Yield', [S('Y', 'i'), ' = ', F([S('Q', 'i,out'), ' − ', S('Q', 'i,feed')], [S('Σ', 'r'), S('Q', 'r,feed')]), ' × 100 = ', F([S('X', 'ref'), ' · ', S('S', 'i')], '100')], 'X_ref = conversion of the reference reactant(s)'));
c.push(eqn('(42) Yield on feed (wof%)', [S('Y', 'wof,i'), ' = ', F([S('m', 'i,out')], [S('G', 'feed'), ' + ', S('F', 'liq,feed')]), ' × 100']));
c.push(eqn('(43) Lumps', [S('Q', 'Gas Cn'), ' = ', S('Σ', 'i: nC = n'), S('Q', 'i'), ',   ', S('Q', 'Gas Cn⁺'), ' = ', S('Σ', 'i: nC ≥ n'), S('Q', 'i')], '"Liquid hydrocarbons": feed = liquid feed, out = HC product'));
c.push(p('Default reference reactant: the component with the most negative net carbon over all calculated lines (consumed most). How to get it: open Calculation → Mass Balance; the reactor table shows (31)–(37) per sample and reactor; in the component table choose the components, the reference reactant(s), the values and the basis. Hover a value to see the numbers used.'));

// 10.6 Plots and Data Integrity
c.push(h2('10.6 Plots and Data Integrity'));
c.push(eqn('(44) Moving average', [S('y', 'avg,k'), ' = ', F('1', S('n', 'k')), ' ', S('Σ', 'j = k−h … k+h'), S('y', 'j'), ',   h = ', F('w − 1', '2')], 'window w = 3, 5 or 7 points; n_k = points inside the window (fewer at the ends)'));
c.push(p('Points are sorted by X; points with the same X are averaged first; the average is drawn per reactor and condition only when there are at least w distinct X values. Mass balance plots (General_MB) use equations (23)–(43) per GC line or per sample; the selectivity bar adds a grey "rest" segment = 100 − Σ S_i of the chosen components (yield: X_ref − Σ Y_i).'));
c.push(eqn('(45) Robust score (Data Integrity)', [S('z', 'j'), ' = ', F(['0.6745 × (', S('x', 'j'), ' − ', S('x', 'med'), ')'], 'MAD')], 'MAD = median of the absolute deviations from x_med'));
c.push(p('x_med is the median of the group (run, condition, reactor, parameter). A value is flagged as a potential outlier when |z| exceeds the chosen sensitivity (default 3.5); groups with fewer than 3 values or MAD = 0 are not scored. The data itself is never changed.'));

// ---------- 11
c.push(h1('11. Technical reference'));
c.push(cap('Table 7: Main code modules'));
c.push(table([['Path', 'Responsibility'],
  ['app.py', 'Creates the web application, registers the API blueprints, serves the pages'],
  ['backend/routes/api.py', 'API for settings, run number, file pickers, run plan, offline and online processing, calculations, export'],
  ['backend/services/run_plan_template.py', 'Reader of the universal run-plan template (feed tables, plan, DOE, pre-run profile)'],
  ['backend/services/online_analysis_service.py', 'Reader of the online export; reactor numbers, encodings, column fixes'],
  ['backend/services/online_units.py', 'Unit conversion and the internal-standard calculation of General_MB'],
  ['backend/services/mass_balance.py', 'Mass balance per sample and reactor: gas in and out of every component, liquid, balances'],
  ['frontend/js/mb_core.js', 'Shared mass balance engine of the Mass Balance and Plots pages (conversion, selectivity, yield, basis)'],
  ['frontend/js/online_liquid.js, zmb.js', 'Liquid tab of Online Analysis; blank-run import and pump check'],
  ['backend/services/calculation_table_service.py', 'Base table; yield table in backend/calculations'],
  ['backend/services/custom_table_service.py', 'Restricted formula engine of the custom table'],
  ['backend/reforming/', 'Self-contained reforming package (analysis rules, export, sync)'],
  ['features/data_integrity/', 'Removable plug-in for the Data Integrity page'],
  ['frontend/js/navigation.js', 'Menu bar, Run Number, process tabs and badge, reset'],
  ['tests/', 'Automated tests and test files']], [3900, 5126]));
c.push(h2('11.1 Conventions'));
c.push(bul('Working data lives in the browser tab (session storage). New stored items must be added to the lists used by Save Run Details and Save to Historian.'));
c.push(bul('Changed JavaScript or CSS files get a new version number in the page (for example ?v=11) so that browsers load the new file.'));
c.push(bul('Errors are written into the tables as explicit messages and are never replaced by zero.'));
c.push(bul('New process-specific behaviour is switched on through the process tabs (isReforming, isGeneralMB); Isomerization is the default.'));
c.push(bul('Every change is recorded in CHANGELOG.md, README.md and the platform reference ILS.md; earlier versions are kept for rollback.'));

// ---------- 10
c.push(h1('12. Testing and validation'));
c.push(bul('47 automated tests (pytest) cover the run-plan reader, the molecular weights, the online unit conversion, the internal-standard calculation, the condition assignment, the mass balance and the error cases. Run them with: python -m pytest -q tests.'));
c.push(bul('The mass and carbon flows reproduce the team\'s reference mass-balance workbook for the same analysis lines; the internal-standard mass fraction and flow of the workbook are reproduced from a bypass line.'));
c.push(bul('Before a release every page is opened in a browser and the main workflow is run with test files.'));

// ---------- 11
c.push(h1('13. Updating and maintenance'));
c.push(h2('13.1 Updating the main version'));
c.push(num('Close the running dashboard.', 'n3'));
c.push(num('Copy the dashboard folder to backups/<date>_<topic>/ (rollback = copy it back).', 'n3'));
c.push(num('Replace the files with the new version, start run_dashboard.bat and check the version in the menu bar.', 'n3'));
c.push(h2('13.2 Updating the offline copy'));
c.push(p('Offline copies are updated with update packages. Each package contains an update guide, a file checker (shows for every file whether it is original, already updated or changed locally), a patch and a folder with the ready-to-copy files. Copy the contents of the files folder into the dashboard folder, run the checker again, close the old dashboard and start it again.'));

// ---------- 12
c.push(h1('14. Troubleshooting'));
c.push(table([['Symptom', 'Cause and fix'],
  ['The page still shows the old version after an update', 'The old dashboard is still running, or the files were copied into the wrong folder. Close it, check the version shown by /api/health and in the menu bar, press Ctrl+F5'],
  ['No process tabs on the Run Plan page', 'An older version without process selection is running; check the version in the menu bar'],
  ['Process tabs greyed out', 'Enter the Run Number first'],
  ['Online units show only mol%', 'Process is not General_MB, or no internal standard is selected'],
  ['Many ERROR lines in Online Analysis', 'Read the Status column: usually the run plan lacks DOE dates or gas flows, or the export lines are bypass or gas-off lines'],
  ['Mass Balance shows "no liquid sample"', 'No liquid sample was entered for that condition: enter it on Online Analysis → Liquid'],
  ['Carbon balance missing, mass balance shown', 'The carbon content of the liquid feed or product is missing on the Liquid tab'],
  ['Selectivity and yield empty', 'No reference reactant is chosen, or the reference was not converted'],
  ['Package installation fails (403)', 'The network blocks downloads: install from a wheels folder prepared on another computer']], [3400, 5626]));

// ---------- 13
c.push(h1('15. Version history (summary)'));
c.push(table([['Version', 'Period', 'Main content'],
  ['1.x – 3.x', 'September 2026', 'Offline analysis tables, component filters, octane table, reactor map'],
  ['4.x', 'September 2026', 'Base and yield tables, custom formula table'],
  ['6.0', 'October 2026', 'Run workspace, Summary Dashboard, saved runs and history'],
  ['6.4', 'October 2026', 'Reforming process'],
  ['6.6 – 6.7', 'November 2026', 'Universal run-plan template, pre-run in the DOE, Pre-run tab'],
  ['6.8', 'November 2026', 'Online Analysis units (mass, volume, carbon flow)'],
  ['6.9', 'November 2026', 'Process tabs Isomerization / Reforming / General_MB; internal standard measured from the bypass'],
  ['6.9.1 – 6.9.4', 'November 2026', 'Molecular weights in the run plan; blank-run import and pump check; condition column'],
  ['6.9.5 – 6.9.10', 'November 2026', 'Liquid tab; Mass Balance page for any chemistry (reactor and component tables); mass balance plots'],
  ['6.9.11', 'November 2026', 'Step-by-step Guide on every page; picture guide']], [1500, 2000, 5526]));
c.push(h1('Glossary'));
c.push(table([['Term', 'Meaning'],
  ['Bypass line', 'Gas analysis of the feed gas taken around the reactors (reactor 0)'],
  ['Carbon balance', 'Carbon recovered in the gas and liquid products divided by the carbon fed, in %'],
  ['Conversion', 'Share of a fed component that reacted'],
  ['DHA', 'Detailed Hydrocarbon Analysis (offline gas chromatography of liquid samples)'],
  ['DOE', 'Design of Experiments: the planned test conditions'],
  ['GC', 'Gas chromatography'],
  ['HTE', 'High-Throughput Experimentation'],
  ['Internal standard (IS)', 'Non-reacting gas in the feed used as reference for flows'],
  ['Pre-run', 'Steps before the first test condition, e.g. drying, reduction, feed cut-in'],
  ['Reference reactant', 'Component(s) against which selectivity and yield are calculated'],
  ['Selectivity', 'Share of the converted reference reactant that formed a given product'],
  ['TLP', 'Total liquid product collected from a reactor'],
  ['TOS', 'Time on stream, counted from the feed cut-in'],
  ['Yield', 'Share of the fed reference reactant converted into a given product (conversion × selectivity)'],
  ['Yield wof%', 'Weight of a product per weight of total feed, in %'],
  ['ZMB', 'Blank run before the experiment, used for the liquid pump check']], [2600, 6426]));

const doc = new Document({
  creator: 'Debanjan Kakati', title: 'ILS Dashboard – User and Technical Documentation',
  styles: { default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', size: 30, bold: true, color: NAVY }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', size: 24, bold: true, color: NAVY }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true, outlineLevel: 1 } }] },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    ...['num', 'n1', 'n2', 'n3'].map(ref => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }))] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1300, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'ILS Dashboard · User and Technical Documentation · v6.9.11', size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GREY })] })] }) },
    children: c }]
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync('ILS_Dashboard_Documentation.docx', buf); console.log('ok'); });
