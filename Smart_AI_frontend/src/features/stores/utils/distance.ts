import type { Coordinates, Store, StoreWithDistance } from '../types';

/**
 * Earth's radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
export function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param coord1 First coordinate (latitude, longitude)
 * @param coord2 Second coordinate (latitude, longitude)
 * @returns Distance in kilometers
 */
export function calculateHaversineDistance(
  coord1: Coordinates,
  coord2: Coordinates
): number {
  const lat1Rad = toRadians(coord1.latitude);
  const lat2Rad = toRadians(coord2.latitude);
  const deltaLat = toRadians(coord2.latitude - coord1.latitude);
  const deltaLon = toRadians(coord2.longitude - coord1.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate distance from user location to a store
 * @param userLocation User's coordinates
 * @param store Store object with location
 * @returns Distance in kilometers
 */
export function calculateDistanceToStore(
  userLocation: Coordinates,
  store: Store
): number {
  const storeCoords: Coordinates = {
    longitude: store.location.coordinates[0],
    latitude: store.location.coordinates[1],
  };
  return calculateHaversineDistance(userLocation, storeCoords);
}

/**
 * Add distance to stores and return stores with distance
 * @param stores Array of stores
 * @param userLocation User's coordinates
 * @returns Array of stores with distance property
 */
export function addDistanceToStores(
  stores: Store[],
  userLocation: Coordinates
): StoreWithDistance[] {
  return stores.map((store) => ({
    ...store,
    distance: calculateDistanceToStore(userLocation, store),
  }));
}

/**
 * Sort stores by distance (nearest first)
 * @param stores Array of stores with distance
 * @returns Sorted array of stores
 */
export function sortStoresByDistance(
  stores: StoreWithDistance[]
): StoreWithDistance[] {
  return [...stores].sort((a, b) => {
    const distA = a.distance ?? Infinity;
    const distB = b.distance ?? Infinity;
    return distA - distB;
  });
}

/**
 * Find the nearest store to user location
 * @param stores Array of stores
 * @param userLocation User's coordinates
 * @returns Nearest store with distance, or null if no stores
 */
export function findNearestStore(
  stores: Store[],
  userLocation: Coordinates
): StoreWithDistance | null {
  if (stores.length === 0) return null;

  const storesWithDistance = addDistanceToStores(stores, userLocation);
  const sorted = sortStoresByDistance(storesWithDistance);
  return sorted[0];
}

/**
 * Format distance for display
 * @param distanceKm Distance in kilometers
 * @returns Formatted string (e.g., "1.5 km" or "500 m")
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
