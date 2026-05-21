from fastapi import APIRouter

from app.services.openapi_company import (
    get_public_openapi_company_config,
    search_companies_by_province_ateco,
)

router = APIRouter(prefix="/enrichment", tags=["enrichment"])


@router.get("/openapi/test")
def test_openapi_company_adapter() -> dict:
    config = get_public_openapi_company_config()

    if not config["base_url_configured"] or not config["token_configured"]:
        return {
            "status": "missing_config",
            "provider": "openapi_company",
            "config": config,
            "message": "OpenAPI Company adapter is installed, but credentials are not configured.",
        }

    try:
        test_query = search_companies_by_province_ateco(
            province="TO",
            ateco_codes=["43.21.01"],
            dry_run=config["dry_run"],
        )
    except Exception as exc:
        return {
            "status": "failed_gracefully",
            "provider": "openapi_company",
            "config": config,
            "message": str(exc),
        }

    return {
        "status": test_query.get("status", "unknown"),
        "provider": "openapi_company",
        "config": config,
        "test_query": test_query,
    }
