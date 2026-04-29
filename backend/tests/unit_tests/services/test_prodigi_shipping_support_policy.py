from src.integrations.prodigi.services.prodigi_shipping_support_policy import (
    ProdigiShippingSupportPolicyService,
)


def test_shipping_support_prefers_fastest_tier_when_available_under_cap() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 20.0, "delivery_days": "3-5 days"},
            {"tier": "express", "shipping_price": 28.0, "delivery_days": "1-3 days"},
            {"tier": "overnight", "shipping_price": 34.0, "delivery_days": "1 day"},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "overnight"
    assert result["chosen_shipping_method"] == "Overnight"
    assert result["selection_reason"] == "under_cap_preferred"


def test_shipping_support_falls_back_to_standard_when_faster_tiers_are_over_cap() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "express", "shipping_price": 38.0},
            {"tier": "standard", "shipping_price": 19.0},
            {"tier": "budget", "shipping_price": 9.95},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "standard"
    assert result["chosen_shipping_price"] == 19.0


def test_shipping_support_falls_back_to_budget_when_it_is_only_tier_under_cap() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "express", "shipping_price": 40.0},
            {"tier": "standard", "shipping_price": 36.0},
            {"tier": "budget", "shipping_price": 19.0},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "budget"


def test_shipping_support_blocks_when_all_tiers_are_too_expensive() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 180.0, "delivery_days": "3-5 days"},
            {"tier": "express", "shipping_price": 230.0, "delivery_days": "1-3 days"},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "standard"
    assert result["chosen_shipping_price"] == 180.0
    assert result["selection_reason"] == "fallback_standard_over_cap"


def test_shipping_support_accepts_express_and_overnight_routes_under_cap() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "express", "shipping_price": 18.0, "delivery_days": "1-3 days"},
            {"tier": "overnight", "shipping_price": 24.0, "delivery_days": "1 day"},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "overnight"
    assert result["chosen_shipping_method"] == "Overnight"
    assert result["available_tiers"] == ["express", "overnight"]


def test_shipping_support_blocks_large_shipping_above_strict_cap() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 36.0, "delivery_days": "3-5 days"},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "standard"
    assert result["selection_reason"] == "fallback_standard_over_cap"


def test_shipping_support_chooses_cheapest_only_when_standard_is_absent() -> None:
    service = ProdigiShippingSupportPolicyService()

    result = service.evaluate_size(
        [
            {"tier": "express", "shipping_price": 80.0},
            {"tier": "overnight", "shipping_price": 120.0},
        ]
    )

    assert result["status"] == "covered"
    assert result["chosen_tier"] == "express"
    assert result["chosen_shipping_price"] == 80.0
    assert result["selection_reason"] == "fallback_cheapest_missing_standard"


def test_shipping_support_can_still_block_when_configured() -> None:
    service = ProdigiShippingSupportPolicyService(
        {"fallback_when_none_under_cap": "block"}
    )

    result = service.evaluate_size(
        [
            {"tier": "standard", "shipping_price": 36.0},
        ]
    )

    assert result["status"] == "blocked"
    assert result["chosen_tier"] is None
