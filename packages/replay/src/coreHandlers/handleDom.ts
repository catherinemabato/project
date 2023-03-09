import type { INode } from '@sentry-internal/rrweb-snapshot';
import { NodeType } from '@sentry-internal/rrweb-snapshot';
import type { Breadcrumb } from '@sentry/types';
import { htmlTreeAsString } from '@sentry/utils';

import type { ReplayContainer } from '../types';
import { createBreadcrumb } from '../util/createBreadcrumb';
import { addBreadcrumbEvent } from './addBreadcrumbEvent';

interface DomHandlerData {
  name: string;
  event: Node | { target: Node };
}

export const handleDomListener: (replay: ReplayContainer) => (handlerData: DomHandlerData) => void =
  (replay: ReplayContainer) =>
  (handlerData: DomHandlerData): void => {
    if (!replay.isEnabled()) {
      return;
    }

    const result = handleDom(handlerData);

    if (!result) {
      return;
    }

    addBreadcrumbEvent(replay, result);
  };

/**
 * An event handler to react to DOM events.
 */
function handleDom(handlerData: DomHandlerData): Breadcrumb | null {
  // Taken from https://github.com/getsentry/sentry-javascript/blob/master/packages/browser/src/integrations/breadcrumbs.ts#L112
  let target;
  let targetNode: Node | INode | undefined;

  // Accessing event.target can throw (see getsentry/raven-js#838, #768)
  try {
    targetNode = getTargetNode(handlerData);
    target = htmlTreeAsString(targetNode);
  } catch (e) {
    target = '<unknown>';
  }

  if (target.length === 0) {
    return null;
  }

  // `__sn` property is the serialized node created by rrweb
  const serializedNode =
    targetNode && '__sn' in targetNode && targetNode.__sn.type === NodeType.Element ? targetNode.__sn : null;

  return createBreadcrumb({
    category: `ui.${handlerData.name}`,
    message: target,
    data: {
      ...(serializedNode
        ? {
            nodeId: serializedNode.id,
            node: {
              id: serializedNode.id,
              tagName: serializedNode.tagName,
              textContent: targetNode
                ? Array.from(targetNode.childNodes)
                    .filter((node: Node | INode) => '__sn' in node && node.__sn.type === NodeType.Text)
                    .map(node => node.textContent)
                    .join('')
                : '',
              // TODO: strict list of attributes
              attributes: getAttributesToIndex(serializedNode.attributes),
            },
          }
        : {}),
    },
  });
}

function getTargetNode(handlerData: DomHandlerData): Node {
  if (isEventWithTarget(handlerData.event)) {
    return handlerData.event.target;
  }

  return handlerData.event;
}

function isEventWithTarget(event: unknown): event is { target: Node } {
  return !!(event as { target?: Node }).target;
}

// Attributes we are interested in:
const ATTRIBUTES_TO_INDEX =  ['id', 'class', 'aria-label', 'role', 'name'];

function getAttributesToIndex(attributes: Record<string, unknown>) {
  const obj = {};
  for (const key of ATTRIBUTES_TO_INDEX) {
     if (attributes.hasOwnProperty(key)) {
      obj[key] = attributes[key];
    }
  }

  return obj;
}
