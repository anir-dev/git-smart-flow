export type ConventionType = 'conventional' | 'angular' | 'custom' | 'unknown';
export type SubjectCase = 'lower-case' | 'upper-case' | 'sentence-case' | 'start-case' | 'any';
export type AIMode = 'enriched' | 'summary' | 'full';
export type ProviderName = 'heuristic' | 'copilot' | 'openai' | 'claude' | 'ollama';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'ja' | 'zh';

export interface CommitConvention {
  type: ConventionType;
  allowedTypes: string[];
  allowedScopes?: string[];
  scopeRequired: boolean;
  maxHeaderLength: number;
  requireTicket: boolean | 'auto';
  ticketPattern: string;
  subjectCase: SubjectCase;
  hasCommitlint: boolean;
  hasHusky: boolean;
}

export interface RepoContext {
  name: string;
  branch: string;
  ticket?: string;
  convention: CommitConvention;
  isMonorepo: boolean;
  upstream?: string;
  hasUncommittedChanges: boolean;
  stagedFiles: StagedFile[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  conflictsActive: boolean;
  aheadCount: number;
  behindCount: number;
}

export interface StagedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown';
}

export interface AIContext {
  repository: string;
  branch: string;
  ticket?: string;
  detectedCommitConvention: CommitConvention;
  changedFiles: { path: string; status: string }[];
  localSummary: string[];
  sanitizedFragments: { file: string; summary: string }[];
}

export interface AIProvider {
  name: ProviderName;
  isAvailable(): Promise<boolean>;
  generateCommitMessage(context: AIContext): Promise<string>;
  generatePRDescription(context: AIContext): Promise<PRProposal>;
}

export interface SecurityScanResult {
  clean: boolean;
  blockedFiles: string[];
  detectedSecrets: { file: string; line: number; pattern: string }[];
  redactionsApplied: number;
  summary: string;
}

export interface GlobalConfig {
  language: {
    commit: Language;
    prTitle: Language;
    prBody: Language;
  };
  ai: {
    enabled: boolean;
    provider: ProviderName;
    mode: AIMode;
    allowRawDiff: boolean;
    showPromptBeforeSend: boolean;
    model?: string;
    apiKey?: string;
    ollamaModel?: string;
    ollamaUrl?: string;
    copilotCommand?: string;
  };
  git: {
    protectedBranches: string[];
    defaultBaseBranches: string[];
    githubIntegration?: boolean;
    autoFetch?: boolean;
    autoFetchIntervalMinutes?: number;
  };
  commit: {
    convention: ConventionType;
    maxHeaderLength: number;
    requireTicket: boolean | 'auto';
    ticketPattern: string;
  };
  security: {
    blockOnSecrets: boolean;
    redactSecrets: boolean;
    blockedFiles: string[];
  };
  aliases: {
    gsfc: boolean;
    gsfm: boolean;
    gsfp: boolean;
    gsfpr: boolean;
  };
}

export interface LocalConfig {
  ai?: Partial<GlobalConfig['ai']>;
  git?: Partial<GlobalConfig['git']>;
  commit?: Partial<GlobalConfig['commit']>;
  security?: Partial<GlobalConfig['security']>;
}

export interface MergedConfig extends GlobalConfig {
  _source: 'merged';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CommitProposal {
  message: string;
  validation: ValidationResult;
  aiContextVisible?: AIContext;
  provider: ProviderName;
}

export interface PRProposal {
  title: string;
  body: string;
  checklist?: string[];
}
