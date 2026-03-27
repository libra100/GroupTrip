import { Member, Itinerary, RollCall } from '../types';
import { Users, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { 
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface DashboardProps {
  members: Member[];
  itineraries: Itinerary[];
  rollCalls: RollCall[];
}

export default function Dashboard({ members, itineraries, rollCalls }: DashboardProps) {
  const totalMembers = members.length;
  const totalItineraries = itineraries.length;
  
  // Calculate dietary stats
  const vegetarianCount = members.filter(m => 
    m.dietaryHabits?.toLowerCase().includes('素') || 
    m.dietaryHabits?.toLowerCase().includes('veg')
  ).length;

  // Calculate current divergent members
  const now = new Date();
  const currentItineraries = itineraries.filter(it => {
    const start = it.startTime?.toDate?.() || new Date(it.startTime);
    if (!it.endTime) {
      // If no end time, assume it's current if it started in the last 3 hours
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      return now >= start && start >= threeHoursAgo;
    }
    const end = it.endTime?.toDate?.() || new Date(it.endTime);
    return now >= start && now <= end;
  });

  const divergentMembers = new Set<string>();
  currentItineraries.forEach(it => {
    if (!it.isMain && it.assignedMemberIds) {
      it.assignedMemberIds.forEach(id => divergentMembers.add(id));
    }
  });

  const stats = [
    { label: '總人數', value: totalMembers, icon: Users, color: 'text-blue-600' },
    { label: '總行程數', value: totalItineraries, icon: Calendar, color: 'text-orange-600' },
    { label: '素食者', value: vegetarianCount, icon: AlertCircle, color: 'text-green-600' },
    { label: '目前脫隊人數', value: divergentMembers.size, icon: CheckCircle, color: 'text-purple-600' },
  ];

  const dietaryData = [
    { name: '素食', value: vegetarianCount },
    { name: '葷食', value: totalMembers - vegetarianCount },
  ];

  const COLORS = ['#10b981', '#e5e7eb'];

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm min-w-0">
          <h3 className="text-xl font-serif mb-6">飲食偏好分佈</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={dietaryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {dietaryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-8 mt-4">
            {dietaryData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index] }}></div>
                <span className="text-sm text-stone-600">{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-xl font-serif mb-6">即將到來的行程</h3>
          <div className="space-y-4">
            {itineraries
              .filter(it => (it.startTime?.toDate?.() || new Date(it.startTime)) > now)
              .slice(0, 5)
              .map(it => (
                <div key={it.id} className="flex items-center justify-between p-4 rounded-2xl bg-stone-50 border border-stone-100">
                  <div>
                    <p className="font-medium text-stone-900">{it.title}</p>
                    <p className="text-xs text-stone-500">
                      {format(it.startTime?.toDate?.() || new Date(it.startTime), 'MMM d, HH:mm')}
                    </p>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold",
                    it.type === 'attraction' ? "bg-blue-100 text-blue-700" :
                    it.type === 'dining' ? "bg-orange-100 text-orange-700" :
                    it.type === 'transit' ? "bg-stone-200 text-stone-700" :
                    "bg-purple-100 text-purple-700"
                  )}>
                    {it.type}
                  </div>
                </div>
              ))}
            {itineraries.length === 0 && (
              <p className="text-center text-stone-400 py-10">目前沒有即將到來的行程。</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
