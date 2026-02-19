from fastapi import APIRouter, Body, HTTPException

from src.api.dependencies import DBDep, UserDep
from src.exeptions import (
    ObjectNotFoundException,
    AllArtworksSoldOutException,
    DatabaseException,
)
from src.services.orders import OrderService
from src.schemas.orders import OrderAddRequest, OrderBulkRequest


router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("")
async def get_all_orders(db: DBDep):
    try:
        return await OrderService(db).get_all_orders()
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")


@router.get("/me")
async def get_my_orders(user_id: UserDep, db: DBDep):
    try:
        return await OrderService(db).get_my_orders(user_id)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")


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
    try:
        order = await OrderService(db).create_order(order_data, user_id)
    except ObjectNotFoundException:
        raise HTTPException(status_code=404, detail="Artwork not found")
    except AllArtworksSoldOutException:
        raise HTTPException(status_code=409, detail="All artworks are sold out")
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK", "data": order}


@router.post("/bulk")
async def create_orders_bulk(db: DBDep, orders_data: list[OrderBulkRequest] = Body()):
    try:
        result = await OrderService(db).create_orders_bulk(orders_data)
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
    return {"status": "OK", "data": result}


@router.get("/timeline")
async def get_orders_timeline(db: DBDep):
    try:
        return await OrderService(db).get_orders_timeline()
    except DatabaseException:
        raise HTTPException(status_code=500, detail="Database error")
