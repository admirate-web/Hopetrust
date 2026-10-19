import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  usePathname: () => '/contact',
}));

vi.mock('next/image', () => ({
  default: ({ fill, priority, ...rest }: Record<string, unknown>) => {
    return <img {...rest} data-fill={fill ? 'true' : undefined} />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ className: 'mock-font' }),
  Inter: () => ({ className: 'mock-font' }),
}));

vi.mock('next/dynamic', () => ({
  default: () => {
    const DummyComponent = () => <div data-testid="dynamic-component" />;
    return DummyComponent;
  },
}));

const mockInsert = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: mockInsert,
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

import ContactPage from '@/app/contact/page';
import { toast } from 'sonner';

describe('ContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('renders the contact form', () => {
    render(<ContactPage />);
    expect(screen.getByText('Send us a Message')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('John Doe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('john@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('How can we help you today?')).toBeInTheDocument();
  });

  it('renders contact info cards', () => {
    render(<ContactPage />);
    expect(screen.getByText('Email Us')).toBeInTheDocument();
    expect(screen.getByText('Call Us')).toBeInTheDocument();
    expect(screen.getByText('Visit Us')).toBeInTheDocument();
  });

  it('shows validation error for short name', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.type(screen.getByPlaceholderText('John Doe'), 'A');
    await user.type(screen.getByPlaceholderText('+91 98765 43210'), '9876543210');
    await user.type(screen.getByPlaceholderText('john@example.com'), 'test@test.com');
    await user.type(screen.getByPlaceholderText('How can we help you today?'), 'Need some help with therapy sessions');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith('Name must be at least 2 characters');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('shows validation error for short message', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.type(screen.getByPlaceholderText('John Doe'), 'John Doe');
    await user.type(screen.getByPlaceholderText('+91 98765 43210'), '9876543210');
    await user.type(screen.getByPlaceholderText('john@example.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('How can we help you today?'), 'Hi');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    expect(toast.error).toHaveBeenCalledWith('Message must be at least 10 characters');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('submits form data to Supabase on valid input', async () => {
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.type(screen.getByPlaceholderText('John Doe'), 'John Doe');
    await user.type(screen.getByPlaceholderText('+91 98765 43210'), '9876543210');
    await user.type(screen.getByPlaceholderText('john@example.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('How can we help you today?'), 'I need help with anxiety treatment');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith({
        full_name: 'John Doe',
        phone: '9876543210',
        email: 'john@example.com',
        message: 'I need help with anxiety treatment',
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('shows error toast when Supabase insert fails', async () => {
    mockInsert.mockResolvedValue({ error: new Error('DB error') });
    const user = userEvent.setup();
    render(<ContactPage />);

    await user.type(screen.getByPlaceholderText('John Doe'), 'John Doe');
    await user.type(screen.getByPlaceholderText('+91 98765 43210'), '9876543210');
    await user.type(screen.getByPlaceholderText('john@example.com'), 'john@example.com');
    await user.type(screen.getByPlaceholderText('How can we help you today?'), 'I need help with anxiety treatment');

    const submitBtn = document.querySelector('button[type="submit"]')!;
    await user.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to send message. Please try again.');
    });
  });
});
