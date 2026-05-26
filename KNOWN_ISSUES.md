# Tiloca — Known Issues

## Risolti

### [3.31] Vision analysis returned "errore"

**Date:** 2026-05-26  
**Severity:** HIGH

**Problema:**  
Gli scan recenti di Brescia salvavano `suitability="errore"` e `roof_type=null`.

**Causa:**  
La OpenAI API key era invalida/revocata. L'errore veniva catturato in modo generico e salvato come `errore`.

**Fix:**  
Aggiunto debug strutturato in `vision_analysis.py` e `scan_service.py`.  
Configurata nuova OpenAI API key.  
Test Brescia confermato con `vision_failures_count=0`.

**Prevenzione:**  
Aggiunto script:

```powershell
.\.venv\Scripts\python.exe -m scripts.vision_health_check