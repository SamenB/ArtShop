from src.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)


def test_shipping_support_prefers_express_when_premium_is_small() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 20.0, "delivery_days": "3-5 days"},
            {"tier": "express", "shipping_price": 28.0, "delivery_days": "1-3 days"},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "express"


def test_shipping_support_blocks_when_all_tiers_are_too_expensive() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 180.0, "delivery_days": "3-5 days"},
            {"tier": "express", "shipping_price": 230.0, "delivery_days": "1-3 days"},
        ]
    )

    assert result["status"] == "blocked"
    assert result["chosen_tier"] is None


def test_shipping_support_blocks_large_shipping_above_strict_cap() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 36.0, "delivery_days": "3-5 days"},
        ]
    )

    assert result["status"] == "blocked"
    assert result["chosen_tier"] is None
