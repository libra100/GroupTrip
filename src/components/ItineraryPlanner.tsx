import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary, Member, Group, ItineraryType, TripSettings, DailyAbsence } from '../types';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { cn } from '../lib/utils';
import { doc, onSnapshot, Timestamp, setDoc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import DailyAbsenceManager from './DailyAbsenceManager';
import { 
  Plus, 
  MapPin, 
  Clock, 
  Users, 
  Settings, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  Check, 
  Calendar,
  MessageSquare,
  Car,
  ChevronRight,
  Info,
  ExternalLink,
  UserX,
  History,
  Copy,
  LayoutGrid,
  Search
} from 'lucide-react';

const safeFormat = (date: Date | null | number | undefined, formatStr: string) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return format(d, formatStr);
};

interface ItineraryPlannerProps {
  itineraries: Itinerary[];
  members: Member[];
  groups: Group[];
  tripSettings: TripSettings | null;
}

export default function ItineraryPlanner({ 
  itineraries, 
  members, 
  groups,
  tripSettings
}: ItineraryPlannerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Itinerary | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const [isSettingTrip, setIsSettingTrip] = useState(false);
  const [tempSettings, setTempSettings] = useState<TripSettings>({ startDate: '', endDate: '' });

  const [activeDate, setActiveDate] = useState<string>(safeFormat(new Date(), 'yyyy-MM-dd'));
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  const [newItem, setNewItem] = useState<{
    title: string;
    type: ItineraryType;
    startTimeStr: string;
    endTimeStr: string;
    location: { address: string; navLink: string };
    notes: string;
    isMain: boolean;
    excludedMemberIds: string[];
    accommodationDetail: string;
    assignedMemberIds: string[];
    vehicleAssignments: Record<string, string>;
    isMultiVehicle: boolean;
    groupAssignments: Record<string, string>;
    isGrouped: boolean;
    groups: string[];
  }>({
    title: '',
    type: 'attraction',
    startTimeStr: '09:00',
    endTimeStr: '',
    location: { address: '', navLink: '' },
    notes: '',
    isMain: true,
    excludedMemberIds: [],
    assignedMemberIds: [],
    vehicleAssignments: {},
    isMultiVehicle: false,
    groupAssignments: {},
    isGrouped: false,
    groups: []
  });

  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);

  // Daily absences are now derived from tripSettings
  const dailyAbsenceIds = useMemo(() => {
    if (!activeDate || !tripSettings?.dailyAbsences) return [];
    return tripSettings.dailyAbsences[activeDate] || [];
  }, [activeDate, tripSettings]);

  // Generate date array from trip settings
  const tripDates = React.useMemo(() => {
    if (!tripSettings?.startDate || !tripSettings?.endDate) return [];
    
    const start = parseISO(tripSettings.startDate);
    const end = parseISO(tripSettings.endDate);
    const days = differenceInDays(end, start) + 1;
    
    if (days <= 0 || days > 180) return []; // safety limit

    return Array.from({ length: days }).map((_, i) => safeFormat(addDays(start, i), 'yyyy-MM-dd'));
  }, [tripSettings]);

  // Set active date automatically when dates are ready
  useEffect(() => {
    if (tripDates.length > 0 && !tripDates.includes(activeDate)) {
      setActiveDate(tripDates[0]);
    }
  }, [tripDates, activeDate]);

  // Group itineraries by dayIndex (fallback to date if dayIndex missing)
  const groupedItineraries = itineraries.reduce((groups, it) => {
    let dIndex = it.dayIndex;
    
    if (dIndex === undefined && it.startTime) {
      // Logic for legacy data: find index based on startTime date
      const date = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
      if (!isNaN(date.getTime()) && tripSettings?.startDate) {
        const dateStr = safeFormat(date, 'yyyy-MM-dd');
        dIndex = tripDates.indexOf(dateStr);
      }
    }

    if (dIndex !== undefined && dIndex >= 0) {
      const dateStrAtIdx = tripDates[dIndex];
      if (dateStrAtIdx) {
        if (!groups[dateStrAtIdx]) groups[dateStrAtIdx] = [];
        groups[dateStrAtIdx].push(it);
      }
    }
    return groups;
  }, {} as Record<string, Itinerary[]>);

  const handleSaveTripSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempSettings.startDate || !tempSettings.endDate) return;

    const normalizeDate = (d: string) => d.replace(/\//g, '-');
    const startNormalized = normalizeDate(tempSettings.startDate);
    const endNormalized = normalizeDate(tempSettings.endDate);

    if (startNormalized > endNormalized) {
      alert('End date must be after start date');
      return;
    }

    try {
      await setDoc(doc(db, 'settings', 'tripSettings'), {
        startDate: startNormalized,
        endDate: endNormalized
      });
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

      const finalMembers = newItem.isMain
        ? [...new Set([...selectedMembers, ...dailyAbsenceIds])]
        : selectedMembers.filter(id => !dailyAbsenceIds.includes(id));

      const docRef = await addDoc(collection(db, 'itineraries'), {
        title: newItem.title,
        type: newItem.type,
        location: newItem.location,
        notes: newItem.notes,
        isMain: newItem.isMain,
        startTime: Timestamp.fromDate(startDateTime),
        endTime: endDateTime ? Timestamp.fromDate(endDateTime) : null,
        assignedMemberIds: newItem.isMain ? [] : finalMembers,
        excludedMemberIds: newItem.isMain ? finalMembers : [],
        dayIndex: tripDates.indexOf(activeDate),
        vehicleAssignments: newItem.vehicleAssignments || {},
        isMultiVehicle: newItem.isMultiVehicle || false,
        groupAssignments: newItem.groupAssignments || {},
        isGrouped: newItem.isGrouped || false,
        groups: newItem.groups || [],
        id: Date.now().toString()
      });
      await updateDoc(docRef, { id: docRef.id });
      setIsAdding(false);
      setNewItem({ 
        title: '', type: 'attraction', startTimeStr: '09:00', endTimeStr: '', 
        location: { address: '', navLink: '' }, notes: '', isMain: true,
        excludedMemberIds: [],
        assignedMemberIds: [],
        vehicleAssignments: {},
        isMultiVehicle: false,
        groupAssignments: {},
        isGrouped: false,
        groups: []
      });
      setSelectedMembers([]);
      setMemberSearchTerm('');
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

      const finalMembers = newItem.isMain
        ? [...new Set([...selectedMembers, ...dailyAbsenceIds])]
        : selectedMembers.filter(id => !dailyAbsenceIds.includes(id));

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
        assignedMemberIds: newItem.isMain ? [] : finalMembers,
        excludedMemberIds: newItem.isMain ? finalMembers : [],
        dayIndex: tripDates.indexOf(activeDate),
        vehicleAssignments: newItem.vehicleAssignments || {},
        isMultiVehicle: newItem.isMultiVehicle || false,
        groupAssignments: newItem.groupAssignments || {},
        isGrouped: newItem.isGrouped || false,
        groups: newItem.groups || []
      });
      setEditing(null);
      setSelectedMembers([]);
      setMemberSearchTerm('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${editing.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'itineraries', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `itineraries/${id}`);
    }
  };

  const getTypeColor = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return 'bg-blue-500';
      case 'dining': return 'bg-orange-500';
      case 'transit': return 'bg-stone-500';
      case 'logistics': return 'bg-purple-500';
      case 'accommodation': return 'bg-[#00F3FF]';
      default: return 'bg-stone-500';
    }
  };

  const getTypeLabel = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return '景點';
      case 'dining': return '餐飲';
      case 'transit': return '交通';
      case 'logistics': return '參拜';
      case 'accommodation': return '住宿';
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
      isMain: it.isMain || false,
      excludedMemberIds: it.excludedMemberIds || [],
      assignedMemberIds: it.assignedMemberIds || [],
      vehicleAssignments: it.vehicleAssignments || {},
      isMultiVehicle: it.isMultiVehicle || false,
      groupAssignments: it.groupAssignments || {},
      isGrouped: it.isGrouped || false,
      groups: it.groups || []
    });
    setSelectedMembers(it.isMain ? (it.excludedMemberIds || []) : (it.assignedMemberIds || []));
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
              {safeFormat(parseISO(tripSettings.startDate), 'yyyy/MM/dd')} - {safeFormat(parseISO(tripSettings.endDate), 'yyyy/MM/dd')}
            </button>

            <button 
              onClick={() => {
                setIsAdding(true);
                setEditing(null);
                setNewItem({ 
                  title: '', type: 'attraction', startTimeStr: '09:00', endTimeStr: '', 
                  location: { address: '', navLink: '' }, notes: '', isMain: true,
                  excludedMemberIds: [], assignedMemberIds: [],
                  vehicleAssignments: {},
                  isMultiVehicle: false,
                  groupAssignments: {},
                  isGrouped: false,
                  groups: []
                });
                // 預設排除 當日缺勤 的成員
                setSelectedMembers(dailyAbsenceIds);
              }}
              className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              新增行程
            </button>

            <button 
              onClick={() => setIsAbsenceModalOpen(true)}
              className="flex items-center gap-2 bg-white border border-stone-200 text-red-500 px-4 py-2 rounded-full text-sm font-bold hover:bg-red-50 transition-colors shadow-sm whitespace-nowrap group"
            >
              <UserX className="w-4 h-4" />
              <span>{dailyAbsenceIds.length > 0 ? `已標記 ${dailyAbsenceIds.length} 位缺席` : '當日缺勤管理'}</span>
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
        <div className="flex gap-4 overflow-x-auto pb-6 px-4 py-4 no-scrollbar -mx-4">
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
              <div className="flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 mb-0.5">第 {idx + 1} 天</span>
                <span className="text-base">{safeFormat(parseISO(dateStr), 'yyyy/MM/dd')}</span>
                <div className={cn(
                  "mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all",
                  activeDate === dateStr 
                    ? "bg-white/20 text-white" 
                    : (groupedItineraries[dateStr]?.length || 0) > 0 
                      ? "bg-stone-100 text-stone-600" 
                      : "bg-stone-50 text-stone-300 opacity-50"
                )}>
                  {(groupedItineraries[dateStr]?.length || 0)} 行程
                </div>
              </div>
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
                {safeFormat(parseISO(activeDate), 'yyyy/MM/dd (EEEE)')}
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
                            
                            {it.type !== 'transit' && (
                              <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200 text-[10px] font-bold">
                                {(it.isMain 
                                  ? members.filter(m => !it.excludedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                  : members.filter(m => it.assignedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                ).length} 人
                              </span>
                            )}

                            {it.type === 'transit' && (
                              <div className="flex items-center gap-1.5 font-bold text-[10px] uppercase tracking-wider">
                                {!it.isMultiVehicle ? (
                                  <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                                    {(it.isMain 
                                      ? members.filter(m => !it.excludedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                      : members.filter(m => it.assignedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                    ).length} 人
                                  </span>
                                ) : (
                                  <>
                                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200 shadow-sm">
                                      A車: {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                      ).filter(m => (it.vehicleAssignments?.[m.id] === 'A' || !it.vehicleAssignments?.[m.id])).length} 人
                                    </span>
                                    <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200 shadow-sm">
                                      B車: {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                      ).filter(m => it.vehicleAssignments?.[m.id] === 'B').length} 人
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
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

                          {it.type !== 'accommodation' && it.type !== 'transit' && it.isGrouped && (
                            <div className="w-full mt-3 p-3 bg-purple-50/50 rounded-xl border border-purple-100/50">
                              <div className="flex flex-wrap gap-3">
                                {(() => {
                                  const assignments = it.groupAssignments || {};
                                  const groupNames = Array.from(new Set(Object.values(assignments))).filter(Boolean);
                                  const participants = it.isMain 
                                    ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                    : members.filter(m => it.assignedMemberIds?.includes(m.id));

                                  return groupNames.map(gn => (
                                    <div key={gn} className="flex flex-col gap-1 min-w-[80px]">
                                      <div className="text-[9px] font-black text-purple-500 uppercase tracking-tighter">
                                        {gn} ({participants.filter(m => assignments[m.id] === gn).length}人)
                                      </div>
                                      <div className="flex flex-wrap gap-1">
                                        {participants.filter(m => assignments[m.id] === gn).map(m => (
                                          <span key={m.id} className="text-[9px] text-purple-700 bg-white px-1 py-0.5 rounded border border-purple-100 shadow-sm">
                                            {m.name}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </div>
                          )}

                          {it.type === 'accommodation' && (
                            <div className="w-full mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                              <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                                <span>{it.isGrouped ? '房間分配名單' : '住宿分配名單'}</span>
                                {it.isGrouped && (
                                  <span className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-bold">自定義分房</span>
                                )}
                              </h4>
                              
                              {it.isGrouped ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {(() => {
                                    const assignments = it.groupAssignments || {};
                                    const groupNames = Array.from(new Set(Object.values(assignments))).filter(Boolean);
                                    const participants = it.isMain 
                                      ? members.filter(m => !it.excludedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                                      : members.filter(m => it.assignedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id));

                                    return groupNames.map(gn => (
                                      <div key={gn} className="bg-white/60 p-2 rounded-xl border border-stone-100">
                                        <div className="text-[10px] font-black text-purple-600 uppercase mb-1.5 flex items-center gap-1.5">
                                          <div className="w-1 h-1 rounded-full bg-purple-400" />
                                          {gn}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                          {participants.filter(m => assignments[m.id] === gn).map(m => (
                                            <span key={m.id} className="text-[10px] text-stone-600 bg-stone-50 px-1.5 py-0.5 rounded border border-stone-100">
                                              {m.name}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ));
                                  })()}
                                  {(!it.groupAssignments || Object.keys(it.groupAssignments).length === 0) && (
                                    <div className="col-span-full py-4 text-center border-2 border-dashed border-stone-200 rounded-2xl">
                                      <p className="text-[10px] text-stone-400 font-medium">尚未設定房間分配</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-[10px] font-bold text-blue-500 uppercase mb-2 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                      男生名單 (Males)
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                      ).filter(m => m.gender === '男' || m.gender === 'M').map(m => (
                                        <span key={m.id} className="px-2 py-0.5 bg-white border border-stone-200 rounded text-[10px] text-stone-600">
                                          {m.name}
                                        </span>
                                      ))}
                                      {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                      ).filter(m => m.gender === '男' || m.gender === 'M').length === 0 && (
                                        <span className="text-[10px] text-stone-300 italic">無</span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold text-rose-500 uppercase mb-2 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                      女生名單 (Females)
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                      ).filter(m => m.gender === '女' || m.gender === 'F').map(m => (
                                        <span key={m.id} className="px-2 py-0.5 bg-white border border-stone-200 rounded text-[10px] text-stone-600">
                                          {m.name}
                                        </span>
                                      ))}
                                      {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                      ).filter(m => m.gender === '女' || m.gender === 'F').length === 0 && (
                                        <span className="text-[10px] text-stone-300 italic">無</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {it.type === 'transit' && (
                            <div className="w-full mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-200">
                              <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 flex items-center justify-between w-full">
                                <span>{it.isMultiVehicle ? (it.vehicleAssignments && Object.keys(it.vehicleAssignments).length > 0 ? '分車名單 (動態分配)' : '車序分配名單') : '參與名單 (單一車輛)'}</span>
                                {!it.isMultiVehicle && (
                                  <span className="bg-stone-200 text-stone-600 px-2 py-0.5 rounded-full text-[10px]">
                                    共 {(it.isMain 
                                      ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                      : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                    ).length} 人
                                  </span>
                                )}
                              </h4>
                              {it.isMultiVehicle ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-[10px] font-bold text-amber-600 uppercase mb-2 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      A 車名單
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                      ).filter(m => {
                                        if (it.vehicleAssignments && it.vehicleAssignments[m.id]) {
                                          return it.vehicleAssignments[m.id] === 'A';
                                        }
                                        return false;
                                      }).map(m => (
                                        <span key={m.id} className="px-2 py-0.5 bg-white border border-stone-200 rounded text-[10px] text-stone-600">
                                          {m.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold text-blue-600 uppercase mb-2 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                      B 車名單
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {(it.isMain 
                                        ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                        : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                      ).filter(m => {
                                        if (it.vehicleAssignments && it.vehicleAssignments[m.id]) {
                                          return it.vehicleAssignments[m.id] === 'B';
                                        }
                                        return false;
                                      }).map(m => (
                                        <span key={m.id} className="px-2 py-0.5 bg-white border border-stone-200 rounded text-[10px] text-stone-600">
                                          {m.name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {(it.isMain 
                                    ? members.filter(m => !it.excludedMemberIds?.includes(m.id))
                                    : members.filter(m => it.assignedMemberIds?.includes(m.id))
                                  ).map(m => (
                                    <span key={m.id} className="px-2 py-0.5 bg-white border border-stone-200 rounded text-[10px] text-stone-600">
                                      {m.name}
                                    </span>
                                  ))}
                                </div>
                              )}
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
                              title="編輯"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDelete(it.id)}
                              className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
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
              <p className="text-sm">{safeFormat(parseISO(activeDate), 'yyyy/MM/dd')} 目前無任何行程</p>
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
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">出發日期 (yyyy/mm/dd)</label>
                <input 
                  type="text" 
                  placeholder="例如: 2026/03/27"
                  required
                  value={tempSettings.startDate.replace(/-/g, '/')}
                  onChange={(e) => setTempSettings({...tempSettings, startDate: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">結束日期 (yyyy/mm/dd)</label>
                <input 
                  type="text" 
                  placeholder="例如: 2026/04/05"
                  required
                  value={tempSettings.endDate.replace(/-/g, '/')}
                  onChange={(e) => setTempSettings({...tempSettings, endDate: e.target.value})}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
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
              行程日期: {safeFormat(parseISO(activeDate), 'yyyy/MM/dd (EEEE)')}
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

                <div className="md:col-span-2 flex items-center justify-between gap-4 mb-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500">行程類型 (Type)</label>
                  <label className="flex items-center gap-2 cursor-pointer group/main">
                    <div 
                      onClick={() => setNewItem({...newItem, isMain: !newItem.isMain})}
                      className={cn(
                        "w-5 h-5 rounded border transition-all flex items-center justify-center",
                        newItem.isMain ? "bg-stone-900 border-stone-900 text-white" : "bg-white border-stone-200 group-hover/main:border-stone-400"
                      )}
                    >
                      {newItem.isMain && <Check className="w-3 h-3" />}
                    </div>
                    <span className="text-xs font-medium text-stone-700">主要行程 (所有團員參與)</span>
                  </label>
                </div>
                <div className="md:col-span-2">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(['transit', 'accommodation', 'attraction', 'dining', 'logistics'] as ItineraryType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setNewItem({ ...newItem, type })}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-medium transition-all border",
                          newItem.type === type 
                            ? "bg-stone-900 text-white border-stone-900 shadow-sm shadow-stone-200" 
                            : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 group-active:border-[#00F3FF]"
                        )}
                      >
                        {getTypeLabel(type)}
                      </button>
                    ))}
                  </div>
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
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">備註 (Notes)</label>
                  <textarea 
                    value={newItem.notes}
                    onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 h-24 resize-none"
                  />
                </div>

                {/* Member Selection (Inclusion for Divergent, Exclusion for Main) */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">
                    {newItem.isMain ? '排除不參加的團員 (例如用餐自理)' : '指派參與此脫隊行程的團員'}
                  </label>
                  
                  {/* Search Input */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input 
                      type="text" 
                      placeholder="搜尋團員姓名..."
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 text-sm"
                    />
                  </div>

                  {/* Select by Trip Days */}
                  <div className="flex flex-wrap gap-2 mb-4 p-3 bg-stone-100/40 rounded-2xl border border-stone-200/50">
                    <span className="w-full text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1 ml-1">按天數選取 (By Duration)</span>
                    {[3, 5, 9, 0].map(days => {
                      const categoryMembers = members.filter(m => {
                        if (days === 9) return m.tripDays === 9 || m.tripDays === 8;
                        if (days === 0) return m.tripDays && ![3, 5, 8, 9].includes(m.tripDays);
                        return m.tripDays === days;
                      });
                      
                      if (categoryMembers.length === 0) return null;
                      const allSelected = categoryMembers.every(m => selectedMembers.includes(m.id));
                      const label = days === 0 ? '其他' : `${days}天`;
                      
                      return (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            const ids = categoryMembers.map(m => m.id);
                            if (allSelected) {
                              setSelectedMembers(prev => prev.filter(id => !ids.includes(id)));
                            } else {
                              setSelectedMembers(prev => [...new Set([...prev, ...ids])]);
                            }
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-2",
                            allSelected 
                              ? (newItem.isMain ? "bg-red-500 text-white border-red-500" : "bg-stone-900 text-white border-stone-900 shadow-sm")
                              : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                          )}
                        >
                          {label}
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[9px]",
                            allSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-400"
                          )}>
                            {categoryMembers.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Select by Group */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {groups.map(group => {
                      const groupMembers = members.filter(m => m.groupId === group.id);
                      if (groupMembers.length === 0) return null;
                      
                      const allSelected = groupMembers.every(m => selectedMembers.includes(m.id));
                      
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => {
                            const groupMemberIds = groupMembers.map(m => m.id);
                            if (allSelected) {
                              setSelectedMembers(prev => prev.filter(id => !groupMemberIds.includes(id)));
                            } else {
                              const newSelection = [...new Set([...selectedMembers, ...groupMemberIds])];
                              setSelectedMembers(newSelection);
                            }
                          }}
                          className={cn(
                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all",
                            allSelected 
                              ? (newItem.isMain ? "bg-red-50 text-red-500 border-red-200" : "bg-[#00F3FF]/10 text-[#00F3FF] border-[#00F3FF]")
                              : "bg-white text-stone-400 border-stone-200 hover:border-stone-400"
                          )}
                        >
                          {newItem.isMain ? '全排除: ' : '選取整組: '}{group.name}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-4 bg-stone-50 border border-stone-200 rounded-2xl relative">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {members
                        .filter(m => m.name.toLowerCase().includes(memberSearchTerm.toLowerCase()))
                        .sort((a, b) => {
                          const aSelected = selectedMembers.includes(a.id);
                          const bSelected = selectedMembers.includes(b.id);
                          if (aSelected && !bSelected) return 1;
                          if (!aSelected && bSelected) return -1;
                          return a.name.localeCompare(b.name);
                        })
                        .map(m => (
                          <motion.button
                            layout
                            key={m.id}
                            type="button"
                            onClick={() => {
                              if (dailyAbsenceIds.includes(m.id)) return;
                              if (selectedMembers.includes(m.id)) {
                                setSelectedMembers(selectedMembers.filter(id => id !== m.id));
                              } else {
                                setSelectedMembers([...selectedMembers, m.id]);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-xs font-medium transition-all border relative overflow-hidden group/mbtn",
                              dailyAbsenceIds.includes(m.id)
                                ? "bg-stone-50 text-stone-300 border-stone-100 cursor-not-allowed opacity-60"
                                : selectedMembers.includes(m.id)
                                  ? (newItem.isMain ? "bg-red-500 text-white border-red-500 shadow-md ring-2 ring-red-500/20" : "bg-stone-900 text-white border-stone-900 shadow-md ring-2 ring-stone-900/20")
                                  : "bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:scale-[1.02] hover:shadow-sm"
                            )}
                            disabled={dailyAbsenceIds.includes(m.id)}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-center gap-2">
                              <div className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                m.tripDays ? (m.tripDays >= 8 ? "bg-purple-400" : "bg-teal-400") : "bg-stone-300"
                              )} />
                              <span className={cn(
                                "transition-colors",
                                dailyAbsenceIds.includes(m.id) 
                                  ? "text-stone-300 line-through" 
                                  : (selectedMembers.includes(m.id) ? "text-white" : (m.tripDays ? (m.tripDays >= 8 ? "text-purple-700" : "text-teal-700") : "text-stone-600"))
                              )}>
                                {m.name}
                              </span>
                            </div>
                            
                            {dailyAbsenceIds.includes(m.id) ? (
                              <span className="text-[8px] font-black uppercase tracking-tighter text-red-300/60 flex items-center gap-0.5">
                                <UserX className="w-2.5 h-2.5" /> 當日缺席
                              </span>
                            ) : selectedMembers.includes(m.id) ? (
                              <div className="bg-white/20 p-0.5 rounded-full">
                                {newItem.isMain ? <Plus className="w-2.5 h-2.5 rotate-45" /> : <Check className="w-2.5 h-2.5" />}
                              </div>
                            ) : m.tripDays && (
                              <span className={cn(
                                "text-[9px] font-bold px-1 rounded",
                                m.tripDays >= 8 ? "bg-purple-50 text-purple-400" : "bg-teal-50 text-teal-400"
                              )}>
                                {m.tripDays}D
                              </span>
                            )}
                          </motion.button>
                        ))}
                    </AnimatePresence>
                  </div>

                  {/* Vehicle Assignments for Transit */}
                  {newItem.type === 'transit' && (
                    <div className="mt-6 p-6 bg-stone-50 rounded-2xl border border-stone-200">
                      <div className="flex flex-col gap-4 mb-4 pb-4 border-b border-stone-100">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-bold text-stone-900 border-l-4 border-amber-400 pl-3">
                            動態分車設定 (Vehicle Assignments)
                            <span className="ml-2 px-2 py-0.5 bg-stone-100 text-stone-400 text-[10px] rounded-full font-normal">
                              共 {(newItem.isMain ? members.filter(m => !newItem.excludedMemberIds.includes(m.id)) : members.filter(m => newItem.assignedMemberIds.includes(m.id))).length} 人
                            </span>
                          </label>

                          <div 
                            onClick={() => setNewItem({...newItem, isMultiVehicle: !newItem.isMultiVehicle})}
                            className="flex items-center gap-2 cursor-pointer group bg-white px-3 py-1.5 rounded-full border border-stone-200 hover:border-amber-400 transition-all shadow-sm"
                          >
                            <div className={cn(
                              "relative w-10 h-5 rounded-full transition-colors",
                              newItem.isMultiVehicle ? "bg-amber-500" : "bg-stone-200"
                            )}>
                              <div className={cn(
                                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                                newItem.isMultiVehicle ? "translate-x-5" : ""
                              )} />
                            </div>
                            <span className="text-xs font-bold text-stone-500 group-hover:text-amber-600 transition-colors">兩車制 (A/B Split)</span>
                          </div>
                        </div>

                        {newItem.isMultiVehicle && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setNewItem({...newItem, vehicleAssignments: {}})}
                              className="px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-[10px] font-bold text-red-500 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                            >
                              重設 (Reset)
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {newItem.isMultiVehicle ? (
                        <div className="grid grid-cols-2 gap-4">
                          {/* Column A */}
                          <div className="flex flex-col gap-2">
                            <div className="bg-amber-500/10 border border-amber-500/20 py-2 px-3 rounded-xl flex items-center justify-between">
                              <span className="text-[10px] font-black tracking-widest text-amber-600 uppercase">A 車</span>
                              <span className="text-[10px] font-bold text-amber-500 bg-white/50 px-1.5 py-0.5 rounded">
                                {(newItem.isMain 
                                  ? members.filter(m => !newItem.excludedMemberIds.includes(m.id))
                                  : members.filter(m => newItem.assignedMemberIds.includes(m.id))
                                ).filter(m => newItem.vehicleAssignments[m.id] === 'A' || !newItem.vehicleAssignments[m.id]).length} 人
                              </span>
                            </div>
                            <div className="min-h-40 max-h-60 overflow-y-auto bg-stone-50/50 p-2 border border-stone-100 rounded-2xl flex flex-col gap-2 relative">
                              <AnimatePresence mode="popLayout" initial={false}>
                                {(newItem.isMain 
                                  ? members.filter(m => !newItem.excludedMemberIds.includes(m.id))
                                  : members.filter(m => newItem.assignedMemberIds.includes(m.id))
                                ).filter(m => newItem.vehicleAssignments[m.id] === 'A' || !newItem.vehicleAssignments[m.id]).map(m => (
                                  <motion.div 
                                    key={m.id} 
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                                    onClick={() => {
                                      const next = { ...newItem.vehicleAssignments };
                                      next[m.id] = 'B'; 
                                      setNewItem({ ...newItem, vehicleAssignments: next });
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="group cursor-pointer select-none"
                                  >
                                    <div className="flex items-center justify-between p-2 bg-white border border-stone-200 rounded-xl shadow-sm hover:border-amber-400 hover:shadow-md transition-all">
                                      <span className="text-[11px] font-medium text-stone-700">{m.name}</span>
                                      <span className="text-[9px] text-stone-300 group-hover:text-amber-500 transition-colors font-bold">➔ B車</span>
                                    </div>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                              {((newItem.isMain 
                                ? members.filter(m => !newItem.excludedMemberIds.includes(m.id))
                                : members.filter(m => newItem.assignedMemberIds.includes(m.id))
                               ).filter(m => newItem.vehicleAssignments[m.id] === 'A' || !newItem.vehicleAssignments[m.id]).length === 0) && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                  <span className="text-[10px] uppercase tracking-widest font-bold">空</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Column B */}
                          <div className="flex flex-col gap-2">
                            <div className="bg-blue-500/10 border border-blue-500/20 py-2 px-3 rounded-xl flex items-center justify-between">
                              <span className="text-[10px] font-black tracking-widest text-blue-600 uppercase">B 車</span>
                              <span className="text-[10px] font-bold text-blue-500 bg-white/50 px-1.5 py-0.5 rounded">
                                {(newItem.isMain 
                                  ? members.filter(m => !newItem.excludedMemberIds.includes(m.id))
                                  : members.filter(m => newItem.assignedMemberIds.includes(m.id))
                                ).filter(m => newItem.vehicleAssignments[m.id] === 'B').length} 人
                              </span>
                            </div>
                            <div className="min-h-40 max-h-60 overflow-y-auto bg-stone-50/50 p-2 border border-stone-100 rounded-2xl flex flex-col gap-2 relative">
                              <AnimatePresence mode="popLayout" initial={false}>
                                {(newItem.isMain 
                                  ? members.filter(m => !newItem.excludedMemberIds.includes(m.id))
                                  : members.filter(m => newItem.assignedMemberIds.includes(m.id))
                                ).filter(m => newItem.vehicleAssignments[m.id] === 'B').map(m => (
                                  <motion.div 
                                    key={m.id} 
                                    layout
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                                    onClick={() => {
                                      const next = { ...newItem.vehicleAssignments };
                                      next[m.id] = 'A';
                                      setNewItem({ ...newItem, vehicleAssignments: next });
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    className="group cursor-pointer select-none"
                                  >
                                    <div className="flex items-center justify-between p-2 bg-white border border-stone-200 rounded-xl shadow-sm hover:border-blue-400 hover:shadow-md transition-all">
                                      <span className="text-[11px] font-medium text-stone-700">{m.name}</span>
                                      <span className="text-[9px] text-stone-300 group-hover:text-blue-500 transition-colors font-bold">↞ A車</span>
                                    </div>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                              {((newItem.isMain 
                                ? members.filter(m => !newItem.excludedMemberIds.includes(m.id))
                                : members.filter(m => newItem.assignedMemberIds.includes(m.id))
                               ).filter(m => newItem.vehicleAssignments[m.id] === 'B').length === 0) && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                  <span className="text-[10px] uppercase tracking-widest font-bold">空</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                      ) : (
                        <div className="p-4 bg-stone-100/50 border border-stone-200 rounded-2xl text-center">
                          <p className="text-[10px] text-stone-500 font-bold mb-2 uppercase tracking-widest">目前共 {(newItem.isMain ? members.filter(m => !newItem.excludedMemberIds.includes(m.id)) : members.filter(m => newItem.assignedMemberIds.includes(m.id))).length} 人</p>
                          <p className="text-[10px] text-stone-400 italic">參與名單將統一顯示於單一車輛。</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dynamic Grouping / Rooming Section - Excluded for Transit */}
                  {newItem.type !== 'transit' && (
                    <div className="mt-6 p-6 bg-stone-50 rounded-2xl border border-stone-200">
                    <div className="flex flex-col gap-4 mb-4 pb-4 border-b border-stone-100">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-stone-900 border-l-4 border-purple-400 pl-3">
                          {newItem.type === 'accommodation' ? '動態分房設定 (Room Assignments)' : '動態分組設定 (Group Assignments)'}
                          <span className="ml-2 px-2 py-0.5 bg-stone-100 text-stone-400 text-[10px] rounded-full font-normal">
                            共 {(newItem.isMain ? members.filter(m => !selectedMembers.includes(m.id)) : members.filter(m => selectedMembers.includes(m.id))).length} 人
                          </span>
                        </label>

                        <div 
                          onClick={() => setNewItem({...newItem, isGrouped: !newItem.isGrouped})}
                          className="flex items-center gap-2 cursor-pointer group bg-white px-3 py-1.5 rounded-full border border-stone-200 hover:border-purple-400 transition-all shadow-sm"
                        >
                          <div className={cn(
                            "relative w-10 h-5 rounded-full transition-colors",
                            newItem.isGrouped ? "bg-purple-500" : "bg-stone-200"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm",
                              newItem.isGrouped ? "translate-x-5" : ""
                            )} />
                          </div>
                          <span className="text-xs font-bold text-stone-500 group-hover:text-purple-600 transition-colors">自定義{newItem.type === 'accommodation' ? '房間' : '分組'}</span>
                        </div>
                      </div>

                      {newItem.isGrouped && (
                        <div className="flex flex-col gap-3">
                          <form 
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!newGroupName.trim()) return;
                              if (!newItem.groups.includes(newGroupName.trim())) {
                                setNewItem({...newItem, groups: [...newItem.groups, newGroupName.trim()]});
                              }
                              setNewGroupName('');
                            }}
                            className="flex gap-2"
                          >
                            <input 
                              type="text" 
                              placeholder={`新增${newItem.type === 'accommodation' ? '房間' : '組別'}名稱 (如: 301, 101, 第一組)...`}
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-900/5"
                            />
                            <button 
                              type="submit"
                              className="px-4 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors shadow-sm"
                            >
                              新增
                            </button>
                          </form>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setNewItem({...newItem, groupAssignments: {}, groups: []})}
                              className="px-3 py-1.5 bg-white border border-stone-200 rounded-xl text-[10px] font-bold text-red-500 hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                            >
                              重設所有{newItem.type === 'accommodation' ? '客房' : '分組'} (Reset)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {newItem.isGrouped ? (
                      <div className="space-y-6">
                        {/* Defined Groups */}
                        {(() => {
                          const assignments = newItem.groupAssignments || {};
                          // Use the explicitly defined groups list
                          const groupNames = newItem.groups || [];
                          const participants = newItem.isMain 
                            ? members.filter(m => !selectedMembers.includes(m.id))
                            : members.filter(m => selectedMembers.includes(m.id));

                          return (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {groupNames.map(gn => (
                                  <div key={gn} className="flex flex-col gap-2 relative group">
                                    <div className="bg-purple-500/10 border border-purple-500/20 py-2 px-3 rounded-xl flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black tracking-widest text-purple-600 uppercase">{gn}</span>
                                        <span className="text-[10px] font-bold text-purple-500 bg-white/50 px-1.5 py-0.5 rounded">
                                          {participants.filter(m => assignments[m.id] === gn).length} 人
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextGroups = newItem.groups.filter(g => g !== gn);
                                          const nextAssignments = { ...assignments };
                                          Object.keys(nextAssignments).forEach(mid => {
                                            if (nextAssignments[mid] === gn) delete nextAssignments[mid];
                                          });
                                          setNewItem({...newItem, groups: nextGroups, groupAssignments: nextAssignments});
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded-full text-red-500 transition-all"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <div className="min-h-[60px] max-h-40 overflow-y-auto bg-stone-100/30 p-2 border border-stone-100 rounded-2xl flex flex-wrap gap-1">
                                      {participants.filter(m => assignments[m.id] === gn).map(m => (
                                        <div 
                                          key={m.id}
                                          onClick={() => {
                                            const next = { ...assignments };
                                            delete next[m.id];
                                            setNewItem({ ...newItem, groupAssignments: next });
                                          }}
                                          className="px-2 py-1 bg-white border border-stone-200 rounded-lg shadow-xs text-[10px] text-stone-600 cursor-pointer hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all flex items-center gap-1"
                                        >
                                          {m.name}
                                          <X className="w-2 h-2 opacity-50" />
                                        </div>
                                      ))}
                                      {participants.filter(m => assignments[m.id] === gn).length === 0 && (
                                        <span className="text-[9px] text-stone-300 italic p-1">尚無人員</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                                {groupNames.length === 0 && (
                                  <div className="col-span-full py-8 text-center bg-stone-100/30 border-2 border-dashed border-stone-200 rounded-3xl">
                                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">請先於上方新增{newItem.type === 'accommodation' ? '房間 (房號)' : '分組名稱'}</p>
                                  </div>
                                )}
                              </div>

                              {/* Unassigned Pool */}
                              <div className="pt-4 border-t border-stone-100">
                                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">未分配參與者 (Unassigned Personnel)</label>
                                <div className="flex flex-wrap gap-1.5">
                                  {participants.filter(m => !assignments[m.id]).map(m => (
                                    <div 
                                      key={m.id}
                                      className="flex overflow-hidden rounded-lg border border-stone-200 shadow-sm"
                                    >
                                      <div className="px-2 py-1 bg-white text-[10px] text-stone-600 border-r border-stone-100 font-medium">
                                        {m.name}
                                      </div>
                                      {groupNames.length > 0 ? (
                                        <div className="flex bg-stone-50">
                                          {groupNames.slice(0, 3).map(gn => (
                                            <button 
                                              key={gn}
                                              type="button"
                                              onClick={() => {
                                                const next = { ...assignments, [m.id]: gn };
                                                setNewItem({ ...newItem, groupAssignments: next });
                                              }}
                                              className="px-2 py-1 hover:bg-purple-600 hover:text-white text-stone-400 text-[9px] transition-colors border-r border-stone-100 last:border-r-0"
                                            >
                                              {gn}
                                            </button>
                                          ))}
                                          {groupNames.length > 3 && (
                                            <button 
                                              type="button"
                                              onClick={() => {
                                                const gn = prompt(`請輸入要將 ${m.name} 指派到的${newItem.type === 'accommodation' ? '房號/名稱' : '組別名稱'}:`, (groupNames[0] as string) || '');
                                                if (gn) {
                                                  if (!newItem.groups.includes(gn)) {
                                                    setNewItem({ ...newItem, groups: [...newItem.groups, gn], groupAssignments: { ...assignments, [m.id]: gn } });
                                                  } else {
                                                    setNewItem({ ...newItem, groupAssignments: { ...assignments, [m.id]: gn } });
                                                  }
                                                }
                                              }}
                                              className="px-2 py-1 hover:bg-purple-600 hover:text-white text-stone-400 text-[9px] transition-colors"
                                            >
                                              更多..
                                            </button>
                                          )}
                                        </div>
                                      ) : (
                                        <button 
                                          type="button"
                                          disabled
                                          className="px-2 py-1 bg-stone-100 text-stone-300 text-[9px] cursor-not-allowed"
                                        >
                                          請先建立房號/組別
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  {participants.filter(m => !assignments[m.id]).length === 0 && (
                                    <div className="w-full text-center py-4 bg-green-50/50 rounded-xl border border-dashed border-green-100">
                                      <p className="text-[10px] text-green-600 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                                        <Check className="w-3 h-3" /> 所有人員已分配完畢
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="p-4 bg-stone-100/50 border border-stone-200 rounded-2xl text-center">
                        <p className="text-[10px] text-stone-500 font-bold mb-2 uppercase tracking-widest">目前共 {(newItem.isMain ? members.filter(m => !selectedMembers.includes(m.id)) : members.filter(m => selectedMembers.includes(m.id))).length} 人</p>
                        <p className="text-[10px] text-stone-400 italic">全體統一活動，未開啟細分{newItem.type === 'accommodation' ? '客房' : '組別'}。</p>
                      </div>
                    )}
                  </div>
                  )}

                  <p className="text-[10px] text-stone-400 mt-2">
                    {newItem.isMain ? `已排除 ${selectedMembers.length} 名團員 (其餘全員參加)` : `已指派 ${selectedMembers.length} 位參與者`}
                  </p>
                </div>
               </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => { setIsAdding(false); setEditing(null); setSelectedMembers([]); setMemberSearchTerm(''); }}
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

      <DailyAbsenceManager 
        isOpen={isAbsenceModalOpen}
        onClose={() => setIsAbsenceModalOpen(false)}
        date={activeDate}
        members={members}
        tripSettings={tripSettings}
      />
    </div>
  );
}
