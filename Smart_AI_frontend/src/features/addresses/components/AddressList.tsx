import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddressCard } from "./AddressCard";
import type { Address } from "@/types/address.type";
import { MAX_ADDRESSES } from "@/types/address.type";

interface AddressListProps {
  /** List of addresses to display */
  addresses: Address[];
  /** Callback when add button is clicked */
  onAdd: () => void;
  /** Callback when edit button is clicked */
  onEdit: (address: Address) => void;
  /** Callback when delete button is clicked */
  onDelete: (address: Address) => void;
  /** Callback when set default button is clicked */
  onSetDefault: (address: Address) => void;
  /** Whether the list is loading */
  isLoading?: boolean;
}

/**
 * AddressList component displays list of saved addresses
 * Requirements 2.1: Display all saved addresses in a list
 * Requirements 2.3: Empty state with "Thêm địa chỉ mới" button
 * Requirements 1.3: Disable add button when 5 addresses exist
 */
export function AddressList({
  addresses,
  onAdd,
  onEdit,
  onDelete,
  onSetDefault,
  isLoading = false,
}: AddressListProps) {
  const canAddMore = addresses.length < MAX_ADDRESSES;

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-32 bg-muted animate-pulse rounded-lg"
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (addresses.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/30">
        <p className="text-muted-foreground mb-4">
          Bạn chưa có địa chỉ nào được lưu
        </p>
        <Button onClick={onAdd}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm địa chỉ mới
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add button header */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {addresses.length}/{MAX_ADDRESSES} địa chỉ đã lưu
        </p>
        <Button
          onClick={onAdd}
          disabled={!canAddMore}
          size="sm"
          title={
            canAddMore
              ? "Thêm địa chỉ mới"
              : "Bạn chỉ có thể lưu tối đa 5 địa chỉ"
          }
        >
          <Plus className="h-4 w-4 mr-2" />
          Thêm địa chỉ
        </Button>
      </div>

      {/* Address cards */}
      <div className="space-y-3">
        {addresses.map((address) => (
          <AddressCard
            key={address.id}
            address={address}
            onEdit={onEdit}
            onDelete={onDelete}
            onSetDefault={onSetDefault}
          />
        ))}
      </div>

      {/* Max addresses warning */}
      {!canAddMore && (
        <p className="text-sm text-muted-foreground text-center">
          Bạn đã đạt giới hạn {MAX_ADDRESSES} địa chỉ. Xóa địa chỉ cũ để thêm mới.
        </p>
      )}
    </div>
  );
}
