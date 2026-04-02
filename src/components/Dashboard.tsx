import { useState } from 'react';
import { Member, Itinerary, RollCall, Group } from '../types';
import { Users, Calendar, CheckCircle, AlertCircle, Crown, X, Search } from 'lucide-react';
import { cn } from '../lib/utils';

interface DashboardProps {
  members: Member[];
  itineraries: Itinerary[];
  rollCalls: RollCall[];
  groups: Group[];
}

import { format } from 'date-fns';

type TripType = 'total' | '5day' | '9day' | 'other';

export default function Dashboard({ members, itineraries, rollCalls, groups }: DashboardProps) {
  const [selectedTripType, setSelectedTripType] = useState<TripType | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const totalMembers = members.length;
  
  // Group summary logic
  const groupSummaries = groups.map(group => {
    const groupMembers = members.filter(m => m.groupId === group.id);
    const leader = groupMembers.find(m => m.isLeader);
    return {
      ...group,
      count: groupMembers.length,
      leaderName: leader?.name || '未設定'
    };
  });

  // Calculate trip duration counts based on tags
  const nineDayMembers = members.filter(m => 
    m.tags?.some(tag => tag.toLowerCase().includes('9天') || tag.toLowerCase().includes('9d'))
  );

  const threeDayMembers = members.filter(m => 
    m.tags?.some(tag => tag.toLowerCase().includes('3天') || tag.toLowerCase().includes('3d'))
  );

  // 5-day is the default if no 9-day or 3-day tag is present
  const fiveDayMembers = members.filter(m => 
    !nineDayMembers.some(nm => nm.id === m.id) && !threeDayMembers.some(tm => tm.id === m.id)
  );

  const stats = [
    { label: '總人數', value: totalMembers, icon: Users, color: 'text-blue-600', type: 'total' as TripType },
    { label: '5天行程', value: fiveDayMembers.length, icon: Calendar, color: 'text-green-600', type: '5day' as TripType },
    { label: '9天行程', value: nineDayMembers.length, icon: Calendar, color: 'text-stone-600', type: '9day' as TripType },
    { label: '其他行程', value: threeDayMembers.length, icon: Calendar, color: 'text-purple-600', type: 'other' as TripType },
  ];

  const getFilteredMembers = () => {
    let result: Member[] = [];
    switch (selectedTripType) {
      case 'total': result = members; break;
      case '5day': result = fiveDayMembers; break;
      case '9day': result = nineDayMembers; break;
      case 'other': result = threeDayMembers; break;
      default: result = [];
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(m => 
        m.name.toLowerCase().includes(lowerSearch) ||
        (m.tags?.some(tag => tag.toLowerCase().includes(lowerSearch)) ?? false) ||
        groups.find(g => g.id === m.groupId)?.name.toLowerCase().includes(lowerSearch)
      );
    }
    return result;
  };

  const filteredMembers = getFilteredMembers();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif font-light mb-1">行程總覽</h2>
        <p className="text-stone-500">團體旅行的即時統計資訊。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <button 
            key={stat.label} 
            onClick={() => { setSelectedTripType(stat.type); setIsModalOpen(true); }}
            className="group/card bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-left hover:scale-[1.02] hover:shadow-md transition-all duration-200 ease-out active:brightness-110 active:border-[#00F3FF]"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-xl bg-stone-50 group-hover/card:brightness-110 transition-all", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-stone-300 group-hover/card:text-stone-400 transition-colors">
                點擊查看
              </div>
            </div>
            <p className="text-stone-500 text-sm font-medium">{stat.label}</p>
            <p className="text-3xl font-serif mt-1">{stat.value}</p>
          </button>
        ))}
      </div>

      {/* Group Summary Section */}
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="text-xl font-serif mb-6 flex items-center gap-2">
          <Users className="w-5 h-5 text-stone-400" />
          各小組人數與組長
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {groupSummaries.map((group) => (
            <div key={group.id} className="p-5 rounded-2xl bg-stone-50 border border-stone-100 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900">{group.name}</span>
                <span className="px-2 py-0.5 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-500 shadow-sm">
                  {group.count} 人
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-stone-600 py-1 px-3 bg-white/50 rounded-xl border border-dashed border-stone-200">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-medium">組長：{group.leaderName}</span>
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <p className="col-span-full text-center py-10 text-stone-400">目前尚未建立任何組別。</p>
          )}
        </div>
      </div>

      {/* Member List Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-serif">
                  {stats.find(s => s.type === selectedTripType)?.label}名單
                </h3>
                <p className="text-sm text-stone-400 mt-1">共 {filteredMembers.length} 位團員</p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setSearchTerm(''); }} 
                className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400 hover:text-stone-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input 
                type="text" 
                placeholder="搜尋姓名、小組或標籤..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#00F3FF]/50 transition-all shadow-sm focus:border-[#00F3FF]"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin">
              {filteredMembers.map((member) => (
                <div key={member.id} className="p-4 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-between hover:bg-stone-100/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-white border border-stone-200 flex items-center justify-center text-sm font-bold text-stone-600 shadow-sm">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-900">{member.name}</span>
                        {member.isLeader && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[10px] font-bold">
                            <Crown className="w-2.5 h-2.5" />
                            組長
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">
                        {groups.find(g => g.id === member.groupId)?.name || '未分組'}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                    {member.tags?.map((tag, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-white border border-stone-200 rounded-lg text-[10px] font-medium text-stone-500 shadow-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {filteredMembers.length === 0 && (
                <div className="text-center py-12 text-stone-400">
                  找不到符合條件的服務員。
                </div>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-stone-100 flex justify-end">
              <button 
                onClick={() => { setIsModalOpen(false); setSearchTerm(''); }}
                className="px-8 py-3 bg-stone-900 text-white rounded-2xl font-medium hover:bg-stone-800 transition-colors shadow-lg active:scale-95 duration-200"
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
