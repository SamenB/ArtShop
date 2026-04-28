import ContentPage from "@/components/ContentPage";
import { TERMS_PAGE_COPY } from "@/content/siteCopy";

export default function TermsPage() {
    return (
        <ContentPage
            title="Terms"
            field="terms_page_text"
            fallback={TERMS_PAGE_COPY}
        />
    );
}
