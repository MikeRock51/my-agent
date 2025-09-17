import { z } from "zod";
import { tool } from "ai";
import { simpleGit } from "simple-git";


const fileChange = z.object({
  rootDir: z.string().min(1).describe("The root directory"),
});

type FileChange = z.infer<typeof fileChange>;


const excludeFiles = ["dist", "bun.lock"];

async function getFileChangesInDirectory({ rootDir }: FileChange) {
  const git = simpleGit(rootDir);
  const summary = await git.diffSummary();
  const diffs: { file: string; diff: string }[] = [];

  for (const file of summary.files) {
    if (excludeFiles.includes(file.file)) continue;
    const diff = await git.diff(["--", file.file]);
    diffs.push({ file: file.file, diff });
  }

  return diffs;
}

export const getFileChangesInDirectoryTool = tool({
    description: "Gets the code changes made in given directory",
    inputSchema: fileChange,
    execute: getFileChangesInDirectory,
  });

const generateCommitMessageSchema = z.object({
  rootDir: z.string().min(1).describe("The root directory to analyze for changes"),
  style: z.enum(["conventional", "simple", "detailed"]).optional().describe("Commit message style - conventional (feat/fix/docs), simple, or detailed"),
});

type GenerateCommitMessageInput = z.infer<typeof generateCommitMessageSchema>;

async function generateCommitMessage({ rootDir, style = "conventional" }: GenerateCommitMessageInput) {
  const git = simpleGit(rootDir);

  try {
    // Get the current status and changes
    const status = await git.status();
    const diffSummary = await git.diffSummary();

    if (status.files.length === 0 && diffSummary.files.length === 0) {
      return { message: null, error: "No changes detected to commit" };
    }

    // Analyze the types of changes
    const changes = {
      added: [] as string[],
      modified: [] as string[],
      deleted: [] as string[],
      renamed: [] as string[]
    };

    // Collect file changes
    for (const file of status.files) {
      if (excludeFiles.includes(file.path)) continue;

      switch (file.index) {
        case 'A':
          changes.added.push(file.path);
          break;
        case 'M':
          changes.modified.push(file.path);
          break;
        case 'D':
          changes.deleted.push(file.path);
          break;
        case 'R':
          changes.renamed.push(file.path);
          break;
      }
    }

    // Get actual diff content for analysis
    const diffs: string[] = [];
    for (const file of diffSummary.files) {
      if (excludeFiles.includes(file.file)) continue;
      const diff = await git.diff(["--", file.file]);
      diffs.push(diff);
    }

    // Analyze diff content to understand the nature of changes
    const analysis = analyzeDiffContent(diffs.join('\n'));

    // Generate commit message based on style
    let message: string;

    switch (style) {
      case "conventional":
        message = generateConventionalCommitMessage(changes, analysis);
        break;
      case "simple":
        message = generateSimpleCommitMessage(changes, analysis);
        break;
      case "detailed":
        message = generateDetailedCommitMessage(changes, analysis);
        break;
      default:
        message = generateConventionalCommitMessage(changes, analysis);
    }

    return { message, changes, analysis };

  } catch (error) {
    return { message: null, error: `Failed to generate commit message: ${error}` };
  }
}

function analyzeDiffContent(diff: string): { type: string; scope?: string; description: string } {
  // Simple analysis - could be enhanced with more sophisticated parsing
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;
  const keywords: { [key: string]: string } = {
    'fix': 'fix',
    'bug': 'fix',
    'error': 'fix',
    'test': 'test',
    'spec': 'test',
    'feature': 'feat',
    'add': 'feat',
    'new': 'feat',
    'update': 'feat',
    'refactor': 'refactor',
    'improve': 'refactor',
    'docs': 'docs',
    'readme': 'docs',
    'chore': 'chore',
    'config': 'chore',
    'build': 'build'
  };

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  // Look for keywords in diff content
  const content = diff.toLowerCase();
  let detectedType = 'feat'; // default

  for (const [keyword, type] of Object.entries(keywords)) {
    if (content.includes(keyword)) {
      detectedType = type;
      break;
    }
  }

  // Determine scope based on file patterns
  let scope: string | undefined;
  if (content.includes('package.json') || content.includes('bun.lock')) {
    scope = 'deps';
  } else if (content.includes('.ts') || content.includes('.js')) {
    scope = 'code';
  } else if (content.includes('.md') || content.includes('readme')) {
    scope = 'docs';
  }

  const isMostlyAdditions = additions > deletions * 2;
  const isMostlyDeletions = deletions > additions * 2;
  const hasTests = content.includes('test') || content.includes('spec');

  let description = '';
  if (isMostlyAdditions) {
    description = hasTests ? 'add tests and features' : 'add new features';
  } else if (isMostlyDeletions) {
    description = 'remove unused code';
  } else {
    description = hasTests ? 'update tests and code' : 'update code';
  }

  return { type: detectedType, scope, description };
}

function generateConventionalCommitMessage(
  changes: { added: string[]; modified: string[]; deleted: string[]; renamed: string[] },
  analysis: { type: string; scope?: string; description: string }
): string {
  const { type, scope, description } = analysis;
  const scopeStr = scope ? `(${scope})` : '';

  const totalFiles = Object.values(changes).reduce((sum, files) => sum + files.length, 0);

  if (totalFiles === 1) {
    const file = [...changes.added, ...changes.modified, ...changes.deleted, ...changes.renamed][0];
    return `${type}${scopeStr}: ${description} in ${file}`;
  }

  const parts = [];
  if (changes.added.length > 0) parts.push(`${changes.added.length} file${changes.added.length > 1 ? 's' : ''} added`);
  if (changes.modified.length > 0) parts.push(`${changes.modified.length} file${changes.modified.length > 1 ? 's' : ''} modified`);
  if (changes.deleted.length > 0) parts.push(`${changes.deleted.length} file${changes.deleted.length > 1 ? 's' : ''} deleted`);

  return `${type}${scopeStr}: ${description}${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`;
}

function generateSimpleCommitMessage(
  changes: { added: string[]; modified: string[]; deleted: string[]; renamed: string[] },
  analysis: { type: string; scope?: string; description: string }
): string {
  return analysis.description.charAt(0).toUpperCase() + analysis.description.slice(1);
}

function generateDetailedCommitMessage(
  changes: { added: string[]; modified: string[]; deleted: string[]; renamed: string[] },
  analysis: { type: string; scope?: string; description: string }
): string {
  const lines = [];

  // Main description
  lines.push(analysis.description.charAt(0).toUpperCase() + analysis.description.slice(1));

  // File details
  const fileDetails = [];
  if (changes.added.length > 0) fileDetails.push(`Added: ${changes.added.join(', ')}`);
  if (changes.modified.length > 0) fileDetails.push(`Modified: ${changes.modified.join(', ')}`);
  if (changes.deleted.length > 0) fileDetails.push(`Deleted: ${changes.deleted.join(', ')}`);
  if (changes.renamed.length > 0) fileDetails.push(`Renamed: ${changes.renamed.join(', ')}`);

  if (fileDetails.length > 0) {
    lines.push('');
    lines.push('Files changed:');
    fileDetails.forEach(detail => lines.push(`- ${detail}`));
  }

  return lines.join('\n');
}

export const generateCommitMessageTool = tool({
  description: "Generates an appropriate commit message based on the current git changes",
  inputSchema: generateCommitMessageSchema,
  execute: generateCommitMessage,
});