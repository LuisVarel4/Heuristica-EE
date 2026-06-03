import httpx

from app.config import settings
from app.evolution import ejecutar as ejecutar_local


class AlgorithmServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def _legacy_limit_error(response_text: str) -> bool:
    text = response_text.lower()
    return "between 1 and" in text or "must be between" in text


def _parse_result(data: dict, mu: int, sigma: float, generaciones: int) -> dict:
    out = {
        "solucion": float(data["solucion"]),
        "fitness": float(data["fitness"]),
        "mu": int(data.get("mu", mu)),
        "generaciones": int(data.get("generaciones", generaciones)),
        "sigma": float(data.get("sigma", sigma)),
    }
    if data.get("mensaje"):
        out["mensaje"] = str(data["mensaje"])
    return out


def _run_local(mu: int, sigma: float, generaciones: int) -> dict:
    try:
        return _parse_result(ejecutar_local(mu, sigma, generaciones), mu, sigma, generaciones)
    except ValueError as exc:
        raise AlgorithmServiceError(str(exc), status_code=400) from exc


async def run_algorithm(mu: int, sigma: float, generaciones: int) -> dict:
    if settings.run_evolution_locally:
        return _run_local(mu, sigma, generaciones)

    payload = {"mu": mu, "sigma": sigma, "generaciones": generaciones}
    url = settings.cloud_function_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=settings.cloud_function_timeout_seconds) as client:
            response = await client.post(url, json=payload)
    except httpx.RequestError as exc:
        raise AlgorithmServiceError(f"Could not reach algorithm service: {exc}") from exc

    if response.status_code >= 400:
        if response.status_code == 400 and _legacy_limit_error(response.text):
            return _run_local(mu, sigma, generaciones)
        detail = response.text[:200]
        raise AlgorithmServiceError(
            f"Algorithm service error ({response.status_code}): {detail}",
            status_code=502,
        )

    try:
        return _parse_result(response.json(), mu, sigma, generaciones)
    except (KeyError, TypeError, ValueError) as exc:
        raise AlgorithmServiceError("Invalid response from algorithm service") from exc
