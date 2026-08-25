import { describe, expect, it, afterEach } from "vitest";
import { clearGoogleFontCache, fetchGoogleFontFiles, parseFontFaceUrls } from "./googleFonts";

const SAMPLE_CSS = `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/regular.woff) format('woff');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/inter/v20/bold.woff) format('woff');
}
`;

describe("parseFontFaceUrls", () => {
  it("extracts weight and url pairs from real Google Fonts CSS", () => {
    const result = parseFontFaceUrls(SAMPLE_CSS);
    expect(result).toEqual([
      { weight: 400, url: "https://fonts.gstatic.com/s/inter/v20/regular.woff" },
      { weight: 700, url: "https://fonts.gstatic.com/s/inter/v20/bold.woff" },
    ]);
  });

  it("returns an empty list for CSS with no @font-face blocks", () => {
    expect(parseFontFaceUrls("body { color: red; }")).toEqual([]);
  });
});

describe("fetchGoogleFontFiles (live network)", () => {
  afterEach(() => clearGoogleFontCache());

  it("fetches real regular+bold .woff bytes for Inter", async () => {
    const files = await fetchGoogleFontFiles("Inter");
    expect(files).not.toBeNull();
    expect(files!.some((f) => f.weight === 400)).toBe(true);
    expect(files!.some((f) => f.weight === 700)).toBe(true);
    for (const f of files!) expect(f.data.length).toBeGreaterThan(1000);
  }, 15000);

  it("returns null for a font family that doesn't exist", async () => {
    const files = await fetchGoogleFontFiles("Definitely Not A Real Font Xyz123");
    expect(files).toBeNull();
  }, 15000);
});
