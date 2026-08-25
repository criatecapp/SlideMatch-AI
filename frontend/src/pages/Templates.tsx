import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Template } from "../lib/types";

export default function Templates() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ items: Template[] }>("/templates").then((r) => setTemplates(r.items)).catch((e) => setError(e.message));
  }, []);

  async function createTemplate() {
    try {
      const template = await api.post<Template>("/templates", { name: "Novo template" });
      navigate(`/templates/${template.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="shell stack">
      <div className="row between">
        <h1 style={{ fontSize: 26 }}>Templates</h1>
        <button className="primary" onClick={createTemplate}>Novo template</button>
      </div>
      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      {templates === null ? (
        <p className="muted">Carregando…</p>
      ) : templates.length === 0 ? (
        <div className="empty-state">Nenhum template ainda. Crie o primeiro pra poder gerar apresentações.</div>
      ) : (
        <div className="grid cols-3">
          {templates.map((t) => (
            <Link key={t.id} to={`/templates/${t.id}`} className="card" style={{ textDecoration: "none" }}>
              <div style={{ width: "100%", aspectRatio: t.aspectRatio === "16:9" ? "16/9" : "4/3", background: t.designSystem.palette.background, border: `1px solid ${t.designSystem.palette.surface}`, borderRadius: 6, marginBottom: 8 }} />
              <h3 style={{ fontSize: 16 }}>{t.name}</h3>
              <p className="small muted">{t.layouts.length} layout(s) · {t.active ? "ativo" : "inativo"}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
