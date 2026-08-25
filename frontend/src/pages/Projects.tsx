import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Project } from "../lib/types";

export default function Projects() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<{ items: Project[] }>("/projects").then((r) => setProjects(r.items)).catch((e: ApiError) => setError(e.message));
  }, []);

  async function createProject(form: FormData) {
    setError(null);
    try {
      const project = await api.post<Project>("/projects", {
        title: form.get("title"),
        objective: form.get("objective"),
        audience: form.get("audience"),
        style: form.get("style") || "formal",
        content: form.get("content"),
      });
      navigate(`/projects/${project.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="shell stack">
      <div className="row between">
        <h1 style={{ fontSize: 26 }}>Seus projetos</h1>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancelar" : "Novo projeto"}</button>
      </div>

      {showForm && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            createProject(new FormData(e.currentTarget));
          }}
        >
          <label>Título<input name="title" required placeholder="Ex: Segurança da Informação" /></label>
          <div className="grid cols-2">
            <label>Objetivo<input name="objective" placeholder="Ex: treinar colaboradores" /></label>
            <label>Público<input name="audience" placeholder="Ex: colaboradores" /></label>
          </div>
          <label>Estilo<input name="style" placeholder="formal, casual, técnico…" /></label>
          <label>Conteúdo-fonte<textarea name="content" rows={6} placeholder="Cole aqui o texto que a apresentação deve cobrir" /></label>
          <button type="submit" className="accent">Criar projeto</button>
        </form>
      )}

      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}

      {projects === null ? (
        <p className="muted">Carregando…</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">Nenhum projeto ainda. Crie o primeiro acima.</div>
      ) : (
        <div className="grid cols-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card" style={{ textDecoration: "none" }}>
              <h3 style={{ fontSize: 17 }}>{p.title}</h3>
              <p className="small muted">{p.objective || "Sem objetivo definido"}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
