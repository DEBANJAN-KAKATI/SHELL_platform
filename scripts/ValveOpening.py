# %%
from pathlib import Path

import pandas as pd

folder = Path(r"C:\Users\Sankar.Sasmal\Downloads\ValveOpening")
files = sorted(folder.glob("*.csv"))

df = pd.concat(
    [pd.read_csv(file, encoding="utf-16", sep=";") for file in files],
    ignore_index=True,
)

COLUMN_MAPPING = {
    r"10i1KCV16\OP": "R1",
    r"10i1KCV18\OP": "R2",
    r"10i1KCV20\OP": "R3",
    r"10i1KCV22\OP": "R4",
    r"10i2KCV16\OP": "R5",
    r"10i2KCV16\OP_1": "R6",
    r"10i2KCV20\OP": "R7",
    r"10i2KCV22\OP": "R8",
}

# pandas appends .1 to the second duplicate column name.
COLUMN_MAPPING[r"10i2KCV16\OP.1"] = COLUMN_MAPPING[r"10i2KCV16\OP_1"]
df = df.rename(columns=COLUMN_MAPPING)

df["DateTime"] = pd.to_datetime(df.pop("Time"), dayfirst=True)
value_columns = [f"R{index}" for index in range(1, 9)]

df = (
    df.assign(_minute=df["DateTime"].dt.floor("5min"))
    .groupby("_minute", sort=True)
    .agg(
        DateTime=("DateTime", "max"),
        **{column: (column, "mean") for column in value_columns},
    )
    .reset_index(drop=True)[["DateTime", *value_columns]]
)
df.head(5)

# %%
import html

from IPython.display import HTML, display

status_columns = [f"R{index}" for index in range(1, 9)]
minimum_datetime = df["DateTime"].min()
maximum_datetime = df["DateTime"].max()


def datetime_input_value(value):
    return value.strftime("%Y-%m-%dT%H:%M:%S")


rows = []
for _, row in df.iterrows():
    timestamp = row["DateTime"]
    status_cells = "".join(
        f'<td><span class="status-dot {"status-dot-green" if row[column] == 1 else "status-dot-grey"}"></span></td>'
        for column in status_columns
    )
    rows.append(
        f'<tr data-datetime="{datetime_input_value(timestamp)}">'
        f"<td>{html.escape(timestamp.strftime('%Y-%m-%d %H:%M:%S'))}</td>"
        f"{status_cells}</tr>"
    )

minimum_input = datetime_input_value(minimum_datetime)
maximum_input = datetime_input_value(maximum_datetime)
column_headers = "".join(f"<th>{column}</th>" for column in status_columns)
row_html = "".join(rows)

dashboard_html = f"""
<style>
    .valve-dashboard {{
        font-family: Arial, sans-serif;
        color: #243447;
    }}
    .valve-filters {{
        display: flex;
        gap: 16px;
        align-items: center;
        margin-bottom: 12px;
    }}
    .valve-filters label {{
        font-weight: 600;
    }}
    .valve-filters input {{
        margin-left: 6px;
        padding: 5px;
    }}
    .valve-count {{
        margin-bottom: 8px;
        color: #667085;
    }}
    .valve-table-wrapper {{
        max-height: 650px;
        overflow: auto;
    }}
    .valve-table {{
        border-collapse: collapse;
        width: 100%;
        font-size: 13px;
    }}
    .valve-table th {{
        background: #243447;
        color: white;
        padding: 8px;
        position: sticky;
        top: 0;
    }}
    .valve-table td {{
        border-bottom: 1px solid #e5e7eb;
        padding: 6px 8px;
        text-align: center;
    }}
    .valve-table td:first-child {{
        text-align: left;
        white-space: nowrap;
    }}
    .status-dot {{
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
    }}
    .status-dot-green {{ background: #16a34a; }}
    .status-dot-grey {{ background: #b8c0cc; }}
</style>
<div class="valve-dashboard">
    <div class="valve-filters">
        <label>From <input id="valve-from" type="datetime-local" value="{minimum_input}" min="{minimum_input}" max="{maximum_input}"></label>
        <label>To <input id="valve-to" type="datetime-local" value="{maximum_input}" min="{minimum_input}" max="{maximum_input}"></label>
    </div>
    <div id="valve-count" class="valve-count"></div>
    <div class="valve-table-wrapper">
        <table class="valve-table">
            <thead><tr><th>DateTime</th>{column_headers}</tr></thead>
            <tbody>{row_html}</tbody>
        </table>
    </div>
</div>
<script>
(function() {{
    const dashboard = document.currentScript.previousElementSibling;
    const fromInput = dashboard.querySelector('#valve-from');
    const toInput = dashboard.querySelector('#valve-to');
    const count = dashboard.querySelector('#valve-count');
    const rows = [...dashboard.querySelectorAll('tbody tr')];

    function filterRows() {{
        const from = fromInput.value;
        const to = toInput.value;
        let visible = 0;
        rows.forEach(row => {{
            const timestamp = row.dataset.datetime;
            const matches = (!from || timestamp >= from) && (!to || timestamp <= to);
            row.style.display = matches ? '' : 'none';
            if (matches) visible += 1;
        }});
        count.textContent = `${{visible}} of ${{rows.length}} one-minute records`;
    }}

    fromInput.addEventListener('input', filterRows);
    toInput.addEventListener('input', filterRows);
    filterRows();
}})();
</script>
"""

display(HTML(dashboard_html))

# %%
from pathlib import Path

html_file = Path.cwd() / "ValveOpening_dashboard.html"
html_file.write_text(dashboard_html, encoding="utf-8")

print(f"Dashboard saved to: {html_file}")
display(
    HTML(
        f'<a href="{html_file.as_uri()}" download="ValveOpening_dashboard.html">'
        "Download the ValveOpening HTML dashboard"
        "</a>"
    )
)
