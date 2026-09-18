from datetime import UTC, datetime


def utc_now() -> datetime:
    """Return naive UTC for compatibility with existing SQLAlchemy DateTime columns."""
    return datetime.now(UTC).replace(tzinfo=None)
