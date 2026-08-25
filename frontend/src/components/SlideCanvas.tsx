import type { DesignSystem, Slide, SlideElement } from "../lib/types";

interface Props {
  slide: Slide;
  designSystem: DesignSystem;
  aspectRatio: "16:9" | "4:3";
  editable?: boolean;
  onTextChange?: (slotId: string, value: string) => void;
}

// Espelha o modelo de posicionamento do Render Engine real (x/y/w/h em %
// do canvas, mesmo cálculo) — o que o usuário vê aqui é o que sai no
// export, não uma aproximação.
export default function SlideCanvas({ slide, designSystem, aspectRatio, editable, onTextChange }: Props) {
  const paddingBottom = aspectRatio === "16:9" ? "56.25%" : "75%";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        paddingBottom,
        background: designSystem.palette.background,
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        {slide.elements.map((el) => (
          <ElementView key={el.slotId} el={el} designSystem={designSystem} editable={editable} onTextChange={onTextChange} />
        ))}
      </div>
    </div>
  );
}

function ElementView({ el, designSystem, editable, onTextChange }: { el: SlideElement; designSystem: DesignSystem; editable?: boolean; onTextChange?: (slotId: string, value: string) => void }) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: `${el.position.x}%`,
    top: `${el.position.y}%`,
    width: `${el.position.w}%`,
    height: `${el.position.h}%`,
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
  };

  if (el.kind === "image") {
    return el.imageUrl ? (
      <img src={el.imageUrl} alt="" style={{ ...style, objectFit: "cover" }} />
    ) : (
      <div style={{ ...style, background: designSystem.palette.surface, border: `1px dashed ${designSystem.palette.muted}`, alignItems: "center", justifyContent: "center", color: designSystem.palette.muted, fontSize: 12 }}>
        sem imagem
      </div>
    );
  }

  if (el.kind === "chart" && el.dataPoints && el.dataPoints.length > 0) {
    const maxValue = Math.max(...el.dataPoints.map((p) => p.value), 1);
    return (
      <div style={{ ...style, flexDirection: "column", alignItems: "stretch" }}>
        {el.chartTitle && <div style={{ fontSize: 16, fontWeight: 700, color: designSystem.palette.ink, marginBottom: 6 }}>{el.chartTitle}</div>}
        <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "space-around", gap: 12 }}>
          {el.dataPoints.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, height: "100%" }}>
              <span style={{ fontSize: 12, color: designSystem.palette.ink, marginBottom: 4 }}>{p.value}</span>
              <div style={{ width: "60%", height: `${(p.value / maxValue) * 70}%`, background: designSystem.palette.accent, borderRadius: 4 }} />
              <span style={{ fontSize: 11, color: designSystem.palette.muted, marginTop: 4 }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (el.kind === "table" && el.tableRows && el.tableRows.length > 0) {
    return (
      <div style={{ ...style, flexDirection: "column", alignItems: "stretch" }}>
        {el.tableRows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", flex: 1, borderBottom: `1px solid ${designSystem.palette.surface}`, background: ri === 0 ? designSystem.palette.surface : "transparent" }}>
            {row.map((cell, ci) => (
              <div key={ci} style={{ flex: 1, display: "flex", alignItems: "center", padding: 6, fontSize: 13, fontWeight: ri === 0 ? 700 : 400, color: designSystem.palette.ink }}>{cell}</div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const isTitleLike = el.role === "title" || el.role === "subtitle" || el.role === "heading";
  const fontSize = el.fontSize ?? designSystem.typography.scale.body;
  const color = el.role === "statistic" ? designSystem.palette.accent : designSystem.palette.ink;
  const fontFamily = isTitleLike ? designSystem.typography.titleFont : designSystem.typography.bodyFont;

  const textStyle: React.CSSProperties = { ...style, fontSize, fontWeight: isTitleLike || el.role === "statistic" ? 700 : 400, color, fontFamily, lineHeight: 1.25 };

  if (el.listItems) {
    return (
      <div style={{ ...textStyle, flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        {el.listItems.map((item, i) => <div key={i}>• {item}</div>)}
      </div>
    );
  }

  const content = el.text ?? el.statValue ?? "";

  if (editable && el.kind === "text" && onTextChange) {
    return (
      <textarea
        value={content}
        onChange={(e) => onTextChange(el.slotId, e.target.value)}
        style={{ ...textStyle, background: "transparent", border: "1px dashed transparent", resize: "none", padding: 0 }}
        onFocus={(e) => (e.currentTarget.style.border = "1px dashed " + designSystem.palette.accent)}
        onBlur={(e) => (e.currentTarget.style.border = "1px dashed transparent")}
      />
    );
  }

  return <div style={textStyle}>{content}</div>;
}
