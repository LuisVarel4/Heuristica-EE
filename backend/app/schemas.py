from pydantic import BaseModel, EmailStr, Field


class SubmitRequest(BaseModel):
    email: EmailStr
    mu: int = Field(ge=1, le=500)
    sigma: float = Field(gt=0, le=10)
    generaciones: int = Field(ge=1, le=500)


class SubmitResponse(BaseModel):
    id: int
    email: str
    mu: int
    sigma: float
    generaciones: int
    solucion: float
    fitness: float
    created_at: str
    cooldown_seconds: int
    next_submit_at: str


class CooldownResponse(BaseModel):
    email: str
    can_submit: bool
    remaining_seconds: int
    next_submit_at: str | None


class LeaderboardEntry(BaseModel):
    rank: int
    email: str
    mu: int
    sigma: float
    generaciones: int
    solucion: float
    fitness: float
    created_at: str


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
