import "./globals.css";

import { NavBar } from "@/components/NavBar";

export const metadata = {
  title: "Tiloca Territorial Console",
  description: "Console territoriale per asset FV industriali Tiloca.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
