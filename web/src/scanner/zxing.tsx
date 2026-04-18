import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

type Props = {
  onResult: (text: string) => void;
  className?: string;
};

const FORMATS = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF
];

export function BarcodeScanner({ onResult, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const all = (await BrowserMultiFormatReader.listVideoInputDevices()) as MediaDeviceInfo[];
        if (cancelled) return;
        setDevices(all);
        const back = all.findIndex((d) => /back|rear|environment/i.test(d.label));
        setDeviceIdx(back >= 0 ? back : 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || devices.length === 0) return;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, FORMATS);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const deviceId = devices[deviceIdx]?.deviceId;
    let stopped = false;

    reader
      .decodeFromVideoDevice(deviceId ?? undefined, videoRef.current, (res, _err, controls) => {
        if (stopped) return;
        if (res) {
          onResult(res.getText());
          controls.stop();
          stopped = true;
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

    return () => {
      stopped = true;
    };
  }, [devices, deviceIdx, onResult]);

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      {error && <div className="text-danger text-sm">{error}</div>}
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      </div>
      {devices.length > 1 && (
        <button
          className="rounded-xl border border-border bg-surface-2 px-3 py-2"
          onClick={() => setDeviceIdx((i) => (i + 1) % devices.length)}
        >
          ↺
        </button>
      )}
    </div>
  );
}
