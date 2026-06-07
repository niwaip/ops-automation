export interface I18nPort {
  changeLanguage(language: string): Promise<void> | void;
}
