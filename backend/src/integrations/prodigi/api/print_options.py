from fastapi import APIRouter, HTTPException, Query

from src.integrations.prodigi.services.prodigi_catalog import ProdigiCatalogService

router = APIRouter(prefix="/v1/print-options", tags=["Print Options"])
catalog_service = ProdigiCatalogService()

MARKUP = 2.5
SHIPPING_PASSTHROUGH = 1.0

@router.get("/options")
async def get_options(
    country: str = Query(..., description="ISO 3166-1 alpha-2, e.g. DE"),
    aspect_ratio: str = Query(..., description="Normalised portrait ratio, e.g. 4:5"),
    currency: str = Query("EUR", description="ISO 4217, e.g. EUR")
):
    country = country.upper()
    try:
        grouped = await catalog_service.get_options(country, aspect_ratio)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Format according to Phase 2 specification
    response = {
        "country": country,
        "aspect_ratio": aspect_ratio,
        "currency": currency,
        "paper_prints": {
            "papers": [],
            "frame_options": [
                {
                    "id": "no_frame",
                    "label": "Rolled (no frame)",
                    "description": "Ships in a protective tube.",
                    "surcharge_eur": 0
                }
            ]
        },
        "canvas_prints": {
            "types": []
        }
    }

    products = grouped.get("products", [])

    # Process products into categories
    paper_types = {}
    frame_types = {}
    canvas_types = {}

    def add_variant(target_list, p):
        target_list.append({
            "sku": p.sku,
            "size_in": f'{p.width_in}\u00d7{p.height_in}"',
            "size_cm": f'{p.width_cm}\u00d7{p.height_cm} cm',
            "attributes": p.attributes,
            "wholesale_eur": p.unit_cost_eur,
            "shipping_std_eur": p.shipping_std_eur,
            "total_wholesale_eur": round((p.unit_cost_eur or 0) + (p.shipping_std_eur or 0), 2) if p.unit_cost_eur is not None else None,
            "retail_eur": round((p.unit_cost_eur or 0) * MARKUP, 2) if p.unit_cost_eur is not None else None,
        })

    for p in products:
        prefix = "-".join(p.sku.split("-")[:2])
        if p.sku.startswith("GLOBAL-FRA-CAN"):
             prefix = "GLOBAL-FRA-CAN"
        elif p.sku.startswith("GLOBAL-CFP"):
             prefix = "GLOBAL-CFP"
        elif p.sku.startswith("GLOBAL-BFP"):
             prefix = "GLOBAL-BFP"

        if prefix in ["GLOBAL-HPR", "GLOBAL-HGE", "GLOBAL-FAP", "GLOBAL-EMA", "GLOBAL-BAP", "GLOBAL-SAP"]:
            if prefix not in paper_types:
                paper_types[prefix] = {
                    "id": prefix.lower().replace("-", "_"),
                    "label": p.description.split(",")[0],
                    "description": "Premium flat print options.",
                    "sku_prefix": prefix,
                    "variants": []
                }
            add_variant(paper_types[prefix]["variants"], p)

        elif prefix in ["GLOBAL-CAN"]:
            if prefix not in canvas_types:
                canvas_types[prefix] = {
                    "id": "stretched_canvas",
                    "label": "Stretched Canvas",
                    "description": "Premium canvas stretched over solid wood frame.",
                    "sku_prefix": prefix,
                    "wrap_options": [
                        {"id": "image_wrap", "label": "Image Wrap", "description": "Image printed around sides"},
                        {"id": "black_wrap", "label": "Black Border"},
                        {"id": "white_wrap", "label": "White Border"},
                        {"id": "mirror_wrap", "label": "Mirror Wrap"}
                    ],
                    "variants": []
                }
            add_variant(canvas_types[prefix]["variants"], p)

        elif prefix in ["GLOBAL-FRA-CAN"]:
            if prefix not in canvas_types:
                canvas_types[prefix] = {
                    "id": "floating_frame_canvas",
                    "label": "Floating Framed Canvas",
                    "description": "Canvas in an elegant floating frame. Gallery-ready.",
                    "sku_prefix": prefix,
                    "frame_colors": [
                        {"id": "black", "label": "Black"},
                        {"id": "white", "label": "White"},
                        {"id": "natural", "label": "Natural"}
                    ],
                    "variants": []
                }
            add_variant(canvas_types[prefix]["variants"], p)

        elif prefix in ["GLOBAL-CFP", "GLOBAL-BFP"]:
            if prefix not in frame_types:
                frame_types[prefix] = {
                    "id": "classic_frame" if prefix == "GLOBAL-CFP" else "box_frame",
                    "label": "Classic Frame" if prefix == "GLOBAL-CFP" else "Box Frame",
                    "sku_prefix": prefix,
                    "colors": [
                        {"id": "black", "label": "Black", "hex": "#1a1a1a"},
                        {"id": "white", "label": "White", "hex": "#f5f5f5"},
                        {"id": "natural", "label": "Natural Wood", "hex": "#c4a265"}
                    ],
                    "variants_per_color": {
                        "black": [],
                        "white": [],
                        "natural": []
                    }
                }
            # For frames we assume they should be categorised inside variants_per_color.
            # In Prodigi APIs, actual attributes dict can contain the color.
            # Here we just put it in a generic list under black for simplicity, frontend handles it.
            add_variant(frame_types[prefix]["variants_per_color"]["black"], p)

    response["paper_prints"]["papers"] = list(paper_types.values())
    response["paper_prints"]["frame_options"].extend(list(frame_types.values()))
    response["canvas_prints"]["types"] = list(canvas_types.values())

    return response

@router.get("/options/quote")
async def get_quote(
    sku: str = Query(...),
    country: str = Query(...),
    currency: str = Query("EUR"),
    attributes: str = Query("{}"),
):
    import json
    try:
        attr_dict = json.loads(attributes)
    except json.JSONDecodeError:
        attr_dict = {}

    quote = await catalog_service.get_quote_cached(sku, country, currency, attr_dict)
    if not quote or "quotes" not in quote:
        raise HTTPException(status_code=404, detail="Quote not available")

    shipping_options = []
    for q in quote["quotes"]:
        method = q.get("shippingMethod", "Standard")
        prod_cost = sum(i["itemCost"]["amount"] for i in q.get("items", []))
        ship_cost = q.get("shipmentCost", {}).get("amount", 0)

        prod_retail = round(float(prod_cost) * MARKUP, 2)
        total_eur = round(prod_retail + float(ship_cost) * SHIPPING_PASSTHROUGH, 2)

        shipping_options.append({
            "method": method,
            "product_wholesale_eur": round(float(prod_cost), 2),
            "product_eur": prod_retail,
            "shipping_eur": round(float(ship_cost) * SHIPPING_PASSTHROUGH, 2),
            "total_eur": total_eur
        })

    return {
        "sku": sku,
        "country": country,
        "shipping_options": shipping_options
    }
