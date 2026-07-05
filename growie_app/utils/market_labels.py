"""User-facing Kenya/Global market labels with legacy NSE compatibility."""

from __future__ import annotations

KENYA = "Kenya"
GLOBAL = "Global"
BOTH = "Both"
ETF = "ETF"
LEGACY_KENYA = "NSE"

# Internal routing buckets (price APIs, fetch pipelines).
BUCKET_KENYA = "NSE"
BUCKET_GLOBAL = "GLOBAL"


def normalize_market_bucket(market: str | None) -> str:
	"""Map stored/API market values to internal Kenya (NSE) or Global bucket."""
	m = str(market or KENYA).strip().upper()
	if m == BUCKET_GLOBAL:
		return BUCKET_GLOBAL
	if m == ETF:
		return ETF
	if m in (BUCKET_KENYA, KENYA.upper()):
		return BUCKET_KENYA
	return BUCKET_KENYA


def is_kenya_market(market: str | None) -> bool:
	return normalize_market_bucket(market) == BUCKET_KENYA


def is_global_market(market: str | None) -> bool:
	return normalize_market_bucket(market) == BUCKET_GLOBAL


def canonical_market_value(market: str | None) -> str:
	"""Canonical Select-field value shown in Desk and returned to the app."""
	bucket = normalize_market_bucket(market)
	if bucket == BUCKET_GLOBAL:
		return GLOBAL
	if bucket == ETF:
		return ETF
	return KENYA


def coerce_market_input(market: str | None) -> str:
	"""Normalize API/form input to canonical stored market value."""
	return canonical_market_value(market)


def market_db_values(market: str | None) -> list[str]:
	"""DB values to match for a Kenya or Global filter (includes legacy NSE)."""
	canonical = canonical_market_value(market)
	if canonical == KENYA:
		return [KENYA, LEGACY_KENYA]
	if canonical == GLOBAL:
		return [GLOBAL]
	if canonical == ETF:
		return [ETF]
	return [canonical]


def market_type_supports_bucket(market_type: str | None, bucket: str) -> bool:
	"""Whether a Growe Price API market_type row may fetch the given bucket."""
	mt = str(market_type or "").strip().upper()
	b = str(bucket or "").strip().upper()
	if mt == BOTH.upper():
		return True
	if mt in (BUCKET_KENYA, KENYA.upper()):
		return b == BUCKET_KENYA
	if mt == BUCKET_GLOBAL:
		return b == BUCKET_GLOBAL
	return mt == b


def market_ui_label(market: str | None) -> str:
	"""Human-readable label for progress messages and Desk copy."""
	return canonical_market_value(market)
