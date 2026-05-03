import ContentPage from "@/components/ContentPage";
import { PRIVACY_PAGE_COPY } from "@/content/siteCopy";

export default function PrivacyPage() {
    return (
        <ContentPage
            title="Privacy"
            field="privacy_page_text"
            fallback={PRIVACY_PAGE_COPY}
        />
    );
}
