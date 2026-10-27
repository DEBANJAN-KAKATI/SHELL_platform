"""Reforming process backend.

Everything specific to the reforming experiment lives in this package so it can be
changed without touching the isomerization code (backend/loaders, backend/calculations,
backend/services). The DHA files and the online analysis file are the same instruments
as isomerization; only the derived tables differ.
"""
