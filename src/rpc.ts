import { Rpc } from "@opencode/plugin/rpc"

// This is a transport, not another task store. Desktop retains the global board.
export const BoardBridge = Rpc.define({
  id: "opencode-board.bridge",
  events: {},
  methods: {
    poll: {
      input: { type: "object", properties: { clientID: { type: "string", minLength: 1 }, toolsEnabled: { type: "boolean" } }, required: ["clientID"], additionalProperties: false },
      output: {
        anyOf: [{ type: "null" }, { type: "object", properties: { cancel: { type: "string" } }, required: ["cancel"], additionalProperties: false }, {
          type: "object",
          properties: {
            id: { type: "string" },
            request: {
              type: "object",
              properties: { operation: { type: "string" }, input: { type: "object" }, sessionID: { type: "string" }, directory: { type: "string" }, model: { type: "object", properties: { id: { type: "string", minLength: 1 }, providerID: { type: "string", minLength: 1 }, variant: { type: "string" } }, required: ["id", "providerID"], additionalProperties: false } },
              required: ["operation", "input", "sessionID"],
              additionalProperties: false,
            },
          },
          required: ["id", "request"],
          additionalProperties: false,
        }],
      },
    },
    complete: { input: { type: "object", properties: { clientID: { type: "string" }, id: { type: "string" }, result: {}, error: { type: "string" } }, required: ["clientID", "id"], additionalProperties: false }, output: { type: "null" } },
  },
})
