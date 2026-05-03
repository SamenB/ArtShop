from src.integrations.prodigi.services.prodigi_shipping_policy import ProdigiShippingPolicyService


def test_shipping_policy_prefers_express_for_storefront_default() -> None:
    service = ProdigiShippingPolicyService()

    result = service.select_storefront_offer(
        [
            {
                "shipping_method": "Standard",
                "service_level": None,
                "service_name": "Standard",
                "source_country": "GB",
                "currency": "GBP",
                "product_price": 40.0,
                "shipping_price": 8.0,
                "total_cost": 48.0,
                "delivery_days": "4-8 days",
                "min_shipping_days": 4,
                "max_shipping_days": 8,
            },
            {
                "shipping_method": "Express",
                "service_level": None,
                "service_name": "Express",
                "source_country": "GB",
                "currency": "GBP",
                "product_price": 40.0,
                "shipping_price": 10.0,
                "total_cost": 50.0,
                "delivery_days": "2-4 days",
                "min_shipping_days": 2,
                "max_shipping_days": 4,
            },
            {
                "shipping_method": "Overnight",
                "service_level": None,
                "service_name": "Overnight",
                "source_country": "GB",
                "currency": "GBP",
                "product_price": 40.0,
                "shipping_price": 25.0,
                "total_cost": 65.0,
                "delivery_days": "1 days",
                "min_shipping_days": 1,
                "max_shipping_days": 1,
            },
        ],
        "UA",
    )

    assert result["default_shipping_tier"] == "express"
    assert result["default_offer"]["shipping_method"] == "Express"
    assert [item["tier"] for item in result["shipping_profiles"]] == [
        "express",
        "standard",
        "overnight",
    ]


def test_shipping_policy_normalizes_budget_and_service_level_variants() -> None:
    service = ProdigiShippingPolicyService()

    assert service.normalize_tier("Budget", None) == "budget"
    assert service.normalize_tier("Express", "EXPRESS") == "express"
    assert service.normalize_tier(None, "STANDARD") == "standard"
