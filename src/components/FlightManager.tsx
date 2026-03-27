import React, { useState } from 'react';
import { Member, Group } from '../types';
import { 
  Search, 
  PlaneTakeoff,
  PlaneLanding,
  Check,
  Edit2,
  Filter,
  Users
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { cn } from '../lib/utils';

interface FlightManagerProps {
  members: Member[];
  groups: Group[];
}

export default function FlightManager({ members, groups }: FlightManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  
  // Track which cell is being edited
  const [editingCell, setEditingCell] = useState<{ id: string, field: 'outboundFlight' | 'outboundTime' | 'returnFlight' | 'returnTime' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleEditClick = (id: string, field: 'outboundFlight' | 'outboundTime' | 'returnFlight' | 'returnTime', currentValue: string = '') => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const handleSave = async (id: string, field: string) => {
    try {
      const memberRef = doc(db, 'members', id);
      await updateDoc(memberRef, { [field]: editValue });
      setEditingCell(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `members/${id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string) => {
    if (e.key === 'Enter') {
      handleSave(id, field);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // Derived state
  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = selectedGroupId === 'all' || m.groupId === selectedGroupId;
    const isMissing = !m.outboundFlight || !m.outboundTime || !m.returnFlight || !m.returnTime;
    const matchesMissing = showMissingOnly ? isMissing : true;
    
    return matchesSearch && matchesGroup && matchesMissing;
  });

  const getGroupName = (groupId?: string) => {
    if (!groupId) return '-';
    return groups.find(g => g.id === groupId)?.name || '-';
  };

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">航班資訊管理</h2>
          <p className="text-stone-500">快速填寫與檢視所有團員的航班時刻表。</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row gap-4 w-full">
          <div className="relative flex-1 md:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input 
              type="text" 
              placeholder="搜尋姓名..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 transition-all shadow-sm focus:border-[#00F3FF]"
            />
          </div>
          
          <button
            onClick={() => setShowMissingOnly(!showMissingOnly)}
            className={cn(
              "flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border text-sm font-medium transition-all shadow-sm",
              showMissingOnly 
                ? "bg-red-50 text-red-600 border-red-200" 
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
            )}
          >
            <Filter className="w-4 h-4" />
            僅顯示未填妥名單
          </button>
        </div>
        
        {/* Group Filter Chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedGroupId('all')}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all",
              selectedGroupId === 'all' 
                ? "bg-stone-900 text-white" 
                : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
            )}
          >
            All Groups (所有組別)
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(g.id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all",
                selectedGroupId === g.id 
                  ? "bg-stone-900 text-white" 
                  : "bg-white text-stone-600 border border-stone-200 hover:bg-stone-50"
              )}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Table */}
      <div className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-stone-500 w-48 sticky left-0 bg-stone-50 z-10">團員姓名</th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
                    <PlaneTakeoff className="w-4 h-4" />
                    去程航班
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600">
                    去程時間
                  </div>
                </th>
                <th className="px-6 py-4 border-l border-stone-200/50">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-600">
                    <PlaneLanding className="w-4 h-4" />
                    回程航班
                  </div>
                </th>
                <th className="px-6 py-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-600">
                    回程時間
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredMembers.map((member) => (
                <tr key={member.id} className="hover:bg-stone-50 transition-colors group">
                  <td className="px-6 py-4 sticky left-0 bg-white group-hover:bg-stone-50 z-10 border-r border-stone-100">
                    <div className="flex flex-col">
                      <span className="font-medium text-stone-900">{member.name}</span>
                      <span className="text-[10px] uppercase font-bold text-stone-400">{getGroupName(member.groupId)}</span>
                    </div>
                  </td>
                  
                  {/* Outbound Fields */}
                  {['outboundFlight', 'outboundTime'].map((field, idx) => {
                    const typedField = field as 'outboundFlight' | 'outboundTime';
                    const isEditing = editingCell?.id === member.id && editingCell?.field === field;
                    const value = member[typedField];
                    
                    return (
                      <td key={field} className="px-2 py-2">
                        {isEditing ? (
                          <div className="flex items-center gap-2 bg-stone-100 rounded-lg p-1 border border-stone-300">
                            <input 
                              autoFocus
                              type={field.includes('Time') ? "text" : "text"}
                              placeholder={field.includes('Time') ? "YYYY-MM-DD HH:mm" : "Flight No."}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, member.id, typedField)}
                              onBlur={() => handleSave(member.id, typedField)}
                              className="w-full bg-transparent px-2 text-sm font-medium focus:outline-none"
                            />
                            <button onMouseDown={() => handleSave(member.id, typedField)} className="text-green-600 pr-1 hover:text-green-700">
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => handleEditClick(member.id, typedField, value)}
                            className={cn(
                              "px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all border border-transparent",
                              value ? "text-stone-900 group-hover:bg-white group-hover:border-stone-200 group-hover:shadow-sm" : "text-stone-400 italic group-hover:bg-stone-100"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{value || '點擊輸入...'}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Return Fields */}
                  {['returnFlight', 'returnTime'].map((field, idx) => {
                    const typedField = field as 'returnFlight' | 'returnTime';
                    const isEditing = editingCell?.id === member.id && editingCell?.field === field;
                    const value = member[typedField];
                    
                    return (
                      <td key={field} className={cn("px-2 py-2", idx === 0 ? "border-l border-stone-200/50" : "")}>
                        {isEditing ? (
                          <div className="flex items-center gap-2 bg-stone-100 rounded-lg p-1 border border-stone-300">
                            <input 
                              autoFocus
                              type={field.includes('Time') ? "text" : "text"}
                              placeholder={field.includes('Time') ? "YYYY-MM-DD HH:mm" : "Flight No."}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, member.id, typedField)}
                              onBlur={() => handleSave(member.id, typedField)}
                              className="w-full bg-transparent px-2 text-sm font-medium focus:outline-none"
                            />
                            <button onMouseDown={() => handleSave(member.id, typedField)} className="text-green-600 pr-1 hover:text-green-700">
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div 
                            onClick={() => handleEditClick(member.id, typedField, value)}
                            className={cn(
                              "px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all border border-transparent",
                              value ? "text-stone-900 group-hover:bg-white group-hover:border-stone-200 group-hover:shadow-sm" : "text-stone-400 italic group-hover:bg-stone-100"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span>{value || '點擊輸入...'}</span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                            </div>
                          </div>
                        )}
                      </td>
                    );
                  })}

                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400">
                    <PlaneTakeoff className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>找不到符合篩選條件的團員。</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
