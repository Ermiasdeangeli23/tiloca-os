from __future__ import annotations

from app.services.openapi_company_parser import (
    company_address,
    company_ateco,
    company_city,
    company_coordinates,
    company_debug_counters,
    company_identifier,
    company_name,
    company_postal_code,
    company_province,
)


def assert_equal(label: str, actual, expected) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_true(label: str, condition: bool) -> None:
    if not condition:
        raise AssertionError(label)


def main() -> int:
    flat_address = {
        "companyName": "Flat Srl",
        "vatCode": "12345678901",
        "address": {
            "street": "Via Industria",
            "streetNumber": "10",
            "city": "Torino",
            "province": "TO",
            "zipCode": "10100",
            "gps": {"coordinates": [7.6869, 45.0703]},
        },
        "atecoCode": "25.62",
    }
    nested_registered_office = {
        "companyName": "Nested Spa",
        "taxCode": "98765432109",
        "address": {
            "registeredOffice": {
                "toponym": "VIA",
                "street": "ROMA",
                "streetNumber": "22",
                "streetName": "VIA ROMA 22",
                "town": "Cuneo",
                "province": "CN",
                "zipCode": "12100",
                "gps": {"coordinates": [7.5412, 44.3845]},
            }
        },
        "ateco": {"code": "10.89"},
    }
    missing_coordinates = {
        "companyName": "No GPS Srl",
        "address": {
            "registeredOffice": {
                "streetName": "VIA TEST 1",
                "town": "Torino",
                "province": "TO",
            }
        },
    }
    missing_address = {
        "companyName": "No Address Srl",
        "vatCode": "11111111111",
    }

    assert_equal("flat name", company_name(flat_address), "Flat Srl")
    assert_equal("flat identifier", company_identifier(flat_address), "12345678901")
    assert_equal("flat city", company_city(flat_address), "Torino")
    assert_equal("flat province", company_province(flat_address), "TO")
    assert_equal("flat postal code", company_postal_code(flat_address), "10100")
    assert_equal("flat ateco", company_ateco(flat_address), "25.62")
    assert_true("flat address present", "Via Industria" in (company_address(flat_address) or ""))
    assert_equal("flat coordinates", company_coordinates(flat_address), (45.0703, 7.6869))

    assert_equal("nested name", company_name(nested_registered_office), "Nested Spa")
    assert_equal("nested identifier", company_identifier(nested_registered_office), "98765432109")
    assert_equal("nested city", company_city(nested_registered_office), "Cuneo")
    assert_equal("nested province", company_province(nested_registered_office), "CN")
    assert_equal("nested postal code", company_postal_code(nested_registered_office), "12100")
    assert_equal("nested ateco", company_ateco(nested_registered_office), "10.89")
    assert_true("nested address present", "VIA ROMA 22" in (company_address(nested_registered_office) or ""))
    assert_equal("nested coordinates", company_coordinates(nested_registered_office), (44.3845, 7.5412))

    assert_equal("missing coordinates", company_coordinates(missing_coordinates), None)
    assert_true("missing coordinates still has address", bool(company_address(missing_coordinates)))
    assert_equal("missing address", company_address(missing_address), None)

    counters = company_debug_counters([flat_address, nested_registered_office, missing_coordinates, missing_address])
    assert_equal("with coordinates", counters["companies_with_coordinates"], 2)
    assert_equal("without coordinates", counters["companies_without_coordinates"], 2)
    assert_equal("with address", counters["companies_with_address"], 3)
    assert_equal("without address", counters["companies_without_address"], 1)

    print("PASS  OpenAPI company parser tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
