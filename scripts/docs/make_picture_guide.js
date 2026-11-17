// Picture guide (step by step, per process) built from the captured screenshots and the guide texts.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel,
  LevelFormat, Footer, Header, PageNumber, PageBreak, BorderStyle } = require('docx');
const DIR = process.argv[2];
const shots = Object.fromEntries(JSON.parse(fs.readFileSync(`${DIR}/steps.json`)).map(s => [s.id, s]));
const NAVY = '0E2841', GREY = '5A5A5A', ORANGE = 'C95512';
const W = 9026;
const p = (t, o = {}) => new Paragraph({ spacing: { after: 120, line: 290 }, ...o, children: Array.isArray(t) ? t : [new TextRun(t)] });
const b = (t) => new TextRun({ text: t, bold: true });
const h1 = (t) => { firstInPart = true; return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] }); };
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const bul = (t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 70, line: 270 }, children: Array.isArray(t) ? t : [new TextRun(t)] });
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const note = (t, fill = 'FFF8D6') => new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W], rows: [new TableRow({ children: [new TableCell({
  borders: { top: none, bottom: none, left: none, right: none }, width: { size: W, type: WidthType.DXA }, shading: { fill, type: ShadingType.CLEAR, color: 'auto' },
  margins: { top: 110, bottom: 110, left: 160, right: 160 }, children: [new Paragraph({ spacing: { after: 0, line: 280 }, children: Array.isArray(t) ? t : [new TextRun({ text: t, size: 20 })] })] })] })] });
function pngSize(file) { const png = file.replace('/jpg/', '/img/').replace(/\.jpg$/, '.png'); const buf = fs.readFileSync(png); return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function image(id) {
  const file = `${DIR}/jpg/${id}.jpg`; const { w, h } = pngSize(file);
  const width = 600, height = Math.round(width * h / w);
  const scale = height > 760 ? 760 / height : 1;
  return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 80 }, keepNext: true,
    children: [new ImageRun({ type: 'jpg', data: fs.readFileSync(file), transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
      altText: { title: shots[id].title, description: shots[id].intro, name: id } })] });
}
// numbered legend in two columns: number badge + title + text
function legend(steps) {
  const cell = (s) => new TableCell({ borders: { top: none, bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E3E3E3' }, left: none, right: none },
    width: { size: W / 2, type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 60, right: 120 },
    children: s ? [new Paragraph({ spacing: { after: 0, line: 260 }, children: [
      new TextRun({ text: ` ${s.n} `, bold: true, color: 'FFFFFF', shading: { type: ShadingType.CLEAR, fill: ORANGE, color: 'auto' }, size: 18 }),
      new TextRun({ text: `  ${s.title.replace(/^\d+ · /, '')}`, bold: true, size: 19 }),
      new TextRun({ text: ` — ${s.text}`, size: 18, color: '333333' })] })] : [new Paragraph('')] });
  const rows = [];
  const half = Math.ceil(steps.length / 2);
  for (let i = 0; i < half; i++) rows.push(new TableRow({ cantSplit: true, children: [cell(steps[i]), cell(steps[i + half])] }));
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: [W / 2, W / 2], rows });
}
let stepNo = 0;
let firstInPart = true;
const c = [];
function step(id, whatToDo) {
  const s = shots[id]; if (!s) return;
  stepNo += 1;
  c.push(new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: !firstInPart, children: [new TextRun(`Step ${stepNo} · ${s.title}`)] }));
  firstInPart = false;
  c.push(p(s.intro));
  if (whatToDo) c.push(note([new TextRun({ text: 'Do: ', bold: true, size: 20 }), new TextRun({ text: whatToDo, size: 20 })], 'EEF3F8'));
  c.push(image(id));
  c.push(legend(s.steps));
}

// ---------- title
c.push(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ text: 'ILS DASHBOARD', bold: true, size: 56, color: NAVY })] }));
c.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'Step-by-step picture guide', size: 36, color: NAVY })] }));
c.push(new Paragraph({ spacing: { after: 600 }, children: [new TextRun({ text: 'For first-time users: what every button does, process by process', size: 24, color: GREY })] }));
c.push(p([b('Version: '), new TextRun('6.9.11 (November 2026)')]));
c.push(p([b('Companion to: '), new TextRun('ILS Dashboard – User and Technical Documentation (formulas in its Section 10)')]));
c.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
c.push(note('Confidentiality: all data in the screenshots (run numbers, file names, values, component names, plots) is blurred on purpose. The pictures show where the controls are and what they do, not results.'));

// ---------- how to read
c.push(h1('How to use this guide'));
c.push(p('Each step shows one page of the dashboard. Orange numbered markers point at the controls; the numbered list under the picture says what each one does. Work through the steps of your process in order.'));
c.push(bul([b('Isomerization'), new TextRun(' – offline DHA reports, base and yield tables, plots (Part B).')]));
c.push(bul([b('Reforming'), new TextRun(' – reforming DHA reports and the reforming carbon table (Part C).')]));
c.push(bul([b('General_MB'), new TextRun(' – mass balance runs: gas flows, blank run, liquid samples, mass balance tables and plots (Part D).')]));
c.push(note([new TextRun({ text: 'In the dashboard itself: ', bold: true, size: 20 }), new TextRun({ text: 'every page has a "? Guide" button in the header. It highlights the same controls one by one with the same texts (Next / Back, Esc to close). On the first visit of a page a small box offers the guide; "Don\'t show again" switches the offer off.', size: 20 })], 'EEF3F8'));
c.push(p(''));
c.push(h2('Good to know before you start'));
c.push(bul('Use one browser tab for a run: the data you load stays in that tab while you move between pages.'));
c.push(bul('Start every run on the Run Plan page: type the Run Number, then choose the process tab. Other pages show the Run Number and process read-only.'));
c.push(bul('Save Run Details stores the tab so you can continue later from the Runs page; Save to Historian stores the run for comparison in History.'));
c.push(bul('Red ERROR texts in tables say exactly what is missing (for example a Run Plan date or a liquid sample); values are never replaced by zero.'));

// ---------- Part A
c.push(h1('Part A · Getting started'));
step('runs', 'Choose a saved run and click Load Run, or click Start Fresh for a new run.');

// ---------- Part B Isomerization
c.push(h1('Part B · Isomerization'));
step('iso_runplan', 'Type the Run Number, keep Isomerization, choose the Run Plan workbook with Browse and click Load Run Plan. Check the Feed, Plan, DOE and Pre-run tabs.');
step('iso_doe', 'Check that every condition has a start and an end (or a duration): all later pages use these windows.');
step('iso_offline', 'Choose the folder of DHA reports and click Process files. Use the tabs to see the three tables; optionally load the Reactor Map.');
step('iso_online', 'Choose the online export and click Import file. Check the Condition column and the record count.');
step('iso_calc', 'Open the Base table and the Yield table. Press Sync after importing new online data.');
step('iso_custom', 'Optional: add your own columns with formulas.');
step('iso_integrity', 'Optional: choose the data and click Analyze to see statistics and potential outliers.');
step('iso_plots', 'Choose X and Y, filter reactors and conditions, then Export PNG or Add to Dashboard.');
step('iso_dashboard', 'Arrange the plots you added, add one table, and Print / PDF.');
step('iso_history', 'After Save to Historian: open a run or compare two runs.');

// ---------- Part C Reforming
c.push(h1('Part C · Reforming'));
c.push(p('Reforming uses the same pages as Isomerization. The differences are shown here; Plots, Summary Dashboard, Data Integrity and History work as in Part B.'));
step('ref_runplan', 'Type the Run Number, click the Reforming tab, then load the Run Plan (Feed SL ID and Feed Cut-In identify the feed sample and the start of time on stream).');
step('ref_offline', 'Choose the reforming DHA folder and click Process files. Table-2 explains how every unknown peak got its carbon number.');
step('ref_calc', 'Open the Reforming CARBON_TABULAR tab; Export CSV or Export Complete (with the operating data).');

// ---------- Part D General_MB
c.push(h1('Part D · General_MB (mass balance)'));
c.push(p('A mass balance needs four inputs: the Run Plan, the online export (gas), the blank-run pump check (liquid feed) and the liquid samples. Then the Mass Balance page and the plots are calculated automatically.'));
step('mb_runplan', 'Type the Run Number, click the General_MB tab and load the Run Plan. It needs DOE conditions with dates, the gas flow per reactor, the Feed Cut-In and the molecular weights.');
step('mb_online', 'Import the export, choose Argon or N2 as Internal Standard, then choose a unit (g/h, Nl/h or g C/h). Read the Status column and the side panel.');
step('mb_zmb', 'Optional but recommended: import the blank-run export and enter the pump check (start, end and collected mass per reactor, one tab per repeat).');
step('mb_liquid', 'On the Liquid tab: carbon wt% of the liquid feed once; then per sample the collection window, TLP mass and carbon wt% per reactor. Wait until the checklist shows all reactors ready.');
step('mb_massbalance', 'Open Calculation → Mass Balance. Read the balances in the reactor table; in the component table choose components, reference reactant, values and basis.');
step('mb_components', 'Open the Components list to pick what to show; carbon-number lumps and the liquid can be chosen like any component.');
step('mb_plots', 'On Plots choose Data, Chart, Component and Value in the extra row; the rest of the page works as usual.');
step('mb_plots_bars', 'Choose the Carbon in → out chart (or Selectivity / yield by component) and add it to the Summary Dashboard.');

const doc = new Document({
  creator: 'ILS Dashboard', title: 'ILS Dashboard – Step-by-step picture guide',
  styles: { default: { document: { run: { font: 'Arial', size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 120, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Arial', size: 25, bold: true, color: NAVY }, paragraph: { spacing: { before: 320, after: 100 }, keepNext: true, outlineLevel: 1 } }] },
  numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1200, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'ILS Dashboard · Step-by-step picture guide · v6.9.11', size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GREY })] })] }) },
    children: c }]
});
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(`${DIR}/ILS_Dashboard_Picture_Guide.docx`, buf); console.log('ok', stepNo, 'steps'); });
