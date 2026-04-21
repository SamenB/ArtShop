from src.services.prodigi_fulfillment_policy import ProdigiFulfillmentPolicyService
from src.services.prodigi_sizing.selector import ProdigiSizeSelectorService


def make_row(
    *,
    category_id: str,
    destination_country: str,
    source_country: str | None,
    size_cm: str = "20x25cm",
    min_shipping_days: int | None = None,
    max_shipping_days: int | None = None,
) -> dict[str, object]:
    return {
        "category_id": category_id,
        "destination_country": destination_country,
        "source_country": source_country,
        "size_cm": size_cm,
        "size_inches": None,
        "min_shipping_days": min_shipping_days,
        "max_shipping_days": max_shipping_days,
    }


def test_fulfillment_marks_local_routes_as_primary() -> None:
    service = ProdigiFulfillmentPolicyService()
    selector = ProdigiSizeSelectorService(ratio_labels=["4:5"])

    result = service.build(
        [
            make_row(
                category_id="canvasStretched",
                destination_country="US",
                source_country="US",
                min_shipping_days=2,
                max_shipping_days=4,
            )
        ],
        selector,
    )

    summary = result["by_ratio"]["4:5"]["US"]["canvasStretched"]

    assert summary["fulfillment_level"] == "local"
    assert summary["geography_scope"] == "domestic"
    assert summary["storefront_action"] == "show"
    assert summary["tax_risk"] == "low"
    assert summary["fastest_delivery_days"] == "2-4 days"


def test_fulfillment_marks_eu_routes_as_regional() -> None:
    service = ProdigiFulfillmentPolicyService()
    selector = ProdigiSizeSelectorService(ratio_labels=["4:5"])

    result = service.build(
        [
            make_row(
                category_id="canvasStretched",
                destination_country="DE",
                source_country="ES",
                min_shipping_days=4,
                max_shipping_days=7,
            )
        ],
        selector,
    )

    summary = result["by_ratio"]["4:5"]["DE"]["canvasStretched"]

    assert summary["fulfillment_level"] == "regional"
    assert summary["geography_scope"] == "europe"
    assert summary["storefront_action"] == "show"
    assert summary["tax_risk"] == "low"


def test_fulfillment_marks_cross_border_routes_with_notice() -> None:
    service = ProdigiFulfillmentPolicyService()
    selector = ProdigiSizeSelectorService(ratio_labels=["4:5"])

    result = service.build(
        [
            make_row(
                category_id="paperPrintBoxFramed",
                destination_country="US",
                source_country="GB",
                min_shipping_days=5,
                max_shipping_days=9,
            )
        ],
        selector,
    )

    summary = result["by_ratio"]["4:5"]["US"]["paperPrintBoxFramed"]

    assert summary["fulfillment_level"] == "cross_border"
    assert summary["geography_scope"] == "international"
    assert summary["storefront_action"] == "show_with_notice"
    assert summary["tax_risk"] == "elevated"
    assert "customs or taxes may apply" in summary["note"]


def test_fulfillment_marks_gb_to_eu_as_europe_geography_but_elevated_tax() -> None:
    service = ProdigiFulfillmentPolicyService()
    selector = ProdigiSizeSelectorService(ratio_labels=["4:5"])

    result = service.build(
        [
            make_row(
                category_id="paperPrintBoxFramed",
                destination_country="DE",
                source_country="GB",
                min_shipping_days=3,
                max_shipping_days=5,
            )
        ],
        selector,
    )

    summary = result["by_ratio"]["4:5"]["DE"]["paperPrintBoxFramed"]

    assert summary["fulfillment_level"] == "cross_border"
    assert summary["geography_scope"] == "europe"
    assert summary["tax_risk"] == "elevated"
