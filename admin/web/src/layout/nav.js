import { Clapperboard, CloudDownload, Globe, KeyRound, Smartphone, SquarePlay, Tags, Users, Workflow } from "lucide-react";

// Sidebar sections. Add an entry here and a matching route in main.jsx to grow the dashboard.
export const NAV = [
  { to: "/content", label: "Content", icon: SquarePlay, search: "Search title, category or Real URL" },
  { to: "/shorts", label: "Shorts", icon: Smartphone, search: "Search title or category" },
  { to: "/terabox-videos", label: "Terabox videos", icon: CloudDownload, search: "Search title or key" },
  { to: "/reels", label: "Reel to post", icon: Clapperboard },
  { to: "/categories", label: "Categories", icon: Tags, search: "Search categories" },
  { to: "/users", label: "Users", icon: Users, search: "Search name or account number" },
  { to: "/visits", label: "Visits", icon: Globe, search: "Search member, IP, city, country, ISP or page" },
  { to: "/workflows", label: "Workflows", icon: Workflow, search: "Search workflows" },
  { to: "/variables", label: "Variables", icon: KeyRound, search: "Search variables" },
];

export const sectionFor = (pathname) => NAV.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) || NAV[0];
