import React from 'react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * ErrorBoundary - Catches uncaught render errors in the React tree.
 * Fallback is Vietnamese and intentionally independent of Router context
 * (no Link/useNavigate) so it works even when routing is broken.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 py-16 text-center"
        >
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">
              Đã xảy ra lỗi
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Trang này gặp sự cố không mong muốn. Bạn có thể thử lại hoặc tải lại trang.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={this.handleRetry}>
              Thử lại
            </Button>
            <Button type="button" variant="outline" onClick={this.handleReload}>
              Tải lại trang
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
