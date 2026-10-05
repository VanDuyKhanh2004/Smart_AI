import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authService } from '@/services/auth.service';

interface FormErrors {
  email?: string;
}

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // W4-A41 (from W3-09): focus the first invalid field after a failed attempt.
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocusInvalidRef = useRef(false);

  useEffect(() => {
    if (shouldFocusInvalidRef.current) {
      shouldFocusInvalidRef.current = false;
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    }
  }, [errors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    setMessage(null);

    if (!email.trim()) {
      setErrors({ email: 'Email là bắt buộc' });
      shouldFocusInvalidRef.current = true;
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.forgotPassword({ email });
      setMessage(response.message || 'Vui lòng kiểm tra email để đặt lại mật khẩu');
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : 'Gửi yêu cầu thất bại';
      setError(messageText);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Quên mật khẩu</CardTitle>
            <CardDescription>
              Nhập email để nhận link đặt lại mật khẩu
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) {
                      setErrors({});
                    }
                  }}
                  required
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'forgot-email-error' : undefined}
                  disabled={isLoading}
                />
                {errors.email && (
                  <p id="forgot-email-error" role="alert" className="text-sm text-destructive">
                    {errors.email}
                  </p>
                )}
              </div>

              {message && (
                <div role="status" className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 text-sm">
                  {message}
                </div>
              )}

              {error && (
                <div role="alert" className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Đang gửi...' : 'Gửi link đặt lại'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline font-medium">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
