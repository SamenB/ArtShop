"""Quick diagnostic: can we set prodigi_order_item_id on ORM items?"""
import asyncio
import sys
import traceback as tb

sys.path.insert(0, ".")

from src.database import new_session
from src.integrations.prodigi.fulfillment.status import apply_prodigi_items_to_local_items
from src.integrations.prodigi.fulfillment.workflow import ProdigiFulfillmentWorkflow


async def main():
    async with new_session() as s:
        wf = ProdigiFulfillmentWorkflow(s)
        order = await wf._load_order(32)
        print("Order type:", type(order))
        print("Items count:", len(order.items))
        for i, item in enumerate(order.items):
            has_field = hasattr(item, "prodigi_order_item_id")
            print(f"  item[{i}] type: {type(item).__name__}, has prodigi_order_item_id: {has_field}")

        # Try setting prodigi_order_item_id directly
        try:
            order.items[0].prodigi_order_item_id = "test-123"
            print("Direct set: OK")
        except Exception as e:
            print(f"Direct set FAILED: {e}")
            tb.print_exc()

        # Try via apply_prodigi_items_to_local_items
        item_id = order.items[0].id
        fake_order_data = {
            "items": [
                {
                    "id": "test-item-id",
                    "merchantReference": f"artshop-order-32-item-{item_id}",
                    "status": "InProgress",
                }
            ]
        }
        try:
            apply_prodigi_items_to_local_items(order, fake_order_data)
            print("apply_prodigi_items: OK")
        except Exception as e:
            print(f"apply_prodigi_items FAILED: {e}")
            tb.print_exc()

        # Now rollback since this is just a test
        await s.rollback()


asyncio.run(main())
