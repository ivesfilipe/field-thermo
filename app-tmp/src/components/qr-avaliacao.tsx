"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QrAvaliacao({
  url,
  titulo = "QR Code de Avaliação",
  subtitulo = "Aponte a câmera do celular do cliente para avaliar"
}: {
  url: string | null | undefined;
  titulo?: string;
  subtitulo?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [ampliado, setAmpliado] = useState(false);

  useEffect(() => {
    let ativo = true;
    if (!url) {
      setDataUrl("");
      return;
    }
    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" }
    })
      .then((res) => {
        if (ativo) setDataUrl(res);
      })
      .catch(() => {
        if (ativo) setDataUrl("");
      });
    return () => {
      ativo = false;
    };
  }, [url]);

  if (!url || !dataUrl) return null;

  return (
    <>
      <div className="flex flex-col items-center rounded-xl border border-blue-200 bg-white p-3 text-center shadow-xs">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-950">{titulo}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>
        <button
          type="button"
          onClick={() => setAmpliado(true)}
          title="Toque para ampliar o QR Code"
          className="mt-2 cursor-pointer rounded-lg border border-slate-200 bg-white p-2 transition hover:border-blue-500"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt={titulo} className="h-44 w-44 sm:h-48 sm:w-48" />
        </button>
        <button
          type="button"
          onClick={() => setAmpliado(true)}
          className="mt-2 rounded-lg bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-950"
        >
          Ampliar QR Code na tela
        </button>
      </div>

      {ampliado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setAmpliado(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-blue-950">{titulo}</h3>
            <p className="mt-1 text-xs text-slate-500">{subtitulo}</p>
            <div className="mt-4 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={dataUrl} alt={titulo} className="h-64 w-64 rounded-xl border border-slate-200 p-2" />
            </div>
            <button
              type="button"
              onClick={() => setAmpliado(false)}
              className="mt-5 w-full rounded-xl bg-blue-900 py-2.5 text-sm font-semibold text-white hover:bg-blue-950"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

