import ContentPage from "@/components/ContentPage";
import { SHIPPING_PAGE_COPY } from "@/content/siteCopy";

export default function ShippingPage() {
    return (
        <ContentPage
            title="Shipping"
            field="shipping_page_text"
            fallback={SHIPPING_PAGE_COPY}
        />
    );
}
