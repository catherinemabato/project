import { applyScopeDataToEvent } from '@sentry/core';
import type { Attachment, Breadcrumb, Client, EventProcessor } from '@sentry/types';
import { Scope, getIsolationScope } from '../../src';
import { getGlobalScope } from '../../src/sdk/scope';
import { mockSdkInit, resetGlobals } from '../helpers/mockSdkInit';

describe('Unit | Scope', () => {
  it('allows to create & update a scope', () => {
    const scope = new Scope();

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {},
      extra: {},
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    expect(scope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  it('allows to clone a scope', () => {
    const scope = new Scope();

    scope.update({
      tags: { foo: 'bar' },
      extra: { foo2: 'bar2' },
    });

    const newScope = scope.clone();
    expect(newScope).toBeInstanceOf(Scope);
    expect(newScope).not.toBe(scope);

    expect(newScope.getScopeData()).toEqual({
      breadcrumbs: [],
      attachments: [],
      contexts: {},
      tags: {
        foo: 'bar',
      },
      extra: {
        foo2: 'bar2',
      },
      user: {},
      level: undefined,
      fingerprint: [],
      eventProcessors: [],
      propagationContext: {
        traceId: expect.any(String),
        spanId: expect.any(String),
      },
      sdkProcessingMetadata: {},
    });
  });

  it('allows to set & get a client', () => {
    const scope = new Scope();
    expect(scope.getClient()).toBeUndefined();
    const client = {} as Client;
    scope.setClient(client);
    expect(scope.getClient()).toBe(client);
  });

  it('gets the correct isolationScope in _getIsolationScope', () => {
    resetGlobals();

    const scope = new Scope();
    const globalIsolationScope = getIsolationScope();

    expect(scope['_getIsolationScope']()).toBe(globalIsolationScope);

    const customIsolationScope = new Scope();
    scope.isolationScope = customIsolationScope;

    expect(scope['_getIsolationScope']()).toBe(customIsolationScope);
  });

  describe('applyToEvent', () => {
    it('works without any data', async () => {
      mockSdkInit();

      const scope = new Scope();

      const event = { message: 'foo' };
      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        sdkProcessingMetadata: {
          propagationContext: {
            spanId: expect.any(String),
            traceId: expect.any(String),
          },
        },
      });
    });

    it('merges scope data', async () => {
      mockSdkInit();

      const breadcrumb1 = { message: '1', timestamp: 111 } as Breadcrumb;
      const breadcrumb2 = { message: '2', timestamp: 222 } as Breadcrumb;
      const breadcrumb3 = { message: '3', timestamp: 123 } as Breadcrumb;
      const breadcrumb4 = { message: '4', timestamp: 333 } as Breadcrumb;

      const eventProcessor1 = jest.fn((a: unknown) => a) as EventProcessor;
      const eventProcessor2 = jest.fn((b: unknown) => b) as EventProcessor;
      const eventProcessor3 = jest.fn((c: unknown) => c) as EventProcessor;

      const scope = new Scope();
      scope.update({
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
        propagationContext: { spanId: '1', traceId: '1' },
        fingerprint: ['aa'],
      });
      scope.addBreadcrumb(breadcrumb1);
      scope.addEventProcessor(eventProcessor1);

      const globalScope = getGlobalScope();
      const isolationScope = getIsolationScope();

      globalScope.addBreadcrumb(breadcrumb2);
      globalScope.addEventProcessor(eventProcessor2);
      globalScope.setSDKProcessingMetadata({ aa: 'aa' });

      isolationScope.addBreadcrumb(breadcrumb3);
      isolationScope.addEventProcessor(eventProcessor3);
      globalScope.setSDKProcessingMetadata({ bb: 'bb' });

      const event = { message: 'foo', breadcrumbs: [breadcrumb4], fingerprint: ['dd'] };

      applyScopeDataToEvent(event, scope.getScopeData());

      expect(event).toEqual({
        message: 'foo',
        user: { id: '1', email: 'test@example.com' },
        tags: { tag1: 'aa', tag2: 'aa' },
        extra: { extra1: 'aa', extra2: 'aa' },
        contexts: { os: { name: 'os1' }, culture: { display_name: 'name1' } },
        fingerprint: ['dd', 'aa'],
        breadcrumbs: [breadcrumb4, breadcrumb2, breadcrumb3, breadcrumb1],
        sdkProcessingMetadata: {
          aa: 'aa',
          bb: 'bb',
          propagationContext: {
            spanId: '1',
            traceId: '1',
          },
        },
      });
    });
  });

  describe('getAttachments', () => {
    it('works without any data', async () => {
      mockSdkInit();

      const scope = new Scope();

      const actual = scope.getAttachments();
      expect(actual).toEqual([]);
    });

    it('merges attachments data', async () => {
      mockSdkInit();

      const attachment1 = { filename: '1' } as Attachment;
      const attachment2 = { filename: '2' } as Attachment;
      const attachment3 = { filename: '3' } as Attachment;

      const scope = new Scope();
      scope.addAttachment(attachment1);

      const globalScope = getGlobalScope();
      const isolationScope = getIsolationScope();

      globalScope.addAttachment(attachment2);
      isolationScope.addAttachment(attachment3);

      const actual = scope.getAttachments();
      expect(actual).toEqual([attachment2, attachment3, attachment1]);
    });
  });
});
