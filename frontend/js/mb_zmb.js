// Analysis → ZMB (Mass Balance process): one table at a time — overview of all blocks, the GC block of one reactor,
// or one liquid collection rep — so the ZMB sheet is readable without scrolling through 9 GC blocks.
(() => {
    const $ = sel => document.querySelector(sel);
    const STREAMS = [['1', 'R1'], ['2', 'R2'], ['3', 'R3'], ['4', 'R4'], ['5', 'R5'], ['6', 'R6'], ['7', 'R7'], ['8', 'R8'], ['0', 'Bypass']];
    const SOURCES = [['1', 'Reactor-1 block (workbook)'], ...['2', '3', '4', '5', '6', '7', '8'].map(r => [r, `Reactor-${r} block`]),
        ['mean', 'Mean of the reactor blocks'], ['0', 'Bypass block']];

    function status(text) { $('#zmbStatus').textContent = text; }
    function error(text) { const el = $('#zmbError'); el.textContent = text || ''; el.classList.toggle('show', !!text); }
    const ui = () => MB.load().ui;

    function summaryHtml(s) {
        if (!s) return 'No ZMB export imported. GC blocks of a loaded MassBal workbook are shown when available.';
        const streams = Object.entries(s.streams || {}).map(([k, v]) => `${k === '0' ? 'Bypass' : 'R' + k}: ${v}`).join(' · ');
        return `<b>${MB.esc(s.file)}</b> · ${s.columns} columns · ${s.row_count} rows · injections ${MB.esc(streams)} · ` +
            `${MB.esc(s.first_gc || '')} → ${MB.esc(s.last_gc || '')}` + (s.warnings || []).map(w => `<div class="warn">${MB.esc(w)}</div>`).join('');
    }

    function kpis() {
        const res = MB.result(), last = MB.last();
        const z = res?.zmb;
        const blocks = z ? Object.values(z.gc).filter(b => b.count).length : 0;
        const verified = z ? Object.values(z.liquid).filter(l => l.verified !== null && l.verified !== undefined).length : 0;
        const ar = last?.zmb_suggestion;
        const s = MB.load();
        $('#zmbKpis').innerHTML = [
            ['GC blocks with data', blocks ? `${blocks} of 9` : '—'],
            ['Pumps verified', verified ? `${verified} of 8` : '—'],
            ['Measured Argon (ESTD mean)', typeof ar === 'number' ? ar.toFixed(3) + ' mol%' : '—'],
            ['Verified Ar entered (Gas!I35)', s.common.gas?.ar_mol != null ? s.common.gas.ar_mol + ' mol%' : '—'],
        ].map(([k, v]) => `<div class="kpi"><span>${MB.esc(k)}</span><b class="mb-kpi-small">${MB.esc(v)}</b></div>`).join('');
    }

    function bar(tab) {
        const s = MB.load();
        const ar = MB.last()?.zmb_suggestion;
        let html = '';
        if (tab === 'gc') {
            html = `<div class="mb-seg" role="group" aria-label="Reactor">${STREAMS.map(([k, label]) =>
                `<button type="button" class="${(ui().zmbStream || '1') === k ? 'active' : ''}" data-stream="${k}">${label}</button>`).join('')}</div>`;
        } else if (tab === 'liquid') {
            html = `<div class="mb-seg" role="group" aria-label="Rep">${['1', '2', '3'].map(k =>
                `<button type="button" class="${(ui().zmbRep || '1') === k ? 'active' : ''}" data-rep="${k}">Rep-${k}</button>`).join('')}</div>
                <span class="mb-window">Enter collection start, finish and the collected mass of each pump (blue cells).</span>`;
        } else {
            html = `<label class="mb-field">Mixed-gas composition from<select class="input" id="zmbMixSource">${SOURCES.map(([k, l]) =>
                `<option value="${k}"${String(s.options.mixed_gas_source || '1') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
                (typeof ar === 'number' ? `<button class="btn secondary" id="zmbUseAr" type="button">Use ${ar.toFixed(2)} / ${(100 - ar).toFixed(2)} as verified Ar / mixed gas</button>` : '');
        }
        $('#zmbBar').innerHTML = html;
    }

    function render() {
        const tab = ui().zmbTab || 'overview';
        document.querySelectorAll('#zmbTabs .table-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        kpis(); bar(tab);
        const box = $('#zmbView');
        if (tab === 'overview') {
            const v = MB.view('zmb_overview');
            box.innerHTML = v ? MB.sectionHtml(v.sections[0]) : empty();
        } else if (tab === 'gc') {
            const v = MB.view('zmb_gc');
            const sec = v?.sections.find(x => x.key === (ui().zmbStream || '1'));
            box.innerHTML = sec ? MB.sectionHtml(sec) : empty();
        } else {
            const v = MB.view('zmb_liquid');
            const rep = v?.sections.find(x => x.key === 'rep' + (ui().zmbRep || '1'));
            const verified = v?.sections.find(x => x.key === 'verified');
            box.innerHTML = v ? MB.sectionHtml(rep) + MB.sectionHtml(verified) : empty();
        }
    }
    function empty() { return '<div class="card mb-section"><div class="mb-section-empty">Import the ZMB export (or load a MassBal workbook on the Run Plan page).</div></div>'; }

    function bind() {
        $('#zmbTabs').addEventListener('click', e => {
            const b = e.target.closest('.table-tab'); if (!b) return;
            ui().zmbTab = b.dataset.tab; MB.save(); render();
        });
        $('#zmbBar').addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.stream) ui().zmbStream = b.dataset.stream;
            if (b.dataset.rep) ui().zmbRep = b.dataset.rep;
            if (b.id === 'zmbUseAr') {
                const ar = Number(MB.last().zmb_suggestion.toFixed(2));
                const s = MB.load(); s.common.gas = { ...(s.common.gas || {}), ar_mol: ar, mix_mol: Number((100 - ar).toFixed(2)) };
                MB.save(); MB.calculate().catch(err => error(err.message)); return;
            }
            MB.save(); render();
        });
        $('#zmbBar').addEventListener('change', e => {
            if (e.target.id !== 'zmbMixSource') return;
            MB.load().options.mixed_gas_source = e.target.value; MB.save(); MB.schedule(50);
        });
        $('#zmbBrowse').addEventListener('click', async () => {
            try { const p = await MB.browse('txt', $('#zmbPath').value); if (p) $('#zmbPath').value = p; } catch (e) { error(e.message); }
        });
        $('#zmbImport').addEventListener('click', async () => {
            const path = $('#zmbPath').value.trim();
            if (!path) return error('Enter the path of the ZMB export first.');
            error(''); status('Importing...');
            try {
                const summary = await MB.importTxt(path);
                if (summary.kind === 'run') summary.warnings = [...(summary.warnings || []), 'This file has feed-flow columns, so it looks like a run export (import it on Online Analysis).'];
                delete summary.preview;
                MB.setImport('zmb', summary);
                MB.load().imports.zmb_path = path; MB.save();
                $('#zmbSummary').innerHTML = summaryHtml(summary);
                await MB.calculate();
            } catch (e) { error(e.message); }
            status('Ready');
        });
        MB.bindContainer($('#zmbView'));
        MB.onResult((data, err) => { if (err) return error(err.message); error(''); status('Ready'); render(); });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const s = MB.load();
        $('#zmbPath').value = s.imports.zmb_path || '';
        $('#zmbSummary').innerHTML = summaryHtml(MB.imports().zmb);
        bind(); render();
        status('Processing...');
        MB.calculate().catch(e => { error(e.message); status('Ready'); });
    });
})();
