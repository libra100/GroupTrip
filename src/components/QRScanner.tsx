import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { markAttendance } from '../firebase';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface QRScannerProps {
  itineraryId: string;
}

export default function QRScanner({ itineraryId }: QRScannerProps) {
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Only initialize if we haven't already
    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        "qr-reader",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
        },
        false
      );

      const onScanSuccess = async (decodedText: string) => {
        if (isScanning) return; // Prevent multiple rapid scans
        setIsScanning(true);

        try {
          const result = await markAttendance(itineraryId, decodedText);
          setScanResult({ success: true, message: `Successfully marked member present.` });
        } catch (error: any) {
          setScanResult({ success: false, message: error.message || 'Failed to mark attendance.' });
        } finally {
          // Allow scanning again after 3 seconds
          setTimeout(() => {
            setIsScanning(false);
            setScanResult(null);
          }, 3000);
        }
      };

      const onScanFailure = (error: any) => {
        // Ignore failures as they happen continuously until a code is found
      };

      scannerRef.current.render(onScanSuccess, onScanFailure);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [itineraryId, isScanning]);

  return (
    <div className="flex flex-col items-center p-6 space-y-6">
      <div className="w-full max-w-md">
        <div id="qr-reader" className="overflow-hidden rounded-2xl border-2 border-stone-200 bg-white"></div>
      </div>

      {scanResult && (
        <div className={`flex items-center gap-3 p-4 rounded-xl w-full max-w-md ${
          scanResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {scanResult.success ? <CheckCircle2 className="w-6 h-6 flex-shrink-0" /> : <AlertCircle className="w-6 h-6 flex-shrink-0" />}
          <p className="font-medium">{scanResult.message}</p>
        </div>
      )}

      {isScanning && !scanResult && (
        <div className="flex items-center gap-2 text-stone-500">
          <div className="animate-spin w-4 h-4 border-2 border-stone-500 border-t-transparent rounded-full"></div>
          <span>Processing scan...</span>
        </div>
      )}
    </div>
  );
}
