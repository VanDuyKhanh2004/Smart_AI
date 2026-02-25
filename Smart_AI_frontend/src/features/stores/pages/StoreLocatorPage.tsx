import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, MapPin, CheckCircle } from 'lucide-react';
import { storeService } from '../services/storeService';
import { StoreMap } from '../components/StoreMap';
import { StoreList } from '../components/StoreList';
import { StoreDetailModal } from '../components/StoreDetailModal';
import { AppointmentForm } from '../components/AppointmentForm';
import {
  addDistanceToStores,
  sortStoresByDistance,
  findNearestStore,
} from '../utils/distance';
import type { StoreWithDistance, Coordinates, Store } from '../types';

export function StoreLocatorPage() {
  const [selectedStore, setSelectedStore] = useState<StoreWithDistance | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  
  // Modal states
  const [detailStore, setDetailStore] = useState<StoreWithDistance | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [appointmentStore, setAppointmentStore] = useState<StoreWithDistance | null>(null);
  const [isAppointmentFormOpen, setIsAppointmentFormOpen] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);


  // Fetch stores
  const {
    data: storesResponse,
    isLoading: isLoadingStores,
    error: storesError,
  } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storeService.getAllStores(),
  });

  // Process stores with distance if user location is available
  const processedStores: StoreWithDistance[] = (() => {
    const stores = storesResponse?.data || [];
    if (!userLocation) {
      return stores.map((store: Store) => ({ ...store, distance: undefined }));
    }
    const storesWithDistance = addDistanceToStores(stores, userLocation);
    return sortStoresByDistance(storesWithDistance);
  })();

  // Request geolocation
  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt của bạn không hỗ trợ định vị');
      return;
    }

    setIsLoadingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: Coordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setUserLocation(coords);
        setIsLoadingLocation(false);

        // Find and select nearest store
        const stores = storesResponse?.data || [];
        if (stores.length > 0) {
          const nearest = findNearestStore(stores, coords);
          if (nearest) {
            setSelectedStore(nearest);
          }
        }
      },
      (error) => {
        setIsLoadingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Vui lòng cho phép truy cập vị trí để tìm cửa hàng gần nhất');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Không thể xác định vị trí của bạn');
            break;
          case error.TIMEOUT:
            setLocationError('Yêu cầu xác định vị trí đã hết thời gian');
            break;
          default:
            setLocationError('Đã xảy ra lỗi khi xác định vị trí');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
      }
    );
  }, [storesResponse?.data]);

  // Handle store selection
  const handleStoreSelect = useCallback((store: StoreWithDistance) => {
    setSelectedStore(store);
  }, []);

  // Handle view details - Open StoreDetailModal
  const handleViewDetails = useCallback((store: StoreWithDistance) => {
    setDetailStore(store);
    setIsDetailModalOpen(true);
  }, []);

  // Handle close detail modal
  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setDetailStore(null);
  }, []);

  // Handle book appointment from detail modal
  const handleBookAppointment = useCallback((store: StoreWithDistance) => {
    setIsDetailModalOpen(false);
    setAppointmentStore(store);
    setIsAppointmentFormOpen(true);
  }, []);

  // Handle close appointment form
  const handleCloseAppointmentForm = useCallback(() => {
    setIsAppointmentFormOpen(false);
    setAppointmentStore(null);
  }, []);

  // Handle appointment success
  const handleAppointmentSuccess = useCallback(() => {
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 5000);
  }, []);

  // Handle find nearest
  const handleFindNearest = useCallback(() => {
    requestGeolocation();
  }, [requestGeolocation]);

  // Clear location error after 5 seconds
  useEffect(() => {
    if (locationError) {
      const timer = setTimeout(() => setLocationError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [locationError]);

  if (isLoadingStores) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Đang tải danh sách cửa hàng...</p>
        </div>
      </div>
    );
  }

  if (storesError) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center text-destructive">
          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
          <p>Không thể tải danh sách cửa hàng</p>
          <p className="text-sm mt-2">Vui lòng thử lại sau</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6" />
          Tìm cửa hàng
        </h1>
        <p className="text-muted-foreground mt-1">
          Tìm cửa hàng Smart AI gần bạn nhất
        </p>
      </div>

      {/* Location error alert */}
      {locationError && (
        <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{locationError}</p>
        </div>
      )}

      {/* Appointment success message */}
      {showSuccessMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Đặt lịch hẹn thành công! Chúng tôi sẽ liên hệ xác nhận sớm nhất.</p>
        </div>
      )}

      {/* Main content - Map and List side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-280px)] min-h-[500px]">
        {/* Store list - 1/3 width on large screens */}
        <div className="lg:col-span-1 bg-card rounded-lg border overflow-hidden order-2 lg:order-1">
          <StoreList
            stores={processedStores}
            selectedStore={selectedStore}
            onStoreSelect={handleStoreSelect}
            onViewDetails={handleViewDetails}
            onFindNearest={handleFindNearest}
            isLoadingLocation={isLoadingLocation}
            hasUserLocation={!!userLocation}
          />
        </div>

        {/* Map - 2/3 width on large screens */}
        <div className="lg:col-span-2 order-1 lg:order-2 min-h-[300px] lg:min-h-0">
          <StoreMap
            stores={processedStores}
            selectedStore={selectedStore}
            userLocation={userLocation}
            onStoreSelect={handleStoreSelect}
            onViewDetails={handleViewDetails}
          />
        </div>
      </div>

      {/* Store Detail Modal */}
      <StoreDetailModal
        store={detailStore}
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        onBookAppointment={handleBookAppointment}
      />

      {/* Appointment Form Modal */}
      <AppointmentForm
        store={appointmentStore}
        isOpen={isAppointmentFormOpen}
        onClose={handleCloseAppointmentForm}
        onSuccess={handleAppointmentSuccess}
      />
    </div>
  );
}

export default StoreLocatorPage;
