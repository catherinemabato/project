import { expect } from 'chai';
import { spy, stub } from 'sinon';
import { Client, LogLevel } from '../../src/lib/client';
import { SentryError } from '../../src/lib/error';
import { MockAdapter } from '../mocks/MockAdapter';

const dsn = 'https://username:password@domain/path';

describe('Client', () => {
  it('get public/private DSN', () => {
    const sentry = new Client(dsn);
    expect(sentry.dsn.toString()).to.equal('https://username@domain/path');
    expect(sentry.dsn.toString(true)).to.equal(dsn);
    const sentry2 = new Client('https://username:password@domain:8888/path');
    expect(sentry2.dsn.toString()).to.equal(
      'https://username@domain:8888/path',
    );
    expect(sentry2.dsn.toString(true)).to.equal(
      'https://username:password@domain:8888/path',
    );
  });

  it('invalid DSN', () => {
    expect(() => {
      new Client('abc');
    }).to.throw();
    expect(() => {
      new Client('https://username:password@domain');
    }).to.throw();
    expect(() => {
      new Client('//username:password@domain');
    }).to.throw();
    expect(() => {
      new Client('https://username:@domain');
    }).to.throw();
    expect(() => {
      new Client('123');
    }).to.throw();
    try {
      new Client('123');
    } catch (e) {
      expect(e instanceof SentryError).to.be.ok;
    }
  });

  it('throw error if multiple Adapters', () => {
    const sentry = new Client(dsn);
    sentry.use(MockAdapter);
    expect(() => sentry.use(MockAdapter)).to.throw();
  });

  it('call install on Adapter', async () => {
    const sentry = new Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    const spy1 = spy(sentry, 'install');
    const spy2 = spy(sentry.getAdapter(), 'install');
    await sentry.install();
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
  });

  it('multiple install calls on Adapter should only call once', async () => {
    const sentry = new Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    const spy1 = spy(sentry.getAdapter(), 'install');
    await sentry.install();
    await sentry.install();
    expect(spy1.calledOnce).to.be.true;
  });

  it('no registered Adapter', async () => {
    const sentry = new Client(dsn);
    try {
      await sentry.install();
    } catch (e) {
      expect((e as Error).message).to.equal(
        'No adapter in use, please call .use(<Adapter>)',
      );
    }
  });

  it('get Adapter', () => {
    const sentry = new Client(dsn);
    sentry.use(MockAdapter, { testOption: true });
    expect(sentry.getAdapter()).to.be.an.instanceof(MockAdapter);
  });

  it('call captureMessage with reject on Adapter', async () => {
    const sentry = await new Client(dsn).use(MockAdapter).install();
    try {
      await sentry.captureMessage('fail');
    } catch (e) {
      expect((e as Error).message).to.equal('Failed because we told it to');
    }
  });

  it('call captureMessage on Adapter', async () => {
    const sentry = new Client(dsn).use(MockAdapter);
    await sentry.install();
    const spy1 = spy(sentry, 'captureMessage');
    const spy2 = spy(sentry.getAdapter(), 'captureMessage');
    const result = await sentry.captureMessage('heyho');
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(result).to.be.ok;
    if (result) {
      expect(result.message).to.equal('heyho');
    }
  });

  it('call captureBreadcrumb on Adapter', async () => {
    const sentry = new Client(dsn).use(MockAdapter);
    await sentry.install();
    const spy1 = spy(sentry, 'captureBreadcrumb');
    const spy2 = spy(sentry.getAdapter(), 'captureBreadcrumb');
    await sentry.captureBreadcrumb({ category: 'test' });
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
  });

  it('call captureException on Adapter', async () => {
    const sentry = await new Client(dsn).use(MockAdapter).install();
    const spy1 = spy(sentry, 'captureException');
    const spy2 = spy(sentry.getAdapter(), 'captureException');
    await sentry.captureException(new Error('oops'));
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
  });

  it('call send only on one Adapter', async () => {
    const sentry = await new Client(dsn).use(MockAdapter).install();
    const spy1 = spy(sentry, 'captureMessage');
    const spy2 = spy(sentry.getAdapter(), 'captureMessage');
    const spySend = spy(sentry, 'send');
    const spySend2 = spy(sentry.getAdapter(), 'send');
    const result = await sentry.captureMessage('+');
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(spySend.calledOnce).to.be.true;
    expect(spySend2.calledOnce).to.be.true;
    expect(result).to.be.ok;
    if (result) {
      expect(result.message).to.equal('+');
    }
  });

  it('call log only if bigger debug', () => {
    const sentry = new Client(dsn).use(MockAdapter);
    const spy1 = spy(global.console, 'log');
    sentry.log('Nothing');
    expect(spy1.calledOnce).to.be.false;
    sentry.options.logLevel = LogLevel.Debug;
    sentry.log('This is fine');
    expect(spy1.calledOnce).to.be.true;
  });

  it('should throw error without calling install', async () => {
    const sentry = new Client(dsn).use(MockAdapter);
    return sentry.captureException(new Error('oops')).catch(err => {
      expect(err).to.be.instanceof(SentryError);
      expect((err as Error).message).to.equal(
        'SDK not installed. Please call install() before using the SDK',
      );
    });
  });

  it('call setOptions on Adapter', async () => {
    const sentry = await new Client(dsn).use(MockAdapter).install();
    const spy1 = spy(sentry.getAdapter(), 'setOptions');
    await sentry.setOptions({ release: '#oops' });
    expect(spy1.calledOnce).to.be.true;
  });

  it('setContext', async () => {
    const sentry = await new Client(dsn).use(MockAdapter).install();
    await sentry.setContext({
      extra: { some: 'key' },
      tags: { key: 'test1', key2: 'test2' },
    });

    expect(await sentry.getContext()).to.deep.equal({
      extra: { some: 'key' },
      tags: { key: 'test1', key2: 'test2' },
    });
  });

  it('should call breadcrumbs callbacks', async () => {
    const shouldAddBreadcrumb = stub().returns(true);
    const beforeBreadcrumb = spy();
    const afterBreadcrumb = spy();

    const sentry = new Client(dsn, {
      afterBreadcrumb,
      beforeBreadcrumb,
      shouldAddBreadcrumb,
    }).use(MockAdapter);

    await sentry.install();
    const spy1 = spy(sentry, 'captureBreadcrumb');
    const spy2 = spy(sentry.getAdapter(), 'captureBreadcrumb');
    await sentry.captureBreadcrumb({ category: 'test' });
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(shouldAddBreadcrumb.calledOnce).to.be.true;
    expect(beforeBreadcrumb.calledOnce).to.be.true;
    expect(afterBreadcrumb.calledOnce).to.be.true;
  });

  it('should not call breadcrumbs callbacks', async () => {
    const shouldAddBreadcrumb = stub().returns(false);
    const beforeBreadcrumb = spy();
    const afterBreadcrumb = spy();

    const sentry = new Client(dsn, {
      afterBreadcrumb,
      beforeBreadcrumb,
      shouldAddBreadcrumb,
    }).use(MockAdapter);

    await sentry.install();
    const spy1 = spy(sentry, 'captureBreadcrumb');
    const spy2 = spy(sentry.getAdapter(), 'captureBreadcrumb');
    await sentry.captureBreadcrumb({ category: 'test' });
    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.false;
    expect(shouldAddBreadcrumb.calledOnce).to.be.true;
    expect(beforeBreadcrumb.calledOnce).to.be.false;
    expect(afterBreadcrumb.calledOnce).to.be.false;
  });

  it('should call send callbacks', async () => {
    const shouldSend = stub().returns(true);
    const beforeSend = spy();
    const afterSend = spy();

    const sentry = new Client(dsn, {
      afterSend,
      beforeSend,
      shouldSend,
    }).use(MockAdapter);

    await sentry.install();
    const spy1 = spy(sentry, 'captureMessage');
    const spy2 = spy(sentry.getAdapter(), 'captureMessage');
    const spySend = spy(sentry, 'send');
    const spySend2 = spy(sentry.getAdapter(), 'send');
    await sentry.captureMessage('+');

    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(spySend.calledOnce).to.be.true;
    expect(spySend2.calledOnce).to.be.true;

    expect(shouldSend.calledOnce).to.be.true;
    expect(beforeSend.calledOnce).to.be.true;
    expect(afterSend.calledOnce).to.be.true;
  });

  it('should not call send callbacks', async () => {
    const shouldSend = stub().returns(false);
    const beforeSend = spy();
    const afterSend = spy();

    const sentry = new Client(dsn, {
      afterSend,
      beforeSend,
      shouldSend,
    }).use(MockAdapter);

    await sentry.install();
    const spy1 = spy(sentry, 'captureMessage');
    const spy2 = spy(sentry.getAdapter(), 'captureMessage');
    const spySend = spy(sentry, 'send');
    const spySend2 = spy(sentry.getAdapter(), 'send');
    await sentry.captureMessage('+');

    expect(spy1.calledOnce).to.be.true;
    expect(spy2.calledOnce).to.be.true;
    expect(spySend.calledOnce).to.be.true;
    expect(spySend2.calledOnce).to.be.false;

    expect(shouldSend.calledOnce).to.be.true;
    expect(beforeSend.calledOnce).to.be.false;
    expect(afterSend.calledOnce).to.be.false;
  });
});
