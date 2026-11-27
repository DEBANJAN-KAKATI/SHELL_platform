// Online Analysis, Reforming (6.12.0): operating data from several exports.
// The rig's server writes a new export (.txt) again and again, each covering an overlapping stretch of the run. Put them
// all in one folder (or the synced OneDrive folder): the path box takes the folder (or several .txt paths separated by
// ";"), "Import" merges every export on the server (/api/reforming/merge-operating: one line per operating record, the
// readable copy of duplicates, sorted by GC Date/Time) into one .txt under data/operating_merged/ and imports that file
// with the page's own import (the box then shows the merged file; the green panel names the folder). Importing again
// with that path, or the OneDrive sync, merges the folder again, so a new export is picked up. One .txt: as before.
// online_analysis.js is not changed: its Import handler is wrapped here, in Reforming mode only.
(() => {
    if (!window.ILSProcess?.isReforming?.()) return;
    const SOURCE_KEY = 'ils_reforming_operating_source';
    const $ = selector => document.querySelector(selector);
    const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const readSource = () => { try { return JSON.parse(sessionStorage.getItem(SOURCE_KEY) || localStorage.getItem(SOURCE_KEY) || 'null'); } catch (e) { return null; } };
    const writeSource = value => {
        const text = JSON.stringify(value);
        try { sessionStorage.setItem(SOURCE_KEY, text); localStorage.setItem(SOURCE_KEY, text); } catch (e) { }
    };
    const clearSource = () => { try { sessionStorage.removeItem(SOURCE_KEY); localStorage.removeItem(SOURCE_KEY); } catch (e) { } };
    const isSingleTxt = value => /\.txt"?$/i.test(value) && !value.includes(';');

    function renderReport() {
        const box = $('#rfMergeReport');
        if (!box) return;
        const saved = readSource();
        const r = saved?.report;
        if (!r) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false;
        const files = (r.files || []).map(f => `<tr><td>${esc(f.file)}</td><td>${esc(f.modified)}</td><td>${f.skipped ? '' : f.lines}</td>`
            + `<td>${f.skipped ? '' : esc(`${f.first} → ${f.last}`)}</td><td>${f.skipped ? '' : f.used}</td>`
            + `<td>${f.skipped ? esc(f.skipped) : (f.damaged_rows ? `${f.damaged_rows} line(s) with unreadable numbers (e.g. 18.501.102)` : '')}</td></tr>`).join('');
        const notes = [
            ...(r.gaps || []).map(g => `No export covers <b>${esc(g.from)} → ${esc(g.to)}</b> (${g.hours} h)`),
            ...(r.conflicts || []).map(c => esc(c)),
            ...(r.gc_only_kept?.length ? [`${r.gc_only_kept.length} GC result(s) without operating Date/Time kept for reference, not calculated (${esc(r.gc_only_kept.slice(0, 3).join(', '))}${r.gc_only_kept.length > 3 ? ' …' : ''})`] : []),
            ...(r.gc_only_same_injection?.length ? [`${r.gc_only_same_injection.length} GC-only row(s) left out: the same injection as an operating line (${esc(r.gc_only_same_injection.join(', '))})`] : []),
            ...(r.damaged_only?.length ? [`${r.damaged_only.length} line(s) exist only with an unreadable value in some column (e.g. ${esc(r.damaged_only[0])})`] : []),
        ];
        box.innerHTML = `<div><b>Operating data merged from ${r.files_used} of ${(r.files || []).length} file(s)</b> · ${r.lines} lines `
            + `(${esc(r.first)} → ${esc(r.last)}) · ${r.duplicates_removed} duplicate copies left out`
            + `${r.labels_copied ? ` · ${r.labels_copied} Sampled_reactor label(s) taken from another copy` : ''}`
            + ` · <span title="${esc(saved.merged)}">source: ${esc(saved.source)}</span></div>`
            + (notes.length ? `<ul>${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : '')
            + `<details><summary>Files (${(r.files || []).length})</summary><table class="rf-merge-files"><thead><tr><th>File</th><th>Modified</th>`
            + `<th>Lines</th><th>Period (GC)</th><th>Lines used</th><th>Note</th></tr></thead><tbody>${files}</tbody></table></details>`;
    }

    async function merge(source) {
        const response = await fetch('/api/reforming/merge-operating', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }),
        });
        let data;
        try { data = await response.json(); } catch (e) { throw new Error('The dashboard server is running older code. Restart run_dashboard.bat and retry.'); }
        if (!response.ok) throw new Error(data.error || 'Merging the operating exports failed.');
        return data;
    }

    document.addEventListener('DOMContentLoaded', () => {
        const input = $('#onlineFile');
        const button = $('#onlineProcess');
        if (!input || !button || typeof button.onclick !== 'function') return;
        input.placeholder = 'Folder with the operating exports (.txt) – all are merged – or one .txt file';
        input.title = 'A folder: every operating export (.txt) in it is merged (duplicates removed, sorted by GC Date/Time). '
            + 'Several files: separate the paths with ";". One .txt: imported as it is.';
        button.textContent = 'Import';
        $('#onlineBrowse')?.insertAdjacentHTML('afterend', '<button class="btn secondary" id="rfOperatingFolder" type="button" title="Choose the folder holding the operating exports (.txt)">Folder</button>');
        $('.online-source-row')?.insertAdjacentHTML('afterend', '<div class="rf-merge-report" id="rfMergeReport" hidden></div>');
        document.head.insertAdjacentHTML('beforeend', '<style>.rf-merge-report{margin:8px 0 12px;padding:8px 12px;border:1px solid #c9d8c5;border-left:4px solid #4f7d43;'
            + 'background:#f2f7ef;border-radius:6px;font-size:12.5px;color:#22381c}.rf-merge-report ul{margin:4px 0 0 18px;padding:0}'
            + '.rf-merge-report details{margin-top:4px}.rf-merge-files{border-collapse:collapse;margin-top:4px;font-size:12px}'
            + '.rf-merge-files th,.rf-merge-files td{padding:2px 8px;border-bottom:1px solid #dbe5d7;text-align:left;white-space:nowrap}</style>');

        // The box keeps the merged file (the page stores its path; the reactor calculation reads it); the panel names
        // the folder it came from, and Import with that path in the box merges the folder again.
        renderReport();

        $('#rfOperatingFolder').onclick = async () => {
            try {
                const response = await fetch('/api/reforming/browse-operating-folder', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initial_directory: input.value }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                if (data.path) input.value = data.path;
            } catch (error) {
                if (typeof onlineError === 'function') onlineError(error.message);
            }
        };

        const importOne = button.onclick;
        button.onclick = async function (event) {
            const value = input.value.trim();
            const stored = readSource();
            const source = !value ? '' : (stored?.merged && value === stored.merged) ? stored.source : isSingleTxt(value) ? '' : value;
            if (!source) {                          // one export: the page's own import, as before
                if (value) clearSource();
                renderReport();
                return importOne.call(this, event);
            }
            const status = $('#onlineStatus');
            if (typeof onlineError === 'function') onlineError();
            if (status) status.textContent = 'Merging exports...';
            button.disabled = true;
            let data;
            try {
                data = await merge(source);
            } catch (error) {
                if (typeof onlineError === 'function') onlineError(error.message);
                if (status) status.textContent = 'Failed';
                button.disabled = false;
                return undefined;
            }
            button.disabled = false;
            writeSource({ source, merged: data.path, report: data.report, merged_at: new Date().toISOString() });
            input.value = data.path;                // the page imports (and remembers) the merged file
            renderReport();
            return importOne.call(this, event);
        };
    });
})();
