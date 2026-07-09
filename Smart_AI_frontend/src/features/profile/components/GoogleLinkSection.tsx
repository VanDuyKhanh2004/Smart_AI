import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

interface GoogleLinkSectionProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const GoogleLinkSection: React.FC<GoogleLinkSectionProps> = ({ onSuccess, onError }) => {
  const { user, setUser } = useAuthStore();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!user || user.googleId || !buttonRef.current) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      if (!window.google) {
        setTimeout(init, 500);
        return;
      }
      if (!buttonRef.current) return;

      buttonRef.current.innerHTML = '';

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          setIsLoading(true);
          try {
            const res = await authService.linkGoogle(response.credential);
            setUser(res.data.user);
            onSuccess?.('Đã liên kết tài khoản Google thành công');
          } catch (err: any) {
            const msg = err.response?.data?.error?.message
              || err.response?.data?.message
              || 'Liên kết Google thất bại';
            onError?.(msg);
          } finally {
            setIsLoading(false);
          }
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 350,
        shape: 'rectangular',
      });
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [user?.googleId]);

  const handleUnlink = async () => {
    setIsLoading(true);
    try {
      const res = await authService.unlinkGoogle();
      setUser(res.data.user);
      setShowConfirm(false);
      onSuccess?.('Đã hủy liên kết tài khoản Google');
    } catch (err: any) {
      const msg = err.response?.data?.error?.message
        || err.response?.data?.message
        || 'Hủy liên kết thất bại';
      onError?.(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liên kết Google</CardTitle>
        <CardDescription>
          {user.googleId
            ? 'Tài khoản của bạn đã được kết nối với Google'
            : 'Kết nối tài khoản Google để đăng nhập nhanh hơn'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {user.googleId ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Connected to Google</span>
            </div>

            {showConfirm ? (
              <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  Are you sure you want to unlink your Google account?
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleUnlink}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Đang xử lý...' : 'Unlink'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowConfirm(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(true)}
              >
                Unlink
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Not connected</p>
            <div
              ref={buttonRef}
              className={isLoading ? 'pointer-events-none opacity-50' : ''}
            />
            {isLoading && (
              <div className="text-sm text-muted-foreground">Đang xử lý...</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GoogleLinkSection;