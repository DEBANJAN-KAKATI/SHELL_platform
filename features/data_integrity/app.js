(() => {
    const state = { source: null, result: null, chart: null, version: 0, matrixParameters: [], matrixResult: null, matrixVersion: 0 };
    const select = selector => document.querySelector(selector);
    const statsFields = ['run', 'condition', 'reactor', 'parameter', 'count', 'missing_or_invalid', 'mean', 'median', 'std', 'min', 'max', 'q1', 'q3', 'mad', 'outliers', 'status'];
    const statsLabels = ['Run', 'Condition', 'Reactor', 'Parameter', 'Valid count', 'Missing / invalid', 'Mean', 'Median', 'Sample SD', 'Min', 'Max', 'Q1', 'Q3', 'MAD', 'Outliers', 'Assessment'];
    const flagFields = ['row', 'run', 'condition', 'reactor', 'timestamp', 'parameter', 'value', 'reason', 'score'];
    const flagLabels = ['Source row', 'Run', 'Condition', 'Reactor', 'Timestamp', 'Parameter', 'Value', 'Reason', 'Modified Z'];
    const matrixFields = ['reactor', ...Array.from({ length: 8 }, (_, index) => `R${index + 1}`)];
    const matrixLabels = ['Reactor', ...matrixFields.slice(1)];
    const format = value => value === null || value === undefined ? '-' : typeof value === 'number' ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(value) : String(value);

    function numericParameters(source) {
        const rows = source?.rows || [];
        const columns = source?.columns || Object.keys(rows[0] || {});
        return columns.filter(name => {
            const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (['reactor', 'reactorid', 'sampledreactor', 'activereactor', 'condition', 'conditionno', 'runnumber', 'run', 'datetime', 'dateandtime', 'timestamp', 'date', 'time'].includes(normalized) || normalized.startsWith('tos')) return false;
            return rows.some(row => row[name] !== null && row[name] !== undefined && String(row[name]).trim() !== '' && typeof row[name] !== 'boolean' && Number.isFinite(Number(row[name])));
        });
    }

    function readState(key) {
        const states = [sessionStorage, localStorage].map(storage => {
            try { return JSON.parse(storage.getItem(key) || 'null'); } catch (error) { return null; }
        });
        return states.find(saved => saved?.rows?.length || saved?.doeData?.rows?.length) || states.find(Boolean) || null;
    }

    function message(text, error = false) {
        select('#integrityStatus').textContent = text;
        select('#integrityStatus').dataset.error = String(error);
    }

    function clearResult() {
        state.version++;
        state.result = null;
        if (state.chart) { state.chart.destroy(); state.chart = null; }
        ['integrityRows', 'integrityAssigned', 'integrityMissing', 'integrityOutliers', 'integrityDuplicates', 'integrityUnscored'].forEach(id => select('#' + id).textContent = '-');
        ['integrityStatsDashboard', 'integrityExportStats', 'integrityExportFlags', 'plotAddDashboard'].forEach(id => select('#' + id).disabled = true);
        select('#integrityStats tbody').replaceChildren(); select('#integrityFlags tbody').replaceChildren();
        select('#integrityNarrative').textContent = 'No analysis run.';
        select('#integrityFlagCount').textContent = '';
        select('#plotDashboardStatus').textContent = '';
        select('#plotChartTitle').textContent = 'No measurements';
    }

    function loadSource() {
        clearResult();
        try {
            state.source = readState(select('#integritySource').value);
            const rows = state.source?.rows || [];
            const parameters = numericParameters(state.source);
            const reactors = [...new Set(rows.map(row => {
                const value = String(row.Reactor ?? row['Reactor ID'] ?? '').trim();
                const match = /^(?:R|Reactor\s*)?([1-8])(?:\.0)?$/i.exec(value);
                return match ? 'R' + match[1] : '';
            }).filter(Boolean))].sort();
            select('#integrityReactor').replaceChildren(new Option('All reactors', ''));
            reactors.forEach(value => select('#integrityReactor').add(new Option(value, value)));
            const conditions = [...new Set(rows.map(row => String(row['Condition No.'] ?? row.Condition ?? row.condition ?? '').trim()).filter(value => value && !value.startsWith('ERROR:')))].sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
            select('#integrityCondition').replaceChildren(new Option('All conditions', ''));
            conditions.forEach(value => select('#integrityCondition').add(new Option(value, value)));
            select('#integrityRun').textContent = `Run ${sessionStorage.getItem('ils_run_number') || 'workspace'}`;
            select('#integrityAnalyze').disabled = !rows.length || !parameters.length;
            message(rows.length ? `${rows.length} source rows / ${parameters.length} numeric parameters` : 'No source data loaded in this tab.');
        } catch (error) { state.source = null; select('#integrityAnalyze').disabled = true; message(error.message, true); }
    }

    function table(selector, rows, fields, labels, limit = Infinity) {
        const element = select(selector); element.tHead.replaceChildren(); element.tBodies[0].replaceChildren();
        const head = element.tHead.insertRow();
        labels.forEach(label => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = label; head.append(cell); });
        rows.slice(0, limit).forEach(row => { const cells = element.tBodies[0].insertRow(); cells.dataset.outlier = String((row.outliers || 0) > 0 || row.reason?.startsWith('Potential outlier')); fields.forEach(field => cells.insertCell().textContent = format(row[field])); });
    }

    function matrixGroup() {
        return state.matrixResult;
    }

    function matrixRows(group) {
        if (Array.isArray(group.rsd_matrix)) return group.rsd_matrix;
        const means = group.reactor_means || {};
        return matrixFields.slice(1).map(first => ({
            reactor: first,
            ...Object.fromEntries(matrixFields.slice(1).map(second => {
                const left = means[first];
                const right = means[second];
                const value = Number.isFinite(left) && Number.isFinite(right) && left + right !== 0
                    ? 100 * Math.SQRT2 * Math.abs(left - right) / Math.abs(left + right)
                    : null;
                return [second, value];
            }))
        }));
    }

    function loadMatrixSources() {
        const parameterSelect = select('#integrityMatrixParameter');
        const previousParameter = state.matrixParameters[Number(parameterSelect.value)];
        const analysisSelect = select('#integrityParameters');
        const previousAnalysisParameter = state.matrixParameters[Number(analysisSelect.value)];
        const conditionSelect = select('#integrityMatrixCondition');
        const previousCondition = conditionSelect.value;
        const conditions = new Set();
        parameterSelect.replaceChildren();
        state.matrixParameters = [];
        [['ils_base_table_state', 'Base table'], ['ils_yield_table_state', 'Yield table'], ['ils_reforming_carbon_state', 'Reforming CARBON_TABULAR'], ['dhaOnlineState', 'Online Analysis']].forEach(([key, title]) => {
            const source = readState(key);
            const parameters = numericParameters(source);
            if (!parameters.length) return;
            const group = document.createElement('optgroup'); group.label = title;
            parameters.forEach(name => {
                const index = state.matrixParameters.length;
                state.matrixParameters.push({ key, title, name, source });
                group.append(new Option(`${name} (${title})`, String(index)));
            });
            parameterSelect.append(group);
            source.rows.forEach(row => {
                const condition = String(row['Condition No.'] ?? row.Condition ?? row.condition ?? '').trim();
                if (condition && !condition.startsWith('ERROR:')) conditions.add(condition);
            });
        });
        const previousIndex = state.matrixParameters.findIndex(parameter => parameter.key === previousParameter?.key && parameter.name === previousParameter?.name);
        if (previousIndex >= 0) parameterSelect.value = String(previousIndex);
        if (!state.matrixParameters.length) parameterSelect.add(new Option('No numeric parameters', ''));
        parameterSelect.disabled = !state.matrixParameters.length;
        analysisSelect.replaceChildren(...[...parameterSelect.children].map(child => child.cloneNode(true)));
        analysisSelect.disabled = parameterSelect.disabled;
        const analysisIndex = state.matrixParameters.findIndex(parameter => parameter.key === previousAnalysisParameter?.key && parameter.name === previousAnalysisParameter?.name);
        const sourceIndex = state.matrixParameters.findIndex(parameter => parameter.key === select('#integritySource').value);
        analysisSelect.value = String(analysisIndex >= 0 ? analysisIndex : sourceIndex);
        if (analysisIndex >= 0) select('#integritySource').value = state.matrixParameters[analysisIndex].key;
        conditionSelect.replaceChildren();
        [...conditions].sort((first, second) => first.localeCompare(second, undefined, { numeric: true })).forEach(condition => conditionSelect.add(new Option(condition, condition)));
        if (conditions.has(previousCondition)) conditionSelect.value = previousCondition;
        if (!conditions.size) conditionSelect.add(new Option('No conditions', ''));
        conditionSelect.disabled = !conditions.size;
        refreshMatrix();
    }

    async function refreshMatrix() {
        const version = ++state.matrixVersion;
        const parameter = state.matrixParameters[Number(select('#integrityMatrixParameter').value)];
        const condition = select('#integrityMatrixCondition').value;
        state.matrixResult = null;
        renderMatrix();
        if (!parameter || !condition) return;
        select('#integrityMatrixStatus').textContent = 'Calculating RSD matrix...';
        try {
            const response = await fetch('/api/data-integrity/analyze', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows: parameter.source.rows, parameters: [parameter.name], condition, run: sessionStorage.getItem('ils_run_number') })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Matrix calculation failed.');
            if (version !== state.matrixVersion) return;
            const groups = result.reproducibility || [];
            if (groups.length > 1) throw new Error('Multiple runs found. Load one run to compare reactors.');
            state.matrixResult = groups[0] ? { ...groups[0], rsd_matrix: matrixRows(groups[0]), sourceTitle: parameter.title } : null;
            renderMatrix();
            if (!state.matrixResult) {
                const reasons = [...new Set((result.flags || []).map(flag => flag.reason))].slice(0, 3);
                select('#integrityMatrixStatus').textContent = `${parameter.title}: no valid ${parameter.name} measurements for Condition ${condition}.${reasons.length ? ' ' + reasons.join('; ') + '.' : ''}`;
            }
        } catch (error) {
            if (version === state.matrixVersion) select('#integrityMatrixStatus').textContent = error.message;
        }
    }

    function renderMatrix() {
        const group = matrixGroup();
        const rows = group?.rsd_matrix || matrixFields.slice(1).map(reactor => ({ reactor, ...Object.fromEntries(matrixFields.slice(1).map(name => [name, null])) }));
        table('#integrityMatrix', rows, matrixFields, matrixLabels);
        select('#integrityMatrixDashboard').disabled = !group;
        select('#integrityExportMatrix').disabled = !group;
        select('#integrityMatrixStatus').textContent = group
            ? `${group.sourceTitle} / Run ${group.run} / Condition ${group.condition} / ${group.reactor_count} of 8 reactors`
            : 'No comparisons for the selected condition.';
        [...select('#integrityMatrix tbody').rows].forEach((row, index) => {
            const label = document.createElement('th'); label.scope = 'row'; label.textContent = row.cells[0].textContent;
            row.cells[0].replaceWith(label);
            [...row.cells].forEach((cell, column) => {
                if (column && rows[index][matrixFields[column]] !== null) cell.textContent = `${rows[index][matrixFields[column]].toFixed(1)}%`;
                if (column) cell.dataset.diagonal = String(index === column - 1);
                if (column) cell.dataset.warning = String(Number.isFinite(rows[index][matrixFields[column]]) && rows[index][matrixFields[column]] > 2);
                if (column) cell.title = rows[index][matrixFields[column]] === null
                    ? 'Undefined: missing reactor data or zero pair mean'
                    : `${matrixFields[index + 1]} / ${matrixFields[column]} RSD: ${rows[index][matrixFields[column]].toFixed(5)}%`;
            });
        });
    }

    function renderChart() {
        if (state.chart) state.chart.destroy();
        const groups = state.result?.statistics || [];
        if (!groups.length) return;
        const colors = ['#397655', '#c95512', '#344253', '#b97712', '#6d536f', '#2f6b52', '#a63f32', '#67716d'];
        select('#plotChartTitle').textContent = `${groups[0].parameter} / ${groups.length} condition-reactor groups`;
        const datasets = groups.flatMap((group, groupIndex) => {
            const points = [...group.points].sort((first, second) => first.time.localeCompare(second.time));
            const color = colors[groupIndex % colors.length];
            const label = `Run ${group.run} / C${group.condition} / ${group.reactor}`;
            const series = [false, true].map(outlier => ({
                label: `${label}${outlier ? ' / outliers' : ''}`, legendGroup: !outlier,
                data: points.map((point, index) => ({ x: index + 1, y: point.value, timestamp: point.timestamp, outlier: point.outlier })).filter(point => point.outlier === outlier),
                pointStyle: outlier ? 'rectRot' : 'circle', pointRadius: outlier ? 6 : 4, pointBackgroundColor: outlier ? '#bf452c' : color, pointBorderColor: '#fff', pointBorderWidth: 1
            }));
            if (group.median !== null && points.length) series.push({ type: 'line', label: `${label} / median`, data: [{ x: 1, y: group.median }, { x: points.length, y: group.median }], borderColor: color, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 });
            return series;
        });
        state.chart = new Chart(select('#integrityCanvas'), { type: 'scatter', data: { datasets }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: groups.length > 1, position: 'bottom', labels: { font: { size: 10 }, filter: (item, data) => Boolean(data.datasets[item.datasetIndex].legendGroup) } }, tooltip: { callbacks: { afterLabel: context => context.raw.timestamp || '' } } }, scales: { x: { title: { display: true, text: 'Sample order (chronological)' } }, y: { title: { display: true, text: groups[0].parameter } } } } });
        select('#plotAddDashboard').disabled = !groups.some(group => group.points.length);
    }

    function renderResult() {
        const { summary, statistics, flags } = state.result;
        select('#integrityRows').textContent = summary.source_rows;
        select('#integrityAssigned').textContent = `${summary.assigned_rows} / ${summary.unassigned_rows}`;
        select('#integrityMissing').textContent = `${summary.missing_values} / ${summary.invalid_values}`;
        select('#integrityOutliers').textContent = summary.outlier_values;
        select('#integrityDuplicates').textContent = summary.duplicates;
        select('#integrityUnscored').textContent = summary.unscored_groups;
        select('#integrityNarrative').textContent = `${statistics.length} independent parameter groups reviewed. ${summary.outlier_values} potential outlier values, ${summary.missing_values + summary.invalid_values} missing or invalid values, and ${summary.duplicates} duplicate rows found. ${summary.unassigned_rows} rows have missing or invalid source conditions, reactors, or timestamps; ${summary.excluded_by_filter} rows were excluded by the selected filters. ${summary.unscored_groups} groups were not scored because of sample size or zero MAD. Potential outliers require review; source data is unchanged.`;
        table('#integrityStats', statistics, statsFields, statsLabels);
        table('#integrityFlags', flags, flagFields, flagLabels, 500);
        select('#integrityFlagCount').textContent = `${Math.min(flags.length, 500)} / ${flags.length} flagged records`;
        select('#integrityStatsDashboard').disabled = !statistics.length;
        select('#integrityExportStats').disabled = !statistics.length;
        select('#integrityExportFlags').disabled = !flags.length;
        renderChart();
    }

    async function analyze(event) {
        event.preventDefault();
        const parameter = state.matrixParameters[Number(select('#integrityParameters').value)];
        if (!parameter) { message('Select a numeric parameter.', true); return; }
        const parameters = [parameter.name];
        const version = ++state.version;
        const button = select('#integrityAnalyze'); button.disabled = true;
        message('Analysing condition / reactor groups...');
        try {
            const response = await fetch('/api/data-integrity/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: parameter.source.rows, parameters, run: sessionStorage.getItem('ils_run_number'), reactor: select('#integrityReactor').value, condition: select('#integrityCondition').value, threshold: Number(select('#integrityThreshold').value), minimum: 3 }) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Analysis failed.');
            if (version !== state.version) return;
            state.result = result; renderResult(); message('Analysis complete. Source records unchanged.');
        } catch (error) { if (version === state.version) message(error.message, true); }
        finally { button.disabled = !state.source?.rows?.length; }
    }

    function exportCSV(rows, fields, labels, filename) {
        const escape = value => {
            let text = value === null || value === undefined ? '' : String(value);
            if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
        };
        const content = [labels, ...rows.map(row => fields.map(field => row[field]))].map(row => row.map(escape).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function addDashboardTable(title, rows, fields, labels) {
        try {
            if (window.ILSPlotDashboardStore.load().table && !confirm('Replace the table currently on the Summary Dashboard?')) return;
            window.ILSPlotDashboardStore.setTable({ title, created_at: new Date().toISOString(), columns: labels, rows: rows.map(group => fields.map(field => group[field])) });
            message('Table added to Summary Dashboard.');
        } catch (error) { message(error.message, true); }
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadMatrixSources(); loadSource(); window.lucide?.createIcons();
        select('#integritySource').onchange = () => {
            const index = state.matrixParameters.findIndex(parameter => parameter.key === select('#integritySource').value);
            select('#integrityParameters').value = index >= 0 ? String(index) : '';
            loadSource();
        };
        select('#integrityParameters').onchange = () => {
            const parameter = state.matrixParameters[Number(select('#integrityParameters').value)];
            if (!parameter) return;
            if (select('#integritySource').value !== parameter.key) {
                select('#integritySource').value = parameter.key;
                loadSource();
            } else { clearResult(); message('Selection changed.'); }
        };
        select('#integrityForm').onsubmit = analyze;
        select('#pageRefresh').onclick = () => { loadMatrixSources(); loadSource(); };
        ['integrityReactor', 'integrityCondition', 'integrityThreshold'].forEach(id => select('#' + id).onchange = () => { clearResult(); message('Selection changed.'); });
        select('#integrityMatrixCondition').onchange = refreshMatrix;
        select('#integrityMatrixParameter').onchange = refreshMatrix;
        select('#integrityHelp').onclick = () => select('#integrityMethod').showModal();
        select('#plotAddDashboard').onclick = () => window.ILSPlotDashboard.addChart(state.chart);
        select('#integrityExportStats').onclick = () => exportCSV(state.result.statistics, statsFields, statsLabels, 'integrity_statistics.csv');
        select('#integrityExportFlags').onclick = () => exportCSV(state.result.flags, flagFields, flagLabels, 'integrity_flagged_records.csv');
        select('#integrityStatsDashboard').onclick = () => addDashboardTable('Data integrity statistics', state.result.statistics, statsFields, statsLabels);
        select('#integrityExportMatrix').onclick = () => {
            const group = matrixGroup();
            exportCSV(group.rsd_matrix, matrixFields, matrixLabels, `condition_${group.condition}_${group.parameter.replace(/[^a-z0-9_-]/gi, '_')}_reactor_rsd.csv`);
        };
        select('#integrityMatrixDashboard').onclick = () => {
            const group = matrixGroup();
            window.ILSPlotDashboard.addMatrix({
                title: `${group.sourceTitle} / Run ${group.run} / Condition ${group.condition} / ${group.parameter} / RSD (%)`,
                run: group.run, rows: group.rsd_matrix
            });
        };
    });
})();