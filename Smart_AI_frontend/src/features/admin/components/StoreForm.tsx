import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Store, CreateStoreRequest, BusinessHours, BusinessHour } from '@/features/stores/types';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface StoreFormProps {
  store?: Store | null;
  onSubmit: (data: CreateStoreRequest) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

interface FormErrors {
  name?: string;
  street?: string;
  district?: string;
  city?: string;
  fullAddress?: string;
  phone?: string;
  coordinates?: string;
}

const DAYS_OF_WEEK = [
  { key: 'monday', label: 'Thứ 2' },
  { key: 'tuesday', label: 'Thứ 3' },
  { key: 'wednesday', label: 'Thứ 4' },
  { key: 'thursday', label: 'Thứ 5' },
  { key: 'friday', label: 'Thứ 6' },
  { key: 'saturday', label: 'Thứ 7' },
  { key: 'sunday', label: 'Chủ nhật' },
] as const;

const DEFAULT_BUSINESS_HOUR: BusinessHour = {
  open: '08:00',
  close: '21:00',
  isClosed: false,
};

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: { ...DEFAULT_BUSINESS_HOUR },
  tuesday: { ...DEFAULT_BUSINESS_HOUR },
  wednesday: { ...DEFAULT_BUSINESS_HOUR },
  thursday: { ...DEFAULT_BUSINESS_HOUR },
  friday: { ...DEFAULT_BUSINESS_HOUR },
  saturday: { ...DEFAULT_BUSINESS_HOUR },
  sunday: { ...DEFAULT_BUSINESS_HOUR, isClosed: true },
};


// Map click handler component
function MapClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function StoreForm({ store, onSubmit, onCancel, isLoading = false }: StoreFormProps) {
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [ward, setWard] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [latitude, setLatitude] = useState<number>(21.0285);
  const [longitude, setLongitude] = useState<number>(105.8542);
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [errors, setErrors] = useState<FormErrors>({});

  // Initialize form with store data if editing
  useEffect(() => {
    if (store) {
      setName(store.name);
      setStreet(store.address.street);
      setWard(store.address.ward || '');
      setDistrict(store.address.district);
      setCity(store.address.city);
      setFullAddress(store.address.fullAddress);
      setPhone(store.phone);
      setEmail(store.email || '');
      setDescription(store.description || '');
      setLatitude(store.location.coordinates[1]);
      setLongitude(store.location.coordinates[0]);
      setBusinessHours(store.businessHours);
    }
  }, [store]);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    if (errors.coordinates) {
      setErrors((prev) => ({ ...prev, coordinates: undefined }));
    }
  }, [errors.coordinates]);

  const handleBusinessHourChange = (
    day: keyof BusinessHours,
    field: keyof BusinessHour,
    value: string | boolean
  ) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) newErrors.name = 'Tên cửa hàng là bắt buộc';
    if (!street.trim()) newErrors.street = 'Địa chỉ đường là bắt buộc';
    if (!district.trim()) newErrors.district = 'Quận/Huyện là bắt buộc';
    if (!city.trim()) newErrors.city = 'Thành phố là bắt buộc';
    if (!fullAddress.trim()) newErrors.fullAddress = 'Địa chỉ đầy đủ là bắt buộc';
    if (!phone.trim()) {
      newErrors.phone = 'Số điện thoại là bắt buộc';
    } else if (!/^[0-9]{10,11}$/.test(phone)) {
      newErrors.phone = 'Số điện thoại phải có 10-11 chữ số';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const data: CreateStoreRequest = {
      name: name.trim(),
      address: {
        street: street.trim(),
        ward: ward.trim() || undefined,
        district: district.trim(),
        city: city.trim(),
        fullAddress: fullAddress.trim(),
      },
      location: {
        type: 'Point',
        coordinates: [longitude, latitude],
      },
      phone: phone.trim(),
      email: email.trim() || undefined,
      description: description.trim() || undefined,
      businessHours,
    };

    await onSubmit(data);
  };

  const isFormValid = name.trim() && street.trim() && district.trim() && city.trim() && fullAddress.trim() && phone.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Thông tin cơ bản</h3>
        
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            Tên cửa hàng <span className="text-destructive">*</span>
          </label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder="Nhập tên cửa hàng"
            disabled={isLoading}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="phone" className="text-sm font-medium">
              Số điện thoại <span className="text-destructive">*</span>
            </label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
              }}
              placeholder="0123456789"
              disabled={isLoading}
            />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="store@example.com"
              disabled={isLoading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="description" className="text-sm font-medium">Mô tả</label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả về cửa hàng"
            disabled={isLoading}
            rows={2}
          />
        </div>
      </div>


      {/* Address */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Địa chỉ</h3>
        
        <div className="space-y-2">
          <label htmlFor="street" className="text-sm font-medium">
            Số nhà, đường <span className="text-destructive">*</span>
          </label>
          <Input
            id="street"
            value={street}
            onChange={(e) => {
              setStreet(e.target.value);
              if (errors.street) setErrors((prev) => ({ ...prev, street: undefined }));
            }}
            placeholder="123 Đường ABC"
            disabled={isLoading}
          />
          {errors.street && <p className="text-sm text-destructive">{errors.street}</p>}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label htmlFor="ward" className="text-sm font-medium">Phường/Xã</label>
            <Input
              id="ward"
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              placeholder="Phường 1"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="district" className="text-sm font-medium">
              Quận/Huyện <span className="text-destructive">*</span>
            </label>
            <Input
              id="district"
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                if (errors.district) setErrors((prev) => ({ ...prev, district: undefined }));
              }}
              placeholder="Quận 1"
              disabled={isLoading}
            />
            {errors.district && <p className="text-sm text-destructive">{errors.district}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="city" className="text-sm font-medium">
              Thành phố <span className="text-destructive">*</span>
            </label>
            <Input
              id="city"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                if (errors.city) setErrors((prev) => ({ ...prev, city: undefined }));
              }}
              placeholder="Hà Nội"
              disabled={isLoading}
            />
            {errors.city && <p className="text-sm text-destructive">{errors.city}</p>}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="fullAddress" className="text-sm font-medium">
            Địa chỉ đầy đủ <span className="text-destructive">*</span>
          </label>
          <Input
            id="fullAddress"
            value={fullAddress}
            onChange={(e) => {
              setFullAddress(e.target.value);
              if (errors.fullAddress) setErrors((prev) => ({ ...prev, fullAddress: undefined }));
            }}
            placeholder="123 Đường ABC, Phường 1, Quận 1, Hà Nội"
            disabled={isLoading}
          />
          {errors.fullAddress && <p className="text-sm text-destructive">{errors.fullAddress}</p>}
        </div>
      </div>


      {/* Map Picker */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Vị trí trên bản đồ</h3>
        <p className="text-sm text-muted-foreground">Click vào bản đồ để chọn vị trí cửa hàng</p>
        
        <div className="h-[300px] rounded-md overflow-hidden border">
          <MapContainer
            center={[latitude, longitude]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[latitude, longitude]} icon={defaultIcon} />
            <MapClickHandler onLocationSelect={handleLocationSelect} />
          </MapContainer>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="latitude" className="text-sm font-medium">Vĩ độ (Latitude)</label>
            <Input
              id="latitude"
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(parseFloat(e.target.value) || 0)}
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="longitude" className="text-sm font-medium">Kinh độ (Longitude)</label>
            <Input
              id="longitude"
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(parseFloat(e.target.value) || 0)}
              disabled={isLoading}
            />
          </div>
        </div>
      </div>


      {/* Business Hours */}
      <div className="space-y-4">
        <h3 className="font-medium text-lg">Giờ mở cửa</h3>
        
        <div className="space-y-3">
          {DAYS_OF_WEEK.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-4">
              <div className="w-24 text-sm font-medium">{label}</div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={businessHours[key].isClosed}
                  onChange={(e) => handleBusinessHourChange(key, 'isClosed', e.target.checked)}
                  disabled={isLoading}
                  className="rounded"
                />
                <span className="text-sm">Đóng cửa</span>
              </label>
              {!businessHours[key].isClosed && (
                <>
                  <Input
                    type="time"
                    value={businessHours[key].open}
                    onChange={(e) => handleBusinessHourChange(key, 'open', e.target.value)}
                    disabled={isLoading}
                    className="w-32"
                  />
                  <span className="text-sm">-</span>
                  <Input
                    type="time"
                    value={businessHours[key].close}
                    onChange={(e) => handleBusinessHourChange(key, 'close', e.target.value)}
                    disabled={isLoading}
                    className="w-32"
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Hủy
        </Button>
        <Button type="submit" disabled={isLoading || !isFormValid}>
          {isLoading ? 'Đang xử lý...' : store ? 'Cập nhật' : 'Thêm cửa hàng'}
        </Button>
      </div>
    </form>
  );
}
