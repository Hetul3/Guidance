const ALLOWED_ACTIONS = new Set([
  'search',
  'ground',
  'highlight',
  'pulse',
  'scroll',
  'wait',
  'ask_user',
  'noop',
  'get_dom_snapshot',
  'type'
]);

const SCROLL_DIRECTIONS = new Set(['up', 'down', 'toElement']);

export function validateActionPlan(payload) {
  const errors = [];

  if (!payload || typeof payload !== 'object') {
    return { valid: false, errors: ['Planner response must be an object.'] };
  }

  const { steps } = payload;
  if (!Array.isArray(steps)) {
    return { valid: false, errors: ['Planner response must include a steps array.'] };
  }

  if (steps.length === 0) {
    return { valid: false, errors: ['Planner response must include at least one step.'] };
  }

  if (steps.length > 3) {
    errors.push('Planner returned more than 3 immediate steps; trimming to 3.');
  }

  const sanitized = [];

  steps.slice(0, 3).forEach((step, index) => {
    if (!step || typeof step !== 'object') {
      errors.push(`Step ${index + 1} is not an object.`);
      return;
    }

    if (!ALLOWED_ACTIONS.has(step.action)) {
      errors.push(`Step ${index + 1} has unknown action: ${step.action}`);
      return;
    }

    const safeStep = { action: step.action };

    if (typeof step.targetId === 'string') {
      safeStep.targetId = step.targetId.trim();
    }

    if (typeof step.message === 'string') {
      safeStep.message = step.message.trim().slice(0, 120);
    }

    if (typeof step.direction === 'string' && SCROLL_DIRECTIONS.has(step.direction)) {
      safeStep.direction = step.direction;
    }

    if (typeof step.text === 'string') {
      safeStep.text = step.text.trim().slice(0, 200);
    }

    if (typeof step.reason === 'string') {
      safeStep.reason = step.reason.trim().slice(0, 300);
    }

    sanitized.push(safeStep);
  });

  if (!sanitized.length) {
    errors.push('No valid steps found.');
    return { valid: false, errors };
  }

  return { valid: errors.length === 0, value: { steps: sanitized }, errors };
}

export function validateExecutorOutput(payload) {
  return validateActionPlan(payload);
}

export function validateToolArgs(name, args, schema) {
  const errors = [];

  if (!schema) {
    return { valid: false, errors: [`No schema registered for tool ${name}`] };
  }

  if ((schema.required || []).some((prop) => args[prop] === undefined)) {
    errors.push(`Tool ${name} missing required parameters: ${schema.required.join(', ')}`);
  }

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([prop, constraint]) => {
      const value = args[prop];
      if (value === undefined) {
        return;
      }

      if (constraint.type === 'string') {
        if (typeof value !== 'string') {
          errors.push(`Parameter ${prop} must be a string.`);
          return;
        }
        if (constraint.minLength && value.length < constraint.minLength) {
          errors.push(`Parameter ${prop} must be at least ${constraint.minLength} characters.`);
        }
        if (constraint.maxLength && value.length > constraint.maxLength) {
          errors.push(`Parameter ${prop} must be <= ${constraint.maxLength} characters.`);
        }
        if (constraint.enum && !constraint.enum.includes(value)) {
          errors.push(`Parameter ${prop} must be one of: ${constraint.enum.join(', ')}.`);
        }
      }

      if (constraint.type === 'integer') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          errors.push(`Parameter ${prop} must be an integer.`);
          return;
        }
        if (constraint.minimum !== undefined && value < constraint.minimum) {
          errors.push(`Parameter ${prop} must be >= ${constraint.minimum}.`);
        }
        if (constraint.maximum !== undefined && value > constraint.maximum) {
          errors.push(`Parameter ${prop} must be <= ${constraint.maximum}.`);
        }
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
