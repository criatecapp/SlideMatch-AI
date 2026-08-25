import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Layout, Slot, SlotKind, Template } from "../lib/types";
import SlideCanvas from "../components/SlideCanvas";

const SLOT_KINDS: SlotKind[] = ["text", "image", "icon", "video", "chart", "table", "shape", "button"];
const ROLE_SUGGESTIONS = [
  "title", "subtitle", "heading", "body", "paragraph", "bullet_list", "numbered_list", "quote",
  "statistic", "percentage", "currency", "icon", "image", "logo", "video", "chart", "table",
  "badge", "label", "button", "timeline", "card", "shape", "divider",
];

function emptySlot(): Slot {
  return { id: `slot_${Date.now()}`, kind: "text", role: "body", position: { x: 10, y: 10, w: 80, h: 20 }, required: false };
}

function emptyLayout(): Layout {
  return { id: `layout_${Date.now()}`, name: "Novo layout", type: "custom", canvas: { width: 1920, height: 1080 }, slots: [] };
}

function previewSlide(layout: Layout) {
  return {
    order: 0,
    layoutId: layout.id,
    purpose: "preview",
    elements: layout.slots.map((s) => ({
      slotId: s.id,
      kind: s.kind,
      role: s.role,
      position: s.position,
      text: s.kind === "text" ? `[${s.role}]` : undefined,
      statValue: s.role === "statistic" ? "87%" : undefined,
      overflow: false,
    })),
  };
}

export default function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<Template | null>(null);
  const [activeLayoutIdx, setActiveLayoutIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId) return;
    api.get<Template>(`/templates/${templateId}`).then(setTemplate).catch((e) => setError(e.message));
  }, [templateId]);

  if (!template) return <div className="shell">{error ?? "Carregando…"}</div>;

  function update(patch: Partial<Template>) {
    setTemplate((t) => (t ? { ...t, ...patch } : t));
  }

  function updateLayout(idx: number, patch: Partial<Layout>) {
    update({ layouts: template!.layouts.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });
  }

  function updateSlot(layoutIdx: number, slotIdx: number, patch: Partial<Slot>) {
    const layout = template!.layouts[layoutIdx];
    const slots = layout.slots.map((s, i) => (i === slotIdx ? { ...s, ...patch } : s));
    updateLayout(layoutIdx, { slots });
  }

  async function save() {
    if (!templateId || !template) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api.patch<Template>(`/templates/${templateId}`, {
        name: template.name,
        description: template.description,
        category: template.category,
        style: template.style,
        aspectRatio: template.aspectRatio,
        designSystem: template.designSystem,
        layouts: template.layouts,
        active: template.active,
      });
      setTemplate(saved);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!templateId || !confirm("Apagar este template?")) return;
    await api.delete(`/templates/${templateId}`);
    navigate("/templates");
  }

  const layout = template.layouts[activeLayoutIdx];

  return (
    <div className="shell stack">
      <div className="row between">
        <input value={template.name} onChange={(e) => update({ name: e.target.value })} style={{ fontSize: 22, fontFamily: "var(--font-display)", border: "none", background: "none", padding: 0 }} />
        <div className="row">
          <button onClick={save} className="accent" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
          <button onClick={remove} className="danger">Apagar</button>
        </div>
      </div>
      {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="grid cols-2">
        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Identidade</h3>
          <div className="grid cols-2">
            <label>Categoria<input value={template.category} onChange={(e) => update({ category: e.target.value })} /></label>
            <label>Estilo<input value={template.style} onChange={(e) => update({ style: e.target.value })} /></label>
          </div>
          <label>Proporção
            <select value={template.aspectRatio} onChange={(e) => update({ aspectRatio: e.target.value as "16:9" | "4:3" })}>
              <option value="16:9">16:9</option>
              <option value="4:3">4:3</option>
            </select>
          </label>
          <label className="row"><input type="checkbox" checked={template.active} onChange={(e) => update({ active: e.target.checked })} style={{ width: "auto" }} /> Ativo (aparece pra IA escolher)</label>
        </div>

        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Design System</h3>
          <div className="grid cols-3">
            {(["background", "surface", "ink", "accent", "muted"] as const).map((k) => (
              <label key={k}>{k}
                <input type="text" value={template.designSystem.palette[k]} onChange={(e) => update({ designSystem: { ...template.designSystem, palette: { ...template.designSystem.palette, [k]: e.target.value } } })} />
              </label>
            ))}
          </div>
          <div className="grid cols-2">
            <label>Fonte de título<input value={template.designSystem.typography.titleFont} onChange={(e) => update({ designSystem: { ...template.designSystem, typography: { ...template.designSystem.typography, titleFont: e.target.value } } })} /></label>
            <label>Fonte de corpo<input value={template.designSystem.typography.bodyFont} onChange={(e) => update({ designSystem: { ...template.designSystem, typography: { ...template.designSystem.typography, bodyFont: e.target.value } } })} /></label>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row between">
          <h3 style={{ fontSize: 15 }}>Layouts</h3>
          <button onClick={() => { update({ layouts: [...template.layouts, emptyLayout()] }); setActiveLayoutIdx(template.layouts.length); }}>+ Novo layout</button>
        </div>
        <div className="row wrap">
          {template.layouts.map((l, i) => (
            <button key={l.id} onClick={() => setActiveLayoutIdx(i)} style={{ border: i === activeLayoutIdx ? "2px solid var(--accent)" : "1px solid var(--line)" }}>{l.name || "(sem nome)"}</button>
          ))}
        </div>

        {layout && (
          <div className="grid cols-2">
            <div className="stack">
              <div className="grid cols-2">
                <label>Nome<input value={layout.name} onChange={(e) => updateLayout(activeLayoutIdx, { name: e.target.value })} /></label>
                <label>Tipo (composição)<input value={layout.type} onChange={(e) => updateLayout(activeLayoutIdx, { type: e.target.value })} placeholder="hero, text_image, stats…" /></label>
              </div>
              <button className="danger" style={{ alignSelf: "flex-start" }} onClick={() => { update({ layouts: template.layouts.filter((_, i) => i !== activeLayoutIdx) }); setActiveLayoutIdx(0); }}>Apagar layout</button>

              <div className="row between"><h4 style={{ margin: 0 }}>Slots</h4><button onClick={() => updateLayout(activeLayoutIdx, { slots: [...layout.slots, emptySlot()] })}>+ Slot</button></div>
              {layout.slots.map((slot, si) => (
                <div key={slot.id} className="stack" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
                  <div className="grid cols-2">
                    <label>Tipo
                      <select value={slot.kind} onChange={(e) => updateSlot(activeLayoutIdx, si, { kind: e.target.value as SlotKind })}>
                        {SLOT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </label>
                    <label>Função (role)
                      <input list="role-suggestions" value={slot.role} onChange={(e) => updateSlot(activeLayoutIdx, si, { role: e.target.value })} />
                    </label>
                  </div>
                  <div className="grid cols-3">
                    <label>x %<input type="number" value={slot.position.x} onChange={(e) => updateSlot(activeLayoutIdx, si, { position: { ...slot.position, x: Number(e.target.value) } })} /></label>
                    <label>y %<input type="number" value={slot.position.y} onChange={(e) => updateSlot(activeLayoutIdx, si, { position: { ...slot.position, y: Number(e.target.value) } })} /></label>
                    <label>largura %<input type="number" value={slot.position.w} onChange={(e) => updateSlot(activeLayoutIdx, si, { position: { ...slot.position, w: Number(e.target.value) } })} /></label>
                    <label>altura %<input type="number" value={slot.position.h} onChange={(e) => updateSlot(activeLayoutIdx, si, { position: { ...slot.position, h: Number(e.target.value) } })} /></label>
                    <label>máx. caracteres<input type="number" value={slot.maxCharacters ?? ""} onChange={(e) => updateSlot(activeLayoutIdx, si, { maxCharacters: e.target.value ? Number(e.target.value) : undefined })} /></label>
                    <label className="row" style={{ alignSelf: "flex-end" }}><input type="checkbox" checked={slot.required} onChange={(e) => updateSlot(activeLayoutIdx, si, { required: e.target.checked })} style={{ width: "auto" }} /> obrigatório</label>
                  </div>
                  <button className="danger" onClick={() => updateLayout(activeLayoutIdx, { slots: layout.slots.filter((_, i) => i !== si) })}>Remover slot</button>
                </div>
              ))}
              <datalist id="role-suggestions">
                {ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>

            <div>
              <p className="small muted">Pré-visualização</p>
              <SlideCanvas slide={previewSlide(layout)} designSystem={template.designSystem} aspectRatio={template.aspectRatio} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
