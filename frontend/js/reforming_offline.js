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
            const savedProcess = saved.process === 'reforming' ? 'reforming' : 'isomerization';
            const current = window.ILSProcess?.get() || 'isomerization';
            if (savedProcess !== current) {
                const error = document.getElementById('error');
                const label = { isomerization: 'Isomerization', reforming: 'Reforming' };
                if (error) {
                    error.textContent = `The tables below were processed as ${label[savedProcess]} but the Run Plan process is ${label[current]}. Click Process again to reload them.`;
                    error.classList.add('show');
                }
            }
        } catch (error) {}
    });

    return {
        active,
        processUrl: '/api/reforming/process',
        table3Columns: ['File Name', 'UID', 'DateTime', 'TOS(h)', 'Active Reactor', 'RON', 'Molecular Weight', 'Carbon', 'Hydrogen', 'Specific Gravity'],
        titles,
        store,
    };
})();
