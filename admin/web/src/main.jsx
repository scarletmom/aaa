import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements, useParams } from "react-router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@xyflow/react/dist/base.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/home.css";
import "./styles/editor.css";
import "./styles/panel.css";
import "./styles/login.css";
import "./styles/studio.css";
import "./styles/content.css";
import "./styles/reels.css";
import { TipProvider } from "./ui/controls.jsx";
import { FeedbackProvider } from "./ui/overlays.jsx";
import Workflows from "./pages/Workflows.jsx";
import Content from "./pages/Content.jsx";
import Variables from "./pages/Variables.jsx";
import ReelToPost from "./pages/ReelToPost.jsx";
import PostEditor from "./pages/PostEditor.jsx";
import Categories from "./pages/Categories.jsx";
import CategoryEditor from "./pages/CategoryEditor.jsx";
import Editor from "./pages/Editor.jsx";
import Visits from "./pages/Visits.jsx";
import { AuthGate } from "./pages/Login.jsx";
import StudioShell from "./layout/StudioShell.jsx";

function LegacyEditorRedirect() {
  const { id } = useParams();
  return <Navigate to={`/workflows/${id}`} replace />;
}

// A data router, so editors can block navigation (including the browser's Back button) while there are unsaved changes.
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route element={<StudioShell />}>
        <Route path="/reels" element={<ReelToPost />} />
        <Route path="/content" element={<Content />} />
        <Route path="/content/new" element={<PostEditor key="new" />} />
        <Route path="/content/:tag" element={<PostEditor />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/categories/new" element={<CategoryEditor key="new" />} />
        <Route path="/categories/:id" element={<CategoryEditor />} />
        <Route path="/visits" element={<Visits />} />
        <Route path="/workflows" element={<Workflows />} />
        <Route path="/variables" element={<Variables />} />
      </Route>
      <Route path="/workflows/:id" element={<Editor />} />
      <Route path="/w/:id" element={<LegacyEditorRedirect />} />
      <Route path="*" element={<Navigate to="/content" replace />} />
    </>
  )
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TipProvider>
      <FeedbackProvider>
        <AuthGate>
          <RouterProvider router={router} />
        </AuthGate>
      </FeedbackProvider>
    </TipProvider>
  </StrictMode>
);
