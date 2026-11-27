// Offline Analysis in Reforming mode. Loaded before dashboard.js, which reads this
// object through a few gated hooks; in Isomerization mode `active` is false and
// dashboard.js behaves exactly as before.
window.ILSReformingOffline = (() => {
    const active = !!window.ILSProcess?.isReforming();
    const STORE_KEY = 'ils_reforming_offline';

    const titles = {
        table1: ['DHA DATA · TABLE-1', 'Carbon-number table (Unknowns by Carbon#)'],
        table2: ['DHA DATA · TABLE-2', 'Unknown peaks · Carbon# assignment'],
        table3: ['DHA DATA · TABLE-3', 'Properties table'],
    };

    function store(response) {
        if (!active) return;
        try {
            sessionStorage.setItem(STORE_KEY, JSON.stringify({
                process: 'reforming',
                columns: response.reforming_columns || [],
                rows: response.reforming_rows || [],
                source_directory: response.source_directory || '',
                processed_at: new Date().toISOString(),
            }));
        } catch (error) {}
    }

    if (active) {
        // Column titles stay visible while scrolling down the DHA tables (Table-1/2/3). dashboard.css makes only the
        // first header cell of the Properties table sticky (`.table3-table th:nth-child(n) {position: static}`, shared
        // with Isomerization, not changed); this id rule wins over it in Reforming mode only.
        document.head.insertAdjacentHTML('beforeend', '<style>#dataTable thead th{position:sticky!important;top:0;z-index:3}'
            + '#dataTable thead th:first-child{left:0;z-index:5}</style>');
        const tab2 = document.querySelector('.table-tab[data-table="table2"]');
        const tab3 = document.querySelector('.table-tab[data-table="table3"]');
        if (tab2) tab2.textContent = 'Table-2 · Unknown Peaks';
        if (tab3) tab3.textContent = 'Table-3 · Properties';
        const hero = document.querySelector('.hero h1');
        if (hero) hero.insertAdjacentHTML('beforeend', ' <span class="pill">Reforming</span>');
    }

    // Data kept from an earlier session may have been processed under the other process.
    document.addEventListener('DOMContentLoaded', () => {
        try {
            const saved = JSON.parse(sessionStorage.getItem('dhaDashboardState') || localStorage.getItem('dhaDashboardState') || 'null');
            if (!saved || !Array.isArray(saved.r1) || !saved.r1.length) return;
            // General_MB processes the offline DHA files as Isomerization: only Reforming differs.
            const savedProcess = saved.process === 'reforming' ? 'reforming' : 'isomerization';
            const current = window.ILSProcess?.isReforming() ? 'reforming' : 'isomerization';
            if (savedProcess !== current) {
                const error = document.getElementById('error');
                const label = { isomerization: 'Isomerization / General_MB', reforming: 'Reforming' };
                if (error) {
                    error.textContent = `The tables below were processed as ${label[savedProcess]} but the Run Plan process is ${label[current]}. Click Process again to reload them.`;
                    error.classList.add('show');
                }
            }
        } catch (error) {}
    });

    // Active Reactor of a sample (6.10.2, several reactors, catalyst and inert): the same assignment as the Calculation
    // page (reforming_reactors.js: the reactor of the sample's own GC line in the operating data), over the same sample
    // list (ils_reforming_offline), so both pages always agree. Feed / Bypass / ERROR text when there is no reactor.
    // dashboard.js is not changed: in Reforming mode its two lookups (onlineReactorAt, activeReactorAt) are replaced
    // once the page has loaded, and fall back to the originals for any time that is not a DHA sample.
    let memo = { sig: '', byDate: new Map() };
    function reactorAt(dateTime) {
        const RR = window.ILSReformingReactors;
        if (!active || !RR) return undefined;
        let offline = null;
        try { offline = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (error) {}
        const samples = offline?.rows || [];
        const lines = RR.lines();
        const sig = `${offline?.processed_at || ''}|${samples.length}|${lines ? lines.length : 'none'}|${RR.onlineSig ? RR.onlineSig() : ''}|${sessionStorage.getItem('runPlanDashboardState')?.length || 0}`;
        if (sig !== memo.sig) {
            const found = RR.assign(samples, sample => sample.DateTime);
            const byDate = new Map();
            samples.forEach((sample, index) => {
                const f = found[index];
                byDate.set(String(sample.DateTime), f.feed ? 'Feed' : f.bypass ? 'Bypass' : (f.reactor || f.error || ''));
            });
            memo = { sig, byDate };
        }
        return memo.byDate.get(String(dateTime));
    }
    if (active) {
        document.addEventListener('DOMContentLoaded', () => {
            if (typeof onlineReactorAt !== 'function' || typeof activeReactorAt !== 'function') return;
            const originalOnline = onlineReactorAt;
            const originalActive = activeReactorAt;
            window.onlineReactorAt = function (value) { const r = reactorAt(value); return r !== undefined ? r : originalOnline.apply(this, arguments); };
            window.activeReactorAt = function (value) { const r = reactorAt(value); return r !== undefined ? r : originalActive.apply(this, arguments); };
            if (typeof render === 'function') render();
            // Read the GC lines of the operating data once, then redraw the tables with the reactors
            window.ILSReformingReactors?.load().then(changed => { if (changed && typeof render === 'function') render(); });
        });
    }

    return {
        active,
        reactorAt,
        processUrl: '/api/reforming/process',
        table3Columns: ['File Name', 'UID', 'DateTime', 'TOS(h)', 'Active Reactor', 'RON', 'Molecular Weight', 'Carbon', 'Hydrogen', 'Specific Gravity'],
        titles,
        store,
    };
})();
