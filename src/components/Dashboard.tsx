import { Member, Itinerary, RollCall, Group } from '../types';
import { Users, Calendar, CheckCircle, AlertCircle, Crown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface DashboardProps {
  members: Member[];
  itineraries: Itinerary[];
  rollCalls: RollCall[];
  groups: Group[];
}

export default function Dashboard({ members, itineraries, rollCalls, groups }: DashboardProps) {
  const totalMembers = members.length;
  // ... rest of the logic ...
  
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
  const nineDayCount = members.filter(m => 
    m.tags?.some(tag => tag.toLowerCase().includes('9天') || tag.toLowerCase().includes('9d'))
  ).length;

  const threeDayCount = members.filter(m => 
    m.tags?.some(tag => tag.toLowerCase().includes('3天') || tag.toLowerCase().includes('3d'))
  ).length;

  // 5-day is the default if no 9-day or 3-day tag is present
  const fiveDayCount = totalMembers - (nineDayCount + threeDayCount);

  const stats = [
    { label: '總人數', value: totalMembers, icon: Users, color: 'text-blue-600' },
    { label: '5天行程', value: fiveDayCount, icon: Calendar, color: 'text-green-600' },
    { label: '9天行程', value: nineDayCount, icon: Calendar, color: 'text-stone-600' },
    { label: '其他行程', value: threeDayCount, icon: Calendar, color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-serif font-light mb-1">行程總覽</h2>
        <p className="text-stone-500">團體旅行的即時統計資訊。</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-xl bg-stone-50", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-stone-500 text-sm font-medium">{stat.label}</p>
            <p className="text-3xl font-serif mt-1">{stat.value}</p>
          </div>
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

    </div>
  );
}
