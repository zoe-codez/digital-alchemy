import { CronExpression, TBlackHole, TContext } from "@zcc/utilities";
import { Dayjs } from "dayjs";
import { EventEmitter } from "eventemitter3";
import { Logger } from "pino";

import { TCache } from "../extensions/cache.extension";
import { ILogger } from "../extensions/logger.extension";
import {
  AbstractConfig,
  AnyConfig,
  BooleanConfig,
  NumberConfig,
  OptionalModuleConfiguration,
  StringConfig,
} from "./config.helper";
import { TChildLifecycle, TLifecycleBase } from "./lifecycle.helper";

export type TServiceReturn<OBJECT extends object = object> = void | OBJECT;

export type TModuleMappings = Record<string, ServiceFunction>;
export type TResolvedModuleMappings = Record<string, TServiceReturn>;

export type ApplicationConfigurationOptions<
  S extends ServiceMap,
  C extends OptionalModuleConfiguration,
> = {
  name?: string;
  services: S;
  libraries?: ZCCLibraryDefinition<ServiceMap, OptionalModuleConfiguration>[];
  configuration?: C;
  /**
   * Define which services should be initialized first. Any remaining services are done at the end in no set order
   */
  priorityInit?: Extract<keyof S, string>[];
};

export type TConfigurable<
  S extends ServiceMap = ServiceMap,
  C extends OptionalModuleConfiguration = OptionalModuleConfiguration,
> = ZCCLibraryDefinition<S, C> | ZCCApplicationDefinition<S, C>;

export type TGetConfig<PARENT extends TConfigurable = TConfigurable> = <
  K extends keyof ExtractConfig<PARENT>,
>(
  key: K,
) => CastConfigResult<ExtractConfig<PARENT>[K]>;

export type GetApisResult<S extends ServiceMap> = {
  [K in keyof S]: ReturnType<S[K]> extends Promise<infer AsyncResult>
    ? AsyncResult
    : ReturnType<S[K]>;
};

type ExtractConfig<T> =
  T extends ZCCLibraryDefinition<ServiceMap, infer C> ? C : never;

//

type TGetApi = <
  S extends ServiceMap,
  C extends OptionalModuleConfiguration,
  PROJECT extends TConfigurable<S, C>,
>(
  project: PROJECT,
) => GetApis<PROJECT>;

export type Schedule = string | CronExpression;
export type ScheduleItem = {
  start: () => void;
  stop: () => void;
};
export type SchedulerOptions = {
  context: TContext;
  exec: () => TBlackHole;
  /**
   * if provided, specific metrics will be kept and labelled with provided label
   *
   * - execution count
   * - errors
   * - execution duration
   */
  label?: string;
};

/**
 * General code scheduling functions
 *
 * Each method returns a stop function, for temporary scheduling items
 */
export type TScheduler = {
  /**
   * Run code on a cron schedule
   */
  cron: (
    options: SchedulerOptions & {
      schedule: Schedule | Schedule[];
    },
  ) => () => TBlackHole;
  /**
   * Run code on a regular periodic interval
   */
  interval: (
    options: SchedulerOptions & {
      interval: number;
    },
  ) => () => void;
  /**
   * Run code at a different time every {period}
   *
   * Calls `next` at start, and as determined by `reset`.
   *
   * Next returns the date/time for the next execution
   */
  sliding: (
    options: SchedulerOptions & {
      reset: Schedule;
      next: () => Dayjs;
    },
  ) => () => TBlackHole;
};

export type TServiceParams = {
  cache: TCache;
  context: TContext;
  event: EventEmitter;
  getApis: TGetApi;
  lifecycle: TLifecycleBase;
  logger: ILogger;
  scheduler: TScheduler;
};
export type GetApis<T> =
  T extends ZCCLibraryDefinition<infer S, OptionalModuleConfiguration>
    ? GetApisResult<S>
    : T extends ZCCApplicationDefinition<infer S, OptionalModuleConfiguration>
      ? GetApisResult<S>
      : never;

export type CastConfigResult<T extends AnyConfig> = T extends StringConfig
  ? string
  : T extends BooleanConfig
    ? boolean
    : T extends NumberConfig
      ? number
      : // Add other mappings as needed
        unknown;

// export type TModuleInit<S extends ServiceMap> = {
//   /**
//    * Define which services should be initialized first. Any remaining services are done at the end in no set order
//    */
//   priority?: Extract<keyof S, string>[];
// };
export type Loader<PARENT extends TConfigurable> = <
  K extends keyof PARENT["services"],
>(
  serviceName: K,
) => ReturnType<PARENT["services"][K]> extends Promise<infer AsyncResult>
  ? AsyncResult
  : ReturnType<PARENT["services"][K]>;

export type ServiceFunction<R = unknown> = (
  params: TServiceParams,
) => R | Promise<R>;
export type ServiceMap = Record<string, ServiceFunction>;
export type LibraryConfigurationOptions<
  S extends ServiceMap,
  C extends OptionalModuleConfiguration,
> = {
  name: string;
  services: S;
  configuration?: C;
  /**
   * Define which services should be initialized first. Any remaining services are done at the end in no set order
   */
  priorityInit?: Extract<keyof S, string>[];
};

type onErrorCallback = () => void;

export type BootstrapOptions = {
  /**
   * default: true
   */
  handleGlobalErrors?: boolean;
  /**
   * default values to use for configurations, before user values come in
   */
  configuration?: Partial<AbstractConfig>;
  /**
   * use this logger, instead of the baked in one. Maybe you want some custom transports or something? Put your customized thing here
   */
  customLogger?: Logger;
  /**
   * application level flags
   */
  flags?: Record<string, boolean | number | string>;
};

type Wire = {
  /**
   * Internal method used in bootstrapping, do not call elsewhere
   *
   * - initializes lifecycle
   * - attaches event emitters
   */
  wire: () => Promise<TChildLifecycle>;
};

export type ZCCLibraryDefinition<
  S extends ServiceMap,
  C extends OptionalModuleConfiguration,
> = LibraryConfigurationOptions<S, C> &
  Wire & {
    getConfig: <K extends keyof C>(property: K) => CastConfigResult<C[K]>;
    lifecycle: TChildLifecycle;
    onError: (callback: onErrorCallback) => void;
  };

export type ZCCApplicationDefinition<
  S extends ServiceMap,
  C extends OptionalModuleConfiguration,
> = ApplicationConfigurationOptions<S, C> &
  Wire & {
    bootstrap: (options?: BootstrapOptions) => Promise<void>;
    getConfig: <K extends keyof C>(property: K) => CastConfigResult<C[K]>;
    lifecycle: TChildLifecycle;
    onError: (callback: onErrorCallback) => void;
    teardown: () => Promise<void>;
  };
