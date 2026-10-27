# Reactor Map dynamic source update

The Reactor Map is now processed dynamically from a user-selected CSV folder.

## How it works

1. Select **Reactor Map** from the tab row.
2. Enter or Browse to the folder containing the Reactor Map CSV files.
3. Click **Process Reactor Map**.
4. The dashboard reads the CSV files and renders the R1-R8 status table in the same page layout as the DHA tables.
5. Use the From/To controls to filter the processed five-minute records.

## Source format and logic

The existing mapping and calculation logic from `scripts/ValveOpening.py` is preserved:

- CSV encoding: UTF-16
- Separator: `;`
- Timestamp column: `Time`
- Reactor mapping: R1-R8 uses the existing `COLUMN_MAPPING`
- Duplicate `10i2KCV16\\OP` handling remains unchanged
- Five-minute grouping remains `dt.floor('5min')`
- Reactor values remain calculated with the existing `mean` aggregation
- A reactor is displayed as Open only when the resulting value is exactly `1`; otherwise it is Not open

## Files changed

- `backend/services/reactor_map_service.py` — dynamic Reactor Map processing using the existing logic
- `backend/routes/api.py` — Reactor Map browse/process endpoints
- `config/settings.json` — default Reactor Map source folder
- `frontend/index.html` — native Reactor Map panel/source controls; static iframe removed
- `frontend/js/dashboard.js` — dynamic processing/filtering/rendering
- `frontend/css/dashboard.css` — Reactor Map styling integrated into the main dashboard

`frontend/reactor_map.html` is retained as the previous static snapshot but is no longer used by the main dashboard.
