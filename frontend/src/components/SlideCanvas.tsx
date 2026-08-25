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
