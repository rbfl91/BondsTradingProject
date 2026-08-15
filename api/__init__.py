# Make the api package importable.
# M-06 FIX: lazy attribute access (PEP 562) — importing the `api` package no
# longer eagerly imports the Flask app (and its web3/dotenv side effects).
__all__ = ["app"]


def __getattr__(name):
    if name == "app":
        from .app import app
        return app
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
