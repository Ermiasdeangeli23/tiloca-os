import base64
import json
import re
from pathlib import Path

import requests

from app.core.config import get_settings


VISION_PROMPT = """Analizza questa immagine satellitare di un edificio industriale.
Rispondi SOLO in JSON valido con questi campi esatti:
{
  "e_industriale": true/false,
  "ha_pannelli": true/false,
  "superficie_mq": numero intero (stima area tetto visibile),
  "tipo_tetto": "shed" | "piano" | "spiovente" | "misto" | "non_visibile",
  "qualita_tetto": "ottima" | "buona" | "mediocre" | "pessima",
  "orientamento": "sud" | "est_ovest" | "nord" | "misto" | "piano",
  "ostacoli": "nessuno" | "pochi" | "molti",
  "idoneita": "alta" | "media" | "bassa" | "nulla",
  "note": "max 15 parole in italiano"
}
Criteri idoneita:
- alta: industriale confermato, tetto libero, >2000mq visibili, qualita buona+
- media: industriale probabile, tetto libero ma piccolo o qualita mediocre
- bassa: dubbi su tipo edificio o presenza pannelli parziale
- nulla: pannelli gia presenti, non industriale, non visibile"""


def _truncate(value: str | None, limit: int = 800) -> str | None:
    if value is None:
        return None
    return value[:limit]


def _failure(
    error: str,
    *,
    vision_status: str = "error",
    raw_model_response: str | None = None,
    parsing_error: str | None = None,
) -> dict:
    note_parts = [error]
    if parsing_error:
        note_parts.append(parsing_error)
    return {
        "idoneita": "errore",
        "tipo_tetto": None,
        "vision_status": vision_status,
        "vision_error": error,
        "raw_model_response": _truncate(raw_model_response),
        "parsing_error": _truncate(parsing_error, 400),
        "note": _truncate(" | ".join(note_parts), 300),
    }


def _is_probably_image(image_path: Path) -> bool:
    header = image_path.read_bytes()[:12]
    return (
        header.startswith(b"\xff\xd8\xff")
        or header.startswith(b"\x89PNG\r\n\x1a\n")
        or header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    )


def analyze_roof(image_path: Path) -> dict:
    settings = get_settings()
    if not settings.openai_api_key:
        return _failure("missing_openai_api_key")

    if not image_path.exists():
        return _failure("image_file_not_found")

    if not image_path.is_file() or image_path.stat().st_size == 0:
        return _failure("invalid_image_file")

    try:
        if not _is_probably_image(image_path):
            return _failure("invalid_image_format")
    except OSError as exc:
        return _failure("image_read_error", parsing_error=str(exc))

    image_b64 = base64.b64encode(image_path.read_bytes()).decode()
    payload = {
        "model": "gpt-4o",
        "max_tokens": 300,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": VISION_PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_b64}",
                            "detail": "high",
                        },
                    },
                ],
            }
        ],
    }
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json=payload,
            timeout=30,
        )
        if response.status_code == 401:
            return _failure("openai_auth_error", raw_model_response=response.text)
        if response.status_code == 403:
            return _failure("openai_permission_error", raw_model_response=response.text)
        if response.status_code == 429:
            return _failure("openai_rate_limit", raw_model_response=response.text)
        if response.status_code >= 400:
            return _failure(f"openai_http_error_{response.status_code}", raw_model_response=response.text)

        try:
            body = response.json()
        except ValueError as exc:
            return _failure(
                "openai_response_not_json",
                raw_model_response=response.text,
                parsing_error=str(exc),
            )

        try:
            text = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            return _failure(
                "unexpected_openai_response_shape",
                raw_model_response=json.dumps(body)[:800],
                parsing_error=str(exc),
            )

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return _failure(
                "model_response_parse_failure",
                raw_model_response=text,
                parsing_error="JSON object not found in model response",
            )

        try:
            parsed = json.loads(match.group())
        except json.JSONDecodeError as exc:
            return _failure(
                "model_response_parse_failure",
                raw_model_response=text,
                parsing_error=str(exc),
            )

        if not isinstance(parsed, dict):
            return _failure(
                "unexpected_model_json_shape",
                raw_model_response=text,
                parsing_error="Parsed JSON is not an object",
            )
        parsed["vision_status"] = "ok"
        return parsed
    except requests.Timeout as exc:
        return _failure("openai_timeout", parsing_error=str(exc))
    except requests.ConnectionError as exc:
        return _failure("openai_connection_error", parsing_error=str(exc))
    except requests.RequestException as exc:
        return _failure("openai_request_error", parsing_error=str(exc))
    except Exception as exc:
        return _failure("unexpected_vision_analysis_error", parsing_error=str(exc))
