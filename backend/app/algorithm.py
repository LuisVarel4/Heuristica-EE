import httpx

from app.config import settings


class AlgorithmServiceError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


async def run_algorithm(mu: int, sigma: float, generaciones: int) -> dict[str, float]:
    payload = {"mu": mu, "sigma": sigma, "generaciones": generaciones}
    url = settings.cloud_function_url.rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=settings.cloud_function_timeout_seconds) as client:
            response = await client.post(url, json=payload)
    except httpx.RequestError as exc:
        raise AlgorithmServiceError(f"Could not reach algorithm service: {exc}") from exc

    if response.status_code >= 400:
        detail = response.text[:200]
        raise AlgorithmServiceError(
            f"Algorithm service error ({response.status_code}): {detail}",
            status_code=502,
        )

    data = response.json()
    try:
        return {"solucion": float(data["solucion"]), "fitness": float(data["fitness"])}
    except (KeyError, TypeError, ValueError) as exc:
        raise AlgorithmServiceError("Invalid response from algorithm service") from exc
