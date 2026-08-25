export interface Project {
  id: string;
  title: string;
  description: string;
  content: string;
  objective: string;
  audience: string;
  style: string;
  minSlides: number;
  maxSlides: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Media {
  id: string;
  projectId: string;
  filename: string;
  url: string | null;
  width: number | null;
  height: number | null;
  analysis: { role: string; subject: string; orientation: string };
}

export type SlotKind = "text" | "image" | "icon" | "video" | "chart" | "table" | "shape" | "button";

export interface SlotPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Slot {
  id: string;
  kind: SlotKind;
  role: string;
  position: SlotPosition;
  required: boolean;
  maxCharacters?: number;
  maxLines?: number;
}

export interface Layout {
  id: string;
  name: string;
  type: string;
  canvas: { width: number; height: number };
  slots: Slot[];
}

export interface DesignSystem {
  palette: { background: string; surface: string; ink: string; accent: string; muted: string };
  typography: { titleFont: string; bodyFont: string; scale: Record<string, number> };
  spacing: { unit: number };
  imageTreatment: { overlayEnabled: boolean; overlayColor: string; overlayOpacity: number };
  grid: { columns: number; gutter: number; margin: number };
  radius: number;
}

export interface Template {
  id: string;
  ownerId: string | null;
  name: string;
  description: string;
  category: string;
  style: string;
  aspectRatio: "16:9" | "4:3";
  designSystem: DesignSystem;
  layouts: Layout[];
  active: boolean;
}

export type PresentationStatus = "draft" | "analyzing" | "planned" | "generating" | "generated" | "optimized" | "failed";

export interface Presentation {
  id: string;
  projectId: string;
  templateId: string | null;
  title: string;
  status: PresentationStatus;
  aspectRatio: "16:9" | "4:3";
  slideCount: number;
  currentVersion: number;
  lastError: string | null;
  visualQaScore: { overall: number; issueCount: number; issues: { message: string; severity: string }[] } | null;
  exportPaths: { pptx: string | null; pdf: string | null; png: string[] };
}

export interface SlideElement {
  slotId: string;
  kind: SlotKind;
  role: string;
  position: SlotPosition;
  text?: string;
  imageUrl?: string | null;
  imageMediaId?: string;
  listItems?: string[];
  statValue?: string;
  fontSize?: number;
  overflow: boolean;
}

export interface Slide {
  order: number;
  layoutId: string;
  purpose: string;
  elements: SlideElement[];
}

export interface Version {
  id: string;
  versionNumber: number;
  createdBy: "user" | "ai";
  changeSummary: string;
  createdAt: string | null;
}
