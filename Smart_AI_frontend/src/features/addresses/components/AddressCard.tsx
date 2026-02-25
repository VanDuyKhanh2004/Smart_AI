import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Star } from "lucide-react";
import type { Address } from "@/types/address.type";
import { ADDRESS_LABELS } from "@/types/address.type";

interface AddressCardProps {
  address: Address;
  onEdit?: (address: Address) => void;
  onDelete?: (address: Address) => void;
  onSetDefault?: (address: Address) => void;
  /** Selectable mode for checkout - shows radio button */
  selectable?: boolean;
  /** Whether this address is selected (for selectable mode) */
  selected?: boolean;
  /** Callback when address is selected (for selectable mode) */
  onSelect?: (address: Address) => void;
}

/**
 * AddressCard component displays address information
 * Requirements 2.2: Display label, fullName, phone, full address
 * Requirements 5.2: Show "Mặc định" badge for default address
 */
export function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
  selectable = false,
  selected = false,
  onSelect,
}: AddressCardProps) {
  // Get display label from ADDRESS_LABELS
  const labelDisplay = ADDRESS_LABELS.find(l => l.value === address.label)?.label || address.label;
  
  // Format full address
  const fullAddress = `${address.address}, ${address.ward}, ${address.district}, ${address.city}`;

  const handleCardClick = () => {
    if (selectable && onSelect) {
      onSelect(address);
    }
  };

  return (
    <Card
      className={`relative ${selectable ? 'cursor-pointer hover:border-primary transition-colors' : ''} ${selected ? 'border-primary ring-1 ring-primary' : ''}`}
      onClick={handleCardClick}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Selectable radio for checkout mode */}
            {selectable && (
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="radio"
                  checked={selected}
                  onChange={() => onSelect?.(address)}
                  className="h-4 w-4 text-primary"
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="font-medium text-sm">{labelDisplay}</span>
                {address.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    Mặc định
                  </Badge>
                )}
              </div>
            )}

            {/* Non-selectable header */}
            {!selectable && (
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-sm">{labelDisplay}</span>
                {address.isDefault && (
                  <Badge variant="secondary" className="text-xs">
                    Mặc định
                  </Badge>
                )}
              </div>
            )}

            {/* Address details */}
            <div className="space-y-1 text-sm">
              <p className="font-medium">{address.fullName}</p>
              <p className="text-muted-foreground">{address.phone}</p>
              <p className="text-muted-foreground break-words">{fullAddress}</p>
            </div>
          </div>

          {/* Action buttons - only show in non-selectable mode */}
          {!selectable && (
            <div className="flex flex-col gap-1">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(address);
                  }}
                  title="Chỉnh sửa"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(address);
                  }}
                  title="Xóa"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
              {onSetDefault && !address.isDefault && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetDefault(address);
                  }}
                  title="Đặt làm mặc định"
                >
                  <Star className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
