
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
 * Model Execution
 * 
 */
export type Execution = $Result.DefaultSelection<Prisma.$ExecutionPayload>
/**
 * Model ExecutionStep
 * 
 */
export type ExecutionStep = $Result.DefaultSelection<Prisma.$ExecutionStepPayload>
/**
 * Model RuntimeSession
 * 
 */
export type RuntimeSession = $Result.DefaultSelection<Prisma.$RuntimeSessionPayload>
/**
 * Model ExecutionEvent
 * 
 */
export type ExecutionEvent = $Result.DefaultSelection<Prisma.$ExecutionEventPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Executions
 * const executions = await prisma.execution.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
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
   * // Fetch zero or more Executions
   * const executions = await prisma.execution.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

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


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.execution`: Exposes CRUD operations for the **Execution** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Executions
    * const executions = await prisma.execution.findMany()
    * ```
    */
  get execution(): Prisma.ExecutionDelegate<ExtArgs>;

  /**
   * `prisma.executionStep`: Exposes CRUD operations for the **ExecutionStep** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ExecutionSteps
    * const executionSteps = await prisma.executionStep.findMany()
    * ```
    */
  get executionStep(): Prisma.ExecutionStepDelegate<ExtArgs>;

  /**
   * `prisma.runtimeSession`: Exposes CRUD operations for the **RuntimeSession** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more RuntimeSessions
    * const runtimeSessions = await prisma.runtimeSession.findMany()
    * ```
    */
  get runtimeSession(): Prisma.RuntimeSessionDelegate<ExtArgs>;

  /**
   * `prisma.executionEvent`: Exposes CRUD operations for the **ExecutionEvent** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ExecutionEvents
    * const executionEvents = await prisma.executionEvent.findMany()
    * ```
    */
  get executionEvent(): Prisma.ExecutionEventDelegate<ExtArgs>;
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
  export import NotFoundError = runtime.NotFoundError

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
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


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
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
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
    Execution: 'Execution',
    ExecutionStep: 'ExecutionStep',
    RuntimeSession: 'RuntimeSession',
    ExecutionEvent: 'ExecutionEvent'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "execution" | "executionStep" | "runtimeSession" | "executionEvent"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Execution: {
        payload: Prisma.$ExecutionPayload<ExtArgs>
        fields: Prisma.ExecutionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ExecutionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ExecutionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>
          }
          findFirst: {
            args: Prisma.ExecutionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ExecutionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>
          }
          findMany: {
            args: Prisma.ExecutionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>[]
          }
          create: {
            args: Prisma.ExecutionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>
          }
          createMany: {
            args: Prisma.ExecutionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ExecutionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>[]
          }
          delete: {
            args: Prisma.ExecutionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>
          }
          update: {
            args: Prisma.ExecutionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>
          }
          deleteMany: {
            args: Prisma.ExecutionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ExecutionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ExecutionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionPayload>
          }
          aggregate: {
            args: Prisma.ExecutionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateExecution>
          }
          groupBy: {
            args: Prisma.ExecutionGroupByArgs<ExtArgs>
            result: $Utils.Optional<ExecutionGroupByOutputType>[]
          }
          count: {
            args: Prisma.ExecutionCountArgs<ExtArgs>
            result: $Utils.Optional<ExecutionCountAggregateOutputType> | number
          }
        }
      }
      ExecutionStep: {
        payload: Prisma.$ExecutionStepPayload<ExtArgs>
        fields: Prisma.ExecutionStepFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ExecutionStepFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ExecutionStepFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>
          }
          findFirst: {
            args: Prisma.ExecutionStepFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ExecutionStepFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>
          }
          findMany: {
            args: Prisma.ExecutionStepFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>[]
          }
          create: {
            args: Prisma.ExecutionStepCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>
          }
          createMany: {
            args: Prisma.ExecutionStepCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ExecutionStepCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>[]
          }
          delete: {
            args: Prisma.ExecutionStepDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>
          }
          update: {
            args: Prisma.ExecutionStepUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>
          }
          deleteMany: {
            args: Prisma.ExecutionStepDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ExecutionStepUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ExecutionStepUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionStepPayload>
          }
          aggregate: {
            args: Prisma.ExecutionStepAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateExecutionStep>
          }
          groupBy: {
            args: Prisma.ExecutionStepGroupByArgs<ExtArgs>
            result: $Utils.Optional<ExecutionStepGroupByOutputType>[]
          }
          count: {
            args: Prisma.ExecutionStepCountArgs<ExtArgs>
            result: $Utils.Optional<ExecutionStepCountAggregateOutputType> | number
          }
        }
      }
      RuntimeSession: {
        payload: Prisma.$RuntimeSessionPayload<ExtArgs>
        fields: Prisma.RuntimeSessionFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RuntimeSessionFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RuntimeSessionFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>
          }
          findFirst: {
            args: Prisma.RuntimeSessionFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RuntimeSessionFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>
          }
          findMany: {
            args: Prisma.RuntimeSessionFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>[]
          }
          create: {
            args: Prisma.RuntimeSessionCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>
          }
          createMany: {
            args: Prisma.RuntimeSessionCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RuntimeSessionCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>[]
          }
          delete: {
            args: Prisma.RuntimeSessionDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>
          }
          update: {
            args: Prisma.RuntimeSessionUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>
          }
          deleteMany: {
            args: Prisma.RuntimeSessionDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RuntimeSessionUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.RuntimeSessionUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RuntimeSessionPayload>
          }
          aggregate: {
            args: Prisma.RuntimeSessionAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRuntimeSession>
          }
          groupBy: {
            args: Prisma.RuntimeSessionGroupByArgs<ExtArgs>
            result: $Utils.Optional<RuntimeSessionGroupByOutputType>[]
          }
          count: {
            args: Prisma.RuntimeSessionCountArgs<ExtArgs>
            result: $Utils.Optional<RuntimeSessionCountAggregateOutputType> | number
          }
        }
      }
      ExecutionEvent: {
        payload: Prisma.$ExecutionEventPayload<ExtArgs>
        fields: Prisma.ExecutionEventFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ExecutionEventFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ExecutionEventFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>
          }
          findFirst: {
            args: Prisma.ExecutionEventFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ExecutionEventFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>
          }
          findMany: {
            args: Prisma.ExecutionEventFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>[]
          }
          create: {
            args: Prisma.ExecutionEventCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>
          }
          createMany: {
            args: Prisma.ExecutionEventCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ExecutionEventCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>[]
          }
          delete: {
            args: Prisma.ExecutionEventDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>
          }
          update: {
            args: Prisma.ExecutionEventUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>
          }
          deleteMany: {
            args: Prisma.ExecutionEventDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ExecutionEventUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.ExecutionEventUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ExecutionEventPayload>
          }
          aggregate: {
            args: Prisma.ExecutionEventAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateExecutionEvent>
          }
          groupBy: {
            args: Prisma.ExecutionEventGroupByArgs<ExtArgs>
            result: $Utils.Optional<ExecutionEventGroupByOutputType>[]
          }
          count: {
            args: Prisma.ExecutionEventCountArgs<ExtArgs>
            result: $Utils.Optional<ExecutionEventCountAggregateOutputType> | number
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
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
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
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

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

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

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
   * Count Type ExecutionCountOutputType
   */

  export type ExecutionCountOutputType = {
    steps: number
    runtimeSessions: number
    events: number
  }

  export type ExecutionCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    steps?: boolean | ExecutionCountOutputTypeCountStepsArgs
    runtimeSessions?: boolean | ExecutionCountOutputTypeCountRuntimeSessionsArgs
    events?: boolean | ExecutionCountOutputTypeCountEventsArgs
  }

  // Custom InputTypes
  /**
   * ExecutionCountOutputType without action
   */
  export type ExecutionCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionCountOutputType
     */
    select?: ExecutionCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * ExecutionCountOutputType without action
   */
  export type ExecutionCountOutputTypeCountStepsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ExecutionStepWhereInput
  }

  /**
   * ExecutionCountOutputType without action
   */
  export type ExecutionCountOutputTypeCountRuntimeSessionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RuntimeSessionWhereInput
  }

  /**
   * ExecutionCountOutputType without action
   */
  export type ExecutionCountOutputTypeCountEventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ExecutionEventWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Execution
   */

  export type AggregateExecution = {
    _count: ExecutionCountAggregateOutputType | null
    _min: ExecutionMinAggregateOutputType | null
    _max: ExecutionMaxAggregateOutputType | null
  }

  export type ExecutionMinAggregateOutputType = {
    id: string | null
    orgId: string | null
    createdBy: string | null
    skillId: string | null
    skillVersion: string | null
    status: string | null
    runtimeType: string | null
    riskLevel: string | null
    failureReason: string | null
    failureCode: string | null
    currentStepId: string | null
    requiresApproval: boolean | null
    approvalStatus: string | null
    takeoverRequired: boolean | null
    takeoverReason: string | null
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ExecutionMaxAggregateOutputType = {
    id: string | null
    orgId: string | null
    createdBy: string | null
    skillId: string | null
    skillVersion: string | null
    status: string | null
    runtimeType: string | null
    riskLevel: string | null
    failureReason: string | null
    failureCode: string | null
    currentStepId: string | null
    requiresApproval: boolean | null
    approvalStatus: string | null
    takeoverRequired: boolean | null
    takeoverReason: string | null
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ExecutionCountAggregateOutputType = {
    id: number
    orgId: number
    createdBy: number
    skillId: number
    skillVersion: number
    status: number
    runtimeType: number
    riskLevel: number
    inputJson: number
    normalizedInputJson: number
    resultJson: number
    failureReason: number
    failureCode: number
    currentStepId: number
    requiresApproval: number
    approvalStatus: number
    takeoverRequired: number
    takeoverReason: number
    startedAt: number
    endedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ExecutionMinAggregateInputType = {
    id?: true
    orgId?: true
    createdBy?: true
    skillId?: true
    skillVersion?: true
    status?: true
    runtimeType?: true
    riskLevel?: true
    failureReason?: true
    failureCode?: true
    currentStepId?: true
    requiresApproval?: true
    approvalStatus?: true
    takeoverRequired?: true
    takeoverReason?: true
    startedAt?: true
    endedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ExecutionMaxAggregateInputType = {
    id?: true
    orgId?: true
    createdBy?: true
    skillId?: true
    skillVersion?: true
    status?: true
    runtimeType?: true
    riskLevel?: true
    failureReason?: true
    failureCode?: true
    currentStepId?: true
    requiresApproval?: true
    approvalStatus?: true
    takeoverRequired?: true
    takeoverReason?: true
    startedAt?: true
    endedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ExecutionCountAggregateInputType = {
    id?: true
    orgId?: true
    createdBy?: true
    skillId?: true
    skillVersion?: true
    status?: true
    runtimeType?: true
    riskLevel?: true
    inputJson?: true
    normalizedInputJson?: true
    resultJson?: true
    failureReason?: true
    failureCode?: true
    currentStepId?: true
    requiresApproval?: true
    approvalStatus?: true
    takeoverRequired?: true
    takeoverReason?: true
    startedAt?: true
    endedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ExecutionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Execution to aggregate.
     */
    where?: ExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Executions to fetch.
     */
    orderBy?: ExecutionOrderByWithRelationInput | ExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Executions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Executions
    **/
    _count?: true | ExecutionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ExecutionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ExecutionMaxAggregateInputType
  }

  export type GetExecutionAggregateType<T extends ExecutionAggregateArgs> = {
        [P in keyof T & keyof AggregateExecution]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateExecution[P]>
      : GetScalarType<T[P], AggregateExecution[P]>
  }




  export type ExecutionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ExecutionWhereInput
    orderBy?: ExecutionOrderByWithAggregationInput | ExecutionOrderByWithAggregationInput[]
    by: ExecutionScalarFieldEnum[] | ExecutionScalarFieldEnum
    having?: ExecutionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ExecutionCountAggregateInputType | true
    _min?: ExecutionMinAggregateInputType
    _max?: ExecutionMaxAggregateInputType
  }

  export type ExecutionGroupByOutputType = {
    id: string
    orgId: string | null
    createdBy: string
    skillId: string
    skillVersion: string | null
    status: string
    runtimeType: string
    riskLevel: string
    inputJson: JsonValue | null
    normalizedInputJson: JsonValue | null
    resultJson: JsonValue | null
    failureReason: string | null
    failureCode: string | null
    currentStepId: string | null
    requiresApproval: boolean
    approvalStatus: string | null
    takeoverRequired: boolean
    takeoverReason: string | null
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: ExecutionCountAggregateOutputType | null
    _min: ExecutionMinAggregateOutputType | null
    _max: ExecutionMaxAggregateOutputType | null
  }

  type GetExecutionGroupByPayload<T extends ExecutionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ExecutionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ExecutionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ExecutionGroupByOutputType[P]>
            : GetScalarType<T[P], ExecutionGroupByOutputType[P]>
        }
      >
    >


  export type ExecutionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    orgId?: boolean
    createdBy?: boolean
    skillId?: boolean
    skillVersion?: boolean
    status?: boolean
    runtimeType?: boolean
    riskLevel?: boolean
    inputJson?: boolean
    normalizedInputJson?: boolean
    resultJson?: boolean
    failureReason?: boolean
    failureCode?: boolean
    currentStepId?: boolean
    requiresApproval?: boolean
    approvalStatus?: boolean
    takeoverRequired?: boolean
    takeoverReason?: boolean
    startedAt?: boolean
    endedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    steps?: boolean | Execution$stepsArgs<ExtArgs>
    runtimeSessions?: boolean | Execution$runtimeSessionsArgs<ExtArgs>
    events?: boolean | Execution$eventsArgs<ExtArgs>
    _count?: boolean | ExecutionCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["execution"]>

  export type ExecutionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    orgId?: boolean
    createdBy?: boolean
    skillId?: boolean
    skillVersion?: boolean
    status?: boolean
    runtimeType?: boolean
    riskLevel?: boolean
    inputJson?: boolean
    normalizedInputJson?: boolean
    resultJson?: boolean
    failureReason?: boolean
    failureCode?: boolean
    currentStepId?: boolean
    requiresApproval?: boolean
    approvalStatus?: boolean
    takeoverRequired?: boolean
    takeoverReason?: boolean
    startedAt?: boolean
    endedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["execution"]>

  export type ExecutionSelectScalar = {
    id?: boolean
    orgId?: boolean
    createdBy?: boolean
    skillId?: boolean
    skillVersion?: boolean
    status?: boolean
    runtimeType?: boolean
    riskLevel?: boolean
    inputJson?: boolean
    normalizedInputJson?: boolean
    resultJson?: boolean
    failureReason?: boolean
    failureCode?: boolean
    currentStepId?: boolean
    requiresApproval?: boolean
    approvalStatus?: boolean
    takeoverRequired?: boolean
    takeoverReason?: boolean
    startedAt?: boolean
    endedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ExecutionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    steps?: boolean | Execution$stepsArgs<ExtArgs>
    runtimeSessions?: boolean | Execution$runtimeSessionsArgs<ExtArgs>
    events?: boolean | Execution$eventsArgs<ExtArgs>
    _count?: boolean | ExecutionCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type ExecutionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $ExecutionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Execution"
    objects: {
      steps: Prisma.$ExecutionStepPayload<ExtArgs>[]
      runtimeSessions: Prisma.$RuntimeSessionPayload<ExtArgs>[]
      events: Prisma.$ExecutionEventPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      orgId: string | null
      createdBy: string
      skillId: string
      skillVersion: string | null
      status: string
      runtimeType: string
      riskLevel: string
      inputJson: Prisma.JsonValue | null
      normalizedInputJson: Prisma.JsonValue | null
      resultJson: Prisma.JsonValue | null
      failureReason: string | null
      failureCode: string | null
      currentStepId: string | null
      requiresApproval: boolean
      approvalStatus: string | null
      takeoverRequired: boolean
      takeoverReason: string | null
      startedAt: Date | null
      endedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["execution"]>
    composites: {}
  }

  type ExecutionGetPayload<S extends boolean | null | undefined | ExecutionDefaultArgs> = $Result.GetResult<Prisma.$ExecutionPayload, S>

  type ExecutionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ExecutionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ExecutionCountAggregateInputType | true
    }

  export interface ExecutionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Execution'], meta: { name: 'Execution' } }
    /**
     * Find zero or one Execution that matches the filter.
     * @param {ExecutionFindUniqueArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ExecutionFindUniqueArgs>(args: SelectSubset<T, ExecutionFindUniqueArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one Execution that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ExecutionFindUniqueOrThrowArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ExecutionFindUniqueOrThrowArgs>(args: SelectSubset<T, ExecutionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first Execution that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionFindFirstArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ExecutionFindFirstArgs>(args?: SelectSubset<T, ExecutionFindFirstArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first Execution that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionFindFirstOrThrowArgs} args - Arguments to find a Execution
     * @example
     * // Get one Execution
     * const execution = await prisma.execution.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ExecutionFindFirstOrThrowArgs>(args?: SelectSubset<T, ExecutionFindFirstOrThrowArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more Executions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Executions
     * const executions = await prisma.execution.findMany()
     * 
     * // Get first 10 Executions
     * const executions = await prisma.execution.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const executionWithIdOnly = await prisma.execution.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ExecutionFindManyArgs>(args?: SelectSubset<T, ExecutionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a Execution.
     * @param {ExecutionCreateArgs} args - Arguments to create a Execution.
     * @example
     * // Create one Execution
     * const Execution = await prisma.execution.create({
     *   data: {
     *     // ... data to create a Execution
     *   }
     * })
     * 
     */
    create<T extends ExecutionCreateArgs>(args: SelectSubset<T, ExecutionCreateArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many Executions.
     * @param {ExecutionCreateManyArgs} args - Arguments to create many Executions.
     * @example
     * // Create many Executions
     * const execution = await prisma.execution.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ExecutionCreateManyArgs>(args?: SelectSubset<T, ExecutionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Executions and returns the data saved in the database.
     * @param {ExecutionCreateManyAndReturnArgs} args - Arguments to create many Executions.
     * @example
     * // Create many Executions
     * const execution = await prisma.execution.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Executions and only return the `id`
     * const executionWithIdOnly = await prisma.execution.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ExecutionCreateManyAndReturnArgs>(args?: SelectSubset<T, ExecutionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a Execution.
     * @param {ExecutionDeleteArgs} args - Arguments to delete one Execution.
     * @example
     * // Delete one Execution
     * const Execution = await prisma.execution.delete({
     *   where: {
     *     // ... filter to delete one Execution
     *   }
     * })
     * 
     */
    delete<T extends ExecutionDeleteArgs>(args: SelectSubset<T, ExecutionDeleteArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one Execution.
     * @param {ExecutionUpdateArgs} args - Arguments to update one Execution.
     * @example
     * // Update one Execution
     * const execution = await prisma.execution.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ExecutionUpdateArgs>(args: SelectSubset<T, ExecutionUpdateArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more Executions.
     * @param {ExecutionDeleteManyArgs} args - Arguments to filter Executions to delete.
     * @example
     * // Delete a few Executions
     * const { count } = await prisma.execution.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ExecutionDeleteManyArgs>(args?: SelectSubset<T, ExecutionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Executions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Executions
     * const execution = await prisma.execution.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ExecutionUpdateManyArgs>(args: SelectSubset<T, ExecutionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one Execution.
     * @param {ExecutionUpsertArgs} args - Arguments to update or create a Execution.
     * @example
     * // Update or create a Execution
     * const execution = await prisma.execution.upsert({
     *   create: {
     *     // ... data to create a Execution
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Execution we want to update
     *   }
     * })
     */
    upsert<T extends ExecutionUpsertArgs>(args: SelectSubset<T, ExecutionUpsertArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of Executions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionCountArgs} args - Arguments to filter Executions to count.
     * @example
     * // Count the number of Executions
     * const count = await prisma.execution.count({
     *   where: {
     *     // ... the filter for the Executions we want to count
     *   }
     * })
    **/
    count<T extends ExecutionCountArgs>(
      args?: Subset<T, ExecutionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ExecutionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Execution.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ExecutionAggregateArgs>(args: Subset<T, ExecutionAggregateArgs>): Prisma.PrismaPromise<GetExecutionAggregateType<T>>

    /**
     * Group by Execution.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionGroupByArgs} args - Group by arguments.
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
      T extends ExecutionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ExecutionGroupByArgs['orderBy'] }
        : { orderBy?: ExecutionGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, ExecutionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetExecutionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Execution model
   */
  readonly fields: ExecutionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Execution.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ExecutionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    steps<T extends Execution$stepsArgs<ExtArgs> = {}>(args?: Subset<T, Execution$stepsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "findMany"> | Null>
    runtimeSessions<T extends Execution$runtimeSessionsArgs<ExtArgs> = {}>(args?: Subset<T, Execution$runtimeSessionsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "findMany"> | Null>
    events<T extends Execution$eventsArgs<ExtArgs> = {}>(args?: Subset<T, Execution$eventsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "findMany"> | Null>
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
   * Fields of the Execution model
   */ 
  interface ExecutionFieldRefs {
    readonly id: FieldRef<"Execution", 'String'>
    readonly orgId: FieldRef<"Execution", 'String'>
    readonly createdBy: FieldRef<"Execution", 'String'>
    readonly skillId: FieldRef<"Execution", 'String'>
    readonly skillVersion: FieldRef<"Execution", 'String'>
    readonly status: FieldRef<"Execution", 'String'>
    readonly runtimeType: FieldRef<"Execution", 'String'>
    readonly riskLevel: FieldRef<"Execution", 'String'>
    readonly inputJson: FieldRef<"Execution", 'Json'>
    readonly normalizedInputJson: FieldRef<"Execution", 'Json'>
    readonly resultJson: FieldRef<"Execution", 'Json'>
    readonly failureReason: FieldRef<"Execution", 'String'>
    readonly failureCode: FieldRef<"Execution", 'String'>
    readonly currentStepId: FieldRef<"Execution", 'String'>
    readonly requiresApproval: FieldRef<"Execution", 'Boolean'>
    readonly approvalStatus: FieldRef<"Execution", 'String'>
    readonly takeoverRequired: FieldRef<"Execution", 'Boolean'>
    readonly takeoverReason: FieldRef<"Execution", 'String'>
    readonly startedAt: FieldRef<"Execution", 'DateTime'>
    readonly endedAt: FieldRef<"Execution", 'DateTime'>
    readonly createdAt: FieldRef<"Execution", 'DateTime'>
    readonly updatedAt: FieldRef<"Execution", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Execution findUnique
   */
  export type ExecutionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * Filter, which Execution to fetch.
     */
    where: ExecutionWhereUniqueInput
  }

  /**
   * Execution findUniqueOrThrow
   */
  export type ExecutionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * Filter, which Execution to fetch.
     */
    where: ExecutionWhereUniqueInput
  }

  /**
   * Execution findFirst
   */
  export type ExecutionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * Filter, which Execution to fetch.
     */
    where?: ExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Executions to fetch.
     */
    orderBy?: ExecutionOrderByWithRelationInput | ExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Executions.
     */
    cursor?: ExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Executions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Executions.
     */
    distinct?: ExecutionScalarFieldEnum | ExecutionScalarFieldEnum[]
  }

  /**
   * Execution findFirstOrThrow
   */
  export type ExecutionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * Filter, which Execution to fetch.
     */
    where?: ExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Executions to fetch.
     */
    orderBy?: ExecutionOrderByWithRelationInput | ExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Executions.
     */
    cursor?: ExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Executions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Executions.
     */
    distinct?: ExecutionScalarFieldEnum | ExecutionScalarFieldEnum[]
  }

  /**
   * Execution findMany
   */
  export type ExecutionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * Filter, which Executions to fetch.
     */
    where?: ExecutionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Executions to fetch.
     */
    orderBy?: ExecutionOrderByWithRelationInput | ExecutionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Executions.
     */
    cursor?: ExecutionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Executions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Executions.
     */
    skip?: number
    distinct?: ExecutionScalarFieldEnum | ExecutionScalarFieldEnum[]
  }

  /**
   * Execution create
   */
  export type ExecutionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * The data needed to create a Execution.
     */
    data: XOR<ExecutionCreateInput, ExecutionUncheckedCreateInput>
  }

  /**
   * Execution createMany
   */
  export type ExecutionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Executions.
     */
    data: ExecutionCreateManyInput | ExecutionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Execution createManyAndReturn
   */
  export type ExecutionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many Executions.
     */
    data: ExecutionCreateManyInput | ExecutionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Execution update
   */
  export type ExecutionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * The data needed to update a Execution.
     */
    data: XOR<ExecutionUpdateInput, ExecutionUncheckedUpdateInput>
    /**
     * Choose, which Execution to update.
     */
    where: ExecutionWhereUniqueInput
  }

  /**
   * Execution updateMany
   */
  export type ExecutionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Executions.
     */
    data: XOR<ExecutionUpdateManyMutationInput, ExecutionUncheckedUpdateManyInput>
    /**
     * Filter which Executions to update
     */
    where?: ExecutionWhereInput
  }

  /**
   * Execution upsert
   */
  export type ExecutionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * The filter to search for the Execution to update in case it exists.
     */
    where: ExecutionWhereUniqueInput
    /**
     * In case the Execution found by the `where` argument doesn't exist, create a new Execution with this data.
     */
    create: XOR<ExecutionCreateInput, ExecutionUncheckedCreateInput>
    /**
     * In case the Execution was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ExecutionUpdateInput, ExecutionUncheckedUpdateInput>
  }

  /**
   * Execution delete
   */
  export type ExecutionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    /**
     * Filter which Execution to delete.
     */
    where: ExecutionWhereUniqueInput
  }

  /**
   * Execution deleteMany
   */
  export type ExecutionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Executions to delete
     */
    where?: ExecutionWhereInput
  }

  /**
   * Execution.steps
   */
  export type Execution$stepsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    where?: ExecutionStepWhereInput
    orderBy?: ExecutionStepOrderByWithRelationInput | ExecutionStepOrderByWithRelationInput[]
    cursor?: ExecutionStepWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ExecutionStepScalarFieldEnum | ExecutionStepScalarFieldEnum[]
  }

  /**
   * Execution.runtimeSessions
   */
  export type Execution$runtimeSessionsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    where?: RuntimeSessionWhereInput
    orderBy?: RuntimeSessionOrderByWithRelationInput | RuntimeSessionOrderByWithRelationInput[]
    cursor?: RuntimeSessionWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RuntimeSessionScalarFieldEnum | RuntimeSessionScalarFieldEnum[]
  }

  /**
   * Execution.events
   */
  export type Execution$eventsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    where?: ExecutionEventWhereInput
    orderBy?: ExecutionEventOrderByWithRelationInput | ExecutionEventOrderByWithRelationInput[]
    cursor?: ExecutionEventWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ExecutionEventScalarFieldEnum | ExecutionEventScalarFieldEnum[]
  }

  /**
   * Execution without action
   */
  export type ExecutionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
  }


  /**
   * Model ExecutionStep
   */

  export type AggregateExecutionStep = {
    _count: ExecutionStepCountAggregateOutputType | null
    _avg: ExecutionStepAvgAggregateOutputType | null
    _sum: ExecutionStepSumAggregateOutputType | null
    _min: ExecutionStepMinAggregateOutputType | null
    _max: ExecutionStepMaxAggregateOutputType | null
  }

  export type ExecutionStepAvgAggregateOutputType = {
    stepIndex: number | null
    retryCount: number | null
  }

  export type ExecutionStepSumAggregateOutputType = {
    stepIndex: number | null
    retryCount: number | null
  }

  export type ExecutionStepMinAggregateOutputType = {
    id: string | null
    executionId: string | null
    stepIndex: number | null
    name: string | null
    type: string | null
    status: string | null
    action: string | null
    errorMessage: string | null
    errorCode: string | null
    retryCount: number | null
    snapshotId: string | null
    takeoverTriggered: boolean | null
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ExecutionStepMaxAggregateOutputType = {
    id: string | null
    executionId: string | null
    stepIndex: number | null
    name: string | null
    type: string | null
    status: string | null
    action: string | null
    errorMessage: string | null
    errorCode: string | null
    retryCount: number | null
    snapshotId: string | null
    takeoverTriggered: boolean | null
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ExecutionStepCountAggregateOutputType = {
    id: number
    executionId: number
    stepIndex: number
    name: number
    type: number
    status: number
    action: number
    targetJson: number
    inputJson: number
    outputJson: number
    assertionJson: number
    errorMessage: number
    errorCode: number
    retryCount: number
    snapshotId: number
    takeoverTriggered: number
    startedAt: number
    endedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ExecutionStepAvgAggregateInputType = {
    stepIndex?: true
    retryCount?: true
  }

  export type ExecutionStepSumAggregateInputType = {
    stepIndex?: true
    retryCount?: true
  }

  export type ExecutionStepMinAggregateInputType = {
    id?: true
    executionId?: true
    stepIndex?: true
    name?: true
    type?: true
    status?: true
    action?: true
    errorMessage?: true
    errorCode?: true
    retryCount?: true
    snapshotId?: true
    takeoverTriggered?: true
    startedAt?: true
    endedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ExecutionStepMaxAggregateInputType = {
    id?: true
    executionId?: true
    stepIndex?: true
    name?: true
    type?: true
    status?: true
    action?: true
    errorMessage?: true
    errorCode?: true
    retryCount?: true
    snapshotId?: true
    takeoverTriggered?: true
    startedAt?: true
    endedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ExecutionStepCountAggregateInputType = {
    id?: true
    executionId?: true
    stepIndex?: true
    name?: true
    type?: true
    status?: true
    action?: true
    targetJson?: true
    inputJson?: true
    outputJson?: true
    assertionJson?: true
    errorMessage?: true
    errorCode?: true
    retryCount?: true
    snapshotId?: true
    takeoverTriggered?: true
    startedAt?: true
    endedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ExecutionStepAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ExecutionStep to aggregate.
     */
    where?: ExecutionStepWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionSteps to fetch.
     */
    orderBy?: ExecutionStepOrderByWithRelationInput | ExecutionStepOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ExecutionStepWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionSteps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionSteps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ExecutionSteps
    **/
    _count?: true | ExecutionStepCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ExecutionStepAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ExecutionStepSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ExecutionStepMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ExecutionStepMaxAggregateInputType
  }

  export type GetExecutionStepAggregateType<T extends ExecutionStepAggregateArgs> = {
        [P in keyof T & keyof AggregateExecutionStep]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateExecutionStep[P]>
      : GetScalarType<T[P], AggregateExecutionStep[P]>
  }




  export type ExecutionStepGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ExecutionStepWhereInput
    orderBy?: ExecutionStepOrderByWithAggregationInput | ExecutionStepOrderByWithAggregationInput[]
    by: ExecutionStepScalarFieldEnum[] | ExecutionStepScalarFieldEnum
    having?: ExecutionStepScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ExecutionStepCountAggregateInputType | true
    _avg?: ExecutionStepAvgAggregateInputType
    _sum?: ExecutionStepSumAggregateInputType
    _min?: ExecutionStepMinAggregateInputType
    _max?: ExecutionStepMaxAggregateInputType
  }

  export type ExecutionStepGroupByOutputType = {
    id: string
    executionId: string
    stepIndex: number
    name: string | null
    type: string
    status: string
    action: string | null
    targetJson: JsonValue | null
    inputJson: JsonValue | null
    outputJson: JsonValue | null
    assertionJson: JsonValue | null
    errorMessage: string | null
    errorCode: string | null
    retryCount: number
    snapshotId: string | null
    takeoverTriggered: boolean
    startedAt: Date | null
    endedAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: ExecutionStepCountAggregateOutputType | null
    _avg: ExecutionStepAvgAggregateOutputType | null
    _sum: ExecutionStepSumAggregateOutputType | null
    _min: ExecutionStepMinAggregateOutputType | null
    _max: ExecutionStepMaxAggregateOutputType | null
  }

  type GetExecutionStepGroupByPayload<T extends ExecutionStepGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ExecutionStepGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ExecutionStepGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ExecutionStepGroupByOutputType[P]>
            : GetScalarType<T[P], ExecutionStepGroupByOutputType[P]>
        }
      >
    >


  export type ExecutionStepSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    executionId?: boolean
    stepIndex?: boolean
    name?: boolean
    type?: boolean
    status?: boolean
    action?: boolean
    targetJson?: boolean
    inputJson?: boolean
    outputJson?: boolean
    assertionJson?: boolean
    errorMessage?: boolean
    errorCode?: boolean
    retryCount?: boolean
    snapshotId?: boolean
    takeoverTriggered?: boolean
    startedAt?: boolean
    endedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["executionStep"]>

  export type ExecutionStepSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    executionId?: boolean
    stepIndex?: boolean
    name?: boolean
    type?: boolean
    status?: boolean
    action?: boolean
    targetJson?: boolean
    inputJson?: boolean
    outputJson?: boolean
    assertionJson?: boolean
    errorMessage?: boolean
    errorCode?: boolean
    retryCount?: boolean
    snapshotId?: boolean
    takeoverTriggered?: boolean
    startedAt?: boolean
    endedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["executionStep"]>

  export type ExecutionStepSelectScalar = {
    id?: boolean
    executionId?: boolean
    stepIndex?: boolean
    name?: boolean
    type?: boolean
    status?: boolean
    action?: boolean
    targetJson?: boolean
    inputJson?: boolean
    outputJson?: boolean
    assertionJson?: boolean
    errorMessage?: boolean
    errorCode?: boolean
    retryCount?: boolean
    snapshotId?: boolean
    takeoverTriggered?: boolean
    startedAt?: boolean
    endedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ExecutionStepInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }
  export type ExecutionStepIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }

  export type $ExecutionStepPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ExecutionStep"
    objects: {
      execution: Prisma.$ExecutionPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      executionId: string
      stepIndex: number
      name: string | null
      type: string
      status: string
      action: string | null
      targetJson: Prisma.JsonValue | null
      inputJson: Prisma.JsonValue | null
      outputJson: Prisma.JsonValue | null
      assertionJson: Prisma.JsonValue | null
      errorMessage: string | null
      errorCode: string | null
      retryCount: number
      snapshotId: string | null
      takeoverTriggered: boolean
      startedAt: Date | null
      endedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["executionStep"]>
    composites: {}
  }

  type ExecutionStepGetPayload<S extends boolean | null | undefined | ExecutionStepDefaultArgs> = $Result.GetResult<Prisma.$ExecutionStepPayload, S>

  type ExecutionStepCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ExecutionStepFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ExecutionStepCountAggregateInputType | true
    }

  export interface ExecutionStepDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ExecutionStep'], meta: { name: 'ExecutionStep' } }
    /**
     * Find zero or one ExecutionStep that matches the filter.
     * @param {ExecutionStepFindUniqueArgs} args - Arguments to find a ExecutionStep
     * @example
     * // Get one ExecutionStep
     * const executionStep = await prisma.executionStep.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ExecutionStepFindUniqueArgs>(args: SelectSubset<T, ExecutionStepFindUniqueArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one ExecutionStep that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ExecutionStepFindUniqueOrThrowArgs} args - Arguments to find a ExecutionStep
     * @example
     * // Get one ExecutionStep
     * const executionStep = await prisma.executionStep.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ExecutionStepFindUniqueOrThrowArgs>(args: SelectSubset<T, ExecutionStepFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first ExecutionStep that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepFindFirstArgs} args - Arguments to find a ExecutionStep
     * @example
     * // Get one ExecutionStep
     * const executionStep = await prisma.executionStep.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ExecutionStepFindFirstArgs>(args?: SelectSubset<T, ExecutionStepFindFirstArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first ExecutionStep that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepFindFirstOrThrowArgs} args - Arguments to find a ExecutionStep
     * @example
     * // Get one ExecutionStep
     * const executionStep = await prisma.executionStep.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ExecutionStepFindFirstOrThrowArgs>(args?: SelectSubset<T, ExecutionStepFindFirstOrThrowArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more ExecutionSteps that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ExecutionSteps
     * const executionSteps = await prisma.executionStep.findMany()
     * 
     * // Get first 10 ExecutionSteps
     * const executionSteps = await prisma.executionStep.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const executionStepWithIdOnly = await prisma.executionStep.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ExecutionStepFindManyArgs>(args?: SelectSubset<T, ExecutionStepFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a ExecutionStep.
     * @param {ExecutionStepCreateArgs} args - Arguments to create a ExecutionStep.
     * @example
     * // Create one ExecutionStep
     * const ExecutionStep = await prisma.executionStep.create({
     *   data: {
     *     // ... data to create a ExecutionStep
     *   }
     * })
     * 
     */
    create<T extends ExecutionStepCreateArgs>(args: SelectSubset<T, ExecutionStepCreateArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many ExecutionSteps.
     * @param {ExecutionStepCreateManyArgs} args - Arguments to create many ExecutionSteps.
     * @example
     * // Create many ExecutionSteps
     * const executionStep = await prisma.executionStep.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ExecutionStepCreateManyArgs>(args?: SelectSubset<T, ExecutionStepCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ExecutionSteps and returns the data saved in the database.
     * @param {ExecutionStepCreateManyAndReturnArgs} args - Arguments to create many ExecutionSteps.
     * @example
     * // Create many ExecutionSteps
     * const executionStep = await prisma.executionStep.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ExecutionSteps and only return the `id`
     * const executionStepWithIdOnly = await prisma.executionStep.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ExecutionStepCreateManyAndReturnArgs>(args?: SelectSubset<T, ExecutionStepCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a ExecutionStep.
     * @param {ExecutionStepDeleteArgs} args - Arguments to delete one ExecutionStep.
     * @example
     * // Delete one ExecutionStep
     * const ExecutionStep = await prisma.executionStep.delete({
     *   where: {
     *     // ... filter to delete one ExecutionStep
     *   }
     * })
     * 
     */
    delete<T extends ExecutionStepDeleteArgs>(args: SelectSubset<T, ExecutionStepDeleteArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one ExecutionStep.
     * @param {ExecutionStepUpdateArgs} args - Arguments to update one ExecutionStep.
     * @example
     * // Update one ExecutionStep
     * const executionStep = await prisma.executionStep.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ExecutionStepUpdateArgs>(args: SelectSubset<T, ExecutionStepUpdateArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more ExecutionSteps.
     * @param {ExecutionStepDeleteManyArgs} args - Arguments to filter ExecutionSteps to delete.
     * @example
     * // Delete a few ExecutionSteps
     * const { count } = await prisma.executionStep.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ExecutionStepDeleteManyArgs>(args?: SelectSubset<T, ExecutionStepDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ExecutionSteps.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ExecutionSteps
     * const executionStep = await prisma.executionStep.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ExecutionStepUpdateManyArgs>(args: SelectSubset<T, ExecutionStepUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one ExecutionStep.
     * @param {ExecutionStepUpsertArgs} args - Arguments to update or create a ExecutionStep.
     * @example
     * // Update or create a ExecutionStep
     * const executionStep = await prisma.executionStep.upsert({
     *   create: {
     *     // ... data to create a ExecutionStep
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ExecutionStep we want to update
     *   }
     * })
     */
    upsert<T extends ExecutionStepUpsertArgs>(args: SelectSubset<T, ExecutionStepUpsertArgs<ExtArgs>>): Prisma__ExecutionStepClient<$Result.GetResult<Prisma.$ExecutionStepPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of ExecutionSteps.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepCountArgs} args - Arguments to filter ExecutionSteps to count.
     * @example
     * // Count the number of ExecutionSteps
     * const count = await prisma.executionStep.count({
     *   where: {
     *     // ... the filter for the ExecutionSteps we want to count
     *   }
     * })
    **/
    count<T extends ExecutionStepCountArgs>(
      args?: Subset<T, ExecutionStepCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ExecutionStepCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ExecutionStep.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ExecutionStepAggregateArgs>(args: Subset<T, ExecutionStepAggregateArgs>): Prisma.PrismaPromise<GetExecutionStepAggregateType<T>>

    /**
     * Group by ExecutionStep.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionStepGroupByArgs} args - Group by arguments.
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
      T extends ExecutionStepGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ExecutionStepGroupByArgs['orderBy'] }
        : { orderBy?: ExecutionStepGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, ExecutionStepGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetExecutionStepGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ExecutionStep model
   */
  readonly fields: ExecutionStepFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ExecutionStep.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ExecutionStepClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    execution<T extends ExecutionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ExecutionDefaultArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
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
   * Fields of the ExecutionStep model
   */ 
  interface ExecutionStepFieldRefs {
    readonly id: FieldRef<"ExecutionStep", 'String'>
    readonly executionId: FieldRef<"ExecutionStep", 'String'>
    readonly stepIndex: FieldRef<"ExecutionStep", 'Int'>
    readonly name: FieldRef<"ExecutionStep", 'String'>
    readonly type: FieldRef<"ExecutionStep", 'String'>
    readonly status: FieldRef<"ExecutionStep", 'String'>
    readonly action: FieldRef<"ExecutionStep", 'String'>
    readonly targetJson: FieldRef<"ExecutionStep", 'Json'>
    readonly inputJson: FieldRef<"ExecutionStep", 'Json'>
    readonly outputJson: FieldRef<"ExecutionStep", 'Json'>
    readonly assertionJson: FieldRef<"ExecutionStep", 'Json'>
    readonly errorMessage: FieldRef<"ExecutionStep", 'String'>
    readonly errorCode: FieldRef<"ExecutionStep", 'String'>
    readonly retryCount: FieldRef<"ExecutionStep", 'Int'>
    readonly snapshotId: FieldRef<"ExecutionStep", 'String'>
    readonly takeoverTriggered: FieldRef<"ExecutionStep", 'Boolean'>
    readonly startedAt: FieldRef<"ExecutionStep", 'DateTime'>
    readonly endedAt: FieldRef<"ExecutionStep", 'DateTime'>
    readonly createdAt: FieldRef<"ExecutionStep", 'DateTime'>
    readonly updatedAt: FieldRef<"ExecutionStep", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ExecutionStep findUnique
   */
  export type ExecutionStepFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionStep to fetch.
     */
    where: ExecutionStepWhereUniqueInput
  }

  /**
   * ExecutionStep findUniqueOrThrow
   */
  export type ExecutionStepFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionStep to fetch.
     */
    where: ExecutionStepWhereUniqueInput
  }

  /**
   * ExecutionStep findFirst
   */
  export type ExecutionStepFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionStep to fetch.
     */
    where?: ExecutionStepWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionSteps to fetch.
     */
    orderBy?: ExecutionStepOrderByWithRelationInput | ExecutionStepOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ExecutionSteps.
     */
    cursor?: ExecutionStepWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionSteps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionSteps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ExecutionSteps.
     */
    distinct?: ExecutionStepScalarFieldEnum | ExecutionStepScalarFieldEnum[]
  }

  /**
   * ExecutionStep findFirstOrThrow
   */
  export type ExecutionStepFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionStep to fetch.
     */
    where?: ExecutionStepWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionSteps to fetch.
     */
    orderBy?: ExecutionStepOrderByWithRelationInput | ExecutionStepOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ExecutionSteps.
     */
    cursor?: ExecutionStepWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionSteps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionSteps.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ExecutionSteps.
     */
    distinct?: ExecutionStepScalarFieldEnum | ExecutionStepScalarFieldEnum[]
  }

  /**
   * ExecutionStep findMany
   */
  export type ExecutionStepFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionSteps to fetch.
     */
    where?: ExecutionStepWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionSteps to fetch.
     */
    orderBy?: ExecutionStepOrderByWithRelationInput | ExecutionStepOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ExecutionSteps.
     */
    cursor?: ExecutionStepWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionSteps from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionSteps.
     */
    skip?: number
    distinct?: ExecutionStepScalarFieldEnum | ExecutionStepScalarFieldEnum[]
  }

  /**
   * ExecutionStep create
   */
  export type ExecutionStepCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * The data needed to create a ExecutionStep.
     */
    data: XOR<ExecutionStepCreateInput, ExecutionStepUncheckedCreateInput>
  }

  /**
   * ExecutionStep createMany
   */
  export type ExecutionStepCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ExecutionSteps.
     */
    data: ExecutionStepCreateManyInput | ExecutionStepCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ExecutionStep createManyAndReturn
   */
  export type ExecutionStepCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many ExecutionSteps.
     */
    data: ExecutionStepCreateManyInput | ExecutionStepCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ExecutionStep update
   */
  export type ExecutionStepUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * The data needed to update a ExecutionStep.
     */
    data: XOR<ExecutionStepUpdateInput, ExecutionStepUncheckedUpdateInput>
    /**
     * Choose, which ExecutionStep to update.
     */
    where: ExecutionStepWhereUniqueInput
  }

  /**
   * ExecutionStep updateMany
   */
  export type ExecutionStepUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ExecutionSteps.
     */
    data: XOR<ExecutionStepUpdateManyMutationInput, ExecutionStepUncheckedUpdateManyInput>
    /**
     * Filter which ExecutionSteps to update
     */
    where?: ExecutionStepWhereInput
  }

  /**
   * ExecutionStep upsert
   */
  export type ExecutionStepUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * The filter to search for the ExecutionStep to update in case it exists.
     */
    where: ExecutionStepWhereUniqueInput
    /**
     * In case the ExecutionStep found by the `where` argument doesn't exist, create a new ExecutionStep with this data.
     */
    create: XOR<ExecutionStepCreateInput, ExecutionStepUncheckedCreateInput>
    /**
     * In case the ExecutionStep was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ExecutionStepUpdateInput, ExecutionStepUncheckedUpdateInput>
  }

  /**
   * ExecutionStep delete
   */
  export type ExecutionStepDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
    /**
     * Filter which ExecutionStep to delete.
     */
    where: ExecutionStepWhereUniqueInput
  }

  /**
   * ExecutionStep deleteMany
   */
  export type ExecutionStepDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ExecutionSteps to delete
     */
    where?: ExecutionStepWhereInput
  }

  /**
   * ExecutionStep without action
   */
  export type ExecutionStepDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionStep
     */
    select?: ExecutionStepSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionStepInclude<ExtArgs> | null
  }


  /**
   * Model RuntimeSession
   */

  export type AggregateRuntimeSession = {
    _count: RuntimeSessionCountAggregateOutputType | null
    _min: RuntimeSessionMinAggregateOutputType | null
    _max: RuntimeSessionMaxAggregateOutputType | null
  }

  export type RuntimeSessionMinAggregateOutputType = {
    id: string | null
    executionId: string | null
    runtimeType: string | null
    workerId: string | null
    profileId: string | null
    state: string | null
    controlMode: string | null
    freezeReason: string | null
    createdAt: Date | null
    updatedAt: Date | null
    closedAt: Date | null
  }

  export type RuntimeSessionMaxAggregateOutputType = {
    id: string | null
    executionId: string | null
    runtimeType: string | null
    workerId: string | null
    profileId: string | null
    state: string | null
    controlMode: string | null
    freezeReason: string | null
    createdAt: Date | null
    updatedAt: Date | null
    closedAt: Date | null
  }

  export type RuntimeSessionCountAggregateOutputType = {
    id: number
    executionId: number
    runtimeType: number
    workerId: number
    profileId: number
    state: number
    controlMode: number
    connectionInfoJson: number
    freezeReason: number
    createdAt: number
    updatedAt: number
    closedAt: number
    _all: number
  }


  export type RuntimeSessionMinAggregateInputType = {
    id?: true
    executionId?: true
    runtimeType?: true
    workerId?: true
    profileId?: true
    state?: true
    controlMode?: true
    freezeReason?: true
    createdAt?: true
    updatedAt?: true
    closedAt?: true
  }

  export type RuntimeSessionMaxAggregateInputType = {
    id?: true
    executionId?: true
    runtimeType?: true
    workerId?: true
    profileId?: true
    state?: true
    controlMode?: true
    freezeReason?: true
    createdAt?: true
    updatedAt?: true
    closedAt?: true
  }

  export type RuntimeSessionCountAggregateInputType = {
    id?: true
    executionId?: true
    runtimeType?: true
    workerId?: true
    profileId?: true
    state?: true
    controlMode?: true
    connectionInfoJson?: true
    freezeReason?: true
    createdAt?: true
    updatedAt?: true
    closedAt?: true
    _all?: true
  }

  export type RuntimeSessionAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RuntimeSession to aggregate.
     */
    where?: RuntimeSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RuntimeSessions to fetch.
     */
    orderBy?: RuntimeSessionOrderByWithRelationInput | RuntimeSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RuntimeSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RuntimeSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RuntimeSessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned RuntimeSessions
    **/
    _count?: true | RuntimeSessionCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RuntimeSessionMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RuntimeSessionMaxAggregateInputType
  }

  export type GetRuntimeSessionAggregateType<T extends RuntimeSessionAggregateArgs> = {
        [P in keyof T & keyof AggregateRuntimeSession]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRuntimeSession[P]>
      : GetScalarType<T[P], AggregateRuntimeSession[P]>
  }




  export type RuntimeSessionGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RuntimeSessionWhereInput
    orderBy?: RuntimeSessionOrderByWithAggregationInput | RuntimeSessionOrderByWithAggregationInput[]
    by: RuntimeSessionScalarFieldEnum[] | RuntimeSessionScalarFieldEnum
    having?: RuntimeSessionScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RuntimeSessionCountAggregateInputType | true
    _min?: RuntimeSessionMinAggregateInputType
    _max?: RuntimeSessionMaxAggregateInputType
  }

  export type RuntimeSessionGroupByOutputType = {
    id: string
    executionId: string | null
    runtimeType: string
    workerId: string | null
    profileId: string | null
    state: string
    controlMode: string
    connectionInfoJson: JsonValue | null
    freezeReason: string | null
    createdAt: Date
    updatedAt: Date
    closedAt: Date | null
    _count: RuntimeSessionCountAggregateOutputType | null
    _min: RuntimeSessionMinAggregateOutputType | null
    _max: RuntimeSessionMaxAggregateOutputType | null
  }

  type GetRuntimeSessionGroupByPayload<T extends RuntimeSessionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RuntimeSessionGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RuntimeSessionGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RuntimeSessionGroupByOutputType[P]>
            : GetScalarType<T[P], RuntimeSessionGroupByOutputType[P]>
        }
      >
    >


  export type RuntimeSessionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    executionId?: boolean
    runtimeType?: boolean
    workerId?: boolean
    profileId?: boolean
    state?: boolean
    controlMode?: boolean
    connectionInfoJson?: boolean
    freezeReason?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    closedAt?: boolean
    execution?: boolean | RuntimeSession$executionArgs<ExtArgs>
  }, ExtArgs["result"]["runtimeSession"]>

  export type RuntimeSessionSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    executionId?: boolean
    runtimeType?: boolean
    workerId?: boolean
    profileId?: boolean
    state?: boolean
    controlMode?: boolean
    connectionInfoJson?: boolean
    freezeReason?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    closedAt?: boolean
    execution?: boolean | RuntimeSession$executionArgs<ExtArgs>
  }, ExtArgs["result"]["runtimeSession"]>

  export type RuntimeSessionSelectScalar = {
    id?: boolean
    executionId?: boolean
    runtimeType?: boolean
    workerId?: boolean
    profileId?: boolean
    state?: boolean
    controlMode?: boolean
    connectionInfoJson?: boolean
    freezeReason?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    closedAt?: boolean
  }

  export type RuntimeSessionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    execution?: boolean | RuntimeSession$executionArgs<ExtArgs>
  }
  export type RuntimeSessionIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    execution?: boolean | RuntimeSession$executionArgs<ExtArgs>
  }

  export type $RuntimeSessionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "RuntimeSession"
    objects: {
      execution: Prisma.$ExecutionPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      executionId: string | null
      runtimeType: string
      workerId: string | null
      profileId: string | null
      state: string
      controlMode: string
      connectionInfoJson: Prisma.JsonValue | null
      freezeReason: string | null
      createdAt: Date
      updatedAt: Date
      closedAt: Date | null
    }, ExtArgs["result"]["runtimeSession"]>
    composites: {}
  }

  type RuntimeSessionGetPayload<S extends boolean | null | undefined | RuntimeSessionDefaultArgs> = $Result.GetResult<Prisma.$RuntimeSessionPayload, S>

  type RuntimeSessionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<RuntimeSessionFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: RuntimeSessionCountAggregateInputType | true
    }

  export interface RuntimeSessionDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['RuntimeSession'], meta: { name: 'RuntimeSession' } }
    /**
     * Find zero or one RuntimeSession that matches the filter.
     * @param {RuntimeSessionFindUniqueArgs} args - Arguments to find a RuntimeSession
     * @example
     * // Get one RuntimeSession
     * const runtimeSession = await prisma.runtimeSession.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RuntimeSessionFindUniqueArgs>(args: SelectSubset<T, RuntimeSessionFindUniqueArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one RuntimeSession that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {RuntimeSessionFindUniqueOrThrowArgs} args - Arguments to find a RuntimeSession
     * @example
     * // Get one RuntimeSession
     * const runtimeSession = await prisma.runtimeSession.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RuntimeSessionFindUniqueOrThrowArgs>(args: SelectSubset<T, RuntimeSessionFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first RuntimeSession that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionFindFirstArgs} args - Arguments to find a RuntimeSession
     * @example
     * // Get one RuntimeSession
     * const runtimeSession = await prisma.runtimeSession.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RuntimeSessionFindFirstArgs>(args?: SelectSubset<T, RuntimeSessionFindFirstArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first RuntimeSession that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionFindFirstOrThrowArgs} args - Arguments to find a RuntimeSession
     * @example
     * // Get one RuntimeSession
     * const runtimeSession = await prisma.runtimeSession.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RuntimeSessionFindFirstOrThrowArgs>(args?: SelectSubset<T, RuntimeSessionFindFirstOrThrowArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more RuntimeSessions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all RuntimeSessions
     * const runtimeSessions = await prisma.runtimeSession.findMany()
     * 
     * // Get first 10 RuntimeSessions
     * const runtimeSessions = await prisma.runtimeSession.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const runtimeSessionWithIdOnly = await prisma.runtimeSession.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RuntimeSessionFindManyArgs>(args?: SelectSubset<T, RuntimeSessionFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a RuntimeSession.
     * @param {RuntimeSessionCreateArgs} args - Arguments to create a RuntimeSession.
     * @example
     * // Create one RuntimeSession
     * const RuntimeSession = await prisma.runtimeSession.create({
     *   data: {
     *     // ... data to create a RuntimeSession
     *   }
     * })
     * 
     */
    create<T extends RuntimeSessionCreateArgs>(args: SelectSubset<T, RuntimeSessionCreateArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many RuntimeSessions.
     * @param {RuntimeSessionCreateManyArgs} args - Arguments to create many RuntimeSessions.
     * @example
     * // Create many RuntimeSessions
     * const runtimeSession = await prisma.runtimeSession.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RuntimeSessionCreateManyArgs>(args?: SelectSubset<T, RuntimeSessionCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many RuntimeSessions and returns the data saved in the database.
     * @param {RuntimeSessionCreateManyAndReturnArgs} args - Arguments to create many RuntimeSessions.
     * @example
     * // Create many RuntimeSessions
     * const runtimeSession = await prisma.runtimeSession.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many RuntimeSessions and only return the `id`
     * const runtimeSessionWithIdOnly = await prisma.runtimeSession.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RuntimeSessionCreateManyAndReturnArgs>(args?: SelectSubset<T, RuntimeSessionCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a RuntimeSession.
     * @param {RuntimeSessionDeleteArgs} args - Arguments to delete one RuntimeSession.
     * @example
     * // Delete one RuntimeSession
     * const RuntimeSession = await prisma.runtimeSession.delete({
     *   where: {
     *     // ... filter to delete one RuntimeSession
     *   }
     * })
     * 
     */
    delete<T extends RuntimeSessionDeleteArgs>(args: SelectSubset<T, RuntimeSessionDeleteArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one RuntimeSession.
     * @param {RuntimeSessionUpdateArgs} args - Arguments to update one RuntimeSession.
     * @example
     * // Update one RuntimeSession
     * const runtimeSession = await prisma.runtimeSession.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RuntimeSessionUpdateArgs>(args: SelectSubset<T, RuntimeSessionUpdateArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more RuntimeSessions.
     * @param {RuntimeSessionDeleteManyArgs} args - Arguments to filter RuntimeSessions to delete.
     * @example
     * // Delete a few RuntimeSessions
     * const { count } = await prisma.runtimeSession.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RuntimeSessionDeleteManyArgs>(args?: SelectSubset<T, RuntimeSessionDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RuntimeSessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many RuntimeSessions
     * const runtimeSession = await prisma.runtimeSession.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RuntimeSessionUpdateManyArgs>(args: SelectSubset<T, RuntimeSessionUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one RuntimeSession.
     * @param {RuntimeSessionUpsertArgs} args - Arguments to update or create a RuntimeSession.
     * @example
     * // Update or create a RuntimeSession
     * const runtimeSession = await prisma.runtimeSession.upsert({
     *   create: {
     *     // ... data to create a RuntimeSession
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the RuntimeSession we want to update
     *   }
     * })
     */
    upsert<T extends RuntimeSessionUpsertArgs>(args: SelectSubset<T, RuntimeSessionUpsertArgs<ExtArgs>>): Prisma__RuntimeSessionClient<$Result.GetResult<Prisma.$RuntimeSessionPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of RuntimeSessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionCountArgs} args - Arguments to filter RuntimeSessions to count.
     * @example
     * // Count the number of RuntimeSessions
     * const count = await prisma.runtimeSession.count({
     *   where: {
     *     // ... the filter for the RuntimeSessions we want to count
     *   }
     * })
    **/
    count<T extends RuntimeSessionCountArgs>(
      args?: Subset<T, RuntimeSessionCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RuntimeSessionCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a RuntimeSession.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends RuntimeSessionAggregateArgs>(args: Subset<T, RuntimeSessionAggregateArgs>): Prisma.PrismaPromise<GetRuntimeSessionAggregateType<T>>

    /**
     * Group by RuntimeSession.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RuntimeSessionGroupByArgs} args - Group by arguments.
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
      T extends RuntimeSessionGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RuntimeSessionGroupByArgs['orderBy'] }
        : { orderBy?: RuntimeSessionGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, RuntimeSessionGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRuntimeSessionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the RuntimeSession model
   */
  readonly fields: RuntimeSessionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for RuntimeSession.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RuntimeSessionClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    execution<T extends RuntimeSession$executionArgs<ExtArgs> = {}>(args?: Subset<T, RuntimeSession$executionArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUniqueOrThrow"> | null, null, ExtArgs>
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
   * Fields of the RuntimeSession model
   */ 
  interface RuntimeSessionFieldRefs {
    readonly id: FieldRef<"RuntimeSession", 'String'>
    readonly executionId: FieldRef<"RuntimeSession", 'String'>
    readonly runtimeType: FieldRef<"RuntimeSession", 'String'>
    readonly workerId: FieldRef<"RuntimeSession", 'String'>
    readonly profileId: FieldRef<"RuntimeSession", 'String'>
    readonly state: FieldRef<"RuntimeSession", 'String'>
    readonly controlMode: FieldRef<"RuntimeSession", 'String'>
    readonly connectionInfoJson: FieldRef<"RuntimeSession", 'Json'>
    readonly freezeReason: FieldRef<"RuntimeSession", 'String'>
    readonly createdAt: FieldRef<"RuntimeSession", 'DateTime'>
    readonly updatedAt: FieldRef<"RuntimeSession", 'DateTime'>
    readonly closedAt: FieldRef<"RuntimeSession", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * RuntimeSession findUnique
   */
  export type RuntimeSessionFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * Filter, which RuntimeSession to fetch.
     */
    where: RuntimeSessionWhereUniqueInput
  }

  /**
   * RuntimeSession findUniqueOrThrow
   */
  export type RuntimeSessionFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * Filter, which RuntimeSession to fetch.
     */
    where: RuntimeSessionWhereUniqueInput
  }

  /**
   * RuntimeSession findFirst
   */
  export type RuntimeSessionFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * Filter, which RuntimeSession to fetch.
     */
    where?: RuntimeSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RuntimeSessions to fetch.
     */
    orderBy?: RuntimeSessionOrderByWithRelationInput | RuntimeSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RuntimeSessions.
     */
    cursor?: RuntimeSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RuntimeSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RuntimeSessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RuntimeSessions.
     */
    distinct?: RuntimeSessionScalarFieldEnum | RuntimeSessionScalarFieldEnum[]
  }

  /**
   * RuntimeSession findFirstOrThrow
   */
  export type RuntimeSessionFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * Filter, which RuntimeSession to fetch.
     */
    where?: RuntimeSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RuntimeSessions to fetch.
     */
    orderBy?: RuntimeSessionOrderByWithRelationInput | RuntimeSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RuntimeSessions.
     */
    cursor?: RuntimeSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RuntimeSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RuntimeSessions.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RuntimeSessions.
     */
    distinct?: RuntimeSessionScalarFieldEnum | RuntimeSessionScalarFieldEnum[]
  }

  /**
   * RuntimeSession findMany
   */
  export type RuntimeSessionFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * Filter, which RuntimeSessions to fetch.
     */
    where?: RuntimeSessionWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RuntimeSessions to fetch.
     */
    orderBy?: RuntimeSessionOrderByWithRelationInput | RuntimeSessionOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing RuntimeSessions.
     */
    cursor?: RuntimeSessionWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RuntimeSessions from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RuntimeSessions.
     */
    skip?: number
    distinct?: RuntimeSessionScalarFieldEnum | RuntimeSessionScalarFieldEnum[]
  }

  /**
   * RuntimeSession create
   */
  export type RuntimeSessionCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * The data needed to create a RuntimeSession.
     */
    data: XOR<RuntimeSessionCreateInput, RuntimeSessionUncheckedCreateInput>
  }

  /**
   * RuntimeSession createMany
   */
  export type RuntimeSessionCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many RuntimeSessions.
     */
    data: RuntimeSessionCreateManyInput | RuntimeSessionCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RuntimeSession createManyAndReturn
   */
  export type RuntimeSessionCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many RuntimeSessions.
     */
    data: RuntimeSessionCreateManyInput | RuntimeSessionCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * RuntimeSession update
   */
  export type RuntimeSessionUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * The data needed to update a RuntimeSession.
     */
    data: XOR<RuntimeSessionUpdateInput, RuntimeSessionUncheckedUpdateInput>
    /**
     * Choose, which RuntimeSession to update.
     */
    where: RuntimeSessionWhereUniqueInput
  }

  /**
   * RuntimeSession updateMany
   */
  export type RuntimeSessionUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update RuntimeSessions.
     */
    data: XOR<RuntimeSessionUpdateManyMutationInput, RuntimeSessionUncheckedUpdateManyInput>
    /**
     * Filter which RuntimeSessions to update
     */
    where?: RuntimeSessionWhereInput
  }

  /**
   * RuntimeSession upsert
   */
  export type RuntimeSessionUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * The filter to search for the RuntimeSession to update in case it exists.
     */
    where: RuntimeSessionWhereUniqueInput
    /**
     * In case the RuntimeSession found by the `where` argument doesn't exist, create a new RuntimeSession with this data.
     */
    create: XOR<RuntimeSessionCreateInput, RuntimeSessionUncheckedCreateInput>
    /**
     * In case the RuntimeSession was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RuntimeSessionUpdateInput, RuntimeSessionUncheckedUpdateInput>
  }

  /**
   * RuntimeSession delete
   */
  export type RuntimeSessionDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
    /**
     * Filter which RuntimeSession to delete.
     */
    where: RuntimeSessionWhereUniqueInput
  }

  /**
   * RuntimeSession deleteMany
   */
  export type RuntimeSessionDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RuntimeSessions to delete
     */
    where?: RuntimeSessionWhereInput
  }

  /**
   * RuntimeSession.execution
   */
  export type RuntimeSession$executionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Execution
     */
    select?: ExecutionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionInclude<ExtArgs> | null
    where?: ExecutionWhereInput
  }

  /**
   * RuntimeSession without action
   */
  export type RuntimeSessionDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RuntimeSession
     */
    select?: RuntimeSessionSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RuntimeSessionInclude<ExtArgs> | null
  }


  /**
   * Model ExecutionEvent
   */

  export type AggregateExecutionEvent = {
    _count: ExecutionEventCountAggregateOutputType | null
    _min: ExecutionEventMinAggregateOutputType | null
    _max: ExecutionEventMaxAggregateOutputType | null
  }

  export type ExecutionEventMinAggregateOutputType = {
    id: string | null
    executionId: string | null
    runtimeSessionId: string | null
    stepId: string | null
    eventType: string | null
    eventSource: string | null
    createdAt: Date | null
  }

  export type ExecutionEventMaxAggregateOutputType = {
    id: string | null
    executionId: string | null
    runtimeSessionId: string | null
    stepId: string | null
    eventType: string | null
    eventSource: string | null
    createdAt: Date | null
  }

  export type ExecutionEventCountAggregateOutputType = {
    id: number
    executionId: number
    runtimeSessionId: number
    stepId: number
    eventType: number
    eventSource: number
    payloadJson: number
    createdAt: number
    _all: number
  }


  export type ExecutionEventMinAggregateInputType = {
    id?: true
    executionId?: true
    runtimeSessionId?: true
    stepId?: true
    eventType?: true
    eventSource?: true
    createdAt?: true
  }

  export type ExecutionEventMaxAggregateInputType = {
    id?: true
    executionId?: true
    runtimeSessionId?: true
    stepId?: true
    eventType?: true
    eventSource?: true
    createdAt?: true
  }

  export type ExecutionEventCountAggregateInputType = {
    id?: true
    executionId?: true
    runtimeSessionId?: true
    stepId?: true
    eventType?: true
    eventSource?: true
    payloadJson?: true
    createdAt?: true
    _all?: true
  }

  export type ExecutionEventAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ExecutionEvent to aggregate.
     */
    where?: ExecutionEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionEvents to fetch.
     */
    orderBy?: ExecutionEventOrderByWithRelationInput | ExecutionEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ExecutionEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ExecutionEvents
    **/
    _count?: true | ExecutionEventCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ExecutionEventMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ExecutionEventMaxAggregateInputType
  }

  export type GetExecutionEventAggregateType<T extends ExecutionEventAggregateArgs> = {
        [P in keyof T & keyof AggregateExecutionEvent]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateExecutionEvent[P]>
      : GetScalarType<T[P], AggregateExecutionEvent[P]>
  }




  export type ExecutionEventGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ExecutionEventWhereInput
    orderBy?: ExecutionEventOrderByWithAggregationInput | ExecutionEventOrderByWithAggregationInput[]
    by: ExecutionEventScalarFieldEnum[] | ExecutionEventScalarFieldEnum
    having?: ExecutionEventScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ExecutionEventCountAggregateInputType | true
    _min?: ExecutionEventMinAggregateInputType
    _max?: ExecutionEventMaxAggregateInputType
  }

  export type ExecutionEventGroupByOutputType = {
    id: string
    executionId: string
    runtimeSessionId: string | null
    stepId: string | null
    eventType: string
    eventSource: string | null
    payloadJson: JsonValue | null
    createdAt: Date
    _count: ExecutionEventCountAggregateOutputType | null
    _min: ExecutionEventMinAggregateOutputType | null
    _max: ExecutionEventMaxAggregateOutputType | null
  }

  type GetExecutionEventGroupByPayload<T extends ExecutionEventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ExecutionEventGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ExecutionEventGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ExecutionEventGroupByOutputType[P]>
            : GetScalarType<T[P], ExecutionEventGroupByOutputType[P]>
        }
      >
    >


  export type ExecutionEventSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    executionId?: boolean
    runtimeSessionId?: boolean
    stepId?: boolean
    eventType?: boolean
    eventSource?: boolean
    payloadJson?: boolean
    createdAt?: boolean
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["executionEvent"]>

  export type ExecutionEventSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    executionId?: boolean
    runtimeSessionId?: boolean
    stepId?: boolean
    eventType?: boolean
    eventSource?: boolean
    payloadJson?: boolean
    createdAt?: boolean
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["executionEvent"]>

  export type ExecutionEventSelectScalar = {
    id?: boolean
    executionId?: boolean
    runtimeSessionId?: boolean
    stepId?: boolean
    eventType?: boolean
    eventSource?: boolean
    payloadJson?: boolean
    createdAt?: boolean
  }

  export type ExecutionEventInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }
  export type ExecutionEventIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    execution?: boolean | ExecutionDefaultArgs<ExtArgs>
  }

  export type $ExecutionEventPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ExecutionEvent"
    objects: {
      execution: Prisma.$ExecutionPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      executionId: string
      runtimeSessionId: string | null
      stepId: string | null
      eventType: string
      eventSource: string | null
      payloadJson: Prisma.JsonValue | null
      createdAt: Date
    }, ExtArgs["result"]["executionEvent"]>
    composites: {}
  }

  type ExecutionEventGetPayload<S extends boolean | null | undefined | ExecutionEventDefaultArgs> = $Result.GetResult<Prisma.$ExecutionEventPayload, S>

  type ExecutionEventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<ExecutionEventFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: ExecutionEventCountAggregateInputType | true
    }

  export interface ExecutionEventDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ExecutionEvent'], meta: { name: 'ExecutionEvent' } }
    /**
     * Find zero or one ExecutionEvent that matches the filter.
     * @param {ExecutionEventFindUniqueArgs} args - Arguments to find a ExecutionEvent
     * @example
     * // Get one ExecutionEvent
     * const executionEvent = await prisma.executionEvent.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ExecutionEventFindUniqueArgs>(args: SelectSubset<T, ExecutionEventFindUniqueArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one ExecutionEvent that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {ExecutionEventFindUniqueOrThrowArgs} args - Arguments to find a ExecutionEvent
     * @example
     * // Get one ExecutionEvent
     * const executionEvent = await prisma.executionEvent.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ExecutionEventFindUniqueOrThrowArgs>(args: SelectSubset<T, ExecutionEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first ExecutionEvent that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventFindFirstArgs} args - Arguments to find a ExecutionEvent
     * @example
     * // Get one ExecutionEvent
     * const executionEvent = await prisma.executionEvent.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ExecutionEventFindFirstArgs>(args?: SelectSubset<T, ExecutionEventFindFirstArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first ExecutionEvent that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventFindFirstOrThrowArgs} args - Arguments to find a ExecutionEvent
     * @example
     * // Get one ExecutionEvent
     * const executionEvent = await prisma.executionEvent.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ExecutionEventFindFirstOrThrowArgs>(args?: SelectSubset<T, ExecutionEventFindFirstOrThrowArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more ExecutionEvents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ExecutionEvents
     * const executionEvents = await prisma.executionEvent.findMany()
     * 
     * // Get first 10 ExecutionEvents
     * const executionEvents = await prisma.executionEvent.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const executionEventWithIdOnly = await prisma.executionEvent.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ExecutionEventFindManyArgs>(args?: SelectSubset<T, ExecutionEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a ExecutionEvent.
     * @param {ExecutionEventCreateArgs} args - Arguments to create a ExecutionEvent.
     * @example
     * // Create one ExecutionEvent
     * const ExecutionEvent = await prisma.executionEvent.create({
     *   data: {
     *     // ... data to create a ExecutionEvent
     *   }
     * })
     * 
     */
    create<T extends ExecutionEventCreateArgs>(args: SelectSubset<T, ExecutionEventCreateArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many ExecutionEvents.
     * @param {ExecutionEventCreateManyArgs} args - Arguments to create many ExecutionEvents.
     * @example
     * // Create many ExecutionEvents
     * const executionEvent = await prisma.executionEvent.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ExecutionEventCreateManyArgs>(args?: SelectSubset<T, ExecutionEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ExecutionEvents and returns the data saved in the database.
     * @param {ExecutionEventCreateManyAndReturnArgs} args - Arguments to create many ExecutionEvents.
     * @example
     * // Create many ExecutionEvents
     * const executionEvent = await prisma.executionEvent.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ExecutionEvents and only return the `id`
     * const executionEventWithIdOnly = await prisma.executionEvent.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ExecutionEventCreateManyAndReturnArgs>(args?: SelectSubset<T, ExecutionEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a ExecutionEvent.
     * @param {ExecutionEventDeleteArgs} args - Arguments to delete one ExecutionEvent.
     * @example
     * // Delete one ExecutionEvent
     * const ExecutionEvent = await prisma.executionEvent.delete({
     *   where: {
     *     // ... filter to delete one ExecutionEvent
     *   }
     * })
     * 
     */
    delete<T extends ExecutionEventDeleteArgs>(args: SelectSubset<T, ExecutionEventDeleteArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one ExecutionEvent.
     * @param {ExecutionEventUpdateArgs} args - Arguments to update one ExecutionEvent.
     * @example
     * // Update one ExecutionEvent
     * const executionEvent = await prisma.executionEvent.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ExecutionEventUpdateArgs>(args: SelectSubset<T, ExecutionEventUpdateArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more ExecutionEvents.
     * @param {ExecutionEventDeleteManyArgs} args - Arguments to filter ExecutionEvents to delete.
     * @example
     * // Delete a few ExecutionEvents
     * const { count } = await prisma.executionEvent.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ExecutionEventDeleteManyArgs>(args?: SelectSubset<T, ExecutionEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ExecutionEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ExecutionEvents
     * const executionEvent = await prisma.executionEvent.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ExecutionEventUpdateManyArgs>(args: SelectSubset<T, ExecutionEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one ExecutionEvent.
     * @param {ExecutionEventUpsertArgs} args - Arguments to update or create a ExecutionEvent.
     * @example
     * // Update or create a ExecutionEvent
     * const executionEvent = await prisma.executionEvent.upsert({
     *   create: {
     *     // ... data to create a ExecutionEvent
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ExecutionEvent we want to update
     *   }
     * })
     */
    upsert<T extends ExecutionEventUpsertArgs>(args: SelectSubset<T, ExecutionEventUpsertArgs<ExtArgs>>): Prisma__ExecutionEventClient<$Result.GetResult<Prisma.$ExecutionEventPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of ExecutionEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventCountArgs} args - Arguments to filter ExecutionEvents to count.
     * @example
     * // Count the number of ExecutionEvents
     * const count = await prisma.executionEvent.count({
     *   where: {
     *     // ... the filter for the ExecutionEvents we want to count
     *   }
     * })
    **/
    count<T extends ExecutionEventCountArgs>(
      args?: Subset<T, ExecutionEventCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ExecutionEventCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ExecutionEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends ExecutionEventAggregateArgs>(args: Subset<T, ExecutionEventAggregateArgs>): Prisma.PrismaPromise<GetExecutionEventAggregateType<T>>

    /**
     * Group by ExecutionEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ExecutionEventGroupByArgs} args - Group by arguments.
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
      T extends ExecutionEventGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ExecutionEventGroupByArgs['orderBy'] }
        : { orderBy?: ExecutionEventGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, ExecutionEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetExecutionEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ExecutionEvent model
   */
  readonly fields: ExecutionEventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ExecutionEvent.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ExecutionEventClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    execution<T extends ExecutionDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ExecutionDefaultArgs<ExtArgs>>): Prisma__ExecutionClient<$Result.GetResult<Prisma.$ExecutionPayload<ExtArgs>, T, "findUniqueOrThrow"> | Null, Null, ExtArgs>
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
   * Fields of the ExecutionEvent model
   */ 
  interface ExecutionEventFieldRefs {
    readonly id: FieldRef<"ExecutionEvent", 'String'>
    readonly executionId: FieldRef<"ExecutionEvent", 'String'>
    readonly runtimeSessionId: FieldRef<"ExecutionEvent", 'String'>
    readonly stepId: FieldRef<"ExecutionEvent", 'String'>
    readonly eventType: FieldRef<"ExecutionEvent", 'String'>
    readonly eventSource: FieldRef<"ExecutionEvent", 'String'>
    readonly payloadJson: FieldRef<"ExecutionEvent", 'Json'>
    readonly createdAt: FieldRef<"ExecutionEvent", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ExecutionEvent findUnique
   */
  export type ExecutionEventFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionEvent to fetch.
     */
    where: ExecutionEventWhereUniqueInput
  }

  /**
   * ExecutionEvent findUniqueOrThrow
   */
  export type ExecutionEventFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionEvent to fetch.
     */
    where: ExecutionEventWhereUniqueInput
  }

  /**
   * ExecutionEvent findFirst
   */
  export type ExecutionEventFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionEvent to fetch.
     */
    where?: ExecutionEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionEvents to fetch.
     */
    orderBy?: ExecutionEventOrderByWithRelationInput | ExecutionEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ExecutionEvents.
     */
    cursor?: ExecutionEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ExecutionEvents.
     */
    distinct?: ExecutionEventScalarFieldEnum | ExecutionEventScalarFieldEnum[]
  }

  /**
   * ExecutionEvent findFirstOrThrow
   */
  export type ExecutionEventFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionEvent to fetch.
     */
    where?: ExecutionEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionEvents to fetch.
     */
    orderBy?: ExecutionEventOrderByWithRelationInput | ExecutionEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ExecutionEvents.
     */
    cursor?: ExecutionEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionEvents.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ExecutionEvents.
     */
    distinct?: ExecutionEventScalarFieldEnum | ExecutionEventScalarFieldEnum[]
  }

  /**
   * ExecutionEvent findMany
   */
  export type ExecutionEventFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * Filter, which ExecutionEvents to fetch.
     */
    where?: ExecutionEventWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ExecutionEvents to fetch.
     */
    orderBy?: ExecutionEventOrderByWithRelationInput | ExecutionEventOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ExecutionEvents.
     */
    cursor?: ExecutionEventWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ExecutionEvents from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ExecutionEvents.
     */
    skip?: number
    distinct?: ExecutionEventScalarFieldEnum | ExecutionEventScalarFieldEnum[]
  }

  /**
   * ExecutionEvent create
   */
  export type ExecutionEventCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * The data needed to create a ExecutionEvent.
     */
    data: XOR<ExecutionEventCreateInput, ExecutionEventUncheckedCreateInput>
  }

  /**
   * ExecutionEvent createMany
   */
  export type ExecutionEventCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ExecutionEvents.
     */
    data: ExecutionEventCreateManyInput | ExecutionEventCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ExecutionEvent createManyAndReturn
   */
  export type ExecutionEventCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many ExecutionEvents.
     */
    data: ExecutionEventCreateManyInput | ExecutionEventCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ExecutionEvent update
   */
  export type ExecutionEventUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * The data needed to update a ExecutionEvent.
     */
    data: XOR<ExecutionEventUpdateInput, ExecutionEventUncheckedUpdateInput>
    /**
     * Choose, which ExecutionEvent to update.
     */
    where: ExecutionEventWhereUniqueInput
  }

  /**
   * ExecutionEvent updateMany
   */
  export type ExecutionEventUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ExecutionEvents.
     */
    data: XOR<ExecutionEventUpdateManyMutationInput, ExecutionEventUncheckedUpdateManyInput>
    /**
     * Filter which ExecutionEvents to update
     */
    where?: ExecutionEventWhereInput
  }

  /**
   * ExecutionEvent upsert
   */
  export type ExecutionEventUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * The filter to search for the ExecutionEvent to update in case it exists.
     */
    where: ExecutionEventWhereUniqueInput
    /**
     * In case the ExecutionEvent found by the `where` argument doesn't exist, create a new ExecutionEvent with this data.
     */
    create: XOR<ExecutionEventCreateInput, ExecutionEventUncheckedCreateInput>
    /**
     * In case the ExecutionEvent was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ExecutionEventUpdateInput, ExecutionEventUncheckedUpdateInput>
  }

  /**
   * ExecutionEvent delete
   */
  export type ExecutionEventDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
    /**
     * Filter which ExecutionEvent to delete.
     */
    where: ExecutionEventWhereUniqueInput
  }

  /**
   * ExecutionEvent deleteMany
   */
  export type ExecutionEventDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ExecutionEvents to delete
     */
    where?: ExecutionEventWhereInput
  }

  /**
   * ExecutionEvent without action
   */
  export type ExecutionEventDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ExecutionEvent
     */
    select?: ExecutionEventSelect<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ExecutionEventInclude<ExtArgs> | null
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


  export const ExecutionScalarFieldEnum: {
    id: 'id',
    orgId: 'orgId',
    createdBy: 'createdBy',
    skillId: 'skillId',
    skillVersion: 'skillVersion',
    status: 'status',
    runtimeType: 'runtimeType',
    riskLevel: 'riskLevel',
    inputJson: 'inputJson',
    normalizedInputJson: 'normalizedInputJson',
    resultJson: 'resultJson',
    failureReason: 'failureReason',
    failureCode: 'failureCode',
    currentStepId: 'currentStepId',
    requiresApproval: 'requiresApproval',
    approvalStatus: 'approvalStatus',
    takeoverRequired: 'takeoverRequired',
    takeoverReason: 'takeoverReason',
    startedAt: 'startedAt',
    endedAt: 'endedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ExecutionScalarFieldEnum = (typeof ExecutionScalarFieldEnum)[keyof typeof ExecutionScalarFieldEnum]


  export const ExecutionStepScalarFieldEnum: {
    id: 'id',
    executionId: 'executionId',
    stepIndex: 'stepIndex',
    name: 'name',
    type: 'type',
    status: 'status',
    action: 'action',
    targetJson: 'targetJson',
    inputJson: 'inputJson',
    outputJson: 'outputJson',
    assertionJson: 'assertionJson',
    errorMessage: 'errorMessage',
    errorCode: 'errorCode',
    retryCount: 'retryCount',
    snapshotId: 'snapshotId',
    takeoverTriggered: 'takeoverTriggered',
    startedAt: 'startedAt',
    endedAt: 'endedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ExecutionStepScalarFieldEnum = (typeof ExecutionStepScalarFieldEnum)[keyof typeof ExecutionStepScalarFieldEnum]


  export const RuntimeSessionScalarFieldEnum: {
    id: 'id',
    executionId: 'executionId',
    runtimeType: 'runtimeType',
    workerId: 'workerId',
    profileId: 'profileId',
    state: 'state',
    controlMode: 'controlMode',
    connectionInfoJson: 'connectionInfoJson',
    freezeReason: 'freezeReason',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    closedAt: 'closedAt'
  };

  export type RuntimeSessionScalarFieldEnum = (typeof RuntimeSessionScalarFieldEnum)[keyof typeof RuntimeSessionScalarFieldEnum]


  export const ExecutionEventScalarFieldEnum: {
    id: 'id',
    executionId: 'executionId',
    runtimeSessionId: 'runtimeSessionId',
    stepId: 'stepId',
    eventType: 'eventType',
    eventSource: 'eventSource',
    payloadJson: 'payloadJson',
    createdAt: 'createdAt'
  };

  export type ExecutionEventScalarFieldEnum = (typeof ExecutionEventScalarFieldEnum)[keyof typeof ExecutionEventScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


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
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


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


  export type ExecutionWhereInput = {
    AND?: ExecutionWhereInput | ExecutionWhereInput[]
    OR?: ExecutionWhereInput[]
    NOT?: ExecutionWhereInput | ExecutionWhereInput[]
    id?: UuidFilter<"Execution"> | string
    orgId?: UuidNullableFilter<"Execution"> | string | null
    createdBy?: UuidFilter<"Execution"> | string
    skillId?: UuidFilter<"Execution"> | string
    skillVersion?: StringNullableFilter<"Execution"> | string | null
    status?: StringFilter<"Execution"> | string
    runtimeType?: StringFilter<"Execution"> | string
    riskLevel?: StringFilter<"Execution"> | string
    inputJson?: JsonNullableFilter<"Execution">
    normalizedInputJson?: JsonNullableFilter<"Execution">
    resultJson?: JsonNullableFilter<"Execution">
    failureReason?: StringNullableFilter<"Execution"> | string | null
    failureCode?: StringNullableFilter<"Execution"> | string | null
    currentStepId?: UuidNullableFilter<"Execution"> | string | null
    requiresApproval?: BoolFilter<"Execution"> | boolean
    approvalStatus?: StringNullableFilter<"Execution"> | string | null
    takeoverRequired?: BoolFilter<"Execution"> | boolean
    takeoverReason?: StringNullableFilter<"Execution"> | string | null
    startedAt?: DateTimeNullableFilter<"Execution"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"Execution"> | Date | string | null
    createdAt?: DateTimeFilter<"Execution"> | Date | string
    updatedAt?: DateTimeFilter<"Execution"> | Date | string
    steps?: ExecutionStepListRelationFilter
    runtimeSessions?: RuntimeSessionListRelationFilter
    events?: ExecutionEventListRelationFilter
  }

  export type ExecutionOrderByWithRelationInput = {
    id?: SortOrder
    orgId?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    skillId?: SortOrder
    skillVersion?: SortOrderInput | SortOrder
    status?: SortOrder
    runtimeType?: SortOrder
    riskLevel?: SortOrder
    inputJson?: SortOrderInput | SortOrder
    normalizedInputJson?: SortOrderInput | SortOrder
    resultJson?: SortOrderInput | SortOrder
    failureReason?: SortOrderInput | SortOrder
    failureCode?: SortOrderInput | SortOrder
    currentStepId?: SortOrderInput | SortOrder
    requiresApproval?: SortOrder
    approvalStatus?: SortOrderInput | SortOrder
    takeoverRequired?: SortOrder
    takeoverReason?: SortOrderInput | SortOrder
    startedAt?: SortOrderInput | SortOrder
    endedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    steps?: ExecutionStepOrderByRelationAggregateInput
    runtimeSessions?: RuntimeSessionOrderByRelationAggregateInput
    events?: ExecutionEventOrderByRelationAggregateInput
  }

  export type ExecutionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ExecutionWhereInput | ExecutionWhereInput[]
    OR?: ExecutionWhereInput[]
    NOT?: ExecutionWhereInput | ExecutionWhereInput[]
    orgId?: UuidNullableFilter<"Execution"> | string | null
    createdBy?: UuidFilter<"Execution"> | string
    skillId?: UuidFilter<"Execution"> | string
    skillVersion?: StringNullableFilter<"Execution"> | string | null
    status?: StringFilter<"Execution"> | string
    runtimeType?: StringFilter<"Execution"> | string
    riskLevel?: StringFilter<"Execution"> | string
    inputJson?: JsonNullableFilter<"Execution">
    normalizedInputJson?: JsonNullableFilter<"Execution">
    resultJson?: JsonNullableFilter<"Execution">
    failureReason?: StringNullableFilter<"Execution"> | string | null
    failureCode?: StringNullableFilter<"Execution"> | string | null
    currentStepId?: UuidNullableFilter<"Execution"> | string | null
    requiresApproval?: BoolFilter<"Execution"> | boolean
    approvalStatus?: StringNullableFilter<"Execution"> | string | null
    takeoverRequired?: BoolFilter<"Execution"> | boolean
    takeoverReason?: StringNullableFilter<"Execution"> | string | null
    startedAt?: DateTimeNullableFilter<"Execution"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"Execution"> | Date | string | null
    createdAt?: DateTimeFilter<"Execution"> | Date | string
    updatedAt?: DateTimeFilter<"Execution"> | Date | string
    steps?: ExecutionStepListRelationFilter
    runtimeSessions?: RuntimeSessionListRelationFilter
    events?: ExecutionEventListRelationFilter
  }, "id">

  export type ExecutionOrderByWithAggregationInput = {
    id?: SortOrder
    orgId?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    skillId?: SortOrder
    skillVersion?: SortOrderInput | SortOrder
    status?: SortOrder
    runtimeType?: SortOrder
    riskLevel?: SortOrder
    inputJson?: SortOrderInput | SortOrder
    normalizedInputJson?: SortOrderInput | SortOrder
    resultJson?: SortOrderInput | SortOrder
    failureReason?: SortOrderInput | SortOrder
    failureCode?: SortOrderInput | SortOrder
    currentStepId?: SortOrderInput | SortOrder
    requiresApproval?: SortOrder
    approvalStatus?: SortOrderInput | SortOrder
    takeoverRequired?: SortOrder
    takeoverReason?: SortOrderInput | SortOrder
    startedAt?: SortOrderInput | SortOrder
    endedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ExecutionCountOrderByAggregateInput
    _max?: ExecutionMaxOrderByAggregateInput
    _min?: ExecutionMinOrderByAggregateInput
  }

  export type ExecutionScalarWhereWithAggregatesInput = {
    AND?: ExecutionScalarWhereWithAggregatesInput | ExecutionScalarWhereWithAggregatesInput[]
    OR?: ExecutionScalarWhereWithAggregatesInput[]
    NOT?: ExecutionScalarWhereWithAggregatesInput | ExecutionScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Execution"> | string
    orgId?: UuidNullableWithAggregatesFilter<"Execution"> | string | null
    createdBy?: UuidWithAggregatesFilter<"Execution"> | string
    skillId?: UuidWithAggregatesFilter<"Execution"> | string
    skillVersion?: StringNullableWithAggregatesFilter<"Execution"> | string | null
    status?: StringWithAggregatesFilter<"Execution"> | string
    runtimeType?: StringWithAggregatesFilter<"Execution"> | string
    riskLevel?: StringWithAggregatesFilter<"Execution"> | string
    inputJson?: JsonNullableWithAggregatesFilter<"Execution">
    normalizedInputJson?: JsonNullableWithAggregatesFilter<"Execution">
    resultJson?: JsonNullableWithAggregatesFilter<"Execution">
    failureReason?: StringNullableWithAggregatesFilter<"Execution"> | string | null
    failureCode?: StringNullableWithAggregatesFilter<"Execution"> | string | null
    currentStepId?: UuidNullableWithAggregatesFilter<"Execution"> | string | null
    requiresApproval?: BoolWithAggregatesFilter<"Execution"> | boolean
    approvalStatus?: StringNullableWithAggregatesFilter<"Execution"> | string | null
    takeoverRequired?: BoolWithAggregatesFilter<"Execution"> | boolean
    takeoverReason?: StringNullableWithAggregatesFilter<"Execution"> | string | null
    startedAt?: DateTimeNullableWithAggregatesFilter<"Execution"> | Date | string | null
    endedAt?: DateTimeNullableWithAggregatesFilter<"Execution"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Execution"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Execution"> | Date | string
  }

  export type ExecutionStepWhereInput = {
    AND?: ExecutionStepWhereInput | ExecutionStepWhereInput[]
    OR?: ExecutionStepWhereInput[]
    NOT?: ExecutionStepWhereInput | ExecutionStepWhereInput[]
    id?: UuidFilter<"ExecutionStep"> | string
    executionId?: UuidFilter<"ExecutionStep"> | string
    stepIndex?: IntFilter<"ExecutionStep"> | number
    name?: StringNullableFilter<"ExecutionStep"> | string | null
    type?: StringFilter<"ExecutionStep"> | string
    status?: StringFilter<"ExecutionStep"> | string
    action?: StringNullableFilter<"ExecutionStep"> | string | null
    targetJson?: JsonNullableFilter<"ExecutionStep">
    inputJson?: JsonNullableFilter<"ExecutionStep">
    outputJson?: JsonNullableFilter<"ExecutionStep">
    assertionJson?: JsonNullableFilter<"ExecutionStep">
    errorMessage?: StringNullableFilter<"ExecutionStep"> | string | null
    errorCode?: StringNullableFilter<"ExecutionStep"> | string | null
    retryCount?: IntFilter<"ExecutionStep"> | number
    snapshotId?: StringNullableFilter<"ExecutionStep"> | string | null
    takeoverTriggered?: BoolFilter<"ExecutionStep"> | boolean
    startedAt?: DateTimeNullableFilter<"ExecutionStep"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"ExecutionStep"> | Date | string | null
    createdAt?: DateTimeFilter<"ExecutionStep"> | Date | string
    updatedAt?: DateTimeFilter<"ExecutionStep"> | Date | string
    execution?: XOR<ExecutionRelationFilter, ExecutionWhereInput>
  }

  export type ExecutionStepOrderByWithRelationInput = {
    id?: SortOrder
    executionId?: SortOrder
    stepIndex?: SortOrder
    name?: SortOrderInput | SortOrder
    type?: SortOrder
    status?: SortOrder
    action?: SortOrderInput | SortOrder
    targetJson?: SortOrderInput | SortOrder
    inputJson?: SortOrderInput | SortOrder
    outputJson?: SortOrderInput | SortOrder
    assertionJson?: SortOrderInput | SortOrder
    errorMessage?: SortOrderInput | SortOrder
    errorCode?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    snapshotId?: SortOrderInput | SortOrder
    takeoverTriggered?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    endedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    execution?: ExecutionOrderByWithRelationInput
  }

  export type ExecutionStepWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    executionId_stepIndex?: ExecutionStepExecutionIdStepIndexCompoundUniqueInput
    AND?: ExecutionStepWhereInput | ExecutionStepWhereInput[]
    OR?: ExecutionStepWhereInput[]
    NOT?: ExecutionStepWhereInput | ExecutionStepWhereInput[]
    executionId?: UuidFilter<"ExecutionStep"> | string
    stepIndex?: IntFilter<"ExecutionStep"> | number
    name?: StringNullableFilter<"ExecutionStep"> | string | null
    type?: StringFilter<"ExecutionStep"> | string
    status?: StringFilter<"ExecutionStep"> | string
    action?: StringNullableFilter<"ExecutionStep"> | string | null
    targetJson?: JsonNullableFilter<"ExecutionStep">
    inputJson?: JsonNullableFilter<"ExecutionStep">
    outputJson?: JsonNullableFilter<"ExecutionStep">
    assertionJson?: JsonNullableFilter<"ExecutionStep">
    errorMessage?: StringNullableFilter<"ExecutionStep"> | string | null
    errorCode?: StringNullableFilter<"ExecutionStep"> | string | null
    retryCount?: IntFilter<"ExecutionStep"> | number
    snapshotId?: StringNullableFilter<"ExecutionStep"> | string | null
    takeoverTriggered?: BoolFilter<"ExecutionStep"> | boolean
    startedAt?: DateTimeNullableFilter<"ExecutionStep"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"ExecutionStep"> | Date | string | null
    createdAt?: DateTimeFilter<"ExecutionStep"> | Date | string
    updatedAt?: DateTimeFilter<"ExecutionStep"> | Date | string
    execution?: XOR<ExecutionRelationFilter, ExecutionWhereInput>
  }, "id" | "executionId_stepIndex">

  export type ExecutionStepOrderByWithAggregationInput = {
    id?: SortOrder
    executionId?: SortOrder
    stepIndex?: SortOrder
    name?: SortOrderInput | SortOrder
    type?: SortOrder
    status?: SortOrder
    action?: SortOrderInput | SortOrder
    targetJson?: SortOrderInput | SortOrder
    inputJson?: SortOrderInput | SortOrder
    outputJson?: SortOrderInput | SortOrder
    assertionJson?: SortOrderInput | SortOrder
    errorMessage?: SortOrderInput | SortOrder
    errorCode?: SortOrderInput | SortOrder
    retryCount?: SortOrder
    snapshotId?: SortOrderInput | SortOrder
    takeoverTriggered?: SortOrder
    startedAt?: SortOrderInput | SortOrder
    endedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ExecutionStepCountOrderByAggregateInput
    _avg?: ExecutionStepAvgOrderByAggregateInput
    _max?: ExecutionStepMaxOrderByAggregateInput
    _min?: ExecutionStepMinOrderByAggregateInput
    _sum?: ExecutionStepSumOrderByAggregateInput
  }

  export type ExecutionStepScalarWhereWithAggregatesInput = {
    AND?: ExecutionStepScalarWhereWithAggregatesInput | ExecutionStepScalarWhereWithAggregatesInput[]
    OR?: ExecutionStepScalarWhereWithAggregatesInput[]
    NOT?: ExecutionStepScalarWhereWithAggregatesInput | ExecutionStepScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"ExecutionStep"> | string
    executionId?: UuidWithAggregatesFilter<"ExecutionStep"> | string
    stepIndex?: IntWithAggregatesFilter<"ExecutionStep"> | number
    name?: StringNullableWithAggregatesFilter<"ExecutionStep"> | string | null
    type?: StringWithAggregatesFilter<"ExecutionStep"> | string
    status?: StringWithAggregatesFilter<"ExecutionStep"> | string
    action?: StringNullableWithAggregatesFilter<"ExecutionStep"> | string | null
    targetJson?: JsonNullableWithAggregatesFilter<"ExecutionStep">
    inputJson?: JsonNullableWithAggregatesFilter<"ExecutionStep">
    outputJson?: JsonNullableWithAggregatesFilter<"ExecutionStep">
    assertionJson?: JsonNullableWithAggregatesFilter<"ExecutionStep">
    errorMessage?: StringNullableWithAggregatesFilter<"ExecutionStep"> | string | null
    errorCode?: StringNullableWithAggregatesFilter<"ExecutionStep"> | string | null
    retryCount?: IntWithAggregatesFilter<"ExecutionStep"> | number
    snapshotId?: StringNullableWithAggregatesFilter<"ExecutionStep"> | string | null
    takeoverTriggered?: BoolWithAggregatesFilter<"ExecutionStep"> | boolean
    startedAt?: DateTimeNullableWithAggregatesFilter<"ExecutionStep"> | Date | string | null
    endedAt?: DateTimeNullableWithAggregatesFilter<"ExecutionStep"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"ExecutionStep"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"ExecutionStep"> | Date | string
  }

  export type RuntimeSessionWhereInput = {
    AND?: RuntimeSessionWhereInput | RuntimeSessionWhereInput[]
    OR?: RuntimeSessionWhereInput[]
    NOT?: RuntimeSessionWhereInput | RuntimeSessionWhereInput[]
    id?: UuidFilter<"RuntimeSession"> | string
    executionId?: UuidNullableFilter<"RuntimeSession"> | string | null
    runtimeType?: StringFilter<"RuntimeSession"> | string
    workerId?: StringNullableFilter<"RuntimeSession"> | string | null
    profileId?: StringNullableFilter<"RuntimeSession"> | string | null
    state?: StringFilter<"RuntimeSession"> | string
    controlMode?: StringFilter<"RuntimeSession"> | string
    connectionInfoJson?: JsonNullableFilter<"RuntimeSession">
    freezeReason?: StringNullableFilter<"RuntimeSession"> | string | null
    createdAt?: DateTimeFilter<"RuntimeSession"> | Date | string
    updatedAt?: DateTimeFilter<"RuntimeSession"> | Date | string
    closedAt?: DateTimeNullableFilter<"RuntimeSession"> | Date | string | null
    execution?: XOR<ExecutionNullableRelationFilter, ExecutionWhereInput> | null
  }

  export type RuntimeSessionOrderByWithRelationInput = {
    id?: SortOrder
    executionId?: SortOrderInput | SortOrder
    runtimeType?: SortOrder
    workerId?: SortOrderInput | SortOrder
    profileId?: SortOrderInput | SortOrder
    state?: SortOrder
    controlMode?: SortOrder
    connectionInfoJson?: SortOrderInput | SortOrder
    freezeReason?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    closedAt?: SortOrderInput | SortOrder
    execution?: ExecutionOrderByWithRelationInput
  }

  export type RuntimeSessionWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: RuntimeSessionWhereInput | RuntimeSessionWhereInput[]
    OR?: RuntimeSessionWhereInput[]
    NOT?: RuntimeSessionWhereInput | RuntimeSessionWhereInput[]
    executionId?: UuidNullableFilter<"RuntimeSession"> | string | null
    runtimeType?: StringFilter<"RuntimeSession"> | string
    workerId?: StringNullableFilter<"RuntimeSession"> | string | null
    profileId?: StringNullableFilter<"RuntimeSession"> | string | null
    state?: StringFilter<"RuntimeSession"> | string
    controlMode?: StringFilter<"RuntimeSession"> | string
    connectionInfoJson?: JsonNullableFilter<"RuntimeSession">
    freezeReason?: StringNullableFilter<"RuntimeSession"> | string | null
    createdAt?: DateTimeFilter<"RuntimeSession"> | Date | string
    updatedAt?: DateTimeFilter<"RuntimeSession"> | Date | string
    closedAt?: DateTimeNullableFilter<"RuntimeSession"> | Date | string | null
    execution?: XOR<ExecutionNullableRelationFilter, ExecutionWhereInput> | null
  }, "id">

  export type RuntimeSessionOrderByWithAggregationInput = {
    id?: SortOrder
    executionId?: SortOrderInput | SortOrder
    runtimeType?: SortOrder
    workerId?: SortOrderInput | SortOrder
    profileId?: SortOrderInput | SortOrder
    state?: SortOrder
    controlMode?: SortOrder
    connectionInfoJson?: SortOrderInput | SortOrder
    freezeReason?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    closedAt?: SortOrderInput | SortOrder
    _count?: RuntimeSessionCountOrderByAggregateInput
    _max?: RuntimeSessionMaxOrderByAggregateInput
    _min?: RuntimeSessionMinOrderByAggregateInput
  }

  export type RuntimeSessionScalarWhereWithAggregatesInput = {
    AND?: RuntimeSessionScalarWhereWithAggregatesInput | RuntimeSessionScalarWhereWithAggregatesInput[]
    OR?: RuntimeSessionScalarWhereWithAggregatesInput[]
    NOT?: RuntimeSessionScalarWhereWithAggregatesInput | RuntimeSessionScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"RuntimeSession"> | string
    executionId?: UuidNullableWithAggregatesFilter<"RuntimeSession"> | string | null
    runtimeType?: StringWithAggregatesFilter<"RuntimeSession"> | string
    workerId?: StringNullableWithAggregatesFilter<"RuntimeSession"> | string | null
    profileId?: StringNullableWithAggregatesFilter<"RuntimeSession"> | string | null
    state?: StringWithAggregatesFilter<"RuntimeSession"> | string
    controlMode?: StringWithAggregatesFilter<"RuntimeSession"> | string
    connectionInfoJson?: JsonNullableWithAggregatesFilter<"RuntimeSession">
    freezeReason?: StringNullableWithAggregatesFilter<"RuntimeSession"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"RuntimeSession"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"RuntimeSession"> | Date | string
    closedAt?: DateTimeNullableWithAggregatesFilter<"RuntimeSession"> | Date | string | null
  }

  export type ExecutionEventWhereInput = {
    AND?: ExecutionEventWhereInput | ExecutionEventWhereInput[]
    OR?: ExecutionEventWhereInput[]
    NOT?: ExecutionEventWhereInput | ExecutionEventWhereInput[]
    id?: UuidFilter<"ExecutionEvent"> | string
    executionId?: UuidFilter<"ExecutionEvent"> | string
    runtimeSessionId?: UuidNullableFilter<"ExecutionEvent"> | string | null
    stepId?: UuidNullableFilter<"ExecutionEvent"> | string | null
    eventType?: StringFilter<"ExecutionEvent"> | string
    eventSource?: StringNullableFilter<"ExecutionEvent"> | string | null
    payloadJson?: JsonNullableFilter<"ExecutionEvent">
    createdAt?: DateTimeFilter<"ExecutionEvent"> | Date | string
    execution?: XOR<ExecutionRelationFilter, ExecutionWhereInput>
  }

  export type ExecutionEventOrderByWithRelationInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeSessionId?: SortOrderInput | SortOrder
    stepId?: SortOrderInput | SortOrder
    eventType?: SortOrder
    eventSource?: SortOrderInput | SortOrder
    payloadJson?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    execution?: ExecutionOrderByWithRelationInput
  }

  export type ExecutionEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ExecutionEventWhereInput | ExecutionEventWhereInput[]
    OR?: ExecutionEventWhereInput[]
    NOT?: ExecutionEventWhereInput | ExecutionEventWhereInput[]
    executionId?: UuidFilter<"ExecutionEvent"> | string
    runtimeSessionId?: UuidNullableFilter<"ExecutionEvent"> | string | null
    stepId?: UuidNullableFilter<"ExecutionEvent"> | string | null
    eventType?: StringFilter<"ExecutionEvent"> | string
    eventSource?: StringNullableFilter<"ExecutionEvent"> | string | null
    payloadJson?: JsonNullableFilter<"ExecutionEvent">
    createdAt?: DateTimeFilter<"ExecutionEvent"> | Date | string
    execution?: XOR<ExecutionRelationFilter, ExecutionWhereInput>
  }, "id">

  export type ExecutionEventOrderByWithAggregationInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeSessionId?: SortOrderInput | SortOrder
    stepId?: SortOrderInput | SortOrder
    eventType?: SortOrder
    eventSource?: SortOrderInput | SortOrder
    payloadJson?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: ExecutionEventCountOrderByAggregateInput
    _max?: ExecutionEventMaxOrderByAggregateInput
    _min?: ExecutionEventMinOrderByAggregateInput
  }

  export type ExecutionEventScalarWhereWithAggregatesInput = {
    AND?: ExecutionEventScalarWhereWithAggregatesInput | ExecutionEventScalarWhereWithAggregatesInput[]
    OR?: ExecutionEventScalarWhereWithAggregatesInput[]
    NOT?: ExecutionEventScalarWhereWithAggregatesInput | ExecutionEventScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"ExecutionEvent"> | string
    executionId?: UuidWithAggregatesFilter<"ExecutionEvent"> | string
    runtimeSessionId?: UuidNullableWithAggregatesFilter<"ExecutionEvent"> | string | null
    stepId?: UuidNullableWithAggregatesFilter<"ExecutionEvent"> | string | null
    eventType?: StringWithAggregatesFilter<"ExecutionEvent"> | string
    eventSource?: StringNullableWithAggregatesFilter<"ExecutionEvent"> | string | null
    payloadJson?: JsonNullableWithAggregatesFilter<"ExecutionEvent">
    createdAt?: DateTimeWithAggregatesFilter<"ExecutionEvent"> | Date | string
  }

  export type ExecutionCreateInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    steps?: ExecutionStepCreateNestedManyWithoutExecutionInput
    runtimeSessions?: RuntimeSessionCreateNestedManyWithoutExecutionInput
    events?: ExecutionEventCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionUncheckedCreateInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    steps?: ExecutionStepUncheckedCreateNestedManyWithoutExecutionInput
    runtimeSessions?: RuntimeSessionUncheckedCreateNestedManyWithoutExecutionInput
    events?: ExecutionEventUncheckedCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    steps?: ExecutionStepUpdateManyWithoutExecutionNestedInput
    runtimeSessions?: RuntimeSessionUpdateManyWithoutExecutionNestedInput
    events?: ExecutionEventUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    steps?: ExecutionStepUncheckedUpdateManyWithoutExecutionNestedInput
    runtimeSessions?: RuntimeSessionUncheckedUpdateManyWithoutExecutionNestedInput
    events?: ExecutionEventUncheckedUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionCreateManyInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ExecutionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionStepCreateInput = {
    id?: string
    stepIndex: number
    name?: string | null
    type: string
    status: string
    action?: string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: string | null
    errorCode?: string | null
    retryCount?: number
    snapshotId?: string | null
    takeoverTriggered?: boolean
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    execution: ExecutionCreateNestedOneWithoutStepsInput
  }

  export type ExecutionStepUncheckedCreateInput = {
    id?: string
    executionId: string
    stepIndex: number
    name?: string | null
    type: string
    status: string
    action?: string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: string | null
    errorCode?: string | null
    retryCount?: number
    snapshotId?: string | null
    takeoverTriggered?: boolean
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ExecutionStepUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    execution?: ExecutionUpdateOneRequiredWithoutStepsNestedInput
  }

  export type ExecutionStepUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    executionId?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionStepCreateManyInput = {
    id?: string
    executionId: string
    stepIndex: number
    name?: string | null
    type: string
    status: string
    action?: string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: string | null
    errorCode?: string | null
    retryCount?: number
    snapshotId?: string | null
    takeoverTriggered?: boolean
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ExecutionStepUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionStepUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    executionId?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RuntimeSessionCreateInput = {
    id?: string
    runtimeType?: string
    workerId?: string | null
    profileId?: string | null
    state: string
    controlMode?: string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    closedAt?: Date | string | null
    execution?: ExecutionCreateNestedOneWithoutRuntimeSessionsInput
  }

  export type RuntimeSessionUncheckedCreateInput = {
    id?: string
    executionId?: string | null
    runtimeType?: string
    workerId?: string | null
    profileId?: string | null
    state: string
    controlMode?: string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    closedAt?: Date | string | null
  }

  export type RuntimeSessionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    execution?: ExecutionUpdateOneWithoutRuntimeSessionsNestedInput
  }

  export type RuntimeSessionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    executionId?: NullableStringFieldUpdateOperationsInput | string | null
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RuntimeSessionCreateManyInput = {
    id?: string
    executionId?: string | null
    runtimeType?: string
    workerId?: string | null
    profileId?: string | null
    state: string
    controlMode?: string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    closedAt?: Date | string | null
  }

  export type RuntimeSessionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RuntimeSessionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    executionId?: NullableStringFieldUpdateOperationsInput | string | null
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ExecutionEventCreateInput = {
    id?: string
    runtimeSessionId?: string | null
    stepId?: string | null
    eventType: string
    eventSource?: string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    execution: ExecutionCreateNestedOneWithoutEventsInput
  }

  export type ExecutionEventUncheckedCreateInput = {
    id?: string
    executionId: string
    runtimeSessionId?: string | null
    stepId?: string | null
    eventType: string
    eventSource?: string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type ExecutionEventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    execution?: ExecutionUpdateOneRequiredWithoutEventsNestedInput
  }

  export type ExecutionEventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    executionId?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionEventCreateManyInput = {
    id?: string
    executionId: string
    runtimeSessionId?: string | null
    stepId?: string | null
    eventType: string
    eventSource?: string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type ExecutionEventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionEventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    executionId?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
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

  export type UuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
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
  export type JsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
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

  export type ExecutionStepListRelationFilter = {
    every?: ExecutionStepWhereInput
    some?: ExecutionStepWhereInput
    none?: ExecutionStepWhereInput
  }

  export type RuntimeSessionListRelationFilter = {
    every?: RuntimeSessionWhereInput
    some?: RuntimeSessionWhereInput
    none?: RuntimeSessionWhereInput
  }

  export type ExecutionEventListRelationFilter = {
    every?: ExecutionEventWhereInput
    some?: ExecutionEventWhereInput
    none?: ExecutionEventWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type ExecutionStepOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type RuntimeSessionOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ExecutionEventOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ExecutionCountOrderByAggregateInput = {
    id?: SortOrder
    orgId?: SortOrder
    createdBy?: SortOrder
    skillId?: SortOrder
    skillVersion?: SortOrder
    status?: SortOrder
    runtimeType?: SortOrder
    riskLevel?: SortOrder
    inputJson?: SortOrder
    normalizedInputJson?: SortOrder
    resultJson?: SortOrder
    failureReason?: SortOrder
    failureCode?: SortOrder
    currentStepId?: SortOrder
    requiresApproval?: SortOrder
    approvalStatus?: SortOrder
    takeoverRequired?: SortOrder
    takeoverReason?: SortOrder
    startedAt?: SortOrder
    endedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ExecutionMaxOrderByAggregateInput = {
    id?: SortOrder
    orgId?: SortOrder
    createdBy?: SortOrder
    skillId?: SortOrder
    skillVersion?: SortOrder
    status?: SortOrder
    runtimeType?: SortOrder
    riskLevel?: SortOrder
    failureReason?: SortOrder
    failureCode?: SortOrder
    currentStepId?: SortOrder
    requiresApproval?: SortOrder
    approvalStatus?: SortOrder
    takeoverRequired?: SortOrder
    takeoverReason?: SortOrder
    startedAt?: SortOrder
    endedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ExecutionMinOrderByAggregateInput = {
    id?: SortOrder
    orgId?: SortOrder
    createdBy?: SortOrder
    skillId?: SortOrder
    skillVersion?: SortOrder
    status?: SortOrder
    runtimeType?: SortOrder
    riskLevel?: SortOrder
    failureReason?: SortOrder
    failureCode?: SortOrder
    currentStepId?: SortOrder
    requiresApproval?: SortOrder
    approvalStatus?: SortOrder
    takeoverRequired?: SortOrder
    takeoverReason?: SortOrder
    startedAt?: SortOrder
    endedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
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

  export type UuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
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
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
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

  export type ExecutionRelationFilter = {
    is?: ExecutionWhereInput
    isNot?: ExecutionWhereInput
  }

  export type ExecutionStepExecutionIdStepIndexCompoundUniqueInput = {
    executionId: string
    stepIndex: number
  }

  export type ExecutionStepCountOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    stepIndex?: SortOrder
    name?: SortOrder
    type?: SortOrder
    status?: SortOrder
    action?: SortOrder
    targetJson?: SortOrder
    inputJson?: SortOrder
    outputJson?: SortOrder
    assertionJson?: SortOrder
    errorMessage?: SortOrder
    errorCode?: SortOrder
    retryCount?: SortOrder
    snapshotId?: SortOrder
    takeoverTriggered?: SortOrder
    startedAt?: SortOrder
    endedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ExecutionStepAvgOrderByAggregateInput = {
    stepIndex?: SortOrder
    retryCount?: SortOrder
  }

  export type ExecutionStepMaxOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    stepIndex?: SortOrder
    name?: SortOrder
    type?: SortOrder
    status?: SortOrder
    action?: SortOrder
    errorMessage?: SortOrder
    errorCode?: SortOrder
    retryCount?: SortOrder
    snapshotId?: SortOrder
    takeoverTriggered?: SortOrder
    startedAt?: SortOrder
    endedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ExecutionStepMinOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    stepIndex?: SortOrder
    name?: SortOrder
    type?: SortOrder
    status?: SortOrder
    action?: SortOrder
    errorMessage?: SortOrder
    errorCode?: SortOrder
    retryCount?: SortOrder
    snapshotId?: SortOrder
    takeoverTriggered?: SortOrder
    startedAt?: SortOrder
    endedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ExecutionStepSumOrderByAggregateInput = {
    stepIndex?: SortOrder
    retryCount?: SortOrder
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

  export type ExecutionNullableRelationFilter = {
    is?: ExecutionWhereInput | null
    isNot?: ExecutionWhereInput | null
  }

  export type RuntimeSessionCountOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeType?: SortOrder
    workerId?: SortOrder
    profileId?: SortOrder
    state?: SortOrder
    controlMode?: SortOrder
    connectionInfoJson?: SortOrder
    freezeReason?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    closedAt?: SortOrder
  }

  export type RuntimeSessionMaxOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeType?: SortOrder
    workerId?: SortOrder
    profileId?: SortOrder
    state?: SortOrder
    controlMode?: SortOrder
    freezeReason?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    closedAt?: SortOrder
  }

  export type RuntimeSessionMinOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeType?: SortOrder
    workerId?: SortOrder
    profileId?: SortOrder
    state?: SortOrder
    controlMode?: SortOrder
    freezeReason?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    closedAt?: SortOrder
  }

  export type ExecutionEventCountOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeSessionId?: SortOrder
    stepId?: SortOrder
    eventType?: SortOrder
    eventSource?: SortOrder
    payloadJson?: SortOrder
    createdAt?: SortOrder
  }

  export type ExecutionEventMaxOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeSessionId?: SortOrder
    stepId?: SortOrder
    eventType?: SortOrder
    eventSource?: SortOrder
    createdAt?: SortOrder
  }

  export type ExecutionEventMinOrderByAggregateInput = {
    id?: SortOrder
    executionId?: SortOrder
    runtimeSessionId?: SortOrder
    stepId?: SortOrder
    eventType?: SortOrder
    eventSource?: SortOrder
    createdAt?: SortOrder
  }

  export type ExecutionStepCreateNestedManyWithoutExecutionInput = {
    create?: XOR<ExecutionStepCreateWithoutExecutionInput, ExecutionStepUncheckedCreateWithoutExecutionInput> | ExecutionStepCreateWithoutExecutionInput[] | ExecutionStepUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionStepCreateOrConnectWithoutExecutionInput | ExecutionStepCreateOrConnectWithoutExecutionInput[]
    createMany?: ExecutionStepCreateManyExecutionInputEnvelope
    connect?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
  }

  export type RuntimeSessionCreateNestedManyWithoutExecutionInput = {
    create?: XOR<RuntimeSessionCreateWithoutExecutionInput, RuntimeSessionUncheckedCreateWithoutExecutionInput> | RuntimeSessionCreateWithoutExecutionInput[] | RuntimeSessionUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: RuntimeSessionCreateOrConnectWithoutExecutionInput | RuntimeSessionCreateOrConnectWithoutExecutionInput[]
    createMany?: RuntimeSessionCreateManyExecutionInputEnvelope
    connect?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
  }

  export type ExecutionEventCreateNestedManyWithoutExecutionInput = {
    create?: XOR<ExecutionEventCreateWithoutExecutionInput, ExecutionEventUncheckedCreateWithoutExecutionInput> | ExecutionEventCreateWithoutExecutionInput[] | ExecutionEventUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionEventCreateOrConnectWithoutExecutionInput | ExecutionEventCreateOrConnectWithoutExecutionInput[]
    createMany?: ExecutionEventCreateManyExecutionInputEnvelope
    connect?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
  }

  export type ExecutionStepUncheckedCreateNestedManyWithoutExecutionInput = {
    create?: XOR<ExecutionStepCreateWithoutExecutionInput, ExecutionStepUncheckedCreateWithoutExecutionInput> | ExecutionStepCreateWithoutExecutionInput[] | ExecutionStepUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionStepCreateOrConnectWithoutExecutionInput | ExecutionStepCreateOrConnectWithoutExecutionInput[]
    createMany?: ExecutionStepCreateManyExecutionInputEnvelope
    connect?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
  }

  export type RuntimeSessionUncheckedCreateNestedManyWithoutExecutionInput = {
    create?: XOR<RuntimeSessionCreateWithoutExecutionInput, RuntimeSessionUncheckedCreateWithoutExecutionInput> | RuntimeSessionCreateWithoutExecutionInput[] | RuntimeSessionUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: RuntimeSessionCreateOrConnectWithoutExecutionInput | RuntimeSessionCreateOrConnectWithoutExecutionInput[]
    createMany?: RuntimeSessionCreateManyExecutionInputEnvelope
    connect?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
  }

  export type ExecutionEventUncheckedCreateNestedManyWithoutExecutionInput = {
    create?: XOR<ExecutionEventCreateWithoutExecutionInput, ExecutionEventUncheckedCreateWithoutExecutionInput> | ExecutionEventCreateWithoutExecutionInput[] | ExecutionEventUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionEventCreateOrConnectWithoutExecutionInput | ExecutionEventCreateOrConnectWithoutExecutionInput[]
    createMany?: ExecutionEventCreateManyExecutionInputEnvelope
    connect?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type ExecutionStepUpdateManyWithoutExecutionNestedInput = {
    create?: XOR<ExecutionStepCreateWithoutExecutionInput, ExecutionStepUncheckedCreateWithoutExecutionInput> | ExecutionStepCreateWithoutExecutionInput[] | ExecutionStepUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionStepCreateOrConnectWithoutExecutionInput | ExecutionStepCreateOrConnectWithoutExecutionInput[]
    upsert?: ExecutionStepUpsertWithWhereUniqueWithoutExecutionInput | ExecutionStepUpsertWithWhereUniqueWithoutExecutionInput[]
    createMany?: ExecutionStepCreateManyExecutionInputEnvelope
    set?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    disconnect?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    delete?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    connect?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    update?: ExecutionStepUpdateWithWhereUniqueWithoutExecutionInput | ExecutionStepUpdateWithWhereUniqueWithoutExecutionInput[]
    updateMany?: ExecutionStepUpdateManyWithWhereWithoutExecutionInput | ExecutionStepUpdateManyWithWhereWithoutExecutionInput[]
    deleteMany?: ExecutionStepScalarWhereInput | ExecutionStepScalarWhereInput[]
  }

  export type RuntimeSessionUpdateManyWithoutExecutionNestedInput = {
    create?: XOR<RuntimeSessionCreateWithoutExecutionInput, RuntimeSessionUncheckedCreateWithoutExecutionInput> | RuntimeSessionCreateWithoutExecutionInput[] | RuntimeSessionUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: RuntimeSessionCreateOrConnectWithoutExecutionInput | RuntimeSessionCreateOrConnectWithoutExecutionInput[]
    upsert?: RuntimeSessionUpsertWithWhereUniqueWithoutExecutionInput | RuntimeSessionUpsertWithWhereUniqueWithoutExecutionInput[]
    createMany?: RuntimeSessionCreateManyExecutionInputEnvelope
    set?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    disconnect?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    delete?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    connect?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    update?: RuntimeSessionUpdateWithWhereUniqueWithoutExecutionInput | RuntimeSessionUpdateWithWhereUniqueWithoutExecutionInput[]
    updateMany?: RuntimeSessionUpdateManyWithWhereWithoutExecutionInput | RuntimeSessionUpdateManyWithWhereWithoutExecutionInput[]
    deleteMany?: RuntimeSessionScalarWhereInput | RuntimeSessionScalarWhereInput[]
  }

  export type ExecutionEventUpdateManyWithoutExecutionNestedInput = {
    create?: XOR<ExecutionEventCreateWithoutExecutionInput, ExecutionEventUncheckedCreateWithoutExecutionInput> | ExecutionEventCreateWithoutExecutionInput[] | ExecutionEventUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionEventCreateOrConnectWithoutExecutionInput | ExecutionEventCreateOrConnectWithoutExecutionInput[]
    upsert?: ExecutionEventUpsertWithWhereUniqueWithoutExecutionInput | ExecutionEventUpsertWithWhereUniqueWithoutExecutionInput[]
    createMany?: ExecutionEventCreateManyExecutionInputEnvelope
    set?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    disconnect?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    delete?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    connect?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    update?: ExecutionEventUpdateWithWhereUniqueWithoutExecutionInput | ExecutionEventUpdateWithWhereUniqueWithoutExecutionInput[]
    updateMany?: ExecutionEventUpdateManyWithWhereWithoutExecutionInput | ExecutionEventUpdateManyWithWhereWithoutExecutionInput[]
    deleteMany?: ExecutionEventScalarWhereInput | ExecutionEventScalarWhereInput[]
  }

  export type ExecutionStepUncheckedUpdateManyWithoutExecutionNestedInput = {
    create?: XOR<ExecutionStepCreateWithoutExecutionInput, ExecutionStepUncheckedCreateWithoutExecutionInput> | ExecutionStepCreateWithoutExecutionInput[] | ExecutionStepUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionStepCreateOrConnectWithoutExecutionInput | ExecutionStepCreateOrConnectWithoutExecutionInput[]
    upsert?: ExecutionStepUpsertWithWhereUniqueWithoutExecutionInput | ExecutionStepUpsertWithWhereUniqueWithoutExecutionInput[]
    createMany?: ExecutionStepCreateManyExecutionInputEnvelope
    set?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    disconnect?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    delete?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    connect?: ExecutionStepWhereUniqueInput | ExecutionStepWhereUniqueInput[]
    update?: ExecutionStepUpdateWithWhereUniqueWithoutExecutionInput | ExecutionStepUpdateWithWhereUniqueWithoutExecutionInput[]
    updateMany?: ExecutionStepUpdateManyWithWhereWithoutExecutionInput | ExecutionStepUpdateManyWithWhereWithoutExecutionInput[]
    deleteMany?: ExecutionStepScalarWhereInput | ExecutionStepScalarWhereInput[]
  }

  export type RuntimeSessionUncheckedUpdateManyWithoutExecutionNestedInput = {
    create?: XOR<RuntimeSessionCreateWithoutExecutionInput, RuntimeSessionUncheckedCreateWithoutExecutionInput> | RuntimeSessionCreateWithoutExecutionInput[] | RuntimeSessionUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: RuntimeSessionCreateOrConnectWithoutExecutionInput | RuntimeSessionCreateOrConnectWithoutExecutionInput[]
    upsert?: RuntimeSessionUpsertWithWhereUniqueWithoutExecutionInput | RuntimeSessionUpsertWithWhereUniqueWithoutExecutionInput[]
    createMany?: RuntimeSessionCreateManyExecutionInputEnvelope
    set?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    disconnect?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    delete?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    connect?: RuntimeSessionWhereUniqueInput | RuntimeSessionWhereUniqueInput[]
    update?: RuntimeSessionUpdateWithWhereUniqueWithoutExecutionInput | RuntimeSessionUpdateWithWhereUniqueWithoutExecutionInput[]
    updateMany?: RuntimeSessionUpdateManyWithWhereWithoutExecutionInput | RuntimeSessionUpdateManyWithWhereWithoutExecutionInput[]
    deleteMany?: RuntimeSessionScalarWhereInput | RuntimeSessionScalarWhereInput[]
  }

  export type ExecutionEventUncheckedUpdateManyWithoutExecutionNestedInput = {
    create?: XOR<ExecutionEventCreateWithoutExecutionInput, ExecutionEventUncheckedCreateWithoutExecutionInput> | ExecutionEventCreateWithoutExecutionInput[] | ExecutionEventUncheckedCreateWithoutExecutionInput[]
    connectOrCreate?: ExecutionEventCreateOrConnectWithoutExecutionInput | ExecutionEventCreateOrConnectWithoutExecutionInput[]
    upsert?: ExecutionEventUpsertWithWhereUniqueWithoutExecutionInput | ExecutionEventUpsertWithWhereUniqueWithoutExecutionInput[]
    createMany?: ExecutionEventCreateManyExecutionInputEnvelope
    set?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    disconnect?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    delete?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    connect?: ExecutionEventWhereUniqueInput | ExecutionEventWhereUniqueInput[]
    update?: ExecutionEventUpdateWithWhereUniqueWithoutExecutionInput | ExecutionEventUpdateWithWhereUniqueWithoutExecutionInput[]
    updateMany?: ExecutionEventUpdateManyWithWhereWithoutExecutionInput | ExecutionEventUpdateManyWithWhereWithoutExecutionInput[]
    deleteMany?: ExecutionEventScalarWhereInput | ExecutionEventScalarWhereInput[]
  }

  export type ExecutionCreateNestedOneWithoutStepsInput = {
    create?: XOR<ExecutionCreateWithoutStepsInput, ExecutionUncheckedCreateWithoutStepsInput>
    connectOrCreate?: ExecutionCreateOrConnectWithoutStepsInput
    connect?: ExecutionWhereUniqueInput
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type ExecutionUpdateOneRequiredWithoutStepsNestedInput = {
    create?: XOR<ExecutionCreateWithoutStepsInput, ExecutionUncheckedCreateWithoutStepsInput>
    connectOrCreate?: ExecutionCreateOrConnectWithoutStepsInput
    upsert?: ExecutionUpsertWithoutStepsInput
    connect?: ExecutionWhereUniqueInput
    update?: XOR<XOR<ExecutionUpdateToOneWithWhereWithoutStepsInput, ExecutionUpdateWithoutStepsInput>, ExecutionUncheckedUpdateWithoutStepsInput>
  }

  export type ExecutionCreateNestedOneWithoutRuntimeSessionsInput = {
    create?: XOR<ExecutionCreateWithoutRuntimeSessionsInput, ExecutionUncheckedCreateWithoutRuntimeSessionsInput>
    connectOrCreate?: ExecutionCreateOrConnectWithoutRuntimeSessionsInput
    connect?: ExecutionWhereUniqueInput
  }

  export type ExecutionUpdateOneWithoutRuntimeSessionsNestedInput = {
    create?: XOR<ExecutionCreateWithoutRuntimeSessionsInput, ExecutionUncheckedCreateWithoutRuntimeSessionsInput>
    connectOrCreate?: ExecutionCreateOrConnectWithoutRuntimeSessionsInput
    upsert?: ExecutionUpsertWithoutRuntimeSessionsInput
    disconnect?: ExecutionWhereInput | boolean
    delete?: ExecutionWhereInput | boolean
    connect?: ExecutionWhereUniqueInput
    update?: XOR<XOR<ExecutionUpdateToOneWithWhereWithoutRuntimeSessionsInput, ExecutionUpdateWithoutRuntimeSessionsInput>, ExecutionUncheckedUpdateWithoutRuntimeSessionsInput>
  }

  export type ExecutionCreateNestedOneWithoutEventsInput = {
    create?: XOR<ExecutionCreateWithoutEventsInput, ExecutionUncheckedCreateWithoutEventsInput>
    connectOrCreate?: ExecutionCreateOrConnectWithoutEventsInput
    connect?: ExecutionWhereUniqueInput
  }

  export type ExecutionUpdateOneRequiredWithoutEventsNestedInput = {
    create?: XOR<ExecutionCreateWithoutEventsInput, ExecutionUncheckedCreateWithoutEventsInput>
    connectOrCreate?: ExecutionCreateOrConnectWithoutEventsInput
    upsert?: ExecutionUpsertWithoutEventsInput
    connect?: ExecutionWhereUniqueInput
    update?: XOR<XOR<ExecutionUpdateToOneWithWhereWithoutEventsInput, ExecutionUpdateWithoutEventsInput>, ExecutionUncheckedUpdateWithoutEventsInput>
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

  export type NestedUuidNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableFilter<$PrismaModel> | string | null
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

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
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

  export type NestedUuidNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedUuidNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
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
  export type NestedJsonNullableFilter<$PrismaModel = never> = 
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
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

  export type ExecutionStepCreateWithoutExecutionInput = {
    id?: string
    stepIndex: number
    name?: string | null
    type: string
    status: string
    action?: string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: string | null
    errorCode?: string | null
    retryCount?: number
    snapshotId?: string | null
    takeoverTriggered?: boolean
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ExecutionStepUncheckedCreateWithoutExecutionInput = {
    id?: string
    stepIndex: number
    name?: string | null
    type: string
    status: string
    action?: string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: string | null
    errorCode?: string | null
    retryCount?: number
    snapshotId?: string | null
    takeoverTriggered?: boolean
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ExecutionStepCreateOrConnectWithoutExecutionInput = {
    where: ExecutionStepWhereUniqueInput
    create: XOR<ExecutionStepCreateWithoutExecutionInput, ExecutionStepUncheckedCreateWithoutExecutionInput>
  }

  export type ExecutionStepCreateManyExecutionInputEnvelope = {
    data: ExecutionStepCreateManyExecutionInput | ExecutionStepCreateManyExecutionInput[]
    skipDuplicates?: boolean
  }

  export type RuntimeSessionCreateWithoutExecutionInput = {
    id?: string
    runtimeType?: string
    workerId?: string | null
    profileId?: string | null
    state: string
    controlMode?: string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    closedAt?: Date | string | null
  }

  export type RuntimeSessionUncheckedCreateWithoutExecutionInput = {
    id?: string
    runtimeType?: string
    workerId?: string | null
    profileId?: string | null
    state: string
    controlMode?: string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    closedAt?: Date | string | null
  }

  export type RuntimeSessionCreateOrConnectWithoutExecutionInput = {
    where: RuntimeSessionWhereUniqueInput
    create: XOR<RuntimeSessionCreateWithoutExecutionInput, RuntimeSessionUncheckedCreateWithoutExecutionInput>
  }

  export type RuntimeSessionCreateManyExecutionInputEnvelope = {
    data: RuntimeSessionCreateManyExecutionInput | RuntimeSessionCreateManyExecutionInput[]
    skipDuplicates?: boolean
  }

  export type ExecutionEventCreateWithoutExecutionInput = {
    id?: string
    runtimeSessionId?: string | null
    stepId?: string | null
    eventType: string
    eventSource?: string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type ExecutionEventUncheckedCreateWithoutExecutionInput = {
    id?: string
    runtimeSessionId?: string | null
    stepId?: string | null
    eventType: string
    eventSource?: string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type ExecutionEventCreateOrConnectWithoutExecutionInput = {
    where: ExecutionEventWhereUniqueInput
    create: XOR<ExecutionEventCreateWithoutExecutionInput, ExecutionEventUncheckedCreateWithoutExecutionInput>
  }

  export type ExecutionEventCreateManyExecutionInputEnvelope = {
    data: ExecutionEventCreateManyExecutionInput | ExecutionEventCreateManyExecutionInput[]
    skipDuplicates?: boolean
  }

  export type ExecutionStepUpsertWithWhereUniqueWithoutExecutionInput = {
    where: ExecutionStepWhereUniqueInput
    update: XOR<ExecutionStepUpdateWithoutExecutionInput, ExecutionStepUncheckedUpdateWithoutExecutionInput>
    create: XOR<ExecutionStepCreateWithoutExecutionInput, ExecutionStepUncheckedCreateWithoutExecutionInput>
  }

  export type ExecutionStepUpdateWithWhereUniqueWithoutExecutionInput = {
    where: ExecutionStepWhereUniqueInput
    data: XOR<ExecutionStepUpdateWithoutExecutionInput, ExecutionStepUncheckedUpdateWithoutExecutionInput>
  }

  export type ExecutionStepUpdateManyWithWhereWithoutExecutionInput = {
    where: ExecutionStepScalarWhereInput
    data: XOR<ExecutionStepUpdateManyMutationInput, ExecutionStepUncheckedUpdateManyWithoutExecutionInput>
  }

  export type ExecutionStepScalarWhereInput = {
    AND?: ExecutionStepScalarWhereInput | ExecutionStepScalarWhereInput[]
    OR?: ExecutionStepScalarWhereInput[]
    NOT?: ExecutionStepScalarWhereInput | ExecutionStepScalarWhereInput[]
    id?: UuidFilter<"ExecutionStep"> | string
    executionId?: UuidFilter<"ExecutionStep"> | string
    stepIndex?: IntFilter<"ExecutionStep"> | number
    name?: StringNullableFilter<"ExecutionStep"> | string | null
    type?: StringFilter<"ExecutionStep"> | string
    status?: StringFilter<"ExecutionStep"> | string
    action?: StringNullableFilter<"ExecutionStep"> | string | null
    targetJson?: JsonNullableFilter<"ExecutionStep">
    inputJson?: JsonNullableFilter<"ExecutionStep">
    outputJson?: JsonNullableFilter<"ExecutionStep">
    assertionJson?: JsonNullableFilter<"ExecutionStep">
    errorMessage?: StringNullableFilter<"ExecutionStep"> | string | null
    errorCode?: StringNullableFilter<"ExecutionStep"> | string | null
    retryCount?: IntFilter<"ExecutionStep"> | number
    snapshotId?: StringNullableFilter<"ExecutionStep"> | string | null
    takeoverTriggered?: BoolFilter<"ExecutionStep"> | boolean
    startedAt?: DateTimeNullableFilter<"ExecutionStep"> | Date | string | null
    endedAt?: DateTimeNullableFilter<"ExecutionStep"> | Date | string | null
    createdAt?: DateTimeFilter<"ExecutionStep"> | Date | string
    updatedAt?: DateTimeFilter<"ExecutionStep"> | Date | string
  }

  export type RuntimeSessionUpsertWithWhereUniqueWithoutExecutionInput = {
    where: RuntimeSessionWhereUniqueInput
    update: XOR<RuntimeSessionUpdateWithoutExecutionInput, RuntimeSessionUncheckedUpdateWithoutExecutionInput>
    create: XOR<RuntimeSessionCreateWithoutExecutionInput, RuntimeSessionUncheckedCreateWithoutExecutionInput>
  }

  export type RuntimeSessionUpdateWithWhereUniqueWithoutExecutionInput = {
    where: RuntimeSessionWhereUniqueInput
    data: XOR<RuntimeSessionUpdateWithoutExecutionInput, RuntimeSessionUncheckedUpdateWithoutExecutionInput>
  }

  export type RuntimeSessionUpdateManyWithWhereWithoutExecutionInput = {
    where: RuntimeSessionScalarWhereInput
    data: XOR<RuntimeSessionUpdateManyMutationInput, RuntimeSessionUncheckedUpdateManyWithoutExecutionInput>
  }

  export type RuntimeSessionScalarWhereInput = {
    AND?: RuntimeSessionScalarWhereInput | RuntimeSessionScalarWhereInput[]
    OR?: RuntimeSessionScalarWhereInput[]
    NOT?: RuntimeSessionScalarWhereInput | RuntimeSessionScalarWhereInput[]
    id?: UuidFilter<"RuntimeSession"> | string
    executionId?: UuidNullableFilter<"RuntimeSession"> | string | null
    runtimeType?: StringFilter<"RuntimeSession"> | string
    workerId?: StringNullableFilter<"RuntimeSession"> | string | null
    profileId?: StringNullableFilter<"RuntimeSession"> | string | null
    state?: StringFilter<"RuntimeSession"> | string
    controlMode?: StringFilter<"RuntimeSession"> | string
    connectionInfoJson?: JsonNullableFilter<"RuntimeSession">
    freezeReason?: StringNullableFilter<"RuntimeSession"> | string | null
    createdAt?: DateTimeFilter<"RuntimeSession"> | Date | string
    updatedAt?: DateTimeFilter<"RuntimeSession"> | Date | string
    closedAt?: DateTimeNullableFilter<"RuntimeSession"> | Date | string | null
  }

  export type ExecutionEventUpsertWithWhereUniqueWithoutExecutionInput = {
    where: ExecutionEventWhereUniqueInput
    update: XOR<ExecutionEventUpdateWithoutExecutionInput, ExecutionEventUncheckedUpdateWithoutExecutionInput>
    create: XOR<ExecutionEventCreateWithoutExecutionInput, ExecutionEventUncheckedCreateWithoutExecutionInput>
  }

  export type ExecutionEventUpdateWithWhereUniqueWithoutExecutionInput = {
    where: ExecutionEventWhereUniqueInput
    data: XOR<ExecutionEventUpdateWithoutExecutionInput, ExecutionEventUncheckedUpdateWithoutExecutionInput>
  }

  export type ExecutionEventUpdateManyWithWhereWithoutExecutionInput = {
    where: ExecutionEventScalarWhereInput
    data: XOR<ExecutionEventUpdateManyMutationInput, ExecutionEventUncheckedUpdateManyWithoutExecutionInput>
  }

  export type ExecutionEventScalarWhereInput = {
    AND?: ExecutionEventScalarWhereInput | ExecutionEventScalarWhereInput[]
    OR?: ExecutionEventScalarWhereInput[]
    NOT?: ExecutionEventScalarWhereInput | ExecutionEventScalarWhereInput[]
    id?: UuidFilter<"ExecutionEvent"> | string
    executionId?: UuidFilter<"ExecutionEvent"> | string
    runtimeSessionId?: UuidNullableFilter<"ExecutionEvent"> | string | null
    stepId?: UuidNullableFilter<"ExecutionEvent"> | string | null
    eventType?: StringFilter<"ExecutionEvent"> | string
    eventSource?: StringNullableFilter<"ExecutionEvent"> | string | null
    payloadJson?: JsonNullableFilter<"ExecutionEvent">
    createdAt?: DateTimeFilter<"ExecutionEvent"> | Date | string
  }

  export type ExecutionCreateWithoutStepsInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    runtimeSessions?: RuntimeSessionCreateNestedManyWithoutExecutionInput
    events?: ExecutionEventCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionUncheckedCreateWithoutStepsInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    runtimeSessions?: RuntimeSessionUncheckedCreateNestedManyWithoutExecutionInput
    events?: ExecutionEventUncheckedCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionCreateOrConnectWithoutStepsInput = {
    where: ExecutionWhereUniqueInput
    create: XOR<ExecutionCreateWithoutStepsInput, ExecutionUncheckedCreateWithoutStepsInput>
  }

  export type ExecutionUpsertWithoutStepsInput = {
    update: XOR<ExecutionUpdateWithoutStepsInput, ExecutionUncheckedUpdateWithoutStepsInput>
    create: XOR<ExecutionCreateWithoutStepsInput, ExecutionUncheckedCreateWithoutStepsInput>
    where?: ExecutionWhereInput
  }

  export type ExecutionUpdateToOneWithWhereWithoutStepsInput = {
    where?: ExecutionWhereInput
    data: XOR<ExecutionUpdateWithoutStepsInput, ExecutionUncheckedUpdateWithoutStepsInput>
  }

  export type ExecutionUpdateWithoutStepsInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    runtimeSessions?: RuntimeSessionUpdateManyWithoutExecutionNestedInput
    events?: ExecutionEventUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionUncheckedUpdateWithoutStepsInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    runtimeSessions?: RuntimeSessionUncheckedUpdateManyWithoutExecutionNestedInput
    events?: ExecutionEventUncheckedUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionCreateWithoutRuntimeSessionsInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    steps?: ExecutionStepCreateNestedManyWithoutExecutionInput
    events?: ExecutionEventCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionUncheckedCreateWithoutRuntimeSessionsInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    steps?: ExecutionStepUncheckedCreateNestedManyWithoutExecutionInput
    events?: ExecutionEventUncheckedCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionCreateOrConnectWithoutRuntimeSessionsInput = {
    where: ExecutionWhereUniqueInput
    create: XOR<ExecutionCreateWithoutRuntimeSessionsInput, ExecutionUncheckedCreateWithoutRuntimeSessionsInput>
  }

  export type ExecutionUpsertWithoutRuntimeSessionsInput = {
    update: XOR<ExecutionUpdateWithoutRuntimeSessionsInput, ExecutionUncheckedUpdateWithoutRuntimeSessionsInput>
    create: XOR<ExecutionCreateWithoutRuntimeSessionsInput, ExecutionUncheckedCreateWithoutRuntimeSessionsInput>
    where?: ExecutionWhereInput
  }

  export type ExecutionUpdateToOneWithWhereWithoutRuntimeSessionsInput = {
    where?: ExecutionWhereInput
    data: XOR<ExecutionUpdateWithoutRuntimeSessionsInput, ExecutionUncheckedUpdateWithoutRuntimeSessionsInput>
  }

  export type ExecutionUpdateWithoutRuntimeSessionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    steps?: ExecutionStepUpdateManyWithoutExecutionNestedInput
    events?: ExecutionEventUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionUncheckedUpdateWithoutRuntimeSessionsInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    steps?: ExecutionStepUncheckedUpdateManyWithoutExecutionNestedInput
    events?: ExecutionEventUncheckedUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionCreateWithoutEventsInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    steps?: ExecutionStepCreateNestedManyWithoutExecutionInput
    runtimeSessions?: RuntimeSessionCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionUncheckedCreateWithoutEventsInput = {
    id?: string
    orgId?: string | null
    createdBy: string
    skillId: string
    skillVersion?: string | null
    status: string
    runtimeType?: string
    riskLevel?: string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: string | null
    failureCode?: string | null
    currentStepId?: string | null
    requiresApproval?: boolean
    approvalStatus?: string | null
    takeoverRequired?: boolean
    takeoverReason?: string | null
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    steps?: ExecutionStepUncheckedCreateNestedManyWithoutExecutionInput
    runtimeSessions?: RuntimeSessionUncheckedCreateNestedManyWithoutExecutionInput
  }

  export type ExecutionCreateOrConnectWithoutEventsInput = {
    where: ExecutionWhereUniqueInput
    create: XOR<ExecutionCreateWithoutEventsInput, ExecutionUncheckedCreateWithoutEventsInput>
  }

  export type ExecutionUpsertWithoutEventsInput = {
    update: XOR<ExecutionUpdateWithoutEventsInput, ExecutionUncheckedUpdateWithoutEventsInput>
    create: XOR<ExecutionCreateWithoutEventsInput, ExecutionUncheckedCreateWithoutEventsInput>
    where?: ExecutionWhereInput
  }

  export type ExecutionUpdateToOneWithWhereWithoutEventsInput = {
    where?: ExecutionWhereInput
    data: XOR<ExecutionUpdateWithoutEventsInput, ExecutionUncheckedUpdateWithoutEventsInput>
  }

  export type ExecutionUpdateWithoutEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    steps?: ExecutionStepUpdateManyWithoutExecutionNestedInput
    runtimeSessions?: RuntimeSessionUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionUncheckedUpdateWithoutEventsInput = {
    id?: StringFieldUpdateOperationsInput | string
    orgId?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    skillId?: StringFieldUpdateOperationsInput | string
    skillVersion?: NullableStringFieldUpdateOperationsInput | string | null
    status?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    riskLevel?: StringFieldUpdateOperationsInput | string
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    normalizedInputJson?: NullableJsonNullValueInput | InputJsonValue
    resultJson?: NullableJsonNullValueInput | InputJsonValue
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    failureCode?: NullableStringFieldUpdateOperationsInput | string | null
    currentStepId?: NullableStringFieldUpdateOperationsInput | string | null
    requiresApproval?: BoolFieldUpdateOperationsInput | boolean
    approvalStatus?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverRequired?: BoolFieldUpdateOperationsInput | boolean
    takeoverReason?: NullableStringFieldUpdateOperationsInput | string | null
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    steps?: ExecutionStepUncheckedUpdateManyWithoutExecutionNestedInput
    runtimeSessions?: RuntimeSessionUncheckedUpdateManyWithoutExecutionNestedInput
  }

  export type ExecutionStepCreateManyExecutionInput = {
    id?: string
    stepIndex: number
    name?: string | null
    type: string
    status: string
    action?: string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: string | null
    errorCode?: string | null
    retryCount?: number
    snapshotId?: string | null
    takeoverTriggered?: boolean
    startedAt?: Date | string | null
    endedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RuntimeSessionCreateManyExecutionInput = {
    id?: string
    runtimeType?: string
    workerId?: string | null
    profileId?: string | null
    state: string
    controlMode?: string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    closedAt?: Date | string | null
  }

  export type ExecutionEventCreateManyExecutionInput = {
    id?: string
    runtimeSessionId?: string | null
    stepId?: string | null
    eventType: string
    eventSource?: string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type ExecutionStepUpdateWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionStepUncheckedUpdateWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionStepUncheckedUpdateManyWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    stepIndex?: IntFieldUpdateOperationsInput | number
    name?: NullableStringFieldUpdateOperationsInput | string | null
    type?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    action?: NullableStringFieldUpdateOperationsInput | string | null
    targetJson?: NullableJsonNullValueInput | InputJsonValue
    inputJson?: NullableJsonNullValueInput | InputJsonValue
    outputJson?: NullableJsonNullValueInput | InputJsonValue
    assertionJson?: NullableJsonNullValueInput | InputJsonValue
    errorMessage?: NullableStringFieldUpdateOperationsInput | string | null
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    retryCount?: IntFieldUpdateOperationsInput | number
    snapshotId?: NullableStringFieldUpdateOperationsInput | string | null
    takeoverTriggered?: BoolFieldUpdateOperationsInput | boolean
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    endedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RuntimeSessionUpdateWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RuntimeSessionUncheckedUpdateWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RuntimeSessionUncheckedUpdateManyWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeType?: StringFieldUpdateOperationsInput | string
    workerId?: NullableStringFieldUpdateOperationsInput | string | null
    profileId?: NullableStringFieldUpdateOperationsInput | string | null
    state?: StringFieldUpdateOperationsInput | string
    controlMode?: StringFieldUpdateOperationsInput | string
    connectionInfoJson?: NullableJsonNullValueInput | InputJsonValue
    freezeReason?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    closedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type ExecutionEventUpdateWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionEventUncheckedUpdateWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ExecutionEventUncheckedUpdateManyWithoutExecutionInput = {
    id?: StringFieldUpdateOperationsInput | string
    runtimeSessionId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    eventType?: StringFieldUpdateOperationsInput | string
    eventSource?: NullableStringFieldUpdateOperationsInput | string | null
    payloadJson?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use ExecutionCountOutputTypeDefaultArgs instead
     */
    export type ExecutionCountOutputTypeArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ExecutionCountOutputTypeDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ExecutionDefaultArgs instead
     */
    export type ExecutionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ExecutionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ExecutionStepDefaultArgs instead
     */
    export type ExecutionStepArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ExecutionStepDefaultArgs<ExtArgs>
    /**
     * @deprecated Use RuntimeSessionDefaultArgs instead
     */
    export type RuntimeSessionArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = RuntimeSessionDefaultArgs<ExtArgs>
    /**
     * @deprecated Use ExecutionEventDefaultArgs instead
     */
    export type ExecutionEventArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = ExecutionEventDefaultArgs<ExtArgs>

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