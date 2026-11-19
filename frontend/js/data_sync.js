// OneDrive / SharePoint sync bar (Reforming since 6.4; Isomerization and General_MB since 6.10.0).
// A SharePoint folder is synced to this PC by OneDrive; the server finds the files in it and reports a signature of
// each item. "Sync now" points the page's own path box at the synced file / folder and clicks the page's own
// Load / Process / Import button, so the normal processing code runs unchanged. With Auto-sync on, the page
// re-processes whenever the signature changes (checked on open and every few minutes).
//   Run Plan page → RunPlan*.xlsx · Offline Analysis → DHA .XLS folder · Online Analysis → GC / operating export (.txt)
//   ZMB (General_MB) → the blank-run export (.txt with "ZMB" or "blank" in its name)
// Reforming keeps its own folder (/api/reforming/sync-source, auto-detected "… Online DHA Results");
// Isomerization and General_MB each have one folder set with "Change folder" (/api/sync-source?process=…).
(() => {
    if (window.ILSDataSync) return;
    const process = window.ILSProcess?.get?.() || 'isomerization';
    const reforming = process === 'reforming';
    const API = reforming ? '/api/reforming/sync-source' : `/api/sync-source?process=${encodeURIComponent(process)}`;
    const readJson = (storage, key) => { try { return JSON.parse(storage.getItem(key) || 'null'); } catch (e) { return null; } };

    const PAGES = {
        run_plan: {
            input: '#runPlanFile', button: '#runPlanProcess', status: '#runPlanStatus', anchor: '#runPlanFile',
            pathKey: 'run_plan_file', sigKey: 'run_plan_signature', what: 'Run Plan', okText: /loaded|ready/i,
            hasData: () => { const s = readJson(sessionStorage, 'runPlanDashboardState'); return !!(s && (s.doeData?.rows?.length || s.feedRows?.length || s.planData?.rows?.length)); },
        },
        offline: {
            input: '#folder', button: '#process', status: '#status', anchor: '#dataPanel',
            pathKey: 'dha_folder', sigKey: 'dha_signature', what: 'DHA files', okText: /ready/i,
            hasData: () => {
                const s = readJson(sessionStorage, 'dhaDashboardState') || readJson(localStorage, 'dhaDashboardState');
                return !!(s && ((Array.isArray(s.r1) && s.r1.length) || (Array.isArray(s.r2) && s.r2.length)) && (s.process || 'isomerization') === process);
            },
        },
        online: {
            input: '#onlineFile', button: '#onlineProcess', status: '#onlineStatus', anchor: '.online-source-row',
            pathKey: reforming ? 'operating_file' : 'online_file', sigKey: reforming ? 'operating_signature' : 'online_signature',
            what: reforming ? 'Operating Data' : 'online export', okText: /ready/i,
            hasData: () => { const s = readJson(sessionStorage, 'dhaOnlineState') || readJson(localStorage, 'dhaOnlineState'); return !!(s && Array.isArray(s.rows) && s.rows.length); },
        },
        zmb: {
            input: '#zmbFile', button: '#zmbProcess', status: '#zmbStatus', anchor: '.online-source-row',
            pathKey: 'zmb_file', sigKey: 'zmb_signature', what: 'ZMB export', okText: /ready/i,
            hasData: () => { const s = readJson(sessionStorage, 'ils_zmb_state'); return !!(s && Array.isArray(s.rows) && s.rows.length); },
        },
    };
    const page = document.getElementById('runPlanFile') ? 'run_plan'
        : document.getElementById('zmbFile') ? 'zmb'
        : document.getElementById('onlineFile') ? 'online'
        : document.getElementById('folder') ? 'offline' : null;
    if (!page || (page === 'zmb' && reforming)) return;
    const cfg = PAGES[page];
    const SYNC_KEY = reforming ? 'ils_reforming_sync' : 'ils_data_sync';           // sessionStorage: signature loaded per page
    const AUTO_KEY = reforming ? 'ils_reforming_autosync' : 'ils_data_autosync';   // localStorage: '0' = auto-sync off
    const POLL_MS = 5 * 60 * 1000;
    const $ = (s) => document.querySelector(s);

    let status = null;
    let busy = false;

    const css = `.rf-sync{padding:11px 15px;margin:-8px 0 18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;font-size:12px}
.rf-sync .rf-sync-info{flex:1;min-width:260px;color:var(--slate);line-height:1.5}.rf-sync b{color:var(--ink)}
.rf-sync .rf-sync-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:#16a34a}
.rf-sync.stale .rf-sync-dot{background:var(--burnt)}.rf-sync.missing .rf-sync-dot{background:#8b2d22}
.rf-sync label{display:inline-flex;gap:6px;align-items:center;cursor:pointer;font-weight:700}.rf-sync input[type=checkbox]{accent-color:var(--burnt)}
.rf-sync .btn{padding:7px 12px;font-size:12px}.rf-sync-folder{display:flex;gap:8px;width:100%}.rf-sync-folder[hidden]{display:none}
.rf-sync-path-text{word-break:break-all}`;
    if (!document.getElementById('ilsDataSyncCss')) document.head.insertAdjacentHTML('beforeend', `<style id="ilsDataSyncCss">${css}</style>`);

    function readSync() {
        const all = readJson(sessionStorage, SYNC_KEY);
        return all && typeof all === 'object' ? all : {};
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
        try { return !!(sessionStorage.getItem('ils_run_number') || localStorage.getItem('ils_run_number') || '').trim(); } catch (e) { return false; }
    }
    function isStale() {
        if (!status?.found || !status[cfg.sigKey]) return false;
        const seen = readSync()[page];
        return !cfg.hasData() || !seen || seen.signature !== status[cfg.sigKey] || seen.path !== status[cfg.pathKey];
    }
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fileName = (path) => String(path || '').split(/[\\/]/).pop();

    const bar = document.createElement('div');
    bar.className = 'card rf-sync';
    bar.id = 'ilsDataSync';
    bar.innerHTML = `<div class="rf-sync-info"><span class="rf-sync-dot"></span><span class="rf-sync-text">Checking the synced OneDrive folder…</span></div>
        <label title="Re-load automatically when new files arrive in the synced folder"><input type="checkbox" class="rf-sync-auto"> Auto-sync</label>
        <button class="btn secondary rf-sync-change" type="button">Change folder</button>
        <button class="btn primary rf-sync-now" type="button">Sync now</button>
        <div class="rf-sync-folder" hidden><input class="input rf-sync-path" placeholder="${reforming
            ? "Path of the OneDrive-synced 'Online DHA Results' folder (blank = detect automatically)"
            : 'Path of the OneDrive-synced SharePoint folder of this run (DHA .XLS, online .txt export, RunPlan .xlsx)'}">
        <button class="btn primary rf-sync-save" type="button">Save</button></div>`;
    let anchor = $(cfg.anchor);
    if (!anchor) return;
    // Run Plan page: the bar goes under the card holding the file box
    if (page === 'run_plan') anchor = anchor.closest('.card') || anchor.parentElement;
    anchor.insertAdjacentElement('afterend', bar);
    const autoBox = bar.querySelector('.rf-sync-auto');
    autoBox.checked = autoOn();

    function detail() {
        if (page === 'offline') {
            return status.dha_count
                ? `<b>${status.dha_count}</b> DHA files · latest <b>${esc((status.dha_latest_file || '').split('.dat')[0])}</b>`
                : '<b>No DHA .XLS files in the folder</b>';
        }
        const path = status[cfg.pathKey];
        const modified = status[cfg.pathKey.replace(/_file$/, '_modified')];
        return path ? `<b>${esc(fileName(path))}</b>${modified ? ` · updated ${esc(modified)}` : ''}` : `<b>No ${esc(cfg.what)} in the folder</b>`;
    }

    function render(note = '') {
        bar.classList.remove('stale', 'missing');
        const text = bar.querySelector('.rf-sync-text');
        const now = bar.querySelector('.rf-sync-now');
        if (!status) { text.textContent = 'Checking the synced OneDrive folder…'; return; }
        if (!status.found) {
            bar.classList.add('missing');
            text.innerHTML = `<b>OneDrive folder not synced.</b> ${esc(status.message || '')}${note ? ` — ${esc(note)}` : ''}`;
            now.disabled = true;
            return;
        }
        now.disabled = busy || !status[cfg.pathKey];
        const stale = isStale();
        if (stale) bar.classList.add('stale');
        const seen = readSync()[page];
        const state = busy ? 'Syncing…'
            : !status[cfg.pathKey] ? 'Nothing to load'
            : stale ? (cfg.hasData() ? 'New data available' : 'Not loaded yet')
            : `Up to date${seen?.synced_at ? ` (synced ${new Date(seen.synced_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}`;
        text.innerHTML = `<b>OneDrive sync · ${state}</b>${note ? ` — ${esc(note)}` : ''}<br>${detail()}<br><span class="rf-sync-path-text" title="${esc(status.folder)}">${esc(status.folder)}</span>`;
    }

    async function refreshStatus() {
        try {
            const r = await fetch(API, { cache: 'no-store' });
            status = await r.json();
        } catch (e) {
            status = { found: false, message: 'Could not reach the platform server.' };
        }
        render();
        return status;
    }

    // The page's own handler sets its status pill to "…ing..." while it works; wait until it settles.
    function waitForPage(button) {
        const pill = $(cfg.status);
        const busyNow = () => button.disabled || /\.\.\.|…|loading|importing|processing|browsing/i.test(pill?.textContent || '');
        return new Promise((resolve) => {
            const started = Date.now();
            const tick = () => (!busyNow() || Date.now() - started > 10 * 60 * 1000) ? resolve() : setTimeout(tick, 400);
            setTimeout(tick, 500);
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
        input.dispatchEvent(new Event('input', { bubbles: true }));
        button.click();
        await waitForPage(button);
        busy = false;
        const ok = cfg.okText.test($(cfg.status)?.textContent || '') && cfg.hasData();
        if (ok) writeSync(signature);
        render(ok ? '' : 'loading failed, see the message above');
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
            const url = reforming ? API : '/api/sync-source';
            const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ process, folder: bar.querySelector('.rf-sync-path').value }) });
            const d = await r.json();
            if (!r.ok) throw Error(d.error || 'Could not save the folder');
            status = d;
            bar.querySelector('.rf-sync-folder').hidden = true;
            render('folder saved');
            if (autoOn()) check();
        } catch (e) { render(e.message); }
    };

    // Point the path box at the synced file / folder once the page's own init has filled its default.
    window.addEventListener('load', () => setTimeout(async () => {
        await refreshStatus();
        const input = $(cfg.input);
        if (status?.found && input && status[cfg.pathKey] && !cfg.hasData()) input.value = status[cfg.pathKey];
        await check('new files found');
        setInterval(() => { if (!document.hidden) check('new files found'); }, POLL_MS);
    }, 600));
    document.addEventListener('ils:run-number', () => check());
    window.ILSDataSync = { refreshStatus, syncNow, page, process };
})();
