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
});

type GenerateCommitMessageInput = z.infer<typeof generateCommitMessageSchema>;

async function generateCommitMessage({ rootDir }: GenerateCommitMessageInput) {
  const git = simpleGit(rootDir);

  try {
    // Get the current status and changes
    const status = await git.status();
    const diffSummary = await git.diffSummary();

    if (status.files.length === 0 && diffSummary.files.length === 0) {
      return {
        changes: null,
        diffContent: null,
        error: "No changes detected to commit"
      };
    }

    // Collect file changes by type
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

    // Get actual diff content for LLM analysis
    const diffs: string[] = [];
    for (const file of diffSummary.files) {
      if (excludeFiles.includes(file.file)) continue;
      const diff = await git.diff(["--", file.file]);
      diffs.push(diff);
    }

    const diffContent = diffs.join('\n\n');

    return {
      changes,
      diffContent,
      summary: {
        totalFiles: status.files.length,
        addedCount: changes.added.length,
        modifiedCount: changes.modified.length,
        deletedCount: changes.deleted.length,
        renamedCount: changes.renamed.length
      }
    };

  } catch (error) {
    return {
      changes: null,
      diffContent: null,
      error: `Failed to analyze changes: ${error}`
    };
  }
}


export const generateCommitMessageTool = tool({
    description: "Analyzes git changes and provides detailed context for generating appropriate commit messages",
    inputSchema: generateCommitMessageSchema,
    execute: generateCommitMessage,
  });

const generateMarkdownSchema = z.object({
  type: z.enum(["readme", "api-docs", "changelog", "contributing", "architecture", "custom"]).describe("Type of markdown document to generate"),
  title: z.string().min(1).describe("Title for the markdown document"),
  content: z.string().optional().describe("Custom content or description for the document"),
  sections: z.array(z.string()).optional().describe("Specific sections to include (for custom type)"),
  projectInfo: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
  }).optional().describe("Project information for documentation"),
});

type GenerateMarkdownInput = z.infer<typeof generateMarkdownSchema>;

async function generateMarkdownFile({
  type,
  title,
  content,
  sections = [],
  projectInfo
}: GenerateMarkdownInput) {
  try {
    let markdown = '';

    switch (type) {
      case "readme":
        markdown = generateReadmeMarkdown(title, content, projectInfo);
        break;
      case "api-docs":
        markdown = generateApiDocsMarkdown(title, content);
        break;
      case "changelog":
        markdown = generateChangelogMarkdown(title, content);
        break;
      case "contributing":
        markdown = generateContributingMarkdown(title, content);
        break;
      case "architecture":
        markdown = generateArchitectureMarkdown(title, content);
        break;
      case "custom":
        markdown = generateCustomMarkdown(title, content, sections);
        break;
      default:
        markdown = generateReadmeMarkdown(title, content, projectInfo);
    }

    return {
      content: markdown,
      type,
      title,
      sections: sections.length > 0 ? sections : getDefaultSections(type)
    };

  } catch (error) {
    return {
      content: null,
      error: `Failed to generate markdown: ${error}`,
      type,
      title
    };
  }
}

function getDefaultSections(type: string): string[] {
  const sectionMap: { [key: string]: string[] } = {
    readme: ["Description", "Features", "Installation", "Usage", "Contributing", "License"],
    "api-docs": ["Overview", "Endpoints", "Authentication", "Examples", "Error Handling"],
    changelog: ["Unreleased", "Version History"],
    contributing: ["Getting Started", "Development", "Testing", "Submitting Changes"],
    architecture: ["Overview", "Components", "Data Flow", "Technology Stack", "Deployment"],
    custom: ["Introduction", "Details", "Conclusion"]
  };

  return sectionMap[type] || ["Introduction", "Content", "Conclusion"];
}

function generateReadmeMarkdown(title: string, content?: string, projectInfo?: any): string {
  const lines = [];

  // Header
  lines.push(`# ${title}`);
  lines.push('');

  // Badges (placeholder)
  if (projectInfo?.version) {
    lines.push(`[![Version](https://img.shields.io/badge/version-${projectInfo.version}-blue.svg)](https://github.com) `);
  }
  if (projectInfo?.license) {
    lines.push(`[![License](https://img.shields.io/badge/license-${projectInfo.license}-green.svg)](LICENSE)`);
  }
  if (lines.length > 1) lines.push('');

  // Description
  if (content || projectInfo?.description) {
    lines.push(content || projectInfo.description);
    lines.push('');
  }

  // Table of Contents
  lines.push('## Table of Contents');
  lines.push('');
  lines.push('- [Features](#features)');
  lines.push('- [Installation](#installation)');
  lines.push('- [Usage](#usage)');
  lines.push('- [Contributing](#contributing)');
  lines.push('- [License](#license)');
  lines.push('');

  // Features
  lines.push('## Features');
  lines.push('');
  lines.push('- Feature 1');
  lines.push('- Feature 2');
  lines.push('- Feature 3');
  lines.push('');

  // Installation
  lines.push('## Installation');
  lines.push('');
  lines.push('```bash');
  lines.push('# Clone the repository');
  lines.push('git clone <repository-url>');
  lines.push('cd <project-directory>');
  lines.push('');
  lines.push('# Install dependencies');
  lines.push('npm install');
  lines.push('```');
  lines.push('');

  // Usage
  lines.push('## Usage');
  lines.push('');
  lines.push('```javascript');
  lines.push('// Example usage');
  lines.push('const example = new Example();');
  lines.push('example.doSomething();');
  lines.push('```');
  lines.push('');

  // Contributing
  lines.push('## Contributing');
  lines.push('');
  lines.push('Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.');
  lines.push('');

  // License
  lines.push('## License');
  lines.push('');
  if (projectInfo?.license) {
    lines.push(`This project is licensed under the ${projectInfo.license} License - see the [LICENSE](LICENSE) file for details.`);
  } else {
    lines.push('This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.');
  }

  if (projectInfo?.author) {
    lines.push('');
    lines.push(`## Author`);
    lines.push('');
    lines.push(projectInfo.author);
  }

  return lines.join('\n');
}

function generateApiDocsMarkdown(title: string, content?: string): string {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push('');

  if (content) {
    lines.push(content);
    lines.push('');
  }

  lines.push('## Overview');
  lines.push('');
  lines.push('API documentation for the project endpoints and functionality.');
  lines.push('');

  lines.push('## Base URL');
  lines.push('');
  lines.push('```');
  lines.push('https://api.example.com/v1');
  lines.push('```');
  lines.push('');

  lines.push('## Authentication');
  lines.push('');
  lines.push('Include the following header in your requests:');
  lines.push('');
  lines.push('```');
  lines.push('Authorization: Bearer <your-api-key>');
  lines.push('```');
  lines.push('');

  lines.push('## Endpoints');
  lines.push('');

  lines.push('### GET /api/resource');
  lines.push('');
  lines.push('Retrieve a list of resources.');
  lines.push('');
  lines.push('**Parameters:**');
  lines.push('- `limit` (optional): Number of items to return');
  lines.push('- `offset` (optional): Number of items to skip');
  lines.push('');
  lines.push('**Response:**');
  lines.push('```json');
  lines.push('{');
  lines.push('  "data": [],');
  lines.push('  "total": 0');
  lines.push('}');
  lines.push('```');
  lines.push('');

  lines.push('## Error Handling');
  lines.push('');
  lines.push('The API uses standard HTTP status codes and returns errors in the following format:');
  lines.push('');
  lines.push('```json');
  lines.push('{');
  lines.push('  "error": {');
  lines.push('    "code": "ERROR_CODE",');
  lines.push('    "message": "Error description"');
  lines.push('  }');
  lines.push('}');
  lines.push('```');

  return lines.join('\n');
}

function generateChangelogMarkdown(title: string, content?: string): string {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push('All notable changes to this project will be documented in this file.');
  lines.push('');
  lines.push('The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),');
  lines.push('and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).');
  lines.push('');

  if (content) {
    lines.push(content);
    lines.push('');
  }

  lines.push('## [Unreleased]');
  lines.push('');
  lines.push('### Added');
  lines.push('- New feature description');
  lines.push('');
  lines.push('### Changed');
  lines.push('- Update description');
  lines.push('');
  lines.push('### Fixed');
  lines.push('- Bug fix description');
  lines.push('');

  lines.push('## [1.0.0] - YYYY-MM-DD');
  lines.push('');
  lines.push('### Added');
  lines.push('- Initial release');
  lines.push('- Basic functionality');
  lines.push('');

  return lines.join('\n');
}

function generateContributingMarkdown(title: string, content?: string): string {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push('We welcome contributions! Please follow these guidelines to help us maintain code quality and consistency.');
  lines.push('');

  if (content) {
    lines.push(content);
    lines.push('');
  }

  lines.push('## Getting Started');
  lines.push('');
  lines.push('1. Fork the repository');
  lines.push('2. Clone your fork: `git clone https://github.com/your-username/repo-name.git`');
  lines.push('3. Create a feature branch: `git checkout -b feature/your-feature-name`');
  lines.push('4. Install dependencies: `npm install`');
  lines.push('');

  lines.push('## Development');
  lines.push('');
  lines.push('### Code Style');
  lines.push('');
  lines.push('- Follow the existing code style');
  lines.push('- Use meaningful variable and function names');
  lines.push('- Add comments for complex logic');
  lines.push('- Keep functions small and focused');
  lines.push('');

  lines.push('### Testing');
  lines.push('');
  lines.push('- Write tests for new features');
  lines.push('- Ensure all tests pass before submitting');
  lines.push('- Run tests with: `npm test`');
  lines.push('');

  lines.push('## Submitting Changes');
  lines.push('');
  lines.push('1. Ensure your code follows the style guidelines');
  lines.push('2. Write or update tests as needed');
  lines.push('3. Update documentation if required');
  lines.push('4. Commit your changes with a clear message');
  lines.push('5. Push to your fork and create a Pull Request');
  lines.push('');
  lines.push('### Commit Message Format');
  lines.push('');
  lines.push('Use conventional commit format:');
  lines.push('- `feat:` for new features');
  lines.push('- `fix:` for bug fixes');
  lines.push('- `docs:` for documentation');
  lines.push('- `refactor:` for code restructuring');
  lines.push('');

  lines.push('## Code Review Process');
  lines.push('');
  lines.push('- All submissions require review');
  lines.push('- Address review feedback promptly');
  lines.push('- Once approved, your changes will be merged');
  lines.push('');

  lines.push('## Questions?');
  lines.push('');
  lines.push('Feel free to open an issue or discussion for questions about contributing.');

  return lines.join('\n');
}

function generateArchitectureMarkdown(title: string, content?: string): string {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push('This document describes the architecture and design decisions for the project.');
  lines.push('');

  if (content) {
    lines.push(content);
    lines.push('');
  }

  lines.push('## Overview');
  lines.push('');
  lines.push('High-level description of the system architecture.');
  lines.push('');

  lines.push('## Components');
  lines.push('');
  lines.push('### Component 1');
  lines.push('- **Purpose:** Description of what this component does');
  lines.push('- **Responsibilities:** List of key responsibilities');
  lines.push('- **Dependencies:** What this component depends on');
  lines.push('');

  lines.push('### Component 2');
  lines.push('- **Purpose:** Description of what this component does');
  lines.push('- **Responsibilities:** List of key responsibilities');
  lines.push('- **Dependencies:** What this component depends on');
  lines.push('');

  lines.push('## Data Flow');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph TD');
  lines.push('    A[Client] --> B[API Gateway]');
  lines.push('    B --> C[Service 1]');
  lines.push('    B --> D[Service 2]');
  lines.push('    C --> E[Database]');
  lines.push('    D --> E[Database]');
  lines.push('```');
  lines.push('');

  lines.push('## Technology Stack');
  lines.push('');
  lines.push('### Frontend');
  lines.push('- React');
  lines.push('- TypeScript');
  lines.push('- CSS Framework');
  lines.push('');

  lines.push('### Backend');
  lines.push('- Node.js');
  lines.push('- Express');
  lines.push('- Database (PostgreSQL/MongoDB)');
  lines.push('');

  lines.push('### Infrastructure');
  lines.push('- Docker');
  lines.push('- Kubernetes');
  lines.push('- CI/CD Pipeline');
  lines.push('');

  lines.push('## Deployment');
  lines.push('');
  lines.push('### Environment Setup');
  lines.push('1. Prerequisites');
  lines.push('2. Configuration');
  lines.push('3. Build process');
  lines.push('');

  lines.push('### Deployment Steps');
  lines.push('1. Build the application');
  lines.push('2. Run tests');
  lines.push('3. Deploy to staging');
  lines.push('4. Deploy to production');
  lines.push('');

  lines.push('## Security Considerations');
  lines.push('');
  lines.push('- Authentication and authorization');
  lines.push('- Data encryption');
  lines.push('- Secure communication');
  lines.push('- Input validation');
  lines.push('');

  return lines.join('\n');
}

function generateCustomMarkdown(title: string, content?: string, sections: string[] = []): string {
  const lines = [];

  lines.push(`# ${title}`);
  lines.push('');

  if (content) {
    lines.push(content);
    lines.push('');
  }

  // Generate sections
  if (sections.length > 0) {
    sections.forEach(section => {
      lines.push(`## ${section}`);
      lines.push('');
      lines.push(`Content for ${section.toLowerCase()} section.`);
      lines.push('');
    });
  } else {
    lines.push('## Introduction');
    lines.push('');
    lines.push('Custom markdown document content.');
    lines.push('');
  }

  return lines.join('\n');
}

export const generateMarkdownTool = tool({
  description: "Generates markdown files for documentation, READMEs, API docs, and more",
  inputSchema: generateMarkdownSchema,
  execute: generateMarkdownFile,
});