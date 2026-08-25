import { useRef } from "react";
import type { DesignSystem, Layout, SlotPosition } from "../lib/types";

interface Props {
  layout: Layout;
  designSystem: DesignSystem;
  aspectRatio: "16:9" | "4:3";
  selectedSlotId: string | null;
  onSelect: (slotId: string) => void;
  onChangePosition: (slotId: string, position: SlotPosition) => void;
}

const MIN_SIZE = 4; // % — nunca deixa arrastar/redimensionar um slot até sumir

type DragMode = { kind: "move"; slotId: string; startX: number; startY: number; startPos: SlotPosition } | { kind: "resize"; slotId: string; startX: number; startY: number; startPos: SlotPosition };

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Editor visual de posição/tamanho por arrastar — sem lib externa. Section
// 7 ("mover elementos", "redimensionar elementos") como interação direta
// no canvas, não só campos numéricos (que continuam existindo ao lado,
// pra precisão — os dois ficam sincronizados pelo mesmo estado).
export default function LayoutSlotEditor({ layout, designSystem, aspectRatio, selectedSlotId, onSelect, onChangePosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);

  const paddingBottom = aspectRatio === "16:9" ? "56.25%" : "75%";

  function startDrag(e: React.MouseEvent, kind: DragMode["kind"], slotId: string, startPos: SlotPosition) {
    e.preventDefault();
    e.stopPropagation();
    onSelect(slotId);
    dragRef.current = { kind, slotId, startX: e.clientX, startY: e.clientY, startPos };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    const drag = dragRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;

    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;

    if (drag.kind === "move") {
      const x = clamp(drag.startPos.x + dxPct, 0, 100 - drag.startPos.w);
      const y = clamp(drag.startPos.y + dyPct, 0, 100 - drag.startPos.h);
      onChangePosition(drag.slotId, { ...drag.startPos, x, y });
    } else {
      const w = clamp(drag.startPos.w + dxPct, MIN_SIZE, 100 - drag.startPos.x);
      const h = clamp(drag.startPos.h + dyPct, MIN_SIZE, 100 - drag.startPos.y);
      onChangePosition(drag.slotId, { ...drag.startPos, w, h });
    }
  }

  function onMouseUp() {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      ref={containerRef}
      data-testid="layout-slot-editor"
      style={{
        position: "relative",
        width: "100%",
        paddingBottom,
        background: designSystem.palette.background,
        border: `1px solid ${designSystem.palette.surface}`,
        borderRadius: 6,
        overflow: "hidden",
        userSelect: "none",
      }}
      onMouseDown={() => onSelect("")}
    >
      {layout.slots.map((slot) => {
        const selected = slot.id === selectedSlotId;
        return (
          <div
            key={slot.id}
            data-testid={`slot-box-${slot.id}`}
            onMouseDown={(e) => startDrag(e, "move", slot.id, slot.position)}
            style={{
              position: "absolute",
              left: `${slot.position.x}%`,
              top: `${slot.position.y}%`,
              width: `${slot.position.w}%`,
              height: `${slot.position.h}%`,
              border: `2px solid ${selected ? designSystem.palette.accent : designSystem.palette.muted}`,
              background: selected ? `${designSystem.palette.accent}22` : `${designSystem.palette.muted}11`,
              cursor: "move",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              color: designSystem.palette.ink,
              boxSizing: "border-box",
            }}
          >
            <span style={{ pointerEvents: "none" }}>{slot.role}</span>
            <div
              data-testid={`slot-resize-${slot.id}`}
              onMouseDown={(e) => startDrag(e, "resize", slot.id, slot.position)}
              style={{
                position: "absolute",
                right: -5,
                bottom: -5,
                width: 12,
                height: 12,
                borderRadius: 3,
                background: designSystem.palette.accent,
                cursor: "nwse-resize",
                display: selected ? "block" : "none",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
