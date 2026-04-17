import React, { useState } from 'react';
import { Member, Itinerary, TripSettings } from '../types';
import { 
  X, 
  Calendar, 
  MapPin, 
  Clock,
  User,
  Plane,
  UserCheck,
  UserX,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  Check
} from 'lucide-react';
import { format, addDays, parseISO, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';

interface PersonalItineraryModalProps {
  member: Member;
  itineraries: Itinerary[];
  tripSettings: TripSettings | null;
  onClose: () => void;
}

export default function PersonalItineraryModal({ member, itineraries, tripSettings, onClose }: PersonalItineraryModalProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const tripDates = React.useMemo(() => {
    if (!tripSettings?.startDate || !tripSettings?.endDate) return [];
    const start = parseISO(tripSettings.startDate);
    const end = parseISO(tripSettings.endDate);
    const days = differenceInDays(end, start) + 1;
    return Array.from({ length: days }).map((_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  }, [tripSettings]);

  const handleToggleParticipation = async (itinerary: Itinerary, isCurrentlySkipped: boolean) => {
    setLoadingId(itinerary.id);
    try {
      const itRef = doc(db, 'itineraries', itinerary.id);
      
      if (itinerary.isMain) {
        // Main itinerary uses excludedMemberIds
        await updateDoc(itRef, {
          excludedMemberIds: isCurrentlySkipped 
            ? arrayRemove(member.id) 
            : arrayUnion(member.id)
        });
      } else {
        // Non-main itinerary uses assignedMemberIds
        // Note: Joining a non-main from here is tricky as they usually don't appear if not assigned,
        // but we'll implement Leave logic.
        await updateDoc(itRef, {
          assignedMemberIds: isCurrentlySkipped
            ? arrayUnion(member.id)
            : arrayRemove(member.id)
        });
      }
    } catch (error) {
      console.error("Failed to toggle participation:", error);
      alert("更新失敗，請檢查網絡權限。");
    } finally {
      setLoadingId(null);
    }
  };

  const personalItineraries = itineraries.filter(it => {
    if (it.isMain) {
      return !it.excludedMemberIds?.includes(member.id);
    } else {
      return it.assignedMemberIds?.includes(member.id);
    }
  });

  const skippedItineraries = itineraries.filter(it => 
    it.isMain && it.excludedMemberIds?.includes(member.id)
  );

  const groupedByDay = tripDates.reduce((acc, date, idx) => {
    const filterByDay = (list: Itinerary[]) => list.filter(it => {
      if (it.dayIndex !== undefined) return it.dayIndex === idx;
      if (it.startTime) {
        const itDate = it.startTime.toDate ? it.startTime.toDate() : new Date(it.startTime);
        return format(itDate, 'yyyy-MM-dd') === date;
      }
      return false;
    }).sort((a, b) => {
      const timeA = a.startTime?.toDate?.()?.getTime() || new Date(a.startTime).getTime();
      const timeB = b.startTime?.toDate?.()?.getTime() || new Date(b.startTime).getTime();
      return timeA - timeB;
    });

    const dayItineraries = filterByDay(personalItineraries).map(it => ({ ...it, isSkipped: false }));
    const daySkipped = filterByDay(skippedItineraries).map(it => ({ ...it, isSkipped: true }));

    const combined = [...dayItineraries, ...daySkipped].sort((a, b) => {
      const timeA = a.startTime?.toDate?.()?.getTime() || new Date(a.startTime).getTime();
      const timeB = b.startTime?.toDate?.()?.getTime() || new Date(b.startTime).getTime();
      return timeA - timeB;
    });

    if (combined.length > 0) {
      acc.push({ date, items: combined, dayNumber: idx + 1 });
    }
    return acc;
  }, [] as { date: string; items: (Itinerary & { isSkipped: boolean })[]; dayNumber: number }[]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-stone-900 text-white flex items-center justify-center text-xl font-bold shadow-lg">
              {member.name.charAt(0)}
            </div>
            <div>
              <h3 className="text-2xl font-serif">{member.name} 的個人行程</h3>
              <p className="text-stone-400 text-sm font-medium mt-1">
                共參與 {personalItineraries.length} 個行程項目
                {skippedItineraries.length > 0 && ` (跳過 ${skippedItineraries.length} 個主要行程)`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400 hover:text-stone-900">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-12 scrollbar-thin">
          {groupedByDay.length > 0 ? groupedByDay.map(({ date, items, dayNumber }) => (
            <div key={date} className="relative pl-10">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-stone-200"></div>
              
              {/* Date dot */}
              <div className="absolute left-[11px] top-0 w-2.5 h-2.5 rounded-full bg-stone-900 z-10 border-2 border-white shadow-sm"></div>
              
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black text-stone-400 uppercase tracking-widest leading-none">Day {dayNumber}</span>
                  <h4 className="text-lg font-serif text-stone-900">{date}</h4>
                </div>
                {tripSettings?.dailyAbsences?.[date]?.includes(member.id) && (
                  <div className="flex items-center gap-2 bg-red-50 text-red-500 px-3 py-1.5 rounded-xl border border-red-100 shadow-sm animate-pulse">
                    <UserX className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-widest">當日缺席 (Absent)</span>
                  </div>
                )}
              </div>

              <div className="space-y-6">
                {items.map((it) => {
                  const startTime = it.startTime?.toDate?.() || new Date(it.startTime);
                  const isDayAbsent = tripSettings?.dailyAbsences?.[date]?.includes(member.id);
                  const isSkipped = it.isSkipped || isDayAbsent;
                  const isLoading = loadingId === it.id;

                  return (
                    <div 
                      key={it.id} 
                      className={cn(
                        "p-4 rounded-2xl border transition-all duration-300 relative flex items-start gap-4",
                        isDayAbsent 
                          ? "bg-red-50/30 border-red-100/50 opacity-80" 
                          : isSkipped 
                            ? "bg-stone-50/50 border-stone-100 opacity-60 grayscale-[0.5]" 
                            : "bg-white border-stone-100 hover:border-stone-200 shadow-sm hover:shadow-md"
                      )}
                    >
                      {/* Timeline Dot */}
                      <div className={cn(
                        "absolute left-[-29px] top-6 w-2 h-2 rounded-full z-10 border-2 border-white transition-colors duration-300",
                        isDayAbsent ? "bg-red-400" : isSkipped ? "bg-stone-300" : "bg-stone-900"
                      )} />
                      
                      <div className="w-16 pt-1 text-sm font-mono font-bold text-stone-400 whitespace-nowrap">
                        {format(startTime, 'HH:mm')}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                              it.isMain ? "bg-stone-200 text-stone-600" : "bg-purple-100 text-purple-600"
                            )}>
                              {it.isMain ? '主要行程' : '脫隊行動'}
                            </span>
                            <span className="text-[10px] bg-white border border-stone-200 px-1.5 py-0.5 rounded font-medium text-stone-400">
                              {it.type}
                            </span>
                          </div>
                          
                          <button
                            onClick={() => handleToggleParticipation(it, isSkipped)}
                            disabled={isLoading || isDayAbsent}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50",
                              isDayAbsent
                                ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                                : isSkipped
                                  ? "bg-stone-900 text-white hover:bg-stone-800 shadow-sm"
                                  : "bg-red-50 text-red-600 hover:bg-red-100 border border-red-100"
                            )}
                          >
                            {isLoading ? (
                              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : isDayAbsent ? (
                              <>
                                <UserX className="w-3 h-3" />
                                缺席 (Absent)
                              </>
                            ) : isSkipped ? (
                              <>
                                <PlusCircle className="w-3 h-3" />
                                參加 (Join)
                              </>
                            ) : (
                              <>
                                <MinusCircle className="w-3 h-3" />
                                不參加 (Skip)
                              </>
                            )}
                          </button>
                        </div>

                        <div className="flex items-start justify-between">
                          <div>
                            <h5 className="font-bold text-stone-900">{it.title}</h5>
                            {it.location?.address && (
                              <div className="flex items-center gap-1 text-xs text-stone-400 mt-1">
                                <MapPin className="w-3 h-3" />
                                {it.location.address}
                              </div>
                            )}
                            {it.notes && (
                              <p className="text-xs text-stone-400 italic mt-2 line-clamp-1">{it.notes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )) : (
            <div className="text-center py-20 bg-stone-50 rounded-3xl border border-dashed border-stone-200">
              <Calendar className="w-12 h-12 text-stone-200 mx-auto mb-4" />
              <p className="text-stone-400 font-serif translate-y-1">此成員目前尚未被安排在任何行程中</p>
            </div>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-stone-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-all shadow-lg active:scale-95 duration-200"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
}
