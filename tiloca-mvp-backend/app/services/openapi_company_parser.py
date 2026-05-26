from __future__ import annotations

from typing import Any


def company_coordinates(company: dict[str, Any]) -> tuple[float, float] | None:
    registered_office = registered_office_data(company)
    gps = registered_office.get("gps") if isinstance(registered_office, dict) else None
    coordinates = gps.get("coordinates") if isinstance(gps, dict) else None
    parsed = _coordinates_from_list(coordinates)
    if parsed:
        return parsed

    candidates = [
        company.get("gps"),
        company.get("geo"),
        company.get("location"),
        company.get("coordinates"),
        (company.get("address") or {}).get("gps") if isinstance(company.get("address"), dict) else None,
        (company.get("address") or {}).get("geo") if isinstance(company.get("address"), dict) else None,
    ]
    for value in candidates:
        parsed = _coordinates_from_list(value)
        if parsed:
            return parsed
        if not isinstance(value, dict):
            continue
        parsed = _coordinates_from_list(value.get("coordinates"))
        if parsed:
            return parsed
        lat = value.get("lat") or value.get("latitude")
        lon = value.get("lon") or value.get("lng") or value.get("longitude")
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    lat = company.get("lat") or company.get("latitude")
    lon = company.get("lon") or company.get("lng") or company.get("longitude")
    if lat is not None and lon is not None:
        return float(lat), float(lon)
    return None


def registered_office_data(company: dict[str, Any]) -> dict[str, Any] | None:
    direct = company.get("registeredOffice")
    if isinstance(direct, dict):
        return direct
    address = company.get("address")
    if not isinstance(address, dict):
        return None
    registered_office = address.get("registeredOffice")
    return registered_office if isinstance(registered_office, dict) else None


def company_debug_counters(companies: list[dict[str, Any]]) -> dict[str, Any]:
    with_registered_office = 0
    with_gps_object = 0
    with_coordinates = 0
    with_address = 0

    for company in companies:
        registered_office = registered_office_data(company)
        if registered_office is not None:
            with_registered_office += 1
        gps = registered_office.get("gps") if isinstance(registered_office, dict) else None
        if isinstance(gps, dict):
            with_gps_object += 1
        if company_coordinates(company):
            with_coordinates += 1
        if company_address(company):
            with_address += 1

    return {
        "companies_found": len(companies),
        "companies_with_registered_office": with_registered_office,
        "companies_with_gps_object": with_gps_object,
        "companies_with_coordinates": with_coordinates,
        "companies_without_coordinates": max(len(companies) - with_coordinates, 0),
        "companies_with_address": with_address,
        "companies_without_address": max(len(companies) - with_address, 0),
    }


def safe_company_metadata(company: dict[str, Any]) -> dict[str, Any]:
    office = registered_office_data(company) or {}
    return {
        "company_name": company_name(company),
        "vat_or_tax_code": company_identifier(company),
        "ateco": company_ateco(company),
        "registered_office_address": company_address(company),
        "registered_office_city": company_city(company),
        "registered_office_province": company_province(company),
        "registered_office_postal_code": company_postal_code(company),
        "employees": first_value(company, ["employees", "dipendenti", "numeroDipendenti"]),
        "turnover": first_value(company, ["turnover", "fatturato", "revenue"]),
        "pec": first_value(company, ["pec", "pecAddress", "mailPec"]),
        "legal_status": first_value(company, ["legalStatus", "statoAttivita", "activityStatus"]),
        "address": company_address(company),
        "registered_office": {
            "street": office.get("street"),
            "street_number": office.get("streetNumber"),
            "street_name": office.get("streetName"),
            "town": office.get("town"),
            "province": office.get("province"),
            "zip_code": office.get("zipCode"),
        },
    }


def company_name(company: dict[str, Any]) -> str | None:
    return first_value(company, ["companyName", "denominazione", "ragioneSociale", "name", "nome"])


def company_identifier(company: dict[str, Any]) -> str:
    value = first_value(company, ["vatCode", "vat", "partitaIva", "taxCode", "codiceFiscale", "id"])
    return safe_asset_name(str(value or company_name(company) or "openapi_company"))


def company_ateco(company: dict[str, Any]) -> str | None:
    value = first_value(company, ["atecoCode", "ateco", "codiceAteco"])
    if value:
        if isinstance(value, dict):
            return first_value(value, ["code", "codice", "atecoCode", "description", "descrizione"])
        return str(value)
    ateco = company.get("ateco")
    if isinstance(ateco, dict):
        return first_value(ateco, ["code", "codice", "atecoCode"])
    activity = company.get("activity")
    if isinstance(activity, dict):
        return first_value(activity, ["atecoCode", "code", "description"])
    return None


def company_address(company: dict[str, Any]) -> str | None:
    direct = first_value(company, ["registeredOfficeAddress", "sedeLegale", "indirizzo"])
    if isinstance(direct, str):
        return direct
    office = registered_office_data(company)
    if isinstance(office, dict):
        address = format_address(
            [
                office.get("streetName"),
                " ".join(
                    str(part)
                    for part in [office.get("toponym"), office.get("street"), office.get("streetNumber")]
                    if part not in (None, "")
                ).strip(),
                office.get("town"),
                office.get("province"),
                office.get("zipCode"),
            ]
        )
        if address:
            return address
    direct = company.get("address")
    if isinstance(direct, dict):
        return format_address(
            [
                direct.get("streetName"),
                direct.get("street") or direct.get("via"),
                direct.get("streetNumber") or direct.get("civico"),
                direct.get("city") or direct.get("comune") or direct.get("town"),
                direct.get("province") or direct.get("provincia"),
                direct.get("zipCode") or direct.get("cap"),
            ]
        )
    if isinstance(direct, str):
        return direct
    return None


def company_city(company: dict[str, Any]) -> str | None:
    office = registered_office_data(company)
    if isinstance(office, dict):
        return first_value(office, ["town", "city", "comune"])
    address = company.get("address")
    if isinstance(address, dict):
        return first_value(address, ["town", "city", "comune"])
    return None


def company_province(company: dict[str, Any]) -> str | None:
    office = registered_office_data(company)
    if isinstance(office, dict):
        return first_value(office, ["province", "provincia"])
    address = company.get("address")
    if isinstance(address, dict):
        return first_value(address, ["province", "provincia"])
    return None


def company_postal_code(company: dict[str, Any]) -> str | None:
    office = registered_office_data(company)
    if isinstance(office, dict):
        return first_value(office, ["zipCode", "cap", "postalCode"])
    address = company.get("address")
    if isinstance(address, dict):
        return first_value(address, ["zipCode", "cap", "postalCode"])
    return None


def format_address(parts: list[Any]) -> str | None:
    normalized: list[str] = []
    for part in parts:
        if part in (None, ""):
            continue
        text = str(part).strip()
        if text and text not in normalized:
            normalized.append(text)
    return " ".join(normalized) if normalized else None


def first_value(source: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        value = source.get(key)
        if value not in (None, ""):
            return value
    return None


def safe_asset_name(value: str) -> str:
    return "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in value).strip("_") or "openapi_company"


def _coordinates_from_list(value: Any) -> tuple[float, float] | None:
    if isinstance(value, list) and len(value) >= 2:
        lon = value[0]
        lat = value[1]
        if lat is not None and lon is not None:
            return float(lat), float(lon)
    return None
