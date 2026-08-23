"""Input schemas for MISA export configuration and history."""

from pydantic import BaseModel, ConfigDict, Field

from app.models.misa_export import MisaExportFormat


class MisaAccountMappingCreate(BaseModel):
    source_account_id: int
    target_account_code: str = Field(min_length=1)
    target_account_name: str = Field(min_length=1)


class MisaExportConfigurationCreate(BaseModel):
    name: str = Field(min_length=1)
    export_format: MisaExportFormat = MisaExportFormat.BANK_STATEMENT_XLSX
    currency: str = Field(default="VND", min_length=3, max_length=3)
    mappings: list[MisaAccountMappingCreate] = Field(min_length=1)


class MisaExportConfigurationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    export_format: MisaExportFormat
    currency: str
    is_active: bool
