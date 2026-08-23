from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.schemas.ai import AiSuggestionRequest, AiSuggestionResponse
from app.services.ollama import OllamaUnavailableError, generate_suggestion

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


@router.get("/status")
def ai_status() -> dict[str, bool | str]:
    return {
        "enabled": settings.ollama_enabled,
        "provider": "ollama",
        "authoritative": False,
    }


@router.post("/suggest", response_model=AiSuggestionResponse)
def suggest(data: AiSuggestionRequest) -> AiSuggestionResponse:
    if not settings.ollama_enabled or not settings.ollama_model:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Local AI is disabled")
    try:
        suggestion = generate_suggestion(
            settings.ollama_base_url,
            settings.ollama_model,
            data.purpose,
            data.prompt,
            settings.ollama_timeout_seconds,
        )
    except OllamaUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return AiSuggestionResponse(suggestion=suggestion)
