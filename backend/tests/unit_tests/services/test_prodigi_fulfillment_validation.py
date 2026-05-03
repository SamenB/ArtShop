from types import SimpleNamespace

from src.integrations.prodigi.services.prodigi_attributes import normalize_prodigi_attributes
from src.integrations.prodigi.services.prodigi_fulfillment_validation import (
    CHECK_FAILED,
    CHECK_PASSED,
    ProdigiFulfillmentValidationService,
    ValidationConfig,
    ValidationSample,
    ValidationThresholds,
)


def _service():
    return ProdigiFulfillmentValidationService(SimpleNamespace())


def _sample(**overrides):
    defaults = {
        "country": "DE",
        "ratio": "4:5",
        "category_id": "paperPrintRolled",
        "group_id": 1,
        "size_id": 2,
        "slot_size_label": "40x50",
        "size_label": "40 x 50 cm",
        "sku": "GLOBAL-HGE-16X20",
        "attributes": {},
        "shipping_method": "Standard",
        "width_px": 4800,
        "height_px": 6000,
        "print_area_name": "default",
        "print_area_source": "prodigi_product_details",
        "supplier_size_inches": '16x20"',
        "supplier_size_cm": "40x50",
        "product_price": 10.0,
        "shipping_price": 2.0,
        "total_cost": 12.0,
    }
    defaults.update(overrides)
    return ValidationSample(**defaults)


def test_static_checks_pass_for_complete_baked_sample():
    checks = _service()._run_static_sample_checks(_sample())

    assert {check["status"] for check in checks} == {CHECK_PASSED}


def test_static_checks_fail_for_square_pixels_against_four_by_five_ratio():
    checks = _service()._run_static_sample_checks(_sample(width_px=5000, height_px=5000))

    aspect = next(check for check in checks if check["gate"] == "baked_aspect_matches_ratio")
    assert aspect["status"] == CHECK_FAILED


def test_simulated_payloads_create_requested_order_count():
    result = _service()._simulate_order_payloads(
        [_sample(), _sample(size_id=3, sku="GLOBAL-HGE-20X24")],
        ValidationConfig(
            countries=["DE"],
            simulate_orders=5,
            batch_size=2,
            thresholds=ValidationThresholds(),
        ),
    )

    assert result["created"] == 5
    assert len(result["checks"]) == 5
    assert {check["status"] for check in result["checks"]} == {CHECK_PASSED}


def test_threshold_failures_report_failed_checks():
    failures = _service()._threshold_failures(
        config=ValidationConfig(
            countries=["DE"],
            thresholds=ValidationThresholds(max_failures=0, min_pass_rate=1.0),
        ),
        sample_count=10,
        simulated_order_count=10,
        failed=1,
        pass_rate=0.9,
        checks=[],
    )

    assert any("failed checks" in failure for failure in failures)
    assert any("pass_rate" in failure for failure in failures)


def test_prodigi_attribute_normalization_drops_internal_snake_case_aliases():
    assert normalize_prodigi_attributes(
        {
            "mount": "2.4mm",
            "mount_color": "Snow white",
            "mountColor": "Snow white",
            "paper_type": "HGE",
            "substrate_weight": "310gsm",
        }
    ) == {
        "mount": "2.4mm",
        "mountColor": "Snow white",
        "paperType": "HGE",
        "substrateWeight": "310gsm",
    }
