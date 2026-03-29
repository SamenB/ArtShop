from fastapi import APIRouter, Body

from src.api.dependencies import AdminDep, DBDep, UserDep, UserDepOptional
from src.schemas.orders import OrderAddRequest, OrderBulkRequest, OrderStatusUpdate
from src.services.orders import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("")
async def get_all_orders(admin_id: AdminDep, db: DBDep):
    return await OrderService(db).get_all_orders()


@router.get("/me")
async def get_my_orders(user_id: UserDep, db: DBDep):
    return await OrderService(db).get_my_orders(user_id)


@router.post("")
async def create_order(
    db: DBDep,
    order_data: OrderAddRequest,
    user_id: UserDepOptional = None,
):
    order = await OrderService(db).create_order(order_data, user_id)
    return {"status": "OK", "data": order}


@router.post("/bulk")
async def create_orders_bulk(db: DBDep, orders_data: list[OrderBulkRequest] = Body()):
    result = await OrderService(db).create_orders_bulk(orders_data)
    return {"status": "OK", "data": result}


@router.get("/timeline")
async def get_orders_timeline(admin_id: AdminDep, db: DBDep):
    return await OrderService(db).get_orders_timeline()


@router.put("/{order_id}/status")
async def update_order_status(
    order_id: int, admin_id: AdminDep, db: DBDep, status_data: OrderStatusUpdate
):
    await OrderService(db).update_payment_status(order_id, status_data.payment_status)
    return {"status": "OK"}
