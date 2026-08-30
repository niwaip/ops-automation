export type ContractId = string;
export type IsoTimestamp = string;
export interface AuditStamp {
    createdAt: IsoTimestamp;
    updatedAt?: IsoTimestamp;
    createdBy?: ContractId;
    updatedBy?: ContractId;
}
export interface KeyValueRecord {
    [key: string]: unknown;
}
//# sourceMappingURL=index.d.ts.map