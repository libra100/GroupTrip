import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Member, DailyAbsence, TripSettings } from '../types';
import { 
  X, 
  Search, 
  UserX, 
  Check,
  RotateCcw
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';

interface DailyAbsenceManagerProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  members: Member[];
  tripSettings: TripSettings | null;
}

export default function DailyAbsenceManager({ isOpen, onClose, date, members, tripSettings }: DailyAbsenceManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [optimisticIds, setOptimisticIds] = useState<string[] | null>(null);
  
  const serverAbsences = tripSettings?.dailyAbsences || {};
  const serverIds = serverAbsences[date] || [];
  const absentMemberIds = optimisticIds ?? serverIds;

  // Sync optimistic state with server when the modal opens or data stabilizes
  React.useEffect(() => {
    if (isOpen) {
      setOptimisticIds(null);
    }
  }, [isOpen, date]);

  const handleToggleCategory = async (targetMemberIds: string[]) => {
    if (!tripSettings) return;

    const allAreAbsent = targetMemberIds.every(id => absentMemberIds.includes(id));
    let nextIds: string[];

    if (allAreAbsent) {
      // Clear them all
      nextIds = absentMemberIds.filter(id => !targetMemberIds.includes(id));
    } else {
      // Mark them all as absent
      nextIds = [...new Set([...absentMemberIds, ...targetMemberIds])];
    }

    const nextDailyAbsences = {
      ...(tripSettings.dailyAbsences || {}),
      [date]: nextIds
    };

    setOptimisticIds(nextIds);
    try {
      await updateDoc(doc(db, 'settings', 'tripSettings'), { 
        [`dailyAbsences.${date}`]: nextIds
      });
    } catch (error) {
      console.error("Failed to update category absence:", error);
      setOptimisticIds(null);
      alert("更新失敗。");
    }
  };

  const handleReset = async () => {
    if (!tripSettings) return;
    
    setOptimisticIds([]);
    try {
      await updateDoc(doc(db, 'settings', 'tripSettings'), { 
        [`dailyAbsences.${date}`]: []
      });
    } catch (error) {
      console.error("Failed to clear all absences:", error);
      setOptimisticIds(null);
      alert("清除失敗。");
    }
  };

  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => {
    // Show absent members first
    const aAbs = absentMemberIds.includes(a.id);
    const bAbs = absentMemberIds.includes(b.id);
    if (aAbs && !bAbs) return -1;
    if (!aAbs && bAbs) return 1;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-lg rounded-3xl p-8 shadow-2xl flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-xl text-red-600">
                  <UserX className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-serif">當日缺勤管理</h3>
                  <p className="text-xs text-stone-400 font-bold uppercase tracking-widest mt-1">
                    {date.replace(/-/g, '/')} (Date Absence Manager)
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400 hover:text-stone-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input 
                  type="text" 
                  placeholder="搜尋團員姓名或標籤..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500/10 transition-all shadow-sm focus:border-red-200"
                />
              </div>

              <div className="flex items-center justify-between px-1">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  已標記 {absentMemberIds.length} 位人員缺席
                </div>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-tighter text-red-500 hover:text-red-700 transition-colors bg-white px-2 py-1 rounded-lg border border-red-100 shadow-sm"
                >
                  <RotateCcw className="w-3 h-3" />
                  全部清除
                </motion.button>
              </div>

              {/* Quick Select by Duration */}
              <div className="flex flex-wrap gap-2 p-2.5 bg-stone-50 rounded-2xl border border-stone-100">
                {[3, 5, 9, 0].map(days => {
                  const categoryMembers = members.filter(m => {
                    if (days === 9) return m.tripDays === 9 || m.tripDays === 8;
                    if (days === 0) return m.tripDays && ![3, 5, 8, 9].includes(m.tripDays);
                    return m.tripDays === days;
                  });
                  
                  if (categoryMembers.length === 0) return null;
                  const ids = categoryMembers.map(m => m.id);
                  const allAbsent = ids.every(id => absentMemberIds.includes(id));
                  const label = days === 0 ? '其他' : `${days}天`;
                  
                  return (
                    <button
                      key={days}
                      onClick={() => handleToggleCategory(ids)}
                      className={cn(
                        "flex-1 py-1.5 px-2 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 whitespace-nowrap",
                        allAbsent 
                          ? "bg-red-500 text-white border-red-500 shadow-sm"
                          : "bg-white text-stone-500 border-stone-100 hover:border-red-200"
                      )}
                    >
                      <span>{label}</span>
                      <span className={cn(
                        "px-1 py-0.5 rounded-md text-[9px]",
                        allAbsent ? "bg-white/20 text-white" : "bg-stone-100 text-stone-400"
                      )}>
                        {categoryMembers.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 pr-2 scrollbar-thin">
              {filteredMembers.map(member => {
                const isAbsent = absentMemberIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    onClick={() => handleToggleCategory([member.id])}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 group relative",
                      isAbsent 
                        ? "bg-red-50 border-red-200 shadow-sm" 
                        : "bg-white border-transparent hover:bg-stone-50 hover:border-stone-100"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full border border-stone-50 flex items-center justify-center text-sm font-bold transition-all shadow-sm",
                        isAbsent ? "bg-red-500 text-white border-red-500" : "bg-white text-stone-400"
                      )}>
                        {isAbsent ? <Check className="w-5 h-5" /> : member.name.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          {!isAbsent && (
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              member.tripDays ? (member.tripDays >= 8 ? "bg-purple-400" : "bg-teal-400") : "bg-stone-300"
                            )} />
                          )}
                          <div className={cn(
                            "font-bold text-sm transition-colors",
                            isAbsent ? "text-red-600" : (member.tripDays ? (member.tripDays >= 8 ? "text-purple-700" : "text-teal-700") : "text-stone-600")
                          )}>
                            {member.name}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.tripDays && (
                            <span className={cn(
                              "text-[8px] px-1 py-0.5 rounded font-black uppercase tracking-widest",
                              isAbsent 
                                ? "bg-red-100 text-red-400" 
                                : (member.tripDays >= 8 ? "bg-purple-50 text-purple-400" : "bg-teal-50 text-teal-400")
                            )}>
                              {member.tripDays}D
                            </span>
                          )}
                          {member.tags && member.tags.slice(0, 2).map(tag => (
                            <span key={tag} className="text-[8px] bg-stone-100 text-stone-400 px-1 py-0.5 rounded font-bold uppercase tracking-tighter">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    {isAbsent ? (
                      <div className="px-2 py-0.5 bg-red-500 text-white rounded text-[8px] font-black uppercase tracking-widest animate-pulse">
                        Absent
                      </div>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                         <div className="w-2 h-2 rounded-full bg-red-200" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100">
              <button 
                onClick={onClose}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                完成設定
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
