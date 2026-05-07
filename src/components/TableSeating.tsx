import React, { useState, useMemo } from 'react';
import { Member, Itinerary, RollCall, Group } from '../types';
import {
  Users,
  Trash2,
  Wand2,
  X,
  MessageSquare,
  AlertCircle,
  UserPlus
} from 'lucide-react';
import { cn } from '../lib/utils';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface TableSeatingProps {
  members: Member[];
  itinerary: Itinerary;
  rollCall: RollCall | null;
  groups: Group[];
}

export default function TableSeating({
  members,
  itinerary,
  rollCall,
  groups
}: TableSeatingProps) {
  const [selectedSeat, setSelectedSeat] = useState<{unitIndex: number, seatIndex: number} | null>(null);
  const [swapSource, setSwapSource] = useState<{unitIndex: number, seatIndex: number} | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Use a fixed or config-based number of tables
  const columns = itinerary.seatingConfig?.columns || 5;
  const rows = itinerary.seatingConfig?.rows || 2;

  // Map member IDs to member objects for easy lookup
  const memberMap = useMemo(() => {
    return members.reduce((acc, m) => ({ ...acc, [m.id]: m }), {} as Record<string, Member>);
  }, [members]);

  const groupMap = useMemo(() => {
    return groups.reduce((acc, g) => ({ ...acc, [g.id]: g.name }), {} as Record<string, string>);
  }, [groups]);

  const assignments = itinerary.seatingAssignments || {};
  const seatingNotes = itinerary.seatingNotes || {};

  // Reverse mapping to find if a member is already assigned
  const memberToSeat = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(assignments).forEach(([seatId, memberId]) => {
      map[memberId] = seatId;
    });
    return map;
  }, [assignments]);

  const unassignedMembers = useMemo(() => {
    const assignedIds = new Set(Object.values(assignments));
    return members.filter(m => {
      // Only include members assigned to this itinerary (or all if it's main)
      if (itinerary.isMain) {
        if (itinerary.excludedMemberIds?.includes(m.id)) return false;
        return !assignedIds.has(m.id);
      } else {
        return itinerary.assignedMemberIds?.includes(m.id) && !assignedIds.has(m.id);
      }
    });
  }, [members, itinerary, assignments]);

  const handleSwapSeats = async (target: {unitIndex: number, seatIndex: number}) => {
    if (!swapSource) return;
    
    const sourceId = `${swapSource.unitIndex}_${swapSource.seatIndex}`;
    const targetId = `${target.unitIndex}_${target.seatIndex}`;
    
    if (sourceId === targetId) {
      setSwapSource(null);
      return;
    }

    const newAssignments = { ...assignments };
    const sourceMemberId = assignments[sourceId];
    const targetMemberId = assignments[targetId];

    if (sourceMemberId) newAssignments[targetId] = sourceMemberId;
    else delete newAssignments[targetId];

    if (targetMemberId) newAssignments[sourceId] = targetMemberId;
    else delete newAssignments[sourceId];

    try {
      await updateDoc(doc(db, 'itineraries', itinerary.id), {
        seatingAssignments: newAssignments
      });
      setSwapSource(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${itinerary.id}`);
    }
  };

  const handleAssignMember = async (unitIndex: number, seatIndex: number, memberId: string | null) => {
    const seatId = `${unitIndex}_${seatIndex}`;
    const newAssignments = { ...assignments };

    if (memberId) {
      // If member was already assigned elsewhere, remove that assignment
      const oldSeatId = memberToSeat[memberId];
      if (oldSeatId) {
        delete newAssignments[oldSeatId];
      }
      newAssignments[seatId] = memberId;
    } else {
      delete newAssignments[seatId];
    }

    try {
      await updateDoc(doc(db, 'itineraries', itinerary.id), {
        seatingAssignments: newAssignments
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${itinerary.id}`);
    }
  };

  const handleUpdateNote = async (seatId: string, note: string) => {
    const newNotes = { ...seatingNotes };
    if (note) {
      newNotes[seatId] = note;
    } else {
      delete newNotes[seatId];
    }

    try {
      await updateDoc(doc(db, 'itineraries', itinerary.id), {
        seatingNotes: newNotes
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${itinerary.id}`);
    }
  };


  const renderSeat = (unitIndex: number, seatIndex: number) => {
    const seatId = `${unitIndex}_${seatIndex}`;
    const memberId = assignments[seatId];
    const member = memberId ? memberMap[memberId] : null;
    const status = member ? (rollCall?.statusMap[member.id] || 'absent') : null;
    const note = seatingNotes[seatId];
    const isVeg = member?.dietaryHabits?.includes('素');

    const isSwapSource = swapSource?.unitIndex === unitIndex && swapSource?.seatIndex === seatIndex;

    return (
      <div
        key={seatId}
        onClick={() => {
          if (swapSource) {
            handleSwapSeats({ unitIndex, seatIndex });
          } else {
            setSwapSource({ unitIndex, seatIndex });
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setSelectedSeat({ unitIndex, seatIndex });
        }}
        className={cn(
          "relative h-9 flex items-center px-2 rounded-lg border-2 transition-all group cursor-pointer",
          isSwapSource ? "border-[#00F3FF] bg-[#00F3FF]/5 shadow-[0_0_10px_rgba(0,243,255,0.3)] ring-1 ring-[#00F3FF]/20" :
          member
            ? (status === 'present'
                ? "bg-green-50 border-green-200"
                : status === 'divergent'
                ? "bg-purple-50 border-purple-200"
                : "bg-white border-stone-200 shadow-sm")
            : "bg-stone-50 border-dashed border-stone-200 hover:border-stone-400"
        )}
      >
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {member ? (
            <>
              <span className="text-xs font-bold text-stone-700 truncate">{member.name}</span>
              {isVeg && <span className="text-[10px] flex-shrink-0">🌿</span>}
            </>
          ) : (
            <span className="text-[10px] font-bold text-stone-300 mx-auto">空位</span>
          )}
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedSeat({ unitIndex, seatIndex });
          }}
          className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-stone-100 transition-all"
        >
          <AlertCircle className="w-3 h-3 text-stone-400" />
        </button>

        {note && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white shadow-sm" />
        )}
      </div>
    );
  };

  const renderUnit = (unitIndex: number) => {
    return (
      <div key={unitIndex} className="bg-white border-2 border-stone-200 rounded-xl p-3 shadow-sm hover:border-stone-300 transition-all">
        <div className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-3 text-center">
          組別 {unitIndex + 1}
        </div>
        <div className="flex gap-2">
          {/* Left side (6 seats) */}
          <div className="flex-1 flex flex-col gap-2">
            {[0, 1, 2].map(i => renderSeat(unitIndex, i))}
            <div className="h-px bg-stone-100 my-1" />
            {[3, 4, 5].map(i => renderSeat(unitIndex, i))}
          </div>
          {/* Right side (6 seats) */}
          <div className="flex-1 flex flex-col gap-2">
            {[6, 7, 8].map(i => renderSeat(unitIndex, i))}
            <div className="h-px bg-stone-100 my-1" />
            {[9, 10, 11].map(i => renderSeat(unitIndex, i))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 h-full">


      {/* Seating Map */}
      <div className="flex-1 overflow-x-auto bg-stone-100/50 rounded-[2.5rem] border border-stone-200 p-6 md:p-8 no-scrollbar">
        <div 
          className="grid gap-6 md:gap-8"
          style={{ 
            gridAutoFlow: 'column',
            gridTemplateRows: `repeat(${rows}, min-content)`,
            gridAutoColumns: 'minmax(280px, 1fr)'
          }}
        >
          {Array.from({ length: columns * rows }).map((_, i) => renderUnit(i))}
        </div>
      </div>

      {/* Seat Detail Dialog */}
      {selectedSeat && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-stone-100 rounded-xl">
                    <Users className="w-5 h-5 text-stone-600" />
                  </div>
                  <div>
                    <h4 className="font-serif font-black text-xl text-stone-900">座位詳情</h4>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">
                      組別 {selectedSeat.unitIndex + 1} - 位置 {selectedSeat.seatIndex + 1}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSeat(null)}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-stone-400" />
                </button>
              </div>

              <div className="space-y-8">
                {/* Member Assignment */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-2">
                    <UserPlus className="w-3.5 h-3.5" /> 分配團員
                  </label>
                  <div className="relative">
                    <select
                      value={assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`] || ''}
                      onChange={(e) => handleAssignMember(selectedSeat.unitIndex, selectedSeat.seatIndex, e.target.value || null)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-4 font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10 outline-none appearance-none"
                    >
                      <option value="">-- 選擇團員 (空位) --</option>
                      {/* Show current member first if exists */}
                      {assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`] && (
                        <option value={assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`]}>
                          {memberMap[assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`]]?.name} (目前位置)
                        </option>
                      )}
                      {unassignedMembers.sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.groupId ? `[${groupMap[m.groupId] || '?'}]` : ''} {m.dietaryHabits?.includes('素') ? '🌿' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <div className="w-2 h-2 border-r-2 border-b-2 border-stone-400 rotate-45" />
                    </div>
                  </div>
                </div>

                {/* Member Info (if assigned) */}
                {assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`] && (
                  <div className="bg-stone-50 rounded-2xl p-5 border border-stone-100 flex items-start gap-4">
                    <div className="p-2.5 bg-white rounded-xl shadow-sm">
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest">團員資訊</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <span className="text-sm font-bold text-stone-700">
                          飲食：{memberMap[assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`]]?.dietaryHabits || '一般'}
                        </span>
                        {memberMap[assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`]]?.groupId && (
                          <span className="text-[10px] px-2 py-0.5 bg-stone-200 text-stone-600 rounded-md font-bold">
                            {groupMap[memberMap[assignments[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`]]!.groupId!] || '未知群組'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Note Section */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5" /> 備註 (Notes)
                  </label>
                  <textarea
                    placeholder="例如：壽星、需加椅子、特殊需求..."
                    value={seatingNotes[`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`] || ''}
                    onChange={(e) => handleUpdateNote(`${selectedSeat.unitIndex}_${selectedSeat.seatIndex}`, e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-4 font-bold text-stone-900 focus:ring-2 focus:ring-stone-900/10 outline-none min-h-[120px] resize-none"
                  />
                </div>
              </div>

              <button
                onClick={() => setSelectedSeat(null)}
                className="w-full mt-8 bg-stone-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-stone-800 transition-all shadow-lg"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
