import { useEffect, useState } from "react";

import { generateQrDataUrl } from "./qrcode";

export function useQrDataUrl(payload: string, refreshKey = 0) {
  const [qrImageDataUrl, setQrImageDataUrl] = useState("");

  useEffect(() => {
    let disposed = false;
    setQrImageDataUrl("");

    if (!payload) {
      return () => {
        disposed = true;
      };
    }

    void generateQrDataUrl(payload)
      .then((dataUrl) => {
        if (!disposed) {
          setQrImageDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!disposed) {
          setQrImageDataUrl("");
        }
      });

    return () => {
      disposed = true;
    };
  }, [payload, refreshKey]);

  return qrImageDataUrl;
}
