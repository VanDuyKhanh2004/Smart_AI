import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChatMessageComponent from '@/features/chat/components/ChatMessage';
import type { ChatMessage } from '@/services/chat.service';

afterEach(() => {
  vi.restoreAllMocks();
});

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm-1',
    clientMessageId: 'turn-1',
    role: 'user',
    content: 'Yêu cầu dài',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ChatMessage retry/regenerate placement', () => {
  it('renders Retry on an early-cancelled USER turn (retryable)', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          retryable: true,
          generationStatus: 'cancelled',
        })}
        canRetry
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeDefined();
  });

  it('renders Retry on a partial CANCELLED assistant bubble, not on the user turn', () => {
    render(<ChatMessageComponent message={makeMessage({ role: 'assistant', cancelled: true, content: 'nửa câu' })} canRetry onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeDefined();
    expect(screen.getByText('nửa câu')).toBeDefined();
  });

  it('renders Retry on a partial FAILED assistant message (content preserved)', () => {
    render(<ChatMessageComponent message={makeMessage({ id: 'a-2', role: 'assistant', failed: true, content: 'một phần' })} canRetry onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Thử lại/i })).toBeDefined();
    expect(screen.getByText('một phần')).toBeDefined();
  });

  it('does NOT render Retry on a completed assistant message', () => {
    render(<ChatMessageComponent message={makeMessage({ id: 'a-3', role: 'assistant', content: 'xong' })} canRetry={false} />);
    expect(screen.queryByRole('button', { name: /Thử lại/i })).toBeNull();
  });

  it('renders Regenerate on a completed assistant message', () => {
    render(<ChatMessageComponent message={makeMessage({ id: 'a-4', role: 'assistant', content: 'xong' })} canRegenerate onRegenerate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Tạo lại/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Thử lại/i })).toBeNull();
  });

  it('clicking Retry passes the containing message', () => {
    const onRetry = vi.fn();
    const msg = makeMessage({ role: 'user', retryable: true });
    render(<ChatMessageComponent message={msg} canRetry onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }));
    expect(onRetry).toHaveBeenCalledWith(msg);
  });

  it('a regenerating assistant does NOT show Retry', () => {
    render(<ChatMessageComponent message={makeMessage({ id: 'a-5', role: 'assistant', content: 'xong', regenerating: true })} canRetry onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Thử lại/i })).toBeNull();
    expect(screen.getByText('Đang tạo lại...')).toBeDefined();
  });
});