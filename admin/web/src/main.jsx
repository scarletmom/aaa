import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router";
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
import { TipProvider } from "./ui/controls.jsx";
import { FeedbackProvider } from "./ui/overlays.jsx";
import Workflows from "./pages/Workflows.jsx";
import Content from "./pages/Content.jsx";
import PostEditor from "./pages/PostEditor.jsx";
import Categories from "./pages/Categories.jsx";
import CategoryEditor from "./pages/CategoryEditor.jsx";
import Editor from "./pages/Editor.jsx";
import { AuthGate } from "./pages/Login.jsx";
import StudioShell from "./layout/StudioShell.jsx";

function LegacyEditorRedirect() {
  const { id } = useParams();
  return <Navigate to={`/workflows/${id}`} replace />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <TipProvider>
      <FeedbackProvider>
        <AuthGate>
          <BrowserRouter>
            <Routes>
              <Route element={<StudioShell />}>
                <Route path="/content" element={<Content />} />
                <Route path="/content/new" element={<PostEditor key="new" />} />
                <Route path="/content/:tag" element={<PostEditor />} />
                <Route path="/categories" element={<Categories />} />
                <Route path="/categories/new" element={<CategoryEditor key="new" />} />
                <Route path="/categories/:id" element={<CategoryEditor />} />
                <Route path="/workflows" element={<Workflows />} />
              </Route>
              <Route path="/workflows/:id" element={<Editor />} />
              <Route path="/w/:id" element={<LegacyEditorRedirect />} />
              <Route path="*" element={<Navigate to="/content" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthGate>
      </FeedbackProvider>
    </TipProvider>
  </StrictMode>
);
