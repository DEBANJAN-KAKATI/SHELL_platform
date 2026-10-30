// Calculation table (Mass Balance process): R#_MB (all reactors by default, or one reactor with its GC reps),
// C-Balance and Summary. One table group at a time keeps the sheets readable.
(() => {
    const $ = sel => document.querySelector(sel);
    const GROUPS = [['results', 'Results'], ['composition', 'Composition (mol%)'], ['mass', 'Mass flows'], ['volumetric', 'Volumetric flows'], ['carbon', 'Carbon flows']];
    const ui = () => MB.load().ui;

    function status(text) { $('#calcStatus').textContent = text; }
    function error(text) { const el = $('#calcError'); el.textContent = text || ''; el.classList.toggle('show', !!text); }

    function kpis() {
        const rows = MB.result()?.summary?.rows || [];
        const withData = rows.filter(r => r.rep_count > 0);
        const range = key => {
            const v = withData.map(r => r[key]).filter(x => typeof x === 'number');
            return v.length ? `${Math.min(...v).toFixed(1)} – ${Math.max(...v).toFixed(1)}` : '—';
        };
        $('#calcKpis').innerHTML = [
            ['Reactors with GC data', withData.length ? withData.map(r => 'R' + r.reactor).join(' ') : '—'],
            ['Carbon balance [%]', range('carbon_balance')], ['Mass balance closure [%]', range('mass_balance')],
            ['Acetylene conversion [%]', range('acetylene_conversion')],
        ].map(([k, v]) => `<div class="kpi"><span>${MB.esc(k)}</span><b class="mb-kpi-small">${MB.esc(v)}</b></div>`).join('');
        const warnings = MB.last()?.warnings || [];
        $('#calcWarnings').hidden = !warnings.length;
        $('#calcWarnings').textContent = warnings.join(' ');
    }

    function seg(name, items, current, disabled = () => false) {
        return `<div class="mb-seg" role="group">${items.map(([k, label]) =>
            `<button type="button" data-${name}="${k}" class="${current === k ? 'active' : ''}"${disabled(k) ? ' disabled' : ''}>${MB.esc(label)}</button>`).join('')}</div>`;
    }

    function bar(tab) {
        const res = MB.result();
        const has = r => res?.reactors?.[r]?.rep_count > 0;
        const common = `<label class="mb-field">Sample<select class="input" id="calcSample">${MB.sampleOptions()}</select></label>`;
        const actions = `<span class="mb-spacer"></span><button class="btn secondary" id="calcRecalc" type="button">Recalculate</button>
            <button class="btn primary" id="calcExport" type="button">Export .xlsx</button>`;
        let middle = '';
        if (tab === 'mb') {
            middle = seg('reactor', [['all', 'All reactors'], ...MB.REACTORS.map(r => [r, 'R' + r])], ui().calcReactor || 'all', k => k !== 'all' && !has(k)) +
                seg('group', GROUPS, ui().calcGroup || 'results') +
                `<label class="mb-check"><input type="checkbox" id="calcZero"${ui().calcZero ? ' checked' : ''}> show zero rows</label>`;
        } else if (tab === 'c_balance') {
            middle = `<label class="mb-check"><input type="checkbox" id="calcHelpers"${ui().calcHelpers ? ' checked' : ''}> show the feed-gas carbon helpers</label>`;
        } else {
            middle = seg('byrep', [['main', 'Per reactor'], ['cbal_rep', "Gas-phase C'Bal by GC rep"], ['acet_rep', 'Acetylene conversion by GC rep']], ui().calcByRep || 'main');
        }
        $('#calcBar').innerHTML = common + middle + actions;
    }

    function render() {
        const tab = ui().calcTab || 'mb';
        document.querySelectorAll('#calcTabs .table-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        kpis(); bar(tab);
        const box = $('#calcView');
        const res = MB.result();
        if (!res) { box.innerHTML = '<div class="card mb-section"><div class="mb-section-empty">No mass balance yet: load the Run Plan workbook or import the exports (Analysis → Online Analysis and ZMB).</div></div>'; return; }
        const hideZero = !ui().calcZero;
        if (tab === 'mb') {
            const reactor = ui().calcReactor || 'all';
            const group = ui().calcGroup || 'results';
            const v = MB.view(reactor === 'all' ? 'mb_all' : 'r' + reactor);
            const sections = v.sections.filter(x => x.group === group);
            box.innerHTML = sections.map(x => MB.sectionHtml(x, { hideZero: hideZero && group !== 'results' })).join('');
        } else if (tab === 'c_balance') {
            const v = MB.view('c_balance');
            box.innerHTML = v.sections.filter(x => x.group === 'main' || ui().calcHelpers).map(x => MB.sectionHtml(x)).join('');
        } else {
            const v = MB.view('summary');
            box.innerHTML = v.sections.filter(x => x.group === (ui().calcByRep || 'main')).map(x => MB.sectionHtml(x)).join('');
        }
    }

    function bind() {
        $('#calcTabs').addEventListener('click', e => {
            const b = e.target.closest('.table-tab'); if (!b) return;
            ui().calcTab = b.dataset.tab; MB.save(); render();
        });
        $('#calcBar').addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.reactor) ui().calcReactor = b.dataset.reactor;
            if (b.dataset.group) ui().calcGroup = b.dataset.group;
            if (b.dataset.byrep) ui().calcByRep = b.dataset.byrep;
            if (b.id === 'calcRecalc') { status('Processing...'); return MB.calculate().catch(err => error(err.message)); }
            if (b.id === 'calcExport') {
                status('Exporting...');
                try { await MB.exportXlsx(); } catch (err) { error(err.message); }
                return status('Ready');
            }
            MB.save(); render();
        });
        $('#calcBar').addEventListener('change', e => {
            if (e.target.id === 'calcSample') { MB.load().active = Number(e.target.value); MB.save(); return render(); }
            if (e.target.id === 'calcZero') ui().calcZero = e.target.checked;
            if (e.target.id === 'calcHelpers') ui().calcHelpers = e.target.checked;
            MB.save(); render();
        });
        MB.bindContainer($('#calcView'));
        MB.onResult((data, err) => { if (err) { error(err.message); status('Ready'); return; } error(''); status('Ready'); render(); });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bind(); render();
        status('Processing...');
        MB.calculate().catch(e => { error(e.message); status('Ready'); });
    });
})();
