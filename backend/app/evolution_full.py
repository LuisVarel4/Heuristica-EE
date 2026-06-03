"""Estrategia evolutiva COMPLETA — solo para la demostración del panel admin.

A diferencia de `evolution.py` (la versión simple que usan los estudiantes, que es
en la práctica un RMHC en paralelo con σ fijo), aquí está la EE "de verdad":

  - Individuo de doble hélice: cada solución lleva su PROPIO paso de mutación.
        individuo = (x, σ)
  - Recombinación de ρ padres (discreta para x, intermedia para σ).
  - Auto-adaptación log-normal: σ muta solo y x usa ese nuevo σ.
        σ' = σ · exp(τ · N(0,1))
        x' = x + σ' · N(0,1)
  - Selección (μ, λ) "coma": los μ mejores salen SOLO de los λ hijos.

La función objetivo es la misma que ve el estudiante (se importa de evolution.py
para no duplicarla).
"""

import math
import random
from typing import Any

from app.evolution import fitness

LOWER, UPPER = -10.0, 10.0
SIGMA_FLOOR = 1e-12
SIGMA_INIT_MIN, SIGMA_INIT_MAX = 0.5, 4.0


def global_optimum(samples: int = 200_000) -> tuple[float, float]:
    """Búsqueda fina en malla del óptimo global, como referencia para la demo."""
    step = (UPPER - LOWER) / samples
    best_x = LOWER
    best_f = fitness(LOWER)
    for i in range(1, samples + 1):
        x = LOWER + i * step
        f = fitness(x)
        if f < best_f:
            best_f, best_x = f, x
    return best_x, best_f


def _sample_xs(xs: list[float], cap: int, rng: random.Random) -> list[float]:
    if len(xs) <= cap:
        return [round(x, 6) for x in xs]
    return [round(x, 6) for x in rng.sample(xs, cap)]


def ejecutar_es(
    mu: int,
    lam: int,
    rho: int,
    generaciones: int,
    tau: float | None = None,
    seed: int | None = None,
    pop_cap: int = 80,
) -> dict[str, Any]:
    """Corre una EE (μ/ρ, λ) auto-adaptativa y devuelve la trayectoria completa."""
    if lam < mu:
        raise ValueError("λ debe ser ≥ μ para selección (μ, λ).")
    if rho < 1 or rho > mu:
        raise ValueError("ρ debe estar entre 1 y μ.")

    rng = random.Random(seed)
    if tau is None:
        # Regla estándar para n=1 variable de objeto.
        tau = 1.0 / math.sqrt(2.0)

    # Población inicial de doble hélice: (x, σ).
    poblacion: list[tuple[float, float]] = [
        (rng.uniform(LOWER, UPPER), rng.uniform(SIGMA_INIT_MIN, SIGMA_INIT_MAX))
        for _ in range(mu)
    ]

    history: list[dict[str, Any]] = []

    def registrar(
        gen: int,
        pop: list[tuple[float, float]],
        hijos: list[tuple[float, float]] | None = None,
    ) -> None:
        fits = [fitness(x) for x, _ in pop]
        best_i = min(range(len(pop)), key=lambda i: fits[i])
        history.append(
            {
                "gen": gen,
                "best_fitness": fits[best_i],
                "best_x": pop[best_i][0],
                "mean_sigma": sum(s for _, s in pop) / len(pop),
                "poblacion": _sample_xs([x for x, _ in pop], pop_cap, rng),
                "hijos": _sample_xs([x for x, _ in hijos], pop_cap, rng) if hijos else [],
            }
        )

    registrar(0, poblacion)

    for gen in range(1, generaciones + 1):
        hijos: list[tuple[float, float]] = []
        for _ in range(lam):
            padres = rng.sample(poblacion, rho)
            # Recombinación: discreta para x, intermedia (promedio) para σ.
            x_rec = rng.choice(padres)[0]
            sigma_rec = sum(s for _, s in padres) / len(padres)
            # Auto-adaptación: σ muta PRIMERO, luego x usa ese nuevo σ.
            sigma_new = max(SIGMA_FLOOR, sigma_rec * math.exp(tau * rng.gauss(0, 1)))
            x_new = x_rec + sigma_new * rng.gauss(0, 1)
            hijos.append((x_new, sigma_new))

        # Selección (μ, λ) coma: los mejores μ salen solo de los hijos.
        hijos_ordenados = sorted(hijos, key=lambda ind: fitness(ind[0]))
        poblacion = hijos_ordenados[:mu]
        registrar(gen, poblacion, hijos)

    mejor = min(poblacion, key=lambda ind: fitness(ind[0]))
    return {
        "best_x": mejor[0],
        "best_sigma": mejor[1],
        "best_fitness": fitness(mejor[0]),
        "history": history,
    }


def ejecutar_demo(
    mu: int,
    lam: int,
    rho: int,
    generaciones: int,
    tau: float | None = None,
    runs: int = 1,
    seed: int | None = None,
    fitness_tol: float = 1e-3,
) -> dict[str, Any]:
    """Corre `runs` ejecuciones independientes y reporta la tasa de éxito real."""
    gx, gf = global_optimum()
    corridas: list[dict[str, Any]] = []
    exitos = 0
    for r in range(runs):
        s = None if seed is None else seed + r
        res = ejecutar_es(mu, lam, rho, generaciones, tau, s)
        converged = (res["best_fitness"] - gf) <= fitness_tol
        if converged:
            exitos += 1
        res["seed"] = s
        res["converged"] = converged
        corridas.append(res)

    return {
        "params": {
            "mu": mu,
            "lambda": lam,
            "rho": rho,
            "generaciones": generaciones,
            "tau": tau if tau is not None else round(1.0 / math.sqrt(2.0), 6),
            "runs": runs,
            "seed": seed,
        },
        "global_optimum": {"x": gx, "fitness": gf},
        "success_rate": exitos / runs if runs else 0.0,
        "runs": corridas,
    }
