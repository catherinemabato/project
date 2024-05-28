import type { EventHint, FeedbackEvent, SendFeedbackParams } from '@sentry/types';
import { dropUndefinedKeys } from '@sentry/utils';
import { getClient, getCurrentScope } from './currentScopes';

/**
 * Send user feedback to Sentry.
 */
export function captureFeedback(
  params: SendFeedbackParams,
  hint: EventHint & { includeReplay?: boolean } = {},
): string {
  const { message, name, email, url, source, associatedEventId, tags } = params;

  const client = getClient();

  const feedbackEvent: FeedbackEvent = {
    contexts: {
      feedback: dropUndefinedKeys({
        contact_email: email,
        name,
        message,
        url,
        source,
        associated_event_id: associatedEventId,
      }),
    },
    type: 'feedback',
    level: 'info',
    tags,
  };

  if (client) {
    client.emit('beforeSendFeedback', feedbackEvent, hint);
  }

  const eventId = getCurrentScope().captureEvent(feedbackEvent, hint);

  return eventId;
}
