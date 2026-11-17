import re, json, subprocess
s=open('make.js').read()
heads=re.findall(r"c\.push\(h[12]\('([^']+)'\)\)", s)
json.dump([[h,0] for h in heads], open('toc.json','w'))
for it in range(3):
    subprocess.run(['node','make.js'],check=True,capture_output=True)
    subprocess.run(['soffice','--headless','--convert-to','pdf','ILS_Dashboard_Documentation.docx'],check=True,capture_output=True)
    n=int(re.search(r'Pages:\s+(\d+)',subprocess.run(['pdfinfo','ILS_Dashboard_Documentation.pdf'],capture_output=True,text=True).stdout).group(1))
    pages=[subprocess.run(['pdftotext','-f',str(i),'-l',str(i),'-layout','ILS_Dashboard_Documentation.pdf','-'],capture_output=True,text=True).stdout for i in range(1,n+1)]
    toc=[]; start=3
    for h in heads:
        pg=next((i+1 for i in range(start-1,n) if any(line.strip().startswith(h) for line in pages[i].splitlines())),0)
        toc.append([h,pg]); 
        if pg: start=pg
    old=json.load(open('toc.json'))
    json.dump(toc,open('toc.json','w'))
    print(it, n, [t for t in toc if not t[1]])
    if old==toc: break
