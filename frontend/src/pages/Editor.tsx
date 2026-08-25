import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Presentation, Slide, Template, Version } from "../lib/types";
import SlideCanvas from "../components/SlideCanvas";

export default function Editor() {
  const { presentationId } = useParams<{ presentationId: string }>();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [activeOrder, setActiveOrder] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [command, setCommand] = useState("");
  const [commandBusy, setCommandBusy] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadAll = useCallback(async () => {
    if (!presentationId) return;
    const p = await api.get<Presentation>(`/presentations/${presentationId}`);
    setPresentation(p);
    if (p.templateId) setTemplate(await api.get<Template>(`/templates/${p.templateId}`));
    const s = await api.get<{ slides: Slide[] }>(`/presentations/${presentationId}/slides`);
    setSlides(s.slides);
  }, [presentationId]);

  useEffect(() => {
    loadAll().catch((e) => setError(e.message));
  }, [loadAll]);

  async function generate() {
    if (!presentationId) return;
    setGenerating(true);
    setError(null);
    try {
      await api.post(`/presentations/${presentationId}/generate`);
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  function scheduleAutosave(next: Slide[]) {
    setSlides(next);
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.put(`/presentations/${presentationId}/slides`, { slides: next });
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, 800);
  }

  function onTextChange(slotId: string, value: string) {
    const next = slides.map((s) =>
      s.order === activeOrder ? { ...s, elements: s.elements.map((el) => (el.slotId === slotId ? { ...el, text: value } : el)) } : s,
    );
    scheduleAutosave(next);
  }

  async function runCommand() {
    if (!command.trim() || !presentationId) return;
    setCommandBusy(true);
    setError(null);
    try {
      await api.post(`/presentations/${presentationId}/edit`, { slideOrder: activeOrder, command });
      setCommand("");
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCommandBusy(false);
    }
  }

  async function doExport(format: "pptx" | "pdf" | "png") {
    if (!presentationId) return;
    setError(null);
    try {
      const result = await api.post<{ url?: string; urls?: string[] }>(`/presentations/${presentationId}/export?format=${format}`);
      const urls = result.urls ?? (result.url ? [result.url] : []);
      urls.forEach((u) => window.open(u, "_blank"));
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function loadVersions() {
    if (!presentationId) return;
    const v = await api.get<{ items: Version[] }>(`/presentations/${presentationId}/versions`);
    setVersions(v.items.slice().reverse());
    setShowVersions(true);
  }

  async function revert(versionNumber: number) {
    if (!presentationId) return;
    await api.post(`/presentations/${presentationId}/versions`, { versionNumber });
    setShowVersions(false);
    await loadAll();
  }

  if (!presentation) return <div className="shell">Carregando…</div>;

  const activeSlide = slides.find((s) => s.order === activeOrder);

  return (
    <div className="shell stack">
      <div className="row between">
        <div>
          <h1 style={{ fontSize: 24 }}>{presentation.title}</h1>
          <span className={`badge status-${presentation.status}`}>{presentation.status}</span>
        </div>
        <div className="row">
          {slides.length > 0 && (
            <>
              <span className="small muted">{saveState === "saving" ? "Salvando…" : saveState === "saved" ? "Salvo" : ""}</span>
              <button onClick={loadVersions}>Histórico</button>
              <button onClick={() => doExport("png")}>Exportar PNG</button>
              <button onClick={() => doExport("pdf")}>Exportar PDF</button>
              <button className="accent" onClick={() => doExport("pptx")}>Exportar .pptx</button>
            </>
          )}
        </div>
      </div>

      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
      {presentation.lastError && <p className="small" style={{ color: "var(--danger)" }}>Última falha: {presentation.lastError}</p>}

      {slides.length === 0 ? (
        <div className="empty-state stack" style={{ alignItems: "center" }}>
          <p>Essa apresentação ainda não foi gerada.</p>
          <button className="accent" onClick={generate} disabled={generating}>{generating ? "Gerando…" : "Gerar com IA"}</button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
          <div className="stack">
            {slides.map((s) => (
              <button
                key={s.order}
                onClick={() => setActiveOrder(s.order)}
                style={{ padding: 6, border: s.order === activeOrder ? "2px solid var(--accent)" : "1px solid var(--line)", background: "var(--surface)" }}
              >
                {template && <SlideCanvas slide={s} designSystem={template.designSystem} aspectRatio={presentation.aspectRatio} />}
                <div className="small muted" style={{ marginTop: 4 }}>{s.order + 1}. {s.purpose}</div>
              </button>
            ))}
          </div>

          <div className="stack">
            {activeSlide && template && (
              <SlideCanvas slide={activeSlide} designSystem={template.designSystem} aspectRatio={presentation.aspectRatio} editable onTextChange={onTextChange} />
            )}
            <div className="card row">
              <input
                placeholder='Peça uma alteração à IA, ex: "deixe mais profissional"'
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runCommand()}
              />
              <button className="accent" onClick={runCommand} disabled={commandBusy}>{commandBusy ? "Aplicando…" : "Aplicar"}</button>
            </div>
            {presentation.visualQaScore && (
              <p className="small muted">QA visual: {presentation.visualQaScore.overall}/100 ({presentation.visualQaScore.issueCount} avisos)</p>
            )}
          </div>
        </div>
      )}

      {showVersions && (
        <div className="card stack" style={{ position: "fixed", right: 24, top: 80, width: 320, maxHeight: "70vh", overflow: "auto" }}>
          <div className="row between"><h3 style={{ fontSize: 15 }}>Histórico de versões</h3><button onClick={() => setShowVersions(false)}>Fechar</button></div>
          {versions.map((v) => (
            <div key={v.id} className="row between small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
              <span>v{v.versionNumber} — {v.changeSummary} ({v.createdBy === "ai" ? "IA" : "você"})</span>
              <button onClick={() => revert(v.versionNumber)}>Restaurar</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
