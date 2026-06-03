UNAL_DOMAIN = "@unal.edu.co"


def normalize_unal_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized.endswith(UNAL_DOMAIN):
        raise ValueError("El correo debe ser del dominio @unal.edu.co")
    local = normalized[: -len(UNAL_DOMAIN)]
    if not local or "@" in local:
        raise ValueError("El correo debe ser del dominio @unal.edu.co")
    return normalized
