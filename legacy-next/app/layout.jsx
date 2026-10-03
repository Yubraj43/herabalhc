import "./globals.css";
export const metadata = {
    title: "UB Herbal — Come back to your nature",
    description: "Thoughtful herbal essentials, crafted with the wisdom of plants. Discover UB Herbal's botanical wellness collection, made with care in Nepal.",
    metadataBase: new URL("https://ubherbal.com"),
    openGraph: {
        title: "UB Herbal — Come back to your nature",
        description: "Thoughtful herbal essentials, crafted with the wisdom of plants.",
        type: "website",
        locale: "en_US",
    },
    twitter: {
        card: "summary_large_image",
        title: "UB Herbal — Come back to your nature",
        description: "Thoughtful herbal essentials, crafted with the wisdom of plants.",
    },
};
export default function RootLayout({ children }) {
    return <html lang="en"><body>{children}</body></html>;
}
