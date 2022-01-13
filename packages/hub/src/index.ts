export {
  getScopeRequestSession,
  setScopeExtra,
  setScopeUser,
  setScopeTags,
  setScopeExtras,
  updateScope,
  applyScopeToEvent,
  setScopeLevel,
  addGlobalEventProcessor,
  cloneScope,
  getScopeSession,
  setScopeSpan,
  setScopeRequestSession,
  addScopeEventProcessor,
  setScopeSession,
  getScopeSpan,
  Scope,
} from './scope';
export { Session, updateSession } from './session';
export {
  SessionFlusher,
  closeSessionFlusher,
  incrementSessionStatusCount,
  SessionFlusherTransporter,
} from './sessionflusher';
export {
  // eslint-disable-next-line deprecation/deprecation
  getActiveDomain,
  getCurrentHub,
  bindHubClient,
  popHubScope,
  endHubSession,
  pushHubScope,
  withHubScope,
  getHubClient,
  getHubScope,
  setHubUser,
  getHubLastEventId,
  captureHubSession,
  startHubSession,
  addHubBreadcrumb,
  captureHubEvent,
  captureHubException,
  getHubIntegration,
  captureHubMessage,
  configureHubScope,
  Hub,
  makeMain,
  Carrier,
  // eslint-disable-next-line deprecation/deprecation
  DomainAsCarrier,
  Layer,
  getHubFromCarrier,
  setHubOnCarrier,
  getMainCarrier,
} from './hub';
