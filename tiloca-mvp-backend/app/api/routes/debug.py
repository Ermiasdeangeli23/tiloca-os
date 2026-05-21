from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/debug", tags=["temporary-debug"])


@router.get("/openapi-config")
def debug_openapi_config() -> dict:
    """Temporary endpoint for local OpenAPI Company configuration checks."""
    settings = get_settings()
    token = settings.openapi_company_token or ""
    return {
        "base_url": settings.openapi_company_base_url,
        "token_configured": bool(token),
        "token_length": len(token),
        "token_first_4": token[:4],
        "token_last_4": token[-4:] if token else "",
        "sandbox": settings.openapi_company_sandbox,
        "dry_run": settings.openapi_company_dry_run,
        "it_search_path": settings.openapi_company_it_search_path,
    }
