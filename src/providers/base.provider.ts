import type { AIContext, AIProvider, PRProposal, ProviderName } from '../types/index.js';

export abstract class BaseProvider implements AIProvider {
  abstract name: ProviderName;
  abstract isAvailable(): Promise<boolean>;
  abstract generateCommitMessage(context: AIContext): Promise<string>;
  abstract generatePRDescription(context: AIContext): Promise<PRProposal>;

  protected buildCommitPrompt(context: AIContext): string {
    const { detectedCommitConvention: conv, changedFiles, localSummary, ticket, branch } = context;
    const types = conv.allowedTypes.join(', ');
    const scopeHint = conv.allowedScopes?.length
      ? `\nAllowed scopes: ${conv.allowedScopes.join(', ')}`
      : '';
    const ticketHint = ticket ? `\nTicket: ${ticket}` : '';
    const files = changedFiles.map((f) => `  - ${f.status}: ${f.path}`).join('\n');
    const summary = localSummary.join('\n');

    return [
      `Generate a single-line commit message following the Conventional Commits spec.`,
      `Format: <type>${conv.scopeRequired ? '(<scope>)' : '[(<scope>)]'}: <subject>`,
      `Max length: ${conv.maxHeaderLength} characters`,
      `Allowed types: ${types}${scopeHint}`,
      ticketHint,
      `Branch: ${branch}`,
      `Changed files:\n${files}`,
      `Summary:\n${summary}`,
      `Output ONLY the commit message, nothing else.`,
    ].filter(Boolean).join('\n');
  }

  protected buildPRPrompt(context: AIContext): string {
    const { changedFiles, localSummary, ticket, branch } = context;
    const files = changedFiles.map((f) => `  - ${f.status}: ${f.path}`).join('\n');

    return [
      `Generate a pull request title and description for the following changes.`,
      `Branch: ${branch}`,
      ticket ? `Ticket: ${ticket}` : '',
      `Changed files:\n${files}`,
      `Summary:\n${localSummary.join('\n')}`,
      `Output a JSON object with fields: title (string), body (markdown string with sections: Context, Changes, Testing, Risks/Impact).`,
    ].filter(Boolean).join('\n');
  }
}
