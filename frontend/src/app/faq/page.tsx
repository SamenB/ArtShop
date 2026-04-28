import ContentPage from "@/components/ContentPage";
import { FAQ_PAGE_COPY } from "@/content/siteCopy";

export default function FaqPage() {
    return <ContentPage title="Frequently Asked Questions" field="faq_page_text" fallback={FAQ_PAGE_COPY} />;
}
