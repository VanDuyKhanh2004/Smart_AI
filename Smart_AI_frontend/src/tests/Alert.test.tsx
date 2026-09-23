import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

describe('Alert', () => {
  it('renders children content', () => {
    render(
      <Alert>
        <AlertDescription>Thông báo mặc định</AlertDescription>
      </Alert>
    );
    expect(screen.getByText('Thông báo mặc định')).toBeInTheDocument();
  });

  it('uses status role for success variant', () => {
    render(
      <Alert variant="success">
        <AlertDescription>Thành công</AlertDescription>
      </Alert>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('does not force a landmark role on default variant', () => {
    render(
      <Alert>
        <AlertDescription>Mặc định</AlertDescription>
      </Alert>
    );
    expect(screen.getByText('Mặc định')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('uses alert role for destructive variant', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Có lỗi</AlertTitle>
        <AlertDescription>Đã xảy ra lỗi</AlertDescription>
      </Alert>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Có lỗi')).toBeInTheDocument();
    expect(screen.getByText('Đã xảy ra lỗi')).toBeInTheDocument();
  });

  it('accepts explicit role override', () => {
    render(
      <Alert role="status" variant="destructive">
        <AlertDescription>Ghi đè role</AlertDescription>
      </Alert>
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
