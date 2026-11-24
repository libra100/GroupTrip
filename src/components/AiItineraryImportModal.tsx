import React, { useState, useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { TripSettings } from '../types';
import { db, getActiveTripId, tripDoc } from '../firebase';
import {
  ParsedTripProposal,
  commitParsedItinerariesToTrip
} from '../lib/aiTripParser';
import AiProposalParserPanel from './AiProposalParserPanel';

interface AiItineraryImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripSettings: TripSettings | null;
}

export default function AiItineraryImportModal({
  isOpen,
  onClose,
  tripSettings,
}: AiItineraryImportModalProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const defaultStart =
    tripSettings?.startDate || format(new Date(), 'yyyy-MM-dd');

  const handleConfirmImport = async (proposal: ParsedTripProposal) => {
    const activeTripId = getActiveTripId();
    if (!activeTripId) {
      throw new Error('找不到目前使用中的旅遊行程。');
    }

    setBusy(true);
    try {
      const selectedItems = proposal.items.filter((i) => i.selected);
      const itemDates = selectedItems.map((i) => i.date).filter(Boolean).sort();
      const minDate = itemDates[0] || proposal.startDate;
      const maxDate = itemDates[itemDates.length - 1] || proposal.endDate;

      const currentStart = tripSettings?.startDate;
      const currentEnd = tripSettings?.endDate;
      const nextStart = currentStart && currentStart < minDate ? currentStart : minDate;
      const nextEnd = currentEnd && currentEnd > maxDate ? currentEnd : maxDate;

      if (!tripSettings || nextStart !== currentStart || nextEnd !== currentEnd) {
        await setDoc(
          tripDoc('settings', 'tripSettings', activeTripId),
          {
            startDate: nextStart,
            endDate: nextEnd,
            officialStartDate: tripSettings?.officialStartDate || nextStart,
          },
          { merge: true }
        );
        await updateDoc(doc(db, 'trips', activeTripId), {
          startDate: nextStart,
          endDate: nextEnd,
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      await commitParsedItinerariesToTrip(
        activeTripId,
        tripSettings?.officialStartDate || nextStart,
        selectedItems
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-stone-900/45 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-stone-200 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between gap-4 bg-stone-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-stone-900 text-[#00F3FF] flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-serif font-bold text-stone-900">
                AI 辨識企劃書／紙本匯入行程
              </h3>
              <p className="text-xs text-stone-500">
                上傳企劃書或紙本行程表照片，自動解析並批次匯入目前旅遊團
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-stone-200/70 rounded-full transition-colors text-stone-500 hover:text-stone-900"
            aria-label="關閉視窗"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <AiProposalParserPanel
            defaultStartDate={defaultStart}
            showTripMeta={false}
            submitLabelPrefix="確認匯入選取項目"
            busy={busy}
            onConfirm={handleConfirmImport}
          />
        </div>
      </div>
    </div>
  );
}
