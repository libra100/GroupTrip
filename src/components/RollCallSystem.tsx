import React, { useState, useMemo, useEffect } from 'react';
import { RollCall, Itinerary, Member, TripSettings, DailyAbsence } from '../types';
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
  Check,
  RotateCcw
} from 'lucide-react';
import { collection, addDoc, updateDoc, doc, Timestamp, setDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';
import DailyAbsenceManager from './DailyAbsenceManager';

const safeFormat = (date: Date | null | number | undefined, formatStr: string) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, formatStr);
};

interface RollCallSystemProps {
  rollCalls: RollCall[];
  itineraries: Itinerary[];
  members: Member[];
  tripSettings: TripSettings | null;
}

export default function RollCallSystem({ 
  rollCalls, 
  itineraries, 
  members,
  tripSettings
}: RollCallSystemProps) {
  const [selectedItineraryId, setSelectedItineraryId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeDate, setActiveDate] = useState<string>(safeFormat(new Date(), 'yyyy-MM-dd'));
  const [isItineraryListOpen, setIsItineraryListOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Daily absences are now derived from tripSettings
  const dailyAbsenceIds = useMemo(() => {
    if (!activeDate || !tripSettings?.dailyAbsences) return [];
    return tripSettings.dailyAbsences[activeDate] || [];
  }, [activeDate, tripSettings]);

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
      // Use startTime date for validation if available
      if (it.startTime) {
        const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
        if (isNaN(startObj.getTime())) return false;
        const itDateStr = format(startObj, 'yyyy-MM-dd');
        return tripDates.includes(itDateStr);
      }
      
      // Fallback for legacy dayIndex
      if (it.dayIndex !== undefined) {
        return it.dayIndex >= 0 && it.dayIndex < tripDates.length;
      }
      return false;
    });
  }, [itineraries, tripSettings, tripDates]);

  const activeDayItineraries = useMemo(() => {
    const dayIts = validItineraries.filter(it => {
      if (it.startTime) {
        const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
        return format(startObj, 'yyyy-MM-dd') === activeDate;
      }
      
      const activeIdx = tripDates.indexOf(activeDate);
      if (it.dayIndex !== undefined) return it.dayIndex === activeIdx;
      return false;
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
    return rollCalls.find(rc => rc.itineraryId === selectedItineraryId) || null;
  }, [rollCalls, selectedItineraryId]);

  const handleStatusChange = async (memberId: string, status: 'present' | 'absent' | 'divergent') => {
    if (!selectedItineraryId) return;

    const rollCallId = `rc_${selectedItineraryId}`.replace(/\//g, '_');
    try {
      if (latestRollCall) {
        await updateDoc(doc(db, 'rollcalls', rollCallId), {
          [`statusMap.${memberId}`]: status
        });
      } else {
        await setDoc(doc(db, 'rollcalls', rollCallId), {
          id: rollCallId,
          itineraryId: selectedItineraryId,
          timestamp: Timestamp.now(),
          statusMap: { [memberId]: status }
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `rollcalls/${rollCallId}`);
    }
  };

  const filteredMembers = members.filter(m => {
    const matchesSearch = 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (Array.isArray(m.tags) 
        ? m.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        : (typeof m.tags === 'string' && (m.tags as string).toLowerCase().includes(searchTerm.toLowerCase()))
      );
    
    // Global Daily Absence Filter
    if (dailyAbsenceIds.includes(m.id)) return false;

    if (currentItinerary?.isMain) {
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

  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showResetConfirm) {
      timer = setTimeout(() => setShowResetConfirm(false), 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showResetConfirm]);

  const handleResetRollCall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedItineraryId) return;

    if (!showResetConfirm) {
      setShowResetConfirm(true);
      return;
    }

    const rollCallId = (latestRollCall?.id || `rc_${selectedItineraryId}`).replace(/\//g, '_');
    try {
      await setDoc(doc(db, 'rollcalls', rollCallId), {
        itineraryId: selectedItineraryId,
        statusMap: {},
        timestamp: Timestamp.now()
      }, { merge: true });
      
      setShowResetConfirm(false);
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2000);
    } catch (error) {
      console.error("Reset Error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `rollcalls/${rollCallId}`);
    }
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
      // Global Daily Absence Filter
      if (dailyAbsenceIds.includes(m.id)) return false;

      // Filter out excluded members for Main itineraries
      if (it.excludedMemberIds?.includes(m.id)) return false;
      
      return true;
    }).length;
  };

  return (
    <div className="space-y-6 flex flex-col h-full lg:max-h-[calc(100vh-120px)]">
      <div className="flex flex-row items-center justify-between gap-4 border-b border-stone-100 pb-4 overflow-hidden">
        <div className="flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-serif font-black text-stone-900 leading-tight">點名系統</h2>
          <p className="hidden sm:block text-stone-400 text-[10px] font-bold uppercase tracking-widest">Attendance System</p>
        </div>

        {/* Day Tabs - Side by side with title even on mobile */}
        {tripDates.length > 0 && (
          <div className="flex-1 min-w-0 flex gap-1.5 sm:gap-2 overflow-x-auto px-1 py-1 no-scrollbar justify-start">
            {tripDates.map((dateStr, idx) => {
              const count = validItineraries.filter(it => {
                const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
                return format(startObj, 'yyyy-MM-dd') === dateStr && it.isMain;
              }).length;

              const isSelected = activeDate === dateStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    setActiveDate(dateStr);
                    const dayFirstItinerary = validItineraries.find(it => {
                      if (!it.startTime) return false;
                      const d = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
                      if (isNaN(d.getTime())) return false;
                      return format(d, 'yyyy-MM-dd') === dateStr;
                    });
                    if (dayFirstItinerary) setSelectedItineraryId(dayFirstItinerary.id);
                    else setSelectedItineraryId('');
                  }}
                  className={cn(
                    "flex-shrink-0 flex flex-col items-center px-4 py-3 rounded-2xl border-2 transition-all min-w-[70px]",
                    isSelected
                      ? "bg-stone-900 border-stone-900 text-white shadow-lg scale-105"
                      : "bg-white border-stone-100 text-stone-400 hover:border-stone-200"
                  )}
                >
                  <span className="text-[10px] font-black uppercase opacity-60 mb-0.5">
                    {(() => {
                      const officialStart = tripSettings?.officialStartDate ? parseISO(tripSettings.officialStartDate) : parseISO(tripSettings?.startDate || '');
                      const current = parseISO(dateStr);
                      const diff = differenceInDays(current, officialStart);
                      const dayNum = diff + 1;
                      return `D${dayNum}`;
                    })()}
                  </span>
                  <span className="text-sm font-black tracking-tight">{format(parseISO(dateStr), 'MM/dd')}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Mobile Itinerary Toggle - Moved out of the title row to avoid pushing elements */}
      <button 
        onClick={() => setIsItineraryListOpen(!isItineraryListOpen)}
        className="lg:hidden w-full flex items-center justify-between p-4 bg-white border border-stone-200 rounded-[2rem] shadow-sm text-stone-600 font-medium active:scale-[0.98] transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-stone-100 rounded-xl text-stone-400">
            <Calendar className="w-5 h-5" />
          </div>
          <span className="font-black text-sm">{currentItinerary ? currentItinerary.title : '選擇今日行程...'}</span>
        </div>
        <ArrowRight className={cn("w-5 h-5 transition-transform text-stone-300", isItineraryListOpen ? "rotate-90" : "")} />
      </button>

      {tripSettings ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
          {/* Sidebar: Day's Itineraries */}
          <div className={cn(
            "w-full lg:w-72 bg-white border border-stone-200 rounded-3xl p-6 shadow-sm overflow-y-auto min-h-[200px] lg:min-h-0",
            "lg:block",
            isItineraryListOpen ? "block" : "hidden"
          )}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 mb-4">{activeDate.replace(/-/g, '/')} 行程與脫隊清單</h3>
            <div className="space-y-4 px-1 py-1">
              {activeDayItineraries.length > 0 ? (
                activeDayItineraries.map(it => (
                  <button
                    key={it.id}
                    onClick={() => {
                      setSelectedItineraryId(selectedItineraryId === it.id ? '' : it.id);
                      setIsItineraryListOpen(false);
                      setShowResetConfirm(false);
                    }}
                    className={cn(
                      "w-full text-left p-4 rounded-2xl border transition-all group",
                      selectedItineraryId === it.id 
                        ? "bg-stone-900 text-white border-stone-900 shadow-md scale-[1.02]" 
                        : "bg-white text-stone-600 border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] font-bold opacity-60">
                        {it.startTime && format(it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime), 'HH:mm')}
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

          <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-hidden">
            {selectedItineraryId ? (
              <>
                {/* Itinerary Dashboard Header */}
                <div className="bg-white border border-stone-200 rounded-[2rem] p-4 sm:p-6 shadow-sm flex flex-col xl:flex-row xl:items-center gap-4 xl:gap-6">
                  {/* Title Section */}
                  <div className="flex items-center gap-4 min-w-0 flex-shrink-0 xl:flex-1">
                    <div className="bg-stone-900 p-3 rounded-2xl flex-shrink-0 text-white shadow-lg">
                      <UserCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-serif text-lg font-black text-stone-900 leading-tight truncate">{currentItinerary?.title}</h4>
                      <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest leading-none mt-1">
                        {latestRollCall?.timestamp ? `最後更新: ${safeFormat(latestRollCall.timestamp instanceof Timestamp ? latestRollCall.timestamp.toDate() : latestRollCall.timestamp, 'HH:mm:ss')}` : '尚未開始點名'}
                      </p>
                    </div>
                  </div>

                  {/* Search Section */}
                  <div className="relative w-full xl:max-w-[180px] xl:order-none order-last sm:order-none">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input 
                      type="text" 
                      placeholder="搜尋姓名..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/30 transition-all text-sm font-bold text-stone-900"
                    />
                  </div>

                  {/* Stats & Actions Section */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto shrink-0">
                    <div className="flex flex-row items-center gap-3 sm:gap-4 bg-stone-50 p-2 sm:p-3 rounded-2xl border border-stone-100 w-full sm:w-auto justify-center">
                      <div className="flex flex-col items-center px-1 sm:px-2">
                        <span className="text-[8px] font-black text-stone-400 uppercase tracking-tighter">參與</span>
                        <span className="text-base font-black text-stone-900 leading-none mt-0.5">{currentItinerary ? getParticipantCount(currentItinerary) : 0}</span>
                      </div>
                      <div className="w-px h-6 bg-stone-200" />
                      <div className="flex flex-col items-center px-1 sm:px-2">
                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">已到</span>
                        <span className="text-base font-black text-emerald-600 leading-none mt-0.5">{Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'present').length}</span>
                      </div>
                      <div className="flex flex-col items-center px-1 sm:px-2">
                        <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter">未到</span>
                        <span className="text-base font-black text-rose-600 leading-none mt-0.5">{Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'absent').length}</span>
                      </div>
                      <div className="flex flex-col items-center px-1 sm:px-2">
                        <span className="text-[8px] font-black text-purple-500 uppercase tracking-tighter">脫隊</span>
                        <span className="text-base font-black text-purple-600 leading-none mt-0.5">{Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'divergent').length}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button 
                        onClick={handleCopyAllNames}
                        disabled={filteredMembers.length === 0}
                        className={cn(
                          "flex-1 sm:flex-none px-3 py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5",
                          copySuccess ? "bg-emerald-500 text-white border-emerald-600 shadow-md" : "bg-white text-stone-600 border-stone-200 hover:border-stone-900"
                        )}
                      >
                        {copySuccess ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copySuccess ? '已複製' : '複製'}
                      </button>

                      <button 
                        onClick={handleResetRollCall}
                        disabled={!selectedItineraryId}
                        className={cn(
                          "flex-1 sm:flex-none px-3 py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-1.5",
                          resetSuccess ? "bg-emerald-500 text-white border-emerald-600 shadow-md" : 
                          showResetConfirm ? "bg-rose-500 text-white border-rose-600 animate-pulse shadow-lg" : 
                          "bg-white text-rose-500 border-stone-200 hover:bg-rose-50",
                          "disabled:opacity-30"
                        )}
                      >
                        {resetSuccess ? <Check className="w-3 h-3" /> : <RotateCcw className={cn("w-3 h-3", showResetConfirm && "animate-spin")} />}
                        {resetSuccess ? '已重設' : showResetConfirm ? '確定？' : '重設'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Member List Section */}
                <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
                  <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden flex-1 flex flex-col">
                    {/* Dining Summary Section */}
                    {currentItinerary?.type === 'dining' && (
                      <div className="bg-amber-50/50 border-b border-stone-100 p-4 sm:p-6">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                              <Users className="w-4 h-4" />
                            </div>
                            <h5 className="text-sm font-bold text-stone-900 tracking-tight whitespace-nowrap">領隊用餐統計 (Dietary Summary)</h5>
                          </div>
                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            {(() => {
                              const counts: Record<string, number> = {};
                              filteredMembers.forEach(m => {
                                const habit = m.dietaryHabits || '一般 (葷食)';
                                counts[habit] = (counts[habit] || 0) + 1;
                              });
                              return Object.entries(counts).map(([habit, count]) => (
                                <div key={habit} className="bg-white border border-amber-100 px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-stone-600">{habit}</span>
                                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-md">{count}</span>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex-1 overflow-y-auto">
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

                        const renderMemberTile = (member: Member) => {
                          const status = latestRollCall?.statusMap[member.id] || 'absent';
                          const isSpecialDiet = currentItinerary?.type === 'dining' && !isMainstream(member.dietaryHabits);

                          return (
                            <div 
                              key={member.id} 
                              className={cn(
                                "p-3 rounded-2xl border-2 transition-all duration-300 flex flex-col gap-3 group relative overflow-hidden",
                                status === 'present' ? "bg-green-50 border-green-200" :
                                status === 'divergent' ? "bg-purple-50 border-purple-200" :
                                "bg-white border-stone-100 hover:border-stone-200 shadow-sm hover:shadow-md",
                                isSpecialDiet && "ring-2 ring-amber-400 ring-offset-2"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black transition-all",
                                  status === 'present' ? "bg-green-500 text-white" :
                                  status === 'divergent' ? "bg-purple-500 text-white" :
                                  "bg-stone-100 text-stone-400"
                                )}>
                                  {member.name.charAt(0)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="font-black text-sm text-stone-900 truncate">{member.name}</span>
                                    {isSpecialDiet && <span className="text-[10px]" title={member.dietaryHabits}>🍖</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-1.5 mt-auto">
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'present')}
                                  className={cn(
                                    "flex flex-col items-center justify-center py-2 rounded-xl transition-all gap-1 border",
                                    status === 'present' 
                                      ? "bg-green-500 text-white border-green-600 shadow-lg shadow-green-200 scale-95" 
                                      : "bg-white text-stone-300 border-stone-100 hover:border-green-200 hover:text-green-500"
                                  )}
                                >
                                  <CheckCircle2 className="w-5 h-5" />
                                  <span className="text-[8px] font-black uppercase">出席</span>
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'absent')}
                                  className={cn(
                                    "flex flex-col items-center justify-center py-2 rounded-xl transition-all gap-1 border",
                                    status === 'absent' 
                                      ? "bg-red-500 text-white border-red-600 shadow-lg shadow-red-200 scale-95" 
                                      : "bg-white text-stone-300 border-stone-100 hover:border-red-200 hover:text-red-500"
                                  )}
                                >
                                  <XCircle className="w-5 h-5" />
                                  <span className="text-[8px] font-black uppercase">未到</span>
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'divergent')}
                                  className={cn(
                                    "flex flex-col items-center justify-center py-2 rounded-xl transition-all gap-1 border",
                                    status === 'divergent' 
                                      ? "bg-purple-500 text-white border-purple-600 shadow-lg shadow-purple-200 scale-95" 
                                      : "bg-white text-stone-300 border-stone-100 hover:border-purple-200 hover:text-purple-500"
                                  )}
                                >
                                  <HelpCircle className="w-5 h-5" />
                                  <span className="text-[8px] font-black uppercase">脫隊</span>
                                </button>
                              </div>
                            </div>
                          );
                        };

                        const renderMemberRow = (member: Member) => {
                          const status = latestRollCall?.statusMap[member.id] || 'absent';
                          const isSpecialDiet = currentItinerary?.type === 'dining' && !isMainstream(member.dietaryHabits);

                          return (
                            <div 
                              key={member.id} 
                              className={cn(
                                "p-3 flex items-center justify-between gap-3 hover:bg-stone-50 transition-colors border-b border-stone-100",
                                isSpecialDiet && "bg-amber-50/30 border-l-4 border-amber-400"
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold",
                                  status === 'present' ? "bg-green-500 text-white" :
                                  status === 'divergent' ? "bg-purple-500 text-white" :
                                  "bg-stone-100 text-stone-400"
                                )}>
                                  {member.name.charAt(0)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <span className="font-bold text-xs text-stone-900 truncate">{member.name}</span>
                                    {isSpecialDiet && <span className="text-[9px]">🍖</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'present')}
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                    status === 'present' ? "bg-green-500 text-white shadow-sm" : "bg-white text-stone-300 border border-stone-100 hover:bg-stone-50"
                                  )}
                                >
                                  <CheckCircle2 className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'absent')}
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                    status === 'absent' ? "bg-red-500 text-white shadow-sm" : "bg-white text-stone-300 border border-stone-100 hover:bg-stone-50"
                                  )}
                                >
                                  <XCircle className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(member.id, 'divergent')}
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                    status === 'divergent' ? "bg-purple-500 text-white shadow-sm" : "bg-white text-stone-300 border border-stone-100 hover:bg-stone-50"
                                  )}
                                >
                                  <HelpCircle className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          );
                        };

                        const useTiles = sortedMembers.length <= 12;

                        if (currentItinerary?.isMultiVehicle) {
                          const carA = sortedMembers.filter(m => {
                            const car = currentItinerary.vehicleAssignments?.[m.id] || m.carNumber;
                            return !car || car === 'A' || car === 'A車' || car === '1';
                          });
                          const carB = sortedMembers.filter(m => {
                            const car = currentItinerary.vehicleAssignments?.[m.id] || m.carNumber;
                            return car === 'B' || car === 'B車' || car === '2';
                          });

                          return (
                            <div className="flex flex-col gap-6 p-4">
                              {carA.length > 0 && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 px-1">
                                    <div className="w-1.5 h-4 bg-amber-500 rounded-full" />
                                    <span className="text-xs font-black tracking-widest text-stone-500 uppercase">A 車名單 ({carA.length})</span>
                                  </div>
                                  <div className={cn(
                                    useTiles 
                                      ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                                      : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0 border border-stone-100 rounded-2xl bg-white overflow-hidden"
                                  )}>
                                    {carA.map(useTiles ? renderMemberTile : renderMemberRow)}
                                  </div>
                                </div>
                              )}
                              {carB.length > 0 && (
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2 px-1">
                                    <div className="w-1.5 h-4 bg-blue-500 rounded-full" />
                                    <span className="text-xs font-black tracking-widest text-stone-500 uppercase">B 車名單 ({carB.length})</span>
                                  </div>
                                  <div className={cn(
                                    useTiles 
                                      ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                                      : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0 border border-stone-100 rounded-2xl bg-white overflow-hidden"
                                  )}>
                                    {carB.map(useTiles ? renderMemberTile : renderMemberRow)}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (currentItinerary?.isMultiRoom) {
                          const roomGroups: Record<string, Member[]> = {};
                          sortedMembers.forEach(m => {
                            const r = currentItinerary.roomAssignments?.[m.id] || '未定';
                            if (!roomGroups[r]) roomGroups[r] = [];
                            roomGroups[r].push(m);
                          });

                          const sortedRooms = Object.keys(roomGroups).sort();

                          return (
                            <div className="flex flex-col gap-8 p-4">
                              {sortedRooms.map(roomNum => (
                                <div key={roomNum} className="space-y-3">
                                  <div className="flex items-center gap-2 px-1">
                                    <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                                    <span className="text-xs font-black tracking-widest text-stone-500 uppercase">房號 {roomNum} ({roomGroups[roomNum].length})</span>
                                  </div>
                                  <div className={cn(
                                    useTiles 
                                      ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                                      : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0 border border-stone-100 rounded-2xl bg-white overflow-hidden"
                                  )}>
                                    {roomGroups[roomNum].map(useTiles ? renderMemberTile : renderMemberRow)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        return (
                          <div className={cn(
                            "p-4",
                            useTiles 
                              ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                              : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0"
                          )}>
                            {sortedMembers.map(useTiles ? renderMemberTile : renderMemberRow)}
                          </div>
                        );
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
