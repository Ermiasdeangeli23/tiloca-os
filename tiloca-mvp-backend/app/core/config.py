from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://tiloca:tiloca@localhost:5432/tiloca"
    google_api_key: str = ""
    openai_api_key: str = ""
    openapi_company_base_url: str = "https://company.openapi.com"
    openapi_company_token: str = ""
    openapi_company_sandbox: bool = True
    openapi_company_dry_run: bool = True
    openapi_company_search_path: str = "/companies/search"
    openapi_company_it_search_path: str = "/IT-search"
    openapi_company_nearby_path: str = "/companies/search/nearby"
    openapi_company_details_path: str = "/companies/{company_id_or_vat}"
    openapi_company_default_data_enrichment: str = "address"
    openapi_company_production_max_limit: int = 10
    satellite_storage_dir: Path = Path("storage/satellite")
    default_scan_limit: int = 30

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
