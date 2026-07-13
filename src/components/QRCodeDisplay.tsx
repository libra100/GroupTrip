import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { auth } from '../firebase';

interface QRCodeDisplayProps {
  memberId?: string;
}

export default function QRCodeDisplay({ memberId }: QRCodeDisplayProps) {
  const [timestamp, setTimestamp] = useState(Date.now());

  useEffect(() => {
    // Update timestamp every 10 seconds to generate a new QR code
    const interval = setInterval(() => {
      setTimestamp(Date.now());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Use the provided memberId or the current authenticated user's uid
  const uid = memberId || auth.currentUser?.uid;

  if (!uid) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-stone-500">
        <p>User not authenticated or member ID not found.</p>
        <p className="text-sm mt-2">Cannot generate QR code.</p>
      </div>
    );
  }

  const payload = JSON.stringify({ uid, timestamp });

  return (
    <div className="flex flex-col items-center justify-center space-y-6 p-8">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-100">
        <QRCodeSVG value={payload} size={256} level="H" />
      </div>
      <div className="text-center">
        <h3 className="text-lg font-bold text-stone-900">Your Attendance QR Code</h3>
        <p className="text-sm text-stone-500 mt-2">
          Show this code to a leader to mark your attendance.
        </p>
        <p className="text-xs text-stone-400 mt-4">
          Updates automatically every 10 seconds.
        </p>
      </div>
    </div>
  );
}
