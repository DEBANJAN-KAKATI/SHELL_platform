# Building the documentation

- `make_documentation.js` → `ILS_Dashboard_Documentation.docx` (user + technical documentation with the formula reference).
  Run `python3 toc_build.py` in a folder with `make_documentation.js` renamed `make.js` and `toc.json`: it builds the
  document, converts it to PDF with LibreOffice and writes the page numbers of the contents into `toc.json`.
- `capture_picture_guide.js OUT [RunPlan_Reforming.xlsx]` → screenshots of every page with numbered markers (texts from
  `frontend/js/guide.js`, all data blurred) and `OUT/steps.json`; needs the dashboard running on port 5078.
- `make_picture_guide.js OUT` → `OUT/ILS_Dashboard_Picture_Guide.docx` (expects the screenshots converted to JPEG in `OUT/jpg/`).
Needs Node with the `docx` package, Playwright and LibreOffice (`soffice`).
