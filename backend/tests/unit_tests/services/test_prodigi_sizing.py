from src.integrations.prodigi.services.sizing.selector import ProdigiSizeSelectorService


def make_row(
    *,
    category_id: str,
    country: str,
    size_cm: str,
) -> dict[str, str]:
    return {
        "category_id": category_id,
        "destination_country": country,
        "size_cm": size_cm,
        "size_inches": None,
    }


def test_build_size_plan_uses_real_country_specific_exact_sizes() -> None:
    selector = ProdigiSizeSelectorService(ratio_labels=["4:5"])
    rows = [
        make_row(category_id="paperPrintBoxFramed", country="DE", size_cm="41x51cm"),
        make_row(category_id="paperPrintBoxFramed", country="GB", size_cm="41x51cm"),
        make_row(category_id="paperPrintBoxFramed", country="US", size_cm="40x50cm"),
        make_row(category_id="paperPrintBoxFramed", country="DE", size_cm="61x76cm"),
        make_row(category_id="paperPrintBoxFramed", country="GB", size_cm="61x76cm"),
        make_row(category_id="paperPrintBoxFramed", country="US", size_cm="61x76cm"),
    ]

    plan = selector.build_size_plan(rows)

    global_slots = plan["global_shortlists"]["4:5"]["paperPrintBoxFramed"]
    assert [item["recommended_size_label"] for item in global_slots] == ["41x51", "61x76"]

    us_slots = plan["country_shortlists"]["4:5"]["US"]["paperPrintBoxFramed"]
    assert us_slots[0]["slot_size_label"] == "41x51"
    assert us_slots[0]["size_label"] == "40x50"
    assert us_slots[0]["available"] is True


def test_build_size_plan_prefers_stronger_cluster_when_gap_is_too_small() -> None:
    selector = ProdigiSizeSelectorService(ratio_labels=["4:5"])
    rows = [
        make_row(category_id="canvasRolled", country="DE", size_cm="20x25cm"),
        make_row(category_id="canvasRolled", country="DE", size_cm="25x31cm"),
        make_row(category_id="canvasRolled", country="GB", size_cm="25x31cm"),
        make_row(category_id="canvasRolled", country="US", size_cm="25x31cm"),
    ]

    plan = selector.build_size_plan(rows)

    slots = plan["global_shortlists"]["4:5"]["canvasRolled"]
    assert len(slots) == 1
    assert slots[0]["recommended_size_label"] == "25x31"
