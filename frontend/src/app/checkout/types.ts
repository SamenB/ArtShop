export interface PlaceSuggestion {
    placePrediction: {
        placeId: string;
        text: { text: string };
        structuredFormat?: {
            mainText: { text: string };
            secondaryText: { text: string };
        };
        toPlace: () => any;
    };
}

export interface CheckoutFormData {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    countryCode: string;
    state: string;
    city: string;
    addressLine1: string;
    addressLine2: string;
    postalCode: string;
    deliveryPhone: string;
    deliveryNotes: string;
    newsletter: string;
    discovery: string;
    promoCode: string;
}
