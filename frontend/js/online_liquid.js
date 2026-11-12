// Online Analysis · Liquid tab (General_MB, 6.9.5): the liquid side of the mass balance, typed by the user.
// Workbook Liq sheet: sample window, TLP / hydrocarbon / aqueous phase masses, elemental and bulk analyses, and the
// carbon wt% of the liquid feed. One tab per sample (e.g. C1-S1), one row per Run Plan reactor. The liquid feed flow
// comes from the ZMB pump check (verified) or the Run Plan DOE. Results are kept in `ils_liquid_state` for the
// C-Balance and Summary tables.
(() => {
    const KEY = 'ils_liquid_state';
    const ALL_REACTORS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
    const $ = (s) => document.querySelector(s);
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const general = () => Boolean(window.ILSProcess?.isGeneralMB?.());

    // Optional analyses (workbook Liq rows 25-35); shown in a collapsed table
    const EXTRA = [
        ['h', 'Hydrogen', 'wt%'], ['o', 'Oxygen', 'wt%'], ['n', 'Nitrogen', 'ppmw'], ['s', 'Sulfur', 'ppmw'],
        ['density', 'Density', 'g/mL'], ['mono', 'Monoaromatics', 'wt%'], ['di', 'Diaromatics', 'wt%'], ['tri', 'Tri+ aromatics', 'wt%'],
    ];

    const liq = { feedCarbon: '', samples: [{ name: 'C1-S1', twoPhase: false, rows: {} }], active: 0, tab: 'gas', showAll: false };

    // ------------------------------------------------------------ state
    function load() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
            if (!saved) return;
            liq.feedCarbon = saved.feedCarbon ?? '';
            if (Array.isArray(saved.samples) && saved.samples.length) {
                liq.samples = saved.samples.map(s => ({ name: s.name || '', twoPhase: Boolean(s.twoPhase), rows: s.rows || {} }));
            }
            liq.active = Math.min(Math.max(0, saved.active || 0), liq.samples.length - 1);
            liq.tab = saved.tab === 'liquid' ? 'liquid' : 'gas';
            liq.showAll = Boolean(saved.showAll);
        } catch (e) { sessionStorage.removeItem(KEY); }
    }

    function save() {
        try {
            sessionStorage.setItem(KEY, JSON.stringify({
                feedCarbon: liq.feedCarbon, samples: liq.samples, active: liq.active, tab: liq.tab, showAll: liq.showAll,
                results: allResults(),
            }));
        } catch (e) {}
    }

    // ------------------------------------------------------------ Run Plan and ZMB context
    function runPlan() {
        try { return JSON.parse(sessionStorage.getItem('runPlanDashboardState') || 'null') || {}; } catch (e) { return {}; }
    }

    function reactors() {
        const list = runPlan()?.summary?.active_reactors;
        const active = Array.isArray(list) && list.length ? list.map(String) : null;
        if (!active || liq.showAll) return { shown: ALL_REACTORS, active: new Set(active || ALL_REACTORS) };
        return { shown: ALL_REACTORS.filter(r => active.includes(r)), active: new Set(active) };
    }

    function feedCutIn() {
        const info = runPlan()?.planData?.info || [];
        const value = info.find(i => String(i.parameter).trim().toLowerCase() === 'feed cut-in')?.value;
        return toTime(value);
    }

    function zmbVerified() {
        try {
            const results = JSON.parse(sessionStorage.getItem('ils_zmb_pump') || 'null')?.results || [];
            return Object.fromEntries(results.filter(r => r.verified_flow_g_h !== null && r.verified_flow_g_h !== undefined)
                .map(r => [r.reactor, r]));
        } catch (e) { return {}; }
    }

    // Liquid feed flow of a reactor: ZMB pump check (verified) → Run Plan DOE liquid flow of the condition
    function liquidFeed(reactor, condition, zmb) {
        if (zmb[reactor]) {
            return { value: zmb[reactor].verified_flow_g_h, source: `ZMB pump check (${zmb[reactor].reps} rep${zmb[reactor].reps === 1 ? '' : 's'})` };
        }
        const rows = (runPlan()?.doeData?.rows || []).filter(row => String(row['Reactor ID'] ?? '').trim().toUpperCase() === reactor);
        const pick = rows.find(row => condition && String(row['Condition No.'] ?? '').trim() === String(condition)) || (condition ? null : rows[0]);
        if (pick) {
            const key = Object.keys(pick).find(k => /^liquid flow/i.test(k)) || Object.keys(pick).find(k => /liquid\s*flow/i.test(k));
            const value = num(pick[key]);
            if (value !== null && value > 0) return { value, source: `Run Plan DOE (condition ${pick['Condition No.']})` };
        }
        return { value: null, source: '' };
    }

    // ------------------------------------------------------------ parsing helpers
    function num(value) {
        if (value === '' || value === null || value === undefined) return null;
        const n = Number(String(value).trim().replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }

    function toTime(value) {
        if (!value) return null;
        const text = String(value).trim();
        const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5], +(iso[6] || 0)).getTime();
        return null;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const toInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    const toText = (t) => t === null ? '' : toInput(t).replace('T', ' ');

    // Pasted date-time from Excel or typed text → datetime-local value. 5/14/2024 7:52 AM (US, as Excel shows it),
    // 14.05.2024 07:52 (dots = day first), 2024-05-14 07:52, 5-14-24 7:52 AM.
    function parsePastedDate(text) {
        const s = String(text || '').trim();
        if (!s) return '';
        const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
        if (iso) return toInput(new Date(+iso[1], +iso[2] - 1, +iso[3], +iso[4], +iso[5]).getTime());
        const m = s.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{2,4})[ T]+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
        if (!m) return '';
        let [a, b] = [+m[1], +m[3]];
        let year = +m[4];
        if (year < 100) year += 2000;
        let hour = +m[5];
        if (m[7]) { const pm = /p/i.test(m[7]); if (hour === 12) hour = pm ? 12 : 0; else if (pm) hour += 12; }
        const dayFirst = m[2] === '.' || a > 12;
        const [day, month] = dayFirst ? [a, b] : [b, a];
        return toInput(new Date(year, month - 1, day, hour, +m[6]).getTime());
    }

    // ------------------------------------------------------------ calculation of one reactor of one sample
    function calc(sample, reactor, ctx) {
        const row = sample.rows[reactor] || {};
        const out = { reactor, errors: [], missingMass: [], missingCarbon: [] };
        const start = toTime(row.start), end = toTime(row.end);
        out.start = start; out.end = end;
        if (start !== null && end !== null) {
            if (end <= start) out.errors.push('finished is not after started');
            else {
                out.minutes = (end - start) / 60000;
                out.hours = out.minutes / 60;
                const mid = (start + end) / 2;
                if (ctx.cutIn !== null) out.tos = (mid - ctx.cutIn) / 3600000;
                out.condition = typeof onlineConditionOf === 'function'
                    ? onlineConditionOf({ DateTime: toText(mid).replace('T', ' ') + ':00', Reactor: reactor.replace(/^R/, '') }) : '';
            }
        }
        const field = (key, label) => {
            const text = row[key];
            if (text === '' || text === undefined || text === null) return null;
            const v = num(text);
            if (v === null) { out.errors.push(`${label} is not a number`); return null; }
            if (v < 0) { out.errors.push(`${label} is negative`); return null; }
            return v;
        };
        let tlp = field('tlp', 'TLP mass');
        const hc = sample.twoPhase ? field('hc', 'HC phase mass') : null;
        const aqTyped = sample.twoPhase ? field('aq', 'aqueous phase mass') : null;
        const c = field('c', 'Carbon wt%');
        if (c !== null && c > 100) out.errors.push('Carbon wt% above 100');
        if (sample.twoPhase && tlp === null && hc !== null && aqTyped !== null) tlp = hc + aqTyped;
        const aq = sample.twoPhase ? aqTyped : (tlp !== null ? 0 : null);
        out.tlp = tlp; out.hc = sample.twoPhase ? hc : tlp; out.aq = aq; out.c = c;
        if (sample.twoPhase && tlp !== null && hc !== null && aq !== null && tlp > 0) {
            out.loss = 100 - 100 * (hc + aq) / tlp;
            if (out.loss < -0.5) out.errors.push('phases weigh more than the TLP');
        }
        // Flows over the sampling duration (workbook Liq rows 40-41; row 40 divided by the average TOS, fixed here)
        if (out.hours && tlp !== null && aq !== null) {
            out.hcFlow = (tlp - aq) / out.hours;
            out.aqFlow = aq / out.hours;
        }
        if (out.hcFlow !== undefined && c !== null) out.cOut = out.hcFlow * c / 100;
        const feed = liquidFeed(reactor, out.condition, ctx.zmb);
        out.feedFlow = feed.value; out.feedSource = feed.source;
        const feedC = num(ctx.feedCarbon);
        if (out.feedFlow !== null && feedC !== null) out.cIn = out.feedFlow * feedC / 100;

        if (start === null || end === null) out.missingMass.push('sampling window');
        if (tlp === null) out.missingMass.push('TLP mass');
        if (sample.twoPhase && aqTyped === null) out.missingMass.push('aqueous phase mass');
        if (out.feedFlow === null) out.missingMass.push('liquid feed flow (ZMB or Run Plan DOE)');
        out.missingCarbon = [...out.missingMass];
        if (c === null) out.missingCarbon.push('Carbon wt%');
        if (feedC === null) out.missingCarbon.push('Carbon wt% of the liquid feed');
        out.readyMass = !out.errors.length && !out.missingMass.length;
        out.readyCarbon = !out.errors.length && !out.missingCarbon.length;
        out.started = Boolean(row.start || row.end || row.tlp || row.hc || row.aq || row.c);
        return out;
    }

    const context = () => ({ cutIn: feedCutIn(), zmb: zmbVerified(), feedCarbon: liq.feedCarbon });

    function allResults() {
        const ctx = context();
        const out = [];
        liq.samples.forEach(sample => ALL_REACTORS.forEach(reactor => {
            const row = sample.rows[reactor] || {};
            const r = calc(sample, reactor, ctx);
            if (!r.started) return;
            out.push({
                sample: sample.name, reactor, condition: r.condition || '', start: toText(r.start), end: toText(r.end),
                duration_min: r.minutes ?? null, tos_h: r.tos ?? null, two_phase: sample.twoPhase,
                tlp_g: r.tlp ?? null, hc_g: r.hc ?? null, aq_g: r.aq ?? null, decant_loss_pct: r.loss ?? null,
                c_wt_pct: r.c ?? null, hc_flow_g_h: r.hcFlow ?? null, aq_flow_g_h: r.aqFlow ?? null, c_out_g_h: r.cOut ?? null,
                feed_flow_g_h: r.feedFlow, feed_flow_source: r.feedSource, feed_c_wt_pct: num(liq.feedCarbon), c_in_g_h: r.cIn ?? null,
                ...Object.fromEntries(EXTRA.map(([k]) => [k, num(row[k])])),
                ready_mass_balance: r.readyMass, ready_carbon_balance: r.readyCarbon,
                error: r.errors.length ? `ERROR: ${r.errors.join('; ')}` : '',
            });
        }));
        return out;
    }

    // ------------------------------------------------------------ rendering
    const fmt = (v, d = 4) => (v === null || v === undefined || !Number.isFinite(v)) ? '' : String(Number(v.toFixed(d)));

    function inputCell(reactor, key, value, opts = {}) {
        const type = opts.date ? 'datetime-local' : 'text';
        return `<td class="${opts.date ? '' : 'num'}"><input class="input liq-in${opts.date ? ' liq-date' : ''}" type="${type}"${opts.date ? ' step="60"' : ' inputmode="decimal"'} `
            + `data-reactor="${reactor}" data-field="${key}" value="${esc(value ?? '')}" placeholder="${esc(opts.placeholder || '')}" aria-label="${reactor} ${esc(opts.label || key)}"></td>`;
    }

    function chips(r) {
        const chip = (ok, label, missing) => `<span class="liq-chip ${ok ? 'ok' : 'todo'}" title="${ok ? `${label}: ready` : `${label} needs: ${esc(missing.join(', '))}`}">${ok ? '✓' : '○'} ${label}</span>`;
        if (r.errors.length) return `<span class="liq-err">ERROR: ${esc(r.errors.join('; '))}</span>`;
        return chip(r.readyMass, 'Mass', r.missingMass) + chip(r.readyCarbon, 'Carbon', r.missingCarbon);
    }

    function outputs(r) {
        return {
            condition: r.condition || '', minutes: fmt(r.minutes, 1), tos: fmt(r.tos, 2), loss: fmt(r.loss, 2),
            hcFlow: fmt(r.hcFlow, 4), aqFlow: fmt(r.aqFlow, 4), cOut: fmt(r.cOut, 4),
            feed: r.feedFlow === null ? '<span class="liq-missing" title="Fill the ZMB pump check or the Run Plan DOE liquid flow">–</span>'
                : `<span title="${esc(r.feedSource)}">${fmt(r.feedFlow, 4)}</span>`,
            status: chips(r),
        };
    }

    function mainHeader(sample) {
        return `<tr><th>Reactor</th><th>Condition</th><th>Sample collection started</th><th>Sample collection finished</th>`
            + `<th class="num">Duration<br><small>min</small></th><th class="num">TOS<br><small>h</small></th>`
            + `<th class="num liq-key">TLP mass<br><small>g</small></th>`
            + (sample.twoPhase ? `<th class="num liq-key">HC (top) phase<br><small>g</small></th><th class="num liq-key">Aqueous (bottom)<br><small>g</small></th><th class="num">Decantation loss<br><small>%</small></th>` : '')
            + `<th class="num liq-key">Carbon<br><small>wt% of HC product</small></th>`
            + `<th class="num">HC product<br><small>g/h</small></th><th class="num">Aqueous<br><small>g/h</small></th>`
            + `<th class="num">C in liquid product<br><small>g C/h</small></th><th class="num">Liquid feed<br><small>g/h</small></th><th>Ready for</th></tr>`;
    }

    function mainRow(sample, reactor, used, ctx) {
        const row = sample.rows[reactor] || {};
        const r = calc(sample, reactor, ctx);
        const o = outputs(r);
        return `<tr data-reactor="${reactor}" class="${used ? '' : 'unused'}"${used ? '' : ' title="Not used in the Run Plan"'}>`
            + `<td><b>${reactor}</b></td><td data-out="condition">${esc(o.condition)}</td>`
            + inputCell(reactor, 'start', row.start, { date: true, label: 'sample collection started' })
            + inputCell(reactor, 'end', row.end, { date: true, label: 'sample collection finished' })
            + `<td class="num" data-out="minutes">${o.minutes}</td><td class="num" data-out="tos">${o.tos}</td>`
            + inputCell(reactor, 'tlp', row.tlp, { placeholder: 'g', label: 'TLP mass' })
            + (sample.twoPhase ? inputCell(reactor, 'hc', row.hc, { placeholder: 'g', label: 'HC phase mass' })
                + inputCell(reactor, 'aq', row.aq, { placeholder: 'g', label: 'aqueous phase mass' })
                + `<td class="num" data-out="loss">${o.loss}</td>` : '')
            + inputCell(reactor, 'c', row.c, { placeholder: 'wt%', label: 'Carbon wt%' })
            + `<td class="num" data-out="hcFlow">${o.hcFlow}</td><td class="num" data-out="aqFlow">${o.aqFlow}</td>`
            + `<td class="num" data-out="cOut">${o.cOut}</td><td class="num" data-out="feed">${o.feed}</td>`
            + `<td data-out="status">${o.status}</td></tr>`;
    }

    function extraRow(sample, reactor, used) {
        const row = sample.rows[reactor] || {};
        return `<tr data-reactor="${reactor}" class="${used ? '' : 'unused'}"><td><b>${reactor}</b></td>`
            + EXTRA.map(([k, label]) => inputCell(reactor, k, row[k], { label })).join('') + '</tr>';
    }

    function sampleProgress(sample, ctx) {
        const { shown, active } = reactors();
        const list = shown.filter(r => active.has(r));
        const res = list.map(r => calc(sample, r, ctx));
        return { total: list.length, mass: res.filter(r => r.readyMass).length, carbon: res.filter(r => r.readyCarbon).length, res };
    }

    function renderTabs(ctx) {
        $('#liqSampleTabs').innerHTML = liq.samples.map((s, i) => {
            const p = sampleProgress(s, ctx);
            const done = p.total && p.carbon === p.total ? ' done' : (p.mass ? ' part' : '');
            return `<button type="button" role="tab" class="liq-sample-tab${i === liq.active ? ' active' : ''}${done}" data-sample="${i}" aria-selected="${i === liq.active}">`
                + `${esc(s.name || `Sample ${i + 1}`)}<small>${p.carbon}/${p.total}</small></button>`;
        }).join('') + '<button type="button" class="liq-sample-tab add" id="liqAddSample" title="Add the next liquid sample">+ New sample</button>';
        $('#liqSampleTabs').querySelectorAll('[data-sample]').forEach(btn => btn.onclick = () => {
            liq.active = Number(btn.dataset.sample); save(); render();
        });
        $('#liqAddSample').onclick = addSample;
    }

    function renderChecklist(sample, ctx) {
        const p = sampleProgress(sample, ctx);
        const missingBy = (key) => {
            const counts = new Map();
            p.res.forEach(r => (key === 'mass' ? r.missingMass : r.missingCarbon).forEach(m => counts.set(m, [...(counts.get(m) || []), r.reactor])));
            return [...counts.entries()].map(([m, rs]) => `${m}${rs.length < p.total ? ` (${rs.join(', ')})` : ''}`);
        };
        const line = (label, n, missing) => `<div class="liq-check ${n === p.total && p.total ? 'ok' : ''}"><b>${label}</b>`
            + `<span class="liq-meter"><i style="width:${p.total ? Math.round(100 * n / p.total) : 0}%"></i></span>`
            + `<span>${n}/${p.total} reactors</span>${missing.length ? `<span class="liq-check-miss">still needed: ${esc(missing.join(' · '))}</span>` : ''}</div>`;
        $('#liqChecklist').innerHTML = line('Mass balance', p.mass, missingBy('mass')) + line('Carbon balance', p.carbon, missingBy('carbon'));
        const tabBadge = $('#onlineTabLiquidBadge');
        if (tabBadge) {
            const all = liq.samples.map(s => sampleProgress(s, ctx));
            const ready = all.reduce((a, x) => a + x.carbon, 0), total = all.reduce((a, x) => a + x.total, 0);
            tabBadge.textContent = total ? `${ready}/${total}` : '';
        }
    }

    function renderFeed(ctx) {
        const { shown, active } = reactors();
        const list = shown.filter(r => active.has(r));
        const sample = liq.samples[liq.active];
        $('#liqFeedCarbon').value = liq.feedCarbon;
        $('#liqFeedFlows').innerHTML = list.map(r => {
            const res = calc(sample, r, ctx);
            const f = res.feedFlow === null ? { value: null, source: '' } : { value: res.feedFlow, source: res.feedSource };
            return `<span class="liq-feed-pill${f.value === null ? ' missing' : ''}" title="${esc(f.source || 'No liquid feed flow: fill the ZMB pump check or the Run Plan DOE liquid flow')}">`
                + `<b>${r}</b> ${f.value === null ? 'not set' : `${fmt(f.value, 3)} g/h`}<small>${esc(f.source ? f.source.replace(/ \(.*\)$/, '') : '')}</small></span>`;
        }).join('') || '<span class="liq-missing">Load the Run Plan to list the reactors.</span>';
    }

    function render() {
        const ctx = context();
        const sample = liq.samples[liq.active];
        const { shown, active } = reactors();
        $('#liqSampleName').value = sample.name;
        $('#liqTwoPhase').checked = sample.twoPhase;
        $('#liqShowAll').checked = liq.showAll;
        $('#liqRemoveSample').disabled = liq.samples.length <= 1;
        $('#liqCutInNote').textContent = ctx.cutIn === null ? 'TOS needs the Feed Cut-In of the Run Plan.' : `TOS from the Run Plan Feed Cut-In ${toText(ctx.cutIn)}.`;
        $('#liqMainHead').innerHTML = mainHeader(sample);
        $('#liqMainBody').innerHTML = shown.map(r => mainRow(sample, r, active.has(r), ctx)).join('');
        $('#liqExtraHead').innerHTML = `<tr><th>Reactor</th>${EXTRA.map(([, label, unit]) => `<th class="num">${label}<br><small>${unit}</small></th>`).join('')}</tr>`;
        $('#liqExtraBody').innerHTML = shown.map(r => extraRow(sample, r, active.has(r))).join('');
        renderTabs(ctx);
        renderFeed(ctx);
        renderChecklist(sample, ctx);
        bindInputs();
    }

    function refreshRow(reactor) {
        const ctx = context();
        const sample = liq.samples[liq.active];
        const tr = $(`#liqMainBody tr[data-reactor="${reactor}"]`);
        if (tr) {
            const o = outputs(calc(sample, reactor, ctx));
            tr.querySelectorAll('[data-out]').forEach(td => {
                const v = o[td.dataset.out];
                if (td.dataset.out === 'feed' || td.dataset.out === 'status') td.innerHTML = v; else td.textContent = v;
            });
        }
        renderTabs(ctx);
        renderFeed(ctx);
        renderChecklist(sample, ctx);
    }

    // ------------------------------------------------------------ input handling (typing, Enter, paste from Excel)
    function setField(reactor, field, value) {
        const rows = liq.samples[liq.active].rows;
        rows[reactor] = { ...(rows[reactor] || {}), [field]: value };
    }

    function bindInputs() {
        document.querySelectorAll('#onlineLiquidPanel input.liq-in').forEach(input => {
            input.addEventListener(input.type === 'datetime-local' ? 'change' : 'input', () => {
                setField(input.dataset.reactor, input.dataset.field, input.value);
                save();
                refreshRow(input.dataset.reactor);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const inputs = [...input.closest('tbody').querySelectorAll(`input[data-field="${input.dataset.field}"]`)];
                const next = inputs[inputs.indexOf(input) + (e.shiftKey ? -1 : 1)];
                if (next) { next.focus(); next.select?.(); }
            });
            input.addEventListener('paste', (e) => {
                const text = e.clipboardData?.getData('text') || '';
                if (!/[\t\n]/.test(text.trim())) {
                    if (input.type === 'datetime-local') {
                        const v = parsePastedDate(text);
                        if (v) { e.preventDefault(); input.value = v; input.dispatchEvent(new Event('change')); }
                    }
                    return;
                }
                e.preventDefault();
                pasteBlock(input, text);
            });
        });
    }

    // A block copied from Excel: rows go down the reactors, tab-separated cells go across the editable columns
    function pasteBlock(input, text) {
        const tbody = input.closest('tbody');
        const trs = [...tbody.querySelectorAll('tr')];
        const fieldsOf = (tr) => [...tr.querySelectorAll('input.liq-in')];
        const r0 = trs.indexOf(input.closest('tr'));
        const c0 = fieldsOf(trs[r0]).indexOf(input);
        const lines = text.replace(/\r/g, '').split('\n');
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        let filled = 0;
        lines.forEach((line, i) => {
            const tr = trs[r0 + i];
            if (!tr) return;
            line.split('\t').forEach((cell, j) => {
                const target = fieldsOf(tr)[c0 + j];
                if (!target) return;
                const value = target.type === 'datetime-local' ? parsePastedDate(cell) : cell.trim().replace(/^(-?\d+),(\d+)$/, '$1.$2');
                if (target.type === 'datetime-local' && cell.trim() && !value) return;
                target.value = value;
                setField(target.dataset.reactor, target.dataset.field, value);
                filled += 1;
            });
        });
        save();
        render();
        flash(`${filled} cell${filled === 1 ? '' : 's'} pasted.`);
    }

    function flash(message) {
        const el = $('#liqFlash');
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(flash.t);
        flash.t = setTimeout(() => el.classList.remove('show'), 2500);
    }

    // ------------------------------------------------------------ toolbar actions
    function nextName(name) {
        const m = String(name || '').match(/^(.*?)(\d+)$/);
        return m ? `${m[1]}${Number(m[2]) + 1}` : `${name || 'Sample'}-2`;
    }

    function addSample() {
        const last = liq.samples[liq.samples.length - 1];
        liq.samples.push({ name: nextName(last?.name || 'C1-S0'), twoPhase: Boolean(last?.twoPhase), rows: {} });
        liq.active = liq.samples.length - 1;
        save(); render();
        $('#liqSampleName').focus();
        $('#liqSampleName').select();
    }

    function applyToAll(fields) {
        const { shown, active } = reactors();
        const rows = liq.samples[liq.active].rows;
        shown.filter(r => active.has(r)).forEach(r => { rows[r] = { ...(rows[r] || {}), ...fields }; });
        save(); render();
    }

    function bindToolbar() {
        $('#onlineTabGas').onclick = () => setTab('gas');
        $('#onlineTabLiquid').onclick = () => setTab('liquid');
        $('#liqFeedCarbon').addEventListener('input', () => {
            liq.feedCarbon = $('#liqFeedCarbon').value; save();
            reactors().shown.forEach(r => refreshRow(r));
        });
        $('#liqSampleName').addEventListener('input', () => {
            liq.samples[liq.active].name = $('#liqSampleName').value.trim(); save(); renderTabs(context());
        });
        $('#liqTwoPhase').onchange = () => { liq.samples[liq.active].twoPhase = $('#liqTwoPhase').checked; save(); render(); };
        $('#liqShowAll').onchange = () => { liq.showAll = $('#liqShowAll').checked; save(); render(); };
        $('#liqApplyTimes').onclick = () => {
            const start = $('#liqAllStart').value, end = $('#liqAllEnd').value;
            if (!start && !end) { flash('Enter a start and/or finish time first.'); return; }
            applyToAll({ ...(start ? { start } : {}), ...(end ? { end } : {}) });
            flash('Sampling window applied to every reactor of this sample.');
        };
        $('#liqApplyCarbon').onclick = () => {
            const c = $('#liqAllCarbon').value;
            if (num(c) === null) { flash('Enter a Carbon wt% first.'); return; }
            applyToAll({ c });
            flash('Carbon wt% applied to every reactor of this sample.');
        };
        $('#liqRemoveSample').onclick = () => {
            if (liq.samples.length <= 1) return;
            const s = liq.samples[liq.active];
            if (!window.confirm(`Remove sample ${s.name || liq.active + 1} and its entries?`)) return;
            liq.samples.splice(liq.active, 1);
            liq.active = Math.max(0, liq.active - 1);
            save(); render();
        };
    }

    function setTab(tab) {
        liq.tab = general() ? tab : 'gas';
        save();
        syncTabs();
        if (liq.tab === 'liquid') render();
    }

    function syncTabs() {
        const isMB = general();
        const tab = isMB ? liq.tab : 'gas';
        $('#onlinePhaseTabs').hidden = !isMB;
        $('#onlineGasPanel').hidden = tab !== 'gas';
        $('#onlineLiquidPanel').hidden = tab !== 'liquid';
        $('#onlineTabGas').classList.toggle('active', tab === 'gas');
        $('#onlineTabLiquid').classList.toggle('active', tab === 'liquid');
        $('#onlineTabGas').setAttribute('aria-selected', String(tab === 'gas'));
        $('#onlineTabLiquid').setAttribute('aria-selected', String(tab === 'liquid'));
        const gasBadge = $('#onlineTabGasBadge');
        if (gasBadge) {
            try { const n = (JSON.parse(sessionStorage.getItem('dhaOnlineState') || 'null')?.rows || []).length; gasBadge.textContent = n ? `${n} lines` : ''; }
            catch (e) { gasBadge.textContent = ''; }
        }
    }

    load();
    bindToolbar();
    syncTabs();
    render();
    window.ILSLiquid = { results: allResults, render, syncTabs };
})();
