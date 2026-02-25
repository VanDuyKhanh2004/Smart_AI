// Store Types

export interface BusinessHour {
  open: string;
  close: string;
  isClosed: boolean;
}

export interface BusinessHours {
  monday: BusinessHour;
  tuesday: BusinessHour;
  wednesday: BusinessHour;
  thursday: BusinessHour;
  friday: BusinessHour;
  saturday: BusinessHour;
  sunday: BusinessHour;
}

export interface StoreAddress {
  street: string;
  ward?: string;
  district: string;
  city: string;
  fullAddress: string;
}

export interface StoreLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface Store {
  id: string;
  name: string;
  address: StoreAddress;
  location: StoreLocation;
  phone: string;
  email?: string;
  businessHours: BusinessHours;
  images?: string[];
  description?: string;
  isActive: boolean;
  isOpen?: boolean; // Virtual field from backend
  createdAt: string;
  updatedAt: string;
}

export interface StoreWithDistance extends Store {
  distance?: number; // Distance in kilometers
}

// Appointment Types

export type AppointmentPurpose = 'consultation' | 'warranty' | 'purchase' | 'other';
export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface TimeSlot {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface GuestInfo {
  name: string;
  phone: string;
  email: string;
}

export interface Appointment {
  id: string;
  store: Store | string;
  user?: string;
  guestInfo?: GuestInfo;
  date: string;
  timeSlot: TimeSlot;
  purpose: AppointmentPurpose;
  notes?: string;
  status: AppointmentStatus;
  cancelReason?: string;
  formattedDate?: string;
  contactInfo?: GuestInfo;
  createdAt: string;
  updatedAt: string;
}

// API Request/Response Types

export interface GetStoresResponse {
  success: boolean;
  data: Store[];
}

export interface GetStoreByIdResponse {
  success: boolean;
  data: Store;
}

export interface CreateStoreRequest {
  name: string;
  address: StoreAddress;
  location: StoreLocation;
  phone: string;
  email?: string;
  businessHours: BusinessHours;
  images?: string[];
  description?: string;
}

export interface UpdateStoreRequest extends Partial<CreateStoreRequest> {}

export interface StoreResponse {
  success: boolean;
  data: Store;
  message?: string;
}

export interface DeleteStoreResponse {
  success: boolean;
  message: string;
}

// Appointment API Types

export interface GetAvailableSlotsResponse {
  success: boolean;
  data: {
    date: string;
    store: {
      id: string;
      name: string;
    };
    slots: TimeSlot[];
  };
}

export interface CreateAppointmentRequest {
  store: string;
  date: string;
  timeSlot: TimeSlot;
  purpose: AppointmentPurpose;
  notes?: string;
  guestInfo?: GuestInfo;
}

export interface AppointmentResponse {
  success: boolean;
  data: Appointment;
  message?: string;
}

export interface GetAppointmentsResponse {
  success: boolean;
  data: Appointment[];
}

export interface GetAppointmentsParams {
  store?: string;
  status?: AppointmentStatus;
  startDate?: string;
  endDate?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
  cancelReason?: string;
}

// Geolocation Types

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeolocationError {
  code: number;
  message: string;
}
