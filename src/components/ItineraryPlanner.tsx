import React, { useState, useEffect } from 'react';
import { Itinerary, Member, ItineraryType } from '../types';
import { 
  Plus, 
  Calendar, 
  MapPin, 
  Clock, 
  Trash2, 
  Edit2, 
  ExternalLink,
  Users,
  Check,
  Settings
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  setDoc,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';

const safeFormat = (date: Date | null | number | undefined, formatStr: string) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, formatStr);
};

interface ItineraryPlannerProps {
  itineraries: Itinerary[];
  members: Member[];
}

interface TripSettings {
  startDate: string;
  endDate: string;
}

export default function ItineraryPlanner({ itineraries, members }: ItineraryPlannerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Itinerary | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const [tripSettings, setTripSettings] = useState<TripSettings | null>(null);
  const [isSettingTrip, setIsSettingTrip] = useState(false);
  const [tempSettings, setTempSettings] = useState<TripSettings>({ startDate: '', endDate: '' });

  const [activeDate, setActiveDate] = useState<string>(safeFormat(new Date(), 'yyyy-MM-dd'));

  const [newItem, setNewItem] = useState<{
    title: string;
    type: ItineraryType;
    startTimeStr: string;
    endTimeStr: string;
    location: { address: string; navLink: string };
    notes: string;
    isMain: boolean;
  }>({
    title: '',
    type: 'attraction',
    startTimeStr: '09:00',
    endTimeStr: '',
    location: { address: '', navLink: '' },
    notes: '',
    isMain: true
  });

  // Fetch trip settings
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

  // Generate date array from trip settings
  const tripDates = React.useMemo(() => {
    if (!tripSettings?.startDate || !tripSettings?.endDate) return [];
    
    const start = parseISO(tripSettings.startDate);
    const end = parseISO(tripSettings.endDate);
    const days = differenceInDays(end, start) + 1;
    
    if (days <= 0 || days > 30) return []; // safety limit

    return Array.from({ length: days }).map((_, i) => safeFormat(addDays(start, i), 'yyyy-MM-dd'));
  }, [tripSettings]);

  // Set active date automatically when dates are ready
  useEffect(() => {
    if (tripDates.length > 0 && !tripDates.includes(activeDate)) {
      setActiveDate(tripDates[0]);
    }
  }, [tripDates, activeDate]);

  // Group itineraries by date
  const groupedItineraries = itineraries.reduce((groups, it) => {
    if (!it.startTime) return groups;
    const date = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
    if (isNaN(date.getTime())) return groups; // skip invalid date
    
    const dateStr = safeFormat(date, 'yyyy-MM-dd');
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(it);
    return groups;
  }, {} as Record<string, Itinerary[]>);

  const handleSaveTripSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempSettings.startDate || !tempSettings.endDate) return;
    if (tempSettings.startDate > tempSettings.endDate) {
      alert('End date must be after start date');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'tripSettings'), tempSettings);
      setIsSettingTrip(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.title || !newItem.startTimeStr || !activeDate) return;

    try {
      const startDateTime = new Date(`${activeDate}T${newItem.startTimeStr}`);
      const endDateTime = newItem.endTimeStr ? new Date(`${activeDate}T${newItem.endTimeStr}`) : null;

      const docRef = await addDoc(collection(db, 'itineraries'), {
        title: newItem.title,
        type: newItem.type,
        location: newItem.location,
        notes: newItem.notes,
        isMain: newItem.isMain,
        startTime: Timestamp.fromDate(startDateTime),
        endTime: endDateTime ? Timestamp.fromDate(endDateTime) : null,
        assignedMemberIds: newItem.isMain ? [] : selectedMembers,
        id: Date.now().toString()
      });
      await updateDoc(docRef, { id: docRef.id });
      setIsAdding(false);
      setNewItem({ 
        title: '', type: 'attraction', startTimeStr: '09:00', endTimeStr: '', 
        location: { address: '', navLink: '' }, notes: '', isMain: true 
      });
      setSelectedMembers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'itineraries');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.title || !activeDate) return;

    try {
      const startDateTime = new Date(`${activeDate}T${newItem.startTimeStr}`);
      const endDateTime = newItem.endTimeStr ? new Date(`${activeDate}T${newItem.endTimeStr}`) : null;

      const ref = doc(db, 'itineraries', editing.id);
      await updateDoc(ref, {
        ...editing,
        title: newItem.title,
        type: newItem.type,
        location: newItem.location,
        notes: newItem.notes,
        isMain: newItem.isMain,
        startTime: Timestamp.fromDate(startDateTime),
        endTime: endDateTime ? Timestamp.fromDate(endDateTime) : null,
        assignedMemberIds: newItem.isMain ? [] : selectedMembers
      });
      setEditing(null);
      setSelectedMembers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${editing.id}`);
    }
  };


  const getTypeColor = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return 'bg-blue-500';
      case 'dining': return 'bg-orange-500';
      case 'transit': return 'bg-stone-500';
      case 'logistics': return 'bg-purple-500';
      default: return 'bg-stone-500';
    }
  };

  const getTypeLabel = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return '景點';
      case 'dining': return '餐飲';
      case 'transit': return '交通';
      case 'logistics': return '行政';
      default: return type;
    }
  };

  const handleEditClick = (it: Itinerary) => {
    const start = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
    const end = it.endTime ? (it.endTime instanceof Timestamp ? it.endTime.toDate() : new Date(it.endTime)) : null;
    
    setEditing(it);
    setActiveDate(safeFormat(start, 'yyyy-MM-dd')); // ensure editing opens the right date tab
    setNewItem({
      title: it.title,
      type: it.type,
      startTimeStr: safeFormat(start, 'HH:mm'),
      endTimeStr: end ? safeFormat(end, 'HH:mm') : '',
      location: it.location || { address: '', navLink: '' },
      notes: it.notes || '',
      isMain: it.isMain
    });
    setSelectedMembers(it.assignedMemberIds || []);
  };

  const dayItineraries = groupedItineraries[activeDate] || [];

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">行程規劃</h2>
          <p className="text-stone-500">選擇日期以檢視或新增行程安排。</p>
        </div>
        
        {tripSettings ? (
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setTempSettings(tripSettings);
                setIsSettingTrip(true);
              }}
              className="flex items-center gap-2 bg-white border border-stone-200 text-stone-600 px-4 py-2 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm"
              title="設定旅遊日期"
            >
              <Settings className="w-4 h-4" />
              {safeFormat(parseISO(tripSettings.startDate), 'MM/dd')} - {safeFormat(parseISO(tripSettings.endDate), 'MM/dd')}
            </button>

            <button 
              onClick={() => {
                setIsAdding(true);
                setEditing(null);
                setNewItem({ 
                  title: '', type: 'attraction', startTimeStr: '09:00', endTimeStr: '', 
                  location: { address: '', navLink: '' }, notes: '', isMain: true 
                });
                setSelectedMembers([]);
              }}
              className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              新增行程
            </button>
          </div>
        ) : (
          <button 
            onClick={() => {
              setTempSettings({ startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(addDays(new Date(), 2), 'yyyy-MM-dd') });
              setIsSettingTrip(true);
            }}
            className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
          >
            <Calendar className="w-4 h-4" />
            設定旅遊日期
          </button>
        )}
      </div>

      {/* Date Requirement Warning */}
      {!tripSettings && !isSettingTrip && (
        <div className="text-center py-20 text-stone-400 bg-white border border-stone-200 rounded-3xl shadow-sm border-dashed">
          <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium text-stone-600 mb-2">請先設定本次旅遊的日期區間</p>
          <p className="text-sm">在新增行程之前，請先設定您的旅遊開始與結束日期。</p>
          <button 
            onClick={() => {
              setTempSettings({ startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(addDays(new Date(), 2), 'yyyy-MM-dd') });
              setIsSettingTrip(true);
            }}
            className="mt-6 mx-auto flex items-center gap-2 bg-stone-100 text-stone-600 px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-200 transition-colors"
          >
            立即設定日期
          </button>
        </div>
      )}

      {/* Day Tabs */}
      {tripDates.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {tripDates.map((dateStr, idx) => (
            <button
              key={dateStr}
              onClick={() => setActiveDate(dateStr)}
              className={cn(
                "flex-shrink-0 px-6 py-3 border rounded-full text-sm font-medium transition-all shadow-sm flex flex-col items-center",
                activeDate === dateStr 
                  ? "bg-stone-900 text-white border-stone-900 scale-105" 
                  : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
              )}
            >
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 mb-0.5">第 {idx + 1} 天</span>
              <span>{safeFormat(parseISO(dateStr), 'MM/dd')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Timeline View for Active Date */}
      {tripSettings && (
        <div className="space-y-6">
          {activeDate && (
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-200" />
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-400">
                {safeFormat(parseISO(activeDate), 'EEEE, MMMM do, yyyy')}
              </h3>
              <div className="h-px flex-1 bg-stone-200" />
            </div>
          )}

          {dayItineraries.length > 0 ? (
            <div className="relative space-y-6 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-stone-200 lg:before:left-1/2">
              {dayItineraries.sort((a, b) => {
                if (!a.startTime || !b.startTime) return 0;
                let aTime = 0, bTime = 0;
                try {
                  aTime = a.startTime instanceof Timestamp ? a.startTime.toMillis() : new Date(a.startTime).getTime();
                  bTime = b.startTime instanceof Timestamp ? b.startTime.toMillis() : new Date(b.startTime).getTime();
                } catch { return 0; }
                return (isNaN(aTime) ? 0 : aTime) - (isNaN(bTime) ? 0 : bTime);
              }).map((it, index) => {
                if (!it.startTime) return null;
                const start = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
                if (isNaN(start.getTime())) return null;
                
                const end = it.endTime ? (it.endTime instanceof Timestamp ? it.endTime.toDate() : new Date(it.endTime)) : null;
                const isLeft = index % 2 === 0;

                return (
                  <div key={it.id} className={cn(
                    "relative flex flex-col lg:flex-row items-center gap-8",
                    isLeft ? "lg:flex-row-reverse" : ""
                  )}>
                    {/* Timeline Dot */}
                    <div className={cn(
                      "absolute left-4 lg:left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white shadow-sm z-10",
                      getTypeColor(it.type)
                    )} />

                    {/* Content Card */}
                    <div className={cn(
                      "w-full lg:w-[45%] pl-10 lg:pl-0",
                      isLeft ? "lg:text-right" : "lg:text-left"
                    )}>
                      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-shadow group">
                        <div className={cn(
                          "flex flex-col gap-4",
                          isLeft ? "lg:items-end" : "lg:items-start"
                        )}>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold text-white",
                              getTypeColor(it.type)
                            )}>
                              {getTypeLabel(it.type)}
                            </span>
                            {!it.isMain && (
                              <span className="px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold bg-purple-100 text-purple-700">
                                脫隊行動
                              </span>
                            )}
                          </div>

                          <h3 className="text-xl font-serif">{it.title}</h3>

                          <div className={cn(
                            "flex flex-wrap gap-4 text-sm text-stone-500",
                            isLeft ? "lg:justify-end" : "lg:justify-start"
                          )}>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                            {safeFormat(start, 'HH:mm')}
                            {end && (
                              <> - {safeFormat(end, 'HH:mm')}</>
                            )}
                            </div>
                            {it.location?.address && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {it.location.address}
                              </div>
                            )}
                          </div>

                          {it.notes && (
                            <p className="text-sm text-stone-400 italic line-clamp-2">{it.notes}</p>
                          )}

                          {!it.isMain && it.assignedMemberIds && (
                            <div className={cn("flex items-center gap-1 text-xs text-purple-600 font-medium")}>
                              <Users className="w-3 h-3" />
                              已指派 {it.assignedMemberIds.length} 位團員
                            </div>
                          )}

                          <div className={cn(
                            "flex items-center gap-2 pt-4 border-t border-stone-100 w-full",
                            isLeft ? "lg:justify-end" : "lg:justify-start"
                          )}>
                            {it.location?.navLink && (
                              <a 
                                href={it.location.navLink} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <button 
                              onClick={() => handleEditClick(it)}
                              className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 text-stone-400 bg-white border border-stone-200 rounded-3xl shadow-sm border-dashed">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>這個日期還沒有安排行程</p>
              <p className="text-sm">{safeFormat(parseISO(activeDate), 'yyyy年MM月dd日')} 目前無任何行程</p>
            </div>
          )}
        </div>
      )}

      {/* Trip Settings Modal */}
      {isSettingTrip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-stone-100 rounded-full text-stone-900">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif">旅遊日期設定</h3>
            </div>
            
            <form onSubmit={handleSaveTripSettings} className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">出發日期 (Start Date)</label>
                <input 
                  type="date" 
                  required
                  max="9999-12-31"
                  value={tempSettings.startDate}
                  onChange={(e) => setTempSettings({...tempSettings, startDate: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">結束日期 (End Date)</label>
                <input 
                  type="date" 
                  required
                  max="9999-12-31"
                  value={tempSettings.endDate}
                  onChange={(e) => setTempSettings({...tempSettings, endDate: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                />
              </div>

              <div className="flex gap-3 pt-4">
                {tripSettings && (
                  <button 
                    type="button"
                    onClick={() => setIsSettingTrip(false)}
                    className="flex-1 py-3 border border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-colors"
                  >
                    取消 (Cancel)
                  </button>
                )}
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                >
                  儲存日期 (Save)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Event Modal */}
      {(isAdding || editing) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-serif mb-2">
              {isAdding ? '新增行程' : '編輯行程'}
            </h3>
            <p className="text-stone-500 mb-6 font-medium">
              行程日期: {safeFormat(parseISO(activeDate), 'yyyy年MM月dd日 (EEEE)')}
            </p>
            <form onSubmit={isAdding ? handleAdd : handleUpdate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">行程名稱 (Title)</label>
                  <input 
                    type="text" 
                    required
                    value={newItem.title}
                    onChange={(e) => setNewItem({...newItem, title: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                    placeholder="例如: 東京鐵塔午餐"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">行程類型 (Type)</label>
                  <select 
                    value={newItem.type}
                    onChange={(e) => setNewItem({...newItem, type: e.target.value as ItineraryType})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  >
                    <option value="attraction">景點 (Attraction)</option>
                    <option value="dining">餐飲 (Dining)</option>
                    <option value="transit">交通 (Transit)</option>
                    <option value="logistics">行政 (Logistics)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input 
                    type="checkbox" 
                    id="isMain"
                    checked={newItem.isMain}
                    onChange={(e) => setNewItem({...newItem, isMain: e.target.checked})}
                    className="w-5 h-5 accent-stone-900"
                  />
                  <label htmlFor="isMain" className="text-sm font-medium text-stone-700">主要行程 (所有團員參與)</label>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">開始時間 (Start Time)</label>
                  <input 
                    type="time" 
                    required
                    value={newItem.startTimeStr}
                    onChange={(e) => setNewItem({...newItem, startTimeStr: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">結束時間 (End Time) - 選填</label>
                  <input 
                    type="time" 
                    value={newItem.endTimeStr}
                    onChange={(e) => setNewItem({...newItem, endTimeStr: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">地址 (Address)</label>
                  <input 
                    type="text" 
                    value={newItem.location?.address}
                    onChange={(e) => setNewItem({...newItem, location: {...newItem.location, address: e.target.value}})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">導航連結 (Navigation Link)</label>
                  <input 
                    type="url" 
                    value={newItem.location?.navLink}
                    onChange={(e) => setNewItem({...newItem, location: {...newItem.location, navLink: e.target.value}})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">備註 (Notes)</label>
                  <textarea 
                    value={newItem.notes}
                    onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 h-24 resize-none"
                  />
                </div>

                {/* Member Selection for Divergent Itinerary */}
                {!newItem.isMain && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">指派參與此脫隊行程的團員</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-4 bg-stone-50 border border-stone-200 rounded-2xl">
                      {members.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            if (selectedMembers.includes(m.id)) {
                              setSelectedMembers(selectedMembers.filter(id => id !== m.id));
                            } else {
                              setSelectedMembers([...selectedMembers, m.id]);
                            }
                          }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all border",
                            selectedMembers.includes(m.id)
                              ? "bg-stone-900 text-white border-stone-900"
                              : "bg-white text-stone-600 border-stone-200 hover:border-stone-400"
                          )}
                        >
                          {selectedMembers.includes(m.id) && <Check className="w-3 h-3" />}
                          {m.name}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-stone-400 mt-2">已選擇: {selectedMembers.length} 位參與者</p>
                  </div>
                )}
               </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => { setIsAdding(false); setEditing(null); setSelectedMembers([]); }}
                  className="flex-1 py-3 border border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-colors"
                >
                  取消 (Cancel)
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                >
                  {isAdding ? '建立行程 (Create)' : '儲存變更 (Save)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
