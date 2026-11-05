// Custom Table Studio Controller & Cross-Table Formula Engine (v4.1)

const FIC_MAPPING = {
    1: "10i1FIC01", 2: "10i1FIC02", 3: "10i1FIC03", 4: "10i1FIC04",
    5: "10i2FIC01", 6: "10i2FIC02", 7: "10i2FIC03", 8: "10i2FIC04"
};
const TEMPERATURE_MAPPING = {
    1: "10i1TIC02", 2: "10i1TIC02", 3: "10i1TIC02", 4: "10i1TIC02",
    5: "10i2TIC02", 6: "10i2TIC02", 7: "10i2TIC02", 8: "10i2TIC02"
};
const PRESSURE_MAPPING = {
    1: "10i1PIC01", 2: "10i1PIC01", 3: "10i1PIC01", 4: "10i1PIC01",
    5: "10i2PIC01", 6: "10i2PIC01", 7: "10i2PIC01", 8: "10i2PIC01"
};

const BASE_TABLE_COLUMNS = [
    'DateTime', 'TOS[h]', 'Reactor', 'ESTD_H2', 'ESTD_N2', 'N2[SLPH]',
    'Temperature', 'Pressure', 'Naphtha_online', 'H2_out',
    'Naphtha_out', 'Carbon_out', 'Naphtha_in', 'Naphtha/H2'
];

const STANDARD_ONLINE_COLUMNS = [
    "01i14FIC01", "01i14FIC02", "01i14FIC03", "01i14FIC04",
    "01i14FIC05", "01i14FIC06", "01i14FIC07", "01i14FIC08", "01i14FI01",
    "10i1FIC01", "10i1FIC02", "10i1FIC03", "10i1FIC04",
    "10i2FIC01", "10i2FIC02", "10i2FIC03", "10i2FIC04",
    "10i1TIC02", "10i2TIC02", "10i1PIC01", "10i2PIC01",
    "ESTD_H2", "ESTD_N2", "ESTD_CH4", "ESTD_CO", "ESTD_CO2",
    "ESTD_Ethane", "ESTD_Ethylene", "ESTD_Acetylene", "ESTD_Propane",
    "ESTD_Propylene", "ESTD_Propadiene", "ESTD_i-Butane", "ESTD_n-Butane",
    "ESTD_Pentane", "ESTD_Hexane", "ESTD_Benzene", "ESTD_Toluene",
    "ESTD_m-Xylene", "ESTD_o-Xylene", "ESTD_p-Xylene", "ESTD_Ethylbenzene"
];

// Column names such as "Unidentified(<C3)" must be escaped before going into innerHTML
function escapeColumnHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Industrial DHA format (same columns as Offline Table-2)
const STANDARD_TABLE2_COLUMNS = [
    "Propane", "i-Butane", "n-Butane", "i-Pentane", "n-Pentane",
    "2,2-Dimethylbutane", "2,3-Dimethylbutane", "2-Methylpentane", "3-Methylpentane", "n-Hexane",
    "Methylcyclopentane", "2-Methylhexane", "3-Methylhexane", "n-Heptane", "n-Octane",
    "C3 & Below", "C3-C4", "C4-C5", "C5-C6", "C6-C7", "C7-C8", "C8+"
];

const DEMO_BASE_ROWS = [
    { DateTime: "2026-08-10 10:00:00", "TOS[h]": 0.0, Reactor: "R1", ESTD_H2: 15.2, ESTD_N2: 4.8, "N2[SLPH]": 10.0, Temperature: 145.0, Pressure: 30.5, Naphtha_online: 80.0, H2_out: 4.12, Naphtha_out: 35.2, Carbon_out: 29.4, Naphtha_in: 35.2, "Naphtha/H2": 8.5 },
    { DateTime: "2026-08-10 11:00:00", "TOS[h]": 1.0, Reactor: "R1", ESTD_H2: 15.5, ESTD_N2: 4.6, "N2[SLPH]": 10.2, Temperature: 145.2, Pressure: 30.6, Naphtha_online: 79.9, H2_out: 4.25, Naphtha_out: 35.8, Carbon_out: 29.9, Naphtha_in: 35.8, "Naphtha/H2": 8.3 },
    { DateTime: "2026-08-10 12:00:00", "TOS[h]": 2.0, Reactor: "R2", ESTD_H2: 14.8, ESTD_N2: 5.1, "N2[SLPH]": 9.8, Temperature: 148.0, Pressure: 31.0, Naphtha_online: 80.1, H2_out: 3.98, Naphtha_out: 34.5, Carbon_out: 28.8, Naphtha_in: 34.5, "Naphtha/H2": 8.7 },
    { DateTime: "2026-08-10 13:00:00", "TOS[h]": 3.0, Reactor: "R2", ESTD_H2: 15.0, ESTD_N2: 5.0, "N2[SLPH]": 10.0, Temperature: 148.5, Pressure: 31.2, Naphtha_online: 80.0, H2_out: 4.05, Naphtha_out: 35.0, Carbon_out: 29.3, Naphtha_in: 35.0, "Naphtha/H2": 8.6 },
    { DateTime: "2026-08-10 14:00:00", "TOS[h]": 4.0, Reactor: "R3", ESTD_H2: 16.0, ESTD_N2: 4.2, "N2[SLPH]": 10.5, Temperature: 150.0, Pressure: 32.0, Naphtha_online: 79.8, H2_out: 4.45, Naphtha_out: 36.2, Carbon_out: 30.3, Naphtha_in: 36.2, "Naphtha/H2": 8.1 },
    { DateTime: "2026-08-10 15:00:00", "TOS[h]": 5.0, Reactor: "R3", ESTD_H2: 16.2, ESTD_N2: 4.0, "N2[SLPH]": 10.8, Temperature: 150.3, Pressure: 32.1, Naphtha_online: 79.8, H2_out: 4.58, Naphtha_out: 36.8, Carbon_out: 30.8, Naphtha_in: 36.8, "Naphtha/H2": 8.0 }
];

const customState = {
    baseRows: [],
    baseColumns: [...BASE_TABLE_COLUMNS],
    onlineRows: [],
    onlineColumns: [...STANDARD_ONLINE_COLUMNS],
    table2Rows: [],
    table2Columns: [...STANDARD_TABLE2_COLUMNS],
    feedTags: [],
    customColumns: [],
    computedRows: [],
    removedColumns: new Set(),
    editColIndex: -1,
    sourceFile: ''
};

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// -----------------------------------------------------------------------------
// Safe Expression Tokenizer & Parser (Zero eval())
// -----------------------------------------------------------------------------
function extractRefs(formula) {
    if (!formula) return [];
    const refs = [];
    let i = 0;
    const n = formula.length;
    while (i < n) {
        if (formula[i] === '[') {
            let depth = 1;
            const start = i + 1;
            i++;
            while (i < n && depth > 0) {
                if (formula[i] === '[') depth++;
                else if (formula[i] === ']') depth--;
                i++;
            }
            if (depth === 0) {
                const col = formula.substring(start, i - 1);
                if (col && !refs.includes(col)) refs.push(col);
            }
        } else {
            i++;
        }
    }
    return refs;
}

const TOKEN_TYPES = {
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    IDENT: 'IDENT',
    COL: 'COL',
    OP: 'OP',
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    COMMA: 'COMMA'
};

function tokenize(input) {
    let s = input.trim();
    if (s.startsWith('=')) s = s.substring(1).trim();

    const tokens = [];
    let i = 0;
    const n = s.length;

    while (i < n) {
        const ch = s[i];

        if (/\s/.test(ch)) { i++; continue; }

        if (ch === '[') {
            let depth = 1;
            const start = i + 1;
            i++;
            while (i < n && depth > 0) {
                if (s[i] === '[') depth++;
                else if (s[i] === ']') depth--;
                i++;
            }
            if (depth !== 0) throw new Error('Unclosed bracket in column reference');
            tokens.push({ type: TOKEN_TYPES.COL, value: s.substring(start, i - 1) });
            continue;
        }

        if (ch === '"' || ch === "'") {
            const quote = ch;
            const start = i + 1;
            i++;
            while (i < n && s[i] !== quote) i++;
            if (i >= n) throw new Error('Unterminated string literal');
            tokens.push({ type: TOKEN_TYPES.STRING, value: s.substring(start, i) });
            i++;
            continue;
        }

        if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < n && /[0-9]/.test(s[i + 1]))) {
            const start = i;
            while (i < n && /[0-9.]/.test(s[i])) i++;
            tokens.push({ type: TOKEN_TYPES.NUMBER, value: parseFloat(s.substring(start, i)) });
            continue;
        }

        if (ch === '(') { tokens.push({ type: TOKEN_TYPES.LPAREN, value: '(' }); i++; continue; }
        if (ch === ')') { tokens.push({ type: TOKEN_TYPES.RPAREN, value: ')' }); i++; continue; }
        if (ch === ',') { tokens.push({ type: TOKEN_TYPES.COMMA, value: ',' }); i++; continue; }

        if (ch === '<' || ch === '>' || ch === '=' || ch === '!') {
            let op = ch;
            if (i + 1 < n && s[i + 1] === '=') { op += '='; i++; }
            else if (ch === '<' && i + 1 < n && s[i + 1] === '>') { op = '!='; i++; }
            tokens.push({ type: TOKEN_TYPES.OP, value: op === '=' ? '==' : op });
            i++;
            continue;
        }

        if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '%') {
            tokens.push({ type: TOKEN_TYPES.OP, value: ch });
            i++;
            continue;
        }

        if (/[a-zA-Z_]/.test(ch)) {
            const start = i;
            while (i < n && /[a-zA-Z0-9_]/.test(s[i])) i++;
            tokens.push({ type: TOKEN_TYPES.IDENT, value: s.substring(start, i).toUpperCase() });
            continue;
        }

        throw new Error(`Unexpected character: '${ch}' at position ${i}`);
    }

    return tokens;
}

class SafeExpressionParser {
    constructor(tokens, rowEnv) {
        this.tokens = tokens;
        this.env = rowEnv || {};
        this.pos = 0;
    }

    peek() { return this.tokens[this.pos]; }
    consume() { return this.tokens[this.pos++]; }

    parse() {
        if (!this.tokens.length) return null;
        const res = this.parseExpression();
        if (this.pos < this.tokens.length) {
            throw new Error(`Unexpected token '${this.peek().value}' after expression`);
        }
        return res;
    }

    parseExpression() { return this.parseComparison(); }

    parseComparison() {
        let left = this.parseAdditive();
        while (this.peek() && this.peek().type === TOKEN_TYPES.OP && ['==', '!=', '<', '<=', '>', '>='].includes(this.peek().value)) {
            const op = this.consume().value;
            const right = this.parseAdditive();
            if (left === null || right === null) left = (op === '==' ? left === right : (op === '!=' ? left !== right : false));
            else if (op === '==') left = left === right;
            else if (op === '!=') left = left !== right;
            else if (op === '<') left = left < right;
            else if (op === '<=') left = left <= right;
            else if (op === '>') left = left > right;
            else if (op === '>=') left = left >= right;
        }
        return left;
    }

    parseAdditive() {
        let left = this.parseMultiplicative();
        while (this.peek() && this.peek().type === TOKEN_TYPES.OP && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.consume().value;
            const right = this.parseMultiplicative();
            if (left === null || right === null) left = null;
            else left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    parseMultiplicative() {
        let left = this.parsePower();
        while (this.peek() && this.peek().type === TOKEN_TYPES.OP && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
            const op = this.consume().value;
            const right = this.parsePower();
            if (left === null || right === null) left = null;
            else if (op === '*') left = left * right;
            else if (op === '/') left = (right !== 0 && !isNaN(right)) ? left / right : null;
            else if (op === '%') left = (right !== 0) ? left % right : null;
        }
        return left;
    }

    parsePower() {
        let left = this.parseUnary();
        while (this.peek() && this.peek().type === TOKEN_TYPES.OP && this.peek().value === '^') {
            this.consume();
            const right = this.parseUnary();
            if (left === null || right === null) left = null;
            else left = Math.pow(left, right);
        }
        return left;
    }

    parseUnary() {
        if (this.peek() && this.peek().type === TOKEN_TYPES.OP && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.consume().value;
            const val = this.parseUnary();
            if (val === null) return null;
            return op === '-' ? -val : +val;
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const token = this.consume();
        if (!token) throw new Error('Unexpected end of formula');

        if (token.type === TOKEN_TYPES.NUMBER) return token.value;
        if (token.type === TOKEN_TYPES.STRING) return token.value;

        if (token.type === TOKEN_TYPES.COL) {
            const val = this.env[token.value];
            if (val === undefined || val === null || val === '') return null;
            const num = Number(val);
            return (!isNaN(num) && typeof val !== 'boolean') ? num : String(val);
        }

        if (token.type === TOKEN_TYPES.LPAREN) {
            const expr = this.parseExpression();
            const next = this.consume();
            if (!next || next.type !== TOKEN_TYPES.RPAREN) throw new Error('Missing closing parenthesis )');
            return expr;
        }

        if (token.type === TOKEN_TYPES.IDENT) {
            const fnName = token.value;
            if (!this.peek() || this.peek().type !== TOKEN_TYPES.LPAREN) {
                if (fnName === 'TRUE') return true;
                if (fnName === 'FALSE') return false;
                if (fnName === 'NULL') return null;
                throw new Error(`Expected ( after function name ${fnName}`);
            }
            this.consume(); // (
            const args = [];
            if (this.peek() && this.peek().type !== TOKEN_TYPES.RPAREN) {
                args.push(this.parseExpression());
                while (this.peek() && this.peek().type === TOKEN_TYPES.COMMA) {
                    this.consume();
                    args.push(this.parseExpression());
                }
            }
            const closing = this.consume();
            if (!closing || closing.type !== TOKEN_TYPES.RPAREN) throw new Error(`Missing ) for function ${fnName}`);

            return this.executeFunction(fnName, args);
        }

        throw new Error(`Unexpected token: ${token.value}`);
    }

    executeFunction(name, args) {
        switch (name) {
            case 'IF':
                return args[0] ? args[1] : (args[2] !== undefined ? args[2] : null);
            case 'SAFE_DIV': {
                const num = args[0];
                const den = args[1];
                const def = args[2] !== undefined ? args[2] : null;
                return (den !== null && den !== 0 && !isNaN(den)) ? num / den : def;
            }
            case 'ROUND':
                if (args[0] === null || isNaN(args[0])) return null;
                const dec = args[1] !== undefined ? Number(args[1]) : 2;
                return Number(Number(args[0]).toFixed(dec));
            case 'ABS':
                return args[0] !== null ? Math.abs(args[0]) : null;
            case 'MIN': {
                const valid = args.filter(a => a !== null && !isNaN(a));
                return valid.length ? Math.min(...valid) : null;
            }
            case 'MAX': {
                const valid = args.filter(a => a !== null && !isNaN(a));
                return valid.length ? Math.max(...valid) : null;
            }
            case 'AVG': {
                const valid = args.filter(a => a !== null && !isNaN(a));
                return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
            }
            case 'SUM': {
                const valid = args.filter(a => a !== null && !isNaN(a));
                return valid.reduce((a, b) => a + b, 0);
            }
            case 'SQRT':
                return (args[0] !== null && args[0] >= 0) ? Math.sqrt(args[0]) : null;
            case 'POW':
                return (args[0] !== null && args[1] !== null) ? Math.pow(args[0], args[1]) : null;
            default:
                throw new Error(`Unsupported function: ${name}`);
        }
    }
}

function evaluateFormula(formula, rowEnv) {
    if (!formula || !formula.trim()) return null;
    const tokens = tokenize(formula);
    const parser = new SafeExpressionParser(tokens, rowEnv);
    return parser.parse();
}

function validateClientFormula(formula, availableColumns) {
    if (!formula || !formula.trim()) return { valid: false, message: 'Formula cannot be empty', refs: [] };
    try {
        const refs = extractRefs(formula);
        if (availableColumns && availableColumns.length) {
            const availSet = new Set(availableColumns);
            const missing = refs.filter(r => !availSet.has(r));
            if (missing.length) {
                return { valid: false, message: `Unknown column(s): ${missing.join(', ')}`, refs };
            }
        }
        const tokens = tokenize(formula);
        const dummyEnv = {};
        refs.forEach(r => { dummyEnv[r] = 1.0; });
        const parser = new SafeExpressionParser(tokens, dummyEnv);
        parser.parse();
        return { valid: true, message: '✓ Valid formula', refs };
    } catch (e) {
        return { valid: false, message: e.message || 'Syntax error', refs: [] };
    }
}

// -----------------------------------------------------------------------------
// Cycle Detection & Topological Order
// -----------------------------------------------------------------------------
function checkCycle(columnsList) {
    const colMap = new Map();
    columnsList.forEach(c => colMap.set(c.name, c));

    const adj = new Map();
    columnsList.forEach(c => {
        const refs = extractRefs(c.formula);
        const internalRefs = refs.filter(r => colMap.has(r));
        adj.set(c.name, internalRefs);
    });

    const visited = new Map();
    let cyclePath = null;

    function dfs(node, path) {
        visited.set(node, 1);
        const neighbors = adj.get(node) || [];
        for (const next of neighbors) {
            if (visited.get(next) === 1) {
                const idx = path.indexOf(next);
                cyclePath = [...path.slice(idx), next];
                return true;
            }
            if (!visited.has(next) || visited.get(next) === 0) {
                if (dfs(next, [...path, next])) return true;
            }
        }
        visited.set(node, 2);
        return false;
    }

    for (const name of colMap.keys()) {
        if (!visited.has(name) || visited.get(name) === 0) {
            if (dfs(name, [name])) break;
        }
    }

    return cyclePath;
}

function sortExecutionOrder(columnsList) {
    const cycle = checkCycle(columnsList);
    if (cycle) throw new Error(`Circular reference detected: ${cycle.join(' → ')}`);

    const colMap = new Map();
    columnsList.forEach(c => colMap.set(c.name, c));

    const inDegree = new Map();
    const dependents = new Map();
    columnsList.forEach(c => {
        inDegree.set(c.name, 0);
        dependents.set(c.name, []);
    });

    columnsList.forEach(c => {
        const refs = extractRefs(c.formula);
        refs.forEach(ref => {
            if (colMap.has(ref)) {
                inDegree.set(c.name, inDegree.get(c.name) + 1);
                dependents.get(ref).push(c.name);
            }
        });
    });

    const queue = [];
    inDegree.forEach((deg, name) => {
        if (deg === 0) queue.push(name);
    });

    const ordered = [];
    while (queue.length) {
        const curr = queue.shift();
        ordered.push(colMap.get(curr));
        (dependents.get(curr) || []).forEach(dep => {
            inDegree.set(dep, inDegree.get(dep) - 1);
            if (inDegree.get(dep) === 0) queue.push(dep);
        });
    }

    return ordered;
}

// -----------------------------------------------------------------------------
// Cross-Table Data Ingestion & Alignment
// -----------------------------------------------------------------------------
function readSavedState(key, populatedKeys) {
    try {
        const storages = [sessionStorage, localStorage];
        for (const s of storages) {
            try {
                const raw = s.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && populatedKeys.some(k => Array.isArray(parsed[k]) && parsed[k].length)) {
                        return parsed;
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    return null;
}

function parseDateTimeSafe(val) {
    if (!val) return null;
    const time = dateTimeTimestamp(val);
    return Number.isFinite(time) ? new Date(time) : null;
}

function dateHourKey(val) {
    const d = parseDateTimeSafe(val);
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${d.getHours()}`;
}

function normalizeReactorName(val) {
    if (!val) return '';
    const clean = String(val).replace(/[Rr]/g, '').trim();
    const num = parseInt(clean, 10);
    return (num >= 1 && num <= 8) ? `R${num}` : String(val).toUpperCase();
}

function syncAllDataSources() {
    showCustomError();

    let feedRows = [];
    try {
        const rawFeed = sessionStorage.getItem('ils_feed_properties') || sessionStorage.getItem('runPlanDashboardState');
        if (rawFeed) {
            const feed = JSON.parse(rawFeed);
            feedRows = Array.isArray(feed) ? feed : (feed.feedRows || []);
        }
    } catch (e) {}
    const feedTags = new Map();
    feedRows.forEach(row => {
        const component = String(row.component ?? '').trim();
        if (component) feedTags.set(`Feed.${component}`, row.value);
    });
    customState.feedTags = Array.from(feedTags, ([name, value]) => ({ name, value }));

    // 1. Ingest Online Analysis rows & columns
    const online = readSavedState('dhaOnlineState', ['rows']);
    if (online && Array.isArray(online.rows) && online.rows.length) {
        customState.onlineRows = sortDateTimeRows(online.rows);
        customState.onlineColumns = online.columns && online.columns.length ? online.columns : Object.keys(online.rows[0]);
        customState.sourceFile = online.path ? online.path.split(/[\\/]/).pop() : 'Online Analysis';
    } else {
        customState.onlineRows = [];
        customState.onlineColumns = [...STANDARD_ONLINE_COLUMNS];
    }

    // 2. Ingest Table-2 (Offline Analysis) rows & columns
    const offline = readSavedState('dhaDashboardState', ['r2', 'table2_rows']);
    const t2Rows = offline ? (offline.r2 || offline.table2_rows || []) : [];
    if (t2Rows.length) {
        customState.table2Rows = sortDateTimeRows(t2Rows);
        const t2Cols = (offline.table2_columns || offline.c2 || Object.keys(t2Rows[0])).filter(c => !['File Name', 'UID'].includes(c));
        customState.table2Columns = t2Cols;
    } else {
        customState.table2Rows = [];
        customState.table2Columns = [...STANDARD_TABLE2_COLUMNS];
    }

    // 3. Reconstruct Base Table (Primary Table)
    if (customState.onlineRows.length) {
        // Reconstruct from online rows
        let carbon = 83.61;
        let mw = 88.55;
        if (feedRows.length > 0 && feedRows[0].value) carbon = parseFloat(feedRows[0].value) || carbon;
        if (feedRows.length > 2 && feedRows[2].value) mw = parseFloat(feedRows[2].value) || mw;

        const firstRowTime = customState.onlineRows.length
            ? parseDateTimeSafe(customState.onlineRows[0].DateTime || customState.onlineRows[0]['Date/Time'])
            : null;

        const reconstructed = customState.onlineRows.map((row, idx) => {
            const rNum = parseInt(String(row.Reactor || row.Sampled_reactor || '').replace(/[Rr]/g, '').trim(), 10);
            const ficCol = rNum ? FIC_MAPPING[rNum] : null;
            const tempCol = rNum ? TEMPERATURE_MAPPING[rNum] : null;
            const pressCol = rNum ? PRESSURE_MAPPING[rNum] : null;

            const n2Slph = (ficCol && row[ficCol] !== undefined) ? Number(row[ficCol]) / 1000 : null;
            const temp = (tempCol && row[tempCol] !== undefined) ? Number(row[tempCol]) : null;
            const press = (pressCol && row[pressCol] !== undefined) ? Number(row[pressCol]) : null;

            const estdH2 = (row.ESTD_H2 !== undefined) ? Number(row.ESTD_H2) : null;
            const estdN2 = (row.ESTD_N2 !== undefined) ? Number(row.ESTD_N2) : null;

            let naphthaOnline = null, h2Out = null, naphthaOut = null, carbonOut = null, naphthaIn = null, naphthaH2 = null;
            if (estdH2 !== null && estdN2 !== null) {
                naphthaOnline = 100 - (estdH2 + estdN2);
                if (n2Slph !== null && estdN2 !== 0) {
                    const n2Ratio = estdN2 / 100;
                    const h2Ratio = estdH2 / 100;
                    const naphthaRatio = naphthaOnline / 100;
                    h2Out = (n2Slph / n2Ratio) * h2Ratio * 0.0416 * 2;
                    naphthaOut = (n2Slph / n2Ratio) * naphthaRatio * 0.0416 * mw;
                    carbonOut = (naphthaOut * carbon) / 100;
                    naphthaIn = (carbon !== 0) ? (carbonOut / (carbon / 100)) : naphthaOut;
                }
                if (estdH2 !== 0) {
                    naphthaH2 = (naphthaOnline * mw) / (estdH2 * 2);
                }
            }

            const dt = row.DateTime || row['Date/Time'] || '';
            const reactor = row.Reactor || row.Sampled_reactor || '';
            const rowTime = idx === 0 ? firstRowTime : parseDateTimeSafe(dt);
            const tosHours = (idx === 0 || !firstRowTime || !rowTime)
                ? (idx === 0 ? 0.0 : null)
                : (rowTime.getTime() - firstRowTime.getTime()) / 3600000;

            return {
                DateTime: dt,
                Reactor: reactor,
                'TOS[h]': tosHours,
                ESTD_H2: estdH2,
                ESTD_N2: estdN2,
                'N2[SLPH]': n2Slph,
                Temperature: temp,
                Pressure: press,
                Naphtha_online: naphthaOnline,
                H2_out: h2Out,
                Naphtha_out: naphthaOut,
                Carbon_out: carbonOut,
                Naphtha_in: naphthaIn,
                'Naphtha/H2': naphthaH2
            };
        });

        customState.baseRows = reconstructed;
        customState.baseColumns = [...BASE_TABLE_COLUMNS];
    } else {
        // Fall back to DEMO_BASE_ROWS so UI is immediately usable
        customState.baseRows = JSON.parse(JSON.stringify(DEMO_BASE_ROWS));
        customState.baseColumns = [...BASE_TABLE_COLUMNS];
        customState.sourceFile = 'Demo Pilot Base Conditions (Ready for Calculation)';
    }

    recalculateTable();
    updateUI();
}

// -----------------------------------------------------------------------------
// Cross-Table Row Evaluation Environment
// -----------------------------------------------------------------------------
function resolveCrossTableRow(baseRow, rowIndex) {
    const env = { ...baseRow };
    const origins = {};

    // 1. Mark Base Table origin
    Object.keys(baseRow).forEach(k => { origins[k] = 'Base Table'; });

    customState.feedTags.forEach(({ name, value }) => {
        env[name] = value;
        origins[name] = 'Run Plan Feed';
    });

    // 2. Cross-reference Online Analysis row (by DateTime or index)
    let onlineRow = null;
    if (customState.onlineRows.length) {
        if (rowIndex < customState.onlineRows.length) {
            onlineRow = customState.onlineRows[rowIndex];
        }
    }
    if (onlineRow) {
        Object.keys(onlineRow).forEach(k => {
            if (env[k] === undefined || env[k] === null) {
                env[k] = onlineRow[k];
                origins[k] = 'Online Analysis';
            }
        });
    }

    // 3. Cross-reference Table-2 (Offline Component List) by Date-Hour & Reactor
    if (customState.table2Rows.length) {
        const baseDt = baseRow.DateTime;
        const baseKey = dateHourKey(baseDt);
        const baseReactor = normalizeReactorName(baseRow.Reactor);

        let matchT2 = null;
        for (const t2 of customState.table2Rows) {
            const t2Key = dateHourKey(t2.DateTime);
            const t2Reactor = normalizeReactorName(t2['Active Reactor'] || t2.Reactor || t2.Sampled_reactor);

            if (baseKey && t2Key && baseKey === t2Key) {
                if (!baseReactor || !t2Reactor || baseReactor === t2Reactor) {
                    matchT2 = t2;
                    break;
                }
            }
        }

        if (matchT2) {
            Object.keys(matchT2).forEach(k => {
                if (env[k] === undefined || env[k] === null) {
                    env[k] = matchT2[k];
                    origins[k] = 'Offline Table-2';
                }
            });
        }
    }

    return { env, origins };
}

function recalculateTable() {
    if (!customState.baseRows.length) {
        customState.computedRows = [];
        sessionStorage.removeItem('ils_custom_table_state');
        return;
    }

    let orderedCols = [];
    try {
        orderedCols = sortExecutionOrder(customState.customColumns);
    } catch (e) {
        showCustomError(e.message);
        return;
    }

    const processed = customState.baseRows.map(r => ({ ...r }));

    orderedCols.forEach(colSpec => {
        const colName = colSpec.name;
        const formula = colSpec.formula;
        const decimals = colSpec.decimals !== undefined ? colSpec.decimals : 2;

        processed.forEach((row, idx) => {
            try {
                const { env } = resolveCrossTableRow(row, idx);
                const res = evaluateFormula(formula, env);
                if (res !== null && typeof res === 'number' && !isNaN(res) && isFinite(res)) {
                    row[colName] = Number(res.toFixed(decimals));
                } else {
                    row[colName] = res;
                }
            } catch (err) {
                row[colName] = null;
            }
        });
    });

    customState.computedRows = processed;
    try {
        sessionStorage.setItem('ils_custom_table_state', JSON.stringify({
            columns: customState.customColumns.map(col => col.name),
            rows: processed
        }));
    } catch (e) {}
}

// -----------------------------------------------------------------------------
// Tag Accordions & UI Rendering
// -----------------------------------------------------------------------------
function showCustomError(msg = '') {
    const el = $('#customError');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('show', Boolean(msg));
}

function getAllAvailableTags() {
    const all = new Set([
        ...customState.baseColumns,
        ...customState.feedTags.map(tag => tag.name),
        ...customState.onlineColumns,
        ...customState.table2Columns,
        ...customState.customColumns.map(c => c.name)
    ]);
    return Array.from(all);
}

function renderPills(containerId, columnList, filterQuery = '') {
    const container = $(`#${containerId}`);
    if (!container) return 0;
    const q = filterQuery.toLowerCase().trim();
    const filtered = columnList.filter(col => !q || col.toLowerCase().includes(q));

    if (!filtered.length) {
        container.innerHTML = `<span style="font-size:11px; color:var(--slate); font-style:italic;">No matching tags</span>`;
        return 0;
    }

    container.innerHTML = filtered.map(col => `<button type="button" class="col-pill" data-col="${col}">[${escapeColumnHtml(col)}]</button>`).join('');

    container.querySelectorAll('.col-pill').forEach(btn => {
        btn.onclick = () => insertColIntoFormula(btn.getAttribute('data-col'));
    });

    return filtered.length;
}

function renderFeedPills(filterQuery = '') {
    const container = $('#pillsFeed');
    if (!container) return 0;
    const query = filterQuery.toLowerCase().trim();
    const tags = customState.feedTags.filter(tag => !query || tag.name.toLowerCase().includes(query));
    container.replaceChildren();
    if (!tags.length) {
        const empty = document.createElement('span');
        empty.textContent = 'No matching tags';
        container.append(empty);
    }
    tags.forEach(({ name, value }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'col-pill';
        button.textContent = `[${name}]${value === '' || value == null ? '' : `  ${value}`}`;
        button.onclick = () => insertColIntoFormula(name);
        container.append(button);
    });
    return tags.length;
}

function renderAllTagAccordions(filterQuery = '') {
    const baseCount = renderPills('pillsBaseTable', customState.baseColumns, filterQuery);
    const feedCount = renderFeedPills(filterQuery);
    const t2Count = renderPills('pillsTable2', customState.table2Columns, filterQuery);
    const onlineCount = renderPills('pillsOnline', customState.onlineColumns, filterQuery);
    const customCount = renderPills('pillsCustom', customState.customColumns.map(c => c.name), filterQuery);

    if ($('#badgeCountBase')) $('#badgeCountBase').textContent = `${baseCount} tags`;
    if ($('#badgeCountFeed')) $('#badgeCountFeed').textContent = `${feedCount} tags`;
    if ($('#badgeCountTable2')) $('#badgeCountTable2').textContent = `${t2Count} tags`;
    if ($('#badgeCountOnline')) $('#badgeCountOnline').textContent = `${onlineCount} tags`;
    if ($('#badgeCountCustom')) $('#badgeCountCustom').textContent = `${customCount} tags`;

    // If searching, auto-expand accordions that have matching tags
    if (filterQuery.trim()) {
        if (baseCount > 0) $('#accBaseTable')?.classList.add('open');
        if (feedCount > 0) $('#accFeed')?.classList.add('open');
        if (t2Count > 0) $('#accTable2')?.classList.add('open');
        if (onlineCount > 0) $('#accOnline')?.classList.add('open');
        if (customCount > 0) $('#accCustom')?.classList.add('open');
    }
}

function toggleAccordion(accId) {
    const el = $(`#${accId}`);
    if (el) el.classList.toggle('open');
}
window.toggleAccordion = toggleAccordion;

function insertColIntoFormula(colName) {
    const input = $('#customFormulaInput');
    if (!input) return;
    const tag = `[${colName}]`;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const val = input.value;
    input.value = val.substring(0, start) + tag + val.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + tag.length;
    updateLivePreview();
}

function updateLivePreview() {
    const formula = ($('#customFormulaInput')?.value || '').trim();
    const badge = $('#syntaxBadge');
    const availableTags = getAllAvailableTags();

    const check = validateClientFormula(formula, availableTags);

    if (badge) {
        if (!formula) {
            badge.className = 'syntax-badge';
            badge.textContent = 'Enter formula above';
        } else if (check.valid) {
            badge.className = 'syntax-badge valid';
            badge.textContent = '✓ Ready to evaluate';
        } else {
            badge.className = 'syntax-badge invalid';
            badge.textContent = `✗ ${check.message}`;
        }
    }

    // Live preview on first 3 rows of Base Table
    const sampleRows = customState.baseRows.slice(0, 3);
    const pEls = [$('#previewR1'), $('#previewR2'), $('#previewR3')];

    pEls.forEach((el, idx) => {
        if (!el) return;
        if (!check.valid || !sampleRows[idx]) {
            el.textContent = '—';
            return;
        }
        try {
            const { env } = resolveCrossTableRow(sampleRows[idx], idx);
            const res = evaluateFormula(formula, env);
            const decimals = parseInt($('#customColDecimals')?.value || '2', 10);
            el.textContent = (res !== null && typeof res === 'number') ? res.toFixed(decimals) : (res ?? 'null');
        } catch (e) {
            el.textContent = 'Error';
        }
    });
}

function renderActiveColumnsList() {
    const list = $('#activeColumnsList');
    if (!list) return;

    if (!customState.customColumns.length) {
        list.innerHTML = '<span style="font-size:12px; color:var(--slate); font-style:italic;">No custom columns added yet.</span>';
        return;
    }

    list.innerHTML = customState.customColumns.map((c, idx) => {
        return `
            <div class="active-col-chip" title="Formula: ${c.formula}">
                <span class="fx-icon">fx</span>
                <span><b>${c.name}</b>${c.unit ? ` (${c.unit})` : ''}</span>
                <button type="button" class="chip-edit" data-index="${idx}" title="Edit formula">Edit</button>
                <button type="button" class="chip-delete" data-index="${idx}" title="Delete column">&times;</button>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.chip-edit').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-index'), 10);
            editCustomColumn(idx);
        };
    });

    list.querySelectorAll('.chip-delete').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-index'), 10);
            deleteCustomColumn(idx);
        };
    });
}

function editCustomColumn(idx) {
    const col = customState.customColumns[idx];
    if (!col) return;
    customState.editColIndex = idx;

    if ($('#customColName')) $('#customColName').value = col.name;
    if ($('#customColUnit')) $('#customColUnit').value = col.unit || '';
    if ($('#customColDecimals')) $('#customColDecimals').value = String(col.decimals !== undefined ? col.decimals : 2);
    if ($('#customFormulaInput')) $('#customFormulaInput').value = col.formula;

    if ($('#btnApplyCol')) $('#btnApplyCol').textContent = '✓ Update Column';
    updateLivePreview();
}

function deleteCustomColumn(idx) {
    customState.customColumns.splice(idx, 1);
    if (customState.editColIndex === idx) clearForm();
    saveCustomColumnsState();
    recalculateTable();
    updateUI();
}

function clearForm() {
    customState.editColIndex = -1;
    if ($('#customColName')) $('#customColName').value = '';
    if ($('#customColUnit')) $('#customColUnit').value = '';
    if ($('#customColDecimals')) $('#customColDecimals').value = '2';
    if ($('#customFormulaInput')) $('#customFormulaInput').value = '';
    if ($('#btnApplyCol')) $('#btnApplyCol').textContent = '+ Apply Calculated Column';
    updateLivePreview();
}

// -----------------------------------------------------------------------------
// Interactive Table Rendering with Column Remover
// -----------------------------------------------------------------------------
function renderTable() {
    customState.computedRows = sortDateTimeRows(customState.computedRows);
    const thead = $('#customThead');
    const tbody = $('#customTbody');
    const empty = $('#customEmpty');
    const badge = $('#customDateBadge');
    const restoreBtn = $('#customRestoreColumns');
    if (!thead || !tbody) return;

    if (!customState.computedRows.length) {
        thead.innerHTML = '';
        tbody.innerHTML = '';
        if (empty) empty.style.display = 'block';
        if (badge) badge.textContent = '';
        if (restoreBtn) restoreBtn.hidden = true;
        return;
    }

    if (empty) empty.style.display = 'none';

    const customColNames = new Set(customState.customColumns.map(c => c.name));
    const allCols = [...customState.baseColumns, ...customState.customColumns.map(c => c.name)];
    const visibleCols = allCols.filter(c => !customState.removedColumns.has(c));

    if (restoreBtn) {
        restoreBtn.hidden = customState.removedColumns.size === 0;
    }

    // Filtering
    const query = ($('#customSearch')?.value || '').toLowerCase().trim();
    const reactor = $('#customReactorFilter')?.value || '';
    const fromVal = $('#customFrom')?.value || '';
    const toVal = $('#customTo')?.value || '';

    const filtered = customState.computedRows.filter(row => {
        const rVal = String(row.Reactor || row.Sampled_reactor || '');
        if (reactor && rVal !== reactor) return false;

        if (fromVal || toVal) {
            const rowDt = new Date(row.DateTime || row['Date/Time']);
            const t = rowDt.getTime();
            if (!isNaN(t)) {
                if (fromVal && t < new Date(fromVal).getTime()) return false;
                if (toVal && t > (new Date(toVal).getTime() + 59999)) return false;
            }
        }

        if (query) {
            return Object.values(row).join(' ').toLowerCase().includes(query);
        }
        return true;
    });

    // Build Table Header with Column Remover button
    thead.innerHTML = visibleCols.map(col => {
        const isCustom = customColNames.has(col);
        const colDef = customState.customColumns.find(c => c.name === col);
        const label = escapeColumnHtml(col + (colDef && colDef.unit ? ` [${colDef.unit}]` : ''));

        const removeBtn = col !== 'DateTime'
            ? `<button type="button" class="online-remove-column" data-col="${col}" title="Remove ${col} column" aria-label="Remove ${col} column">&times;</button>`
            : '';

        if (isCustom) {
            return `<th class="calculated-col-th" title="Formula: ${colDef?.formula}"><span class="fx-pill">fx</span><span>${label}</span>${removeBtn}</th>`;
        }
        return `<th><span>${label}</span>${removeBtn}</th>`;
    }).join('');

    // Wire up column removal
    thead.querySelectorAll('.online-remove-column').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const col = btn.getAttribute('data-col');
            customState.removedColumns.add(col);
            renderTable();
        };
    });

    // Build Table Body
    tbody.innerHTML = filtered.map((row, rIdx) => {
        const cells = visibleCols.map(col => {
            const val = row[col];
            const isCustom = customColNames.has(col);

            if (col === 'DateTime' || col === 'Date/Time') {
                return `<td style="font-weight: 600; white-space: nowrap;">${val ?? ''}</td>`;
            }
            if (col === 'Reactor' || col === 'Sampled_reactor') {
                return `<td style="text-align: center; font-weight: 700; color: var(--primary-accent, #2563eb);">${val ?? ''}</td>`;
            }

            if (isCustom) {
                const formatted = (val !== null && typeof val === 'number') ? val.toFixed(2) : (val ?? '—');
                return `<td class="calculated-cell" data-col="${col}" data-row="${rIdx}" title="Click to audit cross-table calculation lineage">${formatted}</td>`;
            }

            const disp = (val !== null && typeof val === 'number') ? val.toFixed(2) : (val ?? '');
            return `<td>${disp}</td>`;
        }).join('');

        return `<tr>${cells}</tr>`;
    }).join('');

    // Wire up cell audit popovers
    tbody.querySelectorAll('.calculated-cell').forEach(cell => {
        cell.onclick = () => {
            const colName = cell.getAttribute('data-col');
            const rowIdx = parseInt(cell.getAttribute('data-row'), 10);
            openAuditModal(filtered[rowIdx], rowIdx, colName);
        };
    });

    if (badge) {
        badge.textContent = `Showing ${filtered.length} of ${customState.computedRows.length} records`;
    }
}

function updateKPIs() {
    if ($('#kpiRecords')) $('#kpiRecords').textContent = customState.baseRows.length;
    if ($('#kpiBaseParams')) $('#kpiBaseParams').textContent = customState.baseColumns.length;
    if ($('#kpiCrossTags')) $('#kpiCrossTags').textContent = getAllAvailableTags().length;
    if ($('#kpiCustomCols')) $('#kpiCustomCols').textContent = customState.customColumns.length;
    if ($('#tableBaseTitle')) {
        $('#tableBaseTitle').textContent = `Base Table (${customState.sourceFile || 'Reactor Conditions'})`;
    }
}

function updateReactorFilter() {
    const el = $('#customReactorFilter');
    if (!el) return;
    const cur = el.value;
    const reactors = [...new Set(customState.baseRows.map(r => String(r.Reactor || r.Sampled_reactor || '')).filter(Boolean))].sort();
    el.innerHTML = '<option value="">All reactors</option>' + reactors.map(r => `<option value="${r}"${r === cur ? ' selected' : ''}>${r}</option>`).join('');
}

function updateUI() {
    updateKPIs();
    updateReactorFilter();
    renderAllTagAccordions($('#tagSearchBox')?.value || '');
    renderActiveColumnsList();
    renderTable();
    updateLivePreview();
}

// -----------------------------------------------------------------------------
// Cross-Table Audit & Lineage Modal
// -----------------------------------------------------------------------------
function openAuditModal(baseRow, rowIndex, colName) {
    const modal = $('#auditModal');
    const colDef = customState.customColumns.find(c => c.name === colName);
    if (!modal || !colDef || !baseRow) return;

    $('#auditColName').textContent = `${colName} ${colDef.unit ? `[${colDef.unit}]` : ''}`;
    $('#auditFormulaText').textContent = colDef.formula;

    const refs = extractRefs(colDef.formula);
    const { env, origins } = resolveCrossTableRow(baseRow, rowIndex);

    const tbody = $('#auditInputsTbody');
    if (tbody) {
        if (!refs.length) {
            tbody.innerHTML = '<tr><td colspan="3" style="color:var(--slate);">Constant or no parameters referenced.</td></tr>';
        } else {
            tbody.innerHTML = refs.map(r => {
                const val = env[r];
                const origin = origins[r] || 'Unknown';
                const disp = (val !== null && val !== undefined) ? String(val) : 'null (missing)';
                return `<tr><td><b>[${r}]</b></td><td><span class="pill" style="font-size:10px; padding:3px 8px;">${origin}</span></td><td>${disp}</td></tr>`;
            }).join('');
        }
    }

    const val = baseRow[colName];
    $('#auditResultVal').textContent = (val !== null && typeof val === 'number') ? val.toFixed(colDef.decimals || 2) : String(val);

    modal.classList.add('show');
}

function closeAuditModal() {
    const modal = $('#auditModal');
    if (modal) modal.classList.remove('show');
}

// -----------------------------------------------------------------------------
// Presets, Export & State Persistence
// -----------------------------------------------------------------------------
function saveCustomColumnsState() {
    try {
        sessionStorage.setItem('ils_custom_columns', JSON.stringify(customState.customColumns));
    } catch (e) {}
}

function restoreCustomColumnsState() {
    try {
        const raw = sessionStorage.getItem('ils_custom_columns');
        if (raw) {
            const cols = JSON.parse(raw);
            if (Array.isArray(cols)) customState.customColumns = cols;
        }
    } catch (e) {}
}

function exportCsv() {
    if (!customState.computedRows.length) {
        alert('No data to export.');
        return;
    }
    const allCols = [...customState.baseColumns, ...customState.customColumns.map(c => c.name)].filter(c => !customState.removedColumns.has(c));
    const lines = [];
    lines.push(allCols.map(c => `"${c.replace(/"/g, '""')}"`).join(','));

    customState.computedRows.forEach(row => {
        const rowVals = allCols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return '';
            return `"${String(v).replace(/"/g, '""')}"`;
        });
        lines.push(rowVals.join(','));
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Custom_Calculated_Table_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
}

function saveTemplateJSON() {
    if (!customState.customColumns.length) {
        alert('No custom columns to save.');
        return;
    }
    const template = {
        name: 'Custom Calculated Table Preset',
        version: '4.1.0',
        exported_at: new Date().toISOString(),
        columns: customState.customColumns
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Custom_Table_Preset_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
}

function loadTemplateJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            const cols = Array.isArray(data) ? data : (data.columns || []);
            if (!cols.length) {
                showCustomError('No column definitions found in template file.');
                return;
            }
            customState.customColumns = cols;
            saveCustomColumnsState();
            recalculateTable();
            updateUI();
        } catch (err) {
            showCustomError(`Failed to parse preset file: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

// -----------------------------------------------------------------------------
// Initialization & Event Wiring
// -----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    restoreCustomColumnsState();

    // Tag search box
    $('#tagSearchBox')?.addEventListener('input', e => {
        renderAllTagAccordions(e.target.value);
    });

    // Sync button
    $('#btnSyncBase')?.addEventListener('click', () => syncAllDataSources());

    // Formula Input event
    $('#customFormulaInput')?.addEventListener('input', updateLivePreview);
    $('#customColDecimals')?.addEventListener('change', updateLivePreview);

    // Apply Column Button
    $('#btnApplyCol')?.addEventListener('click', () => {
        const name = ($('#customColName')?.value || '').trim();
        const formula = ($('#customFormulaInput')?.value || '').trim();
        const unit = ($('#customColUnit')?.value || '').trim();
        const decimals = parseInt($('#customColDecimals')?.value || '2', 10);

        if (!name) {
            alert('Please specify a column name.');
            $('#customColName')?.focus();
            return;
        }

        const availableTags = getAllAvailableTags();
        const check = validateClientFormula(formula, availableTags);
        if (!check.valid) {
            alert(`Formula validation failed:\n${check.message}`);
            return;
        }

        // Test cycle
        const candidateList = [...customState.customColumns];
        const newSpec = { name, formula, unit, decimals };

        if (customState.editColIndex >= 0) {
            candidateList[customState.editColIndex] = newSpec;
        } else {
            const existingIdx = candidateList.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
            if (existingIdx >= 0) {
                if (!confirm(`A column named "${name}" already exists. Overwrite?`)) return;
                candidateList[existingIdx] = newSpec;
            } else {
                candidateList.push(newSpec);
            }
        }

        const cycle = checkCycle(candidateList);
        if (cycle) {
            alert(`Cannot apply column: Circular reference detected!\n${cycle.join(' → ')}`);
            return;
        }

        customState.customColumns = candidateList;
        saveCustomColumnsState();
        clearForm();
        recalculateTable();
        updateUI();
    });

    $('#btnCancelCol')?.addEventListener('click', clearForm);

    // Column Restore Button
    $('#customRestoreColumns')?.addEventListener('click', () => {
        customState.removedColumns.clear();
        renderTable();
    });

    // Modal Close
    $('#btnAuditClose')?.addEventListener('click', closeAuditModal);
    $('#auditModal')?.addEventListener('click', e => {
        if (e.target === $('#auditModal')) closeAuditModal();
    });

    // Export & Presets
    $('#btnExportCsv')?.addEventListener('click', exportCsv);
    $('#btnSaveTemplate')?.addEventListener('click', saveTemplateJSON);
    $('#inputLoadTemplate')?.addEventListener('change', e => {
        if (e.target.files && e.target.files[0]) {
            loadTemplateJSON(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Table Filters
    ['#customReactorFilter', '#customFrom', '#customTo', '#customSearch'].forEach(sel => {
        $(sel)?.addEventListener('input', renderTable);
        $(sel)?.addEventListener('change', renderTable);
    });

    $('#customClearDates')?.addEventListener('click', () => {
        if ($('#customFrom')) $('#customFrom').value = '';
        if ($('#customTo')) $('#customTo').value = '';
        renderTable();
    });

    // Initial load
    syncAllDataSources();
});
