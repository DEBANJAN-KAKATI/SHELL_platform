import pandas as pd
MISSING={'','--','-','N/A','n/a','NA','na','None'}
def clean_numeric_value(value):
    if value is None:return None
    if isinstance(value,str) and value.strip() in MISSING:return None
    try:return float(value)
    except (TypeError,ValueError):return None
def normalize_header(value):
    h=str(value).strip(); m={'CARBON #':'CARBON#','Carbon#':'CARBON#','Carbon #':'CARBON#','CARBON':'CARBON#','Paraffins':'Paraffin','I-Paraffin':'I-Paraffins','Iso-Paraffins':'I-Paraffins','Aromatic':'Aromatics','Naphthene':'Naphthenes','Olefin':'Olefins'}
    return m.get(h,h)
