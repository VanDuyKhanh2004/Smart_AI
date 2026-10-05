import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProfilePage from '@/features/profile/pages/ProfilePage';
import ProfileInfoSection from '@/features/profile/components/ProfileInfoSection';
import AvatarUpload from '@/features/profile/components/AvatarUpload';
import { useAuthStore } from '@/stores/authStore';
import { profileService } from '@/services/profile.service';
import type { User } from '@/types/auth.type';

vi.mock('@/services/profile.service', () => ({
  profileService: {
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    getProfile: vi.fn(),
  },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: 'u1',
    name: 'Nguyễn Văn A',
    email: 'user@example.com',
    phone: '',
    role: 'user',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setStore(user: User | null, isLoading = false) {
  useAuthStore.setState({
    user,
    isAuthenticated: user !== null,
    isLoading,
    accessToken: user !== null ? 'tok' : null,
    error: null,
    errorCode: null,
  });
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/profile']}>
      <ProfilePage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  setStore(makeUser());
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('M02 ProfilePage toast and page states', () => {
  it('announces successful profile updates through a status toast', async () => {
    vi.mocked(profileService.updateProfile).mockResolvedValue({
      success: true,
      data: { name: 'Nguyễn Văn B', phone: '0901234567' },
    } as never);

    renderProfile();

    fireEvent.change(screen.getByLabelText('Họ và tên'), {
      target: { value: 'Nguyễn Văn B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const toast = await screen.findByText('Cập nhật thông tin thành công');
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });

  it('announces failed profile updates through an alert toast', async () => {
    vi.mocked(profileService.updateProfile).mockRejectedValue({
      response: { data: { message: 'Cập nhật thất bại' } },
    } as never);

    renderProfile();

    fireEvent.change(screen.getByLabelText('Họ và tên'), {
      target: { value: 'Nguyễn Văn B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const toast = await screen.findByText('Cập nhật thất bại');
    expect(toast).toHaveAttribute('role', 'alert');
  });

  it('exposes the page loading state as role="status"', () => {
    setStore(null, true);

    renderProfile();

    expect(screen.getByRole('status', { name: 'Đang tải' })).toBeInTheDocument();
  });

  it('exposes the missing-user error state as role="alert"', () => {
    setStore(null, false);

    renderProfile();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Không thể tải thông tin người dùng');
  });

  it('keeps all four profile tabs on a horizontally scrollable tablist', () => {
    renderProfile();

    const tablist = screen.getByRole('tablist');
    expect(tablist.className).toContain('overflow-x-auto');
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });
});

describe('M05 ProfileInfoSection validation semantics', () => {
  it('focuses the first invalid field and links its error message', async () => {
    setStore(makeUser({ name: 'A' }));

    render(<ProfileInfoSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const input = await screen.findByLabelText('Họ và tên');
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'profile-name-error');
    expect(screen.getByText('Tên phải có ít nhất 2 ký tự')).toHaveAttribute(
      'role',
      'alert'
    );
  });

  it('links the phone error message to the phone input', async () => {
    setStore(makeUser({ phone: '123' }));

    render(<ProfileInfoSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    const phone = await screen.findByLabelText('Số điện thoại');
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'));
    expect(phone).toHaveAttribute('aria-describedby', 'profile-phone-error');
    expect(
      screen.getByText('Số điện thoại phải có 10-11 chữ số')
    ).toHaveAttribute('role', 'alert');
  });

  it('adds autocomplete hints and keeps the email field disabled', () => {
    render(<ProfileInfoSection />);

    expect(screen.getByLabelText('Họ và tên')).toHaveAttribute(
      'autocomplete',
      'name'
    );
    expect(screen.getByLabelText('Số điện thoại')).toHaveAttribute(
      'autocomplete',
      'tel'
    );
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
  });
});

describe('S02 AvatarUpload keyboard access and busy guard', () => {
  it('activates the avatar control with the keyboard', () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(
      <AvatarUpload userName="Nguyễn Văn A" currentAvatar={undefined} />
    );

    const avatar = screen.getByRole('button', { name: 'Thay đổi ảnh đại diện' });
    clickSpy.mockClear();
    avatar.focus();
    fireEvent.keyDown(avatar, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('does not open a second picker while an upload is in flight', async () => {
    vi.mocked(profileService.uploadAvatar).mockReturnValue(
      new Promise(() => undefined) as never
    );
    render(
      <AvatarUpload userName="Nguyễn Văn A" currentAvatar={undefined} />
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['data'], 'avatar.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(profileService.uploadAvatar).toHaveBeenCalledTimes(1));

    const container = input.closest('[aria-busy]');
    expect(container).not.toBeNull();
    expect(container).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.getByRole('status', { name: 'Đang tải ảnh đại diện' })
    ).toBeInTheDocument();

    const avatar = screen.getByRole('button', { name: 'Thay đổi ảnh đại diện' });
    expect(avatar).toHaveAttribute('tabindex', '-1');
    expect(avatar).toHaveAttribute('aria-disabled', 'true');

    fireEvent.change(input, { target: { files: [file] } });
    expect(profileService.uploadAvatar).toHaveBeenCalledTimes(1);
  });

  it('associates the inline upload error with the upload controls', async () => {
    vi.mocked(profileService.uploadAvatar).mockRejectedValue({
      response: { data: { message: 'Upload thất bại' } },
    } as never);
    render(
      <AvatarUpload userName="Nguyễn Văn A" currentAvatar={undefined} />
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['data'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    const error = await screen.findByText('Upload thất bại');
    expect(error).toHaveAttribute('id', 'avatar-upload-error');
    expect(
      screen.getByRole('button', { name: 'Đổi ảnh đại diện' })
    ).toHaveAttribute('aria-describedby', 'avatar-upload-error');
  });
});
