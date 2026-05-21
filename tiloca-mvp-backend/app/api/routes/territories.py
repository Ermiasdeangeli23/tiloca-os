from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.territory import Territory
from app.schemas.territory import TerritoryRead

router = APIRouter(prefix="/territories", tags=["territories"])


@router.get("", response_model=list[TerritoryRead])
def list_territories(db: Session = Depends(get_db)) -> list[Territory]:
    return db.query(Territory).order_by(Territory.slug).all()
