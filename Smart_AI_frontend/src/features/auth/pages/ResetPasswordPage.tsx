import React, { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authService } from '@/services/auth.service';

interface FormErrors {
  password?: string;
  passwordConfirm?: string;
}

const ResetPasswordPage: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
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

    if (!token) {
      setError('Thiếu token đặt lại mật khẩu');
      return;
    }

    if (!password || password.length < 6) {
      setErrors({ password: 'Mật khẩu phải có ít nhất 6 ký tự' });
      shouldFocusInvalidRef.current = true;
      return;
    }

    if (passwordConfirm && passwordConfirm !== password) {
      setErrors({ passwordConfirm: 'Mật khẩu xác nhận không khớp' });
      shouldFocusInvalidRef.current = true;
      return;
    }

    setIsLoading(true);
    try {
      const response = await authService.resetPassword({
        token,
        password,
        passwordConfirm: passwordConfirm || undefined,
      });
      setMessage(response.message || 'Đặt lại mật khẩu thành công');
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : 'Đặt lại mật khẩu thất bại';
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
            <CardTitle className="text-2xl">Đặt lại mật khẩu</CardTitle>
            <CardDescription>
              Nhập mật khẩu mới để hoàn tất đặt lại
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Mật khẩu mới
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) {
                      setErrors((prev) => ({ ...prev, password: undefined }));
                    }
                  }}
                  required
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'reset-password-error' : undefined}
                  disabled={isLoading}
                />
                {errors.password && (
                  <p id="reset-password-error" role="alert" className="text-sm text-destructive">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Optional confirmation — intentionally not marked required */}
              <div className="space-y-2">
                <label htmlFor="passwordConfirm" className="text-sm font-medium">
                  Xác nhận mật khẩu
                </label>
                <Input
                  id="passwordConfirm"
                  type="password"
                  placeholder="••••••••"
                  value={passwordConfirm}
                  onChange={(e) => {
                    setPasswordConfirm(e.target.value);
                    if (errors.passwordConfirm) {
                      setErrors((prev) => ({ ...prev, passwordConfirm: undefined }));
                    }
                  }}
                  autoComplete="new-password"
                  aria-invalid={!!errors.passwordConfirm}
                  aria-describedby={
                    errors.passwordConfirm ? 'reset-confirm-error' : undefined
                  }
                  disabled={isLoading}
                />
                {errors.passwordConfirm && (
                  <p id="reset-confirm-error" role="alert" className="text-sm text-destructive">
                    {errors.passwordConfirm}
                  </p>
                )}
              </div>

              {message && (
                <div className="p-3 rounded-md bg-emerald-500/10 text-emerald-700 text-sm">
                  {message}
                </div>
              )}

              {error && (
                <div role="alert" className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
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

export default ResetPasswordPage;
