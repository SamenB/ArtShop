"""
API endpoints for managing artwork orders.
Includes order creation, tracking, and administrative management.
"""

from fastapi import APIRouter, Body

from src.api.dependencies import AdminDep, DBDep, UserDep, UserDepOptional
from src.schemas.orders import OrderAddRequest, OrderBulkRequest, OrderPatch, OrderStatusUpdate
from src.services.orders import OrderService

router = APIRouter(prefix="/orders", tags=["Orders"])


@router.get("")
async def get_all_orders(admin_id: AdminDep, db: DBDep):
    """
    Retrieves all orders in the system. Requires admin privileges.
    """
    return await OrderService(db).get_all_orders()


@router.get("/me")
async def get_my_orders(user_id: UserDep, db: DBDep):
    """
    Retrieves all orders belonging to the currently authenticated user.
    """
    return await OrderService(db).get_my_orders(user_id)


@router.get("/track")
async def track_orders_by_email(email: str, db: DBDep):
    """
    Public endpoint for order tracking by email address.
    Allows guests (non-authenticated) to look up their order status.
    Returns a sanitized list of orders associated with the provided email.
    """
    if not email or "@" not in email:
        return {"status": "OK", "data": []}
    orders = await OrderService(db).get_orders_by_email(email.strip().lower())
    # Return sanitized order data — only what the customer needs
    result = []
    for order in orders:
        result.append(
            {
                "id": order.id,
                "created_at": str(order.created_at) if order.created_at else None,
                "payment_status": order.payment_status,
                "total_price": order.total_price,
                "first_name": order.first_name,
                "last_name": order.last_name,
                "shipping_city": order.shipping_city,
                "shipping_country": order.shipping_country,
                "items": [
                    {
                        "artwork_id": item.artwork_id,
                        "edition_type": item.edition_type,
                        "finish": item.finish,
                        "size": item.size,
                        "price": item.price,
                    }
                    for item in (order.items or [])
                ],
            }
        )
    return {"status": "OK", "data": result}


@router.post("")
async def create_order(
    db: DBDep,
    order_data: OrderAddRequest,
    user_id: UserDepOptional = None,
):
    """
    Creates a new order. Optionally associates the order with a user ID if authenticated.
    """
    order = await OrderService(db).create_order(order_data, user_id)
    return {"status": "OK", "data": order}


@router.post("/bulk")
async def create_orders_bulk(db: DBDep, orders_data: list[OrderBulkRequest] = Body()):
    """
    Creates multiple orders in a single request. Primarily used for data migration or testing.
    """
    result = await OrderService(db).create_orders_bulk(orders_data)
    return {"status": "OK", "data": result}


@router.get("/timeline")
async def get_orders_timeline(admin_id: AdminDep, db: DBDep):
    """
    Retrieves a timeline view of all orders. Requires admin privileges.
    """
    return await OrderService(db).get_orders_timeline()


@router.put("/{order_id}/status")
async def update_order_status(
    order_id: int, admin_id: AdminDep, db: DBDep, status_data: OrderStatusUpdate
):
    """
    Updates the payment status of a specific order. Requires admin privileges.
    """
    await OrderService(db).update_payment_status(order_id, status_data.payment_status)
    return {"status": "OK"}


@router.patch("/{order_id}")
async def patch_order(
    order_id: int, admin_id: AdminDep, db: DBDep, order_patch: OrderPatch
):
    """
    Applies partial updates to a specific order. Requires admin privileges.
    """
    await OrderService(db).patch_order(order_id, order_patch)
    return {"status": "OK"}


@router.delete("/{order_id}")
async def delete_order(order_id: int, admin_id: AdminDep, db: DBDep):
    """
    Permanently deletes a specific order record. Requires admin privileges.
    """
    await OrderService(db).delete_order(order_id)
    return {"status": "OK"}
