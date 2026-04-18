import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const instrumentSerif = await fetch(
    "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap"
  )
    .then((res) => res.text())
    .then((css) => {
      const url = css.match(/src: url\((.+?)\)/)?.[1];
      return url ? fetch(url).then((res) => res.arrayBuffer()) : null;
    });

  const serif = instrumentSerif ? "Instrument Serif" : "serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 100px",
          background: "#c0c8d4",
          color: "#111",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: serif,
            fontSize: 120,
            lineHeight: 0.9,
            letterSpacing: "-0.025em",
          }}
        >
          <span>Antoni</span>
          <div style={{ display: "flex" }}>
            <span>Kiszka</span>
            <span style={{ color: "#555" }}>.</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "monospace",
            fontSize: 18,
            letterSpacing: "0.18em",
            textTransform: "uppercase" as const,
            color: "#555",
            marginTop: 36,
          }}
        >
          building things that should exist
        </div>
      </div>
    ),
    {
      ...size,
      fonts: instrumentSerif
        ? [
            {
              name: "Instrument Serif",
              data: instrumentSerif,
              style: "normal" as const,
              weight: 400 as const,
            },
          ]
        : [],
    }
  );
}
