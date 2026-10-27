import ast
import math
import re
from typing import Any, Dict, List, Optional, Set, Tuple


SAFE_FUNCTIONS = {
    "IF": lambda cond, a, b: a if cond else b,
    "SAFE_DIV": lambda num, den, default=None: (
        (num / den)
        if (den is not None and den != 0 and not (isinstance(den, float) and math.isnan(den)))
        else default
    ),
    "ROUND": lambda val, dec=2: (
        round(val, int(dec))
        if val is not None and not (isinstance(val, float) and math.isnan(val))
        else None
    ),
    "ABS": lambda val: abs(val) if val is not None else None,
    "MIN": lambda *args: min([a for a in args if a is not None]) if any(a is not None for a in args) else None,
    "MAX": lambda *args: max([a for a in args if a is not None]) if any(a is not None for a in args) else None,
    "SUM": lambda *args: sum([a for a in args if a is not None and not (isinstance(a, float) and math.isnan(a))]),
    "AVG": lambda *args: (
        sum([a for a in args if a is not None]) / len([a for a in args if a is not None])
        if any(a is not None for a in args)
        else None
    ),
    "SQRT": lambda val: math.sqrt(val) if (val is not None and val >= 0) else None,
    "POW": lambda base, exp: math.pow(base, exp) if (base is not None and exp is not None) else None,
    "EXP": lambda val: math.exp(val) if val is not None else None,
    "LN": lambda val: math.log(val) if (val is not None and val > 0) else None,
    "LOG": lambda val, base=10: math.log(val, base) if (val is not None and val > 0 and base > 0 and base != 1) else None,
}


def extract_column_references(formula: str) -> List[str]:
    """Extract all column names referenced in brackets like [ColumnName] or [N2[SLPH]]."""
    if not formula:
        return []
    # Match outermost brackets e.g. [N2[SLPH]] or [Column]
    results = []
    i = 0
    n = len(formula)
    while i < n:
        if formula[i] == "[":
            # Search for matching closing bracket
            depth = 1
            start = i + 1
            i += 1
            while i < n and depth > 0:
                if formula[i] == "[":
                    depth += 1
                elif formula[i] == "]":
                    depth -= 1
                i += 1
            if depth == 0:
                col_name = formula[start : i - 1]
                if col_name and col_name not in results:
                    results.append(col_name)
        else:
            i += 1
    return results


def normalize_formula_to_python(formula: str) -> Tuple[str, Dict[str, str]]:
    """
    Converts an Excel-like formula into a valid Python expression.
    Replaces [ColumnName] references with synthetic variable names __col_0__, __col_1__, etc.
    Replaces Excel operators:
      ^ -> **
      = -> == (in comparison context)
      <> -> !=
    """
    s = formula.strip()
    if s.startswith("="):
        s = s[1:].strip()

    cols = extract_column_references(s)
    col_to_id = {}
    id_to_col = {}
    for idx, col in enumerate(cols):
        var_id = f"__col_{idx}__"
        col_to_id[col] = var_id
        id_to_col[var_id] = col

    # Replace bracket references with var_id
    # Sort by length descending to prevent sub-string collision
    for col in sorted(cols, key=len, reverse=True):
        bracketed = f"[{col}]"
        s = s.replace(bracketed, col_to_id[col])

    # Replace Excel operators
    # Replace '<>' with '!='
    s = s.replace("<>", "!=")
    # Replace single '=' not preceded/followed by '<', '>', '!', '=' with '=='
    s = re.sub(r"(?<![<>=!])=(?!=)", "==", s)
    # Replace '^' with '**'
    s = s.replace("^", "**")

    return s, id_to_col


class SafeASTValidator(ast.NodeVisitor):
    """Ensures expression contains only whitelisted AST nodes."""

    ALLOWED_NODES = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Compare,
        ast.IfExp,
        ast.Call,
        ast.Constant,
        ast.Name,
        ast.Load,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.FloorDiv,
        ast.Mod,
        ast.Pow,
        ast.USub,
        ast.UAdd,
        ast.Eq,
        ast.NotEq,
        ast.Lt,
        ast.LtE,
        ast.Gt,
        ast.GtE,
        ast.BoolOp,
        ast.And,
        ast.Or,
        ast.Not,
    )

    def __init__(self, allowed_vars: Set[str], allowed_funcs: Set[str]):
        self.allowed_vars = allowed_vars
        self.allowed_funcs = allowed_funcs
        self.errors = []

    def generic_visit(self, node):
        if not isinstance(node, self.ALLOWED_NODES):
            self.errors.append(f"Forbidden syntax: {type(node).__name__}")
            return
        super().generic_visit(node)

    def visit_Name(self, node):
        var_name = node.id
        if var_name not in self.allowed_vars and var_name.upper() not in self.allowed_funcs:
            # Check if it is a boolean or None literal
            if var_name not in ("True", "False", "None"):
                self.errors.append(f"Unknown variable or function: {var_name}")
        self.generic_visit(node)

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name):
            func_name = node.func.id.upper()
            if func_name not in self.allowed_funcs:
                self.errors.append(f"Forbidden or unknown function: {node.func.id}")
        else:
            self.errors.append("Dynamic function calls are forbidden")
        self.generic_visit(node)


def validate_formula_syntax(
    formula: str,
    available_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Validates the formula syntax and references without executing."""
    if not formula or not formula.strip():
        return {"valid": False, "message": "Formula cannot be empty", "dependencies": []}

    try:
        py_expr, id_to_col = normalize_formula_to_python(formula)
    except Exception as e:
        return {"valid": False, "message": f"Parsing error: {str(e)}", "dependencies": []}

    dependencies = list(id_to_col.values())

    # If available_columns is provided, check that all referenced columns exist
    if available_columns is not None:
        avail_set = set(available_columns)
        missing = [col for col in dependencies if col not in avail_set]
        if missing:
            return {
                "valid": False,
                "message": f"Referenced column(s) not found in dataset: {', '.join(missing)}",
                "dependencies": dependencies,
            }

    try:
        tree = ast.parse(py_expr, mode="eval")
    except SyntaxError as e:
        return {"valid": False, "message": f"Syntax error: {e.msg} at position {e.offset}", "dependencies": dependencies}

    allowed_vars = set(id_to_col.keys())
    allowed_funcs = set(SAFE_FUNCTIONS.keys())
    validator = SafeASTValidator(allowed_vars, allowed_funcs)
    validator.visit(tree)

    if validator.errors:
        return {"valid": False, "message": "; ".join(validator.errors), "dependencies": dependencies}

    return {"valid": True, "message": "Formula is valid", "dependencies": dependencies}


def detect_circular_dependencies(custom_columns: List[Dict[str, Any]]) -> List[str]:
    """
    Detects circular dependencies in a list of custom column definitions.
    Returns empty list if valid, or a list of column names involved in cycle.
    """
    col_map = {c["name"]: c for c in custom_columns if "name" in c}
    adj = {name: [] for name in col_map}

    for name, spec in col_map.items():
        formula = spec.get("formula", "")
        refs = extract_column_references(formula)
        for ref in refs:
            if ref in col_map:
                adj[name].append(ref)

    # Cycle detection via Tarjan's / DFS
    visited = {}  # 0 = unvisited, 1 = visiting, 2 = visited
    cycle_nodes = []

    def dfs(node, path):
        visited[node] = 1
        for neighbor in adj.get(node, []):
            if visited.get(neighbor, 0) == 1:
                idx = path.index(neighbor) if neighbor in path else 0
                cycle_nodes.extend(path[idx:] + [neighbor])
                return True
            if visited.get(neighbor, 0) == 0:
                if dfs(neighbor, path + [neighbor]):
                    return True
        visited[node] = 2
        return False

    for node in adj:
        if visited.get(node, 0) == 0:
            if dfs(node, [node]):
                break

    return list(dict.fromkeys(cycle_nodes))


def resolve_execution_order(
    custom_columns: List[Dict[str, Any]],
    base_columns: List[str],
) -> List[Dict[str, Any]]:
    """
    Topologically sorts custom columns so that dependencies are evaluated first.
    Raises ValueError if circular dependency is detected.
    """
    cycles = detect_circular_dependencies(custom_columns)
    if cycles:
        raise ValueError(f"Circular dependency detected in columns: {' -> '.join(cycles)}")

    col_map = {c["name"]: c for c in custom_columns}
    in_degree = {name: 0 for name in col_map}
    dependents = {name: [] for name in col_map}

    for name, spec in col_map.items():
        refs = extract_column_references(spec.get("formula", ""))
        for ref in refs:
            if ref in col_map:
                in_degree[name] += 1
                dependents[ref].append(name)

    queue = [name for name, deg in in_degree.items() if deg == 0]
    ordered = []

    while queue:
        curr = queue.pop(0)
        ordered.append(col_map[curr])
        for dep in dependents[curr]:
            in_degree[dep] -= 1
            if in_degree[dep] == 0:
                queue.append(dep)

    if len(ordered) < len(col_map):
        raise ValueError("Could not resolve column execution order due to unresolved dependencies.")

    return ordered


class SafeEvaluator:
    """Safely evaluates compiled Python AST against a row's variable values."""

    def __init__(self, formula: str):
        self.formula = formula
        py_expr, self.id_to_col = normalize_formula_to_python(formula)
        self.col_to_id = {col: var_id for var_id, col in self.id_to_col.items()}
        self.tree = ast.parse(py_expr, mode="eval")

    def _eval_node(self, node: ast.AST, env: Dict[str, Any]) -> Any:
        if isinstance(node, ast.Expression):
            return self._eval_node(node.body, env)

        if isinstance(node, ast.Constant):
            return node.value

        if isinstance(node, ast.Name):
            var_name = node.id
            if var_name in env:
                return env[var_name]
            if var_name.upper() in SAFE_FUNCTIONS:
                return SAFE_FUNCTIONS[var_name.upper()]
            if var_name == "True":
                return True
            if var_name == "False":
                return False
            if var_name == "None":
                return None
            return None

        if isinstance(node, ast.UnaryOp):
            val = self._eval_node(node.operand, env)
            if val is None:
                return None
            if isinstance(node.op, ast.USub):
                return -val
            if isinstance(node.op, ast.UAdd):
                return +val
            if isinstance(node.op, ast.Not):
                return not bool(val)

        if isinstance(node, ast.BinOp):
            left = self._eval_node(node.left, env)
            right = self._eval_node(node.right, env)
            if left is None or right is None:
                return None
            try:
                if isinstance(node.op, ast.Add):
                    return left + right
                if isinstance(node.op, ast.Sub):
                    return left - right
                if isinstance(node.op, ast.Mult):
                    return left * right
                if isinstance(node.op, (ast.Div, ast.FloorDiv)):
                    if right == 0 or (isinstance(right, float) and math.isnan(right)):
                        return None
                    return left / right
                if isinstance(node.op, ast.Mod):
                    return left % right if right != 0 else None
                if isinstance(node.op, ast.Pow):
                    return left ** right
            except Exception:
                return None

        if isinstance(node, ast.Compare):
            left = self._eval_node(node.left, env)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_node(comparator, env)
                if left is None or right is None:
                    # null comparisons
                    if isinstance(op, ast.Eq):
                        res = left is right
                    elif isinstance(op, ast.NotEq):
                        res = left is not right
                    else:
                        return False
                else:
                    try:
                        if isinstance(op, ast.Eq):
                            res = left == right
                        elif isinstance(op, ast.NotEq):
                            res = left != right
                        elif isinstance(op, ast.Lt):
                            res = left < right
                        elif isinstance(op, ast.LtE):
                            res = left <= right
                        elif isinstance(op, ast.Gt):
                            res = left > right
                        elif isinstance(op, ast.GtE):
                            res = left >= right
                        else:
                            res = False
                    except Exception:
                        return False
                if not res:
                    return False
                left = right
            return True

        if isinstance(node, ast.IfExp):
            test = self._eval_node(node.test, env)
            if bool(test):
                return self._eval_node(node.body, env)
            else:
                return self._eval_node(node.orelse, env)

        if isinstance(node, ast.BoolOp):
            if isinstance(node.op, ast.And):
                for val_node in node.values:
                    v = self._eval_node(val_node, env)
                    if not bool(v):
                        return False
                return True
            if isinstance(node.op, ast.Or):
                for val_node in node.values:
                    v = self._eval_node(val_node, env)
                    if bool(v):
                        return True
                return False

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                fn_name = node.func.id.upper()
                fn = SAFE_FUNCTIONS.get(fn_name)
                if fn:
                    args = [self._eval_node(arg, env) for arg in node.args]
                    try:
                        return fn(*args)
                    except Exception:
                        return None
            return None

        return None

    def evaluate_row(self, row: Dict[str, Any]) -> Any:
        env = {}
        for var_id, col in self.id_to_col.items():
            val = row.get(col)
            if val is not None and val != "":
                try:
                    num = float(val)
                    env[var_id] = num
                except (ValueError, TypeError):
                    env[var_id] = str(val)
            else:
                env[var_id] = None
        return self._eval_node(self.tree, env)

    def inspect_row(self, row: Dict[str, Any], origins: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Provides lineage explanation for a row calculation."""
        resolved_inputs = {}
        for var_id, col in self.id_to_col.items():
            resolved_inputs[col] = row.get(col)
        result = self.evaluate_row(row)
        return {
            "formula": self.formula,
            "inputs": resolved_inputs,
            "origins": origins or {col: "Direct" for col in resolved_inputs},
            "result": result,
        }


def _date_hour_key(val: Any) -> Optional[str]:
    if not val:
        return None
    s = str(val).strip().replace("T", " ")
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d.%m.%Y %H:%M"):
        try:
            from datetime import datetime
            dt = datetime.strptime(s[:16], fmt[:14])
            return dt.strftime("%Y-%m-%d_%H")
        except Exception:
            continue
    return None


def compute_custom_table(
    rows: List[Dict[str, Any]],
    base_columns: List[str],
    custom_columns: List[Dict[str, Any]],
    cross_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Computes all custom calculated columns over rows in topological order.
    Supports cross-table alignment against Online Analysis and Table-2 rows.
    Returns { "rows": [...], "columns": [...], "errors": [...] }
    """
    if not rows:
        return {"rows": [], "columns": base_columns, "errors": []}

    try:
        ordered_columns = resolve_execution_order(custom_columns, base_columns)
    except ValueError as e:
        return {
            "rows": rows,
            "columns": base_columns,
            "errors": [str(e)],
        }

    cross_ctx = cross_context or {}
    online_rows = cross_ctx.get("online_rows") or []
    table2_rows = cross_ctx.get("table2_rows") or []

    # Build Table-2 index by date-hour key
    t2_by_hour = {}
    for t2 in table2_rows:
        h_key = _date_hour_key(t2.get("DateTime"))
        if h_key and h_key not in t2_by_hour:
            t2_by_hour[h_key] = t2

    # Deep copy rows to maintain immutability of original inputs
    processed_rows = [dict(r) for r in rows]
    all_columns = list(base_columns)

    errors = []
    evaluators = {}

    for col_spec in ordered_columns:
        col_name = col_spec.get("name")
        formula = col_spec.get("formula", "")
        decimals = col_spec.get("decimals", 2)
        if not col_name or not formula:
            continue

        if col_name not in all_columns:
            all_columns.append(col_name)

        try:
            evaluator = SafeEvaluator(formula)
            evaluators[col_name] = evaluator
        except Exception as e:
            errors.append(f"Failed to compile column '{col_name}': {str(e)}")
            continue

        for idx, r in enumerate(processed_rows):
            try:
                # Merge cross-table context for evaluation
                env = dict(r)
                if idx < len(online_rows):
                    for k, v in online_rows[idx].items():
                        if k not in env or env[k] is None:
                            env[k] = v

                h_key = _date_hour_key(r.get("DateTime"))
                if h_key and h_key in t2_by_hour:
                    for k, v in t2_by_hour[h_key].items():
                        if k not in env or env[k] is None:
                            env[k] = v

                res = evaluator.evaluate_row(env)
                if res is not None and isinstance(res, (int, float)) and not math.isnan(res) and not math.isinf(res):
                    r[col_name] = round(res, decimals) if decimals is not None else res
                else:
                    r[col_name] = res
            except Exception:
                r[col_name] = None

    return {
        "rows": processed_rows,
        "columns": all_columns,
        "errors": errors,
    }
