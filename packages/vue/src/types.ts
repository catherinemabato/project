import { BrowserOptions } from '@sentry/browser';

// This is not great, but kinda nacessary to make it woth with Vue@2 and Vue@3 at the same time.
export interface Vue {
  config: {
    errorHandler?: any;
    warnHandler?: any;
    silent?: boolean;
  };
  mixin: (mixins: any) => void;
}

export type ViewModel = {
  _isVue: boolean;
  $root: ViewModel;
  $parent?: ViewModel;
  $props: { [key: string]: any };
  $options: {
    name?: string;
    propsData?: { [key: string]: any };
    _componentTag?: string;
    __file?: string;
  };
};

export interface Options extends TracingOptions, BrowserOptions {
  /** Vue constructor to be used inside the integration (as imported by `import Vue from 'vue'` in Vue2) */
  Vue?: Vue;

  /** Vue app instance to be used inside the integration (as generated by `createApp` in Vue3 ) */
  app?: Vue;

  /**
   * When set to `false`, Sentry will suppress reporting of all props data
   * from your Vue components for privacy concerns.
   */
  attachProps: boolean;

  /**
   * When set to `true`, original Vue's `logError` will be called as well.
   * https://github.com/vuejs/vue/blob/c2b1cfe9ccd08835f2d99f6ce60f67b4de55187f/src/core/util/error.js#L38-L48
   */
  logErrors: boolean;

  /** {@link TracingOptions} */
  tracingOptions?: Partial<TracingOptions>;
}

/** Vue specific configuration for Tracing Integration  */
export interface TracingOptions {
  /**
   * Decides whether to track components by hooking into its lifecycle methods.
   * Can be either set to `boolean` to enable/disable tracking for all of them.
   * Or to an array of specific component names (case-sensitive).
   */
  trackComponents: boolean | string[];

  /** How long to wait until the tracked root activity is marked as finished and sent of to Sentry */
  timeout: number;

  /**
   * List of hooks to keep track of during component lifecycle.
   * Available hooks: 'activate' | 'create' | 'destroy' | 'mount' | 'unmount' | 'update'
   * Based on https://vuejs.org/v2/api/#Options-Lifecycle-Hooks
   */
  hooks: Operation[];
}

export type Hook =
  | 'activated'
  | 'beforeCreate'
  | 'beforeDestroy'
  | 'beforeMount'
  | 'beforeUpdate'
  | 'created'
  | 'deactivated'
  | 'destroyed'
  | 'mounted'
  | 'updated';

export type Operation = 'activate' | 'create' | 'destroy' | 'mount' | 'update';
