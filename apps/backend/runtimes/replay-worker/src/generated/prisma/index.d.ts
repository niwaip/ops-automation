
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model StepLog
 * 
 */
export type StepLog = $Result.DefaultSelection<Prisma.$StepLogPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const StepResult: {
  success: 'success',
  failed: 'failed',
  retry: 'retry',
  takeover: 'takeover'
};

export type StepResult = (typeof StepResult)[keyof typeof StepResult]

}

export type StepResult = $Enums.StepResult

export const StepResult: typeof $Enums.StepResult

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more StepLogs
 * const stepLogs = await prisma.stepLog.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more StepLogs
   * const stepLogs = await prisma.stepLog.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.stepLog`: Exposes CRUD operations for the **StepLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more StepLogs
    * const stepLogs = await prisma.stepLog.findMany()
    * ```
    */
  get stepLog(): Prisma.StepLogDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 6.19.3
   * Query Engine version: c2990dca591cba766e3b7ef5d9e8a84796e47ab7
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    StepLog: 'StepLog'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "stepLog"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      StepLog: {
        payload: Prisma.$StepLogPayload<ExtArgs>
        fields: Prisma.StepLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.StepLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.StepLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>
          }
          findFirst: {
            args: Prisma.StepLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.StepLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>
          }
          findMany: {
            args: Prisma.StepLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>[]
          }
          create: {
            args: Prisma.StepLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>
          }
          createMany: {
            args: Prisma.StepLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.StepLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>[]
          }
          delete: {
            args: Prisma.StepLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>
          }
          update: {
            args: Prisma.StepLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>
          }
          deleteMany: {
            args: Prisma.StepLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.StepLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.StepLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>[]
          }
          upsert: {
            args: Prisma.StepLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$StepLogPayload>
          }
          aggregate: {
            args: Prisma.StepLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateStepLog>
          }
          groupBy: {
            args: Prisma.StepLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<StepLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.StepLogCountArgs<ExtArgs>
            result: $Utils.Optional<StepLogCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory | null
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
  }
  export type GlobalOmitConfig = {
    stepLog?: StepLogOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model StepLog
   */

  export type AggregateStepLog = {
    _count: StepLogCountAggregateOutputType | null
    _avg: StepLogAvgAggregateOutputType | null
    _sum: StepLogSumAggregateOutputType | null
    _min: StepLogMinAggregateOutputType | null
    _max: StepLogMaxAggregateOutputType | null
  }

  export type StepLogAvgAggregateOutputType = {
    stepIndex: number | null
    durationMs: number | null
    retryCount: number | null
  }

  export type StepLogSumAggregateOutputType = {
    stepIndex: number | null
    durationMs: number | null
    retryCount: number | null
  }

  export type StepLogMinAggregateOutputType = {
    id: string | null
    sessionId: string | null
    stepId: string | null
    stepIndex: number | null
    action: string | null
    locatorType: string | null
    locatorValue: string | null
    locatorSummary: string | null
    startedAt: Date | null
    completedAt: Date | null
    durationMs: number | null
    result: $Enums.StepResult | null
    errorClass: string | null
    errorMessage: string | null
    retryCount: number | null
    retryReason: string | null
    takeoverTriggered: boolean | null
    takeoverReason: string | null
    screenshotRef: string | null
    traceRef: string | null
  }

  export type StepLogMaxAggregateOutputType = {
    id: string | null
    sessionId: string | null
    stepId: string | null
    stepIndex: number | null
    action: string | null
    locatorType: string | null
    locatorValue: string | null
    locatorSummary: string | null
    startedAt: Date | null
    completedAt: Date | null
    durationMs: number | null
    result: $Enums.StepResult | null
    errorClass: string | null
    errorMessage: string | null
    retryCount: number | null
    retryReason: string | null
    takeoverTriggered: boolean | null
    takeoverReason: string | null
    screenshotRef: string | null
    traceRef: string | null
  }

  export type StepLogCountAggregateOutputType = {
    id: number
    sessionId: number
    stepId: number
    stepIndex: number
    action: number
    locatorType: number
    locatorValue: number
    locatorSummary: number
    startedAt: number
    completedAt: number
    durationMs: number
    result: number
    errorClass: number
    errorMessage: number
    retryCount: number
    retryReason: number
    takeoverTriggered: number
    takeoverReason: number
    screenshotRef: number
    traceRef: number
    context: number
    _all: number
  }


  export type StepLogAvgAggregateInputType = {
    stepIndex?: true
    durationMs?: true
    retryCount?: true
  }

  export type StepLogSumAggregateInputType = {
    stepIndex?: true
    durationMs?: true
    retryCount?: true
  }

  export type StepLogMinAggregateInputType = {
    id?: true
    sessionId?: true
    stepId?: true
    stepIndex?: true
    action?: true
    locatorType?: true
    locatorValue?: true
    locatorSummary?: true
    startedAt?: true
    completedAt?: true
    durationMs?: true
    result?: true
    errorClass?: true
    errorMessage?: true
    retryCount?: true
    retryReason?: true
    takeoverTriggered?: true
    takeoverReason?: true
    screenshotRef?: true
    traceRef?: true
  }

  export type StepLogMaxAggregateInputType = {
    id?: true
    sessionId?: true
    stepId?: true
    stepIndex?: true
    action?: true
    locatorType?: true
    locatorValue?: true
    locatorSummary?: true
    startedAt?: true
    completedAt?: true
    durationMs?: true
    result?: true
    errorClass?: true
    errorMessage?: true
    retryCount?: true
    retryReason?: true
    takeoverTriggered?: true
    takeoverReason?: true
    screenshotRef?: true
    traceRef?: true
  }

  export type StepLogCountAggregateInputType = {
    id?: true
    sessionId?: true
    stepId?: true
    stepIndex?: true
    action?: true
    locatorType?: true
    locatorValue?: true
    locatorSummary?: true
    startedAt?: true
    completedAt?: true
    durationMs?: true
    result?: true
    errorClass?: true
    errorMessage?: true
    retryCount?: true
    retryReason?: true
    takeoverTriggered?: true
    takeoverReason?: true
    screenshotRef?: true
    traceRef?: true
    context?: true
    _all?: true
  }

  export type StepLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which StepLog to aggregate.
     */
    where?: StepLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of StepLogs to fetch.
     */
    orderBy?: StepLogOrderByWithRelationInput | StepLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: StepLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` StepLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` StepLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned StepLogs
    **/
    _count?: true | StepLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: StepLogAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: StepLogSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: StepLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: StepLogMaxAggregateInputType
  }

  export type GetStepLogAggregateType<T extends StepLogAggregateArgs> = {
        [P in keyof T & keyof AggregateStepLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateStepLog[P]>
      : GetScalarType<T[P], AggregateStepLog[P]>
  }




  export type StepLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: StepLogWhereInput
    orderBy?: StepLogOrderByWithAggregationInput | StepLogOrderByWithAggregationInput[]
    by: StepLogScalarFieldEnum[] | StepLogScalarFieldEnum
    having?: StepLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: StepLogCountAggregateInputType | true
    _avg?: StepLogAvgAggregateInputType
    _sum?: StepLogSumAggregateInputType
    _min?: StepLogMinAggregateInputType
    _max?: StepLogMaxAggregateInputType
  }

  export type StepLogGroupByOutputType = {
    id: string
    sessionId: string
    stepId: string
    stepIndex: number
    action: string
    locatorType: string | null
    locatorValue: string | null
    locatorSummary: string | null
    startedAt: Date
    completedAt: Date | null
    durationMs: number | null
    result: $Enums.StepResult
    errorClass: string | null
    errorMessage: string | null
    retryCount: number
    retryReason: string | null
    takeoverTriggered: boolean
    takeoverReason: string | null
    screenshotRef: string | null
    traceRef: string | null
    context: JsonValue
    _count: StepLogCountAggregateOutputType | null
    _avg: StepLogAvgAggregateOutputType | null
    _sum: StepLogSumAggregateOutputType | null
    _min: StepLogMinAggregateOutputType | null
    _max: StepLogMaxAggregateOutputType | null
  }

  type GetStepLogGroupByPayload<T extends StepLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<StepLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof StepLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], StepLogGroupByOutputType[P]>
            : GetScalarType<T[P], StepLogGroupByOutputType[P]>
        }
      >
    >


  export type StepLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    stepId?: boolean
    stepIndex?: boolean
    action?: boolean
    locatorType?: boolean
    locatorValue?: boolean
    locatorSummary?: boolean
    startedAt?: boolean
    completedAt?: boolean
    durationMs?: boolean
    result?: boolean
    errorClass?: boolean
    errorMessage?: boolean
    retryCount?: boolean
    retryReason?: boolean
    takeoverTriggered?: boolean
    takeoverReason?: boolean
    screenshotRef?: boolean
    traceRef?: boolean
    context?: boolean
  }, ExtArgs["result"]["stepLog"]>

  export type StepLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    stepId?: boolean
    stepIndex?: boolean
    action?: boolean
    locatorType?: boolean
    locatorValue?: boolean
    locatorSummary?: boolean
    startedAt?: boolean
    completedAt?: boolean
    durationMs?: boolean
    result?: boolean
    errorClass?: boolean
    errorMessage?: boolean
    retryCount?: boolean
    retryReason?: boolean
    takeoverTriggered?: boolean
    takeoverReason?: boolean
    screenshotRef?: boolean
    traceRef?: boolean
    context?: boolean
  }, ExtArgs["result"]["stepLog"]>

  export type StepLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    sessionId?: boolean
    stepId?: boolean
    stepIndex?: boolean
    action?: boolean
    locatorType?: boolean
    locatorValue?: boolean
    locatorSummary?: boolean
    startedAt?: boolean
    completedAt?: boolean
    durationMs?: boolean
    result?: boolean
    errorClass?: boolean
    errorMessage?: boolean
    retryCount?: boolean
    retryReason?: boolean
    takeoverTriggered?: boolean
    takeoverReason?: boolean
    screenshotRef?: boolean
    traceRef?: boolean
    context?: boolean
  }, ExtArgs["result"]["stepLog"]>

  export type StepLogSelectScalar = {
    id?: boolean
    sessionId?: boolean
    stepId?: boolean
    stepIndex?: boolean
    action?: boolean
    locatorType?: boolean
    locatorValue?: boolean
    locatorSummary?: boolean
    startedAt?: boolean
    completedAt?: boolean
    durationMs?: boolean
    result?: boolean
    errorClass?: boolean
    errorMessage?: boolean
    retryCount?: boolean
    retryReason?: boolean
    takeoverTriggered?: boolean
    takeoverReason?: boolean
    screenshotRef?: boolean
    traceRef?: boolean
    context?: boolean
  }

  export type StepLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "sessionId" | "stepId" | "stepIndex" | "action" | "locatorType" | "locatorValue" | "locatorSummary" | "startedAt" | "completedAt" | "durationMs" | "result" | "errorClass" | "errorMessage" | "retryCount" | "retryReason" | "takeoverTriggered" | "takeoverReason" | "screenshotRef" | "traceRef" | "context", ExtArgs["result"]["stepLog"]>

  export type $StepLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "StepLog"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      sessionId: string
      stepId: string
      stepIndex: number
      action: string
      locatorType: string | null
      locatorValue: string | null
      locatorSummary: string | null
      startedAt: Date
      completedAt: Date | null
      durationMs: number | null
      result: $Enums.StepResult
      errorClass: string | null
      errorMessage: string | null
      retryCount: number
      retryReason: string | null
      takeoverTriggered: boolean
      takeoverReason: string | null
      screenshotRef: string | null
      traceRef: string | null
      context: Prisma.JsonValue
    }, ExtArgs["result"]["stepLog"]>
    composites: {}
  }

  type StepLogGetPayload<S extends boolean | null | undefined | StepLogDefaultArgs> = $Result.GetResult<Prisma.$StepLogPayload, S>

  type StepLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<StepLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: StepLogCountAggregateInputType | true
    }

  export interface StepLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['StepLog'], meta: { name: 'StepLog' } }
    /**
     * Find zero or one StepLog that matches the filter.
     * @param {StepLogFindUniqueArgs} args - Arguments to find a StepLog
     * @example
     * // Get one StepLog
     * const stepLog = await prisma.stepLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends StepLogFindUniqueArgs>(args: SelectSubset<T, StepLogFindUniqueArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one StepLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {StepLogFindUniqueOrThrowArgs} args - Arguments to find a StepLog
     * @example
     * // Get one StepLog
     * const stepLog = await prisma.stepLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends StepLogFindUniqueOrThrowArgs>(args: SelectSubset<T, StepLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first StepLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogFindFirstArgs} args - Arguments to find a StepLog
     * @example
     * // Get one StepLog
     * const stepLog = await prisma.stepLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends StepLogFindFirstArgs>(args?: SelectSubset<T, StepLogFindFirstArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first StepLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogFindFirstOrThrowArgs} args - Arguments to find a StepLog
     * @example
     * // Get one StepLog
     * const stepLog = await prisma.stepLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends StepLogFindFirstOrThrowArgs>(args?: SelectSubset<T, StepLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more StepLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all StepLogs
     * const stepLogs = await prisma.stepLog.findMany()
     * 
     * // Get first 10 StepLogs
     * const stepLogs = await prisma.stepLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const stepLogWithIdOnly = await prisma.stepLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends StepLogFindManyArgs>(args?: SelectSubset<T, StepLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a StepLog.
     * @param {StepLogCreateArgs} args - Arguments to create a StepLog.
     * @example
     * // Create one StepLog
     * const StepLog = await prisma.stepLog.create({
     *   data: {
     *     // ... data to create a StepLog
     *   }
     * })
     * 
     */
    create<T extends StepLogCreateArgs>(args: SelectSubset<T, StepLogCreateArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many StepLogs.
     * @param {StepLogCreateManyArgs} args - Arguments to create many StepLogs.
     * @example
     * // Create many StepLogs
     * const stepLog = await prisma.stepLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends StepLogCreateManyArgs>(args?: SelectSubset<T, StepLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many StepLogs and returns the data saved in the database.
     * @param {StepLogCreateManyAndReturnArgs} args - Arguments to create many StepLogs.
     * @example
     * // Create many StepLogs
     * const stepLog = await prisma.stepLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many StepLogs and only return the `id`
     * const stepLogWithIdOnly = await prisma.stepLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends StepLogCreateManyAndReturnArgs>(args?: SelectSubset<T, StepLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a StepLog.
     * @param {StepLogDeleteArgs} args - Arguments to delete one StepLog.
     * @example
     * // Delete one StepLog
     * const StepLog = await prisma.stepLog.delete({
     *   where: {
     *     // ... filter to delete one StepLog
     *   }
     * })
     * 
     */
    delete<T extends StepLogDeleteArgs>(args: SelectSubset<T, StepLogDeleteArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one StepLog.
     * @param {StepLogUpdateArgs} args - Arguments to update one StepLog.
     * @example
     * // Update one StepLog
     * const stepLog = await prisma.stepLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends StepLogUpdateArgs>(args: SelectSubset<T, StepLogUpdateArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more StepLogs.
     * @param {StepLogDeleteManyArgs} args - Arguments to filter StepLogs to delete.
     * @example
     * // Delete a few StepLogs
     * const { count } = await prisma.stepLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends StepLogDeleteManyArgs>(args?: SelectSubset<T, StepLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more StepLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many StepLogs
     * const stepLog = await prisma.stepLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends StepLogUpdateManyArgs>(args: SelectSubset<T, StepLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more StepLogs and returns the data updated in the database.
     * @param {StepLogUpdateManyAndReturnArgs} args - Arguments to update many StepLogs.
     * @example
     * // Update many StepLogs
     * const stepLog = await prisma.stepLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more StepLogs and only return the `id`
     * const stepLogWithIdOnly = await prisma.stepLog.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends StepLogUpdateManyAndReturnArgs>(args: SelectSubset<T, StepLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one StepLog.
     * @param {StepLogUpsertArgs} args - Arguments to update or create a StepLog.
     * @example
     * // Update or create a StepLog
     * const stepLog = await prisma.stepLog.upsert({
     *   create: {
     *     // ... data to create a StepLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the StepLog we want to update
     *   }
     * })
     */
    upsert<T extends StepLogUpsertArgs>(args: SelectSubset<T, StepLogUpsertArgs<ExtArgs>>): Prisma__StepLogClient<$Result.GetResult<Prisma.$StepLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of StepLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogCountArgs} args - Arguments to filter StepLogs to count.
     * @example
     * // Count the number of StepLogs
     * const count = await prisma.stepLog.count({
     *   where: {
     *     // ... the filter for the StepLogs we want to count
     *   }
     * })
    **/
    count<T extends StepLogCountArgs>(
      args?: Subset<T, StepLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], StepLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a StepLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends StepLogAggregateArgs>(args: Subset<T, StepLogAggregateArgs>): Prisma.PrismaPromise<GetStepLogAggregateType<T>>

    /**
     * Group by StepLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StepLogGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends StepLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: StepLogGroupByArgs['orderBy'] }
        : { orderBy?: StepLogGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, StepLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetStepLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the StepLog model
   */
  readonly fields: StepLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for StepLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__StepLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the StepLog model
   */
  interface StepLogFieldRefs {
    readonly id: FieldRef<"StepLog", 'String'>
    readonly sessionId: FieldRef<"StepLog", 'String'>
    readonly stepId: FieldRef<"StepLog", 'String'>
    readonly stepIndex: FieldRef<"StepLog", 'Int'>
    readonly action: FieldRef<"StepLog", 'String'>
    readonly locatorType: FieldRef<"StepLog", 'String'>
    readonly locatorValue: FieldRef<"StepLog", 'String'>
    readonly locatorSummary: FieldRef<"StepLog", 'String'>
    readonly startedAt: FieldRef<"StepLog", 'DateTime'>
    readonly completedAt: FieldRef<"StepLog", 'DateTime'>
    readonly durationMs: FieldRef<"StepLog", 'Int'>
    readonly result: FieldRef<"StepLog", 'StepResult'>
    readonly errorClass: FieldRef<"StepLog", 'String'>
    readonly errorMessage: FieldRef<"StepLog", 'String'>
    readonly retryCount: FieldRef<"StepLog", 'Int'>
    readonly retryReason: FieldRef<"StepLog", 'String'>
    readonly takeoverTriggered: FieldRef<"StepLog", 'Boolean'>
    readonly takeoverReason: FieldRef<"StepLog", 'String'>
    readonly screenshotRef: FieldRef<"StepLog", 'String'>
    readonly traceRef: FieldRef<"StepLog", 'String'>
    readonly context: FieldRef<"StepLog", 'Json'>
  }
    

  // Custom InputTypes
  /**
   * StepLog findUnique
   */
  export type StepLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * Filter, which StepLog to fetch.
     */
    where: StepLogWhereUniqueInput
  }

  /**
   * StepLog findUniqueOrThrow
   */
  export type StepLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * Filter, which StepLog to fetch.
     */
    where: StepLogWhereUniqueInput
  }

  /**
   * StepLog findFirst
   */
  export type StepLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * Filter, which StepLog to fetch.
     */
    where?: StepLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of StepLogs to fetch.
     */
    orderBy?: StepLogOrderByWithRelationInput | StepLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for StepLogs.
     */
    cursor?: StepLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` StepLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` StepLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of StepLogs.
     */
    distinct?: StepLogScalarFieldEnum | StepLogScalarFieldEnum[]
  }

  /**
   * StepLog findFirstOrThrow
   */
  export type StepLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * Filter, which StepLog to fetch.
     */
    where?: StepLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of StepLogs to fetch.
     */
    orderBy?: StepLogOrderByWithRelationInput | StepLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for StepLogs.
     */
    cursor?: StepLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` StepLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` StepLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of StepLogs.
     */
    distinct?: StepLogScalarFieldEnum | StepLogScalarFieldEnum[]
  }

  /**
   * StepLog findMany
   */
  export type StepLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * Filter, which StepLogs to fetch.
     */
    where?: StepLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of StepLogs to fetch.
     */
    orderBy?: StepLogOrderByWithRelationInput | StepLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing StepLogs.
     */
    cursor?: StepLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` StepLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` StepLogs.
     */
    skip?: number
    distinct?: StepLogScalarFieldEnum | StepLogScalarFieldEnum[]
  }

  /**
   * StepLog create
   */
  export type StepLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * The data needed to create a StepLog.
     */
    data: XOR<StepLogCreateInput, StepLogUncheckedCreateInput>
  }

  /**
   * StepLog createMany
   */
  export type StepLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many StepLogs.
     */
    data: StepLogCreateManyInput | StepLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * StepLog createManyAndReturn
   */
  export type StepLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * The data used to create many StepLogs.
     */
    data: StepLogCreateManyInput | StepLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * StepLog update
   */
  export type StepLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * The data needed to update a StepLog.
     */
    data: XOR<StepLogUpdateInput, StepLogUncheckedUpdateInput>
    /**
     * Choose, which StepLog to update.
     */
    where: StepLogWhereUniqueInput
  }

  /**
   * StepLog updateMany
   */
  export type StepLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update StepLogs.
     */
    data: XOR<StepLogUpdateManyMutationInput, StepLogUncheckedUpdateManyInput>
    /**
     * Filter which StepLogs to update
     */
    where?: StepLogWhereInput
    /**
     * Limit how many StepLogs to update.
     */
    limit?: number
  }

  /**
   * StepLog updateManyAndReturn
   */
  export type StepLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * The data used to update StepLogs.
     */
    data: XOR<StepLogUpdateManyMutationInput, StepLogUncheckedUpdateManyInput>
    /**
     * Filter which StepLogs to update
     */
    where?: StepLogWhereInput
    /**
     * Limit how many StepLogs to update.
     */
    limit?: number
  }

  /**
   * StepLog upsert
   */
  export type StepLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * The filter to search for the StepLog to update in case it exists.
     */
    where: StepLogWhereUniqueInput
    /**
     * In case the StepLog found by the `where` argument doesn't exist, create a new StepLog with this data.
     */
    create: XOR<StepLogCreateInput, StepLogUncheckedCreateInput>
    /**
     * In case the StepLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<StepLogUpdateInput, StepLogUncheckedUpdateInput>
  }

  /**
   * StepLog delete
   */
  export type StepLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
    /**
     * Filter which StepLog to delete.
     */
    where: StepLogWhereUniqueInput
  }

  /**
   * StepLog deleteMany
   */
  export type StepLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which StepLogs to delete
     */
    where?: StepLogWhereInput
    /**
     * Limit how many StepLogs to delete.
     */
    limit?: number
  }

  /**
   * StepLog without action
   */
  export type StepLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the StepLog
     */
    select?: StepLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the StepLog
     */
    omit?: StepLogOmit<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const StepLogScalarFieldEnum: {
    id: 'id',
    sessionId: 'sessionId',
    stepId: 'stepId',
    stepIndex: 'stepIndex',
    action: 'action',
    locatorType: 'locatorType',
    locatorValue: 'locatorValue',
    locatorSummary: 'locatorSummary',
    startedAt: 'startedAt',
    completedAt: 'completedAt',
    durationMs: 'durationMs',
    result: 'result',
    errorClass: 'errorClass',
    errorMessage: 'errorMessage',
    retryCount: 'retryCount',
    retryReason: 'retryReason',
    takeoverTriggered: 'takeoverTriggered',
    takeoverReason: 'takeoverReason',
    screenshotRef: 'screenshotRef',
    traceRef: 'traceRef',
    context: 'context'
  };

  export type StepLogScalarFieldEnum = (typeof StepLogScalarFieldEnum)[keyof typeof StepLogScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'StepResult'
   */
  export type EnumStepResultFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'StepResult'>
    


  /**
   * Reference to a field of type 'StepResult[]'
   */
  export type ListEnumStepResultFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'StepResult[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type StepLogWhereInput = {
    AND?: StepLogWhereInput | StepLogWhereInput[]
    OR?: StepLogWhereInput[]
    NOT?: StepLogWhereInput | StepLogWhereInput[]
    id?: UuidFilter<"StepLog"> | string
    sessionId?: UuidFilter<"StepLog"> | string
    stepId?: StringFilter<"StepLog"> | string
    stepIndex?: IntFilter<"StepLog"> | number
    action?: StringFilter<"StepLog"> | string
    locatorType?: StringNullableFilter<"StepLog"> | string | null
    locatorValue?: StringNullableFilter<"StepLog"> | string | null
    locatorSummary?: StringNullableFilter<"StepLog"> | string | null
    startedAt?: DateTimeFilter<"StepLog"> | Date | string
    completedAt?: DateTimeNullableFilter<"StepLog"> | Date | string | null
    durationMs?: IntNullableFilter<"StepLog"> | number | null
    result?: EnumStepResultFilter<"StepLog"> | $Enums.StepResult
    errorClass?: StringNullableFilter<"StepLog"> | string | null
    errorMessage?: StringNullableFilter<"StepLog"> | string | null
    retryCount?: IntFilter<"StepLog"> | number
    retryReason?: StringNullableFilter<"StepLog"> | string | null
    takeoverTriggered?: BoolFilter<"StepLog"> | boolean
    takeoverReason?: StringNullableFilter<"StepLog"> | string | null
    screenshotRef?: StringNullableFilter<"StepLog"> | string | null
    traceRef?: StringNullableFilter<"StepLog"> | string | null
    context?: JsonFilter<"StepLog">
  }

  export type StepLogOrderByWithRelationInput = {
    id?: SortOrder
    sessionId?: SortOrder
    stepId?: SortOrder
    stepIndex?: SortOrder
    action?: SortOrder
    locatorType?: SortOrderInput | SortOrder
    locatorValue?: SortOrderInput | SortOrder
    locatorSummary?: SortOrderInput | SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrderInput | SortOrder
    durationMs?: SortOrderInput | SortOrder
    result?: SortOrder
    errorClass?: SortOrderInput | SortOrder
    errorMessage?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    retryReason?: SortOrderInput | SortOrder
    takeoverTriggered?: SortOrder
    takeoverReason?: SortOrderInput | SortOrder
    screenshotRef?: SortOrderInput | SortOrder
    traceRef?: SortOrderInput | SortOrder
    context?: SortOrder
  }

  export type StepLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: StepLogWhereInput | StepLogWhereInput[]
    OR?: StepLogWhereInput[]
    NOT?: StepLogWhereInput | StepLogWhereInput[]
    sessionId?: UuidFilter<"StepLog"> | string
    stepId?: StringFilter<"StepLog"> | string
    stepIndex?: IntFilter<"StepLog"> | number
    action?: StringFilter<"StepLog"> | string
    locatorType?: StringNullableFilter<"StepLog"> | string | null
    locatorValue?: StringNullableFilter<"StepLog"> | string | null
    locatorSummary?: StringNullableFilter<"StepLog"> | string | null
    startedAt?: DateTimeFilter<"StepLog"> | Date | string
    completedAt?: DateTimeNullableFilter<"StepLog"> | Date | string | null
    durationMs?: IntNullableFilter<"StepLog"> | number | null
    result?: EnumStepResultFilter<"StepLog"> | $Enums.StepResult
    errorClass?: StringNullableFilter<"StepLog"> | string | null
    errorMessage?: StringNullableFilter<"StepLog"> | string | null
    retryCount?: IntFilter<"StepLog"> | number
    retryReason?: StringNullableFilter<"StepLog"> | string | null
    takeoverTriggered?: BoolFilter<"StepLog"> | boolean
    takeoverReason?: StringNullableFilter<"StepLog"> | string | null
    screenshotRef?: StringNullableFilter<"StepLog"> | string | null
    traceRef?: StringNullableFilter<"StepLog"> | string | null
    context?: JsonFilter<"StepLog">
  }, "id">

  export type StepLogOrderByWithAggregationInput = {
    id?: SortOrder
    sessionId?: SortOrder
    stepId?: SortOrder
    stepIndex?: SortOrder
    action?: SortOrder
    locatorType?: SortOrderInput | SortOrder
    locatorValue?: SortOrderInput | SortOrder
    locatorSummary?: SortOrderInput | SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrderInput | SortOrder
    durationMs?: SortOrderInput | SortOrder
    result?: SortOrder
    errorClass?: SortOrderInput | SortOrder
    errorMessage?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    retryReason?: SortOrderInput | SortOrder
    takeoverTriggered?: SortOrder
    takeoverReason?: SortOrderInput | SortOrder
    screenshotRef?: SortOrderInput | SortOrder
    traceRef?: SortOrderInput | SortOrder
    context?: SortOrder
    _count?: StepLogCountOrderByAggregateInput
    _avg?: StepLogAvgOrderByAggregateInput
    _max?: StepLogMaxOrderByAggregateInput
    _min?: StepLogMinOrderByAggregateInput
    _sum?: StepLogSumOrderByAggregateInput
  }

  export type StepLogScalarWhereWithAggregatesInput = {
    AND?: StepLogScalarWhereWithAggregatesInput | StepLogScalarWhereWithAggregatesInput[]
    OR?: StepLogScalarWhereWithAggregatesInput[]
    NOT?: StepLogScalarWhereWithAggregatesInput | StepLogScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"StepLog"> | string
    sessionId?: UuidWithAggregatesFilter<"StepLog"> | string
    stepId?: StringWithAggregatesFilter<"StepLog"> | string
    stepIndex?: IntWithAggregatesFilter<"StepLog"> | number
    action?: StringWithAggregatesFilter<"StepLog"> | string
    locatorType?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    locatorValue?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    locatorSummary?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    startedAt?: DateTimeWithAggregatesFilter<"StepLog"> | Date | string
    completedAt?: DateTimeNullableWithAggregatesFilter<"StepLog"> | Date | string | null
    durationMs?: IntNullableWithAggregatesFilter<"StepLog"> | number | null
    result?: EnumStepResultWithAggregatesFilter<"StepLog"> | $Enums.StepResult
    errorClass?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    errorMessage?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    retryCount?: IntWithAggregatesFilter<"StepLog"> | number
    retryReason?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    takeoverTriggered?: BoolWithAggregatesFilter<"StepLog"> | boolean
    takeoverReason?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    screenshotRef?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    traceRef?: StringNullableWithAggregatesFilter<"StepLog"> | string | null
    context?: JsonWithAggregatesFilter<"StepLog">
  }

  export type StepLogCreateInput = {
    id?: string
    sessionId: string
    stepId: string
    stepIndex: number
    action: string
    locatorType?: string | null
    locatorValue?: string | null
    locatorSummary?: string | null
    startedAt?: Date | string
    completedAt?: Date | string | null
    durationMs?: number | null
    result: $Enums.StepResult
    errorClass?: string | null
    errorMessage?: string | null
    retryCount?: number
    retryReason?: string | null
    takeoverTriggered?: boolean
    takeoverReason?: string | null
    screenshotRef?: string | null
    traceRef?: string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type StepLogUncheckedCreateInput = {
    id?: string
    sessionId: string
    stepId: string
    stepIndex: number
    action: string
    locatorType?: string | null
    locatorValue?: string | null
    locatorSummary?: string | null
    startedAt?: Date | string
    completedAt?: Date | string | null
    durationMs?: number | null
    result: $Enums.StepResult
    errorClass?: string | null
    errorMessage?: string | null
    retryCount?: number
    retryReason?: string | null
    takeoverTriggered?: boolean
    takeoverReason?: string | null
    screenshotRef?: string | null
    traceRef?: string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type StepLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    stepId?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    action?: StringFieldUpdateOperationsInput | string
    locatorType?: NullableStringFieldUpdateOperationsInput | string | null
    locatorValue?: NullableStringFieldUpdateOperationsInput | string | null
    locatorSummary?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null
    result?: EnumStepResultFieldUpdateOperationsInput | $Enums.StepResult
    errorClass?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    retryReason?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    screenshotRef?: NullableStringFieldUpdateOperationsInput | string | null
    traceRef?: NullableStringFieldUpdateOperationsInput | string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type StepLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    stepId?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    action?: StringFieldUpdateOperationsInput | string
    locatorType?: NullableStringFieldUpdateOperationsInput | string | null
    locatorValue?: NullableStringFieldUpdateOperationsInput | string | null
    locatorSummary?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null
    result?: EnumStepResultFieldUpdateOperationsInput | $Enums.StepResult
    errorClass?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    retryReason?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    screenshotRef?: NullableStringFieldUpdateOperationsInput | string | null
    traceRef?: NullableStringFieldUpdateOperationsInput | string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type StepLogCreateManyInput = {
    id?: string
    sessionId: string
    stepId: string
    stepIndex: number
    action: string
    locatorType?: string | null
    locatorValue?: string | null
    locatorSummary?: string | null
    startedAt?: Date | string
    completedAt?: Date | string | null
    durationMs?: number | null
    result: $Enums.StepResult
    errorClass?: string | null
    errorMessage?: string | null
    retryCount?: number
    retryReason?: string | null
    takeoverTriggered?: boolean
    takeoverReason?: string | null
    screenshotRef?: string | null
    traceRef?: string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type StepLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    stepId?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    action?: StringFieldUpdateOperationsInput | string
    locatorType?: NullableStringFieldUpdateOperationsInput | string | null
    locatorValue?: NullableStringFieldUpdateOperationsInput | string | null
    locatorSummary?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null
    result?: EnumStepResultFieldUpdateOperationsInput | $Enums.StepResult
    errorClass?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    retryReason?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    screenshotRef?: NullableStringFieldUpdateOperationsInput | string | null
    traceRef?: NullableStringFieldUpdateOperationsInput | string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type StepLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    sessionId?: StringFieldUpdateOperationsInput | string
    stepId?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    action?: StringFieldUpdateOperationsInput | string
    locatorType?: NullableStringFieldUpdateOperationsInput | string | null
    locatorValue?: NullableStringFieldUpdateOperationsInput | string | null
    locatorSummary?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null
    result?: EnumStepResultFieldUpdateOperationsInput | $Enums.StepResult
    errorClass?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    retryReason?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    screenshotRef?: NullableStringFieldUpdateOperationsInput | string | null
    traceRef?: NullableStringFieldUpdateOperationsInput | string | null
    context?: JsonNullValueInput | InputJsonValue
  }

  export type UuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type EnumStepResultFilter<$PrismaModel = never> = {
    equals?: $Enums.StepResult | EnumStepResultFieldRefInput<$PrismaModel>
    in?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    notIn?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    not?: NestedEnumStepResultFilter<$PrismaModel> | $Enums.StepResult
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type StepLogCountOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    stepId?: SortOrder
    stepIndex?: SortOrder
    action?: SortOrder
    locatorType?: SortOrder
    locatorValue?: SortOrder
    locatorSummary?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    durationMs?: SortOrder
    result?: SortOrder
    errorClass?: SortOrder
    errorMessage?: SortOrder
    retryCount?: SortOrder
    retryReason?: SortOrder
    takeoverTriggered?: SortOrder
    takeoverReason?: SortOrder
    screenshotRef?: SortOrder
    traceRef?: SortOrder
    context?: SortOrder
  }

  export type StepLogAvgOrderByAggregateInput = {
    stepIndex?: SortOrder
    durationMs?: SortOrder
    retryCount?: SortOrder
  }

  export type StepLogMaxOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    stepId?: SortOrder
    stepIndex?: SortOrder
    action?: SortOrder
    locatorType?: SortOrder
    locatorValue?: SortOrder
    locatorSummary?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    durationMs?: SortOrder
    result?: SortOrder
    errorClass?: SortOrder
    errorMessage?: SortOrder
    retryCount?: SortOrder
    retryReason?: SortOrder
    takeoverTriggered?: SortOrder
    takeoverReason?: SortOrder
    screenshotRef?: SortOrder
    traceRef?: SortOrder
  }

  export type StepLogMinOrderByAggregateInput = {
    id?: SortOrder
    sessionId?: SortOrder
    stepId?: SortOrder
    stepIndex?: SortOrder
    action?: SortOrder
    locatorType?: SortOrder
    locatorValue?: SortOrder
    locatorSummary?: SortOrder
    startedAt?: SortOrder
    completedAt?: SortOrder
    durationMs?: SortOrder
    result?: SortOrder
    errorClass?: SortOrder
    errorMessage?: SortOrder
    retryCount?: SortOrder
    retryReason?: SortOrder
    takeoverTriggered?: SortOrder
    takeoverReason?: SortOrder
    screenshotRef?: SortOrder
    traceRef?: SortOrder
  }

  export type StepLogSumOrderByAggregateInput = {
    stepIndex?: SortOrder
    durationMs?: SortOrder
    retryCount?: SortOrder
  }

  export type UuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type EnumStepResultWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.StepResult | EnumStepResultFieldRefInput<$PrismaModel>
    in?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    notIn?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    not?: NestedEnumStepResultWithAggregatesFilter<$PrismaModel> | $Enums.StepResult
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumStepResultFilter<$PrismaModel>
    _max?: NestedEnumStepResultFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type EnumStepResultFieldUpdateOperationsInput = {
    set?: $Enums.StepResult
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NestedUuidFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidFilter<$PrismaModel> | string
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedEnumStepResultFilter<$PrismaModel = never> = {
    equals?: $Enums.StepResult | EnumStepResultFieldRefInput<$PrismaModel>
    in?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    notIn?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    not?: NestedEnumStepResultFilter<$PrismaModel> | $Enums.StepResult
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedUuidWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type NestedEnumStepResultWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.StepResult | EnumStepResultFieldRefInput<$PrismaModel>
    in?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    notIn?: $Enums.StepResult[] | ListEnumStepResultFieldRefInput<$PrismaModel>
    not?: NestedEnumStepResultWithAggregatesFilter<$PrismaModel> | $Enums.StepResult
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumStepResultFilter<$PrismaModel>
    _max?: NestedEnumStepResultFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}