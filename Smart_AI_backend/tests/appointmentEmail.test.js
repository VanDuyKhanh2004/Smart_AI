jest.mock('pino', () => {
  const mockInstance = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => mockInstance),
  };
  return jest.fn(() => mockInstance);
});

jest.mock('../services/emailService', () => ({
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendUnlockAccountEmail: jest.fn().mockResolvedValue(undefined),
  sendOrderConfirmationEmail: jest.fn().mockResolvedValue(undefined),
  sendAppointmentCreatedEmail: jest.fn().mockResolvedValue(undefined),
  sendAppointmentConfirmedEmail: jest.fn().mockResolvedValue(undefined),
  sendAppointmentCancelledEmail: jest.fn().mockResolvedValue(undefined),
}));

const mockEmailService = () => require('../services/emailService');

const APPOINTMENT_ID = '507f191e810c19729de860ed';

const appointmentFixture = {
  _id: APPOINTMENT_ID,
  store: {
    _id: '507f191e810c19729de860ec',
    name: 'Smart AI Center',
    address: { street: '123 Lê Lợi', district: 'Quận 1', city: 'TP.HCM', fullAddress: '123 Lê Lợi, Quận 1, TP.HCM' },
    phone: '0123456789',
  },
  date: new Date('2099-12-25T00:00:00.000Z'),
  timeSlot: { start: '10:00', end: '10:30' },
  purpose: 'consultation',
  notes: 'Cần tư vấn sản phẩm',
  status: 'pending',
};

describe('Appointment email builders', () => {
  const realEmailService = () => jest.requireActual('../services/emailService');

  it('builds the created email with store, date, time slot and purpose', () => {
    const { buildAppointmentCreatedEmail } = realEmailService();
    const { subject, text, html } = buildAppointmentCreatedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
    expect(subject).toContain('Lịch hẹn');
    expect(text).toContain('Nguyễn Văn A');
    expect(text).toContain('Smart AI Center');
    expect(text).toContain('25/12/2099');
    expect(text).toContain('10:00 - 10:30');
    expect(text).toContain('Tư vấn');
    expect(html).toContain('Nguyễn Văn A');
    expect(html).toContain('Smart AI Center');
    expect(html).toContain('10:00 - 10:30');
  });

  it('escapes user content in the created email', () => {
    const { buildAppointmentCreatedEmail } = realEmailService();
    const malicious = { ...appointmentFixture, notes: '<script>alert("xss")</script>' };
    const { html } = buildAppointmentCreatedEmail({ name: '<b>A</b>', email: 'a@test.com' }, malicious);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;A&lt;/b&gt;');
  });

  it('builds the confirmed email with a link to my-appointments', () => {
    const { buildAppointmentConfirmedEmail } = realEmailService();
    const { subject, html } = buildAppointmentConfirmedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
    expect(subject).toContain('đã được xác nhận');
    expect(html).toContain('/my-appointments');
  });

  it('includes the cancel reason in the cancelled email when present', () => {
    const { buildAppointmentCancelledEmail } = realEmailService();
    const cancelled = { ...appointmentFixture, cancelReason: 'Hết hàng' };
    const { subject, text, html } = buildAppointmentCancelledEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      cancelled,
    );
    expect(subject).toContain('đã bị hủy');
    expect(text).toContain('Hết hàng');
    expect(html).toContain('Hết hàng');
  });

  it('omits the cancel reason from the cancelled email when absent', () => {
    const { buildAppointmentCancelledEmail } = realEmailService();
    const { text, html } = buildAppointmentCancelledEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      { ...appointmentFixture, cancelReason: null },
    );
    expect(text).not.toContain('Lý do hủy');
    expect(html).not.toContain('Lý do hủy');
  });

  it('falls back to the default store name and drops missing address rows', () => {
    const { buildAppointmentCreatedEmail } = realEmailService();
    const noStore = {
      ...appointmentFixture,
      store: undefined,
      date: new Date('2099-12-25T00:00:00.000Z'),
    };
    const { text, html } = buildAppointmentCreatedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      noStore,
    );
    expect(text).toContain('Cửa hàng: Smart AI');
    expect(text).not.toContain('Địa chỉ:');
    expect(text).not.toContain('Số điện thoại:');
    expect(html).toContain('Smart AI');
    expect(html).not.toContain('Địa chỉ');
  });
});

describe('Email queue service — appointment emails', () => {
  const mockAdd = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockAdd.mockReset().mockResolvedValue({ id: 'job-1' });
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.register('emailQueue', { add: mockAdd });
  });

  afterEach(() => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();
  });

  it('enqueues appointment-created with deterministic jobId and payload', async () => {
    const { enqueueAppointmentCreatedEmail } = require('../services/emailQueueService');
    await enqueueAppointmentCreatedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
      'cid-1',
    );
    expect(mockAdd).toHaveBeenCalledWith(
      'email.appointment-created',
      expect.objectContaining({
        jobType: 'email.appointment-created',
        to: 'a@test.com',
        name: 'Nguyễn Văn A',
        appointmentId: APPOINTMENT_ID,
        correlationId: 'cid-1',
      }),
      expect.objectContaining({ jobId: `appointment-created-${APPOINTMENT_ID}` }),
    );
  });

  it('enqueues appointment-confirmed with deterministic jobId', async () => {
    const { enqueueAppointmentConfirmedEmail } = require('../services/emailQueueService');
    await enqueueAppointmentConfirmedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
      'cid-2',
    );
    expect(mockAdd).toHaveBeenCalledWith(
      'email.appointment-confirmed',
      expect.objectContaining({ jobType: 'email.appointment-confirmed' }),
      expect.objectContaining({ jobId: `appointment-confirmed-${APPOINTMENT_ID}` }),
    );
  });

  it('enqueues appointment-cancelled with deterministic jobId', async () => {
    const { enqueueAppointmentCancelledEmail } = require('../services/emailQueueService');
    await enqueueAppointmentCancelledEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
      'cid-3',
    );
    expect(mockAdd).toHaveBeenCalledWith(
      'email.appointment-cancelled',
      expect.objectContaining({ jobType: 'email.appointment-cancelled' }),
      expect.objectContaining({ jobId: `appointment-cancelled-${APPOINTMENT_ID}` }),
    );
  });

  it('falls back to direct send when the queue is not registered', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const { enqueueAppointmentCreatedEmail } = require('../services/emailQueueService');
    await enqueueAppointmentCreatedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
      'cid-4',
    );
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockEmailService().sendAppointmentCreatedEmail).toHaveBeenCalledWith(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
  });

  it('direct fallback routes appointment-confirmed to the correct sender', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const { enqueueAppointmentConfirmedEmail } = require('../services/emailQueueService');
    await enqueueAppointmentConfirmedEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
      'cid-5',
    );
    expect(mockEmailService().sendAppointmentConfirmedEmail).toHaveBeenCalledWith(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
    expect(mockEmailService().sendAppointmentCancelledEmail).not.toHaveBeenCalled();
  });

  it('direct fallback routes appointment-cancelled to the correct sender', async () => {
    const queueRegistry = require('../queues/queueRegistry');
    queueRegistry.closeAll();

    const { enqueueAppointmentCancelledEmail } = require('../services/emailQueueService');
    await enqueueAppointmentCancelledEmail(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
      'cid-6',
    );
    expect(mockEmailService().sendAppointmentCancelledEmail).toHaveBeenCalledWith(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
  });
});

describe('Email job processor — appointment emails', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('processes appointment-created and calls the email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e1',
      name: 'email.appointment-created',
      data: {
        jobType: 'email.appointment-created',
        to: 'a@test.com',
        name: 'Nguyễn Văn A',
        appointment: appointmentFixture,
        correlationId: 'cid-1',
      },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(result.emailType).toBe('email.appointment-created');
    expect(mockEmailService().sendAppointmentCreatedEmail).toHaveBeenCalledWith(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
  });

  it('processes appointment-confirmed and calls the email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e2',
      name: 'email.appointment-confirmed',
      data: {
        jobType: 'email.appointment-confirmed',
        to: 'a@test.com',
        name: 'Nguyễn Văn A',
        appointment: appointmentFixture,
        correlationId: 'cid-2',
      },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(mockEmailService().sendAppointmentConfirmedEmail).toHaveBeenCalledWith(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      appointmentFixture,
    );
  });

  it('processes appointment-cancelled and calls the email service', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e3',
      name: 'email.appointment-cancelled',
      data: {
        jobType: 'email.appointment-cancelled',
        to: 'a@test.com',
        name: 'Nguyễn Văn A',
        appointment: { ...appointmentFixture, cancelReason: 'Hết hàng' },
        correlationId: 'cid-3',
      },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    const result = await processJob(job);
    expect(result.sent).toBe(true);
    expect(result.emailType).toBe('email.appointment-cancelled');
    expect(mockEmailService().sendAppointmentCancelledEmail).toHaveBeenCalledWith(
      { name: 'Nguyễn Văn A', email: 'a@test.com' },
      expect.objectContaining({ cancelReason: 'Hết hàng' }),
    );
  });

  it('rethrows on unknown email job type to preserve retry behavior', async () => {
    const { processJob } = require('../jobs/emailJobs');
    const job = {
      id: 'e4',
      name: 'email.unknown',
      data: { jobType: 'email.unknown', to: 'a@test.com' },
      attemptsMade: 0,
      timestamp: Date.now(),
    };
    await expect(processJob(job)).rejects.toThrow('Unknown email job type');
  });
});
