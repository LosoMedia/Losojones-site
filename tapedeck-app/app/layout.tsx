import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Tape Deck | LosoMedia", description: "Create. Pitch. Review. Collaborate." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
