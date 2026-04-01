import React, { useState, useMemo } from 'react';
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
  const [activeTab, setActiveTab] = useState<'outbound' | 'return'>('outbound');
  const [expandedFlights, setExpandedFlights] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  
  const [editingCell, setEditingCell] = useState<{ id: string, field: 'outboundFlight' | 'outboundTime' | 'returnFlight' | 'returnTime' } | null>(null);
  const [editValue, setEditValue] = useState('');

  const toggleFlight = (flightNo: string) => {
    const newSet = new Set(expandedFlights);
    if (newSet.has(flightNo)) newSet.delete(flightNo);
    else newSet.add(flightNo);
    setExpandedFlights(newSet);
  };

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

  // Grouping logic
  const groupedFlights = useMemo(() => {
    const flightField = activeTab === 'outbound' ? 'outboundFlight' : 'returnFlight';
    const timeField = activeTab === 'outbound' ? 'outboundTime' : 'returnTime';

    const groups_dict = members.reduce((acc, m) => {
      // Basic filtering
      const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = true; // Group filter removed
      if (!matchesSearch || !matchesGroup) return acc;

      const flightNo = m[flightField] || '未填寫';
      if (!acc[flightNo]) acc[flightNo] = [];
      acc[flightNo].push(m);
      return acc;
    }, {} as Record<string, Member[]>);

    // Filter by missing if needed
    if (showMissingOnly) {
      Object.keys(groups_dict).forEach(key => {
        groups_dict[key] = groups_dict[key].filter(m => !m.outboundFlight || !m.outboundTime || !m.returnFlight || !m.returnTime);
        if (groups_dict[key].length === 0) delete groups_dict[key];
      });
    }

    // Convert to sorted array
    return Object.entries(groups_dict)
      .map(([flightNo, flightMembers]) => {
        // Find the most common time or first non-empty time for this flight
        const firstWithTime = flightMembers.find(m => m[timeField]);
        const time = firstWithTime ? firstWithTime[timeField as keyof Member] as string : '';
        return { flightNo, time, members: flightMembers };
      })
      .sort((a, b) => {
        if (a.flightNo === '未填寫') return 1;
        if (b.flightNo === '未填寫') return -1;
        
        // Sort by member count (descending)
        if (b.members.length !== a.members.length) {
          return b.members.length - a.members.length;
        }
        
        // Fallback to sorting by time and then flight number
        return a.time.localeCompare(b.time) || a.flightNo.localeCompare(b.flightNo);
      });
  }, [members, activeTab, searchTerm, showMissingOnly]);

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

      {/* Controls Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row gap-4 flex-1">
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
              "flex items-center justify-center gap-2 px-6 py-3 rounded-2xl border text-sm font-medium transition-all shadow-sm shrink-0",
              showMissingOnly 
                ? "bg-red-50 text-red-600 border-red-200" 
                : "bg-white text-stone-600 border-stone-200 hover:bg-stone-50"
            )}
          >
            <Filter className="w-4 h-4" />
            僅顯示未填妥名單
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-stone-100 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab('outbound')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === 'outbound' ? "bg-white text-blue-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <PlaneTakeoff className="w-4 h-4" />
            去程航班 (Outbound)
          </button>
          <button
            onClick={() => setActiveTab('return')}
            className={cn(
              "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
              activeTab === 'return' ? "bg-white text-orange-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            <PlaneLanding className="w-4 h-4" />
            回程航班 (Return)
          </button>
        </div>
      </div>

      {/* Flight Groups */}
      <div className="space-y-4">
        {groupedFlights.length > 0 ? (
          groupedFlights.map(({ flightNo, time, members: flightMembers }) => {
            const isExpanded = expandedFlights.has(flightNo);
            const flightField = activeTab === 'outbound' ? 'outboundFlight' : 'returnFlight';
            const timeField = activeTab === 'outbound' ? 'outboundTime' : 'returnTime';
            const colorClass = activeTab === 'outbound' ? 'text-blue-600' : 'text-orange-600';
            const bgColorClass = activeTab === 'outbound' ? 'bg-blue-50' : 'bg-orange-50';

            return (
              <div key={flightNo} className="bg-white border border-stone-200 rounded-3xl overflow-hidden shadow-sm transition-all hover:shadow-md">
                {/* Flight Header */}
                <div 
                  onClick={() => toggleFlight(flightNo)}
                  className="flex items-center justify-between p-6 cursor-pointer hover:bg-stone-50 transition-colors"
                >
                  <div className="flex items-center gap-6">
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", bgColorClass)}>
                      {activeTab === 'outbound' ? <PlaneTakeoff className={colorClass} /> : <PlaneLanding className={colorClass} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-xl font-bold text-stone-900">{flightNo === '未填寫' ? '尚未填寫航班' : flightNo}</h3>
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px] font-bold uppercase">{flightMembers.length} 人</span>
                      </div>
                      <p className="text-sm text-stone-500 flex items-center gap-2 mt-0.5">
                        <span className="font-medium">{time || '時間未定'}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button className={cn("text-xs font-bold uppercase tracking-widest transition-all", isExpanded ? "text-stone-900" : "text-stone-400")}>
                      {isExpanded ? '收合詳情' : '查看名單'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-stone-100 p-2 sm:p-4 bg-stone-50/30">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left whitespace-nowrap">
                        <thead>
                          <tr className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                            <th className="px-6 py-3 w-40">團員</th>
                            <th className="px-6 py-3 w-32">組別</th>
                            <th className="px-6 py-3 w-48">航班編號</th>
                            <th className="px-6 py-3">航班時間</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {flightMembers.map(m => (
                            <tr key={m.id} className="group hover:bg-white transition-colors">
                              <td className="px-6 py-4">
                                <span className="font-medium text-stone-900 text-sm">{m.name}</span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="text-xs text-stone-500">{getGroupName(m.groupId)}</span>
                              </td>
                              
                              {/* Flight No Cell */}
                              <td className="px-6 py-2">
                                <div className="h-10 flex items-center">
                                  {editingCell?.id === m.id && editingCell?.field === flightField ? (
                                    <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-stone-300 w-full shadow-inner">
                                      <input 
                                        autoFocus
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, m.id, flightField)}
                                        onBlur={() => handleSave(m.id, flightField)}
                                        className="w-full bg-transparent px-2 text-xs font-mono focus:outline-none"
                                      />
                                      <button onMouseDown={() => handleSave(m.id, flightField)} className="text-green-600 pr-1 hover:text-green-700">
                                        <Check className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div 
                                      onClick={() => handleEditClick(m.id, flightField, m[flightField as keyof Member] as string)}
                                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-transparent hover:border-stone-200 hover:bg-white transition-all cursor-pointer group/cell h-full"
                                    >
                                      <span className={cn("text-xs font-mono truncate", !m[flightField as keyof Member] && "text-stone-300")}>{(m[flightField as keyof Member] as string) || '未填寫'}</span>
                                      <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-30 flex-shrink-0 ml-2" />
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Time Cell */}
                              <td className="px-6 py-2">
                                <div className="h-10 flex items-center">
                                  {editingCell?.id === m.id && editingCell?.field === timeField ? (
                                    <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-stone-300 w-full shadow-inner">
                                      <input 
                                        autoFocus
                                        placeholder="YYYY-MM-DD HH:mm"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, m.id, timeField)}
                                        onBlur={() => handleSave(m.id, timeField)}
                                        className="w-full bg-transparent px-2 text-xs font-mono focus:outline-none"
                                      />
                                      <button onMouseDown={() => handleSave(m.id, timeField)} className="text-green-600 pr-1 hover:text-green-700">
                                        <Check className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div 
                                      onClick={() => handleEditClick(m.id, timeField, m[timeField as keyof Member] as string)}
                                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-transparent hover:border-stone-200 hover:bg-white transition-all cursor-pointer group/cell h-full"
                                    >
                                      <span className={cn("text-xs font-mono truncate", !m[timeField as keyof Member] && "text-stone-300")}>{(m[timeField as keyof Member] as string) || '未填寫'}</span>
                                      <Edit2 className="w-3 h-3 opacity-0 group-hover/cell:opacity-30 flex-shrink-0 ml-2" />
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="bg-white border border-stone-200 rounded-3xl p-12 text-center text-stone-400 shadow-sm">
            <PlaneTakeoff className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>找不到符合篩選條件的航班或團員。</p>
          </div>
        )}
      </div>
    </div>
  );
}
