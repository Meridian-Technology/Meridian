const {
  createLandingRateLimit,
  pivotLandingEventRateLimit,
  pivotLandingWaitlistRateLimit,
  pivotLandingQrHopRateLimit,
  pivotLandingCopyRateLimit,
  MAX_REQUESTS_PER_WINDOW,
  LANDING_EVENT_MAX_PER_WINDOW,
  WAITLIST_MAX_PER_WINDOW,
  QR_HOP_MAX_PER_WINDOW,
} = require('../../middlewares/pivotLandingDropRateLimit');

function mockReq(ip = '203.0.113.10') {
  return { ip };
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('pivotLandingDropRateLimit (Task 6.2)', () => {
  afterEach(() => {
    pivotLandingEventRateLimit.reset();
    pivotLandingWaitlistRateLimit.reset();
    pivotLandingQrHopRateLimit.reset();
    pivotLandingCopyRateLimit.reset();
  });

  it('documents tightened per-IP burst caps', () => {
    expect(WAITLIST_MAX_PER_WINDOW).toBe(10);
    expect(LANDING_EVENT_MAX_PER_WINDOW).toBe(30);
    expect(QR_HOP_MAX_PER_WINDOW).toBe(30);
    expect(MAX_REQUESTS_PER_WINDOW).toBe(60);
    expect(pivotLandingWaitlistRateLimit.max).toBe(10);
    expect(pivotLandingEventRateLimit.max).toBe(30);
    expect(pivotLandingQrHopRateLimit.max).toBe(30);
    expect(pivotLandingCopyRateLimit.max).toBe(60);
  });

  it('returns 429 with the limiter code after a burst from one IP', () => {
    const limit = createLandingRateLimit({
      message: 'slow down',
      code: 'WAITLIST_RATE_LIMIT',
      max: 2,
    });
    const next = jest.fn();

    limit(mockReq(), mockRes(), next);
    limit(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const limited = mockRes();
    limit(mockReq(), limited, next);
    expect(limited.statusCode).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      message: 'slow down',
      code: 'WAITLIST_RATE_LIMIT',
    });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('tracks IPs separately', () => {
    const limit = createLandingRateLimit({
      message: 'slow down',
      code: 'WAITLIST_RATE_LIMIT',
      max: 1,
    });
    const next = jest.fn();

    limit(mockReq('10.0.0.1'), mockRes(), next);
    limit(mockReq('10.0.0.2'), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const limited = mockRes();
    limit(mockReq('10.0.0.1'), limited, next);
    expect(limited.statusCode).toBe(429);
    expect(next).toHaveBeenCalledTimes(2);
  });
});
