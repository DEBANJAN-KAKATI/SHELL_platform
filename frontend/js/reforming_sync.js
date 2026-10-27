// SharePoint sync bar for Reforming mode (Offline Analysis = DHA files, Online Analysis =
// Operating Data). The SharePoint folder "Online DHA Results" is synced to this PC by
// OneDrive; /api/reforming/sync-source finds it and reports a signature of its files.
// "Sync now" points the page's own path box at the synced folder/file and clicks the page's
// own Process / Import button, so the normal processing code runs unchanged.
// With Auto-sync on, the page re-processes whenever the signature changes (checked on open
// and every few minutes). Does nothing in Isomerization mode.
(() => {
    if (!window.ILSProcess?.isReforming()) return;

    const PAGES = {
        offline: { input: '#folder', button: '#process', status: '#status', anchor: '#dataPanel', pathKey: 'dha_folder', sigKey: 'dha_signature', what: 'DHA files' },
        online: { input: '#onlineFile', button: '#onlineProcess', status: '#onlineStatus', anchor: '.online-source-row', pathKey: 'operating_file', sigKey: 'operating_signature', what: 'Operating Data' },
    };
    const page = document.getElementById('onlineFile') ? 'online' : (document.getElementById('folder') ? 'offline' : null);
    if (!page) return;
    const cfg = PAGES[page];
    const SYNC_KEY = 'ils_reforming_sync';          // sessionStorage: signature of the data now loaded on each page
    const AUTO_KEY = 'ils_reforming_autosync';      // localStorage: '0' = auto-sync off (default on)
    const POLL_MS = 5 * 60 * 1000;
    const $ = (s) => document.querySelector(s);

    let status = null;
    let busy = false;

    const css = `.rf-sync{padding:11px 15px;margin:-8px 0 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12px}
.rf-sync .rf-sync-info{flex:1;min-width:260px;color:var(--slate);line-height:1.5}.rf-sync b{color:var(--ink)}
.rf-sync .rf-sync-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#16a34a}
.rf-sync.stale .rf-sync-dot{background:var(--burnt)}.rf-sync.missing .rf-sync-dot{background:#8b2d22}
.rf-sync label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;font-weight:700}.rf-sync input[type=checkbox]{accent-color:var(--burnt)}
.rf-sync .btn{padding:7px 12px;font-size:12px}.rf-sync-folder{display:flex;gap:8px;width:100%}.rf-sync-folder[hidden]{display:none}`;
    document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

    function readSync() {
        try { return JSON.parse(sessionStorage.getItem(SYNC_KEY) || '{}') || {}; } catch (e) { return {}; }
    }
    function writeSync(signature) {
        const all = readSync();
        all[page] = { signature, path: status?.[cfg.pathKey] || '', synced_at: new Date().toISOString() };
        try { sessionStorage.setItem(SYNC_KEY, JSON.stringify(all)); } catch (e) {}
    }
    function autoOn() {
        try { return localStorage.getItem(AUTO_KEY) !== '0'; } catch (e) { return true; }
    }
    function hasRunNumber() {
        return !!(sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim();
    }
    function pageHasData() {
        try {
            if (page === 'offline') {
                const s = JSON.parse(sessionStorage.getItem('dhaDashboardState') || 'null');
                return !!(s && Array.isArray(s.r1) && s.r1.length && s.process === 'reforming');
            }
            const s = JSON.parse(sessionStorage.getItem('dhaOnlineState') || localStorage.getItem('dhaOnlineState') || 'null');
            return !!(s && Array.isArray(s.rows) && s.rows.length);
        } catch (e) { return false; }
    }
    function isStale() {
        if (!status?.found || !status[cfg.sigKey]) return false;
        const seen = readSync()[page];
        return !pageHasData() || !seen || seen.signature !== status[cfg.sigKey] || seen.path !== status[cfg.pathKey];
    }
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    const bar = document.createElement('div');
    bar.className = 'card rf-sync';
    bar.innerHTML = `<div class="rf-sync-info"><span class="rf-sync-dot"></span><span class="rf-sync-text">Checking the SharePoint folder…</span></div>
        <label title="Re-process automatically when new files arrive in the synced folder"><input type="checkbox" class="rf-sync-auto"> Auto-sync</label>
        <button class="btn secondary rf-sync-change" type="button">Change folder</button>
        <button class="btn primary rf-sync-now" type="button">Sync now</button>
        <div class="rf-sync-folder" hidden><input class="input rf-sync-path" placeholder="Path of the OneDrive-synced 'Online DHA Results' folder (blank = detect automatically)">
        <button class="btn primary rf-sync-save" type="button">Save</button></div>`;
    const anchor = $(cfg.anchor);
    if (!anchor) return;
    anchor.insertAdjacentElement('afterend', bar);
    const autoBox = bar.querySelector('.rf-sync-auto');
    autoBox.checked = autoOn();

    function render(note = '') {
        bar.classList.remove('stale', 'missing');
        const text = bar.querySelector('.rf-sync-text');
        if (!status) { text.textContent = 'Checking the SharePoint folder…'; return; }
        if (!status.found) {
            bar.classList.add('missing');
            text.innerHTML = `<b>SharePoint folder not synced.</b> ${esc(status.message || '')}`;
            bar.querySelector('.rf-sync-now').disabled = true;
            return;
        }
        bar.querySelector('.rf-sync-now').disabled = busy;
        const stale = isStale();
        if (stale) bar.classList.add('stale');
        const detail = page === 'offline'
            ? `<b>${status.dha_count}</b> DHA files · latest <b>${esc((status.dha_latest_file || '').split('.dat')[0])}</b>`
            : (status.operating_file ? `<b>${esc(status.operating_file.split(/[\\/]/).pop())}</b> · updated ${esc(status.operating_modified)}` : '<b>No operating .txt file in the folder</b>');
        const seen = readSync()[page];
        const state = busy ? 'Syncing…'
            : stale ? (pageHasData() ? 'New data available' : 'Not loaded yet')
            : `Up to date${seen?.synced_at ? ` (synced ${new Date(seen.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`;
        text.innerHTML = `<b>SharePoint sync · ${state}</b>${note ? ` — ${esc(note)}` : ''}<br>${detail}<br><span title="${esc(status.folder)}">${esc(status.folder)}</span>`;
    }

    async function refreshStatus() {
        try {
            const r = await fetch('/api/reforming/sync-source', { cache: 'no-store' });
            status = await r.json();
        } catch (e) {
            status = { found: false, message: 'Could not reach the platform server.' };
        }
        render();
        return status;
    }

    function waitForButton(button) {
        return new Promise((resolve) => {
            const started = Date.now();
            const tick = () => (!button.disabled || Date.now() - started > 10 * 60 * 1000) ? resolve() : setTimeout(tick, 400);
            setTimeout(tick, 400);
        });
    }

    async function syncNow(reason = '') {
        if (busy) return;
        await refreshStatus();
        if (!status?.found) return;
        const path = status[cfg.pathKey];
        if (!path) { render(`no ${cfg.what} in the folder`); return; }
        if (!hasRunNumber()) { render('enter the Run Number first'); return; }
        const input = $(cfg.input);
        const button = $(cfg.button);
        if (!input || !button || button.disabled) return;
        busy = true;
        render(reason);
        const signature = status[cfg.sigKey];
        input.value = path;
        button.click();
        await waitForButton(button);
        busy = false;
        const ok = /ready/i.test($(cfg.status)?.textContent || '') && pageHasData();
        if (ok) writeSync(signature);
        render(ok ? '' : 'processing failed, see the message above');
    }

    async function check(reason) {
        await refreshStatus();
        if (status?.found && autoOn() && isStale() && hasRunNumber()) await syncNow(reason);
    }

    bar.querySelector('.rf-sync-now').onclick = () => syncNow();
    autoBox.onchange = () => {
        try { localStorage.setItem(AUTO_KEY, autoBox.checked ? '1' : '0'); } catch (e) {}
        if (autoBox.checked) check('auto-sync on');
    };
    bar.querySelector('.rf-sync-change').onclick = () => {
        const row = bar.querySelector('.rf-sync-folder');
        row.hidden = !row.hidden;
        if (!row.hidden) bar.querySelector('.rf-sync-path').value = status?.configured_folder || status?.folder || '';
    };
    bar.querySelector('.rf-sync-save').onclick = async () => {
        try {
            const r = await fetch('/api/reforming/sync-source', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: bar.querySelector('.rf-sync-path').value }) });
            const d = await r.json();
            if (!r.ok) throw Error(d.error || 'Could not save the folder');
            status = d;
            bar.querySelector('.rf-sync-folder').hidden = true;
            render('folder saved');
            if (autoOn()) check();
        } catch (e) { render(e.message); }
    };

    // Point the path box at the synced folder once the page's own init has filled its default.
    window.addEventListener('load', () => setTimeout(async () => {
        await refreshStatus();
        const input = $(cfg.input);
        if (status?.found && input && status[cfg.pathKey]) input.value = status[cfg.pathKey];
        await check('new files found');
        setInterval(() => { if (!document.hidden) check('new files found'); }, POLL_MS);
    }, 600));
    document.addEventListener('ils:run-number', () => check());
})();
