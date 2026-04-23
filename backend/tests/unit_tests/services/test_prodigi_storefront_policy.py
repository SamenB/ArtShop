from src.services.prodigi_storefront_policy import ProdigiStorefrontPolicyService


def make_row(
    *,
    category_id: str,
    glaze: str | None = None,
    color: str | None = None,
    mount: str | None = None,
    wrap: str | None = None,
) -> dict[str, str | None]:
    return {
        "category_id": category_id,
        "glaze": glaze,
        "color": color,
        "mount": mount,
        "wrap": wrap,
    }


def test_policy_removes_float_glass_from_paper_box_frame() -> None:
    service = ProdigiStorefrontPolicyService()
    rows = [
        make_row(
            category_id="paperPrintBoxFramed",
            glaze="Acrylic / Perspex",
            color="black",
            mount="1.4mm",
        ),
        make_row(
            category_id="paperPrintBoxFramed",
            glaze="Float glass",
            color="black",
            mount="1.4mm",
        ),
    ]

    result = service.apply(rows)

    assert len(result["rows"]) == 1
    assert result["rows"][0]["glaze"] == "Acrylic / Perspex"
    assert result["policy_summary"]["paperPrintBoxFramed"]["recommended_defaults"] == {
        "mount": "No mount / Mat"
    }


def test_policy_uses_canvas_mirrorwrap_as_non_filtering_default() -> None:
    service = ProdigiStorefrontPolicyService()
    rows = [
        make_row(category_id="canvasStretched", wrap="MirrorWrap"),
        make_row(category_id="canvasStretched", wrap="ImageWrap"),
    ]

    result = service.apply(rows)

    assert len(result["rows"]) == 2
    assert result["policy_summary"]["canvasStretched"]["fixed_attributes"] == {}
    assert result["policy_summary"]["canvasStretched"]["recommended_defaults"] == {
        "wrap": "MirrorWrap"
    }
