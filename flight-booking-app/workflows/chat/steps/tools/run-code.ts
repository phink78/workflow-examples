import { z } from 'zod';
import { Sandbox } from '@vercel/sandbox';
import { emitSandboxEvent, formatErrorMessage } from '../writer';

const inputSchema = z.object({
  files: z
    .array(
      z.object({
        path: z.string().describe('File path relative to the working directory'),
        content: z.string().describe('File content to write'),
      })
    )
    .optional()
    .describe('Files to write before running the command'),
  command: z
    .string()
    .describe(
      'Shell command to execute (e.g., "node script.js", "npm install lodash && node index.js")'
    ),
});

async function execute({
  files,
  command,
}: {
  files?: { path: string; content: string }[];
  command: string;
}) {
  'use step';

  await emitSandboxEvent('creating');

  let sandbox: InstanceType<typeof Sandbox>;
  try {
    sandbox = await Sandbox.create({ runtime: 'node24', timeout: 5 * 60 * 1000 });
  } catch (err) {
    const msg = formatErrorMessage(err);
    await emitSandboxEvent('error', { message: msg });
    return { error: true, phase: 'create', message: msg };
  }

  const sandboxId = sandbox.sandboxId;
  await emitSandboxEvent('ready', { sandboxId });

  if (files && files.length > 0) {
    try {
      await sandbox.writeFiles(files);
    } catch (err) {
      const msg = formatErrorMessage(err);
      await emitSandboxEvent('error', { sandboxId, message: msg });
      return { error: true, phase: 'write-files', message: msg };
    }
    await emitSandboxEvent('files-written', {
      sandboxId,
      filePaths: files.map((f) => f.path),
    });
  }

  // Create streams that pipe sandbox output as sandbox-events
  let stdoutBuf = '';
  let stderrBuf = '';

  const stdoutStream = new WritableStream<string>({
    async write(chunk) {
      stdoutBuf += chunk;
      await emitSandboxEvent('stdout', { data: chunk, sandboxId });
    },
  });
  const stderrStream = new WritableStream<string>({
    async write(chunk) {
      stderrBuf += chunk;
      await emitSandboxEvent('stderr', { data: chunk, sandboxId });
    },
  });

  try {
    const result = await sandbox.runCommand({
      cmd: 'sh',
      args: ['-c', command],
      stdout: stdoutStream,
      stderr: stderrStream,
    });

    await emitSandboxEvent('done', { sandboxId, exitCode: result.exitCode });

    return {
      exitCode: result.exitCode,
      stdout: stdoutBuf || '(no output)',
      stderr: stderrBuf || '',
    };
  } catch (err) {
    const msg = formatErrorMessage(err);
    await emitSandboxEvent('error', { sandboxId, message: msg });
    return { error: true, phase: 'run-command', message: msg };
  }
}

export const runCodeTool = {
  description:
    'Execute code or shell commands in an isolated cloud sandbox (Linux VM with Node.js). ' +
    'The sandbox persists between calls — installed packages, files, and environment carry over. ' +
    'Write files and run commands to accomplish any coding task.',
  inputSchema,
  execute,
};
