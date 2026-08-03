import { Skeleton } from '@/components/ui/skeleton';

export function PageLoader() {
  return (
    <div
      className="flex flex-col gap-4 py-8"
      role="status"
      aria-label="Đang tải trang"
    >
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
