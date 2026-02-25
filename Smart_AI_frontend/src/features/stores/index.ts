// Store Locator feature exports

// Pages
export { StoreLocatorPage } from './pages/StoreLocatorPage';
export { MyAppointmentsPage } from './pages/MyAppointmentsPage';

// Components
export { StoreMap } from './components/StoreMap';
export { StoreList } from './components/StoreList';
export { StoreCard } from './components/StoreCard';
export { StoreDetailModal } from './components/StoreDetailModal';
export { AppointmentForm } from './components/AppointmentForm';

// Services
export { storeService } from './services/storeService';
export { appointmentService } from './services/appointmentService';

// Types
export type {
  Store,
  StoreWithDistance,
  Coordinates,
  Appointment,
  AppointmentStatus,
  TimeSlot,
  CreateAppointmentRequest,
  GuestInfo,
  BusinessHours,
  StoreAddress,
  StoreLocation,
} from './types';

// Utils
export {
  calculateHaversineDistance,
  calculateDistanceToStore,
  addDistanceToStores,
  sortStoresByDistance,
  findNearestStore,
  formatDistance,
} from './utils/distance';
