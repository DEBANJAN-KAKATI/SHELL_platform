(() => {
    const store = window.ILSPlotDashboardStore;
    const sources = [
        ['ils_yield_table_state', 'Yield table'],
        ['ils_base_table_state', 'Base table'],
        ['ils_custom_table_state', 'Custom table'],
        ['ils_mb_summary_table', 'Mass Balance · Summary'],
        ['ils_mb_rep_table', 'Mass Balance · GC reps']
    ];

    function icon(name) {
        const placeholder = document.createElement('i');
        placeholder.dataset.lucide = name;
        placeholder.setAttribute('aria-hidden', 'true');
        return placeholder;
    }

    function icons() {
        window.lucide?.createIcons();
    }

    function status(text, error = false) {
        const element = document.querySelector('#boardStatus') || document.querySelector('#plotDashboardStatus');
        if (element) { element.textContent = text; element.dataset.error = String(error); }
    }

    function dialog(title, build, confirm = 'Continue') {
        return new Promise(resolve => {
            const element = document.createElement('dialog');
            element.className = 'board-dialog';
            const form = document.createElement('form');
            form.method = 'dialog';
            const heading = document.createElement('h2');
            heading.id = 'boardDialogTitle';
            heading.textContent = title;
            element.setAttribute('aria-labelledby', heading.id);
            form.append(heading);
            const read = build(form, element);
            const actions = document.createElement('div');
            actions.className = 'board-dialog-actions';
            const cancel = document.createElement('button');
            cancel.type = 'button'; cancel.className = 'board-button';
            cancel.textContent = confirm ? 'Cancel' : 'Close';
            cancel.onclick = () => element.close();
            actions.append(cancel);
            if (confirm) {
                const submit = document.createElement('button');
                submit.className = 'board-button board-primary';
                submit.type = 'submit'; submit.textContent = confirm;
                actions.append(submit);
            }
            form.append(actions); element.append(form); document.body.append(element);
            let result = null;
            form.onsubmit = event => {
                event.preventDefault();
                result = read();
                if (result !== null) element.close();
            };
            element.addEventListener('close', () => { element.remove(); resolve(result); }, { once: true });
            element.showModal();
        });
    }

    async function snapshot(chart) {
        chart.stop(); chart.update('none');
        const legend = [...document.querySelectorAll('#plotLegend .legend-chip:not(.dimmed), #conditionLegend:not([hidden]) .legend-chip')].map(chip => ({
            text: chip.textContent.trim(), svg: chip.querySelector('svg')?.outerHTML
        }));
        const width = 600;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = '14px sans-serif';
        let offset = 12;
        let line = 0;
        legend.forEach(item => {
            const length = Math.min(width - 24, context.measureText(item.text).width + 40);
            if (offset + length > width - 12 && offset > 12) { offset = 12; line++; }
            item.x = offset; item.line = line;
            offset += length;
        });
        const legendHeight = legend.length ? (line + 1) * 25 + 16 : 0;
        const height = Math.max(400, legendHeight + 220);
        const plotHeight = height - legendHeight;
        const plotCanvas = document.createElement('canvas');
        plotCanvas.width = width; plotCanvas.height = plotHeight;
        const options = chart.config.options;
        const scales = Object.fromEntries(Object.entries(options.scales || {}).map(([name, axis]) => [name, {
            ...axis,
            title: { ...axis.title, font: { ...axis.title?.font, size: 15 } },
            ticks: { ...axis.ticks, font: { ...axis.ticks?.font, size: 12 } }
        }]));
        const miniature = new window.Chart(plotCanvas, {
            type: chart.config.type,
            data: {
                ...chart.data,
                datasets: chart.data.datasets.map((dataset, index) => ({
                    ...dataset,
                    data: dataset.data.map(point => typeof point === 'object' && point !== null ? { ...point } : point),
                    hidden: !chart.isDatasetVisible(index)
                }))
            },
            options: {
                ...options, responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 2,
                layout: { padding: 6 }, scales,
                plugins: { ...options.plugins, legend: { display: false }, tooltip: { enabled: false } }
            }
        });
        const image = new Image();
        try { image.src = plotCanvas.toDataURL('image/png'); }
        finally { miniature.destroy(); }
        await image.decode();
        canvas.width = width * 2; canvas.height = height * 2;
        context.scale(2, 2);
        context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, plotHeight);
        context.font = '14px sans-serif'; context.fillStyle = '#344253';
        for (const item of legend) {
            const baseline = plotHeight + 22 + item.line * 25;
            if (item.svg) {
                const symbol = new Image();
                symbol.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item.svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
                await symbol.decode(); context.drawImage(symbol, item.x, baseline - 12, 15, 15);
            }
            context.fillText(item.text, item.x + 22, baseline, width - item.x - 24);
        }
        return { image: canvas.toDataURL('image/jpeg', 0.9), ratio: width / height };
    }

    function matrixPreview(plot) {
        const container = document.createElement('div'); container.className = 'board-matrix-preview';
        const table = document.createElement('table'); table.className = 'board-matrix-table';
        table.setAttribute('aria-label', plot.title);
        const reactors = Array.from({ length: 8 }, (_, index) => `R${index + 1}`);
        const heading = table.createTHead().insertRow();
        ['RSD %', ...reactors].forEach(label => {
            const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; heading.append(cell);
        });
        const body = table.createTBody();
        plot.matrix.rows.forEach(record => {
            const row = body.insertRow();
            const label = document.createElement('th'); label.scope = 'row'; label.textContent = record.reactor; row.append(label);
            reactors.forEach(reactor => {
                const value = record[reactor]; const cell = row.insertCell();
                cell.textContent = Number.isFinite(value) ? `${value.toFixed(1)}%` : '-';
                cell.dataset.warning = String(Number.isFinite(value) && value > 2);
                cell.title = Number.isFinite(value) ? `${record.reactor} / ${reactor}: ${value.toFixed(5)}%` : 'Missing reactor data or undefined RSD';
            });
        });
        container.append(table); return container;
    }

    async function addDashboardItem(plot) {
        let result = store.addPlot(plot);
        if (result.full) {
            const replacement = await dialog('Dashboard is full', form => {
                const label = document.createElement('label'); label.textContent = 'Replace dashboard item';
                const select = document.createElement('select'); select.id = 'boardReplacement';
                result.state.plots.forEach((item, index) => select.add(new Option(`${index + 1}. ${item.title}`, String(index))));
                const preview = document.createElement('div');
                const update = () => {
                    const item = result.state.plots[Number(select.value)];
                    if (item.kind === 'matrix') preview.replaceChildren(matrixPreview(item));
                    else { const image = document.createElement('img'); image.src = item.image; image.alt = item.title; preview.replaceChildren(image); }
                };
                select.onchange = update; update(); label.append(select); form.append(label, preview);
                return () => Number(select.value);
            }, 'Replace item');
            if (replacement === null) return;
            result = store.addPlot(plot, replacement);
        }
        status(`Added to dashboard slot ${result.index + 1} of 12.`);
        return result;
    }

    async function addMatrix({ title, run, rows }) {
        const button = document.querySelector('#integrityMatrixDashboard');
        if (button) button.disabled = true;
        try {
            if (!Array.isArray(rows) || rows.length !== 8) throw new Error('Generate an eight-reactor matrix before adding it to the dashboard.');
            return await addDashboardItem({
                kind: 'matrix', title, run: run || '', created_at: new Date().toISOString(),
                matrix: { rows: rows.map(row => ({ ...row })) }
            });
        } catch (error) { status(error.message, true); }
        finally { if (button) button.disabled = false; }
    }

    async function addChart(chart) {
        if (!chart || !chart.data.datasets.some((dataset, index) => chart.isDatasetVisible(index) && dataset.data.length)) {
            status('Generate a plot with visible data before adding it to the dashboard.', true);
            return;
        }
        const button = document.querySelector('#plotAddDashboard');
        if (button) button.disabled = true;
        try {
            const captured = await snapshot(chart);
            const plot = {
                title: document.querySelector('#plotChartTitle')?.textContent || 'Scatter plot',
                run: sessionStorage.getItem('ils_run_number') || '',
                created_at: new Date().toISOString(),
                image: captured.image,
                image_ratio: captured.ratio
            };
            await addDashboardItem(plot);
        } catch (error) { status(error.message, true); }
        finally { if (button) button.disabled = false; }
    }

    function previewPlot(plot) {
        dialog(plot.title, (form, element) => {
            element.classList.add('board-dialog-preview');
            if (plot.kind === 'matrix') {
                element.classList.add('board-dialog-matrix'); form.append(matrixPreview(plot));
            } else {
                const image = document.createElement('img'); image.src = plot.image; image.alt = plot.title; form.append(image);
            }
            return () => null;
        }, null);
    }

    function render() {
        const state = store.load();
        const grid = document.querySelector('#boardGrid'); grid.replaceChildren();
        state.plots.forEach((plot, index) => {
            const card = document.createElement('article'); card.className = 'board-slot'; card.dataset.empty = String(!plot);
            if (plot) card.dataset.kind = plot.kind || 'plot';
            card.setAttribute('aria-label', `Plot slot ${index + 1}`);
            if (!plot) {
                const link = document.createElement('a'); link.className = 'board-empty'; link.href = '/frontend/plots.html';
                link.append(icon('chart-no-axes-combined'));
                const label = document.createElement('span'); label.textContent = `Plot ${String(index + 1).padStart(2, '0')}`;
                link.append(label); card.append(link);
            } else {
                const head = document.createElement('div'); head.className = 'board-slot-head';
                const title = document.createElement('h2'); title.textContent = plot.title; title.title = plot.title;
                const remove = document.createElement('button'); remove.className = 'board-icon-button'; remove.type = 'button';
                remove.title = `Delete ${plot.kind === 'matrix' ? 'matrix' : 'plot'} ${index + 1}`; remove.setAttribute('aria-label', remove.title); remove.append(icon('trash-2'));
                remove.onclick = () => { try { store.removePlot(index); render(); status(`Plot ${index + 1} deleted.`); } catch (error) { status(error.message, true); } };
                head.append(title, remove);
                let preview;
                if (plot.kind === 'matrix') {
                    const enlarge = document.createElement('button'); enlarge.className = 'board-icon-button'; enlarge.type = 'button';
                    enlarge.title = 'Enlarge matrix'; enlarge.setAttribute('aria-label', `Enlarge ${plot.title}`); enlarge.append(icon('maximize-2'));
                    enlarge.onclick = () => previewPlot(plot); head.insertBefore(enlarge, remove);
                    preview = matrixPreview(plot);
                } else {
                    preview = document.createElement('button'); preview.className = 'board-preview'; preview.type = 'button';
                    if (plot.image_ratio) preview.style.aspectRatio = String(plot.image_ratio);
                    preview.title = 'Enlarge plot'; preview.setAttribute('aria-label', `Enlarge ${plot.title}`); preview.onclick = () => previewPlot(plot);
                    const image = document.createElement('img'); image.src = plot.image; image.alt = plot.title;
                    if (!plot.image_ratio) image.onload = () => { preview.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`; };
                    preview.append(image);
                }
                const meta = document.createElement('div'); meta.className = 'board-slot-meta';
                meta.textContent = `${plot.run ? `Run ${plot.run} / ` : ''}${new Date(plot.created_at).toLocaleString()}`;
                card.append(head, preview, meta);
            }
            grid.append(card);
        });
        document.querySelector('#boardCount').textContent = `${state.plots.filter(Boolean).length} / 12 slots`;
        document.querySelector('#boardRun').textContent = `Run ${sessionStorage.getItem('ils_run_number') || 'workspace'}`;
        document.querySelector('#boardReportDate').textContent = new Date().toLocaleDateString();
        renderTable(state.table); icons();
    }

    function renderTable(table) {
        const container = document.querySelector('#boardTable'); container.replaceChildren();
        document.querySelector('#boardTableSection').dataset.empty = String(!table);
        document.querySelector('#boardDeleteTable').hidden = !table;
        document.querySelector('#boardAddTable').lastChild.textContent = table ? 'Replace table' : 'Add table';
        document.querySelector('#boardTableHeading').textContent = table?.title || 'Summary table';
        const filters = table ? [table.filters?.reactor ? `Reactor ${table.filters.reactor}` : '', table.filters?.condition ? `Condition ${table.filters.condition}` : ''].filter(Boolean) : [];
        document.querySelector('#boardTableMeta').textContent = table ? `${table.rows.length} rows / ${table.columns.length} columns${filters.length ? ' / ' + filters.join(' / ') : ''} / ${new Date(table.created_at).toLocaleString()}` : '';
        if (!table) {
            const empty = document.createElement('div'); empty.className = 'board-table-empty'; empty.append(icon('table-2'), document.createTextNode('No table selected')); container.append(empty); return;
        }
        const element = document.createElement('table'); element.className = 'board-data-table';
        const head = element.createTHead().insertRow();
        table.columns.forEach(column => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = column; head.append(cell); });
        const body = element.createTBody();
        const dateColumn = table.columns.findIndex(column => ['DateTime', 'Date/Time', 'Date and Time', 'Start Date', 'End Date'].includes(column));
        const rows = dateColumn >= 0 ? sortDateTimeRows(table.rows, row => row[dateColumn]) : table.rows;
        rows.forEach(row => {
            const cells = body.insertRow();
            row.forEach(value => { const cell = cells.insertCell(); cell.textContent = value === null || value === undefined ? '-' : typeof value === 'number' ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value) : String(value); });
        });
        container.append(element);
    }

    async function addTable() {
        try {
            const available = sources.map(([key, title]) => {
                const data = JSON.parse(sessionStorage.getItem(key) || 'null');
                return { title, columns: data?.columns || [], rows: data?.rows || [] };
            }).filter(source => source.rows.length && source.columns.length);
            const runPlan = JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null');
            if (runPlan?.planData?.rows?.length) {
                const fields = ['parameter', 'units', ...Array.from({ length: 8 }, (_, index) => `r${index + 1}`)];
                available.push({
                    title: 'Plan table',
                    columns: ['Parameter', 'Units', ...Array.from({ length: 8 }, (_, index) => `R${index + 1}`)],
                    rows: runPlan.planData.rows.map(row => fields.map(field => row[field]))
                });
            }
            if (runPlan?.doeData?.rows?.length && runPlan.doeData.columns?.length) {
                available.push({ title: 'DOE table', columns: runPlan.doeData.columns, rows: runPlan.doeData.rows });
            }
            if (!available.length) { status('Load a Yield, Base, Custom, Plan, or DOE table before adding it to the dashboard.', true); return; }
            const table = await dialog(store.load().table ? 'Replace summary table' : 'Add summary table', form => {
                const label = document.createElement('label'); label.textContent = 'Table source';
                const select = document.createElement('select'); select.id = 'boardTableSource';
                available.forEach((source, index) => select.add(new Option(`${source.title} (${source.rows.length} rows)`, String(index))));
                label.append(select);
                const filters = document.createElement('div'); filters.className = 'board-table-filters';
                const reactorLabel = document.createElement('label'); reactorLabel.textContent = 'Reactor';
                const reactor = document.createElement('select'); reactor.id = 'boardTableReactor'; reactorLabel.append(reactor);
                const conditionLabel = document.createElement('label'); conditionLabel.textContent = 'Condition';
                const condition = document.createElement('select'); condition.id = 'boardTableCondition'; conditionLabel.append(condition);
                filters.append(reactorLabel, conditionLabel);
                const rowCount = document.createElement('p'); rowCount.setAttribute('role', 'status');
                const columns = document.createElement('fieldset'); columns.style.border = '0'; columns.style.padding = '0';
                const heading = document.createElement('legend'); heading.textContent = 'Columns';
                const list = document.createElement('div'); list.className = 'board-column-list';
                columns.append(heading, list);
                const error = document.createElement('p'); error.setAttribute('role', 'alert');
                let reactorIndex = -1;
                let conditionIndex = -1;
                const cellValue = (source, row, index) => Array.isArray(row) ? row[index] : row[source.columns[index]];
                const reactorName = value => {
                    const text = String(value ?? '').trim();
                    const match = /^(?:R|Reactor\s*)?([1-8])$/i.exec(text);
                    return match ? `R${match[1]}` : text;
                };
                const filteredRows = () => {
                    const source = available[Number(select.value)];
                    return source.rows.filter(row =>
                        (!reactor.value || reactorIndex < 0 || reactorName(cellValue(source, row, reactorIndex)) === reactor.value) &&
                        (!condition.value || String(cellValue(source, row, conditionIndex) ?? '').trim() === condition.value));
                };
                const updateCount = () => {
                    rowCount.textContent = `${filteredRows().length} of ${available[Number(select.value)].rows.length} rows`;
                    error.textContent = '';
                };
                const updateColumns = () => {
                    const source = available[Number(select.value)];
                    list.replaceChildren();
                    source.columns.forEach((name, index) => {
                        if (source.title === 'Plan table' && reactor.value && /^R[1-8]$/.test(name) && name !== reactor.value) return;
                        const item = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = String(index); checkbox.checked = index < 8 || (source.title === 'Plan table' && name === reactor.value);
                        item.append(checkbox, document.createTextNode(name)); list.append(item);
                    });
                };
                const update = () => {
                    const source = available[Number(select.value)];
                    const names = source.columns.map(name => String(name).toLowerCase().replace(/[^a-z0-9]/g, ''));
                    reactorIndex = names.findIndex(name => ['reactor', 'reactorid'].includes(name));
                    conditionIndex = names.findIndex(name => ['condition', 'conditionno', 'conditionnumber', 'conditionid'].includes(name));
                    const reactors = source.title === 'Plan table' ? source.columns.filter(name => /^R[1-8]$/.test(name)) : reactorIndex < 0 ? [] : [...new Set(source.rows.map(row => reactorName(cellValue(source, row, reactorIndex))).filter(Boolean))];
                    const conditions = conditionIndex < 0 ? [] : [...new Set(source.rows.map(row => String(cellValue(source, row, conditionIndex) ?? '').trim()).filter(Boolean))];
                    reactor.replaceChildren(new Option(reactors.length ? 'All reactors' : 'Not available', ''));
                    condition.replaceChildren(new Option(conditions.length ? 'All conditions' : 'Not available', ''));
                    reactors.sort((first, second) => first.localeCompare(second, undefined, { numeric: true })).forEach(value => reactor.add(new Option(value, value)));
                    conditions.sort((first, second) => first.localeCompare(second, undefined, { numeric: true })).forEach(value => condition.add(new Option(value, value)));
                    reactor.disabled = !reactors.length; condition.disabled = !conditions.length;
                    updateColumns(); updateCount();
                };
                reactor.onchange = () => { if (available[Number(select.value)].title === 'Plan table') updateColumns(); updateCount(); };
                condition.onchange = updateCount;
                select.onchange = update; update(); form.append(label, filters, rowCount, columns, error);
                return () => {
                    const source = available[Number(select.value)];
                    const selected = [...list.querySelectorAll('input:checked')].map(input => Number(input.value));
                    if (!selected.length) { error.textContent = 'Select at least one column.'; return null; }
                    const rows = filteredRows();
                    if (!rows.length) { error.textContent = 'No rows match the selected filters.'; return null; }
                    return { title: source.title, created_at: new Date().toISOString(), filters: { reactor: reactor.value, condition: condition.value }, columns: selected.map(index => source.columns[index]), rows: rows.map(row => selected.map(index => cellValue(source, row, index))) };
                };
            }, 'Add to dashboard');
            if (table) { store.setTable(table); render(); status('Table added to dashboard.'); }
        } catch (error) { status(error.message, true); }
    }

    function mount() {
        if (!document.querySelector('#plotDashboard')) return;
        try { render(); } catch (error) { status(error.message, true); }
        document.querySelector('#boardAddTable').onclick = addTable;
        document.querySelector('#boardDeleteTable').onclick = () => { try { store.setTable(null); render(); status('Table deleted.'); } catch (error) { status(error.message, true); } };
        document.querySelector('#pageRefresh').onclick = async () => {
            const confirmed = await dialog('Clear dashboard?', form => {
                const text = document.createElement('p'); text.textContent = 'All dashboard plots and the summary table will be removed. Source data and the Run Number will remain unchanged.';
                form.append(text); return () => true;
            }, 'Clear dashboard');
            if (confirmed) { store.clear(); render(); status('Dashboard cleared.'); }
        };
        document.querySelector('#boardPrint').onclick = () => {
            const state = store.load();
            if (!state.plots.some(Boolean) && !state.table) { status('Add a plot or table before printing.', true); return; }
            window.print();
        };
    }

    window.ILSPlotDashboard = { addChart, addMatrix };
    document.addEventListener('DOMContentLoaded', mount);
})();