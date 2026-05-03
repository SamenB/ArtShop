from types import SimpleNamespace

from src.integrations.prodigi.fulfillment.status import (
    apply_order_status_to_job,
    apply_prodigi_items_to_local_items,
    extract_order_data,
    extract_stage,
    format_item_status,
    job_status_from_order_payload,
)


def test_extract_order_data_accepts_cloudevent_data_order():
    event = {
        "type": "com.prodigi.order.status.stage.changed#InProgress",
        "data": {"order": {"id": "ord_1", "status": {"stage": "InProgress"}}},
    }

    order_data = extract_order_data(event)

    assert order_data["id"] == "ord_1"
    assert extract_stage(event, order_data) == "InProgress"


def test_extract_order_data_accepts_compact_data_shape():
    event = {
        "type": "com.prodigi.order.status.stage.changed#Complete",
        "data": {"id": "ord_2", "status": {"stage": "Complete"}},
    }

    order_data = extract_order_data(event)

    assert order_data["id"] == "ord_2"
    assert extract_stage(event, order_data) == "Complete"


def test_status_mapping_covers_terminal_and_issue_stages():
    assert job_status_from_order_payload({"status": {"stage": "InProgress"}}) == "in_progress"
    assert job_status_from_order_payload({"status": {"stage": "Complete"}}) == "complete"
    assert job_status_from_order_payload({"status": {"stage": "Cancelled"}}) == "cancelled"
    assert (
        job_status_from_order_payload(
            {"status": {"stage": "InProgress", "issues": [{"errorCode": "BadAsset"}]}}
        )
        == "issue"
    )


def test_apply_order_status_to_job_persists_status_snapshot():
    job = SimpleNamespace(
        status="submitted",
        latest_status_payload=None,
        response_payload=None,
        status_stage=None,
        status_details=None,
        issues=None,
        prodigi_order_id=None,
        submitted_at=None,
        last_error=None,
    )
    payload = {
        "id": "ord_123",
        "status": {
            "stage": "InProgress",
            "details": {"downloadAssets": "Complete"},
            "issues": [],
        },
    }

    apply_order_status_to_job(job=job, order_data=payload, response_payload={"order": payload})

    assert job.prodigi_order_id == "ord_123"
    assert job.status_stage == "InProgress"
    assert job.status_details == {"downloadAssets": "Complete"}
    assert job.latest_status_payload == payload


def test_apply_prodigi_items_to_local_items_uses_merchant_reference():
    item = SimpleNamespace(id=11, prodigi_order_item_id=None, prodigi_asset_id=None)
    order = SimpleNamespace(id=101, items=[item])

    apply_prodigi_items_to_local_items(
        order,
        {
            "items": [
                {
                    "id": "ori_1",
                    "merchantReference": "artshop-order-101-item-11",
                    "status": "Ok",
                    "assets": [{"id": "ast_1"}],
                }
            ]
        },
    )

    assert item.prodigi_order_item_id == "ori_1"
    assert item.prodigi_asset_id == "ast_1"
    assert item.prodigi_status == "Ok"


def test_format_item_status_includes_first_issue_code():
    assert (
        format_item_status("InProgress", [{"errorCode": "order.items.assets.NotDownloaded"}])
        == "InProgress - order.items.assets.NotDownloaded"
    )
