import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import ChatWindow from '@/features/chat/components/ChatWindow';
import type { ChatMessage as ChatMessageType } from '@/services/chat.service';

function makeMessages(): ChatMessageType[] {
  return [
    {
      id: 'm1',
      role: 'user',
      content: 'Tôi cần hỗ trợ',
      timestamp: new Date('2024-01-01T00:00:00.000Z'),
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'Chào bạn, chúng tôi có thể giúp gì?',
      timestamp: new Date('2024-01-01T00:00:01.000Z'),
    },
  ];
}

function baseProps() {
  return {
    isOpen: true,
    onClose: vi.fn(),
    onMinimize: vi.fn(),
    messages: makeMessages(),
    isConnected: true,
    isProcessing: false,
    isActiveGeneration: false,
    error: null,
    onSendMessage: vi.fn(() => true),
    onStopGeneration: vi.fn(),
    onReset: vi.fn(),
  };
}

beforeAll(() => {
  // jsdom does not implement Element.scrollIntoView
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      writable: true,
      value: vi.fn(),
    });
  }
});

describe('ChatWindow accessibility (H13 / H06 / W3-01)', () => {
  it('exposes the message list as a non-live log (W3-01)', () => {
    render(<ChatWindow {...baseProps()} />);

    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'off');
    expect(log).not.toHaveAttribute('aria-relevant');
    expect(log).toHaveAccessibleName();
    expect(log).toHaveTextContent('Tôi cần hỗ trợ');
    expect(log).toHaveTextContent('Chào bạn, chúng tôi có thể giúp gì?');
  });

  it('exposes a polite status region for announcements (W3-01)', () => {
    render(<ChatWindow {...baseProps()} />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();
  });

  it('announces the start of a response through the status region', () => {
    render(<ChatWindow {...baseProps()} isProcessing={true} />);

    expect(screen.getByRole('status')).toHaveTextContent('Đang trả lời...');
  });

  it('announces completion with the final assistant answer', () => {
    const { rerender } = render(<ChatWindow {...baseProps()} isProcessing={true} />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang trả lời...');

    rerender(<ChatWindow {...baseProps()} isProcessing={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Hoàn tất. Chào bạn, chúng tôi có thể giúp gì?'
    );
  });

  it('announces errors through the status region', () => {
    render(<ChatWindow {...baseProps()} error="Mất kết nối máy chủ" />);

    expect(screen.getByRole('status')).toHaveTextContent('Mất kết nối máy chủ');
  });

  it('keeps error messages inside the log region', () => {
    render(<ChatWindow {...baseProps()} error="Mất kết nối máy chủ" />);

    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('Mất kết nối máy chủ');
  });

  it('gives every icon-only control an accessible name', () => {
    render(<ChatWindow {...baseProps()} />);

    expect(
      screen.getByRole('button', { name: 'Bắt đầu cuộc trò chuyện mới' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Thu nhỏ cửa sổ chat' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Đóng cửa sổ chat' })
    ).toBeInTheDocument();
  });

  it('labels the stop control while an answer is streaming', () => {
    render(<ChatWindow {...baseProps()} isActiveGeneration={true} />);

    expect(
      screen.getByRole('button', { name: 'Dừng trả lời' })
    ).toBeInTheDocument();
  });
});
