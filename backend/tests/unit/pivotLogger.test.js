const {
  logPivot,
  pivotRequestContext,
  pivotRequestLogger,
  logPivotRouteError,
  isPivotLoggingEnabled,
  isPivotRequestLoggingEnabled,
  isPivotDetailLoggingEnabled,
} = require('../../utilities/pivotLogger');

describe('pivotLogger', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.PIVOT_LOG;
    delete process.env.PIVOT_REQUEST_LOG;
    delete process.env.PIVOT_DETAIL_LOG;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('logs info messages when enabled', () => {
    logPivot('info', 'feed built', { eventCount: 3 });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[pivot] feed built'),
    );
  });

  it('keeps per-item detail logging opt-in', () => {
    expect(isPivotDetailLoggingEnabled()).toBe(false);
    process.env.PIVOT_DETAIL_LOG = '1';
    expect(isPivotDetailLoggingEnabled()).toBe(true);
  });

  it('does not log during tests', () => {
    process.env.NODE_ENV = 'test';
    expect(isPivotLoggingEnabled()).toBe(false);
    logPivot('info', 'hidden');
    expect(console.log).not.toHaveBeenCalled();
  });

  function requestPair(statusCode = 200) {
    const req = {
      method: 'GET',
      originalUrl: '/pivot/feed?batchWeek=2026-W22',
      school: 'nyc',
      user: { userId: '507f191e810c19729de860eb' },
    };
    const res = {
      statusCode,
      on(event, handler) {
        if (event === 'finish') {
          this._finish = handler;
        }
      },
      emit(event) {
        if (event === 'finish' && this._finish) {
          this._finish();
        }
      },
    };

    return { req, res };
  }

  it('does not log successful requests by default', (done) => {
    const { req, res } = requestPair();

    pivotRequestLogger(req, res, () => {
      res.emit('finish');
      expect(console.log).not.toHaveBeenCalled();
      done();
    });
  });

  it('logs successful requests when explicitly enabled', (done) => {
    process.env.PIVOT_REQUEST_LOG = 'true';
    expect(isPivotRequestLoggingEnabled()).toBe(true);
    const { req, res } = requestPair();

    pivotRequestLogger(req, res, () => {
      res.emit('finish');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[pivot] request'),
      );
      done();
    });
  });

  it('continues to log unsuccessful requests by default', (done) => {
    const { req, res } = requestPair(429);

    pivotRequestLogger(req, res, () => {
      res.emit('finish');
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[pivot] request'),
      );
      done();
    });
  });

  it('logPivotRouteError writes error level', () => {
    logPivotRouteError('GET /pivot/feed', new Error('boom'), {
      method: 'GET',
      originalUrl: '/pivot/feed',
      school: 'nyc',
    });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('GET /pivot/feed failed'),
    );
  });

  it('pivotRequestContext extracts tenant and user', () => {
    expect(
      pivotRequestContext({
        method: 'POST',
        originalUrl: '/pivot/feed/action',
        school: 'nyc',
        user: { userId: 'abc' },
      }),
    ).toEqual({
      tenant: 'nyc',
      userId: 'abc',
      method: 'POST',
      path: '/pivot/feed/action',
    });
  });
});
