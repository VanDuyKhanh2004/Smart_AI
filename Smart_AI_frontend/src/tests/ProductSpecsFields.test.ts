import { describe, it, expect } from 'vitest';
import { buildSpecs } from '@/features/admin/utils/buildSpecs';

describe('buildSpecs', () => {
  it('returns undefined when every field is empty', () => {
    expect(buildSpecs({}, undefined)).toBeUndefined();
    expect(buildSpecs({ 'screen.size': '', 'screen.resolution': '  ' }, undefined)).toBeUndefined();
  });

  it('builds the full canonical shape from populated fields', () => {
    const specs = buildSpecs(
      {
        'screen.size': '6.7 inch',
        'screen.resolution': '2796 x 1290',
        'screen.technology': 'OLED',
        'processor.chipset': 'Apple A17 Pro',
        'processor.cpu': '6-core',
        'processor.gpu': '6-core GPU',
        'memory.ram': '8 GB',
        'memory.storage': '256 GB',
        'camera.rear.primary': '48 MP',
        'camera.rear.secondary': '12 MP ultrawide',
        'camera.rear.tertiary': '12 MP telephoto',
        'camera.front': '12 MP',
        'camera.features': 'Night mode, Portrait mode, Night mode',
        'battery.capacity': '4422 mAh',
        'battery.charging.wired': '27W',
        'battery.charging.wireless': '15W',
        'connectivity.network': '5G, Wi-Fi 6E',
        'connectivity.ports': 'USB-C',
        os: 'iOS 17',
        dimensions: '159.9 x 76.7 x 8.25 mm',
        weight: '221g',
      },
      true,
    );

    expect(specs).toEqual({
      screen: { size: '6.7 inch', resolution: '2796 x 1290', technology: 'OLED' },
      processor: { chipset: 'Apple A17 Pro', cpu: '6-core', gpu: '6-core GPU' },
      memory: { ram: '8 GB', storage: '256 GB', expandable: true },
      camera: {
        rear: { primary: '48 MP', secondary: '12 MP ultrawide', tertiary: '12 MP telephoto' },
        front: '12 MP',
        features: ['Night mode', 'Portrait mode'],
      },
      battery: { capacity: '4422 mAh', charging: { wired: '27W', wireless: '15W' } },
      connectivity: { network: ['5G', 'Wi-Fi 6E'], ports: ['USB-C'] },
      os: 'iOS 17',
      dimensions: '159.9 x 76.7 x 8.25 mm',
      weight: '221g',
    });
  });

  it('omits empty sub-objects and only keeps populated keys', () => {
    const specs = buildSpecs(
      {
        'screen.size': '6.7 inch',
        'battery.charging.wired': '',
        'camera.rear.primary': '',
        'camera.front': '12 MP',
      },
      undefined,
    );

    expect(specs).toEqual({ screen: { size: '6.7 inch' }, camera: { front: '12 MP' } });
  });

  it('emits expandable false only when explicitly set', () => {
    expect(buildSpecs({ 'memory.ram': '8 GB' }, false)).toEqual({
      memory: { ram: '8 GB', expandable: false },
    });
    expect(buildSpecs({ 'memory.ram': '8 GB' }, undefined)).toEqual({
      memory: { ram: '8 GB' },
    });
  });

  it('splits and trims comma-separated list fields', () => {
    const specs = buildSpecs(
      {
        'camera.features': ' Night mode , Portrait mode ',
        'connectivity.ports': 'USB-C, Lightning',
      },
      undefined,
    );

    expect(specs?.camera?.features).toEqual(['Night mode', 'Portrait mode']);
    expect(specs?.connectivity?.ports).toEqual(['USB-C', 'Lightning']);
  });

  it('trims plain text values', () => {
    const specs = buildSpecs({ os: '  iOS 17  ' }, undefined);
    expect(specs?.os).toBe('iOS 17');
  });

  it('returns undefined when only empty lists are provided', () => {
    expect(buildSpecs({ 'connectivity.network': ' , ' }, undefined)).toBeUndefined();
  });
});
