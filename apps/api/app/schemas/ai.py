from typing import Literal

from pydantic import BaseModel, Field


class AiSuggestionRequest(BaseModel):
    purpose: Literal["categorization", "query", "insight"]
    prompt: str = Field(min_length=1, max_length=4000)


class AiSuggestionResponse(BaseModel):
    suggestion: str
    authoritative: Literal[False] = False
    persisted: Literal[False] = False
    warning: str = "AI output is untrusted guidance; SQL and user-approved rules remain authoritative."
