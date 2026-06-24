
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
 * Model Template
 * 
 */
export type Template = $Result.DefaultSelection<Prisma.$TemplatePayload>
/**
 * Model Skill
 * 
 */
export type Skill = $Result.DefaultSelection<Prisma.$SkillPayload>
/**
 * Model RenderOutput
 * 
 */
export type RenderOutput = $Result.DefaultSelection<Prisma.$RenderOutputPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const TemplateFormat: {
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  html: 'html'
};

export type TemplateFormat = (typeof TemplateFormat)[keyof typeof TemplateFormat]


export const TemplateType: {
  template: 'template',
  marked_template: 'marked_template'
};

export type TemplateType = (typeof TemplateType)[keyof typeof TemplateType]

}

export type TemplateFormat = $Enums.TemplateFormat

export const TemplateFormat: typeof $Enums.TemplateFormat

export type TemplateType = $Enums.TemplateType

export const TemplateType: typeof $Enums.TemplateType

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more Templates
 * const templates = await prisma.template.findMany()
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
   * // Fetch zero or more Templates
   * const templates = await prisma.template.findMany()
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
   * `prisma.template`: Exposes CRUD operations for the **Template** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Templates
    * const templates = await prisma.template.findMany()
    * ```
    */
  get template(): Prisma.TemplateDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.skill`: Exposes CRUD operations for the **Skill** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Skills
    * const skills = await prisma.skill.findMany()
    * ```
    */
  get skill(): Prisma.SkillDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.renderOutput`: Exposes CRUD operations for the **RenderOutput** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more RenderOutputs
    * const renderOutputs = await prisma.renderOutput.findMany()
    * ```
    */
  get renderOutput(): Prisma.RenderOutputDelegate<ExtArgs, ClientOptions>;
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
    Template: 'Template',
    Skill: 'Skill',
    RenderOutput: 'RenderOutput'
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
      modelProps: "template" | "skill" | "renderOutput"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      Template: {
        payload: Prisma.$TemplatePayload<ExtArgs>
        fields: Prisma.TemplateFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TemplateFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TemplateFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>
          }
          findFirst: {
            args: Prisma.TemplateFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TemplateFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>
          }
          findMany: {
            args: Prisma.TemplateFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>[]
          }
          create: {
            args: Prisma.TemplateCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>
          }
          createMany: {
            args: Prisma.TemplateCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TemplateCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>[]
          }
          delete: {
            args: Prisma.TemplateDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>
          }
          update: {
            args: Prisma.TemplateUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>
          }
          deleteMany: {
            args: Prisma.TemplateDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TemplateUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TemplateUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>[]
          }
          upsert: {
            args: Prisma.TemplateUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TemplatePayload>
          }
          aggregate: {
            args: Prisma.TemplateAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTemplate>
          }
          groupBy: {
            args: Prisma.TemplateGroupByArgs<ExtArgs>
            result: $Utils.Optional<TemplateGroupByOutputType>[]
          }
          count: {
            args: Prisma.TemplateCountArgs<ExtArgs>
            result: $Utils.Optional<TemplateCountAggregateOutputType> | number
          }
        }
      }
      Skill: {
        payload: Prisma.$SkillPayload<ExtArgs>
        fields: Prisma.SkillFieldRefs
        operations: {
          findUnique: {
            args: Prisma.SkillFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.SkillFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>
          }
          findFirst: {
            args: Prisma.SkillFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.SkillFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>
          }
          findMany: {
            args: Prisma.SkillFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>[]
          }
          create: {
            args: Prisma.SkillCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>
          }
          createMany: {
            args: Prisma.SkillCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.SkillCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>[]
          }
          delete: {
            args: Prisma.SkillDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>
          }
          update: {
            args: Prisma.SkillUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>
          }
          deleteMany: {
            args: Prisma.SkillDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.SkillUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.SkillUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>[]
          }
          upsert: {
            args: Prisma.SkillUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$SkillPayload>
          }
          aggregate: {
            args: Prisma.SkillAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateSkill>
          }
          groupBy: {
            args: Prisma.SkillGroupByArgs<ExtArgs>
            result: $Utils.Optional<SkillGroupByOutputType>[]
          }
          count: {
            args: Prisma.SkillCountArgs<ExtArgs>
            result: $Utils.Optional<SkillCountAggregateOutputType> | number
          }
        }
      }
      RenderOutput: {
        payload: Prisma.$RenderOutputPayload<ExtArgs>
        fields: Prisma.RenderOutputFieldRefs
        operations: {
          findUnique: {
            args: Prisma.RenderOutputFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.RenderOutputFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>
          }
          findFirst: {
            args: Prisma.RenderOutputFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.RenderOutputFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>
          }
          findMany: {
            args: Prisma.RenderOutputFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>[]
          }
          create: {
            args: Prisma.RenderOutputCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>
          }
          createMany: {
            args: Prisma.RenderOutputCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.RenderOutputCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>[]
          }
          delete: {
            args: Prisma.RenderOutputDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>
          }
          update: {
            args: Prisma.RenderOutputUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>
          }
          deleteMany: {
            args: Prisma.RenderOutputDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.RenderOutputUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.RenderOutputUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>[]
          }
          upsert: {
            args: Prisma.RenderOutputUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$RenderOutputPayload>
          }
          aggregate: {
            args: Prisma.RenderOutputAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateRenderOutput>
          }
          groupBy: {
            args: Prisma.RenderOutputGroupByArgs<ExtArgs>
            result: $Utils.Optional<RenderOutputGroupByOutputType>[]
          }
          count: {
            args: Prisma.RenderOutputCountArgs<ExtArgs>
            result: $Utils.Optional<RenderOutputCountAggregateOutputType> | number
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
    template?: TemplateOmit
    skill?: SkillOmit
    renderOutput?: RenderOutputOmit
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
   * Count Type TemplateCountOutputType
   */

  export type TemplateCountOutputType = {
    markedCopies: number
    renderOutputs: number
    markedRenderOutputs: number
  }

  export type TemplateCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    markedCopies?: boolean | TemplateCountOutputTypeCountMarkedCopiesArgs
    renderOutputs?: boolean | TemplateCountOutputTypeCountRenderOutputsArgs
    markedRenderOutputs?: boolean | TemplateCountOutputTypeCountMarkedRenderOutputsArgs
  }

  // Custom InputTypes
  /**
   * TemplateCountOutputType without action
   */
  export type TemplateCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TemplateCountOutputType
     */
    select?: TemplateCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * TemplateCountOutputType without action
   */
  export type TemplateCountOutputTypeCountMarkedCopiesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TemplateWhereInput
  }

  /**
   * TemplateCountOutputType without action
   */
  export type TemplateCountOutputTypeCountRenderOutputsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RenderOutputWhereInput
  }

  /**
   * TemplateCountOutputType without action
   */
  export type TemplateCountOutputTypeCountMarkedRenderOutputsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RenderOutputWhereInput
  }


  /**
   * Count Type SkillCountOutputType
   */

  export type SkillCountOutputType = {
    renderOutputs: number
  }

  export type SkillCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    renderOutputs?: boolean | SkillCountOutputTypeCountRenderOutputsArgs
  }

  // Custom InputTypes
  /**
   * SkillCountOutputType without action
   */
  export type SkillCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the SkillCountOutputType
     */
    select?: SkillCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * SkillCountOutputType without action
   */
  export type SkillCountOutputTypeCountRenderOutputsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RenderOutputWhereInput
  }


  /**
   * Models
   */

  /**
   * Model Template
   */

  export type AggregateTemplate = {
    _count: TemplateCountAggregateOutputType | null
    _avg: TemplateAvgAggregateOutputType | null
    _sum: TemplateSumAggregateOutputType | null
    _min: TemplateMinAggregateOutputType | null
    _max: TemplateMaxAggregateOutputType | null
  }

  export type TemplateAvgAggregateOutputType = {
    size: number | null
  }

  export type TemplateSumAggregateOutputType = {
    size: number | null
  }

  export type TemplateMinAggregateOutputType = {
    id: string | null
    type: $Enums.TemplateType | null
    originalId: string | null
    fileName: string | null
    filePath: string | null
    format: $Enums.TemplateFormat | null
    size: number | null
    markingsSavedAt: Date | null
    configSavedAt: Date | null
    hasValidFile: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TemplateMaxAggregateOutputType = {
    id: string | null
    type: $Enums.TemplateType | null
    originalId: string | null
    fileName: string | null
    filePath: string | null
    format: $Enums.TemplateFormat | null
    size: number | null
    markingsSavedAt: Date | null
    configSavedAt: Date | null
    hasValidFile: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TemplateCountAggregateOutputType = {
    id: number
    type: number
    originalId: number
    fileName: number
    filePath: number
    format: number
    size: number
    variables: number
    loops: number
    markings: number
    ignoredElements: number
    elementGroups: number
    ignoredGroups: number
    markingsSavedAt: number
    templateConfig: number
    configSavedAt: number
    suggestions: number
    verifyResult: number
    hasValidFile: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type TemplateAvgAggregateInputType = {
    size?: true
  }

  export type TemplateSumAggregateInputType = {
    size?: true
  }

  export type TemplateMinAggregateInputType = {
    id?: true
    type?: true
    originalId?: true
    fileName?: true
    filePath?: true
    format?: true
    size?: true
    markingsSavedAt?: true
    configSavedAt?: true
    hasValidFile?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TemplateMaxAggregateInputType = {
    id?: true
    type?: true
    originalId?: true
    fileName?: true
    filePath?: true
    format?: true
    size?: true
    markingsSavedAt?: true
    configSavedAt?: true
    hasValidFile?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TemplateCountAggregateInputType = {
    id?: true
    type?: true
    originalId?: true
    fileName?: true
    filePath?: true
    format?: true
    size?: true
    variables?: true
    loops?: true
    markings?: true
    ignoredElements?: true
    elementGroups?: true
    ignoredGroups?: true
    markingsSavedAt?: true
    templateConfig?: true
    configSavedAt?: true
    suggestions?: true
    verifyResult?: true
    hasValidFile?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type TemplateAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Template to aggregate.
     */
    where?: TemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Templates to fetch.
     */
    orderBy?: TemplateOrderByWithRelationInput | TemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Templates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Templates.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Templates
    **/
    _count?: true | TemplateCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TemplateAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TemplateSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TemplateMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TemplateMaxAggregateInputType
  }

  export type GetTemplateAggregateType<T extends TemplateAggregateArgs> = {
        [P in keyof T & keyof AggregateTemplate]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTemplate[P]>
      : GetScalarType<T[P], AggregateTemplate[P]>
  }




  export type TemplateGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TemplateWhereInput
    orderBy?: TemplateOrderByWithAggregationInput | TemplateOrderByWithAggregationInput[]
    by: TemplateScalarFieldEnum[] | TemplateScalarFieldEnum
    having?: TemplateScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TemplateCountAggregateInputType | true
    _avg?: TemplateAvgAggregateInputType
    _sum?: TemplateSumAggregateInputType
    _min?: TemplateMinAggregateInputType
    _max?: TemplateMaxAggregateInputType
  }

  export type TemplateGroupByOutputType = {
    id: string
    type: $Enums.TemplateType
    originalId: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size: number | null
    variables: string[]
    loops: JsonValue
    markings: JsonValue | null
    ignoredElements: JsonValue | null
    elementGroups: JsonValue | null
    ignoredGroups: JsonValue | null
    markingsSavedAt: Date | null
    templateConfig: JsonValue | null
    configSavedAt: Date | null
    suggestions: JsonValue | null
    verifyResult: JsonValue | null
    hasValidFile: boolean | null
    createdAt: Date
    updatedAt: Date
    _count: TemplateCountAggregateOutputType | null
    _avg: TemplateAvgAggregateOutputType | null
    _sum: TemplateSumAggregateOutputType | null
    _min: TemplateMinAggregateOutputType | null
    _max: TemplateMaxAggregateOutputType | null
  }

  type GetTemplateGroupByPayload<T extends TemplateGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TemplateGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TemplateGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TemplateGroupByOutputType[P]>
            : GetScalarType<T[P], TemplateGroupByOutputType[P]>
        }
      >
    >


  export type TemplateSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    originalId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    variables?: boolean
    loops?: boolean
    markings?: boolean
    ignoredElements?: boolean
    elementGroups?: boolean
    ignoredGroups?: boolean
    markingsSavedAt?: boolean
    templateConfig?: boolean
    configSavedAt?: boolean
    suggestions?: boolean
    verifyResult?: boolean
    hasValidFile?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    original?: boolean | Template$originalArgs<ExtArgs>
    markedCopies?: boolean | Template$markedCopiesArgs<ExtArgs>
    skill?: boolean | Template$skillArgs<ExtArgs>
    renderOutputs?: boolean | Template$renderOutputsArgs<ExtArgs>
    markedRenderOutputs?: boolean | Template$markedRenderOutputsArgs<ExtArgs>
    _count?: boolean | TemplateCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["template"]>

  export type TemplateSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    originalId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    variables?: boolean
    loops?: boolean
    markings?: boolean
    ignoredElements?: boolean
    elementGroups?: boolean
    ignoredGroups?: boolean
    markingsSavedAt?: boolean
    templateConfig?: boolean
    configSavedAt?: boolean
    suggestions?: boolean
    verifyResult?: boolean
    hasValidFile?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    original?: boolean | Template$originalArgs<ExtArgs>
  }, ExtArgs["result"]["template"]>

  export type TemplateSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    type?: boolean
    originalId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    variables?: boolean
    loops?: boolean
    markings?: boolean
    ignoredElements?: boolean
    elementGroups?: boolean
    ignoredGroups?: boolean
    markingsSavedAt?: boolean
    templateConfig?: boolean
    configSavedAt?: boolean
    suggestions?: boolean
    verifyResult?: boolean
    hasValidFile?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    original?: boolean | Template$originalArgs<ExtArgs>
  }, ExtArgs["result"]["template"]>

  export type TemplateSelectScalar = {
    id?: boolean
    type?: boolean
    originalId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    variables?: boolean
    loops?: boolean
    markings?: boolean
    ignoredElements?: boolean
    elementGroups?: boolean
    ignoredGroups?: boolean
    markingsSavedAt?: boolean
    templateConfig?: boolean
    configSavedAt?: boolean
    suggestions?: boolean
    verifyResult?: boolean
    hasValidFile?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type TemplateOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "type" | "originalId" | "fileName" | "filePath" | "format" | "size" | "variables" | "loops" | "markings" | "ignoredElements" | "elementGroups" | "ignoredGroups" | "markingsSavedAt" | "templateConfig" | "configSavedAt" | "suggestions" | "verifyResult" | "hasValidFile" | "createdAt" | "updatedAt", ExtArgs["result"]["template"]>
  export type TemplateInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    original?: boolean | Template$originalArgs<ExtArgs>
    markedCopies?: boolean | Template$markedCopiesArgs<ExtArgs>
    skill?: boolean | Template$skillArgs<ExtArgs>
    renderOutputs?: boolean | Template$renderOutputsArgs<ExtArgs>
    markedRenderOutputs?: boolean | Template$markedRenderOutputsArgs<ExtArgs>
    _count?: boolean | TemplateCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type TemplateIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    original?: boolean | Template$originalArgs<ExtArgs>
  }
  export type TemplateIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    original?: boolean | Template$originalArgs<ExtArgs>
  }

  export type $TemplatePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Template"
    objects: {
      original: Prisma.$TemplatePayload<ExtArgs> | null
      markedCopies: Prisma.$TemplatePayload<ExtArgs>[]
      skill: Prisma.$SkillPayload<ExtArgs> | null
      renderOutputs: Prisma.$RenderOutputPayload<ExtArgs>[]
      markedRenderOutputs: Prisma.$RenderOutputPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      type: $Enums.TemplateType
      originalId: string | null
      fileName: string
      filePath: string
      format: $Enums.TemplateFormat
      size: number | null
      variables: string[]
      loops: Prisma.JsonValue
      markings: Prisma.JsonValue | null
      ignoredElements: Prisma.JsonValue | null
      elementGroups: Prisma.JsonValue | null
      ignoredGroups: Prisma.JsonValue | null
      markingsSavedAt: Date | null
      templateConfig: Prisma.JsonValue | null
      configSavedAt: Date | null
      suggestions: Prisma.JsonValue | null
      verifyResult: Prisma.JsonValue | null
      hasValidFile: boolean | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["template"]>
    composites: {}
  }

  type TemplateGetPayload<S extends boolean | null | undefined | TemplateDefaultArgs> = $Result.GetResult<Prisma.$TemplatePayload, S>

  type TemplateCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TemplateFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TemplateCountAggregateInputType | true
    }

  export interface TemplateDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Template'], meta: { name: 'Template' } }
    /**
     * Find zero or one Template that matches the filter.
     * @param {TemplateFindUniqueArgs} args - Arguments to find a Template
     * @example
     * // Get one Template
     * const template = await prisma.template.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TemplateFindUniqueArgs>(args: SelectSubset<T, TemplateFindUniqueArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Template that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TemplateFindUniqueOrThrowArgs} args - Arguments to find a Template
     * @example
     * // Get one Template
     * const template = await prisma.template.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TemplateFindUniqueOrThrowArgs>(args: SelectSubset<T, TemplateFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Template that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateFindFirstArgs} args - Arguments to find a Template
     * @example
     * // Get one Template
     * const template = await prisma.template.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TemplateFindFirstArgs>(args?: SelectSubset<T, TemplateFindFirstArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Template that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateFindFirstOrThrowArgs} args - Arguments to find a Template
     * @example
     * // Get one Template
     * const template = await prisma.template.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TemplateFindFirstOrThrowArgs>(args?: SelectSubset<T, TemplateFindFirstOrThrowArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Templates that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Templates
     * const templates = await prisma.template.findMany()
     * 
     * // Get first 10 Templates
     * const templates = await prisma.template.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const templateWithIdOnly = await prisma.template.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TemplateFindManyArgs>(args?: SelectSubset<T, TemplateFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Template.
     * @param {TemplateCreateArgs} args - Arguments to create a Template.
     * @example
     * // Create one Template
     * const Template = await prisma.template.create({
     *   data: {
     *     // ... data to create a Template
     *   }
     * })
     * 
     */
    create<T extends TemplateCreateArgs>(args: SelectSubset<T, TemplateCreateArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Templates.
     * @param {TemplateCreateManyArgs} args - Arguments to create many Templates.
     * @example
     * // Create many Templates
     * const template = await prisma.template.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TemplateCreateManyArgs>(args?: SelectSubset<T, TemplateCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Templates and returns the data saved in the database.
     * @param {TemplateCreateManyAndReturnArgs} args - Arguments to create many Templates.
     * @example
     * // Create many Templates
     * const template = await prisma.template.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Templates and only return the `id`
     * const templateWithIdOnly = await prisma.template.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TemplateCreateManyAndReturnArgs>(args?: SelectSubset<T, TemplateCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Template.
     * @param {TemplateDeleteArgs} args - Arguments to delete one Template.
     * @example
     * // Delete one Template
     * const Template = await prisma.template.delete({
     *   where: {
     *     // ... filter to delete one Template
     *   }
     * })
     * 
     */
    delete<T extends TemplateDeleteArgs>(args: SelectSubset<T, TemplateDeleteArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Template.
     * @param {TemplateUpdateArgs} args - Arguments to update one Template.
     * @example
     * // Update one Template
     * const template = await prisma.template.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TemplateUpdateArgs>(args: SelectSubset<T, TemplateUpdateArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Templates.
     * @param {TemplateDeleteManyArgs} args - Arguments to filter Templates to delete.
     * @example
     * // Delete a few Templates
     * const { count } = await prisma.template.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TemplateDeleteManyArgs>(args?: SelectSubset<T, TemplateDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Templates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Templates
     * const template = await prisma.template.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TemplateUpdateManyArgs>(args: SelectSubset<T, TemplateUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Templates and returns the data updated in the database.
     * @param {TemplateUpdateManyAndReturnArgs} args - Arguments to update many Templates.
     * @example
     * // Update many Templates
     * const template = await prisma.template.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Templates and only return the `id`
     * const templateWithIdOnly = await prisma.template.updateManyAndReturn({
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
    updateManyAndReturn<T extends TemplateUpdateManyAndReturnArgs>(args: SelectSubset<T, TemplateUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Template.
     * @param {TemplateUpsertArgs} args - Arguments to update or create a Template.
     * @example
     * // Update or create a Template
     * const template = await prisma.template.upsert({
     *   create: {
     *     // ... data to create a Template
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Template we want to update
     *   }
     * })
     */
    upsert<T extends TemplateUpsertArgs>(args: SelectSubset<T, TemplateUpsertArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Templates.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateCountArgs} args - Arguments to filter Templates to count.
     * @example
     * // Count the number of Templates
     * const count = await prisma.template.count({
     *   where: {
     *     // ... the filter for the Templates we want to count
     *   }
     * })
    **/
    count<T extends TemplateCountArgs>(
      args?: Subset<T, TemplateCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TemplateCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Template.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends TemplateAggregateArgs>(args: Subset<T, TemplateAggregateArgs>): Prisma.PrismaPromise<GetTemplateAggregateType<T>>

    /**
     * Group by Template.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TemplateGroupByArgs} args - Group by arguments.
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
      T extends TemplateGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TemplateGroupByArgs['orderBy'] }
        : { orderBy?: TemplateGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, TemplateGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTemplateGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Template model
   */
  readonly fields: TemplateFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Template.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TemplateClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    original<T extends Template$originalArgs<ExtArgs> = {}>(args?: Subset<T, Template$originalArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    markedCopies<T extends Template$markedCopiesArgs<ExtArgs> = {}>(args?: Subset<T, Template$markedCopiesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    skill<T extends Template$skillArgs<ExtArgs> = {}>(args?: Subset<T, Template$skillArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    renderOutputs<T extends Template$renderOutputsArgs<ExtArgs> = {}>(args?: Subset<T, Template$renderOutputsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    markedRenderOutputs<T extends Template$markedRenderOutputsArgs<ExtArgs> = {}>(args?: Subset<T, Template$markedRenderOutputsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
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
   * Fields of the Template model
   */
  interface TemplateFieldRefs {
    readonly id: FieldRef<"Template", 'String'>
    readonly type: FieldRef<"Template", 'TemplateType'>
    readonly originalId: FieldRef<"Template", 'String'>
    readonly fileName: FieldRef<"Template", 'String'>
    readonly filePath: FieldRef<"Template", 'String'>
    readonly format: FieldRef<"Template", 'TemplateFormat'>
    readonly size: FieldRef<"Template", 'Int'>
    readonly variables: FieldRef<"Template", 'String[]'>
    readonly loops: FieldRef<"Template", 'Json'>
    readonly markings: FieldRef<"Template", 'Json'>
    readonly ignoredElements: FieldRef<"Template", 'Json'>
    readonly elementGroups: FieldRef<"Template", 'Json'>
    readonly ignoredGroups: FieldRef<"Template", 'Json'>
    readonly markingsSavedAt: FieldRef<"Template", 'DateTime'>
    readonly templateConfig: FieldRef<"Template", 'Json'>
    readonly configSavedAt: FieldRef<"Template", 'DateTime'>
    readonly suggestions: FieldRef<"Template", 'Json'>
    readonly verifyResult: FieldRef<"Template", 'Json'>
    readonly hasValidFile: FieldRef<"Template", 'Boolean'>
    readonly createdAt: FieldRef<"Template", 'DateTime'>
    readonly updatedAt: FieldRef<"Template", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Template findUnique
   */
  export type TemplateFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * Filter, which Template to fetch.
     */
    where: TemplateWhereUniqueInput
  }

  /**
   * Template findUniqueOrThrow
   */
  export type TemplateFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * Filter, which Template to fetch.
     */
    where: TemplateWhereUniqueInput
  }

  /**
   * Template findFirst
   */
  export type TemplateFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * Filter, which Template to fetch.
     */
    where?: TemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Templates to fetch.
     */
    orderBy?: TemplateOrderByWithRelationInput | TemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Templates.
     */
    cursor?: TemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Templates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Templates.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Templates.
     */
    distinct?: TemplateScalarFieldEnum | TemplateScalarFieldEnum[]
  }

  /**
   * Template findFirstOrThrow
   */
  export type TemplateFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * Filter, which Template to fetch.
     */
    where?: TemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Templates to fetch.
     */
    orderBy?: TemplateOrderByWithRelationInput | TemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Templates.
     */
    cursor?: TemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Templates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Templates.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Templates.
     */
    distinct?: TemplateScalarFieldEnum | TemplateScalarFieldEnum[]
  }

  /**
   * Template findMany
   */
  export type TemplateFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * Filter, which Templates to fetch.
     */
    where?: TemplateWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Templates to fetch.
     */
    orderBy?: TemplateOrderByWithRelationInput | TemplateOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Templates.
     */
    cursor?: TemplateWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Templates from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Templates.
     */
    skip?: number
    distinct?: TemplateScalarFieldEnum | TemplateScalarFieldEnum[]
  }

  /**
   * Template create
   */
  export type TemplateCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * The data needed to create a Template.
     */
    data: XOR<TemplateCreateInput, TemplateUncheckedCreateInput>
  }

  /**
   * Template createMany
   */
  export type TemplateCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Templates.
     */
    data: TemplateCreateManyInput | TemplateCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Template createManyAndReturn
   */
  export type TemplateCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * The data used to create many Templates.
     */
    data: TemplateCreateManyInput | TemplateCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Template update
   */
  export type TemplateUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * The data needed to update a Template.
     */
    data: XOR<TemplateUpdateInput, TemplateUncheckedUpdateInput>
    /**
     * Choose, which Template to update.
     */
    where: TemplateWhereUniqueInput
  }

  /**
   * Template updateMany
   */
  export type TemplateUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Templates.
     */
    data: XOR<TemplateUpdateManyMutationInput, TemplateUncheckedUpdateManyInput>
    /**
     * Filter which Templates to update
     */
    where?: TemplateWhereInput
    /**
     * Limit how many Templates to update.
     */
    limit?: number
  }

  /**
   * Template updateManyAndReturn
   */
  export type TemplateUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * The data used to update Templates.
     */
    data: XOR<TemplateUpdateManyMutationInput, TemplateUncheckedUpdateManyInput>
    /**
     * Filter which Templates to update
     */
    where?: TemplateWhereInput
    /**
     * Limit how many Templates to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Template upsert
   */
  export type TemplateUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * The filter to search for the Template to update in case it exists.
     */
    where: TemplateWhereUniqueInput
    /**
     * In case the Template found by the `where` argument doesn't exist, create a new Template with this data.
     */
    create: XOR<TemplateCreateInput, TemplateUncheckedCreateInput>
    /**
     * In case the Template was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TemplateUpdateInput, TemplateUncheckedUpdateInput>
  }

  /**
   * Template delete
   */
  export type TemplateDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    /**
     * Filter which Template to delete.
     */
    where: TemplateWhereUniqueInput
  }

  /**
   * Template deleteMany
   */
  export type TemplateDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Templates to delete
     */
    where?: TemplateWhereInput
    /**
     * Limit how many Templates to delete.
     */
    limit?: number
  }

  /**
   * Template.original
   */
  export type Template$originalArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    where?: TemplateWhereInput
  }

  /**
   * Template.markedCopies
   */
  export type Template$markedCopiesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    where?: TemplateWhereInput
    orderBy?: TemplateOrderByWithRelationInput | TemplateOrderByWithRelationInput[]
    cursor?: TemplateWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TemplateScalarFieldEnum | TemplateScalarFieldEnum[]
  }

  /**
   * Template.skill
   */
  export type Template$skillArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    where?: SkillWhereInput
  }

  /**
   * Template.renderOutputs
   */
  export type Template$renderOutputsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    where?: RenderOutputWhereInput
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    cursor?: RenderOutputWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RenderOutputScalarFieldEnum | RenderOutputScalarFieldEnum[]
  }

  /**
   * Template.markedRenderOutputs
   */
  export type Template$markedRenderOutputsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    where?: RenderOutputWhereInput
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    cursor?: RenderOutputWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RenderOutputScalarFieldEnum | RenderOutputScalarFieldEnum[]
  }

  /**
   * Template without action
   */
  export type TemplateDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
  }


  /**
   * Model Skill
   */

  export type AggregateSkill = {
    _count: SkillCountAggregateOutputType | null
    _min: SkillMinAggregateOutputType | null
    _max: SkillMaxAggregateOutputType | null
  }

  export type SkillMinAggregateOutputType = {
    id: string | null
    templateId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SkillMaxAggregateOutputType = {
    id: string | null
    templateId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type SkillCountAggregateOutputType = {
    id: number
    templateId: number
    parameters: number
    dataExample: number
    rawSkill: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type SkillMinAggregateInputType = {
    id?: true
    templateId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SkillMaxAggregateInputType = {
    id?: true
    templateId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type SkillCountAggregateInputType = {
    id?: true
    templateId?: true
    parameters?: true
    dataExample?: true
    rawSkill?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type SkillAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Skill to aggregate.
     */
    where?: SkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Skills to fetch.
     */
    orderBy?: SkillOrderByWithRelationInput | SkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: SkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Skills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Skills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Skills
    **/
    _count?: true | SkillCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: SkillMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: SkillMaxAggregateInputType
  }

  export type GetSkillAggregateType<T extends SkillAggregateArgs> = {
        [P in keyof T & keyof AggregateSkill]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSkill[P]>
      : GetScalarType<T[P], AggregateSkill[P]>
  }




  export type SkillGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: SkillWhereInput
    orderBy?: SkillOrderByWithAggregationInput | SkillOrderByWithAggregationInput[]
    by: SkillScalarFieldEnum[] | SkillScalarFieldEnum
    having?: SkillScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: SkillCountAggregateInputType | true
    _min?: SkillMinAggregateInputType
    _max?: SkillMaxAggregateInputType
  }

  export type SkillGroupByOutputType = {
    id: string
    templateId: string
    parameters: JsonValue
    dataExample: JsonValue | null
    rawSkill: JsonValue | null
    createdAt: Date
    updatedAt: Date
    _count: SkillCountAggregateOutputType | null
    _min: SkillMinAggregateOutputType | null
    _max: SkillMaxAggregateOutputType | null
  }

  type GetSkillGroupByPayload<T extends SkillGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SkillGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof SkillGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], SkillGroupByOutputType[P]>
            : GetScalarType<T[P], SkillGroupByOutputType[P]>
        }
      >
    >


  export type SkillSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    templateId?: boolean
    parameters?: boolean
    dataExample?: boolean
    rawSkill?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    template?: boolean | TemplateDefaultArgs<ExtArgs>
    renderOutputs?: boolean | Skill$renderOutputsArgs<ExtArgs>
    _count?: boolean | SkillCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["skill"]>

  export type SkillSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    templateId?: boolean
    parameters?: boolean
    dataExample?: boolean
    rawSkill?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    template?: boolean | TemplateDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["skill"]>

  export type SkillSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    templateId?: boolean
    parameters?: boolean
    dataExample?: boolean
    rawSkill?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    template?: boolean | TemplateDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["skill"]>

  export type SkillSelectScalar = {
    id?: boolean
    templateId?: boolean
    parameters?: boolean
    dataExample?: boolean
    rawSkill?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type SkillOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "templateId" | "parameters" | "dataExample" | "rawSkill" | "createdAt" | "updatedAt", ExtArgs["result"]["skill"]>
  export type SkillInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    template?: boolean | TemplateDefaultArgs<ExtArgs>
    renderOutputs?: boolean | Skill$renderOutputsArgs<ExtArgs>
    _count?: boolean | SkillCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type SkillIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    template?: boolean | TemplateDefaultArgs<ExtArgs>
  }
  export type SkillIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    template?: boolean | TemplateDefaultArgs<ExtArgs>
  }

  export type $SkillPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Skill"
    objects: {
      template: Prisma.$TemplatePayload<ExtArgs>
      renderOutputs: Prisma.$RenderOutputPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      templateId: string
      parameters: Prisma.JsonValue
      dataExample: Prisma.JsonValue | null
      rawSkill: Prisma.JsonValue | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["skill"]>
    composites: {}
  }

  type SkillGetPayload<S extends boolean | null | undefined | SkillDefaultArgs> = $Result.GetResult<Prisma.$SkillPayload, S>

  type SkillCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SkillFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: SkillCountAggregateInputType | true
    }

  export interface SkillDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Skill'], meta: { name: 'Skill' } }
    /**
     * Find zero or one Skill that matches the filter.
     * @param {SkillFindUniqueArgs} args - Arguments to find a Skill
     * @example
     * // Get one Skill
     * const skill = await prisma.skill.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SkillFindUniqueArgs>(args: SelectSubset<T, SkillFindUniqueArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Skill that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SkillFindUniqueOrThrowArgs} args - Arguments to find a Skill
     * @example
     * // Get one Skill
     * const skill = await prisma.skill.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SkillFindUniqueOrThrowArgs>(args: SelectSubset<T, SkillFindUniqueOrThrowArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Skill that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillFindFirstArgs} args - Arguments to find a Skill
     * @example
     * // Get one Skill
     * const skill = await prisma.skill.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SkillFindFirstArgs>(args?: SelectSubset<T, SkillFindFirstArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Skill that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillFindFirstOrThrowArgs} args - Arguments to find a Skill
     * @example
     * // Get one Skill
     * const skill = await prisma.skill.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SkillFindFirstOrThrowArgs>(args?: SelectSubset<T, SkillFindFirstOrThrowArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Skills that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Skills
     * const skills = await prisma.skill.findMany()
     * 
     * // Get first 10 Skills
     * const skills = await prisma.skill.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const skillWithIdOnly = await prisma.skill.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends SkillFindManyArgs>(args?: SelectSubset<T, SkillFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Skill.
     * @param {SkillCreateArgs} args - Arguments to create a Skill.
     * @example
     * // Create one Skill
     * const Skill = await prisma.skill.create({
     *   data: {
     *     // ... data to create a Skill
     *   }
     * })
     * 
     */
    create<T extends SkillCreateArgs>(args: SelectSubset<T, SkillCreateArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Skills.
     * @param {SkillCreateManyArgs} args - Arguments to create many Skills.
     * @example
     * // Create many Skills
     * const skill = await prisma.skill.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends SkillCreateManyArgs>(args?: SelectSubset<T, SkillCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Skills and returns the data saved in the database.
     * @param {SkillCreateManyAndReturnArgs} args - Arguments to create many Skills.
     * @example
     * // Create many Skills
     * const skill = await prisma.skill.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Skills and only return the `id`
     * const skillWithIdOnly = await prisma.skill.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends SkillCreateManyAndReturnArgs>(args?: SelectSubset<T, SkillCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Skill.
     * @param {SkillDeleteArgs} args - Arguments to delete one Skill.
     * @example
     * // Delete one Skill
     * const Skill = await prisma.skill.delete({
     *   where: {
     *     // ... filter to delete one Skill
     *   }
     * })
     * 
     */
    delete<T extends SkillDeleteArgs>(args: SelectSubset<T, SkillDeleteArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Skill.
     * @param {SkillUpdateArgs} args - Arguments to update one Skill.
     * @example
     * // Update one Skill
     * const skill = await prisma.skill.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends SkillUpdateArgs>(args: SelectSubset<T, SkillUpdateArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Skills.
     * @param {SkillDeleteManyArgs} args - Arguments to filter Skills to delete.
     * @example
     * // Delete a few Skills
     * const { count } = await prisma.skill.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends SkillDeleteManyArgs>(args?: SelectSubset<T, SkillDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Skills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Skills
     * const skill = await prisma.skill.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends SkillUpdateManyArgs>(args: SelectSubset<T, SkillUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Skills and returns the data updated in the database.
     * @param {SkillUpdateManyAndReturnArgs} args - Arguments to update many Skills.
     * @example
     * // Update many Skills
     * const skill = await prisma.skill.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Skills and only return the `id`
     * const skillWithIdOnly = await prisma.skill.updateManyAndReturn({
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
    updateManyAndReturn<T extends SkillUpdateManyAndReturnArgs>(args: SelectSubset<T, SkillUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Skill.
     * @param {SkillUpsertArgs} args - Arguments to update or create a Skill.
     * @example
     * // Update or create a Skill
     * const skill = await prisma.skill.upsert({
     *   create: {
     *     // ... data to create a Skill
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Skill we want to update
     *   }
     * })
     */
    upsert<T extends SkillUpsertArgs>(args: SelectSubset<T, SkillUpsertArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Skills.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillCountArgs} args - Arguments to filter Skills to count.
     * @example
     * // Count the number of Skills
     * const count = await prisma.skill.count({
     *   where: {
     *     // ... the filter for the Skills we want to count
     *   }
     * })
    **/
    count<T extends SkillCountArgs>(
      args?: Subset<T, SkillCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], SkillCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Skill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SkillAggregateArgs>(args: Subset<T, SkillAggregateArgs>): Prisma.PrismaPromise<GetSkillAggregateType<T>>

    /**
     * Group by Skill.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SkillGroupByArgs} args - Group by arguments.
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
      T extends SkillGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SkillGroupByArgs['orderBy'] }
        : { orderBy?: SkillGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, SkillGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetSkillGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Skill model
   */
  readonly fields: SkillFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Skill.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SkillClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    template<T extends TemplateDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TemplateDefaultArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    renderOutputs<T extends Skill$renderOutputsArgs<ExtArgs> = {}>(args?: Subset<T, Skill$renderOutputsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
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
   * Fields of the Skill model
   */
  interface SkillFieldRefs {
    readonly id: FieldRef<"Skill", 'String'>
    readonly templateId: FieldRef<"Skill", 'String'>
    readonly parameters: FieldRef<"Skill", 'Json'>
    readonly dataExample: FieldRef<"Skill", 'Json'>
    readonly rawSkill: FieldRef<"Skill", 'Json'>
    readonly createdAt: FieldRef<"Skill", 'DateTime'>
    readonly updatedAt: FieldRef<"Skill", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Skill findUnique
   */
  export type SkillFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * Filter, which Skill to fetch.
     */
    where: SkillWhereUniqueInput
  }

  /**
   * Skill findUniqueOrThrow
   */
  export type SkillFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * Filter, which Skill to fetch.
     */
    where: SkillWhereUniqueInput
  }

  /**
   * Skill findFirst
   */
  export type SkillFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * Filter, which Skill to fetch.
     */
    where?: SkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Skills to fetch.
     */
    orderBy?: SkillOrderByWithRelationInput | SkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Skills.
     */
    cursor?: SkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Skills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Skills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Skills.
     */
    distinct?: SkillScalarFieldEnum | SkillScalarFieldEnum[]
  }

  /**
   * Skill findFirstOrThrow
   */
  export type SkillFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * Filter, which Skill to fetch.
     */
    where?: SkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Skills to fetch.
     */
    orderBy?: SkillOrderByWithRelationInput | SkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Skills.
     */
    cursor?: SkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Skills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Skills.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Skills.
     */
    distinct?: SkillScalarFieldEnum | SkillScalarFieldEnum[]
  }

  /**
   * Skill findMany
   */
  export type SkillFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * Filter, which Skills to fetch.
     */
    where?: SkillWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Skills to fetch.
     */
    orderBy?: SkillOrderByWithRelationInput | SkillOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Skills.
     */
    cursor?: SkillWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Skills from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Skills.
     */
    skip?: number
    distinct?: SkillScalarFieldEnum | SkillScalarFieldEnum[]
  }

  /**
   * Skill create
   */
  export type SkillCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * The data needed to create a Skill.
     */
    data: XOR<SkillCreateInput, SkillUncheckedCreateInput>
  }

  /**
   * Skill createMany
   */
  export type SkillCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Skills.
     */
    data: SkillCreateManyInput | SkillCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Skill createManyAndReturn
   */
  export type SkillCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * The data used to create many Skills.
     */
    data: SkillCreateManyInput | SkillCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Skill update
   */
  export type SkillUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * The data needed to update a Skill.
     */
    data: XOR<SkillUpdateInput, SkillUncheckedUpdateInput>
    /**
     * Choose, which Skill to update.
     */
    where: SkillWhereUniqueInput
  }

  /**
   * Skill updateMany
   */
  export type SkillUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Skills.
     */
    data: XOR<SkillUpdateManyMutationInput, SkillUncheckedUpdateManyInput>
    /**
     * Filter which Skills to update
     */
    where?: SkillWhereInput
    /**
     * Limit how many Skills to update.
     */
    limit?: number
  }

  /**
   * Skill updateManyAndReturn
   */
  export type SkillUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * The data used to update Skills.
     */
    data: XOR<SkillUpdateManyMutationInput, SkillUncheckedUpdateManyInput>
    /**
     * Filter which Skills to update
     */
    where?: SkillWhereInput
    /**
     * Limit how many Skills to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Skill upsert
   */
  export type SkillUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * The filter to search for the Skill to update in case it exists.
     */
    where: SkillWhereUniqueInput
    /**
     * In case the Skill found by the `where` argument doesn't exist, create a new Skill with this data.
     */
    create: XOR<SkillCreateInput, SkillUncheckedCreateInput>
    /**
     * In case the Skill was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SkillUpdateInput, SkillUncheckedUpdateInput>
  }

  /**
   * Skill delete
   */
  export type SkillDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    /**
     * Filter which Skill to delete.
     */
    where: SkillWhereUniqueInput
  }

  /**
   * Skill deleteMany
   */
  export type SkillDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Skills to delete
     */
    where?: SkillWhereInput
    /**
     * Limit how many Skills to delete.
     */
    limit?: number
  }

  /**
   * Skill.renderOutputs
   */
  export type Skill$renderOutputsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    where?: RenderOutputWhereInput
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    cursor?: RenderOutputWhereUniqueInput
    take?: number
    skip?: number
    distinct?: RenderOutputScalarFieldEnum | RenderOutputScalarFieldEnum[]
  }

  /**
   * Skill without action
   */
  export type SkillDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
  }


  /**
   * Model RenderOutput
   */

  export type AggregateRenderOutput = {
    _count: RenderOutputCountAggregateOutputType | null
    _avg: RenderOutputAvgAggregateOutputType | null
    _sum: RenderOutputSumAggregateOutputType | null
    _min: RenderOutputMinAggregateOutputType | null
    _max: RenderOutputMaxAggregateOutputType | null
  }

  export type RenderOutputAvgAggregateOutputType = {
    size: number | null
  }

  export type RenderOutputSumAggregateOutputType = {
    size: number | null
  }

  export type RenderOutputMinAggregateOutputType = {
    id: string | null
    templateId: string | null
    markedTemplateId: string | null
    skillId: string | null
    fileName: string | null
    filePath: string | null
    format: $Enums.TemplateFormat | null
    size: number | null
    renderedAt: Date | null
    expiresAt: Date | null
  }

  export type RenderOutputMaxAggregateOutputType = {
    id: string | null
    templateId: string | null
    markedTemplateId: string | null
    skillId: string | null
    fileName: string | null
    filePath: string | null
    format: $Enums.TemplateFormat | null
    size: number | null
    renderedAt: Date | null
    expiresAt: Date | null
  }

  export type RenderOutputCountAggregateOutputType = {
    id: number
    templateId: number
    markedTemplateId: number
    skillId: number
    fileName: number
    filePath: number
    format: number
    size: number
    params: number
    sampleData: number
    simulatedData: number
    debugLogs: number
    renderedAt: number
    expiresAt: number
    _all: number
  }


  export type RenderOutputAvgAggregateInputType = {
    size?: true
  }

  export type RenderOutputSumAggregateInputType = {
    size?: true
  }

  export type RenderOutputMinAggregateInputType = {
    id?: true
    templateId?: true
    markedTemplateId?: true
    skillId?: true
    fileName?: true
    filePath?: true
    format?: true
    size?: true
    renderedAt?: true
    expiresAt?: true
  }

  export type RenderOutputMaxAggregateInputType = {
    id?: true
    templateId?: true
    markedTemplateId?: true
    skillId?: true
    fileName?: true
    filePath?: true
    format?: true
    size?: true
    renderedAt?: true
    expiresAt?: true
  }

  export type RenderOutputCountAggregateInputType = {
    id?: true
    templateId?: true
    markedTemplateId?: true
    skillId?: true
    fileName?: true
    filePath?: true
    format?: true
    size?: true
    params?: true
    sampleData?: true
    simulatedData?: true
    debugLogs?: true
    renderedAt?: true
    expiresAt?: true
    _all?: true
  }

  export type RenderOutputAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RenderOutput to aggregate.
     */
    where?: RenderOutputWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RenderOutputs to fetch.
     */
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: RenderOutputWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RenderOutputs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RenderOutputs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned RenderOutputs
    **/
    _count?: true | RenderOutputCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: RenderOutputAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: RenderOutputSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: RenderOutputMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: RenderOutputMaxAggregateInputType
  }

  export type GetRenderOutputAggregateType<T extends RenderOutputAggregateArgs> = {
        [P in keyof T & keyof AggregateRenderOutput]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateRenderOutput[P]>
      : GetScalarType<T[P], AggregateRenderOutput[P]>
  }




  export type RenderOutputGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: RenderOutputWhereInput
    orderBy?: RenderOutputOrderByWithAggregationInput | RenderOutputOrderByWithAggregationInput[]
    by: RenderOutputScalarFieldEnum[] | RenderOutputScalarFieldEnum
    having?: RenderOutputScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: RenderOutputCountAggregateInputType | true
    _avg?: RenderOutputAvgAggregateInputType
    _sum?: RenderOutputSumAggregateInputType
    _min?: RenderOutputMinAggregateInputType
    _max?: RenderOutputMaxAggregateInputType
  }

  export type RenderOutputGroupByOutputType = {
    id: string
    templateId: string | null
    markedTemplateId: string | null
    skillId: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size: number | null
    params: JsonValue | null
    sampleData: JsonValue | null
    simulatedData: JsonValue | null
    debugLogs: JsonValue | null
    renderedAt: Date
    expiresAt: Date | null
    _count: RenderOutputCountAggregateOutputType | null
    _avg: RenderOutputAvgAggregateOutputType | null
    _sum: RenderOutputSumAggregateOutputType | null
    _min: RenderOutputMinAggregateOutputType | null
    _max: RenderOutputMaxAggregateOutputType | null
  }

  type GetRenderOutputGroupByPayload<T extends RenderOutputGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<RenderOutputGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof RenderOutputGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], RenderOutputGroupByOutputType[P]>
            : GetScalarType<T[P], RenderOutputGroupByOutputType[P]>
        }
      >
    >


  export type RenderOutputSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    templateId?: boolean
    markedTemplateId?: boolean
    skillId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    params?: boolean
    sampleData?: boolean
    simulatedData?: boolean
    debugLogs?: boolean
    renderedAt?: boolean
    expiresAt?: boolean
    template?: boolean | RenderOutput$templateArgs<ExtArgs>
    markedTemplate?: boolean | RenderOutput$markedTemplateArgs<ExtArgs>
    skill?: boolean | RenderOutput$skillArgs<ExtArgs>
  }, ExtArgs["result"]["renderOutput"]>

  export type RenderOutputSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    templateId?: boolean
    markedTemplateId?: boolean
    skillId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    params?: boolean
    sampleData?: boolean
    simulatedData?: boolean
    debugLogs?: boolean
    renderedAt?: boolean
    expiresAt?: boolean
    template?: boolean | RenderOutput$templateArgs<ExtArgs>
    markedTemplate?: boolean | RenderOutput$markedTemplateArgs<ExtArgs>
    skill?: boolean | RenderOutput$skillArgs<ExtArgs>
  }, ExtArgs["result"]["renderOutput"]>

  export type RenderOutputSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    templateId?: boolean
    markedTemplateId?: boolean
    skillId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    params?: boolean
    sampleData?: boolean
    simulatedData?: boolean
    debugLogs?: boolean
    renderedAt?: boolean
    expiresAt?: boolean
    template?: boolean | RenderOutput$templateArgs<ExtArgs>
    markedTemplate?: boolean | RenderOutput$markedTemplateArgs<ExtArgs>
    skill?: boolean | RenderOutput$skillArgs<ExtArgs>
  }, ExtArgs["result"]["renderOutput"]>

  export type RenderOutputSelectScalar = {
    id?: boolean
    templateId?: boolean
    markedTemplateId?: boolean
    skillId?: boolean
    fileName?: boolean
    filePath?: boolean
    format?: boolean
    size?: boolean
    params?: boolean
    sampleData?: boolean
    simulatedData?: boolean
    debugLogs?: boolean
    renderedAt?: boolean
    expiresAt?: boolean
  }

  export type RenderOutputOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "templateId" | "markedTemplateId" | "skillId" | "fileName" | "filePath" | "format" | "size" | "params" | "sampleData" | "simulatedData" | "debugLogs" | "renderedAt" | "expiresAt", ExtArgs["result"]["renderOutput"]>
  export type RenderOutputInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    template?: boolean | RenderOutput$templateArgs<ExtArgs>
    markedTemplate?: boolean | RenderOutput$markedTemplateArgs<ExtArgs>
    skill?: boolean | RenderOutput$skillArgs<ExtArgs>
  }
  export type RenderOutputIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    template?: boolean | RenderOutput$templateArgs<ExtArgs>
    markedTemplate?: boolean | RenderOutput$markedTemplateArgs<ExtArgs>
    skill?: boolean | RenderOutput$skillArgs<ExtArgs>
  }
  export type RenderOutputIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    template?: boolean | RenderOutput$templateArgs<ExtArgs>
    markedTemplate?: boolean | RenderOutput$markedTemplateArgs<ExtArgs>
    skill?: boolean | RenderOutput$skillArgs<ExtArgs>
  }

  export type $RenderOutputPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "RenderOutput"
    objects: {
      template: Prisma.$TemplatePayload<ExtArgs> | null
      markedTemplate: Prisma.$TemplatePayload<ExtArgs> | null
      skill: Prisma.$SkillPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      templateId: string | null
      markedTemplateId: string | null
      skillId: string | null
      fileName: string
      filePath: string
      format: $Enums.TemplateFormat
      size: number | null
      params: Prisma.JsonValue | null
      sampleData: Prisma.JsonValue | null
      simulatedData: Prisma.JsonValue | null
      debugLogs: Prisma.JsonValue | null
      renderedAt: Date
      expiresAt: Date | null
    }, ExtArgs["result"]["renderOutput"]>
    composites: {}
  }

  type RenderOutputGetPayload<S extends boolean | null | undefined | RenderOutputDefaultArgs> = $Result.GetResult<Prisma.$RenderOutputPayload, S>

  type RenderOutputCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<RenderOutputFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: RenderOutputCountAggregateInputType | true
    }

  export interface RenderOutputDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['RenderOutput'], meta: { name: 'RenderOutput' } }
    /**
     * Find zero or one RenderOutput that matches the filter.
     * @param {RenderOutputFindUniqueArgs} args - Arguments to find a RenderOutput
     * @example
     * // Get one RenderOutput
     * const renderOutput = await prisma.renderOutput.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends RenderOutputFindUniqueArgs>(args: SelectSubset<T, RenderOutputFindUniqueArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one RenderOutput that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {RenderOutputFindUniqueOrThrowArgs} args - Arguments to find a RenderOutput
     * @example
     * // Get one RenderOutput
     * const renderOutput = await prisma.renderOutput.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends RenderOutputFindUniqueOrThrowArgs>(args: SelectSubset<T, RenderOutputFindUniqueOrThrowArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first RenderOutput that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputFindFirstArgs} args - Arguments to find a RenderOutput
     * @example
     * // Get one RenderOutput
     * const renderOutput = await prisma.renderOutput.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends RenderOutputFindFirstArgs>(args?: SelectSubset<T, RenderOutputFindFirstArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first RenderOutput that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputFindFirstOrThrowArgs} args - Arguments to find a RenderOutput
     * @example
     * // Get one RenderOutput
     * const renderOutput = await prisma.renderOutput.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends RenderOutputFindFirstOrThrowArgs>(args?: SelectSubset<T, RenderOutputFindFirstOrThrowArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more RenderOutputs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all RenderOutputs
     * const renderOutputs = await prisma.renderOutput.findMany()
     * 
     * // Get first 10 RenderOutputs
     * const renderOutputs = await prisma.renderOutput.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const renderOutputWithIdOnly = await prisma.renderOutput.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends RenderOutputFindManyArgs>(args?: SelectSubset<T, RenderOutputFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a RenderOutput.
     * @param {RenderOutputCreateArgs} args - Arguments to create a RenderOutput.
     * @example
     * // Create one RenderOutput
     * const RenderOutput = await prisma.renderOutput.create({
     *   data: {
     *     // ... data to create a RenderOutput
     *   }
     * })
     * 
     */
    create<T extends RenderOutputCreateArgs>(args: SelectSubset<T, RenderOutputCreateArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many RenderOutputs.
     * @param {RenderOutputCreateManyArgs} args - Arguments to create many RenderOutputs.
     * @example
     * // Create many RenderOutputs
     * const renderOutput = await prisma.renderOutput.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends RenderOutputCreateManyArgs>(args?: SelectSubset<T, RenderOutputCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many RenderOutputs and returns the data saved in the database.
     * @param {RenderOutputCreateManyAndReturnArgs} args - Arguments to create many RenderOutputs.
     * @example
     * // Create many RenderOutputs
     * const renderOutput = await prisma.renderOutput.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many RenderOutputs and only return the `id`
     * const renderOutputWithIdOnly = await prisma.renderOutput.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends RenderOutputCreateManyAndReturnArgs>(args?: SelectSubset<T, RenderOutputCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a RenderOutput.
     * @param {RenderOutputDeleteArgs} args - Arguments to delete one RenderOutput.
     * @example
     * // Delete one RenderOutput
     * const RenderOutput = await prisma.renderOutput.delete({
     *   where: {
     *     // ... filter to delete one RenderOutput
     *   }
     * })
     * 
     */
    delete<T extends RenderOutputDeleteArgs>(args: SelectSubset<T, RenderOutputDeleteArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one RenderOutput.
     * @param {RenderOutputUpdateArgs} args - Arguments to update one RenderOutput.
     * @example
     * // Update one RenderOutput
     * const renderOutput = await prisma.renderOutput.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends RenderOutputUpdateArgs>(args: SelectSubset<T, RenderOutputUpdateArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more RenderOutputs.
     * @param {RenderOutputDeleteManyArgs} args - Arguments to filter RenderOutputs to delete.
     * @example
     * // Delete a few RenderOutputs
     * const { count } = await prisma.renderOutput.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends RenderOutputDeleteManyArgs>(args?: SelectSubset<T, RenderOutputDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RenderOutputs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many RenderOutputs
     * const renderOutput = await prisma.renderOutput.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends RenderOutputUpdateManyArgs>(args: SelectSubset<T, RenderOutputUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more RenderOutputs and returns the data updated in the database.
     * @param {RenderOutputUpdateManyAndReturnArgs} args - Arguments to update many RenderOutputs.
     * @example
     * // Update many RenderOutputs
     * const renderOutput = await prisma.renderOutput.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more RenderOutputs and only return the `id`
     * const renderOutputWithIdOnly = await prisma.renderOutput.updateManyAndReturn({
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
    updateManyAndReturn<T extends RenderOutputUpdateManyAndReturnArgs>(args: SelectSubset<T, RenderOutputUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one RenderOutput.
     * @param {RenderOutputUpsertArgs} args - Arguments to update or create a RenderOutput.
     * @example
     * // Update or create a RenderOutput
     * const renderOutput = await prisma.renderOutput.upsert({
     *   create: {
     *     // ... data to create a RenderOutput
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the RenderOutput we want to update
     *   }
     * })
     */
    upsert<T extends RenderOutputUpsertArgs>(args: SelectSubset<T, RenderOutputUpsertArgs<ExtArgs>>): Prisma__RenderOutputClient<$Result.GetResult<Prisma.$RenderOutputPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of RenderOutputs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputCountArgs} args - Arguments to filter RenderOutputs to count.
     * @example
     * // Count the number of RenderOutputs
     * const count = await prisma.renderOutput.count({
     *   where: {
     *     // ... the filter for the RenderOutputs we want to count
     *   }
     * })
    **/
    count<T extends RenderOutputCountArgs>(
      args?: Subset<T, RenderOutputCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], RenderOutputCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a RenderOutput.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends RenderOutputAggregateArgs>(args: Subset<T, RenderOutputAggregateArgs>): Prisma.PrismaPromise<GetRenderOutputAggregateType<T>>

    /**
     * Group by RenderOutput.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {RenderOutputGroupByArgs} args - Group by arguments.
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
      T extends RenderOutputGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: RenderOutputGroupByArgs['orderBy'] }
        : { orderBy?: RenderOutputGroupByArgs['orderBy'] },
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
    >(args: SubsetIntersection<T, RenderOutputGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRenderOutputGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the RenderOutput model
   */
  readonly fields: RenderOutputFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for RenderOutput.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__RenderOutputClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    template<T extends RenderOutput$templateArgs<ExtArgs> = {}>(args?: Subset<T, RenderOutput$templateArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    markedTemplate<T extends RenderOutput$markedTemplateArgs<ExtArgs> = {}>(args?: Subset<T, RenderOutput$markedTemplateArgs<ExtArgs>>): Prisma__TemplateClient<$Result.GetResult<Prisma.$TemplatePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    skill<T extends RenderOutput$skillArgs<ExtArgs> = {}>(args?: Subset<T, RenderOutput$skillArgs<ExtArgs>>): Prisma__SkillClient<$Result.GetResult<Prisma.$SkillPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
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
   * Fields of the RenderOutput model
   */
  interface RenderOutputFieldRefs {
    readonly id: FieldRef<"RenderOutput", 'String'>
    readonly templateId: FieldRef<"RenderOutput", 'String'>
    readonly markedTemplateId: FieldRef<"RenderOutput", 'String'>
    readonly skillId: FieldRef<"RenderOutput", 'String'>
    readonly fileName: FieldRef<"RenderOutput", 'String'>
    readonly filePath: FieldRef<"RenderOutput", 'String'>
    readonly format: FieldRef<"RenderOutput", 'TemplateFormat'>
    readonly size: FieldRef<"RenderOutput", 'Int'>
    readonly params: FieldRef<"RenderOutput", 'Json'>
    readonly sampleData: FieldRef<"RenderOutput", 'Json'>
    readonly simulatedData: FieldRef<"RenderOutput", 'Json'>
    readonly debugLogs: FieldRef<"RenderOutput", 'Json'>
    readonly renderedAt: FieldRef<"RenderOutput", 'DateTime'>
    readonly expiresAt: FieldRef<"RenderOutput", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * RenderOutput findUnique
   */
  export type RenderOutputFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * Filter, which RenderOutput to fetch.
     */
    where: RenderOutputWhereUniqueInput
  }

  /**
   * RenderOutput findUniqueOrThrow
   */
  export type RenderOutputFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * Filter, which RenderOutput to fetch.
     */
    where: RenderOutputWhereUniqueInput
  }

  /**
   * RenderOutput findFirst
   */
  export type RenderOutputFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * Filter, which RenderOutput to fetch.
     */
    where?: RenderOutputWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RenderOutputs to fetch.
     */
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RenderOutputs.
     */
    cursor?: RenderOutputWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RenderOutputs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RenderOutputs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RenderOutputs.
     */
    distinct?: RenderOutputScalarFieldEnum | RenderOutputScalarFieldEnum[]
  }

  /**
   * RenderOutput findFirstOrThrow
   */
  export type RenderOutputFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * Filter, which RenderOutput to fetch.
     */
    where?: RenderOutputWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RenderOutputs to fetch.
     */
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for RenderOutputs.
     */
    cursor?: RenderOutputWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RenderOutputs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RenderOutputs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of RenderOutputs.
     */
    distinct?: RenderOutputScalarFieldEnum | RenderOutputScalarFieldEnum[]
  }

  /**
   * RenderOutput findMany
   */
  export type RenderOutputFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * Filter, which RenderOutputs to fetch.
     */
    where?: RenderOutputWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of RenderOutputs to fetch.
     */
    orderBy?: RenderOutputOrderByWithRelationInput | RenderOutputOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing RenderOutputs.
     */
    cursor?: RenderOutputWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` RenderOutputs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` RenderOutputs.
     */
    skip?: number
    distinct?: RenderOutputScalarFieldEnum | RenderOutputScalarFieldEnum[]
  }

  /**
   * RenderOutput create
   */
  export type RenderOutputCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * The data needed to create a RenderOutput.
     */
    data: XOR<RenderOutputCreateInput, RenderOutputUncheckedCreateInput>
  }

  /**
   * RenderOutput createMany
   */
  export type RenderOutputCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many RenderOutputs.
     */
    data: RenderOutputCreateManyInput | RenderOutputCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * RenderOutput createManyAndReturn
   */
  export type RenderOutputCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * The data used to create many RenderOutputs.
     */
    data: RenderOutputCreateManyInput | RenderOutputCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * RenderOutput update
   */
  export type RenderOutputUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * The data needed to update a RenderOutput.
     */
    data: XOR<RenderOutputUpdateInput, RenderOutputUncheckedUpdateInput>
    /**
     * Choose, which RenderOutput to update.
     */
    where: RenderOutputWhereUniqueInput
  }

  /**
   * RenderOutput updateMany
   */
  export type RenderOutputUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update RenderOutputs.
     */
    data: XOR<RenderOutputUpdateManyMutationInput, RenderOutputUncheckedUpdateManyInput>
    /**
     * Filter which RenderOutputs to update
     */
    where?: RenderOutputWhereInput
    /**
     * Limit how many RenderOutputs to update.
     */
    limit?: number
  }

  /**
   * RenderOutput updateManyAndReturn
   */
  export type RenderOutputUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * The data used to update RenderOutputs.
     */
    data: XOR<RenderOutputUpdateManyMutationInput, RenderOutputUncheckedUpdateManyInput>
    /**
     * Filter which RenderOutputs to update
     */
    where?: RenderOutputWhereInput
    /**
     * Limit how many RenderOutputs to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * RenderOutput upsert
   */
  export type RenderOutputUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * The filter to search for the RenderOutput to update in case it exists.
     */
    where: RenderOutputWhereUniqueInput
    /**
     * In case the RenderOutput found by the `where` argument doesn't exist, create a new RenderOutput with this data.
     */
    create: XOR<RenderOutputCreateInput, RenderOutputUncheckedCreateInput>
    /**
     * In case the RenderOutput was found with the provided `where` argument, update it with this data.
     */
    update: XOR<RenderOutputUpdateInput, RenderOutputUncheckedUpdateInput>
  }

  /**
   * RenderOutput delete
   */
  export type RenderOutputDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
    /**
     * Filter which RenderOutput to delete.
     */
    where: RenderOutputWhereUniqueInput
  }

  /**
   * RenderOutput deleteMany
   */
  export type RenderOutputDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which RenderOutputs to delete
     */
    where?: RenderOutputWhereInput
    /**
     * Limit how many RenderOutputs to delete.
     */
    limit?: number
  }

  /**
   * RenderOutput.template
   */
  export type RenderOutput$templateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    where?: TemplateWhereInput
  }

  /**
   * RenderOutput.markedTemplate
   */
  export type RenderOutput$markedTemplateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Template
     */
    select?: TemplateSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Template
     */
    omit?: TemplateOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TemplateInclude<ExtArgs> | null
    where?: TemplateWhereInput
  }

  /**
   * RenderOutput.skill
   */
  export type RenderOutput$skillArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Skill
     */
    select?: SkillSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Skill
     */
    omit?: SkillOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SkillInclude<ExtArgs> | null
    where?: SkillWhereInput
  }

  /**
   * RenderOutput without action
   */
  export type RenderOutputDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the RenderOutput
     */
    select?: RenderOutputSelect<ExtArgs> | null
    /**
     * Omit specific fields from the RenderOutput
     */
    omit?: RenderOutputOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: RenderOutputInclude<ExtArgs> | null
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


  export const TemplateScalarFieldEnum: {
    id: 'id',
    type: 'type',
    originalId: 'originalId',
    fileName: 'fileName',
    filePath: 'filePath',
    format: 'format',
    size: 'size',
    variables: 'variables',
    loops: 'loops',
    markings: 'markings',
    ignoredElements: 'ignoredElements',
    elementGroups: 'elementGroups',
    ignoredGroups: 'ignoredGroups',
    markingsSavedAt: 'markingsSavedAt',
    templateConfig: 'templateConfig',
    configSavedAt: 'configSavedAt',
    suggestions: 'suggestions',
    verifyResult: 'verifyResult',
    hasValidFile: 'hasValidFile',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type TemplateScalarFieldEnum = (typeof TemplateScalarFieldEnum)[keyof typeof TemplateScalarFieldEnum]


  export const SkillScalarFieldEnum: {
    id: 'id',
    templateId: 'templateId',
    parameters: 'parameters',
    dataExample: 'dataExample',
    rawSkill: 'rawSkill',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type SkillScalarFieldEnum = (typeof SkillScalarFieldEnum)[keyof typeof SkillScalarFieldEnum]


  export const RenderOutputScalarFieldEnum: {
    id: 'id',
    templateId: 'templateId',
    markedTemplateId: 'markedTemplateId',
    skillId: 'skillId',
    fileName: 'fileName',
    filePath: 'filePath',
    format: 'format',
    size: 'size',
    params: 'params',
    sampleData: 'sampleData',
    simulatedData: 'simulatedData',
    debugLogs: 'debugLogs',
    renderedAt: 'renderedAt',
    expiresAt: 'expiresAt'
  };

  export type RenderOutputScalarFieldEnum = (typeof RenderOutputScalarFieldEnum)[keyof typeof RenderOutputScalarFieldEnum]


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
   * Reference to a field of type 'TemplateType'
   */
  export type EnumTemplateTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TemplateType'>
    


  /**
   * Reference to a field of type 'TemplateType[]'
   */
  export type ListEnumTemplateTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TemplateType[]'>
    


  /**
   * Reference to a field of type 'TemplateFormat'
   */
  export type EnumTemplateFormatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TemplateFormat'>
    


  /**
   * Reference to a field of type 'TemplateFormat[]'
   */
  export type ListEnumTemplateFormatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TemplateFormat[]'>
    


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
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


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


  export type TemplateWhereInput = {
    AND?: TemplateWhereInput | TemplateWhereInput[]
    OR?: TemplateWhereInput[]
    NOT?: TemplateWhereInput | TemplateWhereInput[]
    id?: UuidFilter<"Template"> | string
    type?: EnumTemplateTypeFilter<"Template"> | $Enums.TemplateType
    originalId?: UuidNullableFilter<"Template"> | string | null
    fileName?: StringFilter<"Template"> | string
    filePath?: StringFilter<"Template"> | string
    format?: EnumTemplateFormatFilter<"Template"> | $Enums.TemplateFormat
    size?: IntNullableFilter<"Template"> | number | null
    variables?: StringNullableListFilter<"Template">
    loops?: JsonFilter<"Template">
    markings?: JsonNullableFilter<"Template">
    ignoredElements?: JsonNullableFilter<"Template">
    elementGroups?: JsonNullableFilter<"Template">
    ignoredGroups?: JsonNullableFilter<"Template">
    markingsSavedAt?: DateTimeNullableFilter<"Template"> | Date | string | null
    templateConfig?: JsonNullableFilter<"Template">
    configSavedAt?: DateTimeNullableFilter<"Template"> | Date | string | null
    suggestions?: JsonNullableFilter<"Template">
    verifyResult?: JsonNullableFilter<"Template">
    hasValidFile?: BoolNullableFilter<"Template"> | boolean | null
    createdAt?: DateTimeFilter<"Template"> | Date | string
    updatedAt?: DateTimeFilter<"Template"> | Date | string
    original?: XOR<TemplateNullableScalarRelationFilter, TemplateWhereInput> | null
    markedCopies?: TemplateListRelationFilter
    skill?: XOR<SkillNullableScalarRelationFilter, SkillWhereInput> | null
    renderOutputs?: RenderOutputListRelationFilter
    markedRenderOutputs?: RenderOutputListRelationFilter
  }

  export type TemplateOrderByWithRelationInput = {
    id?: SortOrder
    type?: SortOrder
    originalId?: SortOrderInput | SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrderInput | SortOrder
    variables?: SortOrder
    loops?: SortOrder
    markings?: SortOrderInput | SortOrder
    ignoredElements?: SortOrderInput | SortOrder
    elementGroups?: SortOrderInput | SortOrder
    ignoredGroups?: SortOrderInput | SortOrder
    markingsSavedAt?: SortOrderInput | SortOrder
    templateConfig?: SortOrderInput | SortOrder
    configSavedAt?: SortOrderInput | SortOrder
    suggestions?: SortOrderInput | SortOrder
    verifyResult?: SortOrderInput | SortOrder
    hasValidFile?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    original?: TemplateOrderByWithRelationInput
    markedCopies?: TemplateOrderByRelationAggregateInput
    skill?: SkillOrderByWithRelationInput
    renderOutputs?: RenderOutputOrderByRelationAggregateInput
    markedRenderOutputs?: RenderOutputOrderByRelationAggregateInput
  }

  export type TemplateWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: TemplateWhereInput | TemplateWhereInput[]
    OR?: TemplateWhereInput[]
    NOT?: TemplateWhereInput | TemplateWhereInput[]
    type?: EnumTemplateTypeFilter<"Template"> | $Enums.TemplateType
    originalId?: UuidNullableFilter<"Template"> | string | null
    fileName?: StringFilter<"Template"> | string
    filePath?: StringFilter<"Template"> | string
    format?: EnumTemplateFormatFilter<"Template"> | $Enums.TemplateFormat
    size?: IntNullableFilter<"Template"> | number | null
    variables?: StringNullableListFilter<"Template">
    loops?: JsonFilter<"Template">
    markings?: JsonNullableFilter<"Template">
    ignoredElements?: JsonNullableFilter<"Template">
    elementGroups?: JsonNullableFilter<"Template">
    ignoredGroups?: JsonNullableFilter<"Template">
    markingsSavedAt?: DateTimeNullableFilter<"Template"> | Date | string | null
    templateConfig?: JsonNullableFilter<"Template">
    configSavedAt?: DateTimeNullableFilter<"Template"> | Date | string | null
    suggestions?: JsonNullableFilter<"Template">
    verifyResult?: JsonNullableFilter<"Template">
    hasValidFile?: BoolNullableFilter<"Template"> | boolean | null
    createdAt?: DateTimeFilter<"Template"> | Date | string
    updatedAt?: DateTimeFilter<"Template"> | Date | string
    original?: XOR<TemplateNullableScalarRelationFilter, TemplateWhereInput> | null
    markedCopies?: TemplateListRelationFilter
    skill?: XOR<SkillNullableScalarRelationFilter, SkillWhereInput> | null
    renderOutputs?: RenderOutputListRelationFilter
    markedRenderOutputs?: RenderOutputListRelationFilter
  }, "id">

  export type TemplateOrderByWithAggregationInput = {
    id?: SortOrder
    type?: SortOrder
    originalId?: SortOrderInput | SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrderInput | SortOrder
    variables?: SortOrder
    loops?: SortOrder
    markings?: SortOrderInput | SortOrder
    ignoredElements?: SortOrderInput | SortOrder
    elementGroups?: SortOrderInput | SortOrder
    ignoredGroups?: SortOrderInput | SortOrder
    markingsSavedAt?: SortOrderInput | SortOrder
    templateConfig?: SortOrderInput | SortOrder
    configSavedAt?: SortOrderInput | SortOrder
    suggestions?: SortOrderInput | SortOrder
    verifyResult?: SortOrderInput | SortOrder
    hasValidFile?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: TemplateCountOrderByAggregateInput
    _avg?: TemplateAvgOrderByAggregateInput
    _max?: TemplateMaxOrderByAggregateInput
    _min?: TemplateMinOrderByAggregateInput
    _sum?: TemplateSumOrderByAggregateInput
  }

  export type TemplateScalarWhereWithAggregatesInput = {
    AND?: TemplateScalarWhereWithAggregatesInput | TemplateScalarWhereWithAggregatesInput[]
    OR?: TemplateScalarWhereWithAggregatesInput[]
    NOT?: TemplateScalarWhereWithAggregatesInput | TemplateScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Template"> | string
    type?: EnumTemplateTypeWithAggregatesFilter<"Template"> | $Enums.TemplateType
    originalId?: UuidNullableWithAggregatesFilter<"Template"> | string | null
    fileName?: StringWithAggregatesFilter<"Template"> | string
    filePath?: StringWithAggregatesFilter<"Template"> | string
    format?: EnumTemplateFormatWithAggregatesFilter<"Template"> | $Enums.TemplateFormat
    size?: IntNullableWithAggregatesFilter<"Template"> | number | null
    variables?: StringNullableListFilter<"Template">
    loops?: JsonWithAggregatesFilter<"Template">
    markings?: JsonNullableWithAggregatesFilter<"Template">
    ignoredElements?: JsonNullableWithAggregatesFilter<"Template">
    elementGroups?: JsonNullableWithAggregatesFilter<"Template">
    ignoredGroups?: JsonNullableWithAggregatesFilter<"Template">
    markingsSavedAt?: DateTimeNullableWithAggregatesFilter<"Template"> | Date | string | null
    templateConfig?: JsonNullableWithAggregatesFilter<"Template">
    configSavedAt?: DateTimeNullableWithAggregatesFilter<"Template"> | Date | string | null
    suggestions?: JsonNullableWithAggregatesFilter<"Template">
    verifyResult?: JsonNullableWithAggregatesFilter<"Template">
    hasValidFile?: BoolNullableWithAggregatesFilter<"Template"> | boolean | null
    createdAt?: DateTimeWithAggregatesFilter<"Template"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Template"> | Date | string
  }

  export type SkillWhereInput = {
    AND?: SkillWhereInput | SkillWhereInput[]
    OR?: SkillWhereInput[]
    NOT?: SkillWhereInput | SkillWhereInput[]
    id?: UuidFilter<"Skill"> | string
    templateId?: UuidFilter<"Skill"> | string
    parameters?: JsonFilter<"Skill">
    dataExample?: JsonNullableFilter<"Skill">
    rawSkill?: JsonNullableFilter<"Skill">
    createdAt?: DateTimeFilter<"Skill"> | Date | string
    updatedAt?: DateTimeFilter<"Skill"> | Date | string
    template?: XOR<TemplateScalarRelationFilter, TemplateWhereInput>
    renderOutputs?: RenderOutputListRelationFilter
  }

  export type SkillOrderByWithRelationInput = {
    id?: SortOrder
    templateId?: SortOrder
    parameters?: SortOrder
    dataExample?: SortOrderInput | SortOrder
    rawSkill?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    template?: TemplateOrderByWithRelationInput
    renderOutputs?: RenderOutputOrderByRelationAggregateInput
  }

  export type SkillWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    templateId?: string
    AND?: SkillWhereInput | SkillWhereInput[]
    OR?: SkillWhereInput[]
    NOT?: SkillWhereInput | SkillWhereInput[]
    parameters?: JsonFilter<"Skill">
    dataExample?: JsonNullableFilter<"Skill">
    rawSkill?: JsonNullableFilter<"Skill">
    createdAt?: DateTimeFilter<"Skill"> | Date | string
    updatedAt?: DateTimeFilter<"Skill"> | Date | string
    template?: XOR<TemplateScalarRelationFilter, TemplateWhereInput>
    renderOutputs?: RenderOutputListRelationFilter
  }, "id" | "templateId">

  export type SkillOrderByWithAggregationInput = {
    id?: SortOrder
    templateId?: SortOrder
    parameters?: SortOrder
    dataExample?: SortOrderInput | SortOrder
    rawSkill?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: SkillCountOrderByAggregateInput
    _max?: SkillMaxOrderByAggregateInput
    _min?: SkillMinOrderByAggregateInput
  }

  export type SkillScalarWhereWithAggregatesInput = {
    AND?: SkillScalarWhereWithAggregatesInput | SkillScalarWhereWithAggregatesInput[]
    OR?: SkillScalarWhereWithAggregatesInput[]
    NOT?: SkillScalarWhereWithAggregatesInput | SkillScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"Skill"> | string
    templateId?: UuidWithAggregatesFilter<"Skill"> | string
    parameters?: JsonWithAggregatesFilter<"Skill">
    dataExample?: JsonNullableWithAggregatesFilter<"Skill">
    rawSkill?: JsonNullableWithAggregatesFilter<"Skill">
    createdAt?: DateTimeWithAggregatesFilter<"Skill"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Skill"> | Date | string
  }

  export type RenderOutputWhereInput = {
    AND?: RenderOutputWhereInput | RenderOutputWhereInput[]
    OR?: RenderOutputWhereInput[]
    NOT?: RenderOutputWhereInput | RenderOutputWhereInput[]
    id?: UuidFilter<"RenderOutput"> | string
    templateId?: UuidNullableFilter<"RenderOutput"> | string | null
    markedTemplateId?: UuidNullableFilter<"RenderOutput"> | string | null
    skillId?: UuidNullableFilter<"RenderOutput"> | string | null
    fileName?: StringFilter<"RenderOutput"> | string
    filePath?: StringFilter<"RenderOutput"> | string
    format?: EnumTemplateFormatFilter<"RenderOutput"> | $Enums.TemplateFormat
    size?: IntNullableFilter<"RenderOutput"> | number | null
    params?: JsonNullableFilter<"RenderOutput">
    sampleData?: JsonNullableFilter<"RenderOutput">
    simulatedData?: JsonNullableFilter<"RenderOutput">
    debugLogs?: JsonNullableFilter<"RenderOutput">
    renderedAt?: DateTimeFilter<"RenderOutput"> | Date | string
    expiresAt?: DateTimeNullableFilter<"RenderOutput"> | Date | string | null
    template?: XOR<TemplateNullableScalarRelationFilter, TemplateWhereInput> | null
    markedTemplate?: XOR<TemplateNullableScalarRelationFilter, TemplateWhereInput> | null
    skill?: XOR<SkillNullableScalarRelationFilter, SkillWhereInput> | null
  }

  export type RenderOutputOrderByWithRelationInput = {
    id?: SortOrder
    templateId?: SortOrderInput | SortOrder
    markedTemplateId?: SortOrderInput | SortOrder
    skillId?: SortOrderInput | SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrderInput | SortOrder
    params?: SortOrderInput | SortOrder
    sampleData?: SortOrderInput | SortOrder
    simulatedData?: SortOrderInput | SortOrder
    debugLogs?: SortOrderInput | SortOrder
    renderedAt?: SortOrder
    expiresAt?: SortOrderInput | SortOrder
    template?: TemplateOrderByWithRelationInput
    markedTemplate?: TemplateOrderByWithRelationInput
    skill?: SkillOrderByWithRelationInput
  }

  export type RenderOutputWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: RenderOutputWhereInput | RenderOutputWhereInput[]
    OR?: RenderOutputWhereInput[]
    NOT?: RenderOutputWhereInput | RenderOutputWhereInput[]
    templateId?: UuidNullableFilter<"RenderOutput"> | string | null
    markedTemplateId?: UuidNullableFilter<"RenderOutput"> | string | null
    skillId?: UuidNullableFilter<"RenderOutput"> | string | null
    fileName?: StringFilter<"RenderOutput"> | string
    filePath?: StringFilter<"RenderOutput"> | string
    format?: EnumTemplateFormatFilter<"RenderOutput"> | $Enums.TemplateFormat
    size?: IntNullableFilter<"RenderOutput"> | number | null
    params?: JsonNullableFilter<"RenderOutput">
    sampleData?: JsonNullableFilter<"RenderOutput">
    simulatedData?: JsonNullableFilter<"RenderOutput">
    debugLogs?: JsonNullableFilter<"RenderOutput">
    renderedAt?: DateTimeFilter<"RenderOutput"> | Date | string
    expiresAt?: DateTimeNullableFilter<"RenderOutput"> | Date | string | null
    template?: XOR<TemplateNullableScalarRelationFilter, TemplateWhereInput> | null
    markedTemplate?: XOR<TemplateNullableScalarRelationFilter, TemplateWhereInput> | null
    skill?: XOR<SkillNullableScalarRelationFilter, SkillWhereInput> | null
  }, "id">

  export type RenderOutputOrderByWithAggregationInput = {
    id?: SortOrder
    templateId?: SortOrderInput | SortOrder
    markedTemplateId?: SortOrderInput | SortOrder
    skillId?: SortOrderInput | SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrderInput | SortOrder
    params?: SortOrderInput | SortOrder
    sampleData?: SortOrderInput | SortOrder
    simulatedData?: SortOrderInput | SortOrder
    debugLogs?: SortOrderInput | SortOrder
    renderedAt?: SortOrder
    expiresAt?: SortOrderInput | SortOrder
    _count?: RenderOutputCountOrderByAggregateInput
    _avg?: RenderOutputAvgOrderByAggregateInput
    _max?: RenderOutputMaxOrderByAggregateInput
    _min?: RenderOutputMinOrderByAggregateInput
    _sum?: RenderOutputSumOrderByAggregateInput
  }

  export type RenderOutputScalarWhereWithAggregatesInput = {
    AND?: RenderOutputScalarWhereWithAggregatesInput | RenderOutputScalarWhereWithAggregatesInput[]
    OR?: RenderOutputScalarWhereWithAggregatesInput[]
    NOT?: RenderOutputScalarWhereWithAggregatesInput | RenderOutputScalarWhereWithAggregatesInput[]
    id?: UuidWithAggregatesFilter<"RenderOutput"> | string
    templateId?: UuidNullableWithAggregatesFilter<"RenderOutput"> | string | null
    markedTemplateId?: UuidNullableWithAggregatesFilter<"RenderOutput"> | string | null
    skillId?: UuidNullableWithAggregatesFilter<"RenderOutput"> | string | null
    fileName?: StringWithAggregatesFilter<"RenderOutput"> | string
    filePath?: StringWithAggregatesFilter<"RenderOutput"> | string
    format?: EnumTemplateFormatWithAggregatesFilter<"RenderOutput"> | $Enums.TemplateFormat
    size?: IntNullableWithAggregatesFilter<"RenderOutput"> | number | null
    params?: JsonNullableWithAggregatesFilter<"RenderOutput">
    sampleData?: JsonNullableWithAggregatesFilter<"RenderOutput">
    simulatedData?: JsonNullableWithAggregatesFilter<"RenderOutput">
    debugLogs?: JsonNullableWithAggregatesFilter<"RenderOutput">
    renderedAt?: DateTimeWithAggregatesFilter<"RenderOutput"> | Date | string
    expiresAt?: DateTimeNullableWithAggregatesFilter<"RenderOutput"> | Date | string | null
  }

  export type TemplateCreateInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    original?: TemplateCreateNestedOneWithoutMarkedCopiesInput
    markedCopies?: TemplateCreateNestedManyWithoutOriginalInput
    skill?: SkillCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateUncheckedCreateInput = {
    id?: string
    type?: $Enums.TemplateType
    originalId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    markedCopies?: TemplateUncheckedCreateNestedManyWithoutOriginalInput
    skill?: SkillUncheckedCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    original?: TemplateUpdateOneWithoutMarkedCopiesNestedInput
    markedCopies?: TemplateUpdateManyWithoutOriginalNestedInput
    skill?: SkillUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    originalId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    markedCopies?: TemplateUncheckedUpdateManyWithoutOriginalNestedInput
    skill?: SkillUncheckedUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUncheckedUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateCreateManyInput = {
    id?: string
    type?: $Enums.TemplateType
    originalId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TemplateUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TemplateUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    originalId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SkillCreateInput = {
    id: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    template: TemplateCreateNestedOneWithoutSkillInput
    renderOutputs?: RenderOutputCreateNestedManyWithoutSkillInput
  }

  export type SkillUncheckedCreateInput = {
    id: string
    templateId: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutSkillInput
  }

  export type SkillUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    template?: TemplateUpdateOneRequiredWithoutSkillNestedInput
    renderOutputs?: RenderOutputUpdateManyWithoutSkillNestedInput
  }

  export type SkillUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutSkillNestedInput
  }

  export type SkillCreateManyInput = {
    id: string
    templateId: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SkillUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type SkillUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RenderOutputCreateInput = {
    id: string
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
    template?: TemplateCreateNestedOneWithoutRenderOutputsInput
    markedTemplate?: TemplateCreateNestedOneWithoutMarkedRenderOutputsInput
    skill?: SkillCreateNestedOneWithoutRenderOutputsInput
  }

  export type RenderOutputUncheckedCreateInput = {
    id: string
    templateId?: string | null
    markedTemplateId?: string | null
    skillId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    template?: TemplateUpdateOneWithoutRenderOutputsNestedInput
    markedTemplate?: TemplateUpdateOneWithoutMarkedRenderOutputsNestedInput
    skill?: SkillUpdateOneWithoutRenderOutputsNestedInput
  }

  export type RenderOutputUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    markedTemplateId?: NullableStringFieldUpdateOperationsInput | string | null
    skillId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputCreateManyInput = {
    id: string
    templateId?: string | null
    markedTemplateId?: string | null
    skillId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    markedTemplateId?: NullableStringFieldUpdateOperationsInput | string | null
    skillId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
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

  export type EnumTemplateTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateType | EnumTemplateTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateTypeFilter<$PrismaModel> | $Enums.TemplateType
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

  export type EnumTemplateFormatFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateFormat | EnumTemplateFormatFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateFormatFilter<$PrismaModel> | $Enums.TemplateFormat
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

  export type StringNullableListFilter<$PrismaModel = never> = {
    equals?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    has?: string | StringFieldRefInput<$PrismaModel> | null
    hasEvery?: string[] | ListStringFieldRefInput<$PrismaModel>
    hasSome?: string[] | ListStringFieldRefInput<$PrismaModel>
    isEmpty?: boolean
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

  export type BoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null
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

  export type TemplateNullableScalarRelationFilter = {
    is?: TemplateWhereInput | null
    isNot?: TemplateWhereInput | null
  }

  export type TemplateListRelationFilter = {
    every?: TemplateWhereInput
    some?: TemplateWhereInput
    none?: TemplateWhereInput
  }

  export type SkillNullableScalarRelationFilter = {
    is?: SkillWhereInput | null
    isNot?: SkillWhereInput | null
  }

  export type RenderOutputListRelationFilter = {
    every?: RenderOutputWhereInput
    some?: RenderOutputWhereInput
    none?: RenderOutputWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type TemplateOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type RenderOutputOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type TemplateCountOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    originalId?: SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrder
    variables?: SortOrder
    loops?: SortOrder
    markings?: SortOrder
    ignoredElements?: SortOrder
    elementGroups?: SortOrder
    ignoredGroups?: SortOrder
    markingsSavedAt?: SortOrder
    templateConfig?: SortOrder
    configSavedAt?: SortOrder
    suggestions?: SortOrder
    verifyResult?: SortOrder
    hasValidFile?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TemplateAvgOrderByAggregateInput = {
    size?: SortOrder
  }

  export type TemplateMaxOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    originalId?: SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrder
    markingsSavedAt?: SortOrder
    configSavedAt?: SortOrder
    hasValidFile?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TemplateMinOrderByAggregateInput = {
    id?: SortOrder
    type?: SortOrder
    originalId?: SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrder
    markingsSavedAt?: SortOrder
    configSavedAt?: SortOrder
    hasValidFile?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TemplateSumOrderByAggregateInput = {
    size?: SortOrder
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

  export type EnumTemplateTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateType | EnumTemplateTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateTypeWithAggregatesFilter<$PrismaModel> | $Enums.TemplateType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTemplateTypeFilter<$PrismaModel>
    _max?: NestedEnumTemplateTypeFilter<$PrismaModel>
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

  export type EnumTemplateFormatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateFormat | EnumTemplateFormatFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateFormatWithAggregatesFilter<$PrismaModel> | $Enums.TemplateFormat
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTemplateFormatFilter<$PrismaModel>
    _max?: NestedEnumTemplateFormatFilter<$PrismaModel>
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

  export type BoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBoolNullableFilter<$PrismaModel>
    _max?: NestedBoolNullableFilter<$PrismaModel>
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

  export type TemplateScalarRelationFilter = {
    is?: TemplateWhereInput
    isNot?: TemplateWhereInput
  }

  export type SkillCountOrderByAggregateInput = {
    id?: SortOrder
    templateId?: SortOrder
    parameters?: SortOrder
    dataExample?: SortOrder
    rawSkill?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SkillMaxOrderByAggregateInput = {
    id?: SortOrder
    templateId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type SkillMinOrderByAggregateInput = {
    id?: SortOrder
    templateId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type RenderOutputCountOrderByAggregateInput = {
    id?: SortOrder
    templateId?: SortOrder
    markedTemplateId?: SortOrder
    skillId?: SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrder
    params?: SortOrder
    sampleData?: SortOrder
    simulatedData?: SortOrder
    debugLogs?: SortOrder
    renderedAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type RenderOutputAvgOrderByAggregateInput = {
    size?: SortOrder
  }

  export type RenderOutputMaxOrderByAggregateInput = {
    id?: SortOrder
    templateId?: SortOrder
    markedTemplateId?: SortOrder
    skillId?: SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrder
    renderedAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type RenderOutputMinOrderByAggregateInput = {
    id?: SortOrder
    templateId?: SortOrder
    markedTemplateId?: SortOrder
    skillId?: SortOrder
    fileName?: SortOrder
    filePath?: SortOrder
    format?: SortOrder
    size?: SortOrder
    renderedAt?: SortOrder
    expiresAt?: SortOrder
  }

  export type RenderOutputSumOrderByAggregateInput = {
    size?: SortOrder
  }

  export type TemplateCreatevariablesInput = {
    set: string[]
  }

  export type TemplateCreateNestedOneWithoutMarkedCopiesInput = {
    create?: XOR<TemplateCreateWithoutMarkedCopiesInput, TemplateUncheckedCreateWithoutMarkedCopiesInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutMarkedCopiesInput
    connect?: TemplateWhereUniqueInput
  }

  export type TemplateCreateNestedManyWithoutOriginalInput = {
    create?: XOR<TemplateCreateWithoutOriginalInput, TemplateUncheckedCreateWithoutOriginalInput> | TemplateCreateWithoutOriginalInput[] | TemplateUncheckedCreateWithoutOriginalInput[]
    connectOrCreate?: TemplateCreateOrConnectWithoutOriginalInput | TemplateCreateOrConnectWithoutOriginalInput[]
    createMany?: TemplateCreateManyOriginalInputEnvelope
    connect?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
  }

  export type SkillCreateNestedOneWithoutTemplateInput = {
    create?: XOR<SkillCreateWithoutTemplateInput, SkillUncheckedCreateWithoutTemplateInput>
    connectOrCreate?: SkillCreateOrConnectWithoutTemplateInput
    connect?: SkillWhereUniqueInput
  }

  export type RenderOutputCreateNestedManyWithoutTemplateInput = {
    create?: XOR<RenderOutputCreateWithoutTemplateInput, RenderOutputUncheckedCreateWithoutTemplateInput> | RenderOutputCreateWithoutTemplateInput[] | RenderOutputUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutTemplateInput | RenderOutputCreateOrConnectWithoutTemplateInput[]
    createMany?: RenderOutputCreateManyTemplateInputEnvelope
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
  }

  export type RenderOutputCreateNestedManyWithoutMarkedTemplateInput = {
    create?: XOR<RenderOutputCreateWithoutMarkedTemplateInput, RenderOutputUncheckedCreateWithoutMarkedTemplateInput> | RenderOutputCreateWithoutMarkedTemplateInput[] | RenderOutputUncheckedCreateWithoutMarkedTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutMarkedTemplateInput | RenderOutputCreateOrConnectWithoutMarkedTemplateInput[]
    createMany?: RenderOutputCreateManyMarkedTemplateInputEnvelope
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
  }

  export type TemplateUncheckedCreateNestedManyWithoutOriginalInput = {
    create?: XOR<TemplateCreateWithoutOriginalInput, TemplateUncheckedCreateWithoutOriginalInput> | TemplateCreateWithoutOriginalInput[] | TemplateUncheckedCreateWithoutOriginalInput[]
    connectOrCreate?: TemplateCreateOrConnectWithoutOriginalInput | TemplateCreateOrConnectWithoutOriginalInput[]
    createMany?: TemplateCreateManyOriginalInputEnvelope
    connect?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
  }

  export type SkillUncheckedCreateNestedOneWithoutTemplateInput = {
    create?: XOR<SkillCreateWithoutTemplateInput, SkillUncheckedCreateWithoutTemplateInput>
    connectOrCreate?: SkillCreateOrConnectWithoutTemplateInput
    connect?: SkillWhereUniqueInput
  }

  export type RenderOutputUncheckedCreateNestedManyWithoutTemplateInput = {
    create?: XOR<RenderOutputCreateWithoutTemplateInput, RenderOutputUncheckedCreateWithoutTemplateInput> | RenderOutputCreateWithoutTemplateInput[] | RenderOutputUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutTemplateInput | RenderOutputCreateOrConnectWithoutTemplateInput[]
    createMany?: RenderOutputCreateManyTemplateInputEnvelope
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
  }

  export type RenderOutputUncheckedCreateNestedManyWithoutMarkedTemplateInput = {
    create?: XOR<RenderOutputCreateWithoutMarkedTemplateInput, RenderOutputUncheckedCreateWithoutMarkedTemplateInput> | RenderOutputCreateWithoutMarkedTemplateInput[] | RenderOutputUncheckedCreateWithoutMarkedTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutMarkedTemplateInput | RenderOutputCreateOrConnectWithoutMarkedTemplateInput[]
    createMany?: RenderOutputCreateManyMarkedTemplateInputEnvelope
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type EnumTemplateTypeFieldUpdateOperationsInput = {
    set?: $Enums.TemplateType
  }

  export type EnumTemplateFormatFieldUpdateOperationsInput = {
    set?: $Enums.TemplateFormat
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type TemplateUpdatevariablesInput = {
    set?: string[]
    push?: string | string[]
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type NullableBoolFieldUpdateOperationsInput = {
    set?: boolean | null
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type TemplateUpdateOneWithoutMarkedCopiesNestedInput = {
    create?: XOR<TemplateCreateWithoutMarkedCopiesInput, TemplateUncheckedCreateWithoutMarkedCopiesInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutMarkedCopiesInput
    upsert?: TemplateUpsertWithoutMarkedCopiesInput
    disconnect?: TemplateWhereInput | boolean
    delete?: TemplateWhereInput | boolean
    connect?: TemplateWhereUniqueInput
    update?: XOR<XOR<TemplateUpdateToOneWithWhereWithoutMarkedCopiesInput, TemplateUpdateWithoutMarkedCopiesInput>, TemplateUncheckedUpdateWithoutMarkedCopiesInput>
  }

  export type TemplateUpdateManyWithoutOriginalNestedInput = {
    create?: XOR<TemplateCreateWithoutOriginalInput, TemplateUncheckedCreateWithoutOriginalInput> | TemplateCreateWithoutOriginalInput[] | TemplateUncheckedCreateWithoutOriginalInput[]
    connectOrCreate?: TemplateCreateOrConnectWithoutOriginalInput | TemplateCreateOrConnectWithoutOriginalInput[]
    upsert?: TemplateUpsertWithWhereUniqueWithoutOriginalInput | TemplateUpsertWithWhereUniqueWithoutOriginalInput[]
    createMany?: TemplateCreateManyOriginalInputEnvelope
    set?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    disconnect?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    delete?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    connect?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    update?: TemplateUpdateWithWhereUniqueWithoutOriginalInput | TemplateUpdateWithWhereUniqueWithoutOriginalInput[]
    updateMany?: TemplateUpdateManyWithWhereWithoutOriginalInput | TemplateUpdateManyWithWhereWithoutOriginalInput[]
    deleteMany?: TemplateScalarWhereInput | TemplateScalarWhereInput[]
  }

  export type SkillUpdateOneWithoutTemplateNestedInput = {
    create?: XOR<SkillCreateWithoutTemplateInput, SkillUncheckedCreateWithoutTemplateInput>
    connectOrCreate?: SkillCreateOrConnectWithoutTemplateInput
    upsert?: SkillUpsertWithoutTemplateInput
    disconnect?: SkillWhereInput | boolean
    delete?: SkillWhereInput | boolean
    connect?: SkillWhereUniqueInput
    update?: XOR<XOR<SkillUpdateToOneWithWhereWithoutTemplateInput, SkillUpdateWithoutTemplateInput>, SkillUncheckedUpdateWithoutTemplateInput>
  }

  export type RenderOutputUpdateManyWithoutTemplateNestedInput = {
    create?: XOR<RenderOutputCreateWithoutTemplateInput, RenderOutputUncheckedCreateWithoutTemplateInput> | RenderOutputCreateWithoutTemplateInput[] | RenderOutputUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutTemplateInput | RenderOutputCreateOrConnectWithoutTemplateInput[]
    upsert?: RenderOutputUpsertWithWhereUniqueWithoutTemplateInput | RenderOutputUpsertWithWhereUniqueWithoutTemplateInput[]
    createMany?: RenderOutputCreateManyTemplateInputEnvelope
    set?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    disconnect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    delete?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    update?: RenderOutputUpdateWithWhereUniqueWithoutTemplateInput | RenderOutputUpdateWithWhereUniqueWithoutTemplateInput[]
    updateMany?: RenderOutputUpdateManyWithWhereWithoutTemplateInput | RenderOutputUpdateManyWithWhereWithoutTemplateInput[]
    deleteMany?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
  }

  export type RenderOutputUpdateManyWithoutMarkedTemplateNestedInput = {
    create?: XOR<RenderOutputCreateWithoutMarkedTemplateInput, RenderOutputUncheckedCreateWithoutMarkedTemplateInput> | RenderOutputCreateWithoutMarkedTemplateInput[] | RenderOutputUncheckedCreateWithoutMarkedTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutMarkedTemplateInput | RenderOutputCreateOrConnectWithoutMarkedTemplateInput[]
    upsert?: RenderOutputUpsertWithWhereUniqueWithoutMarkedTemplateInput | RenderOutputUpsertWithWhereUniqueWithoutMarkedTemplateInput[]
    createMany?: RenderOutputCreateManyMarkedTemplateInputEnvelope
    set?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    disconnect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    delete?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    update?: RenderOutputUpdateWithWhereUniqueWithoutMarkedTemplateInput | RenderOutputUpdateWithWhereUniqueWithoutMarkedTemplateInput[]
    updateMany?: RenderOutputUpdateManyWithWhereWithoutMarkedTemplateInput | RenderOutputUpdateManyWithWhereWithoutMarkedTemplateInput[]
    deleteMany?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type TemplateUncheckedUpdateManyWithoutOriginalNestedInput = {
    create?: XOR<TemplateCreateWithoutOriginalInput, TemplateUncheckedCreateWithoutOriginalInput> | TemplateCreateWithoutOriginalInput[] | TemplateUncheckedCreateWithoutOriginalInput[]
    connectOrCreate?: TemplateCreateOrConnectWithoutOriginalInput | TemplateCreateOrConnectWithoutOriginalInput[]
    upsert?: TemplateUpsertWithWhereUniqueWithoutOriginalInput | TemplateUpsertWithWhereUniqueWithoutOriginalInput[]
    createMany?: TemplateCreateManyOriginalInputEnvelope
    set?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    disconnect?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    delete?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    connect?: TemplateWhereUniqueInput | TemplateWhereUniqueInput[]
    update?: TemplateUpdateWithWhereUniqueWithoutOriginalInput | TemplateUpdateWithWhereUniqueWithoutOriginalInput[]
    updateMany?: TemplateUpdateManyWithWhereWithoutOriginalInput | TemplateUpdateManyWithWhereWithoutOriginalInput[]
    deleteMany?: TemplateScalarWhereInput | TemplateScalarWhereInput[]
  }

  export type SkillUncheckedUpdateOneWithoutTemplateNestedInput = {
    create?: XOR<SkillCreateWithoutTemplateInput, SkillUncheckedCreateWithoutTemplateInput>
    connectOrCreate?: SkillCreateOrConnectWithoutTemplateInput
    upsert?: SkillUpsertWithoutTemplateInput
    disconnect?: SkillWhereInput | boolean
    delete?: SkillWhereInput | boolean
    connect?: SkillWhereUniqueInput
    update?: XOR<XOR<SkillUpdateToOneWithWhereWithoutTemplateInput, SkillUpdateWithoutTemplateInput>, SkillUncheckedUpdateWithoutTemplateInput>
  }

  export type RenderOutputUncheckedUpdateManyWithoutTemplateNestedInput = {
    create?: XOR<RenderOutputCreateWithoutTemplateInput, RenderOutputUncheckedCreateWithoutTemplateInput> | RenderOutputCreateWithoutTemplateInput[] | RenderOutputUncheckedCreateWithoutTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutTemplateInput | RenderOutputCreateOrConnectWithoutTemplateInput[]
    upsert?: RenderOutputUpsertWithWhereUniqueWithoutTemplateInput | RenderOutputUpsertWithWhereUniqueWithoutTemplateInput[]
    createMany?: RenderOutputCreateManyTemplateInputEnvelope
    set?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    disconnect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    delete?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    update?: RenderOutputUpdateWithWhereUniqueWithoutTemplateInput | RenderOutputUpdateWithWhereUniqueWithoutTemplateInput[]
    updateMany?: RenderOutputUpdateManyWithWhereWithoutTemplateInput | RenderOutputUpdateManyWithWhereWithoutTemplateInput[]
    deleteMany?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
  }

  export type RenderOutputUncheckedUpdateManyWithoutMarkedTemplateNestedInput = {
    create?: XOR<RenderOutputCreateWithoutMarkedTemplateInput, RenderOutputUncheckedCreateWithoutMarkedTemplateInput> | RenderOutputCreateWithoutMarkedTemplateInput[] | RenderOutputUncheckedCreateWithoutMarkedTemplateInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutMarkedTemplateInput | RenderOutputCreateOrConnectWithoutMarkedTemplateInput[]
    upsert?: RenderOutputUpsertWithWhereUniqueWithoutMarkedTemplateInput | RenderOutputUpsertWithWhereUniqueWithoutMarkedTemplateInput[]
    createMany?: RenderOutputCreateManyMarkedTemplateInputEnvelope
    set?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    disconnect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    delete?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    update?: RenderOutputUpdateWithWhereUniqueWithoutMarkedTemplateInput | RenderOutputUpdateWithWhereUniqueWithoutMarkedTemplateInput[]
    updateMany?: RenderOutputUpdateManyWithWhereWithoutMarkedTemplateInput | RenderOutputUpdateManyWithWhereWithoutMarkedTemplateInput[]
    deleteMany?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
  }

  export type TemplateCreateNestedOneWithoutSkillInput = {
    create?: XOR<TemplateCreateWithoutSkillInput, TemplateUncheckedCreateWithoutSkillInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutSkillInput
    connect?: TemplateWhereUniqueInput
  }

  export type RenderOutputCreateNestedManyWithoutSkillInput = {
    create?: XOR<RenderOutputCreateWithoutSkillInput, RenderOutputUncheckedCreateWithoutSkillInput> | RenderOutputCreateWithoutSkillInput[] | RenderOutputUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutSkillInput | RenderOutputCreateOrConnectWithoutSkillInput[]
    createMany?: RenderOutputCreateManySkillInputEnvelope
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
  }

  export type RenderOutputUncheckedCreateNestedManyWithoutSkillInput = {
    create?: XOR<RenderOutputCreateWithoutSkillInput, RenderOutputUncheckedCreateWithoutSkillInput> | RenderOutputCreateWithoutSkillInput[] | RenderOutputUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutSkillInput | RenderOutputCreateOrConnectWithoutSkillInput[]
    createMany?: RenderOutputCreateManySkillInputEnvelope
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
  }

  export type TemplateUpdateOneRequiredWithoutSkillNestedInput = {
    create?: XOR<TemplateCreateWithoutSkillInput, TemplateUncheckedCreateWithoutSkillInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutSkillInput
    upsert?: TemplateUpsertWithoutSkillInput
    connect?: TemplateWhereUniqueInput
    update?: XOR<XOR<TemplateUpdateToOneWithWhereWithoutSkillInput, TemplateUpdateWithoutSkillInput>, TemplateUncheckedUpdateWithoutSkillInput>
  }

  export type RenderOutputUpdateManyWithoutSkillNestedInput = {
    create?: XOR<RenderOutputCreateWithoutSkillInput, RenderOutputUncheckedCreateWithoutSkillInput> | RenderOutputCreateWithoutSkillInput[] | RenderOutputUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutSkillInput | RenderOutputCreateOrConnectWithoutSkillInput[]
    upsert?: RenderOutputUpsertWithWhereUniqueWithoutSkillInput | RenderOutputUpsertWithWhereUniqueWithoutSkillInput[]
    createMany?: RenderOutputCreateManySkillInputEnvelope
    set?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    disconnect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    delete?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    update?: RenderOutputUpdateWithWhereUniqueWithoutSkillInput | RenderOutputUpdateWithWhereUniqueWithoutSkillInput[]
    updateMany?: RenderOutputUpdateManyWithWhereWithoutSkillInput | RenderOutputUpdateManyWithWhereWithoutSkillInput[]
    deleteMany?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
  }

  export type RenderOutputUncheckedUpdateManyWithoutSkillNestedInput = {
    create?: XOR<RenderOutputCreateWithoutSkillInput, RenderOutputUncheckedCreateWithoutSkillInput> | RenderOutputCreateWithoutSkillInput[] | RenderOutputUncheckedCreateWithoutSkillInput[]
    connectOrCreate?: RenderOutputCreateOrConnectWithoutSkillInput | RenderOutputCreateOrConnectWithoutSkillInput[]
    upsert?: RenderOutputUpsertWithWhereUniqueWithoutSkillInput | RenderOutputUpsertWithWhereUniqueWithoutSkillInput[]
    createMany?: RenderOutputCreateManySkillInputEnvelope
    set?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    disconnect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    delete?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    connect?: RenderOutputWhereUniqueInput | RenderOutputWhereUniqueInput[]
    update?: RenderOutputUpdateWithWhereUniqueWithoutSkillInput | RenderOutputUpdateWithWhereUniqueWithoutSkillInput[]
    updateMany?: RenderOutputUpdateManyWithWhereWithoutSkillInput | RenderOutputUpdateManyWithWhereWithoutSkillInput[]
    deleteMany?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
  }

  export type TemplateCreateNestedOneWithoutRenderOutputsInput = {
    create?: XOR<TemplateCreateWithoutRenderOutputsInput, TemplateUncheckedCreateWithoutRenderOutputsInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutRenderOutputsInput
    connect?: TemplateWhereUniqueInput
  }

  export type TemplateCreateNestedOneWithoutMarkedRenderOutputsInput = {
    create?: XOR<TemplateCreateWithoutMarkedRenderOutputsInput, TemplateUncheckedCreateWithoutMarkedRenderOutputsInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutMarkedRenderOutputsInput
    connect?: TemplateWhereUniqueInput
  }

  export type SkillCreateNestedOneWithoutRenderOutputsInput = {
    create?: XOR<SkillCreateWithoutRenderOutputsInput, SkillUncheckedCreateWithoutRenderOutputsInput>
    connectOrCreate?: SkillCreateOrConnectWithoutRenderOutputsInput
    connect?: SkillWhereUniqueInput
  }

  export type TemplateUpdateOneWithoutRenderOutputsNestedInput = {
    create?: XOR<TemplateCreateWithoutRenderOutputsInput, TemplateUncheckedCreateWithoutRenderOutputsInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutRenderOutputsInput
    upsert?: TemplateUpsertWithoutRenderOutputsInput
    disconnect?: TemplateWhereInput | boolean
    delete?: TemplateWhereInput | boolean
    connect?: TemplateWhereUniqueInput
    update?: XOR<XOR<TemplateUpdateToOneWithWhereWithoutRenderOutputsInput, TemplateUpdateWithoutRenderOutputsInput>, TemplateUncheckedUpdateWithoutRenderOutputsInput>
  }

  export type TemplateUpdateOneWithoutMarkedRenderOutputsNestedInput = {
    create?: XOR<TemplateCreateWithoutMarkedRenderOutputsInput, TemplateUncheckedCreateWithoutMarkedRenderOutputsInput>
    connectOrCreate?: TemplateCreateOrConnectWithoutMarkedRenderOutputsInput
    upsert?: TemplateUpsertWithoutMarkedRenderOutputsInput
    disconnect?: TemplateWhereInput | boolean
    delete?: TemplateWhereInput | boolean
    connect?: TemplateWhereUniqueInput
    update?: XOR<XOR<TemplateUpdateToOneWithWhereWithoutMarkedRenderOutputsInput, TemplateUpdateWithoutMarkedRenderOutputsInput>, TemplateUncheckedUpdateWithoutMarkedRenderOutputsInput>
  }

  export type SkillUpdateOneWithoutRenderOutputsNestedInput = {
    create?: XOR<SkillCreateWithoutRenderOutputsInput, SkillUncheckedCreateWithoutRenderOutputsInput>
    connectOrCreate?: SkillCreateOrConnectWithoutRenderOutputsInput
    upsert?: SkillUpsertWithoutRenderOutputsInput
    disconnect?: SkillWhereInput | boolean
    delete?: SkillWhereInput | boolean
    connect?: SkillWhereUniqueInput
    update?: XOR<XOR<SkillUpdateToOneWithWhereWithoutRenderOutputsInput, SkillUpdateWithoutRenderOutputsInput>, SkillUncheckedUpdateWithoutRenderOutputsInput>
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

  export type NestedEnumTemplateTypeFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateType | EnumTemplateTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateTypeFilter<$PrismaModel> | $Enums.TemplateType
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

  export type NestedEnumTemplateFormatFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateFormat | EnumTemplateFormatFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateFormatFilter<$PrismaModel> | $Enums.TemplateFormat
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

  export type NestedBoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null
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

  export type NestedEnumTemplateTypeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateType | EnumTemplateTypeFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateType[] | ListEnumTemplateTypeFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateTypeWithAggregatesFilter<$PrismaModel> | $Enums.TemplateType
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTemplateTypeFilter<$PrismaModel>
    _max?: NestedEnumTemplateTypeFilter<$PrismaModel>
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

  export type NestedEnumTemplateFormatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TemplateFormat | EnumTemplateFormatFieldRefInput<$PrismaModel>
    in?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    notIn?: $Enums.TemplateFormat[] | ListEnumTemplateFormatFieldRefInput<$PrismaModel>
    not?: NestedEnumTemplateFormatWithAggregatesFilter<$PrismaModel> | $Enums.TemplateFormat
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTemplateFormatFilter<$PrismaModel>
    _max?: NestedEnumTemplateFormatFilter<$PrismaModel>
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

  export type NestedBoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedBoolNullableFilter<$PrismaModel>
    _max?: NestedBoolNullableFilter<$PrismaModel>
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

  export type TemplateCreateWithoutMarkedCopiesInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    original?: TemplateCreateNestedOneWithoutMarkedCopiesInput
    skill?: SkillCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateUncheckedCreateWithoutMarkedCopiesInput = {
    id?: string
    type?: $Enums.TemplateType
    originalId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    skill?: SkillUncheckedCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateCreateOrConnectWithoutMarkedCopiesInput = {
    where: TemplateWhereUniqueInput
    create: XOR<TemplateCreateWithoutMarkedCopiesInput, TemplateUncheckedCreateWithoutMarkedCopiesInput>
  }

  export type TemplateCreateWithoutOriginalInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    markedCopies?: TemplateCreateNestedManyWithoutOriginalInput
    skill?: SkillCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateUncheckedCreateWithoutOriginalInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    markedCopies?: TemplateUncheckedCreateNestedManyWithoutOriginalInput
    skill?: SkillUncheckedCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateCreateOrConnectWithoutOriginalInput = {
    where: TemplateWhereUniqueInput
    create: XOR<TemplateCreateWithoutOriginalInput, TemplateUncheckedCreateWithoutOriginalInput>
  }

  export type TemplateCreateManyOriginalInputEnvelope = {
    data: TemplateCreateManyOriginalInput | TemplateCreateManyOriginalInput[]
    skipDuplicates?: boolean
  }

  export type SkillCreateWithoutTemplateInput = {
    id: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    renderOutputs?: RenderOutputCreateNestedManyWithoutSkillInput
  }

  export type SkillUncheckedCreateWithoutTemplateInput = {
    id: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutSkillInput
  }

  export type SkillCreateOrConnectWithoutTemplateInput = {
    where: SkillWhereUniqueInput
    create: XOR<SkillCreateWithoutTemplateInput, SkillUncheckedCreateWithoutTemplateInput>
  }

  export type RenderOutputCreateWithoutTemplateInput = {
    id: string
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
    markedTemplate?: TemplateCreateNestedOneWithoutMarkedRenderOutputsInput
    skill?: SkillCreateNestedOneWithoutRenderOutputsInput
  }

  export type RenderOutputUncheckedCreateWithoutTemplateInput = {
    id: string
    markedTemplateId?: string | null
    skillId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputCreateOrConnectWithoutTemplateInput = {
    where: RenderOutputWhereUniqueInput
    create: XOR<RenderOutputCreateWithoutTemplateInput, RenderOutputUncheckedCreateWithoutTemplateInput>
  }

  export type RenderOutputCreateManyTemplateInputEnvelope = {
    data: RenderOutputCreateManyTemplateInput | RenderOutputCreateManyTemplateInput[]
    skipDuplicates?: boolean
  }

  export type RenderOutputCreateWithoutMarkedTemplateInput = {
    id: string
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
    template?: TemplateCreateNestedOneWithoutRenderOutputsInput
    skill?: SkillCreateNestedOneWithoutRenderOutputsInput
  }

  export type RenderOutputUncheckedCreateWithoutMarkedTemplateInput = {
    id: string
    templateId?: string | null
    skillId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputCreateOrConnectWithoutMarkedTemplateInput = {
    where: RenderOutputWhereUniqueInput
    create: XOR<RenderOutputCreateWithoutMarkedTemplateInput, RenderOutputUncheckedCreateWithoutMarkedTemplateInput>
  }

  export type RenderOutputCreateManyMarkedTemplateInputEnvelope = {
    data: RenderOutputCreateManyMarkedTemplateInput | RenderOutputCreateManyMarkedTemplateInput[]
    skipDuplicates?: boolean
  }

  export type TemplateUpsertWithoutMarkedCopiesInput = {
    update: XOR<TemplateUpdateWithoutMarkedCopiesInput, TemplateUncheckedUpdateWithoutMarkedCopiesInput>
    create: XOR<TemplateCreateWithoutMarkedCopiesInput, TemplateUncheckedCreateWithoutMarkedCopiesInput>
    where?: TemplateWhereInput
  }

  export type TemplateUpdateToOneWithWhereWithoutMarkedCopiesInput = {
    where?: TemplateWhereInput
    data: XOR<TemplateUpdateWithoutMarkedCopiesInput, TemplateUncheckedUpdateWithoutMarkedCopiesInput>
  }

  export type TemplateUpdateWithoutMarkedCopiesInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    original?: TemplateUpdateOneWithoutMarkedCopiesNestedInput
    skill?: SkillUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUncheckedUpdateWithoutMarkedCopiesInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    originalId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    skill?: SkillUncheckedUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUncheckedUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUpsertWithWhereUniqueWithoutOriginalInput = {
    where: TemplateWhereUniqueInput
    update: XOR<TemplateUpdateWithoutOriginalInput, TemplateUncheckedUpdateWithoutOriginalInput>
    create: XOR<TemplateCreateWithoutOriginalInput, TemplateUncheckedCreateWithoutOriginalInput>
  }

  export type TemplateUpdateWithWhereUniqueWithoutOriginalInput = {
    where: TemplateWhereUniqueInput
    data: XOR<TemplateUpdateWithoutOriginalInput, TemplateUncheckedUpdateWithoutOriginalInput>
  }

  export type TemplateUpdateManyWithWhereWithoutOriginalInput = {
    where: TemplateScalarWhereInput
    data: XOR<TemplateUpdateManyMutationInput, TemplateUncheckedUpdateManyWithoutOriginalInput>
  }

  export type TemplateScalarWhereInput = {
    AND?: TemplateScalarWhereInput | TemplateScalarWhereInput[]
    OR?: TemplateScalarWhereInput[]
    NOT?: TemplateScalarWhereInput | TemplateScalarWhereInput[]
    id?: UuidFilter<"Template"> | string
    type?: EnumTemplateTypeFilter<"Template"> | $Enums.TemplateType
    originalId?: UuidNullableFilter<"Template"> | string | null
    fileName?: StringFilter<"Template"> | string
    filePath?: StringFilter<"Template"> | string
    format?: EnumTemplateFormatFilter<"Template"> | $Enums.TemplateFormat
    size?: IntNullableFilter<"Template"> | number | null
    variables?: StringNullableListFilter<"Template">
    loops?: JsonFilter<"Template">
    markings?: JsonNullableFilter<"Template">
    ignoredElements?: JsonNullableFilter<"Template">
    elementGroups?: JsonNullableFilter<"Template">
    ignoredGroups?: JsonNullableFilter<"Template">
    markingsSavedAt?: DateTimeNullableFilter<"Template"> | Date | string | null
    templateConfig?: JsonNullableFilter<"Template">
    configSavedAt?: DateTimeNullableFilter<"Template"> | Date | string | null
    suggestions?: JsonNullableFilter<"Template">
    verifyResult?: JsonNullableFilter<"Template">
    hasValidFile?: BoolNullableFilter<"Template"> | boolean | null
    createdAt?: DateTimeFilter<"Template"> | Date | string
    updatedAt?: DateTimeFilter<"Template"> | Date | string
  }

  export type SkillUpsertWithoutTemplateInput = {
    update: XOR<SkillUpdateWithoutTemplateInput, SkillUncheckedUpdateWithoutTemplateInput>
    create: XOR<SkillCreateWithoutTemplateInput, SkillUncheckedCreateWithoutTemplateInput>
    where?: SkillWhereInput
  }

  export type SkillUpdateToOneWithWhereWithoutTemplateInput = {
    where?: SkillWhereInput
    data: XOR<SkillUpdateWithoutTemplateInput, SkillUncheckedUpdateWithoutTemplateInput>
  }

  export type SkillUpdateWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renderOutputs?: RenderOutputUpdateManyWithoutSkillNestedInput
  }

  export type SkillUncheckedUpdateWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutSkillNestedInput
  }

  export type RenderOutputUpsertWithWhereUniqueWithoutTemplateInput = {
    where: RenderOutputWhereUniqueInput
    update: XOR<RenderOutputUpdateWithoutTemplateInput, RenderOutputUncheckedUpdateWithoutTemplateInput>
    create: XOR<RenderOutputCreateWithoutTemplateInput, RenderOutputUncheckedCreateWithoutTemplateInput>
  }

  export type RenderOutputUpdateWithWhereUniqueWithoutTemplateInput = {
    where: RenderOutputWhereUniqueInput
    data: XOR<RenderOutputUpdateWithoutTemplateInput, RenderOutputUncheckedUpdateWithoutTemplateInput>
  }

  export type RenderOutputUpdateManyWithWhereWithoutTemplateInput = {
    where: RenderOutputScalarWhereInput
    data: XOR<RenderOutputUpdateManyMutationInput, RenderOutputUncheckedUpdateManyWithoutTemplateInput>
  }

  export type RenderOutputScalarWhereInput = {
    AND?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
    OR?: RenderOutputScalarWhereInput[]
    NOT?: RenderOutputScalarWhereInput | RenderOutputScalarWhereInput[]
    id?: UuidFilter<"RenderOutput"> | string
    templateId?: UuidNullableFilter<"RenderOutput"> | string | null
    markedTemplateId?: UuidNullableFilter<"RenderOutput"> | string | null
    skillId?: UuidNullableFilter<"RenderOutput"> | string | null
    fileName?: StringFilter<"RenderOutput"> | string
    filePath?: StringFilter<"RenderOutput"> | string
    format?: EnumTemplateFormatFilter<"RenderOutput"> | $Enums.TemplateFormat
    size?: IntNullableFilter<"RenderOutput"> | number | null
    params?: JsonNullableFilter<"RenderOutput">
    sampleData?: JsonNullableFilter<"RenderOutput">
    simulatedData?: JsonNullableFilter<"RenderOutput">
    debugLogs?: JsonNullableFilter<"RenderOutput">
    renderedAt?: DateTimeFilter<"RenderOutput"> | Date | string
    expiresAt?: DateTimeNullableFilter<"RenderOutput"> | Date | string | null
  }

  export type RenderOutputUpsertWithWhereUniqueWithoutMarkedTemplateInput = {
    where: RenderOutputWhereUniqueInput
    update: XOR<RenderOutputUpdateWithoutMarkedTemplateInput, RenderOutputUncheckedUpdateWithoutMarkedTemplateInput>
    create: XOR<RenderOutputCreateWithoutMarkedTemplateInput, RenderOutputUncheckedCreateWithoutMarkedTemplateInput>
  }

  export type RenderOutputUpdateWithWhereUniqueWithoutMarkedTemplateInput = {
    where: RenderOutputWhereUniqueInput
    data: XOR<RenderOutputUpdateWithoutMarkedTemplateInput, RenderOutputUncheckedUpdateWithoutMarkedTemplateInput>
  }

  export type RenderOutputUpdateManyWithWhereWithoutMarkedTemplateInput = {
    where: RenderOutputScalarWhereInput
    data: XOR<RenderOutputUpdateManyMutationInput, RenderOutputUncheckedUpdateManyWithoutMarkedTemplateInput>
  }

  export type TemplateCreateWithoutSkillInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    original?: TemplateCreateNestedOneWithoutMarkedCopiesInput
    markedCopies?: TemplateCreateNestedManyWithoutOriginalInput
    renderOutputs?: RenderOutputCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateUncheckedCreateWithoutSkillInput = {
    id?: string
    type?: $Enums.TemplateType
    originalId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    markedCopies?: TemplateUncheckedCreateNestedManyWithoutOriginalInput
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutTemplateInput
    markedRenderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateCreateOrConnectWithoutSkillInput = {
    where: TemplateWhereUniqueInput
    create: XOR<TemplateCreateWithoutSkillInput, TemplateUncheckedCreateWithoutSkillInput>
  }

  export type RenderOutputCreateWithoutSkillInput = {
    id: string
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
    template?: TemplateCreateNestedOneWithoutRenderOutputsInput
    markedTemplate?: TemplateCreateNestedOneWithoutMarkedRenderOutputsInput
  }

  export type RenderOutputUncheckedCreateWithoutSkillInput = {
    id: string
    templateId?: string | null
    markedTemplateId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputCreateOrConnectWithoutSkillInput = {
    where: RenderOutputWhereUniqueInput
    create: XOR<RenderOutputCreateWithoutSkillInput, RenderOutputUncheckedCreateWithoutSkillInput>
  }

  export type RenderOutputCreateManySkillInputEnvelope = {
    data: RenderOutputCreateManySkillInput | RenderOutputCreateManySkillInput[]
    skipDuplicates?: boolean
  }

  export type TemplateUpsertWithoutSkillInput = {
    update: XOR<TemplateUpdateWithoutSkillInput, TemplateUncheckedUpdateWithoutSkillInput>
    create: XOR<TemplateCreateWithoutSkillInput, TemplateUncheckedCreateWithoutSkillInput>
    where?: TemplateWhereInput
  }

  export type TemplateUpdateToOneWithWhereWithoutSkillInput = {
    where?: TemplateWhereInput
    data: XOR<TemplateUpdateWithoutSkillInput, TemplateUncheckedUpdateWithoutSkillInput>
  }

  export type TemplateUpdateWithoutSkillInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    original?: TemplateUpdateOneWithoutMarkedCopiesNestedInput
    markedCopies?: TemplateUpdateManyWithoutOriginalNestedInput
    renderOutputs?: RenderOutputUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUncheckedUpdateWithoutSkillInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    originalId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    markedCopies?: TemplateUncheckedUpdateManyWithoutOriginalNestedInput
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUncheckedUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type RenderOutputUpsertWithWhereUniqueWithoutSkillInput = {
    where: RenderOutputWhereUniqueInput
    update: XOR<RenderOutputUpdateWithoutSkillInput, RenderOutputUncheckedUpdateWithoutSkillInput>
    create: XOR<RenderOutputCreateWithoutSkillInput, RenderOutputUncheckedCreateWithoutSkillInput>
  }

  export type RenderOutputUpdateWithWhereUniqueWithoutSkillInput = {
    where: RenderOutputWhereUniqueInput
    data: XOR<RenderOutputUpdateWithoutSkillInput, RenderOutputUncheckedUpdateWithoutSkillInput>
  }

  export type RenderOutputUpdateManyWithWhereWithoutSkillInput = {
    where: RenderOutputScalarWhereInput
    data: XOR<RenderOutputUpdateManyMutationInput, RenderOutputUncheckedUpdateManyWithoutSkillInput>
  }

  export type TemplateCreateWithoutRenderOutputsInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    original?: TemplateCreateNestedOneWithoutMarkedCopiesInput
    markedCopies?: TemplateCreateNestedManyWithoutOriginalInput
    skill?: SkillCreateNestedOneWithoutTemplateInput
    markedRenderOutputs?: RenderOutputCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateUncheckedCreateWithoutRenderOutputsInput = {
    id?: string
    type?: $Enums.TemplateType
    originalId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    markedCopies?: TemplateUncheckedCreateNestedManyWithoutOriginalInput
    skill?: SkillUncheckedCreateNestedOneWithoutTemplateInput
    markedRenderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutMarkedTemplateInput
  }

  export type TemplateCreateOrConnectWithoutRenderOutputsInput = {
    where: TemplateWhereUniqueInput
    create: XOR<TemplateCreateWithoutRenderOutputsInput, TemplateUncheckedCreateWithoutRenderOutputsInput>
  }

  export type TemplateCreateWithoutMarkedRenderOutputsInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    original?: TemplateCreateNestedOneWithoutMarkedCopiesInput
    markedCopies?: TemplateCreateNestedManyWithoutOriginalInput
    skill?: SkillCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputCreateNestedManyWithoutTemplateInput
  }

  export type TemplateUncheckedCreateWithoutMarkedRenderOutputsInput = {
    id?: string
    type?: $Enums.TemplateType
    originalId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
    markedCopies?: TemplateUncheckedCreateNestedManyWithoutOriginalInput
    skill?: SkillUncheckedCreateNestedOneWithoutTemplateInput
    renderOutputs?: RenderOutputUncheckedCreateNestedManyWithoutTemplateInput
  }

  export type TemplateCreateOrConnectWithoutMarkedRenderOutputsInput = {
    where: TemplateWhereUniqueInput
    create: XOR<TemplateCreateWithoutMarkedRenderOutputsInput, TemplateUncheckedCreateWithoutMarkedRenderOutputsInput>
  }

  export type SkillCreateWithoutRenderOutputsInput = {
    id: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    template: TemplateCreateNestedOneWithoutSkillInput
  }

  export type SkillUncheckedCreateWithoutRenderOutputsInput = {
    id: string
    templateId: string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type SkillCreateOrConnectWithoutRenderOutputsInput = {
    where: SkillWhereUniqueInput
    create: XOR<SkillCreateWithoutRenderOutputsInput, SkillUncheckedCreateWithoutRenderOutputsInput>
  }

  export type TemplateUpsertWithoutRenderOutputsInput = {
    update: XOR<TemplateUpdateWithoutRenderOutputsInput, TemplateUncheckedUpdateWithoutRenderOutputsInput>
    create: XOR<TemplateCreateWithoutRenderOutputsInput, TemplateUncheckedCreateWithoutRenderOutputsInput>
    where?: TemplateWhereInput
  }

  export type TemplateUpdateToOneWithWhereWithoutRenderOutputsInput = {
    where?: TemplateWhereInput
    data: XOR<TemplateUpdateWithoutRenderOutputsInput, TemplateUncheckedUpdateWithoutRenderOutputsInput>
  }

  export type TemplateUpdateWithoutRenderOutputsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    original?: TemplateUpdateOneWithoutMarkedCopiesNestedInput
    markedCopies?: TemplateUpdateManyWithoutOriginalNestedInput
    skill?: SkillUpdateOneWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUncheckedUpdateWithoutRenderOutputsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    originalId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    markedCopies?: TemplateUncheckedUpdateManyWithoutOriginalNestedInput
    skill?: SkillUncheckedUpdateOneWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUncheckedUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUpsertWithoutMarkedRenderOutputsInput = {
    update: XOR<TemplateUpdateWithoutMarkedRenderOutputsInput, TemplateUncheckedUpdateWithoutMarkedRenderOutputsInput>
    create: XOR<TemplateCreateWithoutMarkedRenderOutputsInput, TemplateUncheckedCreateWithoutMarkedRenderOutputsInput>
    where?: TemplateWhereInput
  }

  export type TemplateUpdateToOneWithWhereWithoutMarkedRenderOutputsInput = {
    where?: TemplateWhereInput
    data: XOR<TemplateUpdateWithoutMarkedRenderOutputsInput, TemplateUncheckedUpdateWithoutMarkedRenderOutputsInput>
  }

  export type TemplateUpdateWithoutMarkedRenderOutputsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    original?: TemplateUpdateOneWithoutMarkedCopiesNestedInput
    markedCopies?: TemplateUpdateManyWithoutOriginalNestedInput
    skill?: SkillUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUpdateManyWithoutTemplateNestedInput
  }

  export type TemplateUncheckedUpdateWithoutMarkedRenderOutputsInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    originalId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    markedCopies?: TemplateUncheckedUpdateManyWithoutOriginalNestedInput
    skill?: SkillUncheckedUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutTemplateNestedInput
  }

  export type SkillUpsertWithoutRenderOutputsInput = {
    update: XOR<SkillUpdateWithoutRenderOutputsInput, SkillUncheckedUpdateWithoutRenderOutputsInput>
    create: XOR<SkillCreateWithoutRenderOutputsInput, SkillUncheckedCreateWithoutRenderOutputsInput>
    where?: SkillWhereInput
  }

  export type SkillUpdateToOneWithWhereWithoutRenderOutputsInput = {
    where?: SkillWhereInput
    data: XOR<SkillUpdateWithoutRenderOutputsInput, SkillUncheckedUpdateWithoutRenderOutputsInput>
  }

  export type SkillUpdateWithoutRenderOutputsInput = {
    id?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    template?: TemplateUpdateOneRequiredWithoutSkillNestedInput
  }

  export type SkillUncheckedUpdateWithoutRenderOutputsInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: StringFieldUpdateOperationsInput | string
    parameters?: JsonNullValueInput | InputJsonValue
    dataExample?: NullableJsonNullValueInput | InputJsonValue
    rawSkill?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TemplateCreateManyOriginalInput = {
    id?: string
    type?: $Enums.TemplateType
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    variables?: TemplateCreatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: boolean | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type RenderOutputCreateManyTemplateInput = {
    id: string
    markedTemplateId?: string | null
    skillId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputCreateManyMarkedTemplateInput = {
    id: string
    templateId?: string | null
    skillId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type TemplateUpdateWithoutOriginalInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    markedCopies?: TemplateUpdateManyWithoutOriginalNestedInput
    skill?: SkillUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUncheckedUpdateWithoutOriginalInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    markedCopies?: TemplateUncheckedUpdateManyWithoutOriginalNestedInput
    skill?: SkillUncheckedUpdateOneWithoutTemplateNestedInput
    renderOutputs?: RenderOutputUncheckedUpdateManyWithoutTemplateNestedInput
    markedRenderOutputs?: RenderOutputUncheckedUpdateManyWithoutMarkedTemplateNestedInput
  }

  export type TemplateUncheckedUpdateManyWithoutOriginalInput = {
    id?: StringFieldUpdateOperationsInput | string
    type?: EnumTemplateTypeFieldUpdateOperationsInput | $Enums.TemplateType
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    variables?: TemplateUpdatevariablesInput | string[]
    loops?: JsonNullValueInput | InputJsonValue
    markings?: NullableJsonNullValueInput | InputJsonValue
    ignoredElements?: NullableJsonNullValueInput | InputJsonValue
    elementGroups?: NullableJsonNullValueInput | InputJsonValue
    ignoredGroups?: NullableJsonNullValueInput | InputJsonValue
    markingsSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    templateConfig?: NullableJsonNullValueInput | InputJsonValue
    configSavedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    suggestions?: NullableJsonNullValueInput | InputJsonValue
    verifyResult?: NullableJsonNullValueInput | InputJsonValue
    hasValidFile?: NullableBoolFieldUpdateOperationsInput | boolean | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type RenderOutputUpdateWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    markedTemplate?: TemplateUpdateOneWithoutMarkedRenderOutputsNestedInput
    skill?: SkillUpdateOneWithoutRenderOutputsNestedInput
  }

  export type RenderOutputUncheckedUpdateWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    markedTemplateId?: NullableStringFieldUpdateOperationsInput | string | null
    skillId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputUncheckedUpdateManyWithoutTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    markedTemplateId?: NullableStringFieldUpdateOperationsInput | string | null
    skillId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputUpdateWithoutMarkedTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    template?: TemplateUpdateOneWithoutRenderOutputsNestedInput
    skill?: SkillUpdateOneWithoutRenderOutputsNestedInput
  }

  export type RenderOutputUncheckedUpdateWithoutMarkedTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    skillId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputUncheckedUpdateManyWithoutMarkedTemplateInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    skillId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputCreateManySkillInput = {
    id: string
    templateId?: string | null
    markedTemplateId?: string | null
    fileName: string
    filePath: string
    format: $Enums.TemplateFormat
    size?: number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: Date | string
    expiresAt?: Date | string | null
  }

  export type RenderOutputUpdateWithoutSkillInput = {
    id?: StringFieldUpdateOperationsInput | string
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    template?: TemplateUpdateOneWithoutRenderOutputsNestedInput
    markedTemplate?: TemplateUpdateOneWithoutMarkedRenderOutputsNestedInput
  }

  export type RenderOutputUncheckedUpdateWithoutSkillInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    markedTemplateId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
  }

  export type RenderOutputUncheckedUpdateManyWithoutSkillInput = {
    id?: StringFieldUpdateOperationsInput | string
    templateId?: NullableStringFieldUpdateOperationsInput | string | null
    markedTemplateId?: NullableStringFieldUpdateOperationsInput | string | null
    fileName?: StringFieldUpdateOperationsInput | string
    filePath?: StringFieldUpdateOperationsInput | string
    format?: EnumTemplateFormatFieldUpdateOperationsInput | $Enums.TemplateFormat
    size?: NullableIntFieldUpdateOperationsInput | number | null
    params?: NullableJsonNullValueInput | InputJsonValue
    sampleData?: NullableJsonNullValueInput | InputJsonValue
    simulatedData?: NullableJsonNullValueInput | InputJsonValue
    debugLogs?: NullableJsonNullValueInput | InputJsonValue
    renderedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
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