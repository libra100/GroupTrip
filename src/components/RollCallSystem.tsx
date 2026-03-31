import React, { useState, useMemo, useEffect } from 'react';
import { RollCall, Itinerary, Member } from '../types';
import { 
  Users,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  UserCheck,
  UserX,
  UserMinus,
  Calendar,
  History,
  Copy,
  Check
} from 'lucide-react';
import { collection, addDoc, updateDoc, doc, Timestamp, setDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';

const safeFormat = (date: Date | null | number | undefined, formatStr: string) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, formatStr);
};

interface TripSettings {
  startDate: string;
  endDate: string;
}

interface RollCallSystemProps {
  rollCalls: RollCall[];
  itineraries: Itinerary[];
  members: Member[];
}

export default function RollCallSystem({ rollCalls, itineraries, members }: RollCallSystemProps) {
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [tripSettings, setTripSettings] = useState<TripSettings | null>(null);
  const [activeDate, setActiveDate] = useState<string>(safeFormat(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'tripSettings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as TripSettings;
        setTripSettings(data);
      } else {
        setTripSettings(null);
      }
    });
    return () => unsub();
  }, []);

  const tripDates = useMemo(() => {
    if (!tripSettings?.startDate || !tripSettings?.endDate) return [];
    const start = parseISO(tripSettings.startDate);
    const end = parseISO(tripSettings.endDate);
    const days = differenceInDays(end, start) + 1;
    if (days <= 0 || days > 180) return [];
    return Array.from({ length: days }).map((_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
  }, [tripSettings]);

  useEffect(() => {
    if (tripDates.length > 0 && !tripDates.includes(activeDate)) {
      setActiveDate(tripDates[0]);
    }
  }, [tripDates, activeDate]);

  const validItineraries = useMemo(() => {
    if (!tripSettings) return [];
    return itineraries.filter(it => {
      if (it.dayIndex !== undefined) {
        return it.dayIndex >= 0 && it.dayIndex < tripDates.length;
      }
      // Fallback for legacy data
      const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
      if (isNaN(startObj.getTime())) return false;
      const itDateStr = format(startObj, 'yyyy-MM-dd');
      return itDateStr >= tripSettings.startDate && itDateStr <= tripSettings.endDate;
    });
  }, [itineraries, tripSettings, tripDates]);

  const activeDayItineraries = useMemo(() => {
    const activeIdx = tripDates.indexOf(activeDate);
    const dayIts = validItineraries.filter(it => {
      if (it.dayIndex !== undefined) return it.dayIndex === activeIdx;
      // Fallback
      const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
      return format(startObj, 'yyyy-MM-dd') === activeDate;
    });

    // Sort by time
    return dayIts.sort((a, b) => {
      const aTime = a.startTime instanceof Timestamp ? a.startTime.toDate() : new Date(a.startTime);
      const bTime = b.startTime instanceof Timestamp ? b.startTime.toDate() : new Date(b.startTime);
      return aTime.getTime() - bTime.getTime();
    });
  }, [validItineraries, activeDate, tripDates]);

  // If the activeDayItineraries has only one item and none is selected, auto-select it
  useEffect(() => {
    if (activeDayItineraries.length > 0 && !selectedItineraryId) {
       // Only auto-select if no selection exists anywhere for this screen.
       // Actually, maybe better to let user pick.
    }
  }, [activeDayItineraries, selectedItineraryId]);

  const currentItinerary = itineraries.find(it => it.id === selectedItineraryId);
  
  const latestRollCall = useMemo(() => {
    if (!selectedItineraryId) return null;
    return rollCalls
      .filter(rc => rc.itineraryId === selectedItineraryId)
      .sort((a, b) => (b.timestamp?.toDate?.() || new Date(b.timestamp)).getTime() - (a.timestamp?.toDate?.() || new Date(a.timestamp)).getTime())[0];
  }, [rollCalls, selectedItineraryId]);

  const handleStatusChange = async (memberId: string, status: 'present' | 'absent' | 'divergent') => {
    if (!selectedItineraryId) return;

    const rollCallId = latestRollCall?.id || `rc_${selectedItineraryId}_${Date.now()}`;
    const statusMap = { ...(latestRollCall?.statusMap || {}), [memberId]: status };

    try {
      if (latestRollCall) {
        await updateDoc(doc(db, 'rollcalls', latestRollCall.id), { statusMap });
      } else {
        await setDoc(doc(db, 'rollcalls', rollCallId), {
          id: rollCallId,
          itineraryId: selectedItineraryId,
          timestamp: Timestamp.now(),
          statusMap
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rollcalls/${latestRollCall?.id || rollCallId}`);
    }
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Day 6+ (dayIndex >= 5) Main Itinerary Filter for 5-Day members
    // Default is 5-Day if no 3-Day or 9-Day tag exists
    const tags = m.tags || [];
    const is3Day = tags.some(tag => tag.toLowerCase().includes('3天') || tag.toLowerCase().includes('3d'));
    const is9Day = tags.some(tag => tag.toLowerCase().includes('9天') || tag.toLowerCase().includes('9d'));
    const is5Day = !is3Day && !is9Day;
    
    const isDay6Plus = currentItinerary?.dayIndex !== undefined && currentItinerary.dayIndex >= 5;
    const isDay4Plus = currentItinerary?.dayIndex !== undefined && currentItinerary.dayIndex >= 3;
    
    if (currentItinerary?.isMain) {
      if (is5Day && isDay6Plus) return false;
      if (is3Day && isDay4Plus) return false;
      
      // Filter out excluded members
      if (currentItinerary.excludedMemberIds?.includes(m.id)) return false;
    }

    if (!currentItinerary?.isMain && currentItinerary?.assignedMemberIds) {
      // If it's a divergent itinerary, only show assigned members in the list
      return matchesSearch && currentItinerary.assignedMemberIds.includes(m.id);
    }
    return matchesSearch;
  });

  const handleCopyAllNames = () => {
    if (filteredMembers.length === 0) return;
    const names = filteredMembers.map(m => m.name).join(', ');
    navigator.clipboard.writeText(names);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getDivergentItinerary = (memberId: string) => {
    const now = new Date();
    return validItineraries.find(it => {
      if (it.isMain || !it.assignedMemberIds?.includes(memberId)) return false;
      
      let start: Date;
      let end: Date | null = null;

      if (it.dayIndex !== undefined && tripSettings) {
        const base = parseISO(tripSettings.startDate);
        start = addDays(base, it.dayIndex);
        const sTime = it.startTime?.toDate?.() || new Date(it.startTime);
        start.setHours(sTime.getHours(), sTime.getMinutes(), 0, 0);

        if (it.endTime) {
          end = addDays(base, it.dayIndex);
          const eTime = it.endTime?.toDate?.() || new Date(it.endTime);
          end.setHours(eTime.getHours(), eTime.getMinutes(), 0, 0);
        }
      } else {
        start = it.startTime?.toDate?.() || new Date(it.startTime);
        end = it.endTime?.toDate?.() || new Date(it.endTime);
      }

      if (start > now) return false;
      
      if (!end) {
        const threeHoursLater = new Date(start.getTime() + 3 * 60 * 60 * 1000);
        return now <= threeHoursLater;
      }
      return now <= end;
    });
  };

  const getParticipantCount = (it: Itinerary) => {
    if (!it.isMain) return it.assignedMemberIds?.length || 0;
    
    // For Main itineraries, count members who should be there on that day
    return members.filter(m => {
      const tags = m.tags || [];
      const is3Day = tags.some(tag => tag.toLowerCase().includes('3天') || tag.toLowerCase().includes('3d'));
      const is9Day = tags.some(tag => tag.toLowerCase().includes('9天') || tag.toLowerCase().includes('9d'));
      const is5Day = !is3Day && !is9Day;
      
      const dayIdx = it.dayIndex;
      if (dayIdx === undefined) return true;
      
      const isDay6Plus = dayIdx >= 5;
      const isDay4Plus = dayIdx >= 3;
      
      if (is5Day && isDay6Plus) return false;
      if (is3Day && isDay4Plus) return false;

      // Filter out excluded members for Main itineraries
      if (it.excludedMemberIds?.includes(m.id)) return false;
      
      return true;
    }).length;
  };

  return (
    <div className="space-y-6 flex flex-col h-full lg:max-h-[calc(100vh-120px)]">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="flex-shrink-0 mb-2 xl:mb-0">
          <h2 className="text-2xl font-serif font-light leading-tight">點名系統</h2>
          <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest">Attendance System</p>
        </div>

        {/* Day Tabs */}
        {tripDates.length > 0 && (
          <div className="flex-1 min-w-0 flex gap-2 overflow-x-auto px-1 py-2 no-scrollbar lg:justify-start">
            {tripDates.map((dateStr, idx) => {
              const count = validItineraries.filter(it => {
                const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
                return format(startObj, 'yyyy-MM-dd') === dateStr && it.isMain;
              }).length;

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    setActiveDate(dateStr);
                    setSelectedItineraryId('');
                  }}
                  className={cn(
                    "flex-shrink-0 px-4 py-2 border rounded-2xl text-sm font-medium transition-all shadow-sm flex items-center gap-2",
                    activeDate === dateStr 
                      ? "bg-stone-900 text-white border-stone-900 scale-105" 
                      : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                  )}
                >
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[9px] uppercase font-bold tracking-wider opacity-60">D{idx + 1}</span>
                    <span className="font-bold text-xs">{safeFormat(parseISO(dateStr), 'yyyy/MM/dd')}</span>
                  </div>
                  
                  <div className={cn(
                    "px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                    activeDate === dateStr ? "bg-white/20 text-white" : "bg-stone-100 text-stone-400"
                  )}>
                    {count}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {tripSettings ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Sidebar: Day's Itineraries */}
          <div className="w-full lg:w-72 bg-white border border-stone-200 rounded-3xl p-6 shadow-sm overflow-y-auto min-h-[200px] lg:min-h-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-4">{activeDate.replace(/-/g, '/')} 行程與脫隊清單</h3>
            <div className="space-y-4 px-1 py-1">
              {activeDayItineraries.length > 0 ? (
                activeDayItineraries.map(it => (
                  <button
                    key={it.id}
                    onClick={() => setSelectedItineraryId(selectedItineraryId === it.id ? '' : it.id)}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all group",
                      selectedItineraryId === it.id 
                        ? "bg-stone-900 text-white border-stone-900 shadow-md scale-[1.02]" 
                        : "bg-white text-stone-600 border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-bold opacity-60">
                        {it.startTime && format(it.startTime.toDate(), 'HH:mm')}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="px-1.5 py-0.5 bg-stone-100/50 text-stone-500 rounded text-[8px] font-bold">
                          {getParticipantCount(it)}人
                        </div>
                        {!it.isMain && (
                          <div className="px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded text-[8px] font-bold uppercase">脫隊</div>
                        )}
                      </div>
                    </div>
                    <div className="font-medium text-sm line-clamp-2">{it.title}</div>
                  </button>
                ))
              ) : (
                <div className="text-center py-10 opacity-30">
                  <History className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-xs">本日無主要行程</p>
                </div>
              )}
            </div>
          </div>

          {/* Main Area: Stats & Member List */}
          <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-hidden">
            {selectedItineraryId ? (
              <>
                {/* Top Stats Bar */}
                <div className="bg-white border border-stone-200 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="bg-stone-100 p-3 rounded-2xl">
                      <UserCheck className="w-5 h-5 text-stone-600" />
                    </div>
                    <div>
                      <h4 className="font-serif text-lg leading-tight">{currentItinerary?.title}</h4>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest leading-none mt-1">
                        {latestRollCall?.timestamp ? `最後更新: ${format(latestRollCall.timestamp.toDate(), 'HH:mm:ss')}` : '尚未點名'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">參與人數</span>
                      <span className="text-xl font-bold text-stone-900 leading-none mt-1">
                        {currentItinerary ? getParticipantCount(currentItinerary) : 0}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-stone-100 hidden sm:block" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">已出席</span>
                      <span className="text-xl font-bold text-green-600 leading-none mt-1">
                        {Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'present').length}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-stone-100 hidden sm:block" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">未到席</span>
                      <span className="text-xl font-bold text-red-500 leading-none mt-1">
                        {Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'absent').length}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-stone-100 hidden sm:block" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-tighter">脫隊中</span>
                      <span className="text-xl font-bold text-purple-500 leading-none mt-1">
                        {Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'divergent').length}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Member List Section */}
                <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                      <input 
                        type="text" 
                        placeholder="搜尋團員姓名..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all shadow-sm"
                      />
                    </div>
                    <button 
                      onClick={handleCopyAllNames}
                      disabled={filteredMembers.length === 0}
                      className={cn(
                        "px-4 py-3 bg-white border border-stone-200 rounded-2xl text-stone-600 flex items-center gap-2 transition-all duration-200 ease-out shrink-0 font-medium text-sm shadow-sm",
                        "hover:scale-[1.02] hover:shadow-[0_0_5px_rgba(0,0,0,0.1)]",
                        "active:brightness-110 active:border-[#00F3FF]",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none",
                        copySuccess && "text-green-600 border-green-200 shadow-none scale-100"
                      )}
                    >
                      {copySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copySuccess ? '已複製' : '複製名單'}</span>
                    </button>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden flex-1 flex flex-col">
                    {/* Dining Summary Section */}
                    {currentItinerary?.type === 'dining' && (
                      <div className="bg-amber-50/50 border-b border-stone-100 p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                            <Users className="w-4 h-4" />
                          </div>
                          <h5 className="text-sm font-bold text-stone-900 tracking-tight">領隊用餐統計 (Dietary Summary)</h5>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {(() => {
                            const counts: Record<string, number> = {};
                            filteredMembers.forEach(m => {
                              const habit = m.dietaryHabits || '一般 (葷食)';
                              counts[habit] = (counts[habit] || 0) + 1;
                            });
                            return Object.entries(counts).map(([habit, count]) => (
                              <div key={habit} className="bg-white border border-stone-200 px-3 py-1.5 rounded-xl shadow-sm flex items-center gap-2">
                                <span className="text-xs font-medium text-stone-600">{habit}</span>
                                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">{count}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
                      {(() => {
                        const isMainstream = (h?: string) => !h || h.includes('葷') || h === '一般' || h === 'None';
                        
                        const sortedMembers = [...filteredMembers].sort((a, b) => {
                          if (currentItinerary?.type !== 'dining') return 0;
                          const aSpecial = !isMainstream(a.dietaryHabits);
                          const bSpecial = !isMainstream(b.dietaryHabits);
                          if (aSpecial && !bSpecial) return -1;
                          if (!aSpecial && bSpecial) return 1;
                          return 0;
                        });

                        return sortedMembers.map((member) => {
                          const status = latestRollCall?.statusMap[member.id] || 'absent';
                          const divergentIt = getDivergentItinerary(member.id);
                          const isSpecialDiet = currentItinerary?.type === 'dining' && !isMainstream(member.dietaryHabits);

                          return (
                            <div 
                              key={member.id} 
                              className={cn(
                                "p-4 flex items-center justify-between hover:bg-stone-50 transition-colors",
                                isSpecialDiet && "bg-amber-50/30 border-l-4 border-amber-400"
                              )}
                            >
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                                  status === 'present' ? "bg-green-100 text-green-700 font-bold" :
                                  status === 'divergent' ? "bg-purple-100 text-purple-700" :
                                  "bg-stone-100 text-stone-600",
                                  isSpecialDiet && "ring-2 ring-amber-400 ring-offset-2"
                                )}>
                                  {member.name.charAt(0)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium text-stone-900">{member.name}</span>
                                    {isSpecialDiet && (
                                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold border border-amber-200">
                                        🍖 {member.dietaryHabits}
                                      </span>
                                    )}
                                  </div>
                                  {divergentIt && (
                                    <div className="flex items-center gap-1 text-[10px] text-purple-600 font-bold uppercase tracking-wider mt-1">
                                      <ArrowRight className="w-3 h-3" />
                                      參與脫隊: {divergentIt.title}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Selection Buttons */}
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'present')}
                                  className={cn(
                                    "p-2 rounded-xl transition-all",
                                    status === 'present' ? "bg-green-500 text-white shadow-md scale-110" : "text-stone-300 hover:bg-stone-100"
                                  )}
                                >
                                  <CheckCircle2 className="w-6 h-6" />
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'absent')}
                                  className={cn(
                                    "p-2 rounded-xl transition-all",
                                    status === 'absent' ? "bg-red-500 text-white shadow-md scale-110" : "text-stone-300 hover:bg-stone-100"
                                  )}
                                >
                                  <XCircle className="w-6 h-6" />
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'divergent')}
                                  className={cn(
                                    "p-2 rounded-xl transition-all",
                                    status === 'divergent' ? "bg-purple-500 text-white shadow-md scale-110" : "text-stone-300 hover:bg-stone-100"
                                  )}
                                >
                                  <HelpCircle className="w-6 h-6" />
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                      {filteredMembers.length === 0 && (
                        <div className="p-12 text-center text-stone-400">
                          找不到相關團員
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 bg-white border border-stone-200 rounded-3xl p-20 text-center shadow-sm flex flex-col items-center justify-center">
                <CheckCircle2 className="w-16 h-16 mb-6 text-stone-200" />
                <h3 className="text-xl font-serif text-stone-900 mb-2">請從左側選擇行程</h3>
                <p className="text-stone-500 max-w-sm mx-auto">點選左側行程清單中的項目，即可開始進行點名作業。</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-3xl p-20 text-center shadow-sm">
          <Calendar className="w-16 h-16 mx-auto mb-6 text-stone-200" />
          <h3 className="text-xl font-serif text-stone-900 mb-2">尚未設定旅遊日期</h3>
          <p className="text-stone-500 max-w-sm mx-auto">請先到「行程規劃」頁面設定旅遊起始與結束日期。</p>
        </div>
      )}
    </div>
  );
}
