import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import Footer from '@/components/layout/Footer';

function renderFooter() {
  return render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
}

describe('Footer', () => {
  it('renders the brand name', () => {
    renderFooter();
    expect(screen.getByText('Smart AI')).toBeInTheDocument();
  });

  it('renders the brand description', () => {
    renderFooter();
    expect(screen.getByText(/nền tảng mua sắm điện thoại thông minh/i)).toBeInTheDocument();
  });

  it('renders the phone link with correct href', () => {
    renderFooter();
    const phoneLink = screen.getByText('0984499302').closest('a');
    expect(phoneLink).toHaveAttribute('href', 'tel:0984499302');
  });

  it('renders the email link with correct href', () => {
    renderFooter();
    const emailLink = screen.getByText('duykhanhpro04@gmail.com').closest('a');
    expect(emailLink).toHaveAttribute('href', 'mailto:duykhanhpro04@gmail.com');
  });

  it('renders the Facebook link with correct URL and target', () => {
    renderFooter();
    const fbLink = screen.getByLabelText('Facebook');
    expect(fbLink).toHaveAttribute('href', 'https://www.facebook.com/duykhanh.van.988?locale=vi_VN');
    expect(fbLink).toHaveAttribute('target', '_blank');
    expect(fbLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders the Instagram link with correct URL and target', () => {
    renderFooter();
    const igLink = screen.getByLabelText('Instagram');
    expect(igLink).toHaveAttribute('href', 'https://www.instagram.com/duykhanh.van.988/');
    expect(igLink).toHaveAttribute('target', '_blank');
    expect(igLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders navigation links that exist in the project', () => {
    renderFooter();
    expect(screen.getByText('Sản phẩm')).toHaveAttribute('href', '/products');
    expect(screen.getByText('Cửa hàng')).toHaveAttribute('href', '/stores');
  });

  it('renders the copyright year', () => {
    renderFooter();
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year} Smart AI`))).toBeInTheDocument();
  });

  it('has semantic footer element', () => {
    renderFooter();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
