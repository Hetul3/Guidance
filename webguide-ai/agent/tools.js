export const TOOL_DEFINITIONS = {
  search: {
    name: 'search',
    description: 'Search the web for official or recent instructions/context',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 3, maxLength: 400 },
        time_range: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year', 'none'],
          default: 'year'
        },
        max_results: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
          default: 1
        },
        chunks_per_source: {
          type: 'integer',
          minimum: 1,
          maximum: 3,
          default: 3
        }
      },
      required: ['query']
    }
  },
  get_dom_snapshot: {
    name: 'get_dom_snapshot',
    description: 'Return the current filtered LLM snapshot of clickable elements (≤50)',
    schema: {
      type: 'object',
      properties: {}
    }
  },
  highlight: {
    name: 'highlight',
    description: 'Highlight an element by ID with a short message',
    schema: {
      type: 'object',
      properties: {
        targetId: { type: 'string', minLength: 2 },
        message: { type: 'string', maxLength: 120 }
      },
      required: ['targetId']
    }
  },
  pulse: {
    name: 'pulse',
    description: 'Pulse a visual indicator at the target element by ID',
    schema: {
      type: 'object',
      properties: {
        targetId: { type: 'string', minLength: 2 }
      },
      required: ['targetId']
    }
  },
  scroll: {
    name: 'scroll',
    description: 'Scroll the page up/down to bring an element into view or move the viewport',
    schema: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['up', 'down', 'toElement']
        },
        targetId: { type: 'string', minLength: 2 }
      },
      required: ['direction']
    }
  }
};

export const TOOL_NAMES = Object.keys(TOOL_DEFINITIONS);

export function getFunctionDeclarations() {
  return Object.values(TOOL_DEFINITIONS).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.schema
  }));
}

export function getToolSchema(name) {
  return TOOL_DEFINITIONS[name]?.schema || null;
}

export function isVisualTool(name) {
  return name === 'highlight' || name === 'pulse' || name === 'scroll';
}
