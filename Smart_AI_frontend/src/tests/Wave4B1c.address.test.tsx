import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AddressSelector } from '@/features/addresses/components/AddressSelector';
import { AddressList } from '@/features/addresses/components/AddressList';
import { AddressManagementPage } from '@/features/addresses/pages/AddressManagementPage';
import { addressService } from '@/services/address.service';

vi.mock('@/services/address.service', () => ({
  addressService: {
    getAddresses: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
    setDefaultAddress: vi.fn(),
  },
}));

let warnSpy: ReturnType<typeof vi.spyOn>;

function expectNoMissingDescriptionWarning() {
  const missing = warnSpy.mock.calls.filter((args: unknown[]) =>
    String(args[0]).includes('Missing `Description`')
  );
  expect(missing).toEqual([]);
}

beforeAll(() => {
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

function renderSelector() {
  return render(
    <AddressSelector
      addresses={[]}
      selectedAddress={null}
      onSelectAddress={vi.fn()}
      onUseNewAddress={vi.fn()}
      isLoading={false}
      canSaveAddress
    />
  );
}

describe('M06 AddressSelector label and error associations', () => {
  it('associates the address-label label with the select control', () => {
    renderSelector();

    fireEvent.click(
      screen.getByLabelText('Lưu địa chỉ này cho lần sau')
    );

    const label = document.querySelector('label[for="selector-label"]');
    expect(label).not.toBeNull();

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('id', 'selector-label');
    expect(trigger).toHaveAttribute('aria-required', 'true');
  });

  it('connects invalid fields to their errors and focuses the first invalid field', () => {
    renderSelector();

    fireEvent.click(screen.getByRole('button', { name: 'Sử dụng địa chỉ này' }));

    const fullName = document.getElementById('selector-fullName') as HTMLInputElement;
    expect(fullName).toHaveFocus();
    expect(fullName).toHaveAttribute('aria-invalid', 'true');
    expect(fullName).toHaveAttribute('aria-required', 'true');
    expect(fullName).toHaveAttribute('aria-describedby', 'selector-fullName-error');

    const error = document.getElementById('selector-fullName-error');
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('Họ tên là bắt buộc');

    for (const id of [
      'selector-phone',
      'selector-address',
      'selector-ward',
      'selector-district',
      'selector-city',
    ]) {
      const field = document.getElementById(id);
      expect(field).toHaveAttribute('aria-required', 'true');
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field?.getAttribute('aria-describedby')).toBeTruthy();
      expect(document.getElementById(`${id}-error`)).toHaveAttribute(
        'role',
        'alert'
      );
    }
  });

  it('keeps the field labels associated with their inputs', () => {
    renderSelector();

    expect(screen.getByLabelText(/^Họ và tên/)).toHaveAttribute(
      'id',
      'selector-fullName'
    );
    expect(screen.getByLabelText(/^Số điện thoại/)).toHaveAttribute(
      'id',
      'selector-phone'
    );
  });
});

describe('M10 AddressList loading status', () => {
  it('announces the address skeleton through role="status"', () => {
    render(
      <AddressList
        addresses={[]}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onSetDefault={vi.fn()}
        isLoading
      />
    );

    expect(
      screen.getByRole('status', { name: 'Đang tải địa chỉ' })
    ).toBeInTheDocument();
  });
});

describe('S08 address form dialog description', () => {
  it('renders a DialogDescription without Radix missing-description warnings', async () => {
    vi.mocked(addressService.getAddresses).mockResolvedValue({
      success: true,
      data: [],
    } as never);

    render(
      <MemoryRouter>
        <AddressManagementPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Thêm địa chỉ mới/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByText('Nhập thông tin địa chỉ giao hàng mới.')
    ).toBeInTheDocument();
    expectNoMissingDescriptionWarning();
  });

  it('keeps the fetch-failure inline error separate from the empty list', async () => {
    vi.mocked(addressService.getAddresses).mockRejectedValue({ code: 500 });

    render(
      <MemoryRouter>
        <AddressManagementPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(
        screen.getAllByText('Không thể tải danh sách địa chỉ').length
      ).toBeGreaterThan(0);
    });
    expect(
      screen.queryByRole('button', { name: /Thêm địa chỉ mới/ })
    ).not.toBeInTheDocument();
  });
});
