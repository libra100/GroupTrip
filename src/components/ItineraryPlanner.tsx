import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Itinerary, Member, Group, ItineraryType, TripSettings, DailyAbsence } from '../types';
import { format, parseISO, addDays, differenceInDays } from 'date-fns';
import { cn, getMemberTripDayColor } from '../lib/utils';
import { doc, onSnapshot, Timestamp, setDoc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
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
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
  UserX,
  History,
  Copy,
  LayoutGrid,
  Search,
  Home,
  UtensilsCrossed,
  Milestone
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isActuallyDeleting, setIsActuallyDeleting] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  const [isSettingTrip, setIsSettingTrip] = useState(false);
  const [tempSettings, setTempSettings] = useState<TripSettings>({ startDate: '', endDate: '', officialStartDate: '' });

  const [activeDate, setActiveDate] = useState<string>(safeFormat(new Date(), 'yyyy-MM-dd'));
  const [isBasicInfoExpanded, setIsBasicInfoExpanded] = useState(true);
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
    roomAssignments: Record<string, string>;
    isMultiRoom: boolean;
    rooms: string[];
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
    roomAssignments: {},
    isMultiRoom: false,
    rooms: []
  });

  const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);

  const dailyAbsenceIds = useMemo(() => {
    if (!activeDate || !tripSettings?.dailyAbsences) return [];
    return tripSettings.dailyAbsences[activeDate] || [];
  }, [activeDate, tripSettings]);

  const tripDates = React.useMemo(() => {
    if (!tripSettings?.startDate || !tripSettings?.endDate) return [];
    const start = parseISO(tripSettings.startDate);
    const end = parseISO(tripSettings.endDate);
    const days = differenceInDays(end, start) + 1;
    if (days <= 0 || days > 180) return [];
    return Array.from({ length: days }).map((_, i) => safeFormat(addDays(start, i), 'yyyy-MM-dd'));
  }, [tripSettings]);

  useEffect(() => {
    if (tripDates.length > 0 && !tripDates.includes(activeDate)) {
      setActiveDate(tripDates[0]);
    }
  }, [tripDates, activeDate]);

  const groupedItineraries = itineraries.reduce((groups, it) => {
    if (it.startTime) {
      const date = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
      if (!isNaN(date.getTime())) {
        const dateStr = safeFormat(date, 'yyyy-MM-dd');
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(it);
      }
    } else if (it.dayIndex !== undefined && tripDates[it.dayIndex]) {
      const dateStrAtIdx = tripDates[it.dayIndex];
      if (!groups[dateStrAtIdx]) groups[dateStrAtIdx] = [];
      groups[dateStrAtIdx].push(it);
    }
    return groups;
  }, {} as Record<string, Itinerary[]>);

  const handleSaveTripSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempSettings.startDate || !tempSettings.endDate) return;
    if (tempSettings.startDate > tempSettings.endDate) {
      alert('結束日期不能早於起始日期。');
      return;
    }
    try {
      const finalOfficialStart = tempSettings.officialStartDate || tempSettings.startDate;
      await setDoc(doc(db, 'settings', 'tripSettings'), {
        startDate: tempSettings.startDate,
        endDate: tempSettings.endDate,
        officialStartDate: finalOfficialStart
      }, { merge: true });
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
      const newDocRef = doc(collection(db, 'itineraries'));
      await setDoc(newDocRef, {
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
        roomAssignments: newItem.roomAssignments || {},
        isMultiRoom: newItem.isMultiRoom || false,
        rooms: newItem.rooms || [],
        id: newDocRef.id
      });
      setIsAdding(false);
      setNewItem({ 
        title: '', type: 'attraction', startTimeStr: '09:00', endTimeStr: '', 
        location: { address: '', navLink: '' }, notes: '', isMain: true,
        excludedMemberIds: [], assignedMemberIds: [],
        vehicleAssignments: {}, isMultiVehicle: false,
        roomAssignments: {}, isMultiRoom: false, rooms: []
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
        roomAssignments: newItem.roomAssignments || {},
        isMultiRoom: newItem.isMultiRoom || false,
        rooms: newItem.rooms || []
      });
      setEditing(null);
      setSelectedMembers([]);
      setMemberSearchTerm('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${editing.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    
    try {
      // 1. Delete associated roll call if it exists
      // The roll call ID is rc_{id} (sanitized)
      const rollCallId = `rc_${id}`.replace(/\//g, '_');
      await deleteDoc(doc(db, 'rollcalls', rollCallId)).catch(() => {}); // Ignore error if not exists
      
      // 2. Delete the itinerary itself
      await deleteDoc(doc(db, 'itineraries', id));
    } catch (error) {
      console.error('Delete failed:', error);
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

  const getTypeHex = (type: ItineraryType) => {
    switch (type) {
      case 'attraction': return '#3b82f6';
      case 'dining': return '#f97316';
      case 'transit': return '#78716c';
      case 'logistics': return '#a855f7';
      case 'accommodation': return '#00F3FF';
      default: return '#78716c';
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
      roomAssignments: it.roomAssignments || {},
      isMultiRoom: it.isMultiRoom || false
    });
    setSelectedMembers(it.isMain ? (it.excludedMemberIds || []) : (it.assignedMemberIds || []));
    setIsBasicInfoExpanded(it.isMain && !it.isMultiVehicle && !it.isMultiRoom);
  };

  const dayItineraries = groupedItineraries[activeDate] || [];

  return (
    <div className="space-y-4 pb-20">
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
                setIsBasicInfoExpanded(true);
                setNewItem({ 
                  title: '', type: 'attraction', startTimeStr: '09:00', endTimeStr: '', 
                  location: { address: '', navLink: '' }, notes: '', isMain: true,
                  excludedMemberIds: [], assignedMemberIds: [],
                  vehicleAssignments: {}, isMultiVehicle: false,
                  roomAssignments: {}, isMultiRoom: false, rooms: []
                });
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

      {tripDates.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-6 px-4 py-4 no-scrollbar -mx-4">
          {tripDates.map((dateStr) => (
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
                <span className="text-xs uppercase font-black tracking-widest opacity-80 mb-1">
                  {(() => {
                    const officialStart = tripSettings?.officialStartDate ? parseISO(tripSettings.officialStartDate) : parseISO(tripSettings?.startDate || '');
                    const current = parseISO(dateStr);
                    const diff = differenceInDays(current, officialStart);
                    const dayNum = diff + 1;
                    if (dayNum === 1) return 'D1 (正式出發)';
                    return `D${dayNum}`;
                  })()}
                </span>
                <span className="text-lg font-black tracking-tight">{safeFormat(parseISO(dateStr), 'yyyy/MM/dd')}</span>
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
            <div className="relative space-y-0 before:absolute before:left-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200 xl:before:left-1/2">
              {dayItineraries.sort((a, b) => {
                const aT = a.startTime instanceof Timestamp ? a.startTime.toMillis() : new Date(a.startTime).getTime();
                const bT = b.startTime instanceof Timestamp ? b.startTime.toMillis() : new Date(b.startTime).getTime();
                return aT - bT;
              }).map((it, index) => {
                const start = it.startTime instanceof Timestamp ? it.startTime.toDate() : new Date(it.startTime);
                if (isNaN(start.getTime())) return null;
                const isLeft = index % 2 === 0;

                const itCard = (
                  <div className={cn(
                    "bg-white p-4 px-7 rounded-[2rem] border border-stone-200 shadow-sm hover:shadow-lg transition-all group/card flex items-center gap-5 min-w-[320px] max-w-full relative z-10",
                    isLeft ? "xl:flex-row flex-row" : "xl:flex-row-reverse flex-row" // On smaller screens, always flex-row (label on left)
                  )}>
                    <div className="flex flex-col items-center flex-shrink-0">
                      <span className={cn("px-2.5 py-1 rounded-lg text-[10px] uppercase font-black text-white shadow-sm", getTypeColor(it.type))}>{getTypeLabel(it.type)}</span>
                    </div>
                    <div className="w-px h-8 bg-stone-100" />
                    <div className={cn("flex flex-col min-w-0 flex-1", (!isLeft) ? "xl:items-end xl:text-right text-left" : "xl:items-start text-left")}>
                       <div className={cn("flex items-center gap-3", (!isLeft) ? "xl:flex-row-reverse flex-row" : "flex-row")}>
                         <h3 className="text-lg font-black text-stone-800 leading-tight tracking-tight break-words">{it.title}</h3>
                         { (() => {
                            const participants = it.isMain 
                              ? members.filter(m => !it.excludedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id))
                              : members.filter(m => it.assignedMemberIds?.includes(m.id) && !dailyAbsenceIds.includes(m.id));

                            if (it.type === 'transit' && it.isMultiVehicle) {
                              const car1Count = participants.filter(p => (it.vehicleAssignments?.[p.id] || '1') === '1').length;
                              const car2Count = participants.filter(p => it.vehicleAssignments?.[p.id] === '2').length;
                              return (
                                <div className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
                                   <span className="text-[10px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 uppercase tracking-tighter">{car1Count}人</span>
                                   <span className="text-[10px] font-black text-purple-500 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100 uppercase tracking-tighter">{car2Count}人</span>
                                </div>
                              );
                            }

                            if (it.type === 'accommodation' && it.isMultiRoom) {
                              const roomAssignments = it.roomAssignments || {};
                              const uniqueRooms = [...new Set(Object.values(roomAssignments).filter(r => r !== ''))];
                              const roomCount = uniqueRooms.length;
                              
                              return (
                                <div className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0">
                                   <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 uppercase tracking-tighter">
                                     {roomCount || 0} 間房
                                   </span>
                                </div>
                              );
                            }
                            return (
                              <span className="text-xs font-black text-stone-400 bg-stone-50 px-2 py-0.5 rounded-lg border border-stone-100 uppercase whitespace-nowrap flex-shrink-0">
                                {participants.length} 人
                              </span>
                            );
                          })()}
                          {!it.isMain && <span className="text-xs font-black text-purple-500 uppercase tracking-widest bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100 whitespace-nowrap flex-shrink-0">脫隊</span>}
                       </div>
                       {it.notes && <p className="text-xs text-stone-400 line-clamp-1 opacity-80 leading-relaxed font-medium">{it.notes}</p>}
                    </div>
                    <div className={cn("flex items-center gap-2 opacity-0 group-hover/card:opacity-100 transition-all", (!isLeft) ? "xl:flex-row-reverse flex-row" : "flex-row")}>
                      <button onClick={() => handleEditClick(it)} className="p-1.5 text-stone-300 hover:text-stone-900 transition-colors"><Edit2 className="w-4 h-4" /></button>
                      
                      {deletingId === it.id ? (
                        <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100 animate-in fade-in slide-in-from-right-2 duration-200">
                          <button 
                            disabled={isActuallyDeleting}
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              setIsActuallyDeleting(true);
                              await handleDelete(it.id); 
                              setIsActuallyDeleting(false);
                              setDeletingId(null); 
                            }} 
                            className="px-2 py-1 bg-red-500 text-white text-[10px] font-black rounded-md shadow-sm hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {isActuallyDeleting ? '刪除中...' : '確定刪除'}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} 
                            className="p-1 text-stone-400 hover:text-stone-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setDeletingId(it.id); }} 
                          className="p-1.5 text-stone-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );

                return (
                  <div key={it.id} className="relative flex flex-row items-center py-6 w-full group">
                    {/* Zone 1: Desktop Left Area (Only active on XL) */}
                    <div className="hidden xl:flex flex-1 basis-0 min-w-0 justify-end items-center">
                      {!isLeft && (
                        <div className="flex items-center w-full justify-end pr-10">
                          {itCard}
                          <div className="h-[2px] w-10 bg-stone-200 group-hover:bg-stone-300 transition-colors flex-shrink-0" />
                        </div>
                      )}
                    </div>

                    {/* Zone 2: Time Axis & Circle */}
                    <div className="flex justify-center items-center w-12 xl:w-20 z-10 flex-shrink-0">
                       {(() => {
                         const h = start.getHours();
                         const m = start.getMinutes();
                         const r = 22;
                         const c = 2 * Math.PI * r;
                         const passed = (m / 60) * c;
                         const remaining = c - passed;
                         const hex = getTypeHex(it.type);
                        return (
                          <div className="relative w-12 h-12 flex items-center justify-center bg-white rounded-full shadow-md ring-4 ring-white transition-transform group-hover:scale-110">
                             <div className="absolute inset-0.5 rounded-full bg-white" />
                             <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 48 48">
                               <circle cx="24" cy="24" r={r} fill="white" stroke="#f5f5f4" strokeWidth="2.5" />
                               <motion.circle 
                                 cx="24" cy="24" r={r} fill="transparent" stroke={hex} strokeWidth="4"
                                 strokeDasharray={`${remaining} ${c}`}
                                 initial={{ strokeDashoffset: -passed }} animate={{ strokeDashoffset: -passed }}
                                 transition={{ duration: 1.5, ease: "easeOut" }} strokeLinecap="round"
                               />
                             </svg>
                             <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-stone-900">
                               {String(h).padStart(2, '0')}
                             </span>
                          </div>
                        );
                       })()}
                    </div>

                    {/* Zone 3: Right Area (Mobile Default / Desktop staggered) */}
                    <div className={cn(
                      "flex-1 basis-0 min-w-0 flex items-center",
                      (!isLeft) ? "xl:hidden" : ""
                    )}>
                      <div className="flex items-center w-full pl-6 xl:pl-10">
                        <div className="h-[2px] w-6 xl:w-10 bg-stone-200 group-hover:bg-stone-300 transition-colors flex-shrink-0" />
                        {itCard}
                      </div>
                    </div>

                    {/* Desktop Filler for symmetry */}
                    {!isLeft && <div className="hidden xl:block flex-1 basis-0 min-w-0" />}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20 text-stone-400 bg-white border border-stone-200 rounded-3xl shadow-sm border-dashed">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-bold text-stone-500">{safeFormat(parseISO(activeDate), 'yyyy/MM/dd')} 尚未安排行程</p>
            </div>
          )}
        </div>
      )}

      {/* Restore the Complex Modal - Not doing Full rewrite of Modal here to save tokens, but will ensure it's functional */}
      {/* (Adding/Editing Logic was already functional, just needed the lists back on timeline) */}

      {(isAdding || editing) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col relative">
            <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-stone-50">
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-serif font-black text-stone-900 leading-tight whitespace-nowrap">
                    {isAdding ? '新增行程' : '編輯行程'}
                  </h3>

                  <div className="flex items-center gap-1 bg-stone-100 p-1.5 rounded-2xl border border-stone-200 flex-shrink-0 shadow-inner">
                    <Clock className="w-4 h-4 text-stone-400 ml-2" />
                    <input 
                      type="time" 
                      required 
                      disabled={!isBasicInfoExpanded}
                      value={newItem.startTimeStr} 
                      onChange={(e) => setNewItem({...newItem, startTimeStr: e.target.value})} 
                      className={cn(
                        "bg-transparent border-none focus:ring-0 text-sm font-black w-28 px-1 transition-all",
                        isBasicInfoExpanded ? "text-stone-900" : "text-stone-400"
                      )}
                    />
                    {(!isBasicInfoExpanded && !newItem.endTimeStr) ? null : (
                      <>
                        <span className="text-stone-300 text-xs font-bold">-</span>
                        <input 
                          type="time" 
                          disabled={!isBasicInfoExpanded}
                          value={newItem.endTimeStr} 
                          onChange={(e) => setNewItem({...newItem, endTimeStr: e.target.value})} 
                          className={cn(
                            "bg-transparent border-none focus:ring-0 text-sm font-black w-28 px-1 transition-all",
                            isBasicInfoExpanded ? "text-stone-400" : "text-stone-200"
                          )}
                          placeholder="結束時間"
                        />
                      </>
                    )}
                  </div>
                  
                  <span className="px-3 py-1.5 bg-stone-50 text-stone-500 rounded-xl text-xs font-black uppercase tracking-widest border border-stone-100 flex-shrink-0">
                    {safeFormat(parseISO(activeDate), 'yyyy/MM/dd')}
                  </span>

                  {isBasicInfoExpanded && (
                    <div className="flex items-center gap-2">
                      <button 
                        type="button" 
                        onClick={() => setNewItem({...newItem, isMain: !newItem.isMain})} 
                        className={cn(
                          "h-8 px-3 rounded-lg font-black text-[11px] transition-all border uppercase tracking-widest", 
                          newItem.isMain ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-400 border-stone-100"
                        )}
                      >
                        {newItem.isMain ? '全員參與' : '脫隊行程'}
                      </button>

                      {(newItem.type === 'transit' || newItem.type === 'accommodation') && (
                        <button 
                          type="button"
                          onClick={() => {
                            if (newItem.type === 'transit') {
                              setNewItem({ ...newItem, isMultiVehicle: !newItem.isMultiVehicle });
                            } else {
                              setNewItem({ ...newItem, isMultiRoom: !newItem.isMultiRoom });
                            }
                          }}
                          className={cn(
                            "h-8 px-3 rounded-lg flex items-center gap-2 transition-all border",
                            (newItem.type === 'transit' ? newItem.isMultiVehicle : newItem.isMultiRoom) 
                              ? "bg-blue-600 border-blue-600 text-white" 
                              : "bg-white border-stone-100 text-stone-400"
                          )}
                        >
                          <span className="text-[11px] font-black uppercase">
                          {newItem.type === 'transit' ? '啟動分車' : '啟動分房'}
                        </span>
                          <div className={cn(
                            "w-5 h-2.5 rounded-full relative transition-all",
                            (newItem.type === 'transit' ? newItem.isMultiVehicle : newItem.isMultiRoom) ? "bg-white/20" : "bg-stone-100"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full transition-transform",
                              (newItem.type === 'transit' ? newItem.isMultiVehicle : newItem.isMultiRoom) 
                                ? "translate-x-2.5 bg-white" 
                                : "bg-stone-300"
                            )} />
                          </div>
                        </button>
                      )}
                    </div>
                  )}

                  {!isBasicInfoExpanded && (
                    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                      <div className="h-6 w-[1px] bg-stone-200 hidden sm:block flex-shrink-0" />
                      <span className={cn("px-2.5 py-1 rounded-lg text-[9px] uppercase font-black text-white shadow-sm flex-shrink-0", getTypeColor(newItem.type))}>
                        {getTypeLabel(newItem.type)}
                      </span>
                      <span className="text-sm font-black text-stone-600 truncate">{newItem.title}</span>
                      
                      <button 
                        type="button"
                        onClick={() => setIsBasicInfoExpanded(true)}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-stone-800 transition-all shadow-sm"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        編輯基本資料
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={() => { setIsAdding(false); setEditing(null); setSelectedMembers([]); setMemberSearchTerm(''); }}
                className="p-3 hover:bg-stone-50 rounded-full transition-all text-stone-400 hover:text-stone-900 flex-shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form 
              id="itinerary-form"
              onSubmit={isAdding ? handleAdd : handleUpdate} 
              className="flex-1 overflow-y-auto custom-scrollbar px-8 pt-4 pb-6"
            >
              <AnimatePresence initial={false}>
                {isBasicInfoExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-4 pb-4"
                  >
                    <div className="grid grid-cols-1 gap-4">
                      <div className="flex-1">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">行程名稱 / Title</label>
                        <input type="text" required value={newItem.title} onChange={(e) => setNewItem({...newItem, title: e.target.value})} className="w-full px-6 py-4 bg-white border border-stone-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-stone-900/5 transition-all text-stone-800 font-bold h-20" placeholder="請輸入行程名稱..." />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-3">類型 / Category</label>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { id: 'attraction', icon: MapPin },
                            { id: 'dining', icon: UtensilsCrossed },
                            { id: 'transit', icon: Car },
                            { id: 'logistics', icon: Milestone },
                            { id: 'accommodation', icon: Home }
                          ].map((t) => {
                            const Icon = t.icon;
                            const isSelected = newItem.type === t.id;
                            const typeId = t.id as ItineraryType;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setNewItem({ ...newItem, type: typeId })}
                                className={cn(
                                  "flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border-2 transition-all group relative overflow-hidden",
                                  isSelected 
                                    ? cn("border-transparent text-white shadow-lg scale-105 z-10", getTypeColor(typeId))
                                    : "bg-white border-stone-100 text-stone-400 hover:border-stone-200"
                                )}
                              >
                                <Icon className={cn("w-4 h-4 transition-transform", isSelected ? "scale-110" : "group-hover:scale-110")} />
                                <span className="text-[10px] font-black uppercase tracking-tight">{getTypeLabel(typeId)}</span>
                                {isSelected && (
                                  <motion.div layoutId="active-type" className="absolute inset-0 bg-white/10 -z-10" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>


                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">備註說明 / Notes</label>
                      <textarea value={newItem.notes} onChange={(e) => setNewItem({...newItem, notes: e.target.value})} className="w-full px-6 py-3 bg-white border border-stone-100 rounded-2xl focus:outline-none focus:ring-4 focus:ring-stone-900/5 h-20 resize-none transition-all font-medium text-stone-700 text-sm" placeholder="補充資訊..." />
                    </div>

                    <button 
                      type="button" 
                      onClick={() => setIsBasicInfoExpanded(false)}
                      className="w-full py-4 bg-stone-50 text-stone-600 rounded-2xl font-black text-sm uppercase tracking-widest border-2 border-stone-100 hover:bg-stone-100 transition-all flex items-center justify-center gap-2 group"
                    >
                      <Users className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      管理人員 (Manage Personnel)
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-6">

                {!isBasicInfoExpanded && (
                  <>
                    {/* Member Management Section */}
                    <div className="bg-stone-50/50 p-6 rounded-[2rem] border border-stone-100">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-xs font-black text-stone-900 uppercase">{newItem.isMain ? '排除不參加人員' : '指派參與人員'}</h4>
                        <span className="text-[10px] font-black bg-stone-900 text-white px-2 py-0.5 rounded-full">{selectedMembers.length} 人</span>
                      </div>
                      <div className="relative mb-4">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                        <input type="text" placeholder="搜尋團員..." value={memberSearchTerm} onChange={(e) => setMemberSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-stone-100 focus:border-stone-900/20 text-sm font-bold bg-white" />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-1">
                        {members.filter(m => m.name.includes(memberSearchTerm)).map(m => {
                          const isSelected = selectedMembers.includes(m.id);
                          const isAbsent = dailyAbsenceIds.includes(m.id);
                          const isParticipating = !isAbsent && (newItem.isMain ? !isSelected : isSelected);
                          const carAssignment = newItem.vehicleAssignments?.[m.id] || '1';
                          
                          return (
                            <div key={m.id} className="relative group">
                              <div className={cn(
                                "flex items-center rounded-xl border-2 transition-all shadow-sm overflow-hidden",
                                getMemberTripDayColor(m.tripDays, isSelected),
                                isSelected ? "scale-95 shadow-inner opacity-60" : "bg-white",
                                isAbsent && "opacity-20 grayscale cursor-not-allowed"
                              )}>
                                <button 
                                  type="button" 
                                  disabled={isAbsent} 
                                  onClick={() => setSelectedMembers(prev => isSelected ? prev.filter(id => id !== m.id) : [...prev, m.id])} 
                                  className="flex-1 px-3 py-4 text-xs font-black text-left leading-tight break-all overflow-hidden"
                                >
                                  {m.name}
                                </button>
                                
                                {/* Car Assignment UI - Side-by-side inside the tile */}
                                {(isParticipating && newItem.type === 'transit' && newItem.isMultiVehicle) && (
                                  <div className="flex flex-col gap-0.5 p-1 bg-stone-100/50 border-l border-stone-100 flex-shrink-0">
                                    <button 
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setNewItem({ ...newItem, vehicleAssignments: { ...newItem.vehicleAssignments, [m.id]: '1' } }); }}
                                      className={cn(
                                        "w-6 h-5 rounded-md text-[9px] font-black flex items-center justify-center border transition-all", 
                                        carAssignment === '1' 
                                          ? "bg-blue-500 text-white border-blue-600 shadow-sm" 
                                          : "bg-white text-stone-400 border-stone-200 hover:border-blue-300"
                                      )}
                                    >1</button>
                                    <button 
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setNewItem({ ...newItem, vehicleAssignments: { ...newItem.vehicleAssignments, [m.id]: '2' } }); }}
                                      className={cn(
                                        "w-6 h-5 rounded-md text-[9px] font-black flex items-center justify-center border transition-all", 
                                        carAssignment === '2' 
                                          ? "bg-purple-500 text-white border-purple-600 shadow-sm" 
                                          : "bg-white text-stone-400 border-stone-200 hover:border-purple-300"
                                      )}
                                    >2</button>
                                  </div>
                                )}

                                {/* Room Assignment UI - Flexible Input */}
                                {(isParticipating && newItem.type === 'accommodation' && newItem.isMultiRoom) && (
                                  <div className="flex flex-col items-center justify-center p-2 bg-stone-100/50 border-l border-stone-100 flex-shrink-0 min-w-[60px]">
                                    <span className="text-[8px] font-black text-stone-400 uppercase mb-1">房號</span>
                                    <input 
                                      type="text"
                                      value={newItem.roomAssignments?.[m.id] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value.slice(0, 6);
                                        setNewItem({ ...newItem, roomAssignments: { ...newItem.roomAssignments, [m.id]: val } });
                                      }}
                                      placeholder="---"
                                      className="w-12 h-6 bg-white border border-stone-200 rounded-md text-[10px] font-black text-center focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-stone-800"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Specialized Assignments Detail (Moved toggle to Basic Info, but keeping message here) */}
                    {(newItem.type === 'transit' || newItem.type === 'accommodation') && (
                      <div className="p-1 px-4 text-[9px] text-stone-400 font-bold uppercase">
                        {((newItem.type === 'transit' && newItem.isMultiVehicle) || (newItem.type === 'accommodation' && newItem.isMultiRoom)) && (
                          "請於下方輸入特定成員的房號 (如 101, 202) 或車序..."
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </form>

            <div className="px-8 pb-8 pt-6 bg-white border-t border-stone-50 text-center">
              <button 
                type="submit" 
                form="itinerary-form"
                className="w-full py-5 bg-stone-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] hover:bg-stone-800"
              >
                {isAdding ? '建立新行程 (Create)' : '儲存變更 (Save Changes)'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Trip Settings Modal */}
      {isSettingTrip && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSettingTrip(false)}
            className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-stone-100"
          >
            <div className="p-8 border-b border-stone-50 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-serif font-black text-stone-900">設定旅遊日期</h3>
                <p className="text-stone-400 text-[10px] font-black uppercase tracking-widest mt-1">Trip Schedule Settings</p>
              </div>
              <button 
                onClick={() => setIsSettingTrip(false)}
                className="p-3 hover:bg-stone-50 rounded-2xl transition-colors text-stone-400 hover:text-stone-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSaveTripSettings} className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-stone-400">顯示起始日期 (Start Date)</label>
                  <input 
                    type="date" 
                    required
                    value={tempSettings.startDate}
                    onChange={(e) => setTempSettings({ ...tempSettings, startDate: e.target.value })}
                    className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-stone-900/5 transition-all text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-stone-400">顯示結束日期 (End Date)</label>
                  <input 
                    type="date" 
                    required
                    value={tempSettings.endDate}
                    onChange={(e) => setTempSettings({ ...tempSettings, endDate: e.target.value })}
                    className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-stone-900/5 transition-all text-sm font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-widest text-stone-400">官方正式出發日 (Official D1)</label>
                  <input 
                    type="date" 
                    value={tempSettings.officialStartDate || ''}
                    placeholder="若空白則以起始日為準"
                    onChange={(e) => setTempSettings({ ...tempSettings, officialStartDate: e.target.value })}
                    className="w-full px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-[#00F3FF]/10 transition-all text-sm font-bold border-[#00F3FF]/30"
                  />
                  <p className="text-[10px] text-stone-400 font-medium italic mt-1 px-1">正式出發當天將被標記為 D1，其餘天數會自動對應。</p>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  type="submit" 
                  className="w-full py-5 bg-stone-900 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-[0.98] hover:bg-stone-800"
                >
                  確認儲存設定 (Update)
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      <DailyAbsenceManager 
        isOpen={isAbsenceModalOpen}
        onClose={() => setIsAbsenceModalOpen(false)}
        date={activeDate}
        members={members}
        groups={groups}
        tripSettings={tripSettings}
      />
    </div>
  );
}
