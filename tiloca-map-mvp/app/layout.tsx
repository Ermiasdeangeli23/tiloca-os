import "./globals.css";

export const metadata = {
  title: "Tiloca Operational Map",
  description: "Geospatial operational console for Tiloca industrial PV assets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
