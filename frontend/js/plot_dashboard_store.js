(() => {
    const key = 'ils_plot_dashboard_state';
    const capacity = 12;

    function load() {
        const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
        return {
            plots: Array.from({ length: capacity }, (_, index) => saved?.plots?.[index] || null),
            table: saved?.table || null
        };
    }

    function save(state) {
        try {
            sessionStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            throw new Error('Dashboard could not be saved. Browser storage may be full. Delete a plot and try again.');
        }
    }

    function addPlot(plot, replacement = null) {
        const state = load();
        const empty = state.plots.findIndex(item => !item);
        const index = empty >= 0 ? empty : replacement;
        if (index === null) return { full: true, state };
        if (!Number.isInteger(index) || index < 0 || index >= capacity) throw new Error('Choose a valid dashboard slot.');
        state.plots[index] = plot;
        save(state);
        return { full: false, index };
    }

    function removePlot(index) {
        const state = load();
        state.plots[index] = null;
        save(state);
    }

    function setTable(table) {
        const state = load();
        state.table = table;
        save(state);
    }

    function clear() {
        sessionStorage.removeItem(key);
    }

    window.ILSPlotDashboardStore = { load, addPlot, removePlot, setTable, clear, capacity };
})();