import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Thermo Control — MedicalThermo Herzog",
    short_name: "Thermo Control",
    description: "Plataforma de gestão de serviços técnicos",
    start_url: "/app",
    display: "standalone",
    background_color: "#172554",
    theme_color: "#172554",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
