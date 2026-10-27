from pathlib import Path

import pandas as pd


def process_reactor_map_directory(folder):
    """Process Reactor Map CSV data using the existing ValveOpening mapping/calculation logic."""
    p = Path(folder)
    if not p.exists() or not p.is_dir():
        raise ValueError('Selected Reactor Map folder does not exist or is not a directory.')

    files = sorted(p.glob('*.csv'))
    if not files:
        raise ValueError('No CSV files were found in the selected Reactor Map folder.')

    df = pd.concat(
        [pd.read_csv(file, encoding='utf-16', sep=';') for file in files],
        ignore_index=True,
    )

    # Keep the existing Reactor Map mapping exactly as defined in ValveOpening.py.
    COLUMN_MAPPING = {
        r'10i1KCV16\OP': 'R1',
        r'10i1KCV18\OP': 'R2',
        r'10i1KCV20\OP': 'R3',
        r'10i1KCV22\OP': 'R4',
        r'10i2KCV16\OP': 'R5',
        r'10i2KCV16\OP_1': 'R6',
        r'10i2KCV20\OP': 'R7',
        r'10i2KCV22\OP': 'R8',
    }

    # pandas appends .1 to the second duplicate column name.
    COLUMN_MAPPING[r'10i2KCV16\OP.1'] = COLUMN_MAPPING[r'10i2KCV16\OP_1']
    df = df.rename(columns=COLUMN_MAPPING)

    df['DateTime'] = pd.to_datetime(df.pop('Time'), dayfirst=True)
    value_columns = [f'R{index}' for index in range(1, 9)]

    # Preserve the existing 5-minute grouping and mean calculation exactly.
    df = (
        df.assign(_minute=df['DateTime'].dt.floor('5min'))
        .groupby('_minute', sort=True)
        .agg(
            DateTime=('DateTime', 'max'),
            **{column: (column, 'mean') for column in value_columns},
        )
        .reset_index(drop=True)[['DateTime', *value_columns]]
    )

    rows = []
    for _, row in df.iterrows():
        rows.append({
            'DateTime': row['DateTime'].strftime('%Y-%m-%d %H:%M:%S'),
            **{column: int(row[column] == 1) for column in value_columns},
        })

    minimum_datetime = df['DateTime'].min()
    maximum_datetime = df['DateTime'].max()

    return {
        'rows': rows,
        'columns': ['DateTime', *value_columns],
        'record_count': len(rows),
        'minimum_datetime': minimum_datetime.strftime('%Y-%m-%dT%H:%M:%S'),
        'maximum_datetime': maximum_datetime.strftime('%Y-%m-%dT%H:%M:%S'),
        'files_found': len(files),
        'source_directory': str(p),
    }
