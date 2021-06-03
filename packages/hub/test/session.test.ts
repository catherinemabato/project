import { SessionContext, SessionStatus } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';

import { Session } from '../src/session';

describe('Session', () => {
  it('initializes with the proper defaults', () => {
    const session = new Session().toJSON();

    // Grab current year to check if we are converting from sec -> ms correctly
    const currentYear = new Date(timestampInSeconds() * 1000).toISOString().slice(0, 4);
    expect(session).toEqual({
      attrs: {},
      duration: 0,
      errors: 0,
      init: true,
      sid: expect.any(String),
      started: expect.stringMatching(currentYear),
      status: SessionStatus.Ok,
      timestamp: expect.stringMatching(currentYear),
    });

    expect(session.sid).toHaveLength(32);

    // started and timestamp should be the same on creation
    expect(session.started).toEqual(session.timestamp);
  });

  describe('update', () => {
    const time = timestampInSeconds();
    // [ name, in, out ]
    const table: Array<[string, SessionContext, Record<string, any>]> = [
      ['sets an ip address', { user: { ip_address: '0.0.0.0' } }, { attrs: { ip_address: '0.0.0.0' } }],
      ['sets a did', { user: { id: 'specialID123' } }, { did: 'specialID123' }],
      ['sets a timestamp', { timestamp: time }, { timestamp: new Date(time * 1000).toISOString() }],
      ['sets a sid', { sid: '99705f22a3f1468e95ba7386e84691aa' }, { sid: '99705f22a3f1468e95ba7386e84691aa' }],
      [
        'requires custom sid to be of certain length',
        { sid: 'specialID123' },
        { sid: expect.not.stringMatching('specialID123') },
      ],
      ['sets an init', { init: false }, { init: false }],
      ['sets an did', { did: 'specialID123' }, { did: 'specialID123' }],
      ['overwrites user did with custom did', { did: 'custom-did', user: { id: 'user-id' } }, { did: 'custom-did' }],
      ['sets a started time', { started: time }, { started: new Date(time * 1000).toISOString() }],
      ['does not set a duration for browser env', { ignoreDuration: true }, { duration: undefined }],
      ['sets a duration', { duration: 12000 }, { duration: 12000 }],
      [
        'does not use custom duration for browser env',
        { duration: 12000, ignoreDuration: true },
        { duration: undefined },
      ],
      [
        'does not set a negative duration',
        { timestamp: 10, started: 100 },
        { duration: 0, timestamp: expect.any(String), started: expect.any(String) },
      ],
      [
        'sets duration based on timestamp and started',
        { timestamp: 100, started: 10 },
        { duration: 90, timestamp: expect.any(String), started: expect.any(String) },
      ],
      [
        'sets a release',
        { release: 'f1557994979ecd969963f53c27ca946379d721f3' },
        { attrs: { release: 'f1557994979ecd969963f53c27ca946379d721f3' } },
      ],
      ['sets an environment', { environment: 'staging' }, { attrs: { environment: 'staging' } }],
      ['sets an ipAddress', { ipAddress: '0.0.0.0' }, { attrs: { ip_address: '0.0.0.0' } }],
      [
        'overwrites user ip_address did with custom ipAddress',
        { ipAddress: '0.0.0.0', user: { ip_address: '1.1.1.1' } },
        { attrs: { ip_address: '0.0.0.0' } },
      ],
      ['sets an userAgent', { userAgent: 'Mozilla/5.0' }, { attrs: { user_agent: 'Mozilla/5.0' } }],
      ['sets errors', { errors: 3 }, { errors: 3 }],
      ['sets status', { status: SessionStatus.Crashed }, { status: SessionStatus.Crashed }],
    ];

    test.each(table)('%s', (...test) => {
      // duration and timestamp can vary after session update, so let's expect anything unless
      // the out variable in a test explicitly refers to it.
      const DEFAULT_OUT = { duration: expect.any(Number), timestamp: expect.any(String) };

      const session = new Session();
      const initSessionProps = session.toJSON();

      session.update(test[1]);
      expect(session.toJSON()).toEqual({ ...initSessionProps, ...DEFAULT_OUT, ...test[2] });
    });
  });

  describe('close', () => {
    it('exits a normal session', () => {
      const session = new Session();
      expect(session.status).toEqual(SessionStatus.Ok);
      session.close();
      expect(session.status).toEqual(SessionStatus.Exited);
    });

    it('updates session status when give status', () => {
      const session = new Session();
      expect(session.status).toEqual(SessionStatus.Ok);

      session.close(SessionStatus.Abnormal);
      expect(session.status).toEqual(SessionStatus.Abnormal);
    });

    it('only changes status ok to exited', () => {
      const session = new Session();
      session.update({ status: SessionStatus.Crashed });
      expect(session.status).toEqual(SessionStatus.Crashed);

      session.close();
      expect(session.status).toEqual(SessionStatus.Crashed);
    });
  });
});
