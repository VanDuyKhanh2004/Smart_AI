import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { StoreWithDistance, Coordinates } from '../types';

// Fix for default marker icons in Leaflet with Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Configure default icon
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Custom store marker icon
const storeIcon = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// User location marker icon (blue)
const userIcon = new L.DivIcon({
  className: 'user-location-marker',
  html: `<div style="
    width: 16px;
    height: 16px;
    background-color: #3b82f6;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface StoreMapProps {
  stores: StoreWithDistance[];
  selectedStore: StoreWithDistance | null;
  userLocation: Coordinates | null;
  onStoreSelect: (store: StoreWithDistance) => void;
  onViewDetails: (store: StoreWithDistance) => void;
}

// Component to handle map view changes
function MapController({
  selectedStore,
  userLocation,
  stores,
}: {
  selectedStore: StoreWithDistance | null;
  userLocation: Coordinates | null;
  stores: StoreWithDistance[];
}) {
  const map = useMap();
  const initialFitDone = useRef(false);

  // Fit bounds to show all stores on initial load
  useEffect(() => {
    if (!initialFitDone.current && stores.length > 0) {
      const bounds = L.latLngBounds(
        stores.map((store) => [
          store.location.coordinates[1],
          store.location.coordinates[0],
        ])
      );
      
      // Include user location in bounds if available
      if (userLocation) {
        bounds.extend([userLocation.latitude, userLocation.longitude]);
      }
      
      map.fitBounds(bounds, { padding: [50, 50] });
      initialFitDone.current = true;
    }
  }, [stores, userLocation, map]);

  // Center on selected store
  useEffect(() => {
    if (selectedStore) {
      map.setView(
        [
          selectedStore.location.coordinates[1],
          selectedStore.location.coordinates[0],
        ],
        15,
        { animate: true }
      );
    }
  }, [selectedStore, map]);

  return null;
}

export function StoreMap({
  stores,
  selectedStore,
  userLocation,
  onStoreSelect,
  onViewDetails,
}: StoreMapProps) {
  // Default center (Ho Chi Minh City)
  const defaultCenter: [number, number] = [10.8231, 106.6297];
  
  // Calculate initial center
  const getInitialCenter = (): [number, number] => {
    if (userLocation) {
      return [userLocation.latitude, userLocation.longitude];
    }
    if (stores.length > 0) {
      return [
        stores[0].location.coordinates[1],
        stores[0].location.coordinates[0],
      ];
    }
    return defaultCenter;
  };

  return (
    <div className="h-full w-full rounded-lg overflow-hidden border">
      <MapContainer
        center={getInitialCenter()}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController
          selectedStore={selectedStore}
          userLocation={userLocation}
          stores={stores}
        />

        {/* User location marker */}
        {userLocation && (
          <Marker
            position={[userLocation.latitude, userLocation.longitude]}
            icon={userIcon}
          >
            <Popup>
              <div className="text-center">
                <Navigation className="h-4 w-4 mx-auto mb-1 text-blue-500" />
                <span className="text-sm font-medium">Vị trí của bạn</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Store markers */}
        {stores.map((store) => (
          <Marker
            key={store.id}
            position={[
              store.location.coordinates[1],
              store.location.coordinates[0],
            ]}
            icon={storeIcon}
            eventHandlers={{
              click: () => onStoreSelect(store),
            }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="flex items-start gap-2 mb-2">
                  <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm">{store.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {store.address.fullAddress}
                    </p>
                  </div>
                </div>
                
                {store.distance !== undefined && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Khoảng cách: {store.distance < 1 
                      ? `${Math.round(store.distance * 1000)} m` 
                      : `${store.distance.toFixed(1)} km`}
                  </p>
                )}
                
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      store.isOpen
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {store.isOpen ? 'Đang mở cửa' : 'Đã đóng cửa'}
                  </span>
                </div>
                
                <Button
                  size="sm"
                  className="w-full mt-3"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDetails(store);
                  }}
                >
                  Xem chi tiết
                </Button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default StoreMap;
