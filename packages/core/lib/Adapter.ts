import {Event} from './Interfaces';

export namespace Adapter {
  export type Result<T> = {
    adapter: Adapter;
    value?: T;
  };

  export type Options = {
    /**
     * This number determines the order in which the Integrations will be called.
     * Also only the Integration with the lowest rank will send the event in the end.
     * e.g.: If I use Browser Integration with rank 1000
     * and also add React Native Integration with rank 900
     * both integrations call the capture function but only React Native will send the
     * event.
     *
     * default: (should be) 1000
     */
    rank: number;
  };
}

export interface Adapter {
  readonly options: Adapter.Options;
  install(): Promise<Adapter.Result<boolean>>;
  setOptions(options: Adapter.Options): Adapter;
  send(event: Event): Promise<Adapter.Result<Event>>;
  captureException(exception: Error, event: Event): Promise<Event>;
  captureMessage(message: string, event: Event): Promise<Event>;
}
