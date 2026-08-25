import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Media, Presentation, Project, Template } from "../lib/types";

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function refresh() {
    if (!projectId) return;
    const [p, m, t, pres] = await Promise.all([
      api.get<Project>(`/projects/${projectId}`),
      api.get<{ items: Media[] }>(`/media?projectId=${projectId}`),
      api.get<{ items: Template[] }>("/templates?active=true"),
      api.get<{ items: Presentation[] }>(`/presentations?projectId=${projectId}`),
    ]);
    setProject(p);
    setMedia(m.items);
    setTemplates(t.items);
    setPresentations(pres.items);
    // Nunca escolhe sozinho um template sem nenhum layout — ele não serve
    // pra gerar nada (Template Matcher não tem o que casar). Prefere o
    // primeiro template utilizável; se nenhum tiver layout, não seleciona
    // nada (o aviso abaixo já orienta o usuário a criar um).
    if (!selectedTemplateId) {
      const usable = t.items.find((tpl) => tpl.layouts.length > 0);
      if (usable) setSelectedTemplateId(usable.id);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file || !projectId) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("file", file);
      await api.upload("/media/upload", form);
      await refresh();
      if (fileInput.current) fileInput.current.value = "";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function createAndGenerate() {
    if (!projectId || !project) return;
    setError(null);
    try {
      const presentation = await api.post<Presentation>("/presentations", {
        projectId,
        title: project.title,
        templateId: selectedTemplateId || undefined,
      });
      navigate(`/presentations/${presentation.id}`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!project) return <div className="shell">Carregando…</div>;

  return (
    <div className="shell stack">
      <h1 style={{ fontSize: 26 }}>{project.title}</h1>
      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid cols-2">
        <div className="card stack">
          <h3>Imagens do projeto</h3>
          <div className="row">
            <input ref={fileInput} type="file" accept="image/*" />
            <button onClick={handleUpload} disabled={uploading}>{uploading ? "Enviando…" : "Enviar imagem"}</button>
          </div>
          <div className="grid cols-3">
            {media.map((m) => (
              <div key={m.id} className="stack" style={{ gap: 4 }}>
                {m.url && <img src={m.url} alt={m.filename} style={{ width: "100%", aspectRatio: "4/3", objectFit: "cover", borderRadius: 8 }} />}
                <span className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.filename}</span>
              </div>
            ))}
            {media.length === 0 && <p className="small muted">Nenhuma imagem enviada ainda.</p>}
          </div>
        </div>

        <div className="card stack">
          <h3>Gerar apresentação</h3>
          <label>
            Template
            <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
              <option value="">A IA escolhe automaticamente</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id} disabled={t.layouts.length === 0}>
                  {t.name}{t.layouts.length === 0 ? " (sem layouts — não pode ser usado)" : ""}
                </option>
              ))}
            </select>
          </label>
          {templates.length === 0 && (
            <p className="small muted">Nenhum template ativo — <a href="/templates">crie um</a> antes de gerar.</p>
          )}
          <button className="accent" onClick={createAndGenerate} disabled={templates.length === 0}>Criar apresentação</button>
        </div>
      </div>

      <div className="card stack">
        <h3>Apresentações</h3>
        {presentations.length === 0 ? (
          <p className="small muted">Nenhuma ainda.</p>
        ) : (
          <div className="stack">
            {presentations.map((p) => (
              <div key={p.id} className="row between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                <a href={`/presentations/${p.id}`}>{p.title}</a>
                <span className={`badge status-${p.status}`}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
