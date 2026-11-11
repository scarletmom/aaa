import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { DropdownMenu } from "radix-ui";
import { LogOut, Menu as MenuIcon, Plus, Search, SquarePlay, Tags, Workflow, X } from "lucide-react";
import { signOut } from "../lib/api.js";
import { useSite } from "../lib/site.js";
import { createWorkflow, workflowPath } from "../lib/workflow.js";
import { Button, Tip } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { NAV, sectionFor } from "./nav.js";

const COLLAPSED_KEY = "studio:sidebar-collapsed";
const DRAWER_QUERY = "(max-width: 899px)";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function SiteAvatar({ name, size }) {
  return (
    <span className={`site-avatar site-avatar-${size}`} aria-hidden="true">
      {(name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Logo() {
  return (
    <Link to="/" className="studio-logo" aria-label="Studio home">
      <svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="5" cy="10" r="3" fill="var(--text)" />
        <path d="M8 10h4" stroke="var(--text)" strokeWidth="1.5" />
        <circle cx="15" cy="10" r="3" fill="var(--accent)" />
      </svg>
      <span>Studio</span>
    </Link>
  );
}

function HeaderSearch() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const section = sectionFor(pathname);
  const query = pathname === section.to ? params.get("q") || "" : "";

  // Searching from a details page jumps back to that section's list.
  const update = (value) => {
    if (pathname === section.to) setParams(value ? { q: value } : {}, { replace: true });
    else navigate(value ? `${section.to}?q=${encodeURIComponent(value)}` : section.to);
  };

  return (
    <form className="studio-search" role="search" onSubmit={(e) => e.preventDefault()}>
      <Search size={18} strokeWidth={1.5} />
      <input type="search" placeholder={section.search} aria-label={section.search} value={query} onChange={(e) => update(e.target.value)} />
      {query && (
        <button type="button" className="studio-search-clear" aria-label="Clear search" onClick={() => update("")}>
          <X size={16} strokeWidth={1.75} />
        </button>
      )}
    </form>
  );
}

function AccountMenu({ site }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="account-trigger" aria-label="Account">
          <SiteAvatar name={site} size="sm" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu account-menu" align="end" sideOffset={8}>
          <DropdownMenu.Label className="account-head">
            <SiteAvatar name={site} size="md" />
            <span>
              <span className="account-name">{site}</span>
              <span className="account-role">Admin</span>
            </span>
          </DropdownMenu.Label>
          <DropdownMenu.Separator className="menu-separator" />
          <DropdownMenu.Item className="menu-item" onSelect={signOut}>
            <LogOut size={16} strokeWidth={1.5} className="menu-icon" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export default function StudioShell() {
  const { name: site } = useSite();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { toast } = useFeedback();
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname, isDrawer]);

  const toggleSidebar = () => {
    if (isDrawer) return setDrawerOpen((open) => !open);
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? "0" : "1");
      } catch {}
      return !value;
    });
  };

  const newWorkflow = async () => {
    try {
      const created = await createWorkflow();
      navigate(workflowPath(created.id), { state: { rename: true } });
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const mode = isDrawer ? (drawerOpen ? "drawer-open" : "drawer") : collapsed ? "mini" : "full";

  return (
    <div className="studio" data-sidebar={mode}>
      <header className="studio-header">
        <Tip label={mode === "full" || mode === "drawer-open" ? "Collapse menu" : "Expand menu"}>
          <button type="button" className="icon-btn" aria-label="Toggle menu" aria-expanded={mode === "full" || mode === "drawer-open"} onClick={toggleSidebar}>
            <MenuIcon size={20} strokeWidth={1.5} />
          </button>
        </Tip>
        <Logo />
        <div className="studio-header-center">
          <HeaderSearch />
        </div>
        <Menu
          trigger={
            <Button className="create-btn" icon={Plus}>
              Create
            </Button>
          }
          items={[
            { label: "New post", icon: SquarePlay, onSelect: () => navigate("/content/new") },
            { label: "New category", icon: Tags, onSelect: () => navigate("/categories/new") },
            "separator",
            { label: "New workflow", icon: Workflow, onSelect: newWorkflow },
          ]}
        />
        <AccountMenu site={site} />
      </header>

      <aside className="studio-sidebar" aria-label="Studio navigation">
        <div className="site-card">
          <SiteAvatar name={site} size="lg" />
          <div className="site-card-text">
            <span className="site-card-label">Your website</span>
            <span className="site-card-name">{site}</span>
          </div>
        </div>
        <nav className="studio-nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-item" title={mode === "mini" ? label : undefined}>
              <Icon size={20} strokeWidth={1.5} className="nav-icon" />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {mode === "drawer-open" && <div className="studio-scrim" onClick={() => setDrawerOpen(false)} />}

      <main className="studio-main">
        <Outlet />
      </main>
    </div>
  );
}
