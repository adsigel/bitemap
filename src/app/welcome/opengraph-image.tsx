import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Bitemap — Where would you bite?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logoData = await readFile(join(process.cwd(), "public/bitemap.png"), "base64");
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafaf9",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: 24 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "#f97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            🥪
          </div>
          <img src={logoSrc} height={64} style={{ display: "block" }} />
        </div>
        <div style={{ fontSize: 28, color: "#78716c", maxWidth: 700, textAlign: "center" }}>
          Where would you take your next bite?
        </div>
      </div>
    ),
    { ...size }
  );
}
