// Run Plan page, Mass Balance process: tabs Plan / Liq / Gas (the Run_Plan, Liq and Gas sheets of the MassBal workbook).
(() => {
    const $ = sel => document.querySelector(sel);
    let tab = 'plan';

    function hideStandardRunPlan() {
        document.querySelectorAll('.run-plan-source-row, #runPlanKpis, .run-plan-panel, .table-tabs:not(.mb-tabs)')
            .forEach(el => { if (!el.closest('#mbRunPlan')) { el.hidden = true; el.style.display = 'none'; } });
        const hero = document.querySelector('.hero');
        if (hero) {
            hero.querySelector('h1').textContent = 'Mass balance run plan.';
            hero.querySelector('p').textContent = 'Plan, Liq and Gas of the mass balance. Load the Run Plan (Plan, DOE, Feed and Liq sheets) or a filled MassBal workbook, or type the blue cells; every change recalculates the run.';
        }
        $('#mbRunPlan').hidden = false;
    }

    function status(text) { const el = $('#runPlanStatus'); if (el) el.textContent = text; }
    function error(text) { const el = $('#runPlanError'); el.textContent = text || ''; el.classList.toggle('show', !!text); }

    function kpis() {
        const s = MB.load();
        const active = (s.common.run_plan.catalysts || []).filter(c => (c.beds || []).some(b => b.catalyst)).map(c => 'R' + c.reactor);
        const items = [
            ['Run start', s.common.run.start || '—'],
            ['Reactors with catalyst', active.length ? active.join(' ') : '—'],
            ['Samples', s.samples.map(x => x.name).join(', ')],
            ['Verified Ar / mixed gas', s.common.gas?.ar_mol != null ? `${s.common.gas.ar_mol} / ${s.common.gas.mix_mol ?? '—'} mol%` : '—'],
        ];
        $('#mbRpKpis').innerHTML = items.map(([k, v]) => `<div class="kpi"><span>${MB.esc(k)}</span><b class="mb-kpi-small">${MB.esc(v)}</b></div>`).join('');
    }

    function sampleBar() {
        const s = MB.load();
        const sample = s.samples[s.active] || s.samples[0];
        const workbookGc = Object.values(sample.gc || {}).some(reps => (reps || []).length);
        const res = MB.result();
        const used = res?.window?.['1'] ? res.window['1'].map(x => x || '—').join(' → ') : '—';
        $('#mbRpSampleBar').hidden = tab === 'plan';
        $('#mbRpSampleBar').innerHTML = `
            <label class="mb-field">Sample<select class="input" id="mbRpSample">${MB.sampleOptions()}</select></label>
            <label class="mb-field">Name<input class="input" id="mbRpSampleName" value="${MB.esc(sample.name)}"></label>
            <label class="mb-field">Window start<input class="input" id="mbRpWinStart" placeholder="previous sample / Run Start" value="${MB.esc(sample.window?.start || '')}"></label>
            <label class="mb-field">Window end<input class="input" id="mbRpWinEnd" placeholder="collection finished" value="${MB.esc(sample.window?.finish || '')}"></label>
            ${tab === 'gas' ? `<label class="mb-field">Feed flows from<select class="input" id="mbRpGasSource">
                <option value="txt"${sample.gas?.source !== 'manual' ? ' selected' : ''}>Online Analysis export</option>
                <option value="manual"${sample.gas?.source === 'manual' ? ' selected' : ''}>entered by hand</option></select></label>` : ''}
            ${workbookGc ? `<label class="mb-field">GC reps from<select class="input" id="mbRpGcSource">
                <option value="txt"${sample.gc_source !== 'workbook' ? ' selected' : ''}>Online Analysis export</option>
                <option value="workbook"${sample.gc_source === 'workbook' ? ' selected' : ''}>workbook R*_MB</option></select></label>` : ''}
            <span class="mb-window" title="Window of R1 used for GC reps and feed flows">Window used: ${MB.esc(used)}</span>
            <span class="mb-spacer"></span>
            <button class="btn secondary" id="mbRpAdd" type="button">Add sample</button>
            ${s.samples.length > 1 ? '<button class="btn secondary" id="mbRpRemove" type="button">Remove sample</button>' : ''}`;
    }

    function render() {
        document.querySelectorAll('#mbRpTabs .table-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        kpis(); sampleBar();
        const s = MB.load();
        const v = MB.view(tab);
        const box = $('#mbRpView');
        if (!v) {
            box.innerHTML = '<div class="card mb-section"><div class="mb-section-empty">Load a MassBal workbook or import the exports (Analysis → Online Analysis / ZMB) to start. The blue cells appear after the first calculation.</div></div>';
            if (!MB.last()) MB.calculate().catch(e => error(e.message));
            return;
        }
        const extra = !!s.ui.rpExtra;
        if (tab === 'plan') {
            const by = key => v.sections.find(x => x.key === key);
            box.innerHTML = `<div class="mb-grid-2">${MB.sectionHtml(by('run'))}${MB.sectionHtml(by('feed'))}</div>` +
                MB.sectionHtml(by('mixed_gas')) +
                `<div class="mb-grid-2">${MB.sectionHtml(by('catalysts'))}${MB.sectionHtml(by('conditions'))}</div>` +
                (by('doe') ? MB.sectionHtml(by('doe')) : '');
        } else {
            const main = v.sections.filter(x => !['analyses', 'contained'].includes(x.group));
            const more = v.sections.filter(x => ['analyses', 'contained'].includes(x.group));
            box.innerHTML = main.map(x => MB.sectionHtml(x)).join('') +
                `<label class="mb-check mb-more"><input type="checkbox" id="mbRpExtra"${extra ? ' checked' : ''}> ${tab === 'liq' ? 'Show the product analyses (C, H, O, N, S, density)' : 'Show the flows contained in the feed gas and the operating conditions'}</label>` +
                (extra ? more.map(x => MB.sectionHtml(x)).join('') : '');
        }
    }

    function bind() {
        $('#mbRpTabs').addEventListener('click', e => {
            const b = e.target.closest('.table-tab'); if (!b) return;
            tab = b.dataset.tab; MB.load().ui.rpTab = tab; MB.save(); render();
        });
        $('#mbRpBrowse').addEventListener('click', async () => {
            try { const p = await MB.browse('xlsx', $('#mbRpPath').value); if (p) $('#mbRpPath').value = p; } catch (e) { error(e.message); }
        });
        $('#mbRpLoad').addEventListener('click', async () => {
            const path = $('#mbRpPath').value.trim();
            if (!path) return error('Enter the path of the MassBal workbook first.');
            error(''); status('Loading...');
            try {
                const data = await MB.importWorkbook(path);
                $('#mbRpSummary').textContent = data.format === 'run_plan'
                    ? `${data.file} loaded: Plan, DOE, Feed and Liq (${data.samples.length} samples: ${data.samples.map(x => x.name).join(', ')}).`
                    : `${data.file} loaded: Run_Plan, Liq, Gas, ZMB liquid reps and sample ${data.samples[0]?.name || ''}.`;
                await MB.calculate();
            } catch (e) { error(e.message); }
            status('Ready');
        });
        const bar = $('#mbRpSampleBar');
        bar.addEventListener('change', e => {
            const s = MB.load();
            const sample = s.samples[s.active];
            const id = e.target.id;
            if (id === 'mbRpSample') { s.active = Number(e.target.value); MB.save(); return render(); }
            if (id === 'mbRpSampleName') sample.name = e.target.value.trim() || sample.name;
            if (id === 'mbRpWinStart') sample.window = { ...sample.window, start: e.target.value.trim() || null };
            if (id === 'mbRpWinEnd') sample.window = { ...sample.window, finish: e.target.value.trim() || null };
            if (id === 'mbRpGcSource') sample.gc_source = e.target.value;
            if (id === 'mbRpGasSource') {
                sample.gas = sample.gas || {};
                sample.gas.source = e.target.value;
                const flows = MB.result()?.gas_flows || {};          // start the hand-entered values from the export means
                if (e.target.value === 'manual') { sample.gas.fi01 = sample.gas.fi01 ?? flows.fi01; sample.gas.nml = { ...(flows.nml || {}), ...(sample.gas.nml || {}) }; }
            }
            MB.save(); MB.schedule(100);
        });
        bar.addEventListener('click', e => {
            if (e.target.id === 'mbRpAdd') { MB.addSample(); render(); MB.schedule(100); }
            if (e.target.id === 'mbRpRemove') { MB.removeSample(MB.load().active); render(); MB.schedule(100); }
        });
        $('#mbRpView').addEventListener('change', e => {
            if (e.target.id !== 'mbRpExtra') return;
            MB.load().ui.rpExtra = e.target.checked; MB.save(); render();
        });
        MB.bindContainer($('#mbRpView'));
        MB.onResult((data, err) => { if (err) { error(err.message); return; } error(''); render(); });
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (!window.ILSProcess?.isMassBalance?.()) return;
        hideStandardRunPlan();
        const s = MB.load();
        tab = s.ui.rpTab || 'plan';
        $('#mbRpPath').value = s.imports.wb_path || '';
        if (s.imports.wb_path) $('#mbRpSummary').textContent = `${s.imports.wb_path.split(/[\\/]/).pop()} loaded.`;
        bind(); render();
        MB.calculate().catch(e => error(e.message));
    });
})();
