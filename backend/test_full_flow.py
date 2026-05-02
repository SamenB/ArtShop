"""Reproduce the full submit flow to find where Pydantic leaks in."""
import asyncio
import sys
import traceback as tb

sys.path.insert(0, ".")

from src.database import new_session
from src.integrations.prodigi.fulfillment.workflow import ProdigiFulfillmentWorkflow
from src.utils.db_manager import DBManager


async def main():
    async with new_session() as session:
        # Step 1: Simulate what OrderService.submit_order_to_print_provider does
        # It calls self.db.orders.get_one(id=order_id) which returns Pydantic
        from src.repositories.orders import OrdersRepository
        repo = OrdersRepository(session)
        order_pydantic = await repo.get_one(id=32)
        print(f"1. Repository returns: {type(order_pydantic).__name__}")
        print(f"   items[0] type: {type(order_pydantic.items[0]).__name__}")

        # Step 2: Simulate submit_ready_order which calls _load_order
        wf = ProdigiFulfillmentWorkflow(session)
        order_orm = await wf._load_order(order_pydantic.id)
        print(f"\n2. _load_order returns: {type(order_orm).__name__}")
        print(f"   items[0] type: {type(order_orm.items[0]).__name__}")

        # Step 3: Simulate run_preflight calling _load_order again
        order_orm2 = await wf._load_order(order_orm.id)
        print(f"\n3. Second _load_order returns: {type(order_orm2).__name__}")
        print(f"   Same object? {order_orm is order_orm2}")
        print(f"   items[0] type: {type(order_orm2.items[0]).__name__}")

        # Step 4: After flush (simulating _create_or_get_job)
        await session.flush()
        print(f"\n4. After flush:")
        print(f"   order_orm items[0] type: {type(order_orm.items[0]).__name__}")

        # Step 5: Check if items are still accessible
        for i, item in enumerate(order_orm.items):
            has_field = hasattr(item, "prodigi_order_item_id")
            print(f"   item[{i}] type={type(item).__name__}, has prodigi_order_item_id={has_field}")

        # Step 6: Try setting prodigi_order_item_id
        try:
            order_orm.items[0].prodigi_order_item_id = "test-value"
            print(f"\n5. Setting prodigi_order_item_id: OK")
        except Exception as e:
            print(f"\n5. Setting prodigi_order_item_id FAILED: {e}")
            tb.print_exc()

        await session.rollback()


asyncio.run(main())
