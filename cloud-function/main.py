import random
from typing import Any

import functions_framework
from flask import Request


def ejecutar(mu: int, sigma: float, generaciones: int) -> dict[str, float]:
    def fitness(x: float) -> float:
        return x**2

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
    return {"solucion": mejor, "fitness": fitness(mejor)}


def _parse_body(request: Request) -> dict[str, Any]:
    if request.is_json:
        return request.get_json(silent=True) or {}
    return {}


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

    if mu < 1 or mu > 500:
        return ({"error": "mu must be between 1 and 500"}, 400, {"Content-Type": "application/json"})
    if sigma <= 0 or sigma > 10:
        return ({"error": "sigma must be between 0 and 10 (exclusive 0)"}, 400, {"Content-Type": "application/json"})
    if generaciones < 1 or generaciones > 500:
        return ({"error": "generaciones must be between 1 and 500"}, 400, {"Content-Type": "application/json"})

    result = ejecutar(mu, sigma, generaciones)
    headers = {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}
    return (result, 200, headers)
