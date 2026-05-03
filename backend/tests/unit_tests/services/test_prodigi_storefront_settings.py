import pytest

from src.integrations.prodigi.services.prodigi_storefront_settings import (
    ProdigiStorefrontSettingsService,
)


def test_storefront_settings_validation_accepts_default_config() -> None:
    config = ProdigiStorefrontSettingsService.default_config()

    validated = ProdigiStorefrontSettingsService.validate_config(config)

    assert validated["shipping_policy"]["checkout_shipping_cap"] == 35.0
    assert validated["shipping_policy"]["fallback_tier"] == "standard"
    assert "canvasRolled" in validated["category_policy"]


def test_storefront_settings_validation_rejects_unknown_shipping_tier() -> None:
    config = ProdigiStorefrontSettingsService.default_config()
    config["shipping_policy"]["preferred_tier_order"] = ["teleport"]

    with pytest.raises(ValueError, match="Unknown preferred shipping tier"):
        ProdigiStorefrontSettingsService.validate_config(config)


def test_storefront_settings_validation_rejects_unknown_category() -> None:
    config = ProdigiStorefrontSettingsService.default_config()
    config["category_policy"]["unknownCategory"] = {}

    with pytest.raises(ValueError, match="Unknown category id"):
        ProdigiStorefrontSettingsService.validate_config(config)


def test_storefront_settings_validation_rejects_negative_cap() -> None:
    config = ProdigiStorefrontSettingsService.default_config()
    config["shipping_policy"]["checkout_shipping_cap"] = -1

    with pytest.raises(ValueError, match="greater than or equal to 0"):
        ProdigiStorefrontSettingsService.validate_config(config)
