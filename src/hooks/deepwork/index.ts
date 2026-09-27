import { createInternalAgentTextPart } from '../../utils';
import { registerCommandHook } from '../command-hook-utils';

const COMMAND_NAME = 'deepwork';

function activationPrompt(task: string, sessionID: string): string {
  return [
    'Use the deepwork skill for this task. Treat it as a heavy coding session.',
    '',
    `Your deepwork state file is \`.slim/deepwork/${sessionID}.md\` — create/update only this file; the skill covers setup, planning, gates, and state rules.`,
    '',
    'Task:',
    task,
  ].join('\n');
}

export function createDeepworkCommandHook(): {
  registerCommand: (config: Record<string, unknown>) => void;
  handleCommandExecuteBefore: (
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ) => Promise<void>;
} {
  return {
    registerCommand: (opencodeConfig) => {
      registerCommandHook(
        opencodeConfig,
        COMMAND_NAME,
        'Start a deepwork session for a complex coding task',
        'Use the deepwork workflow for heavy multi-phase coding work',
      );
    },

    handleCommandExecuteBefore: async (input, output) => {
      if (input.command !== COMMAND_NAME) return;

      output.parts.length = 0;
      const task = input.arguments.trim();
      if (!task) {
        output.parts.push(
          createInternalAgentTextPart(
            'What task should deepwork manage? Run `/deepwork <task>`.',
          ),
        );
        return;
      }

      output.parts.push({
        type: 'text',
        text: activationPrompt(task, input.sessionID),
      });
    },
  };
}
