"""Gunicorn configuration for the Bond Trading API.

N-14 FIX: `validate_config()` used to run only under `python app.py`
(`__main__`), so a gunicorn launch (the Docker CMD) booted WITHOUT `AUTH_TOKEN`
and only failed closed per-route. The `on_starting` hook below makes the
gunicorn launch fail fast at startup too, matching the `python app.py`
behaviour (and the README's "refuses to start" claim) for BOTH launchers.

The tests never load this file, so the hermetic API suite (no AUTH_TOKEN)
is unaffected.
"""
import os
import sys

# Make `config` importable regardless of the working directory gunicorn was
# started from (Docker WORKDIR is /app; dev usage: `gunicorn -c gunicorn.conf.py ...`).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def on_starting(server):
    """Fail fast at startup: refuse to serve without AUTH_TOKEN (M-06/N-14)."""
    from config import validate_config

    validate_config()
