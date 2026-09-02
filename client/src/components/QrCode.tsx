import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: { dark: '#16211c', light: '#ffffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-xl bg-cloud border border-line flex items-center justify-center text-[11px] text-mute text-center px-3"
      >
        Couldn't generate a QR code
      </div>
    );
  }

  if (!dataUrl) {
    return <div style={{ width: size, height: size }} className="rounded-xl bg-cloud animate-pulse" />;
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="Scan to open the invite link"
      className="rounded-xl border border-line bg-white p-2"
      style={{ width: size, height: size }}
    />
  );
}
