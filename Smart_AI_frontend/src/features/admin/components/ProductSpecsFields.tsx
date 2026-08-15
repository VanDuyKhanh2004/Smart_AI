import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { buildSpecs } from '../utils/buildSpecs';
import type { ProductSpecs } from '@/types/product.type';

/**
 * ProductSpecsFields
 *
 * Grouped, optional specification inputs that build a canonical `ProductSpecs`
 * object. Every field is optional; only non-empty values are emitted. The
 * canonical shape matches the backend Product model and is shared by the
 * Product Detail page, the Compare table, and the AI/RAG embedding pipeline.
 *
 * Props:
 *   initialSpecs - Existing spec values (edit mode), used to prefill inputs.
 *   disabled     - While a request is in flight.
 *   onChange     - Receives a freshly built ProductSpecs (or undefined when
 *                  every field is empty) on any change.
 */

interface ProductSpecsFieldsProps {
  initialSpecs?: ProductSpecs;
  disabled?: boolean;
  onChange: (specs: ProductSpecs | undefined) => void;
}

interface SpecField {
  label: string;
  path: string;
  hint?: string;
}

export function ProductSpecsFields({
  initialSpecs,
  disabled = false,
  onChange,
}: ProductSpecsFieldsProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const set = (path: string, value: string | string[] | undefined) => {
      if (Array.isArray(value)) {
        if (value.length > 0) init[path] = value.join(', ');
      } else if (typeof value === 'string' && value.trim() !== '') {
        init[path] = value;
      }
    };

    set('screen.size', initialSpecs?.screen?.size);
    set('screen.resolution', initialSpecs?.screen?.resolution);
    set('screen.technology', initialSpecs?.screen?.technology);

    set('processor.chipset', initialSpecs?.processor?.chipset);
    set('processor.cpu', initialSpecs?.processor?.cpu);
    set('processor.gpu', initialSpecs?.processor?.gpu);

    set('memory.ram', initialSpecs?.memory?.ram);
    set('memory.storage', initialSpecs?.memory?.storage);

    set('camera.rear.primary', initialSpecs?.camera?.rear?.primary);
    set('camera.rear.secondary', initialSpecs?.camera?.rear?.secondary);
    set('camera.rear.tertiary', initialSpecs?.camera?.rear?.tertiary);
    set('camera.front', initialSpecs?.camera?.front);
    set('camera.features', initialSpecs?.camera?.features);

    set('battery.capacity', initialSpecs?.battery?.capacity);
    set('battery.charging.wired', initialSpecs?.battery?.charging?.wired);
    set('battery.charging.wireless', initialSpecs?.battery?.charging?.wireless);

    set('connectivity.network', initialSpecs?.connectivity?.network);
    set('connectivity.ports', initialSpecs?.connectivity?.ports);

    set('os', initialSpecs?.os);
    set('dimensions', initialSpecs?.dimensions);
    set('weight', initialSpecs?.weight);

    return init;
  });

  // expandable is tri-state: undefined = untouched (not emitted), true/false.
  const [expandable, setExpandable] = useState<boolean | undefined>(
    initialSpecs?.memory?.expandable,
  );

  const handleChange = (path: string, rawValue: string) => {
    const next = { ...values, [path]: rawValue };
    setValues(next);
    onChange(buildSpecs(next, expandable) ?? {});
  };

  const handleExpandableChange = (checked: boolean) => {
    // Unchecking a pristine (undefined) field keeps it un-set rather than
    // forcing `expandable: false` into the payload for products that never
    // specified expandability.
    const next = checked ? true : expandable === undefined ? undefined : false;
    setExpandable(next);
    onChange(buildSpecs(values, next) ?? {});
  };

  const textValue = (path: string) => values[path] ?? '';

  const sections: { title: string; fields: SpecField[] }[] = [
    {
      title: 'Màn hình',
      fields: [
        { label: 'Kích thước màn hình', path: 'screen.size', hint: 'VD: 6.7 inch' },
        { label: 'Độ phân giải', path: 'screen.resolution', hint: 'VD: 2796 x 1290' },
        { label: 'Công nghệ màn hình', path: 'screen.technology', hint: 'VD: Super Retina XDR OLED' },
      ],
    },
    {
      title: 'Bộ xử lý',
      fields: [
        { label: 'Chipset', path: 'processor.chipset', hint: 'VD: Apple A17 Pro' },
        { label: 'CPU', path: 'processor.cpu', hint: 'VD: 6-core' },
        { label: 'GPU', path: 'processor.gpu', hint: 'VD: 6-core GPU' },
      ],
    },
    {
      title: 'Bộ nhớ',
      fields: [
        { label: 'RAM', path: 'memory.ram', hint: 'VD: 8 GB' },
        { label: 'Bộ nhớ trong', path: 'memory.storage', hint: 'VD: 256 GB' },
      ],
    },
    {
      title: 'Camera',
      fields: [
        { label: 'Camera chính', path: 'camera.rear.primary', hint: 'VD: 48 MP' },
        { label: 'Camera phụ', path: 'camera.rear.secondary', hint: 'VD: 12 MP ultrawide' },
        { label: 'Camera tele', path: 'camera.rear.tertiary', hint: 'VD: 12 MP telephoto' },
        { label: 'Camera trước', path: 'camera.front', hint: 'VD: 12 MP' },
        { label: 'Tính năng camera', path: 'camera.features', hint: 'Phân cách bằng dấu phẩy' },
      ],
    },
    {
      title: 'Pin & Sạc',
      fields: [
        { label: 'Dung lượng pin', path: 'battery.capacity', hint: 'VD: 4422 mAh' },
        { label: 'Công suất sạc có dây', path: 'battery.charging.wired', hint: 'VD: 27W' },
        { label: 'Công suất sạc không dây', path: 'battery.charging.wireless', hint: 'VD: 15W' },
      ],
    },
    {
      title: 'Kết nối',
      fields: [
        { label: 'Mạng', path: 'connectivity.network', hint: 'VD: 5G, Wi-Fi 6E' },
        { label: 'Cổng kết nối', path: 'connectivity.ports', hint: 'VD: USB-C, Lightning' },
      ],
    },
    {
      title: 'Thông tin khác',
      fields: [
        { label: 'Hệ điều hành', path: 'os', hint: 'VD: iOS 17' },
        { label: 'Kích thước máy', path: 'dimensions', hint: 'VD: 159.9 x 76.7 x 8.25 mm' },
        { label: 'Trọng lượng', path: 'weight', hint: 'VD: 221g' },
      ],
    },
  ];

  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium">
        Thông số kỹ thuật (không bắt buộc)
      </legend>

      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
          </p>
          {section.fields.map((field) => (
            <div key={field.path} className="space-y-1">
              <label htmlFor={`spec-${field.path}`} className="text-sm font-normal">
                {field.label}
              </label>
              <Input
                id={`spec-${field.path}`}
                value={textValue(field.path)}
                onChange={(e) => handleChange(field.path, e.target.value)}
                placeholder={field.hint}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input
          id="spec-memory-expandable"
          type="checkbox"
          checked={expandable === true}
          onChange={(e) => handleExpandableChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
        />
        <label htmlFor="spec-memory-expandable" className="text-sm">
          Hỗ trợ mở rộng bộ nhớ (thẻ nhớ)
        </label>
      </div>
    </fieldset>
  );
}