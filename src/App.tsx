import { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { db } from './firebase';
import { Member, Group, Itinerary, RollCall, TripSettings, DailyAbsence } from './types';
import { 
  Users, 
  Calendar, 
  CheckCircle, 
  LayoutDashboard, 
  Menu,
  X,
  Plane
} from 'lucide-react';
import { cn } from './lib/utils';
import Dashboard from './components/Dashboard';
import MemberManagement from './components/MemberManagement';
import ItineraryPlanner from './components/ItineraryPlanner';
import RollCallSystem from './components/RollCallSystem';
import FlightManager from './components/FlightManager';

type View = 'dashboard' | 'members' | 'flights' | 'itinerary' | 'rollcall';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [members, setMembers] = useState<Member[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [rollCalls, setRollCalls] = useState<RollCall[]>([]);
  const [tripSettings, setTripSettings] = useState<TripSettings | null>(null);

  // Real-time data sync
  useEffect(() => {
    const unsubMembers = onSnapshot(collection(db, 'members'), (snapshot) => {
      setMembers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Member)));
    });

    const unsubGroups = onSnapshot(collection(db, 'groups'), (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Group)));
    });

    const unsubItineraries = onSnapshot(query(collection(db, 'itineraries'), orderBy('startTime', 'asc')), (snapshot) => {
      setItineraries(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Itinerary)));
    });

    const unsubRollCalls = onSnapshot(collection(db, 'rollcalls'), (snapshot) => {
      setRollCalls(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RollCall)));
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'tripSettings'), (docSnap) => {
      if (docSnap.exists()) {
        setTripSettings(docSnap.data() as TripSettings);
      }
    });

    return () => {
      unsubMembers();
      unsubGroups();
      unsubItineraries();
      unsubRollCalls();
      unsubSettings();
    };
  }, []);
  const navItems = [
    { id: 'dashboard', label: '總覽儀表板', icon: LayoutDashboard },
    { id: 'members', label: '名單管理', icon: Users },
    { id: 'flights', label: '航班資訊', icon: Plane },
    { id: 'itinerary', label: '行程規劃', icon: Calendar },
    { id: 'rollcall', label: '點名系統', icon: CheckCircle },
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 transition-transform duration-300 lg:static lg:translate-x-0 lg:flex-shrink-0",
          !isSidebarOpen && "-translate-x-full lg:hidden"
        )}
      >
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-10">
            <h1 className="text-xl font-serif font-medium">GroupTrip Pro</h1>
            <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as View)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  currentView === item.id 
                    ? "bg-stone-900 text-white" 
                    : "text-stone-600 hover:bg-stone-100"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <header className="h-16 bg-white border-bottom border-stone-200 flex items-center px-6 lg:hidden">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="ml-4 text-lg font-serif font-medium">GroupTrip Pro</h1>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10">
          {currentView === 'dashboard' && (
            <Dashboard 
              members={members} 
              itineraries={itineraries} 
              rollCalls={rollCalls} 
              groups={groups}
            />
          )}
          {currentView === 'members' && (
            <MemberManagement 
              members={members} 
              groups={groups} 
              itineraries={itineraries}
              tripSettings={tripSettings}
            />
          )}
          {currentView === 'flights' && (
            <FlightManager 
              members={members} 
              groups={groups} 
            />
          )}
          {currentView === 'itinerary' && (
            <ItineraryPlanner 
              itineraries={itineraries} 
              members={members} 
              groups={groups}
              tripSettings={tripSettings}
            />
          )}
          {currentView === 'rollcall' && (
            <RollCallSystem 
              rollCalls={rollCalls} 
              itineraries={itineraries} 
              members={members} 
              tripSettings={tripSettings}
            />
          )}
        </div>
      </main>
    </div>
  );
}
