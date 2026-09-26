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

describe('ChatWindow accessibility (H13 / H06)', () => {
  it('exposes the message list as a polite live log', () => {
    render(<ChatWindow {...baseProps()} />);

    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-relevant', 'additions text');
    expect(log).toHaveAccessibleName();
    expect(log).toHaveTextContent('Tôi cần hỗ trợ');
    expect(log).toHaveTextContent('Chào bạn, chúng tôi có thể giúp gì?');
  });

  it('keeps error messages inside the live log region', () => {
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
