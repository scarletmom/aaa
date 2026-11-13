import { Clapperboard, KeyRound, SquarePlay, Tags, Workflow } from "lucide-react";

// Sidebar sections. Add an entry here and a matching route in main.jsx to grow the dashboard.
export const NAV = [
  { to: "/reels", label: "Reel to post", icon: Clapperboard },
  { to: "/content", label: "Content", icon: SquarePlay, search: "Search title, category or Real URL" },
  { to: "/categories", label: "Categories", icon: Tags, search: "Search categories" },
  { to: "/workflows", label: "Workflows", icon: Workflow, search: "Search workflows" },
  { to: "/variables", label: "Variables", icon: KeyRound, search: "Search variables" },
];

export const sectionFor = (pathname) => NAV.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) || NAV[1];
