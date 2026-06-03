import math
import random
from typing import Any

import functions_framework
from flask import Request

MAX_MU_POR_GENERACIONES = 10_000


def fitness(x: float) -> float:
    """Multimodal objective on [-10, 10]; global minimum is not at x = 0."""
    return (
        0.25 * (x - 2.1) ** 2
        + math.sin(2.8 * x)
        + 0.6 * math.cos(4.2 * x)
        + 0.15 * math.sin(1.7 * x + 1.2) ** 2
    )


def aplicar_limite_iteraciones(mu: int, generaciones: int) -> tuple[int, int, str | None]:
    """Cap generations so mu * generaciones <= MAX_MU_POR_GENERACIONES."""
    producto = mu * generaciones
    if producto <= MAX_MU_POR_GENERACIONES:
        return mu, generaciones, None

    generaciones_ajustadas = MAX_MU_POR_GENERACIONES // mu
    if generaciones_ajustadas < 1:
        raise ValueError(
            f"Con μ={mu}, μ×generaciones debe ser <= {MAX_MU_POR_GENERACIONES}. "
            "Reduce μ para poder ejecutar al menos una generación."
        )

    mensaje = (
        f"Las generaciones se ajustaron de {generaciones} a {generaciones_ajustadas} "
        f"porque μ×generaciones no puede superar {MAX_MU_POR_GENERACIONES} "
        f"(límite de iteraciones del servidor)."
    )
    return mu, generaciones_ajustadas, mensaje


def ejecutar(mu: int, sigma: float, generaciones: int) -> dict[str, Any]:
    mu, generaciones, mensaje = aplicar_limite_iteraciones(mu, generaciones)

    poblacion = [random.uniform(-10, 10) for _ in range(mu)]

    for _ in range(generaciones):
        hijos = []
        for x in poblacion:
            hijo = x + random.gauss(0, sigma)
            hijos.append(hijo)

        poblacion += hijos
        poblacion.sort(key=fitness)
        poblacion = poblacion[:mu]

    mejor = poblacion[0]
    resultado: dict[str, Any] = {
        "solucion": mejor,
        "fitness": fitness(mejor),
        "mu": mu,
        "sigma": sigma,
        "generaciones": generaciones,
    }
    if mensaje:
        resultado["mensaje"] = mensaje
    return resultado


def _parse_body(request: Request) -> dict[str, Any]:
    if request.is_json:
        return request.get_json(silent=True) or {}
    return {}


def _validar_entrada(mu: int, sigma: float, generaciones: int) -> str | None:
    if mu < 1:
        return "μ debe ser un entero >= 1 (no se permiten valores negativos ni cero)."
    if generaciones < 1:
        return "generaciones debe ser un entero >= 1 (no se permiten valores negativos ni cero)."
    if sigma <= 0:
        return "σ debe ser > 0 (no se permiten valores negativos ni cero)."
    return None


@functions_framework.http
def run_evolution(request: Request):
    if request.method == "OPTIONS":
        return ("", 204, {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"})

    if request.method != "POST":
        return ({"error": "Method not allowed"}, 405, {"Content-Type": "application/json"})

    body = _parse_body(request)
    try:
        mu = int(body["mu"])
        sigma = float(body["sigma"])
        generaciones = int(body["generaciones"])
    except (KeyError, TypeError, ValueError):
        return ({"error": "mu, sigma and generaciones are required"}, 400, {"Content-Type": "application/json"})

    error = _validar_entrada(mu, sigma, generaciones)
    if error:
        return ({"error": error}, 400, {"Content-Type": "application/json"})

    try:
        result = ejecutar(mu, sigma, generaciones)
    except ValueError as exc:
        return ({"error": str(exc)}, 400, {"Content-Type": "application/json"})

    headers = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    return (result, 200, headers)
