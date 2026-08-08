import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/authStore';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'already' | 'expired' | 'invalid' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [countdown, setCountdown] = useState(5);
  const [email, setEmail] = useState('');
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const { resendVerification } = useAuthStore();

  const isLoading = status === 'loading';
  const isSuccess = status === 'success' || status === 'already';
  const isError = status === 'expired' || status === 'invalid' || status === 'error';
  const needsResend = status === 'expired' || status === 'invalid' || status === 'error';

  useEffect(() => {
    const token = searchParams.get('token');
    const statusParam = searchParams.get('status');
    const messageParam = searchParams.get('message');
    const emailParam = searchParams.get('email');

    if (emailParam) {
      setEmail(emailParam);
    }

    if (statusParam === 'success') {
      setStatus('success');
      setMessage(messageParam || 'Xac nhan email thanh cong.');
      return;
    }

    if (statusParam === 'expired') {
      setStatus('expired');
      setMessage(messageParam || 'Liên kết xác nhận đã hết hạn. Vui lòng yêu cầu gửi lại email xác nhận.');
      return;
    }

    if (statusParam === 'invalid') {
      setStatus('invalid');
      setMessage(messageParam || 'Liên kết xác nhận không còn hợp lệ. Vui lòng sử dụng email xác nhận mới nhất.');
      return;
    }

    if (statusParam === 'error') {
      setStatus('error');
      setMessage(messageParam || 'Xac nhan email that bai.');
      return;
    }

    if (!token) {
      setStatus('error');
      setMessage('Khong tim thay token xac nhan.');
      return;
    }

    authService
      .verifyEmail(token, emailParam || undefined)
      .then((response) => {
        if (response.data?.status === 'ALREADY_VERIFIED') {
          setStatus('already');
          setMessage(response.message || 'Email da duoc kich hoat.');
          return;
        }
        setStatus('success');
        setMessage(response.message);
      })
      .catch((error) => {
        const apiMessage = error?.response?.data?.error?.message;
        const errorCode = error?.response?.data?.error?.code;
        const fallbackMsgs: Record<string, string> = {
          VERIFICATION_TOKEN_EXPIRED:
            'Liên kết xác nhận đã hết hạn. Vui lòng yêu cầu gửi lại email xác nhận.',
          INVALID_VERIFICATION_TOKEN:
            'Liên kết xác nhận không còn hợp lệ. Vui lòng sử dụng email xác nhận mới nhất.',
        };
        if (errorCode === 'VERIFICATION_TOKEN_EXPIRED') {
          setStatus('expired');
        } else if (errorCode === 'INVALID_VERIFICATION_TOKEN') {
          setStatus('invalid');
        } else {
          setStatus('error');
        }
        setMessage(apiMessage || fallbackMsgs[errorCode] || 'Xac nhan email that bai.');
      });
  }, [searchParams]);

  useEffect(() => {
    if (status !== 'success' && status !== 'already') {
      return undefined;
    }

    setCountdown(5);
    const intervalId = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    const timeoutId = setTimeout(() => {
      navigate('/login', { replace: true });
    }, 5000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [status, navigate]);

  const handleResend = async () => {
    setResendMessage(null);
    setResendError(null);

    if (!email.trim()) {
      setResendError('Vui long nhap email de gui lai.');
      return;
    }

    try {
      const responseMessage = await resendVerification(email);
      setResendMessage(responseMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Gui lai that bai.';
      setResendError(errorMessage);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[radial-gradient(circle_at_top,_#eaf8f2,_#f8fbfa_45%,_#ffffff_100%)] px-4">
      <div className="absolute -top-20 -right-24 h-64 w-64 rounded-full bg-emerald-200/50 blur-3xl" />
      <div className="absolute -bottom-24 -left-20 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />

      <div className="relative z-10 flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-lg border-emerald-100/60 bg-white/80 shadow-2xl backdrop-blur">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between">
              <span
                className={
                  isSuccess
                    ? 'rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-semibold text-emerald-700'
                    : isError
                      ? 'rounded-full bg-rose-600/10 px-3 py-1 text-xs font-semibold text-rose-600'
                      : 'rounded-full bg-slate-600/10 px-3 py-1 text-xs font-semibold text-slate-600'
                }
              >
                {isSuccess ? 'VERIFIED' : isError ? 'FAILED' : 'VERIFYING'}
              </span>
              <span className="text-xs text-muted-foreground">Smart AI</span>
            </div>
            <CardTitle className="text-3xl tracking-tight" style={{ fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif' }}>
              Kich hoat email
            </CardTitle>
            <CardDescription className="text-base">
              {isLoading ? 'Dang xu ly yeu cau...' : 'Trang thai xac nhan email cua ban'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-100/70 bg-white/70 p-4">
              <div
                className={
                  isSuccess
                    ? 'flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700'
                    : isError
                      ? 'flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-600'
                      : 'flex h-12 w-12 items-center justify-center rounded-full bg-slate-500/10 text-slate-600'
                }
              >
                {isLoading && <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />}
                {isSuccess && (
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {isError && (
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  {isSuccess ? 'Email da duoc kich hoat' : isError ? 'Khong the kich hoat' : 'Dang kich hoat email'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isLoading ? 'He thong dang xac nhan. Vui long doi giay lat.' : message}
                </p>
              </div>
            </div>

            {isSuccess && (
              <div className="rounded-xl border border-emerald-100/70 bg-emerald-50/60 p-4 text-sm text-emerald-700">
                Tai khoan cua ban da san sang. Chuyen sang dang nhap sau {countdown}s.
                <div className="mt-3 h-1.5 w-full rounded-full bg-emerald-100">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${(countdown / 5) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {needsResend && (
              <div className="space-y-3 rounded-xl border border-rose-200/70 bg-rose-50/60 p-4 text-sm text-rose-700">
                <p>Co the link da het han hoac khong dung. Ban co the gui lai email xac nhan o ben duoi.</p>
                <div className="space-y-2">
                  <label htmlFor="resend-email" className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    Email
                  </label>
                  <Input
                    id="resend-email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                {resendMessage && (
                  <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-700">
                    {resendMessage}
                  </div>
                )}
                {resendError && (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                    {resendError}
                  </div>
                )}
                <Button type="button" variant="outline" className="w-full" onClick={handleResend}>
                  Gui lai email xac nhan
                </Button>
              </div>
            )}

            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link to="/login">Quay lai dang nhap</Link>
              </Button>
              <div className="text-center text-xs text-muted-foreground">
                Can ho tro? Lien he admin hoac thu lai sau.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
