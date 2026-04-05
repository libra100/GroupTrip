export type ItineraryType = 'attraction' | 'dining' | 'transit' | 'logistics' | 'accommodation';

export interface Member {
  id: string;
  name: string;
  dietaryHabits?: string;
  passportInfo?: string;
  groupId?: string;
  tags?: string[];
  outboundFlight?: string;
  outboundTime?: string;
  returnFlight?: string;
  returnTime?: string;
  isLeader?: boolean;
  gender?: 'M' | 'F' | string;
  tripDays?: number;
  carNumber?: string;
}

export interface Group {
  id: string;
  name: string;
}

export interface Itinerary {
  id: string;
  title: string;
  startTime: any; // Firestore Timestamp
  endTime?: any; // Firestore Timestamp (Optional)
  type: ItineraryType;
  location?: {
    address?: string;
    navLink?: string;
  };
  notes?: string;
  isMain?: boolean;
  assignedMemberIds?: string[];
  excludedMemberIds?: string[];
  dayIndex?: number;
  vehicleAssignments?: Record<string, string>;
  isMultiVehicle?: boolean;
}

export interface RollCall {
  id: string;
  itineraryId: string;
  timestamp: any; // Firestore Timestamp
  statusMap: Record<string, 'present' | 'absent' | 'divergent'>;
}
