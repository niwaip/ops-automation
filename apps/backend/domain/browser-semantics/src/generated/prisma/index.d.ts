
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
 * Model SemanticRuleDomain
 * 
 */
export type SemanticRuleDomain = $Result.DefaultSelection<Prisma.$SemanticRuleDomainPayload>
/**
 * Model SemanticRuleSet
 * 
 */
export type SemanticRuleSet = $Result.DefaultSelection<Prisma.$SemanticRuleSetPayload>
/**
 * Model SemanticRule
 * 
 */
export type SemanticRule = $Result.DefaultSelection<Prisma.$SemanticRulePayload>
/**
 * Model SemanticRuleRelease
 * 
 */
export type SemanticRuleRelease = $Result.DefaultSelection<Prisma.$SemanticRuleReleasePayload>
/**
 * Model SemanticRuleTargeting
 * 
 */
export type SemanticRuleTargeting = $Result.DefaultSelection<Prisma.$SemanticRuleTargetingPayload>
/**
 * Model SemanticRuleHitLog
 * 
 */
export type SemanticRuleHitLog = $Result.DefaultSelection<Prisma.$SemanticRuleHitLogPayload>
/**
 * Model SemanticRuleErrorLog
 * 
 */
export type SemanticRuleErrorLog = $Result.DefaultSelection<Prisma.$SemanticRuleErrorLogPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const SemanticRuleSetStatus: {
  DRAFT: 'DRAFT',
  VALIDATING: 'VALIDATING',
  CANARY: 'CANARY',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  ROLLED_BACK: 'ROLLED_BACK'
};

export type SemanticRuleSetStatus = (typeof SemanticRuleSetStatus)[keyof typeof SemanticRuleSetStatus]


export const SemanticRuleType: {
  INTENT_ALIAS: 'INTENT_ALIAS',
  FIELD_ALIAS: 'FIELD_ALIAS',
  REGION_ALIAS: 'REGION_ALIAS',
  ENTITY_ALIAS: 'ENTITY_ALIAS',
  ROW_REFERENCE: 'ROW_REFERENCE',
  READ_INTENT: 'READ_INTENT',
  LOGIN_PHRASE: 'LOGIN_PHRASE'
};

export type SemanticRuleType = (typeof SemanticRuleType)[keyof typeof SemanticRuleType]


export const SemanticRuleReleaseMode: {
  MANUAL: 'MANUAL',
  SCHEDULED: 'SCHEDULED',
  ROLLBACK: 'ROLLBACK'
};

export type SemanticRuleReleaseMode = (typeof SemanticRuleReleaseMode)[keyof typeof SemanticRuleReleaseMode]

}

export type SemanticRuleSetStatus = $Enums.SemanticRuleSetStatus

export const SemanticRuleSetStatus: typeof $Enums.SemanticRuleSetStatus

export type SemanticRuleType = $Enums.SemanticRuleType

export const SemanticRuleType: typeof $Enums.SemanticRuleType

export type SemanticRuleReleaseMode = $Enums.SemanticRuleReleaseMode

export const SemanticRuleReleaseMode: typeof $Enums.SemanticRuleReleaseMode

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more SemanticRuleDomains
 * const semanticRuleDomains = await prisma.semanticRuleDomain.findMany()
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
   * // Fetch zero or more SemanticRuleDomains
   * const semanticRuleDomains = await prisma.semanticRuleDomain.findMany()
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
   * `prisma.semanticRuleDomain`: Exposes CRUD operations for the **SemanticRuleDomain** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRuleDomains
    * const semanticRuleDomains = await prisma.semanticRuleDomain.findMany()
    * ```
    */
  get semanticRuleDomain(): Prisma.SemanticRuleDomainDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.semanticRuleSet`: Exposes CRUD operations for the **SemanticRuleSet** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRuleSets
    * const semanticRuleSets = await prisma.semanticRuleSet.findMany()
    * ```
    */
  get semanticRuleSet(): Prisma.SemanticRuleSetDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.semanticRule`: Exposes CRUD operations for the **SemanticRule** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRules
    * const semanticRules = await prisma.semanticRule.findMany()
    * ```
    */
  get semanticRule(): Prisma.SemanticRuleDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.semanticRuleRelease`: Exposes CRUD operations for the **SemanticRuleRelease** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRuleReleases
    * const semanticRuleReleases = await prisma.semanticRuleRelease.findMany()
    * ```
    */
  get semanticRuleRelease(): Prisma.SemanticRuleReleaseDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.semanticRuleTargeting`: Exposes CRUD operations for the **SemanticRuleTargeting** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRuleTargetings
    * const semanticRuleTargetings = await prisma.semanticRuleTargeting.findMany()
    * ```
    */
  get semanticRuleTargeting(): Prisma.SemanticRuleTargetingDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.semanticRuleHitLog`: Exposes CRUD operations for the **SemanticRuleHitLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRuleHitLogs
    * const semanticRuleHitLogs = await prisma.semanticRuleHitLog.findMany()
    * ```
    */
  get semanticRuleHitLog(): Prisma.SemanticRuleHitLogDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.semanticRuleErrorLog`: Exposes CRUD operations for the **SemanticRuleErrorLog** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more SemanticRuleErrorLogs
    * const semanticRuleErrorLogs = await prisma.semanticRuleErrorLog.findMany()
    * ```
    */
  get semanticRuleErrorLog(): Prisma.SemanticRuleErrorLogDelegate<ExtArgs, ClientOptions>;
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
    SemanticRuleDomain: 'SemanticRuleDomain',
    SemanticRuleSet: 'SemanticRuleSet',
    SemanticRule: 'SemanticRule',
    SemanticRuleRelease: 'SemanticRuleRelease',
    SemanticRuleTargeting: 'SemanticRuleTargeting',
    SemanticRuleHitLog: 'SemanticRuleHitLog',
    SemanticRuleErrorLog: 'SemanticRuleErrorLog'
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
      modelProps: "semanticRuleDomain" | "semanticRuleSet" | "semanticRule" | "semanticRuleRelease" | "semanticRuleTargeting" | "semanticRuleHitLog" | "semanticRuleErrorLog"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      SemanticRuleDomain: {
        payload: Prisma.$SemanticRuleDomainPayload<ExtArgs>
        fields: Prisma.SemanticRuleDomainFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleDomainFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleDomainFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleDomainFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleDomainFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>
          }
          findMany: {
            args: Prisma.SemanticRuleDomainFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>[]
          }
          create: {
            args: Prisma.SemanticRuleDomainCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>
          }
          createMany: {
            args: Prisma.SemanticRuleDomainCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleDomainCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleDomainDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>
          }
          update: {
            args: Prisma.SemanticRuleDomainUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleDomainDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleDomainUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleDomainUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleDomainUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleDomainPayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleDomainAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRuleDomain>
          }
          groupBy: {
            args: Prisma.SemanticRuleDomainGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleDomainGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleDomainCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleDomainCountAggregateOutputType> | number
          }
        }
      }
      SemanticRuleSet: {
        payload: Prisma.$SemanticRuleSetPayload<ExtArgs>
        fields: Prisma.SemanticRuleSetFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleSetFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleSetFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleSetFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleSetFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>
          }
          findMany: {
            args: Prisma.SemanticRuleSetFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>[]
          }
          create: {
            args: Prisma.SemanticRuleSetCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>
          }
          createMany: {
            args: Prisma.SemanticRuleSetCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleSetCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleSetDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>
          }
          update: {
            args: Prisma.SemanticRuleSetUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleSetDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleSetUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleSetUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleSetUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleSetPayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleSetAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRuleSet>
          }
          groupBy: {
            args: Prisma.SemanticRuleSetGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleSetGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleSetCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleSetCountAggregateOutputType> | number
          }
        }
      }
      SemanticRule: {
        payload: Prisma.$SemanticRulePayload<ExtArgs>
        fields: Prisma.SemanticRuleFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>
          }
          findMany: {
            args: Prisma.SemanticRuleFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>[]
          }
          create: {
            args: Prisma.SemanticRuleCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>
          }
          createMany: {
            args: Prisma.SemanticRuleCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>
          }
          update: {
            args: Prisma.SemanticRuleUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRulePayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRule>
          }
          groupBy: {
            args: Prisma.SemanticRuleGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleCountAggregateOutputType> | number
          }
        }
      }
      SemanticRuleRelease: {
        payload: Prisma.$SemanticRuleReleasePayload<ExtArgs>
        fields: Prisma.SemanticRuleReleaseFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleReleaseFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleReleaseFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleReleaseFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleReleaseFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>
          }
          findMany: {
            args: Prisma.SemanticRuleReleaseFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>[]
          }
          create: {
            args: Prisma.SemanticRuleReleaseCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>
          }
          createMany: {
            args: Prisma.SemanticRuleReleaseCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleReleaseCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleReleaseDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>
          }
          update: {
            args: Prisma.SemanticRuleReleaseUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleReleaseDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleReleaseUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleReleaseUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleReleaseUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleReleasePayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleReleaseAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRuleRelease>
          }
          groupBy: {
            args: Prisma.SemanticRuleReleaseGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleReleaseGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleReleaseCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleReleaseCountAggregateOutputType> | number
          }
        }
      }
      SemanticRuleTargeting: {
        payload: Prisma.$SemanticRuleTargetingPayload<ExtArgs>
        fields: Prisma.SemanticRuleTargetingFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleTargetingFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleTargetingFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleTargetingFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleTargetingFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>
          }
          findMany: {
            args: Prisma.SemanticRuleTargetingFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>[]
          }
          create: {
            args: Prisma.SemanticRuleTargetingCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>
          }
          createMany: {
            args: Prisma.SemanticRuleTargetingCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleTargetingCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleTargetingDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>
          }
          update: {
            args: Prisma.SemanticRuleTargetingUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleTargetingDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleTargetingUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleTargetingUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleTargetingUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleTargetingPayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleTargetingAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRuleTargeting>
          }
          groupBy: {
            args: Prisma.SemanticRuleTargetingGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleTargetingGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleTargetingCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleTargetingCountAggregateOutputType> | number
          }
        }
      }
      SemanticRuleHitLog: {
        payload: Prisma.$SemanticRuleHitLogPayload<ExtArgs>
        fields: Prisma.SemanticRuleHitLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleHitLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleHitLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleHitLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleHitLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>
          }
          findMany: {
            args: Prisma.SemanticRuleHitLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>[]
          }
          create: {
            args: Prisma.SemanticRuleHitLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>
          }
          createMany: {
            args: Prisma.SemanticRuleHitLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleHitLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleHitLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>
          }
          update: {
            args: Prisma.SemanticRuleHitLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleHitLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleHitLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleHitLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleHitLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleHitLogPayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleHitLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRuleHitLog>
          }
          groupBy: {
            args: Prisma.SemanticRuleHitLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleHitLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleHitLogCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleHitLogCountAggregateOutputType> | number
          }
        }
      }
      SemanticRuleErrorLog: {
        payload: Prisma.$SemanticRuleErrorLogPayload<ExtArgs>
        fields: Prisma.SemanticRuleErrorLogFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SemanticRuleErrorLogFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SemanticRuleErrorLogFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>
          }
          findFirst: {
            args: Prisma.SemanticRuleErrorLogFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SemanticRuleErrorLogFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>
          }
          findMany: {
            args: Prisma.SemanticRuleErrorLogFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>[]
          }
          create: {
            args: Prisma.SemanticRuleErrorLogCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>
          }
          createMany: {
            args: Prisma.SemanticRuleErrorLogCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SemanticRuleErrorLogCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>[]
          }
          delete: {
            args: Prisma.SemanticRuleErrorLogDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>
          }
          update: {
            args: Prisma.SemanticRuleErrorLogUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>
          }
          deleteMany: {
            args: Prisma.SemanticRuleErrorLogDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SemanticRuleErrorLogUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SemanticRuleErrorLogUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>[]
          }
          upsert: {
            args: Prisma.SemanticRuleErrorLogUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SemanticRuleErrorLogPayload>
          }
          aggregate: {
            args: Prisma.SemanticRuleErrorLogAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSemanticRuleErrorLog>
          }
          groupBy: {
            args: Prisma.SemanticRuleErrorLogGroupByArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleErrorLogGroupByOutputType>[]
          }
          count: {
            args: Prisma.SemanticRuleErrorLogCountArgs<ExtArgs>
            result: $Utils.Optional<SemanticRuleErrorLogCountAggregateOutputType> | number
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
    semanticRuleDomain?: SemanticRuleDomainOmit
    semanticRuleSet?: SemanticRuleSetOmit
    semanticRule?: SemanticRuleOmit
    semanticRuleRelease?: SemanticRuleReleaseOmit
    semanticRuleTargeting?: SemanticRuleTargetingOmit
    semanticRuleHitLog?: SemanticRuleHitLogOmit
    semanticRuleErrorLog?: SemanticRuleErrorLogOmit
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
   * Count Type SemanticRuleDomainCountOutputType
   */

  export type SemanticRuleDomainCountOutputType = {
    ruleSets: number
    hitLogs: number
    errorLogs: number
  }

  export type SemanticRuleDomainCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSets?: boolean | SemanticRuleDomainCountOutputTypeCountRuleSetsArgs
    hitLogs?: boolean | SemanticRuleDomainCountOutputTypeCountHitLogsArgs
    errorLogs?: boolean | SemanticRuleDomainCountOutputTypeCountErrorLogsArgs
  }

  // Custom InputTypes
  /**
   * SemanticRuleDomainCountOutputType without action
   */
  export type SemanticRuleDomainCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomainCountOutputType
     */
    select?: SemanticRuleDomainCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SemanticRuleDomainCountOutputType without action
   */
  export type SemanticRuleDomainCountOutputTypeCountRuleSetsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleSetWhereInput
  }

  /**
   * SemanticRuleDomainCountOutputType without action
   */
  export type SemanticRuleDomainCountOutputTypeCountHitLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleHitLogWhereInput
  }

  /**
   * SemanticRuleDomainCountOutputType without action
   */
  export type SemanticRuleDomainCountOutputTypeCountErrorLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleErrorLogWhereInput
  }


  /**
   * Count Type SemanticRuleSetCountOutputType
   */

  export type SemanticRuleSetCountOutputType = {
    rules: number
    releases: number
    targetings: number
    hitLogs: number
    errorLogs: number
  }

  export type SemanticRuleSetCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    rules?: boolean | SemanticRuleSetCountOutputTypeCountRulesArgs
    releases?: boolean | SemanticRuleSetCountOutputTypeCountReleasesArgs
    targetings?: boolean | SemanticRuleSetCountOutputTypeCountTargetingsArgs
    hitLogs?: boolean | SemanticRuleSetCountOutputTypeCountHitLogsArgs
    errorLogs?: boolean | SemanticRuleSetCountOutputTypeCountErrorLogsArgs
  }

  // Custom InputTypes
  /**
   * SemanticRuleSetCountOutputType without action
   */
  export type SemanticRuleSetCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSetCountOutputType
     */
    select?: SemanticRuleSetCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SemanticRuleSetCountOutputType without action
   */
  export type SemanticRuleSetCountOutputTypeCountRulesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleWhereInput
  }

  /**
   * SemanticRuleSetCountOutputType without action
   */
  export type SemanticRuleSetCountOutputTypeCountReleasesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleReleaseWhereInput
  }

  /**
   * SemanticRuleSetCountOutputType without action
   */
  export type SemanticRuleSetCountOutputTypeCountTargetingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleTargetingWhereInput
  }

  /**
   * SemanticRuleSetCountOutputType without action
   */
  export type SemanticRuleSetCountOutputTypeCountHitLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleHitLogWhereInput
  }

  /**
   * SemanticRuleSetCountOutputType without action
   */
  export type SemanticRuleSetCountOutputTypeCountErrorLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleErrorLogWhereInput
  }


  /**
   * Models
   */

  /**
   * Model SemanticRuleDomain
   */

  export type AggregateSemanticRuleDomain = {
    _count: SemanticRuleDomainCountAggregateOutputType | null
    _min: SemanticRuleDomainMinAggregateOutputType | null
    _max: SemanticRuleDomainMaxAggregateOutputType | null
  }

  export type SemanticRuleDomainMinAggregateOutputType = {
    id: string | null
    code: string | null
    name: string | null
    description: string | null
    enabled: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SemanticRuleDomainMaxAggregateOutputType = {
    id: string | null
    code: string | null
    name: string | null
    description: string | null
    enabled: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SemanticRuleDomainCountAggregateOutputType = {
    id: number
    code: number
    name: number
    description: number
    enabled: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SemanticRuleDomainMinAggregateInputType = {
    id?: true
    code?: true
    name?: true
    description?: true
    enabled?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SemanticRuleDomainMaxAggregateInputType = {
    id?: true
    code?: true
    name?: true
    description?: true
    enabled?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SemanticRuleDomainCountAggregateInputType = {
    id?: true
    code?: true
    name?: true
    description?: true
    enabled?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SemanticRuleDomainAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleDomain to aggregate.
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleDomains to fetch.
     */
    orderBy?: SemanticRuleDomainOrderByWithRelationInput | SemanticRuleDomainOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleDomainWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleDomains from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleDomains.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRuleDomains
    **/
    _count?: true | SemanticRuleDomainCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleDomainMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleDomainMaxAggregateInputType
  }

  export type GetSemanticRuleDomainAggregateType<T extends SemanticRuleDomainAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRuleDomain]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRuleDomain[P]>
      : GetScalarType<T[P], AggregateSemanticRuleDomain[P]>
  }




  export type SemanticRuleDomainGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleDomainWhereInput
    orderBy?: SemanticRuleDomainOrderByWithAggregationInput | SemanticRuleDomainOrderByWithAggregationInput[]
    by: SemanticRuleDomainScalarFieldEnum[] | SemanticRuleDomainScalarFieldEnum
    having?: SemanticRuleDomainScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleDomainCountAggregateInputType | true
    _min?: SemanticRuleDomainMinAggregateInputType
    _max?: SemanticRuleDomainMaxAggregateInputType
  }

  export type SemanticRuleDomainGroupByOutputType = {
    id: string
    code: string
    name: string
    description: string | null
    enabled: boolean
    createdAt: Date
    updatedAt: Date
    _count: SemanticRuleDomainCountAggregateOutputType | null
    _min: SemanticRuleDomainMinAggregateOutputType | null
    _max: SemanticRuleDomainMaxAggregateOutputType | null
  }

  type GetSemanticRuleDomainGroupByPayload<T extends SemanticRuleDomainGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleDomainGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleDomainGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleDomainGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleDomainGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleDomainSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    code?: boolean
    name?: boolean
    description?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSets?: boolean | SemanticRuleDomain$ruleSetsArgs<ExtArgs>
    hitLogs?: boolean | SemanticRuleDomain$hitLogsArgs<ExtArgs>
    errorLogs?: boolean | SemanticRuleDomain$errorLogsArgs<ExtArgs>
    _count?: boolean | SemanticRuleDomainCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleDomain"]>

  export type SemanticRuleDomainSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    code?: boolean
    name?: boolean
    description?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["semanticRuleDomain"]>

  export type SemanticRuleDomainSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    code?: boolean
    name?: boolean
    description?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["semanticRuleDomain"]>

  export type SemanticRuleDomainSelectScalar = {
    id?: boolean
    code?: boolean
    name?: boolean
    description?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SemanticRuleDomainOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "code" | "name" | "description" | "enabled" | "createdAt" | "updatedAt", ExtArgs["result"]["semanticRuleDomain"]>
  export type SemanticRuleDomainInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSets?: boolean | SemanticRuleDomain$ruleSetsArgs<ExtArgs>
    hitLogs?: boolean | SemanticRuleDomain$hitLogsArgs<ExtArgs>
    errorLogs?: boolean | SemanticRuleDomain$errorLogsArgs<ExtArgs>
    _count?: boolean | SemanticRuleDomainCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SemanticRuleDomainIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type SemanticRuleDomainIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $SemanticRuleDomainPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRuleDomain"
    objects: {
      ruleSets: Prisma.$SemanticRuleSetPayload<ExtArgs>[]
      hitLogs: Prisma.$SemanticRuleHitLogPayload<ExtArgs>[]
      errorLogs: Prisma.$SemanticRuleErrorLogPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      code: string
      name: string
      description: string | null
      enabled: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["semanticRuleDomain"]>
    composites: {}
  }

  type SemanticRuleDomainGetPayload<S extends boolean | null | undefined | SemanticRuleDomainDefaultArgs> = $Result.GetResult<Prisma.$SemanticRuleDomainPayload, S>

  type SemanticRuleDomainCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleDomainFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleDomainCountAggregateInputType | true
    }

  export interface SemanticRuleDomainDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRuleDomain'], meta: { name: 'SemanticRuleDomain' } }
    /**
     * Find zero or one SemanticRuleDomain that matches the filter.
     * @param {SemanticRuleDomainFindUniqueArgs} args - Arguments to find a SemanticRuleDomain
     * @example
     * // Get one SemanticRuleDomain
     * const semanticRuleDomain = await prisma.semanticRuleDomain.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleDomainFindUniqueArgs>(args: SelectSubset<T, SemanticRuleDomainFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRuleDomain that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleDomainFindUniqueOrThrowArgs} args - Arguments to find a SemanticRuleDomain
     * @example
     * // Get one SemanticRuleDomain
     * const semanticRuleDomain = await prisma.semanticRuleDomain.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleDomainFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleDomainFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleDomain that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainFindFirstArgs} args - Arguments to find a SemanticRuleDomain
     * @example
     * // Get one SemanticRuleDomain
     * const semanticRuleDomain = await prisma.semanticRuleDomain.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleDomainFindFirstArgs>(args?: SelectSubset<T, SemanticRuleDomainFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleDomain that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainFindFirstOrThrowArgs} args - Arguments to find a SemanticRuleDomain
     * @example
     * // Get one SemanticRuleDomain
     * const semanticRuleDomain = await prisma.semanticRuleDomain.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleDomainFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleDomainFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRuleDomains that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRuleDomains
     * const semanticRuleDomains = await prisma.semanticRuleDomain.findMany()
     * 
     * // Get first 10 SemanticRuleDomains
     * const semanticRuleDomains = await prisma.semanticRuleDomain.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleDomainWithIdOnly = await prisma.semanticRuleDomain.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleDomainFindManyArgs>(args?: SelectSubset<T, SemanticRuleDomainFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRuleDomain.
     * @param {SemanticRuleDomainCreateArgs} args - Arguments to create a SemanticRuleDomain.
     * @example
     * // Create one SemanticRuleDomain
     * const SemanticRuleDomain = await prisma.semanticRuleDomain.create({
     *   data: {
     *     // ... data to create a SemanticRuleDomain
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleDomainCreateArgs>(args: SelectSubset<T, SemanticRuleDomainCreateArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRuleDomains.
     * @param {SemanticRuleDomainCreateManyArgs} args - Arguments to create many SemanticRuleDomains.
     * @example
     * // Create many SemanticRuleDomains
     * const semanticRuleDomain = await prisma.semanticRuleDomain.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleDomainCreateManyArgs>(args?: SelectSubset<T, SemanticRuleDomainCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRuleDomains and returns the data saved in the database.
     * @param {SemanticRuleDomainCreateManyAndReturnArgs} args - Arguments to create many SemanticRuleDomains.
     * @example
     * // Create many SemanticRuleDomains
     * const semanticRuleDomain = await prisma.semanticRuleDomain.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRuleDomains and only return the `id`
     * const semanticRuleDomainWithIdOnly = await prisma.semanticRuleDomain.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleDomainCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleDomainCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRuleDomain.
     * @param {SemanticRuleDomainDeleteArgs} args - Arguments to delete one SemanticRuleDomain.
     * @example
     * // Delete one SemanticRuleDomain
     * const SemanticRuleDomain = await prisma.semanticRuleDomain.delete({
     *   where: {
     *     // ... filter to delete one SemanticRuleDomain
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleDomainDeleteArgs>(args: SelectSubset<T, SemanticRuleDomainDeleteArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRuleDomain.
     * @param {SemanticRuleDomainUpdateArgs} args - Arguments to update one SemanticRuleDomain.
     * @example
     * // Update one SemanticRuleDomain
     * const semanticRuleDomain = await prisma.semanticRuleDomain.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleDomainUpdateArgs>(args: SelectSubset<T, SemanticRuleDomainUpdateArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRuleDomains.
     * @param {SemanticRuleDomainDeleteManyArgs} args - Arguments to filter SemanticRuleDomains to delete.
     * @example
     * // Delete a few SemanticRuleDomains
     * const { count } = await prisma.semanticRuleDomain.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleDomainDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleDomainDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleDomains.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRuleDomains
     * const semanticRuleDomain = await prisma.semanticRuleDomain.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleDomainUpdateManyArgs>(args: SelectSubset<T, SemanticRuleDomainUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleDomains and returns the data updated in the database.
     * @param {SemanticRuleDomainUpdateManyAndReturnArgs} args - Arguments to update many SemanticRuleDomains.
     * @example
     * // Update many SemanticRuleDomains
     * const semanticRuleDomain = await prisma.semanticRuleDomain.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRuleDomains and only return the `id`
     * const semanticRuleDomainWithIdOnly = await prisma.semanticRuleDomain.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleDomainUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleDomainUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRuleDomain.
     * @param {SemanticRuleDomainUpsertArgs} args - Arguments to update or create a SemanticRuleDomain.
     * @example
     * // Update or create a SemanticRuleDomain
     * const semanticRuleDomain = await prisma.semanticRuleDomain.upsert({
     *   create: {
     *     // ... data to create a SemanticRuleDomain
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRuleDomain we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleDomainUpsertArgs>(args: SelectSubset<T, SemanticRuleDomainUpsertArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRuleDomains.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainCountArgs} args - Arguments to filter SemanticRuleDomains to count.
     * @example
     * // Count the number of SemanticRuleDomains
     * const count = await prisma.semanticRuleDomain.count({
     *   where: {
     *     // ... the filter for the SemanticRuleDomains we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleDomainCountArgs>(
      args?: Subset<T, SemanticRuleDomainCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleDomainCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRuleDomain.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleDomainAggregateArgs>(args: Subset<T, SemanticRuleDomainAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleDomainAggregateType<T>>

    /**
     * Group by SemanticRuleDomain.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleDomainGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleDomainGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleDomainGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleDomainGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleDomainGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleDomainGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRuleDomain model
   */
  readonly fields: SemanticRuleDomainFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRuleDomain.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleDomainClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    ruleSets<T extends SemanticRuleDomain$ruleSetsArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleDomain$ruleSetsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    hitLogs<T extends SemanticRuleDomain$hitLogsArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleDomain$hitLogsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    errorLogs<T extends SemanticRuleDomain$errorLogsArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleDomain$errorLogsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
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
   * Fields of the SemanticRuleDomain model
   */
  interface SemanticRuleDomainFieldRefs {
    readonly id: FieldRef<"SemanticRuleDomain", 'String'>
    readonly code: FieldRef<"SemanticRuleDomain", 'String'>
    readonly name: FieldRef<"SemanticRuleDomain", 'String'>
    readonly description: FieldRef<"SemanticRuleDomain", 'String'>
    readonly enabled: FieldRef<"SemanticRuleDomain", 'Boolean'>
    readonly createdAt: FieldRef<"SemanticRuleDomain", 'DateTime'>
    readonly updatedAt: FieldRef<"SemanticRuleDomain", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRuleDomain findUnique
   */
  export type SemanticRuleDomainFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleDomain to fetch.
     */
    where: SemanticRuleDomainWhereUniqueInput
  }

  /**
   * SemanticRuleDomain findUniqueOrThrow
   */
  export type SemanticRuleDomainFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleDomain to fetch.
     */
    where: SemanticRuleDomainWhereUniqueInput
  }

  /**
   * SemanticRuleDomain findFirst
   */
  export type SemanticRuleDomainFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleDomain to fetch.
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleDomains to fetch.
     */
    orderBy?: SemanticRuleDomainOrderByWithRelationInput | SemanticRuleDomainOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleDomains.
     */
    cursor?: SemanticRuleDomainWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleDomains from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleDomains.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleDomains.
     */
    distinct?: SemanticRuleDomainScalarFieldEnum | SemanticRuleDomainScalarFieldEnum[]
  }

  /**
   * SemanticRuleDomain findFirstOrThrow
   */
  export type SemanticRuleDomainFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleDomain to fetch.
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleDomains to fetch.
     */
    orderBy?: SemanticRuleDomainOrderByWithRelationInput | SemanticRuleDomainOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleDomains.
     */
    cursor?: SemanticRuleDomainWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleDomains from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleDomains.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleDomains.
     */
    distinct?: SemanticRuleDomainScalarFieldEnum | SemanticRuleDomainScalarFieldEnum[]
  }

  /**
   * SemanticRuleDomain findMany
   */
  export type SemanticRuleDomainFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleDomains to fetch.
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleDomains to fetch.
     */
    orderBy?: SemanticRuleDomainOrderByWithRelationInput | SemanticRuleDomainOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRuleDomains.
     */
    cursor?: SemanticRuleDomainWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleDomains from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleDomains.
     */
    skip?: number
    distinct?: SemanticRuleDomainScalarFieldEnum | SemanticRuleDomainScalarFieldEnum[]
  }

  /**
   * SemanticRuleDomain create
   */
  export type SemanticRuleDomainCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRuleDomain.
     */
    data: XOR<SemanticRuleDomainCreateInput, SemanticRuleDomainUncheckedCreateInput>
  }

  /**
   * SemanticRuleDomain createMany
   */
  export type SemanticRuleDomainCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRuleDomains.
     */
    data: SemanticRuleDomainCreateManyInput | SemanticRuleDomainCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleDomain createManyAndReturn
   */
  export type SemanticRuleDomainCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRuleDomains.
     */
    data: SemanticRuleDomainCreateManyInput | SemanticRuleDomainCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleDomain update
   */
  export type SemanticRuleDomainUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRuleDomain.
     */
    data: XOR<SemanticRuleDomainUpdateInput, SemanticRuleDomainUncheckedUpdateInput>
    /**
     * Choose, which SemanticRuleDomain to update.
     */
    where: SemanticRuleDomainWhereUniqueInput
  }

  /**
   * SemanticRuleDomain updateMany
   */
  export type SemanticRuleDomainUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRuleDomains.
     */
    data: XOR<SemanticRuleDomainUpdateManyMutationInput, SemanticRuleDomainUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleDomains to update
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * Limit how many SemanticRuleDomains to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleDomain updateManyAndReturn
   */
  export type SemanticRuleDomainUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRuleDomains.
     */
    data: XOR<SemanticRuleDomainUpdateManyMutationInput, SemanticRuleDomainUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleDomains to update
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * Limit how many SemanticRuleDomains to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleDomain upsert
   */
  export type SemanticRuleDomainUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRuleDomain to update in case it exists.
     */
    where: SemanticRuleDomainWhereUniqueInput
    /**
     * In case the SemanticRuleDomain found by the `where` argument doesn't exist, create a new SemanticRuleDomain with this data.
     */
    create: XOR<SemanticRuleDomainCreateInput, SemanticRuleDomainUncheckedCreateInput>
    /**
     * In case the SemanticRuleDomain was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleDomainUpdateInput, SemanticRuleDomainUncheckedUpdateInput>
  }

  /**
   * SemanticRuleDomain delete
   */
  export type SemanticRuleDomainDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
    /**
     * Filter which SemanticRuleDomain to delete.
     */
    where: SemanticRuleDomainWhereUniqueInput
  }

  /**
   * SemanticRuleDomain deleteMany
   */
  export type SemanticRuleDomainDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleDomains to delete
     */
    where?: SemanticRuleDomainWhereInput
    /**
     * Limit how many SemanticRuleDomains to delete.
     */
    limit?: number
  }

  /**
   * SemanticRuleDomain.ruleSets
   */
  export type SemanticRuleDomain$ruleSetsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    where?: SemanticRuleSetWhereInput
    orderBy?: SemanticRuleSetOrderByWithRelationInput | SemanticRuleSetOrderByWithRelationInput[]
    cursor?: SemanticRuleSetWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleSetScalarFieldEnum | SemanticRuleSetScalarFieldEnum[]
  }

  /**
   * SemanticRuleDomain.hitLogs
   */
  export type SemanticRuleDomain$hitLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    where?: SemanticRuleHitLogWhereInput
    orderBy?: SemanticRuleHitLogOrderByWithRelationInput | SemanticRuleHitLogOrderByWithRelationInput[]
    cursor?: SemanticRuleHitLogWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleHitLogScalarFieldEnum | SemanticRuleHitLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleDomain.errorLogs
   */
  export type SemanticRuleDomain$errorLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    where?: SemanticRuleErrorLogWhereInput
    orderBy?: SemanticRuleErrorLogOrderByWithRelationInput | SemanticRuleErrorLogOrderByWithRelationInput[]
    cursor?: SemanticRuleErrorLogWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleErrorLogScalarFieldEnum | SemanticRuleErrorLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleDomain without action
   */
  export type SemanticRuleDomainDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleDomain
     */
    select?: SemanticRuleDomainSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleDomain
     */
    omit?: SemanticRuleDomainOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleDomainInclude<ExtArgs> | null
  }


  /**
   * Model SemanticRuleSet
   */

  export type AggregateSemanticRuleSet = {
    _count: SemanticRuleSetCountAggregateOutputType | null
    _min: SemanticRuleSetMinAggregateOutputType | null
    _max: SemanticRuleSetMaxAggregateOutputType | null
  }

  export type SemanticRuleSetMinAggregateOutputType = {
    id: string | null
    domainId: string | null
    key: string | null
    name: string | null
    version: string | null
    status: $Enums.SemanticRuleSetStatus | null
    description: string | null
    basedOnRuleSetId: string | null
    changeSummary: string | null
    createdBy: string | null
    createdAt: Date | null
    updatedAt: Date | null
    activatedAt: Date | null
    archivedAt: Date | null
  }

  export type SemanticRuleSetMaxAggregateOutputType = {
    id: string | null
    domainId: string | null
    key: string | null
    name: string | null
    version: string | null
    status: $Enums.SemanticRuleSetStatus | null
    description: string | null
    basedOnRuleSetId: string | null
    changeSummary: string | null
    createdBy: string | null
    createdAt: Date | null
    updatedAt: Date | null
    activatedAt: Date | null
    archivedAt: Date | null
  }

  export type SemanticRuleSetCountAggregateOutputType = {
    id: number
    domainId: number
    key: number
    name: number
    version: number
    status: number
    description: number
    basedOnRuleSetId: number
    changeSummary: number
    createdBy: number
    createdAt: number
    updatedAt: number
    activatedAt: number
    archivedAt: number
    _all: number
  }


  export type SemanticRuleSetMinAggregateInputType = {
    id?: true
    domainId?: true
    key?: true
    name?: true
    version?: true
    status?: true
    description?: true
    basedOnRuleSetId?: true
    changeSummary?: true
    createdBy?: true
    createdAt?: true
    updatedAt?: true
    activatedAt?: true
    archivedAt?: true
  }

  export type SemanticRuleSetMaxAggregateInputType = {
    id?: true
    domainId?: true
    key?: true
    name?: true
    version?: true
    status?: true
    description?: true
    basedOnRuleSetId?: true
    changeSummary?: true
    createdBy?: true
    createdAt?: true
    updatedAt?: true
    activatedAt?: true
    archivedAt?: true
  }

  export type SemanticRuleSetCountAggregateInputType = {
    id?: true
    domainId?: true
    key?: true
    name?: true
    version?: true
    status?: true
    description?: true
    basedOnRuleSetId?: true
    changeSummary?: true
    createdBy?: true
    createdAt?: true
    updatedAt?: true
    activatedAt?: true
    archivedAt?: true
    _all?: true
  }

  export type SemanticRuleSetAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleSet to aggregate.
     */
    where?: SemanticRuleSetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleSets to fetch.
     */
    orderBy?: SemanticRuleSetOrderByWithRelationInput | SemanticRuleSetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleSetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleSets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleSets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRuleSets
    **/
    _count?: true | SemanticRuleSetCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleSetMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleSetMaxAggregateInputType
  }

  export type GetSemanticRuleSetAggregateType<T extends SemanticRuleSetAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRuleSet]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRuleSet[P]>
      : GetScalarType<T[P], AggregateSemanticRuleSet[P]>
  }




  export type SemanticRuleSetGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleSetWhereInput
    orderBy?: SemanticRuleSetOrderByWithAggregationInput | SemanticRuleSetOrderByWithAggregationInput[]
    by: SemanticRuleSetScalarFieldEnum[] | SemanticRuleSetScalarFieldEnum
    having?: SemanticRuleSetScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleSetCountAggregateInputType | true
    _min?: SemanticRuleSetMinAggregateInputType
    _max?: SemanticRuleSetMaxAggregateInputType
  }

  export type SemanticRuleSetGroupByOutputType = {
    id: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description: string | null
    basedOnRuleSetId: string | null
    changeSummary: string | null
    createdBy: string
    createdAt: Date
    updatedAt: Date
    activatedAt: Date | null
    archivedAt: Date | null
    _count: SemanticRuleSetCountAggregateOutputType | null
    _min: SemanticRuleSetMinAggregateOutputType | null
    _max: SemanticRuleSetMaxAggregateOutputType | null
  }

  type GetSemanticRuleSetGroupByPayload<T extends SemanticRuleSetGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleSetGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleSetGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleSetGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleSetGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleSetSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    key?: boolean
    name?: boolean
    version?: boolean
    status?: boolean
    description?: boolean
    basedOnRuleSetId?: boolean
    changeSummary?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    activatedAt?: boolean
    archivedAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    rules?: boolean | SemanticRuleSet$rulesArgs<ExtArgs>
    releases?: boolean | SemanticRuleSet$releasesArgs<ExtArgs>
    targetings?: boolean | SemanticRuleSet$targetingsArgs<ExtArgs>
    hitLogs?: boolean | SemanticRuleSet$hitLogsArgs<ExtArgs>
    errorLogs?: boolean | SemanticRuleSet$errorLogsArgs<ExtArgs>
    _count?: boolean | SemanticRuleSetCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleSet"]>

  export type SemanticRuleSetSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    key?: boolean
    name?: boolean
    version?: boolean
    status?: boolean
    description?: boolean
    basedOnRuleSetId?: boolean
    changeSummary?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    activatedAt?: boolean
    archivedAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleSet"]>

  export type SemanticRuleSetSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    key?: boolean
    name?: boolean
    version?: boolean
    status?: boolean
    description?: boolean
    basedOnRuleSetId?: boolean
    changeSummary?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    activatedAt?: boolean
    archivedAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleSet"]>

  export type SemanticRuleSetSelectScalar = {
    id?: boolean
    domainId?: boolean
    key?: boolean
    name?: boolean
    version?: boolean
    status?: boolean
    description?: boolean
    basedOnRuleSetId?: boolean
    changeSummary?: boolean
    createdBy?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    activatedAt?: boolean
    archivedAt?: boolean
  }

  export type SemanticRuleSetOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "domainId" | "key" | "name" | "version" | "status" | "description" | "basedOnRuleSetId" | "changeSummary" | "createdBy" | "createdAt" | "updatedAt" | "activatedAt" | "archivedAt", ExtArgs["result"]["semanticRuleSet"]>
  export type SemanticRuleSetInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    rules?: boolean | SemanticRuleSet$rulesArgs<ExtArgs>
    releases?: boolean | SemanticRuleSet$releasesArgs<ExtArgs>
    targetings?: boolean | SemanticRuleSet$targetingsArgs<ExtArgs>
    hitLogs?: boolean | SemanticRuleSet$hitLogsArgs<ExtArgs>
    errorLogs?: boolean | SemanticRuleSet$errorLogsArgs<ExtArgs>
    _count?: boolean | SemanticRuleSetCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SemanticRuleSetIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
  }
  export type SemanticRuleSetIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
  }

  export type $SemanticRuleSetPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRuleSet"
    objects: {
      domain: Prisma.$SemanticRuleDomainPayload<ExtArgs>
      rules: Prisma.$SemanticRulePayload<ExtArgs>[]
      releases: Prisma.$SemanticRuleReleasePayload<ExtArgs>[]
      targetings: Prisma.$SemanticRuleTargetingPayload<ExtArgs>[]
      hitLogs: Prisma.$SemanticRuleHitLogPayload<ExtArgs>[]
      errorLogs: Prisma.$SemanticRuleErrorLogPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      domainId: string
      key: string
      name: string
      version: string
      status: $Enums.SemanticRuleSetStatus
      description: string | null
      basedOnRuleSetId: string | null
      changeSummary: string | null
      createdBy: string
      createdAt: Date
      updatedAt: Date
      activatedAt: Date | null
      archivedAt: Date | null
    }, ExtArgs["result"]["semanticRuleSet"]>
    composites: {}
  }

  type SemanticRuleSetGetPayload<S extends boolean | null | undefined | SemanticRuleSetDefaultArgs> = $Result.GetResult<Prisma.$SemanticRuleSetPayload, S>

  type SemanticRuleSetCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleSetFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleSetCountAggregateInputType | true
    }

  export interface SemanticRuleSetDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRuleSet'], meta: { name: 'SemanticRuleSet' } }
    /**
     * Find zero or one SemanticRuleSet that matches the filter.
     * @param {SemanticRuleSetFindUniqueArgs} args - Arguments to find a SemanticRuleSet
     * @example
     * // Get one SemanticRuleSet
     * const semanticRuleSet = await prisma.semanticRuleSet.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleSetFindUniqueArgs>(args: SelectSubset<T, SemanticRuleSetFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRuleSet that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleSetFindUniqueOrThrowArgs} args - Arguments to find a SemanticRuleSet
     * @example
     * // Get one SemanticRuleSet
     * const semanticRuleSet = await prisma.semanticRuleSet.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleSetFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleSetFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleSet that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetFindFirstArgs} args - Arguments to find a SemanticRuleSet
     * @example
     * // Get one SemanticRuleSet
     * const semanticRuleSet = await prisma.semanticRuleSet.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleSetFindFirstArgs>(args?: SelectSubset<T, SemanticRuleSetFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleSet that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetFindFirstOrThrowArgs} args - Arguments to find a SemanticRuleSet
     * @example
     * // Get one SemanticRuleSet
     * const semanticRuleSet = await prisma.semanticRuleSet.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleSetFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleSetFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRuleSets that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRuleSets
     * const semanticRuleSets = await prisma.semanticRuleSet.findMany()
     * 
     * // Get first 10 SemanticRuleSets
     * const semanticRuleSets = await prisma.semanticRuleSet.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleSetWithIdOnly = await prisma.semanticRuleSet.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleSetFindManyArgs>(args?: SelectSubset<T, SemanticRuleSetFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRuleSet.
     * @param {SemanticRuleSetCreateArgs} args - Arguments to create a SemanticRuleSet.
     * @example
     * // Create one SemanticRuleSet
     * const SemanticRuleSet = await prisma.semanticRuleSet.create({
     *   data: {
     *     // ... data to create a SemanticRuleSet
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleSetCreateArgs>(args: SelectSubset<T, SemanticRuleSetCreateArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRuleSets.
     * @param {SemanticRuleSetCreateManyArgs} args - Arguments to create many SemanticRuleSets.
     * @example
     * // Create many SemanticRuleSets
     * const semanticRuleSet = await prisma.semanticRuleSet.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleSetCreateManyArgs>(args?: SelectSubset<T, SemanticRuleSetCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRuleSets and returns the data saved in the database.
     * @param {SemanticRuleSetCreateManyAndReturnArgs} args - Arguments to create many SemanticRuleSets.
     * @example
     * // Create many SemanticRuleSets
     * const semanticRuleSet = await prisma.semanticRuleSet.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRuleSets and only return the `id`
     * const semanticRuleSetWithIdOnly = await prisma.semanticRuleSet.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleSetCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleSetCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRuleSet.
     * @param {SemanticRuleSetDeleteArgs} args - Arguments to delete one SemanticRuleSet.
     * @example
     * // Delete one SemanticRuleSet
     * const SemanticRuleSet = await prisma.semanticRuleSet.delete({
     *   where: {
     *     // ... filter to delete one SemanticRuleSet
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleSetDeleteArgs>(args: SelectSubset<T, SemanticRuleSetDeleteArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRuleSet.
     * @param {SemanticRuleSetUpdateArgs} args - Arguments to update one SemanticRuleSet.
     * @example
     * // Update one SemanticRuleSet
     * const semanticRuleSet = await prisma.semanticRuleSet.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleSetUpdateArgs>(args: SelectSubset<T, SemanticRuleSetUpdateArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRuleSets.
     * @param {SemanticRuleSetDeleteManyArgs} args - Arguments to filter SemanticRuleSets to delete.
     * @example
     * // Delete a few SemanticRuleSets
     * const { count } = await prisma.semanticRuleSet.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleSetDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleSetDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleSets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRuleSets
     * const semanticRuleSet = await prisma.semanticRuleSet.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleSetUpdateManyArgs>(args: SelectSubset<T, SemanticRuleSetUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleSets and returns the data updated in the database.
     * @param {SemanticRuleSetUpdateManyAndReturnArgs} args - Arguments to update many SemanticRuleSets.
     * @example
     * // Update many SemanticRuleSets
     * const semanticRuleSet = await prisma.semanticRuleSet.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRuleSets and only return the `id`
     * const semanticRuleSetWithIdOnly = await prisma.semanticRuleSet.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleSetUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleSetUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRuleSet.
     * @param {SemanticRuleSetUpsertArgs} args - Arguments to update or create a SemanticRuleSet.
     * @example
     * // Update or create a SemanticRuleSet
     * const semanticRuleSet = await prisma.semanticRuleSet.upsert({
     *   create: {
     *     // ... data to create a SemanticRuleSet
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRuleSet we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleSetUpsertArgs>(args: SelectSubset<T, SemanticRuleSetUpsertArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRuleSets.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetCountArgs} args - Arguments to filter SemanticRuleSets to count.
     * @example
     * // Count the number of SemanticRuleSets
     * const count = await prisma.semanticRuleSet.count({
     *   where: {
     *     // ... the filter for the SemanticRuleSets we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleSetCountArgs>(
      args?: Subset<T, SemanticRuleSetCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleSetCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRuleSet.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleSetAggregateArgs>(args: Subset<T, SemanticRuleSetAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleSetAggregateType<T>>

    /**
     * Group by SemanticRuleSet.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleSetGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleSetGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleSetGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleSetGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleSetGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleSetGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRuleSet model
   */
  readonly fields: SemanticRuleSetFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRuleSet.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleSetClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    domain<T extends SemanticRuleDomainDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleDomainDefaultArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    rules<T extends SemanticRuleSet$rulesArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSet$rulesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    releases<T extends SemanticRuleSet$releasesArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSet$releasesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    targetings<T extends SemanticRuleSet$targetingsArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSet$targetingsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    hitLogs<T extends SemanticRuleSet$hitLogsArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSet$hitLogsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    errorLogs<T extends SemanticRuleSet$errorLogsArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSet$errorLogsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
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
   * Fields of the SemanticRuleSet model
   */
  interface SemanticRuleSetFieldRefs {
    readonly id: FieldRef<"SemanticRuleSet", 'String'>
    readonly domainId: FieldRef<"SemanticRuleSet", 'String'>
    readonly key: FieldRef<"SemanticRuleSet", 'String'>
    readonly name: FieldRef<"SemanticRuleSet", 'String'>
    readonly version: FieldRef<"SemanticRuleSet", 'String'>
    readonly status: FieldRef<"SemanticRuleSet", 'SemanticRuleSetStatus'>
    readonly description: FieldRef<"SemanticRuleSet", 'String'>
    readonly basedOnRuleSetId: FieldRef<"SemanticRuleSet", 'String'>
    readonly changeSummary: FieldRef<"SemanticRuleSet", 'String'>
    readonly createdBy: FieldRef<"SemanticRuleSet", 'String'>
    readonly createdAt: FieldRef<"SemanticRuleSet", 'DateTime'>
    readonly updatedAt: FieldRef<"SemanticRuleSet", 'DateTime'>
    readonly activatedAt: FieldRef<"SemanticRuleSet", 'DateTime'>
    readonly archivedAt: FieldRef<"SemanticRuleSet", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRuleSet findUnique
   */
  export type SemanticRuleSetFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleSet to fetch.
     */
    where: SemanticRuleSetWhereUniqueInput
  }

  /**
   * SemanticRuleSet findUniqueOrThrow
   */
  export type SemanticRuleSetFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleSet to fetch.
     */
    where: SemanticRuleSetWhereUniqueInput
  }

  /**
   * SemanticRuleSet findFirst
   */
  export type SemanticRuleSetFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleSet to fetch.
     */
    where?: SemanticRuleSetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleSets to fetch.
     */
    orderBy?: SemanticRuleSetOrderByWithRelationInput | SemanticRuleSetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleSets.
     */
    cursor?: SemanticRuleSetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleSets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleSets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleSets.
     */
    distinct?: SemanticRuleSetScalarFieldEnum | SemanticRuleSetScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet findFirstOrThrow
   */
  export type SemanticRuleSetFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleSet to fetch.
     */
    where?: SemanticRuleSetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleSets to fetch.
     */
    orderBy?: SemanticRuleSetOrderByWithRelationInput | SemanticRuleSetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleSets.
     */
    cursor?: SemanticRuleSetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleSets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleSets.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleSets.
     */
    distinct?: SemanticRuleSetScalarFieldEnum | SemanticRuleSetScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet findMany
   */
  export type SemanticRuleSetFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleSets to fetch.
     */
    where?: SemanticRuleSetWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleSets to fetch.
     */
    orderBy?: SemanticRuleSetOrderByWithRelationInput | SemanticRuleSetOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRuleSets.
     */
    cursor?: SemanticRuleSetWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleSets from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleSets.
     */
    skip?: number
    distinct?: SemanticRuleSetScalarFieldEnum | SemanticRuleSetScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet create
   */
  export type SemanticRuleSetCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRuleSet.
     */
    data: XOR<SemanticRuleSetCreateInput, SemanticRuleSetUncheckedCreateInput>
  }

  /**
   * SemanticRuleSet createMany
   */
  export type SemanticRuleSetCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRuleSets.
     */
    data: SemanticRuleSetCreateManyInput | SemanticRuleSetCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleSet createManyAndReturn
   */
  export type SemanticRuleSetCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRuleSets.
     */
    data: SemanticRuleSetCreateManyInput | SemanticRuleSetCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleSet update
   */
  export type SemanticRuleSetUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRuleSet.
     */
    data: XOR<SemanticRuleSetUpdateInput, SemanticRuleSetUncheckedUpdateInput>
    /**
     * Choose, which SemanticRuleSet to update.
     */
    where: SemanticRuleSetWhereUniqueInput
  }

  /**
   * SemanticRuleSet updateMany
   */
  export type SemanticRuleSetUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRuleSets.
     */
    data: XOR<SemanticRuleSetUpdateManyMutationInput, SemanticRuleSetUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleSets to update
     */
    where?: SemanticRuleSetWhereInput
    /**
     * Limit how many SemanticRuleSets to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleSet updateManyAndReturn
   */
  export type SemanticRuleSetUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRuleSets.
     */
    data: XOR<SemanticRuleSetUpdateManyMutationInput, SemanticRuleSetUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleSets to update
     */
    where?: SemanticRuleSetWhereInput
    /**
     * Limit how many SemanticRuleSets to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleSet upsert
   */
  export type SemanticRuleSetUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRuleSet to update in case it exists.
     */
    where: SemanticRuleSetWhereUniqueInput
    /**
     * In case the SemanticRuleSet found by the `where` argument doesn't exist, create a new SemanticRuleSet with this data.
     */
    create: XOR<SemanticRuleSetCreateInput, SemanticRuleSetUncheckedCreateInput>
    /**
     * In case the SemanticRuleSet was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleSetUpdateInput, SemanticRuleSetUncheckedUpdateInput>
  }

  /**
   * SemanticRuleSet delete
   */
  export type SemanticRuleSetDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    /**
     * Filter which SemanticRuleSet to delete.
     */
    where: SemanticRuleSetWhereUniqueInput
  }

  /**
   * SemanticRuleSet deleteMany
   */
  export type SemanticRuleSetDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleSets to delete
     */
    where?: SemanticRuleSetWhereInput
    /**
     * Limit how many SemanticRuleSets to delete.
     */
    limit?: number
  }

  /**
   * SemanticRuleSet.rules
   */
  export type SemanticRuleSet$rulesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    where?: SemanticRuleWhereInput
    orderBy?: SemanticRuleOrderByWithRelationInput | SemanticRuleOrderByWithRelationInput[]
    cursor?: SemanticRuleWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleScalarFieldEnum | SemanticRuleScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet.releases
   */
  export type SemanticRuleSet$releasesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    where?: SemanticRuleReleaseWhereInput
    orderBy?: SemanticRuleReleaseOrderByWithRelationInput | SemanticRuleReleaseOrderByWithRelationInput[]
    cursor?: SemanticRuleReleaseWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleReleaseScalarFieldEnum | SemanticRuleReleaseScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet.targetings
   */
  export type SemanticRuleSet$targetingsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    where?: SemanticRuleTargetingWhereInput
    orderBy?: SemanticRuleTargetingOrderByWithRelationInput | SemanticRuleTargetingOrderByWithRelationInput[]
    cursor?: SemanticRuleTargetingWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleTargetingScalarFieldEnum | SemanticRuleTargetingScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet.hitLogs
   */
  export type SemanticRuleSet$hitLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    where?: SemanticRuleHitLogWhereInput
    orderBy?: SemanticRuleHitLogOrderByWithRelationInput | SemanticRuleHitLogOrderByWithRelationInput[]
    cursor?: SemanticRuleHitLogWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleHitLogScalarFieldEnum | SemanticRuleHitLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet.errorLogs
   */
  export type SemanticRuleSet$errorLogsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    where?: SemanticRuleErrorLogWhereInput
    orderBy?: SemanticRuleErrorLogOrderByWithRelationInput | SemanticRuleErrorLogOrderByWithRelationInput[]
    cursor?: SemanticRuleErrorLogWhereUniqueInput
    take?: number
    skip?: number
    distinct?: SemanticRuleErrorLogScalarFieldEnum | SemanticRuleErrorLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleSet without action
   */
  export type SemanticRuleSetDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
  }


  /**
   * Model SemanticRule
   */

  export type AggregateSemanticRule = {
    _count: SemanticRuleCountAggregateOutputType | null
    _avg: SemanticRuleAvgAggregateOutputType | null
    _sum: SemanticRuleSumAggregateOutputType | null
    _min: SemanticRuleMinAggregateOutputType | null
    _max: SemanticRuleMaxAggregateOutputType | null
  }

  export type SemanticRuleAvgAggregateOutputType = {
    priority: number | null
  }

  export type SemanticRuleSumAggregateOutputType = {
    priority: number | null
  }

  export type SemanticRuleMinAggregateOutputType = {
    id: string | null
    ruleSetId: string | null
    type: $Enums.SemanticRuleType | null
    name: string | null
    enabled: boolean | null
    priority: number | null
    stopOnMatch: boolean | null
    flags: string | null
    note: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SemanticRuleMaxAggregateOutputType = {
    id: string | null
    ruleSetId: string | null
    type: $Enums.SemanticRuleType | null
    name: string | null
    enabled: boolean | null
    priority: number | null
    stopOnMatch: boolean | null
    flags: string | null
    note: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SemanticRuleCountAggregateOutputType = {
    id: number
    ruleSetId: number
    type: number
    name: number
    enabled: number
    priority: number
    stopOnMatch: number
    flags: number
    patterns: number
    outputs: number
    examples: number
    negativeExamples: number
    tags: number
    note: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SemanticRuleAvgAggregateInputType = {
    priority?: true
  }

  export type SemanticRuleSumAggregateInputType = {
    priority?: true
  }

  export type SemanticRuleMinAggregateInputType = {
    id?: true
    ruleSetId?: true
    type?: true
    name?: true
    enabled?: true
    priority?: true
    stopOnMatch?: true
    flags?: true
    note?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SemanticRuleMaxAggregateInputType = {
    id?: true
    ruleSetId?: true
    type?: true
    name?: true
    enabled?: true
    priority?: true
    stopOnMatch?: true
    flags?: true
    note?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SemanticRuleCountAggregateInputType = {
    id?: true
    ruleSetId?: true
    type?: true
    name?: true
    enabled?: true
    priority?: true
    stopOnMatch?: true
    flags?: true
    patterns?: true
    outputs?: true
    examples?: true
    negativeExamples?: true
    tags?: true
    note?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SemanticRuleAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRule to aggregate.
     */
    where?: SemanticRuleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRules to fetch.
     */
    orderBy?: SemanticRuleOrderByWithRelationInput | SemanticRuleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRules from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRules.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRules
    **/
    _count?: true | SemanticRuleCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SemanticRuleAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SemanticRuleSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleMaxAggregateInputType
  }

  export type GetSemanticRuleAggregateType<T extends SemanticRuleAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRule]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRule[P]>
      : GetScalarType<T[P], AggregateSemanticRule[P]>
  }




  export type SemanticRuleGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleWhereInput
    orderBy?: SemanticRuleOrderByWithAggregationInput | SemanticRuleOrderByWithAggregationInput[]
    by: SemanticRuleScalarFieldEnum[] | SemanticRuleScalarFieldEnum
    having?: SemanticRuleScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleCountAggregateInputType | true
    _avg?: SemanticRuleAvgAggregateInputType
    _sum?: SemanticRuleSumAggregateInputType
    _min?: SemanticRuleMinAggregateInputType
    _max?: SemanticRuleMaxAggregateInputType
  }

  export type SemanticRuleGroupByOutputType = {
    id: string
    ruleSetId: string
    type: $Enums.SemanticRuleType
    name: string
    enabled: boolean
    priority: number
    stopOnMatch: boolean
    flags: string | null
    patterns: JsonValue
    outputs: JsonValue
    examples: JsonValue | null
    negativeExamples: JsonValue | null
    tags: JsonValue | null
    note: string | null
    createdAt: Date
    updatedAt: Date
    _count: SemanticRuleCountAggregateOutputType | null
    _avg: SemanticRuleAvgAggregateOutputType | null
    _sum: SemanticRuleSumAggregateOutputType | null
    _min: SemanticRuleMinAggregateOutputType | null
    _max: SemanticRuleMaxAggregateOutputType | null
  }

  type GetSemanticRuleGroupByPayload<T extends SemanticRuleGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    type?: boolean
    name?: boolean
    enabled?: boolean
    priority?: boolean
    stopOnMatch?: boolean
    flags?: boolean
    patterns?: boolean
    outputs?: boolean
    examples?: boolean
    negativeExamples?: boolean
    tags?: boolean
    note?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRule"]>

  export type SemanticRuleSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    type?: boolean
    name?: boolean
    enabled?: boolean
    priority?: boolean
    stopOnMatch?: boolean
    flags?: boolean
    patterns?: boolean
    outputs?: boolean
    examples?: boolean
    negativeExamples?: boolean
    tags?: boolean
    note?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRule"]>

  export type SemanticRuleSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    type?: boolean
    name?: boolean
    enabled?: boolean
    priority?: boolean
    stopOnMatch?: boolean
    flags?: boolean
    patterns?: boolean
    outputs?: boolean
    examples?: boolean
    negativeExamples?: boolean
    tags?: boolean
    note?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRule"]>

  export type SemanticRuleSelectScalar = {
    id?: boolean
    ruleSetId?: boolean
    type?: boolean
    name?: boolean
    enabled?: boolean
    priority?: boolean
    stopOnMatch?: boolean
    flags?: boolean
    patterns?: boolean
    outputs?: boolean
    examples?: boolean
    negativeExamples?: boolean
    tags?: boolean
    note?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SemanticRuleOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "ruleSetId" | "type" | "name" | "enabled" | "priority" | "stopOnMatch" | "flags" | "patterns" | "outputs" | "examples" | "negativeExamples" | "tags" | "note" | "createdAt" | "updatedAt", ExtArgs["result"]["semanticRule"]>
  export type SemanticRuleInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }
  export type SemanticRuleIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }
  export type SemanticRuleIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }

  export type $SemanticRulePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRule"
    objects: {
      ruleSet: Prisma.$SemanticRuleSetPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      ruleSetId: string
      type: $Enums.SemanticRuleType
      name: string
      enabled: boolean
      priority: number
      stopOnMatch: boolean
      flags: string | null
      patterns: Prisma.JsonValue
      outputs: Prisma.JsonValue
      examples: Prisma.JsonValue | null
      negativeExamples: Prisma.JsonValue | null
      tags: Prisma.JsonValue | null
      note: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["semanticRule"]>
    composites: {}
  }

  type SemanticRuleGetPayload<S extends boolean | null | undefined | SemanticRuleDefaultArgs> = $Result.GetResult<Prisma.$SemanticRulePayload, S>

  type SemanticRuleCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleCountAggregateInputType | true
    }

  export interface SemanticRuleDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRule'], meta: { name: 'SemanticRule' } }
    /**
     * Find zero or one SemanticRule that matches the filter.
     * @param {SemanticRuleFindUniqueArgs} args - Arguments to find a SemanticRule
     * @example
     * // Get one SemanticRule
     * const semanticRule = await prisma.semanticRule.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleFindUniqueArgs>(args: SelectSubset<T, SemanticRuleFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRule that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleFindUniqueOrThrowArgs} args - Arguments to find a SemanticRule
     * @example
     * // Get one SemanticRule
     * const semanticRule = await prisma.semanticRule.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRule that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleFindFirstArgs} args - Arguments to find a SemanticRule
     * @example
     * // Get one SemanticRule
     * const semanticRule = await prisma.semanticRule.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleFindFirstArgs>(args?: SelectSubset<T, SemanticRuleFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRule that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleFindFirstOrThrowArgs} args - Arguments to find a SemanticRule
     * @example
     * // Get one SemanticRule
     * const semanticRule = await prisma.semanticRule.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRules that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRules
     * const semanticRules = await prisma.semanticRule.findMany()
     * 
     * // Get first 10 SemanticRules
     * const semanticRules = await prisma.semanticRule.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleWithIdOnly = await prisma.semanticRule.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleFindManyArgs>(args?: SelectSubset<T, SemanticRuleFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRule.
     * @param {SemanticRuleCreateArgs} args - Arguments to create a SemanticRule.
     * @example
     * // Create one SemanticRule
     * const SemanticRule = await prisma.semanticRule.create({
     *   data: {
     *     // ... data to create a SemanticRule
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleCreateArgs>(args: SelectSubset<T, SemanticRuleCreateArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRules.
     * @param {SemanticRuleCreateManyArgs} args - Arguments to create many SemanticRules.
     * @example
     * // Create many SemanticRules
     * const semanticRule = await prisma.semanticRule.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleCreateManyArgs>(args?: SelectSubset<T, SemanticRuleCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRules and returns the data saved in the database.
     * @param {SemanticRuleCreateManyAndReturnArgs} args - Arguments to create many SemanticRules.
     * @example
     * // Create many SemanticRules
     * const semanticRule = await prisma.semanticRule.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRules and only return the `id`
     * const semanticRuleWithIdOnly = await prisma.semanticRule.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRule.
     * @param {SemanticRuleDeleteArgs} args - Arguments to delete one SemanticRule.
     * @example
     * // Delete one SemanticRule
     * const SemanticRule = await prisma.semanticRule.delete({
     *   where: {
     *     // ... filter to delete one SemanticRule
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleDeleteArgs>(args: SelectSubset<T, SemanticRuleDeleteArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRule.
     * @param {SemanticRuleUpdateArgs} args - Arguments to update one SemanticRule.
     * @example
     * // Update one SemanticRule
     * const semanticRule = await prisma.semanticRule.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleUpdateArgs>(args: SelectSubset<T, SemanticRuleUpdateArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRules.
     * @param {SemanticRuleDeleteManyArgs} args - Arguments to filter SemanticRules to delete.
     * @example
     * // Delete a few SemanticRules
     * const { count } = await prisma.semanticRule.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRules.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRules
     * const semanticRule = await prisma.semanticRule.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleUpdateManyArgs>(args: SelectSubset<T, SemanticRuleUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRules and returns the data updated in the database.
     * @param {SemanticRuleUpdateManyAndReturnArgs} args - Arguments to update many SemanticRules.
     * @example
     * // Update many SemanticRules
     * const semanticRule = await prisma.semanticRule.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRules and only return the `id`
     * const semanticRuleWithIdOnly = await prisma.semanticRule.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRule.
     * @param {SemanticRuleUpsertArgs} args - Arguments to update or create a SemanticRule.
     * @example
     * // Update or create a SemanticRule
     * const semanticRule = await prisma.semanticRule.upsert({
     *   create: {
     *     // ... data to create a SemanticRule
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRule we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleUpsertArgs>(args: SelectSubset<T, SemanticRuleUpsertArgs<ExtArgs>>): Prisma__SemanticRuleClient<$Result.GetResult<Prisma.$SemanticRulePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRules.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleCountArgs} args - Arguments to filter SemanticRules to count.
     * @example
     * // Count the number of SemanticRules
     * const count = await prisma.semanticRule.count({
     *   where: {
     *     // ... the filter for the SemanticRules we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleCountArgs>(
      args?: Subset<T, SemanticRuleCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRule.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleAggregateArgs>(args: Subset<T, SemanticRuleAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleAggregateType<T>>

    /**
     * Group by SemanticRule.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRule model
   */
  readonly fields: SemanticRuleFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRule.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    ruleSet<T extends SemanticRuleSetDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSetDefaultArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
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
   * Fields of the SemanticRule model
   */
  interface SemanticRuleFieldRefs {
    readonly id: FieldRef<"SemanticRule", 'String'>
    readonly ruleSetId: FieldRef<"SemanticRule", 'String'>
    readonly type: FieldRef<"SemanticRule", 'SemanticRuleType'>
    readonly name: FieldRef<"SemanticRule", 'String'>
    readonly enabled: FieldRef<"SemanticRule", 'Boolean'>
    readonly priority: FieldRef<"SemanticRule", 'Int'>
    readonly stopOnMatch: FieldRef<"SemanticRule", 'Boolean'>
    readonly flags: FieldRef<"SemanticRule", 'String'>
    readonly patterns: FieldRef<"SemanticRule", 'Json'>
    readonly outputs: FieldRef<"SemanticRule", 'Json'>
    readonly examples: FieldRef<"SemanticRule", 'Json'>
    readonly negativeExamples: FieldRef<"SemanticRule", 'Json'>
    readonly tags: FieldRef<"SemanticRule", 'Json'>
    readonly note: FieldRef<"SemanticRule", 'String'>
    readonly createdAt: FieldRef<"SemanticRule", 'DateTime'>
    readonly updatedAt: FieldRef<"SemanticRule", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRule findUnique
   */
  export type SemanticRuleFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRule to fetch.
     */
    where: SemanticRuleWhereUniqueInput
  }

  /**
   * SemanticRule findUniqueOrThrow
   */
  export type SemanticRuleFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRule to fetch.
     */
    where: SemanticRuleWhereUniqueInput
  }

  /**
   * SemanticRule findFirst
   */
  export type SemanticRuleFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRule to fetch.
     */
    where?: SemanticRuleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRules to fetch.
     */
    orderBy?: SemanticRuleOrderByWithRelationInput | SemanticRuleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRules.
     */
    cursor?: SemanticRuleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRules from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRules.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRules.
     */
    distinct?: SemanticRuleScalarFieldEnum | SemanticRuleScalarFieldEnum[]
  }

  /**
   * SemanticRule findFirstOrThrow
   */
  export type SemanticRuleFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRule to fetch.
     */
    where?: SemanticRuleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRules to fetch.
     */
    orderBy?: SemanticRuleOrderByWithRelationInput | SemanticRuleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRules.
     */
    cursor?: SemanticRuleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRules from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRules.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRules.
     */
    distinct?: SemanticRuleScalarFieldEnum | SemanticRuleScalarFieldEnum[]
  }

  /**
   * SemanticRule findMany
   */
  export type SemanticRuleFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRules to fetch.
     */
    where?: SemanticRuleWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRules to fetch.
     */
    orderBy?: SemanticRuleOrderByWithRelationInput | SemanticRuleOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRules.
     */
    cursor?: SemanticRuleWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRules from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRules.
     */
    skip?: number
    distinct?: SemanticRuleScalarFieldEnum | SemanticRuleScalarFieldEnum[]
  }

  /**
   * SemanticRule create
   */
  export type SemanticRuleCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRule.
     */
    data: XOR<SemanticRuleCreateInput, SemanticRuleUncheckedCreateInput>
  }

  /**
   * SemanticRule createMany
   */
  export type SemanticRuleCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRules.
     */
    data: SemanticRuleCreateManyInput | SemanticRuleCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRule createManyAndReturn
   */
  export type SemanticRuleCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRules.
     */
    data: SemanticRuleCreateManyInput | SemanticRuleCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRule update
   */
  export type SemanticRuleUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRule.
     */
    data: XOR<SemanticRuleUpdateInput, SemanticRuleUncheckedUpdateInput>
    /**
     * Choose, which SemanticRule to update.
     */
    where: SemanticRuleWhereUniqueInput
  }

  /**
   * SemanticRule updateMany
   */
  export type SemanticRuleUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRules.
     */
    data: XOR<SemanticRuleUpdateManyMutationInput, SemanticRuleUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRules to update
     */
    where?: SemanticRuleWhereInput
    /**
     * Limit how many SemanticRules to update.
     */
    limit?: number
  }

  /**
   * SemanticRule updateManyAndReturn
   */
  export type SemanticRuleUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRules.
     */
    data: XOR<SemanticRuleUpdateManyMutationInput, SemanticRuleUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRules to update
     */
    where?: SemanticRuleWhereInput
    /**
     * Limit how many SemanticRules to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRule upsert
   */
  export type SemanticRuleUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRule to update in case it exists.
     */
    where: SemanticRuleWhereUniqueInput
    /**
     * In case the SemanticRule found by the `where` argument doesn't exist, create a new SemanticRule with this data.
     */
    create: XOR<SemanticRuleCreateInput, SemanticRuleUncheckedCreateInput>
    /**
     * In case the SemanticRule was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleUpdateInput, SemanticRuleUncheckedUpdateInput>
  }

  /**
   * SemanticRule delete
   */
  export type SemanticRuleDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
    /**
     * Filter which SemanticRule to delete.
     */
    where: SemanticRuleWhereUniqueInput
  }

  /**
   * SemanticRule deleteMany
   */
  export type SemanticRuleDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRules to delete
     */
    where?: SemanticRuleWhereInput
    /**
     * Limit how many SemanticRules to delete.
     */
    limit?: number
  }

  /**
   * SemanticRule without action
   */
  export type SemanticRuleDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRule
     */
    select?: SemanticRuleSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRule
     */
    omit?: SemanticRuleOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleInclude<ExtArgs> | null
  }


  /**
   * Model SemanticRuleRelease
   */

  export type AggregateSemanticRuleRelease = {
    _count: SemanticRuleReleaseCountAggregateOutputType | null
    _min: SemanticRuleReleaseMinAggregateOutputType | null
    _max: SemanticRuleReleaseMaxAggregateOutputType | null
  }

  export type SemanticRuleReleaseMinAggregateOutputType = {
    id: string | null
    ruleSetId: string | null
    releaseMode: $Enums.SemanticRuleReleaseMode | null
    fromStatus: string | null
    toStatus: string | null
    releasedBy: string | null
    releaseNote: string | null
    triggeredAt: Date | null
    effectiveAt: Date | null
    previousActiveRuleSetId: string | null
  }

  export type SemanticRuleReleaseMaxAggregateOutputType = {
    id: string | null
    ruleSetId: string | null
    releaseMode: $Enums.SemanticRuleReleaseMode | null
    fromStatus: string | null
    toStatus: string | null
    releasedBy: string | null
    releaseNote: string | null
    triggeredAt: Date | null
    effectiveAt: Date | null
    previousActiveRuleSetId: string | null
  }

  export type SemanticRuleReleaseCountAggregateOutputType = {
    id: number
    ruleSetId: number
    releaseMode: number
    fromStatus: number
    toStatus: number
    releasedBy: number
    releaseNote: number
    targeting: number
    triggeredAt: number
    effectiveAt: number
    previousActiveRuleSetId: number
    _all: number
  }


  export type SemanticRuleReleaseMinAggregateInputType = {
    id?: true
    ruleSetId?: true
    releaseMode?: true
    fromStatus?: true
    toStatus?: true
    releasedBy?: true
    releaseNote?: true
    triggeredAt?: true
    effectiveAt?: true
    previousActiveRuleSetId?: true
  }

  export type SemanticRuleReleaseMaxAggregateInputType = {
    id?: true
    ruleSetId?: true
    releaseMode?: true
    fromStatus?: true
    toStatus?: true
    releasedBy?: true
    releaseNote?: true
    triggeredAt?: true
    effectiveAt?: true
    previousActiveRuleSetId?: true
  }

  export type SemanticRuleReleaseCountAggregateInputType = {
    id?: true
    ruleSetId?: true
    releaseMode?: true
    fromStatus?: true
    toStatus?: true
    releasedBy?: true
    releaseNote?: true
    targeting?: true
    triggeredAt?: true
    effectiveAt?: true
    previousActiveRuleSetId?: true
    _all?: true
  }

  export type SemanticRuleReleaseAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleRelease to aggregate.
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleReleases to fetch.
     */
    orderBy?: SemanticRuleReleaseOrderByWithRelationInput | SemanticRuleReleaseOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleReleaseWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleReleases from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleReleases.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRuleReleases
    **/
    _count?: true | SemanticRuleReleaseCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleReleaseMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleReleaseMaxAggregateInputType
  }

  export type GetSemanticRuleReleaseAggregateType<T extends SemanticRuleReleaseAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRuleRelease]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRuleRelease[P]>
      : GetScalarType<T[P], AggregateSemanticRuleRelease[P]>
  }




  export type SemanticRuleReleaseGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleReleaseWhereInput
    orderBy?: SemanticRuleReleaseOrderByWithAggregationInput | SemanticRuleReleaseOrderByWithAggregationInput[]
    by: SemanticRuleReleaseScalarFieldEnum[] | SemanticRuleReleaseScalarFieldEnum
    having?: SemanticRuleReleaseScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleReleaseCountAggregateInputType | true
    _min?: SemanticRuleReleaseMinAggregateInputType
    _max?: SemanticRuleReleaseMaxAggregateInputType
  }

  export type SemanticRuleReleaseGroupByOutputType = {
    id: string
    ruleSetId: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote: string | null
    targeting: JsonValue | null
    triggeredAt: Date
    effectiveAt: Date | null
    previousActiveRuleSetId: string | null
    _count: SemanticRuleReleaseCountAggregateOutputType | null
    _min: SemanticRuleReleaseMinAggregateOutputType | null
    _max: SemanticRuleReleaseMaxAggregateOutputType | null
  }

  type GetSemanticRuleReleaseGroupByPayload<T extends SemanticRuleReleaseGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleReleaseGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleReleaseGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleReleaseGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleReleaseGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleReleaseSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    releaseMode?: boolean
    fromStatus?: boolean
    toStatus?: boolean
    releasedBy?: boolean
    releaseNote?: boolean
    targeting?: boolean
    triggeredAt?: boolean
    effectiveAt?: boolean
    previousActiveRuleSetId?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleRelease"]>

  export type SemanticRuleReleaseSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    releaseMode?: boolean
    fromStatus?: boolean
    toStatus?: boolean
    releasedBy?: boolean
    releaseNote?: boolean
    targeting?: boolean
    triggeredAt?: boolean
    effectiveAt?: boolean
    previousActiveRuleSetId?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleRelease"]>

  export type SemanticRuleReleaseSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    releaseMode?: boolean
    fromStatus?: boolean
    toStatus?: boolean
    releasedBy?: boolean
    releaseNote?: boolean
    targeting?: boolean
    triggeredAt?: boolean
    effectiveAt?: boolean
    previousActiveRuleSetId?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleRelease"]>

  export type SemanticRuleReleaseSelectScalar = {
    id?: boolean
    ruleSetId?: boolean
    releaseMode?: boolean
    fromStatus?: boolean
    toStatus?: boolean
    releasedBy?: boolean
    releaseNote?: boolean
    targeting?: boolean
    triggeredAt?: boolean
    effectiveAt?: boolean
    previousActiveRuleSetId?: boolean
  }

  export type SemanticRuleReleaseOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "ruleSetId" | "releaseMode" | "fromStatus" | "toStatus" | "releasedBy" | "releaseNote" | "targeting" | "triggeredAt" | "effectiveAt" | "previousActiveRuleSetId", ExtArgs["result"]["semanticRuleRelease"]>
  export type SemanticRuleReleaseInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }
  export type SemanticRuleReleaseIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }
  export type SemanticRuleReleaseIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }

  export type $SemanticRuleReleasePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRuleRelease"
    objects: {
      ruleSet: Prisma.$SemanticRuleSetPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      ruleSetId: string
      releaseMode: $Enums.SemanticRuleReleaseMode
      fromStatus: string
      toStatus: string
      releasedBy: string
      releaseNote: string | null
      targeting: Prisma.JsonValue | null
      triggeredAt: Date
      effectiveAt: Date | null
      previousActiveRuleSetId: string | null
    }, ExtArgs["result"]["semanticRuleRelease"]>
    composites: {}
  }

  type SemanticRuleReleaseGetPayload<S extends boolean | null | undefined | SemanticRuleReleaseDefaultArgs> = $Result.GetResult<Prisma.$SemanticRuleReleasePayload, S>

  type SemanticRuleReleaseCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleReleaseFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleReleaseCountAggregateInputType | true
    }

  export interface SemanticRuleReleaseDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRuleRelease'], meta: { name: 'SemanticRuleRelease' } }
    /**
     * Find zero or one SemanticRuleRelease that matches the filter.
     * @param {SemanticRuleReleaseFindUniqueArgs} args - Arguments to find a SemanticRuleRelease
     * @example
     * // Get one SemanticRuleRelease
     * const semanticRuleRelease = await prisma.semanticRuleRelease.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleReleaseFindUniqueArgs>(args: SelectSubset<T, SemanticRuleReleaseFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRuleRelease that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleReleaseFindUniqueOrThrowArgs} args - Arguments to find a SemanticRuleRelease
     * @example
     * // Get one SemanticRuleRelease
     * const semanticRuleRelease = await prisma.semanticRuleRelease.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleReleaseFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleReleaseFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleRelease that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseFindFirstArgs} args - Arguments to find a SemanticRuleRelease
     * @example
     * // Get one SemanticRuleRelease
     * const semanticRuleRelease = await prisma.semanticRuleRelease.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleReleaseFindFirstArgs>(args?: SelectSubset<T, SemanticRuleReleaseFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleRelease that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseFindFirstOrThrowArgs} args - Arguments to find a SemanticRuleRelease
     * @example
     * // Get one SemanticRuleRelease
     * const semanticRuleRelease = await prisma.semanticRuleRelease.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleReleaseFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleReleaseFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRuleReleases that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRuleReleases
     * const semanticRuleReleases = await prisma.semanticRuleRelease.findMany()
     * 
     * // Get first 10 SemanticRuleReleases
     * const semanticRuleReleases = await prisma.semanticRuleRelease.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleReleaseWithIdOnly = await prisma.semanticRuleRelease.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleReleaseFindManyArgs>(args?: SelectSubset<T, SemanticRuleReleaseFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRuleRelease.
     * @param {SemanticRuleReleaseCreateArgs} args - Arguments to create a SemanticRuleRelease.
     * @example
     * // Create one SemanticRuleRelease
     * const SemanticRuleRelease = await prisma.semanticRuleRelease.create({
     *   data: {
     *     // ... data to create a SemanticRuleRelease
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleReleaseCreateArgs>(args: SelectSubset<T, SemanticRuleReleaseCreateArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRuleReleases.
     * @param {SemanticRuleReleaseCreateManyArgs} args - Arguments to create many SemanticRuleReleases.
     * @example
     * // Create many SemanticRuleReleases
     * const semanticRuleRelease = await prisma.semanticRuleRelease.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleReleaseCreateManyArgs>(args?: SelectSubset<T, SemanticRuleReleaseCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRuleReleases and returns the data saved in the database.
     * @param {SemanticRuleReleaseCreateManyAndReturnArgs} args - Arguments to create many SemanticRuleReleases.
     * @example
     * // Create many SemanticRuleReleases
     * const semanticRuleRelease = await prisma.semanticRuleRelease.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRuleReleases and only return the `id`
     * const semanticRuleReleaseWithIdOnly = await prisma.semanticRuleRelease.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleReleaseCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleReleaseCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRuleRelease.
     * @param {SemanticRuleReleaseDeleteArgs} args - Arguments to delete one SemanticRuleRelease.
     * @example
     * // Delete one SemanticRuleRelease
     * const SemanticRuleRelease = await prisma.semanticRuleRelease.delete({
     *   where: {
     *     // ... filter to delete one SemanticRuleRelease
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleReleaseDeleteArgs>(args: SelectSubset<T, SemanticRuleReleaseDeleteArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRuleRelease.
     * @param {SemanticRuleReleaseUpdateArgs} args - Arguments to update one SemanticRuleRelease.
     * @example
     * // Update one SemanticRuleRelease
     * const semanticRuleRelease = await prisma.semanticRuleRelease.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleReleaseUpdateArgs>(args: SelectSubset<T, SemanticRuleReleaseUpdateArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRuleReleases.
     * @param {SemanticRuleReleaseDeleteManyArgs} args - Arguments to filter SemanticRuleReleases to delete.
     * @example
     * // Delete a few SemanticRuleReleases
     * const { count } = await prisma.semanticRuleRelease.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleReleaseDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleReleaseDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleReleases.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRuleReleases
     * const semanticRuleRelease = await prisma.semanticRuleRelease.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleReleaseUpdateManyArgs>(args: SelectSubset<T, SemanticRuleReleaseUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleReleases and returns the data updated in the database.
     * @param {SemanticRuleReleaseUpdateManyAndReturnArgs} args - Arguments to update many SemanticRuleReleases.
     * @example
     * // Update many SemanticRuleReleases
     * const semanticRuleRelease = await prisma.semanticRuleRelease.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRuleReleases and only return the `id`
     * const semanticRuleReleaseWithIdOnly = await prisma.semanticRuleRelease.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleReleaseUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleReleaseUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRuleRelease.
     * @param {SemanticRuleReleaseUpsertArgs} args - Arguments to update or create a SemanticRuleRelease.
     * @example
     * // Update or create a SemanticRuleRelease
     * const semanticRuleRelease = await prisma.semanticRuleRelease.upsert({
     *   create: {
     *     // ... data to create a SemanticRuleRelease
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRuleRelease we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleReleaseUpsertArgs>(args: SelectSubset<T, SemanticRuleReleaseUpsertArgs<ExtArgs>>): Prisma__SemanticRuleReleaseClient<$Result.GetResult<Prisma.$SemanticRuleReleasePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRuleReleases.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseCountArgs} args - Arguments to filter SemanticRuleReleases to count.
     * @example
     * // Count the number of SemanticRuleReleases
     * const count = await prisma.semanticRuleRelease.count({
     *   where: {
     *     // ... the filter for the SemanticRuleReleases we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleReleaseCountArgs>(
      args?: Subset<T, SemanticRuleReleaseCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleReleaseCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRuleRelease.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleReleaseAggregateArgs>(args: Subset<T, SemanticRuleReleaseAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleReleaseAggregateType<T>>

    /**
     * Group by SemanticRuleRelease.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleReleaseGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleReleaseGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleReleaseGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleReleaseGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleReleaseGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleReleaseGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRuleRelease model
   */
  readonly fields: SemanticRuleReleaseFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRuleRelease.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleReleaseClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    ruleSet<T extends SemanticRuleSetDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSetDefaultArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
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
   * Fields of the SemanticRuleRelease model
   */
  interface SemanticRuleReleaseFieldRefs {
    readonly id: FieldRef<"SemanticRuleRelease", 'String'>
    readonly ruleSetId: FieldRef<"SemanticRuleRelease", 'String'>
    readonly releaseMode: FieldRef<"SemanticRuleRelease", 'SemanticRuleReleaseMode'>
    readonly fromStatus: FieldRef<"SemanticRuleRelease", 'String'>
    readonly toStatus: FieldRef<"SemanticRuleRelease", 'String'>
    readonly releasedBy: FieldRef<"SemanticRuleRelease", 'String'>
    readonly releaseNote: FieldRef<"SemanticRuleRelease", 'String'>
    readonly targeting: FieldRef<"SemanticRuleRelease", 'Json'>
    readonly triggeredAt: FieldRef<"SemanticRuleRelease", 'DateTime'>
    readonly effectiveAt: FieldRef<"SemanticRuleRelease", 'DateTime'>
    readonly previousActiveRuleSetId: FieldRef<"SemanticRuleRelease", 'String'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRuleRelease findUnique
   */
  export type SemanticRuleReleaseFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleRelease to fetch.
     */
    where: SemanticRuleReleaseWhereUniqueInput
  }

  /**
   * SemanticRuleRelease findUniqueOrThrow
   */
  export type SemanticRuleReleaseFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleRelease to fetch.
     */
    where: SemanticRuleReleaseWhereUniqueInput
  }

  /**
   * SemanticRuleRelease findFirst
   */
  export type SemanticRuleReleaseFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleRelease to fetch.
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleReleases to fetch.
     */
    orderBy?: SemanticRuleReleaseOrderByWithRelationInput | SemanticRuleReleaseOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleReleases.
     */
    cursor?: SemanticRuleReleaseWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleReleases from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleReleases.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleReleases.
     */
    distinct?: SemanticRuleReleaseScalarFieldEnum | SemanticRuleReleaseScalarFieldEnum[]
  }

  /**
   * SemanticRuleRelease findFirstOrThrow
   */
  export type SemanticRuleReleaseFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleRelease to fetch.
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleReleases to fetch.
     */
    orderBy?: SemanticRuleReleaseOrderByWithRelationInput | SemanticRuleReleaseOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleReleases.
     */
    cursor?: SemanticRuleReleaseWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleReleases from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleReleases.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleReleases.
     */
    distinct?: SemanticRuleReleaseScalarFieldEnum | SemanticRuleReleaseScalarFieldEnum[]
  }

  /**
   * SemanticRuleRelease findMany
   */
  export type SemanticRuleReleaseFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleReleases to fetch.
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleReleases to fetch.
     */
    orderBy?: SemanticRuleReleaseOrderByWithRelationInput | SemanticRuleReleaseOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRuleReleases.
     */
    cursor?: SemanticRuleReleaseWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleReleases from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleReleases.
     */
    skip?: number
    distinct?: SemanticRuleReleaseScalarFieldEnum | SemanticRuleReleaseScalarFieldEnum[]
  }

  /**
   * SemanticRuleRelease create
   */
  export type SemanticRuleReleaseCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRuleRelease.
     */
    data: XOR<SemanticRuleReleaseCreateInput, SemanticRuleReleaseUncheckedCreateInput>
  }

  /**
   * SemanticRuleRelease createMany
   */
  export type SemanticRuleReleaseCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRuleReleases.
     */
    data: SemanticRuleReleaseCreateManyInput | SemanticRuleReleaseCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleRelease createManyAndReturn
   */
  export type SemanticRuleReleaseCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRuleReleases.
     */
    data: SemanticRuleReleaseCreateManyInput | SemanticRuleReleaseCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleRelease update
   */
  export type SemanticRuleReleaseUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRuleRelease.
     */
    data: XOR<SemanticRuleReleaseUpdateInput, SemanticRuleReleaseUncheckedUpdateInput>
    /**
     * Choose, which SemanticRuleRelease to update.
     */
    where: SemanticRuleReleaseWhereUniqueInput
  }

  /**
   * SemanticRuleRelease updateMany
   */
  export type SemanticRuleReleaseUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRuleReleases.
     */
    data: XOR<SemanticRuleReleaseUpdateManyMutationInput, SemanticRuleReleaseUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleReleases to update
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * Limit how many SemanticRuleReleases to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleRelease updateManyAndReturn
   */
  export type SemanticRuleReleaseUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRuleReleases.
     */
    data: XOR<SemanticRuleReleaseUpdateManyMutationInput, SemanticRuleReleaseUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleReleases to update
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * Limit how many SemanticRuleReleases to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleRelease upsert
   */
  export type SemanticRuleReleaseUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRuleRelease to update in case it exists.
     */
    where: SemanticRuleReleaseWhereUniqueInput
    /**
     * In case the SemanticRuleRelease found by the `where` argument doesn't exist, create a new SemanticRuleRelease with this data.
     */
    create: XOR<SemanticRuleReleaseCreateInput, SemanticRuleReleaseUncheckedCreateInput>
    /**
     * In case the SemanticRuleRelease was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleReleaseUpdateInput, SemanticRuleReleaseUncheckedUpdateInput>
  }

  /**
   * SemanticRuleRelease delete
   */
  export type SemanticRuleReleaseDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
    /**
     * Filter which SemanticRuleRelease to delete.
     */
    where: SemanticRuleReleaseWhereUniqueInput
  }

  /**
   * SemanticRuleRelease deleteMany
   */
  export type SemanticRuleReleaseDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleReleases to delete
     */
    where?: SemanticRuleReleaseWhereInput
    /**
     * Limit how many SemanticRuleReleases to delete.
     */
    limit?: number
  }

  /**
   * SemanticRuleRelease without action
   */
  export type SemanticRuleReleaseDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleRelease
     */
    select?: SemanticRuleReleaseSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleRelease
     */
    omit?: SemanticRuleReleaseOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleReleaseInclude<ExtArgs> | null
  }


  /**
   * Model SemanticRuleTargeting
   */

  export type AggregateSemanticRuleTargeting = {
    _count: SemanticRuleTargetingCountAggregateOutputType | null
    _avg: SemanticRuleTargetingAvgAggregateOutputType | null
    _sum: SemanticRuleTargetingSumAggregateOutputType | null
    _min: SemanticRuleTargetingMinAggregateOutputType | null
    _max: SemanticRuleTargetingMaxAggregateOutputType | null
  }

  export type SemanticRuleTargetingAvgAggregateOutputType = {
    sampleRate: number | null
  }

  export type SemanticRuleTargetingSumAggregateOutputType = {
    sampleRate: number | null
  }

  export type SemanticRuleTargetingMinAggregateOutputType = {
    id: string | null
    ruleSetId: string | null
    sampleRate: number | null
    enabled: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SemanticRuleTargetingMaxAggregateOutputType = {
    id: string | null
    ruleSetId: string | null
    sampleRate: number | null
    enabled: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SemanticRuleTargetingCountAggregateOutputType = {
    id: number
    ruleSetId: number
    environments: number
    hosts: number
    tenantIds: number
    userIds: number
    skillIds: number
    pageTypes: number
    sampleRate: number
    enabled: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SemanticRuleTargetingAvgAggregateInputType = {
    sampleRate?: true
  }

  export type SemanticRuleTargetingSumAggregateInputType = {
    sampleRate?: true
  }

  export type SemanticRuleTargetingMinAggregateInputType = {
    id?: true
    ruleSetId?: true
    sampleRate?: true
    enabled?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SemanticRuleTargetingMaxAggregateInputType = {
    id?: true
    ruleSetId?: true
    sampleRate?: true
    enabled?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SemanticRuleTargetingCountAggregateInputType = {
    id?: true
    ruleSetId?: true
    environments?: true
    hosts?: true
    tenantIds?: true
    userIds?: true
    skillIds?: true
    pageTypes?: true
    sampleRate?: true
    enabled?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SemanticRuleTargetingAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleTargeting to aggregate.
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleTargetings to fetch.
     */
    orderBy?: SemanticRuleTargetingOrderByWithRelationInput | SemanticRuleTargetingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleTargetingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleTargetings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleTargetings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRuleTargetings
    **/
    _count?: true | SemanticRuleTargetingCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: SemanticRuleTargetingAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: SemanticRuleTargetingSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleTargetingMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleTargetingMaxAggregateInputType
  }

  export type GetSemanticRuleTargetingAggregateType<T extends SemanticRuleTargetingAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRuleTargeting]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRuleTargeting[P]>
      : GetScalarType<T[P], AggregateSemanticRuleTargeting[P]>
  }




  export type SemanticRuleTargetingGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleTargetingWhereInput
    orderBy?: SemanticRuleTargetingOrderByWithAggregationInput | SemanticRuleTargetingOrderByWithAggregationInput[]
    by: SemanticRuleTargetingScalarFieldEnum[] | SemanticRuleTargetingScalarFieldEnum
    having?: SemanticRuleTargetingScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleTargetingCountAggregateInputType | true
    _avg?: SemanticRuleTargetingAvgAggregateInputType
    _sum?: SemanticRuleTargetingSumAggregateInputType
    _min?: SemanticRuleTargetingMinAggregateInputType
    _max?: SemanticRuleTargetingMaxAggregateInputType
  }

  export type SemanticRuleTargetingGroupByOutputType = {
    id: string
    ruleSetId: string
    environments: JsonValue | null
    hosts: JsonValue | null
    tenantIds: JsonValue | null
    userIds: JsonValue | null
    skillIds: JsonValue | null
    pageTypes: JsonValue | null
    sampleRate: number | null
    enabled: boolean
    createdAt: Date
    updatedAt: Date
    _count: SemanticRuleTargetingCountAggregateOutputType | null
    _avg: SemanticRuleTargetingAvgAggregateOutputType | null
    _sum: SemanticRuleTargetingSumAggregateOutputType | null
    _min: SemanticRuleTargetingMinAggregateOutputType | null
    _max: SemanticRuleTargetingMaxAggregateOutputType | null
  }

  type GetSemanticRuleTargetingGroupByPayload<T extends SemanticRuleTargetingGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleTargetingGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleTargetingGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleTargetingGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleTargetingGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleTargetingSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    environments?: boolean
    hosts?: boolean
    tenantIds?: boolean
    userIds?: boolean
    skillIds?: boolean
    pageTypes?: boolean
    sampleRate?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleTargeting"]>

  export type SemanticRuleTargetingSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    environments?: boolean
    hosts?: boolean
    tenantIds?: boolean
    userIds?: boolean
    skillIds?: boolean
    pageTypes?: boolean
    sampleRate?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleTargeting"]>

  export type SemanticRuleTargetingSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    ruleSetId?: boolean
    environments?: boolean
    hosts?: boolean
    tenantIds?: boolean
    userIds?: boolean
    skillIds?: boolean
    pageTypes?: boolean
    sampleRate?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleTargeting"]>

  export type SemanticRuleTargetingSelectScalar = {
    id?: boolean
    ruleSetId?: boolean
    environments?: boolean
    hosts?: boolean
    tenantIds?: boolean
    userIds?: boolean
    skillIds?: boolean
    pageTypes?: boolean
    sampleRate?: boolean
    enabled?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SemanticRuleTargetingOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "ruleSetId" | "environments" | "hosts" | "tenantIds" | "userIds" | "skillIds" | "pageTypes" | "sampleRate" | "enabled" | "createdAt" | "updatedAt", ExtArgs["result"]["semanticRuleTargeting"]>
  export type SemanticRuleTargetingInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }
  export type SemanticRuleTargetingIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }
  export type SemanticRuleTargetingIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    ruleSet?: boolean | SemanticRuleSetDefaultArgs<ExtArgs>
  }

  export type $SemanticRuleTargetingPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRuleTargeting"
    objects: {
      ruleSet: Prisma.$SemanticRuleSetPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      ruleSetId: string
      environments: Prisma.JsonValue | null
      hosts: Prisma.JsonValue | null
      tenantIds: Prisma.JsonValue | null
      userIds: Prisma.JsonValue | null
      skillIds: Prisma.JsonValue | null
      pageTypes: Prisma.JsonValue | null
      sampleRate: number | null
      enabled: boolean
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["semanticRuleTargeting"]>
    composites: {}
  }

  type SemanticRuleTargetingGetPayload<S extends boolean | null | undefined | SemanticRuleTargetingDefaultArgs> = $Result.GetResult<Prisma.$SemanticRuleTargetingPayload, S>

  type SemanticRuleTargetingCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleTargetingFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleTargetingCountAggregateInputType | true
    }

  export interface SemanticRuleTargetingDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRuleTargeting'], meta: { name: 'SemanticRuleTargeting' } }
    /**
     * Find zero or one SemanticRuleTargeting that matches the filter.
     * @param {SemanticRuleTargetingFindUniqueArgs} args - Arguments to find a SemanticRuleTargeting
     * @example
     * // Get one SemanticRuleTargeting
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleTargetingFindUniqueArgs>(args: SelectSubset<T, SemanticRuleTargetingFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRuleTargeting that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleTargetingFindUniqueOrThrowArgs} args - Arguments to find a SemanticRuleTargeting
     * @example
     * // Get one SemanticRuleTargeting
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleTargetingFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleTargetingFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleTargeting that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingFindFirstArgs} args - Arguments to find a SemanticRuleTargeting
     * @example
     * // Get one SemanticRuleTargeting
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleTargetingFindFirstArgs>(args?: SelectSubset<T, SemanticRuleTargetingFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleTargeting that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingFindFirstOrThrowArgs} args - Arguments to find a SemanticRuleTargeting
     * @example
     * // Get one SemanticRuleTargeting
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleTargetingFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleTargetingFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRuleTargetings that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRuleTargetings
     * const semanticRuleTargetings = await prisma.semanticRuleTargeting.findMany()
     * 
     * // Get first 10 SemanticRuleTargetings
     * const semanticRuleTargetings = await prisma.semanticRuleTargeting.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleTargetingWithIdOnly = await prisma.semanticRuleTargeting.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleTargetingFindManyArgs>(args?: SelectSubset<T, SemanticRuleTargetingFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRuleTargeting.
     * @param {SemanticRuleTargetingCreateArgs} args - Arguments to create a SemanticRuleTargeting.
     * @example
     * // Create one SemanticRuleTargeting
     * const SemanticRuleTargeting = await prisma.semanticRuleTargeting.create({
     *   data: {
     *     // ... data to create a SemanticRuleTargeting
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleTargetingCreateArgs>(args: SelectSubset<T, SemanticRuleTargetingCreateArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRuleTargetings.
     * @param {SemanticRuleTargetingCreateManyArgs} args - Arguments to create many SemanticRuleTargetings.
     * @example
     * // Create many SemanticRuleTargetings
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleTargetingCreateManyArgs>(args?: SelectSubset<T, SemanticRuleTargetingCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRuleTargetings and returns the data saved in the database.
     * @param {SemanticRuleTargetingCreateManyAndReturnArgs} args - Arguments to create many SemanticRuleTargetings.
     * @example
     * // Create many SemanticRuleTargetings
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRuleTargetings and only return the `id`
     * const semanticRuleTargetingWithIdOnly = await prisma.semanticRuleTargeting.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleTargetingCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleTargetingCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRuleTargeting.
     * @param {SemanticRuleTargetingDeleteArgs} args - Arguments to delete one SemanticRuleTargeting.
     * @example
     * // Delete one SemanticRuleTargeting
     * const SemanticRuleTargeting = await prisma.semanticRuleTargeting.delete({
     *   where: {
     *     // ... filter to delete one SemanticRuleTargeting
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleTargetingDeleteArgs>(args: SelectSubset<T, SemanticRuleTargetingDeleteArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRuleTargeting.
     * @param {SemanticRuleTargetingUpdateArgs} args - Arguments to update one SemanticRuleTargeting.
     * @example
     * // Update one SemanticRuleTargeting
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleTargetingUpdateArgs>(args: SelectSubset<T, SemanticRuleTargetingUpdateArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRuleTargetings.
     * @param {SemanticRuleTargetingDeleteManyArgs} args - Arguments to filter SemanticRuleTargetings to delete.
     * @example
     * // Delete a few SemanticRuleTargetings
     * const { count } = await prisma.semanticRuleTargeting.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleTargetingDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleTargetingDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleTargetings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRuleTargetings
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleTargetingUpdateManyArgs>(args: SelectSubset<T, SemanticRuleTargetingUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleTargetings and returns the data updated in the database.
     * @param {SemanticRuleTargetingUpdateManyAndReturnArgs} args - Arguments to update many SemanticRuleTargetings.
     * @example
     * // Update many SemanticRuleTargetings
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRuleTargetings and only return the `id`
     * const semanticRuleTargetingWithIdOnly = await prisma.semanticRuleTargeting.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleTargetingUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleTargetingUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRuleTargeting.
     * @param {SemanticRuleTargetingUpsertArgs} args - Arguments to update or create a SemanticRuleTargeting.
     * @example
     * // Update or create a SemanticRuleTargeting
     * const semanticRuleTargeting = await prisma.semanticRuleTargeting.upsert({
     *   create: {
     *     // ... data to create a SemanticRuleTargeting
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRuleTargeting we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleTargetingUpsertArgs>(args: SelectSubset<T, SemanticRuleTargetingUpsertArgs<ExtArgs>>): Prisma__SemanticRuleTargetingClient<$Result.GetResult<Prisma.$SemanticRuleTargetingPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRuleTargetings.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingCountArgs} args - Arguments to filter SemanticRuleTargetings to count.
     * @example
     * // Count the number of SemanticRuleTargetings
     * const count = await prisma.semanticRuleTargeting.count({
     *   where: {
     *     // ... the filter for the SemanticRuleTargetings we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleTargetingCountArgs>(
      args?: Subset<T, SemanticRuleTargetingCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleTargetingCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRuleTargeting.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleTargetingAggregateArgs>(args: Subset<T, SemanticRuleTargetingAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleTargetingAggregateType<T>>

    /**
     * Group by SemanticRuleTargeting.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleTargetingGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleTargetingGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleTargetingGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleTargetingGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleTargetingGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleTargetingGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRuleTargeting model
   */
  readonly fields: SemanticRuleTargetingFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRuleTargeting.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleTargetingClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    ruleSet<T extends SemanticRuleSetDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleSetDefaultArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
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
   * Fields of the SemanticRuleTargeting model
   */
  interface SemanticRuleTargetingFieldRefs {
    readonly id: FieldRef<"SemanticRuleTargeting", 'String'>
    readonly ruleSetId: FieldRef<"SemanticRuleTargeting", 'String'>
    readonly environments: FieldRef<"SemanticRuleTargeting", 'Json'>
    readonly hosts: FieldRef<"SemanticRuleTargeting", 'Json'>
    readonly tenantIds: FieldRef<"SemanticRuleTargeting", 'Json'>
    readonly userIds: FieldRef<"SemanticRuleTargeting", 'Json'>
    readonly skillIds: FieldRef<"SemanticRuleTargeting", 'Json'>
    readonly pageTypes: FieldRef<"SemanticRuleTargeting", 'Json'>
    readonly sampleRate: FieldRef<"SemanticRuleTargeting", 'Float'>
    readonly enabled: FieldRef<"SemanticRuleTargeting", 'Boolean'>
    readonly createdAt: FieldRef<"SemanticRuleTargeting", 'DateTime'>
    readonly updatedAt: FieldRef<"SemanticRuleTargeting", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRuleTargeting findUnique
   */
  export type SemanticRuleTargetingFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleTargeting to fetch.
     */
    where: SemanticRuleTargetingWhereUniqueInput
  }

  /**
   * SemanticRuleTargeting findUniqueOrThrow
   */
  export type SemanticRuleTargetingFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleTargeting to fetch.
     */
    where: SemanticRuleTargetingWhereUniqueInput
  }

  /**
   * SemanticRuleTargeting findFirst
   */
  export type SemanticRuleTargetingFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleTargeting to fetch.
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleTargetings to fetch.
     */
    orderBy?: SemanticRuleTargetingOrderByWithRelationInput | SemanticRuleTargetingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleTargetings.
     */
    cursor?: SemanticRuleTargetingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleTargetings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleTargetings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleTargetings.
     */
    distinct?: SemanticRuleTargetingScalarFieldEnum | SemanticRuleTargetingScalarFieldEnum[]
  }

  /**
   * SemanticRuleTargeting findFirstOrThrow
   */
  export type SemanticRuleTargetingFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleTargeting to fetch.
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleTargetings to fetch.
     */
    orderBy?: SemanticRuleTargetingOrderByWithRelationInput | SemanticRuleTargetingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleTargetings.
     */
    cursor?: SemanticRuleTargetingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleTargetings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleTargetings.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleTargetings.
     */
    distinct?: SemanticRuleTargetingScalarFieldEnum | SemanticRuleTargetingScalarFieldEnum[]
  }

  /**
   * SemanticRuleTargeting findMany
   */
  export type SemanticRuleTargetingFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleTargetings to fetch.
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleTargetings to fetch.
     */
    orderBy?: SemanticRuleTargetingOrderByWithRelationInput | SemanticRuleTargetingOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRuleTargetings.
     */
    cursor?: SemanticRuleTargetingWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleTargetings from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleTargetings.
     */
    skip?: number
    distinct?: SemanticRuleTargetingScalarFieldEnum | SemanticRuleTargetingScalarFieldEnum[]
  }

  /**
   * SemanticRuleTargeting create
   */
  export type SemanticRuleTargetingCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRuleTargeting.
     */
    data: XOR<SemanticRuleTargetingCreateInput, SemanticRuleTargetingUncheckedCreateInput>
  }

  /**
   * SemanticRuleTargeting createMany
   */
  export type SemanticRuleTargetingCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRuleTargetings.
     */
    data: SemanticRuleTargetingCreateManyInput | SemanticRuleTargetingCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleTargeting createManyAndReturn
   */
  export type SemanticRuleTargetingCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRuleTargetings.
     */
    data: SemanticRuleTargetingCreateManyInput | SemanticRuleTargetingCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleTargeting update
   */
  export type SemanticRuleTargetingUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRuleTargeting.
     */
    data: XOR<SemanticRuleTargetingUpdateInput, SemanticRuleTargetingUncheckedUpdateInput>
    /**
     * Choose, which SemanticRuleTargeting to update.
     */
    where: SemanticRuleTargetingWhereUniqueInput
  }

  /**
   * SemanticRuleTargeting updateMany
   */
  export type SemanticRuleTargetingUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRuleTargetings.
     */
    data: XOR<SemanticRuleTargetingUpdateManyMutationInput, SemanticRuleTargetingUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleTargetings to update
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * Limit how many SemanticRuleTargetings to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleTargeting updateManyAndReturn
   */
  export type SemanticRuleTargetingUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRuleTargetings.
     */
    data: XOR<SemanticRuleTargetingUpdateManyMutationInput, SemanticRuleTargetingUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleTargetings to update
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * Limit how many SemanticRuleTargetings to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleTargeting upsert
   */
  export type SemanticRuleTargetingUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRuleTargeting to update in case it exists.
     */
    where: SemanticRuleTargetingWhereUniqueInput
    /**
     * In case the SemanticRuleTargeting found by the `where` argument doesn't exist, create a new SemanticRuleTargeting with this data.
     */
    create: XOR<SemanticRuleTargetingCreateInput, SemanticRuleTargetingUncheckedCreateInput>
    /**
     * In case the SemanticRuleTargeting was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleTargetingUpdateInput, SemanticRuleTargetingUncheckedUpdateInput>
  }

  /**
   * SemanticRuleTargeting delete
   */
  export type SemanticRuleTargetingDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
    /**
     * Filter which SemanticRuleTargeting to delete.
     */
    where: SemanticRuleTargetingWhereUniqueInput
  }

  /**
   * SemanticRuleTargeting deleteMany
   */
  export type SemanticRuleTargetingDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleTargetings to delete
     */
    where?: SemanticRuleTargetingWhereInput
    /**
     * Limit how many SemanticRuleTargetings to delete.
     */
    limit?: number
  }

  /**
   * SemanticRuleTargeting without action
   */
  export type SemanticRuleTargetingDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleTargeting
     */
    select?: SemanticRuleTargetingSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleTargeting
     */
    omit?: SemanticRuleTargetingOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleTargetingInclude<ExtArgs> | null
  }


  /**
   * Model SemanticRuleHitLog
   */

  export type AggregateSemanticRuleHitLog = {
    _count: SemanticRuleHitLogCountAggregateOutputType | null
    _min: SemanticRuleHitLogMinAggregateOutputType | null
    _max: SemanticRuleHitLogMaxAggregateOutputType | null
  }

  export type SemanticRuleHitLogMinAggregateOutputType = {
    id: string | null
    domainId: string | null
    ruleSetId: string | null
    inputText: string | null
    normalizedInput: string | null
    pageUrl: string | null
    pageTitle: string | null
    pageType: string | null
    observationSummary: string | null
    usedAiFallback: boolean | null
    finalExecutionSuccess: boolean | null
    failureReason: string | null
    traceId: string | null
    createdAt: Date | null
  }

  export type SemanticRuleHitLogMaxAggregateOutputType = {
    id: string | null
    domainId: string | null
    ruleSetId: string | null
    inputText: string | null
    normalizedInput: string | null
    pageUrl: string | null
    pageTitle: string | null
    pageType: string | null
    observationSummary: string | null
    usedAiFallback: boolean | null
    finalExecutionSuccess: boolean | null
    failureReason: string | null
    traceId: string | null
    createdAt: Date | null
  }

  export type SemanticRuleHitLogCountAggregateOutputType = {
    id: number
    domainId: number
    ruleSetId: number
    matchedRuleIds: number
    inputText: number
    normalizedInput: number
    pageUrl: number
    pageTitle: number
    pageType: number
    observationSummary: number
    availableCandidateIds: number
    normalizedSemantic: number
    parserOutput: number
    usedAiFallback: number
    finalExecutionSuccess: number
    failureReason: number
    traceId: number
    createdAt: number
    _all: number
  }


  export type SemanticRuleHitLogMinAggregateInputType = {
    id?: true
    domainId?: true
    ruleSetId?: true
    inputText?: true
    normalizedInput?: true
    pageUrl?: true
    pageTitle?: true
    pageType?: true
    observationSummary?: true
    usedAiFallback?: true
    finalExecutionSuccess?: true
    failureReason?: true
    traceId?: true
    createdAt?: true
  }

  export type SemanticRuleHitLogMaxAggregateInputType = {
    id?: true
    domainId?: true
    ruleSetId?: true
    inputText?: true
    normalizedInput?: true
    pageUrl?: true
    pageTitle?: true
    pageType?: true
    observationSummary?: true
    usedAiFallback?: true
    finalExecutionSuccess?: true
    failureReason?: true
    traceId?: true
    createdAt?: true
  }

  export type SemanticRuleHitLogCountAggregateInputType = {
    id?: true
    domainId?: true
    ruleSetId?: true
    matchedRuleIds?: true
    inputText?: true
    normalizedInput?: true
    pageUrl?: true
    pageTitle?: true
    pageType?: true
    observationSummary?: true
    availableCandidateIds?: true
    normalizedSemantic?: true
    parserOutput?: true
    usedAiFallback?: true
    finalExecutionSuccess?: true
    failureReason?: true
    traceId?: true
    createdAt?: true
    _all?: true
  }

  export type SemanticRuleHitLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleHitLog to aggregate.
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleHitLogs to fetch.
     */
    orderBy?: SemanticRuleHitLogOrderByWithRelationInput | SemanticRuleHitLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleHitLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleHitLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleHitLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRuleHitLogs
    **/
    _count?: true | SemanticRuleHitLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleHitLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleHitLogMaxAggregateInputType
  }

  export type GetSemanticRuleHitLogAggregateType<T extends SemanticRuleHitLogAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRuleHitLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRuleHitLog[P]>
      : GetScalarType<T[P], AggregateSemanticRuleHitLog[P]>
  }




  export type SemanticRuleHitLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleHitLogWhereInput
    orderBy?: SemanticRuleHitLogOrderByWithAggregationInput | SemanticRuleHitLogOrderByWithAggregationInput[]
    by: SemanticRuleHitLogScalarFieldEnum[] | SemanticRuleHitLogScalarFieldEnum
    having?: SemanticRuleHitLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleHitLogCountAggregateInputType | true
    _min?: SemanticRuleHitLogMinAggregateInputType
    _max?: SemanticRuleHitLogMaxAggregateInputType
  }

  export type SemanticRuleHitLogGroupByOutputType = {
    id: string
    domainId: string
    ruleSetId: string | null
    matchedRuleIds: JsonValue
    inputText: string
    normalizedInput: string | null
    pageUrl: string | null
    pageTitle: string | null
    pageType: string | null
    observationSummary: string | null
    availableCandidateIds: JsonValue | null
    normalizedSemantic: JsonValue | null
    parserOutput: JsonValue | null
    usedAiFallback: boolean
    finalExecutionSuccess: boolean | null
    failureReason: string | null
    traceId: string | null
    createdAt: Date
    _count: SemanticRuleHitLogCountAggregateOutputType | null
    _min: SemanticRuleHitLogMinAggregateOutputType | null
    _max: SemanticRuleHitLogMaxAggregateOutputType | null
  }

  type GetSemanticRuleHitLogGroupByPayload<T extends SemanticRuleHitLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleHitLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleHitLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleHitLogGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleHitLogGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleHitLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    matchedRuleIds?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    pageType?: boolean
    observationSummary?: boolean
    availableCandidateIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean
    failureReason?: boolean
    traceId?: boolean
    createdAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleHitLog$ruleSetArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleHitLog"]>

  export type SemanticRuleHitLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    matchedRuleIds?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    pageType?: boolean
    observationSummary?: boolean
    availableCandidateIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean
    failureReason?: boolean
    traceId?: boolean
    createdAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleHitLog$ruleSetArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleHitLog"]>

  export type SemanticRuleHitLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    matchedRuleIds?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    pageType?: boolean
    observationSummary?: boolean
    availableCandidateIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean
    failureReason?: boolean
    traceId?: boolean
    createdAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleHitLog$ruleSetArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleHitLog"]>

  export type SemanticRuleHitLogSelectScalar = {
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    matchedRuleIds?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    pageType?: boolean
    observationSummary?: boolean
    availableCandidateIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean
    failureReason?: boolean
    traceId?: boolean
    createdAt?: boolean
  }

  export type SemanticRuleHitLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "domainId" | "ruleSetId" | "matchedRuleIds" | "inputText" | "normalizedInput" | "pageUrl" | "pageTitle" | "pageType" | "observationSummary" | "availableCandidateIds" | "normalizedSemantic" | "parserOutput" | "usedAiFallback" | "finalExecutionSuccess" | "failureReason" | "traceId" | "createdAt", ExtArgs["result"]["semanticRuleHitLog"]>
  export type SemanticRuleHitLogInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleHitLog$ruleSetArgs<ExtArgs>
  }
  export type SemanticRuleHitLogIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleHitLog$ruleSetArgs<ExtArgs>
  }
  export type SemanticRuleHitLogIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleHitLog$ruleSetArgs<ExtArgs>
  }

  export type $SemanticRuleHitLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRuleHitLog"
    objects: {
      domain: Prisma.$SemanticRuleDomainPayload<ExtArgs>
      ruleSet: Prisma.$SemanticRuleSetPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      domainId: string
      ruleSetId: string | null
      matchedRuleIds: Prisma.JsonValue
      inputText: string
      normalizedInput: string | null
      pageUrl: string | null
      pageTitle: string | null
      pageType: string | null
      observationSummary: string | null
      availableCandidateIds: Prisma.JsonValue | null
      normalizedSemantic: Prisma.JsonValue | null
      parserOutput: Prisma.JsonValue | null
      usedAiFallback: boolean
      finalExecutionSuccess: boolean | null
      failureReason: string | null
      traceId: string | null
      createdAt: Date
    }, ExtArgs["result"]["semanticRuleHitLog"]>
    composites: {}
  }

  type SemanticRuleHitLogGetPayload<S extends boolean | null | undefined | SemanticRuleHitLogDefaultArgs> = $Result.GetResult<Prisma.$SemanticRuleHitLogPayload, S>

  type SemanticRuleHitLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleHitLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleHitLogCountAggregateInputType | true
    }

  export interface SemanticRuleHitLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRuleHitLog'], meta: { name: 'SemanticRuleHitLog' } }
    /**
     * Find zero or one SemanticRuleHitLog that matches the filter.
     * @param {SemanticRuleHitLogFindUniqueArgs} args - Arguments to find a SemanticRuleHitLog
     * @example
     * // Get one SemanticRuleHitLog
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleHitLogFindUniqueArgs>(args: SelectSubset<T, SemanticRuleHitLogFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRuleHitLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleHitLogFindUniqueOrThrowArgs} args - Arguments to find a SemanticRuleHitLog
     * @example
     * // Get one SemanticRuleHitLog
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleHitLogFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleHitLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleHitLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogFindFirstArgs} args - Arguments to find a SemanticRuleHitLog
     * @example
     * // Get one SemanticRuleHitLog
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleHitLogFindFirstArgs>(args?: SelectSubset<T, SemanticRuleHitLogFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleHitLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogFindFirstOrThrowArgs} args - Arguments to find a SemanticRuleHitLog
     * @example
     * // Get one SemanticRuleHitLog
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleHitLogFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleHitLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRuleHitLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRuleHitLogs
     * const semanticRuleHitLogs = await prisma.semanticRuleHitLog.findMany()
     * 
     * // Get first 10 SemanticRuleHitLogs
     * const semanticRuleHitLogs = await prisma.semanticRuleHitLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleHitLogWithIdOnly = await prisma.semanticRuleHitLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleHitLogFindManyArgs>(args?: SelectSubset<T, SemanticRuleHitLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRuleHitLog.
     * @param {SemanticRuleHitLogCreateArgs} args - Arguments to create a SemanticRuleHitLog.
     * @example
     * // Create one SemanticRuleHitLog
     * const SemanticRuleHitLog = await prisma.semanticRuleHitLog.create({
     *   data: {
     *     // ... data to create a SemanticRuleHitLog
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleHitLogCreateArgs>(args: SelectSubset<T, SemanticRuleHitLogCreateArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRuleHitLogs.
     * @param {SemanticRuleHitLogCreateManyArgs} args - Arguments to create many SemanticRuleHitLogs.
     * @example
     * // Create many SemanticRuleHitLogs
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleHitLogCreateManyArgs>(args?: SelectSubset<T, SemanticRuleHitLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRuleHitLogs and returns the data saved in the database.
     * @param {SemanticRuleHitLogCreateManyAndReturnArgs} args - Arguments to create many SemanticRuleHitLogs.
     * @example
     * // Create many SemanticRuleHitLogs
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRuleHitLogs and only return the `id`
     * const semanticRuleHitLogWithIdOnly = await prisma.semanticRuleHitLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleHitLogCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleHitLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRuleHitLog.
     * @param {SemanticRuleHitLogDeleteArgs} args - Arguments to delete one SemanticRuleHitLog.
     * @example
     * // Delete one SemanticRuleHitLog
     * const SemanticRuleHitLog = await prisma.semanticRuleHitLog.delete({
     *   where: {
     *     // ... filter to delete one SemanticRuleHitLog
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleHitLogDeleteArgs>(args: SelectSubset<T, SemanticRuleHitLogDeleteArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRuleHitLog.
     * @param {SemanticRuleHitLogUpdateArgs} args - Arguments to update one SemanticRuleHitLog.
     * @example
     * // Update one SemanticRuleHitLog
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleHitLogUpdateArgs>(args: SelectSubset<T, SemanticRuleHitLogUpdateArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRuleHitLogs.
     * @param {SemanticRuleHitLogDeleteManyArgs} args - Arguments to filter SemanticRuleHitLogs to delete.
     * @example
     * // Delete a few SemanticRuleHitLogs
     * const { count } = await prisma.semanticRuleHitLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleHitLogDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleHitLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleHitLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRuleHitLogs
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleHitLogUpdateManyArgs>(args: SelectSubset<T, SemanticRuleHitLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleHitLogs and returns the data updated in the database.
     * @param {SemanticRuleHitLogUpdateManyAndReturnArgs} args - Arguments to update many SemanticRuleHitLogs.
     * @example
     * // Update many SemanticRuleHitLogs
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRuleHitLogs and only return the `id`
     * const semanticRuleHitLogWithIdOnly = await prisma.semanticRuleHitLog.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleHitLogUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleHitLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRuleHitLog.
     * @param {SemanticRuleHitLogUpsertArgs} args - Arguments to update or create a SemanticRuleHitLog.
     * @example
     * // Update or create a SemanticRuleHitLog
     * const semanticRuleHitLog = await prisma.semanticRuleHitLog.upsert({
     *   create: {
     *     // ... data to create a SemanticRuleHitLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRuleHitLog we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleHitLogUpsertArgs>(args: SelectSubset<T, SemanticRuleHitLogUpsertArgs<ExtArgs>>): Prisma__SemanticRuleHitLogClient<$Result.GetResult<Prisma.$SemanticRuleHitLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRuleHitLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogCountArgs} args - Arguments to filter SemanticRuleHitLogs to count.
     * @example
     * // Count the number of SemanticRuleHitLogs
     * const count = await prisma.semanticRuleHitLog.count({
     *   where: {
     *     // ... the filter for the SemanticRuleHitLogs we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleHitLogCountArgs>(
      args?: Subset<T, SemanticRuleHitLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleHitLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRuleHitLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleHitLogAggregateArgs>(args: Subset<T, SemanticRuleHitLogAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleHitLogAggregateType<T>>

    /**
     * Group by SemanticRuleHitLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleHitLogGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleHitLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleHitLogGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleHitLogGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleHitLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleHitLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRuleHitLog model
   */
  readonly fields: SemanticRuleHitLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRuleHitLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleHitLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    domain<T extends SemanticRuleDomainDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleDomainDefaultArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    ruleSet<T extends SemanticRuleHitLog$ruleSetArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleHitLog$ruleSetArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
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
   * Fields of the SemanticRuleHitLog model
   */
  interface SemanticRuleHitLogFieldRefs {
    readonly id: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly domainId: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly ruleSetId: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly matchedRuleIds: FieldRef<"SemanticRuleHitLog", 'Json'>
    readonly inputText: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly normalizedInput: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly pageUrl: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly pageTitle: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly pageType: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly observationSummary: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly availableCandidateIds: FieldRef<"SemanticRuleHitLog", 'Json'>
    readonly normalizedSemantic: FieldRef<"SemanticRuleHitLog", 'Json'>
    readonly parserOutput: FieldRef<"SemanticRuleHitLog", 'Json'>
    readonly usedAiFallback: FieldRef<"SemanticRuleHitLog", 'Boolean'>
    readonly finalExecutionSuccess: FieldRef<"SemanticRuleHitLog", 'Boolean'>
    readonly failureReason: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly traceId: FieldRef<"SemanticRuleHitLog", 'String'>
    readonly createdAt: FieldRef<"SemanticRuleHitLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRuleHitLog findUnique
   */
  export type SemanticRuleHitLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleHitLog to fetch.
     */
    where: SemanticRuleHitLogWhereUniqueInput
  }

  /**
   * SemanticRuleHitLog findUniqueOrThrow
   */
  export type SemanticRuleHitLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleHitLog to fetch.
     */
    where: SemanticRuleHitLogWhereUniqueInput
  }

  /**
   * SemanticRuleHitLog findFirst
   */
  export type SemanticRuleHitLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleHitLog to fetch.
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleHitLogs to fetch.
     */
    orderBy?: SemanticRuleHitLogOrderByWithRelationInput | SemanticRuleHitLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleHitLogs.
     */
    cursor?: SemanticRuleHitLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleHitLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleHitLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleHitLogs.
     */
    distinct?: SemanticRuleHitLogScalarFieldEnum | SemanticRuleHitLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleHitLog findFirstOrThrow
   */
  export type SemanticRuleHitLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleHitLog to fetch.
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleHitLogs to fetch.
     */
    orderBy?: SemanticRuleHitLogOrderByWithRelationInput | SemanticRuleHitLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleHitLogs.
     */
    cursor?: SemanticRuleHitLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleHitLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleHitLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleHitLogs.
     */
    distinct?: SemanticRuleHitLogScalarFieldEnum | SemanticRuleHitLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleHitLog findMany
   */
  export type SemanticRuleHitLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleHitLogs to fetch.
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleHitLogs to fetch.
     */
    orderBy?: SemanticRuleHitLogOrderByWithRelationInput | SemanticRuleHitLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRuleHitLogs.
     */
    cursor?: SemanticRuleHitLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleHitLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleHitLogs.
     */
    skip?: number
    distinct?: SemanticRuleHitLogScalarFieldEnum | SemanticRuleHitLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleHitLog create
   */
  export type SemanticRuleHitLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRuleHitLog.
     */
    data: XOR<SemanticRuleHitLogCreateInput, SemanticRuleHitLogUncheckedCreateInput>
  }

  /**
   * SemanticRuleHitLog createMany
   */
  export type SemanticRuleHitLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRuleHitLogs.
     */
    data: SemanticRuleHitLogCreateManyInput | SemanticRuleHitLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleHitLog createManyAndReturn
   */
  export type SemanticRuleHitLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRuleHitLogs.
     */
    data: SemanticRuleHitLogCreateManyInput | SemanticRuleHitLogCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleHitLog update
   */
  export type SemanticRuleHitLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRuleHitLog.
     */
    data: XOR<SemanticRuleHitLogUpdateInput, SemanticRuleHitLogUncheckedUpdateInput>
    /**
     * Choose, which SemanticRuleHitLog to update.
     */
    where: SemanticRuleHitLogWhereUniqueInput
  }

  /**
   * SemanticRuleHitLog updateMany
   */
  export type SemanticRuleHitLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRuleHitLogs.
     */
    data: XOR<SemanticRuleHitLogUpdateManyMutationInput, SemanticRuleHitLogUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleHitLogs to update
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * Limit how many SemanticRuleHitLogs to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleHitLog updateManyAndReturn
   */
  export type SemanticRuleHitLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRuleHitLogs.
     */
    data: XOR<SemanticRuleHitLogUpdateManyMutationInput, SemanticRuleHitLogUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleHitLogs to update
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * Limit how many SemanticRuleHitLogs to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleHitLog upsert
   */
  export type SemanticRuleHitLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRuleHitLog to update in case it exists.
     */
    where: SemanticRuleHitLogWhereUniqueInput
    /**
     * In case the SemanticRuleHitLog found by the `where` argument doesn't exist, create a new SemanticRuleHitLog with this data.
     */
    create: XOR<SemanticRuleHitLogCreateInput, SemanticRuleHitLogUncheckedCreateInput>
    /**
     * In case the SemanticRuleHitLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleHitLogUpdateInput, SemanticRuleHitLogUncheckedUpdateInput>
  }

  /**
   * SemanticRuleHitLog delete
   */
  export type SemanticRuleHitLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
    /**
     * Filter which SemanticRuleHitLog to delete.
     */
    where: SemanticRuleHitLogWhereUniqueInput
  }

  /**
   * SemanticRuleHitLog deleteMany
   */
  export type SemanticRuleHitLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleHitLogs to delete
     */
    where?: SemanticRuleHitLogWhereInput
    /**
     * Limit how many SemanticRuleHitLogs to delete.
     */
    limit?: number
  }

  /**
   * SemanticRuleHitLog.ruleSet
   */
  export type SemanticRuleHitLog$ruleSetArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    where?: SemanticRuleSetWhereInput
  }

  /**
   * SemanticRuleHitLog without action
   */
  export type SemanticRuleHitLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleHitLog
     */
    select?: SemanticRuleHitLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleHitLog
     */
    omit?: SemanticRuleHitLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleHitLogInclude<ExtArgs> | null
  }


  /**
   * Model SemanticRuleErrorLog
   */

  export type AggregateSemanticRuleErrorLog = {
    _count: SemanticRuleErrorLogCountAggregateOutputType | null
    _min: SemanticRuleErrorLogMinAggregateOutputType | null
    _max: SemanticRuleErrorLogMaxAggregateOutputType | null
  }

  export type SemanticRuleErrorLogMinAggregateOutputType = {
    id: string | null
    domainId: string | null
    ruleSetId: string | null
    source: string | null
    errorType: string | null
    errorCode: string | null
    errorMessage: string | null
    inputText: string | null
    normalizedInput: string | null
    traceId: string | null
    sessionId: string | null
    taskId: string | null
    stepId: string | null
    pageUrl: string | null
    pageTitle: string | null
    host: string | null
    pageType: string | null
    observationSummary: string | null
    screenshotUrl: string | null
    domSnippet: string | null
    createdAt: Date | null
  }

  export type SemanticRuleErrorLogMaxAggregateOutputType = {
    id: string | null
    domainId: string | null
    ruleSetId: string | null
    source: string | null
    errorType: string | null
    errorCode: string | null
    errorMessage: string | null
    inputText: string | null
    normalizedInput: string | null
    traceId: string | null
    sessionId: string | null
    taskId: string | null
    stepId: string | null
    pageUrl: string | null
    pageTitle: string | null
    host: string | null
    pageType: string | null
    observationSummary: string | null
    screenshotUrl: string | null
    domSnippet: string | null
    createdAt: Date | null
  }

  export type SemanticRuleErrorLogCountAggregateOutputType = {
    id: number
    domainId: number
    ruleSetId: number
    source: number
    errorType: number
    errorCode: number
    errorMessage: number
    inputText: number
    normalizedInput: number
    traceId: number
    sessionId: number
    taskId: number
    stepId: number
    pageUrl: number
    pageTitle: number
    host: number
    pageType: number
    observationSummary: number
    candidateSummary: number
    matchedRuleIds: number
    normalizedSemantic: number
    parserOutput: number
    aiFallbackInput: number
    aiFallbackOutput: number
    screenshotUrl: number
    domSnippet: number
    locatorInfo: number
    consoleErrors: number
    metadata: number
    createdAt: number
    _all: number
  }


  export type SemanticRuleErrorLogMinAggregateInputType = {
    id?: true
    domainId?: true
    ruleSetId?: true
    source?: true
    errorType?: true
    errorCode?: true
    errorMessage?: true
    inputText?: true
    normalizedInput?: true
    traceId?: true
    sessionId?: true
    taskId?: true
    stepId?: true
    pageUrl?: true
    pageTitle?: true
    host?: true
    pageType?: true
    observationSummary?: true
    screenshotUrl?: true
    domSnippet?: true
    createdAt?: true
  }

  export type SemanticRuleErrorLogMaxAggregateInputType = {
    id?: true
    domainId?: true
    ruleSetId?: true
    source?: true
    errorType?: true
    errorCode?: true
    errorMessage?: true
    inputText?: true
    normalizedInput?: true
    traceId?: true
    sessionId?: true
    taskId?: true
    stepId?: true
    pageUrl?: true
    pageTitle?: true
    host?: true
    pageType?: true
    observationSummary?: true
    screenshotUrl?: true
    domSnippet?: true
    createdAt?: true
  }

  export type SemanticRuleErrorLogCountAggregateInputType = {
    id?: true
    domainId?: true
    ruleSetId?: true
    source?: true
    errorType?: true
    errorCode?: true
    errorMessage?: true
    inputText?: true
    normalizedInput?: true
    traceId?: true
    sessionId?: true
    taskId?: true
    stepId?: true
    pageUrl?: true
    pageTitle?: true
    host?: true
    pageType?: true
    observationSummary?: true
    candidateSummary?: true
    matchedRuleIds?: true
    normalizedSemantic?: true
    parserOutput?: true
    aiFallbackInput?: true
    aiFallbackOutput?: true
    screenshotUrl?: true
    domSnippet?: true
    locatorInfo?: true
    consoleErrors?: true
    metadata?: true
    createdAt?: true
    _all?: true
  }

  export type SemanticRuleErrorLogAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleErrorLog to aggregate.
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleErrorLogs to fetch.
     */
    orderBy?: SemanticRuleErrorLogOrderByWithRelationInput | SemanticRuleErrorLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SemanticRuleErrorLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleErrorLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleErrorLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned SemanticRuleErrorLogs
    **/
    _count?: true | SemanticRuleErrorLogCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SemanticRuleErrorLogMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SemanticRuleErrorLogMaxAggregateInputType
  }

  export type GetSemanticRuleErrorLogAggregateType<T extends SemanticRuleErrorLogAggregateArgs> = {
        [P in keyof T & keyof AggregateSemanticRuleErrorLog]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSemanticRuleErrorLog[P]>
      : GetScalarType<T[P], AggregateSemanticRuleErrorLog[P]>
  }




  export type SemanticRuleErrorLogGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SemanticRuleErrorLogWhereInput
    orderBy?: SemanticRuleErrorLogOrderByWithAggregationInput | SemanticRuleErrorLogOrderByWithAggregationInput[]
    by: SemanticRuleErrorLogScalarFieldEnum[] | SemanticRuleErrorLogScalarFieldEnum
    having?: SemanticRuleErrorLogScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SemanticRuleErrorLogCountAggregateInputType | true
    _min?: SemanticRuleErrorLogMinAggregateInputType
    _max?: SemanticRuleErrorLogMaxAggregateInputType
  }

  export type SemanticRuleErrorLogGroupByOutputType = {
    id: string
    domainId: string
    ruleSetId: string | null
    source: string
    errorType: string
    errorCode: string | null
    errorMessage: string
    inputText: string | null
    normalizedInput: string | null
    traceId: string | null
    sessionId: string | null
    taskId: string | null
    stepId: string | null
    pageUrl: string | null
    pageTitle: string | null
    host: string | null
    pageType: string | null
    observationSummary: string | null
    candidateSummary: JsonValue | null
    matchedRuleIds: JsonValue | null
    normalizedSemantic: JsonValue | null
    parserOutput: JsonValue | null
    aiFallbackInput: JsonValue | null
    aiFallbackOutput: JsonValue | null
    screenshotUrl: string | null
    domSnippet: string | null
    locatorInfo: JsonValue | null
    consoleErrors: JsonValue | null
    metadata: JsonValue | null
    createdAt: Date
    _count: SemanticRuleErrorLogCountAggregateOutputType | null
    _min: SemanticRuleErrorLogMinAggregateOutputType | null
    _max: SemanticRuleErrorLogMaxAggregateOutputType | null
  }

  type GetSemanticRuleErrorLogGroupByPayload<T extends SemanticRuleErrorLogGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SemanticRuleErrorLogGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SemanticRuleErrorLogGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SemanticRuleErrorLogGroupByOutputType[P]>
            : GetScalarType<T[P], SemanticRuleErrorLogGroupByOutputType[P]>
        }
      >
    >


  export type SemanticRuleErrorLogSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    source?: boolean
    errorType?: boolean
    errorCode?: boolean
    errorMessage?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    traceId?: boolean
    sessionId?: boolean
    taskId?: boolean
    stepId?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    host?: boolean
    pageType?: boolean
    observationSummary?: boolean
    candidateSummary?: boolean
    matchedRuleIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    aiFallbackInput?: boolean
    aiFallbackOutput?: boolean
    screenshotUrl?: boolean
    domSnippet?: boolean
    locatorInfo?: boolean
    consoleErrors?: boolean
    metadata?: boolean
    createdAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleErrorLog$ruleSetArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleErrorLog"]>

  export type SemanticRuleErrorLogSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    source?: boolean
    errorType?: boolean
    errorCode?: boolean
    errorMessage?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    traceId?: boolean
    sessionId?: boolean
    taskId?: boolean
    stepId?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    host?: boolean
    pageType?: boolean
    observationSummary?: boolean
    candidateSummary?: boolean
    matchedRuleIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    aiFallbackInput?: boolean
    aiFallbackOutput?: boolean
    screenshotUrl?: boolean
    domSnippet?: boolean
    locatorInfo?: boolean
    consoleErrors?: boolean
    metadata?: boolean
    createdAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleErrorLog$ruleSetArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleErrorLog"]>

  export type SemanticRuleErrorLogSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    source?: boolean
    errorType?: boolean
    errorCode?: boolean
    errorMessage?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    traceId?: boolean
    sessionId?: boolean
    taskId?: boolean
    stepId?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    host?: boolean
    pageType?: boolean
    observationSummary?: boolean
    candidateSummary?: boolean
    matchedRuleIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    aiFallbackInput?: boolean
    aiFallbackOutput?: boolean
    screenshotUrl?: boolean
    domSnippet?: boolean
    locatorInfo?: boolean
    consoleErrors?: boolean
    metadata?: boolean
    createdAt?: boolean
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleErrorLog$ruleSetArgs<ExtArgs>
  }, ExtArgs["result"]["semanticRuleErrorLog"]>

  export type SemanticRuleErrorLogSelectScalar = {
    id?: boolean
    domainId?: boolean
    ruleSetId?: boolean
    source?: boolean
    errorType?: boolean
    errorCode?: boolean
    errorMessage?: boolean
    inputText?: boolean
    normalizedInput?: boolean
    traceId?: boolean
    sessionId?: boolean
    taskId?: boolean
    stepId?: boolean
    pageUrl?: boolean
    pageTitle?: boolean
    host?: boolean
    pageType?: boolean
    observationSummary?: boolean
    candidateSummary?: boolean
    matchedRuleIds?: boolean
    normalizedSemantic?: boolean
    parserOutput?: boolean
    aiFallbackInput?: boolean
    aiFallbackOutput?: boolean
    screenshotUrl?: boolean
    domSnippet?: boolean
    locatorInfo?: boolean
    consoleErrors?: boolean
    metadata?: boolean
    createdAt?: boolean
  }

  export type SemanticRuleErrorLogOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "domainId" | "ruleSetId" | "source" | "errorType" | "errorCode" | "errorMessage" | "inputText" | "normalizedInput" | "traceId" | "sessionId" | "taskId" | "stepId" | "pageUrl" | "pageTitle" | "host" | "pageType" | "observationSummary" | "candidateSummary" | "matchedRuleIds" | "normalizedSemantic" | "parserOutput" | "aiFallbackInput" | "aiFallbackOutput" | "screenshotUrl" | "domSnippet" | "locatorInfo" | "consoleErrors" | "metadata" | "createdAt", ExtArgs["result"]["semanticRuleErrorLog"]>
  export type SemanticRuleErrorLogInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleErrorLog$ruleSetArgs<ExtArgs>
  }
  export type SemanticRuleErrorLogIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleErrorLog$ruleSetArgs<ExtArgs>
  }
  export type SemanticRuleErrorLogIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    domain?: boolean | SemanticRuleDomainDefaultArgs<ExtArgs>
    ruleSet?: boolean | SemanticRuleErrorLog$ruleSetArgs<ExtArgs>
  }

  export type $SemanticRuleErrorLogPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "SemanticRuleErrorLog"
    objects: {
      domain: Prisma.$SemanticRuleDomainPayload<ExtArgs>
      ruleSet: Prisma.$SemanticRuleSetPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      domainId: string
      ruleSetId: string | null
      source: string
      errorType: string
      errorCode: string | null
      errorMessage: string
      inputText: string | null
      normalizedInput: string | null
      traceId: string | null
      sessionId: string | null
      taskId: string | null
      stepId: string | null
      pageUrl: string | null
      pageTitle: string | null
      host: string | null
      pageType: string | null
      observationSummary: string | null
      candidateSummary: Prisma.JsonValue | null
      matchedRuleIds: Prisma.JsonValue | null
      normalizedSemantic: Prisma.JsonValue | null
      parserOutput: Prisma.JsonValue | null
      aiFallbackInput: Prisma.JsonValue | null
      aiFallbackOutput: Prisma.JsonValue | null
      screenshotUrl: string | null
      domSnippet: string | null
      locatorInfo: Prisma.JsonValue | null
      consoleErrors: Prisma.JsonValue | null
      metadata: Prisma.JsonValue | null
      createdAt: Date
    }, ExtArgs["result"]["semanticRuleErrorLog"]>
    composites: {}
  }

  type SemanticRuleErrorLogGetPayload<S extends boolean | null | undefined | SemanticRuleErrorLogDefaultArgs> = $Result.GetResult<Prisma.$SemanticRuleErrorLogPayload, S>

  type SemanticRuleErrorLogCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SemanticRuleErrorLogFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SemanticRuleErrorLogCountAggregateInputType | true
    }

  export interface SemanticRuleErrorLogDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['SemanticRuleErrorLog'], meta: { name: 'SemanticRuleErrorLog' } }
    /**
     * Find zero or one SemanticRuleErrorLog that matches the filter.
     * @param {SemanticRuleErrorLogFindUniqueArgs} args - Arguments to find a SemanticRuleErrorLog
     * @example
     * // Get one SemanticRuleErrorLog
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SemanticRuleErrorLogFindUniqueArgs>(args: SelectSubset<T, SemanticRuleErrorLogFindUniqueArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one SemanticRuleErrorLog that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SemanticRuleErrorLogFindUniqueOrThrowArgs} args - Arguments to find a SemanticRuleErrorLog
     * @example
     * // Get one SemanticRuleErrorLog
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SemanticRuleErrorLogFindUniqueOrThrowArgs>(args: SelectSubset<T, SemanticRuleErrorLogFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleErrorLog that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogFindFirstArgs} args - Arguments to find a SemanticRuleErrorLog
     * @example
     * // Get one SemanticRuleErrorLog
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SemanticRuleErrorLogFindFirstArgs>(args?: SelectSubset<T, SemanticRuleErrorLogFindFirstArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first SemanticRuleErrorLog that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogFindFirstOrThrowArgs} args - Arguments to find a SemanticRuleErrorLog
     * @example
     * // Get one SemanticRuleErrorLog
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SemanticRuleErrorLogFindFirstOrThrowArgs>(args?: SelectSubset<T, SemanticRuleErrorLogFindFirstOrThrowArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more SemanticRuleErrorLogs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SemanticRuleErrorLogs
     * const semanticRuleErrorLogs = await prisma.semanticRuleErrorLog.findMany()
     * 
     * // Get first 10 SemanticRuleErrorLogs
     * const semanticRuleErrorLogs = await prisma.semanticRuleErrorLog.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const semanticRuleErrorLogWithIdOnly = await prisma.semanticRuleErrorLog.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SemanticRuleErrorLogFindManyArgs>(args?: SelectSubset<T, SemanticRuleErrorLogFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a SemanticRuleErrorLog.
     * @param {SemanticRuleErrorLogCreateArgs} args - Arguments to create a SemanticRuleErrorLog.
     * @example
     * // Create one SemanticRuleErrorLog
     * const SemanticRuleErrorLog = await prisma.semanticRuleErrorLog.create({
     *   data: {
     *     // ... data to create a SemanticRuleErrorLog
     *   }
     * })
     * 
     */
    create<T extends SemanticRuleErrorLogCreateArgs>(args: SelectSubset<T, SemanticRuleErrorLogCreateArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many SemanticRuleErrorLogs.
     * @param {SemanticRuleErrorLogCreateManyArgs} args - Arguments to create many SemanticRuleErrorLogs.
     * @example
     * // Create many SemanticRuleErrorLogs
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SemanticRuleErrorLogCreateManyArgs>(args?: SelectSubset<T, SemanticRuleErrorLogCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many SemanticRuleErrorLogs and returns the data saved in the database.
     * @param {SemanticRuleErrorLogCreateManyAndReturnArgs} args - Arguments to create many SemanticRuleErrorLogs.
     * @example
     * // Create many SemanticRuleErrorLogs
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many SemanticRuleErrorLogs and only return the `id`
     * const semanticRuleErrorLogWithIdOnly = await prisma.semanticRuleErrorLog.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SemanticRuleErrorLogCreateManyAndReturnArgs>(args?: SelectSubset<T, SemanticRuleErrorLogCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a SemanticRuleErrorLog.
     * @param {SemanticRuleErrorLogDeleteArgs} args - Arguments to delete one SemanticRuleErrorLog.
     * @example
     * // Delete one SemanticRuleErrorLog
     * const SemanticRuleErrorLog = await prisma.semanticRuleErrorLog.delete({
     *   where: {
     *     // ... filter to delete one SemanticRuleErrorLog
     *   }
     * })
     * 
     */
    delete<T extends SemanticRuleErrorLogDeleteArgs>(args: SelectSubset<T, SemanticRuleErrorLogDeleteArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one SemanticRuleErrorLog.
     * @param {SemanticRuleErrorLogUpdateArgs} args - Arguments to update one SemanticRuleErrorLog.
     * @example
     * // Update one SemanticRuleErrorLog
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SemanticRuleErrorLogUpdateArgs>(args: SelectSubset<T, SemanticRuleErrorLogUpdateArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more SemanticRuleErrorLogs.
     * @param {SemanticRuleErrorLogDeleteManyArgs} args - Arguments to filter SemanticRuleErrorLogs to delete.
     * @example
     * // Delete a few SemanticRuleErrorLogs
     * const { count } = await prisma.semanticRuleErrorLog.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SemanticRuleErrorLogDeleteManyArgs>(args?: SelectSubset<T, SemanticRuleErrorLogDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleErrorLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SemanticRuleErrorLogs
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SemanticRuleErrorLogUpdateManyArgs>(args: SelectSubset<T, SemanticRuleErrorLogUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more SemanticRuleErrorLogs and returns the data updated in the database.
     * @param {SemanticRuleErrorLogUpdateManyAndReturnArgs} args - Arguments to update many SemanticRuleErrorLogs.
     * @example
     * // Update many SemanticRuleErrorLogs
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more SemanticRuleErrorLogs and only return the `id`
     * const semanticRuleErrorLogWithIdOnly = await prisma.semanticRuleErrorLog.updateManyAndReturn({
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
    updateManyAndReturn<T extends SemanticRuleErrorLogUpdateManyAndReturnArgs>(args: SelectSubset<T, SemanticRuleErrorLogUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one SemanticRuleErrorLog.
     * @param {SemanticRuleErrorLogUpsertArgs} args - Arguments to update or create a SemanticRuleErrorLog.
     * @example
     * // Update or create a SemanticRuleErrorLog
     * const semanticRuleErrorLog = await prisma.semanticRuleErrorLog.upsert({
     *   create: {
     *     // ... data to create a SemanticRuleErrorLog
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SemanticRuleErrorLog we want to update
     *   }
     * })
     */
    upsert<T extends SemanticRuleErrorLogUpsertArgs>(args: SelectSubset<T, SemanticRuleErrorLogUpsertArgs<ExtArgs>>): Prisma__SemanticRuleErrorLogClient<$Result.GetResult<Prisma.$SemanticRuleErrorLogPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of SemanticRuleErrorLogs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogCountArgs} args - Arguments to filter SemanticRuleErrorLogs to count.
     * @example
     * // Count the number of SemanticRuleErrorLogs
     * const count = await prisma.semanticRuleErrorLog.count({
     *   where: {
     *     // ... the filter for the SemanticRuleErrorLogs we want to count
     *   }
     * })
    **/
    count<T extends SemanticRuleErrorLogCountArgs>(
      args?: Subset<T, SemanticRuleErrorLogCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SemanticRuleErrorLogCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a SemanticRuleErrorLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SemanticRuleErrorLogAggregateArgs>(args: Subset<T, SemanticRuleErrorLogAggregateArgs>): Prisma.PrismaPromise<GetSemanticRuleErrorLogAggregateType<T>>

    /**
     * Group by SemanticRuleErrorLog.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SemanticRuleErrorLogGroupByArgs} args - Group by arguments.
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
      T extends SemanticRuleErrorLogGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SemanticRuleErrorLogGroupByArgs['orderBy'] }
        : { orderBy?: SemanticRuleErrorLogGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SemanticRuleErrorLogGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSemanticRuleErrorLogGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the SemanticRuleErrorLog model
   */
  readonly fields: SemanticRuleErrorLogFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SemanticRuleErrorLog.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SemanticRuleErrorLogClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    domain<T extends SemanticRuleDomainDefaultArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleDomainDefaultArgs<ExtArgs>>): Prisma__SemanticRuleDomainClient<$Result.GetResult<Prisma.$SemanticRuleDomainPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    ruleSet<T extends SemanticRuleErrorLog$ruleSetArgs<ExtArgs> = {}>(args?: Subset<T, SemanticRuleErrorLog$ruleSetArgs<ExtArgs>>): Prisma__SemanticRuleSetClient<$Result.GetResult<Prisma.$SemanticRuleSetPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
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
   * Fields of the SemanticRuleErrorLog model
   */
  interface SemanticRuleErrorLogFieldRefs {
    readonly id: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly domainId: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly ruleSetId: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly source: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly errorType: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly errorCode: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly errorMessage: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly inputText: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly normalizedInput: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly traceId: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly sessionId: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly taskId: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly stepId: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly pageUrl: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly pageTitle: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly host: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly pageType: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly observationSummary: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly candidateSummary: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly matchedRuleIds: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly normalizedSemantic: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly parserOutput: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly aiFallbackInput: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly aiFallbackOutput: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly screenshotUrl: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly domSnippet: FieldRef<"SemanticRuleErrorLog", 'String'>
    readonly locatorInfo: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly consoleErrors: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly metadata: FieldRef<"SemanticRuleErrorLog", 'Json'>
    readonly createdAt: FieldRef<"SemanticRuleErrorLog", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * SemanticRuleErrorLog findUnique
   */
  export type SemanticRuleErrorLogFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleErrorLog to fetch.
     */
    where: SemanticRuleErrorLogWhereUniqueInput
  }

  /**
   * SemanticRuleErrorLog findUniqueOrThrow
   */
  export type SemanticRuleErrorLogFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleErrorLog to fetch.
     */
    where: SemanticRuleErrorLogWhereUniqueInput
  }

  /**
   * SemanticRuleErrorLog findFirst
   */
  export type SemanticRuleErrorLogFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleErrorLog to fetch.
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleErrorLogs to fetch.
     */
    orderBy?: SemanticRuleErrorLogOrderByWithRelationInput | SemanticRuleErrorLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleErrorLogs.
     */
    cursor?: SemanticRuleErrorLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleErrorLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleErrorLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleErrorLogs.
     */
    distinct?: SemanticRuleErrorLogScalarFieldEnum | SemanticRuleErrorLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleErrorLog findFirstOrThrow
   */
  export type SemanticRuleErrorLogFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleErrorLog to fetch.
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleErrorLogs to fetch.
     */
    orderBy?: SemanticRuleErrorLogOrderByWithRelationInput | SemanticRuleErrorLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for SemanticRuleErrorLogs.
     */
    cursor?: SemanticRuleErrorLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleErrorLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleErrorLogs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of SemanticRuleErrorLogs.
     */
    distinct?: SemanticRuleErrorLogScalarFieldEnum | SemanticRuleErrorLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleErrorLog findMany
   */
  export type SemanticRuleErrorLogFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * Filter, which SemanticRuleErrorLogs to fetch.
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of SemanticRuleErrorLogs to fetch.
     */
    orderBy?: SemanticRuleErrorLogOrderByWithRelationInput | SemanticRuleErrorLogOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing SemanticRuleErrorLogs.
     */
    cursor?: SemanticRuleErrorLogWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` SemanticRuleErrorLogs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` SemanticRuleErrorLogs.
     */
    skip?: number
    distinct?: SemanticRuleErrorLogScalarFieldEnum | SemanticRuleErrorLogScalarFieldEnum[]
  }

  /**
   * SemanticRuleErrorLog create
   */
  export type SemanticRuleErrorLogCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * The data needed to create a SemanticRuleErrorLog.
     */
    data: XOR<SemanticRuleErrorLogCreateInput, SemanticRuleErrorLogUncheckedCreateInput>
  }

  /**
   * SemanticRuleErrorLog createMany
   */
  export type SemanticRuleErrorLogCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many SemanticRuleErrorLogs.
     */
    data: SemanticRuleErrorLogCreateManyInput | SemanticRuleErrorLogCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * SemanticRuleErrorLog createManyAndReturn
   */
  export type SemanticRuleErrorLogCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * The data used to create many SemanticRuleErrorLogs.
     */
    data: SemanticRuleErrorLogCreateManyInput | SemanticRuleErrorLogCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleErrorLog update
   */
  export type SemanticRuleErrorLogUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * The data needed to update a SemanticRuleErrorLog.
     */
    data: XOR<SemanticRuleErrorLogUpdateInput, SemanticRuleErrorLogUncheckedUpdateInput>
    /**
     * Choose, which SemanticRuleErrorLog to update.
     */
    where: SemanticRuleErrorLogWhereUniqueInput
  }

  /**
   * SemanticRuleErrorLog updateMany
   */
  export type SemanticRuleErrorLogUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update SemanticRuleErrorLogs.
     */
    data: XOR<SemanticRuleErrorLogUpdateManyMutationInput, SemanticRuleErrorLogUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleErrorLogs to update
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * Limit how many SemanticRuleErrorLogs to update.
     */
    limit?: number
  }

  /**
   * SemanticRuleErrorLog updateManyAndReturn
   */
  export type SemanticRuleErrorLogUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * The data used to update SemanticRuleErrorLogs.
     */
    data: XOR<SemanticRuleErrorLogUpdateManyMutationInput, SemanticRuleErrorLogUncheckedUpdateManyInput>
    /**
     * Filter which SemanticRuleErrorLogs to update
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * Limit how many SemanticRuleErrorLogs to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * SemanticRuleErrorLog upsert
   */
  export type SemanticRuleErrorLogUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * The filter to search for the SemanticRuleErrorLog to update in case it exists.
     */
    where: SemanticRuleErrorLogWhereUniqueInput
    /**
     * In case the SemanticRuleErrorLog found by the `where` argument doesn't exist, create a new SemanticRuleErrorLog with this data.
     */
    create: XOR<SemanticRuleErrorLogCreateInput, SemanticRuleErrorLogUncheckedCreateInput>
    /**
     * In case the SemanticRuleErrorLog was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SemanticRuleErrorLogUpdateInput, SemanticRuleErrorLogUncheckedUpdateInput>
  }

  /**
   * SemanticRuleErrorLog delete
   */
  export type SemanticRuleErrorLogDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
    /**
     * Filter which SemanticRuleErrorLog to delete.
     */
    where: SemanticRuleErrorLogWhereUniqueInput
  }

  /**
   * SemanticRuleErrorLog deleteMany
   */
  export type SemanticRuleErrorLogDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which SemanticRuleErrorLogs to delete
     */
    where?: SemanticRuleErrorLogWhereInput
    /**
     * Limit how many SemanticRuleErrorLogs to delete.
     */
    limit?: number
  }

  /**
   * SemanticRuleErrorLog.ruleSet
   */
  export type SemanticRuleErrorLog$ruleSetArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleSet
     */
    select?: SemanticRuleSetSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleSet
     */
    omit?: SemanticRuleSetOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleSetInclude<ExtArgs> | null
    where?: SemanticRuleSetWhereInput
  }

  /**
   * SemanticRuleErrorLog without action
   */
  export type SemanticRuleErrorLogDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SemanticRuleErrorLog
     */
    select?: SemanticRuleErrorLogSelect<ExtArgs> | null
    /**
     * Omit specific fields from the SemanticRuleErrorLog
     */
    omit?: SemanticRuleErrorLogOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SemanticRuleErrorLogInclude<ExtArgs> | null
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


  export const SemanticRuleDomainScalarFieldEnum: {
    id: 'id',
    code: 'code',
    name: 'name',
    description: 'description',
    enabled: 'enabled',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SemanticRuleDomainScalarFieldEnum = (typeof SemanticRuleDomainScalarFieldEnum)[keyof typeof SemanticRuleDomainScalarFieldEnum]


  export const SemanticRuleSetScalarFieldEnum: {
    id: 'id',
    domainId: 'domainId',
    key: 'key',
    name: 'name',
    version: 'version',
    status: 'status',
    description: 'description',
    basedOnRuleSetId: 'basedOnRuleSetId',
    changeSummary: 'changeSummary',
    createdBy: 'createdBy',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
    activatedAt: 'activatedAt',
    archivedAt: 'archivedAt'
  };

  export type SemanticRuleSetScalarFieldEnum = (typeof SemanticRuleSetScalarFieldEnum)[keyof typeof SemanticRuleSetScalarFieldEnum]


  export const SemanticRuleScalarFieldEnum: {
    id: 'id',
    ruleSetId: 'ruleSetId',
    type: 'type',
    name: 'name',
    enabled: 'enabled',
    priority: 'priority',
    stopOnMatch: 'stopOnMatch',
    flags: 'flags',
    patterns: 'patterns',
    outputs: 'outputs',
    examples: 'examples',
    negativeExamples: 'negativeExamples',
    tags: 'tags',
    note: 'note',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SemanticRuleScalarFieldEnum = (typeof SemanticRuleScalarFieldEnum)[keyof typeof SemanticRuleScalarFieldEnum]


  export const SemanticRuleReleaseScalarFieldEnum: {
    id: 'id',
    ruleSetId: 'ruleSetId',
    releaseMode: 'releaseMode',
    fromStatus: 'fromStatus',
    toStatus: 'toStatus',
    releasedBy: 'releasedBy',
    releaseNote: 'releaseNote',
    targeting: 'targeting',
    triggeredAt: 'triggeredAt',
    effectiveAt: 'effectiveAt',
    previousActiveRuleSetId: 'previousActiveRuleSetId'
  };

  export type SemanticRuleReleaseScalarFieldEnum = (typeof SemanticRuleReleaseScalarFieldEnum)[keyof typeof SemanticRuleReleaseScalarFieldEnum]


  export const SemanticRuleTargetingScalarFieldEnum: {
    id: 'id',
    ruleSetId: 'ruleSetId',
    environments: 'environments',
    hosts: 'hosts',
    tenantIds: 'tenantIds',
    userIds: 'userIds',
    skillIds: 'skillIds',
    pageTypes: 'pageTypes',
    sampleRate: 'sampleRate',
    enabled: 'enabled',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SemanticRuleTargetingScalarFieldEnum = (typeof SemanticRuleTargetingScalarFieldEnum)[keyof typeof SemanticRuleTargetingScalarFieldEnum]


  export const SemanticRuleHitLogScalarFieldEnum: {
    id: 'id',
    domainId: 'domainId',
    ruleSetId: 'ruleSetId',
    matchedRuleIds: 'matchedRuleIds',
    inputText: 'inputText',
    normalizedInput: 'normalizedInput',
    pageUrl: 'pageUrl',
    pageTitle: 'pageTitle',
    pageType: 'pageType',
    observationSummary: 'observationSummary',
    availableCandidateIds: 'availableCandidateIds',
    normalizedSemantic: 'normalizedSemantic',
    parserOutput: 'parserOutput',
    usedAiFallback: 'usedAiFallback',
    finalExecutionSuccess: 'finalExecutionSuccess',
    failureReason: 'failureReason',
    traceId: 'traceId',
    createdAt: 'createdAt'
  };

  export type SemanticRuleHitLogScalarFieldEnum = (typeof SemanticRuleHitLogScalarFieldEnum)[keyof typeof SemanticRuleHitLogScalarFieldEnum]


  export const SemanticRuleErrorLogScalarFieldEnum: {
    id: 'id',
    domainId: 'domainId',
    ruleSetId: 'ruleSetId',
    source: 'source',
    errorType: 'errorType',
    errorCode: 'errorCode',
    errorMessage: 'errorMessage',
    inputText: 'inputText',
    normalizedInput: 'normalizedInput',
    traceId: 'traceId',
    sessionId: 'sessionId',
    taskId: 'taskId',
    stepId: 'stepId',
    pageUrl: 'pageUrl',
    pageTitle: 'pageTitle',
    host: 'host',
    pageType: 'pageType',
    observationSummary: 'observationSummary',
    candidateSummary: 'candidateSummary',
    matchedRuleIds: 'matchedRuleIds',
    normalizedSemantic: 'normalizedSemantic',
    parserOutput: 'parserOutput',
    aiFallbackInput: 'aiFallbackInput',
    aiFallbackOutput: 'aiFallbackOutput',
    screenshotUrl: 'screenshotUrl',
    domSnippet: 'domSnippet',
    locatorInfo: 'locatorInfo',
    consoleErrors: 'consoleErrors',
    metadata: 'metadata',
    createdAt: 'createdAt'
  };

  export type SemanticRuleErrorLogScalarFieldEnum = (typeof SemanticRuleErrorLogScalarFieldEnum)[keyof typeof SemanticRuleErrorLogScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


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


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


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
   * Reference to a field of type 'SemanticRuleSetStatus'
   */
  export type EnumSemanticRuleSetStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SemanticRuleSetStatus'>
    


  /**
   * Reference to a field of type 'SemanticRuleSetStatus[]'
   */
  export type ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SemanticRuleSetStatus[]'>
    


  /**
   * Reference to a field of type 'SemanticRuleType'
   */
  export type EnumSemanticRuleTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SemanticRuleType'>
    


  /**
   * Reference to a field of type 'SemanticRuleType[]'
   */
  export type ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SemanticRuleType[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'SemanticRuleReleaseMode'
   */
  export type EnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SemanticRuleReleaseMode'>
    


  /**
   * Reference to a field of type 'SemanticRuleReleaseMode[]'
   */
  export type ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SemanticRuleReleaseMode[]'>
    


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


  export type SemanticRuleDomainWhereInput = {
    AND?: SemanticRuleDomainWhereInput | SemanticRuleDomainWhereInput[]
    OR?: SemanticRuleDomainWhereInput[]
    NOT?: SemanticRuleDomainWhereInput | SemanticRuleDomainWhereInput[]
    id?: UuidFilter<"SemanticRuleDomain"> | string
    code?: StringFilter<"SemanticRuleDomain"> | string
    name?: StringFilter<"SemanticRuleDomain"> | string
    description?: StringNullableFilter<"SemanticRuleDomain"> | string | null
    enabled?: BoolFilter<"SemanticRuleDomain"> | boolean
    createdAt?: DateTimeFilter<"SemanticRuleDomain"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleDomain"> | Date | string
    ruleSets?: SemanticRuleSetListRelationFilter
    hitLogs?: SemanticRuleHitLogListRelationFilter
    errorLogs?: SemanticRuleErrorLogListRelationFilter
  }

  export type SemanticRuleDomainOrderByWithRelationInput = {
    id?: SortOrder
    code?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    ruleSets?: SemanticRuleSetOrderByRelationAggregateInput
    hitLogs?: SemanticRuleHitLogOrderByRelationAggregateInput
    errorLogs?: SemanticRuleErrorLogOrderByRelationAggregateInput
  }

  export type SemanticRuleDomainWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    code?: string
    AND?: SemanticRuleDomainWhereInput | SemanticRuleDomainWhereInput[]
    OR?: SemanticRuleDomainWhereInput[]
    NOT?: SemanticRuleDomainWhereInput | SemanticRuleDomainWhereInput[]
    name?: StringFilter<"SemanticRuleDomain"> | string
    description?: StringNullableFilter<"SemanticRuleDomain"> | string | null
    enabled?: BoolFilter<"SemanticRuleDomain"> | boolean
    createdAt?: DateTimeFilter<"SemanticRuleDomain"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleDomain"> | Date | string
    ruleSets?: SemanticRuleSetListRelationFilter
    hitLogs?: SemanticRuleHitLogListRelationFilter
    errorLogs?: SemanticRuleErrorLogListRelationFilter
  }, "id" | "code">

  export type SemanticRuleDomainOrderByWithAggregationInput = {
    id?: SortOrder
    code?: SortOrder
    name?: SortOrder
    description?: SortOrderInput | SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SemanticRuleDomainCountOrderByAggregateInput
    _max?: SemanticRuleDomainMaxOrderByAggregateInput
    _min?: SemanticRuleDomainMinOrderByAggregateInput
  }

  export type SemanticRuleDomainScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleDomainScalarWhereWithAggregatesInput | SemanticRuleDomainScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleDomainScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleDomainScalarWhereWithAggregatesInput | SemanticRuleDomainScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRuleDomain"> | string
    code?: StringWithAggregatesFilter<"SemanticRuleDomain"> | string
    name?: StringWithAggregatesFilter<"SemanticRuleDomain"> | string
    description?: StringNullableWithAggregatesFilter<"SemanticRuleDomain"> | string | null
    enabled?: BoolWithAggregatesFilter<"SemanticRuleDomain"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"SemanticRuleDomain"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SemanticRuleDomain"> | Date | string
  }

  export type SemanticRuleSetWhereInput = {
    AND?: SemanticRuleSetWhereInput | SemanticRuleSetWhereInput[]
    OR?: SemanticRuleSetWhereInput[]
    NOT?: SemanticRuleSetWhereInput | SemanticRuleSetWhereInput[]
    id?: UuidFilter<"SemanticRuleSet"> | string
    domainId?: UuidFilter<"SemanticRuleSet"> | string
    key?: StringFilter<"SemanticRuleSet"> | string
    name?: StringFilter<"SemanticRuleSet"> | string
    version?: StringFilter<"SemanticRuleSet"> | string
    status?: EnumSemanticRuleSetStatusFilter<"SemanticRuleSet"> | $Enums.SemanticRuleSetStatus
    description?: StringNullableFilter<"SemanticRuleSet"> | string | null
    basedOnRuleSetId?: UuidNullableFilter<"SemanticRuleSet"> | string | null
    changeSummary?: StringNullableFilter<"SemanticRuleSet"> | string | null
    createdBy?: StringFilter<"SemanticRuleSet"> | string
    createdAt?: DateTimeFilter<"SemanticRuleSet"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleSet"> | Date | string
    activatedAt?: DateTimeNullableFilter<"SemanticRuleSet"> | Date | string | null
    archivedAt?: DateTimeNullableFilter<"SemanticRuleSet"> | Date | string | null
    domain?: XOR<SemanticRuleDomainScalarRelationFilter, SemanticRuleDomainWhereInput>
    rules?: SemanticRuleListRelationFilter
    releases?: SemanticRuleReleaseListRelationFilter
    targetings?: SemanticRuleTargetingListRelationFilter
    hitLogs?: SemanticRuleHitLogListRelationFilter
    errorLogs?: SemanticRuleErrorLogListRelationFilter
  }

  export type SemanticRuleSetOrderByWithRelationInput = {
    id?: SortOrder
    domainId?: SortOrder
    key?: SortOrder
    name?: SortOrder
    version?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    basedOnRuleSetId?: SortOrderInput | SortOrder
    changeSummary?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    activatedAt?: SortOrderInput | SortOrder
    archivedAt?: SortOrderInput | SortOrder
    domain?: SemanticRuleDomainOrderByWithRelationInput
    rules?: SemanticRuleOrderByRelationAggregateInput
    releases?: SemanticRuleReleaseOrderByRelationAggregateInput
    targetings?: SemanticRuleTargetingOrderByRelationAggregateInput
    hitLogs?: SemanticRuleHitLogOrderByRelationAggregateInput
    errorLogs?: SemanticRuleErrorLogOrderByRelationAggregateInput
  }

  export type SemanticRuleSetWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    domainId_key_version?: SemanticRuleSetDomainIdKeyVersionCompoundUniqueInput
    AND?: SemanticRuleSetWhereInput | SemanticRuleSetWhereInput[]
    OR?: SemanticRuleSetWhereInput[]
    NOT?: SemanticRuleSetWhereInput | SemanticRuleSetWhereInput[]
    domainId?: UuidFilter<"SemanticRuleSet"> | string
    key?: StringFilter<"SemanticRuleSet"> | string
    name?: StringFilter<"SemanticRuleSet"> | string
    version?: StringFilter<"SemanticRuleSet"> | string
    status?: EnumSemanticRuleSetStatusFilter<"SemanticRuleSet"> | $Enums.SemanticRuleSetStatus
    description?: StringNullableFilter<"SemanticRuleSet"> | string | null
    basedOnRuleSetId?: UuidNullableFilter<"SemanticRuleSet"> | string | null
    changeSummary?: StringNullableFilter<"SemanticRuleSet"> | string | null
    createdBy?: StringFilter<"SemanticRuleSet"> | string
    createdAt?: DateTimeFilter<"SemanticRuleSet"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleSet"> | Date | string
    activatedAt?: DateTimeNullableFilter<"SemanticRuleSet"> | Date | string | null
    archivedAt?: DateTimeNullableFilter<"SemanticRuleSet"> | Date | string | null
    domain?: XOR<SemanticRuleDomainScalarRelationFilter, SemanticRuleDomainWhereInput>
    rules?: SemanticRuleListRelationFilter
    releases?: SemanticRuleReleaseListRelationFilter
    targetings?: SemanticRuleTargetingListRelationFilter
    hitLogs?: SemanticRuleHitLogListRelationFilter
    errorLogs?: SemanticRuleErrorLogListRelationFilter
  }, "id" | "domainId_key_version">

  export type SemanticRuleSetOrderByWithAggregationInput = {
    id?: SortOrder
    domainId?: SortOrder
    key?: SortOrder
    name?: SortOrder
    version?: SortOrder
    status?: SortOrder
    description?: SortOrderInput | SortOrder
    basedOnRuleSetId?: SortOrderInput | SortOrder
    changeSummary?: SortOrderInput | SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    activatedAt?: SortOrderInput | SortOrder
    archivedAt?: SortOrderInput | SortOrder
    _count?: SemanticRuleSetCountOrderByAggregateInput
    _max?: SemanticRuleSetMaxOrderByAggregateInput
    _min?: SemanticRuleSetMinOrderByAggregateInput
  }

  export type SemanticRuleSetScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleSetScalarWhereWithAggregatesInput | SemanticRuleSetScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleSetScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleSetScalarWhereWithAggregatesInput | SemanticRuleSetScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRuleSet"> | string
    domainId?: UuidWithAggregatesFilter<"SemanticRuleSet"> | string
    key?: StringWithAggregatesFilter<"SemanticRuleSet"> | string
    name?: StringWithAggregatesFilter<"SemanticRuleSet"> | string
    version?: StringWithAggregatesFilter<"SemanticRuleSet"> | string
    status?: EnumSemanticRuleSetStatusWithAggregatesFilter<"SemanticRuleSet"> | $Enums.SemanticRuleSetStatus
    description?: StringNullableWithAggregatesFilter<"SemanticRuleSet"> | string | null
    basedOnRuleSetId?: UuidNullableWithAggregatesFilter<"SemanticRuleSet"> | string | null
    changeSummary?: StringNullableWithAggregatesFilter<"SemanticRuleSet"> | string | null
    createdBy?: StringWithAggregatesFilter<"SemanticRuleSet"> | string
    createdAt?: DateTimeWithAggregatesFilter<"SemanticRuleSet"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SemanticRuleSet"> | Date | string
    activatedAt?: DateTimeNullableWithAggregatesFilter<"SemanticRuleSet"> | Date | string | null
    archivedAt?: DateTimeNullableWithAggregatesFilter<"SemanticRuleSet"> | Date | string | null
  }

  export type SemanticRuleWhereInput = {
    AND?: SemanticRuleWhereInput | SemanticRuleWhereInput[]
    OR?: SemanticRuleWhereInput[]
    NOT?: SemanticRuleWhereInput | SemanticRuleWhereInput[]
    id?: UuidFilter<"SemanticRule"> | string
    ruleSetId?: UuidFilter<"SemanticRule"> | string
    type?: EnumSemanticRuleTypeFilter<"SemanticRule"> | $Enums.SemanticRuleType
    name?: StringFilter<"SemanticRule"> | string
    enabled?: BoolFilter<"SemanticRule"> | boolean
    priority?: IntFilter<"SemanticRule"> | number
    stopOnMatch?: BoolFilter<"SemanticRule"> | boolean
    flags?: StringNullableFilter<"SemanticRule"> | string | null
    patterns?: JsonFilter<"SemanticRule">
    outputs?: JsonFilter<"SemanticRule">
    examples?: JsonNullableFilter<"SemanticRule">
    negativeExamples?: JsonNullableFilter<"SemanticRule">
    tags?: JsonNullableFilter<"SemanticRule">
    note?: StringNullableFilter<"SemanticRule"> | string | null
    createdAt?: DateTimeFilter<"SemanticRule"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRule"> | Date | string
    ruleSet?: XOR<SemanticRuleSetScalarRelationFilter, SemanticRuleSetWhereInput>
  }

  export type SemanticRuleOrderByWithRelationInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    type?: SortOrder
    name?: SortOrder
    enabled?: SortOrder
    priority?: SortOrder
    stopOnMatch?: SortOrder
    flags?: SortOrderInput | SortOrder
    patterns?: SortOrder
    outputs?: SortOrder
    examples?: SortOrderInput | SortOrder
    negativeExamples?: SortOrderInput | SortOrder
    tags?: SortOrderInput | SortOrder
    note?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    ruleSet?: SemanticRuleSetOrderByWithRelationInput
  }

  export type SemanticRuleWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SemanticRuleWhereInput | SemanticRuleWhereInput[]
    OR?: SemanticRuleWhereInput[]
    NOT?: SemanticRuleWhereInput | SemanticRuleWhereInput[]
    ruleSetId?: UuidFilter<"SemanticRule"> | string
    type?: EnumSemanticRuleTypeFilter<"SemanticRule"> | $Enums.SemanticRuleType
    name?: StringFilter<"SemanticRule"> | string
    enabled?: BoolFilter<"SemanticRule"> | boolean
    priority?: IntFilter<"SemanticRule"> | number
    stopOnMatch?: BoolFilter<"SemanticRule"> | boolean
    flags?: StringNullableFilter<"SemanticRule"> | string | null
    patterns?: JsonFilter<"SemanticRule">
    outputs?: JsonFilter<"SemanticRule">
    examples?: JsonNullableFilter<"SemanticRule">
    negativeExamples?: JsonNullableFilter<"SemanticRule">
    tags?: JsonNullableFilter<"SemanticRule">
    note?: StringNullableFilter<"SemanticRule"> | string | null
    createdAt?: DateTimeFilter<"SemanticRule"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRule"> | Date | string
    ruleSet?: XOR<SemanticRuleSetScalarRelationFilter, SemanticRuleSetWhereInput>
  }, "id">

  export type SemanticRuleOrderByWithAggregationInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    type?: SortOrder
    name?: SortOrder
    enabled?: SortOrder
    priority?: SortOrder
    stopOnMatch?: SortOrder
    flags?: SortOrderInput | SortOrder
    patterns?: SortOrder
    outputs?: SortOrder
    examples?: SortOrderInput | SortOrder
    negativeExamples?: SortOrderInput | SortOrder
    tags?: SortOrderInput | SortOrder
    note?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SemanticRuleCountOrderByAggregateInput
    _avg?: SemanticRuleAvgOrderByAggregateInput
    _max?: SemanticRuleMaxOrderByAggregateInput
    _min?: SemanticRuleMinOrderByAggregateInput
    _sum?: SemanticRuleSumOrderByAggregateInput
  }

  export type SemanticRuleScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleScalarWhereWithAggregatesInput | SemanticRuleScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleScalarWhereWithAggregatesInput | SemanticRuleScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRule"> | string
    ruleSetId?: UuidWithAggregatesFilter<"SemanticRule"> | string
    type?: EnumSemanticRuleTypeWithAggregatesFilter<"SemanticRule"> | $Enums.SemanticRuleType
    name?: StringWithAggregatesFilter<"SemanticRule"> | string
    enabled?: BoolWithAggregatesFilter<"SemanticRule"> | boolean
    priority?: IntWithAggregatesFilter<"SemanticRule"> | number
    stopOnMatch?: BoolWithAggregatesFilter<"SemanticRule"> | boolean
    flags?: StringNullableWithAggregatesFilter<"SemanticRule"> | string | null
    patterns?: JsonWithAggregatesFilter<"SemanticRule">
    outputs?: JsonWithAggregatesFilter<"SemanticRule">
    examples?: JsonNullableWithAggregatesFilter<"SemanticRule">
    negativeExamples?: JsonNullableWithAggregatesFilter<"SemanticRule">
    tags?: JsonNullableWithAggregatesFilter<"SemanticRule">
    note?: StringNullableWithAggregatesFilter<"SemanticRule"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"SemanticRule"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SemanticRule"> | Date | string
  }

  export type SemanticRuleReleaseWhereInput = {
    AND?: SemanticRuleReleaseWhereInput | SemanticRuleReleaseWhereInput[]
    OR?: SemanticRuleReleaseWhereInput[]
    NOT?: SemanticRuleReleaseWhereInput | SemanticRuleReleaseWhereInput[]
    id?: UuidFilter<"SemanticRuleRelease"> | string
    ruleSetId?: UuidFilter<"SemanticRuleRelease"> | string
    releaseMode?: EnumSemanticRuleReleaseModeFilter<"SemanticRuleRelease"> | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFilter<"SemanticRuleRelease"> | string
    toStatus?: StringFilter<"SemanticRuleRelease"> | string
    releasedBy?: StringFilter<"SemanticRuleRelease"> | string
    releaseNote?: StringNullableFilter<"SemanticRuleRelease"> | string | null
    targeting?: JsonNullableFilter<"SemanticRuleRelease">
    triggeredAt?: DateTimeFilter<"SemanticRuleRelease"> | Date | string
    effectiveAt?: DateTimeNullableFilter<"SemanticRuleRelease"> | Date | string | null
    previousActiveRuleSetId?: UuidNullableFilter<"SemanticRuleRelease"> | string | null
    ruleSet?: XOR<SemanticRuleSetScalarRelationFilter, SemanticRuleSetWhereInput>
  }

  export type SemanticRuleReleaseOrderByWithRelationInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    releaseMode?: SortOrder
    fromStatus?: SortOrder
    toStatus?: SortOrder
    releasedBy?: SortOrder
    releaseNote?: SortOrderInput | SortOrder
    targeting?: SortOrderInput | SortOrder
    triggeredAt?: SortOrder
    effectiveAt?: SortOrderInput | SortOrder
    previousActiveRuleSetId?: SortOrderInput | SortOrder
    ruleSet?: SemanticRuleSetOrderByWithRelationInput
  }

  export type SemanticRuleReleaseWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SemanticRuleReleaseWhereInput | SemanticRuleReleaseWhereInput[]
    OR?: SemanticRuleReleaseWhereInput[]
    NOT?: SemanticRuleReleaseWhereInput | SemanticRuleReleaseWhereInput[]
    ruleSetId?: UuidFilter<"SemanticRuleRelease"> | string
    releaseMode?: EnumSemanticRuleReleaseModeFilter<"SemanticRuleRelease"> | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFilter<"SemanticRuleRelease"> | string
    toStatus?: StringFilter<"SemanticRuleRelease"> | string
    releasedBy?: StringFilter<"SemanticRuleRelease"> | string
    releaseNote?: StringNullableFilter<"SemanticRuleRelease"> | string | null
    targeting?: JsonNullableFilter<"SemanticRuleRelease">
    triggeredAt?: DateTimeFilter<"SemanticRuleRelease"> | Date | string
    effectiveAt?: DateTimeNullableFilter<"SemanticRuleRelease"> | Date | string | null
    previousActiveRuleSetId?: UuidNullableFilter<"SemanticRuleRelease"> | string | null
    ruleSet?: XOR<SemanticRuleSetScalarRelationFilter, SemanticRuleSetWhereInput>
  }, "id">

  export type SemanticRuleReleaseOrderByWithAggregationInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    releaseMode?: SortOrder
    fromStatus?: SortOrder
    toStatus?: SortOrder
    releasedBy?: SortOrder
    releaseNote?: SortOrderInput | SortOrder
    targeting?: SortOrderInput | SortOrder
    triggeredAt?: SortOrder
    effectiveAt?: SortOrderInput | SortOrder
    previousActiveRuleSetId?: SortOrderInput | SortOrder
    _count?: SemanticRuleReleaseCountOrderByAggregateInput
    _max?: SemanticRuleReleaseMaxOrderByAggregateInput
    _min?: SemanticRuleReleaseMinOrderByAggregateInput
  }

  export type SemanticRuleReleaseScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleReleaseScalarWhereWithAggregatesInput | SemanticRuleReleaseScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleReleaseScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleReleaseScalarWhereWithAggregatesInput | SemanticRuleReleaseScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRuleRelease"> | string
    ruleSetId?: UuidWithAggregatesFilter<"SemanticRuleRelease"> | string
    releaseMode?: EnumSemanticRuleReleaseModeWithAggregatesFilter<"SemanticRuleRelease"> | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringWithAggregatesFilter<"SemanticRuleRelease"> | string
    toStatus?: StringWithAggregatesFilter<"SemanticRuleRelease"> | string
    releasedBy?: StringWithAggregatesFilter<"SemanticRuleRelease"> | string
    releaseNote?: StringNullableWithAggregatesFilter<"SemanticRuleRelease"> | string | null
    targeting?: JsonNullableWithAggregatesFilter<"SemanticRuleRelease">
    triggeredAt?: DateTimeWithAggregatesFilter<"SemanticRuleRelease"> | Date | string
    effectiveAt?: DateTimeNullableWithAggregatesFilter<"SemanticRuleRelease"> | Date | string | null
    previousActiveRuleSetId?: UuidNullableWithAggregatesFilter<"SemanticRuleRelease"> | string | null
  }

  export type SemanticRuleTargetingWhereInput = {
    AND?: SemanticRuleTargetingWhereInput | SemanticRuleTargetingWhereInput[]
    OR?: SemanticRuleTargetingWhereInput[]
    NOT?: SemanticRuleTargetingWhereInput | SemanticRuleTargetingWhereInput[]
    id?: UuidFilter<"SemanticRuleTargeting"> | string
    ruleSetId?: UuidFilter<"SemanticRuleTargeting"> | string
    environments?: JsonNullableFilter<"SemanticRuleTargeting">
    hosts?: JsonNullableFilter<"SemanticRuleTargeting">
    tenantIds?: JsonNullableFilter<"SemanticRuleTargeting">
    userIds?: JsonNullableFilter<"SemanticRuleTargeting">
    skillIds?: JsonNullableFilter<"SemanticRuleTargeting">
    pageTypes?: JsonNullableFilter<"SemanticRuleTargeting">
    sampleRate?: FloatNullableFilter<"SemanticRuleTargeting"> | number | null
    enabled?: BoolFilter<"SemanticRuleTargeting"> | boolean
    createdAt?: DateTimeFilter<"SemanticRuleTargeting"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleTargeting"> | Date | string
    ruleSet?: XOR<SemanticRuleSetScalarRelationFilter, SemanticRuleSetWhereInput>
  }

  export type SemanticRuleTargetingOrderByWithRelationInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    environments?: SortOrderInput | SortOrder
    hosts?: SortOrderInput | SortOrder
    tenantIds?: SortOrderInput | SortOrder
    userIds?: SortOrderInput | SortOrder
    skillIds?: SortOrderInput | SortOrder
    pageTypes?: SortOrderInput | SortOrder
    sampleRate?: SortOrderInput | SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    ruleSet?: SemanticRuleSetOrderByWithRelationInput
  }

  export type SemanticRuleTargetingWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SemanticRuleTargetingWhereInput | SemanticRuleTargetingWhereInput[]
    OR?: SemanticRuleTargetingWhereInput[]
    NOT?: SemanticRuleTargetingWhereInput | SemanticRuleTargetingWhereInput[]
    ruleSetId?: UuidFilter<"SemanticRuleTargeting"> | string
    environments?: JsonNullableFilter<"SemanticRuleTargeting">
    hosts?: JsonNullableFilter<"SemanticRuleTargeting">
    tenantIds?: JsonNullableFilter<"SemanticRuleTargeting">
    userIds?: JsonNullableFilter<"SemanticRuleTargeting">
    skillIds?: JsonNullableFilter<"SemanticRuleTargeting">
    pageTypes?: JsonNullableFilter<"SemanticRuleTargeting">
    sampleRate?: FloatNullableFilter<"SemanticRuleTargeting"> | number | null
    enabled?: BoolFilter<"SemanticRuleTargeting"> | boolean
    createdAt?: DateTimeFilter<"SemanticRuleTargeting"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleTargeting"> | Date | string
    ruleSet?: XOR<SemanticRuleSetScalarRelationFilter, SemanticRuleSetWhereInput>
  }, "id">

  export type SemanticRuleTargetingOrderByWithAggregationInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    environments?: SortOrderInput | SortOrder
    hosts?: SortOrderInput | SortOrder
    tenantIds?: SortOrderInput | SortOrder
    userIds?: SortOrderInput | SortOrder
    skillIds?: SortOrderInput | SortOrder
    pageTypes?: SortOrderInput | SortOrder
    sampleRate?: SortOrderInput | SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SemanticRuleTargetingCountOrderByAggregateInput
    _avg?: SemanticRuleTargetingAvgOrderByAggregateInput
    _max?: SemanticRuleTargetingMaxOrderByAggregateInput
    _min?: SemanticRuleTargetingMinOrderByAggregateInput
    _sum?: SemanticRuleTargetingSumOrderByAggregateInput
  }

  export type SemanticRuleTargetingScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleTargetingScalarWhereWithAggregatesInput | SemanticRuleTargetingScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleTargetingScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleTargetingScalarWhereWithAggregatesInput | SemanticRuleTargetingScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRuleTargeting"> | string
    ruleSetId?: UuidWithAggregatesFilter<"SemanticRuleTargeting"> | string
    environments?: JsonNullableWithAggregatesFilter<"SemanticRuleTargeting">
    hosts?: JsonNullableWithAggregatesFilter<"SemanticRuleTargeting">
    tenantIds?: JsonNullableWithAggregatesFilter<"SemanticRuleTargeting">
    userIds?: JsonNullableWithAggregatesFilter<"SemanticRuleTargeting">
    skillIds?: JsonNullableWithAggregatesFilter<"SemanticRuleTargeting">
    pageTypes?: JsonNullableWithAggregatesFilter<"SemanticRuleTargeting">
    sampleRate?: FloatNullableWithAggregatesFilter<"SemanticRuleTargeting"> | number | null
    enabled?: BoolWithAggregatesFilter<"SemanticRuleTargeting"> | boolean
    createdAt?: DateTimeWithAggregatesFilter<"SemanticRuleTargeting"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"SemanticRuleTargeting"> | Date | string
  }

  export type SemanticRuleHitLogWhereInput = {
    AND?: SemanticRuleHitLogWhereInput | SemanticRuleHitLogWhereInput[]
    OR?: SemanticRuleHitLogWhereInput[]
    NOT?: SemanticRuleHitLogWhereInput | SemanticRuleHitLogWhereInput[]
    id?: UuidFilter<"SemanticRuleHitLog"> | string
    domainId?: UuidFilter<"SemanticRuleHitLog"> | string
    ruleSetId?: UuidNullableFilter<"SemanticRuleHitLog"> | string | null
    matchedRuleIds?: JsonFilter<"SemanticRuleHitLog">
    inputText?: StringFilter<"SemanticRuleHitLog"> | string
    normalizedInput?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageUrl?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageTitle?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageType?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    observationSummary?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    availableCandidateIds?: JsonNullableFilter<"SemanticRuleHitLog">
    normalizedSemantic?: JsonNullableFilter<"SemanticRuleHitLog">
    parserOutput?: JsonNullableFilter<"SemanticRuleHitLog">
    usedAiFallback?: BoolFilter<"SemanticRuleHitLog"> | boolean
    finalExecutionSuccess?: BoolNullableFilter<"SemanticRuleHitLog"> | boolean | null
    failureReason?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    traceId?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    createdAt?: DateTimeFilter<"SemanticRuleHitLog"> | Date | string
    domain?: XOR<SemanticRuleDomainScalarRelationFilter, SemanticRuleDomainWhereInput>
    ruleSet?: XOR<SemanticRuleSetNullableScalarRelationFilter, SemanticRuleSetWhereInput> | null
  }

  export type SemanticRuleHitLogOrderByWithRelationInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrderInput | SortOrder
    matchedRuleIds?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrderInput | SortOrder
    pageUrl?: SortOrderInput | SortOrder
    pageTitle?: SortOrderInput | SortOrder
    pageType?: SortOrderInput | SortOrder
    observationSummary?: SortOrderInput | SortOrder
    availableCandidateIds?: SortOrderInput | SortOrder
    normalizedSemantic?: SortOrderInput | SortOrder
    parserOutput?: SortOrderInput | SortOrder
    usedAiFallback?: SortOrder
    finalExecutionSuccess?: SortOrderInput | SortOrder
    failureReason?: SortOrderInput | SortOrder
    traceId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    domain?: SemanticRuleDomainOrderByWithRelationInput
    ruleSet?: SemanticRuleSetOrderByWithRelationInput
  }

  export type SemanticRuleHitLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SemanticRuleHitLogWhereInput | SemanticRuleHitLogWhereInput[]
    OR?: SemanticRuleHitLogWhereInput[]
    NOT?: SemanticRuleHitLogWhereInput | SemanticRuleHitLogWhereInput[]
    domainId?: UuidFilter<"SemanticRuleHitLog"> | string
    ruleSetId?: UuidNullableFilter<"SemanticRuleHitLog"> | string | null
    matchedRuleIds?: JsonFilter<"SemanticRuleHitLog">
    inputText?: StringFilter<"SemanticRuleHitLog"> | string
    normalizedInput?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageUrl?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageTitle?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageType?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    observationSummary?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    availableCandidateIds?: JsonNullableFilter<"SemanticRuleHitLog">
    normalizedSemantic?: JsonNullableFilter<"SemanticRuleHitLog">
    parserOutput?: JsonNullableFilter<"SemanticRuleHitLog">
    usedAiFallback?: BoolFilter<"SemanticRuleHitLog"> | boolean
    finalExecutionSuccess?: BoolNullableFilter<"SemanticRuleHitLog"> | boolean | null
    failureReason?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    traceId?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    createdAt?: DateTimeFilter<"SemanticRuleHitLog"> | Date | string
    domain?: XOR<SemanticRuleDomainScalarRelationFilter, SemanticRuleDomainWhereInput>
    ruleSet?: XOR<SemanticRuleSetNullableScalarRelationFilter, SemanticRuleSetWhereInput> | null
  }, "id">

  export type SemanticRuleHitLogOrderByWithAggregationInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrderInput | SortOrder
    matchedRuleIds?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrderInput | SortOrder
    pageUrl?: SortOrderInput | SortOrder
    pageTitle?: SortOrderInput | SortOrder
    pageType?: SortOrderInput | SortOrder
    observationSummary?: SortOrderInput | SortOrder
    availableCandidateIds?: SortOrderInput | SortOrder
    normalizedSemantic?: SortOrderInput | SortOrder
    parserOutput?: SortOrderInput | SortOrder
    usedAiFallback?: SortOrder
    finalExecutionSuccess?: SortOrderInput | SortOrder
    failureReason?: SortOrderInput | SortOrder
    traceId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: SemanticRuleHitLogCountOrderByAggregateInput
    _max?: SemanticRuleHitLogMaxOrderByAggregateInput
    _min?: SemanticRuleHitLogMinOrderByAggregateInput
  }

  export type SemanticRuleHitLogScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleHitLogScalarWhereWithAggregatesInput | SemanticRuleHitLogScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleHitLogScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleHitLogScalarWhereWithAggregatesInput | SemanticRuleHitLogScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRuleHitLog"> | string
    domainId?: UuidWithAggregatesFilter<"SemanticRuleHitLog"> | string
    ruleSetId?: UuidNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    matchedRuleIds?: JsonWithAggregatesFilter<"SemanticRuleHitLog">
    inputText?: StringWithAggregatesFilter<"SemanticRuleHitLog"> | string
    normalizedInput?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    pageUrl?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    pageTitle?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    pageType?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    observationSummary?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    availableCandidateIds?: JsonNullableWithAggregatesFilter<"SemanticRuleHitLog">
    normalizedSemantic?: JsonNullableWithAggregatesFilter<"SemanticRuleHitLog">
    parserOutput?: JsonNullableWithAggregatesFilter<"SemanticRuleHitLog">
    usedAiFallback?: BoolWithAggregatesFilter<"SemanticRuleHitLog"> | boolean
    finalExecutionSuccess?: BoolNullableWithAggregatesFilter<"SemanticRuleHitLog"> | boolean | null
    failureReason?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    traceId?: StringNullableWithAggregatesFilter<"SemanticRuleHitLog"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"SemanticRuleHitLog"> | Date | string
  }

  export type SemanticRuleErrorLogWhereInput = {
    AND?: SemanticRuleErrorLogWhereInput | SemanticRuleErrorLogWhereInput[]
    OR?: SemanticRuleErrorLogWhereInput[]
    NOT?: SemanticRuleErrorLogWhereInput | SemanticRuleErrorLogWhereInput[]
    id?: UuidFilter<"SemanticRuleErrorLog"> | string
    domainId?: UuidFilter<"SemanticRuleErrorLog"> | string
    ruleSetId?: UuidNullableFilter<"SemanticRuleErrorLog"> | string | null
    source?: StringFilter<"SemanticRuleErrorLog"> | string
    errorType?: StringFilter<"SemanticRuleErrorLog"> | string
    errorCode?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    errorMessage?: StringFilter<"SemanticRuleErrorLog"> | string
    inputText?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    normalizedInput?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    traceId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    sessionId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    taskId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    stepId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageUrl?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageTitle?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    host?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageType?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    observationSummary?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    candidateSummary?: JsonNullableFilter<"SemanticRuleErrorLog">
    matchedRuleIds?: JsonNullableFilter<"SemanticRuleErrorLog">
    normalizedSemantic?: JsonNullableFilter<"SemanticRuleErrorLog">
    parserOutput?: JsonNullableFilter<"SemanticRuleErrorLog">
    aiFallbackInput?: JsonNullableFilter<"SemanticRuleErrorLog">
    aiFallbackOutput?: JsonNullableFilter<"SemanticRuleErrorLog">
    screenshotUrl?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    domSnippet?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    locatorInfo?: JsonNullableFilter<"SemanticRuleErrorLog">
    consoleErrors?: JsonNullableFilter<"SemanticRuleErrorLog">
    metadata?: JsonNullableFilter<"SemanticRuleErrorLog">
    createdAt?: DateTimeFilter<"SemanticRuleErrorLog"> | Date | string
    domain?: XOR<SemanticRuleDomainScalarRelationFilter, SemanticRuleDomainWhereInput>
    ruleSet?: XOR<SemanticRuleSetNullableScalarRelationFilter, SemanticRuleSetWhereInput> | null
  }

  export type SemanticRuleErrorLogOrderByWithRelationInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrderInput | SortOrder
    source?: SortOrder
    errorType?: SortOrder
    errorCode?: SortOrderInput | SortOrder
    errorMessage?: SortOrder
    inputText?: SortOrderInput | SortOrder
    normalizedInput?: SortOrderInput | SortOrder
    traceId?: SortOrderInput | SortOrder
    sessionId?: SortOrderInput | SortOrder
    taskId?: SortOrderInput | SortOrder
    stepId?: SortOrderInput | SortOrder
    pageUrl?: SortOrderInput | SortOrder
    pageTitle?: SortOrderInput | SortOrder
    host?: SortOrderInput | SortOrder
    pageType?: SortOrderInput | SortOrder
    observationSummary?: SortOrderInput | SortOrder
    candidateSummary?: SortOrderInput | SortOrder
    matchedRuleIds?: SortOrderInput | SortOrder
    normalizedSemantic?: SortOrderInput | SortOrder
    parserOutput?: SortOrderInput | SortOrder
    aiFallbackInput?: SortOrderInput | SortOrder
    aiFallbackOutput?: SortOrderInput | SortOrder
    screenshotUrl?: SortOrderInput | SortOrder
    domSnippet?: SortOrderInput | SortOrder
    locatorInfo?: SortOrderInput | SortOrder
    consoleErrors?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    domain?: SemanticRuleDomainOrderByWithRelationInput
    ruleSet?: SemanticRuleSetOrderByWithRelationInput
  }

  export type SemanticRuleErrorLogWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: SemanticRuleErrorLogWhereInput | SemanticRuleErrorLogWhereInput[]
    OR?: SemanticRuleErrorLogWhereInput[]
    NOT?: SemanticRuleErrorLogWhereInput | SemanticRuleErrorLogWhereInput[]
    domainId?: UuidFilter<"SemanticRuleErrorLog"> | string
    ruleSetId?: UuidNullableFilter<"SemanticRuleErrorLog"> | string | null
    source?: StringFilter<"SemanticRuleErrorLog"> | string
    errorType?: StringFilter<"SemanticRuleErrorLog"> | string
    errorCode?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    errorMessage?: StringFilter<"SemanticRuleErrorLog"> | string
    inputText?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    normalizedInput?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    traceId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    sessionId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    taskId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    stepId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageUrl?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageTitle?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    host?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageType?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    observationSummary?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    candidateSummary?: JsonNullableFilter<"SemanticRuleErrorLog">
    matchedRuleIds?: JsonNullableFilter<"SemanticRuleErrorLog">
    normalizedSemantic?: JsonNullableFilter<"SemanticRuleErrorLog">
    parserOutput?: JsonNullableFilter<"SemanticRuleErrorLog">
    aiFallbackInput?: JsonNullableFilter<"SemanticRuleErrorLog">
    aiFallbackOutput?: JsonNullableFilter<"SemanticRuleErrorLog">
    screenshotUrl?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    domSnippet?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    locatorInfo?: JsonNullableFilter<"SemanticRuleErrorLog">
    consoleErrors?: JsonNullableFilter<"SemanticRuleErrorLog">
    metadata?: JsonNullableFilter<"SemanticRuleErrorLog">
    createdAt?: DateTimeFilter<"SemanticRuleErrorLog"> | Date | string
    domain?: XOR<SemanticRuleDomainScalarRelationFilter, SemanticRuleDomainWhereInput>
    ruleSet?: XOR<SemanticRuleSetNullableScalarRelationFilter, SemanticRuleSetWhereInput> | null
  }, "id">

  export type SemanticRuleErrorLogOrderByWithAggregationInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrderInput | SortOrder
    source?: SortOrder
    errorType?: SortOrder
    errorCode?: SortOrderInput | SortOrder
    errorMessage?: SortOrder
    inputText?: SortOrderInput | SortOrder
    normalizedInput?: SortOrderInput | SortOrder
    traceId?: SortOrderInput | SortOrder
    sessionId?: SortOrderInput | SortOrder
    taskId?: SortOrderInput | SortOrder
    stepId?: SortOrderInput | SortOrder
    pageUrl?: SortOrderInput | SortOrder
    pageTitle?: SortOrderInput | SortOrder
    host?: SortOrderInput | SortOrder
    pageType?: SortOrderInput | SortOrder
    observationSummary?: SortOrderInput | SortOrder
    candidateSummary?: SortOrderInput | SortOrder
    matchedRuleIds?: SortOrderInput | SortOrder
    normalizedSemantic?: SortOrderInput | SortOrder
    parserOutput?: SortOrderInput | SortOrder
    aiFallbackInput?: SortOrderInput | SortOrder
    aiFallbackOutput?: SortOrderInput | SortOrder
    screenshotUrl?: SortOrderInput | SortOrder
    domSnippet?: SortOrderInput | SortOrder
    locatorInfo?: SortOrderInput | SortOrder
    consoleErrors?: SortOrderInput | SortOrder
    metadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: SemanticRuleErrorLogCountOrderByAggregateInput
    _max?: SemanticRuleErrorLogMaxOrderByAggregateInput
    _min?: SemanticRuleErrorLogMinOrderByAggregateInput
  }

  export type SemanticRuleErrorLogScalarWhereWithAggregatesInput = {
    AND?: SemanticRuleErrorLogScalarWhereWithAggregatesInput | SemanticRuleErrorLogScalarWhereWithAggregatesInput[]
    OR?: SemanticRuleErrorLogScalarWhereWithAggregatesInput[]
    NOT?: SemanticRuleErrorLogScalarWhereWithAggregatesInput | SemanticRuleErrorLogScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"SemanticRuleErrorLog"> | string
    domainId?: UuidWithAggregatesFilter<"SemanticRuleErrorLog"> | string
    ruleSetId?: UuidNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    source?: StringWithAggregatesFilter<"SemanticRuleErrorLog"> | string
    errorType?: StringWithAggregatesFilter<"SemanticRuleErrorLog"> | string
    errorCode?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    errorMessage?: StringWithAggregatesFilter<"SemanticRuleErrorLog"> | string
    inputText?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    normalizedInput?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    traceId?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    sessionId?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    taskId?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    stepId?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    pageUrl?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    pageTitle?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    host?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    pageType?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    observationSummary?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    candidateSummary?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    matchedRuleIds?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    normalizedSemantic?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    parserOutput?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    aiFallbackInput?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    aiFallbackOutput?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    screenshotUrl?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    domSnippet?: StringNullableWithAggregatesFilter<"SemanticRuleErrorLog"> | string | null
    locatorInfo?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    consoleErrors?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    metadata?: JsonNullableWithAggregatesFilter<"SemanticRuleErrorLog">
    createdAt?: DateTimeWithAggregatesFilter<"SemanticRuleErrorLog"> | Date | string
  }

  export type SemanticRuleDomainCreateInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSets?: SemanticRuleSetCreateNestedManyWithoutDomainInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutDomainInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainUncheckedCreateInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSets?: SemanticRuleSetUncheckedCreateNestedManyWithoutDomainInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutDomainInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSets?: SemanticRuleSetUpdateManyWithoutDomainNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutDomainNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleDomainUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSets?: SemanticRuleSetUncheckedUpdateManyWithoutDomainNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutDomainNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleDomainCreateManyInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleDomainUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleDomainUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleSetCreateInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    domain: SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput
    rules?: SemanticRuleCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput
    rules?: SemanticRuleUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetCreateManyInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
  }

  export type SemanticRuleSetUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SemanticRuleSetUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SemanticRuleCreateInput = {
    id?: string
    type: $Enums.SemanticRuleType
    name: string
    enabled?: boolean
    priority: number
    stopOnMatch?: boolean
    flags?: string | null
    patterns: JsonNullValueInput | InputJsonValue
    outputs: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSet: SemanticRuleSetCreateNestedOneWithoutRulesInput
  }

  export type SemanticRuleUncheckedCreateInput = {
    id?: string
    ruleSetId: string
    type: $Enums.SemanticRuleType
    name: string
    enabled?: boolean
    priority: number
    stopOnMatch?: boolean
    flags?: string | null
    patterns: JsonNullValueInput | InputJsonValue
    outputs: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSet?: SemanticRuleSetUpdateOneRequiredWithoutRulesNestedInput
  }

  export type SemanticRuleUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleCreateManyInput = {
    id?: string
    ruleSetId: string
    type: $Enums.SemanticRuleType
    name: string
    enabled?: boolean
    priority: number
    stopOnMatch?: boolean
    flags?: string | null
    patterns: JsonNullValueInput | InputJsonValue
    outputs: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleReleaseCreateInput = {
    id?: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote?: string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: Date | string
    effectiveAt?: Date | string | null
    previousActiveRuleSetId?: string | null
    ruleSet: SemanticRuleSetCreateNestedOneWithoutReleasesInput
  }

  export type SemanticRuleReleaseUncheckedCreateInput = {
    id?: string
    ruleSetId: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote?: string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: Date | string
    effectiveAt?: Date | string | null
    previousActiveRuleSetId?: string | null
  }

  export type SemanticRuleReleaseUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    ruleSet?: SemanticRuleSetUpdateOneRequiredWithoutReleasesNestedInput
  }

  export type SemanticRuleReleaseUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SemanticRuleReleaseCreateManyInput = {
    id?: string
    ruleSetId: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote?: string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: Date | string
    effectiveAt?: Date | string | null
    previousActiveRuleSetId?: string | null
  }

  export type SemanticRuleReleaseUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SemanticRuleReleaseUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SemanticRuleTargetingCreateInput = {
    id?: string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: number | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSet: SemanticRuleSetCreateNestedOneWithoutTargetingsInput
  }

  export type SemanticRuleTargetingUncheckedCreateInput = {
    id?: string
    ruleSetId: string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: number | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleTargetingUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSet?: SemanticRuleSetUpdateOneRequiredWithoutTargetingsNestedInput
  }

  export type SemanticRuleTargetingUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleTargetingCreateManyInput = {
    id?: string
    ruleSetId: string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: number | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleTargetingUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleTargetingUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleHitLogCreateInput = {
    id?: string
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
    domain: SemanticRuleDomainCreateNestedOneWithoutHitLogsInput
    ruleSet?: SemanticRuleSetCreateNestedOneWithoutHitLogsInput
  }

  export type SemanticRuleHitLogUncheckedCreateInput = {
    id?: string
    domainId: string
    ruleSetId?: string | null
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
  }

  export type SemanticRuleHitLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutHitLogsNestedInput
    ruleSet?: SemanticRuleSetUpdateOneWithoutHitLogsNestedInput
  }

  export type SemanticRuleHitLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleHitLogCreateManyInput = {
    id?: string
    domainId: string
    ruleSetId?: string | null
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
  }

  export type SemanticRuleHitLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleHitLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogCreateInput = {
    id?: string
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    domain: SemanticRuleDomainCreateNestedOneWithoutErrorLogsInput
    ruleSet?: SemanticRuleSetCreateNestedOneWithoutErrorLogsInput
  }

  export type SemanticRuleErrorLogUncheckedCreateInput = {
    id?: string
    domainId: string
    ruleSetId?: string | null
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type SemanticRuleErrorLogUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutErrorLogsNestedInput
    ruleSet?: SemanticRuleSetUpdateOneWithoutErrorLogsNestedInput
  }

  export type SemanticRuleErrorLogUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogCreateManyInput = {
    id?: string
    domainId: string
    ruleSetId?: string | null
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type SemanticRuleErrorLogUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
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

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
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

  export type SemanticRuleSetListRelationFilter = {
    every?: SemanticRuleSetWhereInput
    some?: SemanticRuleSetWhereInput
    none?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleHitLogListRelationFilter = {
    every?: SemanticRuleHitLogWhereInput
    some?: SemanticRuleHitLogWhereInput
    none?: SemanticRuleHitLogWhereInput
  }

  export type SemanticRuleErrorLogListRelationFilter = {
    every?: SemanticRuleErrorLogWhereInput
    some?: SemanticRuleErrorLogWhereInput
    none?: SemanticRuleErrorLogWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type SemanticRuleSetOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SemanticRuleHitLogOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SemanticRuleErrorLogOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SemanticRuleDomainCountOrderByAggregateInput = {
    id?: SortOrder
    code?: SortOrder
    name?: SortOrder
    description?: SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleDomainMaxOrderByAggregateInput = {
    id?: SortOrder
    code?: SortOrder
    name?: SortOrder
    description?: SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleDomainMinOrderByAggregateInput = {
    id?: SortOrder
    code?: SortOrder
    name?: SortOrder
    description?: SortOrder
    enabled?: SortOrder
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

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
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

  export type EnumSemanticRuleSetStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleSetStatus | EnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleSetStatusFilter<$PrismaModel> | $Enums.SemanticRuleSetStatus
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

  export type SemanticRuleDomainScalarRelationFilter = {
    is?: SemanticRuleDomainWhereInput
    isNot?: SemanticRuleDomainWhereInput
  }

  export type SemanticRuleListRelationFilter = {
    every?: SemanticRuleWhereInput
    some?: SemanticRuleWhereInput
    none?: SemanticRuleWhereInput
  }

  export type SemanticRuleReleaseListRelationFilter = {
    every?: SemanticRuleReleaseWhereInput
    some?: SemanticRuleReleaseWhereInput
    none?: SemanticRuleReleaseWhereInput
  }

  export type SemanticRuleTargetingListRelationFilter = {
    every?: SemanticRuleTargetingWhereInput
    some?: SemanticRuleTargetingWhereInput
    none?: SemanticRuleTargetingWhereInput
  }

  export type SemanticRuleOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SemanticRuleReleaseOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SemanticRuleTargetingOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type SemanticRuleSetDomainIdKeyVersionCompoundUniqueInput = {
    domainId: string
    key: string
    version: string
  }

  export type SemanticRuleSetCountOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    key?: SortOrder
    name?: SortOrder
    version?: SortOrder
    status?: SortOrder
    description?: SortOrder
    basedOnRuleSetId?: SortOrder
    changeSummary?: SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    activatedAt?: SortOrder
    archivedAt?: SortOrder
  }

  export type SemanticRuleSetMaxOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    key?: SortOrder
    name?: SortOrder
    version?: SortOrder
    status?: SortOrder
    description?: SortOrder
    basedOnRuleSetId?: SortOrder
    changeSummary?: SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    activatedAt?: SortOrder
    archivedAt?: SortOrder
  }

  export type SemanticRuleSetMinOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    key?: SortOrder
    name?: SortOrder
    version?: SortOrder
    status?: SortOrder
    description?: SortOrder
    basedOnRuleSetId?: SortOrder
    changeSummary?: SortOrder
    createdBy?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    activatedAt?: SortOrder
    archivedAt?: SortOrder
  }

  export type EnumSemanticRuleSetStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleSetStatus | EnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleSetStatusWithAggregatesFilter<$PrismaModel> | $Enums.SemanticRuleSetStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSemanticRuleSetStatusFilter<$PrismaModel>
    _max?: NestedEnumSemanticRuleSetStatusFilter<$PrismaModel>
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

  export type EnumSemanticRuleTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleType | EnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleTypeFilter<$PrismaModel> | $Enums.SemanticRuleType
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
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
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

  export type SemanticRuleSetScalarRelationFilter = {
    is?: SemanticRuleSetWhereInput
    isNot?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleCountOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    type?: SortOrder
    name?: SortOrder
    enabled?: SortOrder
    priority?: SortOrder
    stopOnMatch?: SortOrder
    flags?: SortOrder
    patterns?: SortOrder
    outputs?: SortOrder
    examples?: SortOrder
    negativeExamples?: SortOrder
    tags?: SortOrder
    note?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleAvgOrderByAggregateInput = {
    priority?: SortOrder
  }

  export type SemanticRuleMaxOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    type?: SortOrder
    name?: SortOrder
    enabled?: SortOrder
    priority?: SortOrder
    stopOnMatch?: SortOrder
    flags?: SortOrder
    note?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleMinOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    type?: SortOrder
    name?: SortOrder
    enabled?: SortOrder
    priority?: SortOrder
    stopOnMatch?: SortOrder
    flags?: SortOrder
    note?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleSumOrderByAggregateInput = {
    priority?: SortOrder
  }

  export type EnumSemanticRuleTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleType | EnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleTypeWithAggregatesFilter<$PrismaModel> | $Enums.SemanticRuleType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSemanticRuleTypeFilter<$PrismaModel>
    _max?: NestedEnumSemanticRuleTypeFilter<$PrismaModel>
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
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
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
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type EnumSemanticRuleReleaseModeFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleReleaseMode | EnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel> | $Enums.SemanticRuleReleaseMode
  }

  export type SemanticRuleReleaseCountOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    releaseMode?: SortOrder
    fromStatus?: SortOrder
    toStatus?: SortOrder
    releasedBy?: SortOrder
    releaseNote?: SortOrder
    targeting?: SortOrder
    triggeredAt?: SortOrder
    effectiveAt?: SortOrder
    previousActiveRuleSetId?: SortOrder
  }

  export type SemanticRuleReleaseMaxOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    releaseMode?: SortOrder
    fromStatus?: SortOrder
    toStatus?: SortOrder
    releasedBy?: SortOrder
    releaseNote?: SortOrder
    triggeredAt?: SortOrder
    effectiveAt?: SortOrder
    previousActiveRuleSetId?: SortOrder
  }

  export type SemanticRuleReleaseMinOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    releaseMode?: SortOrder
    fromStatus?: SortOrder
    toStatus?: SortOrder
    releasedBy?: SortOrder
    releaseNote?: SortOrder
    triggeredAt?: SortOrder
    effectiveAt?: SortOrder
    previousActiveRuleSetId?: SortOrder
  }

  export type EnumSemanticRuleReleaseModeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleReleaseMode | EnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleReleaseModeWithAggregatesFilter<$PrismaModel> | $Enums.SemanticRuleReleaseMode
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel>
    _max?: NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel>
  }

  export type FloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }

  export type SemanticRuleTargetingCountOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    environments?: SortOrder
    hosts?: SortOrder
    tenantIds?: SortOrder
    userIds?: SortOrder
    skillIds?: SortOrder
    pageTypes?: SortOrder
    sampleRate?: SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleTargetingAvgOrderByAggregateInput = {
    sampleRate?: SortOrder
  }

  export type SemanticRuleTargetingMaxOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    sampleRate?: SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleTargetingMinOrderByAggregateInput = {
    id?: SortOrder
    ruleSetId?: SortOrder
    sampleRate?: SortOrder
    enabled?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SemanticRuleTargetingSumOrderByAggregateInput = {
    sampleRate?: SortOrder
  }

  export type FloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type BoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null
  }

  export type SemanticRuleSetNullableScalarRelationFilter = {
    is?: SemanticRuleSetWhereInput | null
    isNot?: SemanticRuleSetWhereInput | null
  }

  export type SemanticRuleHitLogCountOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrder
    matchedRuleIds?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrder
    pageUrl?: SortOrder
    pageTitle?: SortOrder
    pageType?: SortOrder
    observationSummary?: SortOrder
    availableCandidateIds?: SortOrder
    normalizedSemantic?: SortOrder
    parserOutput?: SortOrder
    usedAiFallback?: SortOrder
    finalExecutionSuccess?: SortOrder
    failureReason?: SortOrder
    traceId?: SortOrder
    createdAt?: SortOrder
  }

  export type SemanticRuleHitLogMaxOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrder
    pageUrl?: SortOrder
    pageTitle?: SortOrder
    pageType?: SortOrder
    observationSummary?: SortOrder
    usedAiFallback?: SortOrder
    finalExecutionSuccess?: SortOrder
    failureReason?: SortOrder
    traceId?: SortOrder
    createdAt?: SortOrder
  }

  export type SemanticRuleHitLogMinOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrder
    pageUrl?: SortOrder
    pageTitle?: SortOrder
    pageType?: SortOrder
    observationSummary?: SortOrder
    usedAiFallback?: SortOrder
    finalExecutionSuccess?: SortOrder
    failureReason?: SortOrder
    traceId?: SortOrder
    createdAt?: SortOrder
  }

  export type BoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBoolNullableFilter<$PrismaModel>
    _max?: NestedBoolNullableFilter<$PrismaModel>
  }

  export type SemanticRuleErrorLogCountOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrder
    source?: SortOrder
    errorType?: SortOrder
    errorCode?: SortOrder
    errorMessage?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrder
    traceId?: SortOrder
    sessionId?: SortOrder
    taskId?: SortOrder
    stepId?: SortOrder
    pageUrl?: SortOrder
    pageTitle?: SortOrder
    host?: SortOrder
    pageType?: SortOrder
    observationSummary?: SortOrder
    candidateSummary?: SortOrder
    matchedRuleIds?: SortOrder
    normalizedSemantic?: SortOrder
    parserOutput?: SortOrder
    aiFallbackInput?: SortOrder
    aiFallbackOutput?: SortOrder
    screenshotUrl?: SortOrder
    domSnippet?: SortOrder
    locatorInfo?: SortOrder
    consoleErrors?: SortOrder
    metadata?: SortOrder
    createdAt?: SortOrder
  }

  export type SemanticRuleErrorLogMaxOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrder
    source?: SortOrder
    errorType?: SortOrder
    errorCode?: SortOrder
    errorMessage?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrder
    traceId?: SortOrder
    sessionId?: SortOrder
    taskId?: SortOrder
    stepId?: SortOrder
    pageUrl?: SortOrder
    pageTitle?: SortOrder
    host?: SortOrder
    pageType?: SortOrder
    observationSummary?: SortOrder
    screenshotUrl?: SortOrder
    domSnippet?: SortOrder
    createdAt?: SortOrder
  }

  export type SemanticRuleErrorLogMinOrderByAggregateInput = {
    id?: SortOrder
    domainId?: SortOrder
    ruleSetId?: SortOrder
    source?: SortOrder
    errorType?: SortOrder
    errorCode?: SortOrder
    errorMessage?: SortOrder
    inputText?: SortOrder
    normalizedInput?: SortOrder
    traceId?: SortOrder
    sessionId?: SortOrder
    taskId?: SortOrder
    stepId?: SortOrder
    pageUrl?: SortOrder
    pageTitle?: SortOrder
    host?: SortOrder
    pageType?: SortOrder
    observationSummary?: SortOrder
    screenshotUrl?: SortOrder
    domSnippet?: SortOrder
    createdAt?: SortOrder
  }

  export type SemanticRuleSetCreateNestedManyWithoutDomainInput = {
    create?: XOR<SemanticRuleSetCreateWithoutDomainInput, SemanticRuleSetUncheckedCreateWithoutDomainInput> | SemanticRuleSetCreateWithoutDomainInput[] | SemanticRuleSetUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutDomainInput | SemanticRuleSetCreateOrConnectWithoutDomainInput[]
    createMany?: SemanticRuleSetCreateManyDomainInputEnvelope
    connect?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
  }

  export type SemanticRuleHitLogCreateNestedManyWithoutDomainInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutDomainInput, SemanticRuleHitLogUncheckedCreateWithoutDomainInput> | SemanticRuleHitLogCreateWithoutDomainInput[] | SemanticRuleHitLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutDomainInput | SemanticRuleHitLogCreateOrConnectWithoutDomainInput[]
    createMany?: SemanticRuleHitLogCreateManyDomainInputEnvelope
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
  }

  export type SemanticRuleErrorLogCreateNestedManyWithoutDomainInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutDomainInput, SemanticRuleErrorLogUncheckedCreateWithoutDomainInput> | SemanticRuleErrorLogCreateWithoutDomainInput[] | SemanticRuleErrorLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutDomainInput | SemanticRuleErrorLogCreateOrConnectWithoutDomainInput[]
    createMany?: SemanticRuleErrorLogCreateManyDomainInputEnvelope
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
  }

  export type SemanticRuleSetUncheckedCreateNestedManyWithoutDomainInput = {
    create?: XOR<SemanticRuleSetCreateWithoutDomainInput, SemanticRuleSetUncheckedCreateWithoutDomainInput> | SemanticRuleSetCreateWithoutDomainInput[] | SemanticRuleSetUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutDomainInput | SemanticRuleSetCreateOrConnectWithoutDomainInput[]
    createMany?: SemanticRuleSetCreateManyDomainInputEnvelope
    connect?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
  }

  export type SemanticRuleHitLogUncheckedCreateNestedManyWithoutDomainInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutDomainInput, SemanticRuleHitLogUncheckedCreateWithoutDomainInput> | SemanticRuleHitLogCreateWithoutDomainInput[] | SemanticRuleHitLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutDomainInput | SemanticRuleHitLogCreateOrConnectWithoutDomainInput[]
    createMany?: SemanticRuleHitLogCreateManyDomainInputEnvelope
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
  }

  export type SemanticRuleErrorLogUncheckedCreateNestedManyWithoutDomainInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutDomainInput, SemanticRuleErrorLogUncheckedCreateWithoutDomainInput> | SemanticRuleErrorLogCreateWithoutDomainInput[] | SemanticRuleErrorLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutDomainInput | SemanticRuleErrorLogCreateOrConnectWithoutDomainInput[]
    createMany?: SemanticRuleErrorLogCreateManyDomainInputEnvelope
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
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

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type SemanticRuleSetUpdateManyWithoutDomainNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutDomainInput, SemanticRuleSetUncheckedCreateWithoutDomainInput> | SemanticRuleSetCreateWithoutDomainInput[] | SemanticRuleSetUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutDomainInput | SemanticRuleSetCreateOrConnectWithoutDomainInput[]
    upsert?: SemanticRuleSetUpsertWithWhereUniqueWithoutDomainInput | SemanticRuleSetUpsertWithWhereUniqueWithoutDomainInput[]
    createMany?: SemanticRuleSetCreateManyDomainInputEnvelope
    set?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    disconnect?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    delete?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    connect?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    update?: SemanticRuleSetUpdateWithWhereUniqueWithoutDomainInput | SemanticRuleSetUpdateWithWhereUniqueWithoutDomainInput[]
    updateMany?: SemanticRuleSetUpdateManyWithWhereWithoutDomainInput | SemanticRuleSetUpdateManyWithWhereWithoutDomainInput[]
    deleteMany?: SemanticRuleSetScalarWhereInput | SemanticRuleSetScalarWhereInput[]
  }

  export type SemanticRuleHitLogUpdateManyWithoutDomainNestedInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutDomainInput, SemanticRuleHitLogUncheckedCreateWithoutDomainInput> | SemanticRuleHitLogCreateWithoutDomainInput[] | SemanticRuleHitLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutDomainInput | SemanticRuleHitLogCreateOrConnectWithoutDomainInput[]
    upsert?: SemanticRuleHitLogUpsertWithWhereUniqueWithoutDomainInput | SemanticRuleHitLogUpsertWithWhereUniqueWithoutDomainInput[]
    createMany?: SemanticRuleHitLogCreateManyDomainInputEnvelope
    set?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    disconnect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    delete?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    update?: SemanticRuleHitLogUpdateWithWhereUniqueWithoutDomainInput | SemanticRuleHitLogUpdateWithWhereUniqueWithoutDomainInput[]
    updateMany?: SemanticRuleHitLogUpdateManyWithWhereWithoutDomainInput | SemanticRuleHitLogUpdateManyWithWhereWithoutDomainInput[]
    deleteMany?: SemanticRuleHitLogScalarWhereInput | SemanticRuleHitLogScalarWhereInput[]
  }

  export type SemanticRuleErrorLogUpdateManyWithoutDomainNestedInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutDomainInput, SemanticRuleErrorLogUncheckedCreateWithoutDomainInput> | SemanticRuleErrorLogCreateWithoutDomainInput[] | SemanticRuleErrorLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutDomainInput | SemanticRuleErrorLogCreateOrConnectWithoutDomainInput[]
    upsert?: SemanticRuleErrorLogUpsertWithWhereUniqueWithoutDomainInput | SemanticRuleErrorLogUpsertWithWhereUniqueWithoutDomainInput[]
    createMany?: SemanticRuleErrorLogCreateManyDomainInputEnvelope
    set?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    disconnect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    delete?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    update?: SemanticRuleErrorLogUpdateWithWhereUniqueWithoutDomainInput | SemanticRuleErrorLogUpdateWithWhereUniqueWithoutDomainInput[]
    updateMany?: SemanticRuleErrorLogUpdateManyWithWhereWithoutDomainInput | SemanticRuleErrorLogUpdateManyWithWhereWithoutDomainInput[]
    deleteMany?: SemanticRuleErrorLogScalarWhereInput | SemanticRuleErrorLogScalarWhereInput[]
  }

  export type SemanticRuleSetUncheckedUpdateManyWithoutDomainNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutDomainInput, SemanticRuleSetUncheckedCreateWithoutDomainInput> | SemanticRuleSetCreateWithoutDomainInput[] | SemanticRuleSetUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutDomainInput | SemanticRuleSetCreateOrConnectWithoutDomainInput[]
    upsert?: SemanticRuleSetUpsertWithWhereUniqueWithoutDomainInput | SemanticRuleSetUpsertWithWhereUniqueWithoutDomainInput[]
    createMany?: SemanticRuleSetCreateManyDomainInputEnvelope
    set?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    disconnect?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    delete?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    connect?: SemanticRuleSetWhereUniqueInput | SemanticRuleSetWhereUniqueInput[]
    update?: SemanticRuleSetUpdateWithWhereUniqueWithoutDomainInput | SemanticRuleSetUpdateWithWhereUniqueWithoutDomainInput[]
    updateMany?: SemanticRuleSetUpdateManyWithWhereWithoutDomainInput | SemanticRuleSetUpdateManyWithWhereWithoutDomainInput[]
    deleteMany?: SemanticRuleSetScalarWhereInput | SemanticRuleSetScalarWhereInput[]
  }

  export type SemanticRuleHitLogUncheckedUpdateManyWithoutDomainNestedInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutDomainInput, SemanticRuleHitLogUncheckedCreateWithoutDomainInput> | SemanticRuleHitLogCreateWithoutDomainInput[] | SemanticRuleHitLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutDomainInput | SemanticRuleHitLogCreateOrConnectWithoutDomainInput[]
    upsert?: SemanticRuleHitLogUpsertWithWhereUniqueWithoutDomainInput | SemanticRuleHitLogUpsertWithWhereUniqueWithoutDomainInput[]
    createMany?: SemanticRuleHitLogCreateManyDomainInputEnvelope
    set?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    disconnect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    delete?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    update?: SemanticRuleHitLogUpdateWithWhereUniqueWithoutDomainInput | SemanticRuleHitLogUpdateWithWhereUniqueWithoutDomainInput[]
    updateMany?: SemanticRuleHitLogUpdateManyWithWhereWithoutDomainInput | SemanticRuleHitLogUpdateManyWithWhereWithoutDomainInput[]
    deleteMany?: SemanticRuleHitLogScalarWhereInput | SemanticRuleHitLogScalarWhereInput[]
  }

  export type SemanticRuleErrorLogUncheckedUpdateManyWithoutDomainNestedInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutDomainInput, SemanticRuleErrorLogUncheckedCreateWithoutDomainInput> | SemanticRuleErrorLogCreateWithoutDomainInput[] | SemanticRuleErrorLogUncheckedCreateWithoutDomainInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutDomainInput | SemanticRuleErrorLogCreateOrConnectWithoutDomainInput[]
    upsert?: SemanticRuleErrorLogUpsertWithWhereUniqueWithoutDomainInput | SemanticRuleErrorLogUpsertWithWhereUniqueWithoutDomainInput[]
    createMany?: SemanticRuleErrorLogCreateManyDomainInputEnvelope
    set?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    disconnect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    delete?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    update?: SemanticRuleErrorLogUpdateWithWhereUniqueWithoutDomainInput | SemanticRuleErrorLogUpdateWithWhereUniqueWithoutDomainInput[]
    updateMany?: SemanticRuleErrorLogUpdateManyWithWhereWithoutDomainInput | SemanticRuleErrorLogUpdateManyWithWhereWithoutDomainInput[]
    deleteMany?: SemanticRuleErrorLogScalarWhereInput | SemanticRuleErrorLogScalarWhereInput[]
  }

  export type SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput = {
    create?: XOR<SemanticRuleDomainCreateWithoutRuleSetsInput, SemanticRuleDomainUncheckedCreateWithoutRuleSetsInput>
    connectOrCreate?: SemanticRuleDomainCreateOrConnectWithoutRuleSetsInput
    connect?: SemanticRuleDomainWhereUniqueInput
  }

  export type SemanticRuleCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleCreateWithoutRuleSetInput, SemanticRuleUncheckedCreateWithoutRuleSetInput> | SemanticRuleCreateWithoutRuleSetInput[] | SemanticRuleUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleCreateOrConnectWithoutRuleSetInput | SemanticRuleCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
  }

  export type SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleReleaseCreateWithoutRuleSetInput, SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput> | SemanticRuleReleaseCreateWithoutRuleSetInput[] | SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput | SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleReleaseCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
  }

  export type SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleTargetingCreateWithoutRuleSetInput, SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput> | SemanticRuleTargetingCreateWithoutRuleSetInput[] | SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput | SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleTargetingCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
  }

  export type SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutRuleSetInput, SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleHitLogCreateWithoutRuleSetInput[] | SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput | SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleHitLogCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
  }

  export type SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleErrorLogCreateWithoutRuleSetInput[] | SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput | SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleErrorLogCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
  }

  export type SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleCreateWithoutRuleSetInput, SemanticRuleUncheckedCreateWithoutRuleSetInput> | SemanticRuleCreateWithoutRuleSetInput[] | SemanticRuleUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleCreateOrConnectWithoutRuleSetInput | SemanticRuleCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
  }

  export type SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleReleaseCreateWithoutRuleSetInput, SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput> | SemanticRuleReleaseCreateWithoutRuleSetInput[] | SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput | SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleReleaseCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
  }

  export type SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleTargetingCreateWithoutRuleSetInput, SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput> | SemanticRuleTargetingCreateWithoutRuleSetInput[] | SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput | SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleTargetingCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
  }

  export type SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutRuleSetInput, SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleHitLogCreateWithoutRuleSetInput[] | SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput | SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleHitLogCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
  }

  export type SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleErrorLogCreateWithoutRuleSetInput[] | SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput | SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput[]
    createMany?: SemanticRuleErrorLogCreateManyRuleSetInputEnvelope
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
  }

  export type EnumSemanticRuleSetStatusFieldUpdateOperationsInput = {
    set?: $Enums.SemanticRuleSetStatus
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput = {
    create?: XOR<SemanticRuleDomainCreateWithoutRuleSetsInput, SemanticRuleDomainUncheckedCreateWithoutRuleSetsInput>
    connectOrCreate?: SemanticRuleDomainCreateOrConnectWithoutRuleSetsInput
    upsert?: SemanticRuleDomainUpsertWithoutRuleSetsInput
    connect?: SemanticRuleDomainWhereUniqueInput
    update?: XOR<XOR<SemanticRuleDomainUpdateToOneWithWhereWithoutRuleSetsInput, SemanticRuleDomainUpdateWithoutRuleSetsInput>, SemanticRuleDomainUncheckedUpdateWithoutRuleSetsInput>
  }

  export type SemanticRuleUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleCreateWithoutRuleSetInput, SemanticRuleUncheckedCreateWithoutRuleSetInput> | SemanticRuleCreateWithoutRuleSetInput[] | SemanticRuleUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleCreateOrConnectWithoutRuleSetInput | SemanticRuleCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleCreateManyRuleSetInputEnvelope
    set?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    disconnect?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    delete?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    connect?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    update?: SemanticRuleUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleScalarWhereInput | SemanticRuleScalarWhereInput[]
  }

  export type SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleReleaseCreateWithoutRuleSetInput, SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput> | SemanticRuleReleaseCreateWithoutRuleSetInput[] | SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput | SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleReleaseUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleReleaseUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleReleaseCreateManyRuleSetInputEnvelope
    set?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    disconnect?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    delete?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    connect?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    update?: SemanticRuleReleaseUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleReleaseUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleReleaseUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleReleaseUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleReleaseScalarWhereInput | SemanticRuleReleaseScalarWhereInput[]
  }

  export type SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleTargetingCreateWithoutRuleSetInput, SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput> | SemanticRuleTargetingCreateWithoutRuleSetInput[] | SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput | SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleTargetingUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleTargetingUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleTargetingCreateManyRuleSetInputEnvelope
    set?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    disconnect?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    delete?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    connect?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    update?: SemanticRuleTargetingUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleTargetingUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleTargetingUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleTargetingUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleTargetingScalarWhereInput | SemanticRuleTargetingScalarWhereInput[]
  }

  export type SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutRuleSetInput, SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleHitLogCreateWithoutRuleSetInput[] | SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput | SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleHitLogUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleHitLogUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleHitLogCreateManyRuleSetInputEnvelope
    set?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    disconnect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    delete?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    update?: SemanticRuleHitLogUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleHitLogUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleHitLogUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleHitLogUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleHitLogScalarWhereInput | SemanticRuleHitLogScalarWhereInput[]
  }

  export type SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleErrorLogCreateWithoutRuleSetInput[] | SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput | SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleErrorLogUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleErrorLogUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleErrorLogCreateManyRuleSetInputEnvelope
    set?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    disconnect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    delete?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    update?: SemanticRuleErrorLogUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleErrorLogUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleErrorLogUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleErrorLogUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleErrorLogScalarWhereInput | SemanticRuleErrorLogScalarWhereInput[]
  }

  export type SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleCreateWithoutRuleSetInput, SemanticRuleUncheckedCreateWithoutRuleSetInput> | SemanticRuleCreateWithoutRuleSetInput[] | SemanticRuleUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleCreateOrConnectWithoutRuleSetInput | SemanticRuleCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleCreateManyRuleSetInputEnvelope
    set?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    disconnect?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    delete?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    connect?: SemanticRuleWhereUniqueInput | SemanticRuleWhereUniqueInput[]
    update?: SemanticRuleUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleScalarWhereInput | SemanticRuleScalarWhereInput[]
  }

  export type SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleReleaseCreateWithoutRuleSetInput, SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput> | SemanticRuleReleaseCreateWithoutRuleSetInput[] | SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput | SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleReleaseUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleReleaseUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleReleaseCreateManyRuleSetInputEnvelope
    set?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    disconnect?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    delete?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    connect?: SemanticRuleReleaseWhereUniqueInput | SemanticRuleReleaseWhereUniqueInput[]
    update?: SemanticRuleReleaseUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleReleaseUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleReleaseUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleReleaseUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleReleaseScalarWhereInput | SemanticRuleReleaseScalarWhereInput[]
  }

  export type SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleTargetingCreateWithoutRuleSetInput, SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput> | SemanticRuleTargetingCreateWithoutRuleSetInput[] | SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput | SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleTargetingUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleTargetingUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleTargetingCreateManyRuleSetInputEnvelope
    set?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    disconnect?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    delete?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    connect?: SemanticRuleTargetingWhereUniqueInput | SemanticRuleTargetingWhereUniqueInput[]
    update?: SemanticRuleTargetingUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleTargetingUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleTargetingUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleTargetingUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleTargetingScalarWhereInput | SemanticRuleTargetingScalarWhereInput[]
  }

  export type SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleHitLogCreateWithoutRuleSetInput, SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleHitLogCreateWithoutRuleSetInput[] | SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput | SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleHitLogUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleHitLogUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleHitLogCreateManyRuleSetInputEnvelope
    set?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    disconnect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    delete?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    connect?: SemanticRuleHitLogWhereUniqueInput | SemanticRuleHitLogWhereUniqueInput[]
    update?: SemanticRuleHitLogUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleHitLogUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleHitLogUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleHitLogUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleHitLogScalarWhereInput | SemanticRuleHitLogScalarWhereInput[]
  }

  export type SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput = {
    create?: XOR<SemanticRuleErrorLogCreateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput> | SemanticRuleErrorLogCreateWithoutRuleSetInput[] | SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput[]
    connectOrCreate?: SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput | SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput[]
    upsert?: SemanticRuleErrorLogUpsertWithWhereUniqueWithoutRuleSetInput | SemanticRuleErrorLogUpsertWithWhereUniqueWithoutRuleSetInput[]
    createMany?: SemanticRuleErrorLogCreateManyRuleSetInputEnvelope
    set?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    disconnect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    delete?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    connect?: SemanticRuleErrorLogWhereUniqueInput | SemanticRuleErrorLogWhereUniqueInput[]
    update?: SemanticRuleErrorLogUpdateWithWhereUniqueWithoutRuleSetInput | SemanticRuleErrorLogUpdateWithWhereUniqueWithoutRuleSetInput[]
    updateMany?: SemanticRuleErrorLogUpdateManyWithWhereWithoutRuleSetInput | SemanticRuleErrorLogUpdateManyWithWhereWithoutRuleSetInput[]
    deleteMany?: SemanticRuleErrorLogScalarWhereInput | SemanticRuleErrorLogScalarWhereInput[]
  }

  export type SemanticRuleSetCreateNestedOneWithoutRulesInput = {
    create?: XOR<SemanticRuleSetCreateWithoutRulesInput, SemanticRuleSetUncheckedCreateWithoutRulesInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutRulesInput
    connect?: SemanticRuleSetWhereUniqueInput
  }

  export type EnumSemanticRuleTypeFieldUpdateOperationsInput = {
    set?: $Enums.SemanticRuleType
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type SemanticRuleSetUpdateOneRequiredWithoutRulesNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutRulesInput, SemanticRuleSetUncheckedCreateWithoutRulesInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutRulesInput
    upsert?: SemanticRuleSetUpsertWithoutRulesInput
    connect?: SemanticRuleSetWhereUniqueInput
    update?: XOR<XOR<SemanticRuleSetUpdateToOneWithWhereWithoutRulesInput, SemanticRuleSetUpdateWithoutRulesInput>, SemanticRuleSetUncheckedUpdateWithoutRulesInput>
  }

  export type SemanticRuleSetCreateNestedOneWithoutReleasesInput = {
    create?: XOR<SemanticRuleSetCreateWithoutReleasesInput, SemanticRuleSetUncheckedCreateWithoutReleasesInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutReleasesInput
    connect?: SemanticRuleSetWhereUniqueInput
  }

  export type EnumSemanticRuleReleaseModeFieldUpdateOperationsInput = {
    set?: $Enums.SemanticRuleReleaseMode
  }

  export type SemanticRuleSetUpdateOneRequiredWithoutReleasesNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutReleasesInput, SemanticRuleSetUncheckedCreateWithoutReleasesInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutReleasesInput
    upsert?: SemanticRuleSetUpsertWithoutReleasesInput
    connect?: SemanticRuleSetWhereUniqueInput
    update?: XOR<XOR<SemanticRuleSetUpdateToOneWithWhereWithoutReleasesInput, SemanticRuleSetUpdateWithoutReleasesInput>, SemanticRuleSetUncheckedUpdateWithoutReleasesInput>
  }

  export type SemanticRuleSetCreateNestedOneWithoutTargetingsInput = {
    create?: XOR<SemanticRuleSetCreateWithoutTargetingsInput, SemanticRuleSetUncheckedCreateWithoutTargetingsInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutTargetingsInput
    connect?: SemanticRuleSetWhereUniqueInput
  }

  export type NullableFloatFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type SemanticRuleSetUpdateOneRequiredWithoutTargetingsNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutTargetingsInput, SemanticRuleSetUncheckedCreateWithoutTargetingsInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutTargetingsInput
    upsert?: SemanticRuleSetUpsertWithoutTargetingsInput
    connect?: SemanticRuleSetWhereUniqueInput
    update?: XOR<XOR<SemanticRuleSetUpdateToOneWithWhereWithoutTargetingsInput, SemanticRuleSetUpdateWithoutTargetingsInput>, SemanticRuleSetUncheckedUpdateWithoutTargetingsInput>
  }

  export type SemanticRuleDomainCreateNestedOneWithoutHitLogsInput = {
    create?: XOR<SemanticRuleDomainCreateWithoutHitLogsInput, SemanticRuleDomainUncheckedCreateWithoutHitLogsInput>
    connectOrCreate?: SemanticRuleDomainCreateOrConnectWithoutHitLogsInput
    connect?: SemanticRuleDomainWhereUniqueInput
  }

  export type SemanticRuleSetCreateNestedOneWithoutHitLogsInput = {
    create?: XOR<SemanticRuleSetCreateWithoutHitLogsInput, SemanticRuleSetUncheckedCreateWithoutHitLogsInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutHitLogsInput
    connect?: SemanticRuleSetWhereUniqueInput
  }

  export type NullableBoolFieldUpdateOperationsInput = {
    set?: boolean | null
  }

  export type SemanticRuleDomainUpdateOneRequiredWithoutHitLogsNestedInput = {
    create?: XOR<SemanticRuleDomainCreateWithoutHitLogsInput, SemanticRuleDomainUncheckedCreateWithoutHitLogsInput>
    connectOrCreate?: SemanticRuleDomainCreateOrConnectWithoutHitLogsInput
    upsert?: SemanticRuleDomainUpsertWithoutHitLogsInput
    connect?: SemanticRuleDomainWhereUniqueInput
    update?: XOR<XOR<SemanticRuleDomainUpdateToOneWithWhereWithoutHitLogsInput, SemanticRuleDomainUpdateWithoutHitLogsInput>, SemanticRuleDomainUncheckedUpdateWithoutHitLogsInput>
  }

  export type SemanticRuleSetUpdateOneWithoutHitLogsNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutHitLogsInput, SemanticRuleSetUncheckedCreateWithoutHitLogsInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutHitLogsInput
    upsert?: SemanticRuleSetUpsertWithoutHitLogsInput
    disconnect?: SemanticRuleSetWhereInput | boolean
    delete?: SemanticRuleSetWhereInput | boolean
    connect?: SemanticRuleSetWhereUniqueInput
    update?: XOR<XOR<SemanticRuleSetUpdateToOneWithWhereWithoutHitLogsInput, SemanticRuleSetUpdateWithoutHitLogsInput>, SemanticRuleSetUncheckedUpdateWithoutHitLogsInput>
  }

  export type SemanticRuleDomainCreateNestedOneWithoutErrorLogsInput = {
    create?: XOR<SemanticRuleDomainCreateWithoutErrorLogsInput, SemanticRuleDomainUncheckedCreateWithoutErrorLogsInput>
    connectOrCreate?: SemanticRuleDomainCreateOrConnectWithoutErrorLogsInput
    connect?: SemanticRuleDomainWhereUniqueInput
  }

  export type SemanticRuleSetCreateNestedOneWithoutErrorLogsInput = {
    create?: XOR<SemanticRuleSetCreateWithoutErrorLogsInput, SemanticRuleSetUncheckedCreateWithoutErrorLogsInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutErrorLogsInput
    connect?: SemanticRuleSetWhereUniqueInput
  }

  export type SemanticRuleDomainUpdateOneRequiredWithoutErrorLogsNestedInput = {
    create?: XOR<SemanticRuleDomainCreateWithoutErrorLogsInput, SemanticRuleDomainUncheckedCreateWithoutErrorLogsInput>
    connectOrCreate?: SemanticRuleDomainCreateOrConnectWithoutErrorLogsInput
    upsert?: SemanticRuleDomainUpsertWithoutErrorLogsInput
    connect?: SemanticRuleDomainWhereUniqueInput
    update?: XOR<XOR<SemanticRuleDomainUpdateToOneWithWhereWithoutErrorLogsInput, SemanticRuleDomainUpdateWithoutErrorLogsInput>, SemanticRuleDomainUncheckedUpdateWithoutErrorLogsInput>
  }

  export type SemanticRuleSetUpdateOneWithoutErrorLogsNestedInput = {
    create?: XOR<SemanticRuleSetCreateWithoutErrorLogsInput, SemanticRuleSetUncheckedCreateWithoutErrorLogsInput>
    connectOrCreate?: SemanticRuleSetCreateOrConnectWithoutErrorLogsInput
    upsert?: SemanticRuleSetUpsertWithoutErrorLogsInput
    disconnect?: SemanticRuleSetWhereInput | boolean
    delete?: SemanticRuleSetWhereInput | boolean
    connect?: SemanticRuleSetWhereUniqueInput
    update?: XOR<XOR<SemanticRuleSetUpdateToOneWithWhereWithoutErrorLogsInput, SemanticRuleSetUpdateWithoutErrorLogsInput>, SemanticRuleSetUncheckedUpdateWithoutErrorLogsInput>
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

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
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

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
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

  export type NestedEnumSemanticRuleSetStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleSetStatus | EnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleSetStatusFilter<$PrismaModel> | $Enums.SemanticRuleSetStatus
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

  export type NestedEnumSemanticRuleSetStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleSetStatus | EnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleSetStatus[] | ListEnumSemanticRuleSetStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleSetStatusWithAggregatesFilter<$PrismaModel> | $Enums.SemanticRuleSetStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSemanticRuleSetStatusFilter<$PrismaModel>
    _max?: NestedEnumSemanticRuleSetStatusFilter<$PrismaModel>
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

  export type NestedEnumSemanticRuleTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleType | EnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleTypeFilter<$PrismaModel> | $Enums.SemanticRuleType
  }

  export type NestedEnumSemanticRuleTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleType | EnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleType[] | ListEnumSemanticRuleTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleTypeWithAggregatesFilter<$PrismaModel> | $Enums.SemanticRuleType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSemanticRuleTypeFilter<$PrismaModel>
    _max?: NestedEnumSemanticRuleTypeFilter<$PrismaModel>
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
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
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

  export type NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleReleaseMode | EnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel> | $Enums.SemanticRuleReleaseMode
  }

  export type NestedEnumSemanticRuleReleaseModeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SemanticRuleReleaseMode | EnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    in?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    notIn?: $Enums.SemanticRuleReleaseMode[] | ListEnumSemanticRuleReleaseModeFieldRefInput<$PrismaModel>
    not?: NestedEnumSemanticRuleReleaseModeWithAggregatesFilter<$PrismaModel> | $Enums.SemanticRuleReleaseMode
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel>
    _max?: NestedEnumSemanticRuleReleaseModeFilter<$PrismaModel>
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

  export type NestedFloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedFloatNullableFilter<$PrismaModel>
    _min?: NestedFloatNullableFilter<$PrismaModel>
    _max?: NestedFloatNullableFilter<$PrismaModel>
  }

  export type NestedBoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null
  }

  export type NestedBoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBoolNullableFilter<$PrismaModel>
    _max?: NestedBoolNullableFilter<$PrismaModel>
  }

  export type SemanticRuleSetCreateWithoutDomainInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateWithoutDomainInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetCreateOrConnectWithoutDomainInput = {
    where: SemanticRuleSetWhereUniqueInput
    create: XOR<SemanticRuleSetCreateWithoutDomainInput, SemanticRuleSetUncheckedCreateWithoutDomainInput>
  }

  export type SemanticRuleSetCreateManyDomainInputEnvelope = {
    data: SemanticRuleSetCreateManyDomainInput | SemanticRuleSetCreateManyDomainInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleHitLogCreateWithoutDomainInput = {
    id?: string
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
    ruleSet?: SemanticRuleSetCreateNestedOneWithoutHitLogsInput
  }

  export type SemanticRuleHitLogUncheckedCreateWithoutDomainInput = {
    id?: string
    ruleSetId?: string | null
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
  }

  export type SemanticRuleHitLogCreateOrConnectWithoutDomainInput = {
    where: SemanticRuleHitLogWhereUniqueInput
    create: XOR<SemanticRuleHitLogCreateWithoutDomainInput, SemanticRuleHitLogUncheckedCreateWithoutDomainInput>
  }

  export type SemanticRuleHitLogCreateManyDomainInputEnvelope = {
    data: SemanticRuleHitLogCreateManyDomainInput | SemanticRuleHitLogCreateManyDomainInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleErrorLogCreateWithoutDomainInput = {
    id?: string
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    ruleSet?: SemanticRuleSetCreateNestedOneWithoutErrorLogsInput
  }

  export type SemanticRuleErrorLogUncheckedCreateWithoutDomainInput = {
    id?: string
    ruleSetId?: string | null
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type SemanticRuleErrorLogCreateOrConnectWithoutDomainInput = {
    where: SemanticRuleErrorLogWhereUniqueInput
    create: XOR<SemanticRuleErrorLogCreateWithoutDomainInput, SemanticRuleErrorLogUncheckedCreateWithoutDomainInput>
  }

  export type SemanticRuleErrorLogCreateManyDomainInputEnvelope = {
    data: SemanticRuleErrorLogCreateManyDomainInput | SemanticRuleErrorLogCreateManyDomainInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleSetUpsertWithWhereUniqueWithoutDomainInput = {
    where: SemanticRuleSetWhereUniqueInput
    update: XOR<SemanticRuleSetUpdateWithoutDomainInput, SemanticRuleSetUncheckedUpdateWithoutDomainInput>
    create: XOR<SemanticRuleSetCreateWithoutDomainInput, SemanticRuleSetUncheckedCreateWithoutDomainInput>
  }

  export type SemanticRuleSetUpdateWithWhereUniqueWithoutDomainInput = {
    where: SemanticRuleSetWhereUniqueInput
    data: XOR<SemanticRuleSetUpdateWithoutDomainInput, SemanticRuleSetUncheckedUpdateWithoutDomainInput>
  }

  export type SemanticRuleSetUpdateManyWithWhereWithoutDomainInput = {
    where: SemanticRuleSetScalarWhereInput
    data: XOR<SemanticRuleSetUpdateManyMutationInput, SemanticRuleSetUncheckedUpdateManyWithoutDomainInput>
  }

  export type SemanticRuleSetScalarWhereInput = {
    AND?: SemanticRuleSetScalarWhereInput | SemanticRuleSetScalarWhereInput[]
    OR?: SemanticRuleSetScalarWhereInput[]
    NOT?: SemanticRuleSetScalarWhereInput | SemanticRuleSetScalarWhereInput[]
    id?: UuidFilter<"SemanticRuleSet"> | string
    domainId?: UuidFilter<"SemanticRuleSet"> | string
    key?: StringFilter<"SemanticRuleSet"> | string
    name?: StringFilter<"SemanticRuleSet"> | string
    version?: StringFilter<"SemanticRuleSet"> | string
    status?: EnumSemanticRuleSetStatusFilter<"SemanticRuleSet"> | $Enums.SemanticRuleSetStatus
    description?: StringNullableFilter<"SemanticRuleSet"> | string | null
    basedOnRuleSetId?: UuidNullableFilter<"SemanticRuleSet"> | string | null
    changeSummary?: StringNullableFilter<"SemanticRuleSet"> | string | null
    createdBy?: StringFilter<"SemanticRuleSet"> | string
    createdAt?: DateTimeFilter<"SemanticRuleSet"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleSet"> | Date | string
    activatedAt?: DateTimeNullableFilter<"SemanticRuleSet"> | Date | string | null
    archivedAt?: DateTimeNullableFilter<"SemanticRuleSet"> | Date | string | null
  }

  export type SemanticRuleHitLogUpsertWithWhereUniqueWithoutDomainInput = {
    where: SemanticRuleHitLogWhereUniqueInput
    update: XOR<SemanticRuleHitLogUpdateWithoutDomainInput, SemanticRuleHitLogUncheckedUpdateWithoutDomainInput>
    create: XOR<SemanticRuleHitLogCreateWithoutDomainInput, SemanticRuleHitLogUncheckedCreateWithoutDomainInput>
  }

  export type SemanticRuleHitLogUpdateWithWhereUniqueWithoutDomainInput = {
    where: SemanticRuleHitLogWhereUniqueInput
    data: XOR<SemanticRuleHitLogUpdateWithoutDomainInput, SemanticRuleHitLogUncheckedUpdateWithoutDomainInput>
  }

  export type SemanticRuleHitLogUpdateManyWithWhereWithoutDomainInput = {
    where: SemanticRuleHitLogScalarWhereInput
    data: XOR<SemanticRuleHitLogUpdateManyMutationInput, SemanticRuleHitLogUncheckedUpdateManyWithoutDomainInput>
  }

  export type SemanticRuleHitLogScalarWhereInput = {
    AND?: SemanticRuleHitLogScalarWhereInput | SemanticRuleHitLogScalarWhereInput[]
    OR?: SemanticRuleHitLogScalarWhereInput[]
    NOT?: SemanticRuleHitLogScalarWhereInput | SemanticRuleHitLogScalarWhereInput[]
    id?: UuidFilter<"SemanticRuleHitLog"> | string
    domainId?: UuidFilter<"SemanticRuleHitLog"> | string
    ruleSetId?: UuidNullableFilter<"SemanticRuleHitLog"> | string | null
    matchedRuleIds?: JsonFilter<"SemanticRuleHitLog">
    inputText?: StringFilter<"SemanticRuleHitLog"> | string
    normalizedInput?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageUrl?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageTitle?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    pageType?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    observationSummary?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    availableCandidateIds?: JsonNullableFilter<"SemanticRuleHitLog">
    normalizedSemantic?: JsonNullableFilter<"SemanticRuleHitLog">
    parserOutput?: JsonNullableFilter<"SemanticRuleHitLog">
    usedAiFallback?: BoolFilter<"SemanticRuleHitLog"> | boolean
    finalExecutionSuccess?: BoolNullableFilter<"SemanticRuleHitLog"> | boolean | null
    failureReason?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    traceId?: StringNullableFilter<"SemanticRuleHitLog"> | string | null
    createdAt?: DateTimeFilter<"SemanticRuleHitLog"> | Date | string
  }

  export type SemanticRuleErrorLogUpsertWithWhereUniqueWithoutDomainInput = {
    where: SemanticRuleErrorLogWhereUniqueInput
    update: XOR<SemanticRuleErrorLogUpdateWithoutDomainInput, SemanticRuleErrorLogUncheckedUpdateWithoutDomainInput>
    create: XOR<SemanticRuleErrorLogCreateWithoutDomainInput, SemanticRuleErrorLogUncheckedCreateWithoutDomainInput>
  }

  export type SemanticRuleErrorLogUpdateWithWhereUniqueWithoutDomainInput = {
    where: SemanticRuleErrorLogWhereUniqueInput
    data: XOR<SemanticRuleErrorLogUpdateWithoutDomainInput, SemanticRuleErrorLogUncheckedUpdateWithoutDomainInput>
  }

  export type SemanticRuleErrorLogUpdateManyWithWhereWithoutDomainInput = {
    where: SemanticRuleErrorLogScalarWhereInput
    data: XOR<SemanticRuleErrorLogUpdateManyMutationInput, SemanticRuleErrorLogUncheckedUpdateManyWithoutDomainInput>
  }

  export type SemanticRuleErrorLogScalarWhereInput = {
    AND?: SemanticRuleErrorLogScalarWhereInput | SemanticRuleErrorLogScalarWhereInput[]
    OR?: SemanticRuleErrorLogScalarWhereInput[]
    NOT?: SemanticRuleErrorLogScalarWhereInput | SemanticRuleErrorLogScalarWhereInput[]
    id?: UuidFilter<"SemanticRuleErrorLog"> | string
    domainId?: UuidFilter<"SemanticRuleErrorLog"> | string
    ruleSetId?: UuidNullableFilter<"SemanticRuleErrorLog"> | string | null
    source?: StringFilter<"SemanticRuleErrorLog"> | string
    errorType?: StringFilter<"SemanticRuleErrorLog"> | string
    errorCode?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    errorMessage?: StringFilter<"SemanticRuleErrorLog"> | string
    inputText?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    normalizedInput?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    traceId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    sessionId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    taskId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    stepId?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageUrl?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageTitle?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    host?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    pageType?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    observationSummary?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    candidateSummary?: JsonNullableFilter<"SemanticRuleErrorLog">
    matchedRuleIds?: JsonNullableFilter<"SemanticRuleErrorLog">
    normalizedSemantic?: JsonNullableFilter<"SemanticRuleErrorLog">
    parserOutput?: JsonNullableFilter<"SemanticRuleErrorLog">
    aiFallbackInput?: JsonNullableFilter<"SemanticRuleErrorLog">
    aiFallbackOutput?: JsonNullableFilter<"SemanticRuleErrorLog">
    screenshotUrl?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    domSnippet?: StringNullableFilter<"SemanticRuleErrorLog"> | string | null
    locatorInfo?: JsonNullableFilter<"SemanticRuleErrorLog">
    consoleErrors?: JsonNullableFilter<"SemanticRuleErrorLog">
    metadata?: JsonNullableFilter<"SemanticRuleErrorLog">
    createdAt?: DateTimeFilter<"SemanticRuleErrorLog"> | Date | string
  }

  export type SemanticRuleDomainCreateWithoutRuleSetsInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutDomainInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainUncheckedCreateWithoutRuleSetsInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutDomainInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainCreateOrConnectWithoutRuleSetsInput = {
    where: SemanticRuleDomainWhereUniqueInput
    create: XOR<SemanticRuleDomainCreateWithoutRuleSetsInput, SemanticRuleDomainUncheckedCreateWithoutRuleSetsInput>
  }

  export type SemanticRuleCreateWithoutRuleSetInput = {
    id?: string
    type: $Enums.SemanticRuleType
    name: string
    enabled?: boolean
    priority: number
    stopOnMatch?: boolean
    flags?: string | null
    patterns: JsonNullValueInput | InputJsonValue
    outputs: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleUncheckedCreateWithoutRuleSetInput = {
    id?: string
    type: $Enums.SemanticRuleType
    name: string
    enabled?: boolean
    priority: number
    stopOnMatch?: boolean
    flags?: string | null
    patterns: JsonNullValueInput | InputJsonValue
    outputs: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleCreateOrConnectWithoutRuleSetInput = {
    where: SemanticRuleWhereUniqueInput
    create: XOR<SemanticRuleCreateWithoutRuleSetInput, SemanticRuleUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleCreateManyRuleSetInputEnvelope = {
    data: SemanticRuleCreateManyRuleSetInput | SemanticRuleCreateManyRuleSetInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleReleaseCreateWithoutRuleSetInput = {
    id?: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote?: string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: Date | string
    effectiveAt?: Date | string | null
    previousActiveRuleSetId?: string | null
  }

  export type SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput = {
    id?: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote?: string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: Date | string
    effectiveAt?: Date | string | null
    previousActiveRuleSetId?: string | null
  }

  export type SemanticRuleReleaseCreateOrConnectWithoutRuleSetInput = {
    where: SemanticRuleReleaseWhereUniqueInput
    create: XOR<SemanticRuleReleaseCreateWithoutRuleSetInput, SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleReleaseCreateManyRuleSetInputEnvelope = {
    data: SemanticRuleReleaseCreateManyRuleSetInput | SemanticRuleReleaseCreateManyRuleSetInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleTargetingCreateWithoutRuleSetInput = {
    id?: string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: number | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput = {
    id?: string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: number | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleTargetingCreateOrConnectWithoutRuleSetInput = {
    where: SemanticRuleTargetingWhereUniqueInput
    create: XOR<SemanticRuleTargetingCreateWithoutRuleSetInput, SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleTargetingCreateManyRuleSetInputEnvelope = {
    data: SemanticRuleTargetingCreateManyRuleSetInput | SemanticRuleTargetingCreateManyRuleSetInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleHitLogCreateWithoutRuleSetInput = {
    id?: string
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
    domain: SemanticRuleDomainCreateNestedOneWithoutHitLogsInput
  }

  export type SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput = {
    id?: string
    domainId: string
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
  }

  export type SemanticRuleHitLogCreateOrConnectWithoutRuleSetInput = {
    where: SemanticRuleHitLogWhereUniqueInput
    create: XOR<SemanticRuleHitLogCreateWithoutRuleSetInput, SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleHitLogCreateManyRuleSetInputEnvelope = {
    data: SemanticRuleHitLogCreateManyRuleSetInput | SemanticRuleHitLogCreateManyRuleSetInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleErrorLogCreateWithoutRuleSetInput = {
    id?: string
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    domain: SemanticRuleDomainCreateNestedOneWithoutErrorLogsInput
  }

  export type SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput = {
    id?: string
    domainId: string
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type SemanticRuleErrorLogCreateOrConnectWithoutRuleSetInput = {
    where: SemanticRuleErrorLogWhereUniqueInput
    create: XOR<SemanticRuleErrorLogCreateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleErrorLogCreateManyRuleSetInputEnvelope = {
    data: SemanticRuleErrorLogCreateManyRuleSetInput | SemanticRuleErrorLogCreateManyRuleSetInput[]
    skipDuplicates?: boolean
  }

  export type SemanticRuleDomainUpsertWithoutRuleSetsInput = {
    update: XOR<SemanticRuleDomainUpdateWithoutRuleSetsInput, SemanticRuleDomainUncheckedUpdateWithoutRuleSetsInput>
    create: XOR<SemanticRuleDomainCreateWithoutRuleSetsInput, SemanticRuleDomainUncheckedCreateWithoutRuleSetsInput>
    where?: SemanticRuleDomainWhereInput
  }

  export type SemanticRuleDomainUpdateToOneWithWhereWithoutRuleSetsInput = {
    where?: SemanticRuleDomainWhereInput
    data: XOR<SemanticRuleDomainUpdateWithoutRuleSetsInput, SemanticRuleDomainUncheckedUpdateWithoutRuleSetsInput>
  }

  export type SemanticRuleDomainUpdateWithoutRuleSetsInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutDomainNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleDomainUncheckedUpdateWithoutRuleSetsInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutDomainNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleUpsertWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleWhereUniqueInput
    update: XOR<SemanticRuleUpdateWithoutRuleSetInput, SemanticRuleUncheckedUpdateWithoutRuleSetInput>
    create: XOR<SemanticRuleCreateWithoutRuleSetInput, SemanticRuleUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleUpdateWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleWhereUniqueInput
    data: XOR<SemanticRuleUpdateWithoutRuleSetInput, SemanticRuleUncheckedUpdateWithoutRuleSetInput>
  }

  export type SemanticRuleUpdateManyWithWhereWithoutRuleSetInput = {
    where: SemanticRuleScalarWhereInput
    data: XOR<SemanticRuleUpdateManyMutationInput, SemanticRuleUncheckedUpdateManyWithoutRuleSetInput>
  }

  export type SemanticRuleScalarWhereInput = {
    AND?: SemanticRuleScalarWhereInput | SemanticRuleScalarWhereInput[]
    OR?: SemanticRuleScalarWhereInput[]
    NOT?: SemanticRuleScalarWhereInput | SemanticRuleScalarWhereInput[]
    id?: UuidFilter<"SemanticRule"> | string
    ruleSetId?: UuidFilter<"SemanticRule"> | string
    type?: EnumSemanticRuleTypeFilter<"SemanticRule"> | $Enums.SemanticRuleType
    name?: StringFilter<"SemanticRule"> | string
    enabled?: BoolFilter<"SemanticRule"> | boolean
    priority?: IntFilter<"SemanticRule"> | number
    stopOnMatch?: BoolFilter<"SemanticRule"> | boolean
    flags?: StringNullableFilter<"SemanticRule"> | string | null
    patterns?: JsonFilter<"SemanticRule">
    outputs?: JsonFilter<"SemanticRule">
    examples?: JsonNullableFilter<"SemanticRule">
    negativeExamples?: JsonNullableFilter<"SemanticRule">
    tags?: JsonNullableFilter<"SemanticRule">
    note?: StringNullableFilter<"SemanticRule"> | string | null
    createdAt?: DateTimeFilter<"SemanticRule"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRule"> | Date | string
  }

  export type SemanticRuleReleaseUpsertWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleReleaseWhereUniqueInput
    update: XOR<SemanticRuleReleaseUpdateWithoutRuleSetInput, SemanticRuleReleaseUncheckedUpdateWithoutRuleSetInput>
    create: XOR<SemanticRuleReleaseCreateWithoutRuleSetInput, SemanticRuleReleaseUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleReleaseUpdateWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleReleaseWhereUniqueInput
    data: XOR<SemanticRuleReleaseUpdateWithoutRuleSetInput, SemanticRuleReleaseUncheckedUpdateWithoutRuleSetInput>
  }

  export type SemanticRuleReleaseUpdateManyWithWhereWithoutRuleSetInput = {
    where: SemanticRuleReleaseScalarWhereInput
    data: XOR<SemanticRuleReleaseUpdateManyMutationInput, SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetInput>
  }

  export type SemanticRuleReleaseScalarWhereInput = {
    AND?: SemanticRuleReleaseScalarWhereInput | SemanticRuleReleaseScalarWhereInput[]
    OR?: SemanticRuleReleaseScalarWhereInput[]
    NOT?: SemanticRuleReleaseScalarWhereInput | SemanticRuleReleaseScalarWhereInput[]
    id?: UuidFilter<"SemanticRuleRelease"> | string
    ruleSetId?: UuidFilter<"SemanticRuleRelease"> | string
    releaseMode?: EnumSemanticRuleReleaseModeFilter<"SemanticRuleRelease"> | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFilter<"SemanticRuleRelease"> | string
    toStatus?: StringFilter<"SemanticRuleRelease"> | string
    releasedBy?: StringFilter<"SemanticRuleRelease"> | string
    releaseNote?: StringNullableFilter<"SemanticRuleRelease"> | string | null
    targeting?: JsonNullableFilter<"SemanticRuleRelease">
    triggeredAt?: DateTimeFilter<"SemanticRuleRelease"> | Date | string
    effectiveAt?: DateTimeNullableFilter<"SemanticRuleRelease"> | Date | string | null
    previousActiveRuleSetId?: UuidNullableFilter<"SemanticRuleRelease"> | string | null
  }

  export type SemanticRuleTargetingUpsertWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleTargetingWhereUniqueInput
    update: XOR<SemanticRuleTargetingUpdateWithoutRuleSetInput, SemanticRuleTargetingUncheckedUpdateWithoutRuleSetInput>
    create: XOR<SemanticRuleTargetingCreateWithoutRuleSetInput, SemanticRuleTargetingUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleTargetingUpdateWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleTargetingWhereUniqueInput
    data: XOR<SemanticRuleTargetingUpdateWithoutRuleSetInput, SemanticRuleTargetingUncheckedUpdateWithoutRuleSetInput>
  }

  export type SemanticRuleTargetingUpdateManyWithWhereWithoutRuleSetInput = {
    where: SemanticRuleTargetingScalarWhereInput
    data: XOR<SemanticRuleTargetingUpdateManyMutationInput, SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetInput>
  }

  export type SemanticRuleTargetingScalarWhereInput = {
    AND?: SemanticRuleTargetingScalarWhereInput | SemanticRuleTargetingScalarWhereInput[]
    OR?: SemanticRuleTargetingScalarWhereInput[]
    NOT?: SemanticRuleTargetingScalarWhereInput | SemanticRuleTargetingScalarWhereInput[]
    id?: UuidFilter<"SemanticRuleTargeting"> | string
    ruleSetId?: UuidFilter<"SemanticRuleTargeting"> | string
    environments?: JsonNullableFilter<"SemanticRuleTargeting">
    hosts?: JsonNullableFilter<"SemanticRuleTargeting">
    tenantIds?: JsonNullableFilter<"SemanticRuleTargeting">
    userIds?: JsonNullableFilter<"SemanticRuleTargeting">
    skillIds?: JsonNullableFilter<"SemanticRuleTargeting">
    pageTypes?: JsonNullableFilter<"SemanticRuleTargeting">
    sampleRate?: FloatNullableFilter<"SemanticRuleTargeting"> | number | null
    enabled?: BoolFilter<"SemanticRuleTargeting"> | boolean
    createdAt?: DateTimeFilter<"SemanticRuleTargeting"> | Date | string
    updatedAt?: DateTimeFilter<"SemanticRuleTargeting"> | Date | string
  }

  export type SemanticRuleHitLogUpsertWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleHitLogWhereUniqueInput
    update: XOR<SemanticRuleHitLogUpdateWithoutRuleSetInput, SemanticRuleHitLogUncheckedUpdateWithoutRuleSetInput>
    create: XOR<SemanticRuleHitLogCreateWithoutRuleSetInput, SemanticRuleHitLogUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleHitLogUpdateWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleHitLogWhereUniqueInput
    data: XOR<SemanticRuleHitLogUpdateWithoutRuleSetInput, SemanticRuleHitLogUncheckedUpdateWithoutRuleSetInput>
  }

  export type SemanticRuleHitLogUpdateManyWithWhereWithoutRuleSetInput = {
    where: SemanticRuleHitLogScalarWhereInput
    data: XOR<SemanticRuleHitLogUpdateManyMutationInput, SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetInput>
  }

  export type SemanticRuleErrorLogUpsertWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleErrorLogWhereUniqueInput
    update: XOR<SemanticRuleErrorLogUpdateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedUpdateWithoutRuleSetInput>
    create: XOR<SemanticRuleErrorLogCreateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedCreateWithoutRuleSetInput>
  }

  export type SemanticRuleErrorLogUpdateWithWhereUniqueWithoutRuleSetInput = {
    where: SemanticRuleErrorLogWhereUniqueInput
    data: XOR<SemanticRuleErrorLogUpdateWithoutRuleSetInput, SemanticRuleErrorLogUncheckedUpdateWithoutRuleSetInput>
  }

  export type SemanticRuleErrorLogUpdateManyWithWhereWithoutRuleSetInput = {
    where: SemanticRuleErrorLogScalarWhereInput
    data: XOR<SemanticRuleErrorLogUpdateManyMutationInput, SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetInput>
  }

  export type SemanticRuleSetCreateWithoutRulesInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    domain: SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput
    releases?: SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateWithoutRulesInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    releases?: SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetCreateOrConnectWithoutRulesInput = {
    where: SemanticRuleSetWhereUniqueInput
    create: XOR<SemanticRuleSetCreateWithoutRulesInput, SemanticRuleSetUncheckedCreateWithoutRulesInput>
  }

  export type SemanticRuleSetUpsertWithoutRulesInput = {
    update: XOR<SemanticRuleSetUpdateWithoutRulesInput, SemanticRuleSetUncheckedUpdateWithoutRulesInput>
    create: XOR<SemanticRuleSetCreateWithoutRulesInput, SemanticRuleSetUncheckedCreateWithoutRulesInput>
    where?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleSetUpdateToOneWithWhereWithoutRulesInput = {
    where?: SemanticRuleSetWhereInput
    data: XOR<SemanticRuleSetUpdateWithoutRulesInput, SemanticRuleSetUncheckedUpdateWithoutRulesInput>
  }

  export type SemanticRuleSetUpdateWithoutRulesInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput
    releases?: SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateWithoutRulesInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    releases?: SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetCreateWithoutReleasesInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    domain: SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput
    rules?: SemanticRuleCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateWithoutReleasesInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetCreateOrConnectWithoutReleasesInput = {
    where: SemanticRuleSetWhereUniqueInput
    create: XOR<SemanticRuleSetCreateWithoutReleasesInput, SemanticRuleSetUncheckedCreateWithoutReleasesInput>
  }

  export type SemanticRuleSetUpsertWithoutReleasesInput = {
    update: XOR<SemanticRuleSetUpdateWithoutReleasesInput, SemanticRuleSetUncheckedUpdateWithoutReleasesInput>
    create: XOR<SemanticRuleSetCreateWithoutReleasesInput, SemanticRuleSetUncheckedCreateWithoutReleasesInput>
    where?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleSetUpdateToOneWithWhereWithoutReleasesInput = {
    where?: SemanticRuleSetWhereInput
    data: XOR<SemanticRuleSetUpdateWithoutReleasesInput, SemanticRuleSetUncheckedUpdateWithoutReleasesInput>
  }

  export type SemanticRuleSetUpdateWithoutReleasesInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput
    rules?: SemanticRuleUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateWithoutReleasesInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetCreateWithoutTargetingsInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    domain: SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput
    rules?: SemanticRuleCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateWithoutTargetingsInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetCreateOrConnectWithoutTargetingsInput = {
    where: SemanticRuleSetWhereUniqueInput
    create: XOR<SemanticRuleSetCreateWithoutTargetingsInput, SemanticRuleSetUncheckedCreateWithoutTargetingsInput>
  }

  export type SemanticRuleSetUpsertWithoutTargetingsInput = {
    update: XOR<SemanticRuleSetUpdateWithoutTargetingsInput, SemanticRuleSetUncheckedUpdateWithoutTargetingsInput>
    create: XOR<SemanticRuleSetCreateWithoutTargetingsInput, SemanticRuleSetUncheckedCreateWithoutTargetingsInput>
    where?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleSetUpdateToOneWithWhereWithoutTargetingsInput = {
    where?: SemanticRuleSetWhereInput
    data: XOR<SemanticRuleSetUpdateWithoutTargetingsInput, SemanticRuleSetUncheckedUpdateWithoutTargetingsInput>
  }

  export type SemanticRuleSetUpdateWithoutTargetingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput
    rules?: SemanticRuleUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateWithoutTargetingsInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleDomainCreateWithoutHitLogsInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSets?: SemanticRuleSetCreateNestedManyWithoutDomainInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainUncheckedCreateWithoutHitLogsInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSets?: SemanticRuleSetUncheckedCreateNestedManyWithoutDomainInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainCreateOrConnectWithoutHitLogsInput = {
    where: SemanticRuleDomainWhereUniqueInput
    create: XOR<SemanticRuleDomainCreateWithoutHitLogsInput, SemanticRuleDomainUncheckedCreateWithoutHitLogsInput>
  }

  export type SemanticRuleSetCreateWithoutHitLogsInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    domain: SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput
    rules?: SemanticRuleCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateWithoutHitLogsInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput
    errorLogs?: SemanticRuleErrorLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetCreateOrConnectWithoutHitLogsInput = {
    where: SemanticRuleSetWhereUniqueInput
    create: XOR<SemanticRuleSetCreateWithoutHitLogsInput, SemanticRuleSetUncheckedCreateWithoutHitLogsInput>
  }

  export type SemanticRuleDomainUpsertWithoutHitLogsInput = {
    update: XOR<SemanticRuleDomainUpdateWithoutHitLogsInput, SemanticRuleDomainUncheckedUpdateWithoutHitLogsInput>
    create: XOR<SemanticRuleDomainCreateWithoutHitLogsInput, SemanticRuleDomainUncheckedCreateWithoutHitLogsInput>
    where?: SemanticRuleDomainWhereInput
  }

  export type SemanticRuleDomainUpdateToOneWithWhereWithoutHitLogsInput = {
    where?: SemanticRuleDomainWhereInput
    data: XOR<SemanticRuleDomainUpdateWithoutHitLogsInput, SemanticRuleDomainUncheckedUpdateWithoutHitLogsInput>
  }

  export type SemanticRuleDomainUpdateWithoutHitLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSets?: SemanticRuleSetUpdateManyWithoutDomainNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleDomainUncheckedUpdateWithoutHitLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSets?: SemanticRuleSetUncheckedUpdateManyWithoutDomainNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleSetUpsertWithoutHitLogsInput = {
    update: XOR<SemanticRuleSetUpdateWithoutHitLogsInput, SemanticRuleSetUncheckedUpdateWithoutHitLogsInput>
    create: XOR<SemanticRuleSetCreateWithoutHitLogsInput, SemanticRuleSetUncheckedCreateWithoutHitLogsInput>
    where?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleSetUpdateToOneWithWhereWithoutHitLogsInput = {
    where?: SemanticRuleSetWhereInput
    data: XOR<SemanticRuleSetUpdateWithoutHitLogsInput, SemanticRuleSetUncheckedUpdateWithoutHitLogsInput>
  }

  export type SemanticRuleSetUpdateWithoutHitLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput
    rules?: SemanticRuleUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateWithoutHitLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleDomainCreateWithoutErrorLogsInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSets?: SemanticRuleSetCreateNestedManyWithoutDomainInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainUncheckedCreateWithoutErrorLogsInput = {
    id?: string
    code: string
    name: string
    description?: string | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
    ruleSets?: SemanticRuleSetUncheckedCreateNestedManyWithoutDomainInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutDomainInput
  }

  export type SemanticRuleDomainCreateOrConnectWithoutErrorLogsInput = {
    where: SemanticRuleDomainWhereUniqueInput
    create: XOR<SemanticRuleDomainCreateWithoutErrorLogsInput, SemanticRuleDomainUncheckedCreateWithoutErrorLogsInput>
  }

  export type SemanticRuleSetCreateWithoutErrorLogsInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    domain: SemanticRuleDomainCreateNestedOneWithoutRuleSetsInput
    rules?: SemanticRuleCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetUncheckedCreateWithoutErrorLogsInput = {
    id?: string
    domainId: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
    rules?: SemanticRuleUncheckedCreateNestedManyWithoutRuleSetInput
    releases?: SemanticRuleReleaseUncheckedCreateNestedManyWithoutRuleSetInput
    targetings?: SemanticRuleTargetingUncheckedCreateNestedManyWithoutRuleSetInput
    hitLogs?: SemanticRuleHitLogUncheckedCreateNestedManyWithoutRuleSetInput
  }

  export type SemanticRuleSetCreateOrConnectWithoutErrorLogsInput = {
    where: SemanticRuleSetWhereUniqueInput
    create: XOR<SemanticRuleSetCreateWithoutErrorLogsInput, SemanticRuleSetUncheckedCreateWithoutErrorLogsInput>
  }

  export type SemanticRuleDomainUpsertWithoutErrorLogsInput = {
    update: XOR<SemanticRuleDomainUpdateWithoutErrorLogsInput, SemanticRuleDomainUncheckedUpdateWithoutErrorLogsInput>
    create: XOR<SemanticRuleDomainCreateWithoutErrorLogsInput, SemanticRuleDomainUncheckedCreateWithoutErrorLogsInput>
    where?: SemanticRuleDomainWhereInput
  }

  export type SemanticRuleDomainUpdateToOneWithWhereWithoutErrorLogsInput = {
    where?: SemanticRuleDomainWhereInput
    data: XOR<SemanticRuleDomainUpdateWithoutErrorLogsInput, SemanticRuleDomainUncheckedUpdateWithoutErrorLogsInput>
  }

  export type SemanticRuleDomainUpdateWithoutErrorLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSets?: SemanticRuleSetUpdateManyWithoutDomainNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleDomainUncheckedUpdateWithoutErrorLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    code?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    description?: NullableStringFieldUpdateOperationsInput | string | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSets?: SemanticRuleSetUncheckedUpdateManyWithoutDomainNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutDomainNestedInput
  }

  export type SemanticRuleSetUpsertWithoutErrorLogsInput = {
    update: XOR<SemanticRuleSetUpdateWithoutErrorLogsInput, SemanticRuleSetUncheckedUpdateWithoutErrorLogsInput>
    create: XOR<SemanticRuleSetCreateWithoutErrorLogsInput, SemanticRuleSetUncheckedCreateWithoutErrorLogsInput>
    where?: SemanticRuleSetWhereInput
  }

  export type SemanticRuleSetUpdateToOneWithWhereWithoutErrorLogsInput = {
    where?: SemanticRuleSetWhereInput
    data: XOR<SemanticRuleSetUpdateWithoutErrorLogsInput, SemanticRuleSetUncheckedUpdateWithoutErrorLogsInput>
  }

  export type SemanticRuleSetUpdateWithoutErrorLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutRuleSetsNestedInput
    rules?: SemanticRuleUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateWithoutErrorLogsInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetCreateManyDomainInput = {
    id?: string
    key: string
    name: string
    version: string
    status: $Enums.SemanticRuleSetStatus
    description?: string | null
    basedOnRuleSetId?: string | null
    changeSummary?: string | null
    createdBy: string
    createdAt?: Date | string
    updatedAt?: Date | string
    activatedAt?: Date | string | null
    archivedAt?: Date | string | null
  }

  export type SemanticRuleHitLogCreateManyDomainInput = {
    id?: string
    ruleSetId?: string | null
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
  }

  export type SemanticRuleErrorLogCreateManyDomainInput = {
    id?: string
    ruleSetId?: string | null
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type SemanticRuleSetUpdateWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    rules?: SemanticRuleUncheckedUpdateManyWithoutRuleSetNestedInput
    releases?: SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetNestedInput
    targetings?: SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetNestedInput
    hitLogs?: SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetNestedInput
    errorLogs?: SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetNestedInput
  }

  export type SemanticRuleSetUncheckedUpdateManyWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    key?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    version?: StringFieldUpdateOperationsInput | string
    status?: EnumSemanticRuleSetStatusFieldUpdateOperationsInput | $Enums.SemanticRuleSetStatus
    description?: NullableStringFieldUpdateOperationsInput | string | null
    basedOnRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    changeSummary?: NullableStringFieldUpdateOperationsInput | string | null
    createdBy?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    activatedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    archivedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type SemanticRuleHitLogUpdateWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSet?: SemanticRuleSetUpdateOneWithoutHitLogsNestedInput
  }

  export type SemanticRuleHitLogUncheckedUpdateWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleHitLogUncheckedUpdateManyWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogUpdateWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    ruleSet?: SemanticRuleSetUpdateOneWithoutErrorLogsNestedInput
  }

  export type SemanticRuleErrorLogUncheckedUpdateWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogUncheckedUpdateManyWithoutDomainInput = {
    id?: StringFieldUpdateOperationsInput | string
    ruleSetId?: NullableStringFieldUpdateOperationsInput | string | null
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleCreateManyRuleSetInput = {
    id?: string
    type: $Enums.SemanticRuleType
    name: string
    enabled?: boolean
    priority: number
    stopOnMatch?: boolean
    flags?: string | null
    patterns: JsonNullValueInput | InputJsonValue
    outputs: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleReleaseCreateManyRuleSetInput = {
    id?: string
    releaseMode: $Enums.SemanticRuleReleaseMode
    fromStatus: string
    toStatus: string
    releasedBy: string
    releaseNote?: string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: Date | string
    effectiveAt?: Date | string | null
    previousActiveRuleSetId?: string | null
  }

  export type SemanticRuleTargetingCreateManyRuleSetInput = {
    id?: string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: number | null
    enabled?: boolean
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SemanticRuleHitLogCreateManyRuleSetInput = {
    id?: string
    domainId: string
    matchedRuleIds: JsonNullValueInput | InputJsonValue
    inputText: string
    normalizedInput?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    pageType?: string | null
    observationSummary?: string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: boolean
    finalExecutionSuccess?: boolean | null
    failureReason?: string | null
    traceId?: string | null
    createdAt?: Date | string
  }

  export type SemanticRuleErrorLogCreateManyRuleSetInput = {
    id?: string
    domainId: string
    source: string
    errorType: string
    errorCode?: string | null
    errorMessage: string
    inputText?: string | null
    normalizedInput?: string | null
    traceId?: string | null
    sessionId?: string | null
    taskId?: string | null
    stepId?: string | null
    pageUrl?: string | null
    pageTitle?: string | null
    host?: string | null
    pageType?: string | null
    observationSummary?: string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: string | null
    domSnippet?: string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type SemanticRuleUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleUncheckedUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleUncheckedUpdateManyWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumSemanticRuleTypeFieldUpdateOperationsInput | $Enums.SemanticRuleType
    name?: StringFieldUpdateOperationsInput | string
    enabled?: BoolFieldUpdateOperationsInput | boolean
    priority?: IntFieldUpdateOperationsInput | number
    stopOnMatch?: BoolFieldUpdateOperationsInput | boolean
    flags?: NullableStringFieldUpdateOperationsInput | string | null
    patterns?: JsonNullValueInput | InputJsonValue
    outputs?: JsonNullValueInput | InputJsonValue
    examples?: NullableJsonNullValueInput | InputJsonValue
    negativeExamples?: NullableJsonNullValueInput | InputJsonValue
    tags?: NullableJsonNullValueInput | InputJsonValue
    note?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleReleaseUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SemanticRuleReleaseUncheckedUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SemanticRuleReleaseUncheckedUpdateManyWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    releaseMode?: EnumSemanticRuleReleaseModeFieldUpdateOperationsInput | $Enums.SemanticRuleReleaseMode
    fromStatus?: StringFieldUpdateOperationsInput | string
    toStatus?: StringFieldUpdateOperationsInput | string
    releasedBy?: StringFieldUpdateOperationsInput | string
    releaseNote?: NullableStringFieldUpdateOperationsInput | string | null
    targeting?: NullableJsonNullValueInput | InputJsonValue
    triggeredAt?: DateTimeFieldUpdateOperationsInput | Date | string
    effectiveAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    previousActiveRuleSetId?: NullableStringFieldUpdateOperationsInput | string | null
  }

  export type SemanticRuleTargetingUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleTargetingUncheckedUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleTargetingUncheckedUpdateManyWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    environments?: NullableJsonNullValueInput | InputJsonValue
    hosts?: NullableJsonNullValueInput | InputJsonValue
    tenantIds?: NullableJsonNullValueInput | InputJsonValue
    userIds?: NullableJsonNullValueInput | InputJsonValue
    skillIds?: NullableJsonNullValueInput | InputJsonValue
    pageTypes?: NullableJsonNullValueInput | InputJsonValue
    sampleRate?: NullableFloatFieldUpdateOperationsInput | number | null
    enabled?: BoolFieldUpdateOperationsInput | boolean
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleHitLogUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutHitLogsNestedInput
  }

  export type SemanticRuleHitLogUncheckedUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleHitLogUncheckedUpdateManyWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    matchedRuleIds?: JsonNullValueInput | InputJsonValue
    inputText?: StringFieldUpdateOperationsInput | string
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    availableCandidateIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    usedAiFallback?: BoolFieldUpdateOperationsInput | boolean
    finalExecutionSuccess?: NullableBoolFieldUpdateOperationsInput | boolean | null
    failureReason?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    domain?: SemanticRuleDomainUpdateOneRequiredWithoutErrorLogsNestedInput
  }

  export type SemanticRuleErrorLogUncheckedUpdateWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SemanticRuleErrorLogUncheckedUpdateManyWithoutRuleSetInput = {
    id?: StringFieldUpdateOperationsInput | string
    domainId?: StringFieldUpdateOperationsInput | string
    source?: StringFieldUpdateOperationsInput | string
    errorType?: StringFieldUpdateOperationsInput | string
    errorCode?: NullableStringFieldUpdateOperationsInput | string | null
    errorMessage?: StringFieldUpdateOperationsInput | string
    inputText?: NullableStringFieldUpdateOperationsInput | string | null
    normalizedInput?: NullableStringFieldUpdateOperationsInput | string | null
    traceId?: NullableStringFieldUpdateOperationsInput | string | null
    sessionId?: NullableStringFieldUpdateOperationsInput | string | null
    taskId?: NullableStringFieldUpdateOperationsInput | string | null
    stepId?: NullableStringFieldUpdateOperationsInput | string | null
    pageUrl?: NullableStringFieldUpdateOperationsInput | string | null
    pageTitle?: NullableStringFieldUpdateOperationsInput | string | null
    host?: NullableStringFieldUpdateOperationsInput | string | null
    pageType?: NullableStringFieldUpdateOperationsInput | string | null
    observationSummary?: NullableStringFieldUpdateOperationsInput | string | null
    candidateSummary?: NullableJsonNullValueInput | InputJsonValue
    matchedRuleIds?: NullableJsonNullValueInput | InputJsonValue
    normalizedSemantic?: NullableJsonNullValueInput | InputJsonValue
    parserOutput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackInput?: NullableJsonNullValueInput | InputJsonValue
    aiFallbackOutput?: NullableJsonNullValueInput | InputJsonValue
    screenshotUrl?: NullableStringFieldUpdateOperationsInput | string | null
    domSnippet?: NullableStringFieldUpdateOperationsInput | string | null
    locatorInfo?: NullableJsonNullValueInput | InputJsonValue
    consoleErrors?: NullableJsonNullValueInput | InputJsonValue
    metadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
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