import { ImageResponse } from "next/og";

export const alt = "Bitemap — Where would you bite?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24 }}>
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
          <div style={{ fontSize: 64, fontWeight: 700, color: "#1c1917" }}>Bitemap</div>
        </div>
        <div style={{ fontSize: 28, color: "#78716c", maxWidth: 700, textAlign: "center" }}>
          Where would you take your next bite?
        </div>
      </div>
    ),
    { ...size }
  );
}
