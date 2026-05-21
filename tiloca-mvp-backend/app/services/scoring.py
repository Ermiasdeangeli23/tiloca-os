def estimate_kwp(area_mq: int, roof_type: str = "piano") -> int:
    usable_area = area_mq * 0.75
    kwp = usable_area / 5
    if roof_type == "shed":
        kwp *= 0.85
    return int(kwp)


def should_keep_analysis(analysis: dict) -> bool:
    if not analysis.get("e_industriale", True):
        return False
    if analysis.get("ha_pannelli", False) and analysis.get("idoneita") != "alta":
        return False
    return True
