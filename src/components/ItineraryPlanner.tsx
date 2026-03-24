import React, { useState } from 'react';
import { Itinerary, Member, ItineraryType } from '../types';
import { 
  Plus, 
  Calendar, 
  MapPin, 
  Clock, 
  Info, 
  Trash2, 
  Edit2, 
  ExternalLink,
  Users,
  Check
} from 'lucide-react';
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { format, parseISO, startOfDay } from 'date-fns';
import { cn } from '../lib/utils';

interface ItineraryPlannerProps {
  itineraries: Itinerary[];
  members: Member[];
}

export default function ItineraryPlanner({ itineraries, members }: ItineraryPlannerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<Itinerary | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const [newItem, setNewItem] = useState<Partial<Itinerary>>({
    title: '',
    type: 'attraction',
    startTime: '',
    endTime: '',
    location: { address: '', navLink: '' },
    notes: '',
    isMain: true,
    assignedMemberIds: []
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.title || !newItem.startTime) return;

    try {
      const docRef = await addDoc(collection(db, 'itineraries'), {
        ...newItem,
        startTime: Timestamp.fromDate(new Date(newItem.startTime)),
        endTime: newItem.endTime ? Timestamp.fromDate(new Date(newItem.endTime)) : null,
        assignedMemberIds: newItem.isMain ? [] : selectedMembers,
        id: Date.now().toString()
      });
      await updateDoc(docRef, { id: docRef.id });
      setIsAdding(false);
      setNewItem({ title: '', type: 'attraction', startTime: '', endTime: '', location: { address: '', navLink: '' }, notes: '', isMain: true, assignedMemberIds: [] });
      setSelectedMembers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'itineraries');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.title) return;

    try {
      const ref = doc(db, 'itineraries', editing.id);
      await updateDoc(ref, {
        ...editing,
        startTime: editing.startTime instanceof Timestamp ? editing.startTime : Timestamp.fromDate(new Date(editing.startTime)),
        endTime: editing.endTime ? (editing.endTime instanceof Timestamp ? editing.endTime : Timestamp.fromDate(new Date(editing.endTime))) : null,
        assignedMemberIds: editing.isMain ? [] : selectedMembers
      });
      setEditing(null);
      setSelectedMembers([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `itineraries/${editing.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this itinerary?")) return;
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

  // Group itineraries by date
  const groupedItineraries = itineraries.reduce((groups, it) => {
    const date = it.startTime?.toDate?.() || new Date(it.startTime);
    const dateStr = format(date, 'yyyy-MM-dd');
    if (!groups[dateStr]) {
      groups[dateStr] = [];
    }
    groups[dateStr].push(it);
    return groups;
  }, {} as Record<string, Itinerary[]>);

  const sortedDates = Object.keys(groupedItineraries).sort();

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-light mb-1">Itinerary Planner</h2>
          <p className="text-stone-500">Schedule main events and divergent sub-itineraries.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-stone-900 text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {/* Day Navigation */}
      {sortedDates.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {sortedDates.map((dateStr, idx) => (
            <button
              key={dateStr}
              onClick={() => {
                const element = document.getElementById(`day-${dateStr}`);
                element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="flex-shrink-0 px-4 py-2 bg-white border border-stone-200 rounded-full text-sm font-medium hover:bg-stone-50 transition-colors shadow-sm"
            >
              Day {idx + 1}: {format(parseISO(dateStr), 'MMM d')}
            </button>
          ))}
        </div>
      )}

      {/* Timeline View */}
      <div className="space-y-12">
        {sortedDates.map((dateStr, dayIdx) => (
          <div key={dateStr} id={`day-${dateStr}`} className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-stone-200" />
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-stone-400">
                Day {dayIdx + 1} — {format(parseISO(dateStr), 'EEEE, MMMM do')}
              </h3>
              <div className="h-px flex-1 bg-stone-200" />
            </div>

            <div className="relative space-y-6 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-stone-200 lg:before:left-1/2">
              {groupedItineraries[dateStr].map((it, index) => {
                const start = it.startTime?.toDate?.() || new Date(it.startTime);
                const end = it.endTime ? (it.endTime?.toDate?.() || new Date(it.endTime)) : null;
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
                                Divergent
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
                              {format(start, 'HH:mm')}
                              {it.endTime && (
                                <> - {format(end, 'HH:mm')}</>
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
                              {it.assignedMemberIds.length} members assigned
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
                              onClick={() => { setEditing(it); setSelectedMembers(it.assignedMemberIds || []); }}
                              className="p-2 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
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
          </div>
        ))}
        
        {itineraries.length === 0 && (
          <div className="text-center py-20 text-stone-400">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No itinerary events scheduled yet.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {(isAdding || editing) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-2xl font-serif mb-6">
              {isAdding ? 'Add Itinerary Event' : 'Edit Itinerary Event'}
            </h3>
            <form onSubmit={isAdding ? handleAdd : handleUpdate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Title</label>
                  <input 
                    type="text" 
                    required
                    value={isAdding ? newItem.title : editing?.title}
                    onChange={(e) => isAdding ? setNewItem({...newItem, title: e.target.value}) : setEditing({...editing!, title: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                    placeholder="e.g. Lunch at Tokyo Tower"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Type</label>
                  <select 
                    value={isAdding ? newItem.type : editing?.type}
                    onChange={(e) => isAdding ? setNewItem({...newItem, type: e.target.value as ItineraryType}) : setEditing({...editing!, type: e.target.value as ItineraryType})}
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
                    checked={isAdding ? newItem.isMain : editing?.isMain}
                    onChange={(e) => isAdding ? setNewItem({...newItem, isMain: e.target.checked}) : setEditing({...editing!, isMain: e.target.checked})}
                    className="w-5 h-5 accent-stone-900"
                  />
                  <label htmlFor="isMain" className="text-sm font-medium text-stone-700">Main Itinerary (All Members)</label>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Start Time</label>
                  <input 
                    type="datetime-local" 
                    required
                    value={isAdding ? newItem.startTime : (editing?.startTime instanceof Timestamp ? format(editing.startTime.toDate(), "yyyy-MM-dd'T'HH:mm") : editing?.startTime)}
                    onChange={(e) => isAdding ? setNewItem({...newItem, startTime: e.target.value}) : setEditing({...editing!, startTime: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">End Time (Optional)</label>
                  <input 
                    type="datetime-local" 
                    value={isAdding ? newItem.endTime : (editing?.endTime instanceof Timestamp ? format(editing.endTime.toDate(), "yyyy-MM-dd'T'HH:mm") : editing?.endTime || '')}
                    onChange={(e) => isAdding ? setNewItem({...newItem, endTime: e.target.value}) : setEditing({...editing!, endTime: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Address</label>
                  <input 
                    type="text" 
                    value={isAdding ? newItem.location?.address : editing?.location?.address}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isAdding) setNewItem({...newItem, location: {...newItem.location, address: val}});
                      else setEditing({...editing!, location: {...editing!.location, address: val}});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Navigation Link (Google Maps)</label>
                  <input 
                    type="url" 
                    value={isAdding ? newItem.location?.navLink : editing?.location?.navLink}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (isAdding) setNewItem({...newItem, location: {...newItem.location, navLink: val}});
                      else setEditing({...editing!, location: {...editing!.location, navLink: val}});
                    }}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-1">Notes</label>
                  <textarea 
                    value={isAdding ? newItem.notes : editing?.notes}
                    onChange={(e) => isAdding ? setNewItem({...newItem, notes: e.target.value}) : setEditing({...editing!, notes: e.target.value})}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900/5 h-24 resize-none"
                  />
                </div>

                {/* Member Selection for Divergent Itinerary */}
                {!(isAdding ? newItem.isMain : editing?.isMain) && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-3">Assign Members to this Divergent Itinerary</label>
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
                    <p className="text-[10px] text-stone-400 mt-2">Selected: {selectedMembers.length} members</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => { setIsAdding(false); setEditing(null); setSelectedMembers([]); }}
                  className="flex-1 py-3 border border-stone-200 rounded-xl font-medium hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-3 bg-stone-900 text-white rounded-xl font-medium hover:bg-stone-800 transition-colors"
                >
                  {isAdding ? 'Create Event' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
