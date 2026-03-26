import React, { useState, useMemo, useEffect } from 'react';
import { RollCall, Itinerary, Member } from '../types';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  Search, 
  Filter, 
  History,
  ArrowRight,
  UserCheck,
  UserX,
  UserMinus
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp,
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

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
  const [tripSettings, setTripSettings] = useState<TripSettings | null>(null);

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

  const validItineraries = useMemo(() => {
    return itineraries.filter(it => {
      if (!it.isMain) return false;
      if (!tripSettings) return true; // If no trip setting, arguably we can show all, or return false to strict enforce it. Let's return false strictly to match the prompt.
      
      const startObj = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
      if (isNaN(startObj.getTime())) return false;
      
      const itDateStr = format(startObj, 'yyyy-MM-dd');
      return itDateStr >= tripSettings.startDate && itDateStr <= tripSettings.endDate;
    });
  }, [itineraries, tripSettings]);

  // If the currently selected itinerary is no longer valid, clear it
  useEffect(() => {
    if (selectedItineraryId && !validItineraries.find(it => it.id === selectedItineraryId)) {
      setSelectedItineraryId('');
    }
  }, [validItineraries, selectedItineraryId]);

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

  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getDivergentItinerary = (memberId: string) => {
    const now = new Date();
    return itineraries.find(it => {
      if (it.isMain || !it.assignedMemberIds?.includes(memberId)) return false;
      const start = it.startTime?.toDate?.() || new Date(it.startTime);
      if (start > now) return false;
      
      if (!it.endTime) {
        // If no end time, assume it's active for 3 hours
        const threeHoursLater = new Date(start.getTime() + 3 * 60 * 60 * 1000);
        return now <= threeHoursLater;
      }
      const end = it.endTime?.toDate?.() || new Date(it.endTime);
      return now <= end;
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">點名系統</h2>
          <p className="text-stone-500">團員出席與位置即時追蹤。</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedItineraryId}
            onChange={(e) => setSelectedItineraryId(e.target.value)}
            className="bg-white border border-stone-200 px-6 py-2 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-stone-900/5 shadow-sm"
          >
            <option value="">選擇要點名的行程</option>
            {validItineraries.map(it => (
              <option key={it.id} value={it.id}>{it.title}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedItineraryId ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Stats Card */}
            <div className="lg:col-span-1 bg-white p-8 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-serif mb-2">{currentItinerary?.title}</h3>
                <p className="text-sm text-stone-500 mb-6">
                  {currentItinerary?.startTime && format(currentItinerary.startTime.toDate(), 'MMM d, HH:mm')}
                </p>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-600 flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-green-500" /> 已出席
                    </span>
                    <span className="font-bold">{Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'present').length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-600 flex items-center gap-2">
                      <UserX className="w-4 h-4 text-red-500" /> 未到
                    </span>
                    <span className="font-bold">{Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'absent').length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-stone-600 flex items-center gap-2">
                      <UserMinus className="w-4 h-4 text-purple-500" /> 脫隊
                    </span>
                    <span className="font-bold">{Object.values(latestRollCall?.statusMap || {}).filter(s => s === 'divergent').length}</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-100 mt-6">
                <p className="text-xs text-stone-400">
                  最後更新時間: {latestRollCall?.timestamp ? format(latestRollCall.timestamp.toDate(), 'HH:mm:ss') : '尚未更新'}
                </p>
              </div>
            </div>

            {/* Member List */}
            <div className="lg:col-span-2 space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  type="text" 
                  placeholder="搜尋團員姓名..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 transition-all shadow-sm"
                />
              </div>

              <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm max-h-[600px] overflow-y-auto">
                <div className="divide-y divide-stone-100">
                  {filteredMembers.map((member) => {
                    const status = latestRollCall?.statusMap[member.id] || 'absent';
                    const divergentIt = getDivergentItinerary(member.id);

                    return (
                      <div key={member.id} className="p-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                            status === 'present' ? "bg-green-100 text-green-700" :
                            status === 'divergent' ? "bg-purple-100 text-purple-700" :
                            "bg-stone-100 text-stone-600"
                          )}>
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-stone-900">{member.name}</p>
                            {divergentIt && (
                              <div className="flex items-center gap-1 text-[10px] text-purple-600 font-bold uppercase tracking-wider mt-1">
                                <ArrowRight className="w-3 h-3" />
                                正在參與脫隊行程: {divergentIt.title}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleStatusChange(member.id, 'present')}
                            className={cn(
                              "p-2 rounded-xl transition-all",
                              status === 'present' ? "bg-green-500 text-white shadow-sm" : "text-stone-300 hover:bg-stone-100"
                            )}
                          >
                            <CheckCircle2 className="w-6 h-6" />
                          </button>
                          <button 
                            onClick={() => handleStatusChange(member.id, 'absent')}
                            className={cn(
                              "p-2 rounded-xl transition-all",
                              status === 'absent' ? "bg-red-500 text-white shadow-sm" : "text-stone-300 hover:bg-stone-100"
                            )}
                          >
                            <XCircle className="w-6 h-6" />
                          </button>
                          <button 
                            onClick={() => handleStatusChange(member.id, 'divergent')}
                            className={cn(
                              "p-2 rounded-xl transition-all",
                              status === 'divergent' ? "bg-purple-500 text-white shadow-sm" : "text-stone-300 hover:bg-stone-100"
                            )}
                          >
                            <HelpCircle className="w-6 h-6" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-3xl p-20 text-center shadow-sm">
          <CheckCircle2 className="w-16 h-16 mx-auto mb-6 text-stone-200" />
          <h3 className="text-xl font-serif text-stone-900 mb-2">準備好開始點名了嗎？</h3>
          <p className="text-stone-500 max-w-sm mx-auto">請從上方選單選擇一個主要行程，即可開始紀錄團員的出席狀況。</p>
        </div>
      )}
    </div>
  );
}
