from fastapi import APIRouter, Request, BackgroundTasks
from sqlalchemy import select
import logging

from src.api.dependencies import DBDep
from src.models.orders import OrderItemOrm

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])

@router.post("/prodigi")
async def prodigi_callback(request: Request, db: DBDep, background_tasks: BackgroundTasks):
    try:
        event = await request.json()
    except Exception as e:
        log.error(f"Invalid JSON payload for Prodigi webhook: {e}")
        return {"status": "error", "message": "invalid payload"}
        
    log.info(f"Received Prodigi webhook event: {event}")
    
    # Example event structure from Prodigi:
    # {
    #   "id": "fe9a123-...",
    #   "type": "OrderStatusChanged",
    #   "data": {
    #     "order": {
    #       "id": "ord_12345",
    #       "status": {"stage": "Shipped", "issues": []}
    #     }
    #   }
    # }
    
    if event.get("type") != "OrderStatusChanged":
        return {"status": "ok"}
        
    data = event.get("data", {})
    order_data = data.get("order", {})
    ord_id = order_data.get("id")
    status_data = order_data.get("status", {})
    stage = status_data.get("stage")
    
    if not ord_id or not stage:
         log.error("Missing order id or stage in Prodigi webhook payload")
         return {"status": "error"}
         
    # Find matching OrderItem
    stmt = select(OrderItemOrm).where(OrderItemOrm.prodigi_order_id == ord_id)
    result = await db.execute(stmt)
    item = result.scalars().first()
    
    if not item:
        log.warning(f"Received Prodigi update for unknown order_id: {ord_id}")
        return {"status": "ok"}
        
    item.prodigi_status = stage
    await db.commit()
    
    log.info(f"Updated OrderItem {item.id} prodigi_status to {stage}")
    
    return {"status": "ok"}
