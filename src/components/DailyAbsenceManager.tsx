import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Member, Group, TripSettings } from '../types';
import { 
  X, 
  Search, 
  UserX, 
  Check,
  RotateCcw,
  Users
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn, getMemberTripDayColor } from '../lib/utils';

interface DailyAbsenceManagerProps {
  isOpen: boolean;
  onClose: () => void;
  date: string;
  members: Member[];
  groups: Group[];
  tripSettings: TripSettings | null;
}

export default function DailyAbsenceManager({ isOpen, onClose, date, members, groups, tripSettings }: DailyAbsenceManagerProps) {
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
            className="bg-white w-full max-w-4xl rounded-3xl p-8 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
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
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input 
                    type="text" 
                    placeholder="搜尋團員姓名或標籤..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-red-500/10 transition-all shadow-sm focus:border-red-200"
                  />
                </div>
                
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">已標記 {absentMemberIds.length} 位</span>
                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">缺席中</span>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleReset}
                    className="p-3 text-red-500 hover:text-white hover:bg-red-500 transition-all bg-red-50 rounded-xl border border-red-100 shadow-sm group"
                    title="全部清除"
                  >
                    <RotateCcw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                  </motion.button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Quick Select by Duration */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest px-1">依天數快速選取</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
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
                            "flex-shrink-0 py-2 px-3 rounded-xl text-[10px] font-bold border transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm",
                            allAbsent 
                              ? "bg-red-500 text-white border-red-500"
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

                {/* Quick Select by Group */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest px-1">依組別快速選取</span>
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                    {groups.map(g => {
                      const categoryMembers = members.filter(m => {
                        const mid = m.groupId?.toString().trim();
                        return mid === g.id || mid === g.name;
                      });
                      const ids = categoryMembers.map(m => m.id);
                      const allAbsent = ids.length > 0 && ids.every(id => absentMemberIds.includes(id));
                      
                      return (
                        <button
                          key={g.id}
                          onClick={() => handleToggleCategory(ids)}
                          className={cn(
                            "flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold transition-all duration-200",
                            allAbsent 
                              ? "bg-stone-900 text-white border-stone-900 shadow-lg scale-105" 
                              : "bg-white text-stone-400 border-stone-100 hover:border-stone-200 hover:bg-stone-50"
                          )}
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>{g.name}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-md text-[9px]",
                            allAbsent ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                          )}>
                            {categoryMembers.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-1">
                {filteredMembers.map(member => {
                  const isAbsent = absentMemberIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      onClick={() => handleToggleCategory([member.id])}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all duration-200 group relative text-center min-h-[50px] shadow-sm",
                        isAbsent 
                          ? "bg-red-500 border-red-600 text-white shadow-lg shadow-red-200 scale-[0.98]" 
                          : getMemberTripDayColor(member.tripDays, false)
                      )}
                    >
                      {isAbsent && (
                        <div className="absolute top-1 right-1">
                          <Check className="w-3 h-3 opacity-60" />
                        </div>
                      )}
                      
                      <div className={cn(
                        "font-black text-xs transition-colors truncate w-full px-1",
                        isAbsent ? "text-white" : "text-stone-800"
                      )}>
                        {member.name}
                      </div>
                    </button>
                  );
                })}
              </div>
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
