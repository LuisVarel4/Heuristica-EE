"""Same algorithm as cloud-function/main.py (keep in sync)."""

import math
import random
from typing import Any

MAX_MU_POR_GENERACIONES = 10_000


def fitness(x: float) -> float:
    return (
        0.25 * (x - 2.1) ** 2
        + math.sin(2.8 * x)
        + 0.6 * math.cos(4.2 * x)
        + 0.15 * math.sin(1.7 * x + 1.2) ** 2
    )


def aplicar_limite_iteraciones(mu: int, generaciones: int) -> tuple[int, int, str | None]:
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
    if mu < 1:
        raise ValueError("μ debe ser un entero >= 1.")
    if generaciones < 1:
        raise ValueError("generaciones debe ser un entero >= 1.")
    if sigma <= 0:
        raise ValueError("σ debe ser > 0.")

    mu, generaciones, mensaje = aplicar_limite_iteraciones(mu, generaciones)

    poblacion = [random.uniform(-10, 10) for _ in range(mu)]

    for _ in range(generaciones):
        hijos = [x + random.gauss(0, sigma) for x in poblacion]
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
