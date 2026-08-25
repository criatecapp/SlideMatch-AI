import type { Canvas, GridConfig, GridPlacement, SlotPosition } from "../schemas/template";

// Motor de grid puro e determinístico — nenhum I/O, nenhuma IA. Converte uma
// coluna/linha do grid (0-indexed, em unidades de coluna) numa posição em %
// do canvas, pra Slide Composer nunca digitar x/y/w/h à mão.
//
// Linhas usam a mesma largura de unidade das colunas (grid "quadrado") — o
// schema não define uma contagem de linhas separada (section 4 só definiu
// columns/gutter/margin), então a unidade vertical é derivada da largura de
// coluna. É uma escolha pragmática, documentada aqui: se um layout precisar
// de linhas mais altas/baixas que isso, ele usa `position` direto em vez de
// `gridPlacement`.
export function resolveGridPosition(grid: GridConfig, canvas: Canvas, placement: GridPlacement): SlotPosition {
  const usableWidth = canvas.width - 2 * grid.margin - (grid.columns - 1) * grid.gutter;
  const colWidthPx = usableWidth / grid.columns;
  const unitPx = colWidthPx + grid.gutter;

  const xPx = grid.margin + placement.column * unitPx;
  const wPx = placement.columnSpan * colWidthPx + (placement.columnSpan - 1) * grid.gutter;

  const row = placement.row ?? 0;
  const rowSpan = placement.rowSpan ?? 1;
  const usableHeight = canvas.height - 2 * grid.margin;
  // Altura de linha usa a mesma unidade de coluna (grid "quadrado"),
  // limitada ao espaço vertical disponível.
  const rowUnitPx = Math.min(unitPx, usableHeight / grid.columns);
  const yPx = grid.margin + row * rowUnitPx;
  const hPx = rowSpan * rowUnitPx - grid.gutter;

  return {
    x: clampPct((xPx / canvas.width) * 100),
    y: clampPct((yPx / canvas.height) * 100),
    w: clampPct((wPx / canvas.width) * 100),
    h: clampPct((hPx / canvas.height) * 100),
  };
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function isWithinSafeArea(canvas: Canvas, position: SlotPosition): boolean {
  return position.x >= 0 && position.y >= 0 && position.x + position.w <= 100.001 && position.y + position.h <= 100.001;
}
