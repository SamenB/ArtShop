from fastapi import APIRouter, Body, HTTPException

from src.api.dependencies import DBDep, UserDep

from src.services.orders import OrderService
from src.schemas.orders import OrderAddRequest, OrderBulkRequest


router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("")
async def get_all_orders(db: DBDep):
    return await OrderService(db).get_all_orders()


@router.get("/me")
async def get_my_orders(user_id: UserDep, db: DBDep):
    return await OrderService(db).get_my_orders(user_id)


@router.post("")
async def create_order(
    user_id: UserDep,
    db: DBDep,
    order_data: OrderAddRequest = Body(
        openapi_examples={
            "1": {
                "summary": "Basic order",
                "value": {
                    "artwork_id": 1,
                },
            }
        },
    ),
):
    order = await OrderService(db).create_order(order_data, user_id)
    return {"status": "OK", "data": order}


@router.post("/bulk")
async def create_orders_bulk(db: DBDep, orders_data: list[OrderBulkRequest] = Body()):
    result = await OrderService(db).create_orders_bulk(orders_data)
    return {"status": "OK", "data": result}


@router.get("/timeline")
async def get_orders_timeline(db: DBDep):
    return await OrderService(db).get_orders_timeline()
