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


def analyze_roof(image_path: Path) -> dict:
    settings = get_settings()
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

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
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"]
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return {"idoneita": "errore", "note": "JSON non valido"}
        return json.loads(match.group())
    except Exception as exc:
        return {"idoneita": "errore", "note": str(exc)[:120]}
