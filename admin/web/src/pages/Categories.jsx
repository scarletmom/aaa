import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Ellipsis, PencilLine, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { categoryPath, formatCount } from "../lib/content.js";
import { Button } from "../ui/controls.jsx";
import { Menu, useFeedback } from "../ui/overlays.jsx";
import { CategoryAvatar, SetupNotice, isSetupError } from "../ui/site.jsx";

export default function Categories() {
  const navigate = useNavigate();
  const { confirm, toast } = useFeedback();
  const [params] = useSearchParams();
  const query = (params.get("q") || "").trim().toLowerCase();
  const [categories, setCategories] = useState(null);
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    api("/api/categories")
      .then(setCategories)
      .catch((err) => (isSetupError(err) ? setSetupNeeded(true) : toast(err.message, "error")));
  }, []);

  const visible = useMemo(() => (categories || []).filter((c) => !query || c.name.toLowerCase().includes(query)), [categories, query]);

  const remove = async (category) => {
    const ok = await confirm({
      title: `Delete ${category.name}`,
      description: category.postCount
        ? `Its ${category.postCount} post${category.postCount === 1 ? "" : "s"} stay live, just uncategorised.`
        : "No posts are in this category.",
      confirmLabel: "Delete category",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/categories/${category.id}`, { method: "DELETE" });
      setCategories((list) => list.filter((c) => c.id !== category.id));
      toast(`Deleted ${category.name}`);
    } catch (err) {
      toast(err.message, "error");
    }
  };

  const total = categories?.reduce((sum, c) => sum + c.postCount, 0) ?? 0;

  return (
    <div className="home">
      <div className="home-head">
        <div>
          <h1>Categories</h1>
          <p className="home-sub">
            {categories ? (
              <>
                <span className="mono">{categories.length}</span> {categories.length === 1 ? "category" : "categories"} covering <span className="mono">{formatCount(total)}</span>{" "}
                {total === 1 ? "post" : "posts"}. /r shows them as filter chips.
              </>
            ) : (
              "Group posts by model, author or type"
            )}
          </p>
        </div>
        {!setupNeeded && (
          <Button variant="primary" icon={Plus} onClick={() => navigate("/categories/new")}>
            New category
          </Button>
        )}
      </div>

      {setupNeeded ? (
        <SetupNotice />
      ) : categories === null ? (
        <div className="cat-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cat-row post-skeleton" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="empty-state">
          <h2>No categories yet</h2>
          <p>A category groups posts, like a model for videos or an author for books, with an optional picture</p>
          <Button variant="primary" icon={Plus} onClick={() => navigate("/categories/new")}>
            New category
          </Button>
        </div>
      ) : (
        <div className="cat-list">
          <div className="cat-row cat-head">
            <span>Category</span>
            <span>Posts</span>
            <span />
          </div>
          {visible.map((category) => {
            const open = () => navigate(categoryPath(category.id));
            return (
              <div key={category.id} className="cat-row" role="link" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
                <span className="cat-name">
                  <CategoryAvatar name={category.name} src={category.avatar} />
                  <span>{category.name}</span>
                </span>
                <span className="mono">{formatCount(category.postCount)}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  <Menu
                    trigger={<Button variant="ghost" size="sm" icon={Ellipsis} aria-label="Category actions" />}
                    items={[
                      { label: "Edit", icon: PencilLine, onSelect: open },
                      "separator",
                      { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(category) },
                    ]}
                  />
                </span>
              </div>
            );
          })}
          {visible.length === 0 && <div className="wf-none">Nothing matches “{params.get("q")}”</div>}
        </div>
      )}
    </div>
  );
}
