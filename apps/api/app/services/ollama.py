"""Optional local Ollama adapter. It can suggest text but cannot mutate state."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class OllamaUnavailableError(RuntimeError):
    pass


def generate_suggestion(
    base_url: str,
    model: str,
    purpose: str,
    prompt: str,
    timeout: int,
) -> str:
    instruction = (
        "You are a non-authoritative assistant for personal-finance software. "
        "Never claim to calculate balances, totals, tax, or other financial facts. "
        "Do not output SQL or instructions to modify records. Return only a concise suggestion."
    )
    body = json.dumps(
        {
            "model": model,
            "stream": False,
            "prompt": f"{instruction}\nPurpose: {purpose}\nInput: {prompt}",
        }
    ).encode()
    request = Request(
        f"{base_url.rstrip('/')}/api/generate",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise OllamaUnavailableError("local Ollama request failed") from exc
    suggestion = payload.get("response") if isinstance(payload, dict) else None
    if not isinstance(suggestion, str) or not suggestion.strip():
        raise OllamaUnavailableError("local Ollama returned an invalid response")
    return suggestion.strip()
