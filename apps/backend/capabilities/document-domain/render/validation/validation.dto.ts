export class ValidateDto {
  templateId!: string;
  data!: Record<string, any>;
}

export interface ValidateResponse {
  valid: boolean;
  missing: string[];
}
