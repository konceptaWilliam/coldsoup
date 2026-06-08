import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F2EFE8",
};

export const metadata: Metadata = {
  title: "coldsoup",
  description: "Radical simplicity for small teams",
  applicationName: "Coldsoup",
  appleWebApp: {
    capable: true,
    title: "Coldsoup",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Set the theme before first paint to avoid a light-mode flash on
            load / navigation / bfcache restore. Mirrors ThemeProvider's logic
            and the `coldsoup:themeMode` key. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('coldsoup:themeMode');var d=m==='dark'||((m==='system'||!m)&&window.matchMedia('(prefers-color-scheme: dark)').matches);var s=d?'dark':'light';document.documentElement.dataset.theme=s;document.documentElement.style.colorScheme=s;}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full bg-surface text-ink`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
