from pydantic import BaseModel, EmailStr, Field, field_validator

from app.email_rules import normalize_unal_email


class SubmitRequest(BaseModel):
    email: EmailStr
    alias: str = Field(min_length=1, max_length=40)
    mu: int = Field(ge=1)
    sigma: float = Field(gt=0)
    generaciones: int = Field(ge=1)

    @field_validator("email")
    @classmethod
    def unal_email_domain(cls, value: str) -> str:
        return normalize_unal_email(value)

    @field_validator("alias")
    @classmethod
    def normalize_alias(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("El alias no puede estar vacío.")
        return cleaned


class SubmitResponse(BaseModel):
    id: int
    email: str
    alias: str
    mu: int
    sigma: float
    generaciones: int
    solucion: float
    fitness: float
    created_at: str
    cooldown_seconds: int
    next_submit_at: str
    mensaje: str | None = None
    is_new_best: bool = False


class CooldownResponse(BaseModel):
    email: str
    can_submit: bool
    remaining_seconds: int
    next_submit_at: str | None


class LeaderboardEntry(BaseModel):
    rank: int
    alias: str
    mu: int | None = None
    sigma: float | None = None
    generaciones: int | None = None
    solucion: float
    fitness: float
    created_at: str


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]


class LeaderboardAdminEntry(BaseModel):
    rank: int
    email: str
    alias: str
    mu: int
    sigma: float
    generaciones: int
    solucion: float
    fitness: float
    created_at: str


class LeaderboardAdminResponse(BaseModel):
    entries: list[LeaderboardAdminEntry]


class WhitelistEntry(BaseModel):
    email: str
    added_at: str


class ConfigResponse(BaseModel):
    whitelist_enabled: bool
    whitelist_count: int
    reto_enabled: bool
    reto_started_at: str | None = None
    cooldown_seconds: int = 30


class SetCooldownRequest(BaseModel):
    seconds: int = Field(ge=0, le=3600)


class AddEmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)

    @field_validator("email")
    @classmethod
    def must_be_unal(cls, value: str) -> str:
        return normalize_unal_email(value)


class ToggleWhitelistRequest(BaseModel):
    enabled: bool


class HistoryEntry(BaseModel):
    mu: int
    sigma: float
    generaciones: int
    solucion: float
    fitness: float
    created_at: str


class HistoryResponse(BaseModel):
    email: str
    alias: str | None
    entries: list[HistoryEntry]
