import React, { useState } from 'react';
import { Member, Itinerary, TripSettings, ItineraryType } from '../types';
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
  Check,
  UtensilsCrossed,
  Car,
  Milestone,
  Home
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

  const getTypeColor = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return 'bg-blue-500';
      case 'dining': return 'bg-orange-500';
      case 'transit': return 'bg-stone-500';
      case 'logistics': return 'bg-purple-500';
      case 'accommodation': return 'bg-[#00F3FF]';
      default: return 'bg-stone-500';
    }
  };

  const getTypeLabel = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return '景點';
      case 'dining': return '餐飲';
      case 'transit': return '交通';
      case 'logistics': return '行政';
      case 'accommodation': return '住宿';
      default: return '其他';
    }
  };

  const getTypeIcon = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return MapPin;
      case 'dining': return UtensilsCrossed;
      case 'transit': return Car;
      case 'logistics': return Milestone;
      case 'accommodation': return Home;
      default: return MapPin;
    }
  };

  const handleToggleParticipation = async (itinerary: Itinerary, isCurrentlySkipped: boolean) => {
    setLoadingId(itinerary.id);
    try {
      const itRef = doc(db, 'itineraries', itinerary.id);
      
      if (itinerary.isMain) {
        await updateDoc(itRef, {
          excludedMemberIds: isCurrentlySkipped 
            ? arrayRemove(member.id) 
            : arrayUnion(member.id)
        });
      } else {
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
      // 1. If startTime exists, it's the most reliable source
      if (it.startTime) {
        const itDate = it.startTime.toDate ? it.startTime.toDate() : new Date(it.startTime);
        if (!isNaN(itDate.getTime())) {
          return format(itDate, 'yyyy-MM-dd') === date;
        }
      }
      
      // 2. Fallback to dayIndex if no valid startTime
      if (it.dayIndex !== undefined) {
        return it.dayIndex === idx;
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
      const officialStart = tripSettings?.officialStartDate ? parseISO(tripSettings.officialStartDate) : parseISO(tripSettings?.startDate || '');
      const current = parseISO(date);
      const diff = differenceInDays(current, officialStart);
      const dayNum = diff + 1;
      acc.push({ date, items: combined, dayNumber: dayNum });
    }
    return acc;
  }, [] as { date: string; items: (Itinerary & { isSkipped: boolean })[]; dayNumber: number }[]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
      <div className="bg-stone-50 w-full max-w-3xl rounded-[2.5rem] p-8 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-3xl bg-stone-900 text-white flex items-center justify-center text-2xl font-black shadow-xl ring-4 ring-white">
              {member.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-3xl font-serif font-light text-stone-900">{member.name}</h3>
                <span className="px-3 py-1 bg-white border border-stone-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-stone-400">Personal Itinerary</span>
              </div>
              <p className="text-stone-400 text-sm font-medium">
                參與 <span className="text-stone-900 font-bold">{personalItineraries.length}</span> 項行程
                {skippedItineraries.length > 0 && (
                  <> • 跳過 <span className="text-red-500 font-bold">{skippedItineraries.length}</span> 項主要活動</>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-full transition-all text-stone-400 hover:text-stone-900 hover:shadow-sm border border-transparent hover:border-stone-100">
            <X className="w-7 h-7" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-10 scrollbar-thin custom-scrollbar pb-6">
          {groupedByDay.length > 0 ? groupedByDay.map(({ date, items, dayNumber }) => (
            <div key={date} className="relative pl-12">
              {/* Vertical Timeline Line */}
              <div className="absolute left-5 top-0 bottom-[-40px] w-0.5 bg-stone-200/60" />
              
              {/* Day Label */}
              <div className="sticky top-0 z-20 flex items-center gap-3 mb-6 bg-stone-50/90 backdrop-blur-sm py-2">
                <div className="w-10 h-10 rounded-full bg-stone-900 text-white flex items-center justify-center text-xs font-black shadow-lg ring-4 ring-white z-10">
                  D{dayNumber}
                </div>
                <div>
                  <h4 className="text-xl font-serif font-black text-stone-900">{format(parseISO(date), 'yyyy/MM/dd')}</h4>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest leading-none mt-1">
                    {format(parseISO(date), 'EEEE')}
                  </p>
                </div>
                
                {tripSettings?.dailyAbsences?.[date]?.includes(member.id) && (
                  <div className="ml-auto flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-2xl shadow-lg shadow-red-200 animate-pulse border border-red-600">
                    <UserX className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">當日缺席 (Absent)</span>
                  </div>
                )}
              </div>

              {/* Day's Items */}
              <div className="space-y-4">
                {items.map((it) => {
                  const startTime = it.startTime?.toDate?.() || new Date(it.startTime);
                  const isDayAbsent = tripSettings?.dailyAbsences?.[date]?.includes(member.id);
                  const isSkipped = it.isSkipped || isDayAbsent;
                  const isLoading = loadingId === it.id;
                  const Icon = getTypeIcon(it.type);

                  return (
                    <div 
                      key={it.id} 
                      className={cn(
                        "group p-5 rounded-3xl border transition-all duration-300 relative flex flex-col sm:flex-row items-start sm:items-center gap-4",
                        isDayAbsent 
                          ? "bg-red-50/20 border-red-100 opacity-70" 
                          : isSkipped 
                            ? "bg-stone-100/50 border-stone-200 opacity-60 grayscale-[0.5]" 
                            : "bg-white border-white shadow-sm hover:shadow-xl hover:scale-[1.01]"
                      )}
                    >
                      {/* Connection Line Node */}
                      <div className={cn(
                        "absolute left-[-33px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full z-10 border-4 border-white shadow-sm transition-colors",
                        isDayAbsent ? "bg-red-500" : isSkipped ? "bg-stone-300" : getTypeColor(it.type)
                      )} />
                      
                      {/* Time and Icon */}
                      <div className="flex items-center gap-4 w-full sm:w-auto flex-shrink-0">
                        <div className="text-sm font-black text-stone-900 font-mono tracking-tight bg-stone-100 px-3 py-1.5 rounded-xl">
                          {format(startTime, 'HH:mm')}
                        </div>
                        <div className={cn("p-2.5 rounded-2xl text-white shadow-md", getTypeColor(it.type))}>
                          <Icon className="w-4 h-4" />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-sm",
                            it.isMain ? "bg-stone-200 text-stone-600" : "bg-purple-500 text-white"
                          )}>
                            {it.isMain ? '主要' : '脫隊'}
                          </span>
                          <span className="text-[9px] font-black text-stone-400 uppercase tracking-tighter">
                            {getTypeLabel(it.type)}
                          </span>
                        </div>
                        <h5 className={cn("font-black text-stone-900 text-lg leading-tight truncate", isSkipped && "line-through opacity-50")}>
                          {it.title}
                        </h5>
                      </div>

                      {/* Action Button */}
                      <button
                        onClick={() => handleToggleParticipation(it, isSkipped)}
                        disabled={isLoading || isDayAbsent}
                        className={cn(
                          "w-full sm:w-auto px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm border-2",
                          isDayAbsent
                            ? "bg-stone-100 text-stone-300 border-stone-200 cursor-not-allowed"
                            : isSkipped
                              ? "bg-stone-900 text-white border-stone-900 hover:bg-stone-800 shadow-lg shadow-stone-200"
                              : "bg-white text-red-500 border-red-50 hover:bg-red-50 hover:border-red-100"
                        )}
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : isDayAbsent ? (
                          <>
                            <UserX className="w-4 h-4" />
                            缺席
                          </>
                        ) : isSkipped ? (
                          <>
                            <PlusCircle className="w-4 h-4" />
                            參加行程
                          </>
                        ) : (
                          <>
                            <MinusCircle className="w-4 h-4" />
                            跳過行程
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )) : (
            <div className="text-center py-24 bg-white rounded-[3rem] border-4 border-dashed border-stone-100 shadow-inner">
              <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Calendar className="w-10 h-10 text-stone-200" />
              </div>
              <h4 className="text-xl font-serif text-stone-400">目前沒有安排任何行程</h4>
              <p className="text-xs text-stone-300 font-bold uppercase tracking-widest mt-2">No itineraries scheduled yet</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-stone-100">
          <button 
            onClick={onClose}
            className="w-full py-4 bg-stone-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] hover:bg-stone-800 transition-all shadow-xl shadow-stone-200 active:scale-95 duration-200 border-4 border-white"
          >
            關閉視窗 / Close
          </button>
        </div>
      </div>
    </div>
  );
}
