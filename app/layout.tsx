import type { Metadata } from 'next';
import './globals.css';
import './holographic.css';
import './intelligence.css';
import './video.css';
import './distribution.css';
import './jew-knows.css';
import './market-terminal.css';
import './streaming.css';
import './deals.css';
import './rewards.css';
import './refinement.css';
import './brain.css';
import './newsroom.css';
export const metadata:Metadata={title:{default:'Jew Knows — OSINT, News, and Important World Announcements.',template:'%s · Jew Knows'},description:'An intelligence network with source-linked reporting, conditional forecasts, local context and a permanent prediction ledger. Always subscription-free.',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" data-theme="light" suppressHydrationWarning><head><link rel="preload" href="/fonts/instrument-sans-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/><link rel="preload" href="/fonts/newsreader-variable.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body>{children}</body></html>}
