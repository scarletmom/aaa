import { SquarePlay, Tags, Workflow } from "lucide-react";

// Sidebar sections. Add an entry here and a matching route in main.jsx to grow the dashboard.
export const NAV = [
  { to: "/content", label: "Content", icon: SquarePlay, search: "Search posts" },
  { to: "/categories", label: "Categories", icon: Tags, search: "Search categories" },
  { to: "/workflows", label: "Workflows", icon: Workflow, search: "Search workflows" },
];

export const sectionFor = (pathname) => NAV.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) || NAV[0];
