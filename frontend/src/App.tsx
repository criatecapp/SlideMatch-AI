import { Navigate, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "./lib/AuthContext";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Editor from "./pages/Editor";
import Templates from "./pages/Templates";
import TemplateEditor from "./pages/TemplateEditor";

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell">Carregando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Topbar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="topbar">
      <Link to="/" className="brand">SlideMatch AI</Link>
      <div className="row">
        <Link to="/templates" className="small">Templates</Link>
        <span className="small muted">{user.email}</span>
        <button className="small" onClick={() => logout()}>Sair</button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Topbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Projects /></Protected>} />
        <Route path="/projects/:projectId" element={<Protected><ProjectDetail /></Protected>} />
        <Route path="/presentations/:presentationId" element={<Protected><Editor /></Protected>} />
        <Route path="/templates" element={<Protected><Templates /></Protected>} />
        <Route path="/templates/:templateId" element={<Protected><TemplateEditor /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
