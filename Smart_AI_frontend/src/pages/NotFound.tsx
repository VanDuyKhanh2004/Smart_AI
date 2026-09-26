import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 404 page (H12). Rendered inside the normal AppLayout so the header, footer
 * and skip link stay available to the user.
 */
export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <SearchX className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Trang bạn đang tìm không tồn tại hoặc đã được di chuyển.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to="/products">Tiếp tục mua sắm</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Về trang chủ</Link>
        </Button>
      </div>
    </div>
  );
}

export default NotFound;
